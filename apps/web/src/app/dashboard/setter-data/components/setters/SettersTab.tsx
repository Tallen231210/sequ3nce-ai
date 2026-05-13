"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../../../../convex/_generated/api";
import { useTeam } from "@/hooks/useTeam";
import { DateRangeSelect } from "../DateRangeSelect";
import { SetterLeaderboard } from "./SetterLeaderboard";
import { SetterDrillPanel } from "./SetterDrillPanel";
import { Loader2 } from "lucide-react";

interface SettersTabProps {
  rangeStart: number;
  rangeEnd: number;
  onRangeChange: (start: number, end: number) => void;
}

/**
 * Setters tab — leaderboard sorted by speed-to-lead. Click a row to open
 * the per-setter drilldown panel with their appointments + activity.
 */
export function SettersTab({
  rangeStart,
  rangeEnd,
  onRangeChange,
}: SettersTabProps) {
  const { clerkId } = useTeam();
  const data = useQuery(
    api.setterData.getOverview,
    clerkId ? { clerkId, rangeStart, rangeEnd } : "skip",
  );
  const [selectedSetterId, setSelectedSetterId] = useState<string | null>(null);

  return (
    <div className="space-y-4 pb-12">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Setters</h2>
          <p className="text-sm text-muted-foreground">
            Click a row to see per-setter detail: appointments, activity
            timeline, and breakdown.
          </p>
        </div>
        <DateRangeSelect
          rangeStart={rangeStart}
          rangeEnd={rangeEnd}
          onChange={onRangeChange}
        />
      </div>

      {data === undefined && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}

      {data && data.perSetter.length === 0 && (
        <div className="rounded-lg border border-dashed border-border bg-muted/30 px-6 py-16 text-center">
          <h3 className="text-base font-semibold">No setter activity yet</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Once leads start being assigned and dialed, your team's
            performance breakdown will appear here.
          </p>
        </div>
      )}

      {data && data.perSetter.length > 0 && (
        <SetterLeaderboard
          rows={data.perSetter}
          onRowClick={(id) => setSelectedSetterId(id)}
        />
      )}

      <SetterDrillPanel
        ghlUserId={selectedSetterId}
        rangeStart={rangeStart}
        rangeEnd={rangeEnd}
        onClose={() => setSelectedSetterId(null)}
      />
    </div>
  );
}
