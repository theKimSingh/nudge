import ICAL from 'ical.js';

export interface CalendarEvent {
  title: string;
  color: string;
}

export interface MarkedDates {
  [date: string]: {
    events: CalendarEvent[];
  };
}

const PASTEL_COLORS = [
  '#fdfd96', // yellow
  '#ffb7b2', // pink
  '#a2e4b8', // green
  '#e2f0cb', // light green
  '#cbaacb', // purple
  '#b5ead7', // mint
  '#ffdac1', // peach
  '#e0e0e0', // gray
  '#9bf6ff', // cyan
];

export function parseICSString(icsData: string): MarkedDates {
  try {
    const jcalData = ICAL.parse(icsData);
    const comp = new ICAL.Component(jcalData);
    const vevents = comp.getAllSubcomponents('vevent');

    const markedDates: MarkedDates = {};

    vevents.forEach((vevent, index) => {
      const event = new ICAL.Event(vevent);
      const startDate = event.startDate;
      const summary = event.summary || 'Event';
      
      const colorIndex = (summary.length + index) % PASTEL_COLORS.length;
      const color = PASTEL_COLORS[colorIndex];

      if (startDate) {
        const dateStr = `${startDate.year}-${String(startDate.month).padStart(2, '0')}-${String(startDate.day).padStart(2, '0')}`;
        
        if (!markedDates[dateStr]) {
          markedDates[dateStr] = { events: [] };
        }
        
        markedDates[dateStr].events.push({
          title: summary,
          color: color,
        });
      }
    });

    return markedDates;
  } catch (error) {
    console.error('Error parsing ICS string:', error);
    throw error;
  }
}

export async function fetchAndParseICS(url: string): Promise<MarkedDates> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch ICS file: ${response.statusText}`);
    }
    const icsData = await response.text();
    return parseICSString(icsData);
  } catch (error) {
    console.error('Error fetching ICS file:', error);
    throw error;
  }
}
