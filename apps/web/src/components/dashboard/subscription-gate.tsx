"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Loader2 } from "lucide-react";

interface SubscriptionGateProps {
  children: React.ReactNode;
}

export function SubscriptionGate({ children }: SubscriptionGateProps) {
  const router = useRouter();
  const { user, isLoaded: isUserLoaded } = useUser();

  const billing = useQuery(
    api.billing.getTeamBilling,
    user?.id ? { clerkId: user.id } : "skip"
  );

  useEffect(() => {
    // Wait for user and billing data to load
    if (!isUserLoaded || billing === undefined) return;

    // If no billing data or subscription not active, redirect to subscribe
    if (billing === null) {
      // User doesn't have a team yet - this shouldn't happen normally
      // but redirect to subscribe just in case
      router.push("/subscribe");
      return;
    }

    // Check subscription status
    const isActive =
      billing.subscriptionStatus === "active" ||
      billing.subscriptionStatus === "trialing";

    if (!isActive) {
      router.push("/subscribe");
    }
  }, [isUserLoaded, billing, router]);

  // Still loading user
  if (!isUserLoaded) {
    return <LoadingScreen />;
  }

  // Still loading billing data
  if (billing === undefined) {
    return <LoadingScreen />;
  }

  // Check if subscription is active
  const isActive =
    billing?.subscriptionStatus === "active" ||
    billing?.subscriptionStatus === "trialing";

  // Not active - will redirect, show loading in meantime
  if (!isActive) {
    return <LoadingScreen />;
  }

  // Subscription is active, show children
  return <>{children}</>;
}

function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-4">
        <Loader2 className="h-8 w-8 animate-spin text-zinc-400" />
        <p className="text-zinc-500 text-sm">Loading...</p>
      </div>
    </div>
  );
}
