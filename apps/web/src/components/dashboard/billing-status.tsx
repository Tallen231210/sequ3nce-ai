"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useTeam } from "@/hooks/useTeam";
import { AlertCircle } from "lucide-react";

export function BillingStatus() {
  const { clerkId, isLoading } = useTeam();

  const billing = useQuery(
    api.billing.getTeamBilling,
    clerkId ? { clerkId } : "skip"
  );

  // Don't show anything while loading
  if (isLoading || billing === undefined) {
    return null;
  }

  // Check for billing issues
  const hasBillingIssue =
    billing?.subscriptionStatus === "past_due" ||
    billing?.subscriptionStatus === "unpaid";

  // No issues, don't render anything
  if (!hasBillingIssue) {
    return null;
  }

  return (
    <Link
      href="/dashboard/billing"
      className="mx-3 mb-2 flex items-center gap-2 rounded-md bg-yellow-50 px-3 py-2 text-sm text-yellow-800 hover:bg-yellow-100 transition-colors"
    >
      <AlertCircle className="h-4 w-4 text-yellow-600" />
      <span className="font-medium">Payment issue</span>
    </Link>
  );
}
