"use client";

import { useState, Suspense, useEffect } from "react";
import { useUser, SignUpButton } from "@clerk/nextjs";
import { useSearchParams, useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Check, Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import { Logo } from "@/components/ui/logo";
import { useTeam } from "@/hooks/useTeam";

function SubscribeContent() {
  const { user, isLoaded: isUserLoaded } = useUser();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isLoading, setIsLoading] = useState(false);
  const wasCanceled = searchParams.get("canceled") === "true";
  const wasSuccess = searchParams.get("success") === "true";

  // This hook ensures the user and team exist in Convex
  const { isReady: isTeamReady } = useTeam();

  // Check if user is logged out
  const isLoggedOut = isUserLoaded && !user;

  // Query billing status to check if subscription is active
  const billing = useQuery(
    api.billing.getTeamBilling,
    user?.id ? { clerkId: user.id } : "skip"
  );

  // Auto-redirect to dashboard once subscription becomes active after successful checkout
  useEffect(() => {
    if (wasSuccess && billing) {
      const isActive =
        billing.subscriptionStatus === "active" ||
        billing.subscriptionStatus === "trialing";
      if (isActive) {
        router.push("/dashboard");
      }
    }
  }, [wasSuccess, billing, router]);

  const handleSubscribe = async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/stripe/create-checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });

      const data = await response.json();

      if (data.url) {
        window.location.href = data.url;
      } else {
        console.error("No checkout URL returned");
        setIsLoading(false);
      }
    } catch (error) {
      console.error("Error creating checkout session:", error);
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="border-b border-zinc-200">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <Logo height={28} />
          {user && (
            <div className="text-sm text-zinc-500">
              {user.primaryEmailAddress?.emailAddress}
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
            <div className="text-center mb-12">
              <h1 className="text-4xl font-bold text-zinc-900 mb-4">
                Start Your Subscription
              </h1>
              <p className="text-lg text-zinc-600 max-w-xl mx-auto">
                Get full access to Sequ3nce and start improving your sales team's performance today.
              </p>
            </div>

            {/* Pricing Card */}
            <div className="bg-white border-2 border-zinc-900 rounded-2xl p-8 max-w-md mx-auto">
              <div className="text-center mb-6">
                <div className="text-sm font-medium text-zinc-500 uppercase tracking-wide mb-2">
                  Platform Access
                </div>
                <div className="flex items-baseline justify-center gap-1">
                  <span className="text-5xl font-bold text-zinc-900">$200.49</span>
                  <span className="text-zinc-500">/month</span>
                </div>
                <p className="text-sm text-zinc-500 mt-2">
                  + $99/month per closer seat
                </p>
              </div>

              <div className="border-t border-zinc-200 pt-6 mb-8">
                <ul className="space-y-4">
                  <li className="flex items-start gap-3">
                    <Check className="h-5 w-5 text-green-500 mt-0.5 shrink-0" />
                    <span className="text-zinc-700">Real-time call transcription & analysis</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <Check className="h-5 w-5 text-green-500 mt-0.5 shrink-0" />
                    <span className="text-zinc-700">AI-powered ammo extraction</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <Check className="h-5 w-5 text-green-500 mt-0.5 shrink-0" />
                    <span className="text-zinc-700">Live call monitoring dashboard</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <Check className="h-5 w-5 text-green-500 mt-0.5 shrink-0" />
                    <span className="text-zinc-700">Call recordings & playback</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <Check className="h-5 w-5 text-green-500 mt-0.5 shrink-0" />
                    <span className="text-zinc-700">Team management & analytics</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <Check className="h-5 w-5 text-green-500 mt-0.5 shrink-0" />
                    <span className="text-zinc-700">Playbook highlights for training</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <Check className="h-5 w-5 text-green-500 mt-0.5 shrink-0" />
                    <span className="text-zinc-700">Calendar integrations (Calendly)</span>
                  </li>
                </ul>
              </div>

              {isLoggedOut ? (
                <SignUpButton mode="modal">
                  <button className="w-full bg-zinc-900 text-white py-4 px-6 rounded-xl font-semibold text-lg hover:bg-zinc-800 transition-colors flex items-center justify-center gap-2">
                    Create Account to Subscribe
                  </button>
                </SignUpButton>
              ) : (
                <button
                  onClick={handleSubscribe}
                  disabled={isLoading || !isTeamReady}
                  className="w-full bg-zinc-900 text-white py-4 px-6 rounded-xl font-semibold text-lg hover:bg-zinc-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {!isTeamReady ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin" />
                      Setting up account...
                    </>
                  ) : isLoading ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin" />
                      Redirecting to checkout...
                    </>
                  ) : (
                    "Subscribe Now"
                  )}
                </button>
              )}

              <p className="text-center text-sm text-zinc-500 mt-4">
                Cancel anytime. No long-term contracts.
              </p>
            </div>

            {/* Trust indicators */}
            <div className="mt-12 text-center">
              <p className="text-sm text-zinc-500">
                Secure payment powered by Stripe
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
