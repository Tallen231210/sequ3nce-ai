"use client";

import { useState } from "react";
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
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Search, Loader2, Clock, User } from "lucide-react";

// Highlight categories
const HIGHLIGHT_CATEGORIES = [
  { value: "objection_handling", label: "Objection Handling" },
  { value: "pitch", label: "Pitch" },
  { value: "close", label: "Close" },
  { value: "pain_discovery", label: "Pain Discovery" },
  { value: "feedback", label: "Feedback" },
];

function getCategoryLabel(value: string): string {
  const category = HIGHLIGHT_CATEGORIES.find((c) => c.value === value);
  return category?.label || value;
}

function getCategoryColor(value: string): string {
  switch (value) {
    case "objection_handling":
      return "bg-orange-500/10 text-orange-600 border-orange-500/30";
    case "pitch":
      return "bg-blue-500/10 text-blue-600 border-blue-500/30";
    case "close":
      return "bg-green-500/10 text-green-600 border-green-500/30";
    case "pain_discovery":
      return "bg-purple-500/10 text-purple-600 border-purple-500/30";
    case "feedback":
      return "bg-amber-500/10 text-amber-600 border-amber-500/30";
    default:
      return "bg-zinc-500/10 text-zinc-600 border-zinc-500/30";
  }
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

interface AddClipsModalProps {
  clerkId: string;
  playlistId: Id<"trainingPlaylists">;
  existingHighlightIds: Id<"highlights">[];
  open: boolean;
  onClose: () => void;
}

export function AddClipsModal({
  clerkId,
  playlistId,
  existingHighlightIds,
  open,
  onClose,
}: AddClipsModalProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<Id<"highlights">[]>([]);
  const [isAdding, setIsAdding] = useState(false);

  // Query highlights
  const highlights = useQuery(
    api.trainingPlaylists.getHighlightsForPlaylist,
    clerkId ? { clerkId } : "skip"
  );

  // Mutation
  const addItem = useMutation(api.trainingPlaylists.addItemToPlaylist);

  // Filter highlights that aren't already in the playlist
  const availableHighlights = highlights?.filter(
    (h) => !existingHighlightIds.includes(h._id)
  );

  // Filter by search query
  const filteredHighlights = availableHighlights?.filter((h) =>
    h.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    h.closerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    getCategoryLabel(h.category).toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleToggle = (id: Id<"highlights">) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const handleAdd = async () => {
    if (selectedIds.length === 0 || !clerkId) return;

    setIsAdding(true);
    try {
      // Add each selected highlight
      for (const highlightId of selectedIds) {
        await addItem({ clerkId, playlistId, highlightId });
      }
      setSelectedIds([]);
      setSearchQuery("");
      onClose();
    } catch (error) {
      console.error("Failed to add clips:", error);
    } finally {
      setIsAdding(false);
    }
  };

  const handleClose = () => {
    setSelectedIds([]);
    setSearchQuery("");
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleClose()}>
      <DialogContent className="sm:max-w-[600px] max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>Add Clips to Playlist</DialogTitle>
        </DialogHeader>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
          <Input
            placeholder="Search highlights..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Highlights List */}
        <div className="overflow-y-auto max-h-[400px] space-y-2 py-2">
          {highlights === undefined ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filteredHighlights?.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-zinc-500">
                {availableHighlights?.length === 0
                  ? "All highlights are already in this playlist"
                  : "No highlights match your search"}
              </p>
            </div>
          ) : (
            filteredHighlights?.map((highlight) => (
              <div
                key={highlight._id}
                className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                  selectedIds.includes(highlight._id)
                    ? "bg-zinc-100 border-zinc-300"
                    : "hover:bg-zinc-50 border-zinc-200"
                }`}
                onClick={() => handleToggle(highlight._id)}
              >
                <Checkbox
                  checked={selectedIds.includes(highlight._id)}
                  onCheckedChange={() => handleToggle(highlight._id)}
                  className="mt-1"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between mb-1">
                    <h4 className="font-medium text-sm">{highlight.title}</h4>
                    <Badge variant="outline" className={`text-xs ${getCategoryColor(highlight.category)}`}>
                      {getCategoryLabel(highlight.category)}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-zinc-500">
                    <div className="flex items-center gap-1">
                      <User className="h-3 w-3" />
                      <span>{highlight.closerName}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      <span>{formatDuration(highlight.duration)}</span>
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        <DialogFooter>
          <div className="flex items-center justify-between w-full">
            <span className="text-sm text-zinc-500">
              {selectedIds.length} selected
            </span>
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleClose} disabled={isAdding}>
                Cancel
              </Button>
              <Button onClick={handleAdd} disabled={isAdding || selectedIds.length === 0}>
                {isAdding ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Adding...
                  </>
                ) : (
                  `Add ${selectedIds.length} Clip${selectedIds.length !== 1 ? "s" : ""}`
                )}
              </Button>
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
