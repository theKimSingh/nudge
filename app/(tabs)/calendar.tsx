import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, SafeAreaView, TextInput, Alert, ActivityIndicator, Modal, KeyboardAvoidingView, Platform, Dimensions } from 'react-native';
import { Calendar, CalendarList, WeekCalendar, CalendarProvider } from 'react-native-calendars';
import { fetchAndParseICS, parseICSString, MarkedDates } from '@/utils/calendarParser';
import { ScrollView } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';

const SCREEN_WIDTH = Dimensions.get('window').width;
const DAY_WIDTH = (SCREEN_WIDTH - 32) / 7; // 32 is paddingHorizontal: 16 * 2

const BG_COLOR = '#f0f0f0'; // Light gray
const TEXT_COLOR = '#000000';

const getLocalDateString = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export default function CalendarScreen() {
  const [url, setUrl] = useState('');
  const [markedDates, setMarkedDates] = useState<MarkedDates>({});
  const [loading, setLoading] = useState(false);
  const [currentDate, setCurrentDate] = useState(getLocalDateString(new Date()));
  const [viewMode, setViewMode] = useState<'day' | 'week' | 'month'>('month');

  const [magicText, setMagicText] = useState('');
  const [magicLoading, setMagicLoading] = useState(false);

  const [isAddEventVisible, setIsAddEventVisible] = useState(false);
  const [newEventTitle, setNewEventTitle] = useState('');

  const [startTime, setStartTime] = useState<Date>(new Date());
  const [endTime, setEndTime] = useState<Date>(new Date(Date.now() + 3600000));
  const [repeatFrequency, setRepeatFrequency] = useState<'none' | 'daily' | 'weekly' | 'monthly'>('none');
  const [endRepeatDate, setEndRepeatDate] = useState<Date>(new Date(Date.now() + 86400000 * 30));
  const [showPicker, setShowPicker] = useState<'start' | 'end' | 'repeatEnd' | null>(null);

  const handleImport = async () => {
    if (!url) {
      Alert.alert('Error', 'Please enter a valid ICS URL');
      return;
    }

    setLoading(true);
    try {
      const parsedDates = await fetchAndParseICS(url);
      setMarkedDates(parsedDates);
      Alert.alert('Success', 'Calendar events imported successfully!');
      setUrl('');
    } catch (error) {
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
      // NOTE: Using localhost for iOS simulator, or 10.0.2.2 for Android emulator
      const apiUrl = Platform.OS === 'android' ? 'http://10.0.2.2:8000/generate-ics' : 'http://localhost:8000/generate-ics';

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: magicText })
      });

      if (!response.ok) {
        throw new Error(`Backend error: ${response.statusText}`);
      }

      const icsData = await response.text();
      const newMarkedDates = parseICSString(icsData);

      setMarkedDates(prev => {
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
    const [year, month, day] = currentDate.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    if (viewMode === 'month') {
      date.setMonth(date.getMonth() + offset);
    } else if (viewMode === 'week') {
      date.setDate(date.getDate() + offset * 7);
    } else {
      date.setDate(date.getDate() + offset);
    }
    setCurrentDate(getLocalDateString(date));
  };

  const handleAddEvent = () => {
    if (!newEventTitle.trim()) {
      Alert.alert('Error', 'Please enter an event title');
      return;
    }

    const randomColor = ['#fdfd96', '#ffb7b2', '#a2e4b8', '#e2f0cb', '#cbaacb', '#b5ead7', '#ffdac1', '#9bf6ff'][Math.floor(Math.random() * 8)];

    const timeStr = `${startTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - ${endTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    const eventText = `${timeStr} - ${newEventTitle.trim()}`;

    setMarkedDates(prev => {
      const newDates = { ...prev };

      const [year, month, day] = currentDate.split('-').map(Number);
      let curr = new Date(year, month - 1, day);

      const endLimit = repeatFrequency === 'none' ? curr : endRepeatDate;
      const twoYearsFromNow = new Date();
      twoYearsFromNow.setFullYear(twoYearsFromNow.getFullYear() + 2);
      const safeEndLimit = endLimit > twoYearsFromNow ? twoYearsFromNow : endLimit;

      while (curr <= safeEndLimit) {
        const dateStr = getLocalDateString(curr);
        const dayData = newDates[dateStr] || { events: [] };

        newDates[dateStr] = {
          events: [...dayData.events, { title: eventText, color: randomColor }],
        };

        if (repeatFrequency === 'none') break;
        if (repeatFrequency === 'daily') curr.setDate(curr.getDate() + 1);
        else if (repeatFrequency === 'weekly') curr.setDate(curr.getDate() + 7);
        else if (repeatFrequency === 'monthly') curr.setMonth(curr.getMonth() + 1);
        else break;
      }

      return newDates;
    });

    setNewEventTitle('');
    setRepeatFrequency('none');
    setIsAddEventVisible(false);
  };

  const getWeekHasEvents = () => {
    // Get the start of the week (Sunday) for current date
    const [year, month, day] = currentDate.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    const dayOfWeek = date.getDay();
    const diff = date.getDate() - dayOfWeek;
    const sundayDate = new Date(year, month - 1, diff);

    // Check all 7 days of the week
    for (let i = 0; i < 7; i++) {
      const checkDate = new Date(sundayDate);
      checkDate.setDate(checkDate.getDate() + i);
      const dateStr = getLocalDateString(checkDate);
      if (markedDates[dateStr]?.events?.length > 0) {
        return true;
      }
    }
    return false;
  };

  const getWeekDateRange = () => {
    // Get the start of the week (Sunday) for current date
    const [year, month, day] = currentDate.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    const dayOfWeek = date.getDay();
    const diff = date.getDate() - dayOfWeek;
    const sundayDate = new Date(year, month - 1, diff);

    // Get end of week (Saturday)
    const saturdayDate = new Date(sundayDate);
    saturdayDate.setDate(saturdayDate.getDate() + 6);

    const startStr = sundayDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    const endStr = saturdayDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

    return `${startStr} - ${endStr}`;
  };

  const [initialLoading, setInitialLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setInitialLoading(true);

      // simulate fetch OR call your real fetch here
      await new Promise(res => setTimeout(res, 1500));

      setInitialLoading(false);
    };

    load();
  }, []);

  const renderDay = useCallback(({ date, state }: any) => {
    const dateString = date?.dateString;
    if (!dateString) return <View style={{ width: DAY_WIDTH, height: 100 }} />;

    const isToday = state === 'today';
    const isSelectedMonth = state !== 'disabled';

    if (initialLoading) {
      return (
        <View style={[styles.dayCellContainer, { backgroundColor: '#e5e5e5' }]}>
          <View style={{
            width: 20,
            height: 20,
            borderRadius: 10,
            backgroundColor: '#d0d0d0',
            marginBottom: 6
          }} />
          <View style={{ width: '80%', height: 6, backgroundColor: '#d0d0d0', marginBottom: 4 }} />
          <View style={{ width: '60%', height: 6, backgroundColor: '#d0d0d0' }} />
        </View>
      );
    }

    const dayData = markedDates[dateString];

    return (
      <View style={[
        styles.dayCellContainer,
        isToday && styles.todayDayCellContainer,
        !isSelectedMonth && styles.disabledDayCellContainer
      ]}>
        <View style={[
          styles.dateNumberContainer,
          isToday && styles.todayDateNumberContainer
        ]}>
          <Text style={[
            styles.dateText,
            !isSelectedMonth && styles.disabledDateText,
            isToday && styles.todayDateText
          ]}>
            {date?.day}
          </Text>
        </View>

        <View style={styles.eventsContainer}>
          {dayData?.events?.map((event, index) => (
            <View key={index} style={[styles.eventPill, { backgroundColor: event.color }]}>
              <Text style={styles.eventText} numberOfLines={1}>
                {event.title}
              </Text>
            </View>
          ))}
        </View>
      </View>
    );
  }, [markedDates, initialLoading]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        {/* Custom Header */}
        <View style={styles.headerRow}>
          <Text style={styles.yearText}>{year}</Text>
          <View style={styles.headerButtons}>
            <TouchableOpacity onPress={() => setIsAddEventVisible(true)} style={styles.circleButton}>
              <Text style={styles.circleButtonText}>{'+'}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => changeDate(-1)} style={styles.circleButton}>
              <Text style={styles.circleButtonText}>{'<'}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => changeDate(1)} style={styles.circleButton}>
              <Text style={styles.circleButtonText}>{'>'}</Text>
            </TouchableOpacity>
          </View>
        </View>

        <Text style={styles.monthText}>{month}</Text>

        <View style={styles.viewToggles}>
          {(['day', 'week', 'month'] as const).map(mode => (
            <TouchableOpacity
              key={mode}
              style={[styles.toggleBtn, viewMode === mode && styles.toggleBtnActive]}
              onPress={() => setViewMode(mode)}
            >
              <Text style={[styles.toggleText, viewMode === mode && styles.toggleTextActive]}>
                {mode.charAt(0).toUpperCase() + mode.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {viewMode === 'month' && (
          <View>
            <View style={styles.weekHeaderContainer}>
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                <Text key={day} style={styles.weekHeaderText}>{day}</Text>
              ))}
            </View>
            <CalendarList
              horizontal={true}
              pagingEnabled={true}
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
              showNonCurrentDates={true}
              hideExtraDays={false}
            theme={{
              calendarBackground: 'transparent',
              textSectionTitleColor: '#8c8c8c',
              textDayHeaderFontWeight: '600',
              textDayHeaderFontSize: 13,
              'stylesheet.calendar.header': {
                header: { display: 'none' },
                week: { display: 'none' }
              },
              'stylesheet.day.basic': {
                base: { width: DAY_WIDTH, height: 100, alignItems: 'center', padding: 0, margin: 0 }
              }
            } as any}
            />
          </View>
        )}

        {viewMode === 'week' && (
          getWeekHasEvents() ? (
            <ScrollView style={styles.dayViewContainer} showsVerticalScrollIndicator={false}>
              <Text style={styles.dayViewDate}>{getWeekDateRange()}</Text>
              <View style={styles.weekCalendarContainer}>
                <View style={styles.weekHeaderContainer}>
                  {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                    <Text key={day} style={styles.weekHeaderText}>{day}</Text>
                  ))}
                </View>
              <CalendarProvider date={currentDate} onDateChanged={setCurrentDate}>
                <WeekCalendar
                  firstDay={0}
                  dayComponent={renderDay}
                  showNonCurrentDates={true}
                  hideExtraDays={false}
                  theme={{
                    calendarBackground: 'transparent',
                    'stylesheet.calendar.header': {
                      header: { display: 'none' },
                      week: { display: 'none' }
                  },
                    'stylesheet.day.basic': {
                      base: { width: DAY_WIDTH, height: 100, alignItems: 'center', padding: 0, margin: 0 }
                    }
                  } as any}
                />
              </CalendarProvider>
              </View>
            </ScrollView>
          ) : (
            <View style={styles.emptyWeekContainer}>
              <Text style={styles.dayViewDate}>{getWeekDateRange()}</Text>
              <Text style={styles.noEventsText}>No events scheduled</Text>
            </View>
          )
        )}

        {viewMode === 'day' && (
          <ScrollView style={styles.dayViewContainer} showsVerticalScrollIndicator={false}>
            <Text style={styles.dayViewDate}>
              {(() => {
                const [y, m, d] = currentDate.split('-').map(Number);
                return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
              })()}
            </Text>
            <View style={styles.dayEventsList}>
              {markedDates[currentDate]?.events?.length > 0 ? (
                markedDates[currentDate].events.map((event, index) => (
                  <View key={index} style={[styles.dayEventRow, { borderLeftColor: event.color || '#000' }]}>
                    <Text style={styles.dayEventTitleText}>{event.title}</Text>
                  </View>
                ))
              ) : (
                <View style={styles.emptyDayContainer}>
                  <Text style={styles.noEventsText}>No events scheduled</Text>
                </View>
              )}
            </View>
          </ScrollView>
        )}

        {/* Import Section */}
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

        {/* Magic Import Section */}
        {viewMode !== 'month' && (
          <View
            style={[
              styles.magicImportContainer,
              {
                position: 'absolute',
                bottom: viewMode === 'day' ? 300 : 300,
                left: 20,
                right: 20,
              },
            ]}
          >
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
        )}
      </View>

      {/* Add Event Modal */}
      <Modal
        visible={isAddEventVisible}
        animationType="slide"
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
                return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
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
              <TouchableOpacity style={styles.timeButton} onPress={() => setShowPicker('start')}>
                <Text style={styles.timeButtonText}>
                  {startTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </Text>
              </TouchableOpacity>
            </View>

            <View style={styles.formRow}>
              <Text style={styles.formLabel}>End</Text>
              <TouchableOpacity style={styles.timeButton} onPress={() => setShowPicker('end')}>
                <Text style={styles.timeButtonText}>
                  {endTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </Text>
              </TouchableOpacity>
            </View>

            <View style={styles.repeatContainer}>
              <Text style={styles.formLabel}>Repeat</Text>
              <View style={styles.pillsRow}>
                {(['none', 'daily', 'weekly', 'monthly'] as const).map(freq => (
                  <TouchableOpacity
                    key={freq}
                    style={[styles.pill, repeatFrequency === freq && styles.pillActive]}
                    onPress={() => setRepeatFrequency(freq)}
                  >
                    <Text style={[styles.pillText, repeatFrequency === freq && styles.pillTextActive]}>
                      {freq.charAt(0).toUpperCase() + freq.slice(1)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {repeatFrequency !== 'none' && (
              <View style={styles.formRow}>
                <Text style={styles.formLabel}>Until</Text>
                <TouchableOpacity style={styles.timeButton} onPress={() => setShowPicker('repeatEnd')}>
                  <Text style={styles.timeButtonText}>
                    {endRepeatDate.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            {showPicker && (
              <View style={styles.pickerContainer}>
                <DateTimePicker
                  value={showPicker === 'start' ? startTime : showPicker === 'end' ? endTime : endRepeatDate}
                  mode={showPicker === 'repeatEnd' ? 'date' : 'time'}
                  display="default"
                  onChange={(event, selectedDate) => {
                    if (Platform.OS === 'android') setShowPicker(null);
                    if (selectedDate) {
                      if (showPicker === 'start') setStartTime(selectedDate);
                      else if (showPicker === 'end') setEndTime(selectedDate);
                      else if (showPicker === 'repeatEnd') setEndRepeatDate(selectedDate);
                    }
                  }}
                />
                {Platform.OS === 'ios' && (
                  <TouchableOpacity style={styles.pickerDoneBtn} onPress={() => setShowPicker(null)}>
                    <Text style={styles.pickerDoneText}>Done</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}

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

              <TouchableOpacity
                style={styles.modalAddButton}
                onPress={handleAddEvent}
              >
                <Text style={styles.modalAddButtonText}>Add</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
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
  circleButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  circleButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
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
    justifyContent: 'space-between',
    marginBottom: 10,
    paddingHorizontal: 2,
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
    minHeight: 500, // give enough room for the custom days
  },
  dayCellContainer: {
    width: '100%',
    height: 90, // adjust this to give more/less room to events
    alignItems: 'center',
    paddingTop: 5,
    borderWidth: 1,
    borderColor: '#d0d0d0',
    backgroundColor: '#fff',
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
    color: '#000', // black text for events to match design
  },
  importContainer: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 70 : 100, // Adjust for iOS safe area differences
    left: 20,
    right: 100, // Leave space for the floating button on the right
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 20,
    paddingHorizontal: 15,
    paddingVertical: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  magicImportContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 20,
    paddingHorizontal: 15,
    paddingVertical: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  magicInput: {
    flex: 1,
    fontSize: 14,
    color: '#000',
    maxHeight: 60,
  },
  magicImportButton: {
    backgroundColor: '#7b2cbf', // A nice purple for AI
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
  viewToggles: {
    flexDirection: 'row',
    backgroundColor: '#dfdddd',
    borderRadius: 20,
    padding: 4,
    marginBottom: 20,
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 16,
  },
  toggleBtnActive: {
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  toggleText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  toggleTextActive: {
    color: '#000',
  },
  dayViewContainer: {
    flex: 1,
    paddingHorizontal: 10,
  },
  dayViewDate: {
    fontSize: 18,
    fontWeight: '700',
    color: '#333',
    marginBottom: 20,
    marginTop: 10,
  },
  dayEventsList: {
    gap: 12,
  },
  weekCalendarContainer: {
    gap: 12,
  },
  dayEventRow: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    borderLeftWidth: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  dayEventTitleText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
  },
  emptyDayContainer: {
    padding: 30,
    alignItems: 'center',
  },
  emptyWeekContainer: {
    padding: 30,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 200,
  },
  noEventsText: {
    color: '#888',
    fontSize: 15,
    fontStyle: 'italic',
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
  pickerContainer: {
    alignItems: 'center',
    marginBottom: 16,
    backgroundColor: '#f9f9f9',
    borderRadius: 12,
    padding: 10,
  },
  pickerDoneBtn: {
    marginTop: 10,
    backgroundColor: '#000',
    paddingVertical: 8,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  pickerDoneText: {
    color: '#fff',
    fontWeight: '600',
  },
});
