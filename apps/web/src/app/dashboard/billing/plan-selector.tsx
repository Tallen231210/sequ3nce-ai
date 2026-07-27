"use client";

// ============================================================================
// Choosing a plan.
//
// Two things this must never do: surprise someone with a charge, or let them
// discover after the fact that something stopped working. A downgrade names
// exactly what they lose before anything happens, and says plainly that their
// existing recordings stay — because "will I lose my calls?" is the question
// anyone considering a downgrade actually has, and leaving it unanswered is
// what turns a downgrade into a cancellation.
// ============================================================================

import { useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  TIER_INFO,
  TIER_ORDER,
  isDowngrade,
  featuresLostMovingTo,
  normaliseTier,
  type Tier,
} from "@/lib/tiers";

export function PlanSelector({
  currentTier,
  isLegacyPricing,
  availableTiers,
  onChanged,
}: {
  currentTier: string | undefined;
  /** Tiers with prices configured. Anything else can't be bought yet. */
  availableTiers: Tier[];
  /** On a price that predates tiers — changing plan gives that rate up. */
  isLegacyPricing?: boolean;
  onChanged: () => void;
}) {
  const current = normaliseTier(currentTier);
  // Never offer a plan we can't actually sell. A tier whose prices aren't
  // configured yet would take the click, fail at the API, and read as broken —
  // their own plan always shows so the card can't disappear underneath them.
  const sellable = TIER_ORDER.filter(
    (t) => availableTiers.includes(t) || t === current,
  );
  const [pending, setPending] = useState<Tier | null>(null);
  const [confirming, setConfirming] = useState<Tier | null>(null);
  const [error, setError] = useState<string | null>(null);

  const change = async (tier: Tier) => {
    setPending(tier);
    setConfirming(null);
    setError(null);
    try {
      const res = await fetch("/api/stripe/change-tier", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error ?? "Couldn't change your plan.");
        return;
      }
      onChanged();
    } catch {
      setError("Couldn't reach the server. Nothing has been charged.");
    } finally {
      setPending(null);
    }
  };

  const start = (tier: Tier) => {
    setError(null);
    // Downgrades stop for a confirmation. Upgrades don't — someone clicking
    // "upgrade" has already decided, and an extra dialog reads as friction on
    // the one action we want to be effortless.
    if (isDowngrade(current, tier)) setConfirming(tier);
    else void change(tier);
  };

  return (
    <div className="space-y-4">
      {isLegacyPricing && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-[13px] text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-200">
          You&apos;re on original pricing from before we had plans. Changing
          plan moves you onto current rates and that can&apos;t be undone —
          worth talking to us first if you&apos;re not sure.
        </p>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        {sellable.map((tier) => {
          const info = TIER_INFO[tier];
          const isCurrent = tier === current;
          const down = isDowngrade(current, tier);
          return (
            <div
              key={tier}
              className={
                "flex flex-col rounded-lg border p-4 " +
                (isCurrent ? "border-foreground" : "border-border")
              }
            >
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="font-semibold">{info.name}</h3>
                {isCurrent && (
                  <span className="rounded-full bg-foreground px-2 py-0.5 text-[11px] font-medium text-background">
                    Current
                  </span>
                )}
              </div>
              <p className="mt-1 text-[13px] text-muted-foreground">
                {info.tagline}
              </p>

              <ul className="mt-3 flex-1 space-y-1.5">
                {info.includes.map((line) => (
                  <li key={line} className="flex gap-2 text-[13px]">
                    <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span>{line}</span>
                  </li>
                ))}
              </ul>

              <Button
                className="mt-4"
                variant={isCurrent ? "outline" : down ? "outline" : "default"}
                disabled={isCurrent || pending !== null}
                onClick={() => start(tier)}
              >
                {pending === tier ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : isCurrent ? (
                  "Your plan"
                ) : down ? (
                  "Switch down"
                ) : (
                  "Upgrade"
                )}
              </Button>
            </div>
          );
        })}
      </div>

      {error && <p className="text-[13px] text-red-600">{error}</p>}

      {confirming && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-background p-5 shadow-2xl">
            <h3 className="text-base font-semibold">
              Switch to {TIER_INFO[confirming].name}?
            </h3>
            <p className="mt-2 text-[13px] text-muted-foreground">
              Here&apos;s what changes:
            </p>
            <ul className="mt-2 space-y-1.5">
              {featuresLostMovingTo(current, confirming).map((line) => (
                <li key={line} className="text-[13px]">
                  • {line}
                </li>
              ))}
            </ul>
            {/* The question everyone actually has. */}
            <p className="mt-3 rounded-lg bg-muted p-2.5 text-[12.5px]">
              Your existing calls, recordings and transcripts all stay exactly
              where they are. You keep everything you&apos;ve already recorded —
              you just won&apos;t make new ones this way.
            </p>
            <p className="mt-3 text-[12.5px] text-muted-foreground">
              Your next invoice will be adjusted for the unused part of this
              month.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setConfirming(null)}>
                Cancel
              </Button>
              <Button onClick={() => void change(confirming)}>
                Switch plan
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
