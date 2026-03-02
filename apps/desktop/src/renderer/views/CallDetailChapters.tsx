import React, { useRef, useEffect } from 'react';
import type { CallChapter } from '../convex';

interface CallDetailChaptersProps {
  chapters: CallChapter[] | undefined;
  currentTime: number;
  onSeek: (time: number) => void;
  isAnalyzing?: boolean;
}

export function CallDetailChapters({
  chapters,
  currentTime,
  onSeek,
  isAnalyzing,
}: CallDetailChaptersProps) {
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
        active.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      }
    }
  }, [activeIndex]);

  // No chapters yet — show placeholder
  if (!chapters || chapters.length === 0) {
    if (isAnalyzing) {
      return (
        <div className="flex items-center gap-2 px-4 py-2 bg-gray-50 border-t border-gray-200">
          <span className="w-3 h-3 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
          <span className="text-[12px] text-gray-500">Generating analysis...</span>
        </div>
      );
    }
    return null;
  }

  return (
    <div
      ref={containerRef}
      className="flex items-center gap-1.5 px-4 py-2 bg-gray-50 border-t border-gray-200 overflow-x-auto scrollbar-hide"
      style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
    >
      {chapters.map((chapter, i) => {
        const isActive = i === activeIndex;
        return (
          <button
            key={i}
            ref={isActive ? activeRef : undefined}
            onClick={() => onSeek(chapter.startTime)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium whitespace-nowrap shrink-0 transition-colors ${
              isActive
                ? 'bg-black text-white'
                : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-100'
            }`}
          >
            <span className="font-mono text-[10px] opacity-70">
              {formatChapterTime(chapter.startTime)}
            </span>
            <span>{chapter.title}</span>
          </button>
        );
      })}
    </div>
  );
}

function formatChapterTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}
