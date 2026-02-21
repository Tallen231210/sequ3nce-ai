"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { Id } from "../../../../../convex/_generated/dataModel";
import { useTeam } from "@/hooks/useTeam";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  ArrowLeft,
  Play,
  Pause,
  Volume2,
  VolumeX,
  CheckCircle2,
  MessageCircle,
  Clock,
  Pin,
  Send,
  Trash2,
  Share2,
} from "lucide-react";
import { useState, useRef, useEffect, useCallback, use } from "react";
import { useRouter } from "next/navigation";

// ──────────────────────────────────────────────
// Utility functions
// ──────────────────────────────────────────────

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function formatCallDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

// ──────────────────────────────────────────────
// Video Player with Comment Markers
// ──────────────────────────────────────────────

function VideoReviewPlayer({
  recordingUrl,
  comments,
  currentTime,
  duration,
  isPlaying,
  onTimeUpdate,
  onDurationChange,
  onPlayPause,
  onSeek,
  videoRef,
}: {
  recordingUrl: string;
  comments: Array<{ timestampSeconds?: number; _id: string }>;
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  onTimeUpdate: (time: number) => void;
  onDurationChange: (duration: number) => void;
  onPlayPause: () => void;
  onSeek: (time: number) => void;
  videoRef: React.RefObject<HTMLVideoElement | null>;
}) {
  const [isMuted, setIsMuted] = useState(false);
  const progressRef = useRef<HTMLDivElement>(null);

  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!progressRef.current || duration === 0) return;
    const rect = progressRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const fraction = Math.max(0, Math.min(1, x / rect.width));
    onSeek(fraction * duration);
  };

  const commentMarkers = comments.filter(
    (c) => c.timestampSeconds !== undefined && c.timestampSeconds !== null
  );

  return (
    <div className="bg-zinc-950 rounded-lg overflow-hidden">
      {/* Video */}
      <div className="relative aspect-video bg-black">
        <video
          ref={videoRef}
          src={recordingUrl}
          className="w-full h-full object-contain"
          onTimeUpdate={(e) => onTimeUpdate(e.currentTarget.currentTime)}
          onLoadedMetadata={(e) => onDurationChange(e.currentTarget.duration)}
          onEnded={() => onPlayPause()}
          muted={isMuted}
        />
      </div>

      {/* Controls */}
      <div className="px-4 py-3 space-y-2">
        {/* Progress bar with comment markers */}
        <div
          ref={progressRef}
          className="relative h-2 bg-zinc-700 rounded-full cursor-pointer group"
          onClick={handleProgressClick}
        >
          {/* Progress fill */}
          <div
            className="absolute inset-y-0 left-0 bg-white rounded-full transition-[width] duration-100"
            style={{ width: duration > 0 ? `${(currentTime / duration) * 100}%` : "0%" }}
          />

          {/* Comment dots */}
          {commentMarkers.map((comment) => {
            const position = duration > 0 ? ((comment.timestampSeconds ?? 0) / duration) * 100 : 0;
            return (
              <button
                key={comment._id}
                className="absolute top-1/2 -translate-y-1/2 h-3 w-3 rounded-full bg-blue-400 border-2 border-zinc-950 hover:scale-125 transition-transform z-10"
                style={{ left: `${position}%`, marginLeft: "-6px" }}
                onClick={(e) => {
                  e.stopPropagation();
                  onSeek(comment.timestampSeconds ?? 0);
                }}
                title={`Comment at ${formatTime(comment.timestampSeconds ?? 0)}`}
              />
            );
          })}

          {/* Hover expand */}
          <div className="absolute inset-0 -top-1 -bottom-1 group-hover:bg-zinc-600/30 rounded-full" />
        </div>

        {/* Controls row */}
        <div className="flex items-center gap-3">
          <button
            onClick={onPlayPause}
            className="text-white hover:text-zinc-300 transition-colors"
          >
            {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
          </button>

          <span className="text-xs text-zinc-400 font-mono tabular-nums">
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>

          <div className="flex-1" />

          <button
            onClick={() => {
              setIsMuted(!isMuted);
              if (videoRef.current) videoRef.current.muted = !isMuted;
            }}
            className="text-zinc-400 hover:text-white transition-colors"
          >
            {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────
// Transcript Panel (synced to video)
// ──────────────────────────────────────────────

function TranscriptPanel({
  callId,
  currentTime,
  onSeek,
}: {
  callId: Id<"calls">;
  currentTime: number;
  onSeek: (time: number) => void;
}) {
  const segments = useQuery(api.calls.getTranscriptSegments, { callId });
  const containerRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to active segment
  useEffect(() => {
    if (activeRef.current && containerRef.current) {
      const container = containerRef.current;
      const active = activeRef.current;
      const containerRect = container.getBoundingClientRect();
      const activeRect = active.getBoundingClientRect();

      if (
        activeRect.top < containerRect.top ||
        activeRect.bottom > containerRect.bottom
      ) {
        active.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }
  }, [currentTime]);

  if (!segments) {
    return (
      <div className="p-4 text-sm text-muted-foreground">Loading transcript...</div>
    );
  }

  if (segments.length === 0) {
    return (
      <div className="p-4 text-sm text-muted-foreground">No transcript available</div>
    );
  }

  // Find the current active segment
  const activeIndex = segments.findLastIndex((s) => s.timestamp <= currentTime);

  return (
    <div ref={containerRef} className="overflow-y-auto max-h-[300px] p-3 space-y-2">
      {segments.map((segment, index) => {
        const isActive = index === activeIndex;
        const isSpeakerCloser = segment.speaker === "closer";

        return (
          <div
            key={segment._id}
            ref={isActive ? activeRef : undefined}
            className={`
              p-2 rounded-md cursor-pointer transition-colors text-sm
              ${isActive ? "bg-zinc-100 ring-1 ring-zinc-200" : "hover:bg-zinc-50"}
            `}
            onClick={() => onSeek(segment.timestamp)}
          >
            <div className="flex items-center gap-2 mb-0.5">
              <span
                className={`text-[10px] font-medium uppercase tracking-wider ${
                  isSpeakerCloser ? "text-blue-600" : "text-emerald-600"
                }`}
              >
                {isSpeakerCloser ? "Closer" : "Prospect"}
              </span>
              <span className="text-[10px] text-muted-foreground">
                {formatTime(segment.timestamp)}
              </span>
            </div>
            <p className="text-foreground leading-relaxed">{segment.text}</p>
          </div>
        );
      })}
    </div>
  );
}

// ──────────────────────────────────────────────
// Comments Panel
// ──────────────────────────────────────────────

function CommentsPanel({
  callId,
  teamId,
  currentTime,
  onSeek,
  userId,
  userName,
}: {
  callId: Id<"calls">;
  teamId: Id<"teams">;
  currentTime: number;
  onSeek: (time: number) => void;
  userId: string;
  userName: string;
}) {
  const comments = useQuery(api.callReviews.getCommentsForCall, { callId });
  const addComment = useMutation(api.callReviews.addComment);
  const deleteComment = useMutation(api.callReviews.deleteComment);

  const [newComment, setNewComment] = useState("");
  const [pinToTime, setPinToTime] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const commentsEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new comments
  useEffect(() => {
    commentsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [comments?.length]);

  const handleSubmit = async () => {
    if (!newComment.trim() || isSubmitting) return;

    setIsSubmitting(true);
    try {
      await addComment({
        callId,
        teamId,
        authorType: "manager",
        authorId: userId,
        authorName: userName,
        content: newComment.trim(),
        timestampSeconds: pinToTime ? Math.floor(currentTime) : undefined,
      });
      setNewComment("");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (commentId: Id<"callComments">) => {
    await deleteComment({ commentId, authorId: userId });
  };

  return (
    <div className="flex flex-col h-full">
      {/* Comments list */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {!comments ? (
          <p className="text-sm text-muted-foreground">Loading comments...</p>
        ) : comments.length === 0 ? (
          <div className="text-center py-8">
            <MessageCircle className="h-8 w-8 text-zinc-300 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No comments yet</p>
            <p className="text-xs text-zinc-400 mt-1">
              Add feedback to help the closer improve
            </p>
          </div>
        ) : (
          comments.map((comment) => (
            <div
              key={comment._id}
              className="group p-3 rounded-lg bg-zinc-50 hover:bg-zinc-100 transition-colors"
            >
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-foreground">
                    {comment.authorName}
                  </span>
                  {comment.timestampSeconds !== undefined && (
                    <button
                      className="flex items-center gap-0.5 text-[10px] text-blue-600 hover:text-blue-700 font-mono"
                      onClick={() => onSeek(comment.timestampSeconds!)}
                    >
                      <Clock className="h-3 w-3" />
                      {formatTime(comment.timestampSeconds)}
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-muted-foreground">
                    {formatRelativeTime(comment.createdAt)}
                  </span>
                  {comment.authorId === userId && (
                    <button
                      onClick={() => handleDelete(comment._id)}
                      className="opacity-0 group-hover:opacity-100 text-zinc-400 hover:text-red-500 transition-all"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  )}
                </div>
              </div>
              <p className="text-sm text-foreground leading-relaxed">
                {comment.content}
              </p>
            </div>
          ))
        )}
        <div ref={commentsEndRef} />
      </div>

      {/* Add comment form */}
      <div className="border-t border-border p-3">
        <div className="flex items-center gap-2 mb-2">
          <button
            onClick={() => setPinToTime(!pinToTime)}
            className={`flex items-center gap-1 text-xs px-2 py-1 rounded-md transition-colors ${
              pinToTime
                ? "bg-blue-50 text-blue-600 border border-blue-200"
                : "text-muted-foreground hover:bg-zinc-100"
            }`}
          >
            <Pin className="h-3 w-3" />
            {pinToTime ? formatTime(currentTime) : "No timestamp"}
          </button>
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSubmit();
              }
            }}
            placeholder="Add feedback..."
            className="flex-1 text-sm px-3 py-2 rounded-md border border-input bg-background focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={!newComment.trim() || isSubmitting}
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────
// Main Review Page
// ──────────────────────────────────────────────

export default function CallReviewPage({
  params,
}: {
  params: Promise<{ callId: string }>;
}) {
  const { callId } = use(params);
  const router = useRouter();
  const { team, user: dbUser } = useTeam();

  const call = useQuery(
    api.callReviews.getCallForReview,
    callId ? { callId: callId as Id<"calls"> } : "skip"
  );
  const comments = useQuery(
    api.callReviews.getCommentsForCall,
    callId ? { callId: callId as Id<"calls"> } : "skip"
  );
  const markAsReviewed = useMutation(api.callReviews.markAsReviewed);

  // Video state
  const videoRef = useRef<HTMLVideoElement>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  const handlePlayPause = useCallback(() => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
    } else {
      videoRef.current.play();
    }
    setIsPlaying(!isPlaying);
  }, [isPlaying]);

  const handleSeek = useCallback((time: number) => {
    if (!videoRef.current) return;
    videoRef.current.currentTime = time;
    setCurrentTime(time);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      )
        return;

      switch (e.key) {
        case " ":
          e.preventDefault();
          handlePlayPause();
          break;
        case "ArrowLeft":
          e.preventDefault();
          handleSeek(Math.max(0, currentTime - 5));
          break;
        case "ArrowRight":
          e.preventDefault();
          handleSeek(Math.min(duration, currentTime + 5));
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handlePlayPause, handleSeek, currentTime, duration]);

  const handleMarkReviewed = async () => {
    if (!dbUser) return;
    await markAsReviewed({
      callId: callId as Id<"calls">,
      reviewedBy: dbUser._id as Id<"users">,
    });
  };

  // Loading
  if (!call || !team || !dbUser) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-pulse text-muted-foreground">Loading review...</div>
      </div>
    );
  }

  const isReviewed = call.reviewStatus === "reviewed";
  const isFlagged = call.flaggedForReview && !isReviewed;

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push("/dashboard/call-reviews")}
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-semibold">
                {call.prospectName || "Unknown Prospect"}
              </h1>
              {isFlagged && (
                <Badge variant="outline" className="text-orange-600 border-orange-200 bg-orange-50">
                  Flagged
                </Badge>
              )}
              {isReviewed && (
                <Badge variant="outline" className="text-green-600 border-green-200 bg-green-50">
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                  Reviewed
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              {call.closerName} &middot;{" "}
              {formatCallDate(call.startedAt || call.createdAt)}
              {call.duration && ` &middot; ${formatTime(call.duration)}`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isFlagged && !isReviewed && (
            <Button size="sm" onClick={handleMarkReviewed}>
              <CheckCircle2 className="h-4 w-4 mr-1" />
              Mark as Reviewed
            </Button>
          )}
        </div>
      </div>

      {/* Main content — split layout */}
      <div className="flex-1 flex min-h-0">
        {/* Left: Video + Transcript (~65%) */}
        <div className="w-[65%] flex flex-col border-r border-border overflow-y-auto">
          <div className="p-4">
            {call.recordingUrl ? (
              <VideoReviewPlayer
                recordingUrl={call.recordingUrl}
                comments={comments ?? []}
                currentTime={currentTime}
                duration={duration}
                isPlaying={isPlaying}
                onTimeUpdate={setCurrentTime}
                onDurationChange={setDuration}
                onPlayPause={handlePlayPause}
                onSeek={handleSeek}
                videoRef={videoRef}
              />
            ) : (
              <Card className="flex items-center justify-center h-48 bg-zinc-50">
                <p className="text-muted-foreground text-sm">
                  No recording available
                </p>
              </Card>
            )}
          </div>

          {/* Transcript */}
          <div className="flex-1 border-t border-border">
            <div className="px-4 py-2 border-b border-border">
              <h3 className="text-sm font-medium">Transcript</h3>
            </div>
            <TranscriptPanel
              callId={callId as Id<"calls">}
              currentTime={currentTime}
              onSeek={handleSeek}
            />
          </div>
        </div>

        {/* Right: Comments (~35%) */}
        <div className="w-[35%] flex flex-col">
          <div className="px-4 py-2 border-b border-border flex items-center justify-between">
            <h3 className="text-sm font-medium flex items-center gap-2">
              <MessageCircle className="h-4 w-4" />
              Comments
              {(comments?.length ?? 0) > 0 && (
                <Badge variant="secondary" className="text-xs">
                  {comments?.length}
                </Badge>
              )}
            </h3>
          </div>
          <CommentsPanel
            callId={callId as Id<"calls">}
            teamId={call.teamId as Id<"teams">}
            currentTime={currentTime}
            onSeek={handleSeek}
            userId={dbUser.clerkId}
            userName={dbUser.name || "Manager"}
          />
        </div>
      </div>
    </div>
  );
}
