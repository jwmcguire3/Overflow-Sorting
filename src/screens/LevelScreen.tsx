import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Board } from '../components';
import { TEST_LEVEL_CONFIG } from '../data/levels';
import { useGameStatus, useGameStore } from '../state';

const OVERLAY_LABELS = {
  won: 'WON',
  lost: 'LOST',
} as const;

export function LevelScreen() {
  const loadBoard = useGameStore((state) => state.loadBoard);
  const status = useGameStatus();

  useEffect(() => {
    loadBoard(TEST_LEVEL_CONFIG);
  }, [loadBoard]);

  const overlayLabel =
    status === 'won' || status === 'lost' ? OVERLAY_LABELS[status] : null;

  return (
    <View style={styles.container}>
      <Board />
      {overlayLabel ? (
        <View style={styles.overlay}>
          <Text style={styles.overlayText}>{overlayLabel}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F1E8',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.28)',
  },
  overlayText: {
    color: '#FFFFFF',
    fontSize: 44,
    fontWeight: '800',
    letterSpacing: 2,
  },
});
