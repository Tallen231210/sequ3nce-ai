"use client";

import { useRef, useEffect, useState } from "react";

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
  const activeRef = useRef<HTMLDivElement>(null);
  const [userScrolling, setUserScrolling] = useState(false);
  const lastActiveIndex = useRef(-1);

  const isClip = startSeconds != null && endSeconds != null;

  // Find the current active segment.
  const activeIndex = segments.findLastIndex((s) => s.timestamp <= currentTime);

  // Detect user scroll (any scroll, any container — capture-phase). Pauses
  // auto-scroll for 3 seconds so the user isn't fought when they manually
  // scroll back to read earlier text.
  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout> | null = null;
    const onScroll = () => {
      setUserScrolling(true);
      if (timeout) clearTimeout(timeout);
      timeout = setTimeout(() => setUserScrolling(false), 3000);
    };
    window.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      if (timeout) clearTimeout(timeout);
    };
  }, []);

  // Auto-scroll the active segment into view as the video plays. Desktop only —
  // on mobile, the page itself is the scroll ancestor and scrolling would yank
  // the video player out of view. The active-segment highlight still renders
  // on mobile; users can manually scroll to follow along.
  useEffect(() => {
    if (activeIndex === lastActiveIndex.current) return;
    lastActiveIndex.current = activeIndex;
    if (userScrolling) return;

    const active = activeRef.current;
    if (!active) return;

    if (typeof window === "undefined") return;
    if (!window.matchMedia("(min-width: 1024px)").matches) return;

    // scrollIntoView walks up to the nearest scroll ancestor and scrolls just
    // enough to bring the element into view. If already visible, no scroll.
    active.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [activeIndex, userScrolling]);

  if (segments.length === 0) {
    return (
      <div className="p-6 text-sm text-zinc-400 text-center">
        No transcript available for this recording.
      </div>
    );
  }

  return (
    <div className="p-3 space-y-1">
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
