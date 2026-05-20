import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { ThemedText } from '@/src/components/themed-text';
import { GlassSurface } from '@/src/components/ui/glass-surface';
import { IconSymbol } from '@/src/components/ui/icon-symbol';
import { Colors } from '@/src/constants/theme';
import { useColorScheme } from '@/src/hooks/use-color-scheme';

import {
  SECTION_LABELS,
  SECTION_PILL_COLORS,
  type TaskSection,
} from '../types';

type Props = {
  section: TaskSection;
  count: number;
  collapsed: boolean;
  onToggle: () => void;
  /** When true the chevron is hidden and the press handler is disabled. */
  locked?: boolean;
};

export function SectionHeader({
  section,
  count,
  collapsed,
  onToggle,
  locked = false,
}: Props) {
  const scheme = useColorScheme() ?? 'light';
  const textColor = Colors[scheme].text;

  // 0deg = pointing down (expanded), -90deg = pointing right (collapsed).
  const rotation = useSharedValue(collapsed ? -90 : 0);

  useEffect(() => {
    rotation.value = withTiming(collapsed ? -90 : 0, {
      duration: 300,
      easing: Easing.bezier(0.4, 0, 0.2, 1),
    });
  }, [collapsed, rotation]);

  const chevronStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  const label = SECTION_LABELS[section].toUpperCase();
  const countLabel = `${count} ${count === 1 ? 'task' : 'tasks'}`;

  return (
    <View style={styles.wrap}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: !collapsed, disabled: locked }}
        accessibilityLabel={`${label}, ${countLabel}, ${collapsed ? 'collapsed' : 'expanded'}`}
        onPress={onToggle}
        disabled={locked}
        hitSlop={6}
      >
        <GlassSurface
          tint="regular"
          scheme="auto"
          tintColor={SECTION_PILL_COLORS[section]}
          style={styles.pill}
        >
          <ThemedText type="sen-caption-bold" style={styles.label}>
            {label}
          </ThemedText>
          <ThemedText type="sen-caption-bold">{`(${count})`}</ThemedText>
          {!locked ? (
            <Animated.View style={chevronStyle}>
              <IconSymbol name="chevron.down" size={14} color={textColor} />
            </Animated.View>
          ) : null}
        </GlassSurface>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 8,
    flexDirection: 'row',
  },
  pill: {
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    overflow: 'hidden',
  },
  label: {
    letterSpacing: 0.6,
  },
});
