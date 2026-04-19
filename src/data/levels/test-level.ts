import { createItemId } from '../../engine';
import type { BoardConfig, Item, ItemCategory, ItemVariant, Move } from '../../engine';

type ItemForCategory<TCategory extends ItemCategory> = Extract<
  Item,
  { category: TCategory }
>;

const makeItem = <TCategory extends ItemCategory>(
  id: string,
  category: TCategory,
  variant: ItemVariant<TCategory>,
): ItemForCategory<TCategory> =>
  ({
    id: createItemId(id),
    category,
    variant,
    stability: 'stable',
    timer: null,
    paused: false,
  }) as ItemForCategory<TCategory>;

const syringeA = makeItem(
  'med-syringe-1',
  'medical',
  'syringe' as ItemVariant<'medical'>,
);
const syringeB = makeItem(
  'med-syringe-2',
  'medical',
  'syringe' as ItemVariant<'medical'>,
);
const syringeC = makeItem(
  'med-syringe-3',
  'medical',
  'syringe' as ItemVariant<'medical'>,
);
const vialA = makeItem('med-vial-1', 'medical', 'vial' as ItemVariant<'medical'>);
const vialB = makeItem('med-vial-2', 'medical', 'vial' as ItemVariant<'medical'>);
const vialC = makeItem('med-vial-3', 'medical', 'vial' as ItemVariant<'medical'>);
const bandageA = makeItem(
  'med-bandage-1',
  'medical',
  'bandage' as ItemVariant<'medical'>,
);
const bandageB = makeItem(
  'med-bandage-2',
  'medical',
  'bandage' as ItemVariant<'medical'>,
);
const bandageC = makeItem(
  'med-bandage-3',
  'medical',
  'bandage' as ItemVariant<'medical'>,
);

export const TEST_LEVEL_CONFIG: BoardConfig = {
  stagingCapacity: 5,
  sourceBins: [
    {
      id: 'source-a',
      layers: [
        [syringeA, syringeB, syringeC],
        [vialA, vialB, vialC],
      ],
    },
    {
      id: 'source-b',
      layers: [[bandageA, bandageB, bandageC]],
    },
  ],
  destinationBins: [
    {
      id: 'dest-med-a',
      accepts: 'medical',
    },
    {
      id: 'dest-med-b',
      accepts: 'medical',
    },
  ],
  moveBudget: null,
};

export const TEST_LEVEL_WIN_SEQUENCE: ReadonlyArray<Move> = [
  {
    type: 'pull',
    sourceBinId: 'source-a',
    itemId: syringeA.id,
  },
  {
    type: 'pull',
    sourceBinId: 'source-a',
    itemId: syringeB.id,
  },
  {
    type: 'pull',
    sourceBinId: 'source-a',
    itemId: syringeC.id,
  },
  {
    type: 'commit',
    itemId: syringeA.id,
    destBinId: 'dest-med-a',
  },
  {
    type: 'commit',
    itemId: syringeB.id,
    destBinId: 'dest-med-a',
  },
  {
    type: 'commit',
    itemId: syringeC.id,
    destBinId: 'dest-med-a',
  },
  {
    type: 'pull',
    sourceBinId: 'source-a',
    itemId: vialA.id,
  },
  {
    type: 'pull',
    sourceBinId: 'source-a',
    itemId: vialB.id,
  },
  {
    type: 'pull',
    sourceBinId: 'source-a',
    itemId: vialC.id,
  },
  {
    type: 'commit',
    itemId: vialA.id,
    destBinId: 'dest-med-a',
  },
  {
    type: 'commit',
    itemId: vialB.id,
    destBinId: 'dest-med-a',
  },
  {
    type: 'commit',
    itemId: vialC.id,
    destBinId: 'dest-med-a',
  },
  {
    type: 'pull',
    sourceBinId: 'source-b',
    itemId: bandageA.id,
  },
  {
    type: 'pull',
    sourceBinId: 'source-b',
    itemId: bandageB.id,
  },
  {
    type: 'pull',
    sourceBinId: 'source-b',
    itemId: bandageC.id,
  },
  {
    type: 'commit',
    itemId: bandageA.id,
    destBinId: 'dest-med-a',
  },
  {
    type: 'commit',
    itemId: bandageB.id,
    destBinId: 'dest-med-a',
  },
  {
    type: 'commit',
    itemId: bandageC.id,
    destBinId: 'dest-med-a',
  },
];
