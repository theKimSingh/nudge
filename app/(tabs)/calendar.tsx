import React, { useState, useCallback, useMemo } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, SafeAreaView, TextInput, Alert, ActivityIndicator } from 'react-native';
import { Calendar } from 'react-native-calendars';
import { fetchAndParseICS, MarkedDates } from '@/utils/calendarParser';

const BG_COLOR = '#e8e6e1'; // Warm off-white
const TEXT_COLOR = '#000000';

export default function CalendarScreen() {
  const [url, setUrl] = useState('');
  const [markedDates, setMarkedDates] = useState<MarkedDates>({});
  const [loading, setLoading] = useState(false);
  const [currentDate, setCurrentDate] = useState(new Date().toISOString().split('T')[0]);

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

  const getMonthYearString = (dateString: string) => {
    const date = new Date(dateString);
    const month = date.toLocaleString('default', { month: 'short' });
    const year = date.getFullYear();
    return { month, year };
  };

  const { month, year } = useMemo(() => getMonthYearString(currentDate), [currentDate]);

  const changeMonth = (offset: number) => {
    const date = new Date(currentDate);
    date.setMonth(date.getMonth() + offset);
    setCurrentDate(date.toISOString().split('T')[0]);
  };

  const renderDay = useCallback(({ date, state }: any) => {
    const dateString = date?.dateString;
    if (!dateString) return null;

    const dayData = markedDates[dateString];
    const isToday = state === 'today';
    const isSelectedMonth = state !== 'disabled';

    return (
      <View style={styles.dayCellContainer}>
        <View style={[styles.dateNumberContainer, isToday && styles.todayDateNumberContainer]}>
          <Text style={[styles.dateText, !isSelectedMonth && styles.disabledDateText, isToday && styles.todayDateText]}>
            {date?.day}
          </Text>
        </View>
        <View style={styles.eventsContainer}>
          {dayData?.events?.map((event, index) => (
            <View key={index} style={[styles.eventPill, { backgroundColor: event.color }]}>
              <Text style={styles.eventText} numberOfLines={1} ellipsizeMode="tail">
                {event.title}
              </Text>
            </View>
          ))}
        </View>
      </View>
    );
  }, [markedDates]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        {/* Custom Header */}
        <View style={styles.headerRow}>
          <Text style={styles.yearText}>{year}</Text>
          <View style={styles.headerButtons}>
            <TouchableOpacity onPress={() => { }} style={styles.circleButton}>
              <Text style={styles.circleButtonText}>{'+'}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => changeMonth(-1)} style={styles.circleButton}>
              <Text style={styles.circleButtonText}>{'<'}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => changeMonth(1)} style={styles.circleButton}>
              <Text style={styles.circleButtonText}>{'>'}</Text>
            </TouchableOpacity>
          </View>
        </View>

        <Text style={styles.monthText}>{month}</Text>

        <Calendar
          key={currentDate} // Force re-render on month change to update days correctly if needed
          current={currentDate}
          onMonthChange={(month) => setCurrentDate(month.dateString)}
          dayComponent={renderDay}
          hideArrows={true}
          renderHeader={() => null} // Hide default header
          style={styles.calendarContainer}
          theme={{
            calendarBackground: 'transparent',
            textSectionTitleColor: '#8c8c8c',
            textDayHeaderFontWeight: '600',
            textDayHeaderFontSize: 13,
            'stylesheet.calendar.header': {
              header: {
                flexDirection: 'row',
                justifyContent: 'space-between',
                paddingLeft: 10,
                paddingRight: 10,
                marginTop: 6,
                alignItems: 'center',
                display: 'none', // hide completely
              },
              week: {
                flexDirection: 'row',
                justifyContent: 'space-between',
                borderBottomWidth: 1,
                borderBottomColor: '#e0e0e0',
                paddingBottom: 10,
                marginBottom: 10,
              }
            },
            'stylesheet.day.basic': {
              base: {
                width: '100%',
                height: 100, // Fixed height for grid cells
                alignItems: 'center',
              }
            }
          } as any}
        />

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
      </View>
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
    marginBottom: 10,
  },
  calendarContainer: {
    backgroundColor: 'transparent',
    minHeight: 500, // give enough room for the custom days
  },
  dayCellContainer: {
    width: '100%',
    height: 90, // adjust this to give more/less room to events
    alignItems: 'center',
    paddingTop: 5,
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
    color: '#b0b0b0',
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
    flexDirection: 'row',
    marginTop: 'auto',
    marginBottom: 20,
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
});
