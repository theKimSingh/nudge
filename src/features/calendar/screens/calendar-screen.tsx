import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Calendar } from 'react-native-calendars';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/src/components/themed-text';
import { ThemedView } from '@/src/components/themed-view';
import { GlassSurface } from '@/src/components/ui/glass-surface';
import { IconSymbol } from '@/src/components/ui/icon-symbol';
import { Colors, Fonts } from '@/src/constants/theme';
import { useColorScheme } from '@/src/hooks/use-color-scheme';
import { DayDetailSheet } from '@/src/features/calendar/components/day-detail-sheet';
import {
  fetchAndParseICS,
  MarkedDates,
  parseICSString,
} from '@/src/features/calendar/utils/calendar-parser';
import { CATEGORY_META } from '@/src/features/todo/category-meta';
import { TaskFormModal } from '@/src/features/todo/components/task-form-modal';
import { useTasks } from '@/src/features/todo/context/tasks-context';
import {
  dateKey,
  expandRepeatDates,
  type RepeatRule,
} from '@/src/features/todo/types';
import { importICSAsTasks } from '../utils/import-ics';

const SCREEN_WIDTH = Dimensions.get('window').width;
const H_PADDING = 20;
const CALENDAR_WIDTH = SCREEN_WIDTH - H_PADDING * 2;
const DAY_WIDTH = CALENDAR_WIDTH / 7;
const CELL_HEIGHT = 96;

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const getLocalDateString = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// Parse a YYYY-MM-DD key in local time. `new Date('2026-05-01')` parses as UTC
// midnight, which renders the previous month for users behind UTC — so split
// the parts and build a local Date instead.
const getMonthYear = (key: string) => {
  const [y, m] = key.split('-').map(Number);
  const date = new Date(y, m - 1, 1);
  return { month: date.toLocaleString('default', { month: 'long' }), year: y };
};

