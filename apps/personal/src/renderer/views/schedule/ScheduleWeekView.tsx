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
  layoutEventsForDay,
  HOUR_HEIGHT,
  GRID_START_HOUR,
  GRID_END_HOUR,
  TIME_COLUMN_WIDTH,
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
        <div className="flex border-b border-gray-200 dark:border-gray-700 shrink-0">
          {/* Spacer for time column */}
          <div style={{ width: TIME_COLUMN_WIDTH }} className="shrink-0" />

          {weekDates.map((date, i) => {
            const isToday = date.toDateString() === todayStr;
            return (
              <div key={i} className="flex-1 flex flex-col items-center py-2 border-l border-gray-100 dark:border-gray-800">
                <span className={`text-[10px] font-semibold tracking-wide ${
                  isToday ? 'text-blue-500' : 'text-gray-500 dark:text-gray-400'
                }`}>
                  {DAY_NAMES[i]}
                </span>
                <span className={`w-7 h-7 flex items-center justify-center text-[14px] rounded-full mt-0.5 ${
                  isToday
                    ? 'bg-blue-500 text-white font-bold'
                    : 'text-black dark:text-white'
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
                  className="absolute right-2 text-[10px] font-mono font-medium text-gray-400 dark:text-gray-500"
                  style={{ top: (hour - GRID_START_HOUR) * HOUR_HEIGHT - 6 }}
                >
                  {formatHourLabel(hour)}
                </div>
              ))}
            </div>

            {/* Day columns */}
            {weekDates.map((date, i) => {
              const isToday = date.toDateString() === todayStr;
              const dayEvents = getEventsForDate(events, date);

              return (
                <div
                  key={i}
                  className="flex-1 relative border-l border-gray-100 dark:border-gray-800"
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

                  {/* Event blocks — laid out with overlap-aware columns.
                      Coaching events participate in the same column split as
                      personal events but keep a distinct violet color so the
                      block height reflects their actual duration (Google-
                      Calendar style). If layout throws for any reason, fall
                      back to the flat render so the schedule never breaks. */}
                  {(() => {
                    let slots;
                    try {
                      slots = layoutEventsForDay(dayEvents);
                    } catch (err) {
                      console.error('[ScheduleWeekView] layoutEventsForDay failed:', err);
                      slots = dayEvents.map((e) => ({
                        event: e,
                        columnIndex: 0,
                        columnCount: 1,
                      }));
                    }
                    return slots.map((slot) => (
                      <WeekEventBlock
                        key={slot.event._id}
                        event={slot.event}
                        columnIndex={slot.columnIndex}
                        columnCount={slot.columnCount}
                        now={now}
                        closerEmail={closerEmail}
                        onClick={() => onEventClick(slot.event)}
                      />
                    ));
                  })()}

                  {/* Current time indicator */}
                  {isToday && <CurrentTimeIndicator now={now} />}
                </div>
              );
            })}
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

// Sequ3nce-coaching color. Deliberately distinct from urgency colors so
// the block reads as a community event, not a personal commitment.
const COACHING_COLOR = '#7c3aed'; // violet-600

function WeekEventBlock({
  event,
  columnIndex,
  columnCount,
  now,
  closerEmail,
  onClick,
}: {
  event: CalendarEvent;
  columnIndex: number;
  columnCount: number;
  now: number;
  closerEmail?: string;
  onClick: () => void;
}) {
  const yOffset = eventYOffset(event);
  const isCoaching = !!event.coachingCallId;
  const urgency = getEventUrgency(event, now);
  // Coaching events ignore urgency colors — their identity is brand, not
  // deadline. Personal events still use the urgency palette for the "call
  // starting soon" cue.
  const color = isCoaching ? COACHING_COLOR : getUrgencyBlockColor(urgency);
  const height = eventBlockHeight(event);
  const platform = detectPlatform(event.meetingUrl);
  const prospect = getProspectAttendee(event, closerEmail);
  // Column-width tiers govern how much content we cram into the block:
  //   1 col → everything fits
  //   2 cols → hide platform row + SQ badge (color already signals coaching)
  //   3 cols → only the title, no prospect/time/platform
  const isNarrow = columnCount >= 2;
  const isVeryNarrow = columnCount >= 3;

  // With N columns, each column takes (100% / N) of the day column width,
  // minus a 4px gutter (2px on each side) so adjacent blocks don't touch.
  const widthStyle = columnCount === 1
    ? { left: 2, right: 2 }
    : {
        left: `calc(${columnIndex} * (100% / ${columnCount}) + 2px)`,
        width: `calc((100% / ${columnCount}) - 4px)`,
      };

  return (
    <div
      className="absolute rounded px-1.5 py-0.5 cursor-pointer overflow-hidden hover:brightness-95 transition-all"
      style={{
        ...widthStyle,
        top: yOffset,
        height: Math.max(height, 18),
        backgroundColor: `${color}E6`,
        borderLeft: `3px solid ${color}`,
      }}
      onClick={onClick}
      title={isCoaching ? `Sequ3nce Coaching: ${event.title}` : event.title}
    >
      <p className="text-white text-[10px] font-semibold truncate leading-tight flex items-center gap-1">
        {isCoaching && !isNarrow && (
          <span className="shrink-0 px-1 py-[1px] rounded bg-white/20 text-[8px] font-bold uppercase tracking-wider leading-none">
            SQ
          </span>
        )}
        <span className="truncate">{event.title}</span>
      </p>
      {!isVeryNarrow && height > 24 && prospect && (
        <p className="text-white/70 text-[9px] truncate">
          {prospect.name || prospect.email}
        </p>
      )}
      {!isVeryNarrow && height > 30 && (
        <p className="text-white/80 text-[9px] font-mono">
          {formatTime(event.startTime)}
        </p>
      )}
      {!isNarrow && height > 50 && platform && (
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
