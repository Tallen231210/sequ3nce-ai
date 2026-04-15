import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import type { CloserInfo, CalendarEvent, B2cCalendar } from '../../convex';
import {
  getCalendarEvents,
  getCalendarStatus,
  syncCalendar,
  syncAllB2cCalendars,
  disconnectCalendar,
  excludeCalendarEvent,
  createBotForMeeting,
  getB2cCalendars,
  type CalendarStatus,
} from '../../convex';
import { type ViewMode, formatRelative, formatWeekLabel, getWeekDates, extractProspectName } from './scheduleUtils';
import { CalendarManagement } from './CalendarManagement';
import { ScheduleListView } from './ScheduleListView';
import { ScheduleWeekView } from './ScheduleWeekView';
import { ScheduleMeetingModal } from './ScheduleMeetingModal';

interface ScheduleViewProps {
  closerInfo: CloserInfo;
}

export function ScheduleView({ closerInfo }: ScheduleViewProps) {
  const [status, setStatus] = useState<CalendarStatus | null>(null);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [b2cCalendars, setB2cCalendars] = useState<B2cCalendar[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [now, setNow] = useState(Date.now());

  // View mode
  const [viewMode, setViewMode] = useState<ViewMode>('week');
  const [weekOffset, setWeekOffset] = useState(0);

  // Calendar filter — set of calendar IDs that are currently visible
  const [hiddenCalendarIds, setHiddenCalendarIds] = useState<Set<string>>(new Set());

  // Show/hide calendar management panel
  const [showCalendarPanel, setShowCalendarPanel] = useState(false);

  // Meeting modal
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);

  // Stale request guard
  const loadIdRef = useRef(0);

  // Load calendar data
  const loadData = useCallback(async () => {
    const thisLoadId = ++loadIdRef.current;
    try {
      // Load b2cCalendars (multi-calendar) alongside legacy status
      const [calStatus, calendars] = await Promise.all([
        getCalendarStatus(closerInfo.email, closerInfo.teamId),
        getB2cCalendars(closerInfo.closerId),
      ]);
      if (thisLoadId !== loadIdRef.current) return;
      setStatus(calStatus);
      setB2cCalendars(calendars);

      // Consider "connected" if legacy connection OR any b2cCalendars exist
      const isConnected = calStatus?.connected || calendars.length > 0;

      if (isConnected) {
        let start: number, end: number;
        if (viewMode === 'week') {
          const dates = getWeekDates(weekOffset);
          start = dates[0].getTime();
          const lastDay = new Date(dates[6]);
          lastDay.setDate(lastDay.getDate() + 1);
          end = lastDay.getTime();
        } else {
          const today = new Date();
          start = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
          end = start + 7 * 24 * 60 * 60 * 1000;
        }

        const evts = await getCalendarEvents(closerInfo.email, closerInfo.teamId, start, end);
        if (thisLoadId !== loadIdRef.current) return;
        setEvents(evts);
      }
    } catch (error) {
      console.error('[Schedule] Failed to load data:', error);
    }
    if (thisLoadId === loadIdRef.current) setIsLoading(false);
  }, [closerInfo, viewMode, weekOffset]);

  // Initial load + auto-sync + minute timer + OAuth callback refresh
  useEffect(() => {
    loadData();
    const syncTimer = setInterval(loadData, 300000);
    const minuteTimer = setInterval(() => setNow(Date.now()), 60000);
    // Refresh when a new calendar is connected via OAuth deep link
    function handleCalendarConnected() {
      loadData();
      setShowCalendarPanel(false);
    }
    window.addEventListener('calendar:connected', handleCalendarConnected);
    return () => {
      clearInterval(syncTimer);
      clearInterval(minuteTimer);
      window.removeEventListener('calendar:connected', handleCalendarConnected);
    };
  }, [loadData]);

  // Filter events by visible calendars
  const filteredEvents = useMemo(() => {
    if (hiddenCalendarIds.size === 0) return events;
    return events.filter((e) => {
      // Events without a calendarId (legacy) are always shown
      if (!e.calendarId) return true;
      return !hiddenCalendarIds.has(e.calendarId);
    });
  }, [events, hiddenCalendarIds]);

  // Handlers
  async function handleSync() {
    setIsSyncing(true);
    // Sync legacy calendar + all b2cCalendars in parallel
    await Promise.all([
      syncCalendar(closerInfo.email, closerInfo.teamId),
      syncAllB2cCalendars(closerInfo.closerId),
    ]);
    await loadData();
    setIsSyncing(false);
  }

  async function handleDisconnect() {
    const success = await disconnectCalendar(closerInfo.email, closerInfo.teamId);
    if (success) {
      await loadData();
    }
  }

  async function handleExclude(event: CalendarEvent) {
    await excludeCalendarEvent(closerInfo.closerId, event.uid, event.title);
    await loadData();
  }

  async function handleJoinConfirm(event: CalendarEvent) {
    if (!event.meetingUrl) return;
    const prospectName = extractProspectName(event, closerInfo.email);
    await createBotForMeeting(closerInfo.closerId, closerInfo.teamId, event.meetingUrl, event.title, prospectName);
    window.open(event.meetingUrl, '_blank');
    setSelectedEvent(null);
    await loadData();
  }

  function toggleCalendarVisibility(calendarId: string) {
    setHiddenCalendarIds((prev) => {
      const next = new Set(prev);
      if (next.has(calendarId)) {
        next.delete(calendarId);
      } else {
        next.add(calendarId);
      }
      return next;
    });
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <span className="w-6 h-6 border-2 border-gray-400 border-t-transparent rounded-full animate-spin mb-3" />
        <span className="text-[14px] text-gray-500">Loading schedule...</span>
      </div>
    );
  }

  // Not connected — show calendar management (which shows the initial connect screen)
  const isConnected = status?.connected || b2cCalendars.length > 0;
  if (!isConnected) {
    return (
      <CalendarManagement
        closerInfo={closerInfo}
        calendars={b2cCalendars}
        onRefresh={loadData}
      />
    );
  }

  // Calendar management panel (slide-in when "Calendars" button is clicked)
  if (showCalendarPanel) {
    return (
      <div className="flex flex-col h-full bg-gray-50/50 dark:bg-gray-950">
        <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 shrink-0">
          <div className="flex items-center justify-between px-4 py-3">
            <h2 className="text-[14px] font-semibold text-black dark:text-white">My Calendars</h2>
            <button
              onClick={() => setShowCalendarPanel(false)}
              className="text-[12px] font-medium text-gray-500 hover:text-gray-700 transition-colors"
            >
              Back to Schedule
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          <CalendarManagement
            closerInfo={closerInfo}
            calendars={b2cCalendars}
            onRefresh={loadData}
          />
        </div>
      </div>
    );
  }

  const weekDates = getWeekDates(weekOffset);

  return (
    <div className="flex flex-col h-full bg-gray-50/50 dark:bg-gray-950">
      {/* Header */}
      <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 shrink-0">
        <div className="flex items-center justify-between px-4 py-2.5">
          {/* Calendar filter pills (multi-calendar) */}
          <div className="flex items-center gap-1.5 min-w-0 overflow-x-auto">
            {b2cCalendars.length > 0 ? (
              b2cCalendars.filter((c) => c.isEnabled).map((cal) => {
                const isHidden = hiddenCalendarIds.has(cal._id);
                return (
                  <button
                    key={cal._id}
                    onClick={() => toggleCalendarVisibility(cal._id)}
                    className={`flex items-center gap-1.5 px-2 py-1 text-[11px] font-medium rounded-md transition-colors whitespace-nowrap ${
                      isHidden
                        ? 'bg-gray-100 dark:bg-gray-800 text-gray-400'
                        : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300'
                    }`}
                  >
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: isHidden ? '#d1d5db' : cal.color }}
                    />
                    {cal.label}
                  </button>
                );
              })
            ) : status?.lastSynced ? (
              <div className="flex items-center gap-1.5">
                <svg className="w-3 h-3 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span className="text-[12px] text-gray-500 dark:text-gray-400">
                  Synced {formatRelative(status.lastSynced)}
                </span>
              </div>
            ) : null}
          </div>

          {/* View mode toggle */}
          <div className="flex bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5 shrink-0" style={{ width: 120 }}>
            {(['list', 'week'] as ViewMode[]).map((mode) => (
              <button
                key={mode}
                onClick={() => { setViewMode(mode); if (mode === 'list') setWeekOffset(0); }}
                className={`flex-1 text-[12px] font-medium py-1 rounded-md transition-colors ${
                  viewMode === mode
                    ? 'bg-white dark:bg-gray-700 text-black dark:text-white shadow-sm'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'
                }`}
              >
                {mode === 'list' ? 'List' : 'Week'}
              </button>
            ))}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleSync}
              disabled={isSyncing}
              className="flex items-center gap-1 px-2 py-1 text-[12px] font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
            >
              <svg className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              {isSyncing ? 'Syncing' : 'Refresh'}
            </button>
            <button
              onClick={() => setShowCalendarPanel(true)}
              className="text-[12px] font-medium text-gray-500 hover:text-gray-700 transition-colors"
            >
              Calendars
            </button>
          </div>
        </div>

        {/* Week navigation (only in week mode) */}
        {viewMode === 'week' && (
          <div className="flex items-center justify-center gap-3 px-4 py-2 border-t border-gray-100 dark:border-gray-800">
            <button
              onClick={() => setWeekOffset((o) => o - 1)}
              className="p-1 text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
              </svg>
            </button>

            <button
              onClick={() => setWeekOffset(0)}
              className={`text-[12px] font-semibold px-2.5 py-1 rounded-md transition-colors ${
                weekOffset === 0
                  ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:text-gray-800'
              }`}
            >
              Today
            </button>

            <button
              onClick={() => setWeekOffset((o) => o + 1)}
              className="p-1 text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
              </svg>
            </button>

            <span className="text-[13px] font-medium text-black dark:text-white ml-1">
              {formatWeekLabel(weekDates)}
            </span>
          </div>
        )}
      </div>

      {/* Content */}
      {viewMode === 'list' ? (
        <ScheduleListView
          events={filteredEvents}
          now={now}
          closerEmail={closerInfo.email}
          onExclude={handleExclude}
          onJoinRequest={setSelectedEvent}
        />
      ) : (
        <ScheduleWeekView
          events={filteredEvents}
          weekDates={weekDates}
          now={now}
          closerEmail={closerInfo.email}
          onEventClick={setSelectedEvent}
        />
      )}

      {/* Meeting confirmation modal */}
      {selectedEvent && (
        <ScheduleMeetingModal
          event={selectedEvent}
          onConfirm={handleJoinConfirm}
          onClose={() => setSelectedEvent(null)}
        />
      )}
    </div>
  );
}
