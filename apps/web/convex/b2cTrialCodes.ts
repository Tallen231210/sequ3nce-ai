import { v } from "convex/values";
import { internalMutation, query } from "./_generated/server";

// ============================================================================
// Sales-call trial codes (2026-09-03). A rep gives an un-closed lead a code;
// entering it on /personal/checkout turns the MONTHLY plan into "$0 today,
// card on file, auto-billed $150 after N days" via Polar's per-checkout
// trial (trial_interval/trial_interval_count). Codes are low-value secrets
// (a few free days), so lookup is public; management is CLI-only:
//   npx convex run b2cTrialCodes:setTrialCode '{"code":"CALL3","trialDays":3,"label":"Sales call"}' --prod
//   npx convex run b2cTrialCodes:setTrialCode '{"code":"CALL3","active":false}' --prod
// ============================================================================

const CODE_RE = /^[A-Z0-9]{3,20}$/;
const MAX_TRIAL_DAYS = 30;

export const setTrialCode = internalMutation({
  args: {
    code: v.string(),
    trialDays: v.optional(v.number()),
    label: v.optional(v.string()),
    active: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const code = args.code.trim().toUpperCase();
    if (!CODE_RE.test(code)) throw new Error("Code must be 3-20 letters/digits");
    if (args.trialDays !== undefined && (!Number.isInteger(args.trialDays) || args.trialDays < 1 || args.trialDays > MAX_TRIAL_DAYS)) {
      throw new Error(`trialDays must be a whole number 1-${MAX_TRIAL_DAYS}`);
    }
    const existing = await ctx.db
      .query("b2cTrialCodes")
      .withIndex("by_code", (q) => q.eq("code", code))
      .unique();
    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, {
        ...(args.trialDays !== undefined ? { trialDays: args.trialDays } : {}),
        ...(args.label !== undefined ? { label: args.label.trim().slice(0, 80) } : {}),
        ...(args.active !== undefined ? { active: args.active } : {}),
        updatedAt: now,
      });
      return { code, updated: true };
    }
    if (args.trialDays === undefined) throw new Error("trialDays is required for a new code");
    await ctx.db.insert("b2cTrialCodes", {
      code,
      trialDays: args.trialDays,
      label: args.label?.trim().slice(0, 80),
      active: args.active ?? true,
      createdAt: now,
      updatedAt: now,
    });
    return { code, created: true };
  },
});

/** Public lookup used by the checkout page and route. Unknown/inactive → valid:false. */
export const lookupTrialCode = query({
  args: { code: v.string() },
  handler: async (ctx, args) => {
    const code = args.code.trim().toUpperCase();
    if (!CODE_RE.test(code)) return { valid: false as const };
    const row = await ctx.db
      .query("b2cTrialCodes")
      .withIndex("by_code", (q) => q.eq("code", code))
      .unique();
    if (!row || !row.active) return { valid: false as const };
    return { valid: true as const, code, trialDays: row.trialDays };
  },
});
