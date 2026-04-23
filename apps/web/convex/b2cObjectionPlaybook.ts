import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";

// ==================== Constants + helpers ====================

const MAX_REBUTTAL_LEN = 1000;
const MAX_OBJECTION_LEN = 500;
const MAX_ANNOTATION_LEN = 500;
const MAX_TAGS = 8;
const MAX_TAG_LEN = 40;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

// Allowed tag set. Kept deliberately small in v1 so the filter UI is a fixed
// set of chips rather than a freeform tag cloud. We can grow this over time.
const ALLOWED_TAGS = new Set<string>([
  "price",
  "timing",
  "authority",
  "competitor",
  "closing",
  "trust",
  "spouse",
  "other",
]);

async function requireCoachBadge(
  ctx: { db: { get: (id: Id<"b2cUsers">) => Promise<Doc<"b2cUsers"> | null> } },
  coachUserId: Id<"b2cUsers">
): Promise<void> {
  const user = await ctx.db.get(coachUserId);
  if (!user) throw new Error("Coach user not found");
  const badges = user.badges ?? [];
  if (
    !badges.includes("coach") &&
    !badges.includes("founder") &&
    !badges.includes("admin")
  ) {
    throw new Error("Only coaches can modify Playbook entries");
  }
}

function sanitizeTags(tags: string[] | undefined): string[] {
  if (!tags || tags.length === 0) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags) {
    if (typeof raw !== "string") continue;
    const t = raw.trim().toLowerCase().slice(0, MAX_TAG_LEN);
    if (!t) continue;
    if (!ALLOWED_TAGS.has(t)) continue;
    if (seen.has(t)) continue;
    seen.add(t);
    out.push(t);
    if (out.length >= MAX_TAGS) break;
  }
  return out;
}

function validateText(label: string, value: string, maxLen: number): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error(`${label} is required`);
  if (trimmed.length > maxLen) {
    throw new Error(`${label} must be ${maxLen} characters or fewer`);
  }
  return trimmed;
}

// ==================== Queries ====================

