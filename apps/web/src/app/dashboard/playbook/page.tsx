"use client";

import { useState, useRef } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Id } from "../../../../convex/_generated/dataModel";
import { useTeam } from "@/hooks/useTeam";
import { Header } from "@/components/dashboard/header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  BookMarked,
  Search,
  Play,
  Pause,
  ExternalLink,
  Trash2,
  Loader2,
  User,
  Calendar,
} from "lucide-react";
import Link from "next/link";

// Highlight categories
const HIGHLIGHT_CATEGORIES = [
  { value: "objection_handling", label: "Objection Handling" },
  { value: "pitch", label: "Pitch" },
  { value: "close", label: "Close" },
  { value: "pain_discovery", label: "Pain Discovery" },
];

function getCategoryLabel(value: string): string {
  const category = HIGHLIGHT_CATEGORIES.find((c) => c.value === value);
  return category?.label || value;
}

function getCategoryColor(value: string): string {
  switch (value) {
    case "objection_handling":
      return "bg-orange-500/10 text-orange-600 border-orange-500/30";
    case "pitch":
      return "bg-blue-500/10 text-blue-600 border-blue-500/30";
    case "close":
      return "bg-green-500/10 text-green-600 border-green-500/30";
    case "pain_discovery":
      return "bg-purple-500/10 text-purple-600 border-purple-500/30";
    default:
      return "bg-zinc-500/10 text-zinc-600 border-zinc-500/30";
  }
}

function formatTimestamp(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// Snippet Audio Player Component
interface SnippetAudioPlayerProps {
  src: string;
  startTime: number;
  endTime: number;
}

function SnippetAudioPlayer({ src, startTime, endTime }: SnippetAudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(startTime);

  // Debug logging
  console.log('[Playbook SnippetAudioPlayer] Props:', { startTime, endTime, snippetDuration: endTime - startTime, src: src?.slice(0, 50) });

  const togglePlay = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        console.log('[Playbook SnippetAudioPlayer] Starting at:', startTime, 'ending at:', endTime);
        audioRef.current.currentTime = startTime;
        audioRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      const time = audioRef.current.currentTime;
      setCurrentTime(time);
      // Stop at end time
      if (time >= endTime) {
        console.log('[Playbook SnippetAudioPlayer] Stopping at:', time);
        audioRef.current.pause();
        setIsPlaying(false);
        audioRef.current.currentTime = startTime;
        setCurrentTime(startTime);
      }
    }
  };

  return (
    <div className="flex items-center gap-3 p-3 bg-zinc-100 rounded-lg">
      <audio
        ref={audioRef}
        src={src}
        onTimeUpdate={handleTimeUpdate}
        onEnded={() => setIsPlaying(false)}
      />
      <Button
        variant="ghost"
        size="icon"
        onClick={togglePlay}
        className="h-8 w-8 rounded-full bg-foreground text-background hover:bg-zinc-700"
      >
        {isPlaying ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3 ml-0.5" />}
      </Button>
      <div className="text-xs text-zinc-500 font-mono">
        {formatTimestamp(currentTime)} / {formatTimestamp(endTime)}
      </div>
    </div>
  );
}

// Highlight Card Component
interface HighlightCardProps {
  highlight: {
    _id: Id<"highlights">;
    callId: Id<"calls">;
    title: string;
    notes?: string;
    category: string;
    transcriptText: string;
    startTimestamp: number;
    endTimestamp: number;
    createdAt: number;
    closerName: string;
    prospectName: string;
    recordingUrl: string | null;
  };
  onDelete: (id: Id<"highlights">) => void;
  isDeleting: boolean;
}

