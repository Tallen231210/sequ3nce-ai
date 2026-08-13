"use client";

// ============================================================================
// Outstanding balances.
//
// The gap between what a closer collected on the call and what the contract was
// worth. It has always been in the data — the post-call form records the two
// numbers separately — and nothing has ever shown it back to anyone.
//
// Deliberately the closer's own list rather than only a manager view. They're
// the one who knows what was arranged on the call, so they're the one who can
// say "he's paying the rest Friday" — and the one who'll hear about it first
// when the money lands.
//
// Two ways out, not one. Without "write off", a debt nobody is ever going to
// collect sits in the list forever and teaches people to skip past the whole
// panel, which costs us the collectable ones too.
// ============================================================================

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  getMyOutstandingBalances,
  resolveBalance,
  type OutstandingBalanceItem,
} from "@/lib/closer/collections";

interface Props {
  /** Rendered inline on the dashboard; hides itself when there's nothing owed. */
  onCountChange?: (count: number) => void;
}

const PREVIEW_ROWS = 3;

/**
 * Whether this closer has tucked the panel away.
 *
 * Per closer rather than a team setting, because it isn't really a company
 * policy — on some floors the closer chases the rest of the money and on others
 * customer success does, and that can differ between two people on the same
 * team. Collapsed still shows the total, so nobody loses sight of it entirely.
 */
const COLLAPSE_KEY = "sequ3nce.collections.collapsed";

export function CollectionsQueue({ onCountChange }: Props) {
  const [balances, setBalances] = useState<OutstandingBalanceItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);

  // Read after mount rather than during render: localStorage doesn't exist on
  // the server, and seeding state from it directly makes the first client
  // render disagree with the server's.
  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(COLLAPSE_KEY) === "1");
    } catch {
      // Private browsing, or storage disabled. Defaulting to open is the safe
      // side of this — worst case someone collapses it again.
    }
  }, []);

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
      } catch {
        // Not worth surfacing; the toggle still works for this session.
      }
      return next;
    });
  };

  // Re-armed at the top of the effect. React's development double-mount runs
  // the cleanup then re-runs the effect on the same instance, and a ref left
  // false silently drops every response.
  const mounted = useRef(true);

  const refresh = useCallback(async () => {
    const result = await getMyOutstandingBalances();
    if (!mounted.current) return;
    setBalances(result?.balances ?? []);
    setTotal(result?.total ?? 0);
    setLoading(false);
    onCountChange?.(result?.count ?? 0);
  }, [onCountChange]);

  useEffect(() => {
    mounted.current = true;
    void refresh();
    return () => {
      mounted.current = false;
    };
  }, [refresh]);

  const resolve = async (
    item: OutstandingBalanceItem,
    resolution: "settled" | "written_off",
  ) => {
    setBusy(item.callId);
    setConfirming(null);
    // Optimistic. Whether the money arrived is something the closer already
    // knows; making them wait on a round trip to see the row go makes clearing
    // a list of ten feel like work.
    setBalances((b) => b.filter((x) => x.callId !== item.callId));
    setTotal((t) => Math.max(0, t - item.balance));
    const result = await resolveBalance(item.callId, resolution);
    if (!mounted.current) return;
    setBusy(null);
    if (!result?.success) await refresh();
  };

  if (loading || balances.length === 0) return null;

  const shown = expanded ? balances : balances.slice(0, PREVIEW_ROWS);

  return (
    <div className="rounded-lg border border-gray-300 bg-white p-4">
      <div
        className={
          "flex items-start justify-between gap-3" + (collapsed ? "" : " mb-3")
        }
      >
        <div>
          <h3 className="text-[13px] font-semibold text-gray-900">
            {money(total)} outstanding across{" "}
            {balances.length === 1 ? "1 deal" : `${balances.length} deals`}
          </h3>
          {!collapsed && (
            <p className="text-[11.5px] text-gray-500 mt-0.5">
              Closed, but not collected in full. Mark these off as the money comes in.
            </p>
          )}
        </div>

        {/* Collapsing keeps the total visible and hides the work. On a floor
            where chasing the balance isn't the closer's job, this gets tucked
            away once and stays that way. */}
        <button
          onClick={toggleCollapsed}
          aria-expanded={!collapsed}
          aria-label={collapsed ? "Show outstanding balances" : "Hide outstanding balances"}
          className="shrink-0 p-1 -m-1 text-gray-400 hover:text-gray-700 transition-colors"
        >
          <svg
            className={
              "w-4 h-4 transition-transform " + (collapsed ? "" : "rotate-180")
            }
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>

      {!collapsed && (
      <ul className="space-y-1.5">
        {shown.map((item) => (
          <li
            key={item.callId}
            className="flex items-center gap-3 bg-gray-50 rounded-md border border-gray-200 px-3 py-2"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 text-[13px] font-medium text-gray-900">
                <span className="truncate">{item.prospectName}</span>
                {/* Nobody fills in the post-call form any more, so most of
                    these figures were read off the recording. The closer is the
                    one person who knows whether this is a real debt or a payment
                    plan running exactly to plan — but only if we tell them the
                    number was inferred rather than recorded. */}
                {item.outcomeSource === 'ai' && (
                  <span
                    title="Read from the recording. If this is a payment plan running to schedule, mark it collected."
                    className="shrink-0 rounded border border-violet-200 bg-violet-50 px-1 py-0.5 text-[9.5px] font-medium text-violet-700"
                  >
                    AI
                  </span>
                )}
              </div>
              <div className="text-[11.5px] text-gray-500">
                Paid {money(item.cashCollected)} of {money(item.contractValue)} ·{" "}
                <span className="font-semibold text-gray-700">
                  {money(item.balance)} outstanding
                </span>{" "}
                · {formatAge(item.ageDays)}
              </div>
            </div>

            {confirming === item.callId ? (
              // Writing something off is the one action here that loses
              // information, so it asks once. Marking it collected doesn't —
              // that's the happy path and it happens far more often.
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-[11.5px] text-gray-500">Never paying?</span>
                <button
                  onClick={() => resolve(item, "written_off")}
                  className="px-2.5 py-1.5 text-[12px] font-semibold text-white bg-gray-900 rounded-md hover:bg-gray-700 transition-colors"
                >
                  Write off
                </button>
                <button
                  onClick={() => setConfirming(null)}
                  className="text-[12px] font-medium text-gray-500 hover:text-gray-800"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-3 shrink-0">
                <button
                  onClick={() => resolve(item, "settled")}
                  disabled={busy === item.callId}
                  className="px-3 py-1.5 text-[12px] font-semibold text-white bg-black rounded-md hover:bg-gray-800 disabled:opacity-50 transition-colors"
                >
                  Collected
                </button>
                <button
                  onClick={() => setConfirming(item.callId)}
                  disabled={busy === item.callId}
                  className="text-[12px] font-medium text-gray-500 hover:text-gray-800 disabled:opacity-50"
                >
                  Write off
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
      )}

      {!collapsed && balances.length > PREVIEW_ROWS && (
        <button
          onClick={() => setExpanded((e) => !e)}
          className="mt-2.5 text-[12px] font-medium text-gray-700 hover:text-black underline"
        >
          {expanded ? "Show fewer" : `Show all ${balances.length}`}
        </button>
      )}
    </div>
  );
}

function money(n: number): string {
  return `$${Math.round(n).toLocaleString("en-US")}`;
}

function formatAge(days: number): string {
  if (days === 0) return "closed today";
  if (days === 1) return "1 day";
  return `${days} days`;
}