export const listPlaybookEntries = query({
  args: {
    cursor: v.optional(v.number()),
    limit: v.optional(v.number()),
    tag: v.optional(v.string()),
    sortBy: v.optional(v.union(v.literal("top"), v.literal("newest"))),
    userId: v.optional(v.id("b2cUsers")),
  },
  handler: async (ctx, args) => {
    const limit = Math.min(Math.max(args.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
    const sortBy = args.sortBy ?? "top";
    const tagFilter = args.tag ? args.tag.toLowerCase() : null;
    const cursor = args.cursor ?? null;

    // Fetch featured entries first (always at top) — always newest-first
    // among featured so brand-new featured pins stand out. Then fetch the
    // main list according to sort preference.
    //
    // For a rebuttal library at realistic scale (<10k entries), pulling the
    // full list + filtering in-memory is fine and avoids index complexity.
    // If this grows by 100x we'd add a dedicated index per tag.
    const all = await ctx.db.query("b2cObjectionPlaybook").collect();

    let filtered = tagFilter
      ? all.filter((e) => e.tags.includes(tagFilter))
      : all;

    // Split into featured vs. rest. Featured always at top.
    const featured = filtered.filter((e) => e.featured);
    const rest = filtered.filter((e) => !e.featured);

    featured.sort((a, b) => b.createdAt - a.createdAt);
    if (sortBy === "top") {
      rest.sort((a, b) => b.voteCount - a.voteCount || b.createdAt - a.createdAt);
    } else {
      rest.sort((a, b) => b.createdAt - a.createdAt);
    }

    const combined = [...featured, ...rest];

    // Cursor is an index into the combined list. Simple and deterministic
    // since the query is called with the same sort every page load.
    const startIdx = cursor ?? 0;
    const pageSlice = combined.slice(startIdx, startIdx + limit);
    const nextCursor = startIdx + limit < combined.length ? startIdx + limit : null;

    // Fetch the caller's own votes for just this page so we can surface
    // `myVote: true` per entry — powers the optimistic upvote UI.
    let myVotes = new Set<string>();
    if (args.userId) {
      const voteRows = await ctx.db
        .query("b2cPlaybookVotes")
        .withIndex("by_user", (q) => q.eq("userId", args.userId as Id<"b2cUsers">))
        .collect();
      myVotes = new Set(voteRows.map((r) => r.entryId));
    }

    const items = pageSlice.map((e) => ({
      _id: e._id,
      rebuttalText: e.rebuttalText,
      objectionText: e.objectionText,
      authorUserId: e.authorUserId ?? null,
      authorName: e.authorName,
      tags: e.tags,
      sourceCallId: e.sourceCallId ?? null,
      voteCount: e.voteCount,
      coachAnnotation: e.coachAnnotation ?? null,
      featured: e.featured,
      createdBy: e.createdBy,
      createdAt: e.createdAt,
      updatedAt: e.updatedAt,
      myVote: myVotes.has(e._id),
    }));

    return { items, nextCursor };
  },
});

export const getPlaybookEntry = query({
  args: {
    entryId: v.id("b2cObjectionPlaybook"),
    userId: v.optional(v.id("b2cUsers")),
  },
  handler: async (ctx, args) => {
    const entry = await ctx.db.get(args.entryId);
    if (!entry) return null;
    let myVote = false;
    if (args.userId) {
      const vote = await ctx.db
        .query("b2cPlaybookVotes")
        .withIndex("by_entry_user", (q) =>
          q.eq("entryId", args.entryId).eq("userId", args.userId as Id<"b2cUsers">)
        )
        .first();
      myVote = !!vote;
    }
    return { ...entry, myVote };
  },
});

// ==================== Mutations ====================

// Coach-gated. Used by both the Objection Battle Royale auto-save path (after
// a round completes, the coach's client fires this for the winning rebuttal)
// and by the coach's manual "Add rebuttal" flow.
export const createPlaybookEntry = mutation({
  args: {
    coachUserId: v.id("b2cUsers"),
    rebuttalText: v.string(),
    objectionText: v.string(),
    authorUserId: v.optional(v.id("b2cUsers")),
    authorName: v.string(),
    tags: v.optional(v.array(v.string())),
    sourceCallId: v.optional(v.id("b2cCoachingCalls")),
    coachAnnotation: v.optional(v.string()),
    featured: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<{ entryId: Id<"b2cObjectionPlaybook"> }> => {
    await requireCoachBadge(ctx, args.coachUserId);

    const rebuttalText = validateText("Rebuttal", args.rebuttalText, MAX_REBUTTAL_LEN);
    const objectionText = validateText("Objection", args.objectionText, MAX_OBJECTION_LEN);
    const authorName = validateText("Author name", args.authorName, 120);
    const coachAnnotation =
      args.coachAnnotation && args.coachAnnotation.trim()
        ? args.coachAnnotation.trim().slice(0, MAX_ANNOTATION_LEN)
        : undefined;
    const tags = sanitizeTags(args.tags);

    const now = Date.now();
    const entryId = await ctx.db.insert("b2cObjectionPlaybook", {
      rebuttalText,
      objectionText,
      authorUserId: args.authorUserId,
      authorName,
      tags,
      sourceCallId: args.sourceCallId,
      voteCount: 0,
      coachAnnotation,
      featured: args.featured ?? false,
      createdBy: args.coachUserId,
      createdAt: now,
      updatedAt: now,
    });

    return { entryId };
  },
});

export const updatePlaybookEntry = mutation({
  args: {
    entryId: v.id("b2cObjectionPlaybook"),
    coachUserId: v.id("b2cUsers"),
    coachAnnotation: v.optional(v.string()),
    featured: v.optional(v.boolean()),
    tags: v.optional(v.array(v.string())),
    rebuttalText: v.optional(v.string()),
    objectionText: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{ success: boolean }> => {
    await requireCoachBadge(ctx, args.coachUserId);

    const existing = await ctx.db.get(args.entryId);
    if (!existing) throw new Error("Entry not found");

    const patch: Partial<Doc<"b2cObjectionPlaybook">> = { updatedAt: Date.now() };
    if (args.coachAnnotation !== undefined) {
      const trimmed = args.coachAnnotation.trim();
      patch.coachAnnotation = trimmed ? trimmed.slice(0, MAX_ANNOTATION_LEN) : undefined;
    }
    if (args.featured !== undefined) patch.featured = args.featured;
    if (args.tags !== undefined) patch.tags = sanitizeTags(args.tags);
    if (args.rebuttalText !== undefined) {
      patch.rebuttalText = validateText("Rebuttal", args.rebuttalText, MAX_REBUTTAL_LEN);
    }
    if (args.objectionText !== undefined) {
      patch.objectionText = validateText("Objection", args.objectionText, MAX_OBJECTION_LEN);
    }

    await ctx.db.patch(args.entryId, patch);
    return { success: true };
  },
});

export const deletePlaybookEntry = mutation({
  args: {
    entryId: v.id("b2cObjectionPlaybook"),
    coachUserId: v.id("b2cUsers"),
  },
  handler: async (ctx, args): Promise<{ success: boolean }> => {
    await requireCoachBadge(ctx, args.coachUserId);
    const existing = await ctx.db.get(args.entryId);
    if (!existing) return { success: true }; // idempotent — already gone

    // Cascade-delete votes to keep the table tight. There's no hard referential
    // constraint, but orphaned rows would still count toward vote queries.
    const votes = await ctx.db
      .query("b2cPlaybookVotes")
      .withIndex("by_entry_user", (q) => q.eq("entryId", args.entryId))
      .collect();
    for (const vote of votes) {
      await ctx.db.delete(vote._id);
    }

    await ctx.db.delete(args.entryId);
    return { success: true };
  },
});

// Any active subscriber can toggle their vote. Dedup is enforced via the
// `by_entry_user` index + an explicit lookup before insert/delete.
export const votePlaybookEntry = mutation({
  args: {
    entryId: v.id("b2cObjectionPlaybook"),
    userId: v.id("b2cUsers"),
  },
  handler: async (ctx, args): Promise<{ voted: boolean; voteCount: number }> => {
    const entry = await ctx.db.get(args.entryId);
    if (!entry) throw new Error("Entry not found");

    const existing = await ctx.db
      .query("b2cPlaybookVotes")
      .withIndex("by_entry_user", (q) =>
        q.eq("entryId", args.entryId).eq("userId", args.userId)
      )
      .first();

    if (existing) {
      await ctx.db.delete(existing._id);
      const nextCount = Math.max(0, entry.voteCount - 1);
      await ctx.db.patch(args.entryId, { voteCount: nextCount, updatedAt: Date.now() });
      return { voted: false, voteCount: nextCount };
    }

    await ctx.db.insert("b2cPlaybookVotes", {
      entryId: args.entryId,
      userId: args.userId,
      at: Date.now(),
    });
    const nextCount = entry.voteCount + 1;
    await ctx.db.patch(args.entryId, { voteCount: nextCount, updatedAt: Date.now() });
    return { voted: true, voteCount: nextCount };
  },
});
