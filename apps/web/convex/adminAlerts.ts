import { v } from "convex/values";
import { internalAction, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";

// ============================================================================
// Alerts that go to US, not to a customer.
//
// Born 2026-08-22: Recall ran out of credits at 1:52am and every bot booking
// on the platform failed 402 for eight hours. Sentry captured all 83 errors
// and told nobody, because capture without an alert rule is a diary, not an
// alarm. A billing failure takes the whole recording product down at once,
// so it emails the founder directly on the first failure — with a cooldown,
// because eighty-three copies of the same email is how an alarm gets muted.
// ============================================================================

const ALERT_EMAIL = "tadigitalsmm@gmail.com";
const FROM_ADDRESS = "Sequ3nce <noreply@noreply.sequ3nce.ai>";
const COOLDOWN_MS = 60 * 60 * 1000;

/** Atomically decide whether this alert kind is off cooldown, recording the
 *  send in the same transaction so concurrent failures can't double-email. */
export const claimAlertSlot = internalMutation({
  args: { kind: v.string(), cooldownMs: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const last = await ctx.db
      .query("adminAlerts")
      .withIndex("by_kind", (q) => q.eq("kind", args.kind))
      .order("desc")
      .first();
    const now = Date.now();
    if (last && now - last.sentAt < (args.cooldownMs ?? COOLDOWN_MS)) return { send: false };
    await ctx.db.insert("adminAlerts", { kind: args.kind, sentAt: now });
    return { send: true };
  },
});

/** Fire the billing alarm. Safe to call on every failure — the slot claim
 *  collapses a storm of them into one email an hour. */
export const raiseRecallBillingAlert = internalAction({
  args: { detail: v.string() },
  handler: async (ctx, args) => {
    const slot = await ctx.runMutation(internal.adminAlerts.claimAlertSlot, {
      kind: "recall_billing",
    });
    if (!slot.send) return { sent: false };

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.error("[adminAlerts] RESEND_API_KEY not configured — cannot send billing alert");
      return { sent: false };
    }
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM_ADDRESS,
        to: [ALERT_EMAIL],
        subject: "🚨 Recall.ai billing failure — meeting bots cannot join",
        text: [
          "A meeting bot just failed to book because Recall.ai refused it for billing reasons.",
          "",
          `Recall's response: ${args.detail.slice(0, 300)}`,
          "",
          "Until this is fixed, NO bots can join ANY team's meetings — calls happening now are not being recorded.",
          "",
          "Fix: Recall.ai dashboard → Billing → top up credits / check the auto-recharge card.",
          "",
          "You'll get at most one of these per hour while it keeps failing.",
        ].join("\n"),
      }),
    });
    if (!res.ok) {
      console.error(`[adminAlerts] Resend refused the billing alert: ${res.status}`);
      return { sent: false };
    }
    console.log("[adminAlerts] Recall billing alert emailed");
    return { sent: true };
  },
});

/**
 * Auto-join churn: a team booking and cancelling bots far faster than any
 * calendar changes. Born 2026-09-03: a title-vs-calendar mismatch had one
 * meeting booked 99 times in a week, and the daily cap — which counted the
 * junk — then stopped the team's REAL calls from getting bots. The cap now
 * counts only bots that can cost money; churn is this alarm instead, so a
 * loop reaches the founder without ever starving a customer.
 */
export const raiseAutoJoinChurnAlert = internalAction({
  args: {
    teamId: v.string(),
    teamName: v.string(),
    cancelledBeforeJoin: v.number(),
    costable: v.number(),
    cap: v.number(),
  },
  handler: async (ctx, args) => {
    const slot = await ctx.runMutation(internal.adminAlerts.claimAlertSlot, {
      kind: `autojoin_churn_${args.teamId}`,
      cooldownMs: 24 * 60 * 60 * 1000,
    });
    if (!slot.send) return { sent: false };

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.error("[adminAlerts] RESEND_API_KEY not configured — cannot send churn alert");
      return { sent: false };
    }
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: FROM_ADDRESS,
        to: [ALERT_EMAIL],
        subject: `⚠️ Auto-join churn on ${args.teamName} — bots booked and cancelled in a loop`,
        text: [
          `${args.teamName} has had ${args.cancelledBeforeJoin} bots booked and cancelled before joining in the last 24 hours.`,
          `Bots that actually count toward the cap: ${args.costable} of ${args.cap}.`,
          "",
          "This usually means the sweep is booking a meeting and then deciding it no longer exists — a calendar/attribution mismatch, not a customer action.",
          "Real calls are NOT blocked by this (the cap ignores cancelled-before-join bots), but the loop needs fixing.",
          "",
          "Where to look: meetingBots for the team, grouped by calendarEventId — the churning meetings have dozens of rows.",
          "",
          "At most one of these per team per day.",
        ].join("\n"),
      }),
    });
    if (!res.ok) {
      console.error(`[adminAlerts] Resend refused the churn alert: ${res.status}`);
      return { sent: false };
    }
    console.log(`[adminAlerts] auto-join churn alert emailed for ${args.teamName}`);
    return { sent: true };
  },
});
