import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { GlassSurface } from '@/src/components/ui/glass-surface';
import { IconSymbol } from '@/src/components/ui/icon-symbol';
import { Colors } from '@/src/constants/theme';
import { useColorScheme } from '@/src/hooks/use-color-scheme';

type Props = {
  onPress?: () => void;
};

export function GlassBackButton({ onPress }: Props) {
  const scheme = useColorScheme() ?? 'light';
  const palette = Colors[scheme];

  const handlePress = () => {
    if (onPress) {
      onPress();
    } else if (router.canGoBack()) {
      router.back();
    }
  };

  const isDark = scheme === 'dark';

  return (
    <View style={[styles.shadow, { shadowOpacity: isDark ? 0.45 : 0.15 }]}>
      <GlassSurface
        tint="regular"
        interactive
        scheme="auto"
        tintColor={
          isDark ? 'rgba(14,14,16,0.55)' : 'rgba(255,255,255,0.55)'
        }
        style={
          isDark
            ? {
                ...styles.glass,
                borderWidth: StyleSheet.hairlineWidth,
                borderColor: 'rgba(255,255,255,0.08)',
              }
            : styles.glass
        }
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={handlePress}
          hitSlop={8}
          style={({ pressed }) => [
            styles.press,
            { transform: [{ scale: pressed ? 0.94 : 1 }] },
          ]}
        >
          <IconSymbol name="chevron.left" size={18} color={palette.surfaceText} />
        </Pressable>
      </GlassSurface>
    </View>
  );
}

const styles = StyleSheet.create({
  shadow: {
    width: 44,
    height: 44,
    borderRadius: 22,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 10,
    elevation: 4,
  },
  glass: {
    width: 44,
    height: 44,
    borderRadius: 22,
    overflow: 'hidden',
  },
  press: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
