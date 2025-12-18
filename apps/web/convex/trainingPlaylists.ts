import { v } from "convex/values";
import { mutation, query, internalQuery } from "./_generated/server";
import { Id } from "./_generated/dataModel";

// ==================== QUERIES ====================

// Get all playlists for a team
export const getPlaylistsByTeam = query({
  args: {
    clerkId: v.string(),
  },
  handler: async (ctx, args) => {
    // Get the user
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .first();

    if (!user) {
      return [];
    }

    // Get all playlists for the team
    const playlists = await ctx.db
      .query("trainingPlaylists")
      .withIndex("by_team", (q) => q.eq("teamId", user.teamId))
      .order("desc")
      .collect();

    // Enrich with item count, total duration, and assigned closers
    const playlistsWithDetails = await Promise.all(
      playlists.map(async (playlist) => {
        // Get items count
        const items = await ctx.db
          .query("trainingPlaylistItems")
          .withIndex("by_playlist", (q) => q.eq("playlistId", playlist._id))
          .collect();

        // Get highlight details to calculate total duration
        let totalDuration = 0;
        for (const item of items) {
          const highlight = await ctx.db.get(item.highlightId);
          if (highlight) {
            totalDuration += highlight.endTimestamp - highlight.startTimestamp;
          }
        }

        // Get assigned closers
        const assignments = await ctx.db
          .query("trainingPlaylistAssignments")
          .withIndex("by_playlist", (q) => q.eq("playlistId", playlist._id))
          .collect();

        const assignedClosers = await Promise.all(
          assignments.map(async (a) => {
            const closer = await ctx.db.get(a.closerId);
            return closer ? { _id: closer._id, name: closer.name } : null;
          })
        );

        // Get creator name
        const creator = await ctx.db.get(playlist.createdBy);

        return {
          ...playlist,
          itemCount: items.length,
          totalDuration, // in seconds
          assignedClosers: assignedClosers.filter(Boolean),
          createdByName: creator?.name || creator?.email || "Unknown",
        };
      })
    );

    return playlistsWithDetails;
  },
});

// Get a single playlist with all its items (highlights) in order
export const getPlaylistWithItems = query({
  args: {
    clerkId: v.string(),
    playlistId: v.id("trainingPlaylists"),
  },
  handler: async (ctx, args) => {
    // Get the user
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .first();

    if (!user) {
      throw new Error("User not found");
    }

    // Get the playlist
    const playlist = await ctx.db.get(args.playlistId);
    if (!playlist) {
      throw new Error("Playlist not found");
    }

    // Verify team membership
    if (playlist.teamId !== user.teamId) {
      throw new Error("You don't have permission to view this playlist");
    }

    // Get items ordered by position
    const items = await ctx.db
      .query("trainingPlaylistItems")
      .withIndex("by_playlist", (q) => q.eq("playlistId", args.playlistId))
      .collect();

    // Sort by order
    items.sort((a, b) => a.order - b.order);

    // Get full highlight details for each item
    const itemsWithHighlights = await Promise.all(
      items.map(async (item) => {
        const highlight = await ctx.db.get(item.highlightId);
        if (!highlight) {
          return null; // Highlight was deleted
        }

        const call = await ctx.db.get(highlight.callId);
        const closer = await ctx.db.get(highlight.closerId);

        return {
          _id: item._id,
          order: item.order,
          highlight: {
            ...highlight,
            recordingUrl: call?.recordingUrl || null,
            closerName: closer?.name || "Unknown",
          },
        };
      })
    );

    // Get assigned closers
    const assignments = await ctx.db
      .query("trainingPlaylistAssignments")
      .withIndex("by_playlist", (q) => q.eq("playlistId", args.playlistId))
      .collect();

    const assignedClosers = await Promise.all(
      assignments.map(async (a) => {
        const closer = await ctx.db.get(a.closerId);
        return closer ? { _id: closer._id, name: closer.name } : null;
      })
    );

    // Get creator name
    const creator = await ctx.db.get(playlist.createdBy);

    return {
      ...playlist,
      items: itemsWithHighlights.filter(Boolean),
      assignedClosers: assignedClosers.filter(Boolean),
      createdByName: creator?.name || creator?.email || "Unknown",
    };
  },
});

