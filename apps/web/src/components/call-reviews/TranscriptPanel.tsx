"use client";

import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { useRef, useEffect, useState, useCallback } from "react";
import { formatTime } from "./utils";

interface TranscriptPanelProps {
  callId: Id<"calls">;
  currentTime: number;
  onSeek: (time: number) => void;
}

export function TranscriptPanel({ callId, currentTime, onSeek }: TranscriptPanelProps) {
  const segments = useQuery(api.calls.getTranscriptSegments, { callId });
  const containerRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLDivElement>(null);
  const [userScrolling, setUserScrolling] = useState(false);
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastActiveIndex = useRef(-1);

  // Detect manual scroll — pause auto-scroll for 3 seconds after user scrolls
  const handleScroll = useCallback(() => {
    setUserScrolling(true);
    if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
    scrollTimeoutRef.current = setTimeout(() => {
      setUserScrolling(false);
    }, 3000);
  }, []);

  // Find the current active segment
  const activeIndex = segments
    ? segments.findLastIndex((s) => s.timestamp <= currentTime)
    : -1;

  // Auto-scroll only when the active segment changes (not on every time tick)
  // and only if the user hasn't manually scrolled recently
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
        // Use scrollTop instead of scrollIntoView to prevent page-level scroll
        const offset = active.offsetTop - container.offsetTop - container.clientHeight / 2 + active.clientHeight / 2;
        container.scrollTo({ top: offset, behavior: "smooth" });
      }
    }
  }, [activeIndex, userScrolling]);

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

  return (
    <div
      ref={containerRef}
      className="overflow-y-auto flex-1 p-3 space-y-2"
      onScroll={handleScroll}
    >
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
