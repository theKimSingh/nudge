import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/src/components/themed-text';
import { IconSymbol } from '@/src/components/ui/icon-symbol';
import { Colors } from '@/src/constants/theme';
import { useColorScheme } from '@/src/hooks/use-color-scheme';

type TabMeta = {
  label: string;
  icon: 'list.bullet' | 'calendar' | 'person.fill';
};

const TAB_META: Record<string, TabMeta> = {
  todo: { label: 'ToDo', icon: 'list.bullet' },
  calendar: { label: 'Calendar', icon: 'calendar' },
  profile: { label: 'Profile', icon: 'person.fill' },
};

export function FloatingTabBar({ state, navigation }: BottomTabBarProps) {
  const scheme = useColorScheme() ?? 'light';
  const palette = Colors[scheme];

  return (
    <SafeAreaView edges={['bottom']} style={styles.outer} pointerEvents="box-none">
      <View style={[styles.bar, { backgroundColor: palette.buttonFill }]}>
        {state.routes.map((route, index) => {
          const meta = TAB_META[route.name];
          if (!meta) return null;
          const focused = state.index === index;

          return (
            <Pressable
              key={route.key}
              accessibilityRole="button"
              accessibilityLabel={meta.label}
              accessibilityState={{ selected: focused }}
              onPress={() => {
                if (!focused) navigation.navigate(route.name);
              }}
              style={({ pressed }) => [
                styles.segment,
                focused && { backgroundColor: palette.tabActiveBg },
                pressed && !focused && { opacity: 0.7 },
              ]}
            >
              <IconSymbol name={meta.icon} size={18} color={palette.buttonLabel} />
              <ThemedText
                type="sen-label-bold"
                lightColor={Colors.light.buttonLabel}
                darkColor={Colors.dark.buttonLabel}
              >
                {meta.label}
              </ThemedText>
            </Pressable>
          );
        })}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  outer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    paddingBottom: 12,
  },
  bar: {
    flexDirection: 'row',
    padding: 6,
    borderRadius: 999,
    gap: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 18,
    elevation: 6,
  },
  segment: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 999,
    gap: 8,
    minHeight: 44,
  },
});
