"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Check, CalendarPlus, Loader2 } from "lucide-react";
import { VslPlayer } from "../VslPlayer";
import { WinsSection } from "../WinsSection";
import { ProgressRail, type RailStep } from "../ProgressRail";

// ============================================================================
// Post-booking page. They've booked, but they're NOT done: two things left
// that lift show-rate — put the call on their calendar, and watch the video
// before the call. So the rail shows the final step still active, and the
// page leads with those two actions, then the same social proof as page one.
// Reached via /start/book after a completed booking.
// ============================================================================

const GROUND: React.CSSProperties = {
  backgroundImage: "radial-gradient(circle, rgb(228 228 231) 1px, transparent 1px)",
  backgroundSize: "24px 24px",
  WebkitMaskImage: "radial-gradient(ellipse 70% 55% at 50% 12%, black 30%, transparent 75%)",
  maskImage: "radial-gradient(ellipse 70% 55% at 50% 12%, black 30%, transparent 75%)",
};

// They've booked and the call is scheduled, but the confirm + watch actions are
// still ahead — so the last step reads active, not checked.
const REMAINING_STEPS: RailStep[] = [
  { label: "Details submitted", state: "done" },
  { label: "Call booked", state: "done" },
  { label: "You're in", state: "current" },
];

// Build a Google Calendar "add event" link. GHL passes the booked slot in the
// post-booking redirect (?start=&end=, ISO); with it the event is pre-filled to
// the real time, without it the link still opens a titled event they can place.
function googleCalendarUrl(startISO: string | null, endISO: string | null) {
  const base = "https://calendar.google.com/calendar/render?action=TEMPLATE";
  const text = encodeURIComponent("Sequ3nce onboarding call");
  const details = encodeURIComponent(
    "Your onboarding call with a Sequ3nce coach. We come up as Sequ3nce — keep your phone close; we often call a little sooner.",
  );
  const toStamp = (iso: string) => iso.replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  if (startISO) {
    const start = toStamp(startISO);
    const end = toStamp(
      endISO ?? new Date(new Date(startISO).getTime() + 20 * 60 * 1000).toISOString(),
    );
    return `${base}&text=${text}&dates=${start}/${end}&details=${details}`;
  }
  return `${base}&text=${text}&details=${details}`;
}

function ThanksInner() {
  const params = useSearchParams();
  const phone = params.get("p") || "your number";
  const calendarUrl = googleCalendarUrl(params.get("start"), params.get("end"));

  return (
    <main className="relative mx-auto max-w-[1120px] px-6 py-12 lg:py-16">
      <div aria-hidden className="absolute inset-0 -z-10" style={GROUND} />

      <ProgressRail steps={REMAINING_STEPS} />

      <div className="mx-auto mb-9 max-w-[640px] text-center">
        <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-zinc-50 px-3.5 py-1.5 text-xs font-medium text-zinc-700">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-50" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          </span>
          One more step
        </div>
        <h1 className="text-[clamp(30px,4.4vw,46px)] font-semibold leading-[0.98] tracking-[-0.04em] text-zinc-950">
          You&apos;re not done <span className="font-serif italic font-normal">yet</span>
          <span className="text-zinc-300">.</span>
        </h1>
        <p className="mx-auto mt-4 max-w-[34ch] text-base leading-relaxed text-zinc-500">
          Two quick things before your call — add it to your calendar, then watch the
          short video below.
        </p>
      </div>

      {/* The two actions. Desktop: Confirm (top-left) + checklist (bottom-left)
          fill the left column against the tall video, which spans both rows on
          the right. Mobile: DOM order keeps it Confirm → video → checklist so
          the video stays prominent right after Confirm. */}
      <div className="grid gap-5 lg:grid-cols-2 lg:grid-rows-[auto_1fr] lg:gap-x-6 lg:gap-y-5">
        {/* 1 — Confirm the meeting (adds it to their calendar). */}
        <div className="flex flex-col rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm lg:col-start-1 lg:row-start-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-400">
            Step 1 &middot; Add to your calendar
          </p>
          <p className="mt-2 text-[15px] leading-normal text-zinc-600">
            Lock the call into your calendar so it doesn&apos;t slip. We&apos;ll still
            call you — often a little sooner.
          </p>
          <a
            href={calendarUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-zinc-900 px-4 py-3.5 text-[15px] font-semibold text-white transition-colors hover:bg-zinc-800"
          >
            <CalendarPlus className="h-4.5 w-4.5" />
            Add to your calendar
          </a>

          <div className="mt-5 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-400">
              This is the number we&apos;re calling
            </p>
            <p className="mt-1 text-[20px] font-semibold tracking-[-0.01em]">{phone}</p>
            <p className="mt-1 text-[12.5px] leading-normal text-zinc-500">
              We&apos;ll come up as <strong>Sequ3nce</strong> — not an unknown number.
            </p>
          </div>
        </div>

        {/* 2 — Watch the video. Plain block (not flex) so the player's
            auto-margins still give it width; label centered on every size.
            Spans both rows on desktop so its height is matched by the left
            column's Confirm + checklist stack. */}
        <div className="lg:col-start-2 lg:row-start-1 lg:row-span-2">
          <p className="mb-3 text-center text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-400">
            Step 2 &middot; Watch this before your call
          </p>
          <VslPlayer src="/videos/thanks.mp4" poster="/videos/thanks-poster.jpg" label="Start here" />
          <p className="mx-auto mt-2.5 max-w-[46ch] text-center text-xs leading-relaxed text-zinc-400">
            What&apos;s in the program, how placement works, and exactly what we sell
            and why — so nothing on the call is a surprise.
          </p>
        </div>

        {/* What the call covers — fills the left column under Confirm. */}
        <div className="lg:col-start-1 lg:row-start-2">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-400">
            What we&apos;ll cover — about 15 minutes
          </p>
          <div className="space-y-2.5">
            {[
              "Which openings we're placing people into right now",
              "Where you're at and what you'd be ready to take",
              "Getting you into the training and the room",
            ].map((line) => (
              <div
                key={line}
                className="flex items-start gap-2 rounded-xl border border-zinc-200 bg-white px-3.5 py-3"
              >
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" strokeWidth={3} />
                <p className="text-[13px] leading-snug">{line}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Same proof as page one. */}
      <div className="mt-14">
        <WinsSection />
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
