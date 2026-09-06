"use client";

import { useEffect, useState } from "react";
import { Loader2, ShieldCheck } from "lucide-react";
import { Logo } from "@/components/ui/logo";
import { captureFirstTouch } from "@/lib/attribution";

// ============================================================================
// /personal/commit — the $150/mo last-resort agreement gate (2026-09-06).
// The rep sends this link only when they can't close a commitment plan. The
// prospect must tick the 3-month-minimum box before the Polar checkout opens.
// The exact terms text below is recorded server-side + stamped on the order
// for chargeback evidence, so keep it in sync with what's displayed.
// ============================================================================

const TERMS_TEXT =
  "I understand and agree that Sequ3nce Personal is a $150/month subscription " +
  "with a minimum commitment of 3 months ($150 billed each month for at least " +
  "3 months). I understand this software works best over time and that I am " +
  "committing to give it a fair 3-month run. My card will be charged $150 today " +
  "and $150 on each monthly renewal.";

export default function MonthlyCommitPage() {
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    captureFirstTouch();
  }, []);

  async function proceed() {
    if (!agreed || busy) return;
    setBusy(true);
    setError(null);
    // _fbp/_fbc for CAPI, same as the checkout page.
    const cookie = (name: string) =>
      document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]+)`))?.[1];
    const fbp = cookie("_fbp");
    let fbc = cookie("_fbc");
    if (!fbc) {
      const fbclid = new URLSearchParams(window.location.search).get("fbclid");
      if (fbclid) fbc = `fb.1.${Date.now()}.${fbclid}`;
    }
    try {
      const res = await fetch("/api/polar/b2c-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan: "monthly",
          fbp,
          fbc,
          agreementAccepted: true,
          agreementText: TERMS_TEXT,
        }),
      });
      const data = await res.json();
      if (res.ok && data.url) {
        window.location.href = data.url;
        return;
      }
      setError(data.error ?? "Something went wrong — try again.");
    } catch {
      setError("Something went wrong — try again.");
    }
    setBusy(false);
  }

  return (
    <div className="min-h-screen bg-white text-zinc-900">
      <header className="border-b border-zinc-200/60 bg-white/70 py-4 backdrop-blur-sm">
        <div className="mx-auto flex max-w-5xl items-center justify-center gap-2.5 px-6">
          <Logo href="/personal" height={22} />
          <span className="relative -top-[2px] rounded-full bg-zinc-900 px-2.5 py-0.5 text-[10px] font-semibold tracking-[0.18em] text-white">
            PERSONAL
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-xl px-6 py-16 sm:py-20">
        <p className="mb-4 text-center text-[12px] uppercase tracking-[0.22em] text-zinc-500">
          Monthly plan · before you start
        </p>
        <h1 className="text-center text-3xl sm:text-4xl font-semibold tracking-[-0.03em] leading-tight text-zinc-950">
          A quick commitment
        </h1>
        <p className="mx-auto mt-5 max-w-lg text-center text-base text-zinc-600 leading-relaxed">
          The monthly plan is $150/month with a 3-month minimum. This software
          compounds — the reps who win give it a real run rather than judging it
          in week one. Confirm you&apos;re in for the three months and we&apos;ll
          get you set up.
        </p>

        <div className="mt-8 rounded-2xl border border-zinc-200 bg-zinc-50 p-5">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="mt-1 h-5 w-5 shrink-0 rounded border-zinc-300 accent-zinc-900"
            />
            <span className="text-[14px] leading-relaxed text-zinc-700">
              {TERMS_TEXT}
            </span>
          </label>
        </div>

        <button
          onClick={proceed}
          disabled={!agreed || busy}
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-zinc-900 px-4 py-3.5 text-[15px] font-semibold text-white transition-colors hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <>
              <ShieldCheck className="h-4 w-4" />
              Agree &amp; continue to checkout
            </>
          )}
        </button>
        {!agreed && (
          <p className="mt-2 text-center text-[12px] text-zinc-400">
            Tick the box to continue.
          </p>
        )}
        {error && (
          <p className="mt-3 text-center text-sm text-rose-600">{error}</p>
        )}
      </main>
    </div>
  );
}
