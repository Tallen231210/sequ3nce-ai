import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

const MAX_TEXT_LENGTH = 2000;

const VALID_SCREENS = [
  "Dashboard", "Stats", "Calls", "Highlights", "Content Review",
  "Schedule", "Resources", "Job Board", "Profile", "Community",
  "Settings", "Stream", "Other",
];

// ==================== Mutations ====================

/** Submit a bug report. Private — only visible to the author and admins. */
export const submitBugReport = mutation({
  args: {
    authorId: v.id("b2cUsers"),
    authorEmail: v.string(),
    whatHappened: v.string(),
    whatWereDoing: v.string(),
    whichScreen: v.string(),
    appVersion: v.optional(v.string()),
    platform: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const whatHappened = args.whatHappened.trim();
    const whatWereDoing = args.whatWereDoing.trim();

    if (!whatHappened || whatHappened.length > MAX_TEXT_LENGTH) {
      throw new Error("'What happened?' is required and must be under 2000 characters");
    }
    if (!whatWereDoing || whatWereDoing.length > MAX_TEXT_LENGTH) {
      throw new Error("'What were you trying to do?' is required and must be under 2000 characters");
    }
    if (!VALID_SCREENS.includes(args.whichScreen)) {
      throw new Error("Please select a valid screen");
    }

    const user = await ctx.db.get(args.authorId);
    if (!user) throw new Error("User not found");

    const id = await ctx.db.insert("b2cBugReports", {
      authorId: args.authorId,
      authorEmail: args.authorEmail,
      whatHappened,
      whatWereDoing,
      whichScreen: args.whichScreen,
      appVersion: args.appVersion,
      platform: args.platform,
      status: "new",
      createdAt: Date.now(),
    });

    return id;
  },
});

// ==================== Queries ====================

/** Get a user's own bug reports. Users can only see their own. */
export const getMyReports = query({
  args: { authorId: v.id("b2cUsers") },
  handler: async (ctx, { authorId }) => {
    return ctx.db
      .query("b2cBugReports")
      .withIndex("by_author", (q) => q.eq("authorId", authorId))
      .order("desc")
      .take(50);
  },
});

/** List all bug reports. Admin/founder only (enforced at HTTP route level). */
export const listReports = query({
  args: {
    status: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { status, limit }) => {
    const take = Math.min(limit ?? 50, 200);
    if (status) {
      return ctx.db
        .query("b2cBugReports")
        .withIndex("by_status", (q) => q.eq("status", status))
        .order("desc")
        .take(take);
    }
    return ctx.db
      .query("b2cBugReports")
      .order("desc")
      .take(take);
  },
});
