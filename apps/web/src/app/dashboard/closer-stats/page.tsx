"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { useTeam } from "@/hooks/useTeam";
import { Header } from "@/components/dashboard/header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  BarChart3,
  TrendingUp,
  TrendingDown,
  Phone,
  DollarSign,
  Clock,
  Target,
  Loader2,
  Zap,
  Users,
  CheckCircle2,
  Calendar,
  ChevronDown,
  ChevronUp,
  Sparkles,
} from "lucide-react";

type DateRange = "today" | "this_week" | "this_month" | "last_30_days" | "all_time";

const DATE_RANGE_LABELS: Record<DateRange, string> = {
  today: "Today",
  this_week: "This Week",
  this_month: "This Month",
  last_30_days: "Last 30 Days",
  all_time: "All Time",
};

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

function TrendIndicator({ value, suffix = "%" }: { value: number | null; suffix?: string }) {
  if (value === null) {
    return <span className="text-xs text-zinc-400">—</span>;
  }

  const isPositive = value >= 0;
  const displayValue = Math.abs(value).toFixed(1);

  return (
    <span className={`inline-flex items-center gap-0.5 text-xs ${isPositive ? "text-green-600" : "text-red-600"}`}>
      {isPositive ? (
        <TrendingUp className="h-3 w-3" />
      ) : (
        <TrendingDown className="h-3 w-3" />
      )}
      {displayValue}{suffix}
    </span>
  );
}

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) {
    return (
      <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/30 hover:bg-amber-500/20">
        #1
      </Badge>
    );
  }
  if (rank === 2) {
    return (
      <Badge variant="outline" className="text-zinc-500 border-zinc-300">
        #2
      </Badge>
    );
  }
  if (rank === 3) {
    return (
      <Badge variant="outline" className="text-zinc-500 border-zinc-300">
        #3
      </Badge>
    );
  }
  return null;
}

function LiveStatusIndicator({ status }: { status?: "on_call" | "waiting" }) {
  if (!status) return null;

  if (status === "on_call") {
    return (
      <Badge className="bg-green-500/10 text-green-600 border-green-500/30 animate-pulse">
        On Call
      </Badge>
    );
  }

  return (
    <Badge className="bg-yellow-500/10 text-yellow-600 border-yellow-500/30">
      Waiting
    </Badge>
  );
}

interface CloserCardProps {
  closer: {
    closerId: string;
    name: string;
    email: string;
    status: string;
    closeRate: number;
    cashCollected: number;
    callsTaken: number;
    avgCallLength: number;
    showRate: number;
    avgDealValue: number;
    followUpConversionRate: number;
    avgAmmoPerCall: number;
    talkToListenRatio: number | null;
    revenueThisWeek: number;
    revenueThisMonth: number;
    callsThisWeek: number;
    callsThisMonth: number;
    closeRateTrend: number | null;
    cashCollectedTrend: number | null;
    callsTakenTrend: number | null;
    rank: number;
  };
  liveStatus?: "on_call" | "waiting";
  dateRange: DateRange;
}

