"use client";

import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { useTeam } from "@/hooks/useTeam";
import { Header } from "@/components/dashboard/header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  MessageSquareText,
  ChevronDown,
  Filter,
  X,
  Flag,
  CheckCircle2,
  Clock,
  MessageCircle,
} from "lucide-react";
import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";

type StatusFilter = "all" | "flagged" | "reviewed";
type DateFilter = "all" | "today" | "this_week" | "this_month" | "last_30_days";

const DATE_FILTER_OPTIONS: { value: DateFilter; label: string }[] = [
  { value: "all", label: "All Time" },
  { value: "today", label: "Today" },
  { value: "this_week", label: "This Week" },
  { value: "this_month", label: "This Month" },
  { value: "last_30_days", label: "Last 30 Days" },
];

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
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

function isWithinDateFilter(timestamp: number, filter: DateFilter): boolean {
  if (filter === "all") return true;

  const date = new Date(timestamp);
  const now = new Date();

  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);

  switch (filter) {
    case "today":
      return date >= startOfToday;
    case "this_week": {
      const startOfWeek = new Date(now);
      startOfWeek.setDate(now.getDate() - now.getDay());
      startOfWeek.setHours(0, 0, 0, 0);
      return date >= startOfWeek;
    }
    case "this_month": {
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      return date >= startOfMonth;
    }
    case "last_30_days": {
      const thirtyDaysAgo = new Date(now);
      thirtyDaysAgo.setDate(now.getDate() - 30);
      thirtyDaysAgo.setHours(0, 0, 0, 0);
      return date >= thirtyDaysAgo;
    }
    default:
      return true;
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
    <div className="p-6 space-y-3">
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="animate-pulse flex items-center gap-4 p-4 bg-zinc-50 rounded-lg">
          <div className="h-10 w-10 rounded-full bg-zinc-200" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-48 bg-zinc-200 rounded" />
            <div className="h-3 w-32 bg-zinc-100 rounded" />
          </div>
          <div className="h-6 w-16 bg-zinc-100 rounded" />
        </div>
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="p-6">
      <Card>
        <CardContent className="py-16">
          <div className="flex flex-col items-center justify-center text-center">
            <MessageSquareText className="h-12 w-12 text-zinc-400 mb-4" />
            <h3 className="text-lg font-medium mb-2">No call reviews yet</h3>
            <p className="text-zinc-500 text-sm max-w-sm">
              When meeting bots record calls, they&apos;ll appear here for review. Closers can flag calls for your attention.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// Individual call row in the list
function CallReviewRow({
  call,
  onClick,
}: {
  call: {
    _id: string;
    closerName: string;
    prospectName?: string;
    startedAt?: number;
    createdAt: number;
    duration?: number;
    outcome?: string;
    flaggedForReview?: boolean;
    reviewStatus?: string;
    commentCount: number;
    summary?: string;
  };
  onClick: () => void;
}) {
  const initials = call.closerName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div
      className="flex items-center gap-4 p-4 rounded-lg border border-border bg-card hover:bg-accent/50 cursor-pointer transition-colors"
      onClick={onClick}
    >
      {/* Closer avatar */}
      <Avatar className="h-10 w-10 shrink-0">
        <AvatarFallback className="text-xs font-medium">{initials}</AvatarFallback>
      </Avatar>

      {/* Call info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium truncate">
            {call.prospectName || "Unknown Prospect"}
          </p>
          {call.flaggedForReview && call.reviewStatus !== "reviewed" && (
            <Flag className="h-3.5 w-3.5 text-orange-500 shrink-0" />
          )}
          {call.reviewStatus === "reviewed" && (
            <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
          )}
        </div>
        <p className="text-xs text-muted-foreground truncate">
          {call.closerName} &middot;{" "}
          {call.startedAt ? formatDate(call.startedAt) : formatDate(call.createdAt)}
        </p>
      </div>

      {/* Duration */}
      {call.duration && call.duration > 0 && (
        <div className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
          <Clock className="h-3.5 w-3.5" />
          {formatDuration(call.duration)}
        </div>
      )}

      {/* Comment count */}
      {call.commentCount > 0 && (
        <div className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
          <MessageCircle className="h-3.5 w-3.5" />
          {call.commentCount}
        </div>
      )}

      {/* Outcome badge */}
      {getOutcomeBadge(call.outcome)}
    </div>
  );
}

