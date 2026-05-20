'use no memo';

import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { ThemedText } from '@/src/components/themed-text';
import { IconSymbol } from '@/src/components/ui/icon-symbol';
import { Colors } from '@/src/constants/theme';
import { useColorScheme } from '@/src/hooks/use-color-scheme';
import type { TaskCategory } from '@/src/types/database';
import { CategoryDot } from './category-dot';

type Props = {
  title: string;
  time: string;
  duration: string;
  done: boolean;
  category: TaskCategory;
  isDragging?: boolean;
  disabled?: boolean;
  onToggle: () => void;
};

export function TaskRow({
  title,
  time,
  duration,
  done,
  category,
  isDragging,
  disabled = false,
  onToggle,
}: Props) {
  const scheme = useColorScheme() ?? 'light';
  const palette = Colors[scheme];

  const scale = useSharedValue(1);
  useEffect(() => {
    scale.value = withTiming(isDragging ? 0.96 : 1, { duration: 160 });
  }, [isDragging, scale]);
  const dragStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View style={dragStyle}>
      <View
        style={[
          styles.row,
          isDragging && [styles.dragging, { backgroundColor: palette.bgSecondary }],
        ]}
      >
        <CategoryDot category={category} done={done} />

        <View style={styles.body}>
          <ThemedText
            type="sen-headline"
            lightColor={done ? Colors.light.textMuted : Colors.light.text}
            darkColor={done ? Colors.dark.textMuted : Colors.dark.text}
            style={[styles.title, done && styles.titleDone]}
            numberOfLines={2}
          >
            {title}
          </ThemedText>
          <View style={styles.subtitleRow}>
            <ThemedText
              type="sen-caption-medium"
              lightColor={done ? Colors.light.textDisabled : Colors.light.textMuted}
              darkColor={done ? Colors.dark.textDisabled : Colors.dark.textMuted}
            >
              {time}
            </ThemedText>
            <ThemedText
              type="sen-caption-medium"
              lightColor={done ? Colors.light.textMuted : Colors.light.text}
              darkColor={done ? Colors.dark.textMuted : Colors.dark.text}
            >
              {duration}
            </ThemedText>
          </View>
        </View>

        {disabled ? (
          <View style={styles.iconBox}>
            <IconSymbol
              name={done ? 'checkmark.circle.fill' : 'circle'}
              size={22}
              color={done ? palette.text : palette.textMuted}
            />
          </View>
        ) : (
          <Pressable
            onPress={onToggle}
            hitSlop={16}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: done }}
            accessibilityLabel={done ? `Mark ${title} not done` : `Mark ${title} done`}
            style={({ pressed }) => [
              styles.iconBox,
              pressed && { opacity: 0.55 },
            ]}
          >
            <IconSymbol
              name={done ? 'checkmark.circle.fill' : 'circle'}
              size={22}
              color={done ? palette.text : palette.textMuted}
            />
          </Pressable>
        )}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 24,
    minHeight: 56,
    gap: 14,
  },
  dragging: {
    borderRadius: 12,
  },
  iconBox: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    flex: 1,
    gap: 2,
  },
  subtitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {},
  titleDone: {
    textDecorationLine: 'line-through',
  },
});
