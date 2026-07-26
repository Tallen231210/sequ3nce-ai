"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useUser } from "@clerk/nextjs";
import { CalendarCheck, Info, Loader2, RotateCcw } from "lucide-react";
import { api } from "../../../../../convex/_generated/api";
import { MONO } from "@/components/analytics/primitives/typography";

interface CalendarRow {
  subscriptionId: string;
  calendarId: string;
  label: string;
  countsTowardCapacity: boolean;
  isExplicit: boolean;
}

interface CloserRow {
  closerId: string;
  name: string;
  email: string | null;
  calendars: CalendarRow[];
}

/**
 * Which calendars count toward each rep's availability.
 *
 * Slots are inferred from free time, so the board has to know which of a
 * rep's subscribed calendars is genuinely theirs. It guesses from the address,
 * which is right most of the time and wrong in ways no heuristic will fix —
 * teams share a Google Workspace, reps keep second calendars. This is where a
 * manager settles it.
 */
export function CapacitySettings() {
  const { user } = useUser();
  const data = useQuery(
    api.closerCapacitySettings.getCapacitySettings,
    user ? { clerkId: user.id } : "skip",
  );
  const setCapacity = useMutation(
    api.closerCapacitySettings.setCalendarCapacity,
  );
  // Call length lives here rather than with targets: it's the divisor that
  // turns open calendar time into slots, so it's a capacity setting.
  const config = useQuery(
    api.closerPerformanceConfig.getConfig,
    user ? { clerkId: user.id } : "skip",
  );
  const updateConfig = useMutation(api.closerPerformanceConfig.updateConfig);
  const [lengthDraft, setLengthDraft] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (data === undefined) {
    return (
      <div className="flex h-40 items-center justify-center rounded-xl border border-border bg-card">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!data) return null;

  const closers = data.closers as CloserRow[];

  async function update(subscriptionId: string, value: boolean | null) {
    setPending(subscriptionId);
    setError(null);
    try {
      await setCapacity({
        clerkId: user!.id,
        subscriptionId: subscriptionId as never,
        countsTowardCapacity: value,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2.5 rounded-lg border border-border bg-muted/40 px-4 py-3">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <p className="text-xs leading-relaxed text-muted-foreground">
          Slots measure how much bookable time a rep had. To work that out, the
          board needs to know which calendars represent{" "}
          <span className="font-medium text-foreground">their own</span>{" "}
          availability — time blocked on a teammate&apos;s calendar
          shouldn&apos;t reduce theirs. We infer this from the calendar address;
          override it here when the guess is wrong. Changes apply from the next
          sync, within the hour.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-rose-300 bg-rose-50 px-4 py-2.5 text-xs text-rose-700 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-300">
          {error}
        </div>
      )}

      {config && (
        <div className="rounded-xl border border-border bg-card px-5 py-4">
          <label className="text-xs font-medium" htmlFor="cap-len">
            Typical call length
          </label>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Open time on a calendar is divided by this to count slots. A wrong
            value shifts every Slots figure on the board.
          </p>
          <div className="mt-2 flex items-center gap-2">
            <input
              id="cap-len"
              type="number"
              disabled={!config.canEdit}
              value={lengthDraft ?? String(config.typicalCallLengthMin)}
              onChange={(e) => setLengthDraft(e.target.value)}
              onBlur={(e) => {
                setLengthDraft(null);
                const v = Number(e.target.value.trim());
                if (!Number.isFinite(v) || v === config.typicalCallLengthMin) return;
                setError(null);
                void updateConfig({
                  clerkId: user!.id,
                  typicalCallLengthMin: v,
                }).catch((err) =>
                  setError(err instanceof Error ? err.message : "Could not save"),
                );
              }}
              className={`w-24 rounded-lg border border-border bg-background px-3 py-1.5 text-sm ${MONO} outline-none focus:border-foreground disabled:opacity-60`}
            />
            <span className="text-xs text-muted-foreground">minutes</span>
          </div>
        </div>
      )}

      {closers.length === 0 && (
        <div className="rounded-xl border border-border bg-card px-5 py-10 text-center text-sm text-muted-foreground">
          No active closers on this team.
        </div>
      )}

      {closers.map((c) => {
        const counted = c.calendars.filter((x) => x.countsTowardCapacity).length;
        return (
          <div
            key={c.closerId}
            className="overflow-hidden rounded-xl border border-border bg-card"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border px-5 py-3">
              <div>
                <h3 className="text-sm font-semibold">{c.name}</h3>
                {c.email && (
                  <p className="text-xs text-muted-foreground">{c.email}</p>
                )}
              </div>
              <span
                className={
                  "text-xs " +
                  (counted === 0
                    ? "font-medium text-amber-700 dark:text-amber-400"
                    : "text-muted-foreground")
                }
              >
                {counted === 0
                  ? "No availability calendar — Booked % can't be measured"
                  : `${counted} calendar${counted === 1 ? "" : "s"} count toward availability`}
              </span>
            </div>

            {c.calendars.length === 0 ? (
              <p className="px-5 py-6 text-sm text-muted-foreground">
                No calendars connected for this closer.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {c.calendars.map((cal) => (
                  <li
                    key={cal.subscriptionId}
                    className="flex items-center gap-3 px-5 py-2.5"
                  >
                    <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
                      <input
                        type="checkbox"
                        checked={cal.countsTowardCapacity}
                        disabled={!data.canEdit || pending === cal.subscriptionId}
                        onChange={(e) =>
                          void update(cal.subscriptionId, e.target.checked)
                        }
                        className="h-4 w-4 shrink-0 rounded border-border accent-foreground"
                      />
                      <span className="min-w-0">
                        <span className="block truncate text-sm">
                          {cal.label || cal.calendarId}
                        </span>
                        {cal.label !== cal.calendarId && (
                          <span className="block truncate text-[11px] text-muted-foreground">
                            {cal.calendarId}
                          </span>
                        )}
                      </span>
                    </label>

                    {cal.countsTowardCapacity && (
                      <CalendarCheck className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                    )}

                    <span className="w-16 shrink-0 text-right text-[11px] text-muted-foreground">
                      {pending === cal.subscriptionId ? (
                        <Loader2 className="ml-auto h-3 w-3 animate-spin" />
                      ) : cal.isExplicit ? (
                        "set by you"
                      ) : (
                        "inferred"
                      )}
                    </span>

                    {cal.isExplicit && data.canEdit && (
                      <button
                        type="button"
                        onClick={() => void update(cal.subscriptionId, null)}
                        title="Clear your override and go back to the inferred value"
                        className="shrink-0 text-muted-foreground hover:text-foreground"
                      >
                        <RotateCcw className="h-3 w-3" />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}
