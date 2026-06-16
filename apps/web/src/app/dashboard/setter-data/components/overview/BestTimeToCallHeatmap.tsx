"use client";

import { useQuery } from "convex/react";
import { api } from "../../../../../../convex/_generated/api";
import { useTeam } from "@/hooks/useTeam";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { InsightCard } from "./InsightCard";

interface BestTimeToCallHeatmapProps {
  rangeStart: number;
  rangeEnd: number;
}

interface HeatmapCell {
  dialCount: number;
  connectedCount: number;
  rate: number | null;
}

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const HOUR_TICKS = [0, 3, 6, 9, 12, 15, 18, 21];

/**
 * Team-wide 7×24 heatmap. Pure CSS grid (not recharts) — fixed-grid
 * heatmaps render cleaner this way per the WorkingHoursHeatmap pattern.
 * Cell color: green-to-red driven by connect rate. Cell opacity: scaled
 * by dial volume so low-traffic cells fade out. Cells with fewer than
 * 5 dials show count-only (no rate) to avoid noisy small-sample %s.
 */
export function BestTimeToCallHeatmap({
  rangeStart,
  rangeEnd,
}: BestTimeToCallHeatmapProps) {
  const { clerkId } = useTeam();
  const data = useQuery(
    api.setterData.getBestTimeToCallHeatmap,
    clerkId ? { clerkId, rangeStart, rangeEnd } : "skip",
  );

  if (data === undefined) {
    return (
      <Card>
        <CardContent className="flex h-56 items-center justify-center px-4 py-5">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (data === null || data.totalDials === 0) {
    return (
      <Card>
        <CardContent className="px-4 py-5">
          <div className="mb-2">
            <h3 className="text-sm font-semibold">Best time to call</h3>
          </div>
          <div className="rounded-md bg-muted/30 px-4 py-8 text-center text-sm text-muted-foreground">
            No dial activity in this range yet.
          </div>
        </CardContent>
      </Card>
    );
  }

  // Compute max volume across all populated cells for the opacity scale.
  let maxDials = 0;
  for (const row of data.grid as HeatmapCell[][]) {
    for (const cell of row) {
      if (cell.dialCount > maxDials) maxDials = cell.dialCount;
    }
  }

  return (
    <Card>
      <CardContent className="px-4 py-5">
        <div className="mb-4 flex items-baseline justify-between gap-4">
          <div>
            <h3 className="text-sm font-semibold">Best time to call</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Connect rate by hour and day. Greener cells connect more
              often. Faint cells have low volume — empty cells had no dials.
            </p>
          </div>
          <div className="shrink-0 text-right text-xs text-muted-foreground">
            <div>
              <span className="font-medium text-foreground">
                {data.totalDials}
              </span>{" "}
              dials ·{" "}
              <span className="font-medium text-foreground">
                {data.totalConnects}
              </span>{" "}
              connects
            </div>
            <div>
              Times in <span className="text-foreground">{data.timezone}</span>
              {data.rangeClampedTo30Days && " (last 30d)"}
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <div className="min-w-[640px]">
            {/* Hour header row */}
            <div className="ml-10 grid grid-cols-[repeat(24,minmax(0,1fr))] gap-px text-[10px] text-muted-foreground">
              {Array.from({ length: 24 }).map((_, h) => (
                <div key={h} className="text-center">
                  {HOUR_TICKS.includes(h) ? String(h).padStart(2, "0") : ""}
                </div>
              ))}
            </div>

            {/* Day rows */}
            {DAY_LABELS.map((label, dow) => (
              <div key={label} className="mt-px flex items-center">
                <div className="w-10 text-right pr-2 text-xs text-muted-foreground">
                  {label}
                </div>
                <div className="grid flex-1 grid-cols-[repeat(24,minmax(0,1fr))] gap-px">
                  {(data.grid as HeatmapCell[][])[dow].map((cell, hour) => (
                    <Cell
                      key={hour}
                      cell={cell}
                      maxDials={maxDials}
                      day={label}
                      hour={hour}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {data.sampleCapHit && (
          <div className="mt-3 rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
            High volume team — only the most recent dial events fit. Numbers
            here may be conservative.
          </div>
        )}

        <InsightCard insight={data.insight} />
      </CardContent>
    </Card>
  );
}

function Cell({
  cell,
  maxDials,
  day,
  hour,
}: {
  cell: HeatmapCell;
  maxDials: number;
  day: string;
  hour: number;
}) {
  if (cell.dialCount === 0) {
    return (
      <div
        className="aspect-square rounded-sm bg-muted/30"
        title={`${day} ${hour}:00 — no dials`}
      />
    );
  }

  const opacity = Math.max(0.18, cell.dialCount / maxDials);
  const tooltip =
    cell.rate !== null
      ? `${day} ${hour}:00 — ${cell.dialCount} dials, ${Math.round(cell.rate * 100)}% connect rate`
      : `${day} ${hour}:00 — ${cell.dialCount} dials (need ≥5 for a rate)`;

  // Color: rate-null cells (low sample) use a neutral gray. Otherwise
  // green→red interpolation by rate.
  let bgColor: string;
  if (cell.rate === null) {
    bgColor = `hsl(220 8% 60% / ${opacity})`;
  } else {
    // High rate → green (142), low rate → red (0). Scale by rate in [0, 0.4]
    // since connect rates of 40%+ are exceptional in this space.
    const t = Math.min(1, cell.rate / 0.4);
    const hue = Math.round(0 + t * 142);
    bgColor = `hsl(${hue} 70% 45% / ${opacity})`;
  }

  return (
    <div
      className="aspect-square rounded-sm"
      style={{ backgroundColor: bgColor }}
      title={tooltip}
    />
  );
}
