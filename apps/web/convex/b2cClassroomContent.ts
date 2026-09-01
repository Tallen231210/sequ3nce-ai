import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";

// ============================================================================
// Coach Classrooms — content management. Coaches CRUD their OWN modules and
// lessons; the global house library (coachId undefined) stays founder-only
// through the existing surfaces. Every mutation re-verifies ownership
// server-side — never trust the client's coachId.
// ============================================================================

const MAX_TITLE = 200;
const MAX_DESC = 2000;

function isFounder(user: Doc<"b2cUsers"> | null): boolean {
  return !!user?.badges?.includes("founder");
}

/** The caller's coach profile, or throw. Founders may act on any classroom. */
async function requireOwnership(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"b2cUsers">,
  moduleCoachId: Id<"b2cCoaches"> | undefined,
): Promise<void> {
  const user = await ctx.db.get(userId);
  if (isFounder(user)) return;
  if (!moduleCoachId) throw new Error("The house library is founder-managed");
  const coach = await ctx.db.get(moduleCoachId);
  if (!coach || coach.userId !== userId) {
    throw new Error("You can only manage your own classroom's content");
  }
}

function checkTitle(title: string): string {
  const t = title.trim();
  if (t.length < 2 || t.length > MAX_TITLE) throw new Error(`Title must be 2-${MAX_TITLE} characters`);
  return t;
}

function checkVideoUrl(url: string): string {
  const u = url.trim();
  if (!u.startsWith("https://")) throw new Error("Video URL must be https");
  if (u.length > 1000) throw new Error("Video URL too long");
  return u;
}

// ==================== Member-facing ====================

/**
 * Published modules of one coach's classroom, tier-filtered: free members
 * see free modules; the coach and founders see everything (including
 * unpublished, flagged so the UI can badge drafts).
 */
export const listClassroomModules = query({
  args: { userId: v.id("b2cUsers"), coachId: v.id("b2cCoaches") },
  handler: async (ctx, args) => {
    const coach = await ctx.db.get(args.coachId);
    if (!coach) return [];
    const user = await ctx.db.get(args.userId);
    const viewerIsOwner = coach.userId === args.userId || isFounder(user);

    const membership = await ctx.db
      .query("b2cClassroomMemberships")
      .withIndex("by_coach_user", (q) => q.eq("coachId", args.coachId).eq("userId", args.userId))
      .first();
    if (!membership && !viewerIsOwner) return [];
    const memberTier = membership?.tier ?? "free";

    const modules = await ctx.db
      .query("b2cTrainingModules")
      .withIndex("by_coach", (q) => q.eq("coachId", args.coachId))
      .collect();

    return Promise.all(
      modules
        .filter((m) => viewerIsOwner || (m.isPublished && ((m.tier ?? "free") === "free" || memberTier === "premium")))
        .sort((a, b) => a.order - b.order)
        .map(async (m) => ({
          ...m,
          thumbnailUrl: m.thumbnailStorageId
            ? await ctx.storage.getUrl(m.thumbnailStorageId as any)
            : null,
        })),
    );
  },
});

// ==================== Coach CRUD ====================

export const createModule = mutation({
  args: {
    userId: v.id("b2cUsers"),
    coachId: v.id("b2cCoaches"),
    title: v.string(),
    description: v.optional(v.string()),
    tier: v.optional(v.union(v.literal("free"), v.literal("premium"))),
  },
  handler: async (ctx, args) => {
    await requireOwnership(ctx, args.userId, args.coachId);
    const title = checkTitle(args.title);
    if (args.description && args.description.length > MAX_DESC) throw new Error("Description too long");

    const siblings = await ctx.db
      .query("b2cTrainingModules")
      .withIndex("by_coach", (q) => q.eq("coachId", args.coachId))
      .collect();
    const order = siblings.length ? Math.max(...siblings.map((m) => m.order)) + 1 : 1;

    const moduleId = await ctx.db.insert("b2cTrainingModules", {
      title,
      description: args.description?.trim(),
      order,
      lessonCount: 0,
      isPublished: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      coachId: args.coachId,
      tier: args.tier ?? "free",
    });
    return { moduleId };
  },
});

export const updateModule = mutation({
  args: {
    userId: v.id("b2cUsers"),
    moduleId: v.id("b2cTrainingModules"),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    isPublished: v.optional(v.boolean()),
    order: v.optional(v.number()),
    tier: v.optional(v.union(v.literal("free"), v.literal("premium"))),
  },
  handler: async (ctx, args) => {
    const mod = await ctx.db.get(args.moduleId);
    if (!mod) throw new Error("Module not found");
    await requireOwnership(ctx, args.userId, mod.coachId);

    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (args.title !== undefined) patch.title = checkTitle(args.title);
    if (args.description !== undefined) {
      if (args.description.length > MAX_DESC) throw new Error("Description too long");
      patch.description = args.description.trim();
    }
    if (args.isPublished !== undefined) patch.isPublished = args.isPublished;
    if (args.order !== undefined) patch.order = args.order;
    if (args.tier !== undefined) patch.tier = args.tier;
    await ctx.db.patch(args.moduleId, patch);
    return { updated: true };
  },
});

