"use client";

import React from 'react';
import type { CalendarEvent } from '@/lib/closer/client';
import {
  getEventsForDate,
  getEventUrgency,
  getUrgencyBlockColor,
  detectPlatform,
  formatTime,
  getProspectAttendee,
} from './scheduleUtils';

interface TodayAgendaSidebarProps {
  events: CalendarEvent[];
  now: number;
  closerEmail?: string;
  onEventClick: (event: CalendarEvent) => void;
}

export function TodayAgendaSidebar({ events, now, closerEmail, onEventClick }: TodayAgendaSidebarProps) {
  const today = new Date();
  const todayEvents = getEventsForDate(events, today)
    .sort((a, b) => a.startTime - b.startTime);

  const dateLabel = today.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });

  return (
    <div className="w-[250px] shrink-0 border-l border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 flex flex-col">
      {/* Header */}
      <div className="px-3 py-3 border-b border-gray-100 dark:border-gray-800">
        <h3 className="text-[13px] font-semibold text-black dark:text-white">
          Today's Agenda
        </h3>
        <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
          {dateLabel}
        </p>
      </div>

      {/* Event list */}
      <div className="flex-1 overflow-y-auto px-3 py-2">
        {todayEvents.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <svg className="w-8 h-8 text-gray-300 dark:text-gray-600 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
            </svg>
            <p className="text-[12px] text-gray-400 dark:text-gray-500">No meetings today</p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {todayEvents.map((event) => (
              <AgendaItem
                key={event._id}
                event={event}
                now={now}
                closerEmail={closerEmail}
                onClick={() => onEventClick(event)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function AgendaItem({
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
  const color = getUrgencyBlockColor(urgency);
  const platform = detectPlatform(event.meetingUrl);
  const prospect = getProspectAttendee(event, closerEmail);
  const isActive = urgency === 'now';
  const isPast = urgency === 'ended';

  return (
    <div
      onClick={onClick}
      className={`flex gap-2 p-2 rounded-lg cursor-pointer transition-colors ${
        isActive
          ? 'bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800'
          : isPast
          ? 'opacity-50 hover:bg-gray-50 dark:hover:bg-gray-800'
          : 'hover:bg-gray-50 dark:hover:bg-gray-800'
      }`}
    >
      {/* Urgency color bar */}
      <div
        className="w-1 shrink-0 rounded-full mt-0.5"
        style={{ backgroundColor: color, minHeight: 32 }}
      />

      <div className="flex-1 min-w-0">
        {/* Time */}
        <p className="text-[10px] font-mono text-gray-500 dark:text-gray-400">
          {formatTime(event.startTime)} – {formatTime(event.endTime)}
        </p>

        {/* Title */}
        <p className="text-[12px] font-semibold text-black dark:text-white truncate mt-0.5">
          {event.title}
        </p>

        {/* Prospect */}
        {prospect && (
          <p className="text-[10px] text-gray-500 dark:text-gray-400 truncate mt-0.5">
            {prospect.name || prospect.email}
          </p>
        )}

        {/* Platform + Join */}
        <div className="flex items-center gap-1.5 mt-1">
          {platform && (
            <span className="text-[9px] font-medium text-gray-400 dark:text-gray-500">
              {platform.label}
            </span>
          )}
          {!isPast && event.meetingUrl && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onClick();
              }}
              className="text-[9px] font-semibold text-blue-500 hover:text-blue-600 dark:text-blue-400"
            >
              Join
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
