import React, { useEffect, useRef, useMemo } from 'react';
import type { CalendarEvent, CalendarSubscription } from '../../convex';
import {
  getEventsForDate,
  getEventUrgency,
  getUrgencyBlockColor,
  detectPlatform,
  formatTime,
  formatHourLabel,
  eventYOffset,
  eventBlockHeight,
  currentTimeYOffset,
  getProspectAttendee,
  layoutOverlappingEvents,
  HOUR_HEIGHT,
  GRID_START_HOUR,
  GRID_END_HOUR,
  TIME_COLUMN_WIDTH,
  type PositionedEvent,
} from './scheduleUtils';

interface ScheduleDayViewProps {
  events: CalendarEvent[];
  subscriptions: CalendarSubscription[];
  date: Date;
  now: number;
  closerEmail?: string;
  onEventClick: (event: CalendarEvent) => void;
}

const FULL_DAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

// Minimum width per calendar column. When N calendars don't fit at this width,
// the calendar header row + grid scrolls horizontally together.
const MIN_CALENDAR_COLUMN_WIDTH = 160;

// Color used for the calendar-name initial chip when no backgroundColor is set
const DEFAULT_CHIP_COLOR = '#6B7280';

/**
 * Day view with per-calendar columns. Each enabled sub-calendar gets its
 * own column with the calendar's name + a colored initial chip in the
 * header. Events render only in their parent calendar's column, which
 * eliminates the "everything stacks on top of everything else" problem
 * that closers with many subscribed calendars hit on busy days.
 *
 * Events whose `subscriptionId` doesn't match any enabled subscription
 * (legacy data from before the multi-cal migration, or events from
 * disabled subs that haven't been pruned) get grouped into a leading
 * "Primary" column so they still render somewhere visible.
 *
 * Falls back to a single column when the closer has zero subscriptions
 * (shouldn't happen post-migration but keeps the view rendering instead
 * of going blank if subscription fetch fails).
 *
 * Mirrors Google Calendar's "Day View with multiple calendars" pattern.
 */
