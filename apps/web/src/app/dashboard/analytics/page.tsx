"use client";

import { useState, useMemo } from "react";
import { tierHas } from "@/lib/tiers";
import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { useTeam } from "@/hooks/useTeam";
import { GeistMono } from "geist/font/mono";
import { Header } from "@/components/dashboard/header";
import { FilterBar } from "@/components/analytics/FilterBar";
import { MoneyLedger } from "@/components/analytics/MoneyLedger";
import { MonthlyComparison } from "@/components/analytics/MonthlyComparison";
import { WhereYouLosing } from "@/components/analytics/WhereYouLosing";
import { WhoIsLosing } from "@/components/analytics/WhoIsLosing";
import { CallQualityCheck } from "@/components/analytics/CallQualityCheck";
import { ObjectionAnalysis } from "@/components/analytics/ObjectionAnalysis";
import { Recommendations } from "@/components/analytics/Recommendations";
import { Loader2 } from "lucide-react";
import type { Id } from "../../../../convex/_generated/dataModel";

export default function AnalyticsPage() {
  const { team, isLoading: isTeamLoading } = useTeam();
  const [dateRange, setDateRange] = useState("last_30_days");
  const [customStart, setCustomStart] = useState<number | undefined>(undefined);
  const [customEnd, setCustomEnd] = useState<number | undefined>(undefined);
  const [closerId, setCloserId] = useState("all");

  const scopedCloserId = closerId !== "all" ? (closerId as Id<"closers">) : undefined;

  const handleRangeChange = (range: string, start?: number, end?: number) => {
    setDateRange(range);
    setCustomStart(start);
    setCustomEnd(end);
  };

  // Prepare filter args. customStart/customEnd are ignored by the backend for
  // named ranges, so it's safe to always pass them.
  const filterArgs = team?._id
    ? {
        teamId: team._id,
        dateRange,
        closerId: scopedCloserId,
        customStart,
        customEnd,
      }
    : "skip";

  const teamOnlyArgs = team?._id
    ? {
        teamId: team._id,
        dateRange,
        customStart,
        customEnd,
      }
    : "skip";

  // Fetch all analytics data
  const summaryData = useQuery(api.analytics.getAnalyticsSummary, filterArgs);
  const lostDealsData = useQuery(api.analytics.getLostDealsByObjection, filterArgs);
  const closerBreakdown = useQuery(api.analytics.getCloserPerformanceBreakdown, teamOnlyArgs);
  const objectionAnalysis = useQuery(api.analytics.getObjectionAnalysis, filterArgs);
  // Step 2: inline-recommendation bundle. Replaces the old `getRecommendations`
  // query (now deleted). Returns per-section recs + a top-3 digest.
  const recBundle = useQuery(api.analyticsRecommendations.getAnalyticsRecommendations, filterArgs);
  // Step 4: Call Quality section data (first AI-data dependency).
  const callQualityData = useQuery(api.analyticsCallQuality.getCallQualitySummary, filterArgs);

  const isLoading =
    isTeamLoading ||
    summaryData === undefined ||
    lostDealsData === undefined ||
    closerBreakdown === undefined ||
    objectionAnalysis === undefined ||
    recBundle === undefined ||
    callQualityData === undefined;

  // Extract closers for filter dropdown from closerBreakdown data
  const closers = useMemo(() => {
    if (!closerBreakdown?.breakdown) return [];
    return closerBreakdown.breakdown.map((c) => ({
      _id: c.closerId,
      name: c.closerName,
    }));
  }, [closerBreakdown]);

  // Handle filter changes
  const handleCloserChange = (value: string) => {
    setCloserId(value);
  };

  if (isTeamLoading) {
    return (
      <>
        <Header title="Analytics" description="Sales performance insights and recommendations" />
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </>
    );
  }

  if (!team) {
    return (
      <>
        <Header title="Analytics" description="Sales performance insights and recommendations" />
        <div className="p-6">
          <p className="text-muted-foreground">No team found. Please contact support.</p>
        </div>
      </>
    );
  }

  return (
    <>
      <Header
        title="Analytics"
        description="Where deals are won, lost, and left behind."
      />
      <div className={`${GeistMono.variable} p-6 space-y-8`}>
        {/* Filters */}
        <FilterBar
          dateRange={dateRange}
          customStart={customStart}
          customEnd={customEnd}
          onRangeChange={handleRangeChange}
          closerId={closerId}
          onCloserChange={handleCloserChange}
          closers={closers || []}
          isLoading={isLoading}
        />

        {/* Section 1: Money Ledger — the signature hero. Fuses revenue closed
            + leak attribution into one panel with a capture-rate story. Each
            leak row drills into filtered Calls and can carry an inline rec. */}
        <MoneyLedger
          data={summaryData}
          dateRange={dateRange}
          isLoading={summaryData === undefined}
          recommendations={{
            inCallLosses: recBundle?.bySection["leak.inCallLosses"],
            uncollected: recBundle?.bySection["leak.uncollected"],
            noShows: recBundle?.bySection["leak.noShows"],
          }}
        />

        {/* Month over month — self-contained comparison, metric- and
            window-switchable. Independent of the page period filter. */}
        <MonthlyComparison teamId={team._id} closerId={scopedCloserId} />

        {/* Section 2: Where You're Losing */}
        <WhereYouLosing
          data={lostDealsData}
          isLoading={lostDealsData === undefined}
          recommendation={recBundle?.bySection.whereYouLosing}
        />

        {/* Section 3: Who's Losing */}
        <WhoIsLosing
          data={closerBreakdown}
          isLoading={closerBreakdown === undefined}
          recommendation={recBundle?.bySection.whoIsLosing}
        />

        {/* Lead Quality Check removed.
            Both figures it showed — the 1-10 lead quality score and the
            non-decision-maker percentage — came from the post-call form, which
            closers don't fill in (RemoteStack 17 of 100, CreateFreedom 0 of
            21). Reading them off the transcript instead was considered and
            rejected: an AI-scored "lead quality" would be a different metric
            wearing the same name, and a confidently wrong score is worse than
            no score.

            The component and its query are left in place, dormant, in case a
            customer asks for it back on a different basis. */}

        {/* Section 5: Call Quality — Step 4. First AI-data section.
            Gated behind verified-attribution skip-list (in the query) and a
            data-confidence indicator (in the component). Factual signals only. */}
        {/* Talk ratio and discovery signals are read off the transcript. With
            no recording there is no transcript, so this section can only ever
            report "based on 0 calls" — an empty panel that looks like a defect
            rather than a feature the plan doesn't include. */}
        {tierHas(team?.productTier, "callIntelligence") && (
        <CallQualityCheck
          data={callQualityData}
          isLoading={callQualityData === undefined}
          recommendation={recBundle?.bySection.callQuality}
        />
        )}

        {/* Section 6: Objection Analysis - Real form data */}
        <ObjectionAnalysis data={objectionAnalysis} isLoading={objectionAnalysis === undefined} />

        {/* Section 6: Top-3 priorities digest. Hides itself when no recs fire. */}
        <Recommendations data={recBundle?.top} isLoading={recBundle === undefined} />
      </div>
    </>
  );
}
