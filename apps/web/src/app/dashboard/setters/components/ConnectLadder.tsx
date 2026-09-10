"use client";

// Filed pick-ups beside answered calls in Close at each call length, per
// setter, over the days they filed in the page's range — so a manager can
// see what each connect threshold would count before moving it.

import type { CrossCheckData } from "../lib/cards";
import { humanDay, int } from "../lib/format";

export function ConnectLadder({ checks }: { checks: CrossCheckData | null | undefined }) {
  if (!checks) return null;
  const thresholds = checks.ladderThresholds;
  const rows = checks.byRoster
    .filter((r) => r.role === "booking" && r.linked)
    .map((r) => {
      const filedDays = r.days.filter((d) => d.filed !== null && d.ladder);
      const counts = thresholds.map((_, i) => filedDays.reduce((n, d) => n + (d.ladder?.counts[i] ?? 0), 0));
      const filed = filedDays.reduce((n, d) => n + (d.filed?.pickUps ?? 0), 0);
      return { rosterId: r.rosterId, name: r.name, days: filedDays.length, filed, counts };
    })
    .filter((r) => r.days > 0);
  if (rows.length === 0) return null;
  const th = "py-2 pr-3 text-right font-medium";
  return (
    <div className="mb-4">
      <p className="mb-2 text-xs text-muted-foreground">
        What each threshold would count, beside what the setters filed, over the days they filed between {humanDay(checks.startKey)} and {humanDay(checks.endKey)} (the range on the page).
        Each step is answered calls in Close from that setter lasting at least that many seconds. The bold step is the threshold in use — the number on the cards and in the flags.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm tabular-nums">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="py-2 pr-3 font-medium">Setter</th>
              <th className={th} title="Days with an EOD in the range">Days</th>
              <th className={th} title="Pick-ups they typed on those EODs, added up">Filed pick-ups</th>
              {thresholds.map((t) => (
                <th key={t} className={`${th} ${t === checks.connectSec ? "text-foreground" : ""}`} title={`Answered calls in Close lasting ${t} seconds or more, on those same days`}>
                  {t}s+{t === checks.connectSec ? " (in use)" : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.rosterId} className="border-b border-border last:border-b-0">
                <td className="py-1.5 pr-3">{r.name}</td>
                <td className="py-1.5 pr-3 text-right">{r.days}</td>
                <td className="py-1.5 pr-3 text-right font-medium">{int(r.filed)}</td>
                {thresholds.map((t, i) => (
                  <td key={t} className={`py-1.5 pr-3 text-right ${t === checks.connectSec ? "font-semibold" : "text-muted-foreground"}`}>
                    {int(r.counts[i])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
