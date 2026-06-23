"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useTeam } from "@/hooks/useTeam";
import { Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Persistent top banner shown on every /dashboard/* route until the
 * manager either books their onboarding call OR explicitly dismisses
 * it. Modeled on ReinforcementAlert positioning (fixed top, left-64
 * right-0) but with a friendly blue tone since this is a nudge, not
 * an alert.
 *
 * Hides automatically when:
 *  - they've booked the call (onboardingBookedCallAt set)
 *  - they've dismissed the banner (onboardingBannerDismissedAt set)
 *  - onboarding is fully complete (onboardingCompletedAt set)
 *  - no booking URL is configured (graceful degradation pre-env-var)
 */
export function OnboardingBanner() {
  const { clerkId, isReady } = useTeam();
  const state = useQuery(
    api.onboarding.getOnboardingState,
    isReady && clerkId ? { clerkId } : "skip",
  );
  const markCallBooked = useMutation(api.onboarding.markCallBooked);
  const dismissBanner = useMutation(api.onboarding.dismissBanner);

  if (!state) return null;
  if (!state.bookingUrl) return null;
  if (state.bookedCall || state.bannerDismissed || state.completed) {
    return null;
  }

  async function handleBooked() {
    if (!clerkId) return;
    await markCallBooked({ clerkId });
  }

  async function handleDismiss() {
    if (!clerkId) return;
    await dismissBanner({ clerkId });
  }

  return (
    <div className="fixed top-0 left-64 right-0 z-40 bg-gradient-to-r from-indigo-600 to-blue-600 text-white shadow-lg">
      <div className="px-6 py-3 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <Sparkles className="h-5 w-5 shrink-0" />
          <div className="text-sm min-w-0">
            <span className="font-semibold">Welcome to Sequ3nce.</span>{" "}
            <span className="text-white/90">
              Book your 30-min onboarding call so we can get your team running.
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="secondary"
            size="sm"
            asChild
            className="bg-white text-indigo-700 hover:bg-white/90"
          >
            <a
              href={state.bookingUrl}
              target="_blank"
              rel="noreferrer"
              onClick={() => {
                // Optimistically mark as booked when they click through.
                // We can't detect the actual booking without a calendar-provider
                // webhook (deferred), so this is best-effort; they can
                // always re-book via the checklist page.
                void handleBooked();
              }}
            >
              Schedule call
            </a>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleBooked}
            className="text-white/90 hover:bg-white/10 hover:text-white"
          >
            I already booked
          </Button>
          <button
            onClick={handleDismiss}
            className="p-1.5 rounded-md text-white/80 hover:bg-white/10 hover:text-white transition-colors"
            aria-label="Dismiss"
            title="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
