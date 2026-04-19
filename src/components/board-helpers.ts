import type {
  DestinationBin,
  Item,
  ItemCategory,
  SourceBin,
  StagingSlot,
} from '../engine';

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

export const getVariantLetter = (item: Item): string =>
  String(item.variant).charAt(0).toUpperCase();

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
