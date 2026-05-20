import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/src/components/themed-text';
import { IconSymbol } from '@/src/components/ui/icon-symbol';
import { Colors } from '@/src/constants/theme';
import { useColorScheme } from '@/src/hooks/use-color-scheme';

import { SECTION_EMPTY_PROMPTS, type TaskSection } from '../types';

type Props = {
  section: TaskSection;
  onPress: () => void;
};

export function GhostTaskRow({ section, onPress }: Props) {
  const scheme = useColorScheme() ?? 'light';
  const palette = Colors[scheme];

  return (
    <View style={styles.wrap}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Add a ${section} task`}
        onPress={onPress}
        style={({ pressed }) => [
          styles.row,
          { borderColor: palette.border },
          pressed && { opacity: 0.6 },
        ]}
      >
        <ThemedText
          type="sen-headline"
          lightColor={Colors.light.textMuted}
          darkColor={Colors.dark.textMuted}
          style={styles.title}
          numberOfLines={1}
        >
          {SECTION_EMPTY_PROMPTS[section]}
        </ThemedText>
        <View style={styles.iconBox}>
          <IconSymbol name="plus" size={22} color={palette.textMuted} />
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 24,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    minHeight: 56,
    gap: 14,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 14,
  },
  iconBox: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    flex: 1,
  },
});
