import { useEffect, useRef, useState, type ReactNode } from 'react';
import { LayoutChangeEvent, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  Canvas,
  Circle,
  Group,
  Path,
  Rect,
  RoundedRect,
  Text as SkiaText,
  matchFont,
} from '@shopify/react-native-skia';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  interpolate,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  withSequence,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import {
  type BoardState,
  canCommitItemToDestination,
  type DestinationBin,
  type Item,
  type ItemId,
  type SourceBin,
  type StagingSlot,
} from '../engine';
import {
  useDestinationBins,
  useGameStatus,
  useGameStore,
  useMoveInfo,
  useSourceBins,
  useStagingSlots,
} from '../state';
import {
  deriveCommitFeedback,
  derivePullFeedback,
  FEEDBACK_TIMINGS,
} from './board-feedback';
import {
  findFrameIndexAtPoint,
  getBoardLayout,
  getCategoryColor,
  getDestinationBinLockItem,
  getItemCirclePositions,
  getTopLayer,
  getVariantGlyphSpec,
  type GlyphPrimitive,
  type Frame,
} from './board-helpers';

type FlashState = {
  readonly sourceBinId: string | null;
  readonly stagingIndex: number | null;
  readonly destinationBinId: string | null;
};

type DragHoverState = {
  readonly destinationBinId: string | null;
  readonly isValid: boolean | null;
};

type DragState = {
  readonly item: Item;
  readonly stagingIndex: number;
  readonly originFrame: Frame;
};

type DragPreviewState = {
  readonly centerX: number;
  readonly centerY: number;
  readonly scale: number;
  readonly opacity: number;
};

type PulseState = {
  readonly index: number;
  readonly token: number;
  readonly variant: 'pull' | 'commit' | 'complete' | 'reject';
};

type DestinationPulseState = {
  readonly destinationBinId: string;
  readonly token: number;
  readonly variant: 'commit' | 'complete' | 'reject';
};

type TransferState = {
  readonly token: number;
  readonly item: Item;
  readonly fromFrame: Frame;
  readonly toFrame: Frame;
  readonly hideStagingIndex: number | null;
};

type ClearReleaseState = {
  readonly destinationBinId: string;
  readonly token: number;
  readonly items: ReadonlyArray<Item>;
};

type DestinationHighlightState =
  | 'none'
  | 'valid'
  | 'invalid'
  | 'flash'
  | 'commit'
  | 'complete'
  | 'reject';

const BACKGROUND_COLOR = '#F5F1E8';
const PANEL_STROKE = '#6F675C';
const SURFACE_FILL = '#F8F4EC';
const SURFACE_STROKE = '#D3C6B5';
const ZONE_FILL = '#F2EBDF';
const SOURCE_FILL = '#EFE7DA';
const DESTINATION_FILL = '#F7F2E8';
const EMPTY_SLOT_COLOR = '#FCFAF6';
const LABEL_COLOR = '#2F2A24';
const MUTED_LABEL_COLOR = '#655E55';
const FLASH_COLOR = '#E05151';
const VALID_HIGHLIGHT_FILL = '#E9F1E7';
const VALID_HIGHLIGHT_STROKE = '#5A8661';
const INVALID_HIGHLIGHT_FILL = '#F8D9D6';
const LOCKED_FILL = '#F2ECE2';
const SECTION_FONT = matchFont({
  fontFamily: 'Arial',
  fontSize: 13,
  fontStyle: 'normal',
  fontWeight: 'bold',
});
const BODY_FONT = matchFont({
  fontFamily: 'Arial',
  fontSize: 14,
  fontStyle: 'normal',
  fontWeight: 'normal',
});
const WARNING_COLOR = '#C78A11';
const DANGER_COLOR = '#B5412C';
const DRAG_SCALE = 1.08;
const DRAG_REJECT_SCALE = 0.94;
const SLOT_CONFIRM_FILL = 'rgba(63, 95, 74, 0.12)';
const SLOT_COMPLETE_FILL = 'rgba(63, 95, 74, 0.18)';
const REJECT_FILL = 'rgba(224, 81, 81, 0.12)';
const COMMIT_HIGHLIGHT_FILL = '#E2EDDE';
const COMPLETE_HIGHLIGHT_FILL = '#DCE8D5';
const COMPLETE_HIGHLIGHT_STROKE = '#3F5F4A';
const TOKEN_GLYPH_COLOR = '#FFF7E6';

const withAlpha = (hexColor: string, alpha: string) =>
  hexColor.startsWith('#') && hexColor.length === 7 ? `${hexColor}${alpha}` : hexColor;

const getFrameCenter = (frame: Frame) => ({
  x: frame.x + frame.width / 2,
  y: frame.y + frame.height * 0.62,
});

const getStagingItemRadius = (frame: Frame) => Math.min(26, frame.width / 4.2, frame.height / 4.6);

type OverlayAction = {
  readonly label: string;
  readonly onPress: () => void;
  readonly variant?: 'primary' | 'secondary';
};

const frameStyle = (frame: Frame) => ({
  position: 'absolute' as const,
  left: frame.x,
  top: frame.y,
  width: frame.width,
  height: frame.height,
});

const renderGlyphPrimitive = (
  primitive: GlyphPrimitive,
  color: string,
  key: string,
) => {
  switch (primitive.type) {
    case 'circle':
      return (
        <Circle
          key={key}
          cx={primitive.cx}
          cy={primitive.cy}
          r={primitive.r}
          color={color}
          style={primitive.style}
          strokeWidth={primitive.strokeWidth}
        />
      );
    case 'rect':
      return (
        <Rect
          key={key}
          x={primitive.x}
          y={primitive.y}
          width={primitive.width}
          height={primitive.height}
          color={color}
          style={primitive.style}
          strokeWidth={primitive.strokeWidth}
        />
      );
    case 'roundedRect':
      return (
        <RoundedRect
          key={key}
          x={primitive.x}
          y={primitive.y}
          width={primitive.width}
          height={primitive.height}
          r={primitive.r}
          color={color}
          style={primitive.style}
          strokeWidth={primitive.strokeWidth}
        />
      );
    case 'path':
      return (
        <Path
          key={key}
          path={primitive.path}
          color={color}
          style={primitive.style}
          strokeWidth={primitive.strokeWidth}
          strokeCap="round"
          strokeJoin="round"
        />
      );
  }
};

