import DateTimePicker from '@react-native-community/datetimepicker';
import { useEffect, useRef, useState } from 'react';
import {
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

import {
  DURATION_OPTIONS_MINUTES,
  REPEAT_LABELS,
  dateToMinutes,
  formatDurationShort,
  formatTimeDisplay,
  minutesToDate,
  type RepeatRule,
  type Task,
} from '../types';

function durationToDate(minutes: number): Date {
  const d = new Date(0);
  d.setHours(Math.floor(minutes / 60));
  d.setMinutes(minutes % 60);
  return d;
}

type Draft = {
  title: string;
  timeMinutes: number;
  durationMinutes: number;
  repeat: RepeatRule;
};

type Props = {
  visible: boolean;
  initialTask?: Task | null;
  onClose: () => void;
  onSave: (draft: Draft) => void;
};

const REPEAT_OPTIONS: RepeatRule[] = ['none', 'daily', 'weekdays', 'weekly'];
const DEFAULT_DURATION_MINUTES = 30;

const SCREEN_HEIGHT = Dimensions.get('window').height;

function defaultDraft(): Draft {
  const now = new Date();
  return {
    title: '',
    timeMinutes: now.getHours() * 60 + now.getMinutes(),
    durationMinutes: DEFAULT_DURATION_MINUTES,
    repeat: 'none',
  };
}

export function TaskFormModal({ visible, initialTask, onClose, onSave }: Props) {
  const scheme = useColorScheme() ?? 'light';
  const palette = Colors[scheme];
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState<Draft>(defaultDraft);
  const [mounted, setMounted] = useState(false);
  const [expandedField, setExpandedField] = useState<'time' | 'duration' | null>(null);
  const inputRef = useRef<TextInput>(null);
  const prevVisibleRef = useRef(false);

  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(SCREEN_HEIGHT)).current;

  useEffect(() => {
    const wasVisible = prevVisibleRef.current;
    prevVisibleRef.current = visible;

    if (visible && !wasVisible) {
      setDraft(
        initialTask
          ? {
            title: initialTask.title,
            timeMinutes: initialTask.timeMinutes,
            durationMinutes: initialTask.durationMinutes,
            repeat: initialTask.repeat,
          }
          : defaultDraft(),
      );
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
      setExpandedField(null);
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
  }, [visible, initialTask, opacity, translateY]);

  const canSave = draft.title.trim().length > 0;

  function handleSave() {
    if (!canSave) return;
    onSave({ ...draft, title: draft.title.trim() });
    onClose();
  }

  const pickerAccent = scheme === 'dark' ? '#FFFFFF' : '#000000';

  return (
    <Modal
      visible={mounted}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Animated.View style={[styles.backdrop, { opacity }]} pointerEvents={visible ? 'auto' : 'none'}>
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
            <ThemedText type="sen-title-2">
              {initialTask ? 'Edit task' : 'New task'}
            </ThemedText>
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

          <Field label="Task">
            <TextInput
              ref={inputRef}
              value={draft.title}
              onChangeText={(t) => setDraft((d) => ({ ...d, title: t }))}
              placeholder="What needs to get done?"
              placeholderTextColor={palette.textMuted}
              style={[
                styles.input,
                {
                  color: palette.text,
                  backgroundColor: palette.bgSecondary,
                },
              ]}
              returnKeyType="done"
              onSubmitEditing={handleSave}
              accessibilityLabel="Task name"
            />
          </Field>

          <View style={styles.timeRow}>
            <View style={styles.timeCol}>
              <ThemedText
                type="sen-caption-bold"
                lightColor={Colors.light.textMuted}
                darkColor={Colors.dark.textMuted}
                style={styles.fieldLabel}
              >
                START TIME
              </ThemedText>
              <TimePill
                icon="clock"
                label={formatTimeDisplay(draft.timeMinutes)}
                active={expandedField === 'time'}
                onPress={() =>
                  setExpandedField((cur) => (cur === 'time' ? null : 'time'))
                }
                palette={palette}
              />
            </View>
            <View style={styles.timeCol}>
              <ThemedText
                type="sen-caption-bold"
                lightColor={Colors.light.textMuted}
                darkColor={Colors.dark.textMuted}
                style={styles.fieldLabel}
              >
                DURATION
              </ThemedText>
              <TimePill
                icon="clock"
                label={formatDurationShort(draft.durationMinutes)}
                active={expandedField === 'duration'}
                onPress={() =>
                  setExpandedField((cur) =>
                    cur === 'duration' ? null : 'duration',
                  )
                }
                palette={palette}
              />
            </View>
          </View>

          {expandedField === 'time' ? (
            <View style={styles.wheelHost}>
              <DateTimePicker
                value={minutesToDate(draft.timeMinutes)}
                mode="time"
                display="spinner"
                onChange={(_evt, d) => {
                  if (d) {
                    setDraft((cur) => ({ ...cur, timeMinutes: dateToMinutes(d) }));
                  }
                }}
                themeVariant={scheme}
                accentColor={pickerAccent}
                textColor={palette.text}
                style={styles.wheelPicker}
              />
            </View>
          ) : null}

          {expandedField === 'duration' ? (
            Platform.OS === 'ios' ? (
              <View style={styles.wheelHost}>
                <DateTimePicker
                  value={durationToDate(draft.durationMinutes)}
                  mode="countdown"
                  display="spinner"
                  minuteInterval={5}
                  onChange={(_evt, d) => {
                    if (d) {
                      const minutes = d.getHours() * 60 + d.getMinutes();
                      setDraft((cur) => ({
                        ...cur,
                        durationMinutes: Math.max(5, minutes),
                      }));
                    }
                  }}
                  themeVariant={scheme}
                  accentColor={pickerAccent}
                  textColor={palette.text}
                  style={styles.wheelPicker}
                />
              </View>
            ) : (
              <DurationChips
                value={draft.durationMinutes}
                onChange={(m) => setDraft((d) => ({ ...d, durationMinutes: m }))}
                palette={palette}
              />
            )
          ) : null}

          <Field label="Repeat">
            <Segmented
              options={REPEAT_OPTIONS}
              labels={REPEAT_LABELS}
              value={draft.repeat}
              onChange={(r) => setDraft((d) => ({ ...d, repeat: r }))}
              palette={palette}
            />
          </Field>

          <Pressable
            onPress={handleSave}
            disabled={!canSave}
            accessibilityRole="button"
            accessibilityLabel={initialTask ? 'Save task' : 'Add task'}
            style={({ pressed }) => [
              styles.saveButton,
              {
                backgroundColor: canSave ? palette.buttonFill : palette.textDisabled,
                opacity: pressed && canSave ? 0.85 : 1,
              },
            ]}
          >
            <ThemedText
              type="sen-headline"
              lightColor={Colors.light.buttonLabel}
              darkColor={Colors.dark.buttonLabel}
            >
              {initialTask ? 'Save' : 'Add task'}
            </ThemedText>
          </Pressable>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function Field({
  label,
  children,
  style,
}: {
  label: string;
  children: React.ReactNode;
  style?: object;
}) {
  return (
    <View style={[styles.field, style]}>
      <ThemedText
        type="sen-caption-bold"
        lightColor={Colors.light.textMuted}
        darkColor={Colors.dark.textMuted}
        style={styles.fieldLabel}
      >
        {label.toUpperCase()}
      </ThemedText>
      {children}
    </View>
  );
}

function TimePill({
  icon,
  label,
  active,
  onPress,
  palette,
  alignRight,
}: {
  icon: 'clock';
  label: string;
  active: boolean;
  onPress: () => void;
  palette: typeof Colors.light;
  alignRight?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ expanded: active }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.timePill,
        alignRight && styles.timePillRight,
        {
          backgroundColor: active ? palette.buttonFill : palette.bgSecondary,
        },
        pressed && { opacity: 0.7 },
      ]}
    >
      <IconSymbol
        name={icon}
        size={16}
        color={active ? palette.buttonLabel : palette.textMuted}
      />
      <ThemedText
        type="sen-headline"
        lightColor={active ? Colors.light.buttonLabel : Colors.light.text}
        darkColor={active ? Colors.dark.buttonLabel : Colors.dark.text}
      >
        {label}
      </ThemedText>
    </Pressable>
  );
}

