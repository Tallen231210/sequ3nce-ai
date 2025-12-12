"use client";

import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { useTeam } from "@/hooks/useTeam";
import { Header } from "@/components/dashboard/header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useRouter } from "next/navigation";
import { Phone } from "lucide-react";

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
  }).format(amount);
}

// Talk-to-Listen Ratio Bar Component
function TalkRatioBar({ closerTalkTime, prospectTalkTime }: { closerTalkTime?: number; prospectTalkTime?: number }) {
  const total = (closerTalkTime || 0) + (prospectTalkTime || 0);

  if (total === 0) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }

  const closerPercent = Math.round(((closerTalkTime || 0) / total) * 100);
  const prospectPercent = 100 - closerPercent;

  return (
    <div className="w-24">
      <div className="flex items-center gap-1">
        <div className="flex-1 h-1.5 bg-zinc-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-zinc-800 transition-all duration-500"
            style={{ width: `${closerPercent}%` }}
          />
        </div>
      </div>
      <div className="flex justify-between text-[10px] text-muted-foreground mt-0.5">
        <span>{closerPercent}%</span>
        <span>{prospectPercent}%</span>
      </div>
    </div>
  );
}

function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);

  const dateOnly = new Date(date);
  dateOnly.setHours(0, 0, 0, 0);
  const nowOnly = new Date(now);
  nowOnly.setHours(0, 0, 0, 0);
  const yesterdayOnly = new Date(yesterday);
  yesterdayOnly.setHours(0, 0, 0, 0);

  if (dateOnly.getTime() === nowOnly.getTime()) {
    return `Today, ${date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    })}`;
  } else if (dateOnly.getTime() === yesterdayOnly.getTime()) {
    return `Yesterday, ${date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    })}`;
  } else {
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  }
}

function getOutcomeBadge(outcome?: string) {
  switch (outcome) {
    case "closed":
      return <Badge variant="default">Closed</Badge>;
    case "follow_up":
      return <Badge variant="secondary">Follow Up</Badge>;
    case "not_closed":
      return <Badge variant="secondary">Not Closed</Badge>;
    case "lost":
      return <Badge variant="destructive">Lost</Badge>;
    case "no_show":
      return <Badge variant="outline">No-Show</Badge>;
    case "rescheduled":
      return <Badge variant="secondary">Rescheduled</Badge>;
    default:
      return <Badge variant="outline">Pending</Badge>;
  }
}

function LoadingState() {
  return (
    <div className="p-6">
      <Card>
        <CardContent className="p-0">
          <div className="animate-pulse">
            <div className="h-12 bg-zinc-100 border-b border-zinc-200" />
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-16 bg-zinc-50 border-b border-zinc-100" />
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="p-6">
      <Card>
        <CardContent className="py-16">
          <div className="flex flex-col items-center justify-center text-center">
            <Phone className="h-12 w-12 text-zinc-600 mb-4" />
            <h3 className="text-lg font-medium mb-2">No completed calls yet</h3>
            <p className="text-zinc-500 text-sm max-w-sm">
              When your team completes calls, they&apos;ll appear here with recordings, transcripts, and extracted ammo.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function CompletedCallsPage() {
  const { team, isLoading: isTeamLoading } = useTeam();
  const router = useRouter();

  const calls = useQuery(
    api.calls.getCompletedCallsWithCloser,
    team?._id ? { teamId: team._id } : "skip"
  );

  if (isTeamLoading || calls === undefined) {
    return (
      <>
        <Header
          title="Completed Calls"
          description="Review past calls, recordings, and outcomes"
        />
        <LoadingState />
      </>
    );
  }

  if (!calls || calls.length === 0) {
    return (
      <>
        <Header
          title="Completed Calls"
          description="Review past calls, recordings, and outcomes"
        />
        <EmptyState />
      </>
    );
  }

  return (
    <>
      <Header
        title="Completed Calls"
        description="Review past calls, recordings, and outcomes"
      />
      <div className="p-6">
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-[180px]">Date</TableHead>
                  <TableHead>Closer</TableHead>
                  <TableHead>Prospect</TableHead>
                  <TableHead className="w-[100px]">Duration</TableHead>
                  <TableHead className="w-[120px]">Talk Ratio</TableHead>
                  <TableHead className="w-[120px]">Outcome</TableHead>
                  <TableHead className="w-[100px] text-right">Value</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {calls.map((call) => (
                  <TableRow
                    key={call._id}
                    className="cursor-pointer hover:bg-zinc-50"
                    onClick={() => router.push(`/dashboard/calls/${call._id}`)}
                  >
                    <TableCell className="text-sm text-muted-foreground">
                      {call.startedAt ? formatDate(call.startedAt) : formatDate(call.createdAt)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Avatar className="h-7 w-7">
                          <AvatarFallback className="text-xs">
                            {call.closerInitials}
                          </AvatarFallback>
                        </Avatar>
                        <span className="text-sm">{call.closerName}</span>
                      </div>
                    </TableCell>
                    <TableCell className="font-medium">
                      {call.prospectName || "Unknown Prospect"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {call.duration && call.duration > 0 ? formatDuration(call.duration) : "—"}
                    </TableCell>
                    <TableCell>
                      <TalkRatioBar
                        closerTalkTime={call.closerTalkTime}
                        prospectTalkTime={call.prospectTalkTime}
                      />
                    </TableCell>
                    <TableCell>{getOutcomeBadge(call.outcome)}</TableCell>
                    <TableCell className="text-right font-medium">
                      {call.dealValue ? formatCurrency(call.dealValue) : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
