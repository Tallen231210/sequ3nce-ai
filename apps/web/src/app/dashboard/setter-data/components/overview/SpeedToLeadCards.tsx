"use client";

// ============================================================================
// Speed to lead, on both clocks, from the funnel definition.
//
// Replaces a single "Speed to lead (avg)" card that was wrong twice over: it
// averaged (so one lead answered three days late buried a good team), and it
// counted any outreach as a response — including the automated text that goes
// out five seconds after a lead arrives.
//
// On RemoteStack the old card reads 12.2 hours. The same dials, counting only
// what a person did and only while people are working, read 8 minutes — the
// number their manager already believed. Both are shown, because they answer
// different questions: one is how the team performed, the other is what the
// prospect experienced.
//
// The rule in force is printed underneath. A speed figure with no stated basis
// is a number to argue with rather than act on.
// ============================================================================

import { useState } from "react";
import { useQuery } from "convex/react";
import { useUser } from "@clerk/nextjs";
import { Clock, Moon } from "lucide-react";
import { api } from "../../../../../../convex/_generated/api";
import { MetricDrill } from "../MetricDrill";

/* eslint-disable @typescript-eslint/no-explicit-any */

function duration(ms: number | null): string {
  if (ms === null) return "—";
  const mins = ms / 60000;
  if (mins < 1) return `${Math.round(ms / 1000)}s`;
  if (mins < 90) return `${Math.round(mins)} min`;
  const hrs = mins / 60;
  if (hrs < 48) return `${hrs.toFixed(1)} hrs`;
  return `${(hrs / 24).toFixed(1)} days`;
}

export function SpeedToLeadCards({
  rangeStart,
  rangeEnd,
}: {
  rangeStart: number;
  rangeEnd: number;
}) {
  const { user } = useUser();
  const [drill, setDrill] = useState<string | null>(null);

  const data = useQuery(
    api.setterMetricRun.getFunnelMetrics,
    user
      ? {
          clerkId: user.id,
          rangeStart,
          rangeEnd,
          metricIds: ["speed_to_lead_working", "speed_to_lead_elapsed"],
        }
      : "skip",
  ) as any;

  const working = data?.results?.speed_to_lead_working;
  const elapsed = data?.results?.speed_to_lead_elapsed;

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <Card
          icon={Clock}
          label="Speed to lead (working hours)"
          value={working?.ok ? duration(working.result.medianMs) : "—"}
          sub={
            working?.ok
              ? `Median. Slowest 10% over ${duration(working.result.p90Ms)}.`
              : (working?.reason ?? "Loading…")
          }
          basis={working?.basis}
          assumed={working?.assumedHours}
          onClick={working?.ok ? () => setDrill("speed_to_lead_working") : undefined}
        />
        <Card
          icon={Moon}
          label="Speed to lead (around the clock)"
          value={elapsed?.ok ? duration(elapsed.result.medianMs) : "—"}
          sub={
            elapsed?.ok
              ? `What the prospect actually waited, nights and weekends included.`
              : (elapsed?.reason ?? "Loading…")
          }
          basis={elapsed?.basis}
          onClick={elapsed?.ok ? () => setDrill("speed_to_lead_elapsed") : undefined}
        />
      </div>

      {drill && (
        <MetricDrill
          metricId={drill}
          rangeStart={rangeStart}
          rangeEnd={rangeEnd}
          onClose={() => setDrill(null)}
        />
      )}
    </>
  );
}

function Card({
  icon: Icon,
  label,
  value,
  sub,
  basis,
  assumed,
  onClick,
}: {
  icon: any;
  label: string;
  value: string;
  sub: string;
  basis?: string;
  assumed?: boolean;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={
        "rounded-lg border border-border p-4 " +
        (onClick ? "cursor-pointer transition-colors hover:border-foreground/40" : "")
      }
    >
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <div className="mt-1.5 text-2xl font-semibold tabular-nums">{value}</div>
      <div className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
        {sub}
      </div>
      {basis && (
        // The rule in force, said out loud. When a manager disagrees with a
        // speed number, this line is almost always what they're disagreeing
        // with — and they can only argue with it if they can see it.
        <div className="mt-2 border-t border-border pt-2 text-[11px] leading-relaxed text-muted-foreground">
          {basis}
          {assumed && (
            <span className="text-amber-700">
              {" "}
              We&apos;ve assumed these hours — tell us yours if they&apos;re wrong.
            </span>
          )}
        </div>
      )}
      {onClick && (
        <div className="mt-1 text-[11px] text-muted-foreground underline underline-offset-2">
          See the leads behind this
        </div>
      )}
    </div>
  );
}
