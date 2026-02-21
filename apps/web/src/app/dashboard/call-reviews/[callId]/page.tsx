"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { Id } from "../../../../../convex/_generated/dataModel";
import { useTeam } from "@/hooks/useTeam";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ArrowLeft, CheckCircle2, MessageCircle, Share2 } from "lucide-react";
import { useState, useRef, useEffect, useCallback, use } from "react";
import { useRouter } from "next/navigation";

import { VideoReviewPlayer } from "@/components/call-reviews/VideoReviewPlayer";
import { TranscriptPanel } from "@/components/call-reviews/TranscriptPanel";
import { CommentsPanel } from "@/components/call-reviews/CommentsPanel";
import { formatTime, formatCallDate } from "@/components/call-reviews/utils";

const MAX_SHARE_TITLE_LENGTH = 200;
const MAX_SHARE_NOTES_LENGTH = 1000;

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
  const shareCallMoment = useMutation(api.callReviews.shareCallMoment);
  const markManagerRead = useMutation(api.callReviews.markManagerRead);

  // Share moment state
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [shareMomentTitle, setShareMomentTitle] = useState("");
  const [shareMomentNotes, setShareMomentNotes] = useState("");
  const [shareStartTime, setShareStartTime] = useState(0);
  const [shareEndTime, setShareEndTime] = useState(0);
  const [isSharing, setIsSharing] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);

  // Video state
  const videoRef = useRef<HTMLVideoElement>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [videoError, setVideoError] = useState(false);

  // Mark as read by manager when opening the review
  useEffect(() => {
    if (callId) {
      markManagerRead({ callId: callId as Id<"calls"> });
    }
  }, [callId, markManagerRead]);

  // Cleanup video on unmount
  useEffect(() => {
    return () => {
      if (videoRef.current) {
        videoRef.current.pause();
        videoRef.current.src = "";
        videoRef.current.load();
      }
    };
  }, []);

  const handlePlayPause = useCallback(() => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
    } else {
      videoRef.current.play().catch((err) => {
        console.error("Play failed:", err);
      });
    }
    // State syncs via onPlay/onPause video events → onPlayStateChange
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

  const handleOpenShareDialog = () => {
    const start = Math.max(0, Math.floor(currentTime - 5));
    const end = Math.min(duration, start + 30);
    setShareStartTime(start);
    setShareEndTime(end);
    setShareMomentTitle("");
    setShareMomentNotes("");
    setShareError(null);
    setShowShareDialog(true);
  };

  const handleShareMoment = async () => {
    if (!team || !dbUser || !call || !shareMomentTitle.trim()) return;
    if (shareStartTime >= shareEndTime) return;
    if (shareMomentTitle.trim().length > MAX_SHARE_TITLE_LENGTH) {
      setShareError(`Title too long (max ${MAX_SHARE_TITLE_LENGTH} chars)`);
      return;
    }
    if (shareMomentNotes.trim().length > MAX_SHARE_NOTES_LENGTH) {
      setShareError(`Notes too long (max ${MAX_SHARE_NOTES_LENGTH} chars)`);
      return;
    }

    setIsSharing(true);
    setShareError(null);
    try {
      await shareCallMoment({
        callId: callId as Id<"calls">,
        teamId: team._id as Id<"teams">,
        closerId: call.closerId as Id<"closers">,
        title: shareMomentTitle.trim(),
        notes: shareMomentNotes.trim() || undefined,
        startSeconds: shareStartTime,
        endSeconds: shareEndTime,
        sharedBy: dbUser._id as Id<"users">,
      });
      setShowShareDialog(false);
    } catch (error) {
      console.error("Failed to share moment:", error);
      setShareError("Failed to share moment. Please try again.");
    } finally {
      setIsSharing(false);
    }
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
    <div className="h-screen flex flex-col">
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
              {call.duration && <> &middot; {formatTime(call.duration)}</>}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {call.recordingUrl && (
            <Button size="sm" variant="outline" onClick={handleOpenShareDialog}>
              <Share2 className="h-4 w-4 mr-1" />
              Share Moment
            </Button>
          )}
          {isFlagged && !isReviewed && (
            <Button size="sm" onClick={handleMarkReviewed}>
              <CheckCircle2 className="h-4 w-4 mr-1" />
              Mark as Reviewed
            </Button>
          )}
        </div>
      </div>

      {/* Share Moment Dialog */}
      {showShareDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-lg shadow-lg w-full max-w-md p-6">
            <h2 className="text-lg font-semibold mb-4">Share Moment with Team</h2>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-zinc-700 block mb-1">Title</label>
                <input
                  type="text"
                  value={shareMomentTitle}
                  onChange={(e) => setShareMomentTitle(e.target.value)}
                  placeholder="e.g. Great objection handle"
                  maxLength={MAX_SHARE_TITLE_LENGTH}
                  className="w-full px-3 py-2 border rounded-md text-sm"
                  autoFocus
                />
              </div>
              <div className="flex gap-4">
                <div className="flex-1">
                  <label className="text-sm font-medium text-zinc-700 block mb-1">Start (seconds)</label>
                  <input
                    type="number"
                    value={shareStartTime}
                    onChange={(e) => setShareStartTime(Math.max(0, Number(e.target.value)))}
                    min={0}
                    max={duration}
                    className="w-full px-3 py-2 border rounded-md text-sm"
                  />
                </div>
                <div className="flex-1">
                  <label className="text-sm font-medium text-zinc-700 block mb-1">End (seconds)</label>
                  <input
                    type="number"
                    value={shareEndTime}
                    onChange={(e) => setShareEndTime(Math.min(duration, Number(e.target.value)))}
                    min={shareStartTime}
                    max={duration}
                    className="w-full px-3 py-2 border rounded-md text-sm"
                  />
                </div>
              </div>
              <p className={`text-xs ${shareStartTime >= shareEndTime ? "text-red-500" : "text-zinc-500"}`}>
                {shareStartTime >= shareEndTime
                  ? "Start time must be before end time"
                  : `Clip duration: ${Math.round(shareEndTime - shareStartTime)}s (${formatTime(shareStartTime)} — ${formatTime(shareEndTime)})`
                }
              </p>
              <div>
                <label className="text-sm font-medium text-zinc-700 block mb-1">Notes (optional)</label>
                <textarea
                  value={shareMomentNotes}
                  onChange={(e) => setShareMomentNotes(e.target.value)}
                  placeholder="Why is this moment worth watching?"
                  maxLength={MAX_SHARE_NOTES_LENGTH}
                  rows={2}
                  className="w-full px-3 py-2 border rounded-md text-sm resize-none"
                />
              </div>
              {shareError && (
                <p className="text-xs text-red-500">{shareError}</p>
              )}
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" size="sm" onClick={() => setShowShareDialog(false)}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleShareMoment}
                  disabled={!shareMomentTitle.trim() || isSharing || shareStartTime >= shareEndTime}
                >
                  {isSharing ? "Sharing..." : "Share with Team"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main content — split layout */}
      <div className="flex-1 flex min-h-0">
        {/* Left: Video + Transcript (~65%) */}
        <div className="w-[65%] flex flex-col border-r border-border">
          {/* Video — fixed at top, never scrolls */}
          <div className="shrink-0 p-4">
            {call.recordingUrl && !videoError ? (
              <VideoReviewPlayer
                recordingUrl={call.recordingUrl}
                comments={comments ?? []}
                currentTime={currentTime}
                duration={duration}
                isPlaying={isPlaying}
                onTimeUpdate={setCurrentTime}
                onDurationChange={setDuration}
                onPlayPause={handlePlayPause}
                onPlayStateChange={setIsPlaying}
                onSeek={handleSeek}
                onVideoError={() => setVideoError(true)}
                videoRef={videoRef}
              />
            ) : (
              <Card className="flex items-center justify-center h-48 bg-zinc-50">
                <p className="text-muted-foreground text-sm">
                  {videoError ? "Failed to load recording" : "No recording available"}
                </p>
              </Card>
            )}
          </div>

          {/* Transcript — fills remaining space, scrolls independently */}
          <div className="flex-1 flex flex-col min-h-0 border-t border-border">
            <div className="shrink-0 px-4 py-2 border-b border-border">
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
