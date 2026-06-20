"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../../../../convex/_generated/api";
import { useTeam } from "@/hooks/useTeam";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, ChevronDown, ChevronUp, Settings } from "lucide-react";
import Link from "next/link";

/**
 * Setter Scorecard tab — Phase 2.
 *
 * Trailing 60-day window, ignores the page-level date picker. Each setter
 * gets a card with their playbook KPI grid + dollar leakage rollup. Worst
 * performers (highest leakage) sort to the top.
 *
 * Data comes from getSetterScorecard which reuses computeScorecard's
 * existing per-setter aggregations.
 */
export function ScorecardTab() {
  const { clerkId } = useTeam();
  const data = useQuery(
    api.setterData.getSetterScorecard,
    clerkId ? { clerkId } : "skip",
  );
  const settings = useQuery(
    api.setterData.getMySettings,
    clerkId ? { clerkId } : "skip",
  );

  if (data === undefined) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (data === null) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-muted/30 px-6 py-16 text-center">
        <h3 className="text-base font-semibold">No setter data yet</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          Setter Scorecard activates once you have leads + setters synced from
          GoHighLevel.
        </p>
      </div>
    );
  }

  const typicalDealConfigured =
    settings?.scorecardConfig?.typicalDealValue != null;
  const meaningfulLeakage = data.teamAverages.avgCashCollectedPerClose >= 200;

  return (
    <div className="space-y-6 pb-12">
      {/* Header strip */}
      <div className="flex items-start justify-between gap-6 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold">Setter Scorecard</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Trailing {data.windowDays} days · {data.workingDaysInWindow}{" "}
            working days · Cadence{" "}
            <span className="font-medium text-foreground">{data.cadenceDefault}</span>{" "}
            ·{" "}
            <span className="text-foreground">
              {data.rows.length} setter{data.rows.length === 1 ? "" : "s"}
            </span>
          </p>
        </div>
        <Link
          href="/dashboard/setter-data?tab=settings"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <Settings className="h-3.5 w-3.5" />
          Configure targets
        </Link>
      </div>

      {/* Team-level anchor summary */}
      <Card>
        <CardContent className="px-5 py-4 grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Stat
            label="Team close rate"
            value={`${(data.teamAverages.closeRate * 100).toFixed(1)}%`}
            hint="Of leads that connected"
          />
          <Stat
            label={
              typicalDealConfigured
                ? "Deal value (manager-set)"
                : "Avg deal value (computed)"
            }
            value={fmtCurrency(data.teamAverages.avgCashCollectedPerClose)}
            hint={
              typicalDealConfigured
                ? "Manager override"
                : "From contractValue / cashCollected"
            }
          />
          <Stat
            label="Setters tracked"
            value={String(data.rows.length)}
            hint="In this window"
          />
          <Stat
            label="Total leakage"
            value={fmtCurrency(
              data.rows.reduce((s, r) => s + r.dollarLeakageMonthly, 0),
            )}
            hint="Monthly, across all setters"
            tone="warn"
          />
        </CardContent>
      </Card>

      {/* Anchor-not-configured callout */}
      {!typicalDealConfigured && !meaningfulLeakage && (
        <div className="rounded-lg border border-amber-300 bg-amber-50/60 dark:bg-amber-950/20 dark:border-amber-800 px-4 py-3 text-sm">
          <p className="font-medium text-amber-900 dark:text-amber-200">
            Leakage estimates may look small.
          </p>
          <p className="mt-1 text-xs text-amber-800 dark:text-amber-300/80">
            Your computed average deal value is{" "}
            {fmtCurrency(data.teamAverages.avgCashCollectedPerClose)}, which
            seems low. If your closers don&apos;t always enter
            cashCollected/contractValue accurately, set a manual override
            in{" "}
            <Link
              href="/dashboard/setter-data?tab=settings"
              className="underline font-medium"
            >
              Settings
            </Link>
            .
          </p>
        </div>
      )}

      {/* Per-setter rows */}
      {data.rows.length === 0 ? (
        <Card>
          <CardContent className="px-5 py-12 text-center">
            <p className="text-sm text-muted-foreground">
              No setters have activity in this window yet.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {data.rows.map((row) => (
            <ScorecardRow key={row.ghlUserId} row={row} />
          ))}
        </div>
      )}

      {/* Phase 3 placeholder note */}
      <p className="text-[11px] text-muted-foreground/70 text-center pt-4">
        Hours-in-dialer and EOD discipline tracking come in Phase 3.
      </p>
    </div>
  );
}

interface ScorecardRowData {
  ghlUserId: string;
  name: string;
  tenureDays: number;
  isStabilized: boolean;
  workingDaysInWindow: number;
  kpis: {
    dialsPerDay: KpiCellData;
    contactsPerDay: KpiCellData;
    avgDialsPerLead: KpiCellData;
    pctLeadsHittingCadence: KpiCellData;
    setRate: KpiCellData;
    showRate: KpiCellData;
  };
  dollarLeakageMonthly: number;
  lineItems: Array<{ kpi: string; lostUnits: number; dollarValue: number; explanation: string }>;
}

interface KpiCellData {
  actual: number | null;
  target: number;
  status: "red" | "amber" | "green" | "na";
}

