"use client";

import { useParams } from "next/navigation";
import { useEffect, useState, useRef, useCallback } from "react";
import { MessageCircle } from "lucide-react";
import { PublicVideoPlayer } from "@/components/share/PublicVideoPlayer";
import { PublicTranscript } from "@/components/share/PublicTranscript";
import { PublicComments } from "@/components/share/PublicComments";
import { ChapterStrip } from "@/components/call-reviews/ChapterStrip";
import { ShareHeader } from "@/components/share/ShareHeader";
import { OverviewTab } from "@/components/share/OverviewTab";
import { AnalysisTab } from "@/components/share/AnalysisTab";
import {
  PasswordGate,
  LoadingState,
  ErrorState,
} from "@/components/share/SharePageStates";

const CONVEX_SITE_URL =
  process.env.NEXT_PUBLIC_CONVEX_SITE_URL ||
  (process.env.NEXT_PUBLIC_CONVEX_URL || "").replace(".cloud", ".site");

interface SharedLinkData {
  shareType: string;
  startSeconds?: number;
  endSeconds?: number;
  includeComments: boolean;
  accessType?: string;
  call: {
    prospectName: string;
    closerName: string;
    duration?: number;
    startedAt?: number;
    recordingUrl?: string;
    recordingType: string;
    summary?: string;
    callAnalysis?: {
      chapters: Array<{
        title: string;
        startTime: number;
        endTime: number;
        summary: string;
      }>;
      analysis: {
        opening: { score: string; summary: string };
        discovery: { score: string; summary: string };
        presentation: { score: string; summary: string };
        objectionHandling: { score: string; summary: string };
        closing: { score: string; summary: string };
      };
      callSequence: Array<{ phase: string; description: string }>;
      analyzedAt: number;
    };
    closerTalkTime?: number;
    prospectTalkTime?: number;
    outcome?: string;
  };
  transcript: Array<{
    speaker: string;
    text: string;
    timestamp: number;
  }>;
  chapters?: Array<{
    title: string;
    startTime: number;
    endTime: number;
    summary: string;
  }>;
  comments: Array<{
    id: string;
    authorName: string;
    authorType: string;
    content: string;
    timestampSeconds?: number;
    parentCommentId?: string;
    createdAt: number;
  }>;
}

type ActiveTab = "overview" | "analysis" | "transcript";

