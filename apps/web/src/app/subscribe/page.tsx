"use client";

import { useState, Suspense, useEffect } from "react";
import { PlanChooser } from "./PlanChooser";
import { parseTier, type Tier } from "@/lib/tiers";
import { useUser, UserButton, useClerk } from "@clerk/nextjs";
import { useSearchParams, useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Check, Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import { Logo } from "@/components/ui/logo";
import { useTeam } from "@/hooks/useTeam";
import { trackMetaEvent } from "@/lib/meta-pixel";

function SubscribeContent() {
  const { user, isLoaded: isUserLoaded } = useUser();
  const { openSignUp } = useClerk();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isLoading, setIsLoading] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const wasCanceled = searchParams.get("canceled") === "true";
  const wasSuccess = searchParams.get("success") === "true";
  // A tier chosen before signing up, carried across the modal so they land
  // back here and go straight to checkout instead of picking twice.
  const pendingTier = searchParams.get("tier");

  // This hook ensures the user and team exist in Convex
  const { team, isReady: isTeamReady } = useTeam();

  // We made this team for whoever signed in, because we didn't recognise them
  // — nobody chose to start a company here. Someone in that state is usually a
  // colleague of an existing customer who signed in with the wrong address,
  // and showing them pricing alone reads as "your company's account has
  // lapsed". That misread cost an hour of live debugging on 2026-08-12.
  const looksLikeAWrongTurn =
    (team as { selfServeCreated?: boolean } | null | undefined)
      ?.selfServeCreated === true;

  // Pricing is public. /api/polar/available-tiers is readable signed out, and
  // choosing a plan opens Clerk's sign-up modal and returns here with ?tier=
  // so the choice survives. The old signed-out branch was removed when nothing
  // could be bought; it exists again because now something can.

  // Query billing status to check if subscription is active
  const billing = useQuery(
    api.billing.getTeamBilling,
    user?.id ? { clerkId: user.id } : "skip"
  );

  // Anyone whose subscription is live belongs in the dashboard, however they
  // got here. This used to require ?success=true, which meant a comped team —
  // active, but with no checkout behind them — was stranded on the pricing
  // page reading "plans aren't available", with no way forward.
  useEffect(() => {
    if (!billing) return;
    const isActive =
      billing.subscriptionStatus === "active" ||
      billing.subscriptionStatus === "trialing";
    if (isActive) router.push("/dashboard");
  }, [billing, router]);

  // Fire Meta Purchase event once when the Stripe success redirect lands
  // here. B2B is the call-funnel side — Purchase fires after a paid
  // contract closes via Stripe. Value gets refined later when we hook
  // the Stripe webhook into CAPI directly for accurate deal sizes.
  useEffect(() => {
    if (wasSuccess) {
      void trackMetaEvent(
        "Purchase",
        { product: "b2b" },
        user?.emailAddresses[0]?.emailAddress
          ? {
              email: user.emailAddresses[0].emailAddress,
              firstName: user.firstName ?? undefined,
              lastName: user.lastName ?? undefined,
            }
          : undefined,
      );
    }
    // We only want this to fire once on success — not refire on user/billing changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wasSuccess]);

  const handleSubscribe = async (tier: Tier) => {
    // Not signed in yet: they picked a plan before they had an account, which
    // is the normal order for a stranger arriving from the pricing page. Send
    // them back here with their choice so it survives the sign-up.
    if (isUserLoaded && !user) {
      openSignUp({
        redirectUrl: `/subscribe?tier=${tier}`,
        signInFallbackRedirectUrl: `/subscribe?tier=${tier}`,
      });
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch("/api/polar/create-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Without this every signup silently bought the top plan — the two
        // cheaper ones existed everywhere except the one page where someone
        // could actually buy them.
        body: JSON.stringify({ tier }),
      });

      const data = await response.json();

      if (data.url) {
        window.location.href = data.url;
      } else {
        console.error("No checkout URL returned:", data.error);
        setCheckoutError(data.error ?? "Couldn't start checkout. Please try again.");
        setIsLoading(false);
      }
    } catch (error) {
      console.error("Error creating checkout session:", error);
      setCheckoutError("Couldn't start checkout. Please try again.");
      setIsLoading(false);
    }
  };

  // They picked a plan, signed up, and came back. Continue where they left
  // off rather than making them choose the same thing twice.
  //
  // Uses parseTier, not normaliseTier: this reads a client-supplied URL
  // parameter, and normaliseTier defaults anything unrecognised to the $650
  // top tier — exactly the bug that once made a bare checkout body silently
  // buy the most expensive plan, recurring through a different input shape.
  // A junk ?tier= value should do nothing, not pick a plan nobody chose.
  //
  // Waits for `billing` to resolve (not just be truthy-checked) rather than
  // reacting to `undefined`, because that's the same async query the
  // redirect-to-dashboard effect above reads. Firing before it resolves
  // would race that effect: a stale `/subscribe?tier=X` reached by the back
  // button or a reused link, on a team that's already subscribed, could open
  // a pointless second checkout before the redirect had a chance to land.
  useEffect(() => {
    if (!pendingTier || !isTeamReady || !user || !billing || isLoading) return;
    const isActive =
      billing.subscriptionStatus === "active" ||
      billing.subscriptionStatus === "trialing";
    if (isActive) return; // The redirect effect above handles this case.

    const tier = parseTier(pendingTier);
    if (!tier) return;
    void handleSubscribe(tier);

    // Drop ?tier= now that it's been acted on, so the back button or a
    // reloaded/bookmarked URL can't replay this checkout.
    const remaining = new URLSearchParams(searchParams.toString());
    remaining.delete("tier");
    const query = remaining.toString();
    router.replace(query ? `/subscribe?${query}` : "/subscribe", { scroll: false });
    // Runs once, when the team is ready after a sign-up round trip.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingTier, isTeamReady, user, billing]);

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="border-b border-zinc-200">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <Logo height={28} />
          {user && (
            <div className="flex items-center gap-3">
              <span className="text-sm text-zinc-500">
                {user.primaryEmailAddress?.emailAddress}
              </span>
              <UserButton afterSignOutUrl="/" />
            </div>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-3xl mx-auto px-6 py-16">
        {/* Success state - waiting for webhook to process */}
        {wasSuccess && (
          <div className="text-center py-16">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100 mb-6">
              <CheckCircle2 className="h-8 w-8 text-green-600" />
            </div>
            <h1 className="text-3xl font-bold text-zinc-900 mb-4">
              Payment Successful!
            </h1>
            <p className="text-lg text-zinc-600 mb-8">
              Setting up your account...
            </p>
            <div className="flex items-center justify-center gap-2 text-zinc-500">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span>Activating your subscription</span>
            </div>
          </div>
        )}

        {/* Canceled banner */}
        {!wasSuccess && wasCanceled && (
          <div className="mb-8 p-4 bg-amber-50 border border-amber-200 rounded-lg flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-amber-500 shrink-0" />
            <p className="text-amber-800 text-sm">
              Checkout was canceled. You can try again whenever you're ready.
            </p>
          </div>
        )}

        {!wasSuccess && (
          <>
            {looksLikeAWrongTurn && (
              <div className="mx-auto mb-10 max-w-xl rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 text-left">
                <p className="text-sm font-semibold text-amber-900">
                  Meant to join a colleague&apos;s team?
                </p>
                <p className="mt-1.5 text-sm leading-relaxed text-amber-900">
                  You&apos;re not part of a team yet. If someone invited you,
                  sign out and sign back in with the exact email address the
                  invite was sent to — including whether it was a Google
                  account. Otherwise ask them to invite you from their Team
                  page.
                </p>
                <p className="mt-2 text-xs leading-relaxed text-amber-800">
                  Subscribing below sets up a brand-new, separate company.
                </p>
              </div>
            )}

            <div className="text-center mb-12">
              <h1 className="text-4xl font-bold text-zinc-900 mb-4">
                Start Your Subscription
              </h1>
              <p className="text-lg text-zinc-600 max-w-xl mx-auto">
                Get full access to Sequ3nce and start improving your sales team's performance today.
              </p>
            </div>

            {checkoutError && (
              <div className="mx-auto mb-6 max-w-xl rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                {checkoutError}
              </div>
            )}

            <PlanChooser
              isLoading={isLoading}
              onChoose={(tier) => void handleSubscribe(tier)}
            />

            <p className="text-center text-sm text-zinc-500 mt-6">
              Cancel anytime. No long-term contracts. Change plan whenever you
              like — nothing you&apos;ve already recorded is ever deleted.
            </p>

            {/* Trust indicators */}
            <div className="mt-12 text-center">
              <p className="text-sm text-zinc-500">
                Secure payment, handled by our payment provider
              </p>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

export default function SubscribePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-white flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-zinc-400" />
      </div>
    }>
      <SubscribeContent />
    </Suspense>
  );
}
