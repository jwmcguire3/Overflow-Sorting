import { beforeEach, describe, expect, it } from 'vitest';

import { createItemId } from '../../src/engine';
import type { BoardConfig, Item, ItemCategory, ItemVariant, Move } from '../../src/engine';
import {
  useDestinationBins,
  useGameStatus,
  useGameStore,
  useMoveInfo,
  useSourceBins,
  useStagingSlots,
} from '../../src/state';
import { renderHook } from '../support/render-hook';

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

const makeConfig = (): BoardConfig => {
  const sourceItem = makeItem(
    'med-1',
    'medical',
    'syringe' as ItemVariant<'medical'>,
  );

  return {
    stagingCapacity: 2,
    sourceBins: [
      {
        id: 'source-a',
        layers: [[sourceItem]],
      },
    ],
    destinationBins: [
      {
        id: 'dest-med',
        accepts: 'medical',
      },
    ],
    moveBudget: 4,
  };
};

beforeEach(() => {
  useGameStore.setState({ boardState: null });
});

describe('game store', () => {
  it('loading a board sets state correctly', () => {
    const config = makeConfig();

    useGameStore.getState().loadBoard(config);

    const boardState = useGameStore.getState().boardState;

    expect(boardState).not.toBeNull();
    expect(boardState?.stagingCapacity).toBe(config.stagingCapacity);
    expect(boardState?.sourceBins).toHaveLength(1);
    expect(boardState?.destinationBins).toHaveLength(1);
    expect(boardState?.movesUsed).toBe(0);
  });

  it('applying a successful move updates state', () => {
    const config = makeConfig();
    useGameStore.getState().loadBoard(config);

    const itemId = config.sourceBins[0]?.layers[0]?.[0]?.id;
    expect(itemId).toBeDefined();
    if (!itemId) {
      throw new Error('Expected a source item in the test config.');
    }

    const move: Move = {
      type: 'pull',
      sourceBinId: 'source-a',
      itemId,
    };

    const result = useGameStore.getState().applyMove(move);
    const boardState = useGameStore.getState().boardState;

    expect(result.success).toBe(true);
    expect(boardState?.sourceBins[0]?.layers).toEqual([]);
    expect(boardState?.stagingSlots[0]?.item?.id).toBe(itemId);
    expect(boardState?.history).toHaveLength(1);
    expect(boardState?.movesUsed).toBe(1);
  });

  it('undo restores the previous board state through the store action', () => {
    const config = makeConfig();
    useGameStore.getState().loadBoard(config);

    const itemId = config.sourceBins[0]?.layers[0]?.[0]?.id;
    expect(itemId).toBeDefined();
    if (!itemId) {
      throw new Error('Expected a source item in the test config.');
    }

    useGameStore.getState().applyMove({
      type: 'pull',
      sourceBinId: 'source-a',
      itemId,
    });

    const result = useGameStore.getState().undo();
    const boardState = useGameStore.getState().boardState;

    expect(result.success).toBe(true);
    expect(boardState?.sourceBins[0]?.layers[0]?.[0]?.id).toBe(itemId);
    expect(boardState?.stagingSlots[0]?.item).toBeNull();
    expect(boardState?.movesUsed).toBe(1);
    expect(boardState?.history).toEqual([]);
  });

  it('applying a rejected move leaves state unchanged', () => {
    const config = makeConfig();
    useGameStore.getState().loadBoard(config);

    const initialState = useGameStore.getState().boardState;
    const missingMove: Move = {
      type: 'pull',
      sourceBinId: 'source-a',
      itemId: createItemId('missing'),
    };

    const result = useGameStore.getState().applyMove(missingMove);
    const boardState = useGameStore.getState().boardState;

    expect(result.success).toBe(false);
    expect(result.reason).toBe('item is not in the top layer');
    expect(boardState).toBe(initialState);
  });

  it('reset clears state', () => {
    useGameStore.getState().loadBoard(makeConfig());

    useGameStore.getState().reset();

    expect(useGameStore.getState().boardState).toBeNull();
  });

  it('selector hooks return the expected slices', () => {
    const config = makeConfig();
    useGameStore.getState().loadBoard(config);

    const itemId = config.sourceBins[0]?.layers[0]?.[0]?.id;
    expect(itemId).toBeDefined();
    if (!itemId) {
      throw new Error('Expected a source item in the test config.');
    }

    useGameStore.getState().applyMove({
      type: 'pull',
      sourceBinId: 'source-a',
      itemId,
    });

    const { result: stagingResult } = renderHook(() => useStagingSlots());
    const { result: sourceResult } = renderHook(() => useSourceBins());
    const { result: destinationResult } = renderHook(() => useDestinationBins());
    const { result: moveInfoResult } = renderHook(() => useMoveInfo());
    const { result: statusResult } = renderHook(() => useGameStatus());

    expect(stagingResult.current).toHaveLength(2);
    expect(stagingResult.current[0]?.item?.id).toBe(itemId);
    expect(sourceResult.current[0]?.layers).toEqual([]);
    expect(destinationResult.current[0]?.id).toBe('dest-med');
    expect(moveInfoResult.current).toEqual({
      used: 1,
      budget: 4,
    });
    expect(statusResult.current).toBe('playing');
  });
});
