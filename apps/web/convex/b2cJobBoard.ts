import { v } from "convex/values";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

// ==================== Validation Constants ====================

const MAX_TITLE = 200;
const MAX_DESCRIPTION = 5000;
const MAX_OTE = 100;
const MAX_CONTACT_EMAIL = 254;
const MAX_CONTACT_URL = 500;
const MAX_SKILLS = 20;
const MAX_SKILL_LENGTH = 50;

const VALID_INDUSTRIES = [
  "Solar", "Insurance", "Real Estate", "SaaS", "Coaching",
  "Agency", "Info Products", "E-Commerce", "Financial Services", "Other",
];

const VALID_TICKET_RANGES = [
  "Under $1k", "$1k-$3k", "$3k-$10k", "$10k-$25k", "$25k-$50k", "$50k+",
];

const FREEHIRE_STAGES = ["saved", "preparing", "applied", "interviewing"] as const;
const MAX_EXTERNAL_JOB_ID = 240;
const MAX_JOB_FIELD = 300;
const MAX_JOB_URL = 2048;
const MAX_NOTE = 2000;

const freeHireJobSnapshotValidator = v.object({
  title: v.string(),
  company: v.string(),
  logoUrl: v.optional(v.string()),
  location: v.string(),
  applyUrl: v.string(),
  source: v.string(),
  workMode: v.string(),
  salary: v.string(),
  employmentType: v.string(),
  seniority: v.string(),
  postedAt: v.optional(v.string()),
});

function cleanFreeHireText(value: string, field: string): string {
  const cleaned = value.trim();
  if (!cleaned || cleaned.length > MAX_JOB_FIELD) {
    throw new Error(`${field} is required and must be ${MAX_JOB_FIELD} characters or fewer`);
  }
  return cleaned;
}

function cleanFreeHireUrl(value: string, field: string, optional = false): string | undefined {
  const cleaned = value.trim();
  if (!cleaned && optional) return undefined;
  if (cleaned.length > MAX_JOB_URL) throw new Error(`${field} is too long`);
  try {
    const url = new URL(cleaned);
    if (url.protocol !== "https:") throw new Error();
  } catch {
    throw new Error(`${field} must be a valid HTTPS URL`);
  }
  return cleaned;
}

// ==================== FreeHire development tracking ====================

/** Only callable from authenticated HTTP actions; never exposed directly. */
export const listFreeHireTracking = internalQuery({
  args: { userId: v.id("b2cUsers") },
  handler: async (ctx, { userId }) =>
    ctx.db
      .query("b2cFreeHireJobTracking")
      .withIndex("by_user_updated", (q) => q.eq("userId", userId))
      .order("desc")
      .collect(),
});

/**
 * Upsert one complete activity record. Sending no stage, no note and
 * dismissed=false removes the record, making restore/remove idempotent.
 */
