import React, { useState, useEffect, useCallback } from 'react';

// Calendar event type
interface CalendarEvent {
  _id: string;
  uid: string;
  title: string;
  description?: string;
  startTime: number;
  endTime: number;
  location?: string;
  isAllDay?: boolean;
}

// Calendar status type
interface CalendarStatus {
  closerId: string;
  connected: boolean;
  icsUrl?: string;
  connectedAt?: number;
  lastSynced?: number;
}

export function ScheduleApp() {
  const [closerEmail, setCloserEmail] = useState<string | null>(null);
  const [calendarStatus, setCalendarStatus] = useState<CalendarStatus | null>(null);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Connection form state
  const [icsUrl, setIcsUrl] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  // Current time for countdown
  const [now, setNow] = useState(Date.now());

  // Update time every minute for countdown
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(interval);
  }, []);

  // Get closer email on mount
  useEffect(() => {
    const fetchCloserEmail = async () => {
      try {
        const email = await window.schedule?.getCloserEmail();
        setCloserEmail(email);
      } catch (err) {
        console.error('Failed to get closer email:', err);
        setError('Failed to load schedule');
      }
    };

    fetchCloserEmail();

    // Listen for email changes
    const cleanup = window.schedule?.onCloserEmailChange((email) => {
      setCloserEmail(email);
    });

    return cleanup;
  }, []);

  // Fetch calendar status and events when email is available
  const fetchCalendarData = useCallback(async () => {
    if (!closerEmail) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Get calendar status
      const status = await window.schedule?.getCalendarStatus(closerEmail);
      setCalendarStatus(status);

      if (status?.connected) {
        // Get events for today and next 7 days
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);
        const endDate = new Date(startOfDay);
        endDate.setDate(endDate.getDate() + 7);

        const eventsData = await window.schedule?.getEvents(
          closerEmail,
          startOfDay.getTime(),
          endDate.getTime()
        );
        setEvents(eventsData || []);
      }
    } catch (err) {
      console.error('Failed to fetch calendar data:', err);
      setError('Failed to load calendar');
    } finally {
      setIsLoading(false);
    }
  }, [closerEmail]);

  useEffect(() => {
    fetchCalendarData();
  }, [fetchCalendarData]);

  // Connect calendar
  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!closerEmail || !icsUrl.trim()) return;

    setIsConnecting(true);
    setError(null);

    try {
      const connectResult = await window.schedule?.connectCalendar(closerEmail, icsUrl.trim());
      if (connectResult && !connectResult.success) {
        throw new Error('Failed to save calendar URL');
      }
      // Sync immediately after connecting
      const syncResult = await window.schedule?.syncCalendar(closerEmail);
      if (syncResult && !syncResult.success) {
        // Show the actual error from the sync
        throw new Error((syncResult as { success: boolean; error?: string }).error || 'Failed to sync calendar');
      }
      // Refresh data
      await fetchCalendarData();
      setIcsUrl('');
    } catch (err) {
      console.error('Failed to connect calendar:', err);
      setError(err instanceof Error ? err.message : 'Failed to connect calendar');
    } finally {
      setIsConnecting(false);
    }
  };

  // Disconnect calendar
  const handleDisconnect = async () => {
    if (!closerEmail) return;

    setIsLoading(true);
    setError(null);

    try {
      await window.schedule?.disconnectCalendar(closerEmail);
      setCalendarStatus(null);
      setEvents([]);
    } catch (err) {
      console.error('Failed to disconnect calendar:', err);
      setError('Failed to disconnect calendar');
    } finally {
      setIsLoading(false);
    }
  };

  // Sync calendar
  const handleSync = async () => {
    if (!closerEmail) return;

    setIsSyncing(true);
    setError(null);

    try {
      const syncResult = await window.schedule?.syncCalendar(closerEmail);
      if (syncResult && !syncResult.success) {
        throw new Error((syncResult as { success: boolean; error?: string }).error || 'Failed to sync calendar');
      }
      await fetchCalendarData();
    } catch (err) {
      console.error('Failed to sync calendar:', err);
      setError(err instanceof Error ? err.message : 'Failed to sync calendar');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleClose = () => {
    window.schedule?.close();
  };

  // Format time
  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  };

  // Format date
  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    if (date.toDateString() === today.toDateString()) {
      return 'Today';
    } else if (date.toDateString() === tomorrow.toDateString()) {
      return 'Tomorrow';
    } else {
      return date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
    }
  };

  // Get next upcoming event
  const nextEvent = events.find((e) => e.startTime > now);

  // Calculate time until next event
  const getTimeUntilNext = () => {
    if (!nextEvent) return null;
    const diff = nextEvent.startTime - now;
    const minutes = Math.floor(diff / 60000);
    if (minutes < 60) return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
    const hours = Math.floor(minutes / 60);
    const remainingMins = minutes % 60;
    if (hours < 24) {
      return remainingMins > 0 ? `${hours}h ${remainingMins}m` : `${hours} hour${hours !== 1 ? 's' : ''}`;
    }
    const days = Math.floor(hours / 24);
    return `${days} day${days !== 1 ? 's' : ''}`;
  };

  // Group events by date
  const groupedEvents = events.reduce<Record<string, CalendarEvent[]>>((acc, event) => {
    const dateKey = new Date(event.startTime).toDateString();
    if (!acc[dateKey]) acc[dateKey] = [];
    acc[dateKey].push(event);
    return acc;
  }, {});

  // Format last synced
  const formatLastSynced = (timestamp?: number) => {
    if (!timestamp) return 'Never';
    const diff = now - timestamp;
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes} min ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return new Date(timestamp).toLocaleDateString();
  };

  return (
    <div className="h-screen flex flex-col bg-white">
      {/* Title Bar */}
      <div
        className="h-8 flex items-center justify-center relative border-b border-gray-200 bg-gray-50"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <span className="text-sm font-medium text-gray-700">My Schedule</span>
        <button
          onClick={handleClose}
          className="absolute right-4 text-gray-400 hover:text-gray-600 transition-colors"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {isLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" />
          </div>
        ) : error ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
            <p className="text-red-500 mb-4">{error}</p>
            <button
              onClick={() => {
                setError(null);
                fetchCalendarData();
              }}
              className="px-4 py-2 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
            >
              Try Again
            </button>
          </div>
        ) : !closerEmail ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
            <svg className="w-16 h-16 text-gray-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            <h2 className="text-lg font-medium text-gray-700 mb-2">Not Logged In</h2>
            <p className="text-gray-500 text-sm">Please log in to access your schedule.</p>
          </div>
        ) : !calendarStatus?.connected ? (
          // Not connected - show connection form
          <div className="flex-1 overflow-y-auto p-6">
            <div className="max-w-md mx-auto">
              <div className="text-center mb-6">
                <svg className="w-16 h-16 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <h2 className="text-lg font-medium text-gray-900 mb-2">Connect Your Calendar</h2>
                <p className="text-gray-500 text-sm">
                  See your schedule in Sequ3nce by connecting your calendar via ICS feed URL.
                </p>
              </div>

              <form onSubmit={handleConnect} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    ICS Feed URL
                  </label>
                  <input
                    type="url"
                    value={icsUrl}
                    onChange={(e) => setIcsUrl(e.target.value)}
                    placeholder="https://calendar.google.com/calendar/ical/..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent"
                    required
                  />
                </div>

                <button
                  type="submit"
                  disabled={isConnecting || !icsUrl.trim()}
                  className="w-full py-2 px-4 bg-black text-white rounded-lg font-medium hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {isConnecting ? 'Connecting...' : 'Connect Calendar'}
                </button>
              </form>

              {/* Help section */}
              <div className="mt-6">
                <button
                  onClick={() => setShowHelp(!showHelp)}
                  className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700"
                >
                  <svg className={`w-4 h-4 transition-transform ${showHelp ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                  How do I find my ICS URL?
                </button>

                {showHelp && (
                  <div className="mt-4 p-4 bg-gray-50 rounded-lg text-sm space-y-4">
                    <div>
                      <h4 className="font-medium text-gray-900 mb-1">Google Calendar</h4>
                      <ol className="text-gray-600 space-y-1 list-decimal list-inside">
                        <li>Go to calendar.google.com</li>
                        <li>Click the three dots next to your calendar</li>
                        <li>Click "Settings and sharing"</li>
                        <li>Scroll to "Integrate calendar"</li>
                        <li>Copy "Secret address in iCal format"</li>
                      </ol>
                    </div>

                    <div>
                      <h4 className="font-medium text-gray-900 mb-1">Calendly</h4>
                      <ol className="text-gray-600 space-y-1 list-decimal list-inside">
                        <li>Go to calendly.com/app/scheduled_events</li>
                        <li>Click "Export"</li>
                        <li>Copy the ICS feed URL</li>
                      </ol>
                    </div>

                    <div>
                      <h4 className="font-medium text-gray-900 mb-1">Outlook</h4>
                      <ol className="text-gray-600 space-y-1 list-decimal list-inside">
                        <li>Go to outlook.com calendar</li>
                        <li>Settings → View all Outlook settings</li>
                        <li>Calendar → Shared calendars</li>
                        <li>Publish a calendar → Create ICS link</li>
                      </ol>
                    </div>

                    <div>
                      <h4 className="font-medium text-gray-900 mb-1">Cal.com</h4>
                      <ol className="text-gray-600 space-y-1 list-decimal list-inside">
                        <li>Go to app.cal.com</li>
                        <li>Settings → Calendar</li>
                        <li>Copy your ICS feed URL</li>
                      </ol>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          // Connected - show events
          <>
            {/* Sync status bar */}
            <div className="px-4 py-2 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
              <span className="text-xs text-gray-500">
                Last synced: {formatLastSynced(calendarStatus.lastSynced)}
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleSync}
                  disabled={isSyncing}
                  className="text-xs text-gray-600 hover:text-gray-900 flex items-center gap-1"
                >
                  <svg className={`w-3 h-3 ${isSyncing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  {isSyncing ? 'Syncing...' : 'Sync'}
                </button>
                <button
                  onClick={handleDisconnect}
                  className="text-xs text-red-500 hover:text-red-700"
                >
                  Disconnect
                </button>
              </div>
            </div>

            {/* Next up banner */}
            {nextEvent && (
              <div className="px-4 py-3 bg-gray-100 border-b border-gray-200">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wide">Next up in {getTimeUntilNext()}</p>
                    <p className="font-medium text-gray-900">{nextEvent.title}</p>
                  </div>
                  <p className="text-sm text-gray-600">{formatTime(nextEvent.startTime)}</p>
                </div>
              </div>
            )}

            {/* Events list */}
            <div className="flex-1 overflow-y-auto">
              {events.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full p-8 text-center">
                  <svg className="w-12 h-12 text-gray-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <p className="text-gray-500">No upcoming events</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {Object.entries(groupedEvents).map(([dateKey, dayEvents]) => (
                    <div key={dateKey}>
                      <div className="px-4 py-2 bg-gray-50 sticky top-0">
                        <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                          {formatDate(dayEvents[0].startTime)}
                        </h3>
                      </div>
                      <div className="divide-y divide-gray-50">
                        {dayEvents.map((event) => (
                          <div key={event._id} className="px-4 py-3 hover:bg-gray-50">
                            <div className="flex items-start gap-3">
                              <div className="w-16 flex-shrink-0">
                                <p className="text-sm font-medium text-gray-900">
                                  {event.isAllDay ? 'All day' : formatTime(event.startTime)}
                                </p>
                                {!event.isAllDay && (
                                  <p className="text-xs text-gray-400">{formatTime(event.endTime)}</p>
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-gray-900 truncate">{event.title}</p>
                                {event.description && (
                                  <p className="text-xs text-gray-500 truncate mt-0.5">{event.description}</p>
                                )}
                                {event.location && (
                                  <p className="text-xs text-gray-400 truncate mt-0.5 flex items-center gap-1">
                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                                    </svg>
                                    {event.location}
                                  </p>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
