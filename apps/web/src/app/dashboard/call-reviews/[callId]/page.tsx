"use client";

import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { Id } from "../../../../../convex/_generated/dataModel";
import { useTeam } from "@/hooks/useTeam";
import { useUser } from "@clerk/nextjs";
import { ArrowLeftRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ArrowLeft, CheckCircle2, MessageCircle, Share2 } from "lucide-react";
import { useState, useRef, useEffect, useCallback, use } from "react";
import { useRouter } from "next/navigation";
import { resolvePlayback } from "@/lib/callPlayback";

import { VideoReviewPlayer } from "@/components/call-reviews/VideoReviewPlayer";
import { TranscriptPanel } from "@/components/call-reviews/TranscriptPanel";
import { ChapterStrip } from "@/components/call-reviews/ChapterStrip";
import { AnalysisPanel } from "@/components/call-reviews/AnalysisPanel";
import { CommentsPanel } from "@/components/call-reviews/CommentsPanel";
import { UnifiedShareDialog } from "@/components/call-reviews/UnifiedShareDialog";
import { formatTime, formatCallDate } from "@/components/call-reviews/utils";

function isRecentCall(timestamp: number): boolean {
  return Date.now() - timestamp < 5 * 60 * 1000; // 5 minutes
}

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
  // Same resolver the Completed Calls page and the closer app use, so all
  // three agree on whether a call has a recording and where it plays.
  const reviewPlayback = resolvePlayback(call ?? {});

  const comments = useQuery(
    api.callReviews.getCommentsForCall,
    callId ? { callId: callId as Id<"calls"> } : "skip"
  );
  const markAsReviewed = useMutation(api.callReviews.markAsReviewed);
  const markManagerRead = useMutation(api.callReviews.markManagerRead);
  const closers = useQuery(
    api.closers.getClosers,
    dbUser?.clerkId ? { clerkId: dbUser.clerkId } : "skip"
  );

  // Share dialog state
  const [showShareDialog, setShowShareDialog] = useState(false);

  // Tab state
  const [activeTab, setActiveTab] = useState<"transcript" | "analysis">("transcript");

  // Video state
  const videoRef = useRef<HTMLVideoElement>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [videoError, setVideoError] = useState(false);

  // Recording URL refresh (Recall.ai signed URLs expire after ~24h)
  const refreshRecordingUrl = useAction(api.meetingBot.refreshRecordingUrl);
  const [freshRecordingUrl, setFreshRecordingUrl] = useState<string | null>(null);
  const [isRefreshingUrl, setIsRefreshingUrl] = useState(false);

  // Mark as read by manager when opening the review
  useEffect(() => {
    if (callId) {
      markManagerRead({ callId: callId as Id<"calls"> });
    }
  }, [callId, markManagerRead]);

  // Refresh recording URL on mount — Recall's signed URLs expire ~6 hours
  // after the call, so the stored one is only good on the day.
  //
  // This page previously lost a race with itself: the player mounted with the
  // STALE stored URL on first render, the expired link 403'd in ~200ms, and a
  // sticky videoError flag showed "Failed to load recording" forever — while
  // the fresh URL arrived a moment later and was thrown away. That is exactly
  // what a manager reviewing yesterday's call saw. The player is now gated
  // below until this refresh settles, and the error flag is cleared whenever
  // a new URL comes in.
  useEffect(() => {
    if (!call?.recordingUrl || freshRecordingUrl || isRefreshingUrl) return;
    setIsRefreshingUrl(true);
    refreshRecordingUrl({ callId: callId as Id<"calls"> })
      .then((result) => {
        if (result.recordingUrl) {
          setFreshRecordingUrl(result.recordingUrl);
        } else {
          // No fresh URL to be had (legacy recording with no Recall bot).
          // The stored one is all there is — let the player try it.
          setFreshRecordingUrl(call.recordingUrl!);
        }
        setVideoError(false);
      })
      .catch((err) => {
        console.error("Failed to refresh recording URL:", err);
        // The stored URL is very likely expired — that's why we refresh — so
        // "falling back" to it used to guarantee the failure screen. Try it
        // anyway (it might still be inside its window), but leave the error
        // path open to retry below rather than dead-ending.
        setFreshRecordingUrl(call.recordingUrl!);
      })
      .finally(() => setIsRefreshingUrl(false));
  }, [call?.recordingUrl, callId]); // eslint-disable-line react-hooks/exhaustive-deps

  // One retry on playback error: refresh the URL again and clear the flag.
  // Covers the refresh itself hiccuping, and a tab left open past the 6-hour
  // window. One attempt, not a loop — a genuinely missing recording should
  // say so rather than spin.
  const retriedRef = useRef(false);
  useEffect(() => {
    if (!videoError || retriedRef.current || !call?.recordingUrl) return;
    retriedRef.current = true;
    refreshRecordingUrl({ callId: callId as Id<"calls"> })
      .then((result) => {
        if (result.recordingUrl) {
          setFreshRecordingUrl(result.recordingUrl);
          setVideoError(false);
        }
      })
      .catch(() => {
        // The error card is already showing; nothing better to do.
      });
  }, [videoError, call?.recordingUrl, callId, refreshRecordingUrl]);

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
    setShowShareDialog(true);
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
          {/* Fathom keeps the recording on their side, so there is no player
              on this page and nothing for the share dialog to share. Send the
              manager to the one place the video actually exists. */}
          {reviewPlayback.kind === 'external' && (
            <Button size="sm" variant="outline" asChild>
              <a
                href={reviewPlayback.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                Watch on {reviewPlayback.provider}
              </a>
            </Button>
          )}
          {call.recordingUrl && (
            <Button size="sm" variant="outline" onClick={handleOpenShareDialog}>
              <Share2 className="h-4 w-4 mr-1" />
              Share
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

      {/* Unified Share Dialog */}
      {showShareDialog && (
        <UnifiedShareDialog
          callId={callId as Id<"calls">}
          teamId={team._id as Id<"teams">}
          closerId={call.closerId as Id<"closers">}
          userId={dbUser._id as Id<"users">}
          userClerkId={dbUser.clerkId}
          currentTime={currentTime}
          duration={duration}
          closers={closers}
          onClose={() => setShowShareDialog(false)}
        />
      )}

      {/* Main content — split layout */}
      <div className="flex-1 flex min-h-0">
        {/* Left: Video + Transcript (~65%) */}
        <div className="w-[65%] flex flex-col border-r border-border">
          {/* Video — fixed at top, never scrolls */}
          <div className="shrink-0 p-4">
            {call.recordingUrl && !videoError ? (
              // Wait for the refreshed URL rather than mounting the player
              // with the stored one. The stored URL is expired for any call
              // older than ~6 hours, and mounting with it starts the race
              // this page used to lose.
              !freshRecordingUrl ? (
                <Card className="flex items-center justify-center h-48 bg-zinc-50">
                  <p className="text-muted-foreground text-sm animate-pulse">Loading recording...</p>
                </Card>
              ) : (
                <VideoReviewPlayer
                  recordingUrl={freshRecordingUrl}
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
              )
            ) : (
              <Card className="flex items-center justify-center h-48 bg-zinc-50">
                <p className="text-muted-foreground text-sm">
                  {videoError ? "Failed to load recording" : "No recording available"}
                </p>
              </Card>
            )}
          </div>

          {/* Chapter Strip — below video */}
          <ChapterStrip
            chapters={call.callAnalysis?.chapters}
            currentTime={currentTime}
            onSeek={handleSeek}
            isAnalyzing={!call.callAnalysis && call.status === "completed" && isRecentCall(call.endedAt || call.startedAt || call.createdAt)}
          />

          {/* Tab bar + content — fills remaining space */}
          <div className="flex-1 flex flex-col min-h-0 border-t border-border">
            <div className="shrink-0 px-4 flex gap-4 border-b border-border">
              <button
                onClick={() => setActiveTab("transcript")}
                className={`py-2 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === "transcript"
                    ? "border-foreground text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                Transcript
              </button>
              <button
                onClick={() => setActiveTab("analysis")}
                className={`py-2 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === "analysis"
                    ? "border-foreground text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                Analysis
              </button>
              {/* The escape hatch for mislabelled speakers. Automation gets
                  this wrong in ways no heuristic anticipates (a closer
                  quick-botting her own meeting inverted two full calls); the
                  humans on the call know instantly which way is right. */}
              <SwapSpeakersButton callId={callId as Id<"calls">} flippedAt={(call as any).speakerLabelsFlippedAt} />
            </div>
            {activeTab === "transcript" ? (
              <TranscriptPanel
                callId={callId as Id<"calls">}
                currentTime={currentTime}
                onSeek={handleSeek}
              />
            ) : (
              <AnalysisPanel
                callAnalysis={call.callAnalysis}
                isRecent={isRecentCall(call.endedAt || call.startedAt || call.createdAt)}
              />
            )}
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

/**
 * Flip Closer ↔ Prospect on the whole call. Two clicks — the second states
 * the consequences — then the swap runs server-side: segments, the flat
 * transcript copy, talk times, and a fresh summary/analysis. A human flip is
 * final for automation; the verifier will not undo it.
 */
function SwapSpeakersButton({
  callId,
  flippedAt,
}: {
  callId: Id<"calls">;
  flippedAt?: number;
}) {
  const { user } = useUser();
  const swap = useMutation(api.speakerSwap.swapSpeakerLabelsAsManager);
  const [arming, setArming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  if (done || flippedAt) {
    return (
      <span className="ml-auto self-center text-[11px] text-muted-foreground">
        speaker labels manually corrected
      </span>
    );
  }

  if (!arming) {
    return (
      <button
        onClick={() => setArming(true)}
        className="ml-auto self-center inline-flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground"
        title="If the transcript has the closer and prospect mixed up, flip every label on this call"
      >
        <ArrowLeftRight className="h-3 w-3" />
        Speakers mixed up?
      </button>
    );
  }

  return (
    <span className="ml-auto self-center inline-flex items-center gap-2 text-[11px]">
      <span className="text-muted-foreground">
        Flips every Closer/Prospect label and regenerates the summary.
      </span>
      <button
        disabled={busy}
        onClick={async () => {
          if (!user) return;
          setBusy(true);
          try {
            await swap({ clerkId: user.id, callId });
            setDone(true);
          } finally {
            setBusy(false);
            setArming(false);
          }
        }}
        className="rounded-md bg-foreground px-2 py-0.5 font-medium text-background disabled:opacity-50"
      >
        {busy ? "Flipping…" : "Flip them"}
      </button>
      <button onClick={() => setArming(false)} className="text-muted-foreground underline">
        cancel
      </button>
    </span>
  );
}
