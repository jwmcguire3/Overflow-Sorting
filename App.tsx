import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';

import { LevelScreen } from './src/screens';

export default function App() {
  return (
    <GestureHandlerRootView style={styles.container}>
      <LevelScreen />
      <StatusBar style="auto" />
    </GestureHandlerRootView>
  );
}

const styles = {
  container: {
    flex: 1,
    backgroundColor: '#F5F1E8',
  },
};
