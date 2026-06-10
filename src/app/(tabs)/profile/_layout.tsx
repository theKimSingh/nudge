import { Stack } from 'expo-router';

import { ThemedView } from '@/src/components/themed-view';
import { Colors } from '@/src/constants/theme';
import { useColorScheme } from '@/src/hooks/use-color-scheme';

export default function ProfileStackLayout() {
  const scheme = useColorScheme() ?? 'light';
  const palette = Colors[scheme];

  // ThemedView wrapper guarantees a dark native view sits behind the Stack
  // from first paint — independent of when React Navigation's theme context
  // propagates. Stack's contentStyle is also set as a second line of defense
  // for the screen container itself.
  return (
    <ThemedView style={{ flex: 1 }}>
      <Stack
        screenOptions={{
          headerShown: false,
          animation: 'slide_from_right',
          contentStyle: { backgroundColor: palette.background },
        }}
      />
    </ThemedView>
  );
}
