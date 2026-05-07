"use client";

import { Card, CardContent } from "@/components/ui/card";

interface SourceMixProps {
  sources: Array<{ source: string; count: number }>;
  totalLeads: number;
}

/**
 * Top-5 lead sources by volume in the date range. Visualized as a stacked
 * horizontal bar — proportions are easier to spot than raw counts when
 * you're comparing campaigns.
 */
export function SourceMix({ sources, totalLeads }: SourceMixProps) {
  if (sources.length === 0) return null;

  return (
    <Card>
      <CardContent className="px-4 py-5">
        <div className="mb-4">
          <h3 className="text-sm font-semibold">Lead sources</h3>
          <p className="text-xs text-muted-foreground">
            Top 5 by volume in the selected range.
          </p>
        </div>

        <ul className="space-y-2.5">
          {sources.map((row) => {
            const pct = totalLeads > 0 ? (row.count / totalLeads) * 100 : 0;
            return (
              <li key={row.source}>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="font-medium">{row.source}</span>
                  <span className="tabular-nums text-muted-foreground">
                    {row.count} · {Math.round(pct)}%
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
