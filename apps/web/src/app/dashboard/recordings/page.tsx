"use client";

import { useQuery } from "convex/react";
import { CustomRangeControl } from "@/components/CustomRangeControl";
import { RequiresFeature } from "@/components/dashboard/requires-feature";
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
import { Video, ChevronDown, Filter, X } from "lucide-react";
import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { resolvePlayback } from "@/lib/callPlayback";

// Filter types
type DateFilter = "all" | "today" | "this_week" | "this_month" | "last_30_days" | "custom";
type OutcomeFilter = "all" | "closed" | "not_closed" | "follow_up" | "lost" | "no_show" | "rescheduled";

const DATE_FILTER_OPTIONS: { value: DateFilter; label: string }[] = [
  { value: "all", label: "All Time" },
  { value: "today", label: "Today" },
  { value: "this_week", label: "This Week" },
  { value: "this_month", label: "This Month" },
  { value: "last_30_days", label: "Last 30 Days" },
  { value: "custom", label: "Custom range" },
];

const OUTCOME_FILTER_OPTIONS: { value: OutcomeFilter; label: string }[] = [
  { value: "all", label: "All Outcomes" },
  { value: "closed", label: "Closed" },
  { value: "not_closed", label: "Not Closed" },
  { value: "follow_up", label: "Follow Up" },
  { value: "lost", label: "Lost" },
  { value: "no_show", label: "No-Show" },
  { value: "rescheduled", label: "Rescheduled" },
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

function isWithinDateFilter(
  timestamp: number,
  filter: DateFilter,
  customRange: { start: number; end: number } | null,
): boolean {
  if (filter === "all") return true;
  if (filter === "custom") {
    // No range picked yet: show everything rather than nothing.
    if (!customRange) return true;
    return timestamp >= customRange.start && timestamp <= customRange.end;
  }

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

function LoadingState() {
  return (
    <div className="p-6">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <Card key={i}>
            <CardContent className="p-0">
              <div className="animate-pulse">
                <div className="h-48 bg-zinc-100" />
                <div className="p-4 space-y-2">
                  <div className="h-4 w-32 bg-zinc-100 rounded" />
                  <div className="h-3 w-24 bg-zinc-100 rounded" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
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
            <Video className="h-12 w-12 text-zinc-600 mb-4" />
            <h3 className="text-lg font-medium mb-2">No video recordings yet</h3>
            <p className="text-zinc-500 text-sm max-w-sm">
              When meeting bots record calls, video recordings will appear here for review.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// Video card with inline player
function VideoRecordingCard({
  call,
  onClick,
}: {
  call: {
    _id: string;
    closerName: string;
    closerInitials: string;
    prospectName?: string;
    startedAt?: number;
    createdAt: number;
    duration?: number;
    outcome?: string;
    recordingUrl?: string;
    /** Set when someone else hosts the recording — Fathom keeps its own. */
    externalShareUrl?: string;
    source?: string;
  };
  onClick: () => void;
}) {
  const [isPlaying, setIsPlaying] = useState(false);
  const playback = resolvePlayback(call);

  return (
    <Card
      className="overflow-hidden cursor-pointer hover:border-zinc-300 transition-colors"
      onClick={onClick}
    >
      <CardContent className="p-0">
        {/* Video Thumbnail / Player */}
        <div className="relative bg-zinc-900 aspect-video">
          {isPlaying && playback.kind === "video" ? (
            <video
              controls
              autoPlay
              src={playback.url}
              className="w-full h-full object-contain"
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <div
              className="w-full h-full flex items-center justify-center"
              onClick={(e) => {
                e.stopPropagation();
                // Nothing to play inline when the media lives on Fathom — the
                // play button has to become a door rather than doing nothing.
                if (playback.kind === "external") {
                  window.open(playback.url, "_blank", "noopener,noreferrer");
                  return;
                }
                setIsPlaying(true);
              }}
            >
              <div className="h-12 w-12 rounded-full bg-white/20 flex items-center justify-center hover:bg-white/30 transition-colors">
                <div
                  className="ml-1"
                  style={{
                    width: 0,
                    height: 0,
                    borderLeft: "14px solid white",
                    borderTop: "9px solid transparent",
                    borderBottom: "9px solid transparent",
                  }}
                />
              </div>
              {/* Say where it opens, so the new tab isn't a surprise. */}
              {playback.kind === "external" && (
                <span className="absolute top-2 left-2 px-1.5 py-0.5 bg-black/70 text-white text-xs rounded">
                  Opens in {playback.provider}
                </span>
              )}
              {/* Duration overlay */}
              {call.duration && call.duration > 0 && (
                <span className="absolute bottom-2 right-2 px-1.5 py-0.5 bg-black/70 text-white text-xs rounded">
                  {formatDuration(call.duration)}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Card Info */}
        <div className="p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <Avatar className="h-7 w-7 shrink-0">
                <AvatarFallback className="text-xs">
                  {call.closerInitials}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">
                  {call.prospectName || "Unknown Prospect"}
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  {call.closerName}
                </p>
              </div>
            </div>
            {getOutcomeBadge(call.outcome)}
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            {call.startedAt ? formatDate(call.startedAt) : formatDate(call.createdAt)}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function RecordingsPageInner() {
  const { team, isLoading: isTeamLoading } = useTeam();
  const router = useRouter();

  // Filter state
  const [dateFilter, setDateFilter] = useState<DateFilter>("all");
  const [customRange, setCustomRange] = useState<{ start: number; end: number } | null>(null);
  const [outcomeFilter, setOutcomeFilter] = useState<OutcomeFilter>("all");
  const [selectedClosers, setSelectedClosers] = useState<Set<string>>(new Set());

  const recordings = useQuery(
    api.calls.getVideoRecordings,
    team?._id ? { teamId: team._id } : "skip"
  );

  // Get unique closers from recordings for the filter dropdown
  const uniqueClosers = useMemo(() => {
    if (!recordings) return [];
    const closerMap = new Map<string, { id: string; name: string; initials: string }>();
    for (const rec of recordings) {
      if (rec.closerId && !closerMap.has(rec.closerId)) {
        closerMap.set(rec.closerId, {
          id: rec.closerId,
          name: rec.closerName || "Unknown",
          initials: rec.closerInitials || "?",
        });
      }
    }
    return Array.from(closerMap.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [recordings]);

  // Filter recordings
  const filteredRecordings = useMemo(() => {
    if (!recordings) return [];

    return recordings.filter((rec) => {
      // Date filter
      const recDate = rec.startedAt || rec.createdAt;
      if (!isWithinDateFilter(recDate, dateFilter, customRange)) return false;

      // Outcome filter
      if (outcomeFilter !== "all") {
        const recOutcome = rec.outcome || "pending";
        if (recOutcome !== outcomeFilter) return false;
      }

      // Closer filter
      if (selectedClosers.size > 0 && rec.closerId) {
        if (!selectedClosers.has(rec.closerId)) return false;
      }

      return true;
    });
  }, [recordings, dateFilter, customRange, outcomeFilter, selectedClosers]);

  const hasActiveFilters = dateFilter !== "all" || outcomeFilter !== "all" || selectedClosers.size > 0;

  const clearAllFilters = () => {
    setDateFilter("all");
    setCustomRange(null);
    setOutcomeFilter("all");
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

  if (isTeamLoading || recordings === undefined) {
    return (
      <>
        <Header
          title="Video Recordings"
          description="Review bot-recorded meeting videos"
        />
        <LoadingState />
      </>
    );
  }

  if (!recordings || recordings.length === 0) {
    return (
      <>
        <Header
          title="Video Recordings"
          description="Review bot-recorded meeting videos"
        />
        <EmptyState />
      </>
    );
  }

  return (
    <>
      <Header
        title="Video Recordings"
        description="Review bot-recorded meeting videos"
      />
      <div className="p-6">
        {/* Filter Bar */}
        <div className="mb-4 flex flex-wrap items-center gap-3">
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
          {dateFilter === "custom" && (
            <CustomRangeControl range={customRange} onChange={setCustomRange} />
          )}

          {/* Outcome Filter */}
          <Select value={outcomeFilter} onValueChange={(v) => setOutcomeFilter(v as OutcomeFilter)}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Outcome" />
            </SelectTrigger>
            <SelectContent>
              {OUTCOME_FILTER_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Closer Filter (Multi-select) */}
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
                  <div className="flex items-center gap-2">
                    <Avatar className="h-5 w-5">
                      <AvatarFallback className="text-[10px]">
                        {closer.initials}
                      </AvatarFallback>
                    </Avatar>
                    <span>{closer.name}</span>
                  </div>
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Clear Filters */}
          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={clearAllFilters}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4 mr-1" />
              Clear Filters
            </Button>
          )}

          {/* Results Count */}
          <span className="text-sm text-muted-foreground ml-auto">
            {filteredRecordings.length} of {recordings.length} recordings
          </span>
        </div>

        {/* Recordings Grid */}
        {filteredRecordings.length === 0 ? (
          <Card>
            <CardContent className="py-16 text-center">
              <Filter className="h-10 w-10 text-zinc-300 mx-auto mb-3" />
              <p className="text-muted-foreground">No recordings match your filters</p>
              <Button
                variant="link"
                onClick={clearAllFilters}
                className="mt-2"
              >
                Clear all filters
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filteredRecordings.map((rec) => (
              <VideoRecordingCard
                key={rec._id}
                call={rec}
                onClick={() => router.push(`/dashboard/calls/${rec._id}`)}
              />
            ))}
          </div>
        )}
      </div>
    </>
  );
}

/**
 * This page only means anything when our meeting bot is in the call, so it
 * belongs to the Full tier. The sidebar already hides it; this stops the URL
 * working for a team that hasn't bought it.
 */
export default function RecordingsPage() {
  return (
    <RequiresFeature feature="meetingBot">
      <RecordingsPageInner />
    </RequiresFeature>
  );
}
