"use client";

import { Loader2 } from "lucide-react";

interface BackfillBannerProps {
  monthsCompleted: number; // 0–12
  monthsTarget: number; // typically 12
}

/**
 * Non-blocking progress banner shown while the deep-backfill cron is
 * extending the team's history backward. Fast backfill (last 90 days) is
 * already done by the time this shows; the dashboard is fully usable.
 * Once monthsCompleted hits monthsTarget the banner disappears (the
 * parent gates this component on deepBackfillCompletedAt).
 */
export function BackfillBanner({
  monthsCompleted,
  monthsTarget,
}: BackfillBannerProps) {
  const percent = Math.min(100, Math.round((monthsCompleted / monthsTarget) * 100));

  return (
    <div className="mb-4 flex items-center gap-3 rounded-md border border-border bg-muted/50 px-4 py-3 text-sm">
      <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
      <div className="flex-1">
        <span className="font-medium">Extending history…</span>{" "}
        <span className="text-muted-foreground">
          {monthsCompleted} of {monthsTarget} months synced. New historical
          leads will appear automatically.
        </span>
      </div>
      <div className="hidden h-1.5 w-32 overflow-hidden rounded-full bg-border sm:block">
        <div
          className="h-full rounded-full bg-primary transition-all"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
