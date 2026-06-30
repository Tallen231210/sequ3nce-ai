// Schedule utility functions and types
// Shared across all schedule components

import type { CalendarEvent } from '../../convex';

// ==================== Types ====================

export type ViewMode = 'list' | 'day' | 'week' | 'month';

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

/** Single-day view: returns midnight-anchored date for `today + dayOffset` */
export function getDayDate(dayOffset: number): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + dayOffset);
  return d;
}

/** Month view: returns the 42 cells (6 weeks × 7 days, Mon-Sun) covering the
 *  month containing `today + monthOffset` months, padded with leading/trailing
 *  days from the adjacent months to fill the grid. */
export function getMonthDates(monthOffset: number): {
  cells: Date[];
  monthAnchor: Date;
} {
  const today = new Date();
  const monthAnchor = new Date(today.getFullYear(), today.getMonth() + monthOffset, 1);
  const monthAnchorWeekday = monthAnchor.getDay();
  const daysFromMonday = monthAnchorWeekday === 0 ? 6 : monthAnchorWeekday - 1;
  const gridStart = new Date(monthAnchor);
  gridStart.setDate(monthAnchor.getDate() - daysFromMonday);
  gridStart.setHours(0, 0, 0, 0);
  const cells = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    return d;
  });
  return { cells, monthAnchor };
}

