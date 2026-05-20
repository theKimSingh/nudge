import { StyleSheet, Text, View } from 'react-native';

import type { TaskCategory } from '@/src/types/database';
import { CATEGORY_META } from '../category-meta';

export function CategoryDot({
  category,
  done,
}: {
  category: TaskCategory;
  done: boolean;
}) {
  const meta = CATEGORY_META[category] ?? CATEGORY_META.other;
  return (
    <View
      style={[
        styles.dot,
        { backgroundColor: meta.color, opacity: done ? 0.4 : 1 },
      ]}
    >
      <Text style={styles.emoji} allowFontScaling={false}>
        {meta.emoji}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  dot: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emoji: {
    fontSize: 16,
    lineHeight: 20,
  },
});
