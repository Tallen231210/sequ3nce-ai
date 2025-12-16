"use client";

import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useTeam } from "@/hooks/useTeam";
import { Header } from "@/components/dashboard/header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Phone,
  Radio,
  TrendingUp,
  UserX,
  ArrowRight,
  Clock,
  Loader2,
} from "lucide-react";
import Link from "next/link";

// Helper to format duration
function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

// Helper to format currency
function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
  }).format(amount);
}

// Loading skeleton for stats
function StatsLoading() {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {[1, 2, 3, 4].map((i) => (
        <Card key={i}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div className="h-4 w-20 bg-zinc-200 rounded animate-pulse" />
            <div className="h-4 w-4 bg-zinc-200 rounded animate-pulse" />
          </CardHeader>
          <CardContent>
            <div className="h-8 w-12 bg-zinc-200 rounded animate-pulse" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// Loading skeleton for call list
function CallListLoading() {
  return (
    <div className="space-y-4">
      {[1, 2, 3].map((i) => (
        <div key={i} className="flex items-center justify-between py-2">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-full bg-zinc-200 animate-pulse" />
            <div className="space-y-2">
              <div className="h-4 w-24 bg-zinc-200 rounded animate-pulse" />
              <div className="h-3 w-32 bg-zinc-200 rounded animate-pulse" />
            </div>
          </div>
          <div className="h-6 w-16 bg-zinc-200 rounded animate-pulse" />
        </div>
      ))}
    </div>
  );
}

export default function DashboardPage() {
  const { team, isLoading: isTeamLoading } = useTeam();

  // Fetch dashboard stats
  const stats = useQuery(
    api.calls.getDashboardStats,
    team?._id ? { teamId: team._id } : "skip"
  );

  // Fetch live calls
  const liveCalls = useQuery(
    api.calls.getLiveCallsWithDetails,
    team?._id ? { teamId: team._id } : "skip"
  );

  // Fetch recent completed calls
  const recentCalls = useQuery(
    api.calls.getRecentCompletedCalls,
    team?._id ? { teamId: team._id, limit: 5 } : "skip"
  );

  const isLoading = isTeamLoading || stats === undefined;

  return (
    <>
      <Header title="Dashboard" />
      <div className="p-6 space-y-6">
        {/* Stats Grid */}
        {isLoading ? (
          <StatsLoading />
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Calls Today
                </CardTitle>
                <Phone className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold">{stats?.callsToday ?? 0}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Live Now
                </CardTitle>
                <Radio className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold">{stats?.liveNow ?? 0}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Close Rate (Week)
                </CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold">{stats?.closeRateWeek ?? 0}%</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  No-Shows (Week)
                </CardTitle>
                <UserX className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold">{stats?.noShowsWeek ?? 0}</div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Live Calls Preview */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base font-semibold">Live Calls</CardTitle>
            <Link
              href="/dashboard/live"
              className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            >
              View all
              <ArrowRight className="h-3 w-3" strokeWidth={1.5} />
            </Link>
          </CardHeader>
          <CardContent>
            {liveCalls === undefined ? (
              <div className="py-8 text-center">
                <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
              </div>
            ) : liveCalls.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">
                No live calls at the moment
              </p>
            ) : (
              <div className="space-y-4">
                {liveCalls.slice(0, 3).map((call) => {
                  const elapsed = call.startedAt
                    ? Math.floor((Date.now() - call.startedAt) / 1000)
                    : 0;

                  return (
                    <div
                      key={call._id}
                      className="flex items-center justify-between py-2"
                    >
                      <div className="flex items-center gap-3">
                        <Avatar className="h-8 w-8">
                          <AvatarFallback className="text-xs bg-primary text-primary-foreground">
                            {call.closerInitials}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="text-sm font-medium">{call.closerName}</p>
                          <p className="text-xs text-muted-foreground">
                            with {call.prospectName || "Unknown Prospect"}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <div className="flex items-center gap-1 text-sm text-muted-foreground">
                            <Clock className="h-3 w-3" strokeWidth={1.5} />
                            {formatDuration(elapsed)}
                          </div>
                        </div>
                        <Badge variant={call.status === "on_call" ? "live" : "secondary"}>
                          {call.status === "on_call" ? "On Call" : "Waiting"}
                        </Badge>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Calls */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base font-semibold">Recent Calls</CardTitle>
            <Link
              href="/dashboard/calls"
              className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            >
              View all
              <ArrowRight className="h-3 w-3" strokeWidth={1.5} />
            </Link>
          </CardHeader>
          <CardContent>
            {recentCalls === undefined ? (
              <CallListLoading />
            ) : recentCalls.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">
                No completed calls yet
              </p>
            ) : (
              <div className="space-y-4">
                {recentCalls.map((call) => (
                  <div
                    key={call._id}
                    className="flex items-center justify-between py-2"
                  >
                    <div className="flex items-center gap-3">
                      <Avatar className="h-8 w-8">
                        <AvatarFallback className="text-xs">
                          {call.closerInitials}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="text-sm font-medium">{call.prospectName || "Unknown"}</p>
                        <p className="text-xs text-muted-foreground">
                          {call.closerName} · {formatDuration(call.duration || 0)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {call.dealValue && (
                        <span className="text-sm font-medium">
                          {formatCurrency(call.dealValue)}
                        </span>
                      )}
                      <Badge
                        variant={
                          call.outcome === "closed"
                            ? "default"
                            : call.outcome === "no_show"
                            ? "destructive"
                            : "secondary"
                        }
                      >
                        {call.outcome === "closed"
                          ? "Closed"
                          : call.outcome === "lost"
                          ? "Not Closed"
                          : call.outcome === "no_show"
                          ? "No-Show"
                          : call.outcome === "follow_up"
                          ? "Follow Up"
                          : call.outcome || "Unknown"}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
