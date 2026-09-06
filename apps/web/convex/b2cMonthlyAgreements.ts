import { v } from "convex/values";
import { internalMutation, query } from "./_generated/server";

// ============================================================================
// Monthly-plan commitment agreements (2026-09-06). Before a prospect reaches
// the $150/mo Polar checkout, /personal/commit makes them tick a box agreeing
// to a 3-month minimum. We store the acceptance — exact terms text, timestamp,
// IP, user-agent — and stamp the returned agreementId onto the Polar checkout
// metadata, so the eventual order (with the customer's email + card) is linked
// back to this record. That's the chargeback evidence, alongside the call
// recording. This is EVIDENCE, not enforcement: Polar can't lock a monthly sub.
// ============================================================================

const MAX_TERMS = 4000;

export const recordMonthlyAgreement = internalMutation({
  args: {
    termsText: v.string(),
    ipAddress: v.optional(v.string()),
    userAgent: v.optional(v.string()),
    landingUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const termsText = args.termsText.trim().slice(0, MAX_TERMS);
    if (!termsText) throw new Error("termsText is required");
    const id = await ctx.db.insert("b2cMonthlyAgreements", {
      termsText,
      ipAddress: args.ipAddress?.slice(0, 64),
      userAgent: args.userAgent?.slice(0, 500),
      landingUrl: args.landingUrl?.slice(0, 500),
      acceptedAt: Date.now(),
    });
    return { agreementId: id };
  },
});

/** Evidence lookup for a chargeback dispute. Founder/support pulls the record
 *  by the id stamped on the Polar order's metadata. */
export const getMonthlyAgreement = query({
  args: { agreementId: v.id("b2cMonthlyAgreements") },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.agreementId);
    if (!row) return null;
    return {
      agreementId: row._id,
      termsText: row.termsText,
      acceptedAt: row.acceptedAt,
      acceptedAtISO: new Date(row.acceptedAt).toISOString(),
      ipAddress: row.ipAddress ?? null,
      userAgent: row.userAgent ?? null,
      landingUrl: row.landingUrl ?? null,
    };
  },
});
