"use client";

import React from 'react';
import type { CalendarEvent } from '@/lib/closer/client';
import { groupEventsByDate, formatDateHeader } from './scheduleUtils';
import { ScheduleEventCard } from './ScheduleEventCard';

interface ScheduleListViewProps {
  events: CalendarEvent[];
  now: number;
  closerEmail?: string;
  onExclude: (event: CalendarEvent) => void;
  onJoinRequest: (event: CalendarEvent) => void;
}

export function ScheduleListView({ events, now, closerEmail, onExclude, onJoinRequest }: ScheduleListViewProps) {
  const grouped = groupEventsByDate(events);
  const sortedKeys = Array.from(grouped.keys()).sort();

  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <svg className="w-10 h-10 text-gray-300 dark:text-gray-600 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
        </svg>
        <h3 className="text-[15px] font-medium text-gray-600 dark:text-gray-400 mb-1">No upcoming meetings</h3>
        <p className="text-[13px] text-gray-400 dark:text-gray-500">Your calendar is clear for the next 7 days</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 pb-4">
      {sortedKeys.map((dateKey) => {
        const dateEvents = grouped.get(dateKey) || [];
        return (
          <div key={dateKey} className="mb-4">
            <h3 className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2 px-1">
              {formatDateHeader(dateKey)}
            </h3>
            <div className="space-y-2">
              {dateEvents.map((event) => (
                <ScheduleEventCard
                  key={event._id}
                  event={event}
                  now={now}
                  closerEmail={closerEmail}
                  onExclude={onExclude}
                  onJoinRequest={onJoinRequest}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
