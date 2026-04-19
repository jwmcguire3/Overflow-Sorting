import { describe, expect, it } from 'vitest';

import {
  applyMove,
  canCommitItemToDestination,
  checkStuckState,
  checkWinCondition,
  commitItem,
  createInitialBoard,
  createItemId,
  isHardStuck,
  pullItem,
  undoMove,
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
  history: [],
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
    expect(result.history).toEqual([]);
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
    expect(result.nextState.history).toEqual([state]);
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

  it('canCommitItemToDestination matches commit legality for category and variants', () => {
    const matching = makeItem('med-1', 'medical', 'syringe' as ItemVariant<'medical'>);
    const mismatched = makeItem('med-2', 'medical', 'vial' as ItemVariant<'medical'>);
    const acceptingBin = makeDestinationBin('dest-med', 'medical', [matching]);
    const wrongCategoryBin = makeDestinationBin('dest-industrial', 'industrial');

    expect(canCommitItemToDestination(matching, acceptingBin)).toBe(true);
    expect(canCommitItemToDestination(mismatched, acceptingBin)).toBe(false);
    expect(canCommitItemToDestination(matching, wrongCategoryBin)).toBe(false);
  });

  it('committing a second mismatched variant is rejected immediately and state unchanged', () => {
    const first = makeItem('med-1', 'medical', 'syringe' as ItemVariant<'medical'>);
    const second = makeItem('med-2', 'medical', 'vial' as ItemVariant<'medical'>);

    const state = makeBoardState({
      destinationBins: [makeDestinationBin('dest-med', 'medical', [first])],
      stagingSlots: makeStagingSlots([second]),
      stagingCapacity: 1,
    });

    const result = commitItem(state, second.id, 'dest-med');

    expect(result.success).toBe(false);
    expect(result.reason).toBe('variants do not match');
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

  it('after a completed group clears, the empty bin accepts a new variant', () => {
    const first = makeItem('med-1', 'medical', 'syringe' as ItemVariant<'medical'>);
    const second = makeItem('med-2', 'medical', 'syringe' as ItemVariant<'medical'>);
    const third = makeItem('med-3', 'medical', 'syringe' as ItemVariant<'medical'>);
    const nextVariant = makeItem('med-4', 'medical', 'vial' as ItemVariant<'medical'>);

    const clearingState = makeBoardState({
      destinationBins: [makeDestinationBin('dest-med', 'medical', [first, second])],
      stagingSlots: makeStagingSlots([third]),
      stagingCapacity: 1,
    });

    const cleared = commitItem(clearingState, third.id, 'dest-med');
    expect(cleared.success).toBe(true);
    expect(cleared.nextState.destinationBins[0]?.contents).toEqual([]);

    const nextState = makeBoardState({
      ...cleared.nextState,
      stagingSlots: makeStagingSlots([nextVariant]),
      history: [],
      movesUsed: 0,
      status: 'playing',
    });

    const nextCommit = commitItem(nextState, nextVariant.id, 'dest-med');

    expect(nextCommit.success).toBe(true);
    expect(nextCommit.nextState.destinationBins[0]?.contents).toEqual([nextVariant]);
    expect(nextCommit.nextState.destinationBins[0]?.completedGroups).toBe(1);
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

  it('commit keeps status playing when a partial destination group remains', () => {
    const item = makeItem('med-1', 'medical', 'syringe' as ItemVariant<'medical'>);
    const state = makeBoardState({
      sourceBins: [makeSourceBin('source-a', [])],
      destinationBins: [makeDestinationBin('dest-med', 'medical', [])],
      stagingSlots: makeStagingSlots([item]),
      stagingCapacity: 1,
    });

    const result = commitItem(state, item.id, 'dest-med');

    expect(result.success).toBe(true);
    expect(result.nextState.status).toBe('playing');
  });

  it('checkStuckState returns false when any staged item can still complete a group', () => {
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

    expect(checkStuckState(state)).toBe(false);
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

  it('isHardStuck returns true when staging is full and no legal commits remain', () => {
    const blockedMedical = makeItem(
      'med-blocked',
      'medical',
      'vial' as ItemVariant<'medical'>,
    );
    const blockedIndustrial = makeItem(
      'ind-blocked',
      'industrial',
      'gear' as ItemVariant<'industrial'>,
    );
    const state = makeBoardState({
      destinationBins: [
        makeDestinationBin('dest-med', 'medical', [
          makeItem('med-1', 'medical', 'syringe' as ItemVariant<'medical'>),
          makeItem('med-2', 'medical', 'syringe' as ItemVariant<'medical'>),
        ]),
      ],
      stagingSlots: makeStagingSlots([blockedMedical, blockedIndustrial]),
      stagingCapacity: 2,
    });

    expect(isHardStuck(state)).toBe(true);
  });

  it('applyMove dispatches pull, commit, and undo', () => {
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

    const undone = applyMove(
      makeBoardState({
        history: [commitState],
        movesUsed: 2,
      }),
      { type: 'undo' },
    );
    expect(undone.success).toBe(true);
    expect(undone.nextState.movesUsed).toBe(1);
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

  it('applyMove sets status to stuck when a successful move creates a hard-stuck board', () => {
    const blockedMedical = makeItem(
      'med-blocked',
      'medical',
      'vial' as ItemVariant<'medical'>,
    );
    const pulledIndustrial = makeItem(
      'ind-pulled',
      'industrial',
      'gear' as ItemVariant<'industrial'>,
    );
    const state = makeBoardState({
      sourceBins: [makeSourceBin('source-a', [[pulledIndustrial]])],
      destinationBins: [
        makeDestinationBin('dest-med', 'medical', [
          makeItem('med-1', 'medical', 'syringe' as ItemVariant<'medical'>),
          makeItem('med-2', 'medical', 'syringe' as ItemVariant<'medical'>),
        ]),
      ],
      stagingSlots: makeStagingSlots([blockedMedical, null]),
      stagingCapacity: 2,
    });

    const result = applyMove(state, {
      type: 'pull',
      sourceBinId: 'source-a',
      itemId: pulledIndustrial.id,
    });

    expect(result.success).toBe(true);
    expect(result.nextState.status).toBe('stuck');
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

  it('single undo restores the prior state and charges one move', () => {
    const item = makeItem('med-a', 'medical', 'syringe' as ItemVariant<'medical'>);
    const previousState = makeBoardState({
      sourceBins: [makeSourceBin('source-a', [[item]])],
      stagingSlots: makeStagingSlots([null]),
      stagingCapacity: 1,
      movesUsed: 0,
    });
    const currentState = makeBoardState({
      sourceBins: [makeSourceBin('source-a', [])],
      stagingSlots: makeStagingSlots([item]),
      stagingCapacity: 1,
      history: [previousState],
      movesUsed: 1,
    });

    const result = undoMove(currentState);

    expect(result.success).toBe(true);
    expect(result.nextState.sourceBins).toEqual(previousState.sourceBins);
    expect(result.nextState.stagingSlots).toEqual(previousState.stagingSlots);
    expect(result.nextState.movesUsed).toBe(1);
    expect(result.nextState.history).toEqual([]);
  });

  it('chained undos step backward through prior states', () => {
    const item = makeItem('med-a', 'medical', 'syringe' as ItemVariant<'medical'>);
    const initialState = makeBoardState({
      sourceBins: [makeSourceBin('source-a', [[item]])],
      stagingSlots: makeStagingSlots([null]),
      stagingCapacity: 1,
      movesUsed: 0,
    });
    const afterPull = makeBoardState({
      sourceBins: [makeSourceBin('source-a', [])],
      stagingSlots: makeStagingSlots([item]),
      stagingCapacity: 1,
      history: [initialState],
      movesUsed: 1,
    });
    const afterCommit = makeBoardState({
      sourceBins: [makeSourceBin('source-a', [])],
      destinationBins: [makeDestinationBin('dest-med', 'medical', [item])],
      stagingSlots: makeStagingSlots([null]),
      stagingCapacity: 1,
      history: [initialState, afterPull],
      movesUsed: 2,
    });

    const firstUndo = undoMove(afterCommit);
    const secondUndo = undoMove(firstUndo.nextState);

    expect(firstUndo.success).toBe(true);
    expect(firstUndo.nextState.stagingSlots[0]?.item?.id).toBe(item.id);
    expect(firstUndo.nextState.movesUsed).toBe(2);
    expect(secondUndo.success).toBe(true);
    expect(secondUndo.nextState.sourceBins[0]?.layers[0]?.[0]?.id).toBe(item.id);
    expect(secondUndo.nextState.movesUsed).toBe(1);
  });

  it('undo restores the prior partial destination lock state', () => {
    const first = makeItem('med-1', 'medical', 'syringe' as ItemVariant<'medical'>);
    const second = makeItem('med-2', 'medical', 'syringe' as ItemVariant<'medical'>);
    const previousState = makeBoardState({
      destinationBins: [makeDestinationBin('dest-med', 'medical', [first])],
      stagingSlots: makeStagingSlots([second]),
      stagingCapacity: 1,
      movesUsed: 1,
      status: 'playing',
    });
    const currentState = makeBoardState({
      destinationBins: [makeDestinationBin('dest-med', 'medical', [first, second])],
      stagingSlots: makeStagingSlots([null]),
      stagingCapacity: 1,
      history: [previousState],
      movesUsed: 2,
      status: 'playing',
    });

    const result = undoMove(currentState);

    expect(result.success).toBe(true);
    expect(result.nextState.destinationBins[0]?.contents).toEqual([first]);
    expect(result.nextState.stagingSlots[0]?.item?.id).toBe(second.id);
    expect(result.nextState.movesUsed).toBe(2);
  });

  it('undo with empty history fails', () => {
    const state = makeBoardState();

    const result = undoMove(state);

    expect(result.success).toBe(false);
    expect(result.reason).toBe('nothing to undo');
    expect(result.nextState).toBe(state);
  });

  it('undo increments the restored move count', () => {
    const previousState = makeBoardState({
      movesUsed: 4,
    });
    const currentState = makeBoardState({
      history: [previousState],
      movesUsed: 7,
    });

    const result = undoMove(currentState);

    expect(result.success).toBe(true);
    expect(result.nextState.movesUsed).toBe(5);
  });

  it('undo on a lost state stays lost', () => {
    const previousState = makeBoardState({
      movesUsed: 0,
      moveBudget: 5,
      status: 'playing',
    });
    const currentState = makeBoardState({
      history: [previousState],
      movesUsed: 6,
      moveBudget: 5,
      status: 'lost',
    });

    const result = undoMove(currentState);

    expect(result.success).toBe(true);
    expect(result.nextState.movesUsed).toBe(1);
    expect(result.nextState.status).toBe('lost');
  });

  it('undo from stuck returns the board to playing', () => {
    const blockedMedical = makeItem(
      'med-blocked',
      'medical',
      'vial' as ItemVariant<'medical'>,
    );
    const previousState = makeBoardState({
      sourceBins: [
        makeSourceBin('source-a', [
          [makeItem('ind-pulled', 'industrial', 'gear' as ItemVariant<'industrial'>)],
        ]),
      ],
      destinationBins: [
        makeDestinationBin('dest-med', 'medical', [
          makeItem('med-1', 'medical', 'syringe' as ItemVariant<'medical'>),
          makeItem('med-2', 'medical', 'syringe' as ItemVariant<'medical'>),
        ]),
      ],
      stagingSlots: makeStagingSlots([blockedMedical, null]),
      stagingCapacity: 2,
      movesUsed: 0,
      status: 'playing',
    });
    const currentState = makeBoardState({
      sourceBins: [makeSourceBin('source-a', [])],
      destinationBins: previousState.destinationBins,
      stagingSlots: makeStagingSlots([
        blockedMedical,
        makeItem('ind-pulled', 'industrial', 'gear' as ItemVariant<'industrial'>),
      ]),
      stagingCapacity: 2,
      history: [previousState],
      movesUsed: 1,
      status: 'stuck',
    });

    const result = undoMove(currentState);

    expect(result.success).toBe(true);
    expect(result.nextState.status).toBe('playing');
    expect(result.nextState.stagingSlots[1]?.item).toBeNull();
  });

  it('successful moves cap history at 20 entries', () => {
    const item = makeItem('med-a', 'medical', 'syringe' as ItemVariant<'medical'>);
    const history = Array.from({ length: 20 }, (_, index) =>
      makeBoardState({
        movesUsed: index,
      }),
    );
    const oldestRetained = history[1];
    const newestRetained = history[19];
    const state = makeBoardState({
      sourceBins: [makeSourceBin('source-a', [[item]])],
      stagingSlots: makeStagingSlots([null]),
      stagingCapacity: 1,
      history,
      movesUsed: 20,
    });

    const result = pullItem(state, 'source-a', item.id);

    expect(result.success).toBe(true);
    expect(result.nextState.history).toHaveLength(20);
    expect(result.nextState.history[0]).toBe(oldestRetained);
    expect(result.nextState.history[19]).toBe(state);
    expect(result.nextState.history).not.toContain(history[0]);
    expect(result.nextState.history).toContain(newestRetained);
  });
});
