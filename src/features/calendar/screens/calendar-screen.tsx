import DateTimePicker from '@react-native-community/datetimepicker';
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
import { CalendarList } from 'react-native-calendars';
import { SafeAreaView } from 'react-native-safe-area-context';

import { IconSymbol } from '@/src/components/ui/icon-symbol';
import { Colors } from '@/src/constants/theme';
import { useColorScheme } from '@/src/hooks/use-color-scheme';
import { DayDetailSheet } from '@/src/features/calendar/components/day-detail-sheet';
import {
  fetchAndParseICS,
  MarkedDates,
  parseICSString,
} from '@/src/features/calendar/utils/calendar-parser';
import { useTasks } from '@/src/features/todo/context/tasks-context';
import type { RepeatRule } from '@/src/features/todo/types';

const SCREEN_WIDTH = Dimensions.get('window').width;
const CALENDAR_WIDTH = SCREEN_WIDTH - 32; // matches container paddingHorizontal: 16
const DAY_WIDTH = CALENDAR_WIDTH / 7;

const BG_COLOR = '#f0f0f0';
const TEXT_COLOR = '#000000';

const getLocalDateString = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const PASTEL_COLORS = [
  '#fdfd96',
  '#ffb7b2',
  '#a2e4b8',
  '#e2f0cb',
  '#cbaacb',
  '#b5ead7',
  '#ffdac1',
  '#9bf6ff',
];