// Generate individual closer insights based on their stats
function generateCloserInsights(closer: CloserCardProps["closer"], dateRange: DateRange): string[] {
  const insights: string[] = [];
  const periodLabel = DATE_RANGE_LABELS[dateRange].toLowerCase();
  const firstName = closer.name.split(" ")[0];

  // Performance level
  if (closer.closeRate >= 35) {
    insights.push(`${firstName} is performing exceptionally with a ${formatPercent(closer.closeRate)} close rate.`);
  } else if (closer.closeRate >= 25) {
    insights.push(`${firstName} is showing solid performance with a ${formatPercent(closer.closeRate)} close rate.`);
  } else if (closer.closeRate >= 15) {
    insights.push(`${firstName}'s close rate of ${formatPercent(closer.closeRate)} has room for improvement.`);
  } else if (closer.callsTaken > 0) {
    insights.push(`${firstName}'s close rate of ${formatPercent(closer.closeRate)} needs attention.`);
  }

  // Revenue contribution
  if (closer.cashCollected > 0) {
    insights.push(`Collected ${formatCurrency(closer.cashCollected)} from ${closer.callsTaken} calls ${periodLabel}.`);
  }

  // Trend analysis
  if (closer.closeRateTrend !== null) {
    if (closer.closeRateTrend > 5) {
      insights.push(`Close rate is up ${closer.closeRateTrend.toFixed(0)} points vs previous period — great momentum!`);
    } else if (closer.closeRateTrend < -5) {
      insights.push(`Close rate dropped ${Math.abs(closer.closeRateTrend).toFixed(0)} points — may need coaching.`);
    }
  }

  // Average deal value insight
  if (closer.avgDealValue > 0) {
    if (closer.avgDealValue >= 5000) {
      insights.push(`Strong average deal value of ${formatCurrency(closer.avgDealValue)}.`);
    } else if (closer.avgDealValue < 2000 && closer.callsTaken >= 3) {
      insights.push(`Average deal value (${formatCurrency(closer.avgDealValue)}) is on the lower side.`);
    }
  }

  // Show rate concern
  if (closer.showRate < 70 && closer.callsTaken >= 5) {
    insights.push(`Show rate of ${formatPercent(closer.showRate)} suggests prospect qualification could improve.`);
  } else if (closer.showRate >= 90 && closer.callsTaken >= 5) {
    insights.push(`Excellent show rate of ${formatPercent(closer.showRate)}.`);
  }

  // Call length observation
  if (closer.avgCallLength > 0) {
    const avgMins = Math.floor(closer.avgCallLength / 60);
    if (avgMins > 45) {
      insights.push(`Calls averaging ${avgMins} minutes — may need to work on efficiency.`);
    } else if (avgMins < 15 && closer.closeRate < 20) {
      insights.push(`Short calls (avg ${avgMins} min) combined with low close rate — may be rushing.`);
    }
  }

  // Ranking context
  if (closer.rank === 1 && closer.callsTaken > 0) {
    insights.push(`Currently the top performer on the team!`);
  } else if (closer.rank <= 3 && closer.callsTaken > 0) {
    insights.push(`Ranked #${closer.rank} on the team.`);
  }

  return insights.slice(0, 4); // Limit to 4 insights
}

