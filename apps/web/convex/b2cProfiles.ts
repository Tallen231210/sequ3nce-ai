import { v } from "convex/values";
import { mutation, query, internalQuery, internalMutation } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

// ==================== Validation Constants ====================

const MAX_HEADLINE = 120;
const MAX_BIO = 2000;
const MAX_LOCATION = 100;
const MAX_INDUSTRIES = 10;
const MAX_SKILLS = 20;
const MAX_TAG_LENGTH = 50;
const MAX_VIDEO_URL = 500;
const MAX_WHATSAPP = 15;
const MIN_WHATSAPP = 7;
const SLUG_REGEX = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;
const MIN_SLUG = 3;
const MAX_SLUG = 40;

const RESERVED_SLUGS = new Set([
  "admin", "settings", "profile", "api", "app", "login", "signup",
  "about", "help", "support", "terms", "privacy", "share", "download",
  "dashboard", "sequ3nce", "personal", "pricing", "blog", "careers",
  "status", "docs", "p", "public", "search", "marketplace",
]);

const VALID_TICKET_RANGES = [
  "$1k-$3k", "$3k-$10k", "$10k-$25k", "$25k-$50k", "$50k+",
];

// ==================== Shared Helpers ====================

async function computeAutoStats(ctx: QueryCtx, userId: Id<"b2cUsers">) {
  const user = await ctx.db.get(userId);
  if (!user?.personalWorkspaceId) return null;

  const closer = await ctx.db
    .query("closers")
    .withIndex("by_team", (q) => q.eq("teamId", user.personalWorkspaceId))
    .first();

  if (!closer) return null;

  const calls = await ctx.db
    .query("calls")
    .withIndex("by_closer", (q) => q.eq("closerId", closer._id))
    .collect();

  const completed = calls.filter((c) => c.status === "completed");
  if (completed.length === 0) return null;

  const withOutcome = completed.filter(
    (c) => c.outcome && c.outcome !== "no_show"
  );
  const closed = completed.filter((c) => c.outcome === "closed");
  const totalCash = completed.reduce(
    (sum, c) => sum + (c.cashCollected ?? 0), 0
  );
  const durations = completed
    .filter((c) => c.duration && c.duration > 0)
    .map((c) => c.duration as number);
  const talkRatios = completed
    .filter((c) => c.closerTalkTime && c.prospectTalkTime)
    .map((c) => {
      const total = (c.closerTalkTime ?? 0) + (c.prospectTalkTime ?? 0);
      return total > 0 ? (c.closerTalkTime ?? 0) / total : 0;
    });

  return {
    callsCompleted: completed.length,
    closeRate: withOutcome.length > 0
      ? Math.round((closed.length / withOutcome.length) * 100)
      : null,
    cashCollected: totalCash,
    avgDealSize: closed.length > 0
      ? Math.round(totalCash / closed.length)
      : null,
    avgDuration: durations.length > 0
      ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
      : null,
    talkRatio: talkRatios.length > 0
      ? Math.round(
          (talkRatios.reduce((a, b) => a + b, 0) / talkRatios.length) * 100
        )
      : null,
  };
}

// ==================== Queries ====================

// Load profile for the editor (used by the personal app)
export const getMyProfile = query({
  args: { userId: v.id("b2cUsers") },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) return null;

    const profile = await ctx.db
      .query("b2cProfiles")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();

    let photoUrl: string | null = null;
    if (profile?.photoStorageId) {
      photoUrl = await ctx.storage.getUrl(profile.photoStorageId);
    }

    const autoStats = await computeAutoStats(ctx, args.userId);

    return {
      profileSlug: user.profileSlug ?? null,
      name: user.name,
      headline: profile?.headline ?? null,
      bio: profile?.bio ?? null,
      location: profile?.location ?? null,
      photoUrl,
      photoStorageId: profile?.photoStorageId ?? null,
      industries: profile?.industries ?? [],
      ticketRange: profile?.ticketRange ?? null,
      skills: profile?.skills ?? [],
      socialLinks: profile?.socialLinks ?? null,
      isPublic: profile?.isPublic ?? false,
      isAvailable: profile?.isAvailable ?? false,
      introVideoUrl: profile?.introVideoUrl ?? null,
      highlightReelUrl: profile?.highlightReelUrl ?? null,
      whatsappNumber: profile?.whatsappNumber ?? null,
      autoStats,
      manualStats: profile?.manualStats ?? null,
      statsSource: (profile?.statsSource as "auto" | "manual" | "combined") ?? "auto",
      isManuallyVerified: profile?.isManuallyVerified ?? false,
      createdAt: profile?.createdAt ?? null,
      updatedAt: profile?.updatedAt ?? null,
    };
  },
});

