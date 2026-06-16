"use client";

import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";
import { InsightCard, type PanelInsight } from "./InsightCard";

interface HyrosAdSourcesPanelProps {
  platforms: Array<{
    platform: string;
    count: number;
    ads: Array<{
      name: string;
      count: number;
      // Wave 1 outcome augmentation. show% / close% / $avg are
      // present together only when matchedCount >= MIN_MATCHED_SAMPLE
      // (the leads have actually been called). avgTimeToDialMs is
      // independent — it can be present even when matched data isn't,
      // because it's an ops metric driven by lead.firstDialAt.
      matchedCount?: number;
      showedCount?: number;
      closedCount?: number;
      cashCollected?: number;
      avgTimeToDialMs?: number;
      topObjection?: { name: string; count: number };
    }>;
  }>;
  coverage: {
    attributedCount: number;
    totalLeads: number;
    hyrosEnabled: boolean;
  };
  insight?: PanelInsight | null;
}

function formatCash(n: number): string {
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}K`;
  return `$${Math.round(n)}`;
}

function formatTimeToDial(ms: number): string {
  const minutes = ms / 60000;
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const hours = minutes / 60;
  if (hours < 24) return `${hours.toFixed(1)}h`;
  return `${(hours / 24).toFixed(1)}d`;
}

function showDotColor(showPct: number): string {
  if (showPct >= 70) return "text-emerald-500";
  if (showPct >= 40) return "text-amber-500";
  return "text-red-500";
}

/**
 * Where traffic came from — ad-source attribution from Hyros. Pairs
 * with BookingFunnelPanel in the Overview tab.
 *
 * Three render states inside one card shell so the layout never shifts:
 *   1. hyrosEnabled === false
 *      → soft empty state with a low-pressure "Connect Hyros" CTA.
 *      Presents Hyros as an optional enrichment, not a missing
 *      requirement.
 *   2. hyrosEnabled === true && attributedCount === 0
 *      → "connected, waiting for first attributed lead" — helps people
 *      who just connected today and are wondering why it's empty.
 *   3. attributedCount > 0
 *      → platform-grouped rows with ad-name sub-rows underneath. The
 *      platform bar fills relative to that platform's share of
 *      attributed leads; the ad sub-rows show count + share within
 *      their parent platform.
 */
export function HyrosAdSourcesPanel({ platforms, coverage, insight }: HyrosAdSourcesPanelProps) {
  if (!coverage.hyrosEnabled) {
    return (
      <Card>
        <CardContent className="px-4 py-5">
          <div className="mb-4">
            <h3 className="text-sm font-semibold">Where traffic came from</h3>
            <p className="text-xs text-muted-foreground">
              Ad-level attribution via Hyros.
            </p>
          </div>
          <div className="flex flex-col items-center justify-center gap-3 py-8 text-center">
            <div className="rounded-full bg-muted/60 p-2.5">
              <Sparkles className="h-4 w-4 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-medium">Connect Hyros to see ad attribution</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Track which ads, videos, and campaigns drive your leads.
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

  if (coverage.attributedCount === 0) {
    return (
      <Card>
        <CardContent className="px-4 py-5">
          <div className="mb-4">
            <h3 className="text-sm font-semibold">Where traffic came from</h3>
            <p className="text-xs text-muted-foreground">
              Ad-level attribution via Hyros.
            </p>
          </div>
          <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
            <div className="rounded-full bg-emerald-500/10 p-2.5">
              <Sparkles className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <p className="text-sm font-medium">Hyros connected</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Waiting for first attributed lead in this range.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const coveragePct = coverage.totalLeads > 0
    ? (coverage.attributedCount / coverage.totalLeads) * 100
    : 0;

  return (
    <Card>
      <CardContent className="px-4 py-5">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h3 className="text-sm font-semibold">Where traffic came from</h3>
            <p className="text-xs text-muted-foreground">
              Ad-level attribution via Hyros.
            </p>
          </div>
          <span className="rounded-md bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-400">
            Powered by Hyros
          </span>
        </div>

        <ul className="space-y-4">
          {platforms.map((p) => {
            const platformPct = (p.count / coverage.attributedCount) * 100;
            // If the platform has exactly one ad whose name matches the
            // platform (e.g. organic / no specific creative), don't
            // render a duplicate sub-row — the header alone is enough.
            const showSubRows =
              p.ads.length > 1 ||
              (p.ads.length === 1 && p.ads[0].name.toLowerCase() !== p.platform.toLowerCase());
            return (
              <li key={p.platform}>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="truncate font-medium">{p.platform}</span>
                  <span className="ml-2 shrink-0 tabular-nums text-muted-foreground">
                    {p.count} · {Math.round(platformPct)}%
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-emerald-500"
                    style={{ width: `${platformPct}%` }}
                  />
                </div>

                {showSubRows && (
                  <ul className="ml-3 mt-2 space-y-2 border-l border-border pl-3">
                    {p.ads.map((ad) => {
                      const adPct = (ad.count / p.count) * 100;
                      // Show/close percentages use matchedCount as
                      // the denominator (of the leads we have actually
                      // called, this many showed/closed) — matches
                      // the convention in computeCloserSideShowRate.
                      // Booking count remains the visible total above.
                      const hasOutcomes =
                        ad.matchedCount !== undefined && ad.matchedCount > 0;
                      const showPct =
                        hasOutcomes && ad.showedCount !== undefined
                          ? (ad.showedCount / (ad.matchedCount as number)) * 100
                          : 0;
                      const closePct =
                        hasOutcomes && ad.closedCount !== undefined
                          ? (ad.closedCount / (ad.matchedCount as number)) * 100
                          : 0;
                      const avgCash =
                        ad.cashCollected !== undefined &&
                        ad.closedCount !== undefined &&
                        ad.closedCount > 0
                          ? ad.cashCollected / ad.closedCount
                          : 0;
                      return (
                        <li key={ad.name}>
                          <div className="mb-0.5 flex items-center justify-between text-[11px]">
                            <span className="truncate text-muted-foreground">{ad.name}</span>
                            <span className="ml-2 shrink-0 tabular-nums text-muted-foreground">
                              {ad.count} · {Math.round(adPct)}%
                            </span>
                          </div>
                          <div className="h-1 overflow-hidden rounded-full bg-muted">
                            <div
                              className="h-full rounded-full bg-emerald-400/70"
                              style={{ width: `${adPct}%` }}
                            />
                          </div>
                          {(hasOutcomes || ad.avgTimeToDialMs !== undefined) && (
                            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-muted-foreground">
                              {hasOutcomes && (
                                <>
                                  <span className={showDotColor(showPct)}>●</span>
                                  <span>{Math.round(showPct)}% show</span>
                                  {ad.closedCount !== undefined && (
                                    <>
                                      <span>·</span>
                                      <span>{Math.round(closePct)}% close</span>
                                    </>
                                  )}
                                  {avgCash > 0 && (
                                    <>
                                      <span>·</span>
                                      <span>{formatCash(avgCash)} avg</span>
                                    </>
                                  )}
                                  <span>·</span>
                                  <span>of {ad.matchedCount} called</span>
                                </>
                              )}
                              {ad.avgTimeToDialMs !== undefined && (
                                <>
                                  {hasOutcomes && <span>·</span>}
                                  <span>{formatTimeToDial(ad.avgTimeToDialMs)} to dial</span>
                                </>
                              )}
                            </div>
                          )}
                          {ad.topObjection && (
                            <div className="mt-0.5 text-[10px] text-muted-foreground/70">
                              Top lost-reason: {ad.topObjection.name}
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>

        <p className="mt-4 text-[10px] text-muted-foreground">
          {coverage.attributedCount} of {coverage.totalLeads} leads attributed via Hyros ({Math.round(coveragePct)}%).
        </p>

        <InsightCard insight={insight ?? null} />
      </CardContent>
    </Card>
  );
}
