import React from 'react';
import type { CalendarEvent } from '../../convex';
import {
  getEventsForDate,
  getEventUrgency,
  getUrgencyBlockColor,
  formatTime,
} from './scheduleUtils';

interface ScheduleMonthViewProps {
  events: CalendarEvent[];
  cells: Date[]; // exactly 42 (6 weeks × 7 days)
  monthAnchor: Date; // first day of the displayed month, used to tell in-month vs adjacent
  now: number;
  onDayClick: (date: Date) => void;
  onEventClick: (event: CalendarEvent) => void;
}

const WEEKDAY_HEADERS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
const MAX_EVENTS_PER_CELL = 3;

/**
 * Month view: a 6×7 grid of day cells. Each cell shows the day number plus
 * up to MAX_EVENTS_PER_CELL event chips with start time + title. Anything
 * beyond renders as "+N more". Clicking a day jumps to the Day view (see
 * onDayClick) — same affordance as Google Calendar. Clicking an event chip
 * opens the meeting modal directly without switching views.
 */
export function ScheduleMonthView({
  events,
  cells,
  monthAnchor,
  now,
  onDayClick,
  onEventClick,
}: ScheduleMonthViewProps) {
  const todayStr = new Date().toDateString();
  const displayedMonth = monthAnchor.getMonth();

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Weekday header row */}
      <div className="grid grid-cols-7 border-b border-gray-200 dark:border-gray-700 shrink-0">
        {WEEKDAY_HEADERS.map((label) => (
          <div
            key={label}
            className="text-[10px] font-semibold tracking-wide text-gray-500 dark:text-gray-400 text-center py-2"
          >
            {label}
          </div>
        ))}
      </div>

      {/* 6 × 7 grid body — let it fill remaining height and divide evenly. */}
      <div className="flex-1 grid grid-cols-7 grid-rows-6 overflow-hidden">
        {cells.map((date, i) => {
          const isToday = date.toDateString() === todayStr;
          const isInMonth = date.getMonth() === displayedMonth;
          const dayEvents = getEventsForDate(events, date).sort(
            (a, b) => a.startTime - b.startTime,
          );
          const shown = dayEvents.slice(0, MAX_EVENTS_PER_CELL);
          const extra = dayEvents.length - shown.length;

          return (
            <button
              key={i}
              onClick={() => onDayClick(date)}
              className={`text-left flex flex-col gap-0.5 border-r border-b border-gray-100 dark:border-gray-800 px-1.5 py-1 hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors overflow-hidden ${
                isInMonth
                  ? 'bg-white dark:bg-gray-950'
                  : 'bg-gray-50/60 dark:bg-gray-900/40'
              }`}
            >
              {/* Day number — circled if today, dimmed if outside current month */}
              <div className="flex items-center justify-between shrink-0">
                <span
                  className={`text-[11px] font-semibold w-5 h-5 flex items-center justify-center rounded-full ${
                    isToday
                      ? 'bg-blue-500 text-white'
                      : isInMonth
                        ? 'text-gray-900 dark:text-gray-100'
                        : 'text-gray-400 dark:text-gray-600'
                  }`}
                >
                  {date.getDate()}
                </span>
              </div>

              {/* Event chips — vertical stack, truncated. Clicking a chip
                  opens the meeting modal directly; the wrapping button's
                  onDayClick still fires for clicks on empty space. */}
              <div className="flex flex-col gap-0.5 overflow-hidden">
                {shown.map((event) => (
                  <MonthEventChip
                    key={event._id}
                    event={event}
                    now={now}
                    onClick={(e) => {
                      e.stopPropagation();
                      onEventClick(event);
                    }}
                  />
                ))}
                {extra > 0 && (
                  <span className="text-[9px] font-semibold text-gray-500 dark:text-gray-400 px-1">
                    +{extra} more
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ==================== Sub-components ====================

function MonthEventChip({
  event,
  now,
  onClick,
}: {
  event: CalendarEvent;
  now: number;
  onClick: (e: React.MouseEvent) => void;
}) {
  const urgency = getEventUrgency(event, now);
  const urgencyColor = getUrgencyBlockColor(urgency);
  const color = urgency === 'now' ? urgencyColor : event.calendarColor ?? urgencyColor;

  return (
    <div
      onClick={onClick}
      className="rounded px-1 py-0.5 cursor-pointer hover:brightness-95 transition-all flex items-center gap-1 min-w-0"
      style={{
        backgroundColor: `${color}E6`,
      }}
      title={event.title}
    >
      <span className="text-white text-[9px] font-mono shrink-0">
        {formatTime(event.startTime)}
      </span>
      <span className="text-white text-[9px] font-medium truncate flex-1">
        {event.title}
      </span>
    </div>
  );
}
