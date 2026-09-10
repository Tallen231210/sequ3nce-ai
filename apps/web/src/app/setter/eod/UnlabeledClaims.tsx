"use client";

// Bookings the setter touched that carry no name — no initials, no link
// name, no claim. "That was mine" credits it to them at once; a manager can
// change it. Shown only for teams on the Setters page.
//
// Read once per page load rather than kept live: the read walks three weeks
// of the calendar and Close, and a live subscription would re-run it for
// every setter on every dial anyone makes.

import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import type { FunctionReturnType } from "convex/server";
import { api } from "../../../../convex/_generated/api";

type Snapshot = NonNullable<FunctionReturnType<typeof api.settersPageClaims.getMyUnlabeled>>;

/** "Tue 2 Sep" — the same format as the form above it. */
function humanDay(dayKey: string): string {
  const [y, m, d] = dayKey.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}

const SOURCE_WORDS = { "self-booked": "booked themselves", link: "booked through a link", "hand-made": "put on the calendar by hand" } as const;

export function UnlabeledClaims({ sessionToken }: { sessionToken: string }) {
  const [snapshot, setSnapshot] = useState<Snapshot | null | undefined>(undefined);
  const live = useQuery(api.settersPageClaims.getMyUnlabeled, snapshot === undefined ? { sessionToken } : "skip");
  useEffect(() => {
    if (snapshot === undefined && live !== undefined) setSnapshot(live);
  }, [live, snapshot]);
  const claim = useMutation(api.settersPageClaims.claimMine);
  const [busy, setBusy] = useState<string | null>(null);
  const [claimed, setClaimed] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  if (!snapshot || snapshot.rows.length === 0) return null;
  return (
    <div className="mt-4 rounded-2xl border border-neutral-200 bg-white p-6 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
      <h2 className="text-[15px] font-semibold text-neutral-900">Bookings you touched with no initials on them</h2>
      <p className="mt-1 text-[12px] text-neutral-500">
        These aren&apos;t counted as anyone&apos;s set yet. If one is yours, claim it and it moves to your numbers. If a lead booked themselves and you only followed up, leave it — that&apos;s confirmation work.
      </p>
      <ul className="mt-3 divide-y divide-neutral-100">
        {snapshot.rows.map((r) => (
          <li key={r.bookingKey} className="flex items-center justify-between gap-3 py-2.5">
            <div className="min-w-0 text-[13px]">
              <div className="truncate font-medium text-neutral-900">{r.title}</div>
              <div className="text-[12px] text-neutral-500">
                {humanDay(r.dayKey)} with {r.closerName} · {SOURCE_WORDS[r.source]} · you {r.touchedAfterBooking ? "contacted them after the booking" : "contacted them before the booking"}
              </div>
            </div>
            {claimed.has(r.bookingKey) ? (
              <span className="shrink-0 text-[12px] font-medium text-green-700">Claimed ✓</span>
            ) : (
              <button
                type="button"
                disabled={busy === r.bookingKey}
                onClick={async () => {
                  setBusy(r.bookingKey);
                  setError(null);
                  try {
                    await claim({ sessionToken, bookingKey: r.bookingKey });
                    setClaimed((s) => new Set(s).add(r.bookingKey));
                  } catch (err) {
                    setError(err instanceof ConvexError && typeof err.data === "string" ? err.data : "Couldn't claim that — try again");
                  } finally {
                    setBusy(null);
                  }
                }}
                className="shrink-0 rounded-lg border border-neutral-300 px-3 py-1.5 text-[12px] font-medium text-neutral-900 hover:bg-neutral-50 disabled:opacity-50"
              >
                {busy === r.bookingKey ? "Claiming…" : "That was mine"}
              </button>
            )}
          </li>
        ))}
      </ul>
      {error && <p className="mt-2 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-[13px] text-red-700">{error}</p>}
    </div>
  );
}
