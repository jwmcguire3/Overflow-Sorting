import { describe, expect, it } from 'vitest';

import { createItemId } from '../../src/engine/types';
import type {
  BoardState,
  DestinationBin,
  Item,
  ItemCategory,
  ItemId,
  ItemVariant,
  Move,
  MoveResult,
  SourceBin,
  StagingSlot,
} from '../../src/engine/types';

describe('engine types exports', () => {
  it('provides all declared exports as usable types and values', () => {
    const itemId: ItemId = createItemId('item-1');
    const category = 'medical' as const satisfies ItemCategory;
    const variant: ItemVariant<'medical'> = 'syringe' as ItemVariant<'medical'>;

    const item: Item = {
      id: itemId,
      category,
      variant,
      stability: 'stable',
      timer: null,
      paused: false,
    };

    const sourceBin: SourceBin = {
      id: 'source-1',
      layers: [[item]],
      isUnlocked: true,
    };

    const destinationBin: DestinationBin = {
      id: 'dest-1',
      accepts: category,
      contents: [item],
      completedGroups: 0,
      orderSensitive: false,
      requiredSequence: null,
    };

    const stagingSlot: StagingSlot = {
      index: 0,
      item,
    };

    const boardState: BoardState = {
      sourceBins: [sourceBin],
      destinationBins: [destinationBin],
      stagingSlots: [stagingSlot],
      stagingCapacity: 3,
      movesUsed: 0,
      moveBudget: null,
      status: 'playing',
    };

    const move: Move = {
      type: 'pull',
      sourceBinId: sourceBin.id,
      itemId,
    };

    const moveResult: MoveResult = {
      nextState: boardState,
      success: true,
      reason: null,
    };

    expect(createItemId).toBeDefined();
    expect(item).toBeDefined();
    expect(sourceBin).toBeDefined();
    expect(destinationBin).toBeDefined();
    expect(stagingSlot).toBeDefined();
    expect(boardState).toBeDefined();
    expect(move).toBeDefined();
    expect(moveResult).toBeDefined();
  });
});
