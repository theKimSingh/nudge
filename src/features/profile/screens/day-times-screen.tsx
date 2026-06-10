import DateTimePicker, {
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { getProfile, updateProfile } from '@/src/backend/profiles';
import { useSession } from '@/src/backend/session';
import { ThemedText } from '@/src/components/themed-text';
import { Colors } from '@/src/constants/theme';
import { minutesToAmPm } from '@/src/features/agent/lib/time-format';
import {
  SECTION_ANCHOR_MINUTES,
  type TaskSection,
} from '@/src/features/todo/types';
import { useColorScheme } from '@/src/hooks/use-color-scheme';

import { SettingsScreenChrome } from '../components/settings-screen-chrome';

// Column name on the profiles row for each section's anchor. Mirrors the SQL
// migration at supabase/migrations/20260517120000_profile_section_anchors.sql.
const COLUMN_BY_SECTION: Record<
  TaskSection,
  'morning_start_minutes' | 'afternoon_start_minutes' | 'evening_start_minutes'
> = {
  morning: 'morning_start_minutes',
  afternoon: 'afternoon_start_minutes',
  evening: 'evening_start_minutes',
};

type Row = { key: TaskSection; label: string };

const ROWS: readonly Row[] = [
  { key: 'morning', label: 'Morning starts at' },
  { key: 'afternoon', label: 'Afternoon starts at' },
  { key: 'evening', label: 'Evening starts at' },
];

function minutesToDate(m: number): Date {
  const d = new Date();
  d.setHours(Math.floor(m / 60), m % 60, 0, 0);
  return d;
}

function dateToMinutes(d: Date): number {
  return d.getHours() * 60 + d.getMinutes();
}

export function DayTimesScreen() {
  const scheme = useColorScheme() ?? 'light';
  const palette = Colors[scheme];
  const { session } = useSession();

  const [times, setTimes] = useState<Record<TaskSection, number>>({
    morning: SECTION_ANCHOR_MINUTES.morning,
    afternoon: SECTION_ANCHOR_MINUTES.afternoon,
    evening: SECTION_ANCHOR_MINUTES.evening,
  });
  const [open, setOpen] = useState<TaskSection | null>(null);
  // Suppress the save effect on first hydration so we don't immediately
  // write the just-loaded values back over themselves.
  const hydratedRef = useRef(false);

  // Load persisted anchors from the user's profile on mount. Falls back to
  // SECTION_ANCHOR_MINUTES defaults if the row is missing the columns (e.g.
  // hasn't been migrated yet).
  useEffect(() => {
    const userId = session?.user.id;
    if (!userId) return;
    let cancelled = false;
    getProfile(userId)
      .then((p) => {
        if (cancelled || !p) return;
        setTimes({
          morning: p.morning_start_minutes ?? SECTION_ANCHOR_MINUTES.morning,
          afternoon:
            p.afternoon_start_minutes ?? SECTION_ANCHOR_MINUTES.afternoon,
          evening: p.evening_start_minutes ?? SECTION_ANCHOR_MINUTES.evening,
        });
        hydratedRef.current = true;
      })
      .catch(() => {
        hydratedRef.current = true;
      });
    return () => {
      cancelled = true;
    };
  }, [session?.user.id]);

  function handleChange(key: TaskSection, event: DateTimePickerEvent, v?: Date) {
    if (Platform.OS === 'android') {
      setOpen(null);
      if (event.type === 'dismissed' || !v) return;
    }
    if (!v) return;
    const next = dateToMinutes(v);
    setTimes((prev) => ({ ...prev, [key]: next }));
    // Persist immediately — same write-on-change cadence the meal-times
    // pickers use. If the network is offline this throws; we swallow it
    // since the local state already reflects the change and the user
    // can retry by re-picking.
    const userId = session?.user.id;
    if (!userId || !hydratedRef.current) return;
    void updateProfile(userId, { [COLUMN_BY_SECTION[key]]: next }).catch(() => {});
  }

  return (
    <SettingsScreenChrome
      title="Day sections"
      subtitle="When morning, afternoon, and evening start on your calendar."
    >
      <View style={styles.list}>
        {ROWS.map((row) => {
          const expanded = open === row.key;
          return (
            <View key={row.key}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={row.label}
                accessibilityState={{ expanded }}
                onPress={() => setOpen((p) => (p === row.key ? null : row.key))}
                style={({ pressed }) => [
                  styles.row,
                  {
                    backgroundColor: expanded ? palette.accent : palette.bgSecondary,
                    opacity: pressed ? 0.85 : 1,
                  },
                ]}
              >
                <ThemedText
                  type="sen-headline"
                  style={{
                    color: expanded
                      ? Colors[scheme].textInverse
                      : Colors[scheme].text,
                  }}
                >
                  {row.label}
                </ThemedText>
                <ThemedText
                  type="sen-headline"
                  style={{
                    color: expanded
                      ? Colors[scheme].textInverse
                      : Colors[scheme].text,
                  }}
                >
                  {minutesToAmPm(times[row.key])}
                </ThemedText>
              </Pressable>

              {expanded && Platform.OS === 'ios' ? (
                <View
                  style={[
                    styles.pickerWell,
                    { backgroundColor: palette.bgSecondary },
                  ]}
                >
                  <DateTimePicker
                    value={minutesToDate(times[row.key])}
                    mode="time"
                    display="spinner"
                    is24Hour={false}
                    minuteInterval={5}
                    themeVariant={scheme}
                    onChange={(event, value) => handleChange(row.key, event, value)}
                  />
                </View>
              ) : null}
            </View>
          );
        })}

        {Platform.OS === 'android' && open ? (
          <DateTimePicker
            value={minutesToDate(times[open])}
            mode="time"
            display="clock"
            is24Hour={false}
            minuteInterval={5}
            onChange={(event, value) => handleChange(open, event, value)}
          />
        ) : null}
      </View>
    </SettingsScreenChrome>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 18,
    paddingHorizontal: 20,
    borderRadius: 16,
  },
  pickerWell: {
    marginTop: 8,
    borderRadius: 16,
    paddingVertical: 4,
    overflow: 'hidden',
  },
});
