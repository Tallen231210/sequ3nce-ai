"use client";

import { useState, useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { useTeam } from "@/hooks/useTeam";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, ExternalLink, TrendingUp, TrendingDown } from "lucide-react";
import Link from "next/link";
import { useDealValueLabels } from "@/app/dashboard/lib/useDealValueLabels";

const ROI_WINDOW_DAYS = 90;

/**
 * Closer ROI tab — Phase 1.
 *
 * Trailing 90-day window. For each closer, surface per-call ROI: cash
 * collected ÷ attributable ad spend. The "fire-the-bottom-N" simulator
 * lets a manager exclude closers from the totals and watch team blended
 * ROI recompute.
 *
 * When Meta Ads isn't connected, shows a connect-meta empty state. The
 * structure of the math is fully wired — ROI numbers populate the
 * moment spend data starts ingesting.
 */
export function RoiTab() {
  const { clerkId } = useTeam();
  const dealLabels = useDealValueLabels();

  /**
   * Pinned once, on mount.
   *
   * This tab spun on a loading spinner forever for every customer. `Date.now()`
   * was called in the render body and fed straight into the query arguments, so
   * every render produced a different range, Convex saw new arguments and
   * resubscribed, `data` went back to undefined, the component re-rendered, and
   * round it went.
   *
   * A 90-day window does not need to be accurate to the millisecond, and the
   * same initialiser pattern is already used correctly in
   * `src/app/dashboard/setter-data/page.tsx`.
   */
  const [{ rangeStart, rangeEnd }] = useState(() => {
    const now = Date.now();
    return {
      rangeStart: now - ROI_WINDOW_DAYS * 24 * 60 * 60_000,
      rangeEnd: now,
    };
  });

  const data = useQuery(
    api.closers.getCloserRoi,
    clerkId ? { clerkId, rangeStart, rangeEnd } : "skip",
  );

  const [excluded, setExcluded] = useState<Set<string>>(new Set());

  // Recompute team blended ROI excluding the chosen closers
  const simulation = useMemo(() => {
    if (!data) return null;
    let spend = 0;
    let cash = 0;
    let contract = 0;
    for (const row of data.rowsByCloser) {
      if (excluded.has(row.closerId)) continue;
      spend += row.spendUsd;
      cash += row.cashCollected;
      contract += row.contractValue;
    }
    return {
      spend,
      cash,
      contract,
      blendedRoiCash: spend > 0 ? cash / spend : null,
      blendedRoiContract: spend > 0 ? contract / spend : null,
    };
  }, [data, excluded]);

  if (data === undefined) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (data === null) {
    return (
      <div className="px-6 py-12">
        <div className="rounded-lg border border-dashed border-border bg-muted/30 px-6 py-16 text-center">
          <h3 className="text-base font-semibold">Nothing to work with yet</h3>
          <p className="mt-2 text-sm text-muted-foreground">This needs a connected team and calls your closers have taken.</p>
        </div>
      </div>
    );
  }

  // Meta not connected → empty state CTA
  if (data.spendSource === "unknown" || !data.hasSpendData) {
    return (
      <div className="px-6 py-8 space-y-6 pb-12">
        <div className="rounded-2xl border border-border bg-card p-8">
          <h2 className="text-lg font-semibold">Connect Meta Ads to see ROI</h2>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground">
            This page puts what you spent on ads next to what your closers collected, so you can see what each of them returns per ad dollar. Without your ad spend there is
            nothing to compare the cash against.
          </p>

          <div className="mt-6 space-y-3 rounded-md bg-muted/30 p-4 max-w-xl">
            <h3 className="text-sm font-semibold">How to connect it (about 5 minutes)</h3>
            <ol className="text-xs text-muted-foreground space-y-2 list-decimal pl-4">
              <li>
                Go to{" "}
                <a
                  href="https://developers.facebook.com/tools/explorer"
                  target="_blank"
                  rel="noreferrer"
                  className="underline text-foreground hover:text-foreground"
                >
                  Facebook Graph API Explorer{" "}
                  <ExternalLink className="inline h-3 w-3" />
                </a>
              </li>
              <li>
                In <strong>Permissions</strong>, add{" "}
                <code className="px-1 py-0.5 bg-muted rounded text-[10px]">
                  ads_read
                </code>
              </li>
              <li>Click <strong>Generate Access Token</strong></li>
              <li>
                Copy the token + paste in{" "}
                <Link
                  href="/dashboard/closer-stats/connect-meta"
                  className="underline text-foreground hover:text-foreground"
                >
                  Settings → Meta Ads
                </Link>
              </li>
            </ol>
          </div>

          {/* Show what data already exists even without spend */}
          <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Stat label="Calls" value={String(data.teamWide.callsTotal)} hint={`In the last ${ROI_WINDOW_DAYS} days`} />
            <Stat label="Cash collected" value={fmtCurrency(data.teamWide.totalCashCollected)} hint="From the post-call form" />
            <Stat label={dealLabels.long} value={fmtCurrency(data.teamWide.totalContractValue)} hint="Signed, not yet paid" />
            <Stat label="Closers" value={String(data.rowsByCloser.length)} hint="Who took a call" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="px-6 py-6 space-y-6 pb-12">
      {/* Top strip */}
      <Card>
        <CardContent className="px-5 py-4">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h2 className="text-sm font-semibold">Closer ROI</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                The last {ROI_WINDOW_DAYS} days, whatever period the rest of the page is showing. We can trace the ad spend behind {data.spendCoveragePct}% of these calls.
              </p>
            </div>
            {excluded.size > 0 && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setExcluded(new Set())}
              >
                Reset simulation
              </Button>
            )}
          </div>
          <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
            <Stat
              label="Total spend"
              value={fmtCurrency(simulation?.spend ?? 0)}
              hint={excluded.size > 0 ? `Leaving out ${excluded.size}` : "Every closer"}
            />
            <Stat label="Cash collected" value={fmtCurrency(simulation?.cash ?? 0)} hint="On calls that finished" />
            <Stat
              label="Cash back per ad dollar"
              value={
                simulation?.blendedRoiCash != null
                  ? `${simulation.blendedRoiCash.toFixed(2)}×`
                  : "—"
              }
              tone={roiToneFor(simulation?.blendedRoiCash)}
            />
            <Stat
              label="Deals signed per ad dollar"
              value={
                simulation?.blendedRoiContract != null
                  ? `${simulation.blendedRoiContract.toFixed(2)}×`
                  : "—"
              }
              tone={roiToneFor(simulation?.blendedRoiContract)}
            />
          </div>

          {/* Simulation chip */}
          {excluded.size > 0 && data.teamWide.blendedRoiCash != null && (
            <div className="mt-3 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs">
              <span className="font-semibold text-foreground">
                Without {excluded.size} closer{excluded.size === 1 ? "" : "s"}:
              </span>{" "}
              <span className="text-muted-foreground">
                team ROI would be{" "}
                {simulation?.blendedRoiCash != null
                  ? `${simulation.blendedRoiCash.toFixed(2)}×`
                  : "—"}{" "}
                vs {data.teamWide.blendedRoiCash.toFixed(2)}× current.
              </span>
            </div>
          )}

          {/* No-show drag callout */}
          {data.teamWide.noShowDragUsd > 0 && (
            <div className="mt-3 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs">
              <span className="font-semibold text-foreground">Spent on people who never showed:</span>{" "}
              <span className="text-muted-foreground">
                {fmtCurrency(data.teamWide.noShowDragUsd)} across {data.teamWide.noShowCallCount} calls. It isn&apos;t counted against any closer — nobody got to take the call.
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Closer table */}
      <Card>
        <CardContent className="px-0 py-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="border-b border-border bg-muted/30">
                <tr className="text-left">
                  <th className="px-4 py-2.5 w-8"></th>
                  <th className="px-4 py-2.5 font-medium text-muted-foreground">
                    Closer
                  </th>
                  <th className="px-4 py-2.5 font-medium text-muted-foreground text-right">
                    Calls
                  </th>
                  <th className="px-4 py-2.5 font-medium text-muted-foreground text-right">
                    Spend
                  </th>
                  <th className="px-4 py-2.5 font-medium text-muted-foreground text-right">
                    Cash
                  </th>
                  <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">Signed</th>
                  <th className="whitespace-nowrap px-4 py-2.5 text-right font-medium text-muted-foreground" title="Cash collected for every dollar of ad spend on their calls">
                    Cash per $1
                  </th>
                  <th className="whitespace-nowrap px-4 py-2.5 text-right font-medium text-muted-foreground" title="Deals signed for every dollar of ad spend on their calls">
                    Signed per $1
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.rowsByCloser.map((row) => {
                  const isExcluded = excluded.has(row.closerId);
                  return (
                    <tr
                      key={row.closerId}
                      className={
                        "border-b border-border last:border-0 transition-opacity " +
                        (isExcluded ? "opacity-40" : "")
                      }
                    >
                      <td className="px-4 py-2.5">
                        <input
                          type="checkbox"
                          checked={isExcluded}
                          onChange={(e) => {
                            setExcluded((prev) => {
                              const next = new Set(prev);
                              if (e.target.checked) next.add(row.closerId);
                              else next.delete(row.closerId);
                              return next;
                            });
                          }}
                          className="accent-foreground"
                          title="Exclude from simulation"
                        />
                      </td>
                      <td className="px-4 py-2.5 font-medium">
                        {row.closerName}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">
                        {row.callsRun}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums">
                        {fmtCurrency(row.spendUsd)}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums">
                        {fmtCurrency(row.cashCollected)}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">
                        {fmtCurrency(row.contractValue)}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums">
                        <span className={roiCellClass(row.roiCash)}>
                          {row.roiCash != null
                            ? `${row.roiCash.toFixed(2)}×`
                            : "—"}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">
                        {row.roiContract != null
                          ? `${row.roiContract.toFixed(2)}×`
                          : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Footer hint */}
      <p className="text-[11px] text-muted-foreground text-center">
        Tick a closer to see what the team would return without them. The lowest return sits at the top.
      </p>
    </div>
  );
}

function roiToneFor(roi: number | null | undefined): "warn" | undefined {
  if (roi == null) return undefined;
  if (roi < 1) return "warn";
  return undefined;
}

function roiCellClass(roi: number | null | undefined): string {
  if (roi == null) return "text-muted-foreground";
  if (roi < 1) return "text-rose-600 font-semibold";
  if (roi < 2) return "text-foreground font-semibold";
  return "text-emerald-600 font-semibold";
}

function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "warn";
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div
        className={
          "mt-0.5 text-xl font-semibold tabular-nums " +
          (tone === "warn"
            ? "font-medium text-foreground"
            : "text-foreground")
        }
      >
        {value}
      </div>
      {hint && (
        <div className="text-[10px] text-muted-foreground">{hint}</div>
      )}
    </div>
  );
}

function fmtCurrency(n: number): string {
  if (n === 0) return "$0";
  if (Math.abs(n) >= 1000) {
    return `$${(n / 1000).toFixed(1)}K`;
  }
  return `$${Math.round(n)}`;
}
