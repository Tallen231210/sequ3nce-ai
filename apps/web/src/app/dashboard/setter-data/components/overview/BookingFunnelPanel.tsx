"use client";

import { Card, CardContent } from "@/components/ui/card";

interface BookingFunnelPanelProps {
  rows: Array<{ name: string; count: number }>;
  totalLeads: number;
}

/**
 * How leads booked — the CRM-side / funnel question. Groups every lead
 * by its lead.source field (Calendly, iClosed, calendar event names,
 * etc.). Denominator is totalLeads in range.
 *
 * Paired with HyrosAdSourcesPanel in the Overview tab. The two panels
 * answer orthogonal questions — see the comment in getOverview's
 * grouping computation for why we split.
 */
export function BookingFunnelPanel({ rows, totalLeads }: BookingFunnelPanelProps) {
  return (
    <Card>
      <CardContent className="px-4 py-5">
        <div className="mb-4">
          <h3 className="text-sm font-semibold">How leads booked</h3>
          <p className="text-xs text-muted-foreground">
            Top booking sources in the selected range.
          </p>
        </div>

        {rows.length === 0 ? (
          <p className="py-6 text-center text-xs text-muted-foreground">
            No leads in this range.
          </p>
        ) : (
          <ul className="space-y-2.5">
            {rows.map((row) => {
              const pct = totalLeads > 0 ? (row.count / totalLeads) * 100 : 0;
              return (
                <li key={row.name}>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="truncate font-medium">{row.name}</span>
                    <span className="ml-2 shrink-0 tabular-nums text-muted-foreground">
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
        )}
      </CardContent>
    </Card>
  );
}
