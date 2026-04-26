import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/src/components/themed-text';
import { ThemedView } from '@/src/components/themed-view';
import { IconSymbol } from '@/src/components/ui/icon-symbol';
import { Colors } from '@/src/constants/theme';
import { useColorScheme } from '@/src/hooks/use-color-scheme';
import type { Goal } from '@/src/backend/onboarding-auth';

import { BackButton } from '../components/back-button';
import { FadeSlideIn } from '../components/fade-slide-in';
import { PageIndicator } from '../components/page-indicator';
import { PageTurnButton } from '../components/page-turn-button';
import { useOnboarding } from '../context/onboarding-context';

type GoalOption = {
  key: Goal;
  icon: 'briefcase.fill' | 'book.closed.fill' | 'figure.walk';
  title: string;
  subtitle: string;
};

const OPTIONS: readonly GoalOption[] = [
  {
    key: 'work',
    icon: 'briefcase.fill',
    title: 'Work',
    subtitle: 'Focus on deep work and deliverables',
  },
  {
    key: 'study',
    icon: 'book.closed.fill',
    title: 'Study',
    subtitle: 'Learn, review, retain',
  },
  {
    key: 'balance',
    icon: 'figure.walk',
    title: 'Balance',
    subtitle: 'Mix focused work with rest',
  },
] as const;

export function GoalsScreen() {
  const scheme = useColorScheme() ?? 'light';
  const palette = Colors[scheme];
  const { goal, setGoal } = useOnboarding();

  function handleNext() {
    router.push('/(onboarding)/notifications');
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
            <ThemedText type="sen-large-title" style={styles.headline}>
              How does your day look?
            </ThemedText>
            <ThemedText
              type="sen-footnote"
              lightColor={Colors.light.textSecondary}
              darkColor={Colors.dark.textSecondary}
              style={styles.subhead}
            >
              Nudge adapts to fit.
            </ThemedText>
          </FadeSlideIn>

          <View style={styles.optionList}>
            {OPTIONS.map((option, index) => {
              const selected = goal === option.key;
              return (
                <FadeSlideIn key={option.key} delay={0.3 + index * 0.07}>
                  <Pressable
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    accessibilityLabel={option.title}
                    onPress={() => setGoal(option.key)}
                    style={({ pressed }) => [
                      styles.optionRow,
                      {
                        backgroundColor: selected ? palette.accent : palette.bgSecondary,
                        opacity: pressed ? 0.85 : 1,
                      },
                    ]}
                  >
                    <View
                      style={[
                        styles.optionIconBox,
                        {
                          backgroundColor: selected
                            ? 'rgba(255,255,255,0.2)'
                            : palette.accentLight,
                        },
                      ]}
                    >
                      <IconSymbol
                        name={option.icon}
                        size={22}
                        color={selected ? palette.textInverse : palette.textInverse}
                      />
                    </View>
                    <View style={styles.optionTextBlock}>
                      <ThemedText
                        type="sen-headline"
                        lightColor={selected ? Colors.light.textInverse : Colors.light.text}
                        darkColor={selected ? Colors.dark.textInverse : Colors.dark.text}
                      >
                        {option.title}
                      </ThemedText>
                      <ThemedText
                        type="sen-caption"
                        lightColor={
                          selected
                            ? Colors.light.textInverse
                            : Colors.light.textSecondary
                        }
                        darkColor={
                          selected
                            ? Colors.dark.textInverse
                            : Colors.dark.textSecondary
                        }
                      >
                        {option.subtitle}
                      </ThemedText>
                    </View>
                    <IconSymbol
                      name={selected ? 'checkmark.circle.fill' : 'circle'}
                      size={22}
                      color={selected ? palette.textInverse : palette.textMuted}
                    />
                  </Pressable>
                </FadeSlideIn>
              );
            })}
          </View>
        </View>

        <View style={styles.bottomRow}>
          <View style={styles.indicator}>
            <FadeSlideIn delay={0.1}>
              <PageIndicator current={2} total={3} />
            </FadeSlideIn>
          </View>
          <FadeSlideIn delay={0.55} fromBottom>
            <PageTurnButton
              label="Next"
              onPress={handleNext}
              disabled={goal === null}
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
  topRow: {
    paddingHorizontal: 24,
    paddingTop: 16,
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 24,
  },
  headline: {
    paddingBottom: 4,
  },
  subhead: {
    paddingBottom: 24,
  },
  optionList: {
    gap: 12,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 16,
    gap: 16,
  },
  optionIconBox: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionTextBlock: {
    flex: 1,
    gap: 2,
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
