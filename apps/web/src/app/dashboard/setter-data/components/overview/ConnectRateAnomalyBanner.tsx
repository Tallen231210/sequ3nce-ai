"use client";

import { useEffect, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../../../../convex/_generated/api";
import { useTeam } from "@/hooks/useTeam";
import { Card, CardContent } from "@/components/ui/card";
import { TrendingDown, X } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * High-visibility banner shown above the KPI strip when the team's
 * weekly connect rate has dropped significantly (≥30%) versus the
 * 4-week baseline. Per-manager dismissal stored in localStorage so it
 * doesn't nag someone who's already aware of the issue.
 *
 * Returns null when:
 *   - no anomaly detected (Convex query returns null)
 *   - sample size below floor (handled by the query — returns null)
 *   - user has dismissed for the day
 */
export function ConnectRateAnomalyBanner() {
  const { clerkId, team } = useTeam();
  const teamId = team?._id ? String(team._id) : null;
  const data = useQuery(
    api.setterData.getConnectRateAnomaly,
    clerkId ? { clerkId } : "skip",
  );
  const [dismissed, setDismissed] = useState(false);

  // Read dismissal state on mount + when team changes.
  useEffect(() => {
    if (!teamId) return;
    const key = dismissKey(teamId);
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(key);
    setDismissed(stored === todayKey());
  }, [teamId]);

  if (!data || dismissed) return null;

  function handleDismiss() {
    if (!teamId) return;
    if (typeof window !== "undefined") {
      window.localStorage.setItem(dismissKey(teamId), todayKey());
    }
    setDismissed(true);
  }

  const dropPct = Math.round(data.relativeDropPct * 100);
  const thisWeekPct = Math.round(data.thisWeekRate * 100);
  const baselinePct = Math.round(data.baselineRate * 100);

  return (
    <Card className="border-amber-500/40 bg-amber-500/5">
      <CardContent className="px-4 py-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <TrendingDown className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-500" />
            <div className="space-y-1.5">
              <div className="text-sm font-semibold text-amber-900 dark:text-amber-100">
                Connect rate dropped {dropPct}% this week
              </div>
              <div className="text-xs text-amber-800/80 dark:text-amber-100/80">
                Last 7 days: <span className="font-medium">{thisWeekPct}%</span>{" "}
                ({data.thisWeekDials} dials) · 4-week baseline:{" "}
                <span className="font-medium">{baselinePct}%</span> (
                {data.baselineDials} dials)
              </div>
              {data.topContributors.length > 0 && (
                <div className="text-xs text-amber-800/80 dark:text-amber-100/80">
                  Biggest individual drops:{" "}
                  {data.topContributors.map((c, i) => (
                    <span key={c.ghlUserId}>
                      {i > 0 && ", "}
                      <span className="font-medium">{c.name}</span>{" "}
                      (-{Math.round(c.dropPts * 100)}pts)
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDismiss}
            className="shrink-0 text-amber-800 hover:text-amber-900 dark:text-amber-200"
          >
            <X className="h-3.5 w-3.5" />
            <span className="ml-1 text-xs">Dismiss</span>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function dismissKey(teamId: string): string {
  return `setter-anomaly-dismiss:${teamId}`;
}

function todayKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}
