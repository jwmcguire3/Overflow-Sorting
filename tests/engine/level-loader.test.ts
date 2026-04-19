import { describe, expect, it } from 'vitest';

import {
  createInitialBoard,
  loadLevel,
  parseLevelJson,
  pullItem,
  type LevelDefinition,
} from '../../src/engine';
import {
  LEVEL_DEFINITIONS,
  LEVEL_JSON_DEFINITIONS,
} from '../../src/data/levels';

const makeLevel = (
  overrides: Partial<LevelDefinition> = {},
): LevelDefinition => ({
  id: 'test-level',
  chapter: 1,
  levelNumber: 1,
  stagingCapacity: 3,
  moveBudget: null,
  objective: 'clean-sort',
  sourceBins: [
    {
      id: 'source-a',
      layers: [
        [
          {
            category: 'medical',
            variant: 'syringe',
          },
        ],
      ],
    },
  ],
  destinationBins: [
    {
      id: 'dest-med-a',
      accepts: 'medical',
    },
  ],
  ...overrides,
});

describe('level loader', () => {
  it('valid level JSON loads successfully', () => {
    const parsedLevel = parseLevelJson(makeLevel());
    const boardConfig = loadLevel(parsedLevel);

    expect(parsedLevel.id).toBe('test-level');
    expect(boardConfig.sourceBins[0]?.layers[0]).toHaveLength(1);
    expect(boardConfig.destinationBins[0]?.accepts).toBe('medical');
  });

  it('invalid level JSON throws with a useful error', () => {
    expect(() =>
      parseLevelJson({
        id: 'broken-level',
        chapter: 1,
        levelNumber: 1,
        moveBudget: null,
        objective: 'clean-sort',
        sourceBins: [],
        destinationBins: [],
      }),
    ).toThrowError(/stagingCapacity/i);
  });

  it('stability defaults to stable when omitted', () => {
    const parsedLevel = parseLevelJson(makeLevel());

    expect(parsedLevel.sourceBins[0]?.layers[0]?.[0]?.stability).toBe('stable');
  });

  it('requires a timer when stability is unstable', () => {
    expect(() =>
      parseLevelJson(
        makeLevel({
          sourceBins: [
            {
              id: 'source-a',
              layers: [
                [
                  {
                    category: 'medical',
                    variant: 'syringe',
                    stability: 'unstable',
                  },
                ],
              ],
            },
          ],
        }),
      ),
    ).toThrowError(/timer/i);
  });

  it('parses each authored test level successfully', () => {
    const parsedLevels = LEVEL_JSON_DEFINITIONS.map((rawLevel) => parseLevelJson(rawLevel));

    expect(parsedLevels).toHaveLength(3);
    expect(parsedLevels.map((level) => level.id)).toEqual([
      '01-first-sort',
      '02-two-variants',
      '03-staging-pressure',
    ]);
  });

  it('produces a playable initial board state for each authored level', () => {
    LEVEL_DEFINITIONS.forEach((level) => {
      const boardConfig = loadLevel(level);
      const initialBoard = createInitialBoard(boardConfig);
      const firstSourceBin = initialBoard.sourceBins.find((sourceBin) => sourceBin.layers[0]);
      const firstItem = firstSourceBin?.layers[0]?.[0];

      expect(initialBoard.status).toBe('playing');
      expect(firstSourceBin).toBeDefined();
      expect(firstItem).toBeDefined();

      if (!firstSourceBin || !firstItem) {
        throw new Error(`Expected ${level.id} to expose at least one playable item.`);
      }

      const pullResult = pullItem(initialBoard, firstSourceBin.id, firstItem.id);

      expect(pullResult.success).toBe(true);
    });
  });
});
