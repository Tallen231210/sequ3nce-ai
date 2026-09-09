"use client";

import { useState, useEffect, useCallback } from "react";
import type { Slide } from "./slides";

// ============================================================================
// Shared pitch-deck renderer. /pitch and the two track decks (/pitch/expno,
// /pitch/expyes) all render through this — each route just passes its own
// slides array. Arrow keys / click to advance. Noindex via robots meta.
// ============================================================================

/**
 * Visual variants. "dark" is the closer deck's original look and stays the
 * default; "light" is the teams deck — white ground, turquoise accent. Slide
 * bodies carry their own colors, so this only governs the frame.
 */
const VARIANTS = {
  dark: {
    root: "bg-zinc-950 text-white",
    kicker: "text-amber-300",
    shotFrame: "border-zinc-800",
    shotShadow: "0 30px 80px rgba(0,0,0,.6)",
    caption: "text-zinc-600",
    logo: "invert opacity-40",
    dotOn: "bg-amber-300",
    dotOff: "bg-zinc-700 hover:bg-zinc-500",
    counter: "text-zinc-600",
  },
  light: {
    root: "bg-white text-zinc-900",
    kicker: "text-teal-600",
    shotFrame: "border-zinc-200",
    shotShadow: "0 24px 60px rgba(15,23,42,.14)",
    caption: "text-zinc-400",
    logo: "opacity-50",
    dotOn: "bg-teal-500",
    dotOff: "bg-zinc-300 hover:bg-zinc-400",
    counter: "text-zinc-400",
  },
} as const;

export function Deck({ slides, variant = "dark" }: { slides: Slide[]; variant?: keyof typeof VARIANTS }) {
  const v = VARIANTS[variant];
  const [i, setI] = useState(0);
  const last = slides.length - 1;

  const go = useCallback(
    (d: number) => setI((v) => Math.min(last, Math.max(0, v + d))),
    [last],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === " " || e.key === "Enter") go(1);
      if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go]);

  const s = slides[i];

  return (
    <div
      className={`fixed inset-0 ${v.root} flex flex-col select-none`}
      style={{ fontFamily: "var(--font-geist-sans), -apple-system, sans-serif" }}
    >
      {/* eslint-disable-next-line @next/next/no-head-element */}
      <meta name="robots" content="noindex, nofollow" />

      {/* Click zones */}
      <button aria-label="Previous" onClick={() => go(-1)} className="absolute left-0 top-0 bottom-16 w-1/4 z-20 cursor-w-resize" />
      <button aria-label="Next" onClick={() => go(1)} className="absolute right-0 top-0 bottom-16 w-3/4 z-20 cursor-e-resize" />

      {/* Slide */}
      <div className="flex-1 flex items-center justify-center px-10 md:px-20 overflow-hidden">
        {s.shot ? (
          <div className="flex flex-col lg:flex-row items-center gap-10 lg:gap-16 max-w-6xl w-full">
            <div className="lg:w-[38%] shrink-0">
              {s.kicker && (
                <div className={`${v.kicker} text-[12px] font-bold uppercase tracking-[0.2em] mb-4`}>{s.kicker}</div>
              )}
              <h1 className="text-4xl font-bold tracking-tight leading-tight mb-6">{s.title}</h1>
              {/* Wrapped so the body is a sole child: the slide arrives from the
                  server without a key, and as a bare sibling React warns in dev. */}
              {s.body && <div>{s.body}</div>}
            </div>
            <div className="flex-1 min-w-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={s.shot}
                alt=""
                className={`rounded-xl border ${v.shotFrame} shadow-2xl w-full`}
                style={{ boxShadow: v.shotShadow }}
              />
              <p className={`${v.caption} text-[11px] mt-2 text-center`}>Sample account for illustration</p>
            </div>
          </div>
        ) : (
          <div className={`w-full ${s.wide ? "max-w-5xl" : "max-w-3xl"} flex flex-col items-${s.wide ? "center" : "start"}`}>
            {s.kicker && (
              <div className={`${v.kicker} text-[12px] font-bold uppercase tracking-[0.2em] mb-4`}>{s.kicker}</div>
            )}
            {typeof s.title === "string" ? (
              <h1 className="text-5xl font-bold tracking-tight leading-tight mb-8">{s.title}</h1>
            ) : (
              <div className="mb-8 w-full flex justify-center">{s.title}</div>
            )}
            {s.body && <div className="w-full flex justify-center">{s.body}</div>}
          </div>
        )}
      </div>

      {/* Footer: progress */}
      <div className="h-16 flex items-center justify-between px-8 z-30 relative">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="" className={`h-4 ${v.logo}`} />
        <div className="flex gap-1.5">
          {slides.map((_, idx) => (
            <button
              key={idx}
              onClick={() => setI(idx)}
              aria-label={`Slide ${idx + 1}`}
              className={`h-1.5 rounded-full transition-all ${idx === i ? `w-6 ${v.dotOn}` : `w-1.5 ${v.dotOff}`}`}
            />
          ))}
        </div>
        <span className={`${v.counter} text-xs tabular-nums`}>{i + 1} / {slides.length}</span>
      </div>
    </div>
  );
}
