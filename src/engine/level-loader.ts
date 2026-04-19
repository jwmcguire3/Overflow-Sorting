import type { BoardConfig, Item, ItemVariant } from './types';
import { createItemId } from './types';
import { levelDefinitionSchema, type LevelDefinition } from './level-schema';

const formatLevelParseErrors = (issues: ReadonlyArray<{ path: PropertyKey[]; message: string }>) =>
  issues
    .map((issue) => {
      const path =
        issue.path.length > 0
          ? issue.path.map(String).join('.')
          : 'root';

      return `${path}: ${issue.message}`;
    })
    .join('; ');

const createGeneratedItemId = () => {
  const randomUUID = globalThis.crypto.randomUUID.bind(globalThis.crypto);

  return createItemId(randomUUID());
};

const createBoardItem = (
  definition: LevelDefinition['sourceBins'][number]['layers'][number][number],
): Item => {
  const stability = definition.stability ?? 'stable';

  return ({
    id: createGeneratedItemId(),
    category: definition.category,
    variant: definition.variant as unknown as ItemVariant,
    stability,
    timer: stability === 'stable' ? null : definition.timer ?? null,
    paused: false,
  }) as Item;
};

export const parseLevelJson = (raw: unknown): LevelDefinition => {
  const result = levelDefinitionSchema.safeParse(raw);

  if (!result.success) {
    throw new Error(
      `Invalid level definition: ${formatLevelParseErrors(result.error.issues)}`,
    );
  }

  return result.data;
};

export const loadLevel = (definition: LevelDefinition): BoardConfig => ({
  stagingCapacity: definition.stagingCapacity,
  moveBudget: definition.moveBudget,
  sourceBins: definition.sourceBins.map((sourceBin) => ({
    id: sourceBin.id,
    layers: sourceBin.layers.map((layer) => layer.map(createBoardItem)),
  })),
  destinationBins: definition.destinationBins.map((destinationBin) => ({
    id: destinationBin.id,
    accepts: destinationBin.accepts,
  })),
});