// Public profile + verified stats (no auth required)
export const getPublicProfile = internalQuery({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    const slug = args.slug.trim().toLowerCase();
    if (!slug) return null;

    // Look up user by slug
    const user = await ctx.db
      .query("b2cUsers")
      .withIndex("by_profile_slug", (q) => q.eq("profileSlug", slug))
      .first();

    if (!user) return null;

    // Cancelled subscriptions → profile offline
    if (user.subscriptionStatus === "cancelled") return null;

    // Load profile
    const profile = await ctx.db
      .query("b2cProfiles")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .first();

    if (!profile || !profile.isPublic) return null;

    // Resolve photo URL
    let photoUrl: string | null = null;
    if (profile.photoStorageId) {
      photoUrl = await ctx.storage.getUrl(profile.photoStorageId);
    }

    // Determine stats source and compute accordingly
    const statsSource = (profile.statsSource as "auto" | "manual" | "combined") ?? "auto";
    let stats = null;
    let isVerified = false;
    const autoStats = await computeAutoStats(ctx, user._id);

    if (statsSource === "combined" && profile.manualStats && autoStats) {
      // Combined: manual baseline + auto stats on top
      const ms = profile.manualStats;
      const manualCalls = ms.callsCompleted ?? 0;
      const manualCash = ms.cashCollected ?? 0;
      const manualCloseRate = ms.closeRate ?? 0;
      const manualClosed = Math.round(manualCalls * (manualCloseRate / 100));

      const autoCalls = autoStats.callsCompleted;
      const autoCash = autoStats.cashCollected;
      const autoCloseRate = autoStats.closeRate ?? 0;
      const autoWithOutcome = autoCalls; // auto stats already exclude no-shows in close rate calc
      const autoClosed = autoCloseRate > 0 ? Math.round(autoWithOutcome * (autoCloseRate / 100)) : 0;

      const totalCalls = manualCalls + autoCalls;
      const totalCash = manualCash + autoCash;
      const totalClosed = manualClosed + autoClosed;
      const totalWithOutcome = manualCalls + autoWithOutcome;

      stats = {
        callsCompleted: totalCalls,
        cashCollected: totalCash,
        closeRate: totalWithOutcome > 0
          ? Math.round((totalClosed / totalWithOutcome) * 100)
          : ms.closeRate ?? null,
        avgDealSize: totalClosed > 0
          ? Math.round(totalCash / totalClosed)
          : ms.avgDealSize ?? null,
        avgDuration: manualCalls > 0 && autoStats.avgDuration !== null
          ? Math.round(
              ((ms.avgDuration ?? 0) * manualCalls + autoStats.avgDuration * autoCalls) / totalCalls
            )
          : autoStats.avgDuration ?? ms.avgDuration ?? null,
        talkRatio: manualCalls > 0 && autoStats.talkRatio !== null
          ? Math.round(
              ((ms.talkRatio ?? 0) * manualCalls + autoStats.talkRatio * autoCalls) / totalCalls
            )
          : autoStats.talkRatio ?? ms.talkRatio ?? null,
      };
      // Combined is verified if manual baseline was verified (auto is always verified)
      isVerified = profile.isManuallyVerified ?? false;
    } else if (statsSource === "combined" && profile.manualStats && !autoStats) {
      // Combined but no auto stats yet — fall back to manual
      stats = {
        callsCompleted: profile.manualStats.callsCompleted ?? 0,
        closeRate: profile.manualStats.closeRate ?? null,
        cashCollected: profile.manualStats.cashCollected ?? 0,
        avgDealSize: profile.manualStats.avgDealSize ?? null,
        avgDuration: profile.manualStats.avgDuration ?? null,
        talkRatio: profile.manualStats.talkRatio ?? null,
      };
      isVerified = profile.isManuallyVerified ?? false;
    } else if (statsSource === "manual" && profile.manualStats) {
      stats = {
        callsCompleted: profile.manualStats.callsCompleted ?? 0,
        closeRate: profile.manualStats.closeRate ?? null,
        cashCollected: profile.manualStats.cashCollected ?? 0,
        avgDealSize: profile.manualStats.avgDealSize ?? null,
        avgDuration: profile.manualStats.avgDuration ?? null,
        talkRatio: profile.manualStats.talkRatio ?? null,
      };
      isVerified = profile.isManuallyVerified ?? false;
    } else {
      stats = autoStats;
      isVerified = stats !== null;
    }

    return {
      name: user.name,
      headline: profile.headline ?? null,
      bio: profile.bio ?? null,
      location: profile.location ?? null,
      photoUrl,
      industries: profile.industries ?? [],
      ticketRange: profile.ticketRange ?? null,
      skills: profile.skills ?? [],
      socialLinks: profile.socialLinks ?? null,
      isAvailable: profile.isAvailable ?? false,
      introVideoUrl: profile.introVideoUrl ?? null,
      highlightReelUrl: profile.highlightReelUrl ?? null,
      whatsappNumber: profile.whatsappNumber ?? null,
      stats,
      isVerified,
      statsSource,
      badges: user.badges ?? [],
    };
  },
});

