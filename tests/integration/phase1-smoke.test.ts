import { describe, expect, it } from 'vitest';

import {
  applyMove,
  createInitialBoard,
  loadLevel,
  type BoardState,
  type DestinationBin,
  type Item,
  type Move,
} from '../../src/engine';
import { LEVEL_DEFINITIONS } from '../../src/data/levels';

const EXPECTED_COMPLETED_GROUPS_BY_LEVEL_ID: Readonly<Record<string, number>> = {
  '01-first-sort': 1,
  '02-two-variants': 2,
  '03-staging-pressure': 2,
};

const getItemSignature = (item: Item): string => `${item.category}:${item.variant}`;

const getDestinationSignature = (destinationBin: DestinationBin): string =>
  JSON.stringify({
    accepts: destinationBin.accepts,
    contents: destinationBin.contents.map(getItemSignature).sort(),
    completedGroups: destinationBin.completedGroups,
  });

const serializeBoardState = (state: BoardState): string =>
  JSON.stringify({
    sourceBins: state.sourceBins.map((sourceBin) =>
      sourceBin.layers.map((layer) => layer.map(getItemSignature).sort()),
    ),
    destinationBins: state.destinationBins
      .map(getDestinationSignature)
      .sort(),
    stagingSlots: state.stagingSlots
      .map((slot) => (slot.item ? getItemSignature(slot.item) : null))
      .sort(),
    movesUsed: state.movesUsed,
    status: state.status,
  });

const getLegalMoves = (state: BoardState): ReadonlyArray<Move> => {
  const moves: Move[] = [];
  const seenPulls = new Set<string>();
  const seenCommits = new Set<string>();

  if (state.stagingSlots.some((slot) => slot.item === null)) {
    state.sourceBins.forEach((sourceBin) => {
      const topLayer = sourceBin.layers[0] ?? [];

      topLayer.forEach((item) => {
        const pullKey = `${sourceBin.id}:${getItemSignature(item)}`;
        if (seenPulls.has(pullKey)) {
          return;
        }

        seenPulls.add(pullKey);
        moves.push({
          type: 'pull',
          sourceBinId: sourceBin.id,
          itemId: item.id,
        });
      });
    });
  }

  state.stagingSlots.forEach((slot) => {
    const item = slot.item;
    if (!item) {
      return;
    }

    state.destinationBins.forEach((destinationBin) => {
      const commitKey = `${getItemSignature(item)}:${getDestinationSignature(destinationBin)}`;
      if (seenCommits.has(commitKey)) {
        return;
      }

      seenCommits.add(commitKey);
      moves.push({
        type: 'commit',
        itemId: item.id,
        destBinId: destinationBin.id,
      });
    });
  });

  return moves.sort((left, right) => {
    if (left.type !== right.type) {
      return left.type === 'commit' ? -1 : 1;
    }

    return 0;
  });
};

const solveBoard = (initialState: BoardState): ReadonlyArray<Move> => {
  const queue: Array<{ state: BoardState; moves: ReadonlyArray<Move> }> = [
    { state: initialState, moves: [] },
  ];
  const visited = new Set<string>([serializeBoardState(initialState)]);

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) {
      break;
    }

    if (current.state.status === 'won') {
      return current.moves;
    }

    getLegalMoves(current.state).forEach((move) => {
      const result = applyMove(current.state, move);
      if (!result.success) {
        return;
      }

      const serializedState = serializeBoardState(result.nextState);
      if (visited.has(serializedState)) {
        return;
      }

      visited.add(serializedState);
      queue.push({
        state: result.nextState,
        moves: [...current.moves, move],
      });
    });
  }

  throw new Error('Expected test level to have a valid solution.');
};

describe('phase 1 smoke', () => {
  it.each(LEVEL_DEFINITIONS)(
    'plays %s to completion with a computed valid move sequence',
    (level) => {
      const boardConfig = loadLevel(level);
      const initialState = createInitialBoard(boardConfig);
      const solution = solveBoard(initialState);

      const finalState = solution.reduce((state, move) => {
        const result = applyMove(state, move);

        expect(result.success).toBe(true);

        return result.nextState;
      }, initialState);

      const totalCompletedGroups = finalState.destinationBins.reduce(
        (sum, destinationBin) => sum + destinationBin.completedGroups,
        0,
      );

      expect(finalState.status).toBe('won');
      expect(totalCompletedGroups).toBe(
        EXPECTED_COMPLETED_GROUPS_BY_LEVEL_ID[level.id],
      );
    },
  );

  it('recovers from bad opening moves on level 1 by using undo and still wins', () => {
    const firstLevel = LEVEL_DEFINITIONS.find((level) => level.id === '01-first-sort');

    if (!firstLevel) {
      throw new Error('Expected level 01-first-sort to exist.');
    }

    const boardConfig = loadLevel(firstLevel);
    const initialState = createInitialBoard(boardConfig);
    const openingItems = initialState.sourceBins[0]?.layers[0] ?? [];

    if (openingItems.length !== 3) {
      throw new Error('Expected level 1 to open with exactly 3 items.');
    }

    const scrambledState = openingItems.reduce((state, item) => {
      const result = applyMove(state, {
        type: 'pull',
        sourceBinId: 'source-a',
        itemId: item.id,
      });

      expect(result.success).toBe(true);

      return result.nextState;
    }, initialState);

    const afterUndo = openingItems.reduce((state) => {
      const result = applyMove(state, { type: 'undo' });

      expect(result.success).toBe(true);

      return result.nextState;
    }, scrambledState);

    expect(afterUndo.status).toBe('playing');
    expect(afterUndo.sourceBins[0]?.layers[0]).toHaveLength(3);
    expect(afterUndo.stagingSlots.every((slot) => slot.item === null)).toBe(true);

    const recoveredSolution = solveBoard(afterUndo);
    const finalState = recoveredSolution.reduce((state, move) => {
      const result = applyMove(state, move);

      expect(result.success).toBe(true);

      return result.nextState;
    }, afterUndo);

    expect(finalState.status).toBe('won');
  });
});
