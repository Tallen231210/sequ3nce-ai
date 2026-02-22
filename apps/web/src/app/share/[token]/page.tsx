"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Logo } from "@/components/ui/logo";
import { PublicVideoPlayer } from "@/components/share/PublicVideoPlayer";
import { PublicTranscript } from "@/components/share/PublicTranscript";
import { PublicComments } from "@/components/share/PublicComments";

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
    <div className="min-h-screen bg-zinc-50">
      {/* Header */}
      <header className="bg-white border-b border-zinc-200">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <Logo height={20} href="https://sequ3nce.ai" />
          <span className="text-xs font-medium text-zinc-400 uppercase tracking-wider">
            Shared Call Recording
          </span>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-5xl mx-auto px-6 py-8">
        {/* Call metadata */}
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-zinc-900">
            {call.prospectName}
          </h1>
          <div className="flex items-center gap-3 mt-1.5 text-sm text-zinc-500">
            <span>{call.closerName}</span>
            <span className="text-zinc-300">&middot;</span>
            {call.startedAt && (
              <>
                <span>{formatDate(call.startedAt)}</span>
                <span className="text-zinc-300">&middot;</span>
              </>
            )}
            {call.duration && <span>{formatDuration(call.duration)}</span>}
            {isClip && (
              <>
                <span className="text-zinc-300">&middot;</span>
                <span className="inline-flex items-center gap-1 text-xs font-medium bg-zinc-200 text-zinc-600 px-2 py-0.5 rounded-full">
                  Clip
                </span>
              </>
            )}
          </div>
        </div>

        {/* Video + Comments layout */}
        <div className={`grid gap-6 ${hasComments ? "lg:grid-cols-[1fr_340px]" : "grid-cols-1"}`}>
          {/* Left column: Video */}
          <div>
            {call.recordingUrl ? (
              <PublicVideoPlayer
                recordingUrl={call.recordingUrl}
                startSeconds={isClip ? startSeconds : undefined}
                endSeconds={isClip ? endSeconds : undefined}
              />
            ) : (
              <div className="rounded-lg bg-zinc-200 aspect-video flex items-center justify-center">
                <p className="text-sm text-zinc-500">Recording unavailable</p>
              </div>
            )}
          </div>

          {/* Right column: Comments (if enabled) */}
          {hasComments && (
            <div className="bg-white rounded-lg border border-zinc-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-zinc-100">
                <h2 className="text-sm font-semibold text-zinc-700">
                  Comments ({comments.length})
                </h2>
              </div>
              <div className="max-h-[500px] overflow-y-auto">
                <PublicComments comments={comments} />
              </div>
            </div>
          )}
        </div>

        {/* Transcript */}
        <div className="mt-8 bg-white rounded-lg border border-zinc-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-zinc-100">
            <h2 className="text-sm font-semibold text-zinc-700">Transcript</h2>
          </div>
          <PublicTranscript
            segments={transcript}
            startSeconds={isClip ? startSeconds : undefined}
            endSeconds={isClip ? endSeconds : undefined}
          />
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-zinc-200 bg-white mt-12">
        <div className="max-w-5xl mx-auto px-6 py-6 flex items-center justify-between">
          <Logo height={16} href="https://sequ3nce.ai" />
          <p className="text-xs text-zinc-400">
            Powered by Sequ3nce &mdash; Sales Call Intelligence
          </p>
        </div>
      </footer>
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