export const upsertFreeHireTracking = internalMutation({
  args: {
    userId: v.id("b2cUsers"),
    externalJobId: v.string(),
    stage: v.optional(v.string()),
    note: v.optional(v.string()),
    dismissed: v.boolean(),
    job: freeHireJobSnapshotValidator,
  },
  handler: async (ctx, args) => {
    const externalJobId = args.externalJobId.trim();
    if (!externalJobId || externalJobId.length > MAX_EXTERNAL_JOB_ID) {
      throw new Error("Invalid external job identifier");
    }
    if (args.stage && !FREEHIRE_STAGES.includes(args.stage as typeof FREEHIRE_STAGES[number])) {
      throw new Error("Invalid application stage");
    }
    const note = args.note?.trim() || undefined;
    if (note && note.length > MAX_NOTE) throw new Error(`Notes must be ${MAX_NOTE} characters or fewer`);

    const job = {
      title: cleanFreeHireText(args.job.title, "Job title"),
      company: cleanFreeHireText(args.job.company, "Company"),
      logoUrl: cleanFreeHireUrl(args.job.logoUrl || "", "Logo URL", true),
      location: cleanFreeHireText(args.job.location, "Location"),
      applyUrl: cleanFreeHireUrl(args.job.applyUrl, "Apply URL")!,
      source: cleanFreeHireText(args.job.source, "Source"),
      workMode: cleanFreeHireText(args.job.workMode, "Work mode"),
      salary: cleanFreeHireText(args.job.salary, "Salary"),
      employmentType: cleanFreeHireText(args.job.employmentType, "Employment type"),
      seniority: cleanFreeHireText(args.job.seniority, "Seniority"),
      postedAt: args.job.postedAt
        ? cleanFreeHireText(args.job.postedAt, "Posted date")
        : undefined,
    };

    const current = await ctx.db
      .query("b2cFreeHireJobTracking")
      .withIndex("by_user_job", (q) =>
        q.eq("userId", args.userId).eq("externalJobId", externalJobId),
      )
      .unique();

    if (!args.stage && !note && !args.dismissed) {
      if (current) await ctx.db.delete(current._id);
      return { removed: true as const };
    }

    const now = Date.now();
    const stageChangedAt = current && current.stage === args.stage
      ? current.stageChangedAt
      : now;
    const value = {
      userId: args.userId,
      externalJobId,
      stage: args.stage,
      note,
      dismissed: args.dismissed,
      job,
      updatedAt: now,
      stageChangedAt,
    };
    if (current) {
      await ctx.db.patch(current._id, value);
      return { id: current._id, removed: false as const };
    }
    const id = await ctx.db.insert("b2cFreeHireJobTracking", {
      ...value,
      createdAt: now,
    });
    return { id, removed: false as const };
  },
});

// ==================== Queries ====================

/** List all postings for a team (B2B dashboard) */
export const listTeamPostings = query({
  args: { teamId: v.id("teams") },
  handler: async (ctx, { teamId }) => {
    const postings = await ctx.db
      .query("b2cJobPostings")
      .withIndex("by_team", (q) => q.eq("teamId", teamId))
      .collect();

    // Sort newest first (index sorts by status then createdAt)
    return postings.sort((a, b) => b.createdAt - a.createdAt);
  },
});

/** Get a single posting by ID */
export const getJobPosting = query({
  args: { postingId: v.id("b2cJobPostings") },
  handler: async (ctx, { postingId }) => {
    const posting = await ctx.db.get(postingId);
    if (!posting) return null;

    // Enrich with team name
    const team = await ctx.db.get(posting.teamId);
    return { ...posting, teamName: team?.name || "Unknown Company" };
  },
});

/** List open postings for B2C closers to browse */
export const listOpenPostings = query({
  args: {
    industry: v.optional(v.string()),
    ticketRange: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { industry, ticketRange, limit }) => {
    const pageLimit = Math.min(limit || 50, 100);

    let postings;
    if (industry) {
      postings = await ctx.db
        .query("b2cJobPostings")
        .withIndex("by_status_industry", (q) =>
          q.eq("status", "open").eq("industry", industry)
        )
        .order("desc")
        .take(pageLimit);
    } else {
      postings = await ctx.db
        .query("b2cJobPostings")
        .withIndex("by_status", (q) => q.eq("status", "open"))
        .order("desc")
        .take(pageLimit);
    }

    // Apply ticketRange filter in memory (not indexed)
    if (ticketRange) {
      postings = postings.filter((p) => p.ticketRange === ticketRange);
    }

    // Enrich with team names
    const enriched = await Promise.all(
      postings.map(async (p) => {
        const team = await ctx.db.get(p.teamId);
        return { ...p, teamName: team?.name || "Unknown Company" };
      })
    );

    return enriched;
  },
});

