"use client";

import { useState, useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { useTeam } from "@/hooks/useTeam";
import { Header } from "@/components/dashboard/header";
import { FilterBar } from "@/components/analytics/FilterBar";
import { MoneyView } from "@/components/analytics/MoneyView";
import { WhereYouLosing } from "@/components/analytics/WhereYouLosing";
import { WhoIsLosing } from "@/components/analytics/WhoIsLosing";
import { LeadQualityCheck } from "@/components/analytics/LeadQualityCheck";
import { WhatsHappeningOnCalls } from "@/components/analytics/WhatsHappeningOnCalls";
import { ObjectionDetectionVsOutcome } from "@/components/analytics/ObjectionDetectionVsOutcome";
import { Recommendations } from "@/components/analytics/Recommendations";
import { Loader2 } from "lucide-react";
import type { Id } from "../../../../convex/_generated/dataModel";

export default function AnalyticsPage() {
  const { team, isLoading: isTeamLoading } = useTeam();
  const [dateRange, setDateRange] = useState("last_30_days");
  const [closerId, setCloserId] = useState("all");
  const [outcome, setOutcome] = useState("all");

  // Prepare filter args
  const filterArgs = team?._id
    ? {
        teamId: team._id,
        dateRange,
        closerId: closerId !== "all" ? (closerId as Id<"closers">) : undefined,
        outcome: outcome !== "all" ? outcome : undefined,
      }
    : "skip";

  const filterArgsNoOutcome = team?._id
    ? {
        teamId: team._id,
        dateRange,
        closerId: closerId !== "all" ? (closerId as Id<"closers">) : undefined,
      }
    : "skip";

  const teamOnlyArgs = team?._id
    ? {
        teamId: team._id,
        dateRange,
      }
    : "skip";

  // Fetch all analytics data
  const summaryData = useQuery(api.analytics.getAnalyticsSummary, filterArgs);
  const lostDealsData = useQuery(api.analytics.getLostDealsByObjection, filterArgsNoOutcome);
  const closerBreakdown = useQuery(api.analytics.getCloserPerformanceBreakdown, teamOnlyArgs);
  const leadQualityData = useQuery(api.analytics.getLeadQualityAnalysis, filterArgsNoOutcome);
  const detectionData = useQuery(api.analytics.getDetectionCorrelations, filterArgsNoOutcome);
  const objectionOvercome = useQuery(api.analytics.getObjectionOvercomeRate, filterArgsNoOutcome);
  const recommendations = useQuery(api.analytics.getRecommendations, teamOnlyArgs);

  const isLoading =
    isTeamLoading ||
    summaryData === undefined ||
    lostDealsData === undefined ||
    closerBreakdown === undefined ||
    leadQualityData === undefined ||
    detectionData === undefined ||
    objectionOvercome === undefined ||
    recommendations === undefined;

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
        description="What exactly do we need to fix — on the sales team, in our marketing/lead gen, and in our sales process?"
      />
      <div className="p-6 space-y-8">
        {/* Filters */}
        <FilterBar
          dateRange={dateRange}
          onDateRangeChange={setDateRange}
          closerId={closerId}
          onCloserChange={handleCloserChange}
          outcome={outcome}
          onOutcomeChange={setOutcome}
          closers={closers || []}
          isLoading={isLoading}
        />

        {/* Section 1: Money View */}
        <MoneyView data={summaryData} isLoading={summaryData === undefined} />

        {/* Section 2: Where You're Losing */}
        <WhereYouLosing data={lostDealsData} isLoading={lostDealsData === undefined} />

        {/* Section 3: Who's Losing */}
        <WhoIsLosing data={closerBreakdown} isLoading={closerBreakdown === undefined} />

        {/* Section 4: Lead Quality Check */}
        <LeadQualityCheck data={leadQualityData} isLoading={leadQualityData === undefined} />

        {/* Section 5: What's Happening on Calls */}
        <WhatsHappeningOnCalls data={detectionData} isLoading={detectionData === undefined} />

        {/* Section 6: Objection Detection vs Outcome */}
        <ObjectionDetectionVsOutcome data={objectionOvercome} isLoading={objectionOvercome === undefined} />

        {/* Section 7: Recommendations */}
        <Recommendations data={recommendations} isLoading={recommendations === undefined} />
      </div>
    </>
  );
}
