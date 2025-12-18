"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Id } from "../../../../convex/_generated/dataModel";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Plus,
  ListMusic,
  Clock,
  Users,
  Loader2,
  Trash2,
  Edit,
  UserPlus,
} from "lucide-react";
import { CreatePlaylistModal } from "./CreatePlaylistModal";
import { PlaylistDetailView } from "./PlaylistDetailView";
import { AssignPlaylistModal } from "./AssignPlaylistModal";

// Format duration from seconds to human-readable
function formatDuration(seconds: number): string {
  if (seconds < 60) {
    return `${Math.round(seconds)}s`;
  }
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  if (secs === 0) {
    return `${mins}m`;
  }
  return `${mins}m ${secs}s`;
}

interface PlaylistsViewProps {
  clerkId: string;
}

export function PlaylistsView({ clerkId }: PlaylistsViewProps) {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<Id<"trainingPlaylists"> | null>(null);
  const [assigningPlaylistId, setAssigningPlaylistId] = useState<Id<"trainingPlaylists"> | null>(null);
  const [deletingId, setDeletingId] = useState<Id<"trainingPlaylists"> | null>(null);

  // Queries
  const playlists = useQuery(
    api.trainingPlaylists.getPlaylistsByTeam,
    clerkId ? { clerkId } : "skip"
  );

  // Mutations
  const deletePlaylist = useMutation(api.trainingPlaylists.deletePlaylist);

  const handleDelete = async (playlistId: Id<"trainingPlaylists">) => {
    if (!clerkId) return;

    setDeletingId(playlistId);
    try {
      await deletePlaylist({ clerkId, playlistId });
    } catch (error) {
      console.error("Failed to delete playlist:", error);
    } finally {
      setDeletingId(null);
    }
  };

  // If a playlist is selected, show the detail view
  if (selectedPlaylistId) {
    return (
      <PlaylistDetailView
        clerkId={clerkId}
        playlistId={selectedPlaylistId}
        onBack={() => setSelectedPlaylistId(null)}
      />
    );
  }

  // Loading state
  if (playlists === undefined) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div>
      {/* Header with Create Button */}
      <div className="flex items-center justify-between mb-6">
        <div className="text-sm text-zinc-500">
          {playlists.length} playlist{playlists.length !== 1 ? "s" : ""}
        </div>
        <Button onClick={() => setShowCreateModal(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Create Playlist
        </Button>
      </div>

      {/* Empty State */}
      {playlists.length === 0 ? (
        <Card>
          <CardContent className="py-16">
            <div className="flex flex-col items-center justify-center text-center">
              <ListMusic className="h-12 w-12 text-zinc-400 mb-4" />
              <h3 className="text-lg font-medium mb-2">No training playlists yet</h3>
              <p className="text-zinc-500 text-sm max-w-sm mb-4">
                Create playlists of highlights to train your closers. Organize your best clips and assign them to team members.
              </p>
              <Button onClick={() => setShowCreateModal(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Create Your First Playlist
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        /* Playlists Grid */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {playlists.map((playlist) => (
            <Card key={playlist._id} className="overflow-hidden hover:shadow-md transition-shadow">
              <CardContent className="p-5">
                {/* Header */}
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setSelectedPlaylistId(playlist._id)}>
                    <h3 className="font-medium text-foreground truncate mb-1">
                      {playlist.name}
                    </h3>
                    {playlist.description && (
                      <p className="text-sm text-zinc-500 line-clamp-2">
                        {playlist.description}
                      </p>
                    )}
                  </div>
                </div>

                {/* Stats */}
                <div className="flex items-center gap-4 text-sm text-zinc-500 mb-4">
                  <div className="flex items-center gap-1">
                    <ListMusic className="h-3.5 w-3.5" />
                    <span>{playlist.itemCount} clip{playlist.itemCount !== 1 ? "s" : ""}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" />
                    <span>{formatDuration(playlist.totalDuration)}</span>
                  </div>
                </div>

                {/* Assigned Closers */}
                {playlist.assignedClosers && playlist.assignedClosers.length > 0 && (
                  <div className="flex items-center gap-1 text-sm text-zinc-500 mb-4">
                    <Users className="h-3.5 w-3.5" />
                    <span>
                      {playlist.assignedClosers.filter((c) => c !== null).slice(0, 2).map((c) => c.name).join(", ")}
                      {playlist.assignedClosers.length > 2 && ` +${playlist.assignedClosers.length - 2} more`}
                    </span>
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center gap-2 pt-3 border-t border-zinc-100">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSelectedPlaylistId(playlist._id)}
                  >
                    <Edit className="h-3.5 w-3.5 mr-1" />
                    Edit
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setAssigningPlaylistId(playlist._id)}
                  >
                    <UserPlus className="h-3.5 w-3.5 mr-1" />
                    Assign
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-zinc-400 hover:text-red-500 ml-auto"
                        disabled={deletingId === playlist._id}
                      >
                        {deletingId === playlist._id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete Playlist</AlertDialogTitle>
                        <AlertDialogDescription>
                          Are you sure you want to delete "{playlist.name}"? This will remove all assignments but won't delete the underlying highlights.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => handleDelete(playlist._id)}
                          className="bg-red-500 hover:bg-red-600"
                        >
                          Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>

                {/* Created by */}
                <p className="text-xs text-zinc-400 mt-3">
                  Created by {playlist.createdByName}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create Modal */}
      <CreatePlaylistModal
        clerkId={clerkId}
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
      />

      {/* Assign Modal */}
      {assigningPlaylistId && (
        <AssignPlaylistModal
          clerkId={clerkId}
          playlistId={assigningPlaylistId}
          open={true}
          onClose={() => setAssigningPlaylistId(null)}
        />
      )}
    </div>
  );
}
