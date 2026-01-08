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
  BarChart3,
  Pencil,
  FileText,
  ChevronDown,
  ChevronUp,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useTeam } from "@/hooks/useTeam";
import { AmmoV2Panel, type AmmoV2Analysis } from "@/components/AmmoV2Panel";

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

// Database transcript segment (from transcriptSegments table)
interface DbTranscriptSegment {
  _id: string;
  callId: Id<"calls">;
  teamId: Id<"teams">;
  speaker: string; // "closer" or "prospect"
  text: string;
  timestamp: number; // Accurate timestamp in seconds from audio processor
  createdAt: number;
}

interface CallDetails {
  _id: Id<"calls">;
  closerId: Id<"closers">;
  teamId: Id<"teams">;
  prospectName?: string;
  status: string;
  outcome?: string;
  dealValue?: number; // Legacy field
  cashCollected?: number; // NEW: Amount paid on the call
  contractValue?: number; // NEW: Total contract commitment
  notes?: string;
  startedAt?: number;
  endedAt?: number;
  duration?: number;
  speakerCount: number;
  recordingUrl?: string;
  transcriptText?: string;
  closerTalkTime?: number;
  prospectTalkTime?: number;
  speakerMapping?: {
    closerSpeaker: string;
    confirmed: boolean;
  };
  summary?: string;
  createdAt: number;
  closer: { name: string; email: string } | null;
  teamName: string | null;
  ammo: AmmoItem[];
  transcriptSegments?: DbTranscriptSegment[]; // Segments with accurate timestamps
  ammoAnalysis?: AmmoV2Analysis;
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

// Outcome options for the edit modal
const OUTCOME_OPTIONS = [
  { value: "closed", label: "Closed" },
  { value: "follow_up", label: "Follow Up" },
  { value: "lost", label: "Lost" },
  { value: "no_show", label: "No Show" },
];

// Quick-select deal value presets
const DEAL_VALUE_PRESETS = [1000, 3000, 5000, 10000, 15000];

// Call Summary Component (expandable/collapsible)
interface CallSummaryProps {
  summary?: string;
  isLoading?: boolean;
}

// Parse bullet points from summary text
function parseBulletPoints(text: string): { label: string; value: string }[] {
  const lines = text.split('\n').filter(line => line.trim());
  const bullets: { label: string; value: string }[] = [];

  for (const line of lines) {
    // Match lines starting with • or - or *
    const bulletMatch = line.match(/^[•\-\*]\s*(.+)$/);
    if (bulletMatch) {
      const content = bulletMatch[1].trim();
      // Try to split into label: value
      const colonIndex = content.indexOf(':');
      if (colonIndex > 0 && colonIndex < 30) {
        bullets.push({
          label: content.substring(0, colonIndex).trim(),
          value: content.substring(colonIndex + 1).trim(),
        });
      } else {
        bullets.push({ label: '', value: content });
      }
    }
  }

  return bullets;
}

// Get first bullet preview for collapsed view
function getFirstBulletPreview(summary: string): string {
  const bullets = parseBulletPoints(summary);
  if (bullets.length > 0 && bullets[0].value) {
    return bullets[0].value.substring(0, 60) + (bullets[0].value.length > 60 ? '...' : '');
  }
  // Fallback to first sentence for old format summaries
  const firstSentence = summary.split(/[.!?]/).filter(s => s.trim())[0]?.trim();
  return firstSentence ? firstSentence + '.' : '';
}

function CallSummary({ summary, isLoading }: CallSummaryProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Don't render if no summary and not loading
  if (!summary && !isLoading) {
    return null;
  }

  const bullets = summary ? parseBulletPoints(summary) : [];
  const hasBullets = bullets.length > 0;
  const previewText = summary ? getFirstBulletPreview(summary) : '';

  return (
    <div
      onClick={() => setIsExpanded(!isExpanded)}
      className="mb-6 bg-gradient-to-r from-zinc-50 to-zinc-100 border border-zinc-200 rounded-lg cursor-pointer hover:border-zinc-300 transition-all duration-200"
    >
      <div className="p-4">
        {/* Header Row */}
          <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            {/* AI Badge */}
            <div className="flex items-center gap-1 px-2 py-0.5 bg-zinc-900 text-white rounded-full text-xs font-medium shrink-0">
              <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2L2 7l10 5 10-5-10-5z" />
                <path d="M2 17l10 5 10-5" />
                <path d="M2 12l10 5 10-5" />
              </svg>
              <span>AI</span>
            </div>

            <span className="text-sm font-medium text-zinc-700 shrink-0">Call Summary</span>

            {/* Loading or Collapsed Preview */}
            {isLoading ? (
              <div className="flex items-center gap-2 text-zinc-500 text-sm">
                <Loader2 className="h-3 w-3 animate-spin" />
                <span>Generating summary...</span>
              </div>
            ) : !isExpanded && summary ? (
              <span className="text-sm text-zinc-500 truncate">
                — {previewText}
              </span>
            ) : null}
          </div>

          {/* Expand/Collapse Icon */}
          <div className="shrink-0 text-zinc-400">
            {isExpanded ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </div>
        </div>

        {/* Expanded Content */}
        {isExpanded && summary && (
          <div
            className="mt-3 pt-3 border-t border-zinc-200 animate-in slide-in-from-top-2 duration-200"
          >
            {hasBullets ? (
              <ul className="space-y-2">
                {bullets.map((bullet, index) => (
                  <li key={index} className="flex gap-2 text-sm">
                    <span className="text-zinc-400 shrink-0">•</span>
                    <span className="text-zinc-600">
                      {bullet.label && (
                        <span className="font-medium text-zinc-800">{bullet.label}:</span>
                      )}{' '}
                      {bullet.value}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-zinc-600 leading-relaxed">
                {summary}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// Talk-to-Listen Ratio Bar Component
function TalkRatioBar({ closerTalkTime, prospectTalkTime }: { closerTalkTime?: number; prospectTalkTime?: number }) {
  const total = (closerTalkTime || 0) + (prospectTalkTime || 0);

  if (total === 0) {
    return <span className="text-sm text-muted-foreground">No data</span>;
  }

  const closerPercent = Math.round(((closerTalkTime || 0) / total) * 100);
  const prospectPercent = 100 - closerPercent;

  return (
    <div className="w-36">
      <p className="text-[10px] text-muted-foreground text-center mb-1">Talk-to-Listen Ratio</p>
      <div className="flex items-center gap-1">
        <div className="flex-1 h-2 bg-zinc-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-zinc-800 transition-all duration-500"
            style={{ width: `${closerPercent}%` }}
          />
        </div>
      </div>
      <div className="flex justify-between text-xs text-muted-foreground mt-1">
        <span>Closer {closerPercent}%</span>
        <span>Prospect {prospectPercent}%</span>
      </div>
    </div>
  );
}

// Audio Player Component
interface SpeakerSegment {
  speaker: string; // "closer" or "prospect"
  timestamp: number; // Start time in seconds
}

interface AudioPlayerProps {
  src: string;
  onTimeUpdate?: (time: number) => void;
  seekTo?: number;
  speakerSegments?: SpeakerSegment[]; // For speaker-colored waveform
}

// Generate consistent waveform bars based on position (pseudo-random but deterministic)
function generateWaveformBars(count: number): number[] {
  const bars: number[] = [];
  for (let i = 0; i < count; i++) {
    // Use sine waves with different frequencies for natural-looking variation
    const base = 0.3;
    const wave1 = Math.sin(i * 0.3) * 0.25;
    const wave2 = Math.sin(i * 0.7 + 1) * 0.15;
    const wave3 = Math.sin(i * 1.1 + 2) * 0.1;
    const noise = Math.sin(i * 3.7) * 0.1;
    bars.push(Math.max(0.15, Math.min(1, base + wave1 + wave2 + wave3 + noise)));
  }
  return bars;
}

function AudioPlayer({ src, onTimeUpdate, seekTo, speakerSegments }: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const waveformRef = useRef<HTMLDivElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [volume, setVolume] = useState(1);
  const [showVolumeSlider, setShowVolumeSlider] = useState(false);
  const [isDiscoveringDuration, setIsDiscoveringDuration] = useState(true);
  const [isHovering, setIsHovering] = useState(false);
  const [hoverTime, setHoverTime] = useState(0);

  // Generate waveform bars (100 bars for visual density)
  const waveformBars = useMemo(() => generateWaveformBars(100), []);

  // Get speaker at a specific time
  const getSpeakerAtTime = useCallback((time: number): 'closer' | 'prospect' | null => {
    if (!speakerSegments || speakerSegments.length === 0) return null;

    // Find the segment that contains this time
    for (let i = speakerSegments.length - 1; i >= 0; i--) {
      if (time >= speakerSegments[i].timestamp) {
        return speakerSegments[i].speaker === 'closer' ? 'closer' : 'prospect';
      }
    }
    return null;
  }, [speakerSegments]);

  // Current speaker based on playback position
  const currentSpeaker = getSpeakerAtTime(currentTime);

  // Speaker colors
  const speakerColors = {
    closer: {
      gradient: 'linear-gradient(180deg, #0891b2 0%, #0e7490 50%, #155e75 100%)',
      glow: 'rgba(8, 145, 178, 0.15)',
      solid: '#0891b2',
    },
    prospect: {
      gradient: 'linear-gradient(180deg, #ea580c 0%, #c2410c 50%, #9a3412 100%)',
      glow: 'rgba(234, 88, 12, 0.15)',
      solid: '#ea580c',
    },
    default: {
      gradient: 'linear-gradient(180deg, #3b82f6 0%, #2563eb 50%, #1d4ed8 100%)',
      glow: 'rgba(59, 130, 246, 0.15)',
      solid: '#3b82f6',
    },
  };

  const currentColors = currentSpeaker ? speakerColors[currentSpeaker] : speakerColors.default;

  // For WebM files, we need to discover the true duration by seeking to the end
  const hasDiscoveredDuration = useRef(false);

  useEffect(() => {
    if (seekTo !== undefined && audioRef.current && !isDiscoveringDuration) {
      audioRef.current.currentTime = seekTo;
      setCurrentTime(seekTo);
    }
  }, [seekTo, isDiscoveringDuration]);

  const togglePlay = useCallback(() => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  }, [isPlaying]);

  const skipForward = useCallback(() => {
    if (audioRef.current && duration > 0) {
      const newTime = Math.min(currentTime + 15, duration);
      audioRef.current.currentTime = newTime;
      setCurrentTime(newTime);
    }
  }, [currentTime, duration]);

  const skipBackward = useCallback(() => {
    if (audioRef.current) {
      const newTime = Math.max(currentTime - 15, 0);
      audioRef.current.currentTime = newTime;
      setCurrentTime(newTime);
    }
  }, [currentTime]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle if not typing in an input/textarea
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      switch (e.code) {
        case 'Space':
          e.preventDefault();
          togglePlay();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          skipBackward();
          break;
        case 'ArrowRight':
          e.preventDefault();
          skipForward();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [togglePlay, skipBackward, skipForward]);

  const handleTimeUpdate = () => {
    if (audioRef.current && !isDiscoveringDuration) {
      const time = audioRef.current.currentTime;
      setCurrentTime(time);
      onTimeUpdate?.(time);
    }
  };

  const handleLoadedMetadata = () => {
    if (!audioRef.current || hasDiscoveredDuration.current) return;

    const audio = audioRef.current;
    const reportedDuration = audio.duration;

    // If duration seems valid and finite, use it
    if (isFinite(reportedDuration) && reportedDuration > 0) {
      setDuration(reportedDuration);
      setIsDiscoveringDuration(false);
      hasDiscoveredDuration.current = true;
      return;
    }

    // WebM files often report Infinity initially - we need to discover true duration
    // Technique: seek to a very large time, browser will clamp to actual end
    setIsDiscoveringDuration(true);

    const handleSeeked = () => {
      if (audioRef.current) {
        // After seeking to "end", currentTime is now the true duration
        const trueDuration = audioRef.current.currentTime;
        if (trueDuration > 0) {
          setDuration(trueDuration);
        }
        // Seek back to start
        audioRef.current.currentTime = 0;
        setCurrentTime(0);
        setIsDiscoveringDuration(false);
        hasDiscoveredDuration.current = true;
        audioRef.current.removeEventListener('seeked', handleSeeked);
      }
    };

    audio.addEventListener('seeked', handleSeeked);
    // Seek to a very large time - browser will clamp to actual end
    audio.currentTime = 1e10;
  };

  // Handle duration changes - browser may update duration as it loads more of the file
  const handleDurationChange = () => {
    if (audioRef.current && !isDiscoveringDuration) {
      const reportedDuration = audioRef.current.duration;
      if (isFinite(reportedDuration) && reportedDuration > duration) {
        setDuration(reportedDuration);
      }
    }
  };

  // Calculate progress percentage
  const progressPercent = duration > 0
    ? Math.min((currentTime / duration) * 100, 100)
    : 0;

  const handleWaveformClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!waveformRef.current || !audioRef.current || duration <= 0) return;

    const rect = waveformRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const percent = clickX / rect.width;
    const newTime = percent * duration;

    audioRef.current.currentTime = newTime;
    setCurrentTime(newTime);
  };

  const handleWaveformHover = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!waveformRef.current || duration <= 0) return;

    const rect = waveformRef.current.getBoundingClientRect();
    const hoverX = e.clientX - rect.left;
    const percent = hoverX / rect.width;
    setHoverTime(percent * duration);
    setIsHovering(true);
  };

  const changePlaybackRate = () => {
    const rates = [1, 1.25, 1.5, 2];
    const currentIndex = rates.indexOf(playbackRate);
    const nextRate = rates[(currentIndex + 1) % rates.length];
    setPlaybackRate(nextRate);
    if (audioRef.current) {
      audioRef.current.playbackRate = nextRate;
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVolume = parseFloat(e.target.value);
    setVolume(newVolume);
    if (audioRef.current) {
      audioRef.current.volume = newVolume;
    }
  };

  const handleEnded = () => {
    setIsPlaying(false);
    setCurrentTime(duration);
  };

  const getVolumeIcon = () => {
    if (volume === 0) return <Volume2 className="h-4 w-4 opacity-50" />;
    if (volume < 0.5) return <Volume2 className="h-4 w-4" />;
    return <Volume2 className="h-4 w-4" />;
  };

  // Get speaker for a specific bar index
  const getSpeakerAtBarIndex = (barIndex: number): 'closer' | 'prospect' | null => {
    if (duration <= 0) return null;
    const time = (barIndex / waveformBars.length) * duration;
    return getSpeakerAtTime(time);
  };

  return (
    <div
      className="bg-white border border-zinc-200 rounded-2xl p-6 shadow-lg relative overflow-hidden"
      style={{
        boxShadow: '0 4px 24px rgba(0, 0, 0, 0.08), 0 1px 2px rgba(0, 0, 0, 0.04)',
      }}
    >
      <audio
        ref={audioRef}
        src={src}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onDurationChange={handleDurationChange}
        onEnded={handleEnded}
      />

      {/* Ambient glow that follows playhead */}
      <div
        className="absolute top-1/2 pointer-events-none transition-all duration-75"
        style={{
          left: `${progressPercent}%`,
          width: '280px',
          height: '140px',
          background: `radial-gradient(ellipse, ${currentColors.glow} 0%, transparent 70%)`,
          transform: 'translate(-50%, -50%)',
        }}
      />

      {/* Speaker Legend */}
      {speakerSegments && speakerSegments.length > 0 && (
        <div className="flex gap-5 mb-4 relative z-10">
          <div className="flex items-center gap-2">
            <div
              className="w-3 h-3 rounded-sm"
              style={{
                background: 'linear-gradient(135deg, #0891b2, #0e7490)',
                boxShadow: '0 2px 4px rgba(8, 145, 178, 0.3)',
              }}
            />
            <span className="text-xs font-medium text-zinc-500">Closer</span>
          </div>
          <div className="flex items-center gap-2">
            <div
              className="w-3 h-3 rounded-sm"
              style={{
                background: 'linear-gradient(135deg, #ea580c, #c2410c)',
                boxShadow: '0 2px 4px rgba(234, 88, 12, 0.3)',
              }}
            />
            <span className="text-xs font-medium text-zinc-500">Prospect</span>
          </div>
        </div>
      )}

      {/* Waveform Visualization */}
      <div
        ref={waveformRef}
        onClick={handleWaveformClick}
        onMouseMove={handleWaveformHover}
        onMouseLeave={() => setIsHovering(false)}
        className="relative mb-4 cursor-pointer group"
        style={{ height: '72px' }}
      >
        {/* Waveform Bars */}
        <div className="absolute inset-0 flex items-center justify-between" style={{ gap: '2px' }}>
          {waveformBars.map((height, i) => {
            // Calculate bar position as percentage of total bars
            const barPercent = (i / waveformBars.length) * 100;
            const isPlayed = barPercent < progressPercent;
            const barSpeaker = getSpeakerAtBarIndex(i);
            const isNearPlayhead = Math.abs(barPercent - progressPercent) < 3;

            // Determine bar color: only speaker colors for played bars, gray for unplayed
            let barBackground: string;
            if (isPlayed) {
              // Use speaker color if available, otherwise default cyan
              if (barSpeaker === 'closer') {
                barBackground = 'linear-gradient(180deg, #0891b2 0%, #0e7490 50%, #155e75 100%)';
              } else if (barSpeaker === 'prospect') {
                barBackground = 'linear-gradient(180deg, #ea580c 0%, #c2410c 50%, #9a3412 100%)';
              } else {
                // No speaker data - use cyan as default for played bars
                barBackground = 'linear-gradient(180deg, #0891b2 0%, #0e7490 50%, #155e75 100%)';
              }
            } else {
              // All unplayed bars are gray
              barBackground = '#e2e8f0';
            }

            return (
              <div
                key={i}
                className="flex items-center justify-center"
                style={{
                  flex: '1 1 0%',
                  height: '100%',
                  minWidth: '2px',
                }}
              >
                <div
                  className="w-full rounded-sm transition-all duration-100"
                  style={{
                    height: `${height * 100}%`,
                    minHeight: '4px',
                    background: barBackground,
                    boxShadow: isPlayed && isNearPlayhead
                      ? `0 2px 8px ${barSpeaker === 'closer' ? 'rgba(8, 145, 178, 0.4)' : barSpeaker === 'prospect' ? 'rgba(234, 88, 12, 0.4)' : 'rgba(8, 145, 178, 0.4)'}`
                      : 'none',
                  }}
                />
              </div>
            );
          })}
        </div>

        {/* Hover Time Indicator */}
        {isHovering && duration > 0 && (
          <div
            className="absolute top-0 h-full w-[2px] bg-zinc-400/50 pointer-events-none"
            style={{ left: `${(hoverTime / duration) * 100}%` }}
          >
            <div className="absolute -top-7 left-1/2 -translate-x-1/2 px-2 py-1 bg-zinc-800 rounded text-xs text-white whitespace-nowrap">
              {formatTimestamp(hoverTime)}
            </div>
          </div>
        )}

        {/* Playhead */}
        <div
          className="absolute h-full w-[2px] pointer-events-none rounded-full transition-colors duration-300"
          style={{
            left: `${progressPercent}%`,
            top: '-8px',
            bottom: '-8px',
            height: 'calc(100% + 16px)',
            background: currentColors.solid,
            boxShadow: `0 0 8px ${currentColors.solid}80`,
          }}
        />
      </div>

      {/* Controls Row */}
      <div className="flex items-center gap-4 relative z-10">
        {/* Play/Pause Button */}
        <button
          onClick={togglePlay}
          className="h-10 w-10 rounded-full flex items-center justify-center transition-all duration-200 hover:scale-105"
          style={{
            background: 'linear-gradient(135deg, #0891b2 0%, #0e7490 100%)',
            boxShadow: '0 4px 12px rgba(8, 145, 178, 0.3)',
          }}
        >
          {isPlaying ? (
            <div className="flex gap-[3px]">
              <div className="w-[3px] h-3 bg-white rounded-sm" />
              <div className="w-[3px] h-3 bg-white rounded-sm" />
            </div>
          ) : (
            <div
              className="ml-0.5"
              style={{
                width: 0,
                height: 0,
                borderLeft: '10px solid white',
                borderTop: '6px solid transparent',
                borderBottom: '6px solid transparent',
              }}
            />
          )}
        </button>

        {/* Time Display */}
        <span className="text-sm font-mono font-medium text-zinc-500">
          {formatTimestamp(currentTime)} / {duration > 0 && isFinite(duration) ? formatTimestamp(duration) : "--:--"}
        </span>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Skip Back */}
        <button
          onClick={skipBackward}
          className="w-9 h-9 flex items-center justify-center rounded-lg text-zinc-500 hover:text-zinc-700 hover:bg-zinc-100 transition-colors"
          title="Skip back 15 seconds"
        >
          <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 5V1L7 6l5 5V7a6 6 0 11-6 6" />
            <text x="9" y="16" fontSize="6" fill="currentColor" stroke="none" fontWeight="bold">15</text>
          </svg>
        </button>

        {/* Skip Forward */}
        <button
          onClick={skipForward}
          className="w-9 h-9 flex items-center justify-center rounded-lg text-zinc-500 hover:text-zinc-700 hover:bg-zinc-100 transition-colors"
          title="Skip forward 15 seconds"
        >
          <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 5V1l5 5-5 5V7a6 6 0 106 6" />
            <text x="9" y="16" fontSize="6" fill="currentColor" stroke="none" fontWeight="bold">15</text>
          </svg>
        </button>

        {/* Playback Speed */}
        <button
          onClick={changePlaybackRate}
          className="px-3 py-1.5 rounded-md border border-zinc-200 bg-zinc-50 text-zinc-600 hover:bg-zinc-100 transition-colors font-mono text-xs font-medium min-w-[45px]"
        >
          {playbackRate}x
        </button>

        {/* Volume Control */}
        <div
          className="relative"
          onMouseEnter={() => setShowVolumeSlider(true)}
          onMouseLeave={() => setShowVolumeSlider(false)}
        >
          <button className="w-9 h-9 flex items-center justify-center rounded-lg text-zinc-500 hover:text-zinc-700 hover:bg-zinc-100 transition-colors">
            {getVolumeIcon()}
          </button>

          {/* Volume Slider Popup - positioned to the right to avoid cutoff */}
          {showVolumeSlider && (
            <div className="absolute bottom-full right-0 mb-2 p-3 bg-white border border-zinc-200 rounded-lg shadow-xl">
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={volume}
                onChange={handleVolumeChange}
                className="w-24 h-1.5 bg-zinc-200 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-cyan-600 [&::-webkit-slider-thumb]:shadow-md"
                style={{
                  background: `linear-gradient(to right, #0891b2 ${volume * 100}%, #e2e8f0 ${volume * 100}%)`,
                }}
              />
            </div>
          )}
        </div>
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

// Map speaker label based on speaker mapping
function mapSpeakerLabel(
  rawSpeaker: string,
  speakerMapping?: { closerSpeaker: string; confirmed: boolean }
): string {
  // If already labeled as Closer/Prospect, return as is
  if (rawSpeaker.toLowerCase() === "closer") return "Closer";
  if (rawSpeaker.toLowerCase() === "prospect") return "Prospect";

  // If no mapping, just clean up the speaker label but still try to map to Closer/Prospect
  if (!speakerMapping) {
    // Default: Speaker 1 = Closer, Speaker 2 = Prospect (common assumption)
    if (rawSpeaker.match(/speaker\s*1/i)) return "Closer";
    if (rawSpeaker.match(/speaker\s*2/i)) return "Prospect";
    return rawSpeaker;
  }

  // Use the speaker mapping to determine who is closer vs prospect
  // speakerMapping.closerSpeaker is "speaker_0" or "speaker_1" from Deepgram
  // In transcript format, it appears as "Speaker 1" (speaker_0) or "Speaker 2" (speaker_1)
  const closerSpeaker = speakerMapping.closerSpeaker;

  // Map transcript speaker labels to Deepgram speaker IDs
  // "Speaker 1" in transcript = "speaker_0" in Deepgram
  // "Speaker 2" in transcript = "speaker_1" in Deepgram
  if (rawSpeaker.match(/speaker\s*1/i)) {
    return closerSpeaker === "speaker_0" ? "Closer" : "Prospect";
  }
  if (rawSpeaker.match(/speaker\s*2/i)) {
    return closerSpeaker === "speaker_1" ? "Closer" : "Prospect";
  }

  return rawSpeaker;
}

// Parse transcript text into segments
function parseTranscript(
  text: string,
  ammoItems: AmmoItem[],
  speakerMapping?: { closerSpeaker: string; confirmed: boolean }
): TranscriptSegment[] {
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
      const rawSpeaker = speakerMatch[1];
      const content = speakerMatch[2].trim();

      // Map the speaker label using the speaker mapping
      const speaker = mapSpeakerLabel(rawSpeaker, speakerMapping);

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
      const rawSpeaker = segments.length % 2 === 0 ? "Speaker 1" : "Speaker 2";
      segments.push({
        speaker: mapSpeakerLabel(rawSpeaker, speakerMapping),
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

// Estimate segment duration based on word count
// Average speaking rate is ~150 words/minute = ~2.5 words/second
// We add a small buffer for natural pauses
function estimateSegmentDuration(text: string): number {
  const wordCount = text.split(/\s+/).filter(w => w.length > 0).length;
  // ~2.5 words/sec = ~0.4 seconds per word, plus 1 second buffer
  const estimatedDuration = Math.max(3, Math.ceil(wordCount * 0.4) + 1);
  return Math.min(estimatedDuration, 60); // Cap at 60 seconds max
}

// Calculate end timestamp for a segment
function calculateEndTimestamp(
  segments: TranscriptSegment[],
  endIndex: number
): number {
  const endSegment = segments[endIndex];

  // If there's a next segment, use its start time
  if (endIndex < segments.length - 1) {
    return segments[endIndex + 1].timestamp;
  }

  // For the last segment, estimate based on word count
  const estimatedDuration = estimateSegmentDuration(endSegment.text);
  return endSegment.timestamp + estimatedDuration;
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
  speakerMapping?: { closerSpeaker: string; confirmed: boolean };
  dbSegments?: DbTranscriptSegment[]; // Database segments with accurate timestamps
}

function TranscriptView({
  transcript,
  ammoItems,
  currentTime,
  onSegmentClick,
  highlightedAmmo,
  onSelectionChange,
  selectedIndices,
  speakerMapping,
  dbSegments,
}: TranscriptViewProps) {
  // Use database segments if available (they have accurate timestamps from audio processor)
  // Fall back to parsing transcriptText only if no database segments
  const segments = useMemo(() => {
    if (dbSegments && dbSegments.length > 0) {
      // Convert database segments to TranscriptSegment format
      return dbSegments.map((dbSeg) => {
        // Check if this segment contains any ammo
        const matchingAmmo = ammoItems.find(
          (ammo) =>
            dbSeg.text.toLowerCase().includes(ammo.text.toLowerCase().slice(0, 30)) ||
            ammo.text.toLowerCase().includes(dbSeg.text.toLowerCase().slice(0, 30))
        );

        return {
          speaker: dbSeg.speaker === "closer" ? "Closer" : dbSeg.speaker === "prospect" ? "Prospect" : dbSeg.speaker,
          text: dbSeg.text,
          timestamp: dbSeg.timestamp, // This is the ACCURATE timestamp!
          hasAmmo: !!matchingAmmo,
          ammoText: matchingAmmo?.text,
        };
      });
    }
    // Fallback: parse transcript text (less accurate timestamps)
    return parseTranscript(transcript, ammoItems, speakerMapping);
  }, [dbSegments, transcript, ammoItems, speakerMapping]);
  const containerRef = useRef<HTMLDivElement>(null);
  const segmentRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const [selectionStart, setSelectionStart] = useState<number | null>(null);
  const [selectionEnd, setSelectionEnd] = useState<number | null>(null);
  const [isSelecting, setIsSelecting] = useState(false);
  const scrollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Auto-scroll state
  const [autoScrollEnabled, setAutoScrollEnabled] = useState(true);
  const lastActiveIndexRef = useRef<number>(-1);
  const userScrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isAutoScrollingRef = useRef(false);

  // Auto-scroll during drag selection when cursor is near viewport edges
  useEffect(() => {
    if (!isSelecting) {
      // Clean up scroll interval when not selecting
      if (scrollIntervalRef.current) {
        clearInterval(scrollIntervalRef.current);
        scrollIntervalRef.current = null;
      }
      return;
    }

    const SCROLL_ZONE = 80; // pixels from viewport edge to trigger scroll
    const SCROLL_SPEED = 10; // pixels per frame

    const handleMouseMove = (e: MouseEvent) => {
      const mouseY = e.clientY;
      const viewportHeight = window.innerHeight;

      // Clear any existing scroll interval
      if (scrollIntervalRef.current) {
        clearInterval(scrollIntervalRef.current);
        scrollIntervalRef.current = null;
      }

      // Check if cursor is near top of viewport
      if (mouseY < SCROLL_ZONE) {
        const intensity = 1 - mouseY / SCROLL_ZONE;
        const speed = Math.max(SCROLL_SPEED * intensity, 3);
        scrollIntervalRef.current = setInterval(() => {
          window.scrollBy(0, -speed);
        }, 16);
      }
      // Check if cursor is near bottom of viewport
      else if (mouseY > viewportHeight - SCROLL_ZONE) {
        const intensity = 1 - (viewportHeight - mouseY) / SCROLL_ZONE;
        const speed = Math.max(SCROLL_SPEED * intensity, 3);
        scrollIntervalRef.current = setInterval(() => {
          window.scrollBy(0, speed);
        }, 16);
      }
    };

    document.addEventListener('mousemove', handleMouseMove);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      if (scrollIntervalRef.current) {
        clearInterval(scrollIntervalRef.current);
        scrollIntervalRef.current = null;
      }
    };
  }, [isSelecting]);

  // Find the active segment based on current playback time
  const activeSegmentIndex = segments.findIndex(
    (seg, i) =>
      seg.timestamp <= currentTime &&
      (i === segments.length - 1 || segments[i + 1].timestamp > currentTime)
  );

  // Auto-scroll to active segment when it changes
  useEffect(() => {
    if (
      activeSegmentIndex >= 0 &&
      activeSegmentIndex !== lastActiveIndexRef.current &&
      autoScrollEnabled &&
      !isSelecting
    ) {
      const segmentEl = segmentRefs.current.get(activeSegmentIndex);
      const container = containerRef.current?.parentElement; // The scrollable CardContent
      if (segmentEl && container) {
        isAutoScrollingRef.current = true;
        // Calculate scroll position to center the segment in the container
        const containerRect = container.getBoundingClientRect();
        const segmentRect = segmentEl.getBoundingClientRect();
        const scrollTop = container.scrollTop + (segmentRect.top - containerRect.top) - (containerRect.height / 2) + (segmentRect.height / 2);
        container.scrollTo({
          top: scrollTop,
          behavior: "smooth",
        });
        // Reset auto-scrolling flag after animation
        setTimeout(() => {
          isAutoScrollingRef.current = false;
        }, 500);
      }
      lastActiveIndexRef.current = activeSegmentIndex;
    }
  }, [activeSegmentIndex, autoScrollEnabled, isSelecting]);

  // Detect manual scroll to pause auto-scroll
  useEffect(() => {
    const container = containerRef.current?.parentElement; // The scrollable CardContent
    if (!container) return;

    const handleScroll = () => {
      // Ignore scrolls triggered by auto-scroll
      if (isAutoScrollingRef.current) return;

      // User manually scrolled - pause auto-scroll temporarily
      setAutoScrollEnabled(false);

      // Clear existing timeout
      if (userScrollTimeoutRef.current) {
        clearTimeout(userScrollTimeoutRef.current);
      }

      // Resume auto-scroll after 5 seconds of no manual scrolling
      userScrollTimeoutRef.current = setTimeout(() => {
        setAutoScrollEnabled(true);
      }, 5000);
    };

    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      container.removeEventListener("scroll", handleScroll);
      if (userScrollTimeoutRef.current) {
        clearTimeout(userScrollTimeoutRef.current);
      }
    };
  }, []);

  // Resume auto-scroll when user clicks on a segment or seeks audio
  const handleSegmentSeek = useCallback(
    (timestamp: number) => {
      setAutoScrollEnabled(true);
      onSegmentClick(timestamp);
    },
    [onSegmentClick]
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
      const endTs = calculateEndTimestamp(segments, end);

      console.log('[Selection] Shift-click selection:', { start, end, startTs, endTs, selectedSegments: selectedSegments.map(s => ({ text: s.text.slice(0, 20), timestamp: s.timestamp })) });

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
        const endTs = calculateEndTimestamp(segments, end);

        console.log('[Selection] Drag selection:', { start, end, startTs, endTs, selectedSegments: selectedSegments.map(s => ({ text: s.text.slice(0, 20), timestamp: s.timestamp })) });

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
      const endTs = calculateEndTimestamp(segments, index);
      onSelectionChange?.({
        startIndex: index,
        endIndex: index,
        text: `[${formatTimestamp(seg.timestamp)}] ${seg.speaker}: ${seg.text}`,
        startTimestamp: seg.timestamp,
        endTimestamp: endTs,
      });
    }
  };

  // Handle double-click to select single segment for playbook
  const handleDoubleClick = (index: number) => {
    setSelectionStart(index);
    setSelectionEnd(index);

    const seg = segments[index];
    const endTs = calculateEndTimestamp(segments, index);
    onSelectionChange?.({
      startIndex: index,
      endIndex: index,
      text: `[${formatTimestamp(seg.timestamp)}] ${seg.speaker}: ${seg.text}`,
      startTimestamp: seg.timestamp,
      endTimestamp: endTs,
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
            ref={(el) => {
              if (el) segmentRefs.current.set(index, el);
              else segmentRefs.current.delete(index);
            }}
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
  { value: "feedback", label: "Feedback" },
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

  // Debug logging
  console.log('[SnippetAudioPlayer] Received props:', { startTime, endTime, duration: endTime - startTime });

  useEffect(() => {
    if (audioRef.current) {
      console.log('[SnippetAudioPlayer] Setting initial currentTime to:', startTime);
      audioRef.current.currentTime = startTime;
    }
  }, [startTime]);

  const togglePlay = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        console.log('[SnippetAudioPlayer] Starting playback at:', startTime, 'will stop at:', endTime);
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
        console.log('[SnippetAudioPlayer] Reached end time, stopping. time:', time, 'endTime:', endTime);
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
  const updateCallData = useMutation(api.calls.updateCallData);

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

  // Edit call modal state
  const [showEditModal, setShowEditModal] = useState(false);
  const [editProspectName, setEditProspectName] = useState("");
  const [editOutcome, setEditOutcome] = useState("");
  const [editDealValue, setEditDealValue] = useState<number | "">("");
  const [editNotes, setEditNotes] = useState("");
  const [isEditSaving, setIsEditSaving] = useState(false);
  const [editSaveSuccess, setEditSaveSuccess] = useState(false);

  const handleSegmentClick = useCallback((timestamp: number) => {
    setAudioSeekTime(timestamp);
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

  // Edit call handlers
  const handleOpenEditModal = () => {
    if (!call) return;
    setEditProspectName(call.prospectName || "");
    setEditOutcome(call.outcome || "");
    setEditDealValue(call.dealValue || "");
    setEditNotes(call.notes || "");
    setEditSaveSuccess(false);
    setShowEditModal(true);
  };

  const handleSaveCallEdit = async () => {
    if (!call) return;

    setIsEditSaving(true);
    try {
      await updateCallData({
        callId: call._id,
        prospectName: editProspectName || undefined,
        outcome: editOutcome || undefined,
        dealValue: editDealValue ? Number(editDealValue) : undefined,
        notes: editNotes || undefined,
      });

      setEditSaveSuccess(true);
      setTimeout(() => {
        setEditSaveSuccess(false);
        setShowEditModal(false);
      }, 1500);
    } catch (error) {
      console.error("Failed to update call:", error);
    } finally {
      setIsEditSaving(false);
    }
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
          className="inline-flex items-center text-sm text-zinc-400 hover:text-black mb-6"
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

                {/* Talk-to-Listen Ratio */}
                <TalkRatioBar
                  closerTalkTime={call.closerTalkTime}
                  prospectTalkTime={call.prospectTalkTime}
                />

                {/* Outcome */}
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-zinc-500" />
                  {getOutcomeBadge(call.outcome)}
                </div>

                {/* Deal Value - Show split values for new calls, legacy value for old calls */}
                {(call.contractValue || call.dealValue) && (
                  <div className="flex items-center gap-2">
                    <DollarSign className="h-4 w-4 text-green-500" />
                    {call.contractValue ? (
                      <div className="flex flex-col text-sm">
                        <span className="font-medium text-green-500">
                          {formatCurrency(call.cashCollected || 0)} / {formatCurrency(call.contractValue)}
                        </span>
                        <span className="text-xs text-zinc-500">Cash / Contract</span>
                      </div>
                    ) : (
                      <span className="text-sm font-medium text-green-500">
                        {formatCurrency(call.dealValue || 0)}
                      </span>
                    )}
                  </div>
                )}

                {/* Edit Button */}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleOpenEditModal}
                  className="gap-2"
                >
                  <Pencil className="h-4 w-4" />
                  Edit
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* AI Call Summary - Expandable */}
        <CallSummary
          summary={call.summary}
          isLoading={call.status === "completed" && !call.summary && call.transcriptText ? true : false}
        />

        {/* Audio Player - Sticky */}
        {call.recordingUrl ? (
          <div className="sticky top-0 z-10 mb-6">
            <AudioPlayer
              src={call.recordingUrl}
              onTimeUpdate={handleTimeUpdate}
              seekTo={audioSeekTime}
              speakerSegments={call.transcriptSegments?.map(seg => ({
                speaker: seg.speaker,
                timestamp: seg.timestamp,
              }))}
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
              <CardContent className="max-h-[600px] overflow-y-auto">
                <TranscriptView
                  transcript={call.transcriptText || ""}
                  ammoItems={call.ammo}
                  currentTime={currentPlaybackTime}
                  onSegmentClick={handleSegmentClick}
                  highlightedAmmo={highlightedAmmo}
                  onSelectionChange={handleSelectionChange}
                  selectedIndices={selection ? new Set(Array.from({ length: selection.endIndex - selection.startIndex + 1 }, (_, i) => selection.startIndex + i)) : undefined}
                  speakerMapping={call.speakerMapping}
                  dbSegments={call.transcriptSegments}
                />
              </CardContent>
            </Card>
          </div>

          {/* AI Analysis Sidebar (Ammo V2) */}
          <div className="lg:col-span-1">
            <Card className="lg:sticky lg:top-24 lg:max-h-[calc(100vh-120px)] flex flex-col">
              <CardHeader className="flex-shrink-0">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Zap className="h-5 w-5" />
                  <span>AI Analysis</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="flex-1 overflow-y-auto min-h-0">
                <AmmoV2Panel
                  analysis={call.ammoAnalysis || null}
                  showTitle={false}
                />
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Notes Section - Only show if notes exist */}
        {call.notes && (
          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <FileText className="h-5 w-5 text-zinc-500" />
                <span>Closer Notes</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="bg-zinc-50 rounded-lg p-4 border border-zinc-200">
                <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">
                  {call.notes}
                </p>
              </div>
              <p className="text-xs text-zinc-500 mt-3">
                Notes captured by {call.closer?.name || "the closer"} during or after the call
              </p>
            </CardContent>
          </Card>
        )}
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

      {/* Edit Call Modal */}
      <Dialog open={showEditModal} onOpenChange={setShowEditModal}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Edit Call Details</DialogTitle>
            <DialogDescription>
              Update the call information. Changes will be saved immediately.
            </DialogDescription>
          </DialogHeader>

          {editSaveSuccess ? (
            <div className="flex flex-col items-center justify-center py-8">
              <div className="h-12 w-12 rounded-full bg-green-500/10 flex items-center justify-center mb-4">
                <Check className="h-6 w-6 text-green-500" />
              </div>
              <p className="text-lg font-medium">Changes Saved!</p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Prospect Name */}
              <div>
                <Label htmlFor="editProspectName" className="text-sm font-medium">
                  Prospect Name
                </Label>
                <Input
                  id="editProspectName"
                  value={editProspectName}
                  onChange={(e) => setEditProspectName(e.target.value)}
                  placeholder="Enter prospect name"
                  className="mt-2"
                />
              </div>

              {/* Outcome */}
              <div>
                <Label htmlFor="editOutcome" className="text-sm font-medium">
                  Outcome
                </Label>
                <Select value={editOutcome} onValueChange={setEditOutcome}>
                  <SelectTrigger className="mt-2">
                    <SelectValue placeholder="Select outcome" />
                  </SelectTrigger>
                  <SelectContent>
                    {OUTCOME_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Deal Value (only show if outcome is closed) */}
              {editOutcome === "closed" && (
                <div>
                  <Label htmlFor="editDealValue" className="text-sm font-medium">
                    Deal Value
                  </Label>
                  {/* Quick select buttons */}
                  <div className="flex flex-wrap gap-2 mt-2 mb-3">
                    {DEAL_VALUE_PRESETS.map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setEditDealValue(preset)}
                        className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                          editDealValue === preset
                            ? "bg-primary text-primary-foreground"
                            : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200"
                        }`}
                      >
                        {formatCurrency(preset)}
                      </button>
                    ))}
                  </div>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500">$</span>
                    <Input
                      id="editDealValue"
                      type="number"
                      value={editDealValue}
                      onChange={(e) => setEditDealValue(e.target.value ? Number(e.target.value) : "")}
                      placeholder="Custom amount"
                      className="pl-8"
                    />
                  </div>
                </div>
              )}

              {/* Notes */}
              <div>
                <Label htmlFor="editNotes" className="text-sm font-medium">
                  Notes
                </Label>
                <Textarea
                  id="editNotes"
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  placeholder="Add any notes about this call..."
                  className="mt-2"
                  rows={3}
                />
              </div>
            </div>
          )}

          {!editSaveSuccess && (
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowEditModal(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleSaveCallEdit}
                disabled={isEditSaving}
              >
                {isEditSaving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Save Changes"
                )}
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
