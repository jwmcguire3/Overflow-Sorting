export type ItemCategory =
  | 'medical'
  | 'industrial'
  | 'harbor'
  | 'restoration'
  | 'produce'
  | 'chemical';

type Brand<T, TBrand extends string> = T & {
  readonly __brand: TBrand;
};

type ItemVariantMap = {
  readonly medical: 'syringe' | 'vial' | 'bandage';
  readonly industrial: 'gear' | 'valve' | 'bearing';
  readonly harbor: 'crate' | 'barrel' | 'net';
  readonly restoration: 'clay' | 'canvas' | 'frame';
  readonly produce: 'citrus' | 'green' | 'root';
  readonly chemical: 'reagent' | 'solvent' | 'catalyst';
};

export type ItemVariant<TCategory extends ItemCategory = ItemCategory> = Brand<
  ItemVariantMap[TCategory],
  'ItemVariant'
>;

export type ItemId = Brand<string, 'ItemId'>;

type StableItemState = {
  readonly stability: 'stable' | 'contaminated';
  readonly timer: null;
};

type VolatileItemState = {
  readonly stability: 'unstable' | 'volatile';
  readonly timer: number;
};

type ItemState = StableItemState | VolatileItemState;

type ItemByCategory<TCategory extends ItemCategory> = {
  readonly id: ItemId;
  readonly category: TCategory;
  readonly variant: ItemVariant<TCategory>;
  readonly paused: boolean;
} & ItemState;

export type Item = {
  readonly [TCategory in ItemCategory]: ItemByCategory<TCategory>;
}[ItemCategory];

export interface SourceBin {
  readonly id: string;
  readonly layers: ReadonlyArray<ReadonlyArray<Item>>;
  readonly isUnlocked: boolean;
}

export interface DestinationBin {
  readonly id: string;
  readonly accepts: ItemCategory;
  readonly contents: ReadonlyArray<Item>;
  readonly completedGroups: number;
  readonly orderSensitive: boolean;
  readonly requiredSequence: ReadonlyArray<string> | null;
}

export interface StagingSlot {
  readonly index: number;
  readonly item: Item | null;
}

export interface BoardState {
  readonly sourceBins: ReadonlyArray<SourceBin>;
  readonly destinationBins: ReadonlyArray<DestinationBin>;
  readonly stagingSlots: ReadonlyArray<StagingSlot>;
  readonly stagingCapacity: number;
  readonly movesUsed: number;
  readonly moveBudget: number | null;
  readonly status: 'playing' | 'won' | 'lost' | 'stuck';
}

export type Move =
  | {
      readonly type: 'pull';
      readonly sourceBinId: string;
      readonly itemId: ItemId;
    }
  | {
      readonly type: 'commit';
      readonly itemId: ItemId;
      readonly destBinId: string;
    }
  | {
      readonly type: 'undo';
    };

export interface MoveResult {
  readonly nextState: BoardState;
  readonly success: boolean;
  readonly reason: string | null;
}

export const createItemId = (raw: string): ItemId => raw as ItemId;
