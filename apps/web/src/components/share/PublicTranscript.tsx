"use client";

import { useRef, useEffect, useState, useCallback } from "react";

interface TranscriptSegment {
  speaker: string;
  text: string;
  timestamp: number;
}

interface PublicTranscriptProps {
  segments: TranscriptSegment[];
  currentTime: number;
  onSeek: (time: number) => void;
  startSeconds?: number;
  endSeconds?: number;
}

export function PublicTranscript({
  segments,
  currentTime,
  onSeek,
  startSeconds,
  endSeconds,
}: PublicTranscriptProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLDivElement>(null);
  const [userScrolling, setUserScrolling] = useState(false);
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastActiveIndex = useRef(-1);

  const isClip = startSeconds != null && endSeconds != null;

  // Detect manual scroll — pause auto-scroll for 3 seconds
  const handleScroll = useCallback(() => {
    setUserScrolling(true);
    if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
    scrollTimeoutRef.current = setTimeout(() => {
      setUserScrolling(false);
    }, 3000);
  }, []);

  // Find the current active segment
  const activeIndex = segments.findLastIndex((s) => s.timestamp <= currentTime);

  // Auto-scroll when active segment changes
  useEffect(() => {
    if (userScrolling) return;
    if (activeIndex === lastActiveIndex.current) return;
    lastActiveIndex.current = activeIndex;

    if (activeRef.current && containerRef.current) {
      const container = containerRef.current;
      const active = activeRef.current;
      const containerRect = container.getBoundingClientRect();
      const activeRect = active.getBoundingClientRect();

      // Only scroll if the active segment is out of view
      if (
        activeRect.top < containerRect.top ||
        activeRect.bottom > containerRect.bottom
      ) {
        const offset =
          active.offsetTop - container.offsetTop - container.clientHeight / 2 + active.clientHeight / 2;
        container.scrollTo({ top: offset, behavior: "smooth" });
      }
    }
  }, [activeIndex, userScrolling]);

  if (segments.length === 0) {
    return (
      <div className="p-6 text-sm text-zinc-400 text-center">
        No transcript available for this recording.
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="overflow-y-auto flex-1 p-3 space-y-1"
      onScroll={handleScroll}
    >
      {segments.map((segment, index) => {
        const isActive = index === activeIndex;
        const isSpeakerCloser = segment.speaker === "closer";
        const inClipRange =
          isClip &&
          segment.timestamp >= startSeconds! &&
          segment.timestamp <= endSeconds!;

        return (
          <div
            key={index}
            ref={isActive ? activeRef : undefined}
            className={`
              p-2.5 rounded-md cursor-pointer transition-colors text-sm
              ${isActive ? "bg-zinc-100 ring-1 ring-zinc-200" : "hover:bg-zinc-50"}
              ${isClip && !inClipRange ? "opacity-30" : ""}
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
