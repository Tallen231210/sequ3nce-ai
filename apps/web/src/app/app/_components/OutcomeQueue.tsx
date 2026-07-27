"use client";

// ============================================================================
// The outcome queue.
//
// A closer using Fathom is never interrupted by us — the call happens, and the
// recording turns up afterwards. So there is no moment where a form can be put
// in front of them, and outcomes would simply never be recorded.
//
// This is that moment, moved: a short list of what's outstanding, cleared in
// one sitting. Each call is either answered with the normal post-call form or
// dismissed as a team meeting in a single tap, because a queue you can't empty
// is worse than no queue at all.
// ============================================================================

import React, { useCallback, useEffect, useRef, useState } from "react";
import type { CloserInfo } from "@/lib/closer/client";
import {
  getCallsNeedingOutcome,
  reclassifyFathomCall,
  type OutcomeQueueItem,
} from "@/lib/closer/fathom";
import { PostCallQuestionnaire } from "./PostCallQuestionnaire";

interface Props {
  closerInfo: CloserInfo;
  /** Rendered inline on the dashboard; hides itself when there's nothing to do. */
  onCountChange?: (count: number) => void;
}

export function OutcomeQueue({ closerInfo, onCountChange }: Props) {
  const [queue, setQueue] = useState<OutcomeQueueItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<OutcomeQueueItem | null>(null);
  const [dismissing, setDismissing] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  // Re-armed at the top of the effect. React's development double-mount runs
  // the cleanup then re-runs the effect on the same instance, and a ref left
  // false silently drops every response.
  const mounted = useRef(true);

  const refresh = useCallback(async () => {
    const result = await getCallsNeedingOutcome();
    if (!mounted.current) return;
    setQueue(result?.calls ?? []);
    setTotal(result?.total ?? 0);
    setLoading(false);
    onCountChange?.(result?.total ?? 0);
  }, [onCountChange]);

  useEffect(() => {
    mounted.current = true;
    void refresh();
    return () => {
      mounted.current = false;
    };
  }, [refresh]);

  const dismiss = async (call: OutcomeQueueItem) => {
    setDismissing(call._id);
    // Optimistic. Marking a standup as "not a sales call" is a decision the
    // closer has already made; making them wait on a round trip to see it
    // disappear makes clearing a list of ten feel like work.
    setQueue((q) => q.filter((c) => c._id !== call._id));
    setTotal((t) => Math.max(0, t - 1));
    const result = await reclassifyFathomCall(call._id, false);
    if (!mounted.current) return;
    setDismissing(null);
    if (!result?.success) await refresh();
  };

  if (loading || total === 0) return null;

  const shown = expanded ? queue : queue.slice(0, 3);

  return (
    <>
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
        <div className="flex items-baseline justify-between gap-3 flex-wrap mb-3">
          <div>
            <h3 className="text-[13px] font-semibold text-amber-900">
              {total === 1
                ? "1 call needs an outcome"
                : `${total} calls need an outcome`}
            </h3>
            <p className="text-[11.5px] text-amber-800 mt-0.5">
              These don&apos;t count toward your numbers until you say how they went.
            </p>
          </div>
        </div>

        <ul className="space-y-1.5">
          {shown.map((call) => (
            <li
              key={call._id}
              className="flex items-center gap-3 bg-white rounded-md border border-amber-100 px-3 py-2"
            >
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-medium text-gray-900 truncate">
                  {call.prospectName}
                </div>
                <div className="text-[11.5px] text-gray-500">
                  {formatWhen(call.startedAt)}
                  {call.duration ? ` · ${formatDuration(call.duration)}` : ""}
                </div>
              </div>
              <button
                onClick={() => setActive(call)}
                className="px-3 py-1.5 text-[12px] font-semibold text-white bg-black rounded-md hover:bg-gray-800 transition-colors shrink-0"
              >
                Add outcome
              </button>
              <button
                onClick={() => dismiss(call)}
                disabled={dismissing === call._id}
                className="text-[12px] font-medium text-gray-500 hover:text-gray-800 disabled:opacity-50 shrink-0"
              >
                Not a sales call
              </button>
            </li>
          ))}
        </ul>

        {queue.length > 3 && (
          <button
            onClick={() => setExpanded((e) => !e)}
            className="mt-2.5 text-[12px] font-medium text-amber-900 hover:text-amber-700 underline"
          >
            {expanded ? "Show fewer" : `Show all ${queue.length}`}
          </button>
        )}
      </div>

      {/* The same form the bot shows after a call, so a closer answering one
          of these is answering exactly what they'd have answered live. */}
      {active && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto bg-white rounded-xl shadow-2xl">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-200">
              <div className="min-w-0">
                <h3 className="text-[15px] font-bold text-black truncate">
                  {active.prospectName}
                </h3>
                <p className="text-[11.5px] text-gray-500">
                  {formatWhen(active.startedAt)}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {active.externalShareUrl && (
                  <a
                    href={active.externalShareUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[12px] font-medium text-gray-600 hover:text-black underline"
                  >
                    Watch
                  </a>
                )}
                <button
                  onClick={() => setActive(null)}
                  className="p-1.5 text-gray-400 hover:text-gray-600"
                  aria-label="Close"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            <PostCallQuestionnaire
              closerInfo={closerInfo}
              callId={active._id}
              initialProspectName={active.prospectName}
              onComplete={() => {
                setActive(null);
                void refresh();
              }}
            />
          </div>
        </div>
      )}
    </>
  );
}

function formatWhen(ts: number): string {
  const d = new Date(ts);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  if (sameDay) {
    return `Today, ${d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
  }
  return d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}
