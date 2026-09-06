import React, { useMemo, useState } from 'react';
import { createCoachingCall, rescheduleCoachingCall } from '../../../convex';

const DURATION_OPTIONS = [15, 30, 45, 60, 90, 120];

interface EditableCall {
  _id: string;
  title: string;
  description?: string;
  scheduledStartTime: number;
  scheduledDurationMin: number;
}

interface ScheduleCoachingCallModalProps {
  coachUserId: string;
  onClose: () => void;
  onSaved: () => void;
  /** When provided, the modal edits/reschedules this call instead of creating one. */
  editCall?: EditableCall;
}

// Build an ISO date string suitable for <input type="datetime-local">. The
// input stores local time without timezone info; we convert to UTC ms at save.
function toLocalISO(ms: number): string {
  const d = new Date(ms);
  d.setSeconds(0, 0);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function defaultStartTimeLocalISO(): string {
  return toLocalISO(Date.now() + 60 * 60_000); // 1 hour from now
}

export function ScheduleCoachingCallModal({
  coachUserId,
  onClose,
  onSaved,
  editCall,
}: ScheduleCoachingCallModalProps) {
  const isEdit = !!editCall;
  const [title, setTitle] = useState(editCall?.title ?? '');
  const [description, setDescription] = useState(editCall?.description ?? '');
  const [startLocal, setStartLocal] = useState(
    editCall ? toLocalISO(editCall.scheduledStartTime) : defaultStartTimeLocalISO()
  );
  const [duration, setDuration] = useState<number>(editCall?.scheduledDurationMin ?? 60);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scheduledStartMs = useMemo(() => {
    // datetime-local value is interpreted in the user's local timezone
    const ts = new Date(startLocal).getTime();
    return Number.isFinite(ts) ? ts : null;
  }, [startLocal]);

  const canSubmit =
    !submitting &&
    title.trim().length > 0 &&
    title.trim().length <= 120 &&
    scheduledStartMs !== null &&
    scheduledStartMs > Date.now() + 60_000 &&
    DURATION_OPTIONS.includes(duration);

  async function handleSave() {
    if (!canSubmit || scheduledStartMs === null) return;
    setSubmitting(true);
    setError(null);
    if (isEdit && editCall) {
      const res = await rescheduleCoachingCall(editCall._id, coachUserId, {
        scheduledStartTime: scheduledStartMs,
        scheduledDurationMin: duration,
        title: title.trim(),
        description: description.trim(),
      });
      setSubmitting(false);
      if (res.error || !res.success) {
        setError(res.error || 'Failed to update call');
        return;
      }
      onSaved();
      return;
    }
    const res = await createCoachingCall(coachUserId, {
      title: title.trim(),
      description: description.trim() || undefined,
      scheduledStartTime: scheduledStartMs,
      scheduledDurationMin: duration,
    });
    setSubmitting(false);
    if (res.error || !res.callId) {
      setError(res.error || 'Failed to schedule call');
      return;
    }
    onSaved();
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-6"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl w-full max-w-[480px] max-h-[90vh] overflow-y-auto border border-gray-200 dark:border-zinc-700"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 pt-5 pb-3 border-b border-gray-100 dark:border-zinc-800">
          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
            {isEdit ? 'Edit coaching call' : 'New coaching call'}
          </p>
          <h2 className="text-base font-bold text-gray-900 dark:text-white mt-1">
            {isEdit ? 'Update your coaching session' : 'Schedule a coaching session'}
          </h2>
          <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1 leading-snug">
            {isEdit
              ? "Changes update everyone's calendar automatically — the new time replaces the old one."
              : "All active subscribers will see this on their Schedule with a Join button. The session auto-adds to everyone's calendar."}
          </p>
        </div>

        <div className="px-5 py-4 space-y-4">
          <div>
            <label className="block text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
              Session title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value.slice(0, 120))}
              placeholder="Q&A: Handling objections on discovery calls"
              className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-black/10 text-gray-900 dark:text-white placeholder-gray-400"
            />
            <div className="flex justify-end text-[10px] text-gray-400 mt-0.5">
              {title.length}/120
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
              Description <span className="text-gray-400 normal-case tracking-normal">(optional)</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value.slice(0, 1000))}
              rows={3}
              placeholder="What you'll cover, required prep, etc."
              className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-black/10 text-gray-900 dark:text-white placeholder-gray-400 resize-none"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
              When
            </label>
            <input
              type="datetime-local"
              value={startLocal}
              onChange={(e) => setStartLocal(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-black/10 text-gray-900 dark:text-white"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
              Duration
            </label>
            <div className="flex gap-1.5 flex-wrap">
              {DURATION_OPTIONS.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDuration(d)}
                  className={`px-3 py-1.5 text-[12px] font-medium rounded-lg border transition-colors ${
                    duration === d
                      ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900 border-gray-900 dark:border-white'
                      : 'bg-gray-50 dark:bg-zinc-800 border-gray-200 dark:border-zinc-700 text-gray-600 dark:text-gray-400 hover:border-gray-400'
                  }`}
                >
                  {d >= 60 ? `${d / 60}h` : `${d}m`}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <div className="px-3 py-2 rounded-lg bg-red-50 dark:bg-red-900/20 text-[11px] text-red-700 dark:text-red-400">
              {error}
            </div>
          )}
        </div>

        <div className="px-5 py-4 border-t border-gray-100 dark:border-zinc-800 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            disabled={submitting}
            className="px-3 py-2 text-xs font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!canSubmit}
            className="px-4 py-2 text-xs font-semibold bg-black text-white dark:bg-white dark:text-black rounded-lg hover:opacity-80 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {submitting ? 'Saving…' : isEdit ? 'Save changes' : 'Schedule call'}
          </button>
        </div>
      </div>
    </div>
  );
}
