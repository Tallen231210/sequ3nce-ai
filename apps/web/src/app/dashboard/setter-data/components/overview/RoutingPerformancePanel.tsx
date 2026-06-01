"use client";

import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Users } from "lucide-react";

interface RoutingPerf {
  name: string;
  matched: number;
  closed?: number;
  closeRate?: number;
  showed?: number;
  showRate?: number;
}

interface RoutingPerformancePanelProps {
  rows: Array<{
    adName: string;
    platform: string;
    matchedTotal: number;
    bestCloser?: RoutingPerf;
    worstCloser?: RoutingPerf;
    closerSpreadPp?: number;
    soleCloser?: RoutingPerf;
    bestSetter?: RoutingPerf;
    worstSetter?: RoutingPerf;
    setterSpreadPp?: number;
    soleSetter?: RoutingPerf;
  }>;
  adsHidden: number;
  coverage: {
    attributedCount: number;
    totalLeads: number;
    hyrosEnabled: boolean;
  };
}

/**
 * Wave 2 — Routing performance. For each ad creative with enough
 * matched calls, surface the best and worst closer (close rate) +
 * best and worst setter (show rate). Answers "is this ad's poor
 * performance an ad issue or a people issue?"
 *
 * Three render states inside one card shell so layout never shifts:
 *   1. !hyrosEnabled → soft empty state with Connect Hyros CTA.
 *   2. hyrosEnabled but no routing rows pass the threshold →
 *      "Not enough matched calls yet" state.
 *   3. rows.length > 0 → per-ad blocks.
 */
export function RoutingPerformancePanel({
  rows,
  adsHidden,
  coverage,
}: RoutingPerformancePanelProps) {
  if (!coverage.hyrosEnabled) {
    return (
      <Card>
        <CardContent className="px-4 py-5">
          <div className="mb-4">
            <h3 className="text-sm font-semibold">Routing performance</h3>
            <p className="text-xs text-muted-foreground">
              Who works which ads best.
            </p>
          </div>
          <div className="flex flex-col items-center justify-center gap-3 py-8 text-center">
            <div className="rounded-full bg-muted/60 p-2.5">
              <Users className="h-4 w-4 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-medium">
                Connect Hyros to see who works each ad best
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Best and worst closer + setter per ad creative.
              </p>
            </div>
            <Button asChild variant="ghost" size="sm" className="mt-1 h-7 text-xs">
              <Link href="/dashboard/settings#hyros">Connect Hyros</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (rows.length === 0) {
    return (
      <Card>
        <CardContent className="px-4 py-5">
          <div className="mb-4">
            <h3 className="text-sm font-semibold">Routing performance</h3>
            <p className="text-xs text-muted-foreground">
              Who works which ads best.
            </p>
          </div>
          <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
            <div className="rounded-full bg-muted/60 p-2.5">
              <Users className="h-4 w-4 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-medium">
                Not enough matched calls yet
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Routing breakdowns appear once an ad has 5+ matched calls.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="px-4 py-5">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h3 className="text-sm font-semibold">Routing performance</h3>
            <p className="text-xs text-muted-foreground">
              For each ad with enough matched calls, the highest- and
              lowest-performing operator on each side.
            </p>
          </div>
          <span className="rounded-md bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-400">
            Powered by Hyros
          </span>
        </div>

        <ul className="space-y-5">
          {rows.map((row) => (
            <li key={row.adName}>
              <div className="mb-2 flex items-center justify-between text-xs">
                <span className="truncate font-medium">{row.adName}</span>
                <span className="ml-2 shrink-0 tabular-nums text-muted-foreground">
                  {row.matchedTotal} called
                </span>
              </div>

              <div className="ml-1 space-y-1.5">
                {renderCloserBlock(row)}
                {renderSetterBlock(row)}
              </div>
            </li>
          ))}
        </ul>

        <p className="mt-5 text-[10px] text-muted-foreground">
          {rows.length} ad{rows.length === 1 ? "" : "s"} with routing data
          {adsHidden > 0 && (
            <>
              {" · "}
              {adsHidden} hidden (fewer than 5 matched calls each)
            </>
          )}
          .
        </p>
      </CardContent>
    </Card>
  );
}

function renderCloserBlock(row: RoutingPerformancePanelProps["rows"][number]) {
  if (row.bestCloser && row.worstCloser) {
    return (
      <>
        <PerfRow
          tone="good"
          label="Best closer"
          perf={row.bestCloser}
          metric="closed"
        />
        <PerfRow
          tone="bad"
          label="Worst closer"
          perf={row.worstCloser}
          metric="closed"
          spreadPp={row.closerSpreadPp}
        />
      </>
    );
  }
  if (row.soleCloser) {
    return (
      <PerfRow
        tone="neutral"
        label="Sole closer"
        perf={row.soleCloser}
        metric="closed"
      />
    );
  }
  return (
    <p className="text-[10px] text-muted-foreground/70">
      No closer has enough matched calls for this ad yet.
    </p>
  );
}

function renderSetterBlock(row: RoutingPerformancePanelProps["rows"][number]) {
  if (row.bestSetter && row.worstSetter) {
    return (
      <>
        <PerfRow
          tone="good"
          label="Best setter"
          perf={row.bestSetter}
          metric="showed"
        />
        <PerfRow
          tone="bad"
          label="Worst setter"
          perf={row.worstSetter}
          metric="showed"
          spreadPp={row.setterSpreadPp}
        />
      </>
    );
  }
  if (row.soleSetter) {
    return (
      <PerfRow
        tone="neutral"
        label="Sole setter"
        perf={row.soleSetter}
        metric="showed"
      />
    );
  }
  return (
    <p className="text-[10px] text-muted-foreground/70">
      No setter has enough matched calls for this ad yet.
    </p>
  );
}

function PerfRow({
  tone,
  label,
  perf,
  metric,
  spreadPp,
}: {
  tone: "good" | "bad" | "neutral";
  label: string;
  perf: RoutingPerf;
  metric: "closed" | "showed";
  spreadPp?: number;
}) {
  const dotClass =
    tone === "good"
      ? "text-emerald-500"
      : tone === "bad"
        ? "text-red-500"
        : "text-muted-foreground";
  const ratio =
    metric === "closed"
      ? `${perf.closed ?? 0}/${perf.matched} closed`
      : `${perf.showed ?? 0}/${perf.matched} showed`;
  const rate =
    metric === "closed" ? perf.closeRate ?? 0 : perf.showRate ?? 0;
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px]">
      <span className={dotClass}>●</span>
      <span className="text-muted-foreground">{label}:</span>
      <span className="font-medium">{perf.name}</span>
      <span className="tabular-nums text-muted-foreground">{ratio}</span>
      <span className="tabular-nums text-muted-foreground">
        {Math.round(rate)}%
      </span>
      {spreadPp !== undefined && (
        <span className="tabular-nums text-muted-foreground/70">
          · spread: {spreadPp}pp
        </span>
      )}
    </div>
  );
}
