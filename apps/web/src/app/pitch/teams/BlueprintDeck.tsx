"use client";

import { useState, useEffect, useCallback } from "react";
import { APP_GREY, DISPLAY_FONT, GRID, MONO_FONT } from "./theme";

// ============================================================================
// Renderer for the teams deck: every slide is a window on an app-grey ground
// (title bar with the slide's drawing label, an optional pill, and the
// counter), and the window's canvas is grid paper. Arrow keys / click to
// advance. Noindex via robots meta. The closer deck keeps its own renderer
// (../Deck.tsx) — this one is specific to the Blueprint × Dashboard system.
// ============================================================================

export type TeamSlide = {
  /** Title-bar text, in the voice of a drawing label ("DWG 01 · Sales operation"). */
  bar: string;
  /** Optional teal pill next to the title-bar text. */
  pill?: string;
  body: React.ReactNode;
};

export function BlueprintDeck({ slides }: { slides: TeamSlide[] }) {
  const [i, setI] = useState(0);
  const last = slides.length - 1;

  const go = useCallback((d: number) => setI((v) => Math.min(last, Math.max(0, v + d))), [last]);

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
    <div className="fixed inset-0 flex flex-col select-none text-[#0b1f1d]" style={{ background: APP_GREY, fontFamily: DISPLAY_FONT }}>
      {/* eslint-disable-next-line @next/next/no-head-element */}
      <meta name="robots" content="noindex, nofollow" />

      {/* Click zones */}
      <button aria-label="Previous" onClick={() => go(-1)} className="absolute left-0 top-0 bottom-16 w-1/4 z-20 cursor-w-resize" />
      <button aria-label="Next" onClick={() => go(1)} className="absolute right-0 top-0 bottom-16 w-3/4 z-20 cursor-e-resize" />

      {/* The window */}
      <div className="flex-1 min-h-0 px-5 pt-5 md:px-8 md:pt-6">
        <div className="h-full flex flex-col overflow-hidden rounded-xl border border-[#e1e6e9] bg-white shadow-[0_10px_30px_rgba(15,23,42,.06)]">
          <div className="h-10 shrink-0 flex items-center gap-1.5 px-4 border-b border-[#e9edf0] text-[12px] text-slate-500">
            <span className="w-[9px] h-[9px] rounded-full bg-[#e1e6e9]" />
            <span className="w-[9px] h-[9px] rounded-full bg-[#e1e6e9]" />
            <span className="w-[9px] h-[9px] rounded-full bg-[#e1e6e9]" />
            <span className="ml-2 font-semibold text-slate-700">{s.bar}</span>
            {s.pill && <span className="ml-2 rounded-full bg-[#ccfbf1] px-2.5 py-0.5 text-[11px] font-semibold text-[#0f766e]">{s.pill}</span>}
            <span className="ml-auto text-[11px] tabular-nums text-slate-500" style={{ fontFamily: MONO_FONT }}>
              {i + 1} / {slides.length}
            </span>
          </div>
          <div
            className="relative flex-1 min-h-0 overflow-hidden"
            style={{
              backgroundImage: `linear-gradient(${GRID} 1px, transparent 1px), linear-gradient(90deg, ${GRID} 1px, transparent 1px)`,
              backgroundSize: "24px 24px",
            }}
          >
            <div className="absolute inset-0 flex items-center justify-center px-8 py-7 md:px-14 md:py-8">
              <div className="w-full max-w-6xl">{s.body}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer: progress */}
      <div className="h-16 flex items-center justify-between px-8 z-30 relative">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="" className="h-4 opacity-50" />
        <div className="flex gap-1.5">
          {slides.map((_, idx) => (
            <button
              key={idx}
              onClick={() => setI(idx)}
              aria-label={`Slide ${idx + 1}`}
              className={`h-1.5 transition-all ${idx === i ? "w-6 bg-[#0d9488]" : "w-1.5 bg-[#cbd5d3] hover:bg-[#9db8b3]"}`}
            />
          ))}
        </div>
        <span className="text-[11px] text-slate-400 tabular-nums" style={{ fontFamily: MONO_FONT }}>
          SEQU3NCE · FOR TEAMS
        </span>
      </div>
    </div>
  );
}
