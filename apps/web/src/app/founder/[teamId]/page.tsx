"use client";

import { use, useState } from "react";
import { useQuery } from "convex/react";
import { useUser } from "@clerk/nextjs";
import { api } from "../../../../convex/_generated/api";
import { SnapshotSection } from "../_components/SnapshotSection";
import { PerformanceKpis } from "../_components/PerformanceKpis";
import { CloserLeaderboard } from "../_components/CloserLeaderboard";
import { DateRangePicker, type AdminDateRange } from "../_components/DateRangePicker";
import { Loader2 } from "lucide-react";
import Link from "next/link";
import type { Id } from "../../../../convex/_generated/dataModel";

export default function FounderTeamDetailPage({
  params,
}: {
  params: Promise<{ teamId: string }>;
}) {
  const { teamId } = use(params);
  const { user } = useUser();
  const clerkId = user?.id ?? "";

  // Date range for the performance sections — defaults to last_30_days
  // (matches what /dashboard/closer-stats lands on).
  const [dateRange, setDateRange] = useState<AdminDateRange>("last_30_days");

  const snapshot = useQuery(
    api.founderAdmin.getTeamSnapshot,
    clerkId ? { clerkId, teamId: teamId as Id<"teams"> } : "skip",
  );
  // Performance queries — separate from snapshot so range changes don't
  // refetch the static setup data.
  const dashboardStats = useQuery(api.calls.getDashboardStats, {
    teamId: teamId as Id<"teams">,
  });
  const teamStats = useQuery(
    api.founderAdmin.getTeamStatsForTeam,
    clerkId
      ? { clerkId, teamId: teamId as Id<"teams">, dateRange }
      : "skip",
  );
  const closerStats = useQuery(
    api.founderAdmin.getCloserStatsForTeam,
    clerkId
      ? { clerkId, teamId: teamId as Id<"teams">, dateRange }
      : "skip",
  );

  if (snapshot === undefined) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (snapshot === null) {
    return (
      <div className="rounded border bg-white p-6">
        <p className="text-sm text-muted-foreground">Team not found.</p>
        <Link className="mt-2 text-sm text-blue-600" href="/founder">
          ← Back to teams
        </Link>
      </div>
    );
  }

  const { team, closers, recentCalls, recentBots, integrations } = snapshot;

  return (
    <div className="space-y-4">
      <Link className="text-sm text-blue-600" href="/founder">
        ← Back to teams
      </Link>

      <SnapshotSection title="Team">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
          <dt className="text-muted-foreground">ID</dt>
          <dd className="font-mono text-xs">{team._id}</dd>
          <dt className="text-muted-foreground">Name</dt>
          <dd>{team.name}</dd>
          <dt className="text-muted-foreground">Timezone</dt>
          <dd>{team.timezone ?? "—"}</dd>
          <dt className="text-muted-foreground">Created</dt>
          <dd>
            {new Date(team.createdAt ?? team._creationTime).toLocaleString()}
          </dd>
          <dt className="text-muted-foreground">Closer seats</dt>
          <dd>{closers.length}</dd>
        </dl>
      </SnapshotSection>

      <SnapshotSection title="Performance — right now">
        <PerformanceKpis stats={dashboardStats} />
      </SnapshotSection>

      <SnapshotSection title="Performance — over time">
        <div className="mb-3 flex items-center gap-3">
          <DateRangePicker value={dateRange} onChange={setDateRange} />
          <span className="text-xs text-muted-foreground">
            (Same ranges the customer sees on /dashboard/closer-stats)
          </span>
        </div>
        {teamStats && (
          <dl className="grid grid-cols-4 gap-3 text-sm">
            <KpiCell label="Total calls" value={teamStats.totalCalls} />
            <KpiCell
              label="Close rate"
              value={`${(teamStats.closeRate * 100).toFixed(1)}%`}
            />
            <KpiCell
              label="Cash collected"
              value={`$${teamStats.cashCollected.toLocaleString()}`}
            />
            <KpiCell
              label="Avg deal size"
              value={`$${Math.round(teamStats.avgDealSize).toLocaleString()}`}
            />
          </dl>
        )}
      </SnapshotSection>

      <SnapshotSection title="Closer leaderboard">
        <CloserLeaderboard rows={closerStats ?? []} />
      </SnapshotSection>

      <SnapshotSection title="Integrations">
        <ul className="space-y-1 text-sm">
          <li>
            Slack: {integrations.slack ? "✓ connected" : "—"}
            {integrations.slackChannels
              ? ` (${integrations.slackChannels} channels configured)`
              : ""}
          </li>
          <li>
            GHL: {integrations.ghl ? "✓ connected" : "—"}
            {integrations.ghlLocationId
              ? ` (loc ${integrations.ghlLocationId})`
              : ""}
          </li>
          <li>Hyros: {integrations.hyros ? "✓ connected" : "—"}</li>
          <li>
            Calendly:{" "}
            {integrations.calendly
              ? `✓ ${integrations.calendlyEmail ?? "connected"}`
              : "—"}
          </li>
        </ul>
      </SnapshotSection>

      <SnapshotSection title="Setter Data settings">
        <ul className="space-y-1 text-sm">
          <li>
            Daily scorecard:{" "}
            {team.setterDailyScorecardEnabled
              ? `enabled (${team.setterDailyScorecardChannel ?? "?"})`
              : "off"}
          </li>
          <li>
            Untouched alert:{" "}
            {team.setterUntouchedAlertEnabled
              ? `enabled @${team.setterUntouchedAlertThresholdMinutes}m`
              : "off"}
          </li>
          <li>
            Coverage gap: {team.setterCoverageGapEnabled ? "enabled" : "off"}
          </li>
          <li>
            Disposition sync:{" "}
            {team.setterDispositionSyncEnabled ? "enabled" : "off"}
          </li>
        </ul>
      </SnapshotSection>

      <SnapshotSection title={`Closers (${closers.length})`}>
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-muted-foreground">
            <tr>
              <th className="py-1 font-medium">Name</th>
              <th className="py-1 font-medium">Email</th>
              <th className="py-1 font-medium">Status</th>
              <th className="py-1 font-medium">Last sign-in</th>
            </tr>
          </thead>
          <tbody>
            {closers.map((c) => (
              <tr key={c._id} className="border-t">
                <td className="py-1">{c.name}</td>
                <td className="py-1 text-muted-foreground">{c.email}</td>
                <td className="py-1">{c.status}</td>
                <td className="py-1 text-muted-foreground">
                  {c.lastLoginAt
                    ? new Date(c.lastLoginAt).toLocaleString()
                    : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </SnapshotSection>

      <SnapshotSection title={`Recent calls (${recentCalls.length})`}>
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-muted-foreground">
            <tr>
              <th className="py-1 font-medium">When</th>
              <th className="py-1 font-medium">Closer</th>
              <th className="py-1 font-medium">Prospect</th>
              <th className="py-1 font-medium">Duration</th>
              <th className="py-1 font-medium">Outcome</th>
              <th className="py-1 font-medium">Transcript</th>
            </tr>
          </thead>
          <tbody>
            {recentCalls.map((c) => (
              <tr key={c._id} className="border-t">
                <td className="py-1 text-muted-foreground">
                  {c.startedAt
                    ? new Date(c.startedAt).toLocaleString()
                    : "—"}
                </td>
                <td className="py-1">{c.closerName}</td>
                <td className="py-1">{c.prospectName ?? "—"}</td>
                <td className="py-1">
                  {c.duration ? `${Math.round(c.duration / 60)}m` : "—"}
                </td>
                <td className="py-1">{c.outcome ?? "—"}</td>
                <td className="py-1">{c.hasTranscript ? "✓" : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </SnapshotSection>

      <SnapshotSection title={`Recent meeting bots (${recentBots.length})`}>
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-muted-foreground">
            <tr>
              <th className="py-1 font-medium">Created</th>
              <th className="py-1 font-medium">Closer</th>
              <th className="py-1 font-medium">Source</th>
              <th className="py-1 font-medium">Status</th>
              <th className="py-1 font-medium">Joined</th>
            </tr>
          </thead>
          <tbody>
            {recentBots.map((b) => (
              <tr key={b._id} className="border-t">
                <td className="py-1 text-muted-foreground">
                  {new Date(b._creationTime).toLocaleString()}
                </td>
                <td className="py-1">{b.closerName ?? "—"}</td>
                <td className="py-1">{b.source}</td>
                <td className="py-1">{b.status}</td>
                <td className="py-1 text-muted-foreground">
                  {b.joinedAt
                    ? new Date(b.joinedAt).toLocaleString()
                    : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </SnapshotSection>
    </div>
  );
}

function KpiCell({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded bg-zinc-50 p-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-lg font-semibold">{value}</div>
    </div>
  );
}