export function CalendarScreen() {
  const scheme = useColorScheme() ?? 'light';
  const palette = Colors[scheme];
  const { tasks, addTaskInstance, addTaskSeries } = useTasks();

  const [url, setUrl] = useState('');
  const [importedDates, setImportedDates] = useState<MarkedDates>({});
  const [loading, setLoading] = useState(false);
  const [currentDate, setCurrentDate] = useState(getLocalDateString(new Date()));

  const [magicText, setMagicText] = useState('');
  const [magicLoading, setMagicLoading] = useState(false);

  const [isImportVisible, setIsImportVisible] = useState(false);
  const [isAddVisible, setIsAddVisible] = useState(false);
  const [dayDetailDate, setDayDetailDate] = useState<string | null>(null);

  const markedDates = useMemo<MarkedDates>(() => {
    const out: MarkedDates = {};
    for (const [dateStr, dayData] of Object.entries(importedDates)) {
      out[dateStr] = { events: [...dayData.events] };
    }
    for (const t of tasks) {
      if (!out[t.date]) out[t.date] = { events: [] };
      out[t.date].events.push({
        // Tie pill color to the same category schema the todo screen uses for
        // its dots, so a task reads the same on both screens.
        title: t.title,
        color: CATEGORY_META[t.category]?.color ?? CATEGORY_META.other.color,
        done: t.done,
      });
    }
    return out;
  }, [importedDates, tasks]);

  const handleImport = async () => {
    if (!url.trim()) {
      Alert.alert('Error', 'Please enter a valid ICS URL');
      return;
    }

    setLoading(true);
    try {
      const parsedDates = await fetchAndParseICS(url);
      importICSAsTasks(parsedDates, addTaskSeries);
      Alert.alert('Success', 'Calendar events imported successfully!');
      setUrl('');
      setIsImportVisible(false);
    } catch (error: any) {
      console.error('Import error:', error);
      Alert.alert('Error', error.message || 'Failed to import calendar events.');
    } finally {
      setLoading(false);
    }
  };

  const handleMagicImport = async () => {
    if (!magicText.trim()) {
      Alert.alert('Error', 'Please enter your schedule text');
      return;
    }

    setMagicLoading(true);
    try {
      const apiUrl =
        Platform.OS === 'android'
          ? 'http://10.0.2.2:8000/generate-ics'
          : 'http://localhost:8000/generate-ics';

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: magicText }),
      });

      if (!response.ok) {
        throw new Error(`Backend error: ${response.statusText}`);
      }

      const icsData = await response.text();
      const newMarkedDates = parseICSString(icsData);

      setImportedDates((prev) => {
        const merged = { ...prev };
        for (const [dateStr, dayData] of Object.entries(newMarkedDates)) {
          if (!merged[dateStr]) {
            merged[dateStr] = { events: [] };
          }
          merged[dateStr].events.push(...dayData.events);
        }
        return merged;
      });

      Alert.alert('Success', 'Magic schedule imported!');
      setMagicText('');
      setIsImportVisible(false);
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to import magic schedule.');
    } finally {
      setMagicLoading(false);
    }
  };

  const { month, year } = useMemo(() => getMonthYear(currentDate), [currentDate]);

  const changeDate = (offset: number) => {
    const [y, m, d] = currentDate.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    date.setMonth(date.getMonth() + offset);
    setCurrentDate(getLocalDateString(date));
  };

  function saveTask(draft: {
    title: string;
    time_minutes: number;
    duration_minutes: number;
    repeat_rule: RepeatRule;
  }) {
    // The header add is a quick-capture with no selected day, so it targets
    // today — matching the modal's default time-of-now behaviour. Per-day adds
    // happen inside the day-detail sheet.
    const todayKey = dateKey(new Date());
    const template = {
      title: draft.title,
      time_minutes: draft.time_minutes,
      duration_minutes: draft.duration_minutes,
      done: false,
      repeat_rule: draft.repeat_rule,
      source: 'todo_list' as const,
    };

    if (draft.repeat_rule === 'none') {
      addTaskInstance({ ...template, date: todayKey });
    } else {
      const dates = expandRepeatDates(todayKey, draft.repeat_rule);
      addTaskSeries(template, dates);
    }
  }

  const [initialLoading, setInitialLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setInitialLoading(true);
      await new Promise((res) => setTimeout(res, 1500));
      setInitialLoading(false);
    };

    load();
  }, []);

  const openDayDetail = useCallback((dateString: string) => {
    setDayDetailDate(dateString);
  }, []);

  const renderDay = useCallback(
    ({ date, state }: any) => {
      const dateString = date?.dateString;
      if (!dateString) return <View style={{ width: DAY_WIDTH, height: CELL_HEIGHT }} />;

      const isToday = state === 'today';
      const isCurrentMonth = state !== 'disabled';

      if (initialLoading) {
        return (
          <View style={[styles.dayCell, { borderColor: palette.border }]}>
            <View
              style={[styles.skelDate, { backgroundColor: palette.bgTertiary }]}
            />
            <View
              style={[styles.skelBar, { backgroundColor: palette.bgSecondary }]}
            />
            <View
              style={[styles.skelBarShort, { backgroundColor: palette.bgSecondary }]}
            />
          </View>
        );
      }

      const events = markedDates[dateString]?.events ?? [];
      const MAX_VISIBLE = 3;
      const overflowing = events.length > MAX_VISIBLE;
      const visibleEvents = overflowing ? events.slice(0, MAX_VISIBLE - 1) : events;
      const hiddenCount = events.length - visibleEvents.length;

      return (
        <Pressable
          onPress={() => openDayDetail(dateString)}
          style={({ pressed }) => [
            styles.dayCell,
            { borderColor: palette.border },
            isToday && { backgroundColor: palette.bgSecondary },
            pressed && { opacity: 0.85 },
          ]}
        >
          <View style={[styles.dateBadge, isToday && { backgroundColor: palette.buttonFill }]}>
            <ThemedText
              type="sen-caption-bold"
              lightColor={
                isToday
                  ? Colors.light.buttonLabel
                  : isCurrentMonth
                    ? Colors.light.text
                    : Colors.light.textDisabled
              }
              darkColor={
                isToday
                  ? Colors.dark.buttonLabel
                  : isCurrentMonth
                    ? Colors.dark.text
                    : Colors.dark.textDisabled
              }
            >
              {date?.day}
            </ThemedText>
          </View>

          <View style={styles.events}>
            {visibleEvents.map((event, index) => (
              <View
                key={index}
                style={[
                  styles.pill,
                  { backgroundColor: event.color },
                  event.done && styles.pillDone,
                ]}
              >
                <Text
                  style={[styles.pillText, event.done && styles.pillTextDone]}
                  numberOfLines={1}
                  allowFontScaling={false}
                >
                  {event.title}
                </Text>
              </View>
            ))}
            {hiddenCount > 0 && (
              <ThemedText
                type="sen-caption-2"
                lightColor={Colors.light.textMuted}
                darkColor={Colors.dark.textMuted}
                numberOfLines={1}
                style={styles.moreText}
              >
                +{hiddenCount} more
              </ThemedText>
            )}
          </View>
        </Pressable>
      );
    },
    [markedDates, initialLoading, openDayDetail, palette],
  );

  return (
    <ThemedView style={styles.root}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.titleRow}>
            <ThemedText type="sen-title-2">{year}</ThemedText>
            <View style={styles.actions}>
              <HeaderButton
                icon="square.and.arrow.down"
                label="Import calendar"
                onPress={() => setIsImportVisible(true)}
                palette={palette}
              />
              <HeaderButton
                icon="plus"
                label="Add task"
                onPress={() => setIsAddVisible(true)}
                palette={palette}
              />
            </View>
          </View>

          <View style={styles.monthRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Previous month"
              onPress={() => changeDate(-1)}
              hitSlop={12}
              style={({ pressed }) => [styles.monthChevron, pressed && { opacity: 0.5 }]}
            >
              <IconSymbol name="chevron.left" size={20} color={palette.textMuted} />
            </Pressable>
            <ThemedText type="sen-title-3" style={styles.monthText}>
              {month}
            </ThemedText>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Next month"
              onPress={() => changeDate(1)}
              hitSlop={12}
              style={({ pressed }) => [styles.monthChevron, pressed && { opacity: 0.5 }]}
            >
              <IconSymbol name="chevron.right" size={20} color={palette.textMuted} />
            </Pressable>
          </View>

          {/* Calendar */}
          <View style={styles.weekHeader}>
            {WEEKDAYS.map((day) => (
              <ThemedText
                key={day}
                type="sen-caption-bold"
                lightColor={Colors.light.textMuted}
                darkColor={Colors.dark.textMuted}
                style={styles.weekHeaderText}
              >
                {day}
              </ThemedText>
            ))}
          </View>
          {/* Single-month Calendar (not CalendarList). The virtualized,
              horizontally-paging CalendarList + a heavy custom dayComponent has
              documented scroll-index render crashes on mount; Calendar renders
              one month with no FlatList, and enableSwipeMonths uses a
              lightweight PanResponder for month swiping. Chevron nav drives the
              `initialDate` prop, which the library re-reads on change. */}
          <Calendar
            initialDate={currentDate}
            enableSwipeMonths={true}
            hideExtraDays={false}
            showSixWeeks={true}
            onMonthChange={(m) => {
              if (m?.dateString && m.dateString !== currentDate) {
                setCurrentDate(m.dateString);
              }
            }}
            dayComponent={renderDay}
            hideArrows={true}
            renderHeader={() => null}
            style={[styles.calendar, { width: CALENDAR_WIDTH, backgroundColor: palette.background }]}
            theme={
              {
                calendarBackground: 'transparent',
                textSectionTitleColor: palette.textMuted,
                // Strip the library's default 5px side padding and inter-week
                // margin so the day columns span the full width and line up
                // with our weekday header (each column == DAY_WIDTH).
                'stylesheet.calendar.main': {
                  container: { paddingLeft: 0, paddingRight: 0, backgroundColor: 'transparent' },
                  monthView: { backgroundColor: 'transparent' },
                  week: {
                    marginVertical: 0,
                    flexDirection: 'row',
                    justifyContent: 'space-around',
                  },
                },
                'stylesheet.calendar.header': {
                  header: { display: 'none' },
                  week: { display: 'none' },
                },
                'stylesheet.day.basic': {
                  base: {
                    width: DAY_WIDTH,
                    height: CELL_HEIGHT,
                    alignItems: 'center',
                    padding: 0,
                    margin: 0,
                  },
                },
              } as any
            }
          />
        </View>
      </SafeAreaView>

      {/* Import Modal */}
      <Modal
        visible={isImportVisible}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setIsImportVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={[styles.modalContent, { backgroundColor: palette.background }]}>
            <ThemedText type="sen-title-2" style={styles.modalTitle}>
              Import Calendar
            </ThemedText>
            <ThemedText
              type="sen-body"
              lightColor={Colors.light.textSecondary}
              darkColor={Colors.dark.textSecondary}
              style={styles.modalSubtitle}
            >
              Paste an .ics URL or use AI to parse a schedule.
            </ThemedText>

            <ThemedText
              type="sen-caption-bold"
              lightColor={Colors.light.textMuted}
              darkColor={Colors.dark.textMuted}
              style={styles.importSectionLabel}
            >
              FROM URL
            </ThemedText>
            <View style={[styles.importContainer, { backgroundColor: palette.bgSecondary }]}>
              <TextInput
                style={[styles.input, { color: palette.text }]}
                placeholder="Paste .ics link here..."
                placeholderTextColor={palette.textMuted}
                value={url}
                onChangeText={setUrl}
                autoCapitalize="none"
                keyboardType="url"
              />
              {loading ? (
                <ActivityIndicator style={{ marginLeft: 10 }} size="small" color={palette.text} />
              ) : (
                <TouchableOpacity
                  style={[styles.importButton, { backgroundColor: palette.buttonFill }]}
                  onPress={handleImport}
                >
                  <ThemedText
                    type="sen-caption-bold"
                    lightColor={Colors.light.buttonLabel}
                    darkColor={Colors.dark.buttonLabel}
                  >
                    Import
                  </ThemedText>
                </TouchableOpacity>
              )}
            </View>

            <ThemedText
              type="sen-caption-bold"
              lightColor={Colors.light.textMuted}
              darkColor={Colors.dark.textMuted}
              style={styles.importSectionLabel}
            >
              FROM TEXT (AI)
            </ThemedText>
            <View style={[styles.magicImportContainer, { backgroundColor: palette.bgSecondary }]}>
              <TextInput
                style={[styles.magicInput, { color: palette.text }]}
                placeholder="Paste raw schedule text..."
                placeholderTextColor={palette.textMuted}
                value={magicText}
                onChangeText={setMagicText}
                multiline={true}
              />
              {magicLoading ? (
                <ActivityIndicator style={{ marginLeft: 10 }} size="small" color={palette.text} />
              ) : (
                <TouchableOpacity
                  style={[styles.magicImportButton, { backgroundColor: palette.accent }]}
                  onPress={handleMagicImport}
                >
                  <Text style={styles.magicImportButtonText}>AI Import</Text>
                </TouchableOpacity>
              )}
            </View>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => setIsImportVisible(false)}
              >
                <ThemedText
                  type="sen-headline"
                  lightColor={Colors.light.textSecondary}
                  darkColor={Colors.dark.textSecondary}
                >
                  Close
                </ThemedText>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Default add modal (same as the todo screen) */}
      <TaskFormModal
        visible={isAddVisible}
        onClose={() => setIsAddVisible(false)}
        onSave={saveTask}
      />

      <DayDetailSheet
        visible={dayDetailDate !== null}
        dateKey={dayDetailDate}
        onClose={() => setDayDetailDate(null)}
      />
    </ThemedView>
  );
}