function CloserCard({ closer, liveStatus, dateRange }: CloserCardProps) {
  const hasNoData = closer.callsTaken === 0;
  const [showInsights, setShowInsights] = useState(false);
  const insights = generateCloserInsights(closer, dateRange);

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-5">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-zinc-100 flex items-center justify-center">
              <span className="text-sm font-medium text-foreground">
                {closer.name
                  .split(" ")
                  .map((n) => n[0])
                  .join("")
                  .toUpperCase()
                  .slice(0, 2)}
              </span>
            </div>
            <div>
              <h3 className="font-medium text-foreground">{closer.name}</h3>
              <p className="text-xs text-zinc-500">{closer.email}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <LiveStatusIndicator status={liveStatus} />
            <RankBadge rank={closer.rank} />
          </div>
        </div>

        {hasNoData ? (
          <div className="py-8 text-center">
            <BarChart3 className="h-8 w-8 text-zinc-300 mx-auto mb-2" />
            <p className="text-sm text-zinc-500">No data yet</p>
            <p className="text-xs text-zinc-400 mt-1">
              Stats will appear once calls are completed
            </p>
          </div>
        ) : (
          <>
            {/* Primary Stats */}
            <div className="grid grid-cols-2 gap-4 mb-4">
              {/* Close Rate */}
              <div className="p-3 bg-zinc-50 rounded-lg">
                <div className="flex items-center gap-1.5 text-zinc-500 mb-1">
                  <Target className="h-3.5 w-3.5" />
                  <span className="text-xs">Close Rate</span>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-semibold text-foreground">
                    {formatPercent(closer.closeRate)}
                  </span>
                  <TrendIndicator value={closer.closeRateTrend} suffix=" pts" />
                </div>
              </div>

              {/* Cash Collected */}
              <div className="p-3 bg-zinc-50 rounded-lg">
                <div className="flex items-center gap-1.5 text-zinc-500 mb-1">
                  <DollarSign className="h-3.5 w-3.5" />
                  <span className="text-xs">Cash Collected</span>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-semibold text-foreground">
                    {formatCurrency(closer.cashCollected)}
                  </span>
                  <TrendIndicator value={closer.cashCollectedTrend} />
                </div>
              </div>

              {/* Calls Taken */}
              <div className="p-3 bg-zinc-50 rounded-lg">
                <div className="flex items-center gap-1.5 text-zinc-500 mb-1">
                  <Phone className="h-3.5 w-3.5" />
                  <span className="text-xs">Calls Taken</span>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-semibold text-foreground">
                    {closer.callsTaken}
                  </span>
                  <TrendIndicator value={closer.callsTakenTrend} />
                </div>
              </div>

              {/* Avg Call Length */}
              <div className="p-3 bg-zinc-50 rounded-lg">
                <div className="flex items-center gap-1.5 text-zinc-500 mb-1">
                  <Clock className="h-3.5 w-3.5" />
                  <span className="text-xs">Avg Call Length</span>
                </div>
                <span className="text-2xl font-semibold text-foreground">
                  {formatDuration(closer.avgCallLength)}
                </span>
              </div>
            </div>

            {/* Secondary Stats */}
            <div className="border-t border-zinc-100 pt-4 mb-4">
              <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-zinc-500">Show Rate</span>
                  <span className="font-medium">{formatPercent(closer.showRate)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">Avg Deal Value</span>
                  <span className="font-medium">
                    {closer.avgDealValue > 0 ? formatCurrency(closer.avgDealValue) : "—"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">Ammo/Call</span>
                  <span className="font-medium">
                    {closer.avgAmmoPerCall > 0 ? closer.avgAmmoPerCall.toFixed(1) : "—"}
                  </span>
                </div>
                {closer.talkToListenRatio !== null && (
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Talk:Listen</span>
                    <span className="font-medium">
                      {closer.talkToListenRatio.toFixed(1)}:1
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Time-based Stats */}
            <div className="border-t border-zinc-100 pt-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-zinc-500 mb-1">This Week</p>
                  <p className="text-sm font-medium">
                    {formatCurrency(closer.revenueThisWeek)}
                  </p>
                  <p className="text-xs text-zinc-400">
                    {closer.callsThisWeek} calls
                  </p>
                </div>
                <div>
                  <p className="text-xs text-zinc-500 mb-1">This Month</p>
                  <p className="text-sm font-medium">
                    {formatCurrency(closer.revenueThisMonth)}
                  </p>
                  <p className="text-xs text-zinc-400">
                    {closer.callsThisMonth} calls
                  </p>
                </div>
              </div>
            </div>

            {/* Individual Summary Dropdown */}
            {insights.length > 0 && (
              <div className="border-t border-zinc-100 pt-4 mt-4">
                <button
                  onClick={() => setShowInsights(!showInsights)}
                  className="w-full flex items-center justify-between text-left group"
                >
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-zinc-400 group-hover:text-zinc-600" />
                    <span className="text-sm font-medium text-zinc-600 group-hover:text-zinc-800">
                      {DATE_RANGE_LABELS[dateRange]} Summary
                    </span>
                  </div>
                  {showInsights ? (
                    <ChevronUp className="h-4 w-4 text-zinc-400" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-zinc-400" />
                  )}
                </button>

                {showInsights && (
                  <div className="mt-3 p-3 bg-zinc-50 rounded-lg">
                    <ul className="space-y-2">
                      {insights.map((insight, index) => (
                        <li key={index} className="flex items-start gap-2 text-sm text-zinc-600">
                          <span className="text-zinc-400 mt-1">•</span>
                          <span>{insight}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function LoadingState() {
  return (
    <div className="p-6">
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="p-6">
      <Card>
        <CardContent className="py-16">
          <div className="flex flex-col items-center justify-center text-center">
            <Users className="h-12 w-12 text-zinc-400 mb-4" />
            <h3 className="text-lg font-medium mb-2">No closers yet</h3>
            <p className="text-zinc-500 text-sm max-w-sm">
              Add closers to your team to start tracking their performance.
            </p>
            <Button variant="outline" className="mt-4" asChild>
              <a href="/dashboard/team">Go to Team Settings</a>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// Team Stats Card Component
interface TeamStatCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  trend: number | null;
  trendSuffix?: string;
}

function TeamStatCard({ icon, label, value, trend, trendSuffix = "%" }: TeamStatCardProps) {
  return (
    <div className="p-4 bg-white border border-zinc-200 rounded-lg">
      <div className="flex items-center gap-2 text-zinc-500 mb-2">
        {icon}
        <span className="text-xs font-medium">{label}</span>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-semibold text-foreground">{value}</span>
        <TrendIndicator value={trend} suffix={trendSuffix} />
      </div>
    </div>
  );
}

// Dynamic Summary Component
interface DynamicSummaryProps {
  teamStats: TeamStatsSectionProps["teamStats"];
  closerStats: CloserCardProps["closer"][];
  dateRange: DateRange;
}

function DynamicSummary({ teamStats, closerStats, dateRange }: DynamicSummaryProps) {
  if (!teamStats || closerStats.length === 0) {
    return null;
  }

  // Generate insights based on the data
  const insights: string[] = [];
  const periodLabel = DATE_RANGE_LABELS[dateRange].toLowerCase();

  // Total revenue insight
  if (teamStats.totalCashCollected > 0) {
    insights.push(`Team collected ${formatCurrency(teamStats.totalCashCollected)} from ${teamStats.totalClosedDeals} deal${teamStats.totalClosedDeals !== 1 ? "s" : ""} ${periodLabel}.`);
  } else {
    insights.push(`No closed deals ${periodLabel} yet.`);
  }

  // Close rate insight
  if (teamStats.totalCallsTaken > 0) {
    const closeRateStatus = teamStats.teamCloseRate >= 30 ? "strong" : teamStats.teamCloseRate >= 20 ? "solid" : "needs work";
    insights.push(`Team close rate is ${formatPercent(teamStats.teamCloseRate)} (${closeRateStatus}) from ${teamStats.totalCallsTaken} calls.`);
  }

  // Top performer insight
  const topPerformer = closerStats.find(c => c.rank === 1 && c.callsTaken > 0);
  if (topPerformer) {
    insights.push(`${topPerformer.name.split(" ")[0]} is leading with a ${formatPercent(topPerformer.closeRate)} close rate.`);
  }

  // Trend insight
  if (teamStats.cashCollectedTrend !== null && teamStats.cashCollectedTrend !== 0) {
    const trendDirection = teamStats.cashCollectedTrend > 0 ? "up" : "down";
    const trendAmount = Math.abs(teamStats.cashCollectedTrend).toFixed(0);
    insights.push(`Revenue is ${trendDirection} ${trendAmount}% compared to the previous period.`);
  }

  // Show rate concern
  if (teamStats.showRate < 80 && teamStats.totalCallsTaken >= 5) {
    insights.push(`Show rate (${formatPercent(teamStats.showRate)}) could use improvement.`);
  }

  if (insights.length === 0) {
    return null;
  }

  return (
    <div className="mb-6 p-4 bg-zinc-50 border border-zinc-200 rounded-lg">
      <div className="flex items-start gap-3">
        <div className="p-2 bg-zinc-900 text-white rounded-lg shrink-0">
          <BarChart3 className="h-4 w-4" />
        </div>
        <div>
          <h3 className="font-medium text-foreground mb-1">
            {DATE_RANGE_LABELS[dateRange]} Summary
          </h3>
          <p className="text-sm text-zinc-600 leading-relaxed">
            {insights.join(" ")}
          </p>
        </div>
      </div>
    </div>
  );
}

// Team Overview Section Component
interface TeamStatsSectionProps {
  teamStats: {
    totalCashCollected: number;
    totalClosedDeals: number;
    totalCallsTaken: number;
    teamCloseRate: number;
    averageDealValue: number;
    showRate: number;
    cashCollectedTrend: number | null;
    closedDealsTrend: number | null;
    callsTakenTrend: number | null;
    closeRateTrend: number | null;
    averageDealValueTrend: number | null;
    showRateTrend: number | null;
  } | null;
  dateRange: DateRange;
}

function TeamStatsSection({ teamStats, dateRange }: TeamStatsSectionProps) {
  // Show empty state if no stats
  if (!teamStats) {
    return (
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Team Overview</h2>
            <p className="text-sm text-zinc-500">{DATE_RANGE_LABELS[dateRange]}</p>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="p-4 bg-zinc-50 border border-zinc-200 rounded-lg animate-pulse">
              <div className="h-4 w-20 bg-zinc-200 rounded mb-2" />
              <div className="h-8 w-16 bg-zinc-200 rounded" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mb-8">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Team Overview</h2>
          <p className="text-sm text-zinc-500">{DATE_RANGE_LABELS[dateRange]}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {/* Total Cash Collected */}
        <TeamStatCard
          icon={<DollarSign className="h-4 w-4" />}
          label="Cash Collected"
          value={formatCurrency(teamStats.totalCashCollected)}
          trend={teamStats.cashCollectedTrend}
        />

        {/* Total Closed Deals */}
        <TeamStatCard
          icon={<CheckCircle2 className="h-4 w-4" />}
          label="Closed Deals"
          value={teamStats.totalClosedDeals.toString()}
          trend={teamStats.closedDealsTrend}
        />

        {/* Total Calls Taken */}
        <TeamStatCard
          icon={<Phone className="h-4 w-4" />}
          label="Calls Taken"
          value={teamStats.totalCallsTaken.toString()}
          trend={teamStats.callsTakenTrend}
        />

        {/* Team Close Rate */}
        <TeamStatCard
          icon={<Target className="h-4 w-4" />}
          label="Close Rate"
          value={formatPercent(teamStats.teamCloseRate)}
          trend={teamStats.closeRateTrend}
          trendSuffix=" pts"
        />

        {/* Average Deal Value */}
        <TeamStatCard
          icon={<BarChart3 className="h-4 w-4" />}
          label="Avg Deal Value"
          value={teamStats.averageDealValue > 0 ? formatCurrency(teamStats.averageDealValue) : "—"}
          trend={teamStats.averageDealValueTrend}
        />

        {/* Show Rate */}
        <TeamStatCard
          icon={<Calendar className="h-4 w-4" />}
          label="Show Rate"
          value={formatPercent(teamStats.showRate)}
          trend={teamStats.showRateTrend}
          trendSuffix=" pts"
        />
      </div>
    </div>
  );
}

export default function CloserStatsPage() {
  const { clerkId, isLoading: isTeamLoading } = useTeam();
  const [dateRange, setDateRange] = useState<DateRange>("last_30_days");

  const stats = useQuery(
    api.closers.getCloserStats,
    clerkId ? { clerkId, dateRange } : "skip"
  );

  const teamStats = useQuery(
    api.closers.getTeamStats,
    clerkId ? { clerkId, dateRange } : "skip"
  );

  const liveStatus = useQuery(
    api.closers.getCloserLiveStatus,
    clerkId ? { clerkId } : "skip"
  );

  if (isTeamLoading || stats === undefined) {
    return (
      <>
        <Header
          title="Closer Stats"
          description="Performance metrics for your team"
        />
        <LoadingState />
      </>
    );
  }

  if (!stats || stats.length === 0) {
    return (
      <>
        <Header
          title="Closer Stats"
          description="Performance metrics for your team"
        />
        <EmptyState />
      </>
    );
  }

  return (
    <>
      <Header
        title="Closer Stats"
        description="Performance metrics for your team"
      />
      <div className="p-6">
        {/* Filters */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-zinc-500" />
            <span className="text-sm text-zinc-500">
              {stats.length} active closer{stats.length !== 1 ? "s" : ""}
            </span>
          </div>
          <Select
            value={dateRange}
            onValueChange={(value) => setDateRange(value as DateRange)}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="today">Today</SelectItem>
              <SelectItem value="this_week">This Week</SelectItem>
              <SelectItem value="this_month">This Month</SelectItem>
              <SelectItem value="last_30_days">Last 30 Days</SelectItem>
              <SelectItem value="all_time">All Time</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Dynamic Summary */}
        <DynamicSummary
          teamStats={teamStats ?? null}
          closerStats={stats}
          dateRange={dateRange}
        />

        {/* Team Overview Section */}
        <TeamStatsSection teamStats={teamStats ?? null} dateRange={dateRange} />

        {/* Section Divider */}
        <div className="flex items-center gap-3 mb-6">
          <h2 className="text-lg font-semibold text-foreground">Individual Performance</h2>
          <div className="flex-1 h-px bg-zinc-200" />
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {stats.map((closer) => (
            <CloserCard
              key={closer.closerId}
              closer={closer}
              liveStatus={liveStatus?.[closer.closerId]}
              dateRange={dateRange}
            />
          ))}
        </div>
      </div>
    </>
  );
}
