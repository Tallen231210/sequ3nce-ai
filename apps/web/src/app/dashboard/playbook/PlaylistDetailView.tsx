"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Id } from "../../../../convex/_generated/dataModel";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  Plus,
  GripVertical,
  Trash2,
  Loader2,
  Check,
  X,
  Clock,
  User,
} from "lucide-react";
import { AddClipsModal } from "./AddClipsModal";

// Highlight categories
const HIGHLIGHT_CATEGORIES = [
  { value: "objection_handling", label: "Objection Handling" },
  { value: "pitch", label: "Pitch" },
  { value: "close", label: "Close" },
  { value: "pain_discovery", label: "Pain Discovery" },
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
    default:
      return "bg-zinc-500/10 text-zinc-600 border-zinc-500/30";
  }
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

interface PlaylistDetailViewProps {
  clerkId: string;
  playlistId: Id<"trainingPlaylists">;
  onBack: () => void;
}

export function PlaylistDetailView({ clerkId, playlistId, onBack }: PlaylistDetailViewProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [showAddClips, setShowAddClips] = useState(false);
  const [removingItemId, setRemovingItemId] = useState<Id<"trainingPlaylistItems"> | null>(null);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  // Queries
  const playlist = useQuery(
    api.trainingPlaylists.getPlaylistWithItems,
    clerkId ? { clerkId, playlistId } : "skip"
  );

  // Mutations
  const updatePlaylist = useMutation(api.trainingPlaylists.updatePlaylist);
  const removeItem = useMutation(api.trainingPlaylists.removeItemFromPlaylist);
  const reorderItems = useMutation(api.trainingPlaylists.reorderPlaylistItems);

  const handleStartEdit = () => {
    if (playlist) {
      setEditName(playlist.name);
      setEditDescription(playlist.description || "");
      setIsEditing(true);
    }
  };

  const handleSaveEdit = async () => {
    if (!clerkId || !playlist) return;

    setIsSaving(true);
    try {
      await updatePlaylist({
        clerkId,
        playlistId,
        name: editName.trim(),
        description: editDescription.trim() || undefined,
      });
      setIsEditing(false);
    } catch (error) {
      console.error("Failed to update playlist:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditName("");
    setEditDescription("");
  };

  const handleRemoveItem = async (highlightId: Id<"highlights">, itemId: Id<"trainingPlaylistItems">) => {
    if (!clerkId) return;

    setRemovingItemId(itemId);
    try {
      await removeItem({ clerkId, playlistId, highlightId });
    } catch (error) {
      console.error("Failed to remove item:", error);
    } finally {
      setRemovingItemId(null);
    }
  };

  // Drag and drop handlers
  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDrop = async (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === dropIndex || !playlist || !clerkId) {
      setDraggedIndex(null);
      return;
    }

    // Reorder the items locally first for immediate feedback
    const items = [...playlist.items];
    const [draggedItem] = items.splice(draggedIndex, 1);
    items.splice(dropIndex, 0, draggedItem);

    // Get the new order of highlight IDs
    const newOrder = items.filter((item) => item !== null).map((item) => item.highlight._id);

    setDraggedIndex(null);

    // Save to database
    try {
      await reorderItems({ clerkId, playlistId, highlightIds: newOrder });
    } catch (error) {
      console.error("Failed to reorder items:", error);
    }
  };

  // Loading state
  if (playlist === undefined) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!playlist) {
    return (
      <div className="text-center py-8">
        <p className="text-zinc-500">Playlist not found</p>
        <Button variant="outline" onClick={onBack} className="mt-4">
          Go Back
        </Button>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-start gap-4 mb-6">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
        </Button>

        <div className="flex-1">
          {isEditing ? (
            <div className="space-y-3">
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="Playlist name"
                className="text-xl font-semibold"
                disabled={isSaving}
              />
              <Textarea
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                placeholder="Description (optional)"
                rows={2}
                disabled={isSaving}
              />
              <div className="flex items-center gap-2">
                <Button size="sm" onClick={handleSaveEdit} disabled={isSaving || !editName.trim()}>
                  {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                </Button>
                <Button size="sm" variant="ghost" onClick={handleCancelEdit} disabled={isSaving}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ) : (
            <div>
              <h2 className="text-xl font-semibold mb-1 cursor-pointer hover:text-zinc-600" onClick={handleStartEdit}>
                {playlist.name}
              </h2>
              {playlist.description && (
                <p className="text-zinc-500 cursor-pointer hover:text-zinc-600" onClick={handleStartEdit}>
                  {playlist.description}
                </p>
              )}
              <p className="text-sm text-zinc-400 mt-1">
                {playlist.items.length} clip{playlist.items.length !== 1 ? "s" : ""} | Created by {playlist.createdByName}
              </p>
            </div>
          )}
        </div>

        <Button onClick={() => setShowAddClips(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Add Clips
        </Button>
      </div>

      {/* Items List */}
      {playlist.items.length === 0 ? (
        <Card>
          <CardContent className="py-12">
            <div className="flex flex-col items-center justify-center text-center">
              <p className="text-zinc-500 mb-4">No clips in this playlist yet</p>
              <Button variant="outline" onClick={() => setShowAddClips(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Add Your First Clip
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {playlist.items.map((item, index) => (
            <Card
              key={item._id}
              draggable
              onDragStart={(e) => handleDragStart(e, index)}
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, index)}
              className={`transition-all ${
                draggedIndex === index ? "opacity-50 scale-95" : ""
              } ${draggedIndex !== null && draggedIndex !== index ? "cursor-move" : ""}`}
            >
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  {/* Drag Handle */}
                  <div className="cursor-grab active:cursor-grabbing text-zinc-400 hover:text-zinc-600 pt-1">
                    <GripVertical className="h-5 w-5" />
                  </div>

                  {/* Order Number */}
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-zinc-100 flex items-center justify-center text-sm font-medium text-zinc-600">
                    {index + 1}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <h3 className="font-medium text-foreground">
                          {item.highlight.title}
                        </h3>
                        <Badge variant="outline" className={`mt-1 ${getCategoryColor(item.highlight.category)}`}>
                          {getCategoryLabel(item.highlight.category)}
                        </Badge>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 text-sm text-zinc-500">
                      <div className="flex items-center gap-1">
                        <User className="h-3.5 w-3.5" />
                        <span>{item.highlight.closerName}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" />
                        <span>{formatDuration(item.highlight.endTimestamp - item.highlight.startTimestamp)}</span>
                      </div>
                    </div>

                    {item.highlight.notes && (
                      <p className="text-sm text-zinc-500 mt-2 line-clamp-2">
                        {item.highlight.notes}
                      </p>
                    )}
                  </div>

                  {/* Remove Button */}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-zinc-400 hover:text-red-500"
                    onClick={() => handleRemoveItem(item.highlight._id, item._id)}
                    disabled={removingItemId === item._id}
                  >
                    {removingItemId === item._id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Add Clips Modal */}
      <AddClipsModal
        clerkId={clerkId}
        playlistId={playlistId}
        existingHighlightIds={playlist.items.map((item) => item.highlight._id)}
        open={showAddClips}
        onClose={() => setShowAddClips(false)}
      />
    </div>
  );
}
