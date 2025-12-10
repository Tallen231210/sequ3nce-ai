import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// Get the current user's team
export const getMyTeam = query({
  args: { clerkId: v.string() },
  handler: async (ctx, args) => {
    // First find the user by clerkId
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .first();

    if (!user) {
      return null;
    }

    // Then get their team
    const team = await ctx.db.get(user.teamId);
    return team;
  },
});

// Get the current user record
export const getMyUser = query({
  args: { clerkId: v.string() },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .first();

    return user;
  },
});

// Create a new team and user (for first-time signup)
export const createTeamAndUser = mutation({
  args: {
    clerkId: v.string(),
    email: v.string(),
    name: v.optional(v.string()),
    teamName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Check if user already exists
    const existingUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .first();

    if (existingUser) {
      // User already exists, return their team
      const team = await ctx.db.get(existingUser.teamId);
      return { teamId: existingUser.teamId, userId: existingUser._id, team };
    }

    // Create the team
    const teamId = await ctx.db.insert("teams", {
      name: args.teamName || `${args.name || "My"}'s Team`,
      plan: "active",
      createdAt: Date.now(),
    });

    // Create the user as admin of the team
    const userId = await ctx.db.insert("users", {
      clerkId: args.clerkId,
      email: args.email,
      name: args.name,
      teamId,
      role: "admin",
      createdAt: Date.now(),
    });

    const team = await ctx.db.get(teamId);

    return { teamId, userId, team };
  },
});

// Update team name
export const updateTeamName = mutation({
  args: {
    clerkId: v.string(),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    // Get the user's team
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .first();

    if (!user) {
      throw new Error("User not found");
    }

    // Update the team name
    await ctx.db.patch(user.teamId, { name: args.name });

    return { success: true };
  },
});
