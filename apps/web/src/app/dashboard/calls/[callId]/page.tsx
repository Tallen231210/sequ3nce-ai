"use client";

import { useParams } from "next/navigation";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { Id } from "../../../../../convex/_generated/dataModel";
import { Header } from "@/components/dashboard/header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ArrowLeft,
  Play,
  Pause,
  Volume2,
  Clock,
  User,
  DollarSign,
  Copy,
  Check,
  AlertCircle,
  Mic,
  Bookmark,
  Loader2,
} from "lucide-react";
import Link from "next/link";
import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useTeam } from "@/hooks/useTeam";

// Types
interface AmmoItem {
  _id: Id<"ammo">;
  callId: Id<"calls">;
  teamId: Id<"teams">;
  text: string;
  type: string;
  timestamp?: number;
  createdAt: number;
}

interface CallDetails {
  _id: Id<"calls">;
  closerId: Id<"closers">;
  teamId: Id<"teams">;
  prospectName?: string;
  status: string;
  outcome?: string;
  dealValue?: number;
  startedAt?: number;
  endedAt?: number;
  duration?: number;
  speakerCount: number;
  recordingUrl?: string;
  transcriptText?: string;
  createdAt: number;
  closer: { name: string; email: string } | null;
  teamName: string | null;
  ammo: AmmoItem[];
}

// Utility functions
function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function formatTimestamp(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
  }).format(amount);
}

function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function getOutcomeBadge(outcome?: string) {
  switch (outcome) {
    case "closed":
      return <Badge variant="default">Closed</Badge>;
    case "not_closed":
      return <Badge variant="secondary">Not Closed</Badge>;
    case "no_show":
      return <Badge variant="outline">No-Show</Badge>;
    case "rescheduled":
      return <Badge variant="secondary">Rescheduled</Badge>;
    default:
      return <Badge variant="outline">Pending</Badge>;
  }
}

function getAmmoTypeColor(type: string): string {
  switch (type) {
    case "emotional":
      return "bg-purple-500/10 text-purple-400 border-purple-500/30";
    case "budget":
      return "bg-green-500/10 text-green-400 border-green-500/30";
    case "pain_point":
      return "bg-red-500/10 text-red-400 border-red-500/30";
    case "urgency":
      return "bg-orange-500/10 text-orange-400 border-orange-500/30";
    case "commitment":
      return "bg-blue-500/10 text-blue-400 border-blue-500/30";
    case "objection_preview":
      return "bg-yellow-500/10 text-yellow-400 border-yellow-500/30";
    default:
      return "bg-zinc-500/10 text-zinc-400 border-zinc-500/30";
  }
}

function getAmmoTypeLabel(type: string): string {
  switch (type) {
    case "emotional":
      return "Emotional";
    case "budget":
      return "Budget";
    case "pain_point":
      return "Pain Point";
    case "urgency":
      return "Urgency";
    case "commitment":
      return "Commitment";
    case "objection_preview":
      return "Objection";
    default:
      return type;
  }
}

// Audio Player Component
interface AudioPlayerProps {
  src: string;
  onTimeUpdate?: (time: number) => void;
  seekTo?: number;
}

