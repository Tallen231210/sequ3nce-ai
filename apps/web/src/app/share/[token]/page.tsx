"use client";

import { useParams } from "next/navigation";
import { useEffect, useState, useRef, useCallback } from "react";
import { Logo } from "@/components/ui/logo";
import { PublicVideoPlayer } from "@/components/share/PublicVideoPlayer";
import { PublicTranscript } from "@/components/share/PublicTranscript";
import { PublicComments } from "@/components/share/PublicComments";
import { MessageCircle } from "lucide-react";

// Convex HTTP site URL for fetching shared link data
const CONVEX_SITE_URL =
  process.env.NEXT_PUBLIC_CONVEX_SITE_URL ||
  (process.env.NEXT_PUBLIC_CONVEX_URL || "").replace(".cloud", ".site");

interface SharedLinkData {
  shareType: string;
  startSeconds?: number;
  endSeconds?: number;
  includeComments: boolean;
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
  comments: Array<{
    authorName: string;
    authorType: string;
    content: string;
    timestampSeconds?: number;
    createdAt: number;
  }>;
}

export default function SharePage() {
  const params = useParams();
  const token = params.token as string;

  const [data, setData] = useState<SharedLinkData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Video state
  const videoRef = useRef<HTMLVideoElement>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [videoError, setVideoError] = useState(false);

  useEffect(() => {
    if (!token) return;

    async function fetchData() {
      try {
        const response = await fetch(`${CONVEX_SITE_URL}/getSharedLinkData`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });

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
        setData(result);
      } catch {
        setError("Failed to load the shared recording. Please try again.");
      } finally {
        setIsLoading(false);
      }
    }

    fetchData();
  }, [token]);

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

  const { call, transcript, comments, shareType, startSeconds, endSeconds, includeComments } = data;
  const isClip = shareType === "clip" && startSeconds != null && endSeconds != null;
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
          Shared Recording
        </span>
      </div>

      {/* Main content — three-column layout: Video | Transcript | Comments */}
      <div className="flex-1 flex min-h-0">
        {/* Left: Video */}
        <div className="shrink-0 border-r border-zinc-100 flex flex-col">
          <div className="p-3">
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
              <div className="rounded-lg bg-zinc-100 w-[400px] aspect-video flex items-center justify-center">
                <p className="text-sm text-zinc-400">
                  {videoError ? "Failed to load recording" : "No recording available"}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Middle: Transcript — takes remaining space */}
        <div className={`flex-1 flex flex-col min-h-0 min-w-0 ${hasComments ? "border-r border-zinc-100" : ""}`}>
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

        {/* Right: Comments (if enabled) */}
        {hasComments && (
          <div className="w-[280px] shrink-0 flex flex-col">
            <div className="shrink-0 px-4 py-2 border-b border-zinc-100">
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
