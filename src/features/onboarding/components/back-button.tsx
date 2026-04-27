import { router } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';

import { IconSymbol } from '@/src/components/ui/icon-symbol';
import { Colors } from '@/src/constants/theme';
import { useColorScheme } from '@/src/hooks/use-color-scheme';

type Props = {
  onPress?: () => void;
};

export function BackButton({ onPress }: Props) {
  const scheme = useColorScheme() ?? 'light';
  const palette = Colors[scheme];

  const handlePress = () => {
    if (onPress) {
      onPress();
    } else if (router.canGoBack()) {
      router.back();
    }
  };

  return (
    <Pressable
      onPress={handlePress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel="Back"
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: palette.buttonFill, opacity: pressed ? 0.7 : 1 },
      ]}
    >
      <IconSymbol name="chevron.left" size={18} color={palette.buttonLabel} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
