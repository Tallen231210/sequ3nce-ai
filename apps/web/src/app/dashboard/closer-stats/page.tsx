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
} from "lucide-react";

type DateRange = "this_week" | "this_month" | "last_30_days" | "all_time";

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
}

function CloserCard({ closer, liveStatus }: CloserCardProps) {
  const hasNoData = closer.callsTaken === 0;

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

export default function CloserStatsPage() {
  const { clerkId, isLoading: isTeamLoading } = useTeam();
  const [dateRange, setDateRange] = useState<DateRange>("last_30_days");

  const stats = useQuery(
    api.closers.getCloserStats,
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
              <SelectItem value="this_week">This Week</SelectItem>
              <SelectItem value="this_month">This Month</SelectItem>
              <SelectItem value="last_30_days">Last 30 Days</SelectItem>
              <SelectItem value="all_time">All Time</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {stats.map((closer) => (
            <CloserCard
              key={closer.closerId}
              closer={closer}
              liveStatus={liveStatus?.[closer.closerId]}
            />
          ))}
        </div>
      </div>
    </>
  );
}
