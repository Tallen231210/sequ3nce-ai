"use client";

import { useQuery } from "convex/react";
import { Loader2 } from "lucide-react";
import { api } from "../../../../../convex/_generated/api";
import { int, pct } from "../lib/format";

/** One outbound setter's leads by how many times they dialled them in the range. */
export function CadenceRows({ clerkId, rosterId, rangeStart, rangeEnd, timezone }: { clerkId: string; rosterId: string; rangeStart: number; rangeEnd: number; timezone: string }) {
  const data = useQuery(api.settersPageQueries.getCadenceRows, { clerkId, rosterId, rangeStart, rangeEnd });
  const when = new Intl.DateTimeFormat("en-US", { timeZone: timezone, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  if (data === undefined) return <Loader2 className="my-6 h-4 w-4 animate-spin text-muted-foreground" />;
  if (data === null) return <p className="py-6 text-sm text-muted-foreground">Nobody has linked them to a CRM user, so their dials can't be counted. You can link them under Settings → Roster.</p>;
  const s = data.summary;
  return (
    <div className="space-y-3 text-sm">
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-muted-foreground">
        <span><b className="text-foreground">{s.dialsPerLead ?? "—"}</b> dials per lead</span>
        <span><b className="text-foreground">{pct(s.threePlusPct)}</b> of leads got 3+ attempts</span>
        <span><b className="text-foreground">{s.medianPursuitDays ?? "—"}</b> days pursued (median)</span>
        <span><b className="text-foreground">{int(s.leadsAnswered)}</b> of {int(s.leadsDialled)} leads answered</span>
      </div>
      {s.truncated && <p className="text-xs text-muted-foreground">They made more dials than we can read in one go, so these are the most recent.</p>}
      {data.listed < s.leadsDialled && <p className="text-xs text-muted-foreground">Showing the {data.listed} most-dialled of {s.leadsDialled} leads.</p>}
      <table className="w-full tabular-nums">
        <thead>
          <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
            <th className="py-2 pr-3 font-medium">Lead</th>
            <th className="py-2 pr-3 text-right font-medium">Dials</th>
            <th className="py-2 pr-3 text-right font-medium">Answered</th>
            <th className="py-2 pr-3 text-right font-medium">First</th>
            <th className="py-2 text-right font-medium">Last</th>
          </tr>
        </thead>
        <tbody>
          {data.leads.map((l) => (
            <tr key={l.leadId} className="border-b border-border last:border-b-0">
              <td className="py-1.5 pr-3">{l.leadName}</td>
              <td className="py-1.5 pr-3 text-right">{l.attempts}</td>
              <td className="py-1.5 pr-3 text-right">{l.answered}</td>
              <td className="py-1.5 pr-3 text-right text-muted-foreground">{when.format(l.firstAt)}</td>
              <td className="py-1.5 text-right text-muted-foreground">{l.attempts > 1 ? when.format(l.lastAt) : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
