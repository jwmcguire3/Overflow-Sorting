import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Board } from '../components';
import { loadLevel } from '../engine';
import { LEVEL_DEFINITIONS, LEVEL_DEFINITIONS_BY_ID } from '../data/levels';
import { useGameStore } from '../state';

const DEFAULT_LEVEL_ID = '01-first-sort';

type LevelScreenProps = {
  readonly levelId?: string;
};

export function LevelScreen({ levelId = DEFAULT_LEVEL_ID }: LevelScreenProps) {
  const loadBoard = useGameStore((state) => state.loadBoard);
  const [activeLevelId, setActiveLevelId] = useState(() =>
    LEVEL_DEFINITIONS_BY_ID[levelId] ? levelId : DEFAULT_LEVEL_ID,
  );

  const activeLevel = LEVEL_DEFINITIONS_BY_ID[activeLevelId];
  if (!activeLevel) {
    throw new Error(`Unknown level id "${activeLevelId}".`);
  }

  useEffect(() => {
    loadBoard(loadLevel(activeLevel));
  }, [activeLevel, loadBoard]);

  useEffect(() => {
    if (LEVEL_DEFINITIONS_BY_ID[levelId]) {
      setActiveLevelId(levelId);
    }
  }, [levelId]);

  const cycleLevel = () => {
    const currentIndex = LEVEL_DEFINITIONS.findIndex((level) => level.id === activeLevelId);
    const nextIndex =
      currentIndex === -1 ? 0 : (currentIndex + 1) % LEVEL_DEFINITIONS.length;
    const nextLevel = LEVEL_DEFINITIONS[nextIndex];

    if (nextLevel) {
      setActiveLevelId(nextLevel.id);
    }
  };

  const reloadLevel = () => {
    loadBoard(loadLevel(activeLevel));
  };

  const headerAccessory = (
    <Pressable
      accessibilityLabel="Cycle level"
      onPress={cycleLevel}
      style={({ pressed }) => [
        styles.levelButton,
        pressed ? styles.levelButtonPressed : null,
      ]}
    >
      <Text style={styles.levelButtonEyebrow}>
        CH {String(activeLevel.chapter)} LV {String(activeLevel.levelNumber)}
      </Text>
      <Text style={styles.levelButtonText}>{activeLevel.id}</Text>
    </Pressable>
  );

  return (
    <View style={styles.container}>
      <Board
        headerAccessory={headerAccessory}
        onNextLevel={cycleLevel}
        onRetryLevel={reloadLevel}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F1E8',
  },
  levelButton: {
    minWidth: 132,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 14,
    backgroundColor: '#3F5F4A',
    borderWidth: 1,
    borderColor: '#2F4938',
  },
  levelButtonPressed: {
    opacity: 0.88,
  },
  levelButtonEyebrow: {
    color: '#D7E6D8',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  levelButtonText: {
    marginTop: 2,
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
});
