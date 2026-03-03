import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

// List all published training modules, ordered by display order
export const listPublishedModules = query({
  args: {},
  handler: async (ctx) => {
    const modules = await ctx.db
      .query("b2cTrainingModules")
      .withIndex("by_published", (q) => q.eq("isPublished", true))
      .collect();

    // Resolve thumbnail URLs
    return Promise.all(
      modules.map(async (mod) => {
        let thumbnailUrl: string | null = null;
        if (mod.thumbnailStorageId) {
          thumbnailUrl = await ctx.storage.getUrl(
            mod.thumbnailStorageId as any
          );
        }
        return { ...mod, thumbnailUrl };
      })
    );
  },
});

// List published lessons for a specific module, ordered by lesson order
export const listModuleLessons = query({
  args: { moduleId: v.id("b2cTrainingModules") },
  handler: async (ctx, { moduleId }) => {
    const lessons = await ctx.db
      .query("b2cTrainingLessons")
      .withIndex("by_module", (q) => q.eq("moduleId", moduleId))
      .collect();

    return lessons.filter((l) => l.isPublished);
  },
});

// Seed training modules — idempotent, skips if data already exists
export const seedTrainingModules = mutation({
  args: {},
  handler: async (ctx) => {
    const existing = await ctx.db
      .query("b2cTrainingModules")
      .first();
    if (existing) return { seeded: false, message: "Modules already exist" };

    const now = Date.now();

    const modulesData = [
      {
        title: "Cold Calling Mastery",
        description: "Master the art of cold calling with proven frameworks, killer opening lines, and strategies to get past gatekeepers.",
        order: 1,
        lessons: [
          { title: "7-Step Cold Calling Framework", videoUrl: "https://www.youtube.com/watch?v=VXOP1HCfeBs", durationSeconds: 720, order: 1 },
          { title: "Best Opening Lines That Work", videoUrl: "https://www.youtube.com/watch?v=2-MKq96zN7g", durationSeconds: 600, order: 2 },
          { title: "Handling Gatekeepers Like a Pro", videoUrl: "https://www.youtube.com/watch?v=pJr7PQLA0Ec", durationSeconds: 540, order: 3 },
        ],
      },
      {
        title: "Objection Handling",
        description: "Turn objections into opportunities. Learn frameworks for the most common objections that kill deals.",
        order: 2,
        lessons: [
          { title: "Top 5 Objections & Responses", videoUrl: "https://www.youtube.com/watch?v=Dbsxu4KMsWA", durationSeconds: 900, order: 1 },
          { title: '"I Need to Think About It"', videoUrl: "https://www.youtube.com/watch?v=vr-sFoKawTE", durationSeconds: 660, order: 2 },
          { title: "Price Objection Framework", videoUrl: "https://www.youtube.com/watch?v=jNK0L9bR_x8", durationSeconds: 780, order: 3 },
        ],
      },
      {
        title: "High-Ticket Closing",
        description: "Close deals at $3K–$50K+ with confidence. Discovery call frameworks, first-call closes, and high-ticket psychology.",
        order: 3,
        lessons: [
          { title: "How to Sell High Ticket", videoUrl: "https://www.youtube.com/watch?v=64sIxpJga3s", durationSeconds: 840, order: 1 },
          { title: "Discovery Call Framework", videoUrl: "https://www.youtube.com/watch?v=lhkXPjKgSoU", durationSeconds: 720, order: 2 },
          { title: "Closing on the First Call", videoUrl: "https://www.youtube.com/watch?v=KfOAv6JRMGM", durationSeconds: 600, order: 3 },
        ],
      },
      {
        title: "Sales Mindset & Performance",
        description: "Build the mental game of a top 1% closer. Morning routines, motivation, and unshakable confidence.",
        order: 4,
        lessons: [
          { title: "Morning Routine for Closers", videoUrl: "https://www.youtube.com/watch?v=UBod2DFYC-U", durationSeconds: 480, order: 1 },
          { title: "Staying Motivated Through Rejection", videoUrl: "https://www.youtube.com/watch?v=3HEATL0jZBc", durationSeconds: 540, order: 2 },
          { title: "Building Unshakable Confidence", videoUrl: "https://www.youtube.com/watch?v=l-gQLqv9f4o", durationSeconds: 600, order: 3 },
        ],
      },
    ];

    for (const mod of modulesData) {
      const moduleId = await ctx.db.insert("b2cTrainingModules", {
        title: mod.title,
        description: mod.description,
        order: mod.order,
        lessonCount: mod.lessons.length,
        isPublished: true,
        createdAt: now,
        updatedAt: now,
      });

      for (const lesson of mod.lessons) {
        await ctx.db.insert("b2cTrainingLessons", {
          moduleId,
          title: lesson.title,
          videoUrl: lesson.videoUrl,
          durationSeconds: lesson.durationSeconds,
          order: lesson.order,
          isPublished: true,
          createdAt: now,
          updatedAt: now,
        });
      }
    }

    return { seeded: true, message: "Seeded 4 modules with 12 lessons" };
  },
});
