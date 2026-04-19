import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';

import { Board } from '../components';
import { TEST_LEVEL_CONFIG } from '../data/levels';
import { useGameStore } from '../state';

export function LevelScreen() {
  const loadBoard = useGameStore((state) => state.loadBoard);

  useEffect(() => {
    loadBoard(TEST_LEVEL_CONFIG);
  }, [loadBoard]);

  return (
    <View style={styles.container}>
      <Board />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F1E8',
  },
});
