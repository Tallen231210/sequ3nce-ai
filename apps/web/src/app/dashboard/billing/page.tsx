"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Header } from "@/components/dashboard/header";
import { PlanSelector } from "./plan-selector";
import { TIER_INFO, normaliseTier, type Tier } from "@/lib/tiers";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useTeam } from "@/hooks/useTeam";
import {
  CreditCard,
  Loader2,
  CheckCircle,
  AlertCircle,
  Users,
  Calendar,
  ExternalLink,
} from "lucide-react";

// The old constants ($199 / $99) are gone deliberately. They were testing-account
// prices shown to every customer regardless of what they actually paid, so a
// team on $500 plus three seats at $150 saw $496 against a real $950 invoice.
// Prices now come from Polar, which is the only place that knows — and has to,
// because customers are grandfathered onto whatever rate they signed at.
interface SubscriptionSummary {
  tier: string;
  hasSubscription: boolean;
  status?: string;
  currency: string;
  seats: number;
  monthlyTotalCents: number | null;
  cancelAtPeriodEnd?: boolean;
  currentPeriodEnd?: string | null;
  availableTiers?: string[];
}

function money(cents: number, currency = "usd"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
    maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
}

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function getStatusBadge(status: string | undefined) {
  switch (status) {
    case "active":
      return <Badge variant="default">Active</Badge>;
    case "trialing":
      return <Badge variant="outline">Trialing</Badge>;
    case "past_due":
      return <Badge variant="destructive">Past Due</Badge>;
    case "canceled":
      return <Badge variant="secondary">Canceled</Badge>;
    case "unpaid":
      return <Badge variant="destructive">Unpaid</Badge>;
    default:
      return <Badge variant="outline">No Subscription</Badge>;
  }
}

// Wrapper component to handle Suspense for useSearchParams
export default function BillingPage() {
  return (
    <Suspense fallback={
      <>
        <Header title="Billing" description="Manage your subscription and billing" />
        <div className="p-6 flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </>
    }>
      <BillingPageContent />
    </Suspense>
  );
}

