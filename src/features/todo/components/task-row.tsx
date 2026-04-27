'use no memo';

import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/src/components/themed-text';
import { IconSymbol } from '@/src/components/ui/icon-symbol';
import { Colors } from '@/src/constants/theme';
import { useColorScheme } from '@/src/hooks/use-color-scheme';

type Props = {
  title: string;
  time: string;
  done: boolean;
  editing: boolean;
  isDragging?: boolean;
  onToggle: () => void;
  onDelete: () => void;
  onEdit: () => void;
  onDragStart?: () => void;
};

export function TaskRow({
  title,
  time,
  done,
  editing,
  isDragging,
  onToggle,
  onDelete,
  onEdit,
  onDragStart,
}: Props) {
  const scheme = useColorScheme() ?? 'light';
  const palette = Colors[scheme];

  return (
    <Pressable
      onPress={editing ? undefined : onToggle}
      onLongPress={editing ? onDragStart : undefined}
      delayLongPress={250}
      accessibilityRole={editing ? 'button' : 'checkbox'}
      accessibilityState={{ checked: done, disabled: editing }}
      accessibilityLabel={editing ? `Reorder ${title}` : title}
      style={({ pressed }) => [
        styles.row,
        isDragging && [styles.dragging, { backgroundColor: palette.bgSecondary }],
        pressed && !editing && !isDragging && { opacity: 0.55 },
      ]}
    >
      {editing ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Delete ${title}`}
          onPress={onDelete}
          hitSlop={10}
          style={({ pressed }) => [styles.iconBox, pressed && { opacity: 0.6 }]}
        >
          <IconSymbol name="minus.circle.fill" size={22} color={palette.error} />
        </Pressable>
      ) : null}

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
        <ThemedText
          type="sen-caption-medium"
          lightColor={done ? Colors.light.textDisabled : Colors.light.textMuted}
          darkColor={done ? Colors.dark.textDisabled : Colors.dark.textMuted}
        >
          {time}
        </ThemedText>
      </View>

      {editing ? (
        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Edit ${title}`}
            onPress={onEdit}
            hitSlop={8}
            style={({ pressed }) => [styles.actionIcon, pressed && { opacity: 0.6 }]}
          >
            <IconSymbol name="pencil" size={18} color={palette.text} />
          </Pressable>
          <View style={styles.actionIcon}>
            <IconSymbol name="line.3.horizontal" size={20} color={palette.textMuted} />
          </View>
        </View>
      ) : (
        <View style={styles.iconBox}>
          <IconSymbol
            name={done ? 'checkmark.circle.fill' : 'circle'}
            size={22}
            color={done ? palette.text : palette.textMuted}
          />
        </View>
      )}
    </Pressable>
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
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    flex: 1,
    gap: 2,
  },
  title: {},
  titleDone: {
    textDecorationLine: 'line-through',
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  actionIcon: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
