import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/src/components/themed-text';
import { Colors } from '@/src/constants/theme';
import { useColorScheme } from '@/src/hooks/use-color-scheme';

const DAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

type Props = {
  selectedDate: Date;
  onSelectDate: (date: Date) => void;
};

function startOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function isSameDate(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function WeeklyCalendar({ selectedDate, onSelectDate }: Props) {
  const scheme = useColorScheme() ?? 'light';
  const palette = Colors[scheme];
  const today = new Date();
  const weekStart = startOfWeek(selectedDate);

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    return d;
  });

  return (
    <View style={styles.row}>
      {days.map((d, i) => {
        const selected = isSameDate(d, selectedDate);
        const isToday = isSameDate(d, today);
        return (
          <Pressable
            key={d.toISOString()}
            accessibilityRole="button"
            accessibilityLabel={`Select ${d.toDateString()}`}
            accessibilityState={{ selected }}
            onPress={() => onSelectDate(d)}
            style={({ pressed }) => [
              styles.cell,
              selected && { backgroundColor: palette.buttonFill },
              pressed && !selected && { opacity: 0.6 },
            ]}
          >
            <ThemedText
              type="sen-caption"
              lightColor={
                selected ? Colors.light.buttonLabel : Colors.light.textMuted
              }
              darkColor={
                selected ? Colors.dark.buttonLabel : Colors.dark.textMuted
              }
            >
              {DAY_LETTERS[i]}
            </ThemedText>
            <ThemedText
              type="sen-headline"
              lightColor={
                selected
                  ? Colors.light.buttonLabel
                  : isToday
                    ? Colors.light.text
                    : Colors.light.textSecondary
              }
              darkColor={
                selected
                  ? Colors.dark.buttonLabel
                  : isToday
                    ? Colors.dark.text
                    : Colors.dark.textSecondary
              }
            >
              {d.getDate()}
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    gap: 4,
  },
  cell: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 10,
    borderRadius: 18,
    minHeight: 56,
  },
});
