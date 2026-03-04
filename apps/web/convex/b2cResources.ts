import { v } from "convex/values";
import { mutation } from "./_generated/server";

// ==================== Validation Constants ====================

const MAX_TITLE = 200;
const MAX_DESCRIPTION = 500;
const MAX_CONTENT = 10000;
const MAX_URL = 2000;
const VALID_TYPES = ["script", "payment_link", "document", "link"] as const;

function validateType(type: string): type is typeof VALID_TYPES[number] {
  return (VALID_TYPES as readonly string[]).includes(type);
}

function validateUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

// ==================== Mutations ====================

// Add a new B2C resource
export const addResource = mutation({
  args: {
    userId: v.id("b2cUsers"),
    type: v.string(),
    title: v.string(),
    description: v.optional(v.string()),
    content: v.optional(v.string()),
    url: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Validate type
    if (!validateType(args.type)) {
      throw new Error(`Invalid resource type: ${args.type}`);
    }

    // Validate lengths
    if (!args.title.trim() || args.title.length > MAX_TITLE) {
      throw new Error(`Title is required and must be under ${MAX_TITLE} characters`);
    }
    if (args.description && args.description.length > MAX_DESCRIPTION) {
      throw new Error(`Description must be under ${MAX_DESCRIPTION} characters`);
    }
    if (args.content && args.content.length > MAX_CONTENT) {
      throw new Error(`Content must be under ${MAX_CONTENT} characters`);
    }
    if (args.url) {
      if (args.url.length > MAX_URL) {
        throw new Error(`URL must be under ${MAX_URL} characters`);
      }
      if (!validateUrl(args.url)) {
        throw new Error("Invalid URL format");
      }
    }

    // Look up user to get personalWorkspaceId
    const user = await ctx.db.get(args.userId);
    if (!user) throw new Error("User not found");
    const teamId = user.personalWorkspaceId;

    // Determine next order value
    const existing = await ctx.db
      .query("closerResources")
      .withIndex("by_team", (q) => q.eq("teamId", teamId))
      .collect();
    const maxOrder = existing.reduce((max, r) => Math.max(max, r.order), -1);

    const now = Date.now();
    const resourceId = await ctx.db.insert("closerResources", {
      teamId,
      type: args.type,
      title: args.title.trim(),
      description: args.description?.trim() || undefined,
      content: args.content || undefined,
      url: args.url?.trim() || undefined,
      order: maxOrder + 1,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });

    return { resourceId };
  },
});

// Update an existing B2C resource
export const updateResource = mutation({
  args: {
    userId: v.id("b2cUsers"),
    resourceId: v.id("closerResources"),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    content: v.optional(v.string()),
    url: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Validate lengths
    if (args.title !== undefined) {
      if (!args.title.trim() || args.title.length > MAX_TITLE) {
        throw new Error(`Title is required and must be under ${MAX_TITLE} characters`);
      }
    }
    if (args.description !== undefined && args.description.length > MAX_DESCRIPTION) {
      throw new Error(`Description must be under ${MAX_DESCRIPTION} characters`);
    }
    if (args.content !== undefined && args.content.length > MAX_CONTENT) {
      throw new Error(`Content must be under ${MAX_CONTENT} characters`);
    }
    if (args.url !== undefined && args.url.length > 0) {
      if (args.url.length > MAX_URL) {
        throw new Error(`URL must be under ${MAX_URL} characters`);
      }
      if (!validateUrl(args.url)) {
        throw new Error("Invalid URL format");
      }
    }

    // Look up user to verify ownership
    const user = await ctx.db.get(args.userId);
    if (!user) throw new Error("User not found");

    const resource = await ctx.db.get(args.resourceId);
    if (!resource) throw new Error("Resource not found");
    if (resource.teamId !== user.personalWorkspaceId) {
      throw new Error("Not authorized to modify this resource");
    }

    const updates: Record<string, unknown> = { updatedAt: Date.now() };
    if (args.title !== undefined) updates.title = args.title.trim();
    if (args.description !== undefined) updates.description = args.description.trim() || undefined;
    if (args.content !== undefined) updates.content = args.content || undefined;
    if (args.url !== undefined) updates.url = args.url.trim() || undefined;

    await ctx.db.patch(args.resourceId, updates);
    return { success: true };
  },
});

// Delete a B2C resource
export const deleteResource = mutation({
  args: {
    userId: v.id("b2cUsers"),
    resourceId: v.id("closerResources"),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) throw new Error("User not found");

    const resource = await ctx.db.get(args.resourceId);
    if (!resource) throw new Error("Resource not found");
    if (resource.teamId !== user.personalWorkspaceId) {
      throw new Error("Not authorized to delete this resource");
    }

    await ctx.db.delete(args.resourceId);
    return { success: true };
  },
});

// Reorder B2C resources
export const reorderResources = mutation({
  args: {
    userId: v.id("b2cUsers"),
    resourceIds: v.array(v.id("closerResources")),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) throw new Error("User not found");
    const teamId = user.personalWorkspaceId;

    // Validate all resources belong to this user
    for (let i = 0; i < args.resourceIds.length; i++) {
      const resource = await ctx.db.get(args.resourceIds[i]);
      if (!resource || resource.teamId !== teamId) {
        throw new Error("Invalid resource in reorder list");
      }
      await ctx.db.patch(args.resourceIds[i], {
        order: i,
        updatedAt: Date.now(),
      });
    }

    return { success: true };
  },
});
