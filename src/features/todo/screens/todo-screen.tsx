import { useEffect, useMemo, useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { SortableList, type RenderItemArgs } from '../components/sortable-list';

import { ThemedText } from '@/src/components/themed-text';
import { ThemedView } from '@/src/components/themed-view';
import { GlassSurface } from '@/src/components/ui/glass-surface';
import { IconSymbol } from '@/src/components/ui/icon-symbol';
import { Colors } from '@/src/constants/theme';
import { useColorScheme } from '@/src/hooks/use-color-scheme';
import { getProfile } from '@/src/backend/profiles';
import { useSession } from '@/src/backend/session';

import { ListeningOverlay } from '@/src/features/agent/components/listening-overlay';
import { useAgentSessionCtx } from '@/src/features/agent/context/agent-session-context';

import { GhostTaskRow } from '../components/ghost-task-row';
import { SectionHeader } from '../components/section-header';
import { SwipeableRow } from '../components/swipeable-row';
import { TaskFormModal } from '../components/task-form-modal';
import { TaskRow } from '../components/task-row';
import { WeeklyCalendar } from '../components/weekly-calendar';
import { useTasks } from '../context/tasks-context';
import { rescheduleSection } from '../smart-drop';
import {
  SECTION_ORDER,
  dateKey,
  deriveSection,
  expandRepeatDates,
  formatDurationCompact,
  formatTimeRange,
  type RepeatRule,
  type Task,
  type TaskSection,
} from '../types';

type ListItem =
  | { type: 'header'; section: TaskSection; key: string }
  | { type: 'task'; task: Task; key: string }
  | { type: 'placeholder'; section: TaskSection; key: string };

const WEEKDAYS = [
  'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday',
];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export function TodoScreen() {
  const scheme = useColorScheme() ?? 'light';
  const palette = Colors[scheme];
  const { session } = useSession();
  const {
    tasks: allTasks,
    addTaskInstance,
    addTaskSeries,
    toggleTask,
    deleteTask,
    deleteTaskSeries,
    editTask,
    replaceTasksForDate,
  } = useTasks();
  const [name, setName] = useState<string>('there');
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [modalOpen, setModalOpen] = useState(false);
  const [editTaskId, setEditTaskId] = useState<string | null>(null);
  const [collapsedSections, setCollapsedSections] = useState<
    Record<TaskSection, boolean>
  >({ morning: false, afternoon: false, evening: false });

  // Voice mode locks task interactions (checkbox, tap-to-edit, drag, swipe,
  // add). Scroll, section collapse, and weekly calendar day-tap stay enabled
  // so the user can still navigate the calendar while planning by voice.
  const { phase: agentPhase, setViewedDate } = useAgentSessionCtx();
  const voiceMode = agentPhase !== 'idle';

  const selectedKey = useMemo(() => dateKey(selectedDate), [selectedDate]);
  // Keep the agent's target day in sync with the day the user is viewing, so a
  // voice request schedules onto this day rather than always today.
  useEffect(() => {
    setViewedDate(selectedKey);
  }, [selectedKey, setViewedDate]);
  const tasks = useMemo(
    () => allTasks.filter((t) => t.date === selectedKey),
    [allTasks, selectedKey],
  );

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    getProfile(session.user.id)
      .then((p) => {
        if (!cancelled && p?.name) setName(p.name);
      })
      .catch(() => { });
    return () => {
      cancelled = true;
    };
  }, [session]);

  const grouped = useMemo(() => {
    const out: Record<TaskSection, Task[]> = {
      morning: [],
      afternoon: [],
      evening: [],
    };
    for (const t of tasks) out[deriveSection(t.time_minutes)].push(t);
    // Sort within each section by start time so the visual order matches
    // the chronological order. Without this, the diff-update from
    // replaceTasksForDate preserves task identity (good) but also
    // preserves the source array's iteration order — which doesn't
    // reflect a cross-section drag's new time. Sorting reconciles
    // visual + data after every reorder.
    for (const sec of SECTION_ORDER) {
      out[sec].sort((a, b) => a.time_minutes - b.time_minutes);
    }
    return out;
  }, [tasks]);

  function openAdd() {
    setEditTaskId(null);
    setModalOpen(true);
  }

  function openEdit(id: string) {
    setEditTaskId(id);
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditTaskId(null);
  }

  function shiftWeek(direction: 1 | -1) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Monday-anchored week, matching WeeklyCalendar's startOfWeek.
    const weekStart = new Date(selectedDate);
    const dow = weekStart.getDay();
    weekStart.setDate(weekStart.getDate() + (dow === 0 ? -6 : 1 - dow));
    weekStart.setHours(0, 0, 0, 0);

    const targetStart = new Date(weekStart);
    targetStart.setDate(weekStart.getDate() + 7 * direction);
    const targetEnd = new Date(targetStart);
    targetEnd.setDate(targetStart.getDate() + 6);

    if (today >= targetStart && today <= targetEnd) {
      setSelectedDate(today);
      return;
    }

    const next = new Date(targetStart);
    if (direction === -1) next.setDate(targetStart.getDate() + 6); // Sunday of prev week
    setSelectedDate(next);
  }

  function saveTask(draft: {
    title: string;
    time_minutes: number;
    duration_minutes: number;
    repeat_rule: RepeatRule;
  }) {
    if (editTaskId) {
      editTask(editTaskId, draft);
      return;
    }

    const template = {
      title: draft.title,
      time_minutes: draft.time_minutes,
      duration_minutes: draft.duration_minutes,
      done: false,
      repeat_rule: draft.repeat_rule,
    };

    if (draft.repeat_rule === 'none') {
      addTaskInstance({ ...template, date: selectedKey });
    } else {
      const dates = expandRepeatDates(selectedKey, draft.repeat_rule);
      addTaskSeries(template, dates);
    }
  }

  async function deleteTaskPermanently(task: Task) {
    try {
      await deleteTask(task.id);
    } catch (err) {
      Alert.alert(
        'Could not delete task',
        err instanceof Error ? err.message : 'Please try again.',
      );
    }
  }

  async function deleteSeriesFromDate(task: Task) {
    if (!task.series_id) return;
    try {
      await deleteTaskSeries(task.series_id, task.date);
    } catch (err) {
      Alert.alert(
        'Could not delete series',
        err instanceof Error ? err.message : 'Please try again.',
      );
    }
  }

  function confirmDeleteTask(task: Task) {
    const isSeries = !!task.series_id;

    if (Platform.OS === 'web') {
      if (isSeries) {
        const all = globalThis.confirm?.(
          `"${task.title}" repeats. OK = delete this and all future occurrences. Cancel = delete only this one.`,
        );
        if (all) {
          void deleteSeriesFromDate(task);
        } else {
          void deleteTaskPermanently(task);
        }
        return;
      }

      const confirmed = globalThis.confirm?.(
        `Delete "${task.title}" permanently?`,
      );
      if (confirmed) void deleteTaskPermanently(task);
      return;
    }

    if (isSeries) {
      Alert.alert(
        'This is a repeating task',
        `"${task.title}" repeats. What would you like to delete?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'This task only',
            onPress: () => {
              void deleteTaskPermanently(task);
            },
          },
          {
            text: 'This and future',
            style: 'destructive',
            onPress: () => {
              void deleteSeriesFromDate(task);
            },
          },
        ],
      );
      return;
    }

    Alert.alert(
      'Delete task permanently?',
      `"${task.title}" will be removed from your database.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            void deleteTaskPermanently(task);
          },
        },
      ],
    );
  }

  async function handleToggleTask(id: string) {
    try {
      await toggleTask(id);
    } catch (err) {
      Alert.alert(
        'Could not update task',
        err instanceof Error ? err.message : 'Please try again.',
      );
    }
  }

  const editingTask = editTaskId ? tasks.find((t) => t.id === editTaskId) ?? null : null;

  const listData = useMemo<ListItem[]>(() => {
    const items: ListItem[] = [];
    for (const section of SECTION_ORDER) {
      items.push({ type: 'header', section, key: `h-${section}` });
      if (collapsedSections[section]) continue;
      if (grouped[section].length === 0) {
        items.push({ type: 'placeholder', section, key: `p-${section}` });
      } else {
        for (const t of grouped[section]) {
          items.push({ type: 'task', task: t, key: `t-${t.id}` });
        }
      }
    }
    return items;
  }, [grouped, collapsedSections]);

  function handleDragEnd({
    data,
    from,
    to,
  }: {
    data: ListItem[];
    from: number;
    to: number;
  }) {
    if (from === to) return;
    const droppedItem = data[to];
    if (droppedItem.type !== 'task') return;

    let destSection: TaskSection = 'morning';
    let posInDest = 0;
    let cur: TaskSection = 'morning';
    let countInCur = 0;
    for (let i = 0; i < data.length; i++) {
      const item = data[i];
      if (item.type === 'header') {
        cur = item.section;
        countInCur = 0;
      } else if (item.type === 'task') {
        if (i === to) {
          destSection = cur;
          posInDest = countInCur;
        }
        countInCur++;
      }
    }

    // Collapsed-section drops are intentionally append-only: there are no
    // visible task rows to land "between," and we want the section to stay
    // collapsed after the drop.
    if (collapsedSections[destSection]) {
      posInDest = grouped[destSection].length;
    }

    // Rebuild on the full grouped map so collapsed-section tasks survive
    // (only the visible data is in `data`).
    const groupedNew: Record<TaskSection, Task[]> = {
      morning: [...grouped.morning],
      afternoon: [...grouped.afternoon],
      evening: [...grouped.evening],
    };
    const fromSection = deriveSection(droppedItem.task.time_minutes);
    groupedNew[fromSection] = groupedNew[fromSection].filter(
      (t) => t.id !== droppedItem.task.id,
    );
    groupedNew[destSection].splice(posInDest, 0, droppedItem.task);
    groupedNew[destSection] = rescheduleSection(
      groupedNew[destSection],
      destSection,
      posInDest,
    );

    const next: Task[] = [];
    for (const sec of SECTION_ORDER) next.push(...groupedNew[sec]);
    replaceTasksForDate(selectedKey, next);
  }

  const renderItem = ({ item, isActive }: RenderItemArgs<ListItem>) => {
    if (item.type === 'header') {
      return (
        <SectionHeader
          section={item.section}
          count={grouped[item.section].length}
          collapsed={collapsedSections[item.section]}
          onToggle={() =>
            setCollapsedSections((c) => ({
              ...c,
              [item.section]: !c[item.section],
            }))
          }
        />
      );
    }
    if (item.type === 'placeholder') {
      return (
        <Animated.View
          entering={FadeIn.duration(280)}
          exiting={FadeOut.duration(280)}
        >
          <GhostTaskRow
            section={item.section}
            onPress={voiceMode ? () => {} : openAdd}
          />
        </Animated.View>
      );
    }
    return (
      <Animated.View
        entering={FadeIn.duration(280)}
        exiting={FadeOut.duration(280)}
      >
        <SwipeableRow
          onDelete={() => confirmDeleteTask(item.task)}
          enabled={!isActive && !voiceMode}
        >
          <TaskRow
            title={item.task.title}
            time={formatTimeRange(item.task.time_minutes, item.task.duration_minutes)}
            duration={formatDurationCompact(item.task.duration_minutes)}
            done={item.task.done}
            category={item.task.category}
            isDragging={isActive}
            disabled={voiceMode}
            onToggle={() => {
              void handleToggleTask(item.task.id);
            }}
          />
        </SwipeableRow>
      </Animated.View>
    );
  };

  const canDrag = (item: ListItem) => item.type === 'task' && !voiceMode;

  const dayLabel = WEEKDAYS[selectedDate.getDay()];
  const dateLabel = `${MONTHS[selectedDate.getMonth()]} ${selectedDate.getDate()}`;

  const listHeader = (
    <>
      <View style={styles.header}>
        <View style={styles.greetingRow}>
          <ThemedText type="sen-title-2" style={styles.greeting}>
            Hello, {name}
          </ThemedText>
          <View style={styles.actions}>
            {voiceMode ? null : (
              <ActionButton
                icon="plus"
                label="Add task"
                onPress={openAdd}
                palette={palette}
              />
            )}
          </View>
        </View>
        <View style={styles.dateRow}>
          <ThemedText type="sen-title-3">{dayLabel}</ThemedText>
          <ThemedText type="sen-title-3">{dateLabel}</ThemedText>
        </View>
      </View>

      <View style={styles.weekWrap}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Previous week"
          onPress={() => shiftWeek(-1)}
          hitSlop={12}
          style={({ pressed }) => [styles.weekChevron, pressed && { opacity: 0.5 }]}
        >
          <IconSymbol name="chevron.left" size={20} color={palette.textMuted} />
        </Pressable>
        <View style={styles.weekCalendarWrap}>
          <WeeklyCalendar
            selectedDate={selectedDate}
            onSelectDate={setSelectedDate}
          />
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Next week"
          onPress={() => shiftWeek(1)}
          hitSlop={12}
          style={({ pressed }) => [styles.weekChevron, pressed && { opacity: 0.5 }]}
        >
          <IconSymbol name="chevron.right" size={20} color={palette.textMuted} />
        </Pressable>
      </View>
    </>
  );

  return (
    <ThemedView style={styles.root}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <SortableList
          data={listData}
          keyExtractor={(item) => item.key}
          onDragEnd={handleDragEnd}
          renderItem={renderItem}
          canDrag={canDrag}
          onItemTap={(item) => {
            if (voiceMode) return;
            if (item.type === 'task') openEdit(item.task.id);
          }}
          activationDistance={8}
          contentContainerStyle={styles.scrollContent}
          ListHeaderComponent={listHeader}
        />
      </SafeAreaView>

      <ListeningOverlay />

      <TaskFormModal
        visible={modalOpen}
        initialTask={editingTask}
        onClose={closeModal}
        onSave={saveTask}
        onDelete={
          editingTask ? () => confirmDeleteTask(editingTask) : undefined
        }
      />

    </ThemedView>
  );
}