function AudioPlayer({ src, onTimeUpdate, seekTo }: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);

  useEffect(() => {
    if (seekTo !== undefined && audioRef.current) {
      audioRef.current.currentTime = seekTo;
      setCurrentTime(seekTo);
    }
  }, [seekTo]);

  const togglePlay = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
      onTimeUpdate?.(audioRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    if (audioRef.current) {
      audioRef.current.currentTime = time;
      setCurrentTime(time);
    }
  };

  const changePlaybackRate = () => {
    const rates = [1, 1.5, 2];
    const currentIndex = rates.indexOf(playbackRate);
    const nextRate = rates[(currentIndex + 1) % rates.length];
    setPlaybackRate(nextRate);
    if (audioRef.current) {
      audioRef.current.playbackRate = nextRate;
    }
  };

  const handleEnded = () => {
    setIsPlaying(false);
  };

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
      <audio
        ref={audioRef}
        src={src}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={handleEnded}
      />

      <div className="flex items-center gap-4">
        {/* Play/Pause button */}
        <Button
          variant="ghost"
          size="icon"
          onClick={togglePlay}
          className="h-12 w-12 rounded-full bg-white text-black hover:bg-zinc-200"
        >
          {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5 ml-0.5" />}
        </Button>

        {/* Time display */}
        <div className="flex items-center gap-2 text-sm font-mono text-zinc-400 min-w-[100px]">
          <span>{formatTimestamp(currentTime)}</span>
          <span>/</span>
          <span>{formatTimestamp(duration)}</span>
        </div>

        {/* Scrubber */}
        <div className="flex-1">
          <input
            type="range"
            min={0}
            max={duration || 0}
            value={currentTime}
            onChange={handleSeek}
            className="w-full h-2 bg-zinc-700 rounded-lg appearance-none cursor-pointer slider"
            style={{
              background: `linear-gradient(to right, white ${(currentTime / duration) * 100}%, #3f3f46 ${(currentTime / duration) * 100}%)`,
            }}
          />
        </div>

        {/* Playback speed */}
        <Button
          variant="ghost"
          size="sm"
          onClick={changePlaybackRate}
          className="text-zinc-400 hover:text-white font-mono text-sm min-w-[48px]"
        >
          {playbackRate}x
        </Button>

        {/* Volume icon */}
        <Volume2 className="h-4 w-4 text-zinc-500" />
      </div>
    </div>
  );
}

// Transcript Segment Type
interface TranscriptSegment {
  speaker: string;
  text: string;
  timestamp: number;
  hasAmmo: boolean;
  ammoText?: string;
}

// Parse transcript text into segments
function parseTranscript(text: string, ammoItems: AmmoItem[]): TranscriptSegment[] {
  if (!text) return [];

  // Simple parsing - split by newlines, try to detect speaker patterns
  const lines = text.split("\n").filter((line) => line.trim());
  const segments: TranscriptSegment[] = [];
  let currentTimestamp = 0;

  for (const line of lines) {
    // Try to detect speaker pattern like "Speaker 1:" or "[00:01:23] Speaker:"
    const timestampMatch = line.match(/\[(\d{2}):(\d{2}):?(\d{2})?\]/);
    if (timestampMatch) {
      const mins = parseInt(timestampMatch[1]) || 0;
      const secs = parseInt(timestampMatch[2]) || 0;
      currentTimestamp = mins * 60 + secs;
    }

    const speakerMatch = line.match(/^(?:\[[\d:]+\]\s*)?(Speaker\s*\d+|Closer|Prospect|Unknown):\s*(.+)/i);

    if (speakerMatch) {
      const speaker = speakerMatch[1];
      const content = speakerMatch[2].trim();

      // Check if this segment contains any ammo
      const matchingAmmo = ammoItems.find(
        (ammo) =>
          content.toLowerCase().includes(ammo.text.toLowerCase().slice(0, 30)) ||
          ammo.text.toLowerCase().includes(content.toLowerCase().slice(0, 30))
      );

      segments.push({
        speaker,
        text: content,
        timestamp: currentTimestamp,
        hasAmmo: !!matchingAmmo,
        ammoText: matchingAmmo?.text,
      });
    } else if (line.trim()) {
      // No speaker detected, add as continuation or new segment
      segments.push({
        speaker: segments.length % 2 === 0 ? "Speaker 1" : "Speaker 2",
        text: line.trim(),
        timestamp: currentTimestamp,
        hasAmmo: false,
      });
    }

    currentTimestamp += 5; // Estimate 5 seconds per segment if no timestamp
  }

  return segments;
}

// Selection state type
interface SelectionState {
  startIndex: number;
  endIndex: number;
  text: string;
  startTimestamp: number;
  endTimestamp: number;
}

// Transcript View Component
interface TranscriptViewProps {
  transcript: string;
  ammoItems: AmmoItem[];
  currentTime: number;
  onSegmentClick: (timestamp: number) => void;
  highlightedAmmo?: string;
  onSelectionChange?: (selection: SelectionState | null) => void;
  selectedIndices?: Set<number>;
}

