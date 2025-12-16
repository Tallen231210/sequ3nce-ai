"use client";

import { useState } from "react";
import { useUser } from "@clerk/nextjs";
import { useSearchParams } from "next/navigation";
import { Check, Loader2, AlertCircle } from "lucide-react";

export default function SubscribePage() {
  const { user } = useUser();
  const searchParams = useSearchParams();
  const [isLoading, setIsLoading] = useState(false);
  const wasCanceled = searchParams.get("canceled") === "true";

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
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-black rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">S3</span>
            </div>
            <span className="font-semibold text-lg">Sequ3nce</span>
          </div>
          {user && (
            <div className="text-sm text-zinc-500">
              {user.primaryEmailAddress?.emailAddress}
            </div>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-3xl mx-auto px-6 py-16">
        {/* Canceled banner */}
        {wasCanceled && (
          <div className="mb-8 p-4 bg-amber-50 border border-amber-200 rounded-lg flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-amber-500 shrink-0" />
            <p className="text-amber-800 text-sm">
              Checkout was canceled. You can try again whenever you're ready.
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

        {/* Pricing Card */}
        <div className="bg-white border-2 border-zinc-900 rounded-2xl p-8 max-w-md mx-auto">
          <div className="text-center mb-6">
            <div className="text-sm font-medium text-zinc-500 uppercase tracking-wide mb-2">
              Platform Access
            </div>
            <div className="flex items-baseline justify-center gap-1">
              <span className="text-5xl font-bold text-zinc-900">$199</span>
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

          <button
            onClick={handleSubscribe}
            disabled={isLoading}
            className="w-full bg-zinc-900 text-white py-4 px-6 rounded-xl font-semibold text-lg hover:bg-zinc-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                Redirecting to checkout...
              </>
            ) : (
              "Subscribe Now"
            )}
          </button>

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
      </main>
    </div>
  );
}
