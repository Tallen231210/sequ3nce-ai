import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { api } from "./_generated/api";

const MAX_EMAIL_LENGTH = 254;
const MAX_PHONE_LENGTH = 20;
const MAX_NAME_LENGTH = 80;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Save a lead from the landing page. Upserts by email — if the email
 *  already exists, updates phone/source/timestamp instead of creating a dupe.
 *  After write, schedules a GHL sync; failures leave the row in pending/failed
 *  for the retry cron to pick up. */
export const saveLead = mutation({
  args: {
    email: v.string(),
    phone: v.string(),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    source: v.optional(v.string()),
    refParam: v.optional(v.string()),
    attribution: v.optional(v.object({
      utm_source: v.optional(v.string()),
      utm_medium: v.optional(v.string()),
      utm_campaign: v.optional(v.string()),
      utm_content: v.optional(v.string()),
      utm_term: v.optional(v.string()),
      gclid: v.optional(v.string()),
      fbclid: v.optional(v.string()),
      landed_at: v.optional(v.string()),
      landing_page: v.optional(v.string()),
    })),
  },
  handler: async (ctx, args) => {
    const email = args.email.trim().toLowerCase();
    const phone = args.phone.trim();
    const firstName = args.firstName?.trim().slice(0, MAX_NAME_LENGTH);
    const lastName = args.lastName?.trim().slice(0, MAX_NAME_LENGTH);

    if (!email || !EMAIL_REGEX.test(email) || email.length > MAX_EMAIL_LENGTH) {
      throw new Error("Invalid email address");
    }
    const phoneDigits = phone.replace(/\D/g, "");
    if (!phone || phone.length > MAX_PHONE_LENGTH || phoneDigits.length < 10 || phoneDigits.length > 15) {
      throw new Error("Invalid phone number");
    }

    const now = Date.now();

    // Upsert by email — update if exists, insert if new. When updating, keep
    // any existing name fields if the new submission didn't supply them (so
    // we never regress an already-named lead to nameless).
    const existing = await ctx.db
      .query("b2cLeads")
      .withIndex("by_email", (q) => q.eq("email", email))
      .first();

    let leadId;
    if (existing) {
      await ctx.db.patch(existing._id, {
        phone,
        ...(!existing.attribution && args.attribution ? { attribution: args.attribution } : {}),
        firstName: firstName || existing.firstName,
        lastName: lastName || existing.lastName,
        source: args.source ?? existing.source,
        refParam: args.refParam ?? existing.refParam,
        ghlSyncStatus: "pending",
        updatedAt: now,
      });
      leadId = existing._id;
    } else {
      leadId = await ctx.db.insert("b2cLeads", {
        email,
        phone,
        ...(args.attribution ? { attribution: args.attribution } : {}),
        firstName,
        lastName,
        source: args.source,
        refParam: args.refParam,
        ghlSyncStatus: "pending",
        createdAt: now,
        updatedAt: now,
      });
    }

    // Fire GHL sync async — mutations can't fetch(), so schedule the action
    await ctx.scheduler.runAfter(0, api.b2cGhl.syncLeadToGHL, { leadId });

    return leadId;
  },
});

/** Get all leads, newest first. For future sales team dashboard. */
export const getLeads = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { limit }) => {
    const take = Math.min(limit ?? 100, 500);
    return ctx.db
      .query("b2cLeads")
      .order("desc")
      .take(take);
  },
});

// ============================================================================
// Public social-proof feeds for the /start funnel widgets. Deliberately
// honest: below the floors they return nothing and the widgets stay hidden —
// "3 closers joined" is anti-proof, and fabricated names are off the table
// (the widget files themselves say so). Exposes first name + last initial
// only; never email, phone, or anything else.
// ============================================================================

const RECENT_SIGNUPS_FLOOR = 5; // fewer real leads than this → show no toasts
const LEAD_COUNT_FLOOR = 25; // smaller total than this → show no counter

/** Recent opt-ins for the signup-toast widget. */
export const getRecentSignupsPublic = query({
  args: {},
  handler: async (ctx) => {
    const recent = await ctx.db.query("b2cLeads").order("desc").take(50);
    const named = recent.filter((l) => (l.firstName ?? "").trim().length > 0);
    if (named.length < RECENT_SIGNUPS_FLOOR) return [];
    // First name ONLY (privacy: no surname, no location, no timestamp — a
    // bare first name identifies nobody), deduped so a scroll session shows
    // different names rather than the same lead twice.
    const seen = new Set<string>();
    const out: Array<{ name: string; action: string }> = [];
    for (const l of named) {
      const name =
        l.firstName!.trim().charAt(0).toUpperCase() + l.firstName!.trim().slice(1).toLowerCase();
      if (seen.has(name)) continue;
      seen.add(name);
      out.push({ name, action: "claimed free access" });
      if (out.length >= 20) break;
    }
    return out;
  },
});

/** Total lead count for the live-counter widget. */
export const getLeadCountPublic = query({
  args: {},
  handler: async (ctx) => {
    const leads = await ctx.db.query("b2cLeads").take(5000);
    if (leads.length < LEAD_COUNT_FLOOR) return {};
    return { total: leads.length };
  },
});
