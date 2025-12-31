import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// Get all resources for a team (for manager dashboard)
export const getResources = query({
  args: { clerkId: v.string() },
  handler: async (ctx, args) => {
    // Get the user to find their team
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .first();

    if (!user) {
      return [];
    }

    // Get all resources for this team, ordered by order
    const resources = await ctx.db
      .query("closerResources")
      .withIndex("by_team", (q) => q.eq("teamId", user.teamId))
      .collect();

    // Sort by order
    return resources.sort((a, b) => a.order - b.order);
  },
});

// Get active resources for closers (for desktop app)
export const getActiveResources = query({
  args: { teamId: v.id("teams") },
  handler: async (ctx, args) => {
    const resources = await ctx.db
      .query("closerResources")
      .withIndex("by_team", (q) => q.eq("teamId", args.teamId))
      .collect();

    // Filter active and sort by order
    return resources
      .filter((r) => r.isActive)
      .sort((a, b) => a.order - b.order);
  },
});

// Add a new resource
export const addResource = mutation({
  args: {
    clerkId: v.string(),
    type: v.union(
      v.literal("script"),
      v.literal("payment_link"),
      v.literal("document"),
      v.literal("link")
    ),
    title: v.string(),
    description: v.optional(v.string()),
    content: v.optional(v.string()),
    url: v.optional(v.string()),
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

    // Get the highest order number
    const existingResources = await ctx.db
      .query("closerResources")
      .withIndex("by_team", (q) => q.eq("teamId", user.teamId))
      .collect();

    const maxOrder = existingResources.reduce(
      (max, r) => Math.max(max, r.order),
      -1
    );

    // Create the resource
    const resourceId = await ctx.db.insert("closerResources", {
      teamId: user.teamId,
      type: args.type,
      title: args.title,
      description: args.description,
      content: args.content,
      url: args.url,
      order: maxOrder + 1,
      isActive: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    return { resourceId };
  },
});

// Update a resource
export const updateResource = mutation({
  args: {
    clerkId: v.string(),
    resourceId: v.id("closerResources"),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    content: v.optional(v.string()),
    url: v.optional(v.string()),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    // Get the user to verify team ownership
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .first();

    if (!user) {
      throw new Error("User not found");
    }

    // Get the resource
    const resource = await ctx.db.get(args.resourceId);

    if (!resource) {
      throw new Error("Resource not found");
    }

    // Verify team ownership
    if (resource.teamId !== user.teamId) {
      throw new Error("You don't have permission to update this resource");
    }

    // Build update object
    const updates: Partial<{
      title: string;
      description: string;
      content: string;
      url: string;
      isActive: boolean;
      updatedAt: number;
    }> = {
      updatedAt: Date.now(),
    };

    if (args.title !== undefined) updates.title = args.title;
    if (args.description !== undefined) updates.description = args.description;
    if (args.content !== undefined) updates.content = args.content;
    if (args.url !== undefined) updates.url = args.url;
    if (args.isActive !== undefined) updates.isActive = args.isActive;

    await ctx.db.patch(args.resourceId, updates);

    return { success: true };
  },
});

// Delete a resource
export const deleteResource = mutation({
  args: {
    clerkId: v.string(),
    resourceId: v.id("closerResources"),
  },
  handler: async (ctx, args) => {
    // Get the user to verify team ownership
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .first();

    if (!user) {
      throw new Error("User not found");
    }

    // Get the resource
    const resource = await ctx.db.get(args.resourceId);

    if (!resource) {
      throw new Error("Resource not found");
    }

    // Verify team ownership
    if (resource.teamId !== user.teamId) {
      throw new Error("You don't have permission to delete this resource");
    }

    await ctx.db.delete(args.resourceId);

    return { success: true };
  },
});

// Reorder resources
export const reorderResources = mutation({
  args: {
    clerkId: v.string(),
    resourceIds: v.array(v.id("closerResources")),
  },
  handler: async (ctx, args) => {
    // Get the user to verify team ownership
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .first();

    if (!user) {
      throw new Error("User not found");
    }

    // Update order for each resource
    for (let i = 0; i < args.resourceIds.length; i++) {
      const resource = await ctx.db.get(args.resourceIds[i]);

      if (resource && resource.teamId === user.teamId) {
        await ctx.db.patch(args.resourceIds[i], {
          order: i,
          updatedAt: Date.now(),
        });
      }
    }

    return { success: true };
  },
});
