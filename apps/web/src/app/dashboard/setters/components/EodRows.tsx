"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { useUser } from "@clerk/nextjs";
import { api } from "../../../../../convex/_generated/api";
import type { CheckField, CrossCheckFlag } from "../../../../../convex/lib/eodCrossCheck";
import type { CrossCheckData, RosterCheck } from "../lib/cards";
import { humanDay, int } from "../lib/format";

// ============================================================================
// One setter's days: what they typed on their end-of-day form on one row, what
// the CRM and the calendar saw on the next. Two rows beat a slash — nobody
// to remember which side of "180 / 176" is which.
// ============================================================================

type Day = RosterCheck["days"][number];
type Column = {
  field: CheckField;
  label: string;
  measuredKey: keyof Day["measured"];
  hint: string;
};

const BOOKING_COLUMNS: Column[] = [
  { field: "dials", label: "Dials", measuredKey: "dials", hint: "Every outbound call they made in the CRM that day, answered or not." },
  { field: "pickUps", label: "Pick-ups", measuredKey: "pickUps", hint: "Calls somebody answered and stayed on for at least the team's minimum length." },
  { field: "sets", label: "Sets", measuredKey: "sets", hint: "Calls booked that day and credited to them." },
  { field: "callsOnCalendar", label: "On calendar", measuredKey: "callsOnCalendar", hint: "Their booked calls that were due to happen that day." },
  { field: "callsShown", label: "Shown", measuredKey: "callsShown", hint: "Of those, the ones the prospect turned up to." },
];
const CONFIRMATION_COLUMNS: Column[] = [
  { field: "newSelfBooked", label: "New self-books", measuredKey: "newSelfBooked", hint: "People who booked themselves through the funnel that day." },
  { field: "contacted", label: "Contacted", measuredKey: "contacted", hint: "Of those, the ones they called or texted after the booking." },
  { field: "reached", label: "Reached", measuredKey: "reached", hint: "Of those, the ones who actually answered or replied." },
  { field: "confirmedOnCalendar", label: "Confirmed", measuredKey: "confirmedOnCalendar", hint: "Self-booked calls due that day that they had contacted." },
  { field: "confirmedShowed", label: "Shown", measuredKey: "confirmedShowed", hint: "Of those, the ones the prospect turned up to." },
];

const cell = "whitespace-nowrap py-1.5 pr-3 text-right align-top tabular-nums";

/** Calls that day with no answer yet — a filed "shown" may still be hiding in here. */
function unknownOf(d: Day, field: CheckField): number | null {
  if (field === "callsShown") return d.measured.callsUnknown;
  if (field === "confirmedShowed") return d.measured.confirmedUnknown;
  return null;
}

/** What each call length would have counted — shown on a day whose pick-ups don't match. */
function LadderLine({ ladder }: { ladder: NonNullable<Day["ladder"]> }) {
  return (
    <>
      Answered calls by how long they lasted — {ladder.thresholds.map((t, i) => `over ${t}s: ${int(ladder.counts[i])}`).join(" · ")}
    </>
  );
}

