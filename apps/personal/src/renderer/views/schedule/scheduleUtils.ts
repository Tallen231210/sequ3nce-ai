// Schedule utility functions and types
// Shared across all schedule components

import type { CalendarEvent } from '../../convex';

// ==================== Types ====================

export type ViewMode = 'list' | 'week';

export type EventUrgency = 'now' | 'soon' | 'today' | 'upcoming' | 'ended';

export interface UrgencyBadgeConfig {
  label: string;
  bgColor: string;
  textColor: string;
}

export interface PlatformInfo {
  label: string;
  bg: string;
  text: string;
}

// ==================== Urgency ====================

export function getEventUrgency(event: CalendarEvent, now: number): EventUrgency {
  const startDiffMin = (event.startTime - now) / 60000;
  const endDiffMin = (event.endTime - now) / 60000;

  if (endDiffMin < 0) return 'ended';
  if (startDiffMin < 0 && endDiffMin >= 0) return 'now';
  if (startDiffMin <= 5) return 'now';
  if (startDiffMin <= 60) return 'soon';

  const eventDate = new Date(event.startTime);
  const nowDate = new Date(now);
  if (eventDate.toDateString() === nowDate.toDateString()) return 'today';
  return 'upcoming';
}

export function getUrgencyBadgeConfig(urgency: EventUrgency): UrgencyBadgeConfig {
  switch (urgency) {
    case 'now': return { label: 'STARTING NOW', bgColor: '#F23333', textColor: '#FFFFFF' };
    case 'soon': return { label: 'SOON', bgColor: '#FFCC4D', textColor: '#805206' };
    case 'today': return { label: 'TODAY', bgColor: '#E6F1E6', textColor: '#338C4D' };
    case 'upcoming': return { label: 'UPCOMING', bgColor: '#EDEDED', textColor: '#737373' };
    case 'ended': return { label: 'ENDED', bgColor: '#EDEDED', textColor: '#8C8C8C' };
  }
}

/** Color for week grid event blocks */
export function getUrgencyBlockColor(urgency: EventUrgency): string {
  switch (urgency) {
    case 'now': return '#E63E3E';
    case 'soon': return '#D9A616';
    case 'today': return '#34A653';
    case 'upcoming': return '#4D80D9';
    case 'ended': return '#999999';
  }
}

// ==================== Platform Detection ====================

export function detectPlatform(url?: string): PlatformInfo | null {
  if (!url) return null;
  if (url.includes('zoom.us') || url.includes('zoom.com'))
    return { label: 'Zoom', bg: 'bg-blue-100', text: 'text-blue-700' };
  if (url.includes('meet.google.com'))
    return { label: 'Google Meet', bg: 'bg-green-100', text: 'text-green-700' };
  if (url.includes('teams.microsoft.com'))
    return { label: 'Teams', bg: 'bg-purple-100', text: 'text-purple-700' };
  return { label: 'Meeting', bg: 'bg-gray-100', text: 'text-gray-600' };
}

// ==================== Date / Time Formatting ====================

export function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