function TranscriptView({
  transcript,
  ammoItems,
  currentTime,
  onSegmentClick,
  highlightedAmmo,
  onSelectionChange,
  selectedIndices,
}: TranscriptViewProps) {
  const segments = useMemo(() => parseTranscript(transcript, ammoItems), [transcript, ammoItems]);
  const containerRef = useRef<HTMLDivElement>(null);
  const [selectionStart, setSelectionStart] = useState<number | null>(null);
  const [selectionEnd, setSelectionEnd] = useState<number | null>(null);
  const [isSelecting, setIsSelecting] = useState(false);

  // Find the active segment based on current playback time
  const activeSegmentIndex = segments.findIndex(
    (seg, i) =>
      seg.timestamp <= currentTime &&
      (i === segments.length - 1 || segments[i + 1].timestamp > currentTime)
  );

  // Handle mouse down to start drag selection
  const handleMouseDown = (index: number, e: React.MouseEvent) => {
    if (e.shiftKey && selectionStart !== null) {
      // Shift-click for range selection
      const start = Math.min(selectionStart, index);
      const end = Math.max(selectionStart, index);
      setSelectionEnd(end);

      // Build selection text
      const selectedSegments = segments.slice(start, end + 1);
      const text = selectedSegments.map(s => `[${formatTimestamp(s.timestamp)}] ${s.speaker}: ${s.text}`).join("\n\n");
      const startTs = segments[start].timestamp;
      const endTs = segments[end].timestamp + 30; // Estimate end as start + 30 seconds

      onSelectionChange?.({
        startIndex: start,
        endIndex: end,
        text,
        startTimestamp: startTs,
        endTimestamp: endTs,
      });
    } else {
      // Start new drag selection
      setSelectionStart(index);
      setSelectionEnd(null);
      setIsSelecting(true);
      onSelectionChange?.(null);
    }
  };

  // Handle mouse enter during drag
  const handleMouseEnter = (index: number) => {
    if (isSelecting && selectionStart !== null) {
      setSelectionEnd(index);
    }
  };

  // Handle mouse up to end drag selection
  const handleMouseUp = (index: number, timestamp: number) => {
    if (isSelecting && selectionStart !== null) {
      const start = Math.min(selectionStart, index);
      const end = Math.max(selectionStart, index);

      if (start === end) {
        // Single click - seek audio instead of selecting
        setSelectionStart(null);
        setSelectionEnd(null);
        onSelectionChange?.(null);
        onSegmentClick(timestamp);
      } else {
        // Drag completed - build selection
        const selectedSegments = segments.slice(start, end + 1);
        const text = selectedSegments.map(s => `[${formatTimestamp(s.timestamp)}] ${s.speaker}: ${s.text}`).join("\n\n");
        const startTs = segments[start].timestamp;
        const endTs = segments[end].timestamp + 30;

        setSelectionStart(start);
        setSelectionEnd(end);
        onSelectionChange?.({
          startIndex: start,
          endIndex: end,
          text,
          startTimestamp: startTs,
          endTimestamp: endTs,
        });
      }
    }
    setIsSelecting(false);
  };

  // Handle segment click for selection
  const handleSegmentClick = (index: number, timestamp: number, e: React.MouseEvent) => {
    // This is now handled by mouseDown/mouseUp for drag support
    // Keep for keyboard modifiers
    if (e.ctrlKey || e.metaKey) {
      // Ctrl/Cmd-click to select single segment
      setSelectionStart(index);
      setSelectionEnd(index);

      const seg = segments[index];
      onSelectionChange?.({
        startIndex: index,
        endIndex: index,
        text: `[${formatTimestamp(seg.timestamp)}] ${seg.speaker}: ${seg.text}`,
        startTimestamp: seg.timestamp,
        endTimestamp: seg.timestamp + 30,
      });
    }
  };

  // Handle double-click to select single segment for playbook
  const handleDoubleClick = (index: number) => {
    setSelectionStart(index);
    setSelectionEnd(index);

    const seg = segments[index];
    onSelectionChange?.({
      startIndex: index,
      endIndex: index,
      text: `[${formatTimestamp(seg.timestamp)}] ${seg.speaker}: ${seg.text}`,
      startTimestamp: seg.timestamp,
      endTimestamp: seg.timestamp + 30,
    });
  };

  // Clear selection
  const clearSelection = useCallback(() => {
    setSelectionStart(null);
    setSelectionEnd(null);
    onSelectionChange?.(null);
  }, [onSelectionChange]);

  // Is a segment selected?
  const isSegmentSelected = (index: number): boolean => {
    if (selectedIndices && selectedIndices.size > 0) {
      return selectedIndices.has(index);
    }
    if (selectionStart === null) return false;
    if (selectionEnd === null) return index === selectionStart;
    const start = Math.min(selectionStart, selectionEnd);
    const end = Math.max(selectionStart, selectionEnd);
    return index >= start && index <= end;
  };

  if (!transcript) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <AlertCircle className="h-12 w-12 text-zinc-600 mb-4" />
        <p className="text-zinc-400 text-lg">No transcript available</p>
        <p className="text-zinc-600 text-sm mt-2">
          The transcript will appear here once the call is processed
        </p>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="space-y-4">
      <p className="text-xs text-zinc-500 mb-4">
        Tip: Click to play from that point. Drag across segments or double-click to select for playbook.
      </p>
      {segments.map((segment, index) => {
        const isActive = index === activeSegmentIndex;
        const isHighlighted = highlightedAmmo && segment.text.toLowerCase().includes(highlightedAmmo.toLowerCase().slice(0, 30));
        const isSelected = isSegmentSelected(index);
        const isInDragRange = isSelecting && selectionStart !== null &&
          index >= Math.min(selectionStart, selectionEnd ?? selectionStart) &&
          index <= Math.max(selectionStart, selectionEnd ?? selectionStart);

        return (
          <div
            key={index}
            onMouseDown={(e) => handleMouseDown(index, e)}
            onMouseEnter={() => handleMouseEnter(index)}
            onMouseUp={() => handleMouseUp(index, segment.timestamp)}
            onClick={(e) => handleSegmentClick(index, segment.timestamp, e)}
            onDoubleClick={() => handleDoubleClick(index)}
            className={`p-4 rounded-lg cursor-pointer transition-all select-none ${
              isSelected || isInDragRange
                ? "bg-blue-500/10 border-2 border-blue-500/50 ring-2 ring-blue-500/20"
                : isActive
                  ? "bg-zinc-100 border border-zinc-300"
                  : isHighlighted
                    ? "bg-yellow-500/10 border border-yellow-500/30"
                    : segment.hasAmmo
                      ? "bg-purple-500/5 border border-purple-500/20 hover:bg-purple-500/10"
                      : "hover:bg-zinc-100 border border-transparent"
            }`}
          >
            <div className="flex items-start gap-3">
              {/* Selection checkbox visual */}
              {isSelected && (
                <div className="flex items-center justify-center h-5 w-5 rounded bg-blue-500 text-white mt-0.5">
                  <Check className="h-3 w-3" />
                </div>
              )}

              {/* Timestamp */}
              <span className="text-xs font-mono text-zinc-500 mt-1 min-w-[48px]">
                {formatTimestamp(segment.timestamp)}
              </span>

              {/* Content */}
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-medium text-foreground">
                    {segment.speaker}
                  </span>
                  {segment.hasAmmo && (
                    <Badge
                      variant="outline"
                      className="text-[10px] px-1.5 py-0 bg-purple-500/10 text-purple-600 border-purple-500/30"
                    >
                      Ammo
                    </Badge>
                  )}
                </div>
                <p className={`text-sm leading-relaxed ${segment.hasAmmo ? "text-foreground font-medium" : "text-foreground"}`}>
                  {segment.text}
                </p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Ammo Sidebar Component
interface AmmoSidebarProps {
  ammoItems: AmmoItem[];
  onAmmoClick: (ammo: AmmoItem) => void;
}

function AmmoSidebar({ ammoItems, onAmmoClick }: AmmoSidebarProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopy = async (e: React.MouseEvent, text: string, id: string) => {
    e.stopPropagation();
    await navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Group ammo by type
  const groupedAmmo = useMemo(() => {
    const groups: Record<string, AmmoItem[]> = {};
    for (const item of ammoItems) {
      if (!groups[item.type]) {
        groups[item.type] = [];
      }
      groups[item.type].push(item);
    }
    return groups;
  }, [ammoItems]);

  const typeOrder = ["emotional", "pain_point", "budget", "urgency", "commitment", "objection_preview"];
  const sortedTypes = Object.keys(groupedAmmo).sort(
    (a, b) => typeOrder.indexOf(a) - typeOrder.indexOf(b)
  );

  if (ammoItems.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Mic className="h-10 w-10 text-zinc-600 mb-3" />
        <p className="text-zinc-400">No ammo extracted</p>
        <p className="text-zinc-600 text-sm mt-1">
          Key moments will appear here
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {sortedTypes.map((type) => (
        <div key={type}>
          <div className="flex items-center gap-2 mb-3">
            <Badge variant="outline" className={`text-xs ${getAmmoTypeColor(type)}`}>
              {getAmmoTypeLabel(type)}
            </Badge>
            <span className="text-xs text-zinc-500">{groupedAmmo[type].length}</span>
          </div>

          <div className="space-y-2">
            {groupedAmmo[type].map((item) => (
              <div
                key={item._id}
                onClick={() => onAmmoClick(item)}
                className="group p-3 rounded-lg bg-zinc-100 border border-zinc-200 hover:border-zinc-300 cursor-pointer transition-all"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm text-foreground leading-relaxed line-clamp-3">
                    &ldquo;{item.text}&rdquo;
                  </p>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={(e) => handleCopy(e, item.text, item._id)}
                    className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    {copiedId === item._id ? (
                      <Check className="h-3 w-3 text-green-400" />
                    ) : (
                      <Copy className="h-3 w-3" />
                    )}
                  </Button>
                </div>
                {item.timestamp !== undefined && (
                  <span className="text-xs text-zinc-500 mt-2 block">
                    {formatTimestamp(item.timestamp)}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// Loading State Component
function LoadingState() {
  return (
    <div className="p-6 space-y-6">
      <div className="h-8 w-48 bg-zinc-100 rounded animate-pulse" />
      <div className="grid grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-24 bg-zinc-100 rounded-lg animate-pulse" />
        ))}
      </div>
      <div className="h-20 bg-zinc-100 rounded-lg animate-pulse" />
      <div className="h-96 bg-zinc-100 rounded-lg animate-pulse" />
    </div>
  );
}

// Not Found Component
function NotFound() {
  return (
    <>
      <Header title="Call Not Found" description="This call doesn't exist or you don't have access" />
      <div className="p-6">
        <div className="flex flex-col items-center justify-center py-24">
          <AlertCircle className="h-16 w-16 text-zinc-600 mb-4" />
          <p className="text-zinc-400 text-lg mb-6">Call not found</p>
          <Link href="/dashboard/calls">
            <Button variant="outline">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Calls
            </Button>
          </Link>
        </div>
      </div>
    </>
  );
}

// Highlight categories
const HIGHLIGHT_CATEGORIES = [
  { value: "objection_handling", label: "Objection Handling" },
  { value: "pitch", label: "Pitch" },
  { value: "close", label: "Close" },
  { value: "pain_discovery", label: "Pain Discovery" },
];

// Snippet Audio Player Component (plays a specific range)
interface SnippetAudioPlayerProps {
  src: string;
  startTime: number;
  endTime: number;
}

function SnippetAudioPlayer({ src, startTime, endTime }: SnippetAudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(startTime);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.currentTime = startTime;
    }
  }, [startTime]);

  const togglePlay = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
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
        audioRef.current.pause();
        setIsPlaying(false);
        audioRef.current.currentTime = startTime;
      }
    }
  };

  return (
    <div className="flex items-center gap-3 p-3 bg-zinc-100 rounded-lg">
      <audio
        ref={audioRef}
        src={src}
        onTimeUpdate={handleTimeUpdate}
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

// Main Page Component
export default function CallDetailPage() {
  const params = useParams();
  const callId = params.callId as string;
  const { clerkId } = useTeam();

  const call = useQuery(
    api.calls.getCallDetails,
    callId ? { callId: callId as Id<"calls"> } : "skip"
  ) as CallDetails | null | undefined;

  const createHighlight = useMutation(api.highlights.createHighlight);

  const [audioSeekTime, setAudioSeekTime] = useState<number | undefined>(undefined);
  const [currentPlaybackTime, setCurrentPlaybackTime] = useState(0);
  const [highlightedAmmo, setHighlightedAmmo] = useState<string | undefined>(undefined);

  // Selection and modal state
  const [selection, setSelection] = useState<SelectionState | null>(null);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [highlightTitle, setHighlightTitle] = useState("");
  const [highlightNotes, setHighlightNotes] = useState("");
  const [highlightCategory, setHighlightCategory] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const handleSegmentClick = useCallback((timestamp: number) => {
    setAudioSeekTime(timestamp);
  }, []);

  const handleAmmoClick = useCallback((ammo: AmmoItem) => {
    if (ammo.timestamp !== undefined) {
      setAudioSeekTime(ammo.timestamp);
    }
    setHighlightedAmmo(ammo.text);
    setTimeout(() => setHighlightedAmmo(undefined), 3000);
  }, []);

  const handleTimeUpdate = useCallback((time: number) => {
    setCurrentPlaybackTime(time);
  }, []);

  const handleSelectionChange = useCallback((newSelection: SelectionState | null) => {
    setSelection(newSelection);
  }, []);

  const handleOpenSaveModal = () => {
    setHighlightTitle("");
    setHighlightNotes("");
    setHighlightCategory("");
    setShowSaveModal(true);
  };

  const handleSaveHighlight = async () => {
    if (!selection || !clerkId || !call || !highlightTitle || !highlightCategory) return;

    setIsSaving(true);
    try {
      await createHighlight({
        clerkId,
        callId: call._id,
        title: highlightTitle,
        notes: highlightNotes || undefined,
        category: highlightCategory,
        transcriptText: selection.text,
        startTimestamp: selection.startTimestamp,
        endTimestamp: selection.endTimestamp,
      });

      setSaveSuccess(true);
      setTimeout(() => {
        setSaveSuccess(false);
        setShowSaveModal(false);
        setSelection(null);
      }, 1500);
    } catch (error) {
      console.error("Failed to save highlight:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleClearSelection = () => {
    setSelection(null);
  };

  // Loading state
  if (call === undefined) {
    return <LoadingState />;
  }

  // Not found state
  if (call === null) {
    return <NotFound />;
  }

  return (
    <>
      <Header
        title={call.prospectName || "Unknown Prospect"}
        description={`Call with ${call.closer?.name || "Unknown Closer"}`}
      />

      <div className="p-6">
        {/* Back button */}
        <Link
          href="/dashboard/calls"
          className="inline-flex items-center text-sm text-zinc-400 hover:text-white mb-6"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Calls
        </Link>

        {/* Call Header Info */}
        <Card className="mb-6">
          <CardContent className="p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              {/* Left side - Basic info */}
              <div className="flex items-start gap-4">
                <Avatar className="h-12 w-12">
                  <AvatarFallback className="text-lg">
                    {call.closer ? getInitials(call.closer.name) : "??"}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <h2 className="text-xl font-semibold">{call.prospectName || "Unknown Prospect"}</h2>
                  <p className="text-zinc-400 text-sm">
                    {call.closer?.name || "Unknown Closer"} &middot; {call.teamName}
                  </p>
                  <p className="text-zinc-500 text-sm mt-1">
                    {call.startedAt ? formatDate(call.startedAt) : "Date unknown"}
                  </p>
                </div>
              </div>

              {/* Right side - Stats */}
              <div className="flex flex-wrap items-center gap-6">
                {/* Duration */}
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-zinc-500" />
                  <span className="text-sm">
                    {call.duration ? formatDuration(call.duration) : "—"}
                  </span>
                </div>

                {/* Outcome */}
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-zinc-500" />
                  {getOutcomeBadge(call.outcome)}
                </div>

                {/* Deal Value */}
                {call.dealValue && (
                  <div className="flex items-center gap-2">
                    <DollarSign className="h-4 w-4 text-green-500" />
                    <span className="text-sm font-medium text-green-400">
                      {formatCurrency(call.dealValue)}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Audio Player - Sticky */}
        {call.recordingUrl ? (
          <div className="sticky top-0 z-10 mb-6">
            <AudioPlayer
              src={call.recordingUrl}
              onTimeUpdate={handleTimeUpdate}
              seekTo={audioSeekTime}
            />
          </div>
        ) : (
          <Card className="mb-6">
            <CardContent className="p-6">
              <div className="flex items-center justify-center gap-3 text-zinc-500">
                <AlertCircle className="h-5 w-5" />
                <span>No recording available for this call</span>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Main Content - Transcript + Ammo Sidebar */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Transcript */}
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Transcript</CardTitle>
              </CardHeader>
              <CardContent>
                <TranscriptView
                  transcript={call.transcriptText || ""}
                  ammoItems={call.ammo}
                  currentTime={currentPlaybackTime}
                  onSegmentClick={handleSegmentClick}
                  highlightedAmmo={highlightedAmmo}
                  onSelectionChange={handleSelectionChange}
                  selectedIndices={selection ? new Set(Array.from({ length: selection.endIndex - selection.startIndex + 1 }, (_, i) => selection.startIndex + i)) : undefined}
                />
              </CardContent>
            </Card>
          </div>

          {/* Ammo Sidebar */}
          <div className="lg:col-span-1">
            <Card className="lg:sticky lg:top-24">
              <CardHeader>
                <CardTitle className="text-lg flex items-center justify-between">
                  <span>Ammo</span>
                  <Badge variant="secondary">{call.ammo.length}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <AmmoSidebar ammoItems={call.ammo} onAmmoClick={handleAmmoClick} />
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Floating Save to Playbook Button */}
      {selection && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 bg-background border border-zinc-200 shadow-lg rounded-lg p-2">
          <div className="text-sm text-zinc-500 px-2">
            {selection.endIndex - selection.startIndex + 1} segment{selection.endIndex !== selection.startIndex ? "s" : ""} selected
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClearSelection}
          >
            Clear
          </Button>
          <Button
            size="sm"
            onClick={handleOpenSaveModal}
            className="gap-2"
          >
            <Bookmark className="h-4 w-4" />
            Save to Playbook
          </Button>
        </div>
      )}

      {/* Save to Playbook Modal */}
      <Dialog open={showSaveModal} onOpenChange={setShowSaveModal}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Save to Playbook</DialogTitle>
            <DialogDescription>
              Save this transcript segment as a training highlight for your team.
            </DialogDescription>
          </DialogHeader>

          {saveSuccess ? (
            <div className="flex flex-col items-center justify-center py-8">
              <div className="h-12 w-12 rounded-full bg-green-500/10 flex items-center justify-center mb-4">
                <Check className="h-6 w-6 text-green-500" />
              </div>
              <p className="text-lg font-medium">Saved to Playbook!</p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Transcript Preview */}
              <div>
                <Label className="text-sm font-medium">Selected Transcript</Label>
                <div className="mt-2 max-h-32 overflow-y-auto p-3 bg-zinc-50 rounded-lg border text-sm whitespace-pre-wrap">
                  {selection?.text}
                </div>
              </div>

              {/* Audio Preview */}
              {call.recordingUrl && selection && (
                <div>
                  <Label className="text-sm font-medium">Audio Preview</Label>
                  <div className="mt-2">
                    <SnippetAudioPlayer
                      src={call.recordingUrl}
                      startTime={selection.startTimestamp}
                      endTime={selection.endTimestamp}
                    />
                  </div>
                </div>
              )}

              {/* Category */}
              <div>
                <Label htmlFor="category" className="text-sm font-medium">
                  Category <span className="text-red-500">*</span>
                </Label>
                <Select value={highlightCategory} onValueChange={setHighlightCategory}>
                  <SelectTrigger className="mt-2">
                    <SelectValue placeholder="Select a category" />
                  </SelectTrigger>
                  <SelectContent>
                    {HIGHLIGHT_CATEGORIES.map((cat) => (
                      <SelectItem key={cat.value} value={cat.value}>
                        {cat.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Title */}
              <div>
                <Label htmlFor="title" className="text-sm font-medium">
                  Title <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="title"
                  value={highlightTitle}
                  onChange={(e) => setHighlightTitle(e.target.value)}
                  placeholder="e.g., Great objection handling on price"
                  className="mt-2"
                />
              </div>

              {/* Notes */}
              <div>
                <Label htmlFor="notes" className="text-sm font-medium">
                  Notes (optional)
                </Label>
                <Textarea
                  id="notes"
                  value={highlightNotes}
                  onChange={(e) => setHighlightNotes(e.target.value)}
                  placeholder="Add any context or notes about this highlight..."
                  className="mt-2"
                  rows={3}
                />
              </div>

              {/* Closer Info */}
              <div className="flex items-center gap-2 text-sm text-zinc-500">
                <User className="h-4 w-4" />
                <span>Closer: {call.closer?.name || "Unknown"}</span>
              </div>
            </div>
          )}

          {!saveSuccess && (
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowSaveModal(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleSaveHighlight}
                disabled={!highlightTitle || !highlightCategory || isSaving}
              >
                {isSaving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Save Highlight"
                )}
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