function HeaderButton({
  icon,
  label,
  onPress,
  palette,
}: {
  icon: 'square.and.arrow.down' | 'plus';
  label: string;
  onPress: () => void;
  palette: typeof Colors.light;
}) {
  return (
    <View style={styles.glassWrap}>
      <GlassSurface tint="regular" interactive scheme="auto" style={styles.glassInner}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={label}
          onPress={onPress}
          hitSlop={6}
          style={({ pressed }) => [
            styles.glassPress,
            { transform: [{ scale: pressed ? 0.94 : 1 }] },
          ]}
        >
          <IconSymbol name={icon} size={18} color={palette.surfaceText} />
        </Pressable>
      </GlassSurface>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  container: {
    flex: 1,
    paddingHorizontal: H_PADDING,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 16,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
  },
  glassWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 4,
  },
  glassInner: {
    width: 44,
    height: 44,
    borderRadius: 22,
    overflow: 'hidden',
  },
  glassPress: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  monthChevron: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  monthText: {
    flex: 1,
    textAlign: 'center',
  },
  weekHeader: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  weekHeaderText: {
    width: DAY_WIDTH,
    textAlign: 'center',
  },
  calendar: {
    minHeight: CELL_HEIGHT * 6,
  },
  dayCell: {
    width: '100%',
    height: CELL_HEIGHT,
    alignItems: 'center',
    paddingTop: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderRightWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  dateBadge: {
    minWidth: 22,
    height: 22,
    paddingHorizontal: 6,
    borderRadius: 11,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 3,
  },
  events: {
    width: '100%',
    paddingHorizontal: 3,
    gap: 2,
  },
  pill: {
    paddingVertical: 1,
    paddingHorizontal: 5,
    borderRadius: 5,
    width: '100%',
  },
  pillDone: {
    opacity: 0.55,
  },
  pillText: {
    fontFamily: Fonts.displayMedium,
    fontSize: 10,
    lineHeight: 14,
    color: '#1f1f1f',
  },
  pillTextDone: {
    textDecorationLine: 'line-through',
    color: '#555',
  },
  moreText: {
    paddingHorizontal: 4,
    fontSize: 10,
    lineHeight: 14,
  },
  skelDate: {
    width: 20,
    height: 20,
    borderRadius: 10,
    marginBottom: 6,
  },
  skelBar: {
    width: '80%',
    height: 6,
    borderRadius: 3,
    marginBottom: 4,
  },
  skelBarShort: {
    width: '60%',
    height: 6,
    borderRadius: 3,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    borderRadius: 20,
    padding: 24,
    width: '85%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 8,
  },
  modalTitle: {
    marginBottom: 4,
  },
  modalSubtitle: {
    marginBottom: 20,
  },
  importSectionLabel: {
    letterSpacing: 0.6,
    marginBottom: 8,
  },
  importContainer: {
    flexDirection: 'row',
    marginBottom: 16,
    alignItems: 'center',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  magicImportContainer: {
    flexDirection: 'row',
    marginBottom: 24,
    alignItems: 'center',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  input: {
    flex: 1,
    fontSize: 14,
  },
  magicInput: {
    flex: 1,
    fontSize: 14,
    maxHeight: 60,
  },
  importButton: {
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 15,
    marginLeft: 10,
  },
  magicImportButton: {
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 15,
    marginLeft: 10,
  },
  magicImportButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
  modalCancelButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
  },
});
