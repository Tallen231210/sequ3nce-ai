import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

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
      throw new Error("A closer with this email already exists on your team");
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
