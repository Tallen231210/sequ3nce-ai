"use client";

import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";

interface HyrosAdSourcesPanelProps {
  platforms: Array<{
    platform: string;
    count: number;
    ads: Array<{ name: string; count: number }>;
  }>;
  coverage: {
    attributedCount: number;
    totalLeads: number;
    hyrosEnabled: boolean;
  };
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
export function HyrosAdSourcesPanel({ platforms, coverage }: HyrosAdSourcesPanelProps) {
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
                  <ul className="ml-3 mt-2 space-y-1.5 border-l border-border pl-3">
                    {p.ads.map((ad) => {
                      const adPct = (ad.count / p.count) * 100;
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
      </CardContent>
    </Card>
  );
}
