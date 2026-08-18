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
  onClear,
}: {
  segments: Segment[];
  duration: number;
  start: number | null;
  end: number | null;
  playhead: number;
  onScrub: (t: number) => void;
  onSetStart: (t: number) => void;
  onSetEnd: (t: number) => void;
  onClear: () => void;
}) {
  const barRef = useRef<HTMLDivElement>(null);
  const dragging = useRef<"start" | "end" | "new" | null>(null);
  // Distinguishes a click (scrub to here) from a drag (select a range). Without
  // it, every attempt to drag a new selection would also jump the playhead.
  const dragMoved = useRef(false);

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
    dragMoved.current = true;
    const t = timeAt(e.clientX);
    if (dragging.current === "start") onSetStart(Math.min(t, (end ?? duration) - 1));
    else if (dragging.current === "end") onSetEnd(Math.max(t, (start ?? 0) + 1));
    // Dragging out a brand-new range. Sweeping right to left is just as
    // natural as left to right, so the two ends are ordered rather than
    // refused.
    else if (dragging.current === "new") {
      const anchor = start ?? t;
      onSetStart(Math.min(anchor, t));
      onSetEnd(Math.max(anchor, t));
    }
  };

  return (
    <div className="select-none">
      <div
        ref={barRef}
        className="relative h-12 w-full cursor-crosshair rounded-lg bg-muted/60"
        onPointerDown={(e) => {
          // Starts a new selection anywhere on the strip. Previously the only
          // way to select was clicking two transcript lines, which left a
          // meeting with a single line — or none — with no way to clip at all.
          if (dragging.current) return;
          dragMoved.current = false;
          dragging.current = "new";
          const t = timeAt(e.clientX);
          onSetStart(t);
          onSetEnd(t);
        }}
        onPointerMove={onMove}
        onPointerUp={(e) => {
          const wasDrag = dragMoved.current;
          const mode = dragging.current;
          dragging.current = null;
          // A tap rather than a sweep means "play from here", so the aborted
          // zero-length selection is thrown away.
          if (mode === "new" && !wasDrag) {
            onClear();
            onScrub(timeAt(e.clientX));
          }
        }}
        onPointerLeave={() => (dragging.current = null)}
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
