"use client";

import { useState } from "react";

import { Users } from "lucide-react";
import {
  ConfirmationNotice,
  CoverageNotice,
  UnknownRepsNotice,
} from "./CoverageNotice";
import { FunnelChart } from "./FunnelChart";
import { KpiStrip } from "./KpiStrip";
import { ManagerStrip } from "./ManagerStrip";
import { Leaderboard, type CloserRow } from "./Leaderboard";
import { WeekSparkline } from "./PeriodNav";
import { PrizeCard, ProjectionCard } from "./SidePanels";
import { CloserFocusCard } from "./CloserFocusCard";
import { monthLabel } from "../lib/format";

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
  // Focusing a closer re-scopes the funnel, the rates and the week chart to
  // them. Done client-side from data already loaded, so it's instant and the
  // leaderboard keeps its full ranking as context.
  const [focusId, setFocusId] = useState<string | null>(null);
  const focused =
    (data.perCloser as CloserRow[]).find((r) => r.closerId === focusId) ?? null;
  // Clear a stale selection if the period changes and that rep drops out.
  if (focusId && !focused) setFocusId(null);

  const t = focused ? focused.totals : data.teamTotals;
  const rates = focused ? focused.rates : data.teamRates;
  const rag = focused ? focused.rag : data.teamRatesRag;
  const weekCash = focused ? focused.weekCash : data.weekCash;
  const hasAnyActivity =
    t.booked > 0 || t.taken > 0 || data.bookedUnattributed > 0;
  // Offers/Closes/Cash all come from the post-call form. When barely anyone
  // fills it in, render those stages as "not known" rather than as zero.
  const gateBelowTaken = data.coverage.lowCoverage;

  return (
    <>
      {/* Data-quality notices lead the page — they explain the numbers below,
          so they must be read before them, not after. */}
      {/* Submission gap first — it explains the size of everything below it. */}
      {data.confirmation && (
        <ConfirmationNotice
          confirmation={data.confirmation}
          monthLabel={monthLabel(data.monthKey, true)}
        />
      )}
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
            rates={rates}
            rag={rag}
            targets={data.targets}
            capacityReliable={
              focused
                ? focused.capacity?.reliable !== false
                : data.capacity?.reliable !== false
            }
          />

          {/* The leaderboard sits OUTSIDE this grid, full width. Squeezed
              beside a 300px rail it needed ~200px of sideways scrolling at
              normal dashboard widths, and a table you have to drag is a table
              nobody reads. Breakpoints can't solve it — they measure the
              viewport and know nothing about the 256px app sidebar. */}
          <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
            <div className="flex min-w-0 flex-col">
              <FunnelChart totals={t} gateBelowTaken={gateBelowTaken} />
            </div>

            <div className="min-w-0 space-y-5">
              {focused ? (
                <CloserFocusCard row={focused} onClear={() => setFocusId(null)} />
              ) : (
                <>
                  <ProjectionCard projection={data.projection} />
                  <PrizeCard prize={data.prize} />
                </>
              )}
              <WeekSparkline
                weekCash={weekCash}
                weekIndex={weekIndex}
                onWeekChange={onWeekChange}
              />
            </div>
          </div>

          <Leaderboard
            rows={data.perCloser as CloserRow[]}
            gateBelowTaken={gateBelowTaken}
            wowDaysCompared={data.wowWindow?.daysCompared}
            selectedCloserId={focusId}
            onSelectCloser={setFocusId}
          />
        </>
      )}
    </>
  );
}
