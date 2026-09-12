// ============================================================================
// Our side of the Close reconciliation: what WE stored for a sample of leads.
//
// Split from the action because a "use node" module can only hold actions.
// Read-only; exists so speed-to-lead can be checked against the CRM rather
// than only against our own copy of it.
// ============================================================================

import { v } from "convex/values";
import { internalQuery } from "./_generated/server";

const DAY_MS = 24 * 60 * 60 * 1000;

/** A sample of recent leads with our arrival time and our earliest touch. */
export const sampleForVerify = internalQuery({
  args: { teamId: v.id("teams"), days: v.number(), limit: v.number() },
  handler: async (ctx, args) => {
    const since = Date.now() - args.days * DAY_MS;
    const leads = await ctx.db
      .query("setterLeads")
      .withIndex("by_team_and_date_added", (q) => q.eq("teamId", args.teamId).gte("dateAdded", since))
      .order("desc")
      .take(400);
    // Spread the sample across the window rather than taking the newest few,
    // so a recent sync hiccup can't masquerade as a clean result.
    const step = Math.max(1, Math.floor(leads.length / args.limit));
    const picked = leads.filter((_, i) => i % step === 0).slice(0, args.limit);

    const out: Array<{ leadId: string; name: string | null; ourArrival: number; ourFirstTouch: number | null }> = [];
    for (const lead of picked) {
      const events = await ctx.db
        .query("setterLeadEvents")
        .withIndex("by_team_and_contact", (q) => q.eq("teamId", args.teamId).eq("ghlContactId", lead.ghlContactId))
        .take(200);
      const touches = events
        .filter((e) => e.eventType === "dial_outbound" || e.eventType === "sms_outbound")
        .map((e) => e.occurredAt)
        .sort((a, b) => a - b);
      out.push({
        leadId: lead.ghlContactId,
        name: lead.name ?? null,
        ourArrival: lead.dateAdded,
        ourFirstTouch: touches[0] ?? null,
      });
    }
    return out;
  },
});
