"use client";

import React, { useEffect, useMemo, useRef } from 'react';
import type { CalendarEvent } from '@/lib/closer/client';
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
import { TodayAgendaSidebar } from './TodayAgendaSidebar';

interface ScheduleWeekViewProps {
  events: CalendarEvent[];
  weekDates: Date[];
  now: number;
  closerEmail?: string;
  onEventClick: (event: CalendarEvent) => void;
}

const DAY_NAMES = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

export function ScheduleWeekView({ events, weekDates, now, closerEmail, onEventClick }: ScheduleWeekViewProps) {
  const totalHours = GRID_END_HOUR - GRID_START_HOUR;
  const gridHeight = totalHours * HOUR_HEIGHT;
  const hours = Array.from({ length: totalHours }, (_, i) => GRID_START_HOUR + i);
  const todayStr = new Date().toDateString();

  // Auto-scroll to current time on mount
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
      {/* Week grid */}
      <div className="flex flex-col flex-1 overflow-hidden">
        {/* Day headers */}
        <div className="flex border-b border-gray-200 shrink-0">
          {/* Spacer for time column */}
          <div style={{ width: TIME_COLUMN_WIDTH }} className="shrink-0" />

          {weekDates.map((date, i) => {
            const isToday = date.toDateString() === todayStr;
            return (
              <div key={i} className="flex-1 flex flex-col items-center py-2 border-l border-gray-100">
                <span className={`text-[10px] font-semibold tracking-wide ${
                  isToday ? 'text-blue-500' : 'text-gray-500'
                }`}>
                  {DAY_NAMES[i]}
                </span>
                <span className={`w-7 h-7 flex items-center justify-center text-[14px] rounded-full mt-0.5 ${
                  isToday
                    ? 'bg-blue-500 text-white font-bold'
                    : 'text-black'
                }`}>
                  {date.getDate()}
                </span>
              </div>
            );
          })}
        </div>

        {/* Scrollable grid body */}
        <div ref={scrollContainerRef} className="flex-1 overflow-y-auto overflow-x-hidden">
          <div className="flex" style={{ height: gridHeight }}>
            {/* Time labels column */}
            <div className="shrink-0 relative" style={{ width: TIME_COLUMN_WIDTH }}>
              {hours.map((hour) => (
                <div
                  key={hour}
                  className="absolute right-2 text-[10px] font-mono font-medium text-gray-400"
                  style={{ top: (hour - GRID_START_HOUR) * HOUR_HEIGHT - 6 }}
                >
                  {formatHourLabel(hour)}
                </div>
              ))}
            </div>

            {/* Day columns */}
            {weekDates.map((date, i) => (
              <WeekDayColumn
                key={i}
                date={date}
                events={events}
                hours={hours}
                isToday={date.toDateString() === todayStr}
                now={now}
                closerEmail={closerEmail}
                onEventClick={onEventClick}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Today's agenda sidebar */}
      <TodayAgendaSidebar
        events={events}
        now={now}
        closerEmail={closerEmail}
        onEventClick={onEventClick}
      />
    </div>
  );
}

// ==================== Sub-components ====================

function WeekDayColumn({
  date,
  events,
  hours,
  isToday,
  now,
  closerEmail,
  onEventClick,
}: {
  date: Date;
  events: CalendarEvent[];
  hours: number[];
  isToday: boolean;
  now: number;
  closerEmail?: string;
  onEventClick: (event: CalendarEvent) => void;
}) {
  // Run the overlap layout per day. Events from different calendars often
  // land at the same time slot; without this they'd stack on top of each
  // other and the user would see one block instead of N. Side-by-side
  // packing matches Google Calendar's week view exactly.
  const dayEvents = useMemo(() => getEventsForDate(events, date), [events, date]);
  const positioned = useMemo(() => layoutOverlappingEvents(dayEvents), [dayEvents]);

  return (
    <div className="flex-1 relative border-l border-gray-100">
      {/* Today highlight */}
      {isToday && (
        <div className="absolute inset-0 bg-blue-50/50" />
      )}

      {/* Hour grid lines */}
      {hours.map((hour) => (
        <div
          key={hour}
          className="absolute w-full border-t border-gray-100"
          style={{ top: (hour - GRID_START_HOUR) * HOUR_HEIGHT }}
        />
      ))}

      {/* Event blocks */}
      {positioned.map((p) => (
        <WeekEventBlock
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

function WeekEventBlock({
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
  // Prefer Google's color (per-event override or calendar default) when present;
  // fall back to urgency-based color. "Now" urgency always takes priority since
  // that's the visual cue saying "join this RIGHT NOW".
  const color = urgency === 'now' ? urgencyColor : event.calendarColor ?? urgencyColor;
  const yOffset = eventYOffset(event);
  const height = eventBlockHeight(event);
  const platform = detectPlatform(event.meetingUrl);
  const prospect = getProspectAttendee(event, closerEmail);

  const widthPct = 100 / maxCols;
  const leftPct = column * widthPct;

  return (
    <div
      className="absolute rounded px-1.5 py-0.5 cursor-pointer overflow-hidden hover:brightness-95 transition-all"
      style={{
        top: yOffset,
        height: Math.max(height, 18),
        left: `calc(${leftPct}% + 2px)`,
        width: `calc(${widthPct}% - 4px)`,
        backgroundColor: `${color}E6`,
        borderLeft: `3px solid ${color}`,
      }}
      onClick={onClick}
    >
      <p className="text-white text-[10px] font-semibold truncate leading-tight">
        {event.title}
      </p>
      {height > 24 && prospect && maxCols <= 2 && (
        <p className="text-white/70 text-[9px] truncate">
          {prospect.name || prospect.email}
        </p>
      )}
      {height > 30 && (
        <p className="text-white/80 text-[9px] font-mono">
          {formatTime(event.startTime)}
        </p>
      )}
      {height > 50 && platform && maxCols <= 2 && (
        <p className="text-white/80 text-[8px] flex items-center gap-0.5 mt-0.5">
          <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 20 20">
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

  // Only show if within grid hours
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
