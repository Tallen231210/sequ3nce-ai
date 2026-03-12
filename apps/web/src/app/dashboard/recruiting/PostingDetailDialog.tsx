"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Id } from "../../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ExternalLink,
  Pencil,
  XCircle,
  RotateCcw,
  Users,
  Mail,
  Link2,
  CheckCircle2,
} from "lucide-react";

interface PostingDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  posting: any;
  teamId: Id<"teams">;
  onEdit: (posting: any) => void;
}

export function PostingDetailDialog({
  open,
  onOpenChange,
  posting,
  teamId,
  onEdit,
}: PostingDetailDialogProps) {
  const closePosting = useMutation(api.b2cJobBoard.closeJobPosting);
  const reopenPosting = useMutation(api.b2cJobBoard.reopenJobPosting);

  const interestedClosers = useQuery(
    api.b2cJobBoard.getInterestedClosers,
    posting ? { postingId: posting._id, teamId } : "skip"
  );

  if (!posting) return null;

  const handleClose = async () => {
    await closePosting({ postingId: posting._id, teamId });
    onOpenChange(false);
  };

  const handleReopen = async () => {
    await reopenPosting({ postingId: posting._id, teamId });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <DialogTitle className="flex-1">{posting.title}</DialogTitle>
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
        </DialogHeader>

        {/* Posting details */}
        <div className="space-y-4">
          <div className="flex flex-wrap gap-3 text-sm text-zinc-500">
            {posting.industry && <span>{posting.industry}</span>}
            {posting.ticketRange && <span>{posting.ticketRange}</span>}
            {posting.ote && <span>{posting.ote}</span>}
            <span>Posted {new Date(posting.createdAt).toLocaleDateString()}</span>
          </div>

          <div className="text-sm text-foreground whitespace-pre-line">
            {posting.description}
          </div>

          {posting.requiredSkills && posting.requiredSkills.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">
                Required Skills
              </h4>
              <div className="flex flex-wrap gap-1.5">
                {posting.requiredSkills.map((skill: string) => (
                  <Badge key={skill} variant="outline" className="text-xs">
                    {skill}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {(posting.contactEmail || posting.contactUrl) && (
            <div className="flex items-center gap-4 text-sm">
              {posting.contactEmail && (
                <div className="flex items-center gap-1.5 text-zinc-500">
                  <Mail className="h-3.5 w-3.5" />
                  {posting.contactEmail}
                </div>
              )}
              {posting.contactUrl && (
                <a
                  href={posting.contactUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-blue-600 hover:underline"
                >
                  <Link2 className="h-3.5 w-3.5" />
                  Contact Link
                </a>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2 pt-2 border-t">
            <Button variant="outline" size="sm" onClick={() => onEdit(posting)}>
              <Pencil className="h-3.5 w-3.5 mr-1.5" />
              Edit
            </Button>
            {posting.status === "open" ? (
              <Button variant="outline" size="sm" onClick={handleClose}>
                <XCircle className="h-3.5 w-3.5 mr-1.5" />
                Close Posting
              </Button>
            ) : (
              <Button variant="outline" size="sm" onClick={handleReopen}>
                <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                Reopen
              </Button>
            )}
          </div>

          {/* Interested Closers */}
          <div className="pt-4 border-t">
            <h4 className="flex items-center gap-2 text-sm font-semibold mb-3">
              <Users className="h-4 w-4" />
              Interested Closers ({interestedClosers?.length || 0})
            </h4>

            {!interestedClosers || interestedClosers.length === 0 ? (
              <p className="text-sm text-zinc-500">
                No closers have expressed interest yet.
              </p>
            ) : (
              <div className="space-y-2">
                {interestedClosers.map((closer: any) => (
                  <div
                    key={closer.interestId}
                    className="flex items-center gap-3 p-3 rounded-lg border bg-zinc-50 dark:bg-zinc-800/50"
                  >
                    {closer.photoUrl ? (
                      <img
                        src={closer.photoUrl}
                        alt={closer.name}
                        className="w-10 h-10 rounded-full object-cover"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-zinc-200 dark:bg-zinc-700 flex items-center justify-center text-sm font-medium text-zinc-500">
                        {closer.name
                          .split(" ")
                          .map((n: string) => n[0])
                          .join("")
                          .slice(0, 2)}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm truncate">
                          {closer.name}
                        </span>
                        {closer.isVerified && (
                          <CheckCircle2 className="h-3.5 w-3.5 text-green-500 flex-shrink-0" />
                        )}
                      </div>
                      {closer.headline && (
                        <p className="text-xs text-zinc-500 truncate">
                          {closer.headline}
                        </p>
                      )}
                    </div>
                    {closer.profileSlug && (
                      <a
                        href={`/p/${closer.profileSlug}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <Button variant="outline" size="sm">
                          <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                          Profile
                        </Button>
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
