import { beforeEach, describe, expect, it } from 'vitest';

import { loadLevel } from '../../src/engine';
import { LEVEL_DEFINITIONS_BY_ID } from '../../src/data/levels';
import { useGameStore } from '../../src/state';

beforeEach(() => {
  useGameStore.setState({ boardState: null });
});

describe('level flow integration', () => {
  it('wins the first authored level through the store move pipeline', () => {
    const store = useGameStore.getState();
    const firstLevel = LEVEL_DEFINITIONS_BY_ID['01-first-sort'];

    if (!firstLevel) {
      throw new Error('Expected the first authored level to exist.');
    }

    const boardConfig = loadLevel(firstLevel);
    const sourceBin = boardConfig.sourceBins[0];
    const destinationBin = boardConfig.destinationBins[0];
    const topLayer = sourceBin?.layers[0] ?? [];

    if (!sourceBin || !destinationBin || topLayer.length !== 3) {
      throw new Error('Expected the first level to contain a 3-item opening group.');
    }

    store.loadBoard(boardConfig);

    topLayer.forEach((item) => {
      const result = useGameStore.getState().applyMove({
        type: 'pull',
        sourceBinId: sourceBin.id,
        itemId: item.id,
      });

      expect(result.success).toBe(true);
    });

    topLayer.forEach((item) => {
      const result = useGameStore.getState().applyMove({
        type: 'commit',
        itemId: item.id,
        destBinId: destinationBin.id,
      });

      expect(result.success).toBe(true);
    });

    expect(useGameStore.getState().boardState?.status).toBe('won');
  });
});