const renderItemGlyph = (
  item: Item,
  centerX: number,
  centerY: number,
  size: number,
  color: string,
  keyPrefix: string,
) =>
  getVariantGlyphSpec(item, {
    centerX,
    centerY,
    size,
  }).map((primitive, index) =>
    renderGlyphPrimitive(primitive, color, `${keyPrefix}-${String(index)}`),
  );

const renderToken = (
  item: Item,
  centerX: number,
  centerY: number,
  radius: number,
  keyPrefix: string,
  glyphColor = TOKEN_GLYPH_COLOR,
) => (
  <Group key={keyPrefix}>
    <Circle
      cx={centerX}
      cy={centerY}
      r={radius}
      color={getCategoryColor(item.category)}
    />
    {renderItemGlyph(item, centerX, centerY, radius * 1.4, glyphColor, `${keyPrefix}-glyph`)}
  </Group>
);

const TokenGlyph = ({
  item,
  size,
  color = TOKEN_GLYPH_COLOR,
}: {
  readonly item: Item;
  readonly size: number;
  readonly color?: string;
}) => (
  <Canvas style={StyleSheet.absoluteFill}>
    {renderItemGlyph(item, size / 2, size / 2, size * 0.74, color, 'token')}
  </Canvas>
);

const renderSourceBin = (
  bin: SourceBin,
  frame: Frame,
  isFlashing: boolean,
) => {
  const topLayer = getTopLayer(bin);
  const topItem = topLayer[0] ?? null;
  const accentColor = topItem ? getCategoryColor(topItem.category) : PANEL_STROKE;
  const fillColor = isFlashing ? INVALID_HIGHLIGHT_FILL : SOURCE_FILL;
  const strokeColor = isFlashing ? FLASH_COLOR : withAlpha(accentColor, '88');
  const itemFrame = {
    x: frame.x + 12,
    y: frame.y + 48,
    width: frame.width - 24,
    height: frame.height - 60,
  };
  const itemPositions = getItemCirclePositions(itemFrame, topLayer.length);

  return (
    <Group key={bin.id}>
      <RoundedRect
        x={frame.x}
        y={frame.y}
        width={frame.width}
        height={frame.height}
        r={18}
        color={fillColor}
      />
      <RoundedRect
        x={frame.x}
        y={frame.y}
        width={frame.width}
        height={frame.height}
        r={18}
        color={strokeColor}
        style="stroke"
        strokeWidth={3}
      />
      <RoundedRect
        x={frame.x + 12}
        y={frame.y + 12}
        width={Math.min(frame.width - 24, 72)}
        height={8}
        r={4}
        color={withAlpha(accentColor, '55')}
      />
      <RoundedRect
        x={itemFrame.x}
        y={itemFrame.y}
        width={itemFrame.width}
        height={itemFrame.height}
        r={14}
        color={EMPTY_SLOT_COLOR}
      />
      <SkiaText
        x={frame.x + 14}
        y={frame.y + 28}
        text={bin.id.toUpperCase()}
        font={SECTION_FONT}
        color={LABEL_COLOR}
      />
      <SkiaText
        x={frame.x + 14}
        y={frame.y + 46}
        text={'Top ' + String(topLayer.length)}
        font={BODY_FONT}
        color={MUTED_LABEL_COLOR}
      />
      {topLayer.map((item, index) => {
        const position = itemPositions[index];
        if (!position) {
          return null;
        }

        return (
          renderToken(item, position.x, position.y, position.radius, item.id)
        );
      })}
    </Group>
  );
};

const renderStagingSlot = (
  slot: StagingSlot,
  frame: Frame,
  isSelected: boolean,
  isFlashing: boolean,
  hideItem: boolean,
) => {
  const borderColor = isFlashing
    ? FLASH_COLOR
    : isSelected
      ? '#2F4938'
      : '#8D8477';
  const borderWidth = isSelected ? 4 : 2.5;
  const item = hideItem ? null : slot.item;

  return (
    <Group key={'staging-' + String(slot.index)}>
      <RoundedRect
        x={frame.x}
        y={frame.y}
        width={frame.width}
        height={frame.height}
        r={18}
        color={EMPTY_SLOT_COLOR}
      />
      <RoundedRect
        x={frame.x + 10}
        y={frame.y + 10}
        width={frame.width - 20}
        height={frame.height - 20}
        r={15}
        color={withAlpha('#D8CFBF', '28')}
      />
      <RoundedRect
        x={frame.x}
        y={frame.y}
        width={frame.width}
        height={frame.height}
        r={18}
        color={borderColor}
        style="stroke"
        strokeWidth={borderWidth}
      />
      <SkiaText
        x={frame.x + 12}
        y={frame.y + 22}
        text={'SLOT ' + String(slot.index + 1)}
        font={BODY_FONT}
        color={MUTED_LABEL_COLOR}
      />
      {item ? (
        renderToken(
          item,
          frame.x + frame.width / 2,
          frame.y + frame.height * 0.64,
          getStagingItemRadius(frame),
          `staging-item-${String(slot.index)}`,
        )
      ) : null}
    </Group>
  );
};

