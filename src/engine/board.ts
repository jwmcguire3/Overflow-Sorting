import type {
  BoardConfig,
  BoardState,
  DestinationBin,
  Item,
  ItemId,
  Move,
  MoveResult,
  SourceBin,
  StagingSlot,
} from './types';

const MAX_HISTORY_ENTRIES = 20;

const createMoveResult = (
  nextState: BoardState,
  success: boolean,
  reason: string | null,
): MoveResult => ({
  nextState,
  success,
  reason,
});

const pushHistory = (history: ReadonlyArray<BoardState>, snapshot: BoardState) =>
  [...history, snapshot].slice(-MAX_HISTORY_ENTRIES);

const resolveBoardStatus = (state: BoardState): BoardState['status'] => {
  if (state.status === 'lost') {
    return 'lost';
  }

  if (checkWinCondition(state)) {
    return 'won';
  }

  return isHardStuck(state) ? 'stuck' : 'playing';
};

const incrementMovesAndApplyBudget = (
  state: BoardState,
  baseState: Omit<BoardState, 'movesUsed' | 'status'>,
): BoardState => {
  const movesUsed = state.movesUsed + 1;
  const budgetExceeded =
    state.moveBudget !== null && movesUsed > state.moveBudget;

  return {
    ...baseState,
    movesUsed,
    status: budgetExceeded ? 'lost' : 'playing',
  };
};

const hasMatchingVariants = (items: ReadonlyArray<Item>): boolean => {
  const [firstItem, ...remainingItems] = items;
  if (!firstItem) {
    return true;
  }

  return remainingItems.every((item) => item.variant === firstItem.variant);
};

export const canCommitItemToDestination = (
  item: Item,
  destinationBin: DestinationBin,
): boolean => {
  if (destinationBin.accepts !== item.category) {
    return false;
  }

  if (
    destinationBin.contents.length > 0 &&
    destinationBin.contents[0]?.variant !== item.variant
  ) {
    return false;
  }

  const prospectiveContents = [...destinationBin.contents, item];

  if (!hasMatchingVariants(prospectiveContents)) {
    return false;
  }

  return true;
};

export const createInitialBoard = (config: BoardConfig): BoardState => {
  const sourceBins: ReadonlyArray<SourceBin> = config.sourceBins.map((sourceBin) => ({
    id: sourceBin.id,
    layers: sourceBin.layers.map((layer) => [...layer]),
    isUnlocked: true,
  }));

  const destinationBins: ReadonlyArray<DestinationBin> =
    config.destinationBins.map((destinationBin) => ({
      id: destinationBin.id,
      accepts: destinationBin.accepts,
      contents: [],
      completedGroups: 0,
      orderSensitive: false,
      requiredSequence: null,
    }));

  const stagingSlots: ReadonlyArray<StagingSlot> = Array.from(
    { length: config.stagingCapacity },
    (_, index) => ({
      index,
      item: null,
    }),
  );

  return {
    sourceBins,
    destinationBins,
    stagingSlots,
    stagingCapacity: config.stagingCapacity,
    history: [],
    movesUsed: 0,
    moveBudget: config.moveBudget,
    status: 'playing',
  };
};

export const pullItem = (
  state: BoardState,
  sourceBinId: string,
  itemId: ItemId,
): MoveResult => {
  const sourceBinIndex = state.sourceBins.findIndex((bin) => bin.id === sourceBinId);

  if (sourceBinIndex === -1) {
    return createMoveResult(state, false, 'source bin not found');
  }

  const sourceBin = state.sourceBins[sourceBinIndex];
  if (!sourceBin) {
    return createMoveResult(state, false, 'source bin not found');
  }

  const topLayer = sourceBin.layers[0];

  if (!topLayer || topLayer.length === 0) {
    return createMoveResult(state, false, 'source bin is empty');
  }

  const itemIndex = topLayer.findIndex((item) => item.id === itemId);
  if (itemIndex === -1) {
    return createMoveResult(state, false, 'item is not in the top layer');
  }

  const stagingIndex = state.stagingSlots.findIndex((slot) => slot.item === null);
  if (stagingIndex === -1) {
    return createMoveResult(state, false, 'staging full');
  }

  const pulledItem = topLayer[itemIndex];
  if (!pulledItem) {
    return createMoveResult(state, false, 'item is not in the top layer');
  }

  const nextTopLayer = topLayer.filter((item) => item.id !== itemId);
  const nextLayers =
    nextTopLayer.length > 0
      ? [nextTopLayer, ...sourceBin.layers.slice(1)]
      : sourceBin.layers.slice(1);

  const nextSourceBins = state.sourceBins.map((bin, index) =>
    index === sourceBinIndex
      ? {
          ...bin,
          layers: nextLayers,
        }
      : bin,
  );

  const nextStagingSlots: ReadonlyArray<StagingSlot> = state.stagingSlots.map(
    (slot, index) =>
      index === stagingIndex
        ? {
            ...slot,
            item: pulledItem,
          }
        : slot,
  );

  const nextState = incrementMovesAndApplyBudget(state, {
    ...state,
    sourceBins: nextSourceBins,
    stagingSlots: nextStagingSlots,
    history: pushHistory(state.history, state),
  });

  return createMoveResult(nextState, true, null);
};