function ScorecardRow({ row }: { row: ScorecardRowData }) {
  const [expanded, setExpanded] = useState(false);
  const tenureBadge = row.isStabilized
    ? { label: "Stabilized", tone: "green" as const }
    : { label: `Ramping · day ${row.tenureDays} of 60`, tone: "neutral" as const };

  return (
    <Card>
      <CardContent className="px-5 py-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div>
              <h3 className="text-sm font-semibold">{row.name}</h3>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span
                  className={
                    "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium " +
                    (tenureBadge.tone === "green"
                      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300"
                      : "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300")
                  }
                >
                  {tenureBadge.label}
                </span>
              </div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Monthly leakage
            </div>
            <div
              className={
                "text-xl font-semibold tabular-nums " +
                (row.dollarLeakageMonthly > 1000
                  ? "text-red-600 dark:text-red-400"
                  : row.dollarLeakageMonthly > 100
                    ? "text-amber-600 dark:text-amber-400"
                    : "text-zinc-700 dark:text-zinc-300")
              }
            >
              {fmtCurrency(row.dollarLeakageMonthly)}
            </div>
          </div>
        </div>

        {/* KPI grid */}
        <div className="mt-4 grid grid-cols-2 md:grid-cols-3 gap-3 text-xs">
          <KpiCell label="Dials/day" cell={row.kpis.dialsPerDay} unit="" />
          <KpiCell
            label="Contacts/day"
            cell={row.kpis.contactsPerDay}
            unit=""
          />
          <KpiCell
            label="Dials/lead"
            cell={row.kpis.avgDialsPerLead}
            unit=""
          />
          <KpiCell
            label="% Cadence-complete"
            cell={row.kpis.pctLeadsHittingCadence}
            unit="%"
          />
          <KpiCell label="Set rate" cell={row.kpis.setRate} unit="%" />
          <KpiCell label="Show rate" cell={row.kpis.showRate} unit="%" />
          {/* Phase 3 placeholders */}
          <PlaceholderCell label="Hours in dialer" />
          <PlaceholderCell label="EOD discipline" />
        </div>

        {/* Line items expansion */}
        {row.lineItems.length > 0 && (
          <button
            onClick={() => setExpanded((e) => !e)}
            className="mt-3 inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
          >
            {expanded ? (
              <ChevronUp className="h-3 w-3" />
            ) : (
              <ChevronDown className="h-3 w-3" />
            )}
            {expanded ? "Hide" : "Show"} leakage breakdown ({row.lineItems.length}{" "}
            item{row.lineItems.length === 1 ? "" : "s"})
          </button>
        )}

        {expanded && row.lineItems.length > 0 && (
          <div className="mt-3 space-y-2 rounded-md bg-muted/30 px-3 py-2.5">
            {row.lineItems.map((li, i) => (
              <div key={i} className="flex items-start gap-3 text-[11px]">
                <span className="font-medium uppercase tracking-wider text-muted-foreground w-20 shrink-0">
                  {li.kpi}
                </span>
                <span className="font-semibold tabular-nums w-20 shrink-0">
                  {fmtCurrency(li.dollarValue)}
                </span>
                <span className="text-muted-foreground leading-relaxed">
                  {li.explanation}
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function KpiCell({
  label,
  cell,
  unit,
}: {
  label: string;
  cell: KpiCellData;
  unit: string;
}) {
  const isNa = cell.actual === null || cell.status === "na";
  const colorClass =
    cell.status === "green"
      ? "text-emerald-700 dark:text-emerald-400"
      : cell.status === "amber"
        ? "text-amber-700 dark:text-amber-400"
        : cell.status === "red"
          ? "text-red-700 dark:text-red-400"
          : "text-muted-foreground";
  return (
    <div className="rounded-md border border-border px-2.5 py-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="mt-0.5 flex items-baseline justify-between gap-2">
        <span className={"font-semibold tabular-nums " + colorClass}>
          {isNa
            ? "—"
            : `${(cell.actual ?? 0).toFixed(unit === "%" ? 0 : 1)}${unit}`}
        </span>
        <span className="text-[10px] text-muted-foreground tabular-nums">
          tgt{" "}
          {typeof cell.target === "number"
            ? `${cell.target.toFixed(unit === "%" ? 0 : 1)}${unit}`
            : "—"}
        </span>
      </div>
    </div>
  );
}

function PlaceholderCell({ label }: { label: string }) {
  return (
    <div
      className="rounded-md border border-dashed border-border px-2.5 py-2 opacity-50"
      title="Tracked starting Phase 3"
    >
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="mt-0.5 flex items-baseline justify-between">
        <span className="font-medium text-muted-foreground">—</span>
        <span className="text-[10px] text-muted-foreground">Phase 3</span>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint: string;
  tone?: "warn";
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div
        className={
          "mt-0.5 text-xl font-semibold tabular-nums " +
          (tone === "warn"
            ? "text-amber-700 dark:text-amber-400"
            : "text-foreground")
        }
      >
        {value}
      </div>
      <div className="text-[10px] text-muted-foreground">{hint}</div>
    </div>
  );
}

function fmtCurrency(n: number): string {
  if (n === 0) return "$0";
  if (Math.abs(n) >= 1000) {
    return `$${(n / 1000).toFixed(1)}K`;
  }
  return `$${Math.round(n)}`;
}