function ActionButton({
  icon,
  label,
  onPress,
  palette,
  active,
}: {
  icon: 'pencil' | 'plus' | 'mic.fill';
  label: string;
  onPress: () => void;
  palette: typeof Colors.light;
  active?: boolean;
}) {
  // Idle: no tintColor so the system Liquid Glass material renders its
  // natural chrome look, matching the native tab bar. Active (voice mode):
  // dark tint so the button reads as a distinct "engaged" state.
  return (
    <View style={styles.actionButton}>
      <GlassSurface
        tint="regular"
        interactive
        scheme={active ? 'dark' : 'auto'}
        tintColor={active ? 'rgba(14,14,16,0.55)' : undefined}
        style={styles.actionGlass}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={label}
          accessibilityState={{ selected: active }}
          onPress={onPress}
          hitSlop={6}
          style={({ pressed }) => [
            styles.actionPress,
            { transform: [{ scale: pressed ? 0.94 : 1 }] },
          ]}
        >
          <IconSymbol
            name={icon}
            size={18}
            color={active ? '#FFFFFF' : palette.surfaceText}
          />
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
  scrollContent: {
    paddingTop: 8,
    // Room for the native Liquid Glass tab bar + the floating mic FAB above it.
    paddingBottom: 120,
  },
  header: {
    paddingHorizontal: 24,
    paddingTop: 0,
    gap: 32,
  },
  greetingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  greeting: {
    flex: 1,
  },
  dateRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  weekWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 8,
    paddingBottom: 8,
  },
  weekCalendarWrap: {
    flex: 1,
  },
  weekChevron: {
    paddingHorizontal: 12,
    paddingVertical: 16,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 4,
  },
  actionGlass: {
    width: 44,
    height: 44,
    borderRadius: 22,
    overflow: 'hidden',
  },
  actionPress: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