// Get playlists assigned to a specific closer (for desktop app)
export const getAssignedPlaylists = query({
  args: {
    closerId: v.id("closers"),
  },
  handler: async (ctx, args) => {
    // Get assignments for this closer
    const assignments = await ctx.db
      .query("trainingPlaylistAssignments")
      .withIndex("by_closer", (q) => q.eq("closerId", args.closerId))
      .collect();

    // Get full playlist details for each assignment
    const playlistsWithDetails = await Promise.all(
      assignments.map(async (assignment) => {
        const playlist = await ctx.db.get(assignment.playlistId);
        if (!playlist) return null; // Playlist was deleted

        // Get items count and duration
        const items = await ctx.db
          .query("trainingPlaylistItems")
          .withIndex("by_playlist", (q) => q.eq("playlistId", playlist._id))
          .collect();

        let totalDuration = 0;
        for (const item of items) {
          const highlight = await ctx.db.get(item.highlightId);
          if (highlight) {
            totalDuration += highlight.endTimestamp - highlight.startTimestamp;
          }
        }

        // Get assigner name
        const assigner = await ctx.db.get(assignment.assignedBy);

        return {
          ...playlist,
          itemCount: items.length,
          totalDuration,
          assignedAt: assignment.assignedAt,
          assignedByName: assigner?.name || assigner?.email || "Manager",
        };
      })
    );

    return playlistsWithDetails.filter(Boolean);
  },
});

// Get closers in team (for assignment modal)
export const getClosersForAssignment = query({
  args: {
    clerkId: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .first();

    if (!user) {
      return [];
    }

    const closers = await ctx.db
      .query("closers")
      .withIndex("by_team", (q) => q.eq("teamId", user.teamId))
      .collect();

    // Only return active closers
    return closers
      .filter((c) => c.status === "active")
      .map((c) => ({
        _id: c._id,
        name: c.name,
        email: c.email,
      }));
  },
});

// Get all highlights for the team (for adding to playlist)
export const getHighlightsForPlaylist = query({
  args: {
    clerkId: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .first();

    if (!user) {
      return [];
    }

    const highlights = await ctx.db
      .query("highlights")
      .withIndex("by_team", (q) => q.eq("teamId", user.teamId))
      .order("desc")
      .collect();

    // Enrich with closer name and duration
    const highlightsWithDetails = await Promise.all(
      highlights.map(async (highlight) => {
        const closer = await ctx.db.get(highlight.closerId);
        return {
          _id: highlight._id,
          title: highlight.title,
          category: highlight.category,
          closerName: closer?.name || "Unknown",
          duration: highlight.endTimestamp - highlight.startTimestamp,
          createdAt: highlight.createdAt,
        };
      })
    );

    return highlightsWithDetails;
  },
});

// ==================== MUTATIONS ====================

// Create a new playlist
export const createPlaylist = mutation({
  args: {
    clerkId: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .first();

    if (!user) {
      throw new Error("User not found");
    }

    const now = Date.now();
    const playlistId = await ctx.db.insert("trainingPlaylists", {
      teamId: user.teamId,
      name: args.name,
      description: args.description,
      createdBy: user._id,
      createdAt: now,
      updatedAt: now,
    });

    return playlistId;
  },
});

