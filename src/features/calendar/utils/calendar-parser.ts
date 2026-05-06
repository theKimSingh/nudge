import ICAL from 'ical.js';

export interface CalendarEvent {
  title: string;
  color: string;
  done?: boolean;
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

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

export function parseICSString(
  icsData: string,
  rangeStart = new Date(),
  rangeEnd = new Date(Date.now() + 1000 * 60 * 60 * 24 * 90) // next 90 days
): MarkedDates {
  try {
    const jcalData = ICAL.parse(icsData);
    const comp = new ICAL.Component(jcalData);
    const vevents = comp.getAllSubcomponents('vevent');

    const markedDates: MarkedDates = {};

    vevents.forEach((vevent) => {
      const event = new ICAL.Event(vevent);
      const summary = event.summary || 'Event';

      const color =
        PASTEL_COLORS[hashString(summary) % PASTEL_COLORS.length];

      const baseEvent: CalendarEvent = {
        title: summary,
        color,
      };

      const isRecurring = !!event.component.getFirstPropertyValue('rrule');

      if (isRecurring) {
        const occurrences = expandRecurringEvent(
          event,
          rangeStart,
          rangeEnd
        );

        occurrences.forEach((occurrence) => {
          const end = occurrence.clone();
          end.addDuration(event.duration);

          addEventSpan(markedDates, occurrence, end, baseEvent);
        });
      } else {
        const start = event.startDate;
        const end = event.endDate || start;

        addEventSpan(markedDates, start, end, baseEvent);
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
    // Use local proxy server to bypass CORS restrictions
    const proxyUrl = `http://localhost:8000/proxy-ics?url=${encodeURIComponent(url)}`;
    
    const response = await fetch(proxyUrl);
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

function toDateString(date: ICAL.Time): string {
  return `${date.year}-${String(date.month).padStart(2, '0')}-${String(date.day).padStart(2, '0')}`;
}

function addEventSpan(
  markedDates: MarkedDates,
  start: ICAL.Time,
  end: ICAL.Time,
  event: CalendarEvent
) {
  let current = start.clone();
  const oneDay = new ICAL.Duration({ days: 1 });

  const isAllDay = start.isDate;

  let adjustedEnd = end.clone();
  if (isAllDay) {
    adjustedEnd.addDuration(new ICAL.Duration({ days: -1 }));
  }

  while (current.compare(adjustedEnd) <= 0) {
    const dateStr = toDateString(current);

    if (!markedDates[dateStr]) {
      markedDates[dateStr] = { events: [] };
    }

    markedDates[dateStr].events.push(event);

    current.addDuration(oneDay);
  }
}

function expandRecurringEvent(
  event: ICAL.Event,
  rangeStart: Date,
  rangeEnd: Date
): ICAL.Time[] {
  const occurrences: ICAL.Time[] = [];

  const iterator = event.iterator();
  let next: ICAL.Time | null;

  while ((next = iterator.next())) {
    const jsDate = next.toJSDate();

    if (jsDate > rangeEnd) break;
    if (jsDate >= rangeStart) {
      occurrences.push(next);
    }
  }

  return occurrences;
}
