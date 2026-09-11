"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { useTeam } from "@/hooks/useTeam";
import { Header } from "@/components/dashboard/header";
import { DateRangePicker } from "@/components/DateRangePicker";
import { RoiTab } from "./components/RoiTab";
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
  ChevronDown,
  ChevronUp,
  Sparkles,
  Calendar,
} from "lucide-react";

type DateRange = "today" | "this_week" | "this_month" | "last_30_days" | "all_time" | "custom";

const DATE_RANGE_LABELS: Record<DateRange, string> = {
  today: "Today",
  this_week: "This Week",
  this_month: "This Month",
  last_30_days: "Last 30 Days",
  all_time: "All Time",
  custom: "Custom Range",
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
    return <Badge className="border-foreground bg-foreground text-background hover:bg-foreground">#1</Badge>;
  }
  if (rank === 2 || rank === 3) {
    return (
      <Badge variant="outline" className="border-border text-muted-foreground">
        #{rank}
      </Badge>
    );
  }
  return null;
}

function LiveStatusIndicator({ status }: { status?: "on_call" | "waiting" }) {
  if (!status) return null;

  if (status === "on_call") {
    return <Badge className="border-foreground bg-foreground text-background hover:bg-foreground">On a call now</Badge>;
  }

  return (
    <Badge variant="outline" className="border-border text-muted-foreground">
      Waiting for a call
    </Badge>
  );
}

interface CloserCardProps {
  closer: {
    closerId: string;
    name: string;
    email: string;
    status: string;
    calendarProvider?: string;
    closeRate: number;
    cashCollected: number;
    callsTaken: number;
    avgCallLength: number;
    showRate: number;
    avgDealValue: number;
    followUpConversionRate: number;
    talkToListenRatio: number | null;
    revenuePerCallCash: number;
    revenuePerCallContract: number;
    revenuePerSitCash: number;
    revenuePerSitContract: number;
    revenuePerCallTrend: number | null;
    revenuePerSitTrend: number | null;
    revenueThisWeek: number;
    revenueThisMonth: number;
    callsThisWeek: number;
    callsThisMonth: number;
    // Optional so a web deploy that lands before the Convex one renders the
    // old numbers rather than "$NaN".
    cashThisWeek?: number;
    cashThisMonth?: number;
    takenThisWeek?: number;
    takenThisMonth?: number;
    closeRateTrend: number | null;
    cashCollectedTrend: number | null;
    callsTakenTrend: number | null;
    rank: number;
  };
  liveStatus?: "on_call" | "waiting";
  /** What to call the period on screen — the page's month, or this tab's own choice. */
  rangeLabel: string;
}

/** "this month" reads fine on its own; "July 2026" needs an "in" in front of it. */
function periodPhrase(rangeLabel: string): string {
  return /^(today|this|last|all)\b/i.test(rangeLabel) ? rangeLabel.toLowerCase() : `in ${rangeLabel}`;
}

/**
 * The card's summary: facts about this closer's period, not opinions about
 * them. The old version graded people ("needs attention", "may be rushing")
 * from thresholds nobody set, which isn't ours to say — the manager reads the
 * numbers and decides.
 */
function generateCloserInsights(closer: CloserCardProps["closer"], rangeLabel: string): string[] {
  const facts: string[] = [];
  const periodLabel = periodPhrase(rangeLabel);
  if (closer.callsTaken > 0) {
    const closed = Math.round((closer.closeRate / 100) * closer.callsTaken);
    facts.push(`Closed ${closed} of ${closer.callsTaken} calls ${periodLabel} — ${formatPercent(closer.closeRate)}.`);
  }
  if (closer.cashCollected > 0) {
    facts.push(`Collected ${formatCurrency(closer.cashCollected)}${closer.avgDealValue > 0 ? `, ${formatCurrency(closer.avgDealValue)} a deal on average` : ""}.`);
  }
  if (closer.closeRateTrend !== null && Math.abs(closer.closeRateTrend) >= 1) {
    const dir = closer.closeRateTrend > 0 ? "up" : "down";
    facts.push(`Close rate ${dir} ${Math.abs(closer.closeRateTrend).toFixed(0)} points on the period before.`);
  }
  if (closer.avgCallLength > 0) {
    facts.push(`Calls run ${Math.round(closer.avgCallLength / 60)} minutes on average.`);
  }
  if (closer.callsTaken > 0 && closer.rank <= 3) {
    facts.push(`${closer.rank === 1 ? "Top of the team" : `Number ${closer.rank} on the team`} for cash collected.`);
  }
  return facts.slice(0, 4);
}

