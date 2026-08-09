// "Add to calendar" for study sessions: a Google Calendar link (works
// everywhere via a browser) and a downloadable .ics for Apple/Outlook/etc.
// Every session is treated as a one-hour block — there's no end time in the
// schema (PLAN A1: the Directory doesn't publish meeting times either).
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';
import { notify } from './dialogs';
import type { StudySession } from './types';

const SESSION_DURATION_MS = 60 * 60 * 1000;

function pad(n: number) {
  return String(n).padStart(2, '0');
}

function toUtcStamp(d: Date) {
  return (
    d.getUTCFullYear() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    'T' +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds()) +
    'Z'
  );
}

function escapeIcsText(text: string) {
  return text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

export function googleCalendarUrl(s: StudySession) {
  const start = new Date(s.starts_at);
  const end = new Date(start.getTime() + SESSION_DURATION_MS);
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: s.title,
    dates: `${toUtcStamp(start)}/${toUtcStamp(end)}`,
    details: [s.description, `Hosted by ${s.host_name ?? 'a classmate'} · ${s.course_code}`]
      .filter(Boolean)
      .join('\n\n'),
    location: s.location ?? '',
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function icsContent(s: StudySession) {
  const start = new Date(s.starts_at);
  const end = new Date(start.getTime() + SESSION_DURATION_MS);
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Seatmates//EN',
    'BEGIN:VEVENT',
    `UID:${s.id}@seatmates.app`,
    `DTSTAMP:${toUtcStamp(new Date())}`,
    `DTSTART:${toUtcStamp(start)}`,
    `DTEND:${toUtcStamp(end)}`,
    `SUMMARY:${escapeIcsText(s.title)}`,
    s.description ? `DESCRIPTION:${escapeIcsText(s.description)}` : null,
    s.location ? `LOCATION:${escapeIcsText(s.location)}` : null,
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter((l): l is string => l !== null);
  return lines.join('\r\n');
}

/** Web: browser download. Native: write to cache + hand off to the share sheet
 * (that's how iOS/Android let a file get imported straight into Calendar). */
export async function downloadIcs(s: StudySession) {
  const content = icsContent(s);
  const filename = `${s.title.replace(/[^\w\- ]+/g, '').trim() || 'study-session'}.ics`;

  if (Platform.OS === 'web') {
    const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    return;
  }

  const file = new File(Paths.cache, filename);
  if (file.exists) file.delete();
  file.create();
  file.write(content);
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, {
      mimeType: 'text/calendar',
      dialogTitle: 'Add to calendar',
      UTI: 'com.apple.ical.ics',
    });
  } else {
    notify(
      'No share sheet available',
      'This device can’t hand the file off to a calendar app.',
    );
  }
}