// ==================== Mutations ====================

// Upsert profile fields
export const upsertProfile = mutation({
  args: {
    userId: v.id("b2cUsers"),
    headline: v.optional(v.string()),
    bio: v.optional(v.string()),
    location: v.optional(v.string()),
    industries: v.optional(v.array(v.string())),
    ticketRange: v.optional(v.string()),
    skills: v.optional(v.array(v.string())),
    socialLinks: v.optional(v.object({
      linkedin: v.optional(v.string()),
      twitter: v.optional(v.string()),
      instagram: v.optional(v.string()),
      website: v.optional(v.string()),
      calendly: v.optional(v.string()),
    })),
    isPublic: v.optional(v.boolean()),
    isAvailable: v.optional(v.boolean()),
    introVideoUrl: v.optional(v.string()),
    highlightReelUrl: v.optional(v.string()),
    whatsappNumber: v.optional(v.string()),
    manualStats: v.optional(v.object({
      callsCompleted: v.optional(v.number()),
      closeRate: v.optional(v.number()),
      cashCollected: v.optional(v.number()),
      avgDealSize: v.optional(v.number()),
      avgDuration: v.optional(v.number()),
      talkRatio: v.optional(v.number()),
    })),
    statsSource: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) throw new Error("User not found");

    // Validate statsSource
    if (args.statsSource && !["auto", "manual", "combined"].includes(args.statsSource)) {
      throw new Error("statsSource must be 'auto', 'manual', or 'combined'");
    }

    // Validate manualStats ranges
    if (args.manualStats) {
      const ms = args.manualStats;
      if (ms.closeRate !== undefined && (ms.closeRate < 0 || ms.closeRate > 100)) {
        throw new Error("Close rate must be 0-100");
      }
      if (ms.talkRatio !== undefined && (ms.talkRatio < 0 || ms.talkRatio > 100)) {
        throw new Error("Talk ratio must be 0-100");
      }
      if (ms.cashCollected !== undefined && ms.cashCollected < 0) {
        throw new Error("Cash collected cannot be negative");
      }
      if (ms.callsCompleted !== undefined && (ms.callsCompleted < 0 || !Number.isInteger(ms.callsCompleted))) {
        throw new Error("Calls completed must be a non-negative integer");
      }
      if (ms.avgDealSize !== undefined && ms.avgDealSize < 0) {
        throw new Error("Avg deal size cannot be negative");
      }
      if (ms.avgDuration !== undefined && ms.avgDuration < 0) {
        throw new Error("Avg duration cannot be negative");
      }
    }

    // Validate lengths
    if (args.headline && args.headline.length > MAX_HEADLINE) {
      throw new Error(`Headline must be ${MAX_HEADLINE} characters or less`);
    }
    if (args.bio && args.bio.length > MAX_BIO) {
      throw new Error(`Bio must be ${MAX_BIO} characters or less`);
    }
    if (args.location && args.location.length > MAX_LOCATION) {
      throw new Error(`Location must be ${MAX_LOCATION} characters or less`);
    }
    if (args.industries && args.industries.length > MAX_INDUSTRIES) {
      throw new Error(`Maximum ${MAX_INDUSTRIES} industries`);
    }
    if (args.skills && args.skills.length > MAX_SKILLS) {
      throw new Error(`Maximum ${MAX_SKILLS} skills`);
    }

    // Validate tag lengths
    if (args.industries) {
      for (const tag of args.industries) {
        if (tag.length > MAX_TAG_LENGTH) {
          throw new Error(`Industry tag too long: ${tag.slice(0, 20)}...`);
        }
      }
    }
    if (args.skills) {
      for (const tag of args.skills) {
        if (tag.length > MAX_TAG_LENGTH) {
          throw new Error(`Skill tag too long: ${tag.slice(0, 20)}...`);
        }
      }
    }

    // Validate ticket range
    if (args.ticketRange && !VALID_TICKET_RANGES.includes(args.ticketRange)) {
      throw new Error("Invalid ticket range");
    }

    // Validate social URLs
    if (args.socialLinks) {
      for (const [key, url] of Object.entries(args.socialLinks)) {
        if (url && url.length > 0 && !url.startsWith("https://")) {
          throw new Error(`${key} URL must start with https://`);
        }
      }
    }

    // Validate video URLs
    if (args.introVideoUrl && args.introVideoUrl.length > 0) {
      if (args.introVideoUrl.length > MAX_VIDEO_URL) {
        throw new Error(`Video URL must be ${MAX_VIDEO_URL} characters or less`);
      }
      if (!args.introVideoUrl.startsWith("https://")) {
        throw new Error("Intro video URL must start with https://");
      }
    }
    if (args.highlightReelUrl && args.highlightReelUrl.length > 0) {
      if (args.highlightReelUrl.length > MAX_VIDEO_URL) {
        throw new Error(`Video URL must be ${MAX_VIDEO_URL} characters or less`);
      }
      if (!args.highlightReelUrl.startsWith("https://")) {
        throw new Error("Highlight reel URL must start with https://");
      }
    }

    // Validate WhatsApp number (digits only, 7-15 chars)
    if (args.whatsappNumber && args.whatsappNumber.length > 0) {
      const digits = args.whatsappNumber.replace(/\D/g, "");
      if (digits.length < MIN_WHATSAPP || digits.length > MAX_WHATSAPP) {
        throw new Error(`WhatsApp number must be ${MIN_WHATSAPP}-${MAX_WHATSAPP} digits`);
      }
    }

    // If subscription cancelled, force isPublic false
    let isPublic = args.isPublic;
    if (user.subscriptionStatus === "cancelled") {
      isPublic = false;
    }

    const now = Date.now();
    const existing = await ctx.db
      .query("b2cProfiles")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();

    // If manual stats are being updated and profile was previously verified,
    // clear verification (new numbers need re-review)
    let clearVerification = false;
    if (args.manualStats && existing?.isManuallyVerified) {
      const oldStats = existing.manualStats;
      const newStats = args.manualStats;
      const statsChanged = JSON.stringify(oldStats) !== JSON.stringify(newStats);
      if (statsChanged) {
        clearVerification = true;
      }
    }

    const fields: Record<string, unknown> = {
      headline: args.headline,
      bio: args.bio,
      location: args.location,
      industries: args.industries,
      ticketRange: args.ticketRange,
      skills: args.skills,
      socialLinks: args.socialLinks,
      ...(isPublic !== undefined && { isPublic }),
      ...(args.isAvailable !== undefined && { isAvailable: args.isAvailable }),
      introVideoUrl: args.introVideoUrl || undefined,
      highlightReelUrl: args.highlightReelUrl || undefined,
      whatsappNumber: args.whatsappNumber
        ? args.whatsappNumber.replace(/\D/g, "") || undefined
        : undefined,
      ...(args.manualStats !== undefined && { manualStats: args.manualStats }),
      ...(args.statsSource !== undefined && { statsSource: args.statsSource }),
      ...(clearVerification && { isManuallyVerified: false }),
      updatedAt: now,
    };

    if (existing) {
      await ctx.db.patch(existing._id, fields);
      return { success: true, profileId: existing._id };
    } else {
      const profileId = await ctx.db.insert("b2cProfiles", {
        userId: args.userId,
        headline: args.headline,
        bio: args.bio,
        location: args.location,
        industries: args.industries,
        ticketRange: args.ticketRange,
        skills: args.skills,
        socialLinks: args.socialLinks,
        isPublic: isPublic ?? false,
        isAvailable: args.isAvailable ?? false,
        introVideoUrl: args.introVideoUrl || undefined,
        highlightReelUrl: args.highlightReelUrl || undefined,
        whatsappNumber: args.whatsappNumber
          ? args.whatsappNumber.replace(/\D/g, "") || undefined
          : undefined,
        createdAt: now,
        updatedAt: now,
      });
      return { success: true, profileId };
    }
  },
});