// Section header with count and collapsible
function SectionHeader({
  title,
  count,
  icon: Icon,
  iconColor,
}: {
  title: string;
  count: number;
  icon: React.ElementType;
  iconColor: string;
}) {
  return (
    <div className="flex items-center gap-2 mb-2 mt-6 first:mt-0">
      <Icon className={`h-4 w-4 ${iconColor}`} />
      <h3 className="text-sm font-medium text-foreground">{title}</h3>
      <Badge variant="secondary" className="text-xs">
        {count}
      </Badge>
    </div>
  );
}

export default function CallReviewsPage() {
  const { team, isLoading: isTeamLoading } = useTeam();
  const router = useRouter();

  // Filter state
  const [dateFilter, setDateFilter] = useState<DateFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [selectedClosers, setSelectedClosers] = useState<Set<string>>(new Set());

  // Fetch all calls for review using the new query
  const calls = useQuery(
    api.callReviews.getCallsForReview,
    team?._id ? { teamId: team._id } : "skip"
  );

  // Get unique closers for filter dropdown
  const uniqueClosers = useMemo(() => {
    if (!calls) return [];
    const closerMap = new Map<string, { id: string; name: string }>();
    for (const call of calls) {
      if (call.closerId && !closerMap.has(call.closerId)) {
        closerMap.set(call.closerId, {
          id: call.closerId,
          name: call.closerName || "Unknown",
        });
      }
    }
    return Array.from(closerMap.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [calls]);

  // Apply filters
  const filteredCalls = useMemo(() => {
    if (!calls) return [];

    return calls.filter((call) => {
      // Date filter
      const callDate = call.startedAt || call.createdAt;
      if (!isWithinDateFilter(callDate, dateFilter)) return false;

      // Status filter
      if (statusFilter === "flagged") {
        if (!call.flaggedForReview || call.reviewStatus === "reviewed") return false;
      } else if (statusFilter === "reviewed") {
        if (call.reviewStatus !== "reviewed") return false;
      }

      // Closer filter
      if (selectedClosers.size > 0) {
        if (!selectedClosers.has(call.closerId)) return false;
      }

      return true;
    });
  }, [calls, dateFilter, statusFilter, selectedClosers]);

  // Group calls into sections
  const { flaggedCalls, reviewedCalls, allCalls } = useMemo(() => {
    const flagged = filteredCalls.filter(
      (c) => c.flaggedForReview && c.reviewStatus !== "reviewed"
    );
    const reviewed = filteredCalls.filter((c) => c.reviewStatus === "reviewed");
    const rest = filteredCalls.filter(
      (c) => !c.flaggedForReview && c.reviewStatus !== "reviewed"
    );
    return { flaggedCalls: flagged, reviewedCalls: reviewed, allCalls: rest };
  }, [filteredCalls]);

  const hasActiveFilters = dateFilter !== "all" || statusFilter !== "all" || selectedClosers.size > 0;

  const clearAllFilters = () => {
    setDateFilter("all");
    setStatusFilter("all");
    setSelectedClosers(new Set());
  };

  const toggleCloser = (closerId: string) => {
    const newSet = new Set(selectedClosers);
    if (newSet.has(closerId)) {
      newSet.delete(closerId);
    } else {
      newSet.add(closerId);
    }
    setSelectedClosers(newSet);
  };

  if (isTeamLoading || calls === undefined) {
    return (
      <>
        <Header
          title="Call Reviews"
          description="Review and leave feedback on call recordings"
        />
        <LoadingState />
      </>
    );
  }

  if (!calls || calls.length === 0) {
    return (
      <>
        <Header
          title="Call Reviews"
          description="Review and leave feedback on call recordings"
        />
        <EmptyState />
      </>
    );
  }

  return (
    <>
      <Header
        title="Call Reviews"
        description="Review and leave feedback on call recordings"
      />
      <div className="p-6">
        {/* Filter Bar */}
        <div className="mb-4 flex flex-wrap items-center gap-3">
          {/* Status Filter */}
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="flagged">Flagged</SelectItem>
              <SelectItem value="reviewed">Reviewed</SelectItem>
            </SelectContent>
          </Select>

          {/* Date Filter */}
          <Select value={dateFilter} onValueChange={(v) => setDateFilter(v as DateFilter)}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Date" />
            </SelectTrigger>
            <SelectContent>
              {DATE_FILTER_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Closer Filter (Multi-select) */}
          {uniqueClosers.length > 1 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="w-[160px] justify-between">
                  <span className="truncate">
                    {selectedClosers.size === 0
                      ? "All Closers"
                      : selectedClosers.size === 1
                        ? uniqueClosers.find((c) => selectedClosers.has(c.id))?.name || "1 Selected"
                        : `${selectedClosers.size} Selected`}
                  </span>
                  <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-[200px] max-h-[300px] overflow-y-auto">
                {uniqueClosers.map((closer) => (
                  <DropdownMenuCheckboxItem
                    key={closer.id}
                    checked={selectedClosers.has(closer.id)}
                    onCheckedChange={() => toggleCloser(closer.id)}
                  >
                    {closer.name}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {/* Clear Filters */}
          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={clearAllFilters}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4 mr-1" />
              Clear
            </Button>
          )}

          {/* Results Count */}
          <span className="text-sm text-muted-foreground ml-auto">
            {filteredCalls.length} of {calls.length} recordings
          </span>
        </div>

        {/* No Results */}
        {filteredCalls.length === 0 ? (
          <Card>
            <CardContent className="py-16 text-center">
              <Filter className="h-10 w-10 text-zinc-300 mx-auto mb-3" />
              <p className="text-muted-foreground">No calls match your filters</p>
              <Button variant="link" onClick={clearAllFilters} className="mt-2">
                Clear all filters
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-1">
            {/* Flagged for Review */}
            {flaggedCalls.length > 0 && statusFilter !== "reviewed" && (
              <>
                <SectionHeader
                  title="Flagged for Review"
                  count={flaggedCalls.length}
                  icon={Flag}
                  iconColor="text-orange-500"
                />
                <div className="space-y-2">
                  {flaggedCalls.map((call) => (
                    <CallReviewRow
                      key={call._id}
                      call={call}
                      onClick={() => router.push(`/dashboard/call-reviews/${call._id}`)}
                    />
                  ))}
                </div>
              </>
            )}

            {/* Reviewed */}
            {reviewedCalls.length > 0 && statusFilter !== "flagged" && (
              <>
                <SectionHeader
                  title="Reviewed"
                  count={reviewedCalls.length}
                  icon={CheckCircle2}
                  iconColor="text-green-500"
                />
                <div className="space-y-2">
                  {reviewedCalls.map((call) => (
                    <CallReviewRow
                      key={call._id}
                      call={call}
                      onClick={() => router.push(`/dashboard/call-reviews/${call._id}`)}
                    />
                  ))}
                </div>
              </>
            )}

            {/* All Recordings (unflagged, unreviewed) */}
            {allCalls.length > 0 && statusFilter === "all" && (
              <>
                <SectionHeader
                  title="All Recordings"
                  count={allCalls.length}
                  icon={MessageSquareText}
                  iconColor="text-zinc-400"
                />
                <div className="space-y-2">
                  {allCalls.map((call) => (
                    <CallReviewRow
                      key={call._id}
                      call={call}
                      onClick={() => router.push(`/dashboard/call-reviews/${call._id}`)}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </>
  );
}