function BillingPageContent() {
  const { clerkId, isLoading: isTeamLoading } = useTeam();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [isPortalLoading, setIsPortalLoading] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [showCanceled, setShowCanceled] = useState(false);

  const billing = useQuery(
    api.billing.getTeamBilling,
    clerkId ? { clerkId } : "skip"
  );

  // The real numbers, from Stripe. Fetched rather than derived so a
  // grandfathered price is shown as what it is instead of as today's rate.
  const [summary, setSummary] = useState<SubscriptionSummary | null>(null);
  // Distinct from "still loading" (summary === null, summaryError === false):
  // a failed fetch used to leave the page reading "Loading your current
  // pricing…" forever, with no way to tell a hung request from a broken one.
  const [summaryError, setSummaryError] = useState(false);
  const loadSummary = useCallback(async () => {
    try {
      const res = await fetch("/api/polar/subscription-summary");
      if (!res.ok) {
        setSummaryError(true);
        return;
      }
      setSummary((await res.json()) as SubscriptionSummary);
      setSummaryError(false);
    } catch {
      setSummaryError(true);
    }
  }, []);
  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  // Handle success/canceled URL params and clear them
  useEffect(() => {
    const success = searchParams.get("success");
    const canceled = searchParams.get("canceled");

    if (success === "true" || canceled === "true") {
      if (success === "true") {
        setShowSuccess(true);
        setTimeout(() => setShowSuccess(false), 5000);
      }
      if (canceled === "true") {
        setShowCanceled(true);
        setTimeout(() => setShowCanceled(false), 5000);
      }
      // Clear URL params to prevent showing on refresh
      router.replace("/dashboard/billing", { scroll: false });
    }
  }, [searchParams, router]);

  const handleManageSubscription = async () => {
    setIsPortalLoading(true);
    try {
      const response = await fetch("/api/polar/create-portal", {
        method: "POST",
      });

      const data = await response.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } catch (error) {
      console.error("Error creating portal:", error);
    } finally {
      setIsPortalLoading(false);
    }
  };

  // Loading state
  if (isTeamLoading || billing === undefined) {
    return (
      <>
        <Header title="Billing" description="Manage your subscription and billing" />
        <div className="p-6 flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </>
    );
  }

  const hasActiveSubscription =
    billing?.subscriptionStatus === "active" ||
    billing?.subscriptionStatus === "trialing";

  const currency = summary?.currency ?? "usd";

  return (
    <>
      <Header title="Billing" description="Manage your subscription and billing" />
      <div className="p-6 space-y-6">
        {/* Success/Canceled Messages */}
        {showSuccess && (
          <Card className="border-green-200 bg-green-50">
            <CardContent className="py-4">
              <div className="flex items-center gap-3">
                <CheckCircle className="h-5 w-5 text-green-600" />
                <div>
                  <p className="font-medium text-green-900">
                    Subscription activated!
                  </p>
                  <p className="text-sm text-green-700">
                    Your team now has access to all features.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {showCanceled && (
          <Card className="border-yellow-200 bg-yellow-50">
            <CardContent className="py-4">
              <div className="flex items-center gap-3">
                <AlertCircle className="h-5 w-5 text-yellow-600" />
                <div>
                  <p className="font-medium text-yellow-900">
                    Checkout canceled
                  </p>
                  <p className="text-sm text-yellow-700">
                    No charges were made. You can subscribe anytime.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Subscription Status */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <CreditCard className="h-4 w-4" strokeWidth={1.5} />
              Subscription
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Status</span>
              {getStatusBadge(billing?.subscriptionStatus)}
            </div>

            {hasActiveSubscription && billing?.currentPeriodEnd && (
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  Next billing date
                </span>
                <span className="font-medium">
                  {formatDate(billing.currentPeriodEnd)}
                </span>
              </div>
            )}

            {/* /api/polar/create-checkout requires an explicit tier — an
                empty body 400s rather than defaulting to a plan, which is
                deliberate (an empty body silently buying the most expensive
                plan was the exact Stripe-era bug). There's no tier chosen at
                this point in the page, so this sends them to the page built
                for choosing one instead of guessing, and that page already
                carries its own checkout-error handling. */}
            {!hasActiveSubscription && (
              <div className="pt-2">
                <Button asChild className="w-full sm:w-auto">
                  <Link href="/subscribe">Choose a Plan</Link>
                </Button>
              </div>
            )}

            {/* A team with no customer at either processor has nothing to
                manage — comped accounts, and anyone mid-migration between
                processors. The portal route 400s for them, and because the
                click handler only follows a returned URL, the button would
                sit there doing literally nothing. Say why instead. */}
            {hasActiveSubscription &&
              !billing?.stripeCustomerId &&
              !billing?.polarCustomerId && (
                <p className="pt-2 text-sm text-muted-foreground">
                  No payment method on file — your account is active and there
                  is nothing to pay right now.
                </p>
              )}

            {hasActiveSubscription &&
              (billing?.stripeCustomerId || billing?.polarCustomerId) && (
                <div className="pt-2">
                  <Button
                    variant="outline"
                    onClick={handleManageSubscription}
                    disabled={isPortalLoading}
                  >
                    {isPortalLoading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Loading...
                      </>
                    ) : (
                      <>
                        Manage Subscription
                        <ExternalLink className="h-4 w-4 ml-2" />
                      </>
                    )}
                  </Button>
                </div>
              )}
          </CardContent>
        </Card>

        {/* Pricing Breakdown */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">
              {hasActiveSubscription ? "Current Plan" : "Pricing"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {summary?.hasSubscription ? (
              <div className="space-y-3">
                <div className="flex items-baseline justify-between">
                  <span className="text-sm text-muted-foreground">
                    {TIER_INFO[normaliseTier(summary.tier)].name}, including
                    your first closer
                  </span>
                </div>
                <div className="flex items-baseline justify-between">
                  <span className="text-sm text-muted-foreground">
                    {/* Polar's seat count, when present, is what the team is
                        actually billed for. But a paying team should never be
                        told "0 closers" on the strength of a field Polar
                        happened to omit — that reads as a billing error, not
                        a quirk of the API response. Fall back to the closer
                        count we already track ourselves rather than assert a
                        number that might be false. */}
                    {summary.seats > 0
                      ? `${summary.seats} paid ${summary.seats === 1 ? "seat" : "seats"}`
                      : `${billing?.activeCloserCount ?? 0} active ${(billing?.activeCloserCount ?? 0) === 1 ? "closer" : "closers"}`}
                  </span>
                </div>
                <div className="flex items-center justify-between border-t pt-2">
                  <span className="font-semibold">Monthly Total</span>
                  <span className="text-lg font-semibold">
                    {money(summary.monthlyTotalCents ?? 0, currency)}/mo
                  </span>
                </div>
              </div>
            ) : summary && !summary.hasSubscription ? (
              <p className="py-2 text-sm text-muted-foreground">
                No active subscription. Pick a plan below to get started.
              </p>
            ) : summaryError ? (
              <p className="py-2 text-sm text-red-600">
                Couldn&apos;t load your current pricing.{" "}
                <button
                  type="button"
                  onClick={() => void loadSummary()}
                  className="underline underline-offset-2"
                >
                  Try again
                </button>
                .
              </p>
            ) : (
              <p className="py-2 text-sm text-muted-foreground">
                Loading your current pricing…
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Plans</CardTitle>
          </CardHeader>
          <CardContent>
            <PlanSelector
              currentTier={summary?.tier ?? billing?.productTier}
              availableTiers={(summary?.availableTiers ?? []) as Tier[]}
              onChanged={() => {
                // Polar's webhook writes the new tier, and it lands a moment
                // after the API returns. Re-reading immediately would show the
                // old plan and look like the change failed.
                setTimeout(() => void loadSummary(), 1500);
              }}
            />
          </CardContent>
        </Card>

      </div>
    </>
  );
}
