import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  Modal,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/src/components/themed-text';
import { IconSymbol } from '@/src/components/ui/icon-symbol';
import { Colors } from '@/src/constants/theme';
import { useColorScheme } from '@/src/hooks/use-color-scheme';
import {
  SortableList,
  type RenderItemArgs,
} from '@/src/features/todo/components/sortable-list';
import { TaskFormModal } from '@/src/features/todo/components/task-form-modal';
import { TaskRow } from '@/src/features/todo/components/task-row';
import { useTasks } from '@/src/features/todo/context/tasks-context';
import { rescheduleSection } from '@/src/features/todo/smart-drop';
import {
  SECTION_LABELS,
  SECTION_ORDER,
  deriveSection,
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
    toggleTask,
    deleteTask,
    editTask,
    replaceTasksForDate,
  } = useTasks();

  const [editing, setEditing] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editTaskId, setEditTaskId] = useState<string | null>(null);
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
      setEditing(false);
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
    for (const t of tasks) out[deriveSection(t.timeMinutes)].push(t);
    return out;
  }, [tasks]);

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
    timeMinutes: number;
    durationMinutes: number;
    repeat: RepeatRule;
  }) {
    if (!dateKey) return;
    if (editTaskId) {
      editTask(editTaskId, draft);
    } else {
      addTaskInstance({
        title: draft.title,
        date: dateKey,
        timeMinutes: draft.timeMinutes,
        durationMinutes: draft.durationMinutes,
        done: false,
        repeat: draft.repeat,
      });
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
        // skip
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
    replaceTasksForDate(dateKey, next);
  }

  const editingTask = editTaskId ? tasks.find((t) => t.id === editTaskId) ?? null : null;

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
            <SheetIconButton
              icon="pencil"
              label={editing ? 'Done editing' : 'Edit'}
              active={editing}
              onPress={() => setEditing((v) => !v)}
              palette={palette}
            />
            <SheetIconButton
              icon="plus"
              label="Add task"
              onPress={openAdd}
              palette={palette}
            />
          </View>
        </View>

        <View style={styles.listWrap}>
          <SortableList
            data={listData}
            keyExtractor={(item) => item.key}
            onDragEnd={handleDragEnd}
            renderItem={renderItem}
            canDrag={canDrag}
            activationDistance={editing ? 8 : 1000}
            contentContainerStyle={styles.scrollContent}
          />
        </View>
      </Animated.View>

      <TaskFormModal
        visible={formOpen}
        initialTask={editingTask}
        onClose={closeForm}
        onSave={saveTask}
      />
    </Modal>
  );
}

function SheetIconButton({
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
        { backgroundColor: active ? palette.buttonFill : palette.surface },
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
    paddingHorizontal: 24,
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
  },
  headerTitle: {
    flex: 1,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 3,
  },
  listWrap: {
    height: SCREEN_HEIGHT * 0.55,
  },
  scrollContent: {
    paddingBottom: 32,
  },
  section: {
    paddingTop: 12,
  },
  sectionLabel: {
    paddingBottom: 4,
    letterSpacing: 0.6,
  },
  sectionEmpty: {
    paddingVertical: 12,
  },
});
