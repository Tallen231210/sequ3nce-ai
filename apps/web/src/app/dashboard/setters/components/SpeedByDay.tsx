"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { Loader2 } from "lucide-react";
import { api } from "../../../../../convex/_generated/api";
import { hours, humanDay, int } from "../lib/format";

/** One setter's leads by the day they arrived, with the working-hours wait to the first touch. */
export function SpeedByDay({ clerkId, rosterId, rangeStart, rangeEnd, timezone }: { clerkId: string; rosterId: string; rangeStart: number; rangeEnd: number; timezone: string }) {
  const [slowestFirst, setSlowestFirst] = useState(false);
  const data = useQuery(api.settersPageQueries.getSpeedByDay, { clerkId, rosterId, rangeStart, rangeEnd, slowestFirst });
  const time = new Intl.DateTimeFormat("en-US", { timeZone: timezone, weekday: "short", hour: "numeric", minute: "2-digit" });
  if (data === undefined) return <Loader2 className="my-6 h-4 w-4 animate-spin text-muted-foreground" />;
  if (data === null) return <p className="py-6 text-sm text-muted-foreground">Nothing to show.</p>;
  const s = data.summary;
  const excluded: string[] = [];
  if (s.noArrivalCount) excluded.push(`${s.noArrivalCount} with no arrival time (Close created the lead from the dial)`);
  if (s.neverContactedCount) excluded.push(`${s.neverContactedCount} never contacted`);
  if (s.untimedCount) excluded.push(`${s.untimedCount} contacted, no Close time (credited by the calendar tag)`);
  if (s.selfBookedCount) excluded.push(`${s.selfBookedCount} booked themselves (the confirmation team's)`);
  if (s.clippedCount || s.unreadCount) excluded.push(`${s.clippedCount + s.unreadCount} not read (too much activity for one look)`);
  return (
    <div className="space-y-4 text-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <span className="text-2xl font-semibold tabular-nums">{hours(s.medianWorkingMs)}</span>
          <span className="ml-2 text-muted-foreground">median in working hours · {hours(s.medianElapsedMs)} including nights &amp; weekends · slowest 10% over {hours(s.p90WorkingMs)} · {int(s.count)} leads timed</span>
          <div className="text-xs text-muted-foreground">Working hours {data.basis}. {data.kind === "confirmation" ? "Clock starts at the self-booking." : "Clock starts when the lead lands in Close."}</div>
        </div>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input type="checkbox" checked={slowestFirst} onChange={(e) => setSlowestFirst(e.target.checked)} />
          slowest first
        </label>
      </div>
      {excluded.length > 0 && <p className="text-xs text-muted-foreground">Not in the median: {excluded.join(" · ")}.</p>}
      {data.truncated.length > 0 && <p className="text-xs text-amber-700">Partial: {data.truncated.join(", ")}.</p>}
      {data.days.length === 0 && <p className="py-4 text-muted-foreground">No leads in this range.</p>}
      {data.days.map((day) => (
        <div key={day.dayKey}>
          <div className="flex items-baseline justify-between border-b border-border pb-1">
            <span className="font-medium">{humanDay(day.dayKey)}</span>
            <span className="text-xs text-muted-foreground">
              median {hours(day.medianWorkingMs)} · {day.count} timed{day.leads.length > day.count ? ` · ${day.leads.length - day.count} not timed` : ""}
            </span>
          </div>
          <ul className="divide-y divide-border">
            {day.leads.map((l) => (
              <li key={l.leadId} className="flex flex-wrap items-baseline justify-between gap-2 py-1.5">
                <span className="truncate">{l.leadName}</span>
                <span className="text-xs text-muted-foreground">
                  arrived {time.format(l.arrivedAt)}
                  {l.firstTouchAt ? ` → ${l.byName ?? "setter"} ${time.format(l.firstTouchAt)}` : ""}
                  {l.note ? ` · ${l.note}` : ""}
                  {l.dials > 0 ? ` · ${l.dials} dial${l.dials === 1 ? "" : "s"}` : ""}
                </span>
                <span className={`w-14 text-right tabular-nums ${l.workingMs === null ? "text-muted-foreground" : "font-medium"}`}>{hours(l.workingMs)}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
