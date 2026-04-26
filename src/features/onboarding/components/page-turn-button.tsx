import { Pressable, StyleSheet } from 'react-native';

import { ThemedText } from '@/src/components/themed-text';
import { Colors } from '@/src/constants/theme';
import { useColorScheme } from '@/src/hooks/use-color-scheme';

type Props = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
};

export function PageTurnButton({ label, onPress, disabled = false }: Props) {
  const scheme = useColorScheme() ?? 'light';
  const palette = Colors[scheme];

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: disabled ? palette.textDisabled : palette.buttonFill,
          shadowColor: palette.buttonFill,
          opacity: pressed && !disabled ? 0.7 : 1,
        },
      ]}
    >
      <ThemedText
        type="sen-title-2"
        lightColor={disabled ? Colors.light.textDisabled : Colors.light.buttonLabel}
        darkColor={disabled ? Colors.dark.textDisabled : Colors.dark.buttonLabel}
      >
        {label}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 150,
    paddingTop: 32,
    paddingBottom: 54,
    alignItems: 'center',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 0,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    shadowOffset: { width: -2, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
  },
});
