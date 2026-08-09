"use client";

// ============================================================================
// "Was this a sales call?" — the manager's copy.
//
// The closer has their own version of this in the closer app. This one can
// correct ANY call on the team, because managers are the people looking at the
// board when the numbers seem wrong, and telling them to go and ask the closer
// to fix it is how a correction never gets made.
//
// Deliberately quiet when the answer is already what you'd expect. A manager
// opening a normal sales call should see one line, not a decision to make.
// ============================================================================

import { useState } from "react";
import { useMutation } from "convex/react";
import { Loader2 } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

interface Props {
  callId: string;
  clerkId?: string;
  classifiedAs?: string;
  classifiedBy?: string;
  countsTowardStats?: boolean;
  canEdit: boolean;
}

export function SalesCallToggle({
  callId,
  clerkId,
  classifiedAs,
  classifiedBy,
  countsTowardStats,
  canEdit,
}: Props) {
  const setClassification = useMutation(
    api.callClassification.setCallSalesClassification,
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Optimistic, so the line settles on tap rather than after a round trip.
  // The server is the authority; this only affects what's drawn.
  const [answered, setAnswered] = useState<boolean | null>(null);

  if (!clerkId || !canEdit) return null;

  // Absent means counted — that's the schema's default and changing how it
  // reads here would misreport every call recorded before this existed.
  const counts = answered ?? countsTowardStats ?? true;
  const decided = classifiedBy === "closer" || classifiedBy === "manager";

  async function answer(isSalesCall: boolean) {
    setSaving(true);
    setError(null);
    try {
      const res = await setClassification({
        clerkId: clerkId!,
        callId: callId as Id<"calls">,
        isSalesCall,
      });
      if (!res.success) setError(res.error ?? "Couldn't save that.");
      else setAnswered(isSalesCall);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save that.");
    } finally {
      setSaving(false);
    }
  }

  // Nobody has been asked and it doesn't look like a sales call. This is the
  // state auto-join creates: a bot sat in a standup, and it's counting.
  const needsAnswer = !decided && classifiedAs === "internal";

  return (
    <div
      className={
        "mb-6 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border px-4 py-2.5 text-sm " +
        (needsAnswer
          ? "border-amber-200 bg-amber-50 text-amber-900"
          : "border-border bg-muted/40 text-muted-foreground")
      }
    >
      <span>
        {needsAnswer
          ? "This looks like an internal meeting, but it's still counting toward the team's numbers."
          : counts
            ? "Counted as a sales call."
            : "Not counted — marked as an internal meeting."}
      </span>

      <button
        type="button"
        disabled={saving}
        onClick={() => void answer(!counts)}
        className="inline-flex items-center gap-1.5 font-medium underline underline-offset-2 hover:text-foreground disabled:opacity-50"
      >
        {saving && <Loader2 className="h-3 w-3 animate-spin" />}
        {counts ? "Not a sales call" : "Count it as a sales call"}
      </button>

      {error && <span className="text-xs text-rose-600">{error}</span>}
    </div>
  );
}