export function formatRelative(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function formatHourLabel(hour: number): string {
  if (hour === 0) return '12 AM';
  if (hour < 12) return `${hour} AM`;
  if (hour === 12) return '12 PM';
  return `${hour - 12} PM`;
}

export function formatDateHeader(dateKey: string): string {
  const date = new Date(dateKey + 'T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);

  if (date.getTime() === today.getTime()) return 'Today';
  if (date.getTime() === tomorrow.getTime()) return 'Tomorrow';
  return date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
}

export function formatWeekLabel(dates: Date[]): string {
  if (dates.length < 7) return '';
  const start = dates[0];
  const end = dates[6];
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  const startStr = start.toLocaleDateString('en-US', opts);
  const endStr = end.toLocaleDateString('en-US', { ...opts, year: 'numeric' });
  return `${startStr} – ${endStr}`;
}

// ==================== Week Date Calculations ====================

export function getWeekDates(weekOffset: number): Date[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const weekday = today.getDay(); // 0=Sun, 1=Mon...
  const daysToMonday = weekday === 0 ? -6 : 1 - weekday;
  const monday = new Date(today);
  monday.setDate(today.getDate() + daysToMonday + weekOffset * 7);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

// ==================== Event Grouping ====================

export function groupEventsByDate(events: CalendarEvent[]): Map<string, CalendarEvent[]> {
  const groups = new Map<string, CalendarEvent[]>();
  for (const event of events) {
    const d = new Date(event.startTime);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const existing = groups.get(key) || [];
    existing.push(event);
    groups.set(key, existing);
  }
  return groups;
}

export function getEventsForDate(events: CalendarEvent[], date: Date): CalendarEvent[] {
  return events.filter((e) => {
    const d = new Date(e.startTime);
    return d.getDate() === date.getDate() &&
           d.getMonth() === date.getMonth() &&
           d.getFullYear() === date.getFullYear();
  });
}

// ==================== Week Grid Positioning ====================

export const HOUR_HEIGHT = 60;
export const GRID_START_HOUR = 6;
export const GRID_END_HOUR = 22;
export const TIME_COLUMN_WIDTH = 52;

export function eventYOffset(event: CalendarEvent): number {
  const date = new Date(event.startTime);
  const hour = Math.max(date.getHours(), GRID_START_HOUR);
  const minute = date.getHours() < GRID_START_HOUR ? 0 : date.getMinutes();
  return (hour - GRID_START_HOUR) * HOUR_HEIGHT + (minute / 60) * HOUR_HEIGHT;
}

export function eventBlockHeight(event: CalendarEvent): number {
  const durationMin = (event.endTime - event.startTime) / 60000;
  return Math.max((durationMin / 60) * HOUR_HEIGHT, 18);
}

export function currentTimeYOffset(now: Date): number {
  const hour = now.getHours();
  const minute = now.getMinutes();
  if (hour < GRID_START_HOUR) return 0;
  if (hour >= GRID_END_HOUR) return (GRID_END_HOUR - GRID_START_HOUR) * HOUR_HEIGHT;
  return (hour - GRID_START_HOUR) * HOUR_HEIGHT + (minute / 60) * HOUR_HEIGHT;
}

// ==================== Prospect Attendee ====================

/** Returns the first non-organizer attendee from the event, or null if none */
export function getProspectAttendee(
  event: CalendarEvent,
  closerEmail?: string
): { email: string; name?: string } | null {
  if (!event.attendees?.length) return null;

  // Prefer filtering by isOrganizer flag
  const nonOrganizer = event.attendees.find((a) => a.isOrganizer === false);
  if (nonOrganizer) return nonOrganizer;

  // Fall back to filtering out the closer's own email
  if (closerEmail) {
    const other = event.attendees.find(
      (a) => a.email.toLowerCase() !== closerEmail.toLowerCase()
    );
    if (other) return other;
  }

  return null;
}

/** Extract prospect name from attendees or event title */
export function extractProspectName(
  event: CalendarEvent,
  closerEmail?: string
): string | undefined {
  // 1. Try attendee name first (most reliable when available)
  const prospect = getProspectAttendee(event, closerEmail);
  if (prospect?.name) return prospect.name;

  // 2. Try parsing from event title (e.g., "Strategy Call: John Smith")
  if (event.title?.includes(':')) {
    const afterColon = event.title.split(':').pop()?.trim();
    if (afterColon && afterColon.length >= 2 && afterColon.length <= 60) {
      return afterColon;
    }
  }

  return undefined;
}

// ==================== Overlap layout ====================

// Max event columns we split a time slot into before falling back to
// stacking. 3 covers the realistic ceiling for our users (multi-calendar
// closers + our coaching call = 3 concurrent max).
const MAX_OVERLAP_COLUMNS = 3;

/** Two events share time when their [start, end) ranges strictly intersect. */
export function eventsOverlap(a: CalendarEvent, b: CalendarEvent): boolean {
  return a.startTime < b.endTime && b.startTime < a.endTime;
}

export interface EventLayoutSlot {
  event: CalendarEvent;
  /** 0-indexed column within the overlap cluster. */
  columnIndex: number;
  /** Total columns in this event's cluster (1..MAX_OVERLAP_COLUMNS). */
  columnCount: number;
}

/**
 * Bucket one day's events into layout slots. Every event (personal or
 * coaching) participates in the same column-split — coaching events keep
 * their distinct violet color via CSS, but their block height reflects the
 * actual duration so users can see at a glance that a call is an hour long.
 * Transitively-overlapping events share one cluster and all report the
 * cluster's total columnCount (so their widths line up).
 *
 * Never throws — callers wrap in try/catch as a belt-and-suspenders, but this
 * function handles empty arrays, bad timestamps, and pathological overlaps
 * without propagating errors.
 */
export function layoutEventsForDay(events: CalendarEvent[]): EventLayoutSlot[] {
  if (events.length === 0) return [];

  // Sort events by start time, tiebreak longer-first so long events anchor
  // column 0 in their cluster.
  const sorted = [...events].sort((a, b) => {
    if (a.startTime !== b.startTime) return a.startTime - b.startTime;
    return (b.endTime - b.startTime) - (a.endTime - a.startTime);
  });

  // Greedy column assignment. `openCols[c]` is the endTime of the most recent
  // event placed in column c; a new event can take column c if its startTime
  // is >= that endTime.
  const openCols: number[] = [];
  const assigned = new Map<string, number>(); // event._id -> columnIndex
  for (const ev of sorted) {
    let placed = false;
    for (let c = 0; c < openCols.length && c < MAX_OVERLAP_COLUMNS; c++) {
      if (ev.startTime >= openCols[c]) {
        openCols[c] = ev.endTime;
        assigned.set(ev._id, c);
        placed = true;
        break;
      }
    }
    if (!placed) {
      if (openCols.length < MAX_OVERLAP_COLUMNS) {
        openCols.push(ev.endTime);
        assigned.set(ev._id, openCols.length - 1);
      } else {
        // Fallback: stack on the last column. Visually overlapping on col 2
        // is the documented edge case for 4+ concurrent personal events.
        assigned.set(ev._id, MAX_OVERLAP_COLUMNS - 1);
      }
    }
  }

  // Cluster events by transitive overlap so all events in an overlapping
  // group report the same columnCount — this keeps their widths consistent.
  // Union-find by id; N is small enough that a simple array implementation is fine.
  const idToIdx = new Map<string, number>();
  sorted.forEach((e, i) => idToIdx.set(e._id, i));
  const parent = sorted.map((_, i) => i);
  function find(i: number): number {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  }
  function union(i: number, j: number) {
    const ri = find(i), rj = find(j);
    if (ri !== rj) parent[ri] = rj;
  }
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      // Since sorted by startTime, j.start >= i.start. j overlaps i iff j.start < i.end.
      if (sorted[j].startTime >= sorted[i].endTime) break;
      union(i, j);
    }
  }
  const clusterMaxCol = new Map<number, number>();
  for (let i = 0; i < sorted.length; i++) {
    const root = find(i);
    const col = assigned.get(sorted[i]._id) ?? 0;
    clusterMaxCol.set(root, Math.max(clusterMaxCol.get(root) ?? 0, col));
  }

  const gridSlots: EventLayoutSlot[] = sorted.map((ev, i) => {
    const root = find(i);
    const columnCount = Math.min((clusterMaxCol.get(root) ?? 0) + 1, MAX_OVERLAP_COLUMNS);
    return {
      event: ev,
      columnIndex: assigned.get(ev._id) ?? 0,
      columnCount,
    };
  });

  return gridSlots;
}
