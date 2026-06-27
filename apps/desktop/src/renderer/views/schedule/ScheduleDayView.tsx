import React, { useEffect, useRef } from 'react';
import type { CalendarEvent } from '../../convex';
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
  HOUR_HEIGHT,
  GRID_START_HOUR,
  GRID_END_HOUR,
  TIME_COLUMN_WIDTH,
} from './scheduleUtils';

interface ScheduleDayViewProps {
  events: CalendarEvent[];
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

/**
 * Single-day hour grid. Shares the same hour layout as ScheduleWeekView
 * (6am-10pm, HOUR_HEIGHT=60) so visual cadence stays consistent when
 * switching views. Auto-scrolls to current time on first mount.
 */
export function ScheduleDayView({
  events,
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

  return (
    <div className="flex flex-1 overflow-hidden">
      <div className="flex flex-col flex-1 overflow-hidden">
        {/* Header: day name + numeric date */}
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

        {/* Scrollable grid body */}
        <div
          ref={scrollContainerRef}
          className="flex-1 overflow-y-auto overflow-x-hidden"
        >
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

            {/* Single day column */}
            <div className="flex-1 relative border-l border-gray-100 dark:border-gray-800">
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
              {dayEvents.map((event) => (
                <DayEventBlock
                  key={event._id}
                  event={event}
                  now={now}
                  closerEmail={closerEmail}
                  onClick={() => onEventClick(event)}
                />
              ))}

              {/* Current time indicator */}
              {isToday && <CurrentTimeIndicator now={now} />}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ==================== Sub-components ====================

// Same shape as the week view's block but wider (single column = no
// compression). More fields are visible at typical event height.
function DayEventBlock({
  event,
  now,
  closerEmail,
  onClick,
}: {
  event: CalendarEvent;
  now: number;
  closerEmail?: string;
  onClick: () => void;
}) {
  const urgency = getEventUrgency(event, now);
  const urgencyColor = getUrgencyBlockColor(urgency);
  const color = urgency === 'now' ? urgencyColor : event.calendarColor ?? urgencyColor;
  const yOffset = eventYOffset(event);
  const height = eventBlockHeight(event);
  const platform = detectPlatform(event.meetingUrl);
  const prospect = getProspectAttendee(event, closerEmail);

  return (
    <div
      className="absolute left-1 right-2 rounded px-2 py-1 cursor-pointer overflow-hidden hover:brightness-95 transition-all"
      style={{
        top: yOffset,
        height: Math.max(height, 22),
        backgroundColor: `${color}E6`,
        borderLeft: `4px solid ${color}`,
      }}
      onClick={onClick}
    >
      <p className="text-white text-[12px] font-semibold truncate leading-tight">
        {event.title}
      </p>
      {height > 28 && (
        <p className="text-white/85 text-[10px] font-mono mt-0.5">
          {formatTime(event.startTime)} – {formatTime(event.endTime)}
        </p>
      )}
      {height > 50 && prospect && (
        <p className="text-white/80 text-[10px] truncate mt-0.5">
          {prospect.name || prospect.email}
        </p>
      )}
      {height > 70 && platform && (
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
