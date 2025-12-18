"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Id } from "../../../../convex/_generated/dataModel";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, User } from "lucide-react";

interface AssignPlaylistModalProps {
  clerkId: string;
  playlistId: Id<"trainingPlaylists">;
  open: boolean;
  onClose: () => void;
}

export function AssignPlaylistModal({
  clerkId,
  playlistId,
  open,
  onClose,
}: AssignPlaylistModalProps) {
  const [selectedIds, setSelectedIds] = useState<Id<"closers">[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [initialAssignments, setInitialAssignments] = useState<Id<"closers">[]>([]);

  // Queries
  const closers = useQuery(
    api.trainingPlaylists.getClosersForAssignment,
    clerkId ? { clerkId } : "skip"
  );

  const currentAssignments = useQuery(
    api.trainingPlaylists.getPlaylistAssignments,
    clerkId && playlistId ? { clerkId, playlistId } : "skip"
  );

  // Mutations
  const assignPlaylist = useMutation(api.trainingPlaylists.assignPlaylist);
  const unassignPlaylist = useMutation(api.trainingPlaylists.unassignPlaylist);

  // Initialize selected IDs when assignments load
  useEffect(() => {
    if (currentAssignments) {
      setSelectedIds(currentAssignments);
      setInitialAssignments(currentAssignments);
    }
  }, [currentAssignments]);

  const handleToggle = (closerId: Id<"closers">) => {
    setSelectedIds((prev) =>
      prev.includes(closerId)
        ? prev.filter((id) => id !== closerId)
        : [...prev, closerId]
    );
  };

  const handleSave = async () => {
    if (!clerkId) return;

    setIsSaving(true);
    try {
      // Find closers to assign (in selected but not in initial)
      const toAssign = selectedIds.filter((id) => !initialAssignments.includes(id));
      // Find closers to unassign (in initial but not in selected)
      const toUnassign = initialAssignments.filter((id) => !selectedIds.includes(id));

      // Perform assignments
      for (const closerId of toAssign) {
        await assignPlaylist({ clerkId, playlistId, closerId });
      }

      // Perform unassignments
      for (const closerId of toUnassign) {
        await unassignPlaylist({ clerkId, playlistId, closerId });
      }

      onClose();
    } catch (error) {
      console.error("Failed to update assignments:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const hasChanges = JSON.stringify([...selectedIds].sort()) !== JSON.stringify([...initialAssignments].sort());

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Assign Playlist to Closers</DialogTitle>
        </DialogHeader>

        {/* Closers List */}
        <div className="py-4">
          {closers === undefined || currentAssignments === undefined ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : closers.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-zinc-500">No active closers in your team</p>
            </div>
          ) : (
            <div className="space-y-2">
              {closers.map((closer) => (
                <div
                  key={closer._id}
                  className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                    selectedIds.includes(closer._id)
                      ? "bg-zinc-100 border-zinc-300"
                      : "hover:bg-zinc-50 border-zinc-200"
                  }`}
                  onClick={() => handleToggle(closer._id)}
                >
                  <Checkbox
                    checked={selectedIds.includes(closer._id)}
                    onCheckedChange={() => handleToggle(closer._id)}
                  />
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-zinc-200 flex items-center justify-center">
                      <User className="h-4 w-4 text-zinc-500" />
                    </div>
                    <div>
                      <p className="font-medium text-sm">{closer.name}</p>
                      <p className="text-xs text-zinc-500">{closer.email}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <DialogFooter>
          <div className="flex items-center justify-between w-full">
            <span className="text-sm text-zinc-500">
              {selectedIds.length} closer{selectedIds.length !== 1 ? "s" : ""} selected
            </span>
            <div className="flex gap-2">
              <Button variant="outline" onClick={onClose} disabled={isSaving}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={isSaving || !hasChanges}>
                {isSaving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Save Assignments"
                )}
              </Button>
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
