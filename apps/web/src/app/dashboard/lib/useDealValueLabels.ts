"use client";

import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { useTeam } from "@/hooks/useTeam";

/**
 * What this team calls the contract-value field. Defaults until the query
 * resolves, so a label never flashes blank.
 */
export function useDealValueLabels(): { long: string; short: string } {
  const { clerkId } = useTeam();
  const labels = useQuery(api.teams.getDealValueLabels, clerkId ? { clerkId } : "skip");
  return labels ?? { long: "Contract value", short: "Contract" };
}
