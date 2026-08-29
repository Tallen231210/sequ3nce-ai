"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Check, Loader2 } from "lucide-react";
import { VslPlayer } from "../VslPlayer";

// ============================================================================
// Confirmation: "keep your phone close." The number shown is the LEAD'S own
// number, carried from the opt-in form via ?p= — it confirms what we're
// about to dial, so a typo'd number is caught in the seconds it matters.
// ============================================================================

const GROUND: React.CSSProperties = {
  backgroundImage: "radial-gradient(circle, rgb(228 228 231) 1px, transparent 1px)",
  backgroundSize: "24px 24px",
  WebkitMaskImage: "radial-gradient(ellipse 70% 55% at 50% 12%, black 30%, transparent 75%)",
  maskImage: "radial-gradient(ellipse 70% 55% at 50% 12%, black 30%, transparent 75%)",
};

function ThanksInner() {
  const params = useSearchParams();
  const phone = params.get("p") || "your number";

  return (
    <main className="relative mx-auto max-w-[1120px] px-6 py-12 lg:py-16">
      <div aria-hidden className="absolute inset-0 -z-10" style={GROUND} />

      <div className="mx-auto mb-10 max-w-[640px] text-center">
        <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-zinc-50 px-3.5 py-1.5 text-xs font-medium text-zinc-700">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-50" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          </span>
          You&apos;re in
        </div>
        <h1 className="text-[clamp(30px,4.4vw,46px)] font-semibold leading-[0.98] tracking-[-0.04em] text-zinc-950">
          Keep your phone <span className="font-serif italic font-normal">close</span>
          <span className="text-zinc-300">.</span>
        </h1>
        <p className="mt-4 text-base leading-relaxed text-zinc-500">
          Someone from our team is calling you in the next few minutes.
        </p>
      </div>

      <div className="grid gap-8 lg:grid-cols-2 lg:gap-10">
        <div>
          <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-5 py-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-400">
              This is the number we&apos;re calling
            </p>
            <p className="mt-1 text-[22px] font-semibold tracking-[-0.01em]">{phone}</p>
            <p className="mt-1.5 text-[12.5px] leading-normal text-zinc-500">
              We&apos;ll come up as <strong>Sequ3nce</strong> — not an unknown number.
            </p>
          </div>

          <p className="mb-3 mt-7 text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-400">
            What we&apos;ll cover — about 15 minutes
          </p>
          {[
            "Which openings we're placing people into right now",
            "Where you're at and what you'd be ready to take",
            "Getting you into the training and the room",
          ].map((line) => (
            <div key={line} className="mb-2.5 flex items-start gap-2.5">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" strokeWidth={3} />
              <p className="text-sm leading-normal">{line}</p>
            </div>
          ))}

          <div className="mt-6 rounded-2xl border border-dashed border-zinc-300 p-5 text-center">
            <p className="mb-3 text-[13.5px] text-zinc-500">
              Can&apos;t take a call in the next few minutes?
            </p>
            <a
              href="https://booking.sequ3nce.com/widget/bookings/cash-collectors-onboarding-cal"
              target="_blank"
              rel="noopener"
              className="block w-full rounded-[10px] border border-zinc-300 px-4 py-3 text-center text-[15px] font-semibold text-zinc-900 transition-colors hover:bg-zinc-50"
            >
              Pick a time instead
            </a>
          </div>
          <p className="mt-3 text-center text-xs leading-relaxed text-zinc-400">
            Booking a time doesn&apos;t take you off the list — if we reach you
            sooner, we&apos;ll cancel it.
          </p>
        </div>

        {/* On phones the video leads (co-founder's call) — desktop keeps it
            in the right column via lg:order-none. */}
        <div className="order-first lg:order-none">
          <p className="mb-3 text-center text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-400 lg:text-left">
            Watch this while you wait
          </p>
          <VslPlayer src="/videos/thanks.mp4" poster="/videos/thanks-poster.jpg" label="Start here" />
          <p className="mt-2.5 text-xs leading-relaxed text-zinc-400">
            What&apos;s in the program, how placement works, and exactly what we
            sell and why — so nothing on the call is a surprise.
          </p>
        </div>
      </div>
    </main>
  );
}

export default function ThanksPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-[60vh] items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-zinc-400" />
        </div>
      }
    >
      <ThanksInner />
    </Suspense>
  );
}
