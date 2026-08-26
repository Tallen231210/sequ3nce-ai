"use client";

import { useCallback, useRef, useState } from "react";
import { Play } from "lucide-react";

// ============================================================================
// The funnel's VSL player. Two deliberate behaviors, both Tyler-specified:
//
// 1. NO SEEKING. There are no native controls, no clickable timeline, and no
//    keyboard scrubbing — clicking the video toggles play/pause, nothing
//    else. Viewers watch in order or not at all.
// 2. NON-LINEAR PROGRESS BAR. Since the bar can't be used to seek, it's
//    purely cosmetic — and it runs on a square-root curve: it fills fast in
//    the first minute and crawls at the end (at 25% watched it shows ~50%).
//
// The video is vertical (720×1280), so the player renders as a centered
// phone-format card rather than a widescreen box.
// ============================================================================

type Props = {
  src: string;
  poster: string;
  label: string;
};

export function VslPlayer({ src, poster, label }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [started, setStarted] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0); // displayed percent, 0-100

  const toggle = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      void v.play();
    } else {
      v.pause();
    }
  }, []);

  function onTimeUpdate() {
    const v = videoRef.current;
    if (!v || !v.duration) return;
    const real = v.currentTime / v.duration; // 0-1
    setProgress(Math.min(100, Math.sqrt(real) * 100));
  }

  return (
    <div style={{ maxWidth: 340, margin: "0 auto 10px" }}>
      <div
        className="relative overflow-hidden rounded-xl bg-zinc-950"
        style={{ aspectRatio: "9 / 16", boxShadow: "0 20px 56px rgba(9,9,11,.22)" }}
        onContextMenu={(e) => e.preventDefault()}
      >
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <video
          ref={videoRef}
          src={src}
          poster={poster}
          playsInline
          preload="metadata"
          disablePictureInPicture
          controlsList="nodownload noplaybackrate noremoteplayback"
          className="absolute inset-0 h-full w-full cursor-pointer object-cover"
          onClick={toggle}
          onPlay={() => {
            setStarted(true);
            setPlaying(true);
          }}
          onPause={() => setPlaying(false)}
          onEnded={() => {
            setPlaying(false);
            setProgress(100);
          }}
          onTimeUpdate={onTimeUpdate}
        />

        {/* Poster overlay: play button + label, gone once started */}
        {!started && (
          <button
            type="button"
            aria-label="Play video"
            onClick={toggle}
            className="absolute inset-0 flex cursor-pointer flex-col items-center justify-center gap-2.5 bg-zinc-950/45 text-white"
          >
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white p-4">
              <Play className="h-5 w-5 translate-x-[1px] fill-zinc-950 text-zinc-950" />
            </span>
            <span className="px-6 text-center text-[11px] uppercase tracking-[0.16em] text-zinc-200">
              {label}
            </span>
          </button>
        )}

        {/* Paused mid-watch: subtle resume affordance */}
        {started && !playing && progress < 100 && (
          <button
            type="button"
            aria-label="Resume video"
            onClick={toggle}
            className="absolute inset-0 flex cursor-pointer items-center justify-center bg-zinc-950/30"
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white/95 p-3.5">
              <Play className="h-4 w-4 translate-x-[1px] fill-zinc-950 text-zinc-950" />
            </span>
          </button>
        )}

        {/* Cosmetic progress bar — deliberately not interactive */}
        {started && (
          <div
            className="pointer-events-none absolute bottom-0 left-0 right-0 h-[5px] bg-white/20"
            aria-hidden
          >
            <div
              className="h-full bg-emerald-500"
              style={{ width: `${progress}%`, transition: "width .35s linear" }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
