"use client";

import { useQuery } from "convex/react";
import { Loader2 } from "lucide-react";
import { api } from "../../../../../convex/_generated/api";
import { flagPair, type CheckField, type CrossCheckFlag } from "../../../../../convex/lib/eodCrossCheck";
import type { RosterCheck } from "../lib/cards";
import { humanDay, int } from "../lib/format";

type Day = RosterCheck["days"][number];

const BOOKING_COLUMNS: Array<{ field: CheckField; label: string; measuredKey: keyof Day["measured"] }> = [
  { field: "dials", label: "Dials", measuredKey: "dials" },
  { field: "pickUps", label: "Pick-ups / connects", measuredKey: "pickUps" },
  { field: "sets", label: "Sets", measuredKey: "sets" },
  { field: "callsOnCalendar", label: "On calendar", measuredKey: "callsOnCalendar" },
  { field: "callsShown", label: "Shown", measuredKey: "callsShown" },
];
const CONFIRMATION_COLUMNS: Array<{ field: CheckField; label: string; measuredKey: keyof Day["measured"] }> = [
  { field: "newSelfBooked", label: "New self-books", measuredKey: "newSelfBooked" },
  { field: "contacted", label: "Contacted", measuredKey: "contacted" },
  { field: "reached", label: "Reached", measuredKey: "reached" },
  { field: "confirmedOnCalendar", label: "Confirmed on cal", measuredKey: "confirmedOnCalendar" },
  { field: "confirmedShowed", label: "Confirmed showed", measuredKey: "confirmedShowed" },
];

function Cell({ filed, measured, flag, unknown }: { filed: number | null | undefined; measured: number | null; flag: CrossCheckFlag | undefined; unknown?: number | null }) {
  const f = filed === undefined || filed === null ? "—" : int(filed);
  if (measured === null) return <span>{f}</span>;
  return (
    <span className="inline-flex flex-col items-end leading-tight">
      <span>
        {f} <span className={`text-[11px] ${flag ? "font-medium text-amber-700" : "text-muted-foreground"}`}>/ {int(measured)}{unknown ? <span title="Credited calls with no show verdict yet"> +{unknown}?</span> : null}</span>
      </span>
      {flag && (
        <span className="rounded bg-amber-50 px-1 text-[10px] font-medium text-amber-800" title={`${flag.label}: ${flagPair(flag)}`}>
          {flagPair(flag)} {flag.gapPct === null ? `(${flag.gap > 0 ? "+" : "−"}${Math.abs(flag.gap)})` : `(${flag.gapPct > 0 ? "+" : "−"}${Math.abs(flag.gapPct)}%)`}
        </span>
      )}
    </span>
  );
}

/** One setter's days: what they filed beside what Close and the calendar measured, flags with both numbers where they disagree. */
export function EodRows({ clerkId, rosterId, rangeStart, rangeEnd }: { clerkId: string; rosterId: string; rangeStart: number; rangeEnd: number }) {
  const data = useQuery(api.setterEodCrossCheck.getSettersCrossCheck, { clerkId, rangeStart, rangeEnd });
  if (data === undefined) return <Loader2 className="my-6 h-4 w-4 animate-spin text-muted-foreground" />;
  const me = data?.byRoster.find((r) => r.rosterId === rosterId);
  if (!data || !me) return <p className="py-6 text-sm text-muted-foreground">Nothing to show.</p>;
  const columns = me.role === "confirmation" ? CONFIRMATION_COLUMNS : BOOKING_COLUMNS;
  const t = data.tolerances;
  return (
    <div className="overflow-x-auto text-sm">
      <p className="mb-2 text-xs text-muted-foreground">
        Filed / measured. {me.linked ? "Dials and connects come from Close for the same day; sets, calls on the calendar and shows from the calendar." : "No Close user linked, so only the calendar is measured."}{" "}
        Flagged when off by more than {t.dialsPct}% (dials), {t.pickUpsPct}% (pick-ups) or {t.confirmationPct}% (confirmation) of the measured number, floor {t.minGap} — tolerances in settings.
        {data.truncated.length > 0 ? ` Partial read (${data.truncated.join(", ")}).` : ""}
      </p>
      <table className="w-full tabular-nums">
        <thead>
          <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
            <th className="py-2 pr-3 font-medium">Day</th>
            {columns.map((c) => (
              <th key={c.field} className="py-2 pr-3 text-right font-medium">{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {me.days.map((d) => (
            <tr key={d.dayKey} className={`border-b border-border last:border-b-0 ${d.filed ? "" : "text-muted-foreground"}`}>
              <td className="py-1.5 pr-3 align-top">
                {humanDay(d.dayKey)}
                {!d.filed && <span className="ml-1 text-[11px]">{d.due ? "not filed" : "not due"}</span>}
                {d.filed && d.flags.length > 0 && <span className="ml-1 text-[11px] font-medium text-amber-700">{d.flags.length} off</span>}
              </td>
              {columns.map((c) => (
                <td key={c.field} className="py-1.5 pr-3 text-right align-top">
                  <Cell
                    filed={d.filed?.[c.field]}
                    measured={d.measured[c.measuredKey]}
                    flag={d.flags.find((f) => f.field === c.field)}
                    unknown={c.field === "callsShown" ? d.measured.callsUnknown : c.field === "confirmedShowed" ? d.measured.confirmedUnknown : null}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