export function CalendarScreen() {
  const scheme = useColorScheme() ?? 'light';
  const palette = Colors[scheme];
  const { tasks, addTaskSeries } = useTasks();

  const [url, setUrl] = useState('');
  const [importedDates, setImportedDates] = useState<MarkedDates>({});
  const [loading, setLoading] = useState(false);
  const [currentDate, setCurrentDate] = useState(getLocalDateString(new Date()));

  const [magicText, setMagicText] = useState('');
  const [magicLoading, setMagicLoading] = useState(false);

  const [isImportVisible, setIsImportVisible] = useState(false);
  const [isAddEventVisible, setIsAddEventVisible] = useState(false);
  const [newEventTitle, setNewEventTitle] = useState('');
  const [dayDetailDate, setDayDetailDate] = useState<string | null>(null);

  const [startTime, setStartTime] = useState<Date>(new Date());
  const [endTime, setEndTime] = useState<Date>(new Date(Date.now() + 3600000));
  const [repeatFrequency, setRepeatFrequency] = useState<'none' | 'daily' | 'weekly' | 'monthly'>(
    'none',
  );
  const [endRepeatDate, setEndRepeatDate] = useState<Date>(new Date(Date.now() + 86400000 * 30));
  const [showPicker, setShowPicker] = useState<'start' | 'end' | 'repeatEnd' | null>(null);

  const markedDates = useMemo<MarkedDates>(() => {
    const out: MarkedDates = {};
    for (const [dateStr, dayData] of Object.entries(importedDates)) {
      out[dateStr] = { events: [...dayData.events] };
    }
    for (const t of tasks) {
      if (!out[t.date]) out[t.date] = { events: [] };
      out[t.date].events.push({
        title: t.title,
        color: t.color ?? PASTEL_COLORS[t.title.length % PASTEL_COLORS.length],
      });
    }
    return out;
  }, [importedDates, tasks]);

  const handleImport = async () => {
    if (!url) {
      Alert.alert('Error', 'Please enter a valid ICS URL');
      return;
    }

    setLoading(true);
    try {
      const parsedDates = await fetchAndParseICS(url);
      setImportedDates(parsedDates);
      Alert.alert('Success', 'Calendar events imported successfully!');
      setUrl('');
      setIsImportVisible(false);
    } catch {
      Alert.alert('Error', 'Failed to import calendar events.');
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

  const getMonthYearString = (dateString: string) => {
    const date = new Date(dateString);
    const month = date.toLocaleString('default', { month: 'long' });
    const year = date.getFullYear();
    return { month, year };
  };

  const { month, year } = useMemo(() => getMonthYearString(currentDate), [currentDate]);

  const changeDate = (offset: number) => {
    const [y, m, d] = currentDate.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    date.setMonth(date.getMonth() + offset);
    setCurrentDate(getLocalDateString(date));
  };

  const handleAddEvent = () => {
    if (!newEventTitle.trim()) {
      Alert.alert('Error', 'Please enter an event title');
      return;
    }

    const randomColor = PASTEL_COLORS[Math.floor(Math.random() * PASTEL_COLORS.length)];

    const startMinutes = startTime.getHours() * 60 + startTime.getMinutes();
    const endMinutes = endTime.getHours() * 60 + endTime.getMinutes();
    const durationMinutes = Math.max(5, endMinutes - startMinutes);

    const [y, m, d] = currentDate.split('-').map(Number);
    const curr = new Date(y, m - 1, d);

    const endLimit = repeatFrequency === 'none' ? curr : endRepeatDate;
    const twoYearsFromNow = new Date();
    twoYearsFromNow.setFullYear(twoYearsFromNow.getFullYear() + 2);
    const safeEndLimit = endLimit > twoYearsFromNow ? twoYearsFromNow : endLimit;

    const dates: string[] = [];
    while (curr <= safeEndLimit) {
      dates.push(getLocalDateString(curr));
      if (repeatFrequency === 'none') break;
      if (repeatFrequency === 'daily') curr.setDate(curr.getDate() + 1);
      else if (repeatFrequency === 'weekly') curr.setDate(curr.getDate() + 7);
      else if (repeatFrequency === 'monthly') curr.setMonth(curr.getMonth() + 1);
      else break;
    }

    const repeatRule: RepeatRule =
      repeatFrequency === 'monthly' ? 'none' : (repeatFrequency as RepeatRule);

    addTaskSeries(
      {
        title: newEventTitle.trim(),
        timeMinutes: startMinutes,
        durationMinutes,
        done: false,
        repeat: repeatRule,
        color: randomColor,
      },
      dates,
    );

    setNewEventTitle('');
    setRepeatFrequency('none');
    setIsAddEventVisible(false);
  };

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
      if (!dateString) return <View style={{ width: DAY_WIDTH, height: 100 }} />;

      const isToday = state === 'today';
      const isSelectedMonth = state !== 'disabled';

      if (initialLoading) {
        return (
          <View style={[styles.dayCellContainer, { backgroundColor: '#e5e5e5' }]}>
            <View
              style={{
                width: 20,
                height: 20,
                borderRadius: 10,
                backgroundColor: '#d0d0d0',
                marginBottom: 6,
              }}
            />
            <View
              style={{ width: '80%', height: 6, backgroundColor: '#d0d0d0', marginBottom: 4 }}
            />
            <View style={{ width: '60%', height: 6, backgroundColor: '#d0d0d0' }} />
          </View>
        );
      }

      const dayData = markedDates[dateString];
      const events = dayData?.events ?? [];
      const MAX_VISIBLE = 3;
      const overflowing = events.length > MAX_VISIBLE;
      const visibleEvents = overflowing ? events.slice(0, MAX_VISIBLE - 1) : events;
      const hiddenCount = events.length - visibleEvents.length;

      return (
        <Pressable
          onPress={() => openDayDetail(dateString)}
          style={({ pressed }) => [
            styles.dayCellContainer,
            isToday && styles.todayDayCellContainer,
            !isSelectedMonth && styles.disabledDayCellContainer,
            pressed && { opacity: 0.85 },
          ]}
        >
          <View
            style={[styles.dateNumberContainer, isToday && styles.todayDateNumberContainer]}
          >
            <Text
              style={[
                styles.dateText,
                !isSelectedMonth && styles.disabledDateText,
                isToday && styles.todayDateText,
              ]}
            >
              {date?.day}
            </Text>
          </View>

          <View style={styles.eventsContainer}>
            {visibleEvents.map((event, index) => (
              <View key={index} style={[styles.eventPill, { backgroundColor: event.color }]}>
                <Text style={styles.eventText} numberOfLines={1}>
                  {event.title}
                </Text>
              </View>
            ))}
            {hiddenCount > 0 && (
              <Text style={styles.moreText} numberOfLines={1}>
                +{hiddenCount} more
              </Text>
            )}
          </View>
        </Pressable>
      );
    },
    [markedDates, initialLoading, openDayDetail],
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        {/* Custom Header */}
        <View style={styles.headerRow}>
          <Text style={styles.yearText}>{year}</Text>
          <View style={styles.headerButtons}>
            <HeaderIconButton
              icon="square.and.arrow.down"
              label="Import calendar"
              onPress={() => setIsImportVisible(true)}
              palette={palette}
            />
            <HeaderIconButton
              icon="plus"
              label="Add event"
              onPress={() => setIsAddEventVisible(true)}
              palette={palette}
            />
            <HeaderIconButton
              icon="chevron.left"
              label="Previous"
              onPress={() => changeDate(-1)}
              palette={palette}
            />
            <HeaderIconButton
              icon="chevron.right"
              label="Next"
              onPress={() => changeDate(1)}
              palette={palette}
            />
          </View>
        </View>

        <Text style={styles.monthText}>{month}</Text>

        <View>
          <View style={styles.weekHeaderContainer}>
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
              <Text key={day} style={styles.weekHeaderText}>
                {day}
              </Text>
            ))}
          </View>
          <CalendarList
            horizontal={true}
            pagingEnabled={true}
            calendarWidth={CALENDAR_WIDTH}
            current={currentDate}
            onVisibleMonthsChange={(months) => {
              if (months && months[0] && months[0].dateString !== currentDate) {
                setCurrentDate(months[0].dateString);
              }
            }}
            dayComponent={renderDay}
            hideArrows={true}
            renderHeader={() => null}
            style={styles.calendarContainer}
            calendarStyle={{ paddingLeft: 0, paddingRight: 0 }}
            {...({ showNonCurrentDates: true, hideExtraDays: false } as any)}
            theme={
              {
                calendarBackground: 'transparent',
                textSectionTitleColor: '#8c8c8c',
                textDayHeaderFontWeight: '600',
                textDayHeaderFontSize: 13,
                'stylesheet.calendar.header': {
                  header: { display: 'none' },
                  week: { display: 'none' },
                },
                'stylesheet.day.basic': {
                  base: {
                    width: DAY_WIDTH,
                    height: 100,
                    alignItems: 'center',
                    padding: 0,
                    margin: 0,
                  },
                },
              } as any
            }
          />
        </View>
      </View>

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
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Import Calendar</Text>
            <Text style={styles.modalSubtitle}>
              Paste an .ics URL or use AI to parse a schedule.
            </Text>

            <Text style={styles.importSectionLabel}>From URL</Text>
            <View style={styles.importContainer}>
              <TextInput
                style={styles.input}
                placeholder="Paste .ics link here..."
                placeholderTextColor="#888"
                value={url}
                onChangeText={setUrl}
                autoCapitalize="none"
                keyboardType="url"
              />
              {loading ? (
                <ActivityIndicator style={{ marginLeft: 10 }} size="small" color="#000" />
              ) : (
                <TouchableOpacity style={styles.importButton} onPress={handleImport}>
                  <Text style={styles.importButtonText}>Import</Text>
                </TouchableOpacity>
              )}
            </View>

            <Text style={styles.importSectionLabel}>From Text (AI)</Text>
            <View style={styles.magicImportContainer}>
              <TextInput
                style={styles.magicInput}
                placeholder="Paste raw schedule text..."
                placeholderTextColor="#888"
                value={magicText}
                onChangeText={setMagicText}
                multiline={true}
              />
              {magicLoading ? (
                <ActivityIndicator style={{ marginLeft: 10 }} size="small" color="#000" />
              ) : (
                <TouchableOpacity style={styles.magicImportButton} onPress={handleMagicImport}>
                  <Text style={styles.magicImportButtonText}>AI Import</Text>
                </TouchableOpacity>
              )}
            </View>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => setIsImportVisible(false)}
              >
                <Text style={styles.modalCancelButtonText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Add Event Modal */}
      <Modal
        visible={isAddEventVisible}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setIsAddEventVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Add Event</Text>
            <Text style={styles.modalSubtitle}>
              {(() => {
                const [y, m, d] = currentDate.split('-').map(Number);
                return new Date(y, m - 1, d).toLocaleDateString('en-US', {
                  weekday: 'long',
                  month: 'long',
                  day: 'numeric',
                });
              })()}
            </Text>

            <TextInput
              style={styles.modalInput}
              placeholder="Event Title"
              placeholderTextColor="#888"
              value={newEventTitle}
              onChangeText={setNewEventTitle}
              autoFocus={true}
            />

            <View style={styles.formRow}>
              <Text style={styles.formLabel}>Start</Text>
              {Platform.OS === 'ios' ? (
                <DateTimePicker
                  value={startTime}
                  mode="time"
                  display="compact"
                  onChange={(_event, selectedDate) => {
                    if (selectedDate) setStartTime(selectedDate);
                  }}
                />
              ) : (
                <>
                  <TouchableOpacity
                    style={styles.timeButton}
                    onPress={() => setShowPicker('start')}
                  >
                    <Text style={styles.timeButtonText}>
                      {startTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                  </TouchableOpacity>
                  {showPicker === 'start' && (
                    <DateTimePicker
                      value={startTime}
                      mode="time"
                      onChange={(_event, selectedDate) => {
                        setShowPicker(null);
                        if (selectedDate) setStartTime(selectedDate);
                      }}
                    />
                  )}
                </>
              )}
            </View>

            <View style={styles.formRow}>
              <Text style={styles.formLabel}>End</Text>
              {Platform.OS === 'ios' ? (
                <DateTimePicker
                  value={endTime}
                  mode="time"
                  display="compact"
                  onChange={(_event, selectedDate) => {
                    if (selectedDate) setEndTime(selectedDate);
                  }}
                />
              ) : (
                <>
                  <TouchableOpacity
                    style={styles.timeButton}
                    onPress={() => setShowPicker('end')}
                  >
                    <Text style={styles.timeButtonText}>
                      {endTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                  </TouchableOpacity>
                  {showPicker === 'end' && (
                    <DateTimePicker
                      value={endTime}
                      mode="time"
                      onChange={(_event, selectedDate) => {
                        setShowPicker(null);
                        if (selectedDate) setEndTime(selectedDate);
                      }}
                    />
                  )}
                </>
              )}
            </View>

            <View style={styles.repeatContainer}>
              <Text style={styles.formLabel}>Repeat</Text>
              <View style={styles.pillsRow}>
                {(['none', 'daily', 'weekly', 'monthly'] as const).map((freq) => (
                  <TouchableOpacity
                    key={freq}
                    style={[styles.pill, repeatFrequency === freq && styles.pillActive]}
                    onPress={() => setRepeatFrequency(freq)}
                  >
                    <Text
                      style={[
                        styles.pillText,
                        repeatFrequency === freq && styles.pillTextActive,
                      ]}
                    >
                      {freq.charAt(0).toUpperCase() + freq.slice(1)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {repeatFrequency !== 'none' && (
                <View style={[styles.formRow, styles.untilRow]}>
                  <Text style={styles.formLabel}>Until</Text>
                  {Platform.OS === 'ios' ? (
                    <DateTimePicker
                      value={endRepeatDate}
                      mode="date"
                      display="compact"
                      onChange={(_event, selectedDate) => {
                        if (selectedDate) setEndRepeatDate(selectedDate);
                      }}
                    />
                  ) : (
                    <>
                      <TouchableOpacity
                        style={styles.timeButton}
                        onPress={() => setShowPicker('repeatEnd')}
                      >
                        <Text style={styles.timeButtonText}>
                          {endRepeatDate.toLocaleDateString([], {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          })}
                        </Text>
                      </TouchableOpacity>
                      {showPicker === 'repeatEnd' && (
                        <DateTimePicker
                          value={endRepeatDate}
                          mode="date"
                          onChange={(_event, selectedDate) => {
                            setShowPicker(null);
                            if (selectedDate) setEndRepeatDate(selectedDate);
                          }}
                        />
                      )}
                    </>
                  )}
                </View>
              )}
            </View>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => {
                  setIsAddEventVisible(false);
                  setNewEventTitle('');
                }}
              >
                <Text style={styles.modalCancelButtonText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.modalAddButton} onPress={handleAddEvent}>
                <Text style={styles.modalAddButtonText}>Add</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <DayDetailSheet
        visible={dayDetailDate !== null}
        dateKey={dayDetailDate}
        onClose={() => setDayDetailDate(null)}
      />
    </SafeAreaView>
  );
}

function HeaderIconButton({
  icon,
  label,
  onPress,
  palette,
}: {
  icon: 'square.and.arrow.down' | 'plus' | 'chevron.left' | 'chevron.right';
  label: string;
  onPress: () => void;
  palette: typeof Colors.light;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [
        styles.headerIconButton,
        { backgroundColor: palette.surface },
        pressed && { opacity: 0.7 },
      ]}
    >
      <IconSymbol name={icon} size={18} color={palette.surfaceText} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: BG_COLOR,
  },
  container: {
    flex: 1,
    paddingHorizontal: 16,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 20,
  },
  yearText: {
    fontSize: 32,
    fontWeight: '800',
    color: TEXT_COLOR,
    letterSpacing: -1,
  },
  headerButtons: {
    flexDirection: 'row',
    gap: 10,
  },
  headerIconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 4,
  },
  monthText: {
    fontSize: 22,
    fontWeight: '700',
    color: TEXT_COLOR,
    alignSelf: 'center',
    marginBottom: 20,
  },
  weekHeaderContainer: {
    flexDirection: 'row',
    marginBottom: 10,
  },
  weekHeaderText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#666',
    width: DAY_WIDTH,
    textAlign: 'center',
  },
  calendarContainer: {
    backgroundColor: '#f0f0f0',
    minHeight: 500,
  },
  dayCellContainer: {
    width: '100%',
    height: 90,
    alignItems: 'center',
    paddingTop: 5,
    borderWidth: 1,
    borderColor: '#d0d0d0',
    backgroundColor: '#fff',
    overflow: 'hidden',
  },
  todayDayCellContainer: {
    backgroundColor: '#fff3e0',
  },
  disabledDayCellContainer: {
    backgroundColor: '#fafafa',
  },
  dateNumberContainer: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  todayDateNumberContainer: {
    backgroundColor: '#ff3b30',
  },
  dateText: {
    fontSize: 14,
    fontWeight: '600',
    color: TEXT_COLOR,
  },
  todayDateText: {
    color: '#fff',
  },
  disabledDateText: {
    color: '#999999',
  },
  eventsContainer: {
    width: '100%',
    paddingHorizontal: 2,
    gap: 2,
  },
  eventPill: {
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 4,
    width: '100%',
  },
  eventText: {
    fontSize: 9,
    fontWeight: '500',
    color: '#000',
  },
  moreText: {
    fontSize: 9,
    fontWeight: '600',
    color: '#666',
    paddingHorizontal: 4,
  },
  importContainer: {
    flexDirection: 'row',
    marginBottom: 16,
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  magicImportContainer: {
    flexDirection: 'row',
    marginBottom: 24,
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  importSectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#666',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 8,
  },
  magicInput: {
    flex: 1,
    fontSize: 14,
    color: '#000',
    maxHeight: 60,
  },
  magicImportButton: {
    backgroundColor: '#7b2cbf',
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
  input: {
    flex: 1,
    fontSize: 14,
    color: '#000',
  },
  importButton: {
    backgroundColor: '#000',
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 15,
    marginLeft: 10,
  },
  importButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#fff',
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
    fontSize: 22,
    fontWeight: 'bold',
    color: '#000',
    marginBottom: 4,
  },
  modalSubtitle: {
    fontSize: 14,
    color: '#666',
    marginBottom: 20,
  },
  modalInput: {
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: '#000',
    marginBottom: 24,
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
  modalCancelButtonText: {
    color: '#666',
    fontSize: 16,
    fontWeight: '600',
  },
  modalAddButton: {
    backgroundColor: '#000',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 10,
  },
  modalAddButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  formRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  formLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  timeButton: {
    backgroundColor: '#f5f5f5',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  timeButtonText: {
    fontSize: 16,
    color: '#000',
    fontWeight: '500',
  },
  repeatContainer: {
    marginBottom: 16,
  },
  pillsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  untilRow: {
    marginTop: 12,
    marginBottom: 0,
  },
  pill: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: '#f5f5f5',
  },
  pillActive: {
    backgroundColor: '#000',
  },
  pillText: {
    fontSize: 13,
    color: '#666',
    fontWeight: '500',
  },
  pillTextActive: {
    color: '#fff',
  },
});