export const checkWinCondition = (state: BoardState): boolean => {
  const sourceBinsAreEmpty = state.sourceBins.every((sourceBin) =>
    sourceBin.layers.every((layer) => layer.length === 0),
  );

  const stagingIsEmpty = state.stagingSlots.every((slot) => slot.item === null);
  const destinationBinsContainNoPartialGroup = state.destinationBins.every(
    (destinationBin) => destinationBin.contents.length === 0,
  );

  return sourceBinsAreEmpty && stagingIsEmpty && destinationBinsContainNoPartialGroup;
};

export const commitItem = (
  state: BoardState,
  itemId: ItemId,
  destBinId: string,
): MoveResult => {
  const stagingIndex = state.stagingSlots.findIndex((slot) => slot.item?.id === itemId);
  if (stagingIndex === -1) {
    return createMoveResult(state, false, 'item is not in staging');
  }

  const stagingSlot = state.stagingSlots[stagingIndex];
  if (!stagingSlot) {
    return createMoveResult(state, false, 'item is not in staging');
  }

  const item = stagingSlot.item;
  if (!item) {
    return createMoveResult(state, false, 'item is not in staging');
  }

  const destinationBinIndex = state.destinationBins.findIndex(
    (bin) => bin.id === destBinId,
  );
  if (destinationBinIndex === -1) {
    return createMoveResult(state, false, 'destination bin not found');
  }

  const destinationBin = state.destinationBins[destinationBinIndex];
  if (!destinationBin) {
    return createMoveResult(state, false, 'destination bin not found');
  }

  if (destinationBin.accepts !== item.category) {
    return createMoveResult(state, false, 'wrong category');
  }

  const prospectiveContents = [...destinationBin.contents, item];
  if (!canCommitItemToDestination(item, destinationBin)) {
    return createMoveResult(state, false, 'variants do not match');
  }

  const nextDestinationBins = state.destinationBins.map((bin, index) => {
    if (index !== destinationBinIndex) {
      return bin;
    }

    if (prospectiveContents.length === 3) {
      return {
        ...bin,
        contents: [],
        completedGroups: bin.completedGroups + 1,
      };
    }

    return {
      ...bin,
      contents: prospectiveContents,
    };
  });

  const nextStagingSlots = state.stagingSlots.map((slot, index) =>
    index === stagingIndex
      ? {
          ...slot,
          item: null,
        }
      : slot,
  );

  const postMoveState = incrementMovesAndApplyBudget(state, {
    ...state,
    destinationBins: nextDestinationBins,
    stagingSlots: nextStagingSlots,
    history: pushHistory(state.history, state),
  });
  const nextState: BoardState = {
    ...postMoveState,
    status: resolveBoardStatus(postMoveState),
  };

  return createMoveResult(nextState, true, null);
};

export const undoMove = (state: BoardState): MoveResult => {
  const previousState = state.history[state.history.length - 1];

  if (!previousState) {
    return createMoveResult(state, false, 'nothing to undo');
  }

  const movesUsed = previousState.movesUsed + 1;
  const budgetExceeded =
    previousState.moveBudget !== null && movesUsed > previousState.moveBudget;
  const nextState: BoardState = {
    ...previousState,
    movesUsed,
    status:
      state.status === 'lost' || budgetExceeded ? 'lost' : previousState.status,
  };

  return createMoveResult(nextState, true, null);
};

export const checkStuckState = (state: BoardState): boolean => {
  if (state.stagingSlots.length === 0) {
    return false;
  }

  const allStagingFull = state.stagingSlots.every((slot) => slot.item !== null);
  if (!allStagingFull) {
    return false;
  }

  const hasAnyLegalCommit = state.stagingSlots.some((slot) => {
    const item = slot.item;
    if (!item) {
      return false;
    }

    return state.destinationBins.some((destinationBin) => {
      return canCommitItemToDestination(item, destinationBin);
    });
  });

  return !hasAnyLegalCommit;
};

export const isHardStuck = (state: BoardState): boolean => checkStuckState(state);

export const applyMove = (state: BoardState, move: Move): MoveResult => {
  const result =
    move.type === 'pull'
      ? pullItem(state, move.sourceBinId, move.itemId)
      : move.type === 'commit'
        ? commitItem(state, move.itemId, move.destBinId)
        : undoMove(state);

  if (!result.success || move.type === 'undo') {
    return result;
  }

  return {
    ...result,
    nextState: {
      ...result.nextState,
      status: resolveBoardStatus(result.nextState),
    },
  };
};
