import { describe, expect, it } from 'vitest';

import { deriveCommitFeedback, derivePullFeedback } from '../../src/components/board-feedback';
import { createItemId, type BoardState, type Item, type ItemVariant } from '../../src/engine';

const makeMedicalItem = (id: string, variant: string): Item => ({
  id: createItemId(id),
  category: 'medical',
  variant: variant as ItemVariant<'medical'>,
  stability: 'stable',
  timer: null,
  paused: false,
});

const createBoardState = (overrides?: Partial<BoardState>): BoardState => ({
  sourceBins: [],
  destinationBins: [],
  stagingSlots: [],
  stagingCapacity: 3,
  history: [],
  movesUsed: 0,
  moveBudget: null,
  status: 'playing',
  ...overrides,
});

describe('board feedback helpers', () => {
  it('locates the staging slot filled by a successful pull', () => {
    const item = makeMedicalItem('med-1', 'syringe');
    const previousState = createBoardState({
      sourceBins: [
        {
          id: 'source-a',
          isUnlocked: true,
          layers: [[item]],
        },
      ],
      stagingSlots: [
        { index: 0, item: null },
        { index: 1, item: null },
      ],
    });
    const nextState = createBoardState({
      sourceBins: [
        {
          id: 'source-a',
          isUnlocked: true,
          layers: [],
        },
      ],
      stagingSlots: [
        { index: 0, item: null },
        { index: 1, item },
      ],
    });

    expect(
      derivePullFeedback(previousState, nextState, 'source-a', item.id),
    ).toEqual({
      item,
      sourceBinId: 'source-a',
      stagingIndex: 1,
    });
  });

  it('detects that a commit completed and cleared a group', () => {
    const first = makeMedicalItem('med-1', 'syringe');
    const second = makeMedicalItem('med-2', 'syringe');
    const third = makeMedicalItem('med-3', 'syringe');
    const previousState = createBoardState({
      stagingSlots: [{ index: 0, item: third }],
      destinationBins: [
        {
          id: 'dest-med',
          accepts: 'medical',
          contents: [first, second],
          completedGroups: 0,
          orderSensitive: false,
          requiredSequence: null,
        },
      ],
    });
    const nextState = createBoardState({
      stagingSlots: [{ index: 0, item: null }],
      destinationBins: [
        {
          id: 'dest-med',
          accepts: 'medical',
          contents: [],
          completedGroups: 1,
          orderSensitive: false,
          requiredSequence: null,
        },
      ],
    });

    expect(
      deriveCommitFeedback(previousState, nextState, 'dest-med', third.id),
    ).toEqual({
      item: third,
      stagingIndex: 0,
      destinationBinId: 'dest-med',
      previousContents: [first, second],
      nextContents: [],
      didCompleteGroup: true,
    });
  });
});
