"use client";

import { useQuery } from "convex/react";
import { api } from "../../../../../../convex/_generated/api";
import { useTeam } from "@/hooks/useTeam";
import { Card, CardContent } from "@/components/ui/card";
import { InsightCard } from "./InsightCard";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Loader2 } from "lucide-react";

interface LeadAgeDecayCurveProps {
  rangeStart: number;
  rangeEnd: number;
}

/**
 * Lead-age decay curve: connect rate by speed-to-lead bucket. Gives
 * managers the receipts behind speed-to-lead pings — "leads dialed in
 * under 5 minutes connect at 28%, after 1 hour at 6%."
 *
 * Bars colored green→red along the bucket axis (fast = good). Median
 * line as a callout below the chart instead of a recharts reference
 * line, which gets visually noisy on a categorical axis.
 */
export function LeadAgeDecayCurve({
  rangeStart,
  rangeEnd,
}: LeadAgeDecayCurveProps) {
  const { clerkId } = useTeam();
  const data = useQuery(
    api.setterData.getLeadAgeDecayCurve,
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

  if (data === null || data.totalLeads === 0) {
    return (
      <Card>
        <CardContent className="px-4 py-5">
          <div className="mb-2">
            <h3 className="text-sm font-semibold">Lead-age decay</h3>
          </div>
          <div className="rounded-md bg-muted/30 px-4 py-8 text-center text-sm text-muted-foreground">
            Not enough dial history in this range to plot a decay curve.
          </div>
        </CardContent>
      </Card>
    );
  }

  const chartData = data.buckets.map((b, idx) => ({
    label: b.label,
    rate: Math.round(b.rate * 1000) / 10, // 0.2727 → 27.3
    leadCount: b.leadCount,
    connectedCount: b.connectedCount,
    fill: bucketColor(idx, data.buckets.length),
  }));

  const median = data.medianSpeedMs
    ? formatDuration(data.medianSpeedMs)
    : null;
  const p90 = data.p90SpeedMs ? formatDuration(data.p90SpeedMs) : null;

  return (
    <Card>
      <CardContent className="px-4 py-5">
        <div className="mb-4 flex items-baseline justify-between gap-4">
          <div>
            <h3 className="text-sm font-semibold">Lead-age decay</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Connect rate by how fast the lead was dialed. Faster usually
              wins — the bars show whether that&apos;s true for your team.
            </p>
          </div>
          <div className="shrink-0 text-right text-xs text-muted-foreground">
            <div>
              Median <span className="font-medium text-foreground">{median ?? "—"}</span>
            </div>
            <div>
              p90 <span className="font-medium text-foreground">{p90 ?? "—"}</span>
            </div>
            <div>
              {data.totalLeads} leads
              {data.rangeClampedTo90Days && " (last 90d)"}
            </div>
          </div>
        </div>
        <div className="h-56 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              margin={{ top: 8, right: 12, bottom: 8, left: 0 }}
            >
              <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
              <XAxis
                dataKey="label"
                stroke="hsl(var(--muted-foreground))"
                fontSize={11}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                stroke="hsl(var(--muted-foreground))"
                fontSize={11}
                tickFormatter={(v) => `${v}%`}
                width={36}
                tickLine={false}
                axisLine={false}
                domain={[0, "dataMax + 5"]}
              />
              <Tooltip
                cursor={{ fill: "hsl(var(--muted) / 0.4)" }}
                content={({ active, payload }) => {
                  if (!active || !payload || payload.length === 0) return null;
                  const row = payload[0].payload as {
                    label: string;
                    rate: number;
                    leadCount: number;
                    connectedCount: number;
                  };
                  return (
                    <div className="rounded-md border border-border bg-background px-3 py-2 text-xs shadow-md">
                      <div className="font-medium">{row.label}</div>
                      <div className="mt-1 text-muted-foreground">
                        {row.connectedCount} of {row.leadCount} connected ·{" "}
                        <span className="font-medium text-foreground">
                          {row.rate}%
                        </span>
                      </div>
                    </div>
                  );
                }}
              />
              <Bar dataKey="rate" radius={[4, 4, 0, 0]}>
                {chartData.map((row, idx) => (
                  <Cell key={idx} fill={row.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <InsightCard insight={data.insight} />
      </CardContent>
    </Card>
  );
}

// Green → red gradient across the bucket index. Uses HSL so we don't have
// to hand-tune 8 stops — interpolate hue from 142 (emerald) down to 0
// (red) and let the bar count dictate the step.
function bucketColor(idx: number, total: number): string {
  const t = total <= 1 ? 0 : idx / (total - 1);
  const hue = Math.round(142 - 142 * t);
  return `hsl(${hue} 70% 45%)`;
}

function formatDuration(ms: number): string {
  const totalSec = Math.round(ms / 1000);
  if (totalSec < 60) return `${totalSec}s`;
  const totalMin = Math.floor(totalSec / 60);
  if (totalMin < 60) {
    const sec = totalSec % 60;
    return sec === 0 ? `${totalMin}m` : `${totalMin}m ${sec}s`;
  }
  const totalHours = Math.floor(totalMin / 60);
  if (totalHours < 24) {
    const min = totalMin % 60;
    return min === 0 ? `${totalHours}h` : `${totalHours}h ${min}m`;
  }
  const days = Math.floor(totalHours / 24);
  const hrs = totalHours % 24;
  return hrs === 0 ? `${days}d` : `${days}d ${hrs}h`;
}