function DurationChips({
  value,
  onChange,
  palette,
}: {
  value: number;
  onChange: (minutes: number) => void;
  palette: typeof Colors.light;
}) {
  return (
    <View style={styles.chipRow}>
      {DURATION_OPTIONS_MINUTES.map((minutes) => {
        const active = value === minutes;
        return (
          <Pressable
            key={minutes}
            accessibilityRole="button"
            accessibilityLabel={`${formatDurationShort(minutes)} duration`}
            accessibilityState={{ selected: active }}
            onPress={() => onChange(minutes)}
            style={({ pressed }) => [
              styles.chip,
              {
                backgroundColor: active ? palette.buttonFill : palette.bgSecondary,
                opacity: pressed ? 0.85 : 1,
              },
            ]}
          >
            <ThemedText
              type="sen-caption-bold"
              lightColor={active ? Colors.light.buttonLabel : Colors.light.text}
              darkColor={active ? Colors.dark.buttonLabel : Colors.dark.text}
            >
              {formatDurationShort(minutes)}
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}

function Segmented<T extends string>({
  options,
  labels,
  value,
  onChange,
  palette,
}: {
  options: T[];
  labels: Record<T, string>;
  value: T;
  onChange: (v: T) => void;
  palette: typeof Colors.light;
}) {
  return (
    <View style={[styles.segmented, { backgroundColor: palette.bgSecondary }]}>
      {options.map((opt) => {
        const active = value === opt;
        return (
          <Pressable
            key={opt}
            accessibilityRole="button"
            accessibilityLabel={labels[opt]}
            accessibilityState={{ selected: active }}
            onPress={() => onChange(opt)}
            style={[
              styles.segment,
              active && { backgroundColor: palette.buttonFill },
            ]}
          >
            <ThemedText
              type="sen-caption-bold"
              lightColor={active ? Colors.light.buttonLabel : Colors.light.textSecondary}
              darkColor={active ? Colors.dark.buttonLabel : Colors.dark.textSecondary}
            >
              {labels[opt]}
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
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
    gap: 20,
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
    marginBottom: 12,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  closeButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  field: {
    gap: 8,
  },
  fieldLabel: {
    letterSpacing: 0.6,
  },
  input: {
    fontSize: 17,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 12,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 12,
    gap: 12,
    minHeight: 52,
  },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
  },
  timeCol: {
    flex: 1,
    gap: 8,
  },
  fieldLabelRight: {
    textAlign: 'right',
  },
  timePill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    gap: 8,
    minHeight: 44,
  },
  timePillRight: {
    alignSelf: 'flex-end',
  },
  wheelHost: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 200,
    marginHorizontal: -24,
  },
  wheelPicker: {
    width: '100%',
    height: 200,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    minWidth: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmented: {
    flexDirection: 'row',
    borderRadius: 12,
    padding: 4,
    gap: 4,
  },
  segment: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    minHeight: 36,
  },
  saveButton: {
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    minHeight: 52,
    marginTop: 4,
  },
});
