/**
 * Modal for picking which Google sub-calendars to subscribe to.
 *
 * Calls listAvailableGoogleCalendars on open to enumerate everything the
 * closer's connected Google account exposes (primary + custom + shared +
 * subscribed). Closer ticks calendars they want to sync; "Save" calls
 * addCalendarSubscription for each pick.
 *
 * Plan: .claude/plans/b2b-multi-calendar-subscriptions.md
 */
import React, { useEffect, useState } from 'react';
import {
  listAvailableGoogleCalendars,
  addCalendarSubscription,
  type AvailableCalendar,
} from '../../convex';

interface AddCalendarPickerProps {
  email: string;
  teamId: string;
  closerId: string;
  onClose: () => void;
  onSubscriptionsAdded: () => void;
}

export function AddCalendarPicker({
  email,
  teamId,
  closerId,
  onClose,
  onSubscriptionsAdded,
}: AddCalendarPickerProps) {
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [needsReauth, setNeedsReauth] = useState(false);
  const [calendars, setCalendars] = useState<AvailableCalendar[]>([]);
  // Set of googleCalendarIds the user has checked in this session (excludes
  // already-subscribed ones, which we render disabled+checked for clarity).
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setFetchError(null);
    setNeedsReauth(false);
    listAvailableGoogleCalendars(email, teamId).then((res) => {
      if (cancelled) return;
      if (!res.ok) {
        setFetchError(res.error ?? 'Could not load calendars');
        setNeedsReauth(res.needsReauth === true);
        setCalendars([]);
      } else {
        setCalendars(res.calendars ?? []);
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [email, teamId]);

  function toggle(googleCalendarId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(googleCalendarId)) next.delete(googleCalendarId);
      else next.add(googleCalendarId);
      return next;
    });
  }

  async function handleSave() {
    if (selected.size === 0) {
      onClose();
      return;
    }
    setSaving(true);
    setSaveError(null);
    const toAdd = calendars.filter((c) => selected.has(c.googleCalendarId));
    for (const cal of toAdd) {
      const result = await addCalendarSubscription(
        email,
        teamId,
        cal.googleCalendarId,
        cal.summary,
        cal.backgroundColor ?? undefined,
        cal.accessRole,
      );
      if (!result.success) {
        setSaveError(result.error ?? 'Failed to add a subscription');
        setSaving(false);
        return;
      }
    }
    setSaving(false);
    onSubscriptionsAdded();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md max-h-[80vh] flex flex-col">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-[14px] font-semibold text-gray-900">Add calendars</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-[20px] leading-none"
          >
            ×
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading && (
            <div className="flex items-center gap-2 text-[13px] text-gray-500 py-8 justify-center">
              <span className="w-3 h-3 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
              Loading calendars…
            </div>
          )}

          {!loading && fetchError && (
            <div className="text-[13px] text-amber-700 bg-amber-50 border border-amber-200 rounded p-3 space-y-2">
              <div>{fetchError}</div>
              {needsReauth && (
                <div className="space-y-2 pt-1 border-t border-amber-200">
                  <div className="text-[12px] text-amber-800">
                    Your Google Calendar connection is missing the permission
                    needed to list calendars. Reconnect to grant the new scope.
                  </div>
                  <button
                    onClick={() => {
                      window.open(
                        `https://sequ3nce.ai/api/auth/google/authorize?closerId=${closerId}`,
                        '_blank',
                      );
                    }}
                    className="text-[12px] font-semibold text-white bg-amber-700 hover:bg-amber-800 px-3 py-1.5 rounded transition-colors"
                  >
                    Reconnect Google Calendar
                  </button>
                </div>
              )}
            </div>
          )}

          {!loading && !fetchError && calendars.length === 0 && (
            <div className="text-[13px] text-gray-500 py-8 text-center">
              No calendars found in this Google account.
            </div>
          )}

          {!loading && !fetchError && calendars.length > 0 && (
            <ul className="space-y-2">
              {calendars.map((cal) => {
                const isChecked = cal.alreadySubscribed || selected.has(cal.googleCalendarId);
                return (
                  <li key={cal.googleCalendarId}>
                    <label
                      className={`flex items-center gap-3 p-2.5 rounded-lg border cursor-pointer transition-colors ${
                        cal.alreadySubscribed
                          ? 'border-gray-100 bg-gray-50 cursor-not-allowed'
                          : isChecked
                          ? 'border-blue-300 bg-blue-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        disabled={cal.alreadySubscribed}
                        onChange={() => !cal.alreadySubscribed && toggle(cal.googleCalendarId)}
                        className="h-4 w-4"
                      />
                      <span
                        className="w-3 h-3 rounded-sm shrink-0"
                        style={{
                          backgroundColor: cal.backgroundColor ?? '#999',
                        }}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-[13px] font-medium text-gray-900 truncate">
                          {cal.summary}
                          {cal.primary && (
                            <span className="ml-2 text-[10px] font-normal text-gray-500">
                              (primary)
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-gray-500">
                          {cal.accessRole === 'freeBusyReader'
                            ? 'free/busy only'
                            : cal.accessRole}
                          {cal.alreadySubscribed && ' · already added'}
                        </div>
                      </div>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="px-5 py-4 border-t border-gray-100 flex items-center justify-between gap-3">
          {saveError && (
            <div className="text-[12px] text-red-600 flex-1 truncate">{saveError}</div>
          )}
          <div className="flex gap-2 ml-auto">
            <button
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 text-[12px] font-medium text-gray-600 hover:text-gray-800"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving || selected.size === 0}
              className="px-4 py-2 text-[12px] font-semibold text-white bg-black rounded-lg hover:bg-gray-800 disabled:bg-gray-300 transition-colors"
            >
              {saving ? 'Adding…' : selected.size === 0 ? 'Done' : `Add ${selected.size}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
