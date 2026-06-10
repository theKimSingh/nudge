import DateTimePicker, {
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/src/components/themed-text';
import { Colors } from '@/src/constants/theme';
import { getProfile, updateProfile } from '@/src/backend/profiles';
import { useSession } from '@/src/backend/session';
import { minutesToAmPm } from '@/src/features/agent/lib/time-format';
import { useColorScheme } from '@/src/hooks/use-color-scheme';

import { SettingsScreenChrome } from '../components/settings-screen-chrome';

type MealKey = 'breakfast' | 'lunch' | 'dinner';
type MealRow = { key: MealKey; label: string };

const MEALS: readonly MealRow[] = [
  { key: 'breakfast', label: 'Breakfast' },
  { key: 'lunch', label: 'Lunch' },
  { key: 'dinner', label: 'Dinner' },
];

const DEFAULTS: Record<MealKey, number> = {
  breakfast: 480,
  lunch: 750,
  dinner: 1110,
};

const COLUMN_BY_MEAL: Record<
  MealKey,
  'breakfast_time_minutes' | 'lunch_time_minutes' | 'dinner_time_minutes'
> = {
  breakfast: 'breakfast_time_minutes',
  lunch: 'lunch_time_minutes',
  dinner: 'dinner_time_minutes',
};

function minutesToDate(m: number): Date {
  const d = new Date();
  d.setHours(Math.floor(m / 60), m % 60, 0, 0);
  return d;
}

function dateToMinutes(d: Date): number {
  return d.getHours() * 60 + d.getMinutes();
}

export function MealTimesScreen() {
  const scheme = useColorScheme() ?? 'light';
  const palette = Colors[scheme];
  const { session } = useSession();
  const [times, setTimes] = useState<Record<MealKey, number>>(DEFAULTS);
  const [open, setOpen] = useState<MealKey | null>(null);
  // Same pattern as day-times-screen: don't fire updateProfile() until we've
  // loaded the existing row, so the first render doesn't overwrite the
  // server values with our hardcoded DEFAULTS.
  const hydratedRef = useRef(false);

  useEffect(() => {
    const uid = session?.user.id;
    if (!uid) return;
    let cancelled = false;
    getProfile(uid)
      .then((p) => {
        if (cancelled || !p) return;
        setTimes({
          breakfast: p.breakfast_time_minutes ?? DEFAULTS.breakfast,
          lunch: p.lunch_time_minutes ?? DEFAULTS.lunch,
          dinner: p.dinner_time_minutes ?? DEFAULTS.dinner,
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

  function handleChange(key: MealKey, event: DateTimePickerEvent, v?: Date) {
    if (Platform.OS === 'android') {
      setOpen(null);
      if (event.type === 'dismissed' || !v) return;
    }
    if (!v) return;
    const next = dateToMinutes(v);
    setTimes((prev) => ({ ...prev, [key]: next }));
    // Persist immediately so the voice prompt sees the new value next time
    // it builds. Previous version was view-only — the user thought they
    // saved but the DB never updated.
    const uid = session?.user.id;
    if (!uid || !hydratedRef.current) return;
    void updateProfile(uid, { [COLUMN_BY_MEAL[key]]: next }).catch(() => {});
  }

  return (
    <SettingsScreenChrome
      title="Meals"
      subtitle={'Anchors phrases like "after lunch" when Nudge plans your day.'}
    >
      <View style={styles.list}>
        {MEALS.map((meal) => {
          const expanded = open === meal.key;
          return (
            <View key={meal.key}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${meal.label} time`}
                accessibilityState={{ expanded }}
                onPress={() => setOpen((p) => (p === meal.key ? null : meal.key))}
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
                  {meal.label}
                </ThemedText>
                <ThemedText
                  type="sen-headline"
                  style={{
                    color: expanded
                      ? Colors[scheme].textInverse
                      : Colors[scheme].text,
                  }}
                >
                  {minutesToAmPm(times[meal.key])}
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
                    value={minutesToDate(times[meal.key])}
                    mode="time"
                    display="spinner"
                    is24Hour={false}
                    minuteInterval={5}
                    themeVariant={scheme}
                    onChange={(event, value) => handleChange(meal.key, event, value)}
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
