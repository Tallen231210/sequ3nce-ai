"use client";

import { useRef } from "react";
import { mmss, speakerHue } from "./clipUtils";

/* eslint-disable @typescript-eslint/no-explicit-any */

type Segment = { speaker: string; text: string; startSeconds: number };

/**
 * The meeting as a strip, with a draggable selection over it.
 *
 * Not an audio waveform — drawing one would mean downloading and decoding the
 * whole recording, and the amplitude of a voice tells a manager nothing they
 * want. This plots who was talking and when, which is the thing you actually
 * scan for: the long unbroken block where the rep never got a word in, or the
 * back-and-forth where the real conversation happened.
 */
export function ClipTimeline({
  segments,
  duration,
  start,
  end,
  playhead,
  onScrub,
  onSetStart,
  onSetEnd,
}: {
  segments: Segment[];
  duration: number;
  start: number | null;
  end: number | null;
  playhead: number;
  onScrub: (t: number) => void;
  onSetStart: (t: number) => void;
  onSetEnd: (t: number) => void;
}) {
  const barRef = useRef<HTMLDivElement>(null);
  const dragging = useRef<"start" | "end" | null>(null);

  const pctOf = (t: number) => Math.min(100, Math.max(0, (t / duration) * 100));

  const timeAt = (clientX: number) => {
    const el = barRef.current;
    if (!el) return 0;
    const r = el.getBoundingClientRect();
    return Math.min(duration, Math.max(0, ((clientX - r.left) / r.width) * duration));
  };

  // Dragging a handle past its partner would invert the range, so each is
  // clamped against the other rather than allowed to cross.
  const onMove = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    const t = timeAt(e.clientX);
    if (dragging.current === "start") onSetStart(Math.min(t, (end ?? duration) - 1));
    else onSetEnd(Math.max(t, (start ?? 0) + 1));
  };

  return (
    <div className="select-none">
      <div
        ref={barRef}
        className="relative h-12 w-full cursor-pointer rounded-lg bg-muted/60"
        onPointerMove={onMove}
        onPointerUp={() => (dragging.current = null)}
        onPointerLeave={() => (dragging.current = null)}
        onClick={(e) => {
          if (dragging.current) return;
          onScrub(timeAt(e.clientX));
        }}
      >
        {/* Who was speaking, when. */}
        {segments.map((s, i) => {
          const next = segments[i + 1];
          const segEnd = next ? next.startSeconds : duration;
          const w = pctOf(segEnd) - pctOf(s.startSeconds);
          if (w <= 0) return null;
          return (
            <div
              key={i}
              title={`${s.speaker} · ${mmss(s.startSeconds)}`}
              className="absolute top-2 h-8 rounded-[2px] opacity-70"
              style={{
                left: `${pctOf(s.startSeconds)}%`,
                width: `${w}%`,
                backgroundColor: `hsl(${speakerHue(s.speaker)} 45% 55%)`,
              }}
            />
          );
        })}

        {/* Everything outside the selection dimmed, so the clip reads as the
            thing in focus rather than one shaded box among many. */}
        {start !== null && end !== null && (
          <>
            <div
              className="absolute inset-y-0 left-0 rounded-l-lg bg-background/70"
              style={{ width: `${pctOf(start)}%` }}
            />
            <div
              className="absolute inset-y-0 right-0 rounded-r-lg bg-background/70"
              style={{ left: `${pctOf(end)}%` }}
            />
            <Handle pos={pctOf(start)} onDown={() => (dragging.current = "start")} />
            <Handle pos={pctOf(end)} onDown={() => (dragging.current = "end")} />
          </>
        )}

        <div
          className="pointer-events-none absolute inset-y-0 w-px bg-foreground"
          style={{ left: `${pctOf(playhead)}%` }}
        />
      </div>

      <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
        <span>0:00</span>
        <span>{mmss(duration)}</span>
      </div>
    </div>
  );
}

function Handle({ pos, onDown }: { pos: number; onDown: () => void }) {
  return (
    <div
      onPointerDown={(e) => {
        e.stopPropagation();
        onDown();
      }}
      className="absolute inset-y-0 z-10 -ml-1.5 w-3 cursor-ew-resize"
      style={{ left: `${pos}%` }}
    >
      <div className="mx-auto h-full w-1 rounded-full bg-foreground" />
    </div>
  );
}
