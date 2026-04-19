import { ITEM_VARIANTS_BY_CATEGORY, type DestinationBin, type Item, type ItemCategory, type SourceBin, type StagingSlot } from '../engine';

export type Frame = {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
};

export type Point = {
  readonly x: number;
  readonly y: number;
};

export type BoardLayout = {
  readonly canvasWidth: number;
  readonly canvasHeight: number;
  readonly sourceFrames: ReadonlyArray<Frame>;
  readonly stagingFrames: ReadonlyArray<Frame>;
  readonly destinationFrames: ReadonlyArray<Frame>;
};

type ItemVariantMap = typeof ITEM_VARIANTS_BY_CATEGORY;

export type VariantGlyphKey = {
  readonly [TCategory in keyof ItemVariantMap]: ItemVariantMap[TCategory][number];
}[keyof ItemVariantMap];

export type GlyphPrimitive =
  | {
      readonly type: 'circle';
      readonly cx: number;
      readonly cy: number;
      readonly r: number;
      readonly style?: 'fill' | 'stroke';
      readonly strokeWidth?: number;
    }
  | {
      readonly type: 'rect';
      readonly x: number;
      readonly y: number;
      readonly width: number;
      readonly height: number;
      readonly style?: 'fill' | 'stroke';
      readonly strokeWidth?: number;
    }
  | {
      readonly type: 'roundedRect';
      readonly x: number;
      readonly y: number;
      readonly width: number;
      readonly height: number;
      readonly r: number;
      readonly style?: 'fill' | 'stroke';
      readonly strokeWidth?: number;
    }
  | {
      readonly type: 'path';
      readonly path: string;
      readonly style?: 'fill' | 'stroke';
      readonly strokeWidth?: number;
    };

const CATEGORY_COLORS: Record<ItemCategory, string> = {
  medical: '#D14343',
  industrial: '#7A7F87',
  harbor: '#3478C8',
  restoration: '#D89216',
  produce: '#3A9A48',
  chemical: '#7B4BC7',
};

export const getCategoryColor = (category: ItemCategory): string =>
  CATEGORY_COLORS[category];

const getSectionFrames = (
  count: number,
  sectionY: number,
  sectionHeight: number,
  width: number,
): ReadonlyArray<Frame> => {
  if (count === 0) {
    return [];
  }

  const horizontalPadding = 16;
  const gap = 12;
  const usableWidth = width - horizontalPadding * 2;
  const itemWidth = Math.max(
    72,
    (usableWidth - gap * Math.max(0, count - 1)) / count,
  );
  const actualWidth =
    itemWidth * count + gap * Math.max(0, count - 1) + horizontalPadding * 2;
  const startX = (width - actualWidth) / 2 + horizontalPadding;
  const frameHeight = Math.max(88, sectionHeight - 24);
  const y = sectionY + (sectionHeight - frameHeight) / 2;

  return Array.from({ length: count }, (_, index) => ({
    x: startX + index * (itemWidth + gap),
    y,
    width: itemWidth,
    height: frameHeight,
  }));
};

const getStagingFrames = (
  capacity: number,
  sectionY: number,
  sectionHeight: number,
  width: number,
): ReadonlyArray<Frame> => {
  if (capacity === 0) {
    return [];
  }

  const itemsPerRow = capacity > 5 ? Math.ceil(capacity / 2) : capacity;
  const rowCount = capacity > 5 ? 2 : 1;
  const rowGap = 12;
  const rowHeight =
    (sectionHeight - rowGap * Math.max(0, rowCount - 1) - 24) / rowCount;

  return Array.from({ length: capacity }, (_, index) => {
    const row = capacity > 5 ? Math.floor(index / itemsPerRow) : 0;
    const col = capacity > 5 ? index % itemsPerRow : index;
    const itemsInThisRow =
      capacity > 5 && row === rowCount - 1
        ? capacity - itemsPerRow * (rowCount - 1)
        : itemsPerRow;
    const frames = getSectionFrames(
      itemsInThisRow,
      sectionY + row * (rowHeight + rowGap),
      rowHeight + 24,
      width,
    );

    return frames[col] as Frame;
  });
};

export const getBoardLayout = (
  width: number,
  height: number,
  sourceBins: ReadonlyArray<SourceBin>,
  stagingSlots: ReadonlyArray<StagingSlot>,
  destinationBins: ReadonlyArray<DestinationBin>,
): BoardLayout => {
  const canvasWidth = Math.max(320, width);
  const canvasHeight = Math.max(480, height);
  const sourceHeight = canvasHeight * 0.25;
  const stagingHeight = canvasHeight * 0.4;
  const destinationHeight = canvasHeight * 0.25;

  return {
    canvasWidth,
    canvasHeight,
    sourceFrames: getSectionFrames(sourceBins.length, 0, sourceHeight, canvasWidth),
    stagingFrames: getStagingFrames(
      stagingSlots.length,
      sourceHeight,
      stagingHeight,
      canvasWidth,
    ),
    destinationFrames: getSectionFrames(
      destinationBins.length,
      canvasHeight - destinationHeight,
      destinationHeight,
      canvasWidth,
    ),
  };
};

