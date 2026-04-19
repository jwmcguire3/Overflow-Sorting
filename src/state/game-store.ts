import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';

import {
  applyMove as applyEngineMove,
  createInitialBoard,
} from '../engine';
import type {
  BoardConfig,
  BoardState,
  DestinationBin,
  Move,
  MoveResult,
  SourceBin,
  StagingSlot,
} from '../engine';

type MoveInfo = {
  used: number;
  budget: number | null;
};

interface GameStore {
  readonly boardState: BoardState | null;
  loadBoard: (config: BoardConfig) => void;
  applyMove: (move: Move) => MoveResult;
  undo: () => MoveResult;
  reset: () => void;
}

const EMPTY_STAGING_SLOTS: ReadonlyArray<StagingSlot> = [];
const EMPTY_SOURCE_BINS: ReadonlyArray<SourceBin> = [];
const EMPTY_DESTINATION_BINS: ReadonlyArray<DestinationBin> = [];
const DEFAULT_MOVE_INFO: MoveInfo = {
  used: 0,
  budget: null,
};

export const useGameStore = create<GameStore>((set, get) => ({
  boardState: null,
  loadBoard: (config) => {
    set({
      boardState: createInitialBoard(config),
    });
  },
  applyMove: (move) => {
    const current = get().boardState;

    if (!current) {
      throw new Error('Cannot apply a move before loading a board.');
    }

    const result = applyEngineMove(current, move);

    if (result.success) {
      set({
        boardState: result.nextState,
      });
    }

    return result;
  },
  undo: () => get().applyMove({ type: 'undo' }),
  reset: () => {
    set({
      boardState: null,
    });
  },
}));

export const useStagingSlots = (): ReadonlyArray<StagingSlot> =>
  useGameStore(
    useShallow((state) => state.boardState?.stagingSlots ?? EMPTY_STAGING_SLOTS),
  );

export const useSourceBins = (): ReadonlyArray<SourceBin> =>
  useGameStore(
    useShallow((state) => state.boardState?.sourceBins ?? EMPTY_SOURCE_BINS),
  );

export const useDestinationBins = (): ReadonlyArray<DestinationBin> =>
  useGameStore(
    useShallow(
      (state) => state.boardState?.destinationBins ?? EMPTY_DESTINATION_BINS,
    ),
  );

export const useMoveInfo = (): MoveInfo =>
  useGameStore(
    useShallow((state) =>
      state.boardState
        ? {
            used: state.boardState.movesUsed,
            budget: state.boardState.moveBudget,
          }
        : DEFAULT_MOVE_INFO,
    ),
  );

export const useGameStatus = (): BoardState['status'] =>
  useGameStore((state) => state.boardState?.status ?? 'playing');
