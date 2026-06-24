"use client";

import { useQuery } from "convex/react";
import { useUser } from "@clerk/nextjs";
import { api } from "../../../convex/_generated/api";
import { TeamCard } from "./_components/TeamCard";
import { Loader2 } from "lucide-react";

export default function FounderTeamsPage() {
  const { user } = useUser();
  const clerkId = user?.id ?? "";
  const teams = useQuery(
    api.founderAdmin.listAllTeams,
    clerkId ? { clerkId } : "skip",
  );

  if (teams === undefined) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-baseline gap-3">
        <h2 className="text-xl font-semibold">Teams</h2>
        <span className="text-sm text-muted-foreground">
          {teams.length} total · sorted by last call
        </span>
      </div>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {teams.map((team) => (
          <TeamCard key={team._id} team={team} />
        ))}
      </div>
    </div>
  );
}
