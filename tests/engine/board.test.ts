import { describe, expect, it } from 'vitest';

import {
  applyMove,
  checkStuckState,
  checkWinCondition,
  commitItem,
  createInitialBoard,
  createItemId,
  pullItem,
} from '../../src/engine';
import type {
  BoardConfig,
  BoardState,
  DestinationBin,
  Item,
  ItemCategory,
  ItemVariant,
  SourceBin,
  StagingSlot,
} from '../../src/engine';

const makeItem = <TCategory extends ItemCategory>(
  id: string,
  category: TCategory,
  variant: ItemVariant<TCategory>,
): Item => ({
  id: createItemId(id),
  category,
  variant,
  stability: 'stable',
  timer: null,
  paused: false,
});

const makeSourceBin = (id: string, layers: ReadonlyArray<ReadonlyArray<Item>>): SourceBin => ({
  id,
  layers,
  isUnlocked: true,
});

const makeDestinationBin = (
  id: string,
  accepts: ItemCategory,
  contents: ReadonlyArray<Item> = [],
  completedGroups = 0,
): DestinationBin => ({
  id,
  accepts,
  contents,
  completedGroups,
  orderSensitive: false,
  requiredSequence: null,
});

const makeStagingSlots = (items: Array<Item | null>): ReadonlyArray<StagingSlot> =>
  items.map((item, index) => ({ index, item }));

const makeBoardState = (overrides: Partial<BoardState> = {}): BoardState => ({
  sourceBins: [],
  destinationBins: [],
  stagingSlots: makeStagingSlots([]),
  stagingCapacity: 0,
  movesUsed: 0,
  moveBudget: null,
  status: 'playing',
  ...overrides,
});