export default function SharePage() {
  const params = useParams();
  const token = params.token as string;

  const [data, setData] = useState<SharedLinkData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const [needsPassword, setNeedsPassword] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [passwordError, setPasswordError] = useState(false);
  const [isUnlocking, setIsUnlocking] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [videoError, setVideoError] = useState(false);

  const [activeTab, setActiveTab] = useState<ActiveTab>("overview");

  const fetchSharedData = useCallback(
    async (password?: string) => {
      try {
        const response = await fetch(`${CONVEX_SITE_URL}/getSharedLinkData`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token, password }),
        });

        if (response.status === 401) {
          const body = await response.json();
          setNeedsPassword(true);
          if (body.passwordIncorrect) setPasswordError(true);
          return;
        }
        if (response.status === 404) {
          setError("This shared link was not found.");
          return;
        }
        if (response.status === 410) {
          setError(
            "This shared link has been revoked and is no longer available."
          );
          return;
        }
        if (!response.ok) {
          setError("Something went wrong loading this recording.");
          return;
        }

        const result = await response.json();
        setNeedsPassword(false);
        setData(result);
      } catch {
        setError("Failed to load the shared recording. Please try again.");
      } finally {
        setIsLoading(false);
        setIsUnlocking(false);
      }
    },
    [token]
  );

  useEffect(() => {
    if (!token) return;
    fetchSharedData();
  }, [token, fetchSharedData]);

  function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!passwordInput.trim()) return;
    setPasswordError(false);
    setIsUnlocking(true);
    fetchSharedData(passwordInput);
  }

  // Cleanup video element on unmount to release the underlying media stream.
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
  }, [isPlaying]);

  const handleSeek = useCallback((time: number) => {
    if (!videoRef.current) return;
    videoRef.current.currentTime = time;
    setCurrentTime(time);
  }, []);

  /**
   * Open at a moment, from `?t=` on the URL.
   *
   * Compliance alerts quote a line and give the time it was said. Whoever reads
   * that alert is often not a Sequ3nce user — the whole reason those links are
   * public — so landing them at 0:00 of a ninety-minute call and expecting them
   * to scrub to 33:19 loses the "check it in ten seconds" promise the finding
   * is built on.
   *
   * Applied once, after the video knows its own length, and only within it —
   * a stale or hand-edited value should start the call at the beginning rather
   * than somewhere the player can't go.
   */
  const seekedFromUrl = useRef(false);
  useEffect(() => {
    if (seekedFromUrl.current || duration <= 0 || !videoRef.current) return;
    const raw = new URLSearchParams(window.location.search).get("t");
    if (!raw) return;
    const seconds = Number(raw);
    if (!Number.isFinite(seconds) || seconds <= 0 || seconds > duration) return;
    seekedFromUrl.current = true;
    handleSeek(seconds);
  }, [duration, handleSeek]);

  // Keyboard shortcuts (desktop). No-op on mobile (no physical keys).
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

  if (needsPassword && !data) {
    return (
      <PasswordGate
        password={passwordInput}
        setPassword={(v) => {
          setPasswordInput(v);
          setPasswordError(false);
        }}
        onSubmit={handlePasswordSubmit}
        isUnlocking={isUnlocking}
        error={passwordError}
      />
    );
  }

  if (isLoading) {
    return <LoadingState />;
  }

  if (error || !data) {
    return (
      <ErrorState
        message={error || "This shared link could not be found."}
      />
    );
  }

  const {
    call,
    transcript,
    comments,
    shareType,
    startSeconds,
    endSeconds,
    includeComments,
    accessType,
  } = data;
  const isClip =
    shareType === "clip" && startSeconds != null && endSeconds != null;
  const isCompliance = accessType === "compliance";
  const hasComments = includeComments && comments.length > 0;

  return (
    // Mobile: min-h-screen so the page can scroll past the video.
    // Desktop (lg+): h-screen restores the locked side-by-side layout.
    <div className="min-h-screen lg:h-screen flex flex-col bg-white">
      <ShareHeader
        prospectName={call.prospectName}
        closerName={call.closerName}
        startedAt={call.startedAt}
        duration={call.duration}
        isClip={isClip}
        isCompliance={isCompliance}
      />

      {/* Body: stacked on mobile, side-by-side on desktop. */}
      <div className="flex-1 flex flex-col lg:flex-row lg:min-h-0">
        {/* Left: video + chapters + (optional) comments. */}
        <div className="w-full lg:w-[55%] flex flex-col border-b lg:border-b-0 lg:border-r border-zinc-200">
          <div className="shrink-0 p-3 sm:p-4">
            {call.recordingUrl && !videoError ? (
              <PublicVideoPlayer
                recordingUrl={call.recordingUrl}
                comments={hasComments ? comments : []}
                currentTime={currentTime}
                duration={duration}
                isPlaying={isPlaying}
                startSeconds={isClip ? startSeconds : undefined}
                endSeconds={isClip ? endSeconds : undefined}
                onTimeUpdate={setCurrentTime}
                onDurationChange={setDuration}
                onPlayPause={handlePlayPause}
                onPlayStateChange={setIsPlaying}
                onSeek={handleSeek}
                onVideoError={() => setVideoError(true)}
                videoRef={videoRef}
              />
            ) : (
              <div className="rounded-lg bg-zinc-100 flex items-center justify-center aspect-video">
                <p className="text-sm text-zinc-400">
                  {videoError
                    ? "Failed to load recording"
                    : "No recording available"}
                </p>
              </div>
            )}
          </div>

          {data.chapters && data.chapters.length > 0 && (
            <div className="shrink-0">
              <ChapterStrip
                chapters={data.chapters}
                currentTime={currentTime}
                onSeek={handleSeek}
              />
            </div>
          )}

          {hasComments && (
            <div className="flex-1 flex flex-col lg:min-h-0 border-t border-zinc-200">
              <div className="shrink-0 px-4 py-2 border-b border-zinc-100 flex items-center gap-2">
                <MessageCircle className="h-3.5 w-3.5 text-zinc-400" />
                <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                  Comments
                </h3>
                <span className="text-[10px] font-medium bg-zinc-100 text-zinc-400 px-1.5 py-0.5 rounded">
                  {comments.length}
                </span>
              </div>
              <PublicComments comments={comments} onSeek={handleSeek} />
            </div>
          )}
        </div>

        {/* Right: tabs (Overview / Analysis / Transcript). */}
        <div className="w-full lg:w-[45%] flex flex-col lg:min-h-0">
          <div className="shrink-0 flex border-b border-zinc-200">
            {(["overview", "analysis", "transcript"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-3 sm:py-2.5 text-xs font-medium capitalize transition-colors relative ${
                  activeTab === tab
                    ? "text-zinc-900"
                    : "text-zinc-400 hover:text-zinc-600"
                }`}
              >
                {tab}
                {activeTab === tab && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-zinc-900" />
                )}
              </button>
            ))}
          </div>

          {/* Mobile: let the page scroll the tab content as part of the page.
              Desktop: keep the inner-scroll behavior so the tab bar stays put. */}
          <div className="flex-1 lg:overflow-y-auto">
            {activeTab === "overview" && (
              <OverviewTab
                summary={call.summary}
                closerTalkTime={call.closerTalkTime}
                prospectTalkTime={call.prospectTalkTime}
                outcome={call.outcome}
              />
            )}
            {activeTab === "analysis" && (
              <AnalysisTab callAnalysis={call.callAnalysis} />
            )}
            {activeTab === "transcript" && (
              <PublicTranscript
                segments={transcript}
                currentTime={currentTime}
                onSeek={handleSeek}
                startSeconds={isClip ? startSeconds : undefined}
                endSeconds={isClip ? endSeconds : undefined}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
