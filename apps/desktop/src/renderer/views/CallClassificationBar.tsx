// ============================================================================
// "Was this a sales call?"
//
// Bots join whatever is on the calendar now, so standups, one-to-ones and
// interviews get recorded alongside real calls — and every one of them counts
// toward the close rate until someone says otherwise. Kicking the bot out is
// the other way to say no, and it only helps if you remember before the
// meeting starts.
//
// Deliberately quiet when the answer is already what you'd expect. A closer
// scrolling their own history shouldn't be nagged about a decision they've
// already made, or asked a question about a call that was obviously a call.
//
// The manager has their own version of this in the web dashboard. Both go
// through the same rule in convex/callClassification.ts, so the two can never
// mean different things to the numbers.
// ============================================================================

import React, { useState } from 'react';
import { reclassifyCall } from '../convex';

interface Props {
  callId: string;
  closerId: string;
  classifiedAs?: string;
  classifiedBy?: string;
  countsTowardStats?: boolean;
  /** So the parent can refresh once the answer changes the numbers. */
  onChanged?: (isSalesCall: boolean) => void;
}

export function CallClassificationBar({
  callId,
  closerId,
  classifiedAs,
  classifiedBy,
  countsTowardStats,
  onChanged,
}: Props) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Optimistic, so the bar settles the moment they tap rather than after a
  // round trip. The server is the authority; this only affects what's drawn.
  const [answered, setAnswered] = useState<boolean | null>(null);

  // Absent means counted — that's the schema's default, and reading it any
  // other way would misreport every call recorded before this existed.
  const counts = answered ?? countsTowardStats ?? true;
  const decided =
    answered !== null || classifiedBy === 'closer' || classifiedBy === 'manager';

  // Nobody has been asked, and it doesn't look like a sales call. This is the
  // state auto-join creates: a bot sat in a standup and it's counting.
  const needsAnswer = !decided && classifiedAs === 'internal';

  const answer = async (isSalesCall: boolean) => {
    setSaving(true);
    setError(null);
    const result = await reclassifyCall(callId, closerId, isSalesCall);
    setSaving(false);
    if (!result.success) {
      setError(result.error ?? "Couldn't save that.");
      return;
    }
    setAnswered(isSalesCall);
    onChanged?.(isSalesCall);
  };

  if (needsAnswer) {
    return (
      <div className="px-5 py-3 bg-amber-50 border-b border-amber-200">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-[12.5px] font-medium text-amber-900">
            This looks like an internal meeting, but it&apos;s still counting
            toward your numbers.
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => answer(false)}
              disabled={saving}
              className="px-3 py-1.5 text-[12px] font-semibold text-white bg-black rounded-md hover:bg-gray-800 disabled:bg-gray-300 transition-colors"
            >
              {saving ? 'Saving...' : "Don't count it"}
            </button>
            <button
              onClick={() => answer(true)}
              disabled={saving}
              className="px-3 py-1.5 text-[12px] font-medium text-amber-900 border border-amber-300 rounded-md hover:bg-amber-100 disabled:opacity-50 transition-colors"
            >
              It was a sales call
            </button>
          </div>
        </div>
        {error && <p className="mt-1.5 text-[12px] text-red-600">{error}</p>}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 px-5 py-2 bg-gray-50 border-b border-gray-200 text-[12px] text-gray-500 flex-wrap">
      <span>
        {counts
          ? 'Counted as a sales call.'
          : 'Not counted — marked as an internal meeting.'}
      </span>
      <button
        onClick={() => answer(!counts)}
        disabled={saving}
        className="font-medium text-gray-700 hover:text-black underline disabled:opacity-50"
      >
        {saving ? 'Saving...' : counts ? 'Not a sales call' : 'Count it'}
      </button>
      {error && <span className="text-red-600">{error}</span>}
    </div>
  );
}
