import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SortableList, type RenderItemArgs } from '../components/sortable-list';

import { ThemedText } from '@/src/components/themed-text';
import { ThemedView } from '@/src/components/themed-view';
import { IconSymbol } from '@/src/components/ui/icon-symbol';
import { Colors } from '@/src/constants/theme';
import { useColorScheme } from '@/src/hooks/use-color-scheme';
import { getProfile } from '@/src/backend/profiles';
import { useSession } from '@/src/backend/session';

import { TaskFormModal } from '../components/task-form-modal';
import { TaskRow } from '../components/task-row';
import { WeeklyCalendar } from '../components/weekly-calendar';
import { rescheduleSection } from '../smart-drop';
import {
  SECTION_LABELS,
  SECTION_ORDER,
  deriveSection,
  formatTimeRange,
  type RepeatRule,
  type Task,
  type TaskSection,
} from '../types';

type ListItem =
  | { type: 'header'; section: TaskSection; key: string }
  | { type: 'task'; task: Task; key: string }
  | { type: 'placeholder'; section: TaskSection; key: string };

const SEED_TASKS: Task[] = [
  { id: '1', title: 'Read the design doc', timeMinutes: 7 * 60 + 30, durationMinutes: 30, done: false, repeat: 'none' },
  { id: '2', title: 'Email professor about Friday', timeMinutes: 9 * 60, durationMinutes: 15, done: true, repeat: 'none' },
  { id: '3', title: 'Lunch with Alex', timeMinutes: 13 * 60, durationMinutes: 60, done: false, repeat: 'none' },
  { id: '4', title: 'Gym — leg day', timeMinutes: 16 * 60 + 30, durationMinutes: 90, done: false, repeat: 'weekdays' },
  { id: '5', title: 'Cook dinner', timeMinutes: 19 * 60, durationMinutes: 45, done: false, repeat: 'daily' },
];

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
  const [name, setName] = useState<string>('there');
  const [tasks, setTasks] = useState<Task[]>(SEED_TASKS);
  const [editing, setEditing] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [modalOpen, setModalOpen] = useState(false);
  const [editTaskId, setEditTaskId] = useState<string | null>(null);

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
    for (const t of tasks) out[deriveSection(t.timeMinutes)].push(t);
    return out;
  }, [tasks]);

  function toggleTask(id: string) {
    setTasks((cur) => cur.map((t) => (t.id === id ? { ...t, done: !t.done } : t)));
  }

  function deleteTask(id: string) {
    setTasks((cur) => cur.filter((t) => t.id !== id));
  }

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

  function saveTask(draft: {
    title: string;
    timeMinutes: number;
    durationMinutes: number;
    repeat: RepeatRule;
  }) {
    if (editTaskId) {
      setTasks((cur) =>
        cur.map((t) => (t.id === editTaskId ? { ...t, ...draft } : t)),
      );
    } else {
      const newTask: Task = {
        id: String(Date.now()),
        title: draft.title,
        timeMinutes: draft.timeMinutes,
        durationMinutes: draft.durationMinutes,
        done: false,
        repeat: draft.repeat,
      };
      setTasks((cur) => [...cur, newTask]);
    }
  }

  const editingTask = editTaskId ? tasks.find((t) => t.id === editTaskId) ?? null : null;

  const listData = useMemo<ListItem[]>(() => {
    const items: ListItem[] = [];
    for (const section of SECTION_ORDER) {
      items.push({ type: 'header', section, key: `h-${section}` });
      if (grouped[section].length === 0) {
        items.push({ type: 'placeholder', section, key: `p-${section}` });
      } else {
        for (const t of grouped[section]) {
          items.push({ type: 'task', task: t, key: `t-${t.id}` });
        }
      }
    }
    return items;
  }, [grouped]);

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

    let droppedSection: TaskSection = 'morning';
    let positionInSection = 0;
    let currentSection: TaskSection = 'morning';
    let countInSection = 0;
    for (let i = 0; i < data.length; i++) {
      const item = data[i];
      if (item.type === 'header') {
        currentSection = item.section;
        countInSection = 0;
      } else if (item.type === 'placeholder') {
        // ignore placeholders for counting
      } else {
        if (i === to) {
          droppedSection = currentSection;
          positionInSection = countInSection;
        }
        countInSection++;
      }
    }

    const groupedNew: Record<TaskSection, Task[]> = {
      morning: [],
      afternoon: [],
      evening: [],
    };
    let cs: TaskSection = 'morning';
    for (const item of data) {
      if (item.type === 'header') {
        cs = item.section;
      } else if (item.type === 'task') {
        groupedNew[cs].push(item.task);
      }
    }

    groupedNew[droppedSection] = rescheduleSection(
      groupedNew[droppedSection],
      droppedSection,
      positionInSection,
    );

    const next: Task[] = [];
    for (const sec of SECTION_ORDER) next.push(...groupedNew[sec]);
    setTasks(next);
  }

  const renderItem = ({ item, drag, isActive }: RenderItemArgs<ListItem>) => {
    if (item.type === 'header') {
      return (
        <View style={styles.section}>
          <ThemedText
            type="sen-caption-bold"
            lightColor={Colors.light.textMuted}
            darkColor={Colors.dark.textMuted}
            style={styles.sectionLabel}
          >
            {SECTION_LABELS[item.section].toUpperCase()}
          </ThemedText>
        </View>
      );
    }
    if (item.type === 'placeholder') {
      return (
        <ThemedText
          type="sen-body"
          lightColor={Colors.light.textDisabled}
          darkColor={Colors.dark.textDisabled}
          style={styles.sectionEmpty}
        >
          Nothing yet
        </ThemedText>
      );
    }
    return (
      <TaskRow
        title={item.task.title}
        time={formatTimeRange(item.task.timeMinutes, item.task.durationMinutes)}
        done={item.task.done}
        editing={editing}
        isDragging={isActive}
        onToggle={() => toggleTask(item.task.id)}
        onDelete={() => deleteTask(item.task.id)}
        onEdit={() => openEdit(item.task.id)}
        onDragStart={drag}
      />
    );
  };

  const canDrag = (item: ListItem) => item.type === 'task';

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
            <ActionButton
              icon="pencil"
              label={editing ? 'Done editing' : 'Edit'}
              onPress={() => setEditing((v) => !v)}
              palette={palette}
              active={editing}
            />
            <ActionButton
              icon="plus"
              label="Add task"
              onPress={openAdd}
              palette={palette}
            />
          </View>
        </View>
        <View style={styles.dateRow}>
          <ThemedText type="sen-title-3">{dayLabel}</ThemedText>
          <ThemedText type="sen-title-3">{dateLabel}</ThemedText>
        </View>
      </View>

      <View style={styles.weekWrap}>
        <WeeklyCalendar
          selectedDate={selectedDate}
          onSelectDate={setSelectedDate}
        />
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
          activationDistance={editing ? 8 : 1000}
          contentContainerStyle={styles.scrollContent}
          ListHeaderComponent={listHeader}
        />
      </SafeAreaView>

      <TaskFormModal
        visible={modalOpen}
        initialTask={editingTask}
        onClose={closeModal}
        onSave={saveTask}
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
  icon: 'pencil' | 'plus';
  label: string;
  onPress: () => void;
  palette: typeof Colors.light;
  active?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [
        styles.actionButton,
        {
          backgroundColor: active ? palette.buttonFill : palette.surface,
        },
        pressed && { opacity: 0.7 },
      ]}
    >
      <IconSymbol
        name={icon}
        size={18}
        color={active ? palette.buttonLabel : palette.surfaceText}
      />
    </Pressable>
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
    paddingBottom: 140,
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
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 8,
  },
  section: {
    paddingTop: 16,
  },
  sectionLabel: {
    paddingHorizontal: 24,
    paddingBottom: 4,
    letterSpacing: 0.6,
  },
  sectionEmpty: {
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 4,
  },
});
