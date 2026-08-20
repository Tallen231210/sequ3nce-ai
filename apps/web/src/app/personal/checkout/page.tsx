"use client";

import { useState } from "react";
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
      <header className="border-b border-zinc-100 py-5 text-center">
        <span className="text-lg font-bold tracking-tight">SEQU3NCE</span>
        <span className="ml-2 rounded bg-zinc-900 px-1.5 py-0.5 text-[10px] font-bold text-white">
          PERSONAL
        </span>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-14">
        <h1 className="text-center text-3xl font-bold tracking-tight">
          Choose your plan
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-center text-zinc-600">
          Every plan is the full product. Pay, set your password, download the
          app — you&apos;ll be recording calls in five minutes.
        </p>

        <div className="mt-10 grid gap-4 md:grid-cols-4">
          {PLANS.map((p) => (
            <div
              key={p.key}
              className={
                "relative flex flex-col rounded-2xl border p-6 " +
                (p.highlight
                  ? "border-zinc-900 shadow-lg"
                  : "border-zinc-200")
              }
            >
              {p.note && (
                <span
                  className={
                    "absolute -top-3 left-1/2 -translate-x-1/2 rounded-full px-3 py-0.5 text-[11px] font-bold " +
                    (p.highlight
                      ? "bg-zinc-900 text-white"
                      : "bg-zinc-100 text-zinc-700")
                  }
                >
                  {p.note}
                </span>
              )}
              <span className="text-sm font-semibold text-zinc-500">
                {p.label}
              </span>
              <span className="mt-2 text-4xl font-bold tracking-tight">
                {p.perMonth}
                <span className="text-base font-medium text-zinc-400">/mo</span>
              </span>
              <span className="mt-1 text-[12px] text-zinc-500">{p.charged}</span>
              <button
                onClick={() => buy(p.key)}
                disabled={busyPlan !== null}
                className={
                  "mt-6 rounded-lg px-4 py-2.5 text-sm font-semibold disabled:opacity-50 " +
                  (p.highlight
                    ? "bg-zinc-900 text-white"
                    : "border border-zinc-300 hover:border-zinc-500")
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
