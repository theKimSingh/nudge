import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Dimensions,
  Easing,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import Reanimated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/src/components/themed-text';
import { GlassSurface } from '@/src/components/ui/glass-surface';
import { IconSymbol } from '@/src/components/ui/icon-symbol';
import { Colors } from '@/src/constants/theme';
import { useColorScheme } from '@/src/hooks/use-color-scheme';
import { GhostTaskRow } from '@/src/features/todo/components/ghost-task-row';
import { SectionHeader } from '@/src/features/todo/components/section-header';
import {
  SortableList,
  type RenderItemArgs,
} from '@/src/features/todo/components/sortable-list';
import { SwipeableRow } from '@/src/features/todo/components/swipeable-row';
import { TaskFormModal } from '@/src/features/todo/components/task-form-modal';
import { TaskRow } from '@/src/features/todo/components/task-row';
import { useTasks } from '@/src/features/todo/context/tasks-context';
import { rescheduleSection } from '@/src/features/todo/smart-drop';
import {
  SECTION_ORDER,
  deriveSection,
  expandRepeatDates,
  formatDurationCompact,
  formatTimeRange,
  type RepeatRule,
  type Task,
  type TaskSection,
} from '@/src/features/todo/types';

type ListItem =
  | { type: 'header'; section: TaskSection; key: string }
  | { type: 'task'; task: Task; key: string }
  | { type: 'placeholder'; section: TaskSection; key: string };

type Props = {
  visible: boolean;
  dateKey: string | null;
  onClose: () => void;
};

const SCREEN_HEIGHT = Dimensions.get('window').height;

const WEEKDAYS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];
const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

function formatDateLabel(key: string): string {
  const [y, m, d] = key.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return `${WEEKDAYS[date.getDay()]}, ${MONTHS[date.getMonth()]} ${date.getDate()}`;
}

export function DayDetailSheet({ visible, dateKey, onClose }: Props) {
  const scheme = useColorScheme() ?? 'light';
  const palette = Colors[scheme];
  const insets = useSafeAreaInsets();
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

  const [formOpen, setFormOpen] = useState(false);
  const [editTaskId, setEditTaskId] = useState<string | null>(null);
  const [collapsedSections, setCollapsedSections] = useState<
    Record<TaskSection, boolean>
  >({ morning: false, afternoon: false, evening: false });
  const [mounted, setMounted] = useState(false);

  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const prevVisibleRef = useRef(false);

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

  const tasks = useMemo(
    () => (dateKey ? allTasks.filter((t) => t.date === dateKey) : []),
    [allTasks, dateKey],
  );

  const grouped = useMemo(() => {
    const out: Record<TaskSection, Task[]> = {
      morning: [],
      afternoon: [],
      evening: [],
    };
    for (const t of tasks) out[deriveSection(t.time_minutes)].push(t);
    for (const sec of SECTION_ORDER) {
      out[sec].sort((a, b) => a.time_minutes - b.time_minutes);
    }
    return out;
  }, [tasks]);

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

  function openAdd() {
    setEditTaskId(null);
    setFormOpen(true);
  }

  function openEdit(id: string) {
    setEditTaskId(id);
    setFormOpen(true);
  }

  function closeForm() {
    setFormOpen(false);
    setEditTaskId(null);
  }

  function saveTask(draft: {
    title: string;
    time_minutes: number;
    duration_minutes: number;
    repeat_rule: RepeatRule;
  }) {
    if (!dateKey) return;

    if (editTaskId) {
      editTask(editTaskId, {
        title: draft.title,
        time_minutes: draft.time_minutes,
        duration_minutes: draft.duration_minutes,
        repeat_rule: draft.repeat_rule,
      });
      return;
    }

    const template = {
      title: draft.title,
      time_minutes: draft.time_minutes,
      duration_minutes: draft.duration_minutes,
      done: false,
      repeat_rule: draft.repeat_rule,
      source: 'todo_list' as const,
    };

    if (draft.repeat_rule === 'none') {
      addTaskInstance({ ...template, date: dateKey });
    } else {
      const dates = expandRepeatDates(dateKey, draft.repeat_rule);
      addTaskSeries(template, dates);
    }
  }

  function handleDragEnd({
    data,
    from,
    to,
  }: {
    data: ListItem[];
    from: number;
    to: number;
  }) {
    if (from === to || !dateKey) return;
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

    if (collapsedSections[destSection]) {
      posInDest = grouped[destSection].length;
    }

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
    replaceTasksForDate(dateKey, next);
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
        <Reanimated.View
          entering={FadeIn.duration(280)}
          exiting={FadeOut.duration(280)}
        >
          <GhostTaskRow section={item.section} onPress={openAdd} />
        </Reanimated.View>
      );
    }
    return (
      <Reanimated.View
        entering={FadeIn.duration(280)}
        exiting={FadeOut.duration(280)}
      >
        <SwipeableRow
          onDelete={() => confirmDeleteTask(item.task)}
          enabled={!isActive}
        >
          <TaskRow
            title={item.task.title}
            time={formatTimeRange(item.task.time_minutes, item.task.duration_minutes)}
            duration={formatDurationCompact(item.task.duration_minutes)}
            done={item.task.done}
            category={item.task.category}
            isDragging={isActive}
            onToggle={() => {
              void handleToggleTask(item.task.id);
            }}
          />
        </SwipeableRow>
      </Reanimated.View>
    );
  };

  const canDrag = (item: ListItem) => item.type === 'task';

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
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityLabel="Dismiss"
        />
      </Animated.View>

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

        <View style={styles.header}>
          <ThemedText type="sen-title-2" style={styles.headerTitle}>
            {dateKey ? formatDateLabel(dateKey) : ''}
          </ThemedText>
          <View style={styles.actions}>
            <GlassAddButton onPress={openAdd} palette={palette} />
          </View>
        </View>

        <View style={styles.listWrap}>
          <SortableList
            data={listData}
            keyExtractor={(item) => item.key}
            onDragEnd={handleDragEnd}
            renderItem={renderItem}
            canDrag={canDrag}
            onItemTap={(item) => {
              if (item.type === 'task') openEdit(item.task.id);
            }}
            activationDistance={8}
            contentContainerStyle={styles.scrollContent}
          />
        </View>
      </Animated.View>

      <TaskFormModal
        visible={formOpen}
        initialTask={editingTask}
        onClose={closeForm}
        onSave={saveTask}
        onDelete={editingTask ? () => confirmDeleteTask(editingTask) : undefined}
      />
    </Modal>
  );
}

function GlassAddButton({
  onPress,
  palette,
}: {
  onPress: () => void;
  palette: typeof Colors.light;
}) {
  return (
    <View style={styles.actionButton}>
      <GlassSurface tint="regular" interactive scheme="auto" style={styles.actionGlass}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add task"
          onPress={onPress}
          hitSlop={6}
          style={({ pressed }) => [
            styles.actionPress,
            { transform: [{ scale: pressed ? 0.94 : 1 }] },
          ]}
        >
          <IconSymbol name="plus" size={18} color={palette.surfaceText} />
        </Pressable>
      </GlassSurface>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    maxHeight: SCREEN_HEIGHT * 0.85,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 10,
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    paddingHorizontal: 24,
  },
  headerTitle: {
    flex: 1,
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
  listWrap: {
    height: SCREEN_HEIGHT * 0.55,
  },
  scrollContent: {
    paddingBottom: 32,
  },
});
