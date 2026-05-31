"use client";

import { Card, CardContent } from "@/components/ui/card";

interface SourceMixProps {
  sources: Array<{
    source: string;
    count: number;
    origin?: "hyros" | "ghl";
  }>;
  totalLeads: number;
  coverage?: {
    hyrosCount: number;
    totalLeadsWithSource: number;
  };
}

/**
 * Top-5 lead sources by volume in the date range. Rows from Hyros
 * (Phase 5 read direction) and rows from GHL coexist in the same list;
 * each row carries an origin tag so we badge them distinctly.
 *
 * Coverage states the panel handles:
 * - 100% GHL: no badges shown, looks identical to pre-Phase-5
 * - Mixed:    each row tagged "via Hyros" or "via GHL", footer shows
 *             the attributed-via-Hyros %
 * - 100% Hyros: "Powered by Hyros" badge on the header, no per-row tags
 */
export function SourceMix({ sources, totalLeads, coverage }: SourceMixProps) {
  if (sources.length === 0) return null;

  const hyrosCount = coverage?.hyrosCount ?? 0;
  const hasAnyHyros = hyrosCount > 0;
  const allHyros =
    coverage && coverage.totalLeadsWithSource > 0
      ? hyrosCount === coverage.totalLeadsWithSource
      : false;

  return (
    <Card>
      <CardContent className="px-4 py-5">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h3 className="text-sm font-semibold">Lead sources</h3>
            <p className="text-xs text-muted-foreground">
              Top 5 by volume in the selected range.
            </p>
          </div>
          {allHyros && (
            <span className="rounded-md bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-400">
              Powered by Hyros
            </span>
          )}
        </div>

        <ul className="space-y-2.5">
          {sources.map((row) => {
            const pct = totalLeads > 0 ? (row.count / totalLeads) * 100 : 0;
            return (
              <li key={row.source}>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="flex items-center gap-2">
                    <span className="font-medium">{row.source}</span>
                    {hasAnyHyros && !allHyros && row.origin && (
                      <span
                        className={
                          "rounded-sm px-1 py-px text-[9px] font-medium " +
                          (row.origin === "hyros"
                            ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                            : "bg-muted text-muted-foreground")
                        }
                      >
                        {row.origin === "hyros" ? "via Hyros" : "via CRM"}
                      </span>
                    )}
                  </span>
                  <span className="tabular-nums text-muted-foreground">
                    {row.count} · {Math.round(pct)}%
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className={
                      "h-full rounded-full " +
                      (row.origin === "hyros" ? "bg-emerald-500" : "bg-primary")
                    }
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ul>

        {hasAnyHyros && !allHyros && coverage && (
          <p className="mt-3 text-[10px] text-muted-foreground">
            {Math.round(
              (hyrosCount / coverage.totalLeadsWithSource) * 100,
            )}
            % of leads have ad-source data from Hyros; the rest show the source
            field from your CRM.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