export const getTopLayer = (bin: SourceBin): ReadonlyArray<Item> => bin.layers[0] ?? [];

export const frameContainsPoint = (frame: Frame, point: Point): boolean =>
  point.x >= frame.x &&
  point.x <= frame.x + frame.width &&
  point.y >= frame.y &&
  point.y <= frame.y + frame.height;

export const findFrameIndexAtPoint = (
  frames: ReadonlyArray<Frame>,
  point: Point,
): number =>
  frames.findIndex((frame) => frameContainsPoint(frame, point));

type GlyphBuildContext = {
  readonly centerX: number;
  readonly centerY: number;
  readonly size: number;
  readonly strokeWidth: number;
};

const createGlyphBuilder = ({
  centerX,
  centerY,
  size,
  strokeWidth,
}: GlyphBuildContext) => {
  const half = size / 2;
  const left = centerX - half;
  const top = centerY - half;
  const scale = size / 100;
  const px = (value: number) => left + value * scale;
  const py = (value: number) => top + value * scale;
  const point = (x: number, y: number) => `${String(px(x))} ${String(py(y))}`;

  return {
    strokeWidth,
    circle: (
      cx: number,
      cy: number,
      r: number,
      style: 'fill' | 'stroke' = 'fill',
      customStrokeWidth?: number,
    ): GlyphPrimitive => ({
      type: 'circle',
      cx: px(cx),
      cy: py(cy),
      r: r * scale,
      style,
      strokeWidth: customStrokeWidth,
    }),
    rect: (
      x: number,
      y: number,
      width: number,
      height: number,
      style: 'fill' | 'stroke' = 'fill',
      customStrokeWidth?: number,
    ): GlyphPrimitive => ({
      type: 'rect',
      x: px(x),
      y: py(y),
      width: width * scale,
      height: height * scale,
      style,
      strokeWidth: customStrokeWidth,
    }),
    roundedRect: (
      x: number,
      y: number,
      width: number,
      height: number,
      r: number,
      style: 'fill' | 'stroke' = 'fill',
      customStrokeWidth?: number,
    ): GlyphPrimitive => ({
      type: 'roundedRect',
      x: px(x),
      y: py(y),
      width: width * scale,
      height: height * scale,
      r: r * scale,
      style,
      strokeWidth: customStrokeWidth,
    }),
    path: (
      path: string,
      style: 'fill' | 'stroke' = 'stroke',
      customStrokeWidth?: number,
    ): GlyphPrimitive => ({
      type: 'path',
      path,
      style,
      strokeWidth: customStrokeWidth,
    }),
    point,
  };
};

const getVariantGlyphKey = (item: Item): VariantGlyphKey => String(item.variant) as VariantGlyphKey;

