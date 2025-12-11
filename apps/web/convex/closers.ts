import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// DEBUG: List all closers (for debugging)
export const listAllClosers = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("closers").collect();
  },
});

// Activate a closer when they log in from the desktop app
export const activateCloserByEmail = mutation({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    const closer = await ctx.db
      .query("closers")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .first();

    if (!closer) {
      return { success: false, error: "Closer not found" };
    }

    // Only activate if currently pending
    if (closer.status === "pending") {
      await ctx.db.patch(closer._id, {
        status: "active",
        activatedAt: Date.now(),
      });
    }

    return { success: true };
  },
});

// Get closer info by email (used by desktop app for simple login)
export const getCloserByEmail = query({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    // Find closer by email
    const closer = await ctx.db
      .query("closers")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .first();

    if (!closer) {
      return null;
    }

    // Only allow active or pending closers to log in
    if (closer.status === "deactivated") {
      return null;
    }

    // Get their team
    const team = await ctx.db.get(closer.teamId);

    return {
      closerId: closer._id,
      teamId: closer.teamId,
      name: closer.name,
      email: closer.email,
      status: closer.status,
      teamName: team?.name,
    };
  },
});

// Get the current closer's info by their Clerk ID (used by desktop app)
export const getMyCloserInfo = query({
  args: { clerkId: v.string() },
  handler: async (ctx, args) => {
    // Find closer by clerkId
    const closer = await ctx.db
      .query("closers")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .first();

    if (!closer) {
      return null;
    }

    // Get their team
    const team = await ctx.db.get(closer.teamId);

    return {
      closerId: closer._id,
      teamId: closer.teamId,
      name: closer.name,
      email: closer.email,
      status: closer.status,
      teamName: team?.name,
    };
  },
});

// Link a Clerk ID to an existing closer (called when closer signs up)
export const linkClerkToCloser = mutation({
  args: {
    clerkId: v.string(),
    email: v.string(),
  },
  handler: async (ctx, args) => {
    // Check if this clerkId is already linked to a closer
    const existingByClerk = await ctx.db
      .query("closers")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .first();

    if (existingByClerk) {
      // Already linked, return their info
      const team = await ctx.db.get(existingByClerk.teamId);
      return {
        closerId: existingByClerk._id,
        teamId: existingByClerk.teamId,
        name: existingByClerk.name,
        teamName: team?.name,
        alreadyLinked: true,
      };
    }

    // Find closer by email (they were invited by admin)
    const closer = await ctx.db
      .query("closers")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .first();

    if (!closer) {
      // No invitation found for this email
      return { error: "no_invitation", message: "No invitation found for this email. Please contact your team admin." };
    }

    // Link the clerkId to this closer and activate them
    await ctx.db.patch(closer._id, {
      clerkId: args.clerkId,
      status: "active",
      activatedAt: Date.now(),
    });

    const team = await ctx.db.get(closer.teamId);

    return {
      closerId: closer._id,
      teamId: closer.teamId,
      name: closer.name,
      teamName: team?.name,
      alreadyLinked: false,
    };
  },
});

// Get all closers for a team
export const getClosers = query({
  args: { clerkId: v.string() },
  handler: async (ctx, args) => {
    // First get the user to find their team
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .first();

    if (!user) {
      return [];
    }

    // Get all closers for this team
    const closers = await ctx.db
      .query("closers")
      .withIndex("by_team", (q) => q.eq("teamId", user.teamId))
      .collect();

    return closers;
  },
});

// Get closer counts by status
export const getCloserCounts = query({
  args: { clerkId: v.string() },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .first();

    if (!user) {
      return { total: 0, active: 0, pending: 0, deactivated: 0 };
    }

    const closers = await ctx.db
      .query("closers")
      .withIndex("by_team", (q) => q.eq("teamId", user.teamId))
      .collect();

    return {
      total: closers.length,
      active: closers.filter((c) => c.status === "active").length,
      pending: closers.filter((c) => c.status === "pending").length,
      deactivated: closers.filter((c) => c.status === "deactivated").length,
    };
  },
});

// Add a new closer to the team
export const addCloser = mutation({
  args: {
    clerkId: v.string(),
    email: v.string(),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    // Get the user to find their team
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .first();

    if (!user) {
      throw new Error("User not found");
    }

    // Check if closer with this email already exists in the team
    const existingCloser = await ctx.db
      .query("closers")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .first();

    if (existingCloser && existingCloser.teamId === user.teamId) {
      throw new Error("You already added a closer with that email");
    }

    // Create the closer
    const closerId = await ctx.db.insert("closers", {
      email: args.email,
      name: args.name,
      teamId: user.teamId,
      status: "pending",
      calendarConnected: false,
      invitedAt: Date.now(),
    });

    return { closerId };
  },
});

// Remove a closer from the team
export const removeCloser = mutation({
  args: {
    clerkId: v.string(),
    closerId: v.id("closers"),
  },
  handler: async (ctx, args) => {
    // Get the user to verify they own this team
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .first();

    if (!user) {
      throw new Error("User not found");
    }

    // Get the closer
    const closer = await ctx.db.get(args.closerId);

    if (!closer) {
      throw new Error("Closer not found");
    }

    // Verify the closer belongs to the user's team
    if (closer.teamId !== user.teamId) {
      throw new Error("You don't have permission to remove this closer");
    }

    // Delete the closer
    await ctx.db.delete(args.closerId);

    return { success: true };
  },
});

// Update closer status
export const updateCloserStatus = mutation({
  args: {
    clerkId: v.string(),
    closerId: v.id("closers"),
    status: v.union(
      v.literal("pending"),
      v.literal("active"),
      v.literal("deactivated")
    ),
  },
  handler: async (ctx, args) => {
    // Get the user to verify they own this team
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .first();

    if (!user) {
      throw new Error("User not found");
    }

    // Get the closer
    const closer = await ctx.db.get(args.closerId);

    if (!closer) {
      throw new Error("Closer not found");
    }

    // Verify the closer belongs to the user's team
    if (closer.teamId !== user.teamId) {
      throw new Error("You don't have permission to update this closer");
    }

    // Update the status
    const updates: { status: string; activatedAt?: number } = {
      status: args.status,
    };

    // Set activatedAt if activating
    if (args.status === "active" && closer.status !== "active") {
      updates.activatedAt = Date.now();
    }

    await ctx.db.patch(args.closerId, updates);

    return { success: true };
  },
});
