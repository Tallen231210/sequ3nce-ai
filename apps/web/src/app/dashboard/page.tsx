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
} from "lucide-react";
import Link from "next/link";
import {
  mockStats,
  mockLiveCalls,
  mockCompletedCalls,
  formatDuration,
  formatCurrency,
} from "@/lib/mock-data";

export default function DashboardPage() {
  const recentCalls = mockCompletedCalls.slice(0, 5);

  return (
    <>
      <Header title="Dashboard" />
      <div className="p-6 space-y-6">
        {/* Stats Grid */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Calls Today
              </CardTitle>
              <Phone className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold">{mockStats.callsToday}</div>
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
              <div className="text-2xl font-semibold">{mockStats.liveNow}</div>
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
              <div className="text-2xl font-semibold">{mockStats.closeRateWeek}%</div>
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
              <div className="text-2xl font-semibold">{mockStats.noShowsWeek}</div>
            </CardContent>
          </Card>
        </div>

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
            {mockLiveCalls.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">
                No live calls at the moment
              </p>
            ) : (
              <div className="space-y-4">
                {mockLiveCalls.slice(0, 3).map((call) => (
                  <div
                    key={call.id}
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
                          with {call.prospectName}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <div className="flex items-center gap-1 text-sm text-muted-foreground">
                          <Clock className="h-3 w-3" strokeWidth={1.5} />
                          {formatDuration(call.duration)}
                        </div>
                      </div>
                      <Badge variant={call.status === "ON_CALL" ? "live" : "secondary"}>
                        {call.status === "ON_CALL" ? "On Call" : "Waiting"}
                      </Badge>
                    </div>
                  </div>
                ))}
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
            <div className="space-y-4">
              {recentCalls.map((call) => (
                <div
                  key={call.id}
                  className="flex items-center justify-between py-2"
                >
                  <div className="flex items-center gap-3">
                    <Avatar className="h-8 w-8">
                      <AvatarFallback className="text-xs">
                        {call.closerInitials}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="text-sm font-medium">{call.prospectName}</p>
                      <p className="text-xs text-muted-foreground">
                        {call.closerName} · {formatDuration(call.duration)}
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
                        call.outcome === "CLOSED"
                          ? "default"
                          : call.outcome === "NO_SHOW"
                          ? "destructive"
                          : "secondary"
                      }
                    >
                      {call.outcome === "CLOSED"
                        ? "Closed"
                        : call.outcome === "NOT_CLOSED"
                        ? "Not Closed"
                        : call.outcome === "NO_SHOW"
                        ? "No-Show"
                        : "Rescheduled"}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
