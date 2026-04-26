import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/src/components/themed-text';
import { ThemedView } from '@/src/components/themed-view';
import { Colors } from '@/src/constants/theme';

import { FadeSlideIn } from '../components/fade-slide-in';
import { Illustration } from '../components/illustration';
import { NudgeWordmark } from '../components/nudge-wordmark';
import { PageIndicator } from '../components/page-indicator';
import { PageTurnButton } from '../components/page-turn-button';

export function WelcomeScreen() {
  return (
    <ThemedView style={styles.root}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <View style={styles.wordmarkRow}>
          <FadeSlideIn delay={0}>
            <NudgeWordmark />
          </FadeSlideIn>
        </View>

        <View style={styles.center}>
          <FadeSlideIn delay={0.2}>
            <Illustration name="tasks_complete" width={260} />
          </FadeSlideIn>

          <FadeSlideIn delay={0.35}>
            <View style={styles.textBlock}>
              <ThemedText type="sen-display" style={styles.headline}>
                A calmer way to plan.
              </ThemedText>
              <ThemedText
                type="sen-body"
                style={styles.subhead}
                lightColor={Colors.light.textSecondary}
                darkColor={Colors.dark.textSecondary}
              >
                Built to help you think clearly and follow through.
              </ThemedText>
            </View>
          </FadeSlideIn>
        </View>

        <View style={styles.bottomRow}>
          <View style={styles.indicator}>
            <FadeSlideIn delay={0.1}>
              <PageIndicator current={1} total={2} />
            </FadeSlideIn>
          </View>
          <FadeSlideIn delay={0.4} fromBottom>
            <PageTurnButton
              label="Next"
              onPress={() => router.push('/(onboarding)/info')}
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
  wordmarkRow: {
    alignItems: 'center',
    paddingTop: 16,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  textBlock: {
    alignItems: 'center',
    paddingTop: 24,
  },
  headline: {
    textAlign: 'center',
  },
  subhead: {
    textAlign: 'center',
    maxWidth: 280,
    paddingTop: 8,
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
