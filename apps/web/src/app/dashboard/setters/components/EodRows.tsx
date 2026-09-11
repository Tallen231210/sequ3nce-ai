"use client";

import type { CheckField, CrossCheckFlag } from "../../../../../convex/lib/eodCrossCheck";
import type { CrossCheckData, RosterCheck } from "../lib/cards";
import { humanDay, int } from "../lib/format";

// ============================================================================
// One setter's days: what they typed on their end-of-day form on one row, what
// Close and the calendar saw on the next. Two rows beat a slash — nobody has
// to remember which side of "180 / 176" is which.
// ============================================================================

type Day = RosterCheck["days"][number];
type Column = {
  field: CheckField;
  label: string;
  measuredKey: keyof Day["measured"];
};

const BOOKING_COLUMNS: Column[] = [
  { field: "dials", label: "Dials", measuredKey: "dials" },
  { field: "pickUps", label: "Pick-ups", measuredKey: "pickUps" },
  { field: "sets", label: "Sets", measuredKey: "sets" },
  {
    field: "callsOnCalendar",
    label: "On calendar",
    measuredKey: "callsOnCalendar",
  },
  { field: "callsShown", label: "Shown", measuredKey: "callsShown" },
];
const CONFIRMATION_COLUMNS: Column[] = [
  {
    field: "newSelfBooked",
    label: "New self-books",
    measuredKey: "newSelfBooked",
  },
  { field: "contacted", label: "Contacted", measuredKey: "contacted" },
  { field: "reached", label: "Reached", measuredKey: "reached" },
  {
    field: "confirmedOnCalendar",
    label: "Confirmed",
    measuredKey: "confirmedOnCalendar",
  },
  { field: "confirmedShowed", label: "Shown", measuredKey: "confirmedShowed" },
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
        form. The line under it is what Close and the calendar saw for the same
        day.
        {!confirmation &&
          !me.linked &&
          " No Close user is linked to them, so dials and pick-ups can't be counted."}
      </p>
      <details className="mb-3 text-xs text-muted-foreground">
        <summary className="cursor-pointer select-none hover:text-foreground">
          How we count these
        </summary>
        <div className="mt-1 max-w-3xl space-y-1">
          <p>
            {confirmation
              ? "Self-books and calls come from the calendar. Contacted and reached come from their own calls and texts in Close."
              : "Dials and pick-ups come from their own calls in Close. Sets, calls on the calendar and shows come from the calendar."}
          </p>
          {!confirmation && me.linked && (
            <p>
              A pick-up is an answered call lasting at least {checks.connectSec}{" "}
              seconds. Close marks a call &quot;answered&quot; the moment the
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
              <th key={c.field} className="whitespace-nowrap py-2 pr-3 text-right font-medium">
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
                      : d.due
                        ? "no form filed"
                        : "no form due"}
                  </span>
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
