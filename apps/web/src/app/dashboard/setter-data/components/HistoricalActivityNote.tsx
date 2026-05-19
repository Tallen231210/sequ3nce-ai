"use client";

import { Info } from "lucide-react";

interface HistoricalActivityNoteProps {
  installedAt: number;
}

/**
 * Disclosure note clarifying that activity-level metrics (dials,
 * connections, SMS counts) only reflect events captured AFTER the GHL
 * integration was connected. Historical leads imported via backfill
 * appear in counts but have no pre-connection activity history because
 * GHL's conversation history isn't backfilled by the lead-skeleton sync.
 *
 * Renders quietly above the tab nav so it sits next to the leaderboard
 * and lead table on every tab where the distinction matters.
 */
export function HistoricalActivityNote({
  installedAt,
}: HistoricalActivityNoteProps) {
  const connectedDate = new Date(installedAt).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div className="mb-4 flex items-start gap-2 rounded-md border border-border bg-muted/30 px-4 py-2.5 text-xs text-muted-foreground">
      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <p>
        Activity metrics (dials, connections, SMS) reflect events since GHL
        was connected on {connectedDate}. Leads imported from before that
        date appear in lead counts but have no pre-connection activity
        history.
      </p>
    </div>
  );
}
