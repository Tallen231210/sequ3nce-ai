import { v } from "convex/values";
import { mutation, query, internalQuery } from "./_generated/server";

// ==================== Validation Constants ====================

const MAX_HEADLINE = 120;
const MAX_BIO = 2000;
const MAX_LOCATION = 100;
const MAX_INDUSTRIES = 10;
const MAX_SKILLS = 20;
const MAX_TAG_LENGTH = 50;
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

    // Find the closer record in their personal workspace
    const closer = await ctx.db
      .query("closers")
      .withIndex("by_team", (q) => q.eq("teamId", user.personalWorkspaceId))
      .first();

    // Compute verified stats from calls
    let stats = null;
    if (closer) {
      const calls = await ctx.db
        .query("calls")
        .withIndex("by_closer", (q) => q.eq("closerId", closer._id))
        .collect();

      const completed = calls.filter((c) => c.status === "completed");
      if (completed.length > 0) {
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

        stats = {
          callsCompleted: completed.length,
          closeRate: withOutcome.length > 0
            ? Math.round((closed.length / withOutcome.length) * 100)
            : null,
          cashCollected: totalCash,
          avgDealSize: closed.length > 0
            ? Math.round(totalCash / closed.length)
            : null,
          avgDuration: durations.length > 0
            ? Math.round(
                durations.reduce((a, b) => a + b, 0) / durations.length
              )
            : null,
          talkRatio: talkRatios.length > 0
            ? Math.round(
                (talkRatios.reduce((a, b) => a + b, 0) / talkRatios.length) *
                  100
              )
            : null,
        };
      }
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
      stats,
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
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) throw new Error("User not found");

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

    const fields = {
      headline: args.headline,
      bio: args.bio,
      location: args.location,
      industries: args.industries,
      ticketRange: args.ticketRange,
      skills: args.skills,
      socialLinks: args.socialLinks,
      ...(isPublic !== undefined && { isPublic }),
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
