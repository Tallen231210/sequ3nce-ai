"use client";

// Calls You've Set. Deliberately generous matching — "(E)" shows the call to
// both Erten and Ethan — so "Not my call" is a first-class action, and
// dismissed calls stay reachable for undo.

import React, { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { useSetter } from "../_components/SetterContext";

function fmtDate(ms: number) {
  return new Date(ms).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}
function fmtDur(sec: number | null) {
  if (!sec) return "—";
  return `${Math.round(sec / 60)} min`;
}
function outcomeLabel(o: string | null, classifiedAs: string | null, failed: string | null) {
  if (o) return o.replace(/_/g, " ");
  if (classifiedAs === "internal") return "internal";
  if (failed) return "no conversation";
  return "pending";
}

export default function SetterCallsPage() {
  const { sessionToken } = useSetter();
  const data = useQuery(api.setterApp.getMyCalls, { sessionToken });
  const dismiss = useMutation(api.setterApp.dismissCall);
  const [showDismissed, setShowDismissed] = useState(false);
  const [justDismissed, setJustDismissed] = useState<string | null>(null);

  if (data === undefined) {
    return <div className="py-16 text-center text-sm text-neutral-400">Loading…</div>;
  }
  if (data === null) return null;

  const Row = ({ c, dismissed }: { c: any; dismissed: boolean }) => (
    <div className="flex items-center gap-3 border-b border-neutral-100 py-3 last:border-0">
      <div className="w-14 shrink-0 text-[12px] tabular-nums text-neutral-400">
        {fmtDate(c.dateMs)}
      </div>
      <div className="min-w-0 flex-1">
        <Link
          href={`/setter/calls/${c.callId}`}
          className="block truncate text-[14px] font-medium hover:underline"
        >
          {c.title}
        </Link>
        <div className="text-[12px] text-neutral-500">
          {c.closerName} · {fmtDur(c.durationSec)} ·{" "}
          {outcomeLabel(c.outcome, c.classifiedAs, c.extractionFailed)}
        </div>
      </div>
      <button
        onClick={async () => {
          await dismiss({ sessionToken, callId: c.callId, undo: dismissed });
          if (!dismissed) {
            setJustDismissed(c.callId);
            setTimeout(() => setJustDismissed(null), 4000);
          }
        }}
        className="shrink-0 text-[12px] text-neutral-400 transition-colors hover:text-neutral-900"
      >
        {dismissed ? "Restore" : "Not my call"}
      </button>
    </div>
  );

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-[17px] font-semibold tracking-tight">Calls you&apos;ve set</h1>
        <p className="mt-0.5 text-[13px] text-neutral-500">
          Matched from the initials on the meeting title. See one that isn&apos;t
          yours? Mark it — it only disappears from your list.
        </p>
      </div>

      {justDismissed && (
        <div className="mb-3 flex items-center justify-between rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-[13px]">
          <span>Removed from your list.</span>
          <button
            onClick={async () => {
              await dismiss({ sessionToken, callId: justDismissed as any, undo: true });
              setJustDismissed(null);
            }}
            className="font-medium underline"
          >
            Undo
          </button>
        </div>
      )}

      <div className="rounded-2xl border border-neutral-200 bg-white px-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
        {data.active.length === 0 ? (
          <p className="py-12 text-center text-sm text-neutral-400">
            No matched calls yet — they appear here once a meeting titled with
            your initials is recorded.
          </p>
        ) : (
          data.active.map((c: any) => <Row key={c.callId} c={c} dismissed={false} />)
        )}
      </div>

      {data.dismissed.length > 0 && (
        <div className="mt-6">
          <button
            onClick={() => setShowDismissed((s) => !s)}
            className="text-[12px] text-neutral-400 hover:text-neutral-900"
          >
            {showDismissed ? "Hide" : "Show"} dismissed ({data.dismissed.length})
          </button>
          {showDismissed &&
            data.dismissed.map((c: any) => <Row key={c.callId} c={c} dismissed={true} />)}
        </div>
      )}
    </div>
  );
}
