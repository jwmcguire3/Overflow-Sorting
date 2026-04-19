import firstSortJson from './01-first-sort.json';
import twoVariantsJson from './02-two-variants.json';
import stagingPressureJson from './03-staging-pressure.json';

import { parseLevelJson, type LevelDefinition } from '../../engine';

export const LEVEL_JSON_DEFINITIONS = [
  firstSortJson,
  twoVariantsJson,
  stagingPressureJson,
] as const;

export const LEVEL_DEFINITIONS: ReadonlyArray<LevelDefinition> =
  LEVEL_JSON_DEFINITIONS.map((levelJson) => parseLevelJson(levelJson));

export const LEVEL_DEFINITIONS_BY_ID = LEVEL_DEFINITIONS.reduce<
  Readonly<Record<string, LevelDefinition>>
>(
  (levelsById, level) => ({
    ...levelsById,
    [level.id]: level,
  }),
  {},
);