export function ScheduleDayView({
  events,
  subscriptions,
  date,
  now,
  closerEmail,
  onEventClick,
}: ScheduleDayViewProps) {
  const totalHours = GRID_END_HOUR - GRID_START_HOUR;
  const gridHeight = totalHours * HOUR_HEIGHT;
  const hours = Array.from({ length: totalHours }, (_, i) => GRID_START_HOUR + i);
  const isToday = date.toDateString() === new Date().toDateString();
  const dayEvents = getEventsForDate(events, date);

  // Compute the column layout: one column per enabled subscription.
  // A synthetic "Primary" column at the front catches events whose
  // subscriptionId is unset or doesn't match any enabled subscription.
  const columns = useMemo(() => {
    const enabled = subscriptions.filter((s) => s.enabled);
    const enabledIds = new Set(enabled.map((s) => s._id));
    const orphans = dayEvents.filter(
      (e) => !e.subscriptionId || !enabledIds.has(e.subscriptionId),
    );
    const subscriptionColumns = enabled.map((sub) => ({
      key: sub._id,
      label: sub.label,
      color: sub.calendarBackgroundColor ?? DEFAULT_CHIP_COLOR,
      events: dayEvents.filter((e) => e.subscriptionId === sub._id),
    }));
    if (orphans.length > 0 || subscriptionColumns.length === 0) {
      return [
        {
          key: '__primary__',
          label: 'Primary',
          color: DEFAULT_CHIP_COLOR,
          events: orphans,
        },
        ...subscriptionColumns,
      ];
    }
    return subscriptionColumns;
  }, [dayEvents, subscriptions]);

  // Auto-scroll to current time on first mount.
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const hasAutoScrolled = useRef(false);
  useEffect(() => {
    if (hasAutoScrolled.current || !scrollContainerRef.current) return;
    hasAutoScrolled.current = true;
    const container = scrollContainerRef.current;
    const yOffset = currentTimeYOffset(new Date());
    const targetScroll = Math.max(0, yOffset - container.clientHeight / 3);
    container.scrollTop = targetScroll;
  }, []);

  // Calendar columns width: stretch to fill if N cols × MIN_WIDTH < container,
  // otherwise enforce MIN_WIDTH and let horizontal scroll handle overflow.
  const columnsContainerStyle: React.CSSProperties = {
    minWidth: columns.length * MIN_CALENDAR_COLUMN_WIDTH,
  };

  return (
    <div className="flex flex-1 overflow-hidden">
      <div className="flex flex-col flex-1 overflow-hidden">
        {/* Day header (full-width across calendar columns) */}
        <div className="flex items-center justify-center gap-3 py-2 border-b border-gray-200 dark:border-gray-700 shrink-0">
          <span
            className={`text-[12px] font-semibold tracking-wide ${
              isToday ? 'text-blue-500' : 'text-gray-500 dark:text-gray-400'
            }`}
          >
            {FULL_DAY_NAMES[date.getDay()].toUpperCase()}
          </span>
          <span
            className={`w-8 h-8 flex items-center justify-center text-[16px] rounded-full ${
              isToday
                ? 'bg-blue-500 text-white font-bold'
                : 'text-black dark:text-white'
            }`}
          >
            {date.getDate()}
          </span>
        </div>

        {/* Calendar column headers — fixed time-column spacer on the left,
            then one chip per calendar. Horizontally scrolls together with
            the grid body below via a shared overflow-x parent. */}
        <div
          ref={scrollContainerRef}
          className="flex-1 overflow-y-auto overflow-x-auto"
        >
          <div className="flex flex-col" style={columnsContainerStyle}>
            {/* Sticky-ish header row — using regular div, not sticky, since
                scrollContainer drives both axes. */}
            <div className="flex border-b border-gray-200 dark:border-gray-700 shrink-0 bg-white dark:bg-gray-900">
              {/* Time column spacer */}
              <div style={{ width: TIME_COLUMN_WIDTH }} className="shrink-0" />
              {columns.map((col) => (
                <div
                  key={col.key}
                  className="flex-1 flex items-center justify-center gap-2 px-2 py-1.5 border-l border-gray-100 dark:border-gray-800 min-w-0"
                  style={{ minWidth: MIN_CALENDAR_COLUMN_WIDTH }}
                >
                  <div
                    className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0"
                    style={{ backgroundColor: col.color }}
                    title={col.label}
                  >
                    {col.label.charAt(0).toUpperCase()}
                  </div>
                  <span className="text-[12px] font-medium text-gray-700 dark:text-gray-300 truncate">
                    {col.label}
                  </span>
                </div>
              ))}
            </div>

            {/* Grid body */}
            <div className="flex" style={{ height: gridHeight }}>
              {/* Time labels column */}
              <div className="shrink-0 relative" style={{ width: TIME_COLUMN_WIDTH }}>
                {hours.map((hour) => (
                  <div
                    key={hour}
                    className="absolute right-2 text-[10px] font-mono font-medium text-gray-400 dark:text-gray-500"
                    style={{ top: (hour - GRID_START_HOUR) * HOUR_HEIGHT - 6 }}
                  >
                    {formatHourLabel(hour)}
                  </div>
                ))}
              </div>

              {/* Per-calendar columns */}
              {columns.map((col) => (
                <DayCalendarColumn
                  key={col.key}
                  events={col.events}
                  hours={hours}
                  isToday={isToday}
                  now={now}
                  closerEmail={closerEmail}
                  onEventClick={onEventClick}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ==================== Sub-components ====================

function DayCalendarColumn({
  events,
  hours,
  isToday,
  now,
  closerEmail,
  onEventClick,
}: {
  events: CalendarEvent[];
  hours: number[];
  isToday: boolean;
  now: number;
  closerEmail?: string;
  onEventClick: (event: CalendarEvent) => void;
}) {
  // Even within a single calendar, two events can overlap (e.g., a 9am
  // standup and a 9am 1:1). Layout them side-by-side within this column.
  const positioned = useMemo(() => layoutOverlappingEvents(events), [events]);

  return (
    <div
      className="flex-1 relative border-l border-gray-100 dark:border-gray-800"
      style={{ minWidth: MIN_CALENDAR_COLUMN_WIDTH }}
    >
      {/* Today highlight */}
      {isToday && (
        <div className="absolute inset-0 bg-blue-50/50 dark:bg-blue-950/20" />
      )}

      {/* Hour grid lines */}
      {hours.map((hour) => (
        <div
          key={hour}
          className="absolute w-full border-t border-gray-100 dark:border-gray-800"
          style={{ top: (hour - GRID_START_HOUR) * HOUR_HEIGHT }}
        />
      ))}

      {/* Event blocks */}
      {positioned.map((p) => (
        <DayEventBlock
          key={p.event._id}
          positioned={p}
          now={now}
          closerEmail={closerEmail}
          onClick={() => onEventClick(p.event)}
        />
      ))}

      {/* Current time indicator */}
      {isToday && <CurrentTimeIndicator now={now} />}
    </div>
  );
}

function DayEventBlock({
  positioned,
  now,
  closerEmail,
  onClick,
}: {
  positioned: PositionedEvent;
  now: number;
  closerEmail?: string;
  onClick: () => void;
}) {
  const { event, column, maxCols } = positioned;
  const urgency = getEventUrgency(event, now);
  const urgencyColor = getUrgencyBlockColor(urgency);
  const color = urgency === 'now' ? urgencyColor : event.calendarColor ?? urgencyColor;
  const yOffset = eventYOffset(event);
  const height = eventBlockHeight(event);
  const platform = detectPlatform(event.meetingUrl);
  const prospect = getProspectAttendee(event, closerEmail);

  const widthPct = 100 / maxCols;
  const leftPct = column * widthPct;

  return (
    <div
      className="absolute rounded px-2 py-1 cursor-pointer overflow-hidden hover:brightness-95 transition-all"
      style={{
        top: yOffset,
        height: Math.max(height, 22),
        left: `calc(${leftPct}% + 2px)`,
        width: `calc(${widthPct}% - 4px)`,
        backgroundColor: `${color}E6`,
        borderLeft: `3px solid ${color}`,
      }}
      onClick={onClick}
    >
      <p className="text-white text-[11px] font-semibold truncate leading-tight">
        {event.title}
      </p>
      {height > 28 && (
        <p className="text-white/85 text-[10px] font-mono mt-0.5">
          {formatTime(event.startTime)} – {formatTime(event.endTime)}
        </p>
      )}
      {height > 50 && prospect && maxCols <= 2 && (
        <p className="text-white/80 text-[10px] truncate mt-0.5">
          {prospect.name || prospect.email}
        </p>
      )}
      {height > 70 && platform && maxCols <= 2 && (
        <p className="text-white/80 text-[10px] flex items-center gap-1 mt-0.5">
          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
            <path d="M2 6a2 2 0 012-2h6a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6zm12.553 1.106A1 1 0 0014 8v4a1 1 0 00.553.894l2 1A1 1 0 0018 13V7a1 1 0 00-1.447-.894l-2 1z" />
          </svg>
          {platform.label}
        </p>
      )}
    </div>
  );
}

function CurrentTimeIndicator({ now }: { now: number }) {
  const yOffset = currentTimeYOffset(new Date(now));
  const currentHour = new Date(now).getHours();
  if (currentHour < GRID_START_HOUR || currentHour >= GRID_END_HOUR) return null;
  return (
    <div
      className="absolute left-0 right-0 flex items-center z-10 pointer-events-none"
      style={{ top: yOffset }}
    >
      <div className="w-2 h-2 rounded-full bg-red-500 -ml-1 shrink-0" />
      <div className="flex-1 h-0.5 bg-red-500" />
    </div>
  );
}