export const getVariantGlyphSpec = (
  item: Item,
  {
    centerX,
    centerY,
    size,
    strokeWidth = Math.max(1.75, size * 0.1),
  }: {
    readonly centerX: number;
    readonly centerY: number;
    readonly size: number;
    readonly strokeWidth?: number;
  },
): ReadonlyArray<GlyphPrimitive> => {
  const glyph = createGlyphBuilder({
    centerX,
    centerY,
    size,
    strokeWidth,
  });
  const ringStroke = Math.max(1.4, strokeWidth * 0.9);

  switch (getVariantGlyphKey(item)) {
    case 'syringe':
      return [
        glyph.roundedRect(46, 26, 8, 36, 4),
        glyph.rect(42, 18, 16, 6),
        glyph.rect(48, 10, 4, 10),
        glyph.path(`M ${glyph.point(50, 62)} L ${glyph.point(50, 82)}`),
        glyph.path(`M ${glyph.point(50, 82)} L ${glyph.point(46, 88)}`),
      ];
    case 'vial':
      return [
        glyph.path(
          [
            `M ${glyph.point(39, 20)}`,
            `L ${glyph.point(61, 20)}`,
            `L ${glyph.point(61, 30)}`,
            `Q ${glyph.point(61, 38)} ${glyph.point(66, 44)}`,
            `L ${glyph.point(66, 70)}`,
            `Q ${glyph.point(66, 82)} ${glyph.point(54, 86)}`,
            `L ${glyph.point(46, 86)}`,
            `Q ${glyph.point(34, 82)} ${glyph.point(34, 70)}`,
            `L ${glyph.point(34, 44)}`,
            `Q ${glyph.point(39, 38)} ${glyph.point(39, 30)}`,
            'Z',
          ].join(' '),
          'stroke',
        ),
        glyph.path(`M ${glyph.point(39, 32)} L ${glyph.point(61, 32)}`),
      ];
    case 'bandage':
      return [
        glyph.roundedRect(22, 36, 56, 28, 12),
        glyph.path(`M ${glyph.point(50, 40)} L ${glyph.point(50, 60)}`),
      ];
    case 'gear':
      return [
        glyph.circle(50, 50, 22, 'stroke', ringStroke),
        glyph.circle(50, 50, 7),
        glyph.rect(47, 10, 6, 12),
        glyph.rect(47, 78, 6, 12),
        glyph.rect(10, 47, 12, 6),
        glyph.rect(78, 47, 12, 6),
        glyph.path(
          [
            `M ${glyph.point(26, 20)}`,
            `L ${glyph.point(32, 14)}`,
            `L ${glyph.point(40, 22)}`,
            `L ${glyph.point(34, 28)}`,
            'Z',
          ].join(' '),
          'fill',
        ),
        glyph.path(
          [
            `M ${glyph.point(74, 20)}`,
            `L ${glyph.point(80, 26)}`,
            `L ${glyph.point(72, 34)}`,
            `L ${glyph.point(66, 28)}`,
            'Z',
          ].join(' '),
          'fill',
        ),
        glyph.path(
          [
            `M ${glyph.point(20, 74)}`,
            `L ${glyph.point(26, 80)}`,
            `L ${glyph.point(34, 72)}`,
            `L ${glyph.point(28, 66)}`,
            'Z',
          ].join(' '),
          'fill',
        ),
        glyph.path(
          [
            `M ${glyph.point(80, 74)}`,
            `L ${glyph.point(74, 80)}`,
            `L ${glyph.point(66, 72)}`,
            `L ${glyph.point(72, 66)}`,
            'Z',
          ].join(' '),
          'fill',
        ),
      ];
    case 'valve':
      return [
        glyph.circle(50, 50, 8),
        glyph.path(`M ${glyph.point(20, 50)} L ${glyph.point(80, 50)}`),
        glyph.path(`M ${glyph.point(50, 20)} L ${glyph.point(50, 80)}`),
        glyph.circle(50, 50, 24, 'stroke', ringStroke),
      ];
    case 'bearing':
      return [
        glyph.circle(50, 50, 30, 'stroke', ringStroke),
        glyph.circle(50, 50, 17, 'stroke', ringStroke),
      ];
    case 'crate':
      return [
        glyph.rect(24, 24, 52, 52, 'stroke', ringStroke),
        glyph.path(`M ${glyph.point(28, 28)} L ${glyph.point(72, 72)}`),
        glyph.path(`M ${glyph.point(72, 28)} L ${glyph.point(28, 72)}`),
      ];
    case 'barrel':
      return [
        glyph.roundedRect(32, 18, 36, 64, 18, 'stroke', ringStroke),
        glyph.path(`M ${glyph.point(34, 36)} L ${glyph.point(66, 36)}`),
        glyph.path(`M ${glyph.point(34, 64)} L ${glyph.point(66, 64)}`),
      ];
    case 'net':
      return [
        glyph.path(
          [
            `M ${glyph.point(50, 16)}`,
            `L ${glyph.point(82, 50)}`,
            `L ${glyph.point(50, 84)}`,
            `L ${glyph.point(18, 50)}`,
            'Z',
          ].join(' '),
          'stroke',
          ringStroke,
        ),
        glyph.path(`M ${glyph.point(34, 34)} L ${glyph.point(66, 66)}`),
        glyph.path(`M ${glyph.point(66, 34)} L ${glyph.point(34, 66)}`),
        glyph.path(`M ${glyph.point(50, 16)} L ${glyph.point(50, 84)}`),
        glyph.path(`M ${glyph.point(18, 50)} L ${glyph.point(82, 50)}`),
      ];
    case 'clay':
      return [
        glyph.path(
          [
            `M ${glyph.point(30, 78)}`,
            `L ${glyph.point(44, 18)}`,
            `L ${glyph.point(74, 40)}`,
            `L ${glyph.point(58, 82)}`,
            'Z',
          ].join(' '),
          'fill',
        ),
        glyph.path(`M ${glyph.point(45, 42)} L ${glyph.point(60, 55)}`),
      ];
    case 'canvas':
      return [
        glyph.rect(26, 30, 40, 40, 'stroke', ringStroke),
        glyph.circle(72, 36, 10, 'stroke', ringStroke),
        glyph.path(`M ${glyph.point(66, 30)} L ${glyph.point(66, 70)}`),
      ];
    case 'frame':
      return [
        glyph.rect(22, 24, 56, 52, 'stroke', ringStroke),
        glyph.rect(34, 36, 32, 28, 'stroke', Math.max(1.2, strokeWidth * 0.7)),
      ];
    case 'citrus':
      return [
        glyph.circle(50, 50, 30, 'stroke', ringStroke),
        glyph.path(`M ${glyph.point(50, 34)} L ${glyph.point(50, 66)}`),
        glyph.path(`M ${glyph.point(36, 42)} L ${glyph.point(64, 58)}`),
        glyph.path(`M ${glyph.point(64, 42)} L ${glyph.point(36, 58)}`),
      ];
    case 'green':
      return [
        glyph.path(
          [
            `M ${glyph.point(28, 58)}`,
            `Q ${glyph.point(34, 24)} ${glyph.point(62, 26)}`,
            `Q ${glyph.point(78, 28)} ${glyph.point(74, 52)}`,
            `Q ${glyph.point(68, 78)} ${glyph.point(38, 74)}`,
            `Q ${glyph.point(24, 70)} ${glyph.point(28, 58)}`,
            'Z',
          ].join(' '),
          'fill',
        ),
        glyph.path(`M ${glyph.point(34, 66)} Q ${glyph.point(48, 52)} ${glyph.point(68, 34)}`),
      ];
    case 'root':
      return [
        glyph.path(
          [
            `M ${glyph.point(50, 28)}`,
            `Q ${glyph.point(68, 42)} ${glyph.point(62, 62)}`,
            `Q ${glyph.point(56, 82)} ${glyph.point(50, 88)}`,
            `Q ${glyph.point(44, 82)} ${glyph.point(38, 62)}`,
            `Q ${glyph.point(32, 42)} ${glyph.point(50, 28)}`,
            'Z',
          ].join(' '),
          'fill',
        ),
        glyph.path(`M ${glyph.point(50, 30)} L ${glyph.point(50, 18)}`),
        glyph.path(`M ${glyph.point(50, 20)} L ${glyph.point(40, 10)}`),
        glyph.path(`M ${glyph.point(50, 20)} L ${glyph.point(60, 10)}`),
      ];
    case 'reagent':
      return [
        glyph.path(
          [
            `M ${glyph.point(42, 18)}`,
            `L ${glyph.point(58, 18)}`,
            `L ${glyph.point(58, 34)}`,
            `L ${glyph.point(72, 72)}`,
            `Q ${glyph.point(74, 82)} ${glyph.point(64, 84)}`,
            `L ${glyph.point(36, 84)}`,
            `Q ${glyph.point(26, 82)} ${glyph.point(28, 72)}`,
            `L ${glyph.point(42, 34)}`,
            'Z',
          ].join(' '),
          'stroke',
        ),
        glyph.path(`M ${glyph.point(36, 60)} L ${glyph.point(64, 60)}`),
      ];
    case 'solvent':
      return [
        glyph.path(
          [
            `M ${glyph.point(50, 14)}`,
            `Q ${glyph.point(76, 40)} ${glyph.point(76, 58)}`,
            `Q ${glyph.point(76, 82)} ${glyph.point(50, 88)}`,
            `Q ${glyph.point(24, 82)} ${glyph.point(24, 58)}`,
            `Q ${glyph.point(24, 40)} ${glyph.point(50, 14)}`,
            'Z',
          ].join(' '),
          'fill',
        ),
      ];
    case 'catalyst':
      return [
        glyph.path(
          [
            `M ${glyph.point(50, 18)}`,
            `L ${glyph.point(74, 32)}`,
            `L ${glyph.point(74, 60)}`,
            `L ${glyph.point(50, 74)}`,
            `L ${glyph.point(26, 60)}`,
            `L ${glyph.point(26, 32)}`,
            'Z',
          ].join(' '),
          'stroke',
          ringStroke,
        ),
        glyph.circle(50, 46, 6),
      ];
  }
};

export const getDestinationBinLockItem = (bin: DestinationBin): Item | null =>
  bin.contents.length > 0 && bin.contents.length < 3 ? (bin.contents[0] ?? null) : null;

export const getItemCirclePositions = (
  frame: Frame,
  count: number,
): ReadonlyArray<{ readonly x: number; readonly y: number; readonly radius: number }> => {
  if (count === 0) {
    return [];
  }

  const maxDisplayed = Math.min(count, 5);
  const radius = Math.min(18, frame.width / 8, frame.height / 5);
  const gap = radius * 0.6;
  const totalWidth = maxDisplayed * radius * 2 + (maxDisplayed - 1) * gap;
  const startX = frame.x + (frame.width - totalWidth) / 2 + radius;
  const y = frame.y + frame.height * 0.62;

  return Array.from({ length: maxDisplayed }, (_, index) => ({
    x: startX + index * (radius * 2 + gap),
    y,
    radius,
  }));
};
