import type { BoardState, Item, ItemId } from '../engine';

export const FEEDBACK_TIMINGS = {
  pullTravelMs: 110,
  pullConfirmMs: 150,
  commitSnapMs: 105,
  commitConfirmMs: 180,
  completionHoldMs: 110,
  clearReleaseMs: 220,
  invalidRejectMs: 210,
} as const;

export type PullFeedback = {
  readonly item: Item;
  readonly sourceBinId: string;
  readonly stagingIndex: number;
};

export type CommitFeedback = {
  readonly item: Item;
  readonly stagingIndex: number;
  readonly destinationBinId: string;
  readonly previousContents: ReadonlyArray<Item>;
  readonly nextContents: ReadonlyArray<Item>;
  readonly didCompleteGroup: boolean;
};

const findStagingSlotIndexByItemId = (
  state: BoardState,
  itemId: ItemId,
): number =>
  state.stagingSlots.findIndex((slot) => slot.item?.id === itemId);

export const derivePullFeedback = (
  previousState: BoardState,
  nextState: BoardState,
  sourceBinId: string,
  itemId: ItemId,
): PullFeedback | null => {
  const sourceBin = previousState.sourceBins.find((bin) => bin.id === sourceBinId);
  const item =
    sourceBin?.layers.flat().find((candidate) => candidate.id === itemId) ?? null;

  if (!item) {
    return null;
  }

  const stagingIndex = findStagingSlotIndexByItemId(nextState, itemId);
  if (stagingIndex === -1) {
    return null;
  }

  return {
    item,
    sourceBinId,
    stagingIndex,
  };
};

export const deriveCommitFeedback = (
  previousState: BoardState,
  nextState: BoardState,
  destinationBinId: string,
  itemId: ItemId,
): CommitFeedback | null => {
  const stagingIndex = findStagingSlotIndexByItemId(previousState, itemId);
  if (stagingIndex === -1) {
    return null;
  }

  const item = previousState.stagingSlots[stagingIndex]?.item;
  if (!item) {
    return null;
  }

  const previousDestination =
    previousState.destinationBins.find((bin) => bin.id === destinationBinId) ?? null;
  const nextDestination =
    nextState.destinationBins.find((bin) => bin.id === destinationBinId) ?? null;

  if (!previousDestination || !nextDestination) {
    return null;
  }

  return {
    item,
    stagingIndex,
    destinationBinId,
    previousContents: previousDestination.contents,
    nextContents: nextDestination.contents,
    didCompleteGroup:
      nextDestination.completedGroups > previousDestination.completedGroups,
  };
};
