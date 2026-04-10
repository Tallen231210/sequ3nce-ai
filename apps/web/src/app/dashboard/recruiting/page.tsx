"use client";

import { useState } from "react";
import { useTeam } from "@/hooks/useTeam";
import { Header } from "@/components/dashboard/header";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { PostingsList } from "./PostingsList";
import { TalentDirectory } from "./TalentDirectory";

type Tab = "postings" | "talent";

export default function RecruitingPage() {
  const { team, clerkId, isLoading: isTeamLoading } = useTeam();
  const [activeTab, setActiveTab] = useState<Tab>("postings");

  if (isTeamLoading || !team) {
    return (
      <>
        <Header title="Recruiting" description="Post jobs and browse talent" />
        <div className="flex items-center justify-center min-h-[300px]">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </>
    );
  }

  return (
    <>
      <Header title="Recruiting" description="Post jobs and browse talent" />

      <div className="p-6">
        {/* Tab toggle */}
        <div className="flex gap-1 bg-zinc-100 dark:bg-zinc-900 border border-transparent dark:border-zinc-700 rounded-lg p-1 w-fit mb-6">
          <Button
            variant={activeTab === "postings" ? "default" : "ghost"}
            size="sm"
            onClick={() => setActiveTab("postings")}
            className={activeTab === "postings" ? "" : "text-zinc-500 dark:text-zinc-400"}
          >
            My Postings
          </Button>
          <Button
            variant={activeTab === "talent" ? "default" : "ghost"}
            size="sm"
            onClick={() => setActiveTab("talent")}
            className={activeTab === "talent" ? "" : "text-zinc-500 dark:text-zinc-400"}
          >
            Talent Directory
          </Button>
        </div>

        {activeTab === "postings" ? (
          <PostingsList teamId={team._id} clerkId={clerkId || ""} />
        ) : (
          <TalentDirectory />
        )}
      </div>
    </>
  );
}
