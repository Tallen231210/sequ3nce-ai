"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Header } from "@/components/dashboard/header";
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

const PLATFORM_FEE = 199;
const SEAT_FEE = 99;

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
  const [isCheckoutLoading, setIsCheckoutLoading] = useState(false);
  const [isPortalLoading, setIsPortalLoading] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [showCanceled, setShowCanceled] = useState(false);

  const billing = useQuery(
    api.billing.getTeamBilling,
    clerkId ? { clerkId } : "skip"
  );

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

  const handleSubscribe = async () => {
    setIsCheckoutLoading(true);
    try {
      const response = await fetch("/api/stripe/create-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      const data = await response.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } catch (error) {
      console.error("Error creating checkout:", error);
    } finally {
      setIsCheckoutLoading(false);
    }
  };

  const handleManageSubscription = async () => {
    setIsPortalLoading(true);
    try {
      const response = await fetch("/api/stripe/create-portal", {
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

  const monthlyTotal =
    PLATFORM_FEE + (billing?.seatCount || 0) * SEAT_FEE;

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

            {!hasActiveSubscription && (
              <div className="pt-2">
                <Button
                  onClick={handleSubscribe}
                  disabled={isCheckoutLoading}
                  className="w-full sm:w-auto"
                >
                  {isCheckoutLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading...
                    </>
                  ) : (
                    "Subscribe Now"
                  )}
                </Button>
              </div>
            )}

            {hasActiveSubscription && (
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
            <div className="flex items-center justify-between py-2 border-b">
              <div>
                <p className="font-medium">Platform Fee</p>
                <p className="text-sm text-muted-foreground">
                  Access to Seq3nce dashboard
                </p>
              </div>
              <span className="font-medium">${PLATFORM_FEE}/mo</span>
            </div>

            <div className="flex items-center justify-between py-2 border-b">
              <div className="flex items-center gap-3">
                <Users className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="font-medium">Closer Seats</p>
                  <p className="text-sm text-muted-foreground">
                    {hasActiveSubscription
                      ? `${billing?.seatCount || 0} paid seats (${billing?.activeCloserCount || 0} closers)`
                      : "Billed automatically when you add closers"}
                  </p>
                </div>
              </div>
              <span className="font-medium">
                ${SEAT_FEE}/seat/mo
              </span>
            </div>

            {hasActiveSubscription && (
              <div className="flex items-center justify-between pt-2">
                <span className="font-semibold">Monthly Total</span>
                <span className="font-semibold text-lg">${monthlyTotal}/mo</span>
              </div>
            )}

            {!hasActiveSubscription && (
              <div className="flex items-center justify-between pt-2 text-muted-foreground">
                <span>Starting at</span>
                <span>${PLATFORM_FEE}/mo</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Seat Warning */}
        {hasActiveSubscription &&
          billing?.activeCloserCount !== undefined &&
          billing?.seatCount !== undefined &&
          billing.activeCloserCount > billing.seatCount && (
            <Card className="border-yellow-200 bg-yellow-50">
              <CardContent className="py-4">
                <div className="flex items-start gap-3">
                  <AlertCircle className="h-5 w-5 text-yellow-600 mt-0.5" />
                  <div>
                    <p className="font-medium text-yellow-900">
                      You have more closers than paid seats
                    </p>
                    <p className="text-sm text-yellow-700 mt-1">
                      You have {billing.activeCloserCount} closers but only{" "}
                      {billing.seatCount} paid seats. Please add more seats to
                      your subscription.
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-3"
                      onClick={handleManageSubscription}
                      disabled={isPortalLoading}
                    >
                      Update Seats
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
      </div>
    </>
  );
}
