"use client";

import { useRef, useEffect } from "react";
import { formatTime } from "./utils";

interface Chapter {
  title: string;
  startTime: number;
  endTime: number;
  summary: string;
}

interface ChapterStripProps {
  chapters: Chapter[] | undefined;
  currentTime: number;
  onSeek: (time: number) => void;
  isAnalyzing?: boolean;
}

export function ChapterStrip({
  chapters,
  currentTime,
  onSeek,
  isAnalyzing,
}: ChapterStripProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLButtonElement>(null);

  // Find active chapter (last one whose startTime <= currentTime)
  const activeIndex = (() => {
    if (!chapters) return -1;
    let last = -1;
    for (let i = 0; i < chapters.length; i++) {
      if (currentTime >= chapters[i].startTime) last = i;
    }
    return last;
  })();

  // Auto-scroll to keep active chapter visible
  useEffect(() => {
    if (activeRef.current && containerRef.current) {
      const container = containerRef.current;
      const active = activeRef.current;
      const containerRect = container.getBoundingClientRect();
      const activeRect = active.getBoundingClientRect();

      if (activeRect.left < containerRect.left || activeRect.right > containerRect.right) {
        active.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
      }
    }
  }, [activeIndex]);

  if (!chapters || chapters.length === 0) {
    if (isAnalyzing) {
      return (
        <div className="flex items-center gap-2 px-4 py-2 bg-zinc-50 border-t border-border">
          <div className="h-3 w-3 border-2 border-zinc-400 border-t-transparent rounded-full animate-spin" />
          <span className="text-xs text-muted-foreground">Generating analysis...</span>
        </div>
      );
    }
    return null;
  }

  return (
    <div
      ref={containerRef}
      className="flex items-center gap-1.5 px-4 py-2 bg-zinc-50 border-t border-border overflow-x-auto"
      style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
    >
      {chapters.map((chapter, i) => {
        const isActive = i === activeIndex;
        return (
          <button
            key={i}
            ref={isActive ? activeRef : undefined}
            onClick={() => onSeek(chapter.startTime)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
              isActive
                ? "bg-foreground text-background"
                : "bg-white text-muted-foreground border border-border hover:bg-zinc-100"
            }`}
          >
            <span className="font-mono text-[10px] opacity-70">
              {formatTime(chapter.startTime)}
            </span>
            <span>{chapter.title}</span>
          </button>
        );
      })}
    </div>
  );
}
