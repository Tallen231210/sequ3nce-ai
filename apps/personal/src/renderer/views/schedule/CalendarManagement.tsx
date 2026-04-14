import React, { useState, useCallback, useEffect } from 'react';
import type { B2cCalendar, CloserInfo } from '../../convex';
import { removeB2cCalendar, updateB2cCalendar } from '../../convex';

const APP_URL = 'https://sequ3nce.ai';
const MAX_CALENDARS = 5;

interface CalendarManagementProps {
  closerInfo: CloserInfo;
  calendars: B2cCalendar[];
  onRefresh: () => void;
}

export function CalendarManagement({ closerInfo, calendars, onRefresh }: CalendarManagementProps) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [addLabel, setAddLabel] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [removeConfirmId, setRemoveConfirmId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Listen for OAuth callback
  useEffect(() => {
    function handleCalendarConnected() {
      setIsConnecting(false);
      setShowAddForm(false);
      setAddLabel('');
      onRefresh();
    }
    window.addEventListener('calendar:connected', handleCalendarConnected);
    return () => window.removeEventListener('calendar:connected', handleCalendarConnected);
  }, [onRefresh]);

  const handleConnect = useCallback(() => {
    const label = addLabel.trim();
    if (!label) {
      setError('Please enter a name for this calendar');
      return;
    }
    setError(null);
    setIsConnecting(true);
    // Pass label through OAuth state so the callback creates the b2cCalendar record
    const authUrl = `${APP_URL}/api/auth/google/authorize?closerId=${closerInfo.closerId}&app=personal&label=${encodeURIComponent(label)}`;
    window.open(authUrl, '_blank');
  }, [addLabel, closerInfo.closerId]);

  const handleRemove = useCallback(async (calendarId: string) => {
    if (removeConfirmId !== calendarId) {
      setRemoveConfirmId(calendarId);
      return;
    }
    setRemovingId(calendarId);
    setRemoveConfirmId(null);
    await removeB2cCalendar(calendarId, closerInfo.closerId);
    setRemovingId(null);
    onRefresh();
  }, [closerInfo.closerId, removeConfirmId, onRefresh]);

  const handleToggle = useCallback(async (calendarId: string, currentEnabled: boolean) => {
    await updateB2cCalendar(calendarId, closerInfo.closerId, { isEnabled: !currentEnabled });
    onRefresh();
  }, [closerInfo.closerId, onRefresh]);

  const atLimit = calendars.length >= MAX_CALENDARS;

  // If no calendars at all, show the initial connect screen
  if (calendars.length === 0 && !showAddForm) {
    return (
      <div className="flex flex-col items-center justify-center h-full px-8">
        <div className="w-20 h-20 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mb-5">
          <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
          </svg>
        </div>
        <h2 className="text-lg font-semibold text-black dark:text-white mb-1">Connect Your Calendars</h2>
        <p className="text-[14px] text-gray-500 text-center mb-6 max-w-sm">
          Add up to 5 Google Calendar accounts — one per offer. See all your calls in one place.
        </p>
        <button
          onClick={() => setShowAddForm(true)}
          className="flex items-center gap-2 px-6 py-3 text-[14px] font-semibold rounded-xl bg-black dark:bg-white text-white dark:text-black hover:bg-gray-800 dark:hover:bg-gray-100 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Add Calendar
        </button>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-3">
      {/* Connected calendars */}
      {calendars.map((cal) => (
        <div
          key={cal._id}
          className="flex items-center justify-between px-3 py-2.5 rounded-xl border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-900"
        >
          <div className="flex items-center gap-3 min-w-0">
            {/* Color dot */}
            <div
              className="w-3 h-3 rounded-full shrink-0"
              style={{ backgroundColor: cal.color }}
            />
            <div className="min-w-0">
              <div className="text-[13px] font-semibold text-black dark:text-white truncate">
                {cal.label}
              </div>
              {cal.googleEmail && (
                <div className="text-[11px] text-gray-400 truncate">{cal.googleEmail}</div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Sync error indicator */}
            {cal.syncError && cal.syncError !== '' && (
              <span className="text-[10px] text-red-500" title={cal.syncError}>Error</span>
            )}
            {/* Toggle */}
            <button
              onClick={() => handleToggle(cal._id, cal.isEnabled)}
              className={`relative w-8 h-[18px] rounded-full transition-colors ${
                cal.isEnabled ? 'bg-black dark:bg-white' : 'bg-gray-200 dark:bg-zinc-700'
              }`}
            >
              <span
                className={`absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white dark:bg-black transition-transform ${
                  cal.isEnabled ? 'left-[16px]' : 'left-[2px]'
                }`}
              />
            </button>
            {/* Remove */}
            <button
              onClick={() => handleRemove(cal._id)}
              disabled={removingId === cal._id}
              className="text-[11px] font-medium text-gray-400 hover:text-red-500 transition-colors disabled:opacity-50"
            >
              {removingId === cal._id ? '...' : removeConfirmId === cal._id ? 'Confirm?' : 'Remove'}
            </button>
          </div>
        </div>
      ))}

      {/* Add calendar form */}
      {showAddForm ? (
        <div className="rounded-xl border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-4">
          {isConnecting ? (
            <div className="flex flex-col items-center gap-3 py-2">
              <span className="w-5 h-5 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
              <p className="text-[12px] text-gray-500">Waiting for Google authorization...</p>
              <button
                onClick={() => { setIsConnecting(false); setShowAddForm(false); }}
                className="text-[11px] text-gray-400 hover:text-gray-600"
              >
                Cancel
              </button>
            </div>
          ) : (
            <>
              <label className="block text-[12px] font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                Offer / Company name
              </label>
              <input
                type="text"
                value={addLabel}
                onChange={(e) => setAddLabel(e.target.value)}
                placeholder="e.g., Solar Co, Coaching Inc"
                maxLength={50}
                autoFocus
                className="w-full px-3 py-2 text-[13px] bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-black/10 mb-3"
                onKeyDown={(e) => { if (e.key === 'Enter') handleConnect(); }}
              />
              {error && <p className="text-[11px] text-red-500 mb-2">{error}</p>}
              <div className="flex gap-2">
                <button
                  onClick={() => { setShowAddForm(false); setAddLabel(''); setError(null); }}
                  className="flex-1 py-2 text-[12px] font-medium text-gray-600 bg-gray-100 dark:bg-zinc-800 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConnect}
                  className="flex-1 flex items-center justify-center gap-2 py-2 text-[12px] font-semibold text-white bg-black rounded-lg hover:bg-gray-800 transition-colors"
                >
                  {/* Google icon */}
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A10.96 10.96 0 001 12c0 1.77.42 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                  </svg>
                  Connect Google
                </button>
              </div>
            </>
          )}
        </div>
      ) : !atLimit ? (
        <button
          onClick={() => setShowAddForm(true)}
          className="w-full flex items-center justify-center gap-2 py-2.5 text-[12px] font-medium text-gray-500 border border-dashed border-gray-300 dark:border-zinc-700 rounded-xl hover:text-gray-700 hover:border-gray-400 transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Add Calendar ({calendars.length}/{MAX_CALENDARS})
        </button>
      ) : (
        <div className="text-center text-[11px] text-gray-400 py-2">
          Maximum {MAX_CALENDARS} calendars reached
        </div>
      )}
    </div>
  );
}