/** List closers who expressed interest in a posting (B2B dashboard) */
export const getInterestedClosers = query({
  args: {
    postingId: v.id("b2cJobPostings"),
    teamId: v.id("teams"),
  },
  handler: async (ctx, { postingId, teamId }) => {
    // Verify team owns this posting
    const posting = await ctx.db.get(postingId);
    if (!posting || posting.teamId !== teamId) return [];

    const interests = await ctx.db
      .query("b2cJobInterests")
      .withIndex("by_job", (q) => q.eq("jobPostingId", postingId))
      .collect();

    // Enrich with closer profile data
    const closers = await Promise.all(
      interests.map(async (interest) => {
        const user = await ctx.db.get(interest.b2cUserId);
        if (!user) return null;

        const profile = await ctx.db
          .query("b2cProfiles")
          .withIndex("by_user", (q) => q.eq("userId", interest.b2cUserId))
          .first();

        let photoUrl: string | null = null;
        if (profile?.photoStorageId) {
          photoUrl = await ctx.storage.getUrl(profile.photoStorageId);
        }

        return {
          interestId: interest._id,
          userId: interest.b2cUserId,
          name: user.name,
          email: user.email,
          profileSlug: user.profileSlug,
          photoUrl,
          headline: profile?.headline,
          isVerified: profile?.isManuallyVerified || false,
          stats: profile?.manualStats || null,
          industries: profile?.industries,
          ticketRange: profile?.ticketRange,
          expressedAt: interest.createdAt,
        };
      })
    );

    return closers.filter(Boolean);
  },
});

/** Jobs the closer has expressed interest in (B2C app) */
export const getMyInterests = query({
  args: { b2cUserId: v.id("b2cUsers") },
  handler: async (ctx, { b2cUserId }) => {
    const interests = await ctx.db
      .query("b2cJobInterests")
      .withIndex("by_user", (q) => q.eq("b2cUserId", b2cUserId))
      .order("desc")
      .collect();

    // Enrich with posting data
    const enriched = await Promise.all(
      interests.map(async (interest) => {
        const posting = await ctx.db.get(interest.jobPostingId);
        if (!posting) return null;

        const team = await ctx.db.get(posting.teamId);
        return {
          ...interest,
          posting: { ...posting, teamName: team?.name || "Unknown Company" },
        };
      })
    );

    return enriched.filter(Boolean);
  },
});

/** Check if a closer has expressed interest in a specific posting */
export const getInterestStatus = query({
  args: {
    postingId: v.id("b2cJobPostings"),
    b2cUserId: v.id("b2cUsers"),
  },
  handler: async (ctx, { postingId, b2cUserId }) => {
    const interest = await ctx.db
      .query("b2cJobInterests")
      .withIndex("by_job_user", (q) =>
        q.eq("jobPostingId", postingId).eq("b2cUserId", b2cUserId)
      )
      .first();

    return { interested: !!interest };
  },
});

/** Talent directory — all available closers with public profiles (B2B dashboard) */
export const listTalentDirectory = query({
  args: {
    industry: v.optional(v.string()),
    ticketRange: v.optional(v.string()),
    searchName: v.optional(v.string()),
  },
  handler: async (ctx, { industry, ticketRange, searchName }) => {
    // Get all public profiles
    const profiles = await ctx.db
      .query("b2cProfiles")
      .withIndex("by_public", (q) => q.eq("isPublic", true))
      .collect();

    // Filter to available closers only
    let available = profiles.filter((p) => p.isAvailable);

    // Apply filters
    if (industry) {
      available = available.filter(
        (p) => p.industries && p.industries.includes(industry)
      );
    }
    if (ticketRange) {
      available = available.filter((p) => p.ticketRange === ticketRange);
    }

    // Enrich with user data
    let enriched = await Promise.all(
      available.map(async (profile) => {
        const user = await ctx.db.get(profile.userId);
        if (!user) return null;

        let photoUrl: string | null = null;
        if (profile.photoStorageId) {
          photoUrl = await ctx.storage.getUrl(profile.photoStorageId);
        }

        return {
          userId: profile.userId,
          name: user.name,
          email: user.email,
          profileSlug: user.profileSlug,
          photoUrl,
          headline: profile.headline,
          isVerified: profile.isManuallyVerified || false,
          stats: profile.manualStats || null,
          statsSource: profile.statsSource,
          industries: profile.industries,
          ticketRange: profile.ticketRange,
          skills: profile.skills,
          isAvailable: profile.isAvailable,
        };
      })
    );

    // Filter out nulls and apply name search
    let results = enriched.filter(Boolean) as NonNullable<(typeof enriched)[number]>[];

    if (searchName) {
      const query = searchName.toLowerCase();
      results = results.filter((r) => r.name.toLowerCase().includes(query));
    }

    return results;
  },
});

