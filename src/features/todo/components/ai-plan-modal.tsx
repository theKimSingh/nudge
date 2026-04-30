import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  Easing,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/src/components/themed-text';
import { IconSymbol } from '@/src/components/ui/icon-symbol';
import { Colors } from '@/src/constants/theme';
import { useColorScheme } from '@/src/hooks/use-color-scheme';

export type PlannedTask = {
  title: string;
  timeMinutes: number;
  durationMinutes: number;
};

type Props = {
  visible: boolean;
  date: string; // YYYY-MM-DD — day the planned tasks should land on
  onClose: () => void;
  onPlan: (tasks: PlannedTask[]) => void;
};

const SCREEN_HEIGHT = Dimensions.get('window').height;

const API_URL =
  Platform.OS === 'android'
    ? 'http://10.0.2.2:8000/plan-day'
    : 'http://localhost:8000/plan-day';

export function AIPlanModal({ visible, date, onClose, onPlan }: Props) {
  const scheme = useColorScheme() ?? 'light';
  const palette = Colors[scheme];
  const insets = useSafeAreaInsets();

  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [mounted, setMounted] = useState(false);

  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const prevVisibleRef = useRef(false);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    const wasVisible = prevVisibleRef.current;
    prevVisibleRef.current = visible;

    if (visible && !wasVisible) {
      setMounted(true);
      opacity.setValue(0);
      translateY.setValue(SCREEN_HEIGHT);
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 200,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: 0,
          duration: 280,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start();
      const t = setTimeout(() => inputRef.current?.focus(), 280);
      return () => clearTimeout(t);
    }

    if (!visible && wasVisible) {
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 0,
          duration: 200,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: SCREEN_HEIGHT,
          duration: 240,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start(({ finished }) => {
        if (finished) setMounted(false);
      });
    }
  }, [visible, opacity, translateY]);

  async function handlePlan() {
    const trimmed = text.trim();
    if (!trimmed) {
      Alert.alert('Add some details', 'Tell me about your day first.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: trimmed, date }),
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => '');
        throw new Error(`Backend error ${res.status}: ${detail}`);
      }
      const data = await res.json();
      const rawTasks: any[] = Array.isArray(data?.tasks) ? data.tasks : [];

      const planned: PlannedTask[] = rawTasks
        .map((t) => {
          const startStr = String(t.start_time ?? '');
          const dt = new Date(startStr);
          if (Number.isNaN(dt.getTime())) return null;
          const timeMinutes = dt.getHours() * 60 + dt.getMinutes();
          const durationMinutes = Math.max(5, Math.round(Number(t.duration_minutes) || 30));
          const title = String(t.title || 'Task').trim() || 'Task';
          return { title, timeMinutes, durationMinutes };
        })
        .filter((t): t is PlannedTask => t !== null);

      if (planned.length === 0) {
        throw new Error('AI returned no tasks.');
      }

      onPlan(planned);
      setText('');
      onClose();
    } catch (e: any) {
      Alert.alert('Could not plan day', e?.message ?? 'Unknown error.');
    } finally {
      setLoading(false);
    }
  }

  if (!mounted) return null;

  return (
    <Modal
      visible={mounted}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Animated.View
        style={[styles.backdrop, { opacity }]}
        pointerEvents={visible ? 'auto' : 'none'}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Dismiss" />
      </Animated.View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.kav}
        pointerEvents="box-none"
      >
        <Animated.View
          style={[
            styles.sheet,
            {
              backgroundColor: palette.background,
              paddingBottom: 16 + insets.bottom,
              transform: [{ translateY }],
            },
          ]}
        >
          <View style={styles.handle} />

          <View style={styles.titleRow}>
            <View style={styles.titleText}>
              <ThemedText type="sen-title-2">Plan my day</ThemedText>
              <ThemedText
                type="sen-body"
                lightColor={Colors.light.textMuted}
                darkColor={Colors.dark.textMuted}
              >
                Talk through what's on your plate. AI will lay it out.
              </ThemedText>
            </View>
            <Pressable
              onPress={onClose}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Close"
              style={({ pressed }) => [
                styles.closeButton,
                { backgroundColor: palette.bgSecondary },
                pressed && { opacity: 0.6 },
              ]}
            >
              <IconSymbol name="xmark" size={14} color={palette.textMuted} />
            </Pressable>
          </View>

          <TextInput
            ref={inputRef}
            value={text}
            onChangeText={setText}
            placeholder="e.g. CSE 480 at 2:30, midterm prep, gym before class…"
            placeholderTextColor={palette.textMuted}
            multiline
            editable={!loading}
            style={[
              styles.input,
              {
                color: palette.text,
                backgroundColor: palette.bgSecondary,
              },
            ]}
            accessibilityLabel="Plan description"
          />

          <View style={styles.voiceInputRow}>
            <Pressable
              onPress={() => {
                // Voice recording logic would go here
                Alert.alert('Voice Input', 'Voice recording is coming soon!');
              }}
              style={({ pressed }) => [
                styles.voiceInputButton,
                { backgroundColor: palette.bgSecondary },
                pressed && { opacity: 0.7 },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Voice input"
            >
              <IconSymbol name="mic.fill" size={20} color={palette.accent} />
            </Pressable>
            <ThemedText
              type="sen-caption"
              style={styles.voiceInputText}
              lightColor={Colors.light.textMuted}
              darkColor={Colors.dark.textMuted}
            >
              Tap to speak your plan
            </ThemedText>
          </View>

          <Pressable
            onPress={handlePlan}
            disabled={loading || text.trim().length === 0}
            accessibilityRole="button"
            accessibilityLabel="Plan with AI"
            style={({ pressed }) => [
              styles.primaryButton,
              {
                backgroundColor:
                  loading || text.trim().length === 0
                    ? palette.textDisabled
                    : palette.buttonFill,
                opacity: pressed && !loading ? 0.85 : 1,
              },
            ]}
          >
            {loading ? (
              <ActivityIndicator color={palette.buttonLabel} />
            ) : (
              <View style={styles.primaryButtonInner}>
                <IconSymbol name="sparkles" size={18} color={palette.buttonLabel} />
                <ThemedText
                  type="sen-headline"
                  lightColor={Colors.light.buttonLabel}
                  darkColor={Colors.dark.buttonLabel}
                >
                  Plan with AI
                </ThemedText>
              </View>
            )}
          </Pressable>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  kav: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    paddingHorizontal: 24,
    paddingTop: 10,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    gap: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 12,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(127,127,127,0.35)',
    marginBottom: 4,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  titleText: {
    flex: 1,
    gap: 4,
  },
  closeButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    minHeight: 160,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: 12,
    fontSize: 16,
    textAlignVertical: 'top',
    lineHeight: 22,
  },
  primaryButton: {
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    minHeight: 52,
  },
  primaryButtonInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  voiceInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 4,
  },
  voiceInputButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  voiceInputText: {
    fontSize: 14,
  },
});
