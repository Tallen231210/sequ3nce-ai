"use client";

import { useParams } from "next/navigation";
import { useEffect, useState, useRef, useCallback } from "react";
import { Logo } from "@/components/ui/logo";
import { PublicVideoPlayer } from "@/components/share/PublicVideoPlayer";
import { PublicTranscript } from "@/components/share/PublicTranscript";
import { PublicComments } from "@/components/share/PublicComments";
import { MessageCircle, Lock, Shield } from "lucide-react";
import { ChapterStrip } from "@/components/call-reviews/ChapterStrip";

// Convex HTTP site URL for fetching shared link data
const CONVEX_SITE_URL =
  process.env.NEXT_PUBLIC_CONVEX_SITE_URL ||
  (process.env.NEXT_PUBLIC_CONVEX_URL || "").replace(".cloud", ".site");

interface SharedLinkData {
  shareType: string;
  startSeconds?: number;
  endSeconds?: number;
  includeComments: boolean;
  accessType?: string; // "full_access" | "compliance"
  call: {
    prospectName: string;
    closerName: string;
    duration?: number;
    startedAt?: number;
    recordingUrl?: string;
    recordingType: string;
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

export default function SharePage() {
  const params = useParams();
  const token = params.token as string;

  const [data, setData] = useState<SharedLinkData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Password gate state
  const [needsPassword, setNeedsPassword] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [passwordError, setPasswordError] = useState(false);
  const [isUnlocking, setIsUnlocking] = useState(false);

  // Video state
  const videoRef = useRef<HTMLVideoElement>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [videoError, setVideoError] = useState(false);

  const fetchSharedData = useCallback(async (password?: string) => {
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
        setError("This shared link has been revoked and is no longer available.");
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
  }, [token]);

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

  // Password gate
  if (needsPassword && !data) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center space-y-5 max-w-sm px-6">
          <div className="w-14 h-14 rounded-full bg-zinc-100 flex items-center justify-center mx-auto">
            <Lock className="w-6 h-6 text-zinc-400" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-zinc-900">
              Password Protected
            </h1>
            <p className="text-sm text-zinc-500 mt-1">
              This recording requires a password to view.
            </p>
          </div>
          <form onSubmit={handlePasswordSubmit} className="space-y-3">
            <input
              type="password"
              value={passwordInput}
              onChange={(e) => { setPasswordInput(e.target.value); setPasswordError(false); }}
              placeholder="Enter password"
              autoFocus
              className={`w-full px-3 py-2 text-sm border rounded-lg outline-none transition-colors ${
                passwordError
                  ? "border-red-300 focus:border-red-400"
                  : "border-zinc-200 focus:border-zinc-400"
              }`}
            />
            {passwordError && (
              <p className="text-xs text-red-500">Incorrect password. Please try again.</p>
            )}
            <button
              type="submit"
              disabled={isUnlocking || !passwordInput.trim()}
              className="w-full px-4 py-2 text-sm font-medium text-white bg-zinc-900 rounded-lg hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isUnlocking ? "Unlocking..." : "Unlock Recording"}
            </button>
          </form>
          <div className="pt-2">
            <Logo height={20} />
          </div>
        </div>
      </div>
    );
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="w-8 h-8 border-2 border-zinc-200 border-t-zinc-800 rounded-full animate-spin mx-auto" />
          <p className="text-sm text-zinc-400">Loading recording...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error || !data) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center space-y-4 max-w-md px-6">
          <div className="w-14 h-14 rounded-full bg-zinc-100 flex items-center justify-center mx-auto">
            <svg
              className="w-6 h-6 text-zinc-400"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
              />
            </svg>
          </div>
          <h1 className="text-lg font-semibold text-zinc-900">
            Link Unavailable
          </h1>
          <p className="text-sm text-zinc-500">
            {error || "This shared link could not be found."}
          </p>
          <div className="pt-4">
            <Logo height={20} />
          </div>
        </div>
      </div>
    );
  }

  const { call, transcript, comments, shareType, startSeconds, endSeconds, includeComments, accessType } = data;
  const isClip = shareType === "clip" && startSeconds != null && endSeconds != null;
  const isCompliance = accessType === "compliance";
  const hasComments = includeComments && comments.length > 0;

  return (
    <div className="h-screen flex flex-col bg-white">
      {/* Header */}
      <div className="shrink-0 flex items-center justify-between px-6 py-3 border-b border-zinc-200">
        <div className="flex items-center gap-4">
          <Logo height={26} href="https://sequ3nce.ai" />
          <div className="h-6 w-px bg-zinc-200" />
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-semibold text-zinc-900">
                {call.prospectName}
              </h1>
              {isClip && (
                <span className="text-[10px] font-medium bg-zinc-100 text-zinc-500 px-2 py-0.5 rounded-full">
                  Clip
                </span>
              )}
              {isCompliance && (
                <span className="text-[10px] font-medium bg-emerald-50 text-emerald-600 px-2 py-0.5 rounded-full flex items-center gap-1">
                  <Shield className="w-3 h-3" />
                  Compliance Safe
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 text-xs text-zinc-400">
              <span>{call.closerName}</span>
              {call.startedAt && (
                <>
                  <span>&middot;</span>
                  <span>{formatDate(call.startedAt)}</span>
                </>
              )}
              {call.duration && (
                <>
                  <span>&middot;</span>
                  <span>{formatDuration(call.duration)}</span>
                </>
              )}
            </div>
          </div>
        </div>
        <span className="text-[10px] font-medium text-zinc-300 uppercase tracking-widest">
          {isCompliance ? "Compliance Recording" : "Shared Recording"}
        </span>
      </div>

      {/* Main content — split layout matching internal call review page */}
      <div className="flex-1 flex min-h-0">
        {/* Left: Video + Transcript (~65%) */}
        <div className={`${hasComments ? "w-[65%]" : "w-full"} flex flex-col border-r border-zinc-200`}>
          {/* Video — fixed at top, never scrolls */}
          <div className="shrink-0 p-4">
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
              <div className="rounded-lg bg-zinc-100 flex items-center justify-center h-48">
                <p className="text-sm text-zinc-400">
                  {videoError ? "Failed to load recording" : "No recording available"}
                </p>
              </div>
            )}
          </div>

          {/* Chapter strip — between video and transcript */}
          {data.chapters && data.chapters.length > 0 && (
            <div className="shrink-0">
              <ChapterStrip
                chapters={data.chapters}
                currentTime={currentTime}
                onSeek={handleSeek}
              />
            </div>
          )}

          {/* Transcript — fills remaining space, scrolls independently */}
          <div className="flex-1 flex flex-col min-h-0 border-t border-zinc-200">
            <div className="shrink-0 px-4 py-2 border-b border-zinc-100">
              <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                Transcript
              </h3>
            </div>
            <PublicTranscript
              segments={transcript}
              currentTime={currentTime}
              onSeek={handleSeek}
              startSeconds={isClip ? startSeconds : undefined}
              endSeconds={isClip ? endSeconds : undefined}
            />
          </div>
        </div>

        {/* Right: Comments (~35%) */}
        {hasComments && (
          <div className="w-[35%] flex flex-col">
            <div className="shrink-0 px-4 py-2 border-b border-zinc-100 flex items-center justify-between">
              <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider flex items-center gap-2">
                <MessageCircle className="h-3.5 w-3.5" />
                Comments
                <span className="text-[10px] font-medium bg-zinc-100 text-zinc-400 px-1.5 py-0.5 rounded">
                  {comments.length}
                </span>
              </h3>
            </div>
            <PublicComments
              comments={comments}
              onSeek={handleSeek}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  if (mins >= 60) {
    const hours = Math.floor(mins / 60);
    const remainingMins = mins % 60;
    return `${hours}h ${remainingMins}m`;
  }
  return `${mins}m ${secs}s`;
}