// ==================== Mutations ====================

/** Create a new job posting (B2B dashboard) */
export const createJobPosting = mutation({
  args: {
    teamId: v.id("teams"),
    createdBy: v.string(),
    title: v.string(),
    description: v.string(),
    industry: v.optional(v.string()),
    ticketRange: v.optional(v.string()),
    ote: v.optional(v.string()),
    requiredSkills: v.optional(v.array(v.string())),
    contactEmail: v.optional(v.string()),
    contactUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Validate title
    if (!args.title.trim() || args.title.length > MAX_TITLE) {
      throw new Error(`Title must be 1-${MAX_TITLE} characters`);
    }
    // Validate description
    if (!args.description.trim() || args.description.length > MAX_DESCRIPTION) {
      throw new Error(`Description must be 1-${MAX_DESCRIPTION} characters`);
    }
    // Validate optional fields
    if (args.ote && args.ote.length > MAX_OTE) {
      throw new Error(`OTE must be under ${MAX_OTE} characters`);
    }
    if (args.contactEmail && args.contactEmail.length > MAX_CONTACT_EMAIL) {
      throw new Error(`Contact email must be under ${MAX_CONTACT_EMAIL} characters`);
    }
    if (args.contactUrl && args.contactUrl.length > MAX_CONTACT_URL) {
      throw new Error(`Contact URL must be under ${MAX_CONTACT_URL} characters`);
    }
    if (args.industry && !VALID_INDUSTRIES.includes(args.industry)) {
      throw new Error("Invalid industry");
    }
    if (args.ticketRange && !VALID_TICKET_RANGES.includes(args.ticketRange)) {
      throw new Error("Invalid ticket range");
    }
    if (args.requiredSkills) {
      if (args.requiredSkills.length > MAX_SKILLS) {
        throw new Error(`Maximum ${MAX_SKILLS} skills`);
      }
      if (args.requiredSkills.some((s) => s.length > MAX_SKILL_LENGTH)) {
        throw new Error(`Each skill must be under ${MAX_SKILL_LENGTH} characters`);
      }
    }

    const now = Date.now();
    return await ctx.db.insert("b2cJobPostings", {
      teamId: args.teamId,
      createdBy: args.createdBy,
      title: args.title.trim(),
      description: args.description.trim(),
      industry: args.industry,
      ticketRange: args.ticketRange,
      ote: args.ote?.trim(),
      requiredSkills: args.requiredSkills,
      contactEmail: args.contactEmail?.trim(),
      contactUrl: args.contactUrl?.trim(),
      status: "open",
      interestCount: 0,
      createdAt: now,
      updatedAt: now,
    });
  },
});

/** Update an existing job posting (B2B dashboard) */
export const updateJobPosting = mutation({
  args: {
    postingId: v.id("b2cJobPostings"),
    teamId: v.id("teams"),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    industry: v.optional(v.string()),
    ticketRange: v.optional(v.string()),
    ote: v.optional(v.string()),
    requiredSkills: v.optional(v.array(v.string())),
    contactEmail: v.optional(v.string()),
    contactUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const posting = await ctx.db.get(args.postingId);
    if (!posting) throw new Error("Posting not found");
    if (posting.teamId !== args.teamId) throw new Error("Not authorized");

    const updates: Record<string, unknown> = { updatedAt: Date.now() };

    if (args.title !== undefined) {
      if (!args.title.trim() || args.title.length > MAX_TITLE) {
        throw new Error(`Title must be 1-${MAX_TITLE} characters`);
      }
      updates.title = args.title.trim();
    }
    if (args.description !== undefined) {
      if (!args.description.trim() || args.description.length > MAX_DESCRIPTION) {
        throw new Error(`Description must be 1-${MAX_DESCRIPTION} characters`);
      }
      updates.description = args.description.trim();
    }
    if (args.industry !== undefined) {
      if (args.industry && !VALID_INDUSTRIES.includes(args.industry)) {
        throw new Error("Invalid industry");
      }
      updates.industry = args.industry;
    }
    if (args.ticketRange !== undefined) {
      if (args.ticketRange && !VALID_TICKET_RANGES.includes(args.ticketRange)) {
        throw new Error("Invalid ticket range");
      }
      updates.ticketRange = args.ticketRange;
    }
    if (args.ote !== undefined) updates.ote = args.ote?.trim();
    if (args.requiredSkills !== undefined) updates.requiredSkills = args.requiredSkills;
    if (args.contactEmail !== undefined) updates.contactEmail = args.contactEmail?.trim();
    if (args.contactUrl !== undefined) updates.contactUrl = args.contactUrl?.trim();

    await ctx.db.patch(args.postingId, updates);
  },
});

