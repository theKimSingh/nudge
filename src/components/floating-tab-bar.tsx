import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TAB_BAR_HEIGHT, TAB_BAR_LIFT } from '@/src/components/tab-bar';
import { ThemedText } from '@/src/components/themed-text';
import { IconSymbol } from '@/src/components/ui/icon-symbol';
import { Colors } from '@/src/constants/theme';
import { useColorScheme } from '@/src/hooks/use-color-scheme';

// Cluster geometry — mirrors floating-mic.tsx so the pill and the mic share
// the same top/bottom/center. The mic is anchored at `right: SCREEN_EDGE_MARGIN`
// with `width: MIC_SIZE`; the pill sits to its left with PILL_MIC_GAP between
// the two surfaces, so they read as one connected control.
const SCREEN_EDGE_MARGIN = 52;
const MIC_SIZE = TAB_BAR_HEIGHT;
const PILL_MIC_GAP = 8;
const BAR_PADDING = 6;
const SEGMENT_HEIGHT = TAB_BAR_HEIGHT - BAR_PADDING * 2;

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
  const insets = useSafeAreaInsets();

  const bottom = insets.bottom + TAB_BAR_LIFT;
  const right = SCREEN_EDGE_MARGIN + MIC_SIZE + PILL_MIC_GAP;

  return (
    <View
      pointerEvents="box-none"
      style={[styles.bar, { backgroundColor: palette.buttonFill, bottom, right }]}
    >
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
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    height: TAB_BAR_HEIGHT,
    padding: BAR_PADDING,
    borderRadius: TAB_BAR_HEIGHT / 2,
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
    justifyContent: 'center',
    height: SEGMENT_HEIGHT,
    paddingHorizontal: 18,
    borderRadius: SEGMENT_HEIGHT / 2,
    gap: 8,
  },
});