export const deleteModule = mutation({
  args: { userId: v.id("b2cUsers"), moduleId: v.id("b2cTrainingModules") },
  handler: async (ctx, args) => {
    const mod = await ctx.db.get(args.moduleId);
    if (!mod) throw new Error("Module not found");
    await requireOwnership(ctx, args.userId, mod.coachId);

    const lessons = await ctx.db
      .query("b2cTrainingLessons")
      .withIndex("by_module", (q) => q.eq("moduleId", args.moduleId))
      .collect();
    for (const l of lessons) await ctx.db.delete(l._id);
    await ctx.db.delete(args.moduleId);
    return { deleted: true, lessonsDeleted: lessons.length };
  },
});

export const addLesson = mutation({
  args: {
    userId: v.id("b2cUsers"),
    moduleId: v.id("b2cTrainingModules"),
    title: v.string(),
    videoUrl: v.string(),
    description: v.optional(v.string()),
    durationSeconds: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const mod = await ctx.db.get(args.moduleId);
    if (!mod) throw new Error("Module not found");
    await requireOwnership(ctx, args.userId, mod.coachId);
    const title = checkTitle(args.title);
    const videoUrl = checkVideoUrl(args.videoUrl);
    if (args.description && args.description.length > MAX_DESC) throw new Error("Description too long");

    const siblings = await ctx.db
      .query("b2cTrainingLessons")
      .withIndex("by_module", (q) => q.eq("moduleId", args.moduleId))
      .collect();
    const order = siblings.length ? Math.max(...siblings.map((l) => l.order)) + 1 : 1;

    const lessonId = await ctx.db.insert("b2cTrainingLessons", {
      moduleId: args.moduleId,
      title,
      description: args.description?.trim(),
      videoUrl,
      durationSeconds: args.durationSeconds,
      order,
      isPublished: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    await ctx.db.patch(args.moduleId, {
      lessonCount: siblings.length + 1,
      updatedAt: Date.now(),
    });
    return { lessonId };
  },
});

export const deleteLesson = mutation({
  args: { userId: v.id("b2cUsers"), lessonId: v.id("b2cTrainingLessons") },
  handler: async (ctx, args) => {
    const lesson = await ctx.db.get(args.lessonId);
    if (!lesson) throw new Error("Lesson not found");
    const mod = await ctx.db.get(lesson.moduleId);
    if (!mod) throw new Error("Module not found");
    await requireOwnership(ctx, args.userId, mod.coachId);

    await ctx.db.delete(args.lessonId);
    await ctx.db.patch(mod._id, {
      lessonCount: Math.max(0, mod.lessonCount - 1),
      updatedAt: Date.now(),
    });
    return { deleted: true };
  },
});

/**
 * Promote a classroom replay into a curated lesson: the recording URL
 * becomes a lesson in one of the coach's own modules.
 */
export const promoteReplayToLesson = mutation({
  args: {
    userId: v.id("b2cUsers"),
    callId: v.id("b2cCoachingCalls"),
    moduleId: v.id("b2cTrainingModules"),
    title: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const call = await ctx.db.get(args.callId);
    if (!call) throw new Error("Call not found");
    const user = await ctx.db.get(args.userId);
    if (call.coachUserId !== args.userId && !isFounder(user)) {
      throw new Error("Only the call's coach can promote it");
    }
    if (call.recordingStatus !== "ready" || !call.recordingUrl) {
      throw new Error("Recording isn't ready yet");
    }
    const mod = await ctx.db.get(args.moduleId);
    if (!mod) throw new Error("Module not found");
    await requireOwnership(ctx, args.userId, mod.coachId);

    const siblings = await ctx.db
      .query("b2cTrainingLessons")
      .withIndex("by_module", (q) => q.eq("moduleId", args.moduleId))
      .collect();
    const lessonId = await ctx.db.insert("b2cTrainingLessons", {
      moduleId: args.moduleId,
      title: checkTitle(args.title ?? call.title),
      description: call.description,
      videoUrl: call.recordingUrl,
      order: siblings.length ? Math.max(...siblings.map((l) => l.order)) + 1 : 1,
      isPublished: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    await ctx.db.patch(args.moduleId, {
      lessonCount: siblings.length + 1,
      updatedAt: Date.now(),
    });
    return { lessonId };
  },
});
