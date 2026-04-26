import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/src/components/themed-text';
import { ThemedView } from '@/src/components/themed-view';
import { Colors } from '@/src/constants/theme';
import { useColorScheme } from '@/src/hooks/use-color-scheme';

import { BackButton } from '../components/back-button';
import { FadeSlideIn } from '../components/fade-slide-in';
import { PageIndicator } from '../components/page-indicator';
import { PageTurnButton } from '../components/page-turn-button';
import { useOnboarding } from '../context/onboarding-context';

export function ProfileSetupScreen() {
  const scheme = useColorScheme() ?? 'light';
  const palette = Colors[scheme];
  const { name, setName } = useOnboarding();
  const [draft, setDraft] = useState(name);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    const timer = setTimeout(() => inputRef.current?.focus(), 250);
    return () => clearTimeout(timer);
  }, []);

  useFocusEffect(
    useCallback(() => {
      return () => {
        inputRef.current?.blur();
        Keyboard.dismiss();
      };
    }, []),
  );

  const canContinue = draft.trim().length > 0;

  function handleNext() {
    Keyboard.dismiss();
    setName(draft.trim());
    router.push('/(onboarding)/goals');
  }

  return (
    <ThemedView style={styles.root}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.topRow}>
            <FadeSlideIn delay={0}>
              <BackButton />
            </FadeSlideIn>
          </View>

          <View style={styles.content}>
            <FadeSlideIn delay={0.2}>
              <ThemedText type="sen-large-title" style={styles.headline}>
                What&apos;s your name?
              </ThemedText>
            </FadeSlideIn>

            <FadeSlideIn delay={0.3}>
              <TextInput
                ref={inputRef}
                placeholder="Your name"
                placeholderTextColor={palette.textMuted}
                value={draft}
                onChangeText={setDraft}
                onSubmitEditing={canContinue ? handleNext : undefined}
                autoCapitalize="words"
                autoCorrect={false}
                textContentType="name"
                returnKeyType="done"
                accessibilityLabel="Your name"
                style={[styles.input, { color: palette.text }]}
              />
            </FadeSlideIn>
          </View>

          <View style={styles.bottomRow}>
            <View style={styles.indicator}>
              <FadeSlideIn delay={0.1}>
                <PageIndicator current={1} total={3} />
              </FadeSlideIn>
            </View>
            <PageTurnButton
              label="Next"
              onPress={handleNext}
              disabled={!canContinue}
            />
          </View>
        </KeyboardAvoidingView>
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
  flex: {
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
    paddingBottom: 24,
  },
  input: {
    fontSize: 22,
    textAlign: 'center',
    paddingVertical: 16,
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
