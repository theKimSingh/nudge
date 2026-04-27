import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/src/components/themed-text';
import { Colors } from '@/src/constants/theme';

type Props = {
  current: number;
  total: number;
};

export function PageIndicator({ current, total }: Props) {
  return (
    <View
      style={styles.row}
      accessibilityRole="text"
      accessibilityLabel={`Page ${current} of ${total}`}
    >
      <ThemedText type="sen-counter">{current}</ThemedText>
      <ThemedText
        type="sen-title-3"
        lightColor={Colors.light.textMuted}
        darkColor={Colors.dark.textMuted}
      >
        /{total}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
});
