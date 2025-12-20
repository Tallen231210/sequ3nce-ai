// Admin-only operations for configuring ammo settings per team
import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

// Find a team by the owner's (admin user's) email
export const findTeamByOwnerEmail = query({
  args: {
    email: v.string(),
  },
  handler: async (ctx, args) => {
    // Find the user with this email
    const user = await ctx.db
      .query("users")
      .filter((q) => q.eq(q.field("email"), args.email.toLowerCase()))
      .first();

    if (!user) {
      return null;
    }

    // Get the team
    const team = await ctx.db.get(user.teamId);
    if (!team) {
      return null;
    }

    // Check if this team has an ammo config
    const ammoConfig = await ctx.db
      .query("ammoConfigs")
      .withIndex("by_team", (q) => q.eq("teamId", team._id))
      .first();

    return {
      team: {
        _id: team._id,
        name: team.name,
        plan: team.plan,
        createdAt: team.createdAt,
      },
      user: {
        _id: user._id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
      hasAmmoConfig: !!ammoConfig,
      ammoConfig: ammoConfig || null,
    };
  },
});

// Get ammo config for a specific team
export const getAmmoConfig = query({
  args: {
    teamId: v.id("teams"),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("ammoConfigs")
      .withIndex("by_team", (q) => q.eq("teamId", args.teamId))
      .first();
  },
});

// Save or update ammo config for a team
export const saveAmmoConfig = mutation({
  args: {
    teamId: v.id("teams"),
    requiredInfo: v.array(v.object({
      id: v.string(),
      label: v.string(),
      description: v.optional(v.string()),
    })),
    scriptFramework: v.array(v.object({
      id: v.string(),
      name: v.string(),
      description: v.optional(v.string()),
      order: v.number(),
    })),
    commonObjections: v.array(v.object({
      id: v.string(),
      label: v.string(),
      keywords: v.array(v.string()),
    })),
    ammoCategories: v.array(v.object({
      id: v.string(),
      name: v.string(),
      color: v.string(),
      keywords: v.array(v.string()),
    })),
    offerDescription: v.string(),
    problemSolved: v.string(),
  },
  handler: async (ctx, args) => {
    const { teamId, ...configData } = args;

    // Check if team exists
    const team = await ctx.db.get(teamId);
    if (!team) {
      throw new Error("Team not found");
    }

    // Check if config already exists
    const existingConfig = await ctx.db
      .query("ammoConfigs")
      .withIndex("by_team", (q) => q.eq("teamId", teamId))
      .first();

    const now = Date.now();

    if (existingConfig) {
      // Update existing config
      await ctx.db.patch(existingConfig._id, {
        ...configData,
        updatedAt: now,
      });
      return existingConfig._id;
    } else {
      // Create new config
      const configId = await ctx.db.insert("ammoConfigs", {
        teamId,
        ...configData,
        createdAt: now,
        updatedAt: now,
      });
      return configId;
    }
  },
});

// Delete ammo config for a team (if needed)
export const deleteAmmoConfig = mutation({
  args: {
    teamId: v.id("teams"),
  },
  handler: async (ctx, args) => {
    const existingConfig = await ctx.db
      .query("ammoConfigs")
      .withIndex("by_team", (q) => q.eq("teamId", args.teamId))
      .first();

    if (existingConfig) {
      await ctx.db.delete(existingConfig._id);
      return true;
    }
    return false;
  },
});
