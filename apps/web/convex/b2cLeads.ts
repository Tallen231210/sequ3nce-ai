import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

const MAX_EMAIL_LENGTH = 254;
const MAX_PHONE_LENGTH = 20;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Save a lead from the landing page. Upserts by email — if the email
 *  already exists, updates phone/source/timestamp instead of creating a dupe. */
export const saveLead = mutation({
  args: {
    email: v.string(),
    phone: v.string(),
    source: v.optional(v.string()),
    refParam: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const email = args.email.trim().toLowerCase();
    const phone = args.phone.trim();

    if (!email || !EMAIL_REGEX.test(email) || email.length > MAX_EMAIL_LENGTH) {
      throw new Error("Invalid email address");
    }
    if (!phone || phone.length > MAX_PHONE_LENGTH) {
      throw new Error("Invalid phone number");
    }

    const now = Date.now();

    // Upsert by email — update if exists, insert if new
    const existing = await ctx.db
      .query("b2cLeads")
      .withIndex("by_email", (q) => q.eq("email", email))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        phone,
        source: args.source ?? existing.source,
        refParam: args.refParam ?? existing.refParam,
        updatedAt: now,
      });
      return existing._id;
    }

    const id = await ctx.db.insert("b2cLeads", {
      email,
      phone,
      source: args.source,
      refParam: args.refParam,
      createdAt: now,
      updatedAt: now,
    });
    return id;
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
