"use client";

// ============================================================================
// Picking a plan at signup.
//
// This page used to show one hardcoded $499 card and post to checkout with no
// plan at all, so every new customer silently bought the top tier. The two
// cheaper plans existed on the pricing page, in the billing page, in the
// feature gates and in Stripe — everywhere except the one screen where someone
// could actually buy them.
//
// Only plans that have a live product in Polar are offered. A card that
// takes the click and then fails at checkout is worse than a card that
// isn't there.
// ============================================================================

import { useEffect, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { TIER_INFO, TIER_ORDER, TIER_PRICING, type Tier } from "@/lib/tiers";

type LoadState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; tiers: Tier[] };

export function PlanChooser({
  isLoading,
  onChoose,
}: {
  isLoading: boolean;
  onChoose: (tier: Tier) => void;
}) {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [chosen, setChosen] = useState<Tier | null>(null);

  useEffect(() => {
    let active = true;
    setState({ status: "loading" });
    fetch("/api/polar/available-tiers")
      .then(async (r) => {
        if (!r.ok) throw new Error(`available-tiers ${r.status}`);
        return (await r.json()) as { tiers?: Tier[] };
      })
      .then((d) => {
        if (active) setState({ status: "ready", tiers: d?.tiers ?? [] });
      })
      .catch((err) => {
        // An outage is NOT an empty catalogue, and must not be reported as
        // one. "No plans exist" is a permanent-sounding answer to a temporary
        // problem, and the visitor leaves.
        console.error("[plans] couldn't load available tiers:", err);
        if (active) setState({ status: "error" });
      });
    return () => {
      active = false;
    };
  }, [attempt]);

  if (state.status === "loading") {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="mx-auto max-w-md rounded-2xl border border-zinc-200 bg-zinc-50 p-6 text-center">
        <p className="text-sm text-zinc-700">
          We couldn&apos;t load the plans just now.
        </p>
        <button
          onClick={() => setAttempt((n) => n + 1)}
          className="mt-3 rounded-lg border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-900 hover:bg-white"
        >
          Try again
        </button>
      </div>
    );
  }

  const plans = TIER_ORDER.filter((t) => state.tiers.includes(t));

  if (plans.length === 0) {
    return (
      <div className="mx-auto max-w-md rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center">
        <p className="text-sm text-amber-900">
          Plans aren&apos;t available to buy online just yet. Get in touch and
          we&apos;ll set your team up directly.
        </p>
      </div>
    );
  }

  return (
    <div className={`grid gap-6 ${plans.length === 1 ? "max-w-md mx-auto" : "lg:grid-cols-3"}`}>
      {plans.map((tier) => {
        const info = TIER_INFO[tier];
        const price = TIER_PRICING[tier];
        const isChosen = chosen === tier;
        return (
          <div
            key={tier}
            className={
              "flex flex-col rounded-2xl border-2 bg-white p-6 transition-colors " +
              (isChosen ? "border-zinc-900" : "border-zinc-200")
            }
          >
            <h3 className="text-lg font-semibold text-zinc-900">{info.name}</h3>
            <p className="mt-1 text-sm text-zinc-600">{info.promise}</p>

            <div className="mt-5 border-t border-zinc-100 pt-5">
              <div className="flex items-baseline gap-1">
                <span className="text-4xl font-bold text-zinc-900">
                  ${price.monthly}
                </span>
                <span className="text-zinc-500">/month</span>
              </div>
              <p className="mt-1 text-sm text-zinc-500">
                Includes your first closer, then ${price.extraSeat}/month for
                each additional closer
              </p>
            </div>

            <ul className="mt-5 flex-1 space-y-3">
              {info.includes.map((f) => (
                <li key={f} className="flex items-start gap-2.5">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-green-500" />
                  <span className="text-[13px] leading-relaxed text-zinc-700">
                    {f}
                  </span>
                </li>
              ))}
            </ul>

            <button
              onClick={() => {
                setChosen(tier);
                onChoose(tier);
              }}
              disabled={isLoading}
              className={
                "mt-6 flex items-center justify-center gap-2 rounded-lg px-5 py-3 text-sm font-semibold transition-colors disabled:opacity-60 " +
                (tier === "oversight"
                  ? "bg-zinc-900 text-white hover:bg-zinc-800"
                  : "border border-zinc-300 text-zinc-900 hover:bg-zinc-50")
              }
            >
              {isLoading && isChosen ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Starting…
                </>
              ) : (
                `Start with ${info.name}`
              )}
            </button>
          </div>
        );
      })}
    </div>
  );
}