// Generate a signed upload URL for profile photos
export const generateProfileUploadUrl = mutation({
  args: { userId: v.id("b2cUsers") },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) throw new Error("User not found");

    const uploadUrl = await ctx.storage.generateUploadUrl();
    return { uploadUrl };
  },
});

// Save profile photo storage reference (and clean up old photo)
export const saveProfilePhoto = mutation({
  args: {
    userId: v.id("b2cUsers"),
    storageId: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) throw new Error("User not found");

    const profile = await ctx.db
      .query("b2cProfiles")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();

    // Delete old photo to prevent orphans
    if (profile?.photoStorageId) {
      try {
        await ctx.storage.delete(profile.photoStorageId as any);
      } catch {
        // Old file may already be gone — not critical
      }
    }

    const now = Date.now();
    if (profile) {
      await ctx.db.patch(profile._id, {
        photoStorageId: args.storageId,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("b2cProfiles", {
        userId: args.userId,
        photoStorageId: args.storageId,
        isPublic: false,
        createdAt: now,
        updatedAt: now,
      });
    }

    return { success: true };
  },
});

// Claim a profile URL slug
export const claimProfileSlug = mutation({
  args: {
    userId: v.id("b2cUsers"),
    slug: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) throw new Error("User not found");

    const slug = args.slug.trim().toLowerCase();

    // Validate format
    if (slug.length < MIN_SLUG || slug.length > MAX_SLUG) {
      throw new Error(`Slug must be ${MIN_SLUG}-${MAX_SLUG} characters`);
    }
    if (!SLUG_REGEX.test(slug)) {
      throw new Error(
        "Slug can only contain lowercase letters, numbers, and hyphens"
      );
    }
    if (slug.includes("--")) {
      throw new Error("Slug cannot contain consecutive hyphens");
    }

    // Check reserved words
    if (RESERVED_SLUGS.has(slug)) {
      throw new Error("This URL is reserved. Please choose another.");
    }

    // Check uniqueness (skip if user already owns this slug)
    if (user.profileSlug !== slug) {
      const existing = await ctx.db
        .query("b2cUsers")
        .withIndex("by_profile_slug", (q) => q.eq("profileSlug", slug))
        .first();

      if (existing) {
        throw new Error("This URL is already taken. Please choose another.");
      }
    }

    // Update slug on b2cUsers
    await ctx.db.patch(args.userId, { profileSlug: slug });

    return { success: true, slug };
  },
});

// ==================== Admin ====================

// Admin-only: set manual verification status after pay stub review
export const adminSetVerification = internalMutation({
  args: {
    userId: v.id("b2cUsers"),
    isVerified: v.boolean(),
  },
  handler: async (ctx, args) => {
    const profile = await ctx.db
      .query("b2cProfiles")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();

    if (!profile) throw new Error("Profile not found");

    await ctx.db.patch(profile._id, {
      isManuallyVerified: args.isVerified,
      updatedAt: Date.now(),
    });

    return { success: true };
  },
});

/** Toggle "Available for Hire" status on a closer's profile */
export const toggleAvailability = mutation({
  args: {
    userId: v.id("b2cUsers"),
    isAvailable: v.boolean(),
  },
  handler: async (ctx, { userId, isAvailable }) => {
    const profile = await ctx.db
      .query("b2cProfiles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();

    if (!profile) throw new Error("Profile not found");

    await ctx.db.patch(profile._id, {
      isAvailable,
      updatedAt: Date.now(),
    });

    return { success: true };
  },
});
