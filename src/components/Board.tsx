import { useEffect, useRef, useState, type ReactNode } from 'react';
import { LayoutChangeEvent, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  Canvas,
  Circle,
  Group,
  Rect,
  RoundedRect,
  Text as SkiaText,
  matchFont,
} from '@shopify/react-native-skia';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import {
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
  findFrameIndexAtPoint,
  getBoardLayout,
  getCategoryColor,
  getDestinationBinLockItem,
  getItemCirclePositions,
  getTopLayer,
  getVariantLetter,
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

type DestinationHighlightState = 'none' | 'valid' | 'invalid' | 'flash';

const BACKGROUND_COLOR = '#F5F1E8';
const PANEL_COLOR = '#E6DFD2';
const PANEL_STROKE = '#6F675C';
const EMPTY_SLOT_COLOR = '#FFFFFF';
const LABEL_COLOR = '#2F2A24';
const FLASH_COLOR = '#E05151';
const VALID_HIGHLIGHT_FILL = '#E9F1E7';
const VALID_HIGHLIGHT_STROKE = '#5A8661';
const INVALID_HIGHLIGHT_FILL = '#F8D9D6';
const LOCKED_FILL = '#F2ECE2';
const SOURCE_FONT = matchFont({
  fontFamily: 'Arial',
  fontSize: 16,
  fontStyle: 'normal',
  fontWeight: 'bold',
});
const BODY_FONT = matchFont({
  fontFamily: 'Arial',
  fontSize: 14,
  fontStyle: 'normal',
  fontWeight: 'normal',
});
const ITEM_FONT = matchFont({
  fontFamily: 'Arial',
  fontSize: 16,
  fontStyle: 'normal',
  fontWeight: 'bold',
});
const WARNING_COLOR = '#C78A11';
const DANGER_COLOR = '#B5412C';
const DRAG_SCALE = 1.08;
const DROP_SNAP_DURATION_MS = 120;

const getFrameCenter = (frame: Frame) => ({
  x: frame.x + frame.width / 2,
  y: frame.y + frame.height * 0.62,
});

const getStagingItemRadius = (frame: Frame) => Math.min(22, frame.width / 5);

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

const renderSourceBin = (
  bin: SourceBin,
  frame: Frame,
  isFlashing: boolean,
) => {
  const topLayer = getTopLayer(bin);
  const topItem = topLayer[0] ?? null;
  const fillColor = isFlashing
    ? FLASH_COLOR
    : topItem
      ? getCategoryColor(topItem.category)
      : PANEL_COLOR;
  const itemPositions = getItemCirclePositions(frame, topLayer.length);

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
      <SkiaText
        x={frame.x + 12}
        y={frame.y + 24}
        text={bin.id.toUpperCase()}
        font={SOURCE_FONT}
        color={LABEL_COLOR}
      />
      <SkiaText
        x={frame.x + 12}
        y={frame.y + 44}
        text={'Top ' + String(topLayer.length)}
        font={BODY_FONT}
        color={LABEL_COLOR}
      />
      {topLayer.map((item, index) => {
        const position = itemPositions[index];
        if (!position) {
          return null;
        }

        return (
          <Group key={item.id}>
            <Circle
              cx={position.x}
              cy={position.y}
              r={position.radius}
              color={getCategoryColor(item.category)}
            />
            <SkiaText
              x={position.x - position.radius * 0.35}
              y={position.y + position.radius * 0.25}
              text={getVariantLetter(item)}
              font={ITEM_FONT}
              color="#FFFFFF"
            />
          </Group>
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
      ? '#1E1E1E'
      : PANEL_STROKE;
  const borderWidth = isSelected ? 5 : 3;
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
        y={frame.y + 24}
        text={'SLOT ' + String(slot.index + 1)}
        font={BODY_FONT}
        color={LABEL_COLOR}
      />
      {item ? (
        <>
          <Circle
            cx={frame.x + frame.width / 2}
            cy={frame.y + frame.height * 0.62}
            r={Math.min(22, frame.width / 5)}
            color={getCategoryColor(item.category)}
          />
          <SkiaText
            x={frame.x + frame.width / 2 - 6}
            y={frame.y + frame.height * 0.62 + 6}
            text={getVariantLetter(item)}
            font={ITEM_FONT}
            color="#FFFFFF"
          />
        </>
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
  const lockedStrokeColor = lockItem ? getCategoryColor(lockItem.category) : PANEL_STROKE;
  const fillColor =
    highlightState === 'flash'
      ? FLASH_COLOR
      : highlightState === 'valid'
        ? VALID_HIGHLIGHT_FILL
        : highlightState === 'invalid'
          ? INVALID_HIGHLIGHT_FILL
          : isLocked
            ? LOCKED_FILL
            : PANEL_COLOR;
  const strokeColor =
    highlightState === 'valid'
      ? VALID_HIGHLIGHT_STROKE
      : highlightState === 'invalid' || highlightState === 'flash'
        ? FLASH_COLOR
        : lockedStrokeColor;
  const strokeWidth = highlightState === 'none' ? (isLocked ? 4 : 3) : 5;
  const itemPositions = getItemCirclePositions(frame, isLocked ? 3 : bin.contents.length);

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
        strokeWidth={strokeWidth}
      />
      <SkiaText
        x={frame.x + 12}
        y={frame.y + 24}
        text={bin.accepts.toUpperCase()}
        font={SOURCE_FONT}
        color={LABEL_COLOR}
      />
      <SkiaText
        x={frame.x + 12}
        y={frame.y + 44}
        text={isLocked ? 'LOCKED' : 'OPEN'}
        font={BODY_FONT}
        color={LABEL_COLOR}
      />
      <SkiaText
        x={frame.x + 12}
        y={frame.y + 62}
        text={String(bin.contents.length) + '/3  Cleared ' + String(bin.completedGroups)}
        font={BODY_FONT}
        color={LABEL_COLOR}
      />
      {bin.contents.map((item, index) => {
        const position = itemPositions[index];
        if (!position) {
          return null;
        }

        return (
          <Group key={item.id}>
            <Circle
              cx={position.x}
              cy={position.y}
              r={position.radius}
              color={getCategoryColor(item.category)}
            />
            <SkiaText
              x={position.x - position.radius * 0.35}
              y={position.y + position.radius * 0.25}
              text={getVariantLetter(item)}
              font={ITEM_FONT}
              color="#FFFFFF"
            />
          </Group>
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
              <SkiaText
                x={position.x - position.radius * 0.35}
                y={position.y + position.radius * 0.25}
                text={getVariantLetter(lockItem)}
                font={ITEM_FONT}
                color={getCategoryColor(lockItem.category)}
              />
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
): DestinationHighlightState => {
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
  animatedStyle,
}: {
  readonly item: Item;
  readonly diameter: number;
  readonly animatedStyle: object;
}) => (
  <Animated.View
    pointerEvents="none"
    style={[
      styles.draggedItem,
      {
        width: diameter,
        height: diameter,
        borderRadius: diameter / 2,
        backgroundColor: getCategoryColor(item.category),
      },
      animatedStyle,
    ]}
  >
    <Text style={styles.draggedItemLabel}>{getVariantLetter(item)}</Text>
  </Animated.View>
);

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
  const [dragHoverState, setDragHoverState] = useState<DragHoverState>({
    destinationBinId: null,
    isValid: null,
  });
  const flashTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragX = useSharedValue(0);
  const dragY = useSharedValue(0);
  const dragScale = useSharedValue(1);
  const dragOpacity = useSharedValue(0);

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
    dragOpacity.value = 0;
    dragScale.value = 1;
  }, [dragOpacity, dragScale, status]);

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

  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setBoardSize({ width, height });
  };

  const clearDragInteraction = () => {
    setDragState(null);
    setDragHoverState({
      destinationBinId: null,
      isValid: null,
    });
    dragOpacity.value = 0;
    dragScale.value = 1;
  };

  const animateDragBackToOrigin = (nextSelectedId: ItemId | null) => {
    if (!dragState) {
      return;
    }

    const originCenter = getFrameCenter(dragState.originFrame);
    dragScale.value = withSpring(1, {
      stiffness: 240,
      damping: 18,
      mass: 0.7,
    });
    dragX.value = withSpring(originCenter.x, {
      stiffness: 260,
      damping: 18,
      mass: 0.75,
    });
    dragY.value = withSpring(originCenter.y, {
      stiffness: 260,
      damping: 18,
      mass: 0.75,
    }, () => {
      scheduleOnRN(setSelectedId, nextSelectedId);
      scheduleOnRN(clearDragInteraction);
    });
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
    dragX.value = originCenter.x;
    dragY.value = originCenter.y;
    dragScale.value = withTiming(DRAG_SCALE, { duration: 120 });
    dragOpacity.value = 1;
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
    dragX.value = nextX;
    dragY.value = nextY;
    updateDragHover(nextX, nextY, slot.item);
  };

  const finishDrag = (stagingIndex: number, translationX: number, translationY: number) => {
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
      flashElement({
        sourceBinId: null,
        stagingIndex,
        destinationBinId: hoveredDestination.id,
      });
      animateDragBackToOrigin(slot.item.id);
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
        flashElement({
          sourceBinId: null,
          stagingIndex: draggedStagingIndex,
          destinationBinId,
        });
        animateDragBackToOrigin(itemId);
        return;
      }

      setSelectedId(null);
      clearDragInteraction();
    };
    const destinationCenter = getFrameCenter(destinationFrame);
    dragScale.value = withTiming(1, { duration: DROP_SNAP_DURATION_MS });
    dragX.value = withTiming(destinationCenter.x, { duration: DROP_SNAP_DURATION_MS });
    dragY.value = withTiming(destinationCenter.y, { duration: DROP_SNAP_DURATION_MS }, () => {
      scheduleOnRN(completeValidDrop, draggedItemId, hoveredDestination.id, stagingIndex);
    });
  };

  const draggedItemAnimatedStyle = useAnimatedStyle(() => {
    const draggedItemRadius = dragState ? getStagingItemRadius(dragState.originFrame) : 0;

    return {
      opacity: dragOpacity.value,
      transform: [
        { translateX: dragX.value },
        { translateY: dragY.value },
        { translateX: -draggedItemRadius },
        { translateY: -draggedItemRadius },
        { scale: dragScale.value },
      ],
    };
  }, [dragState]);

  const handleSourceTapById = (sourceBinId: string) => {
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
    }
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
    const bin = destinationBins.find((candidate) => candidate.id === destBinId);
    if (!bin || !selectedId) {
      return;
    }

    const result = applyMove({
      type: 'commit',
      itemId: selectedId,
      destBinId: bin.id,
    });

    if (!result.success) {
      const selectedSlot = stagingSlots.find((slot) => slot.item?.id === selectedId);
      flashElement({
        sourceBinId: null,
        stagingIndex: selectedSlot?.index ?? null,
        destinationBinId: bin.id,
      });
      return;
    }

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
              <Rect
                x={0}
                y={0}
                width={layout.canvasWidth}
                height={layout.canvasHeight * 0.25}
                color="#EDE5D7"
              />
              <Rect
                x={0}
                y={layout.canvasHeight * 0.25}
                width={layout.canvasWidth}
                height={layout.canvasHeight * 0.4}
                color="#F8F5EE"
              />
              <Rect
                x={0}
                y={layout.canvasHeight * 0.75}
                width={layout.canvasWidth}
                height={layout.canvasHeight * 0.25}
                color="#EDE5D7"
              />
              <SkiaText x={16} y={20} text="Sources" font={SOURCE_FONT} color={LABEL_COLOR} />
              <SkiaText
                x={16}
                y={layout.canvasHeight * 0.25 + 20}
                text="Staging"
                font={SOURCE_FONT}
                color={LABEL_COLOR}
              />
              <SkiaText
                x={16}
                y={layout.canvasHeight * 0.75 + 20}
                text="Destinations"
                font={SOURCE_FONT}
                color={LABEL_COLOR}
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
                  dragState?.item.id === slot.item?.id,
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
                  getDestinationHighlightState(bin.id, flashState, dragHoverState),
                );
              })}
            </Canvas>
            {dragState ? (
              <DraggedItem
                item={dragState.item}
                diameter={draggedItemDiameter}
                animatedStyle={draggedItemAnimatedStyle}
              />
            ) : null}
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
  },
  draggedItem: {
    position: 'absolute',
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
  draggedItemLabel: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 0.2,
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
