"use client";

import { useQuery } from "convex/react";
import { api } from "../../../../../../convex/_generated/api";
import { useTeam } from "@/hooks/useTeam";
import { Card, CardContent } from "@/components/ui/card";
import { AlertTriangle, Loader2 } from "lucide-react";
import { InsightCard } from "./InsightCard";

/**
 * Yesterday's worst lead-coverage windows in team timezone. Surfaces
 * operational gaps managers cannot detect by scrolling through leads —
 * "Friday 6pm-9pm: 14 leads, median time-to-first-dial 11h 30m." Empty
 * state when no gaps: "All clear yesterday."
 *
 * Pairs with the daily Slack/Discord digest configured in Settings — the
 * panel surfaces the same data even when the team isn't paging on it.
 */
export function CoverageGapPanel() {
  const { clerkId } = useTeam();
  const data = useQuery(
    api.setterData.getCoverageGapDigest,
    clerkId ? { clerkId } : "skip",
  );

  if (data === undefined) {
    return (
      <Card>
        <CardContent className="flex h-32 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (data === null) {
    return null;
  }

  const hasGaps = data.windows.length > 0;

  return (
    <Card>
      <CardContent className="px-4 py-5">
        <div className="mb-4 flex items-baseline justify-between gap-4">
          <div>
            <h3 className="text-sm font-semibold">
              Yesterday&apos;s coverage gaps
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Hour windows where leads arrived but waited unusually long for
              their first dial — your operational thin spots.
            </p>
          </div>
          <div className="shrink-0 text-right text-xs text-muted-foreground">
            <div>
              {data.totalLeadsInDay} leads · {data.date}
            </div>
            <div>{data.timezone}</div>
          </div>
        </div>

        {!hasGaps ? (
          <div className="rounded-md bg-emerald-500/10 px-4 py-6 text-center text-sm text-emerald-700 dark:text-emerald-400">
            No significant coverage gaps yesterday. Nice work.
          </div>
        ) : (
          <ul className="space-y-2">
            {data.windows.map((w, i) => (
              <li
                key={i}
                className="flex items-center gap-3 rounded-md border border-border bg-card px-3 py-2.5 text-sm"
              >
                <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-500" />
                <div className="flex-1">
                  <div className="font-medium">
                    {w.dayLabel} {formatHour(w.startHour)}–
                    {formatHour(w.endHour)}
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {w.leadCount}{" "}
                    {w.leadCount === 1 ? "lead arrived" : "leads arrived"}
                    {w.neverDialedCount > 0 &&
                      ` · ${w.neverDialedCount} never dialed`}
                    {w.medianTimeToFirstDialMs !== null && (
                      <>
                        {" "}
                        · median time-to-dial{" "}
                        <span className="font-medium text-foreground">
                          {formatDuration(w.medianTimeToFirstDialMs)}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}

        {data.baselineMedianMs !== null && (
          <div className="mt-3 text-[10px] text-muted-foreground">
            Baseline (30-day median): {formatDuration(data.baselineMedianMs)}.
            Gaps flagged when a window&apos;s median is 3× the baseline (or
            ≥60 min minimum).
          </div>
        )}

        <InsightCard insight={data.insight} />
      </CardContent>
    </Card>
  );
}

function formatHour(h: number): string {
  if (h === 0) return "12am";
  if (h === 12) return "12pm";
  if (h < 12) return `${h}am`;
  return `${h - 12}pm`;
}

function formatDuration(ms: number): string {
  const totalSec = Math.round(ms / 1000);
  if (totalSec < 60) return `${totalSec}s`;
  const totalMin = Math.floor(totalSec / 60);
  if (totalMin < 60) return `${totalMin}m`;
  const hours = Math.floor(totalMin / 60);
  const min = totalMin % 60;
  if (hours < 24) {
    return min === 0 ? `${hours}h` : `${hours}h ${min}m`;
  }
  const days = Math.floor(hours / 24);
  const hr = hours % 24;
  return hr === 0 ? `${days}d` : `${days}d ${hr}h`;
}
