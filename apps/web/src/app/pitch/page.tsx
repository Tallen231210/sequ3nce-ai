"use client";

import { useState, useEffect, useCallback } from "react";
import { SLIDES } from "./slides";

// ============================================================================
// /pitch — the closer pitch deck. Hosted so reps present a link on video
// calls (no app logins, always current). Arrow keys / click to advance.
// Not linked from anywhere public; noindex via robots meta.
// ============================================================================

export default function PitchDeck() {
  const [i, setI] = useState(0);
  const last = SLIDES.length - 1;

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

  const s = SLIDES[i];

  return (
    <div
      className="fixed inset-0 bg-zinc-950 text-white flex flex-col select-none"
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
                <div className="text-amber-300 text-[12px] font-bold uppercase tracking-[0.2em] mb-4">{s.kicker}</div>
              )}
              <h1 className="text-4xl font-bold tracking-tight leading-tight mb-6">{s.title}</h1>
              {s.body}
            </div>
            <div className="flex-1 min-w-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={s.shot}
                alt=""
                className="rounded-xl border border-zinc-800 shadow-2xl w-full"
                style={{ boxShadow: "0 30px 80px rgba(0,0,0,.6)" }}
              />
              <p className="text-zinc-600 text-[11px] mt-2 text-center">Sample account for illustration</p>
            </div>
          </div>
        ) : (
          <div className={`w-full ${s.wide ? "max-w-5xl" : "max-w-3xl"} flex flex-col items-${s.wide ? "center" : "start"}`}>
            {s.kicker && (
              <div className="text-amber-300 text-[12px] font-bold uppercase tracking-[0.2em] mb-4">{s.kicker}</div>
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
        <img src="/logo.png" alt="" className="h-4 invert opacity-40" />
        <div className="flex gap-1.5">
          {SLIDES.map((_, idx) => (
            <button
              key={idx}
              onClick={() => setI(idx)}
              aria-label={`Slide ${idx + 1}`}
              className={`h-1.5 rounded-full transition-all ${idx === i ? "w-6 bg-amber-300" : "w-1.5 bg-zinc-700 hover:bg-zinc-500"}`}
            />
          ))}
        </div>
        <span className="text-zinc-600 text-xs tabular-nums">{i + 1} / {SLIDES.length}</span>
      </div>
    </div>
  );
}
