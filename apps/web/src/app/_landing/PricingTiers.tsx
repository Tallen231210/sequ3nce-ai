"use client";

// ============================================================================
// The three plans.
//
// Copy note, because it's the whole point of this file: an earlier draft sold
// these as escalating surveillance — "know whether those numbers are true",
// "nothing happens you can't see". That's a terrible thing to put in front of a
// business owner who likes their team. It frames the product as catching people
// out, and the buyer has to picture themselves policing staff to want it.
//
// What each tier actually gives you is a different kind of knowledge:
//
//   Overview   — clarity. Your numbers, without chasing anyone for them.
//   Oversight  — learning. What's said on the calls that close, so it spreads.
//   Overwatch  — coaching. Your best calls become how you train everyone else.
//
// Same features, sold as making a team better rather than watching it.
// ============================================================================

import { Check, ArrowRight } from "lucide-react";
import { BookDemoButton } from "@/components/ui/calendly-modal";

interface Plan {
  name: string;
  platform: number;
  seat: number;
  /** The one-line reason to buy this rather than the one below it. */
  promise: string;
  /** Who it's for, in their words. */
  forWho: string;
  features: string[];
  /** The middle plan carries the badge — it's the one most teams should pick. */
  highlight?: boolean;
  requires?: string;
}

const PLANS: Plan[] = [
  {
    name: "Overview",
    platform: 300,
    seat: 30,
    promise: "Every number in one place, without chasing anyone.",
    forWho:
      "For teams running on a spreadsheet somebody rebuilds every Monday.",
    features: [
      "Bookings, shows, closes and cash — updated daily",
      "Each closer's numbers, side by side",
      "Setter performance from your CRM",
      "Targets, pace and where the funnel leaks",
    ],
    requires: "Works with Google Calendar",
  },
  {
    name: "Oversight",
    platform: 500,
    seat: 50,
    promise: "Find what's working on your calls, and spread it.",
    forWho:
      "For teams who already record — and want to know what the good calls have in common.",
    features: [
      "Everything in Overview",
      "Connect the recorder you already use",
      "Full transcripts and AI breakdowns of every call",
      "The objections that keep coming up, and the answers that land",
    ],
    highlight: true,
    requires: "Works with Fathom",
  },
  {
    name: "Overwatch",
    platform: 500,
    seat: 150,
    promise: "Turn your best calls into how everyone else sells.",
    forWho:
      "For teams who coach hard and want new closers ramping in weeks, not quarters.",
    features: [
      "Everything in Oversight",
      "Every call recorded automatically — nobody has to remember",
      "Drop into a live call when a big one needs backup",
      "Clip the moments that matter into a playbook new hires learn from",
    ],
  },
];

export function PricingTiers() {
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      {PLANS.map((plan) => (
        <div
          key={plan.name}
          className={
            "relative flex flex-col rounded-3xl border bg-white p-8 " +
            (plan.highlight
              ? "border-zinc-950 shadow-[0_32px_80px_-20px_rgba(0,0,0,0.14)]"
              : "border-zinc-200 shadow-[0_16px_48px_-24px_rgba(0,0,0,0.10)]")
          }
        >
          {plan.highlight && (
            <div className="absolute -top-3 left-8 rounded-full bg-zinc-950 px-3 py-1 text-[10px] font-medium uppercase tracking-[0.18em] text-white">
              Most popular
            </div>
          )}

          <h3 className="text-xl font-semibold tracking-tight text-zinc-950">
            {plan.name}
          </h3>
          <p className="mt-2 text-[15px] leading-relaxed text-zinc-950">
            {plan.promise}
          </p>
          <p className="mt-2 text-[13px] leading-relaxed text-zinc-500">
            {plan.forWho}
          </p>

          <div className="mt-7 border-t border-zinc-100 pt-6">
            <div className="flex items-baseline gap-1">
              <span className="text-5xl font-semibold tracking-[-0.04em] text-zinc-950">
                ${plan.platform}
              </span>
              <span className="text-lg font-medium tracking-tight text-zinc-400">
                /mo
              </span>
            </div>
            <p className="mt-2 text-[13px] text-zinc-500">
              plus{" "}
              <span className="font-medium text-zinc-950">${plan.seat}</span> per
              closer, per month
            </p>
          </div>

          <ul className="mt-7 flex-1 space-y-3.5">
            {plan.features.map((f) => (
              <li key={f} className="flex gap-3">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-zinc-950">
                  <Check className="h-3 w-3 text-white" strokeWidth={2.5} />
                </span>
                <span className="text-sm leading-relaxed text-zinc-700">{f}</span>
              </li>
            ))}
          </ul>

          {plan.requires && (
            <p className="mt-6 text-[12px] text-zinc-400">{plan.requires}</p>
          )}

          {/* The site's own demo flow, so every plan lands in the same place
              rather than inventing a second path to talk to us. */}
          <div className="mt-6">
            <BookDemoButton
              size="lg"
              className={
                "w-full justify-center " +
                (plan.highlight ? "" : "bg-white text-zinc-950 border border-zinc-200 hover:bg-zinc-50")
              }
            >
              Book a demo
              <ArrowRight className="ml-2 h-4 w-4" strokeWidth={1.5} />
            </BookDemoButton>
          </div>
        </div>
      ))}
    </div>
  );
}
