"use client";

import { useRef, useEffect } from "react";

interface TranscriptSegment {
  speaker: string;
  text: string;
  timestamp: number;
}

interface PublicTranscriptProps {
  segments: TranscriptSegment[];
  startSeconds?: number;
  endSeconds?: number;
}

export function PublicTranscript({
  segments,
  startSeconds,
  endSeconds,
}: PublicTranscriptProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const clipStartRef = useRef<HTMLDivElement>(null);

  // Scroll to clip start on mount
  useEffect(() => {
    if (startSeconds != null && clipStartRef.current && containerRef.current) {
      const container = containerRef.current;
      const target = clipStartRef.current;
      const offset = target.offsetTop - container.offsetTop - 16;
      container.scrollTo({ top: offset, behavior: "smooth" });
    }
  }, [startSeconds]);

  if (segments.length === 0) {
    return (
      <div className="p-6 text-sm text-zinc-400 text-center">
        No transcript available for this recording.
      </div>
    );
  }

  const isClip = startSeconds != null && endSeconds != null;

  return (
    <div ref={containerRef} className="overflow-y-auto max-h-[500px] p-4 space-y-2">
      {segments.map((segment, index) => {
        const isSpeakerCloser = segment.speaker === "closer";
        const inClipRange =
          isClip &&
          segment.timestamp >= startSeconds! &&
          segment.timestamp <= endSeconds!;
        const isClipStart =
          isClip &&
          segment.timestamp >= startSeconds! &&
          (index === 0 || segments[index - 1].timestamp < startSeconds!);

        return (
          <div
            key={index}
            ref={isClipStart ? clipStartRef : undefined}
            className={`
              p-2.5 rounded-md text-sm transition-colors
              ${inClipRange ? "bg-zinc-100 ring-1 ring-zinc-200" : ""}
              ${isClip && !inClipRange ? "opacity-40" : ""}
            `}
          >
            <div className="flex items-center gap-2 mb-0.5">
              <span
                className={`text-[10px] font-medium uppercase tracking-wider ${
                  isSpeakerCloser ? "text-blue-600" : "text-emerald-600"
                }`}
              >
                {isSpeakerCloser ? "Closer" : "Prospect"}
              </span>
              <span className="text-[10px] text-zinc-400">
                {formatTime(segment.timestamp)}
              </span>
            </div>
            <p className="text-zinc-700 leading-relaxed">{segment.text}</p>
          </div>
        );
      })}
    </div>
  );
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}
