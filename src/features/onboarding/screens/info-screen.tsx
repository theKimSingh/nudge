import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/src/components/themed-text';
import { ThemedView } from '@/src/components/themed-view';
import { IconSymbol } from '@/src/components/ui/icon-symbol';
import { Colors } from '@/src/constants/theme';
import { useColorScheme } from '@/src/hooks/use-color-scheme';

import { BackButton } from '../components/back-button';
import { FadeSlideIn } from '../components/fade-slide-in';
import { Illustration } from '../components/illustration';
import { NudgeWordmark } from '../components/nudge-wordmark';
import { PageIndicator } from '../components/page-indicator';
import { PageTurnButton } from '../components/page-turn-button';

const FEATURES = [
  { icon: 'checkmark.circle.fill' as const, label: 'Plan in seconds.' },
  { icon: 'bell.fill' as const, label: 'Stay in flow.' },
  { icon: 'lock.fill' as const, label: 'Nudges that respect your time.' },
];

export function InfoScreen() {
  const scheme = useColorScheme() ?? 'light';
  const accent = Colors[scheme].accent;

  return (
    <ThemedView style={styles.root}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <FadeSlideIn delay={0}>
          <View style={styles.topBar}>
            <BackButton />
            <NudgeWordmark />
            <View style={styles.spacer} />
          </View>
        </FadeSlideIn>

        <View style={styles.center}>
          <View style={styles.illustrationCluster}>
            <FadeSlideIn delay={0.25}>
              <View style={styles.cloudsLayer}>
                <Illustration name="clouds" width={150} height={60} />
              </View>
            </FadeSlideIn>
            <FadeSlideIn delay={0.2}>
              <Illustration name="hotair_balloon" width={260} />
            </FadeSlideIn>
          </View>

          <FadeSlideIn delay={0.3}>
            <ThemedText type="sen-display" style={styles.headline}>
              Tiny nudges, real momentum.
            </ThemedText>
          </FadeSlideIn>

          <View style={styles.featureList}>
            {FEATURES.map((feature, index) => (
              <FadeSlideIn key={feature.label} delay={0.35 + index * 0.07}>
                <View style={styles.featureRow}>
                  <IconSymbol name={feature.icon} size={18} color={accent} />
                  <ThemedText
                    type="sen-body"
                    lightColor={Colors.light.textSecondary}
                    darkColor={Colors.dark.textSecondary}
                  >
                    {feature.label}
                  </ThemedText>
                </View>
              </FadeSlideIn>
            ))}
          </View>
        </View>

        <View style={styles.bottomRow}>
          <View style={styles.indicator}>
            <FadeSlideIn delay={0.1}>
              <PageIndicator current={2} total={2} />
            </FadeSlideIn>
          </View>
          <FadeSlideIn delay={0.45} fromBottom>
            <PageTurnButton
              label="Next"
              onPress={() => router.push('/(onboarding)/auth')}
            />
          </FadeSlideIn>
        </View>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingTop: 16,
  },
  spacer: {
    width: 44,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  illustrationCluster: {
    width: 260,
    height: 260,
    marginBottom: 16,
    position: 'relative',
  },
  cloudsLayer: {
    position: 'absolute',
    left: -56,
    top: 0,
    zIndex: 1,
  },
  headline: {
    textAlign: 'center',
    paddingTop: 8,
  },
  featureList: {
    paddingTop: 24,
    gap: 12,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  indicator: {
    paddingLeft: 24,
    paddingBottom: 32,
  },
});