/** Close a job posting (B2B dashboard) */
export const closeJobPosting = mutation({
  args: {
    postingId: v.id("b2cJobPostings"),
    teamId: v.id("teams"),
  },
  handler: async (ctx, { postingId, teamId }) => {
    const posting = await ctx.db.get(postingId);
    if (!posting) throw new Error("Posting not found");
    if (posting.teamId !== teamId) throw new Error("Not authorized");

    await ctx.db.patch(postingId, {
      status: "closed",
      updatedAt: Date.now(),
    });
  },
});

/** Reopen a closed posting (B2B dashboard) */
export const reopenJobPosting = mutation({
  args: {
    postingId: v.id("b2cJobPostings"),
    teamId: v.id("teams"),
  },
  handler: async (ctx, { postingId, teamId }) => {
    const posting = await ctx.db.get(postingId);
    if (!posting) throw new Error("Posting not found");
    if (posting.teamId !== teamId) throw new Error("Not authorized");

    await ctx.db.patch(postingId, {
      status: "open",
      updatedAt: Date.now(),
    });
  },
});

/** Express interest in a job posting (B2C closer) */
export const expressInterest = mutation({
  args: {
    postingId: v.id("b2cJobPostings"),
    b2cUserId: v.id("b2cUsers"),
  },
  handler: async (ctx, { postingId, b2cUserId }) => {
    // Verify posting exists and is open
    const posting = await ctx.db.get(postingId);
    if (!posting) throw new Error("Posting not found");
    if (posting.status !== "open") throw new Error("This posting is no longer accepting interest");

    // Verify user exists
    const user = await ctx.db.get(b2cUserId);
    if (!user) throw new Error("User not found");

    // Check for duplicate
    const existing = await ctx.db
      .query("b2cJobInterests")
      .withIndex("by_job_user", (q) =>
        q.eq("jobPostingId", postingId).eq("b2cUserId", b2cUserId)
      )
      .first();

    if (existing) throw new Error("Already expressed interest");

    // Create interest
    await ctx.db.insert("b2cJobInterests", {
      jobPostingId: postingId,
      b2cUserId,
      createdAt: Date.now(),
    });

    // Increment count
    await ctx.db.patch(postingId, {
      interestCount: posting.interestCount + 1,
    });

    return { success: true };
  },
});

/** Withdraw interest from a job posting (B2C closer) */
export const withdrawInterest = mutation({
  args: {
    postingId: v.id("b2cJobPostings"),
    b2cUserId: v.id("b2cUsers"),
  },
  handler: async (ctx, { postingId, b2cUserId }) => {
    const interest = await ctx.db
      .query("b2cJobInterests")
      .withIndex("by_job_user", (q) =>
        q.eq("jobPostingId", postingId).eq("b2cUserId", b2cUserId)
      )
      .first();

    if (!interest) throw new Error("No interest found to withdraw");

    await ctx.db.delete(interest._id);

    // Decrement count
    const posting = await ctx.db.get(postingId);
    if (posting && posting.interestCount > 0) {
      await ctx.db.patch(postingId, {
        interestCount: posting.interestCount - 1,
      });
    }

    return { success: true };
  },
});
