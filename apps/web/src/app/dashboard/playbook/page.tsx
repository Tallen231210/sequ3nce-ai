"use client";

import { useState, useRef, useEffect } from "react";
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
  ListMusic,
} from "lucide-react";
import Link from "next/link";
import { PlaylistsView } from "./PlaylistsView";

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

// Parse transcript text into segments with timestamps
interface TranscriptSegment {
  timestamp: number;
  speaker: string;
  text: string;
}

function parseTranscriptSegments(transcriptText: string): TranscriptSegment[] {
  const segments: TranscriptSegment[] = [];
  
  // Match patterns like "[5:55] Prospect:" or "[6:00] Closer:"
  const regex = /\[(\d+):(\d+)\]\s*(Prospect|Closer):\s*(?:\[(?:Prospect|Closer)\]:\s*)?(.+?)(?=\[|\n\n|$)/g;
  
  let match;
  while ((match = regex.exec(transcriptText)) !== null) {
    const minutes = parseInt(match[1], 10);
    const seconds = parseInt(match[2], 10);
    const timestamp = minutes * 60 + seconds;
    const speaker = match[3];
    const text = match[4].trim();
    
    if (text) {
      segments.push({ timestamp, speaker, text });
    }
  }
  
  return segments;
}

// Snippet Audio Player Component with transcript following
interface SnippetAudioPlayerProps {
  src: string;
  startTime: number;
  endTime: number;
  transcriptText: string;
}

function SnippetAudioPlayer({ src, startTime, endTime, transcriptText }: SnippetAudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(startTime);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [activeSegmentIndex, setActiveSegmentIndex] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);

  // Debug logging on mount
  console.log('[Playbook Audio] Component mounted with:', {
    startTime,
    endTime,
    snippetDuration: endTime - startTime,
    srcPreview: src?.slice(0, 80),
    transcriptPreview: transcriptText?.slice(0, 100)
  });

  // Parse transcript into segments
  const segments = parseTranscriptSegments(transcriptText);

  // Find active segment based on current time
  const updateActiveSegment = (time: number) => {
    for (let i = segments.length - 1; i >= 0; i--) {
      if (time >= segments[i].timestamp) {
        setActiveSegmentIndex(i);
        return;
      }
    }
    setActiveSegmentIndex(0);
  };

  // Enable play button after timeout as fallback (WebM files sometimes don't fire canplay)
  useEffect(() => {
    const timeout = setTimeout(() => {
      if (isLoading && !hasError) {
        console.log('[Playbook Audio] Enabling play via timeout fallback');
        setIsLoading(false);
      }
    }, 2000);
    return () => clearTimeout(timeout);
  }, [isLoading, hasError]);

  const handleCanPlay = () => {
    setIsLoading(false);
    if (audioRef.current) {
      setAudioDuration(audioRef.current.duration);
      console.log('[Playbook Audio] Ready to play. Audio duration:', audioRef.current.duration, 'seconds');
      console.log('[Playbook Audio] Snippet range:', startTime, 'to', endTime, '(', endTime - startTime, 'seconds)');

      // Verify timestamps are within audio range
      if (startTime > audioRef.current.duration) {
        console.warn('[Playbook Audio] WARNING: startTime', startTime, 'exceeds audio duration', audioRef.current.duration);
      }
    }
  };

  const handleError = (e: React.SyntheticEvent<HTMLAudioElement, Event>) => {
    setIsLoading(false);
    setHasError(true);
    console.error('[Playbook Audio] Error loading audio:', e);
  };

  const togglePlay = async () => {
    if (!audioRef.current || hasError) return;

    // If still showing loading, force it off and try to play
    if (isLoading) {
      setIsLoading(false);
    }

    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
      console.log('[Playbook Audio] Paused at:', audioRef.current.currentTime);
    } else {
      try {
        console.log('[Playbook Audio] Attempting to play from:', startTime, 'to:', endTime);
        audioRef.current.currentTime = startTime;
        console.log('[Playbook Audio] Set currentTime to:', audioRef.current.currentTime);
        setCurrentTime(startTime);
        updateActiveSegment(startTime);
        await audioRef.current.play();
        setIsPlaying(true);
        console.log('[Playbook Audio] Playing! Current time:', audioRef.current.currentTime);
      } catch (err) {
        console.error('[Playbook Audio] Play failed:', err);
        setHasError(true);
      }
    }
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      const time = audioRef.current.currentTime;
      setCurrentTime(time);
      updateActiveSegment(time);
      
      // Stop at end time
      if (time >= endTime) {
        audioRef.current.pause();
        setIsPlaying(false);
        audioRef.current.currentTime = startTime;
        setCurrentTime(startTime);
        setActiveSegmentIndex(0);
      }
    }
  };

  const snippetDuration = endTime - startTime;
  const progress = Math.min(100, ((currentTime - startTime) / snippetDuration) * 100);

  return (
    <div className="space-y-3">
      {/* Audio Player Controls */}
      <div className="flex items-center gap-3 p-3 bg-zinc-100 rounded-lg">
        <audio
          ref={audioRef}
          src={src}
          preload="auto"
          onCanPlay={handleCanPlay}
          onLoadedData={handleCanPlay}
          onError={handleError}
          onTimeUpdate={handleTimeUpdate}
          onEnded={() => {
            setIsPlaying(false);
            setActiveSegmentIndex(0);
          }}
        />
        <Button
          variant="ghost"
          size="icon"
          onClick={togglePlay}
          disabled={isLoading || hasError}
          className="h-10 w-10 rounded-full bg-foreground text-background hover:bg-zinc-700 disabled:opacity-50"
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : isPlaying ? (
            <Pause className="h-4 w-4" />
          ) : (
            <Play className="h-4 w-4 ml-0.5" />
          )}
        </Button>
        <div className="flex-1">
          {/* Progress bar */}
          <div className="h-1.5 bg-zinc-200 rounded-full overflow-hidden mb-1">
            <div 
              className="h-full bg-foreground transition-all duration-100"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="text-xs text-zinc-500 font-mono">
            {formatTimestamp(currentTime)} / {formatTimestamp(endTime)}
          </div>
        </div>
      </div>

      {/* Scrolling Transcript */}
      {segments.length > 0 && (
        <div className="space-y-2 max-h-32 overflow-y-auto">
          {segments.map((segment, index) => (
            <div
              key={index}
              className={`text-sm p-2 rounded transition-all duration-200 ${
                index === activeSegmentIndex && isPlaying
                  ? "bg-yellow-100 border-l-2 border-yellow-500"
                  : "text-zinc-600"
              }`}
            >
              <span className="text-xs text-zinc-400 mr-2">
                [{formatTimestamp(segment.timestamp)}]
              </span>
              <span className={`font-medium ${segment.speaker === "Closer" ? "text-blue-600" : "text-green-600"}`}>
                {segment.speaker}:
              </span>{" "}
              {segment.text}
            </div>
          ))}
        </div>
      )}

      {hasError && (
        <p className="text-xs text-red-500">Unable to load audio. Please try again.</p>
      )}
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

        {/* Audio Player with Scrolling Transcript */}
        {highlight.recordingUrl ? (
          <div className="mb-3">
            <SnippetAudioPlayer
              src={highlight.recordingUrl}
              startTime={highlight.startTimestamp}
              endTime={highlight.endTimestamp}
              transcriptText={highlight.transcriptText}
            />
          </div>
        ) : (
          /* Fallback: Show transcript without audio */
          <div className="mb-3">
            <p className="text-sm text-foreground whitespace-pre-wrap line-clamp-4">
              {highlight.transcriptText}
            </p>
          </div>
        )}

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

  // Tab state
  const [activeTab, setActiveTab] = useState<"highlights" | "playlists">("highlights");

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

  if (isTeamLoading) {
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
        {/* Tab Navigation */}
        <div className="flex items-center gap-1 mb-6 border-b border-zinc-200">
          <button
            onClick={() => setActiveTab("highlights")}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === "highlights"
                ? "border-foreground text-foreground"
                : "border-transparent text-zinc-500 hover:text-zinc-700"
            }`}
          >
            <BookMarked className="h-4 w-4" />
            Highlights
          </button>
          <button
            onClick={() => setActiveTab("playlists")}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === "playlists"
                ? "border-foreground text-foreground"
                : "border-transparent text-zinc-500 hover:text-zinc-700"
            }`}
          >
            <ListMusic className="h-4 w-4" />
            Training Playlists
          </button>
        </div>

        {/* Tab Content */}
        {activeTab === "highlights" ? (
          <>
            {highlights === undefined ? (
              <div className="flex items-center justify-center min-h-[400px]">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
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
              </>
            )}
          </>
        ) : (
          <PlaylistsView clerkId={clerkId || ""} />
        )}
      </div>
    </>
  );
}