/** Header label for the Day view ("Today", "Tomorrow", or "Mon, Jun 30, 2026") */
export function formatDayLabel(date: Date): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const dayMs = date.getTime();
  if (dayMs === today.getTime()) return 'Today';
  if (dayMs === tomorrow.getTime()) return 'Tomorrow';
  if (dayMs === yesterday.getTime()) return 'Yesterday';
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/** Header label for the Month view ("June 2026") */
export function formatMonthLabel(monthAnchor: Date): string {
  return monthAnchor.toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
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

// ==================== Overlap Layout ====================

/**
 * Each event gets a horizontal column within its overlap cluster so that
 * concurrent events render side-by-side instead of stacked. Standard
 * Google Calendar week-view layout: events that overlap in time split
 * the day-column horizontally, each one rendering at width = 1/cluster.cols.
 *
 * Algorithm:
 *  1. Sort events by start time
 *  2. Walk them, grouping into "clusters" where any pair overlaps
 *     (transitively — A overlaps B, B overlaps C → all share a cluster)
 *  3. Within a cluster, each event takes the smallest column index not
 *     already claimed by a still-overlapping earlier event
 *  4. The cluster's maxCols (= max column index + 1) is what every event
 *     in that cluster uses for its width
 *
 * Tradeoff: cluster width is uniform across the cluster, even when some
 * events in the cluster don't overlap directly. Google does the same —
 * the alternative (per-event optimal width) gets visually confusing
 * because events change width mid-cluster.
 */
export interface PositionedEvent {
  event: CalendarEvent;
  column: number; // 0-indexed
  maxCols: number; // total columns in this event's overlap cluster
}

export function layoutOverlappingEvents(events: CalendarEvent[]): PositionedEvent[] {
  if (events.length === 0) return [];

  const sorted = [...events].sort((a, b) => a.startTime - b.startTime);
  type Cluster = {
    members: CalendarEvent[];
    columnByEventId: Map<string, number>;
    maxCols: number;
    clusterEnd: number; // max endTime of any member — drives "is this event in this cluster?"
  };
  const clusters: Cluster[] = [];

  for (const event of sorted) {
    // Find a cluster this event overlaps with. Since events are sorted by
    // start time, only the most recent cluster can possibly still overlap.
    const tail = clusters[clusters.length - 1];
    const overlapsTail = tail && tail.clusterEnd > event.startTime;

    if (!overlapsTail) {
      clusters.push({
        members: [event],
        columnByEventId: new Map([[event._id, 0]]),
        maxCols: 1,
        clusterEnd: event.endTime,
      });
      continue;
    }

    // Find the smallest column not currently held by an event whose end is
    // after this event's start (i.e., one that's still in-flight).
    const occupied = new Set<number>();
    for (const m of tail.members) {
      if (m.endTime > event.startTime) {
        occupied.add(tail.columnByEventId.get(m._id)!);
      }
    }
    let col = 0;
    while (occupied.has(col)) col++;
    tail.members.push(event);
    tail.columnByEventId.set(event._id, col);
    tail.maxCols = Math.max(tail.maxCols, col + 1);
    tail.clusterEnd = Math.max(tail.clusterEnd, event.endTime);
  }

  const out: PositionedEvent[] = [];
  for (const cluster of clusters) {
    for (const m of cluster.members) {
      out.push({
        event: m,
        column: cluster.columnByEventId.get(m._id)!,
        maxCols: cluster.maxCols,
      });
    }
  }
  return out;
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
  closerEmail?: string,
  closerName?: string,
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

  // 3. Scheduling-tool fallback (Calendly, Acuity, SavvyCal …): titles in
  // "<Prospect> and <Closer>" / "with" / "&" format. Sub-calendar events
  // from these tools typically have NO attendees populated by Google's API,
  // so this is our last-ditch extraction. Mirrors the server-side helper at
  // `apps/web/convex/lib/extractProspectFromTitle.ts` — keep the two in
  // sync if either's algorithm changes.
  if (event.title && closerName) {
    const parsed = parseFromMeetingTitle(event.title, closerName);
    if (parsed) return parsed;
  }

  return undefined;
}

const TITLE_SEPARATORS = [
  ' and ',
  ' with ',
  ' & ',
  ' + ',
  ' / ',
  ' vs ',
  ' vs. ',
] as const;
const NAME_VALIDATOR = /^\p{L}[\p{L}\s'.\-]{1,59}$/u;

function parseFromMeetingTitle(
  title: string,
  closerName: string,
): string | undefined {
  const cleanTitle = title.trim().replace(/\s+/g, ' ');
  if (!cleanTitle) return undefined;
  const cleanCloser = closerName.trim().replace(/\s+/g, ' ');
  if (!cleanCloser) return undefined;
  const closerFirstName = cleanCloser.split(' ')[0].toLowerCase();
  if (closerFirstName.length < 2) return undefined;
  const lowerTitle = cleanTitle.toLowerCase();

  for (const sep of TITLE_SEPARATORS) {
    const idx = lowerTitle.indexOf(sep);
    if (idx === -1) continue;
    const partA = cleanTitle.slice(0, idx).trim();
    const partB = cleanTitle.slice(idx + sep.length).trim();
    if (!partA || !partB) continue;

    const aHasCloser = containsName(partA, closerFirstName);
    const bHasCloser = containsName(partB, closerFirstName);
    let candidate: string | undefined;
    if (aHasCloser && !bHasCloser) candidate = partB;
    else if (bHasCloser && !aHasCloser) candidate = partA;

    if (candidate) {
      const validated = validateName(candidate);
      if (validated) return validated;
    }
  }
  return undefined;
}

function containsName(haystack: string, needleLower: string): boolean {
  const lower = haystack.toLowerCase();
  let from = 0;
  while (true) {
    const idx = lower.indexOf(needleLower, from);
    if (idx === -1) return false;
    const before = idx === 0 ? '' : lower[idx - 1];
    const after =
      idx + needleLower.length >= lower.length
        ? ''
        : lower[idx + needleLower.length];
    if (!isLetter(before) && !isLetter(after)) return true;
    from = idx + 1;
  }
}

function isLetter(ch: string): boolean {
  if (!ch) return false;
  return /\p{L}/u.test(ch);
}

function validateName(s: string): string | undefined {
  const candidate = s.trim().replace(/[.,;:!?]+$/, '').trim();
  if (candidate.length < 2 || candidate.length > 60) return undefined;
  if (!NAME_VALIDATOR.test(candidate)) return undefined;
  return candidate;
}