const renderDestinationBin = (
  bin: DestinationBin,
  frame: Frame,
  highlightState: DestinationHighlightState,
) => {
  const lockItem = getDestinationBinLockItem(bin);
  const isLocked = lockItem !== null;
  const accentColor = getCategoryColor(bin.accepts);
  const lockedStrokeColor = lockItem ? accentColor : accentColor;
  const fillColor =
    highlightState === 'flash'
      ? FLASH_COLOR
      : highlightState === 'complete'
        ? COMPLETE_HIGHLIGHT_FILL
        : highlightState === 'commit'
          ? COMMIT_HIGHLIGHT_FILL
          : highlightState === 'reject'
            ? INVALID_HIGHLIGHT_FILL
            : highlightState === 'valid'
              ? VALID_HIGHLIGHT_FILL
              : highlightState === 'invalid'
                ? INVALID_HIGHLIGHT_FILL
                : isLocked
                  ? LOCKED_FILL
                  : DESTINATION_FILL;
  const strokeColor =
    highlightState === 'complete'
      ? COMPLETE_HIGHLIGHT_STROKE
      : highlightState === 'commit' || highlightState === 'valid'
        ? VALID_HIGHLIGHT_STROKE
        : highlightState === 'reject' ||
            highlightState === 'invalid' ||
            highlightState === 'flash'
          ? FLASH_COLOR
          : lockedStrokeColor;
  const strokeWidth = highlightState === 'none' ? 4 : 5;
  const itemFrame = {
    x: frame.x + 12,
    y: frame.y + 64,
    width: frame.width - 24,
    height: frame.height - 76,
  };
  const itemPositions = getItemCirclePositions(itemFrame, isLocked ? 3 : bin.contents.length);

  return (
    <Group key={bin.id}>
      <RoundedRect
        x={frame.x}
        y={frame.y}
        width={frame.width}
        height={frame.height}
        r={18}
        color={fillColor}
      />
      <RoundedRect
        x={frame.x + 8}
        y={frame.y + 10}
        width={frame.width - 16}
        height={16}
        r={8}
        color={withAlpha(accentColor, '2D')}
      />
      <RoundedRect
        x={frame.x}
        y={frame.y}
        width={frame.width}
        height={frame.height}
        r={18}
        color={strokeColor}
        style="stroke"
        strokeWidth={strokeWidth}
      />
      <RoundedRect
        x={itemFrame.x}
        y={itemFrame.y}
        width={itemFrame.width}
        height={itemFrame.height}
        r={14}
        color={withAlpha(accentColor, isLocked ? '16' : '10')}
      />
      <RoundedRect
        x={frame.x + frame.width - 62}
        y={frame.y + 14}
        width={48}
        height={24}
        r={12}
        color={accentColor}
      />
      <SkiaText
        x={frame.x + 14}
        y={frame.y + 30}
        text={bin.accepts.toUpperCase()}
        font={SECTION_FONT}
        color={LABEL_COLOR}
      />
      <SkiaText
        x={frame.x + frame.width - 48}
        y={frame.y + 31}
        text={String(bin.contents.length) + '/3'}
        font={BODY_FONT}
        color="#FFFFFF"
      />
      <SkiaText
        x={frame.x + 14}
        y={frame.y + 50}
        text={isLocked ? 'LOCKED' : 'OPEN'}
        font={BODY_FONT}
        color={MUTED_LABEL_COLOR}
      />
      <SkiaText
        x={frame.x + 68}
        y={frame.y + 50}
        text={'Cleared ' + String(bin.completedGroups)}
        font={BODY_FONT}
        color={MUTED_LABEL_COLOR}
      />
      {bin.contents.map((item, index) => {
        const position = itemPositions[index];
        if (!position) {
          return null;
        }

        return (
          renderToken(item, position.x, position.y, position.radius, item.id)
        );
      })}
      {lockItem
        ? itemPositions.slice(bin.contents.length).map((position, index) => (
            <Group key={bin.id + '-ghost-' + String(index)}>
              <Circle
                cx={position.x}
                cy={position.y}
                r={position.radius}
                color={getCategoryColor(lockItem.category)}
              />
              <Circle
                cx={position.x}
                cy={position.y}
                r={position.radius - 4}
                color={LOCKED_FILL}
              />
              {renderItemGlyph(
                lockItem,
                position.x,
                position.y,
                position.radius * 1.12,
                accentColor,
                `${bin.id}-ghost-${String(index)}-glyph`,
              )}
            </Group>
          ))
        : null}
    </Group>
  );
};

const getMoveCounterColor = (used: number, budget: number | null) => {
  if (budget === null) {
    return LABEL_COLOR;
  }

  if (used >= budget) {
    return DANGER_COLOR;
  }

  if (budget - used <= 5) {
    return WARNING_COLOR;
  }

  return LABEL_COLOR;
};

const StatusOverlay = ({
  title,
  actions,
}: {
  readonly title: string;
  readonly actions: ReadonlyArray<OverlayAction>;
}) => (
  <View style={styles.overlay}>
    <View style={styles.overlayCard}>
      <Text style={styles.overlayTitle}>{title}</Text>
      <View style={styles.overlayActions}>
        {actions.map((action) => (
          <Pressable
            key={action.label}
            accessibilityLabel={action.label}
            onPress={action.onPress}
            style={({ pressed }) => [
              styles.overlayButton,
              action.variant === 'secondary'
                ? styles.overlayButtonSecondary
                : styles.overlayButtonPrimary,
              pressed ? styles.overlayButtonPressed : null,
            ]}
          >
            <Text
              style={[
                styles.overlayButtonText,
                action.variant === 'secondary'
                  ? styles.overlayButtonTextSecondary
                  : null,
              ]}
            >
              {action.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  </View>
);

const getDestinationHighlightState = (
  destinationBinId: string,
  flashState: FlashState,
  dragHoverState: DragHoverState,
  pulseState: DestinationPulseState | null,
): DestinationHighlightState => {
  if (pulseState?.destinationBinId === destinationBinId) {
    return pulseState.variant;
  }

  if (flashState.destinationBinId === destinationBinId) {
    return 'flash';
  }

  if (dragHoverState.destinationBinId !== destinationBinId) {
    return 'none';
  }

  return dragHoverState.isValid ? 'valid' : 'invalid';
};

const DraggedItem = ({
  item,
  diameter,
  preview,
  isRejecting,
}: {
  readonly item: Item;
  readonly diameter: number;
  readonly preview: DragPreviewState;
  readonly isRejecting: boolean;
}) => (
  <View
    pointerEvents="none"
    style={[
      styles.draggedItem,
      {
        left: preview.centerX - diameter / 2,
        top: preview.centerY - diameter / 2,
        width: diameter,
        height: diameter,
        borderRadius: diameter / 2,
        backgroundColor: getCategoryColor(item.category),
        borderColor: isRejecting ? FLASH_COLOR : '#FFFFFF',
        opacity: preview.opacity,
        transform: [{ scale: preview.scale }],
      },
    ]}
  >
    <TokenGlyph item={item} size={diameter} />
  </View>
);

const FeedbackPulseOverlay = ({
  frame,
  token,
  variant,
}: {
  readonly frame: Frame;
  readonly token: number;
  readonly variant: PulseState['variant'];
}) => {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = 0;
    progress.value = withTiming(1, {
      duration:
        variant === 'complete'
          ? FEEDBACK_TIMINGS.clearReleaseMs
          : variant === 'reject'
            ? FEEDBACK_TIMINGS.invalidRejectMs
            : FEEDBACK_TIMINGS.pullConfirmMs,
      easing: Easing.out(Easing.cubic),
    });
  }, [progress, token, variant]);

  const animatedStyle = useAnimatedStyle(() => {
    const scale =
      variant === 'complete'
        ? interpolate(progress.value, [0, 0.35, 1], [0.9, 1.06, 1])
        : variant === 'reject'
          ? interpolate(progress.value, [0, 0.5, 1], [1, 1.02, 1])
          : interpolate(progress.value, [0, 0.5, 1], [0.96, 1.04, 1]);
    const opacity =
      variant === 'complete'
        ? interpolate(progress.value, [0, 0.15, 1], [0, 0.95, 0])
        : interpolate(progress.value, [0, 0.2, 1], [0, 0.85, 0]);

    return {
      opacity,
      transform: [{ scale }],
    };
  });

  const borderColor =
    variant === 'reject'
      ? FLASH_COLOR
      : variant === 'complete'
        ? COMPLETE_HIGHLIGHT_STROKE
        : VALID_HIGHLIGHT_STROKE;
  const backgroundColor =
    variant === 'reject'
      ? REJECT_FILL
      : variant === 'complete'
        ? SLOT_COMPLETE_FILL
        : SLOT_CONFIRM_FILL;

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.feedbackOverlay,
        frameStyle(frame),
        {
          borderColor,
          backgroundColor,
        },
        animatedStyle,
      ]}
    />
  );
};

