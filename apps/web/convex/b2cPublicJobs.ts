import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

const MAX_TITLE = 200;
const MAX_COMPANY = 100;
const MAX_LOCATION = 100;
const MAX_SALARY = 100;
const MAX_DESCRIPTION = 2000;
const MAX_URL = 500;

const VALID_INDUSTRIES = [
  "Solar", "Insurance", "Real Estate", "SaaS", "Coaching",
  "Agency", "Info Products", "E-Commerce", "Financial Services", "Other",
];

function isFounder(user: any): boolean {
  const badges = user?.badges as string[] | undefined;
  return !!badges?.includes("founder") || !!badges?.includes("admin");
}

// ==================== Admin Mutations (Founder Only) ====================

/** Add a public job listing. Founder only. */
export const addJob = mutation({
  args: {
    userId: v.id("b2cUsers"),
    companyName: v.string(),
    title: v.string(),
    location: v.string(),
    salaryRange: v.optional(v.string()),
    industry: v.string(),
    description: v.optional(v.string()),
    applyUrl: v.string(),
    source: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user || !isFounder(user)) throw new Error("Only founders can add jobs");

    const company = args.companyName.trim();
    const title = args.title.trim();
    const location = args.location.trim();
    const applyUrl = args.applyUrl.trim();

    if (!company || company.length > MAX_COMPANY) throw new Error("Company name required (max 100 chars)");
    if (!title || title.length > MAX_TITLE) throw new Error("Job title required (max 200 chars)");
    if (!location || location.length > MAX_LOCATION) throw new Error("Location required (max 100 chars)");
    if (!applyUrl || !applyUrl.startsWith("https://")) throw new Error("Apply URL must start with https://");
    if (applyUrl.length > MAX_URL) throw new Error("URL too long (max 500 chars)");
    if (!VALID_INDUSTRIES.includes(args.industry)) throw new Error("Invalid industry");
    if (args.description && args.description.length > MAX_DESCRIPTION) throw new Error("Description too long (max 2000 chars)");
    if (args.salaryRange && args.salaryRange.length > MAX_SALARY) throw new Error("Salary range too long (max 100 chars)");

    const now = Date.now();
    const id = await ctx.db.insert("b2cPublicJobs", {
      companyName: company,
      title,
      location,
      salaryRange: args.salaryRange?.trim() || undefined,
      industry: args.industry,
      description: args.description?.trim() || undefined,
      applyUrl,
      source: args.source?.trim() || undefined,
      addedBy: args.userId,
      status: "active",
      createdAt: now,
      updatedAt: now,
    });

    return id;
  },
});

/** Edit a public job listing. Founder only. */
export const editJob = mutation({
  args: {
    userId: v.id("b2cUsers"),
    jobId: v.id("b2cPublicJobs"),
    companyName: v.optional(v.string()),
    title: v.optional(v.string()),
    location: v.optional(v.string()),
    salaryRange: v.optional(v.string()),
    industry: v.optional(v.string()),
    description: v.optional(v.string()),
    applyUrl: v.optional(v.string()),
    source: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user || !isFounder(user)) throw new Error("Only founders can edit jobs");

    const job = await ctx.db.get(args.jobId);
    if (!job) throw new Error("Job not found");

    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (args.companyName !== undefined) patch.companyName = args.companyName.trim();
    if (args.title !== undefined) patch.title = args.title.trim();
    if (args.location !== undefined) patch.location = args.location.trim();
    if (args.salaryRange !== undefined) patch.salaryRange = args.salaryRange.trim() || undefined;
    if (args.industry !== undefined) {
      if (!VALID_INDUSTRIES.includes(args.industry)) throw new Error("Invalid industry");
      patch.industry = args.industry;
    }
    if (args.description !== undefined) patch.description = args.description.trim() || undefined;
    if (args.applyUrl !== undefined) {
      const url = args.applyUrl.trim();
      if (!url.startsWith("https://")) throw new Error("Apply URL must start with https://");
      patch.applyUrl = url;
    }
    if (args.source !== undefined) patch.source = args.source.trim() || undefined;

    await ctx.db.patch(args.jobId, patch);
    return { success: true };
  },
});