describe('engine board mechanics', () => {
  it('createInitialBoard produces the expected initial state', () => {
    const med1 = makeItem('med-1', 'medical', 'syringe' as ItemVariant<'medical'>);
    const config: BoardConfig = {
      stagingCapacity: 2,
      sourceBins: [{ id: 'source-a', layers: [[med1]] }],
      destinationBins: [{ id: 'dest-a', accepts: 'medical' }],
      moveBudget: 5,
    };

    const result = createInitialBoard(config);

    expect(result.status).toBe('playing');
    expect(result.movesUsed).toBe(0);
    expect(result.stagingSlots).toEqual(makeStagingSlots([null, null]));
    expect(result.sourceBins[0]?.layers[0]?.[0]?.id).toBe(med1.id);
    expect(result.destinationBins[0]?.contents).toEqual([]);
    expect(result.destinationBins[0]?.completedGroups).toBe(0);
  });

  it('pulling from an empty source bin is rejected', () => {
    const state = makeBoardState({
      sourceBins: [makeSourceBin('source-a', [])],
      stagingSlots: makeStagingSlots([null]),
      stagingCapacity: 1,
    });

    const result = pullItem(state, 'source-a', createItemId('missing'));

    expect(result.success).toBe(false);
    expect(result.reason).toBe('source bin is empty');
    expect(result.nextState).toBe(state);
  });

  it('pulling non-top-layer item is rejected', () => {
    const top = makeItem('top', 'medical', 'syringe' as ItemVariant<'medical'>);
    const buried = makeItem('buried', 'medical', 'vial' as ItemVariant<'medical'>);
    const state = makeBoardState({
      sourceBins: [makeSourceBin('source-a', [[top], [buried]])],
      stagingSlots: makeStagingSlots([null]),
      stagingCapacity: 1,
    });

    const result = pullItem(state, 'source-a', buried.id);

    expect(result.success).toBe(false);
    expect(result.reason).toBe('item is not in the top layer');
    expect(result.nextState).toBe(state);
  });

  it('pulling when staging is full is rejected', () => {
    const med1 = makeItem('med-1', 'medical', 'syringe' as ItemVariant<'medical'>);
    const med2 = makeItem('med-2', 'medical', 'vial' as ItemVariant<'medical'>);
    const state = makeBoardState({
      sourceBins: [makeSourceBin('source-a', [[med1]])],
      stagingSlots: makeStagingSlots([med2]),
      stagingCapacity: 1,
    });

    const result = pullItem(state, 'source-a', med1.id);

    expect(result.success).toBe(false);
    expect(result.reason).toBe('staging full');
    expect(result.nextState).toBe(state);
  });

  it('pulling reveals next layer when top layer is depleted', () => {
    const top = makeItem('top', 'medical', 'syringe' as ItemVariant<'medical'>);
    const next = makeItem('next', 'medical', 'vial' as ItemVariant<'medical'>);
    const state = makeBoardState({
      sourceBins: [makeSourceBin('source-a', [[top], [next]])],
      stagingSlots: makeStagingSlots([null]),
      stagingCapacity: 1,
    });

    const result = pullItem(state, 'source-a', top.id);

    expect(result.success).toBe(true);
    expect(result.nextState.sourceBins[0]?.layers).toEqual([[next]]);
    expect(result.nextState.stagingSlots[0]?.item?.id).toBe(top.id);
    expect(result.nextState.movesUsed).toBe(1);
  });

  it('pulling final item leaves source bin with empty layers', () => {
    const top = makeItem('top', 'medical', 'syringe' as ItemVariant<'medical'>);
    const state = makeBoardState({
      sourceBins: [makeSourceBin('source-a', [[top]])],
      stagingSlots: makeStagingSlots([null]),
      stagingCapacity: 1,
    });

    const result = pullItem(state, 'source-a', top.id);

    expect(result.success).toBe(true);
    expect(result.nextState.sourceBins[0]?.layers).toEqual([]);
  });

  it('committing item not in staging is rejected', () => {
    const medicalBin = makeDestinationBin('dest-med', 'medical');
    const state = makeBoardState({
      destinationBins: [medicalBin],
      stagingSlots: makeStagingSlots([null]),
      stagingCapacity: 1,
    });

    const result = commitItem(state, createItemId('missing'), 'dest-med');

    expect(result.success).toBe(false);
    expect(result.reason).toBe('item is not in staging');
    expect(result.nextState).toBe(state);
  });

  it('committing to a wrong-category bin is rejected', () => {
    const medicalItem = makeItem('med-1', 'medical', 'syringe' as ItemVariant<'medical'>);
    const industrialBin = makeDestinationBin('dest-industrial', 'industrial');
    const state = makeBoardState({
      destinationBins: [industrialBin],
      stagingSlots: makeStagingSlots([medicalItem]),
      stagingCapacity: 1,
    });

    const result = commitItem(state, medicalItem.id, 'dest-industrial');

    expect(result.success).toBe(false);
    expect(result.reason).toBe('wrong category');
    expect(result.nextState).toBe(state);
  });

  it('committing 3 matching items completes a group', () => {
    const first = makeItem('med-1', 'medical', 'syringe' as ItemVariant<'medical'>);
    const second = makeItem('med-2', 'medical', 'syringe' as ItemVariant<'medical'>);
    const third = makeItem('med-3', 'medical', 'syringe' as ItemVariant<'medical'>);

    const state = makeBoardState({
      destinationBins: [makeDestinationBin('dest-med', 'medical', [first, second])],
      stagingSlots: makeStagingSlots([third]),
      stagingCapacity: 1,
    });

    const result = commitItem(state, third.id, 'dest-med');

    expect(result.success).toBe(true);
    expect(result.nextState.destinationBins[0]?.contents).toEqual([]);
    expect(result.nextState.destinationBins[0]?.completedGroups).toBe(1);
    expect(result.nextState.stagingSlots[0]?.item).toBeNull();
  });

  it('committing a third mismatched variant is rejected and state unchanged', () => {
    const first = makeItem('med-1', 'medical', 'syringe' as ItemVariant<'medical'>);
    const second = makeItem('med-2', 'medical', 'syringe' as ItemVariant<'medical'>);
    const third = makeItem('med-3', 'medical', 'vial' as ItemVariant<'medical'>);

    const state = makeBoardState({
      destinationBins: [makeDestinationBin('dest-med', 'medical', [first, second])],
      stagingSlots: makeStagingSlots([third]),
      stagingCapacity: 1,
    });

    const result = commitItem(state, third.id, 'dest-med');

    expect(result.success).toBe(false);
    expect(result.reason).toBe('variants do not match');
    expect(result.nextState).toBe(state);
  });

  it('checkWinCondition is true when all sources and staging are empty and no partial groups remain', () => {
    const state = makeBoardState({
      sourceBins: [makeSourceBin('source-a', [])],
      destinationBins: [makeDestinationBin('dest-med', 'medical', [], 2)],
      stagingSlots: makeStagingSlots([null]),
      stagingCapacity: 1,
    });

    expect(checkWinCondition(state)).toBe(true);
  });

  it('commit sets status to won when win condition is met', () => {
    const item = makeItem('med-1', 'medical', 'syringe' as ItemVariant<'medical'>);
    const state = makeBoardState({
      sourceBins: [makeSourceBin('source-a', [])],
      destinationBins: [makeDestinationBin('dest-med', 'medical', [])],
      stagingSlots: makeStagingSlots([item]),
      stagingCapacity: 1,
    });

    const result = commitItem(state, item.id, 'dest-med');

    expect(result.success).toBe(true);
    expect(result.nextState.status).toBe('won');
  });

  it('checkStuckState returns true when staging is full and no legal commits exist', () => {
    const medA = makeItem('med-a', 'medical', 'vial' as ItemVariant<'medical'>);
    const medB = makeItem('med-b', 'medical', 'syringe' as ItemVariant<'medical'>);
    const state = makeBoardState({
      destinationBins: [
        makeDestinationBin('dest-med', 'medical', [
          makeItem('med-1', 'medical', 'syringe' as ItemVariant<'medical'>),
          makeItem('med-2', 'medical', 'syringe' as ItemVariant<'medical'>),
        ]),
      ],
      stagingSlots: makeStagingSlots([medA, medB]),
      stagingCapacity: 2,
    });

    expect(checkStuckState(state)).toBe(true);
  });

  it('checkStuckState returns false when at least one legal commit exists', () => {
    const med = makeItem('med-a', 'medical', 'syringe' as ItemVariant<'medical'>);
    const industrial = makeItem(
      'ind-a',
      'industrial',
      'gear' as ItemVariant<'industrial'>,
    );
    const state = makeBoardState({
      destinationBins: [
        makeDestinationBin('dest-med', 'medical', [
          makeItem('med-1', 'medical', 'syringe' as ItemVariant<'medical'>),
        ]),
        makeDestinationBin('dest-industrial', 'industrial', [
          makeItem('ind-1', 'industrial', 'gear' as ItemVariant<'industrial'>),
        ]),
      ],
      stagingSlots: makeStagingSlots([med, industrial]),
      stagingCapacity: 2,
    });

    expect(checkStuckState(state)).toBe(false);
  });

  it('applyMove dispatches pull and commit, and undo is not implemented', () => {
    const item = makeItem('med-a', 'medical', 'syringe' as ItemVariant<'medical'>);
    const pullState = makeBoardState({
      sourceBins: [makeSourceBin('source-a', [[item]])],
      stagingSlots: makeStagingSlots([null]),
      stagingCapacity: 1,
    });

    const pulled = applyMove(pullState, {
      type: 'pull',
      sourceBinId: 'source-a',
      itemId: item.id,
    });
    expect(pulled.success).toBe(true);

    const commitState = makeBoardState({
      sourceBins: [makeSourceBin('source-a', [])],
      destinationBins: [makeDestinationBin('dest-med', 'medical')],
      stagingSlots: makeStagingSlots([item]),
      stagingCapacity: 1,
    });
    const committed = applyMove(commitState, {
      type: 'commit',
      itemId: item.id,
      destBinId: 'dest-med',
    });
    expect(committed.success).toBe(true);

    const undone = applyMove(commitState, { type: 'undo' });
    expect(undone.success).toBe(false);
    expect(undone.reason).toBe('not implemented in phase 1');
  });

  it('move budget exceeding on pull sets status to lost', () => {
    const item = makeItem('med-a', 'medical', 'syringe' as ItemVariant<'medical'>);
    const state = makeBoardState({
      sourceBins: [makeSourceBin('source-a', [[item]])],
      stagingSlots: makeStagingSlots([null]),
      stagingCapacity: 1,
      movesUsed: 1,
      moveBudget: 1,
    });

    const result = pullItem(state, 'source-a', item.id);

    expect(result.success).toBe(true);
    expect(result.nextState.status).toBe('lost');
    expect(result.nextState.movesUsed).toBe(2);
  });

  it('move budget exceeding on commit sets status to lost', () => {
    const item = makeItem('med-a', 'medical', 'syringe' as ItemVariant<'medical'>);
    const state = makeBoardState({
      destinationBins: [makeDestinationBin('dest-med', 'medical')],
      stagingSlots: makeStagingSlots([item]),
      stagingCapacity: 1,
      movesUsed: 2,
      moveBudget: 2,
    });

    const result = commitItem(state, item.id, 'dest-med');

    expect(result.success).toBe(true);
    expect(result.nextState.status).toBe('lost');
    expect(result.nextState.movesUsed).toBe(3);
  });

  it('pull chooses the lowest-index empty staging slot', () => {
    const sourceItem = makeItem('med-a', 'medical', 'syringe' as ItemVariant<'medical'>);
    const occupied = makeItem('med-b', 'medical', 'vial' as ItemVariant<'medical'>);

    const state = makeBoardState({
      sourceBins: [makeSourceBin('source-a', [[sourceItem]])],
      stagingSlots: makeStagingSlots([occupied, null, null]),
      stagingCapacity: 3,
    });

    const result = pullItem(state, 'source-a', sourceItem.id);

    expect(result.success).toBe(true);
    expect(result.nextState.stagingSlots[0]?.item?.id).toBe(occupied.id);
    expect(result.nextState.stagingSlots[1]?.item?.id).toBe(sourceItem.id);
    expect(result.nextState.stagingSlots[2]?.item).toBeNull();
  });
});