// Update a playlist
export const updatePlaylist = mutation({
  args: {
    clerkId: v.string(),
    playlistId: v.id("trainingPlaylists"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .first();

    if (!user) {
      throw new Error("User not found");
    }

    const playlist = await ctx.db.get(args.playlistId);
    if (!playlist) {
      throw new Error("Playlist not found");
    }

    if (playlist.teamId !== user.teamId) {
      throw new Error("You don't have permission to update this playlist");
    }

    const updates: Partial<{ name: string; description: string; updatedAt: number }> = {
      updatedAt: Date.now(),
    };

    if (args.name !== undefined) {
      updates.name = args.name;
    }
    if (args.description !== undefined) {
      updates.description = args.description;
    }

    await ctx.db.patch(args.playlistId, updates);

    return { success: true };
  },
});

// Delete a playlist (and all its items and assignments)
export const deletePlaylist = mutation({
  args: {
    clerkId: v.string(),
    playlistId: v.id("trainingPlaylists"),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .first();

    if (!user) {
      throw new Error("User not found");
    }

    const playlist = await ctx.db.get(args.playlistId);
    if (!playlist) {
      throw new Error("Playlist not found");
    }

    if (playlist.teamId !== user.teamId) {
      throw new Error("You don't have permission to delete this playlist");
    }

    // Delete all items
    const items = await ctx.db
      .query("trainingPlaylistItems")
      .withIndex("by_playlist", (q) => q.eq("playlistId", args.playlistId))
      .collect();

    for (const item of items) {
      await ctx.db.delete(item._id);
    }

    // Delete all assignments
    const assignments = await ctx.db
      .query("trainingPlaylistAssignments")
      .withIndex("by_playlist", (q) => q.eq("playlistId", args.playlistId))
      .collect();

    for (const assignment of assignments) {
      await ctx.db.delete(assignment._id);
    }

    // Delete the playlist itself
    await ctx.db.delete(args.playlistId);

    return { success: true };
  },
});

// Add a highlight to a playlist
export const addItemToPlaylist = mutation({
  args: {
    clerkId: v.string(),
    playlistId: v.id("trainingPlaylists"),
    highlightId: v.id("highlights"),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .first();

    if (!user) {
      throw new Error("User not found");
    }

    const playlist = await ctx.db.get(args.playlistId);
    if (!playlist || playlist.teamId !== user.teamId) {
      throw new Error("Playlist not found or access denied");
    }

    const highlight = await ctx.db.get(args.highlightId);
    if (!highlight || highlight.teamId !== user.teamId) {
      throw new Error("Highlight not found or access denied");
    }

    // Check if already in playlist
    const existing = await ctx.db
      .query("trainingPlaylistItems")
      .withIndex("by_playlist", (q) => q.eq("playlistId", args.playlistId))
      .filter((q) => q.eq(q.field("highlightId"), args.highlightId))
      .first();

    if (existing) {
      throw new Error("Highlight is already in this playlist");
    }

    // Get the next order number
    const items = await ctx.db
      .query("trainingPlaylistItems")
      .withIndex("by_playlist", (q) => q.eq("playlistId", args.playlistId))
      .collect();

    const maxOrder = items.length > 0 ? Math.max(...items.map((i) => i.order)) : -1;

    // Add the item
    await ctx.db.insert("trainingPlaylistItems", {
      playlistId: args.playlistId,
      highlightId: args.highlightId,
      order: maxOrder + 1,
      addedAt: Date.now(),
    });

    // Update playlist timestamp
    await ctx.db.patch(args.playlistId, { updatedAt: Date.now() });

    return { success: true };
  },
});

// Remove a highlight from a playlist
export const removeItemFromPlaylist = mutation({
  args: {
    clerkId: v.string(),
    playlistId: v.id("trainingPlaylists"),
    highlightId: v.id("highlights"),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .first();

    if (!user) {
      throw new Error("User not found");
    }

    const playlist = await ctx.db.get(args.playlistId);
    if (!playlist || playlist.teamId !== user.teamId) {
      throw new Error("Playlist not found or access denied");
    }

    // Find the item
    const item = await ctx.db
      .query("trainingPlaylistItems")
      .withIndex("by_playlist", (q) => q.eq("playlistId", args.playlistId))
      .filter((q) => q.eq(q.field("highlightId"), args.highlightId))
      .first();

    if (!item) {
      throw new Error("Item not found in playlist");
    }

    // Delete the item
    await ctx.db.delete(item._id);

    // Update playlist timestamp
    await ctx.db.patch(args.playlistId, { updatedAt: Date.now() });

    return { success: true };
  },
});

// Reorder items in a playlist
export const reorderPlaylistItems = mutation({
  args: {
    clerkId: v.string(),
    playlistId: v.id("trainingPlaylists"),
    highlightIds: v.array(v.id("highlights")), // New order of highlight IDs
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .first();

    if (!user) {
      throw new Error("User not found");
    }

    const playlist = await ctx.db.get(args.playlistId);
    if (!playlist || playlist.teamId !== user.teamId) {
      throw new Error("Playlist not found or access denied");
    }

    // Get all current items
    const items = await ctx.db
      .query("trainingPlaylistItems")
      .withIndex("by_playlist", (q) => q.eq("playlistId", args.playlistId))
      .collect();

    // Create a map of highlightId to item
    const itemMap = new Map(items.map((item) => [item.highlightId.toString(), item]));

    // Update order for each highlight
    for (let i = 0; i < args.highlightIds.length; i++) {
      const highlightId = args.highlightIds[i];
      const item = itemMap.get(highlightId.toString());
      if (item) {
        await ctx.db.patch(item._id, { order: i });
      }
    }

    // Update playlist timestamp
    await ctx.db.patch(args.playlistId, { updatedAt: Date.now() });

    return { success: true };
  },
});

// Assign a playlist to a closer
export const assignPlaylist = mutation({
  args: {
    clerkId: v.string(),
    playlistId: v.id("trainingPlaylists"),
    closerId: v.id("closers"),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .first();

    if (!user) {
      throw new Error("User not found");
    }

    const playlist = await ctx.db.get(args.playlistId);
    if (!playlist || playlist.teamId !== user.teamId) {
      throw new Error("Playlist not found or access denied");
    }

    const closer = await ctx.db.get(args.closerId);
    if (!closer || closer.teamId !== user.teamId) {
      throw new Error("Closer not found or access denied");
    }

    // Check if already assigned
    const existing = await ctx.db
      .query("trainingPlaylistAssignments")
      .withIndex("by_closer_playlist", (q) =>
        q.eq("closerId", args.closerId).eq("playlistId", args.playlistId)
      )
      .first();

    if (existing) {
      throw new Error("Playlist is already assigned to this closer");
    }

    // Create assignment
    await ctx.db.insert("trainingPlaylistAssignments", {
      playlistId: args.playlistId,
      closerId: args.closerId,
      assignedBy: user._id,
      assignedAt: Date.now(),
    });

    return { success: true };
  },
});

// Unassign a playlist from a closer
export const unassignPlaylist = mutation({
  args: {
    clerkId: v.string(),
    playlistId: v.id("trainingPlaylists"),
    closerId: v.id("closers"),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .first();

    if (!user) {
      throw new Error("User not found");
    }

    const playlist = await ctx.db.get(args.playlistId);
    if (!playlist || playlist.teamId !== user.teamId) {
      throw new Error("Playlist not found or access denied");
    }

    // Find the assignment
    const assignment = await ctx.db
      .query("trainingPlaylistAssignments")
      .withIndex("by_closer_playlist", (q) =>
        q.eq("closerId", args.closerId).eq("playlistId", args.playlistId)
      )
      .first();

    if (!assignment) {
      throw new Error("Assignment not found");
    }

    // Delete the assignment
    await ctx.db.delete(assignment._id);

    return { success: true };
  },
});

// Get current assignments for a playlist (for the assign modal)
export const getPlaylistAssignments = query({
  args: {
    clerkId: v.string(),
    playlistId: v.id("trainingPlaylists"),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .first();

    if (!user) {
      return [];
    }

    const playlist = await ctx.db.get(args.playlistId);
    if (!playlist || playlist.teamId !== user.teamId) {
      return [];
    }

    const assignments = await ctx.db
      .query("trainingPlaylistAssignments")
      .withIndex("by_playlist", (q) => q.eq("playlistId", args.playlistId))
      .collect();

    return assignments.map((a) => a.closerId);
  },
});

// ==================== INTERNAL QUERIES (for HTTP endpoints) ====================

// Get playlist items with full highlight details (used by HTTP endpoint)
export const getPlaylistItemsInternal = internalQuery({
  args: {
    playlistId: v.id("trainingPlaylists"),
  },
  handler: async (ctx, args) => {
    // Get items ordered by position
    const items = await ctx.db
      .query("trainingPlaylistItems")
      .withIndex("by_playlist", (q) => q.eq("playlistId", args.playlistId))
      .collect();

    // Sort by order
    items.sort((a, b) => a.order - b.order);

    // Get full highlight details for each item
    const itemsWithHighlights = await Promise.all(
      items.map(async (item) => {
        const highlight = await ctx.db.get(item.highlightId);
        if (!highlight) {
          return null; // Highlight was deleted
        }

        const call = await ctx.db.get(highlight.callId);
        const closer = await ctx.db.get(highlight.closerId);

        return {
          _id: item._id,
          order: item.order,
          highlight: {
            _id: highlight._id,
            title: highlight.title,
            notes: highlight.notes,
            category: highlight.category,
            transcriptText: highlight.transcriptText,
            startTimestamp: highlight.startTimestamp,
            endTimestamp: highlight.endTimestamp,
            recordingUrl: call?.recordingUrl || null,
            closerName: closer?.name || "Unknown",
          },
        };
      })
    );

    return itemsWithHighlights.filter(Boolean);
  },
});
