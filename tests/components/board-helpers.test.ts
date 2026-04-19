import { describe, expect, it } from 'vitest';

import {
  findFrameIndexAtPoint,
  frameContainsPoint,
  getDestinationBinLockItem,
  getVariantGlyphSpec,
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

  it('provides a distinct non-empty glyph spec for every placeholder variant', () => {
    const glyphItems: ReadonlyArray<Item> = [
      makeItem('medical-syringe', 'medical', 'syringe' as ItemVariant<'medical'>),
      makeItem('medical-vial', 'medical', 'vial' as ItemVariant<'medical'>),
      makeItem('medical-bandage', 'medical', 'bandage' as ItemVariant<'medical'>),
      makeItem('industrial-gear', 'industrial', 'gear' as ItemVariant<'industrial'>),
      makeItem('industrial-valve', 'industrial', 'valve' as ItemVariant<'industrial'>),
      makeItem('industrial-bearing', 'industrial', 'bearing' as ItemVariant<'industrial'>),
      makeItem('harbor-crate', 'harbor', 'crate' as ItemVariant<'harbor'>),
      makeItem('harbor-barrel', 'harbor', 'barrel' as ItemVariant<'harbor'>),
      makeItem('harbor-net', 'harbor', 'net' as ItemVariant<'harbor'>),
      makeItem('restoration-clay', 'restoration', 'clay' as ItemVariant<'restoration'>),
      makeItem('restoration-canvas', 'restoration', 'canvas' as ItemVariant<'restoration'>),
      makeItem('restoration-frame', 'restoration', 'frame' as ItemVariant<'restoration'>),
      makeItem('produce-citrus', 'produce', 'citrus' as ItemVariant<'produce'>),
      makeItem('produce-green', 'produce', 'green' as ItemVariant<'produce'>),
      makeItem('produce-root', 'produce', 'root' as ItemVariant<'produce'>),
      makeItem('chemical-reagent', 'chemical', 'reagent' as ItemVariant<'chemical'>),
      makeItem('chemical-solvent', 'chemical', 'solvent' as ItemVariant<'chemical'>),
      makeItem('chemical-catalyst', 'chemical', 'catalyst' as ItemVariant<'chemical'>),
    ];

    const signatures = glyphItems.map((item) =>
      JSON.stringify(
        getVariantGlyphSpec(item, {
          centerX: 50,
          centerY: 50,
          size: 40,
        }),
      ),
    );

    expect(signatures.every((signature) => signature !== '[]')).toBe(true);
    expect(new Set(signatures).size).toBe(glyphItems.length);
  });
});
