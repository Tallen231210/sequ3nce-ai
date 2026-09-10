"use client";

import { useQuery } from "convex/react";
import { Loader2 } from "lucide-react";
import { api } from "../../../../../convex/_generated/api";
import { humanDay, int } from "../lib/format";

/** One setter's days: what they filed beside what Close measured that day. */
export function EodRows({ clerkId, rosterId, rangeStart, rangeEnd }: { clerkId: string; rosterId: string; rangeStart: number; rangeEnd: number }) {
  const data = useQuery(api.settersPageQueries.getSetterDrawer, { clerkId, rosterId, rangeStart, rangeEnd });
  if (data === undefined) return <Loader2 className="my-6 h-4 w-4 animate-spin text-muted-foreground" />;
  if (data === null) return <p className="py-6 text-sm text-muted-foreground">Nothing to show.</p>;
  const confirmation = data.role === "confirmation";
  const cell = (filed: number | undefined | null, measured: number | null | undefined) => {
    const f = filed === undefined || filed === null ? "—" : int(filed);
    if (measured === null || measured === undefined) return f;
    const drift = filed !== undefined && filed !== null && filed !== measured;
    return (
      <span>
        {f} <span className={`text-[11px] ${drift ? "font-medium text-amber-700" : "text-muted-foreground"}`}>/ {int(measured)}</span>
      </span>
    );
  };
  return (
    <div className="overflow-x-auto text-sm">
      <p className="mb-2 text-xs text-muted-foreground">
        Filed / measured. {data.linked ? "Dials and connects (answered calls over the team's threshold) are counted from Close for the same day." : "No Close user linked, so nothing is measured."}
        {data.truncated.length > 0 ? " Partial read." : ""}
      </p>
      <table className="w-full tabular-nums">
        <thead>
          <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
            <th className="py-2 pr-3 font-medium">Day</th>
            {confirmation ? (
              <>
                <th className="py-2 pr-3 text-right font-medium">New self-books</th>
                <th className="py-2 pr-3 text-right font-medium">Contacted</th>
                <th className="py-2 pr-3 text-right font-medium">Reached</th>
                <th className="py-2 pr-3 text-right font-medium">Confirmed</th>
                <th className="py-2 pr-3 text-right font-medium">Showed</th>
              </>
            ) : (
              <>
                <th className="py-2 pr-3 text-right font-medium">Dials</th>
                <th className="py-2 pr-3 text-right font-medium">Pick ups / connects</th>
                <th className="py-2 pr-3 text-right font-medium">Sets</th>
                <th className="py-2 pr-3 text-right font-medium">On calendar</th>
                <th className="py-2 pr-3 text-right font-medium">Shown</th>
                <th className="py-2 pr-3 text-right font-medium">Closed</th>
              </>
            )}
            <th className="py-2 text-right font-medium">Texts</th>
          </tr>
        </thead>
        <tbody>
          {data.rows.map((r) => (
            <tr key={r.dayKey} className={`border-b border-border last:border-b-0 ${r.filed ? "" : "text-muted-foreground"}`}>
              <td className="py-1.5 pr-3">
                {humanDay(r.dayKey)}
                {!r.filed && <span className="ml-1 text-[11px]">not filed</span>}
              </td>
              {confirmation ? (
                <>
                  <td className="py-1.5 pr-3 text-right">{int(r.filed?.newSelfBooked ?? null)}</td>
                  <td className="py-1.5 pr-3 text-right">{int(r.filed?.contacted ?? null)}</td>
                  <td className="py-1.5 pr-3 text-right">{int(r.filed?.reached ?? null)}</td>
                  <td className="py-1.5 pr-3 text-right">{int(r.filed?.confirmed ?? null)}</td>
                  <td className="py-1.5 pr-3 text-right">{int(r.filed?.confirmedShowed ?? null)}</td>
                </>
              ) : (
                <>
                  <td className="py-1.5 pr-3 text-right">{cell(r.filed?.dials, r.measured?.dials)}</td>
                  <td className="py-1.5 pr-3 text-right">{cell(r.filed?.pickUps, r.measured?.answered)}</td>
                  <td className="py-1.5 pr-3 text-right">{int(r.filed?.sets ?? null)}</td>
                  <td className="py-1.5 pr-3 text-right">{int(r.filed?.callsOnCalendar ?? null)}</td>
                  <td className="py-1.5 pr-3 text-right">{int(r.filed?.callsShown ?? null)}</td>
                  <td className="py-1.5 pr-3 text-right">{int(r.filed?.callsClosed ?? null)}</td>
                </>
              )}
              <td className="py-1.5 text-right">{r.measured ? int(r.measured.texts) : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