const DestinationPulseOverlay = ({
  frame,
  token,
  variant,
}: {
  readonly frame: Frame;
  readonly token: number;
  readonly variant: DestinationPulseState['variant'];
}) => {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = 0;
    progress.value = withTiming(1, {
      duration:
        variant === 'complete'
          ? FEEDBACK_TIMINGS.clearReleaseMs
          : variant === 'reject'
            ? FEEDBACK_TIMINGS.invalidRejectMs
            : FEEDBACK_TIMINGS.commitConfirmMs,
      easing: Easing.out(Easing.cubic),
    });
  }, [progress, token, variant]);

  const animatedStyle = useAnimatedStyle(() => {
    const scale =
      variant === 'complete'
        ? interpolate(progress.value, [0, 0.22, 0.55, 1], [0.94, 1.03, 1.02, 1])
        : variant === 'reject'
          ? interpolate(progress.value, [0, 0.5, 1], [1, 1.015, 1])
          : interpolate(progress.value, [0, 0.2, 0.6, 1], [0.96, 1.04, 1.02, 1]);
    const opacity =
      variant === 'complete'
        ? interpolate(progress.value, [0, 0.12, 1], [0, 0.95, 0])
        : interpolate(progress.value, [0, 0.1, 1], [0, 0.88, 0]);

    return {
      opacity,
      transform: [{ scale }],
    };
  });

  const borderColor =
    variant === 'reject'
      ? FLASH_COLOR
      : variant === 'complete'
        ? COMPLETE_HIGHLIGHT_STROKE
        : VALID_HIGHLIGHT_STROKE;
  const backgroundColor =
    variant === 'reject'
      ? REJECT_FILL
      : variant === 'complete'
        ? 'rgba(63, 95, 74, 0.16)'
        : 'rgba(90, 134, 97, 0.14)';

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.feedbackOverlay,
        frameStyle(frame),
        {
          borderColor,
          backgroundColor,
        },
        animatedStyle,
      ]}
    />
  );
};

const TransferOverlay = ({
  transfer,
  onComplete,
}: {
  readonly transfer: TransferState;
  readonly onComplete: (token: number) => void;
}) => {
  const progress = useSharedValue(0);
  const fromCenter = getFrameCenter(transfer.fromFrame);
  const toCenter = getFrameCenter(transfer.toFrame);
  const diameter = Math.min(
    getStagingItemRadius(transfer.fromFrame),
    getStagingItemRadius(transfer.toFrame),
  ) * 2;

  useEffect(() => {
    progress.value = 0;
    progress.value = withTiming(
      1,
      {
        duration: FEEDBACK_TIMINGS.pullTravelMs,
        easing: Easing.out(Easing.cubic),
      },
      () => {
        scheduleOnRN(onComplete, transfer.token);
      },
    );
  }, [onComplete, progress, transfer.token]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.88, 1], [0.98, 0.98, 0]),
    transform: [
      {
        translateX: interpolate(progress.value, [0, 1], [fromCenter.x, toCenter.x]) -
          diameter / 2,
      },
      {
        translateY: interpolate(progress.value, [0, 1], [fromCenter.y, toCenter.y]) -
          diameter / 2,
      },
      {
        scale: interpolate(progress.value, [0, 0.7, 1], [0.94, 1.08, 0.98]),
      },
    ],
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.draggedItem,
        {
          width: diameter,
          height: diameter,
          borderRadius: diameter / 2,
          backgroundColor: getCategoryColor(transfer.item.category),
        },
        animatedStyle,
      ]}
    >
      <TokenGlyph item={transfer.item} size={diameter} />
    </Animated.View>
  );
};

const ClearReleaseOverlay = ({
  frame,
  items,
  token,
}: {
  readonly frame: Frame;
  readonly items: ReadonlyArray<Item>;
  readonly token: number;
}) => {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = 0;
    progress.value = withSequence(
      withTiming(0.28, {
        duration: FEEDBACK_TIMINGS.completionHoldMs,
        easing: Easing.out(Easing.quad),
      }),
      withTiming(1, {
        duration: FEEDBACK_TIMINGS.clearReleaseMs,
        easing: Easing.out(Easing.cubic),
      }),
    );
  }, [progress, token]);

  const positions = getItemCirclePositions(frame, items.length);

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {items.map((item, index) => {
        const position = positions[index];
        if (!position) {
          return null;
        }

        return (
          <ClearReleaseItem
            key={item.id}
            item={item}
            index={index}
            itemCount={items.length}
            position={position}
            progress={progress}
          />
        );
      })}
    </View>
  );
};

const ClearReleaseItem = ({
  item,
  index,
  itemCount,
  position,
  progress,
}: {
  readonly item: Item;
  readonly index: number;
  readonly itemCount: number;
  readonly position: { readonly x: number; readonly y: number; readonly radius: number };
  readonly progress: SharedValue<number>;
}) => {
  const animatedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.28, 1], [1, 1, 0]),
    transform: [
      {
        translateX:
          position.x -
          position.radius +
          interpolate(
            progress.value,
            [0, 0.28, 1],
            [0, 0, (index - (itemCount - 1) / 2) * position.radius * 1.45],
          ),
      },
      {
        translateY:
          position.y -
          position.radius +
          interpolate(
            progress.value,
            [0, 0.28, 1],
            [0, 0, -position.radius * (1.1 + index * 0.12)],
          ),
      },
      {
        scale: interpolate(progress.value, [0, 0.28, 1], [1, 1.06, 0.76]),
      },
    ],
  }));

  return (
    <Animated.View
      style={[
        styles.clearItem,
        {
          width: position.radius * 2,
          height: position.radius * 2,
          borderRadius: position.radius,
          backgroundColor: getCategoryColor(item.category),
        },
        animatedStyle,
      ]}
    >
      <TokenGlyph item={item} size={position.radius * 2} />
    </Animated.View>
  );
};

