import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// Create a new highlight
export const createHighlight = mutation({
  args: {
    clerkId: v.string(),
    callId: v.id("calls"),
    title: v.string(),
    notes: v.optional(v.string()),
    category: v.string(),
    transcriptText: v.string(),
    startTimestamp: v.number(),
    endTimestamp: v.number(),
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

    // Get the call to extract closerId and teamId
    const call = await ctx.db.get(args.callId);
    if (!call) {
      throw new Error("Call not found");
    }

    // Verify user belongs to the same team
    if (call.teamId !== user.teamId) {
      throw new Error("You don't have permission to create highlights for this call");
    }

    // Create the highlight
    const highlightId = await ctx.db.insert("highlights", {
      callId: args.callId,
      closerId: call.closerId,
      teamId: call.teamId,
      title: args.title,
      notes: args.notes,
      category: args.category,
      transcriptText: args.transcriptText,
      startTimestamp: args.startTimestamp,
      endTimestamp: args.endTimestamp,
      createdAt: Date.now(),
      createdBy: user._id,
    });

    return highlightId;
  },
});

// Delete a highlight
export const deleteHighlight = mutation({
  args: {
    clerkId: v.string(),
    highlightId: v.id("highlights"),
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

    // Get the highlight
    const highlight = await ctx.db.get(args.highlightId);
    if (!highlight) {
      throw new Error("Highlight not found");
    }

    // Verify user belongs to the same team
    if (highlight.teamId !== user.teamId) {
      throw new Error("You don't have permission to delete this highlight");
    }

    // Delete the highlight
    await ctx.db.delete(args.highlightId);

    return { success: true };
  },
});

// Get all highlights for a team with filters
export const getHighlights = query({
  args: {
    clerkId: v.string(),
    category: v.optional(v.string()),
    closerId: v.optional(v.id("closers")),
    searchQuery: v.optional(v.string()),
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

    // Get highlights based on filters
    let highlights;
    if (args.category) {
      highlights = await ctx.db
        .query("highlights")
        .withIndex("by_team_and_category", (q) =>
          q.eq("teamId", user.teamId).eq("category", args.category!)
        )
        .order("desc")
        .collect();
    } else {
      highlights = await ctx.db
        .query("highlights")
        .withIndex("by_team", (q) => q.eq("teamId", user.teamId))
        .order("desc")
        .collect();
    }

    // Filter by closer if specified
    if (args.closerId) {
      highlights = highlights.filter((h) => h.closerId === args.closerId);
    }

    // Filter by search query if specified
    if (args.searchQuery && args.searchQuery.trim()) {
      const query = args.searchQuery.toLowerCase().trim();
      highlights = highlights.filter(
        (h) =>
          h.title.toLowerCase().includes(query) ||
          (h.notes && h.notes.toLowerCase().includes(query)) ||
          h.transcriptText.toLowerCase().includes(query)
      );
    }

    // Fetch related data for each highlight
    const highlightsWithDetails = await Promise.all(
      highlights.map(async (highlight) => {
        const closer = await ctx.db.get(highlight.closerId);
        const call = await ctx.db.get(highlight.callId);
        const createdByUser = await ctx.db.get(highlight.createdBy);

        return {
          ...highlight,
          closerName: closer?.name || "Unknown",
          prospectName: call?.prospectName || "Unknown",
          recordingUrl: call?.recordingUrl || null,
          createdByName: createdByUser?.name || createdByUser?.email || "Unknown",
        };
      })
    );

    return highlightsWithDetails;
  },
});

// Get highlights for a specific call
export const getHighlightsByCall = query({
  args: {
    callId: v.id("calls"),
  },
  handler: async (ctx, args) => {
    const highlights = await ctx.db
      .query("highlights")
      .withIndex("by_call", (q) => q.eq("callId", args.callId))
      .collect();

    return highlights;
  },
});

// Get all closers for the team (for filter dropdown)
export const getClosersForFilter = query({
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
      .filter((c) => c.status === "active" || c.status === "pending")
      .map((c) => ({
        _id: c._id,
        name: c.name,
      }));
  },
});
