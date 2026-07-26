"use client";

import React, { useRef, useEffect, useState, useCallback } from 'react';
import type { TranscriptSegment } from '@/lib/closer/client';

interface CallDetailTranscriptTabProps {
  transcript: TranscriptSegment[];
  isLoading: boolean;
  currentTime: number;
  onSeek: (time: number) => void;
  fallbackText?: string;
}

export function CallDetailTranscriptTab({
  transcript,
  isLoading,
  currentTime,
  onSeek,
  fallbackText,
}: CallDetailTranscriptTabProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLDivElement>(null);
  const [userScrolling, setUserScrolling] = useState(false);
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastActiveIndex = useRef(-1);

  // Detect manual scroll — pause auto-scroll for 3 seconds
  const handleScroll = useCallback(() => {
    setUserScrolling(true);
    if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
    scrollTimeoutRef.current = setTimeout(() => {
      setUserScrolling(false);
    }, 3000);
  }, []);

  // Cleanup scroll timeout
  useEffect(() => {
    return () => {
      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
    };
  }, []);

  // Find active segment (last one whose timestamp <= currentTime)
  const activeIndex = (() => {
    if (transcript.length === 0) return -1;
    let last = -1;
    for (let i = 0; i < transcript.length; i++) {
      if (transcript[i].timestamp <= currentTime) last = i;
    }
    return last;
  })();

  // Auto-scroll when active segment changes (not on every time tick)
  useEffect(() => {
    if (userScrolling) return;
    if (activeIndex === lastActiveIndex.current) return;
    lastActiveIndex.current = activeIndex;

    if (activeRef.current && containerRef.current) {
      const container = containerRef.current;
      const active = activeRef.current;
      const containerRect = container.getBoundingClientRect();
      const activeRect = active.getBoundingClientRect();

      // Only scroll if active segment is out of view
      if (activeRect.top < containerRect.top || activeRect.bottom > containerRect.bottom) {
        const offset = active.offsetTop - container.offsetTop - container.clientHeight / 2 + active.clientHeight / 2;
        container.scrollTo({ top: offset, behavior: 'smooth' });
      }
    }
  }, [activeIndex, userScrolling]);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 p-4">
        <span className="w-3 h-3 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
        <span className="text-[13px] text-gray-500">Loading transcript...</span>
      </div>
    );
  }

  if (transcript.length === 0) {
    return (
      <div className="p-4 text-[13px] text-gray-400">
        {fallbackText || 'No transcript available'}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="overflow-y-auto flex-1 p-3 space-y-1"
      onScroll={handleScroll}
    >
      {transcript.map((seg, index) => {
        const isCloser = seg.speaker.toLowerCase().includes('closer') || seg.speaker.toLowerCase() === 'agent';
        const isActive = index === activeIndex;
        return (
          <div
            key={seg._id}
            ref={isActive ? activeRef : undefined}
            onClick={() => onSeek(seg.timestamp)}
            className={`flex gap-2 py-1.5 px-2 rounded cursor-pointer transition-colors ${
              isActive
                ? 'bg-blue-50 border-l-2 border-blue-500'
                : 'hover:bg-gray-50 border-l-2 border-transparent'
            }`}
          >
            <span className="text-[10px] font-mono text-gray-400 w-[40px] shrink-0 pt-0.5">
              {formatTimestamp(seg.timestamp)}
            </span>
            <span className={`w-[55px] text-[11px] font-medium shrink-0 pt-0.5 ${
              isCloser ? 'text-gray-500' : 'text-blue-600'
            }`}>
              {isCloser ? 'You' : 'Prospect'}
            </span>
            <p className={`text-[12px] leading-relaxed flex-1 ${
              isActive ? 'text-black font-medium' : 'text-gray-700'
            }`}>
              {seg.text}
            </p>
          </div>
        );
      })}
    </div>
  );
}

function formatTimestamp(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}