export function EodRows({
  rosterId,
  checks,
}: {
  rosterId: string;
  checks: CrossCheckData | null | undefined;
}) {
  const { user } = useUser();
  const setOffDay = useMutation(api.eodOffDays.setOffDayAsManager);
  const [busyDay, setBusyDay] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The mutation refuses days older than the setter form's own backfill
  // window, so don't offer a button that can only throw.
  const oldestMarkable = new Date(Date.now() - 14 * 86_400_000).toISOString().slice(0, 10);

  // A manager marking somebody else's day covers what the rep can't: a week
  // of holiday nobody is opening the app during, someone off sick, someone
  // who has already left. One day at a time, undoable by either side.
  async function markOff(dayKey: string, off: boolean) {
    if (!user) return;
    setBusyDay(dayKey);
    setError(null);
    try {
      await setOffDay({ clerkId: user.id, subjectKind: "setter", subjectId: rosterId, dayKey, off });
    } catch (e) {
      const data = (e as { data?: unknown })?.data;
      setError(typeof data === "string" && data ? data : "Could not save that.");
    } finally {
      setBusyDay(null);
    }
  }
  if (checks === undefined)
    return (
      <p className="py-6 text-sm text-muted-foreground">Reading their days…</p>
    );
  const me = checks?.byRoster.find((r) => r.rosterId === rosterId);
  if (!checks || !me)
    return (
      <p className="py-6 text-sm text-muted-foreground">Nothing to show.</p>
    );
  const confirmation = me.role === "confirmation";
  const columns = confirmation ? CONFIRMATION_COLUMNS : BOOKING_COLUMNS;
  const t = checks.tolerances;
  const flagOf = (d: Day, field: CheckField): CrossCheckFlag | undefined =>
    d.flags.find((f) => f.field === field);

  return (
    <div className="overflow-x-auto text-sm">
      <p className="mb-1 text-xs text-muted-foreground">
        The top line of each day is what {me.name} typed on their end-of-day
        form. The line under it is what the CRM and the calendar saw for the same
        day.
        {!confirmation &&
          !me.linked &&
          " No CRM user is linked to them, so dials and pick-ups can't be counted."}
      </p>
      <details className="mb-3 text-xs text-muted-foreground">
        <summary className="cursor-pointer select-none hover:text-foreground">
          How we count these
        </summary>
        <div className="mt-1 max-w-3xl space-y-1">
          <p>
            {confirmation
              ? "Self-books and calls come from the calendar. Contacted and reached come from their own calls and texts in the CRM."
              : "Dials and pick-ups come from their own calls in the CRM. Sets, calls on the calendar and shows come from the calendar."}
          </p>
          {!confirmation && me.linked && (
            <p>
              A pick-up is an answered call lasting at least {checks.connectSec}{" "}
              seconds. The CRM marks a call &quot;answered&quot; the moment the
              line picks up, voicemail included, so a day that doesn&apos;t
              match shows what each call length would have counted.
            </p>
          )}
          <p>
            A day is marked as not matching when the two numbers sit further
            apart than the team allows: {t.dialsPct}% on dials, {t.pickUpsPct}%
            on pick-ups, {t.confirmationPct}% on the confirmation numbers, never
            on a gap of {t.minGap} or less. Sets only count against them when
            they claim more than the calendar credits. You can change all of
            that in settings.
          </p>
        </div>
      </details>
      <table className="min-w-full">
        <thead>
          <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
            <th className="w-full py-2 pr-3 font-medium">Day</th>
            {columns.map((c) => (
              <th key={c.field} className="whitespace-nowrap py-2 pr-3 text-right font-medium" title={c.hint}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        {me.days.map((d) => {
          const off = d.filed ? d.flags.length : 0;
          return (
            <tbody
              key={d.dayKey}
              className="border-b border-border last:border-b-0"
            >
              <tr className={d.filed ? "" : "text-muted-foreground"}>
                <td className="whitespace-nowrap py-1.5 pr-3 align-top">
                  <span className="font-medium">{humanDay(d.dayKey)}</span>
                  {off > 0 && (
                    <span className="ml-2 rounded border border-border px-1 text-[11px] font-medium text-foreground">
                      {off === 1 ? "1 doesn't match" : `${off} don't match`}
                    </span>
                  )}
                  <span className="block text-[11px] text-muted-foreground">
                    {d.filed
                      ? "they said"
                      : d.status === "off"
                        ? `off${d.off?.by === "manager" ? ` · marked by ${d.off.byName ?? "a manager"}` : " · they said so"}${d.off?.note ? ` · ${d.off.note}` : ""}`
                        : d.status === "missing"
                          ? "no form filed"
                          : d.status === "unmeasured"
                            ? "no form filed — we couldn't measure this day"
                            : d.status === "no-activity"
                              ? "no activity, nothing owed"
                              : "no form due"}
                  </span>
                  {/* The mark is never blocked by what we measured — we report
                      what happened rather than ruling on it — but a day off
                      with real work behind it says so, right here. */}
                  {d.offContradicted && (
                    <span className="block text-[11px] text-amber-700">
                      marked off, but the CRM recorded {d.offEvidence}
                    </span>
                  )}
                  {!d.filed && d.status !== null && d.dayKey >= oldestMarkable && (
                    <button
                      type="button"
                      disabled={busyDay === d.dayKey}
                      onClick={() => void markOff(d.dayKey, d.status !== "off")}
                      className="mt-0.5 text-[11px] text-muted-foreground underline underline-offset-2 hover:text-foreground disabled:opacity-50"
                    >
                      {busyDay === d.dayKey ? "saving…" : d.status === "off" ? "undo" : "mark as a day off"}
                    </button>
                  )}
                  {error && <span className="block text-[11px] text-amber-700">{error}</span>}
                </td>
                {columns.map((c) => {
                  const v = d.filed?.[c.field];
                  return (
                    <td
                      key={c.field}
                      className={`${cell} ${flagOf(d, c.field) ? "font-semibold" : ""}`}
                    >
                      {v === undefined || v === null ? "—" : int(v)}
                    </td>
                  );
                })}
              </tr>
              <tr className="text-muted-foreground">
                <td className="whitespace-nowrap py-1.5 pr-3 align-top text-[11px]">
                  we saw
                </td>
                {columns.map((c) => {
                  const measured = d.measured[c.measuredKey];
                  const flag = flagOf(d, c.field);
                  const unknown = unknownOf(d, c.field);
                  return (
                    <td
                      key={c.field}
                      className={`${cell} ${flag ? "font-semibold text-foreground" : ""}`}
                    >
                      {measured === null ? "—" : int(measured)}
                      {unknown ? (
                        <span className="block text-[11px] font-normal text-muted-foreground">
                          {unknown} not known yet
                        </span>
                      ) : null}
                    </td>
                  );
                })}
              </tr>
              {d.ladder && d.flags.some((f) => f.field === "pickUps") && (
                <tr>
                  <td colSpan={columns.length + 1} className="pb-2 text-[11px] text-muted-foreground">
                    <LadderLine ladder={d.ladder} />
                  </td>
                </tr>
              )}
            </tbody>
          );
        })}
      </table>
    </div>
  );
}
