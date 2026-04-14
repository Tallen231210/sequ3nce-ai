import React from 'react';
import type { CalendarEvent } from '../../convex';
import {
  getEventUrgency,
  getUrgencyBadgeConfig,
  detectPlatform,
  formatTime,
  getProspectAttendee,
} from './scheduleUtils';

interface ScheduleEventCardProps {
  event: CalendarEvent;
  now: number;
  closerEmail?: string;
  onExclude: (event: CalendarEvent) => void;
  onJoinRequest: (event: CalendarEvent) => void;
}

export function ScheduleEventCard({ event, now, closerEmail, onExclude, onJoinRequest }: ScheduleEventCardProps) {
  const urgency = getEventUrgency(event, now);
  const badge = getUrgencyBadgeConfig(urgency);
  const platform = detectPlatform(event.meetingUrl);
  const prospect = getProspectAttendee(event, closerEmail);
  const isPast = urgency === 'ended';

  // Multi-calendar: show colored left border + label if event has calendar metadata
  const calColor = (event as any).calendarColor as string | undefined;
  const calLabel = (event as any).calendarLabel as string | undefined;

  return (
    <div
      className={`p-4 bg-white dark:bg-gray-900 rounded-xl border transition-colors ${
        urgency === 'now'
          ? 'border-red-200 dark:border-red-800 shadow-[0_2px_8px_rgba(242,51,51,0.1)]'
          : isPast
          ? 'border-gray-100 dark:border-gray-800 opacity-60'
          : 'border-gray-100 dark:border-gray-800 shadow-[0_2px_8px_rgba(0,0,0,0.04)] hover:shadow-[0_2px_12px_rgba(0,0,0,0.08)]'
      }`}
      style={calColor ? { borderLeftWidth: 3, borderLeftColor: calColor } : undefined}
    >
      {/* Top row: urgency badge + time */}
      <div className="flex items-center justify-between mb-2">
        <span
          className="text-[10px] font-bold tracking-wider px-2 py-1 rounded"
          style={{ backgroundColor: badge.bgColor, color: badge.textColor }}
        >
          {badge.label}
        </span>
        <span className="text-[12px] text-gray-500 dark:text-gray-400 font-mono">
          {formatTime(event.startTime)} – {formatTime(event.endTime)}
        </span>
      </div>

      {/* Title */}
      <h4 className="text-[15px] font-semibold text-black dark:text-white mb-1 line-clamp-2">
        {event.title}
      </h4>

      {/* Calendar label (multi-calendar) */}
      {calLabel && (
        <div className="flex items-center gap-1.5 mb-1.5">
          <span
            className="w-1.5 h-1.5 rounded-full shrink-0"
            style={{ backgroundColor: calColor }}
          />
          <span className="text-[11px] text-gray-400 dark:text-gray-500">{calLabel}</span>
        </div>
      )}

      {/* Prospect attendee */}
      {prospect && (
        <div className="flex items-center gap-1.5 mb-2">
          <svg className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0" />
          </svg>
          <span className="text-[12px] text-gray-600 dark:text-gray-400">
            {prospect.name || prospect.email}
          </span>
        </div>
      )}

      {/* Platform badge */}
      {platform && (
        <div className="flex items-center gap-1.5 mb-3">
          <svg className="w-3.5 h-3.5 text-blue-500" fill="currentColor" viewBox="0 0 20 20">
            <path d="M2 6a2 2 0 012-2h6a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6zm12.553 1.106A1 1 0 0014 8v4a1 1 0 00.553.894l2 1A1 1 0 0018 13V7a1 1 0 00-1.447-.894l-2 1z" />
          </svg>
          <span className={`text-[11px] font-medium px-1.5 py-0.5 rounded ${platform.bg} ${platform.text}`}>
            {platform.label}
          </span>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2">
        {!isPast && event.meetingUrl && (
          <button
            onClick={() => onJoinRequest(event)}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-[13px] font-semibold text-white bg-black dark:bg-white dark:text-black rounded-lg hover:bg-gray-800 dark:hover:bg-gray-200 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
              <path d="M2 6a2 2 0 012-2h6a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6zm12.553 1.106A1 1 0 0014 8v4a1 1 0 00.553.894l2 1A1 1 0 0018 13V7a1 1 0 00-1.447-.894l-2 1z" />
            </svg>
            Join & Start Meeting
          </button>
        )}
        {!isPast && (
          <button
            onClick={() => onExclude(event)}
            title="Exclude from auto-bot"
            className="p-2 text-gray-400 hover:text-red-500 transition-colors rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