/** Close a job listing. Founder only. */
export const closeJob = mutation({
  args: { userId: v.id("b2cUsers"), jobId: v.id("b2cPublicJobs") },
  handler: async (ctx, { userId, jobId }) => {
    const user = await ctx.db.get(userId);
    if (!user || !isFounder(user)) throw new Error("Only founders can close jobs");
    const job = await ctx.db.get(jobId);
    if (!job) throw new Error("Job not found");
    await ctx.db.patch(jobId, { status: "closed", updatedAt: Date.now() });
    return { success: true };
  },
});

/** Delete a job listing permanently. Founder only. */
export const deleteJob = mutation({
  args: { userId: v.id("b2cUsers"), jobId: v.id("b2cPublicJobs") },
  handler: async (ctx, { userId, jobId }) => {
    const user = await ctx.db.get(userId);
    if (!user || !isFounder(user)) throw new Error("Only founders can delete jobs");
    const job = await ctx.db.get(jobId);
    if (!job) throw new Error("Job not found");
    // Also delete all tracking records for this job
    const tracking = await ctx.db
      .query("b2cPublicJobTracking")
      .filter((q) => q.eq(q.field("jobId"), jobId))
      .collect();
    for (const t of tracking) await ctx.db.delete(t._id);
    await ctx.db.delete(jobId);
    return { success: true };
  },
});

// ==================== User Mutations ====================

/** Update tracking (saved/applied/interviewed) for a job. Upserts. */
export const updateTracking = mutation({
  args: {
    userId: v.id("b2cUsers"),
    jobId: v.id("b2cPublicJobs"),
    saved: v.optional(v.boolean()),
    applied: v.optional(v.boolean()),
    interviewed: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("b2cPublicJobTracking")
      .withIndex("by_user_job", (q) => q.eq("userId", args.userId).eq("jobId", args.jobId))
      .first();

    if (existing) {
      const patch: Record<string, unknown> = { updatedAt: Date.now() };
      if (args.saved !== undefined) patch.saved = args.saved;
      if (args.applied !== undefined) patch.applied = args.applied;
      if (args.interviewed !== undefined) patch.interviewed = args.interviewed;
      await ctx.db.patch(existing._id, patch);
      return existing._id;
    }

    const id = await ctx.db.insert("b2cPublicJobTracking", {
      jobId: args.jobId,
      userId: args.userId,
      saved: args.saved ?? false,
      applied: args.applied ?? false,
      interviewed: args.interviewed ?? false,
      updatedAt: Date.now(),
    });
    return id;
  },
});

// ==================== Queries ====================

/** List active public jobs. Enriched with user's tracking status. */
export const listJobs = query({
  args: {
    userId: v.optional(v.id("b2cUsers")),
    industry: v.optional(v.string()),
  },
  handler: async (ctx, { userId, industry }) => {
    let jobs;
    if (industry && VALID_INDUSTRIES.includes(industry)) {
      jobs = await ctx.db
        .query("b2cPublicJobs")
        .withIndex("by_industry", (q) => q.eq("status", "active").eq("industry", industry))
        .order("desc")
        .collect();
    } else {
      jobs = await ctx.db
        .query("b2cPublicJobs")
        .withIndex("by_status", (q) => q.eq("status", "active"))
        .order("desc")
        .collect();
    }

    if (!userId) {
      return jobs.map((j) => ({ ...j, tracking: null }));
    }

    // Get all tracking records for this user in one query
    const allTracking = await ctx.db
      .query("b2cPublicJobTracking")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const trackingByJob = new Map(allTracking.map((t) => [t.jobId, t]));

    return jobs.map((j) => ({
      ...j,
      tracking: trackingByJob.get(j._id) ?? null,
    }));
  },
});