function HighlightCard({ highlight, onDelete, isDeleting }: HighlightCardProps) {
  return (
    <Card className="overflow-hidden">
      <CardContent className="p-5">
        {/* Header */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1 min-w-0">
            <h3 className="font-medium text-foreground truncate mb-1">
              {highlight.title}
            </h3>
            <Badge variant="outline" className={getCategoryColor(highlight.category)}>
              {getCategoryLabel(highlight.category)}
            </Badge>
          </div>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-zinc-400 hover:text-red-500"
                disabled={isDeleting}
              >
                {isDeleting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Highlight</AlertDialogTitle>
                <AlertDialogDescription>
                  Are you sure you want to delete this highlight? This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => onDelete(highlight._id)}
                  className="bg-red-500 hover:bg-red-600"
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>

        {/* Closer Info */}
        <div className="flex items-center gap-4 text-sm text-zinc-500 mb-3">
          <div className="flex items-center gap-1">
            <User className="h-3.5 w-3.5" />
            <span>{highlight.closerName}</span>
          </div>
          <div className="flex items-center gap-1">
            <Calendar className="h-3.5 w-3.5" />
            <span>{formatDate(highlight.createdAt)}</span>
          </div>
        </div>

        {/* Audio Player */}
        {highlight.recordingUrl && (
          <div className="mb-3">
            <SnippetAudioPlayer
              src={highlight.recordingUrl}
              startTime={highlight.startTimestamp}
              endTime={highlight.endTimestamp}
            />
          </div>
        )}

        {/* Transcript */}
        <div className="mb-3">
          <p className="text-sm text-foreground whitespace-pre-wrap line-clamp-4">
            {highlight.transcriptText}
          </p>
        </div>

        {/* Notes */}
        {highlight.notes && (
          <div className="mb-3 p-3 bg-zinc-50 rounded-lg border">
            <p className="text-xs text-zinc-500 mb-1">Notes</p>
            <p className="text-sm text-foreground">{highlight.notes}</p>
          </div>
        )}

        {/* Footer */}
        <div className="pt-3 border-t border-zinc-100">
          <Link
            href={`/dashboard/calls/${highlight.callId}`}
            className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-foreground transition-colors"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            View Full Call with {highlight.prospectName}
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

// Loading State
function LoadingState() {
  return (
    <div className="p-6">
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    </div>
  );
}

// Empty State
function EmptyState({ hasFilters }: { hasFilters: boolean }) {
  return (
    <Card>
      <CardContent className="py-16">
        <div className="flex flex-col items-center justify-center text-center">
          <BookMarked className="h-12 w-12 text-zinc-400 mb-4" />
          <h3 className="text-lg font-medium mb-2">
            {hasFilters ? "No highlights match your filters" : "No highlights yet"}
          </h3>
          <p className="text-zinc-500 text-sm max-w-sm">
            {hasFilters
              ? "Try adjusting your filters to find what you're looking for."
              : "Save transcript segments from completed calls to build your team's training playbook."}
          </p>
          {!hasFilters && (
            <Button variant="outline" className="mt-4" asChild>
              <Link href="/dashboard/calls">Browse Completed Calls</Link>
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default function PlaybookPage() {
  const { clerkId, isLoading: isTeamLoading } = useTeam();

  // Filter state
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [closerFilter, setCloserFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [deletingId, setDeletingId] = useState<Id<"highlights"> | null>(null);

  // Queries
  const highlights = useQuery(
    api.highlights.getHighlights,
    clerkId
      ? {
          clerkId,
          category: categoryFilter !== "all" ? categoryFilter : undefined,
          closerId: closerFilter !== "all" ? (closerFilter as Id<"closers">) : undefined,
          searchQuery: searchQuery || undefined,
        }
      : "skip"
  );

  const closers = useQuery(
    api.highlights.getClosersForFilter,
    clerkId ? { clerkId } : "skip"
  );

  const deleteHighlight = useMutation(api.highlights.deleteHighlight);

  const handleDelete = async (highlightId: Id<"highlights">) => {
    if (!clerkId) return;

    setDeletingId(highlightId);
    try {
      await deleteHighlight({ clerkId, highlightId });
    } catch (error) {
      console.error("Failed to delete highlight:", error);
    } finally {
      setDeletingId(null);
    }
  };

  const hasFilters =
    categoryFilter !== "all" || closerFilter !== "all" || searchQuery.trim() !== "";

  if (isTeamLoading || highlights === undefined) {
    return (
      <>
        <Header
          title="Playbook"
          description="Training highlights from your team's calls"
        />
        <LoadingState />
      </>
    );
  }

  return (
    <>
      <Header
        title="Playbook"
        description="Training highlights from your team's calls"
      />

      <div className="p-6">
        {/* Filters */}
        <div className="flex flex-wrap items-center gap-4 mb-6">
          {/* Category Filter */}
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="All Categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {HIGHLIGHT_CATEGORIES.map((cat) => (
                <SelectItem key={cat.value} value={cat.value}>
                  {cat.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Closer Filter */}
          <Select value={closerFilter} onValueChange={setCloserFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="All Closers" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Closers</SelectItem>
              {closers?.map((closer) => (
                <SelectItem key={closer._id} value={closer._id}>
                  {closer.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Search */}
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
            <Input
              placeholder="Search highlights..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>

          {/* Results count */}
          <div className="text-sm text-zinc-500">
            {highlights.length} highlight{highlights.length !== 1 ? "s" : ""}
          </div>
        </div>

        {/* Highlights Grid */}
        {highlights.length === 0 ? (
          <EmptyState hasFilters={hasFilters} />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {highlights.map((highlight) => (
              <HighlightCard
                key={highlight._id}
                highlight={highlight}
                onDelete={handleDelete}
                isDeleting={deletingId === highlight._id}
              />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
