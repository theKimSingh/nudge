import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/src/components/themed-text';
import { Colors } from '@/src/constants/theme';
import { useColorScheme } from '@/src/hooks/use-color-scheme';

type Props = {
  heading: string;
  children: ReactNode;
};

export function SettingsSection({ heading, children }: Props) {
  const scheme = useColorScheme() ?? 'light';
  const palette = Colors[scheme];

  return (
    <View style={styles.section}>
      <ThemedText
        type="sen-caption-bold"
        style={[styles.heading, { color: palette.textMuted }]}
      >
        {heading.toUpperCase()}
      </ThemedText>
      <View style={styles.body}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginTop: 28,
  },
  heading: {
    paddingHorizontal: 4,
    paddingBottom: 10,
    letterSpacing: 1.2,
  },
  body: {
    gap: 8,
  },
});
