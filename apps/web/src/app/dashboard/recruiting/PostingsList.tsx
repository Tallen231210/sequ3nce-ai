"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Id } from "../../../../convex/_generated/dataModel";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Users, Loader2, Briefcase } from "lucide-react";
import { JobPostingDialog } from "./JobPostingDialog";
import { PostingDetailDialog } from "./PostingDetailDialog";

interface PostingsListProps {
  teamId: Id<"teams">;
  clerkId: string;
}

type FilterStatus = "all" | "open" | "closed";

export function PostingsList({ teamId, clerkId }: PostingsListProps) {
  const [filter, setFilter] = useState<FilterStatus>("all");
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editPosting, setEditPosting] = useState<any>(null);
  const [detailPosting, setDetailPosting] = useState<any>(null);

  const postings = useQuery(api.b2cJobBoard.listTeamPostings, { teamId });

  if (postings === undefined) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const filtered = filter === "all"
    ? postings
    : postings.filter((p) => p.status === filter);

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="flex gap-1 bg-zinc-100 dark:bg-zinc-900 border border-transparent dark:border-zinc-700 rounded-md p-0.5">
            {(["all", "open", "closed"] as FilterStatus[]).map((s) => (
              <button
                key={s}
                onClick={() => setFilter(s)}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                  filter === s
                    ? "bg-white dark:bg-zinc-700 text-foreground shadow-sm"
                    : "text-zinc-500 dark:text-zinc-400 hover:text-foreground"
                }`}
              >
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
          <span className="text-sm text-zinc-500 ml-2">
            {filtered.length} posting{filtered.length !== 1 ? "s" : ""}
          </span>
        </div>
        <Button onClick={() => setShowCreateDialog(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Post a Job
        </Button>
      </div>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-16">
            <div className="flex flex-col items-center justify-center text-center">
              <Briefcase className="h-12 w-12 text-zinc-400 mb-4" />
              <h3 className="text-lg font-medium mb-2">
                {postings.length === 0
                  ? "No job postings yet"
                  : "No matching postings"}
              </h3>
              <p className="text-zinc-500 text-sm max-w-sm mb-4">
                {postings.length === 0
                  ? "Create your first job posting to start attracting closers."
                  : "Try changing the filter to see other postings."}
              </p>
              {postings.length === 0 && (
                <Button onClick={() => setShowCreateDialog(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Post a Job
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((posting) => (
            <Card
              key={posting._id}
              className="cursor-pointer hover:border-zinc-300 dark:hover:border-zinc-600 transition-colors"
              onClick={() => setDetailPosting(posting)}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-medium text-foreground truncate">
                        {posting.title}
                      </h3>
                      <Badge
                        variant={posting.status === "open" ? "default" : "secondary"}
                        className={
                          posting.status === "open"
                            ? "bg-green-500/10 text-green-600 border-green-500/30"
                            : ""
                        }
                      >
                        {posting.status === "open" ? "Open" : "Closed"}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3 text-sm text-zinc-500">
                      {posting.industry && (
                        <span>{posting.industry}</span>
                      )}
                      {posting.ticketRange && (
                        <span>{posting.ticketRange}</span>
                      )}
                      {posting.ote && <span>{posting.ote}</span>}
                      <span>
                        {new Date(posting.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 text-sm text-zinc-500 ml-4">
                    <Users className="h-4 w-4" />
                    <span>{posting.interestCount}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <JobPostingDialog
        open={showCreateDialog || !!editPosting}
        onOpenChange={(open) => {
          if (!open) {
            setShowCreateDialog(false);
            setEditPosting(null);
          }
        }}
        teamId={teamId}
        clerkId={clerkId}
        editPosting={editPosting}
      />

      <PostingDetailDialog
        open={!!detailPosting}
        onOpenChange={(open) => !open && setDetailPosting(null)}
        posting={detailPosting}
        teamId={teamId}
        onEdit={(posting) => {
          setDetailPosting(null);
          setEditPosting(posting);
        }}
      />
    </>
  );
}
