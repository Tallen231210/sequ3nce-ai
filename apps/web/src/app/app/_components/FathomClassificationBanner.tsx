"use client";

// ============================================================================
// "Was this a sales call?"
//
// Shown on calls that came from Fathom, which records everything a closer sits
// in — standups, one-to-ones, interviews. We guess, and when we can't tell we
// show the call anyway but leave it out of their numbers until someone says.
//
// The bar is deliberately quiet once answered. A closer scrolling their own
// history should not be nagged about a decision they already made.
// ============================================================================

import React, { useState } from "react";
import { reclassifyFathomCall } from "@/lib/closer/fathom";

interface Props {
  callId: string;
  classifiedAs?: string;
  classifiedBy?: string;
  countsTowardStats?: boolean;
  /** So the parent can refresh its list once the answer changes the numbers. */
  onChanged?: () => void;
}

export function FathomClassificationBanner({
  callId,
  classifiedAs,
  classifiedBy,
  countsTowardStats,
  onChanged,
}: Props) {
  const [saving, setSaving] = useState<null | "sales" | "internal">(null);
  const [error, setError] = useState<string | null>(null);
  // Optimistic, so the bar settles the moment they tap rather than after a
  // round trip. The server is the authority; this only affects what's drawn.
  const [answered, setAnswered] = useState<null | boolean>(null);

  const decided = answered ?? (classifiedBy === "closer" ? countsTowardStats ?? false : null);

  const answer = async (isSalesCall: boolean) => {
    setSaving(isSalesCall ? "sales" : "internal");
    setError(null);
    const result = await reclassifyFathomCall(callId, isSalesCall);
    setSaving(null);
    if (!result?.success) {
      setError(result?.error ?? "Couldn't save that.");
      return;
    }
    setAnswered(isSalesCall);
    onChanged?.();
  };

  // Already settled by a person — a single quiet line with a way back.
  if (decided !== null) {
    return (
      <div className="flex items-center gap-2 px-5 py-2 bg-gray-50 border-b border-gray-200 text-[12px] text-gray-500">
        <span>
          {decided
            ? "Counted as a sales call."
            : "Not counted — marked as an internal meeting."}
        </span>
        <button
          onClick={() => answer(!decided)}
          disabled={saving !== null}
          className="font-medium text-gray-700 hover:text-black underline"
        >
          Change
        </button>
      </div>
    );
  }

  // We were confident, and nobody has disagreed. Say so briefly, and still
  // offer the correction — our guess is only as good as the team roster.
  if (classifiedAs === "sales" && countsTowardStats) {
    return (
      <div className="flex items-center gap-2 px-5 py-2 bg-gray-50 border-b border-gray-200 text-[12px] text-gray-500">
        <span>Counted as a sales call.</span>
        <button
          onClick={() => answer(false)}
          disabled={saving !== null}
          className="font-medium text-gray-700 hover:text-black underline"
        >
          Not a sales call
        </button>
      </div>
    );
  }

  return (
    <div className="px-5 py-3 bg-amber-50 border-b border-amber-200">
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-[12.5px] text-amber-900 font-medium">
          {classifiedAs === "internal"
            ? "This looks like an internal meeting — it isn't in your numbers."
            : "Was this a sales call? It isn't in your numbers until you say."}
        </span>
        <div className="flex gap-2">
          <button
            onClick={() => answer(true)}
            disabled={saving !== null}
            className="px-3 py-1.5 text-[12px] font-semibold text-white bg-black rounded-md hover:bg-gray-800 disabled:bg-gray-300 transition-colors"
          >
            {saving === "sales" ? "Saving..." : "Yes, count it"}
          </button>
          <button
            onClick={() => answer(false)}
            disabled={saving !== null}
            className="px-3 py-1.5 text-[12px] font-medium text-amber-900 border border-amber-300 rounded-md hover:bg-amber-100 disabled:opacity-50 transition-colors"
          >
            {saving === "internal" ? "Saving..." : "No"}
          </button>
        </div>
      </div>
      {error && <p className="mt-1.5 text-[12px] text-red-600">{error}</p>}
    </div>
  );
}
