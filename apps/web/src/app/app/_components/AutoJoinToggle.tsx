"use client";

// ============================================================================
// Recording on or off, decided by the person whose calls they are.
//
// Auto-join has been opt-in per closer since the bot rolled out, which was the
// right call while it was being proved — but there was never a way for anyone
// to opt IN. `setAutoJoin` is an internal mutation, reachable only from our
// CLI, so for months the only people recording were ones we had switched on by
// hand.
//
// That held until a team onboarded without us. E2 Influencers had four closers
// active, calendars connected, correct plan, and nothing recorded at all —
// because the switch existed and nobody could reach it.
//
// So it lives here, on the first screen a closer sees, and it defaults on when
// they connect a calendar. The point of the control isn't to make them turn
// recording on; it's so that turning it OFF is always one click away and never
// requires asking us.
// ============================================================================

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { getOrSetAutoJoin, type AutoJoinState } from "@/lib/closer/client";

/**
 * Goes through the closer HTTP route rather than a Convex hook, so the caller
 * is identified by their session token. An earlier version was a public Convex
 * mutation taking a closerId — which would have let anyone switch recording on
 * for anyone.
 */
export function AutoJoinToggle() {
  const [status, setStatus] = useState<AutoJoinState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void getOrSetAutoJoin().then((s) => {
      if (alive) setStatus(s);
    });
    return () => {
      alive = false;
    };
  }, []);

  // Nothing to offer on a plan without the bot. A dead switch invites someone
  // to click it and conclude the product is broken.
  if (!status || !status.available) return null;

  const on = status.enabled;

  async function toggle() {
    setBusy(true);
    setError(null);
    const res = await getOrSetAutoJoin(!on);
    setBusy(false);
    if (!res) {
      setError("Couldn't change that.");
      return;
    }
    if (res.ok === false) {
      setError(res.reason ?? "Couldn't change that.");
      return;
    }
    // Trust the server's answer rather than assuming the flip worked — it can
    // legitimately refuse, and a switch that shows what you clicked instead of
    // what is true is the whole failure being fixed here.
    setStatus(res);
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={() => void toggle()}
        disabled={busy}
        role="switch"
        aria-checked={on}
        aria-label="Auto Record"
        title={
          on
            ? "Sequ3nce joins the meetings on your calendar."
            : "Sequ3nce is not joining your meetings."
        }
        className="inline-flex items-center gap-2.5 disabled:opacity-50"
      >
        <span className="text-[13px] font-medium text-gray-700">Auto Record</span>
        <span
          className={
            "relative inline-flex h-[22px] w-[38px] shrink-0 items-center rounded-full transition-colors " +
            (on ? "bg-gray-900" : "bg-gray-300")
          }
        >
          <span
            className={
              "inline-flex h-[18px] w-[18px] items-center justify-center rounded-full bg-white shadow transition-transform " +
              (on ? "translate-x-[18px]" : "translate-x-[2px]")
            }
          >
            {busy && <Loader2 className="h-3 w-3 animate-spin text-gray-500" />}
          </span>
        </span>
      </button>

      {/* Says what's true rather than what's configured. A closer with the
          switch on and no calendar connected would otherwise believe their
          calls are being captured when nothing is. */}
      {on && !status.hasCalendar && (
        <span className="text-[11px] text-amber-700">
          Connect your calendar in Settings — nothing is being recorded yet.
        </span>
      )}
      {error && <span className="text-[11px] text-red-600">{error}</span>}
    </div>
  );
}
