"use client";

import { attributionQueryString, readAttribution } from "@/lib/attribution";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import Script from "next/script";
import { ProgressRail } from "../ProgressRail";

// ============================================================================
// The forced booking step. After opt-in, this is the ONLY way forward — the
// calendar is the whole page, no skip. That is deliberate: booking is a
// commitment device, and someone who won't book simply leaves, by which point
// we already have their opt-in and call them regardless. Do not add an escape
// hatch here.
//
// Detecting the booking: the widget announces a completed appointment with one
// specific event, pinned from GHL's own shipped bundle (2026-09-14) and then
// confirmed by a live booking, rather than guessed at.
// ============================================================================

const BOOKING_WIDGET_URL =
  "https://booking.sequ3nce.com/widget/bookings/cash-collectors-onboarding-cal";

// From the widget's bundle, fired the instant the appointment is created:
//   window.parent.postMessage(
//     ["msgsndr-booking-complete", { fingerprint, calendarId }], "*")
// It carries no appointment time. That is why the calendar's own redirect URL is
// still worth configuring in GHL: it is the only route that delivers the booked
// slot, as query params that /start/thanks reads off its own URL.
const BOOKING_COMPLETE_EVENT = "msgsndr-booking-complete";

// The widget posts this as an array; tolerate a stringified payload too.
function isBookingComplete(data: unknown): boolean {
  if (Array.isArray(data)) return data[0] === BOOKING_COMPLETE_EVENT;
  if (typeof data === "string") return data.includes(BOOKING_COMPLETE_EVENT);
  return false;
}

const GROUND: React.CSSProperties = {
  backgroundImage: "radial-gradient(circle, rgb(228 228 231) 1px, transparent 1px)",
  backgroundSize: "24px 24px",
  WebkitMaskImage: "radial-gradient(ellipse 70% 55% at 50% 12%, black 30%, transparent 75%)",
  maskImage: "radial-gradient(ellipse 70% 55% at 50% 12%, black 30%, transparent 75%)",
};

function BookInner() {
  const router = useRouter();
  const params = useSearchParams();
  const phone = params.get("p") || "";
  const [bookingSrc, setBookingSrc] = useState(BOOKING_WIDGET_URL);

  // Carry the first-touch attribution into the widget so the booked call keeps
  // its campaign, exactly as the old inline booking overlay did.
  useEffect(() => {
    const qs = attributionQueryString(readAttribution());
    if (qs) setBookingSrc(`${BOOKING_WIDGET_URL}?${qs}`);
  }, []);

  const toThanks = () =>
    router.push(`/start/thanks?booked=1${phone ? `&p=${encodeURIComponent(phone)}` : ""}`);

  useEffect(() => {
    // Only one signal matters. Read from GHL's bundle: on a successful booking
    // it posts the completion event and then, in the same synchronous function,
    // sets `window.top.location.href` to the calendar's configured redirect. So
    // if a redirect IS configured, GHL replaces this whole page itself and the
    // handler below never gets the chance to run; the booked slot arrives as
    // query params on that URL and /start/thanks reads them. If it is NOT
    // configured, this handler is the only thing that moves them along. Either
    // way there is nothing to wait for, so advance immediately.
    function onMessage(e: MessageEvent) {
      if (typeof e.origin === "string" && !e.origin.includes("booking.sequ3nce.com")) return;
      if (process.env.NODE_ENV !== "production") {
        // eslint-disable-next-line no-console
        console.log("[book] widget message", e.data);
      }
      if (isBookingComplete(e.data)) toThanks();
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phone]);

  return (
    <main className="relative mx-auto max-w-[1120px] px-6 py-12 lg:py-16">
      <div aria-hidden className="absolute inset-0 -z-10" style={GROUND} />

      <ProgressRail />

      <div className="mx-auto mb-8 max-w-[640px] text-center">
        <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-zinc-50 px-3.5 py-1.5 text-xs font-medium text-zinc-700">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-50" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          </span>
          Last step
        </div>
        <h1 className="text-[clamp(30px,4.4vw,46px)] font-semibold leading-[0.98] tracking-[-0.04em] text-zinc-950">
          Book your onboarding <span className="font-serif italic font-normal">call</span>
          <span className="text-zinc-300">.</span>
        </h1>
        <p className="mt-4 text-base leading-relaxed text-zinc-500">
          Lock in a time and a coach walks you through placement, the training, and
          getting you in. We&apos;ll often reach you even sooner.
        </p>
      </div>

      {/* GHL's form_embed.js drives iframe-resizer (the widget announces
          itself with an [iFrameResizerChild]Ready handshake) — it auto-fits the
          iframe to the calendar's real height so the time slots and form are
          never cut off. minHeight is just a pre-resize placeholder. */}
      <div className="mx-auto max-w-2xl overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <iframe
          id="cash-collectors-onboarding-cal_book"
          src={bookingSrc}
          title="Book your onboarding call"
          scrolling="no"
          className="w-full border-0"
          style={{ minHeight: 640 }}
        />
      </div>
      <Script src="https://booking.sequ3nce.com/js/form_embed.js" strategy="afterInteractive" />

      {process.env.NODE_ENV !== "production" && (
        <div className="mx-auto mt-4 max-w-2xl text-center">
          <button
            type="button"
            onClick={toThanks}
            className="text-xs font-medium text-zinc-400 underline underline-offset-2 hover:text-zinc-600"
          >
            (dev only) simulate a completed booking &rarr;
          </button>
        </div>
      )}
    </main>
  );
}

export default function BookPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-[60vh] items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-zinc-400" />
        </div>
      }
    >
      <BookInner />
    </Suspense>
  );
}
