import { describe, expect, it } from 'vitest';

import {
  findFrameIndexAtPoint,
  frameContainsPoint,
  getDestinationBinLockItem,
  type Frame,
} from '../../src/components/board-helpers';
import { createItemId } from '../../src/engine';
import type { DestinationBin, Item, ItemCategory, ItemVariant } from '../../src/engine';

type ItemForCategory<TCategory extends ItemCategory> = Extract<
  Item,
  { category: TCategory }
>;

const makeItem = <TCategory extends ItemCategory>(
  id: string,
  category: TCategory,
  variant: ItemVariant<TCategory>,
): ItemForCategory<TCategory> => ({
  id: createItemId(id),
  category,
  variant,
  stability: 'stable',
  timer: null,
  paused: false,
} as ItemForCategory<TCategory>);

const makeDestinationBin = (
  contents: ReadonlyArray<Item>,
): DestinationBin => ({
  id: 'dest-med',
  accepts: 'medical',
  contents,
  completedGroups: 0,
  orderSensitive: false,
  requiredSequence: null,
});

describe('board helpers', () => {
  const frames: ReadonlyArray<Frame> = [
    { x: 10, y: 20, width: 100, height: 80 },
    { x: 130, y: 20, width: 100, height: 80 },
  ];

  it('frameContainsPoint includes frame edges', () => {
    expect(frameContainsPoint(frames[0] as Frame, { x: 10, y: 20 })).toBe(true);
    expect(frameContainsPoint(frames[0] as Frame, { x: 110, y: 100 })).toBe(true);
    expect(frameContainsPoint(frames[0] as Frame, { x: 111, y: 100 })).toBe(false);
  });

  it('findFrameIndexAtPoint returns the hovered frame index', () => {
    expect(findFrameIndexAtPoint(frames, { x: 45, y: 60 })).toBe(0);
    expect(findFrameIndexAtPoint(frames, { x: 175, y: 60 })).toBe(1);
    expect(findFrameIndexAtPoint(frames, { x: 260, y: 60 })).toBe(-1);
  });

  it('getDestinationBinLockItem infers the locked variant from the first partial item', () => {
    const first = makeItem('med-1', 'medical', 'syringe' as ItemVariant<'medical'>);
    const second = makeItem('med-2', 'medical', 'syringe' as ItemVariant<'medical'>);

    expect(getDestinationBinLockItem(makeDestinationBin([]))).toBeNull();
    expect(getDestinationBinLockItem(makeDestinationBin([first]))?.id).toBe(first.id);
    expect(getDestinationBinLockItem(makeDestinationBin([first, second]))?.id).toBe(first.id);
  });
});
