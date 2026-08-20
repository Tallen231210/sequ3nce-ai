"use client";

import { useState } from "react";
import { Logo } from "@/components/ui/logo";
import { Check, Loader2 } from "lucide-react";

// ============================================================================
// The plan picker. Four plans, one product — the only variable is commitment.
//
// Display per-month, charge the total: "$83/mo billed annually" converts
// where "$1,000" scares, and the exact charge is stated right underneath so
// nobody feels tricked at the Polar page. Reps drive prospects here on
// screen-share; self-serve traffic lands here from /personal.
// ============================================================================

const PLANS: Array<{
  key: string;
  label: string;
  perMonth: string;
  charged: string;
  note?: string;
  highlight?: boolean;
}> = [
  {
    key: "monthly",
    label: "Monthly",
    perMonth: "$150",
    charged: "Billed $150 every month",
  },
  {
    key: "3month",
    label: "3 Months",
    perMonth: "$133",
    charged: "Billed $400 every 3 months",
  },
  {
    key: "6month",
    label: "6 Months",
    perMonth: "$100",
    charged: "Billed $600 every 6 months",
    note: "Save 33%",
    highlight: true,
  },
  {
    key: "yearly",
    label: "Yearly",
    perMonth: "$83",
    charged: "Billed $1,000 once a year",
    note: "Save 44%",
  },
];

const INCLUDED = [
  "Unlimited call recording & transcripts",
  "AI analysis and scoring on every call",
  "Your stats, streaks and public closer profile",
  "Community, coaching calls & Call of the Week",
];

export default function PersonalCheckoutPage() {
  const [busyPlan, setBusyPlan] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function buy(plan: string) {
    setBusyPlan(plan);
    setError(null);
    try {
      const res = await fetch("/api/polar/b2c-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
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
    setBusyPlan(null);
  }

  return (
    <div className="min-h-screen bg-white text-zinc-900">
      <header className="border-b border-zinc-200/60 bg-white/70 py-4 backdrop-blur-sm">
        <div className="mx-auto flex max-w-5xl items-center justify-center gap-2.5 px-6">
          <Logo href="/personal" height={22} />
          <span className="rounded-full bg-zinc-900 px-2.5 py-0.5 text-[10px] font-semibold tracking-[0.18em] text-white">
            PERSONAL
          </span>
        </div>
      </header>

      <main className="relative mx-auto max-w-5xl px-6 py-16 sm:py-20">
        {/* Faint dot grid + radial fade — same ground the landing page stands on */}
        <div
          aria-hidden
          className="absolute inset-0 -z-10"
          style={{
            backgroundImage:
              "radial-gradient(circle, rgb(228 228 231) 1px, transparent 1px)",
            backgroundSize: "24px 24px",
            maskImage:
              "radial-gradient(ellipse 70% 60% at 50% 30%, black 30%, transparent 80%)",
            WebkitMaskImage:
              "radial-gradient(ellipse 70% 60% at 50% 30%, black 30%, transparent 80%)",
          }}
        />
        <p className="mb-4 text-center text-[12px] uppercase tracking-[0.22em] text-zinc-500">
          Full access · every plan
        </p>
        <h1 className="text-center text-4xl sm:text-5xl font-semibold tracking-[-0.04em] leading-[0.95] text-zinc-950">
          Choose your{" "}
          <span className="font-serif italic font-normal">commitment</span>
          <span className="text-zinc-300">.</span>
        </h1>
        <p className="mx-auto mt-6 max-w-xl text-center text-base text-zinc-600 leading-relaxed">
          Every plan is the full product. Pay, set your password, download the
          app — you&apos;ll be recording calls in five minutes.
        </p>

        <div className="mt-10 grid gap-4 md:grid-cols-4">
          {PLANS.map((p) => (
            <div
              key={p.key}
              className={
                "relative flex flex-col rounded-2xl bg-white p-6 " +
                (p.highlight
                  ? "border-2 border-zinc-900 shadow-lg shadow-zinc-200/50"
                  : "border border-zinc-200")
              }
            >
              {p.note && (
                <span
                  className={
                    "absolute -top-3 left-1/2 -translate-x-1/2 rounded-full px-3 py-1 text-[10px] font-semibold tracking-[0.18em] uppercase " +
                    (p.highlight
                      ? "bg-zinc-900 text-white"
                      : "border border-zinc-200 bg-zinc-50 text-zinc-700")
                  }
                >
                  {p.note}
                </span>
              )}
              <span className="text-sm font-semibold text-zinc-500">
                {p.label}
              </span>
              <span className="mt-2 text-5xl font-semibold tracking-[-0.04em] leading-none text-zinc-900">
                {p.perMonth}
                <span className="text-lg font-medium tracking-tight text-zinc-400">/mo</span>
              </span>
              <span className="mt-1 text-[12px] text-zinc-500">{p.charged}</span>
              <button
                onClick={() => buy(p.key)}
                disabled={busyPlan !== null}
                className={
                  "mt-6 rounded-lg px-4 py-2.5 text-[13px] font-semibold transition-colors disabled:opacity-50 " +
                  (p.highlight
                    ? "bg-zinc-900 text-white hover:bg-zinc-800"
                    : "border border-zinc-300 text-zinc-900 hover:border-zinc-900")
                }
              >
                {busyPlan === p.key ? (
                  <Loader2 className="mx-auto h-4 w-4 animate-spin" />
                ) : (
                  "Get started"
                )}
              </button>
            </div>
          ))}
        </div>

        {error && (
          <p className="mt-4 text-center text-sm text-rose-600">{error}</p>
        )}

        <div className="mx-auto mt-12 max-w-md">
          <p className="text-sm font-semibold text-zinc-700">
            Every plan includes
          </p>
          <ul className="mt-3 space-y-2">
            {INCLUDED.map((line) => (
              <li key={line} className="flex items-start gap-2 text-sm text-zinc-600">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                {line}
              </li>
            ))}
          </ul>
        </div>
      </main>
    </div>
  );
}
