import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg';

import { ThemedText } from '@/src/components/themed-text';
import { ThemedView } from '@/src/components/themed-view';
import { Colors } from '@/src/constants/theme';
import { useColorScheme } from '@/src/hooks/use-color-scheme';
import {
  persistSession,
  requestNotificationPermission,
} from '@/src/backend/onboarding-auth';

import { BackButton } from '../components/back-button';
import { FadeSlideIn } from '../components/fade-slide-in';
import { PageIndicator } from '../components/page-indicator';
import { useOnboarding } from '../context/onboarding-context';

export function NotificationsScreen() {
  const scheme = useColorScheme() ?? 'light';
  const palette = Colors[scheme];
  const { pendingSession, name, goal } = useOnboarding();
  const [busy, setBusy] = useState<null | 'enable' | 'skip'>(null);

  async function finish(action: 'enable' | 'skip') {
    setBusy(action);
    try {
      if (action === 'enable') {
        await requestNotificationPermission();
      }
      await persistSession(pendingSession, { name, goal });
      router.replace('/(tabs)/home');
    } catch (err) {
      Alert.alert(
        'Could not finish setup',
        err instanceof Error ? err.message : 'Something went wrong.',
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <ThemedView style={styles.root}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <View style={styles.topRow}>
          <FadeSlideIn delay={0}>
            <BackButton />
          </FadeSlideIn>
        </View>

        <View style={styles.content}>
          <FadeSlideIn delay={0.2}>
            <View style={styles.bellWrapper}>
              <BellGlyph
                from={palette.accent}
                to={palette.accentLight}
                size={70}
              />
            </View>
          </FadeSlideIn>

          <FadeSlideIn delay={0.3}>
            <ThemedText type="sen-large-title" style={styles.headline}>
              Turn on reminders?
            </ThemedText>
            <ThemedText
              type="sen-footnote"
              lightColor={Colors.light.textSecondary}
              darkColor={Colors.dark.textSecondary}
              style={styles.subhead}
            >
              We'll nudge you when a task slips. Quiet otherwise.
            </ThemedText>
          </FadeSlideIn>

          <FadeSlideIn delay={0.4}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Enable notifications"
              accessibilityState={{ disabled: !!busy }}
              disabled={!!busy}
              onPress={() => finish('enable')}
              style={({ pressed }) => [
                styles.primaryCta,
                {
                  backgroundColor: palette.accent,
                  opacity: pressed && !busy ? 0.85 : 1,
                },
              ]}
            >
              {busy === 'enable' ? (
                <ActivityIndicator color={palette.textInverse} />
              ) : (
                <ThemedText
                  type="sen-headline"
                  lightColor={Colors.light.textInverse}
                  darkColor={Colors.dark.textInverse}
                >
                  Enable notifications
                </ThemedText>
              )}
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Maybe later"
              accessibilityState={{ disabled: !!busy }}
              disabled={!!busy}
              onPress={() => finish('skip')}
              style={styles.secondaryCta}
            >
              {busy === 'skip' ? (
                <ActivityIndicator color={palette.textMuted} />
              ) : (
                <ThemedText
                  type="sen-label"
                  lightColor={Colors.light.textMuted}
                  darkColor={Colors.dark.textMuted}
                >
                  Maybe later
                </ThemedText>
              )}
            </Pressable>
          </FadeSlideIn>
        </View>

        <View style={styles.bottomRow}>
          <View style={styles.indicator}>
            <FadeSlideIn delay={0.1}>
              <PageIndicator current={3} total={3} />
            </FadeSlideIn>
          </View>
        </View>
      </SafeAreaView>
    </ThemedView>
  );
}

function BellGlyph({ from, to, size }: { from: string; to: string; size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Defs>
        <LinearGradient id="bellGradient" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={from} stopOpacity="1" />
          <Stop offset="1" stopColor={to} stopOpacity="1" />
        </LinearGradient>
      </Defs>
      <Path
        fill="url(#bellGradient)"
        d="M12 2a1 1 0 0 1 1 1v1.07A7 7 0 0 1 19 11v3.586l1.707 1.707A1 1 0 0 1 20 18H4a1 1 0 0 1-.707-1.707L5 14.586V11a7 7 0 0 1 6-6.93V3a1 1 0 0 1 1-1zm-2 18a2 2 0 0 0 4 0h-4z"
      />
    </Svg>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  topRow: {
    paddingHorizontal: 24,
    paddingTop: 16,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 16,
  },
  bellWrapper: {
    alignItems: 'center',
    paddingBottom: 12,
  },
  headline: {
    textAlign: 'center',
  },
  subhead: {
    textAlign: 'center',
    maxWidth: 280,
    paddingTop: 8,
  },
  primaryCta: {
    height: 52,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    minWidth: 240,
    marginTop: 16,
  },
  secondaryCta: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    marginTop: 4,
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'flex-start',
  },
  indicator: {
    paddingLeft: 24,
    paddingBottom: 32,
  },
});
