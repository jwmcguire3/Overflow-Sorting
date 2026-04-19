import { beforeEach, describe, expect, it } from 'vitest';

import { TEST_LEVEL_CONFIG, TEST_LEVEL_WIN_SEQUENCE } from '../../src/data/levels';
import { useGameStore } from '../../src/state';

beforeEach(() => {
  useGameStore.setState({ boardState: null });
});

describe('level flow integration', () => {
  it('wins the hardcoded level through the store move pipeline', () => {
    const store = useGameStore.getState();

    store.loadBoard(TEST_LEVEL_CONFIG);

    TEST_LEVEL_WIN_SEQUENCE.forEach((move) => {
      const result = useGameStore.getState().applyMove(move);

      expect(result.success).toBe(true);
    });

    expect(useGameStore.getState().boardState?.status).toBe('won');
  });
});
