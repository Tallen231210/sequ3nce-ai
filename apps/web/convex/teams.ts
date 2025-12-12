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

// Get team by ID (used by audio processor)
export const getTeamById = query({
  args: { teamId: v.id("teams") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.teamId);
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

// Update user name
export const updateUserName = mutation({
  args: {
    clerkId: v.string(),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .first();

    if (!user) {
      throw new Error("User not found");
    }

    await ctx.db.patch(user._id, { name: args.name });

    return { success: true };
  },
});

// Update team timezone
export const updateTeamTimezone = mutation({
  args: {
    clerkId: v.string(),
    timezone: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .first();

    if (!user) {
      throw new Error("User not found");
    }

    await ctx.db.patch(user.teamId, { timezone: args.timezone });

    return { success: true };
  },
});

// Update custom call outcomes
export const updateCustomOutcomes = mutation({
  args: {
    clerkId: v.string(),
    customOutcomes: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .first();

    if (!user) {
      throw new Error("User not found");
    }

    await ctx.db.patch(user.teamId, { customOutcomes: args.customOutcomes });

    return { success: true };
  },
});

// Update custom playbook categories
export const updateCustomPlaybookCategories = mutation({
  args: {
    clerkId: v.string(),
    customPlaybookCategories: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .first();

    if (!user) {
      throw new Error("User not found");
    }

    await ctx.db.patch(user.teamId, { customPlaybookCategories: args.customPlaybookCategories });

    return { success: true };
  },
});

// Get full settings data
export const getSettings = query({
  args: { clerkId: v.string() },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .first();

    if (!user) {
      return null;
    }

    const team = await ctx.db.get(user.teamId);

    return {
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
      team: team ? {
        _id: team._id,
        name: team.name,
        plan: team.plan,
        subscriptionStatus: team.subscriptionStatus,
        seatCount: team.seatCount,
        timezone: team.timezone,
        customOutcomes: team.customOutcomes,
        customPlaybookCategories: team.customPlaybookCategories,
        googleCalendarConnected: team.googleCalendarConnected,
        // Calendly integration
        calendlyConnected: !!team.calendlyAccessToken,
        calendlyConnectedEmail: team.calendlyConnectedEmail,
        calendlyLastSyncAt: team.calendlyLastSyncAt,
      } : null,
    };
  },
});

// Delete team and all associated data
export const deleteTeam = mutation({
  args: {
    clerkId: v.string(),
    confirmTeamName: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .first();

    if (!user) {
      throw new Error("User not found");
    }

    if (user.role !== "admin") {
      throw new Error("Only admins can delete the team");
    }

    const team = await ctx.db.get(user.teamId);

    if (!team) {
      throw new Error("Team not found");
    }

    // Verify team name matches
    if (team.name !== args.confirmTeamName) {
      throw new Error("Team name does not match");
    }

    const teamId = user.teamId;

    // Delete all highlights
    const highlights = await ctx.db
      .query("highlights")
      .withIndex("by_team", (q) => q.eq("teamId", teamId))
      .collect();
    for (const highlight of highlights) {
      await ctx.db.delete(highlight._id);
    }

    // Delete all objections
    const objections = await ctx.db
      .query("objections")
      .withIndex("by_team", (q) => q.eq("teamId", teamId))
      .collect();
    for (const objection of objections) {
      await ctx.db.delete(objection._id);
    }

    // Delete all ammo
    const ammo = await ctx.db
      .query("ammo")
      .withIndex("by_team", (q) => q.eq("teamId", teamId))
      .collect();
    for (const item of ammo) {
      await ctx.db.delete(item._id);
    }

    // Delete all calls
    const calls = await ctx.db
      .query("calls")
      .withIndex("by_team", (q) => q.eq("teamId", teamId))
      .collect();
    for (const call of calls) {
      await ctx.db.delete(call._id);
    }

    // Delete all scheduled calls
    const scheduledCalls = await ctx.db
      .query("scheduledCalls")
      .withIndex("by_team_and_date", (q) => q.eq("teamId", teamId))
      .collect();
    for (const scheduledCall of scheduledCalls) {
      await ctx.db.delete(scheduledCall._id);
    }

    // Delete all closers
    const closers = await ctx.db
      .query("closers")
      .withIndex("by_team", (q) => q.eq("teamId", teamId))
      .collect();
    for (const closer of closers) {
      await ctx.db.delete(closer._id);
    }

    // Delete all users for this team
    const users = await ctx.db
      .query("users")
      .withIndex("by_team", (q) => q.eq("teamId", teamId))
      .collect();
    for (const u of users) {
      await ctx.db.delete(u._id);
    }

    // Delete the team itself
    await ctx.db.delete(teamId);

    return { success: true };
  },
});
