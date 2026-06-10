import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/src/components/themed-text';
import { ThemedView } from '@/src/components/themed-view';
import { Colors } from '@/src/constants/theme';
import { useColorScheme } from '@/src/hooks/use-color-scheme';

import { GlassBackButton } from './glass-back-button';

type Props = {
  title: string;
  subtitle?: string;
  children: ReactNode;
  /** When true, content is wrapped in a ScrollView. Defaults to true. */
  scrollable?: boolean;
};

export function SettingsScreenChrome({
  title,
  subtitle,
  children,
  scrollable = true,
}: Props) {
  const scheme = useColorScheme() ?? 'light';
  const palette = Colors[scheme];
  const insets = useSafeAreaInsets();

  // ThemedView extends behind the status bar — no white strip. Back button is
  // absolutely positioned so it stays visible at all scroll positions; scroll
  // content gets enough top padding to clear it when at rest.
  const backButtonTop = insets.top + 4;
  const contentTopPad = insets.top + 60; // 4 + 44 (button) + 12 (gap to title)

  const body = (
    <View style={styles.body}>
      <ThemedText type="sen-large-title" style={styles.title}>
        {title}
      </ThemedText>
      {subtitle ? (
        <ThemedText
          type="sen-footnote"
          style={[styles.subtitle, { color: palette.textSecondary }]}
        >
          {subtitle}
        </ThemedText>
      ) : null}
      {children}
    </View>
  );

  return (
    <ThemedView style={styles.root}>
      {scrollable ? (
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            { paddingTop: contentTopPad },
          ]}
          showsVerticalScrollIndicator={false}
        >
          {body}
        </ScrollView>
      ) : (
        <View style={{ flex: 1, paddingTop: contentTopPad }}>{body}</View>
      )}

      <View
        style={[styles.fixedBack, { top: backButtonTop }]}
        pointerEvents="box-none"
      >
        <GlassBackButton />
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scrollContent: {
    paddingBottom: 140,
  },
  body: {
    paddingHorizontal: 24,
  },
  title: {
    paddingBottom: 8,
  },
  subtitle: {
    paddingBottom: 20,
  },
  fixedBack: {
    position: 'absolute',
    left: 24,
    zIndex: 10,
  },
});