function CloserCard({ closer, liveStatus, rangeLabel }: CloserCardProps) {
  const hasNoData = closer.callsTaken === 0;
  const [showInsights, setShowInsights] = useState(false);
  const insights = generateCloserInsights(closer, rangeLabel);

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
            {closer.calendarProvider && (
              <Badge variant="outline" className="h-5 gap-1 border-border px-1.5 py-0 text-[11px] text-muted-foreground" title="Their calendar is connected">
                <Calendar className="h-3 w-3" />
                Calendar connected
              </Badge>
            )}
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
                  <span className="text-zinc-500">Avg Deal Value</span>
                  <span className="font-medium">
                    {closer.avgDealValue > 0 ? formatCurrency(closer.avgDealValue) : "—"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">Cash per call taken</span>
                  <span className="flex items-center gap-1.5 font-medium">
                    {closer.revenuePerCallCash > 0 ? formatCurrency(closer.revenuePerCallCash) : "—"}
                    <TrendIndicator value={closer.revenuePerCallTrend} />
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">Contract value per call taken</span>
                  <span className="font-medium">{closer.revenuePerCallContract > 0 ? formatCurrency(closer.revenuePerCallContract) : "—"}</span>
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
                  <p className="mb-1 text-xs text-muted-foreground">Cash this week</p>
                  <p className="text-sm font-medium">{formatCurrency(closer.cashThisWeek ?? closer.revenueThisWeek)}</p>
                  <p className="text-xs text-muted-foreground">
                    {closer.takenThisWeek ?? closer.callsThisWeek} {(closer.takenThisWeek ?? closer.callsThisWeek) === 1 ? "call" : "calls"}
                  </p>
                </div>
                <div>
                  <p className="mb-1 text-xs text-muted-foreground">Cash this month</p>
                  <p className="text-sm font-medium">{formatCurrency(closer.cashThisMonth ?? closer.revenueThisMonth)}</p>
                  <p className="text-xs text-muted-foreground">
                    {closer.takenThisMonth ?? closer.callsThisMonth} {(closer.takenThisMonth ?? closer.callsThisMonth) === 1 ? "call" : "calls"}
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
                      {rangeLabel} summary
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
  rangeLabel: string;
}

function DynamicSummary({ teamStats, closerStats, rangeLabel }: DynamicSummaryProps) {
  if (!teamStats || closerStats.length === 0) {
    return null;
  }

  // Generate insights based on the data
  const insights: string[] = [];
  const periodLabel = periodPhrase(rangeLabel);

  // Total revenue insight
  if (teamStats.totalCashCollected > 0) {
    insights.push(`Team collected ${formatCurrency(teamStats.totalCashCollected)} from ${teamStats.totalClosedDeals} deal${teamStats.totalClosedDeals !== 1 ? "s" : ""} ${periodLabel}.`);
  } else {
    insights.push(`No closed deals ${periodLabel} yet.`);
  }

  // Close rate insight
  if (teamStats.totalCallsTaken > 0) {
    insights.push(`The team closed ${formatPercent(teamStats.teamCloseRate)} of ${teamStats.totalCallsTaken} calls.`);
  }

  // Top performer insight
  const topPerformer = closerStats.find(c => c.rank === 1 && c.callsTaken > 0);
  if (topPerformer) {
    insights.push(`${topPerformer.name.split(" ")[0]} collected the most, closing ${formatPercent(topPerformer.closeRate)} of their calls.`);
  }

  // Trend insight
  if (teamStats.cashCollectedTrend !== null && teamStats.cashCollectedTrend !== 0) {
    const trendDirection = teamStats.cashCollectedTrend > 0 ? "up" : "down";
    const trendAmount = Math.abs(teamStats.cashCollectedTrend).toFixed(0);
    insights.push(`Cash is ${trendDirection} ${trendAmount}% on the period before.`);
  }

  if (insights.length === 0) {
    return null;
  }

  return (
    <div className="mb-6 rounded-lg border border-border bg-muted/40 p-4">
      <div className="flex items-start gap-3">
        <div className="shrink-0 rounded-lg bg-background p-2 text-muted-foreground">
          <BarChart3 className="h-4 w-4" />
        </div>
        <div>
          <h3 className="font-medium text-foreground mb-1">
            {rangeLabel} summary
          </h3>
          <ul className="space-y-0.5 text-sm leading-relaxed text-muted-foreground">
            {insights.map((i) => (
              <li key={i}>{i}</li>
            ))}
          </ul>
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
  rangeLabel: string;
}

function TeamStatsSection({ teamStats, rangeLabel }: TeamStatsSectionProps) {
  // Show empty state if no stats
  if (!teamStats) {
    return (
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Team Overview</h2>
            <p className="text-sm text-zinc-500">{rangeLabel}</p>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {[1, 2, 3, 4, 5].map((i) => (
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
          <p className="text-sm text-zinc-500">{rangeLabel}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
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
      </div>
    </div>
  );
}

const TABS = ["performance", "roi"] as const;
type TabId = (typeof TABS)[number];

function isTabId(v: string | null): v is TabId {
  return TABS.includes(v as TabId);
}

/**
 * Closer stats: per-closer cards with insights, team stats, and the ROI tab.
 * Rendered inside Closer Performance (embedded: no page header, sub-tab
 * state kept local) — the old /dashboard/closer-stats route redirects there.
 */
export function CloserStatsView({
  embedded = false,
  initialSubTab,
  period,
}: {
  embedded?: boolean;
  initialSubTab?: string | null;
  /**
   * The month the page as a whole is showing. When it's given, this tab
   * follows it instead of offering a second date picker that disagreed with
   * the one at the top of the page.
   */
  period?: { start: number; end: number; label: string };
}) {
  const [tab, setTab] = useState<TabId>(isTabId(initialSubTab ?? null) ? (initialSubTab as TabId) : "performance");
  function changeTab(next: TabId) {
    setTab(next);
  }

  const { clerkId, isLoading: isTeamLoading } = useTeam();
  const [ownRange, setOwnRange] = useState<DateRange>("last_30_days");
  const [customStart, setCustomStart] = useState<number | undefined>(undefined);
  const [customEnd, setCustomEnd] = useState<number | undefined>(undefined);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const dateRange: DateRange = period ? "custom" : ownRange;
  const setDateRange = setOwnRange;
  const rangeLabel = period
    ? period.label
    : dateRange === "custom" && customStart && customEnd
      ? `${new Date(customStart).toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${new Date(customEnd).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
      : DATE_RANGE_LABELS[dateRange];

  const queryArgs = period
    ? clerkId
      ? { clerkId, dateRange: "custom" as const, customStart: period.start, customEnd: period.end }
      : null
    : dateRange === "custom" && customStart && customEnd
      ? { clerkId: clerkId!, dateRange, customStart, customEnd }
      : clerkId
        ? { clerkId, dateRange }
        : null;

  const stats = useQuery(
    api.closers.getCloserStats,
    queryArgs ?? "skip"
  );

  const teamStats = useQuery(
    api.closers.getTeamStats,
    queryArgs ?? "skip"
  );

  const liveStatus = useQuery(
    api.closers.getCloserLiveStatus,
    clerkId ? { clerkId } : "skip"
  );

  const header = embedded ? null : <Header title="Closer Stats" description="Performance metrics for your team" />;

  if (isTeamLoading || stats === undefined) {
    return (
      <>
        {header}
        <LoadingState />
      </>
    );
  }

  if (!stats || stats.length === 0) {
    return (
      <>
        {header}
        <EmptyState />
      </>
    );
  }

  return (
    <>
      {header}
      <div className={embedded ? "" : "px-6 pt-4"}>
        {/* Tab nav */}
        <nav className="mb-4 flex gap-1 border-b border-border">
          {(["performance", "roi"] as const).map((id) => (
            <button
              key={id}
              onClick={() => changeTab(id)}
              className={
                "relative px-4 py-2 text-sm font-medium transition-colors " +
                (tab === id
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground")
              }
            >
              {id === "performance" ? "Performance" : "ROI"}
              {tab === id && (
                <span className="absolute bottom-[-1px] left-0 right-0 h-0.5 bg-foreground" />
              )}
            </button>
          ))}
        </nav>
      </div>
      {tab === "roi" && <RoiTab />}
      {tab === "performance" && <div className="p-6">
        {/* Filters */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-zinc-500" />
            <span className="text-sm text-zinc-500">
              {stats.length} active closer{stats.length !== 1 ? "s" : ""}
            </span>
          </div>
          {period ? (
            <span className="text-sm text-muted-foreground">{period.label}</span>
          ) : (
          <div className="relative">
            <Select
              value={dateRange}
              onValueChange={(value) => {
                setDateRange(value as DateRange);
                if (value === "custom") {
                  setShowDatePicker(true);
                } else {
                  setShowDatePicker(false);
                }
              }}
            >
              <SelectTrigger className="w-[200px]">
                <SelectValue>
                  {dateRange === "custom" && customStart && customEnd
                    ? `${new Date(customStart).toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${new Date(customEnd).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
                    : DATE_RANGE_LABELS[dateRange]}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="today">Today</SelectItem>
                <SelectItem value="this_week">This Week</SelectItem>
                <SelectItem value="this_month">This Month</SelectItem>
                <SelectItem value="last_30_days">Last 30 Days</SelectItem>
                <SelectItem value="all_time">All Time</SelectItem>
                <SelectItem value="custom">Custom Range</SelectItem>
              </SelectContent>
            </Select>
            {showDatePicker && (
              <div className="absolute top-full right-0 mt-2 z-50">
                <DateRangePicker
                  onApply={(start, end) => {
                    setCustomStart(start);
                    setCustomEnd(end);
                    setShowDatePicker(false);
                  }}
                  onClear={() => {
                    setCustomStart(undefined);
                    setCustomEnd(undefined);
                    setDateRange("last_30_days");
                    setShowDatePicker(false);
                  }}
                  initialStart={customStart}
                  initialEnd={customEnd}
                />
              </div>
            )}
          </div>
          )}
        </div>

        {/* Dynamic Summary */}
        <DynamicSummary teamStats={teamStats ?? null} closerStats={stats} rangeLabel={rangeLabel} />

        {/* Team Overview Section */}
        <TeamStatsSection teamStats={teamStats ?? null} rangeLabel={rangeLabel} />

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
              rangeLabel={rangeLabel}
            />
          ))}
        </div>
      </div>}
    </>
  );
}
