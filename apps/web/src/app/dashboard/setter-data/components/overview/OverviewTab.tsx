"use client";

import { useQuery } from "convex/react";
import { api } from "../../../../../../convex/_generated/api";
import { useTeam } from "@/hooks/useTeam";
import { DateRangeSelect } from "../DateRangeSelect";
import { KpiStrip } from "./KpiStrip";
import { ActionQueue } from "./ActionQueue";
import { BookingFunnelPanel } from "./BookingFunnelPanel";
import { HyrosAdSourcesPanel } from "./HyrosAdSourcesPanel";
import { RoutingPerformancePanel } from "./RoutingPerformancePanel";
import { FunnelChart } from "./FunnelChart";
import { LeadAgeDecayCurve } from "./LeadAgeDecayCurve";
import { BestTimeToCallHeatmap } from "./BestTimeToCallHeatmap";
import { DialCadencePanel } from "./DialCadencePanel";
import { CoverageGapPanel } from "./CoverageGapPanel";
import { ConnectRateAnomalyBanner } from "./ConnectRateAnomalyBanner";
import { BookingsPanel } from "./BookingsPanel";
import { PipelineFunnel } from "./PipelineFunnel";
import { Loader2 } from "lucide-react";

interface OverviewTabProps {
  rangeStart: number;
  rangeEnd: number;
  onRangeChange: (start: number, end: number) => void;
  onDrillToLeads: (filter?: string) => void;
}

/**
 * Overview tab — the manager's daily-driver landing surface.
 *
 * Layout (top-down):
 *   1. Header bar with date-range select
 *   2. KPI strip (4 cards)
 *   3. Funnel chart (dial → connect)
 *   4. Action queue (full width)
 *   5. Two-column: How leads booked | Where traffic came from (Hyros)
 *
 * All data comes from a single getOverview query — the queries layer
 * fans out internally so the UI stays simple.
 */
export function OverviewTab({
  rangeStart,
  rangeEnd,
  onRangeChange,
  onDrillToLeads,
}: OverviewTabProps) {
  const { clerkId } = useTeam();
  const data = useQuery(
    api.setterData.getOverview,
    clerkId ? { clerkId, rangeStart, rangeEnd } : "skip",
  );
  const pipelines = useQuery(
    api.setterData.getPipelineStageDistribution,
    clerkId ? { clerkId } : "skip",
  );

  return (
    <div className="space-y-6 pb-12">
      {/* Header bar */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Overview</h2>
        <DateRangeSelect
          rangeStart={rangeStart}
          rangeEnd={rangeEnd}
          onChange={onRangeChange}
        />
      </div>

      {/* Loading */}
      {data === undefined && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Empty range (no data at all) */}
      {data && data.totalLeads === 0 && (
        <div className="rounded-lg border border-dashed border-border bg-muted/30 px-6 py-16 text-center">
          <h3 className="text-base font-semibold">No leads in this range</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Try widening your date range, or wait for new leads to come in.
          </p>
        </div>
      )}

      {/* Loaded with data */}
      {data && data.totalLeads > 0 && (
        <>
          <ConnectRateAnomalyBanner />
          <KpiStrip data={data} onUntouchedClick={() => onDrillToLeads("untouched")} />
          <FunnelChart data={data} />
          <BookingsPanel bookings={data.bookings} />
          <LeadAgeDecayCurve rangeStart={rangeStart} rangeEnd={rangeEnd} />
          <BestTimeToCallHeatmap rangeStart={rangeStart} rangeEnd={rangeEnd} />
          <DialCadencePanel perSetter={data.perSetter} />
          <CoverageGapPanel />
          {pipelines && pipelines.length > 0 && (
            <PipelineFunnel pipelines={pipelines} />
          )}
          <ActionQueue
            actionQueue={data.actionQueue}
            onViewAll={() => onDrillToLeads("untouched")}
          />
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <BookingFunnelPanel
              rows={data.bookingFunnel}
              totalLeads={data.totalLeads}
            />
            <HyrosAdSourcesPanel
              platforms={data.hyrosAdSources}
              coverage={data.hyrosCoverage}
            />
          </div>
          <RoutingPerformancePanel
            rows={data.hyrosRoutingPerAd}
            adsHidden={data.hyrosRoutingAdsHidden}
            coverage={data.hyrosCoverage}
          />
        </>
      )}
    </div>
  );
}