export function Board({
  headerAccessory,
  onNextLevel,
  onRetryLevel,
}: {
  readonly headerAccessory?: ReactNode;
  readonly onNextLevel?: () => void;
  readonly onRetryLevel?: () => void;
}) {
  const sourceBins = useSourceBins();
  const stagingSlots = useStagingSlots();
  const destinationBins = useDestinationBins();
  const boardState = useGameStore((state) => state.boardState);
  const moveInfo = useMoveInfo();
  const status = useGameStatus();
  const applyMove = useGameStore((state) => state.applyMove);
  const undo = useGameStore((state) => state.undo);
  const historyLength = useGameStore((state) => state.boardState?.history.length ?? 0);
  const [boardSize, setBoardSize] = useState({ width: 0, height: 0 });
  const [selectedId, setSelectedId] = useState<ItemId | null>(null);
  const [flashState, setFlashState] = useState<FlashState>({
    sourceBinId: null,
    stagingIndex: null,
    destinationBinId: null,
  });
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [dragPreview, setDragPreview] = useState<DragPreviewState | null>(null);
  const [dragHoverState, setDragHoverState] = useState<DragHoverState>({
    destinationBinId: null,
    isValid: null,
  });
  const [stagingPulse, setStagingPulse] = useState<PulseState | null>(null);
  const [destinationPulse, setDestinationPulse] = useState<DestinationPulseState | null>(
    null,
  );
  const [transferState, setTransferState] = useState<TransferState | null>(null);
  const [clearReleaseState, setClearReleaseState] = useState<ClearReleaseState | null>(null);
  const [isRejectingDrag, setIsRejectingDrag] = useState(false);
  const flashTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const feedbackTokenRef = useRef(0);

  const layout = getBoardLayout(
    boardSize.width,
    boardSize.height,
    sourceBins,
    stagingSlots,
    destinationBins,
  );

  useEffect(() => {
    if (
      selectedId &&
      !stagingSlots.some((slot) => slot.item?.id === selectedId)
    ) {
      setSelectedId(null);
    }
  }, [selectedId, stagingSlots]);

  useEffect(
    () => () => {
      if (flashTimeoutRef.current) {
        clearTimeout(flashTimeoutRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    if (status === 'playing') {
      return;
    }

    setDragState(null);
    setDragHoverState({
      destinationBinId: null,
      isValid: null,
    });
    setDragPreview(null);
    setIsRejectingDrag(false);
  }, [status]);

  const nextFeedbackToken = () => {
    feedbackTokenRef.current += 1;
    return feedbackTokenRef.current;
  };

  const flashElement = (nextFlash: FlashState) => {
    if (flashTimeoutRef.current) {
      clearTimeout(flashTimeoutRef.current);
    }

    setFlashState(nextFlash);
    flashTimeoutRef.current = setTimeout(() => {
      setFlashState({
        sourceBinId: null,
        stagingIndex: null,
        destinationBinId: null,
      });
      flashTimeoutRef.current = null;
    }, 300);
  };

  const triggerStagingPulse = (
    index: number,
    variant: PulseState['variant'],
  ) => {
    setStagingPulse({
      index,
      variant,
      token: nextFeedbackToken(),
    });
  };

  const triggerDestinationPulse = (
    destinationBinId: string,
    variant: DestinationPulseState['variant'],
  ) => {
    setDestinationPulse({
      destinationBinId,
      variant,
      token: nextFeedbackToken(),
    });
  };

  const triggerCommitFeedback = (
    previousState: BoardState,
    nextState: BoardState,
    destinationBinId: string,
    itemId: ItemId,
  ) => {
    const feedback = deriveCommitFeedback(
      previousState,
      nextState,
      destinationBinId,
      itemId,
    );

    if (!feedback) {
      return;
    }

    triggerDestinationPulse(
      feedback.destinationBinId,
      feedback.didCompleteGroup ? 'complete' : 'commit',
    );

    if (feedback.didCompleteGroup) {
      triggerStagingPulse(feedback.stagingIndex, 'complete');
      setClearReleaseState({
        destinationBinId: feedback.destinationBinId,
        items: [...feedback.previousContents, feedback.item],
        token: nextFeedbackToken(),
      });
      return;
    }

    triggerStagingPulse(feedback.stagingIndex, 'commit');
  };

  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setBoardSize({ width, height });
  };

  const clearDragInteraction = () => {
    setDragState(null);
    setDragPreview(null);
    setDragHoverState({
      destinationBinId: null,
      isValid: null,
    });
    setIsRejectingDrag(false);
  };

  const handleTransferComplete = (token: number) => {
    setTransferState((current) => {
      if (!current || current.token !== token) {
        return current;
      }

      if (current.hideStagingIndex !== null) {
        triggerStagingPulse(current.hideStagingIndex, 'pull');
      }

      return null;
    });
  };

  const animateDragBackToOrigin = (
    nextSelectedId: ItemId | null,
    options?: {
      readonly isReject?: boolean;
    },
  ) => {
    if (!dragState) {
      return;
    }

    const originCenter = getFrameCenter(dragState.originFrame);
    const isReject = options?.isReject ?? false;
    setIsRejectingDrag(isReject);
    setDragPreview({
      centerX: originCenter.x,
      centerY: originCenter.y,
      scale: isReject ? DRAG_REJECT_SCALE : 1,
      opacity: 1,
    });
    setTimeout(() => {
      setSelectedId(nextSelectedId);
      clearDragInteraction();
    }, isReject ? 90 : 0);
  };

  const updateDragHover = (pointX: number, pointY: number, item: Item) => {
    const destinationIndex = findFrameIndexAtPoint(layout.destinationFrames, {
      x: pointX,
      y: pointY,
    });
    const hoveredDestination = destinationBins[destinationIndex] ?? null;
    const nextHoverState: DragHoverState = hoveredDestination
      ? {
          destinationBinId: hoveredDestination.id,
          isValid: canCommitItemToDestination(item, hoveredDestination),
        }
      : {
          destinationBinId: null,
          isValid: null,
        };

    setDragHoverState((current) =>
      current.destinationBinId === nextHoverState.destinationBinId &&
      current.isValid === nextHoverState.isValid
        ? current
        : nextHoverState,
    );
  };

  const startDrag = (stagingIndex: number) => {
    if (status !== 'playing') {
      return;
    }

    const slot = stagingSlots.find((candidate) => candidate.index === stagingIndex);
    const frame = layout.stagingFrames[stagingIndex];
    if (!slot?.item || !frame) {
      return;
    }

    const originCenter = getFrameCenter(frame);
    setDragState({
      item: slot.item,
      stagingIndex,
      originFrame: frame,
    });
    setDragHoverState({
      destinationBinId: null,
      isValid: null,
    });
    setSelectedId(slot.item.id);
    setDragPreview({
      centerX: originCenter.x,
      centerY: originCenter.y,
      scale: DRAG_SCALE,
      opacity: 1,
    });
  };

  const updateDrag = (stagingIndex: number, translationX: number, translationY: number) => {
    const slot = stagingSlots.find((candidate) => candidate.index === stagingIndex);
    const frame = layout.stagingFrames[stagingIndex];
    if (!slot?.item || !frame) {
      return;
    }

    const originCenter = getFrameCenter(frame);
    const nextX = originCenter.x + translationX;
    const nextY = originCenter.y + translationY;
    setDragPreview({
      centerX: nextX,
      centerY: nextY,
      scale: DRAG_SCALE,
      opacity: 1,
    });
    updateDragHover(nextX, nextY, slot.item);
  };

  const finishDrag = (stagingIndex: number, translationX: number, translationY: number) => {
    if (!boardState) {
      clearDragInteraction();
      return;
    }

    const slot = stagingSlots.find((candidate) => candidate.index === stagingIndex);
    const frame = layout.stagingFrames[stagingIndex];
    if (!slot?.item || !frame) {
      clearDragInteraction();
      return;
    }

    const originCenter = getFrameCenter(frame);
    const releasePoint = {
      x: originCenter.x + translationX,
      y: originCenter.y + translationY,
    };
    const destinationIndex = findFrameIndexAtPoint(layout.destinationFrames, releasePoint);
    const hoveredDestination = destinationBins[destinationIndex] ?? null;

    if (!hoveredDestination) {
      animateDragBackToOrigin(slot.item.id);
      return;
    }

    if (!canCommitItemToDestination(slot.item, hoveredDestination)) {
      triggerStagingPulse(stagingIndex, 'reject');
      triggerDestinationPulse(hoveredDestination.id, 'reject');
      flashElement({
        sourceBinId: null,
        stagingIndex,
        destinationBinId: hoveredDestination.id,
      });
      animateDragBackToOrigin(slot.item.id, { isReject: true });
      return;
    }

    const destinationFrame = layout.destinationFrames[destinationIndex];
    if (!destinationFrame) {
      animateDragBackToOrigin(slot.item.id);
      return;
    }

    const draggedItemId = slot.item.id;
    const completeValidDrop = (
      itemId: ItemId,
      destinationBinId: string,
      draggedStagingIndex: number,
    ) => {
      const result = applyMove({
        type: 'commit',
        itemId,
        destBinId: destinationBinId,
      });

      if (!result.success) {
        triggerStagingPulse(draggedStagingIndex, 'reject');
        triggerDestinationPulse(destinationBinId, 'reject');
        flashElement({
          sourceBinId: null,
          stagingIndex: draggedStagingIndex,
          destinationBinId,
        });
        animateDragBackToOrigin(itemId, { isReject: true });
        return;
      }

      triggerCommitFeedback(
        boardState,
        result.nextState,
        destinationBinId,
        itemId,
      );
      setSelectedId(null);
      clearDragInteraction();
    };
    const destinationCenter = getFrameCenter(destinationFrame);
    setDragPreview({
      centerX: destinationCenter.x,
      centerY: destinationCenter.y,
      scale: 1.14,
      opacity: 1,
    });
    setTimeout(() => {
      completeValidDrop(draggedItemId, hoveredDestination.id, stagingIndex);
    }, FEEDBACK_TIMINGS.commitSnapMs);
  };

  const handleSourceTapById = (sourceBinId: string) => {
    if (!boardState) {
      return;
    }

    const bin = sourceBins.find((candidate) => candidate.id === sourceBinId);
    if (!bin) {
      return;
    }

    const topItem = getTopLayer(bin)[0];
    if (!topItem) {
      flashElement({
        sourceBinId: bin.id,
        stagingIndex: null,
        destinationBinId: null,
      });
      return;
    }

    const result = applyMove({
      type: 'pull',
      sourceBinId: bin.id,
      itemId: topItem.id,
    });

    if (!result.success) {
      flashElement({
        sourceBinId: bin.id,
        stagingIndex: null,
        destinationBinId: null,
      });
      return;
    }

    const feedback = derivePullFeedback(boardState, result.nextState, bin.id, topItem.id);
    if (!feedback) {
      return;
    }

    const sourceIndex = sourceBins.findIndex((candidate) => candidate.id === bin.id);
    const sourceFrame = layout.sourceFrames[sourceIndex];
    const stagingFrame = layout.stagingFrames[feedback.stagingIndex];
    if (!sourceFrame || !stagingFrame) {
      triggerStagingPulse(feedback.stagingIndex, 'pull');
      return;
    }

    setTransferState({
      token: nextFeedbackToken(),
      item: feedback.item,
      fromFrame: sourceFrame,
      toFrame: stagingFrame,
      hideStagingIndex: feedback.stagingIndex,
    });
  };

  const handleStagingTapByIndex = (stagingIndex: number) => {
    const slot = stagingSlots.find((candidate) => candidate.index === stagingIndex);
    if (!slot?.item) {
      return;
    }

    const { item } = slot;
    setSelectedId((current) => (current === item.id ? null : item.id));
  };

  const handleDestinationTapById = (destBinId: string) => {
    if (!boardState || !selectedId) {
      return;
    }

    const bin = destinationBins.find((candidate) => candidate.id === destBinId);
    if (!bin) {
      return;
    }

    const result = applyMove({
      type: 'commit',
      itemId: selectedId,
      destBinId: bin.id,
    });

    if (!result.success) {
      const selectedSlot = stagingSlots.find((slot) => slot.item?.id === selectedId);
      if (selectedSlot) {
        triggerStagingPulse(selectedSlot.index, 'reject');
      }
      triggerDestinationPulse(bin.id, 'reject');
      flashElement({
        sourceBinId: null,
        stagingIndex: selectedSlot?.index ?? null,
        destinationBinId: bin.id,
      });
      return;
    }

    triggerCommitFeedback(boardState, result.nextState, bin.id, selectedId);
    setSelectedId(null);
  };

  const handleUndoPress = () => {
    const result = undo();

    if (result.success) {
      setSelectedId(null);
    }
  };

  const moveBudgetLabel =
    moveInfo.budget === null
      ? `Moves: ${String(moveInfo.used)} / ∞`
      : `Moves: ${String(moveInfo.used)} / ${String(moveInfo.budget)}`;
  const moveBudgetColor = getMoveCounterColor(moveInfo.used, moveInfo.budget);

  const overlay =
    status === 'lost' ? (
      <StatusOverlay
        title="Out of moves"
        actions={[
          {
            label: 'Retry',
            onPress: () => {
              setSelectedId(null);
              onRetryLevel?.();
            },
          },
        ]}
      />
    ) : status === 'won' ? (
      <StatusOverlay
        title="Level complete"
        actions={[
          {
            label: 'Next level',
            onPress: () => {
              setSelectedId(null);
              (onNextLevel ?? onRetryLevel)?.();
            },
          },
        ]}
      />
    ) : status === 'stuck' ? (
      <StatusOverlay
        title="You're stuck"
        actions={[
          ...(historyLength > 0
            ? [
                {
                  label: 'Undo last move',
                  onPress: handleUndoPress,
                  variant: 'secondary' as const,
                },
              ]
            : []),
          {
            label: 'Retry level',
            onPress: () => {
              setSelectedId(null);
              onRetryLevel?.();
            },
          },
        ]}
      />
    ) : null;
  const draggedItemDiameter = dragState
    ? getStagingItemRadius(dragState.originFrame) * 2
    : 0;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={[styles.headerText, { color: moveBudgetColor }]}>
          {moveBudgetLabel}
        </Text>
        {headerAccessory ? <View style={styles.headerAccessory}>{headerAccessory}</View> : null}
      </View>
      <View style={styles.boardSurface} onLayout={onLayout}>
        {boardSize.width > 0 && boardSize.height > 0 ? (
          <>
            <Canvas style={StyleSheet.absoluteFill}>
              <Rect
                x={0}
                y={0}
                width={layout.canvasWidth}
                height={layout.canvasHeight}
                color={BACKGROUND_COLOR}
              />
              <RoundedRect
                x={layout.surfaceFrame.x}
                y={layout.surfaceFrame.y}
                width={layout.surfaceFrame.width}
                height={layout.surfaceFrame.height}
                r={26}
                color={SURFACE_FILL}
              />
              <RoundedRect
                x={layout.surfaceFrame.x}
                y={layout.surfaceFrame.y}
                width={layout.surfaceFrame.width}
                height={layout.surfaceFrame.height}
                r={26}
                color={SURFACE_STROKE}
                style="stroke"
                strokeWidth={2}
              />
              <RoundedRect
                x={layout.sourceZoneFrame.x - 4}
                y={layout.sourceZoneFrame.y + 2}
                width={layout.sourceZoneFrame.width + 8}
                height={layout.sourceZoneFrame.height - 4}
                r={22}
                color={ZONE_FILL}
              />
              <RoundedRect
                x={layout.stagingZoneFrame.x - 4}
                y={layout.stagingZoneFrame.y + 2}
                width={layout.stagingZoneFrame.width + 8}
                height={layout.stagingZoneFrame.height - 4}
                r={22}
                color={EMPTY_SLOT_COLOR}
              />
              <RoundedRect
                x={layout.destinationZoneFrame.x - 4}
                y={layout.destinationZoneFrame.y + 2}
                width={layout.destinationZoneFrame.width + 8}
                height={layout.destinationZoneFrame.height - 4}
                r={22}
                color={ZONE_FILL}
              />
              <SkiaText
                x={layout.sourceZoneFrame.x + 2}
                y={layout.sourceZoneFrame.y + 16}
                text="Sources"
                font={SECTION_FONT}
                color={MUTED_LABEL_COLOR}
              />
              <SkiaText
                x={layout.stagingZoneFrame.x + 2}
                y={layout.stagingZoneFrame.y + 16}
                text="Staging"
                font={SECTION_FONT}
                color={MUTED_LABEL_COLOR}
              />
              <SkiaText
                x={layout.destinationZoneFrame.x + 2}
                y={layout.destinationZoneFrame.y + 16}
                text="Destinations"
                font={SECTION_FONT}
                color={MUTED_LABEL_COLOR}
              />
              {sourceBins.map((bin, index) => {
                const frame = layout.sourceFrames[index];
                if (!frame) {
                  return null;
                }

                return renderSourceBin(bin, frame, flashState.sourceBinId === bin.id);
              })}
              {stagingSlots.map((slot, index) => {
                const frame = layout.stagingFrames[index];
                if (!frame) {
                  return null;
                }

                return renderStagingSlot(
                  slot,
                  frame,
                  slot.item?.id === selectedId,
                  flashState.stagingIndex === slot.index,
                  dragState?.item.id === slot.item?.id ||
                    transferState?.hideStagingIndex === slot.index,
                );
              })}
              {destinationBins.map((bin, index) => {
                const frame = layout.destinationFrames[index];
                if (!frame) {
                  return null;
                }

                return renderDestinationBin(
                  bin,
                  frame,
                  getDestinationHighlightState(
                    bin.id,
                    flashState,
                    dragHoverState,
                    destinationPulse,
                  ),
                );
              })}
            </Canvas>
            <View pointerEvents="none" style={styles.feedbackLayer}>
              {dragState ? (
                <DraggedItem
                  item={dragState.item}
                  diameter={draggedItemDiameter}
                  preview={
                    dragPreview ?? {
                      centerX: 0,
                      centerY: 0,
                      scale: 1,
                      opacity: 0,
                    }
                  }
                  isRejecting={isRejectingDrag}
                />
              ) : null}
              {transferState ? (
                <TransferOverlay
                  transfer={transferState}
                  onComplete={handleTransferComplete}
                />
              ) : null}
              {stagingPulse
                ? (() => {
                    const frame = layout.stagingFrames[stagingPulse.index];
                    return frame ? (
                      <FeedbackPulseOverlay
                        frame={frame}
                        token={stagingPulse.token}
                        variant={stagingPulse.variant}
                      />
                    ) : null;
                  })()
                : null}
              {destinationPulse
                ? (() => {
                    const destinationIndex = destinationBins.findIndex(
                      (bin) => bin.id === destinationPulse.destinationBinId,
                    );
                    const frame = layout.destinationFrames[destinationIndex];
                    return frame ? (
                      <DestinationPulseOverlay
                        frame={frame}
                        token={destinationPulse.token}
                        variant={destinationPulse.variant}
                      />
                    ) : null;
                  })()
                : null}
              {clearReleaseState
                ? (() => {
                    const destinationIndex = destinationBins.findIndex(
                      (bin) => bin.id === clearReleaseState.destinationBinId,
                    );
                    const frame = layout.destinationFrames[destinationIndex];
                    return frame ? (
                      <ClearReleaseOverlay
                        frame={frame}
                        items={clearReleaseState.items}
                        token={clearReleaseState.token}
                      />
                    ) : null;
                  })()
                : null}
            </View>
            {sourceBins.map((bin, index) => {
              const frame = layout.sourceFrames[index];
              if (!frame) {
                return null;
              }

              const tapGesture = Gesture.Tap()
                .enabled(dragState === null)
                .onEnd(() => {
                  scheduleOnRN(handleSourceTapById, bin.id);
                });

              return (
                <GestureDetector key={'source-hit-' + bin.id} gesture={tapGesture}>
                  <View
                    collapsable={false}
                    pointerEvents="box-only"
                    style={frameStyle(frame)}
                  />
                </GestureDetector>
              );
            })}
            {stagingSlots.map((slot, index) => {
              const frame = layout.stagingFrames[index];
              if (!frame) {
                return null;
              }

              const tapGesture = Gesture.Tap()
                .enabled(Boolean(slot.item))
                .onEnd(() => {
                  scheduleOnRN(handleStagingTapByIndex, slot.index);
                });
              const panGesture = Gesture.Pan()
                .enabled(status === 'playing' && slot.item !== null)
                .activateAfterLongPress(0)
                .minDistance(4)
                .runOnJS(true)
                .onStart(() => {
                  startDrag(slot.index);
                })
                .onUpdate((event) => {
                  updateDrag(slot.index, event.translationX, event.translationY);
                })
                .onEnd((event) => {
                  finishDrag(slot.index, event.translationX, event.translationY);
                })
                .onFinalize(() => {
                  setDragHoverState({
                    destinationBinId: null,
                    isValid: null,
                  });
                });
              const stagingGesture = Gesture.Race(panGesture, tapGesture);

              return (
                <GestureDetector
                  key={'staging-hit-' + String(slot.index)}
                  gesture={stagingGesture}
                >
                  <View
                    collapsable={false}
                    pointerEvents="box-only"
                    style={frameStyle(frame)}
                  />
                </GestureDetector>
              );
            })}
            {destinationBins.map((bin, index) => {
              const frame = layout.destinationFrames[index];
              if (!frame) {
                return null;
              }

              const tapGesture = Gesture.Tap()
                .enabled(dragState === null)
                .onEnd(() => {
                  scheduleOnRN(handleDestinationTapById, bin.id);
                });

              return (
                <GestureDetector
                  key={'destination-hit-' + bin.id}
                  gesture={tapGesture}
                >
                  <View
                    collapsable={false}
                    pointerEvents="box-only"
                    style={frameStyle(frame)}
                  />
                </GestureDetector>
              );
            })}
          </>
        ) : null}
      </View>
      <View style={styles.toolbar}>
        <Pressable
          accessibilityLabel="Undo"
          disabled={historyLength === 0}
          onPress={handleUndoPress}
          style={({ pressed }) => [
            styles.undoButton,
            historyLength === 0 ? styles.undoButtonDisabled : null,
            pressed && historyLength > 0 ? styles.undoButtonPressed : null,
          ]}
        >
          <Text style={styles.undoButtonText}>Undo</Text>
        </Pressable>
      </View>
      {overlay}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 10,
    backgroundColor: '#EDE5D7',
    borderBottomWidth: 1,
    borderBottomColor: '#D6C9B6',
  },
  headerText: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  headerAccessory: {
    marginLeft: 12,
    alignItems: 'flex-end',
  },
  boardSurface: {
    flex: 1,
    position: 'relative',
  },
  feedbackLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 20,
    elevation: 20,
  },
  draggedItem: {
    position: 'absolute',
    left: 0,
    top: 0,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#FFFFFF',
    shadowColor: '#1A140F',
    shadowOffset: {
      width: 0,
      height: 10,
    },
    shadowOpacity: 0.24,
    shadowRadius: 14,
    elevation: 10,
    zIndex: 2,
  },
  feedbackOverlay: {
    position: 'absolute',
    borderRadius: 18,
    borderWidth: 4,
    zIndex: 1,
  },
  clearItem: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    zIndex: 1,
  },
  toolbar: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 16,
    backgroundColor: '#E6DFD2',
    borderTopWidth: 1,
    borderTopColor: '#C9BEAE',
  },
  undoButton: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
    borderRadius: 14,
    backgroundColor: '#3F5F4A',
  },
  undoButtonDisabled: {
    backgroundColor: '#AAA39A',
  },
  undoButtonPressed: {
    opacity: 0.86,
  },
  undoButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(20, 16, 12, 0.48)',
    paddingHorizontal: 24,
  },
  overlayCard: {
    width: '100%',
    maxWidth: 340,
    borderRadius: 24,
    paddingHorizontal: 22,
    paddingVertical: 24,
    backgroundColor: '#F8F3EA',
    borderWidth: 1,
    borderColor: '#CDBDA7',
    alignItems: 'center',
  },
  overlayTitle: {
    color: LABEL_COLOR,
    fontSize: 28,
    fontWeight: '800',
    textAlign: 'center',
  },
  overlayActions: {
    width: '100%',
    marginTop: 20,
    gap: 12,
  },
  overlayButton: {
    minHeight: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  overlayButtonPrimary: {
    backgroundColor: '#3F5F4A',
  },
  overlayButtonSecondary: {
    backgroundColor: '#E6DFD2',
    borderWidth: 1,
    borderColor: '#B5A898',
  },
  overlayButtonPressed: {
    opacity: 0.88,
  },
  overlayButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  overlayButtonTextSecondary: {
    color: LABEL_COLOR,
  },
});
