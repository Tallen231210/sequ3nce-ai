"use client";

import { Users } from "lucide-react";
import { CoverageNotice, UnknownRepsNotice } from "./CoverageNotice";
import { FunnelChart } from "./FunnelChart";
import { KpiStrip } from "./KpiStrip";
import { ManagerStrip } from "./ManagerStrip";
import { Leaderboard, type CloserRow } from "./Leaderboard";
import { WeekSparkline } from "./PeriodNav";
import { PrizeCard, ProjectionCard } from "./SidePanels";
import { fmtCurrency, fmtNum } from "../lib/format";

/** A compact figure for the summary rail above the funnel. */
function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-lg font-semibold tabular-nums">{value}</div>
      {hint && <div className="text-[11px] text-muted-foreground">{hint}</div>}
    </div>
  );
}

function NoActivity() {
  return (
    <div className="rounded-xl border border-border bg-card px-6 py-16">
      <div className="mx-auto max-w-md text-center">
        <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-muted">
          <Users className="h-5 w-5 text-muted-foreground" />
        </div>
        <h2 className="mt-4 text-base font-semibold">
          Nothing recorded this period
        </h2>
        <p className="mt-1.5 text-sm text-muted-foreground">
          This board fills in from your closers&apos; calendars and completed
          calls. Try another month, or check that your team has connected their
          calendars.
        </p>
      </div>
    </div>
  );
}

/* eslint-disable @typescript-eslint/no-explicit-any */

export function TeamView({
  data,
  weekIndex,
  onWeekChange,
}: {
  data: any;
  weekIndex: number | null;
  onWeekChange: (w: number | null) => void;
}) {
  const t = data.teamTotals;
  const hasAnyActivity =
    t.booked > 0 || t.taken > 0 || data.bookedUnattributed > 0;
  // Offers/Closes/Cash all come from the post-call form. When barely anyone
  // fills it in, render those stages as "not known" rather than as zero.
  const gateBelowTaken = data.coverage.lowCoverage;

  return (
    <>
      {/* Data-quality notices lead the page — they explain the numbers below,
          so they must be read before them, not after. */}
      <CoverageNotice coverage={data.coverage} />
      <UnknownRepsNotice
        unknownReps={data.unknownReps}
        bookedUnattributed={data.bookedUnattributed}
      />

      {/* Manager band first: the settings a manager controls, and what those
          settings produce. Gianni's mockup puts these at the top of the page
          because they're revised while looking at results. */}
      <ManagerStrip
        monthKey={data.monthKey}
        teamCash={t.cash}
        booked={t.booked}
        isCurrentMonth={data.isCurrentMonth}
      />

      {!hasAnyActivity ? (
        <NoActivity />
      ) : (
        <>
          <KpiStrip
            rates={data.teamRates}
            rag={data.teamRatesRag}
            targets={data.targets}
            capacityReliable={data.capacity?.reliable !== false}
          />

          {/* The leaderboard sits OUTSIDE this grid, full width. Squeezed
              beside a 300px rail it needed ~200px of sideways scrolling at
              normal dashboard widths, and a table you have to drag is a table
              nobody reads. Breakpoints can't solve it — they measure the
              viewport and know nothing about the 256px app sidebar. */}
          <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
            <div className="min-w-0 space-y-5">
              <div className="grid grid-cols-2 gap-4 rounded-xl border border-border bg-card px-5 py-4 sm:grid-cols-4">
                <Stat
                  label="Closers"
                  value={fmtNum(data.perCloser.length)}
                  hint={`${data.activeClosers} active on team`}
                />
                <Stat
                  label="Booked"
                  value={fmtNum(t.booked)}
                  hint={
                    data.bookedUnattributed > 0
                      ? `+${fmtNum(data.bookedUnattributed)} unattributed`
                      : undefined
                  }
                />
                <Stat label="Calls taken" value={fmtNum(t.taken)} />
                <Stat
                  label="Cash collected"
                  value={fmtCurrency(t.cash)}
                  hint={t.closes > 0 ? `${fmtNum(t.closes)} closes` : undefined}
                />
              </div>

              <FunnelChart totals={t} gateBelowTaken={gateBelowTaken} />

              <WeekSparkline
                weekCash={data.weekCash}
                weekIndex={weekIndex}
                onWeekChange={onWeekChange}
              />
            </div>

            <div className="min-w-0 space-y-5">
              <ProjectionCard projection={data.projection} />
              <PrizeCard prize={data.prize} />
            </div>
          </div>

          <Leaderboard
            rows={data.perCloser as CloserRow[]}
            gateBelowTaken={gateBelowTaken}
          />
        </>
      )}
    </>
  );
}
