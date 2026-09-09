import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { sendB2cEmail } from "./b2cEmail";
import type { MemberSnapshot } from "./b2cMemberActivity";

// ============================================================================
// Founder alerts for the two moments a new member is about to be lost:
//   - they cancelled (same-day cancels were invisible until 2026-09-09)
//   - they paid a day ago and never set a password
// Both go to the founder's inbox within the hour, with what we know, so a
// human can reach out while the reason is fresh. Throttled per member via
// adminAlerts.claimAlertSlot; never sent for test accounts.
// ============================================================================

const DAY = 86_400_000;

function fmtDate(ms?: number): string {
  if (!ms) return "—";
  return new Date(ms).toISOString().slice(0, 10);
}

function ago(ms?: number): string {
  if (!ms) return "never";
  const h = (Date.now() - ms) / 3_600_000;
  if (h < 1) return `${Math.round(h * 60)} min ago`;
  if (h < 48) return `${Math.round(h)}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

function activityTable(s: MemberSnapshot): string {
  const rows: Array<[string, string]> = [
    ["Signed up", `${fmtDate(s.createdAt)} (${s.daysSinceSignup}d ago) · ${s.planTerm ?? "?"}`],
    ["Set a password", s.hasPassword ? "yes" : "NO — never opened the app"],
    ["Last seen in app", `${ago(s.lastSeenAt)}${s.appVersion ? ` · v${s.appVersion}` : ""}`],
    ["Profile", `${s.profilePct}% complete`],
    ["Calls recorded", String(s.callsRecorded)],
    ["Roles tracked", String(s.rolesTracked)],
    ["Channels opened", String(s.channelsOpened)],
    ["Posts / comments", `${s.posts} / ${s.comments}`],
    ["Coaching", `${s.coachingAttended} attended · classroom ${s.classroomJoined ? "joined" : "not joined"}`],
  ];
  return `<table style="border-collapse: collapse; font-size: 14px;">${rows
    .map(
      ([k, val]) =>
        `<tr><td style="padding: 4px 12px 4px 0; color: #666;">${k}</td><td style="padding: 4px 0;">${val}</td></tr>`,
    )
    .join("")}</table>`;
}

export const sendCancellationAlert = internalAction({
  args: {
    userId: v.id("b2cUsers"),
    trigger: v.union(v.literal("cancel_at_period_end"), v.literal("cancelled")),
  },
  handler: async (ctx, args): Promise<{ sent: boolean; reason?: string }> => {
    const s = await ctx.runQuery(internal.b2cMemberActivity.getMemberSnapshot, {
      userId: args.userId,
    });
    if (!s) return { sent: false, reason: "no user" };
    if (s.isTestAccount) return { sent: false, reason: "test account" };
    const slot = await ctx.runMutation(internal.adminAlerts.claimAlertSlot, {
      kind: `b2c_cancel_${args.userId}`,
      cooldownMs: DAY,
    });
    if (!slot.send) return { sent: false, reason: "cooldown" };

    const reason = s.cancellationReason ?? "no reason given";
    const keepsAccess =
      args.trigger === "cancel_at_period_end" && s.currentPeriodEnd
        ? `They keep access until <strong>${fmtDate(s.currentPeriodEnd)}</strong> — you can still DM them in the app.`
        : "Their access has ended.";
    const result = await sendB2cEmail(ctx, {
      kind: "founder",
      subject: `⚠️ ${s.name} cancelled Sequ3nce Personal — ${reason}${s.daysSinceSignup <= 1 ? " (day one)" : ""}`,
      html: `
        <h2 style="margin: 24px 0 8px;">${s.name} cancelled</h2>
        <p style="color: #444; line-height: 1.6;">
          <strong>Reason:</strong> ${reason}${s.cancellationComment ? `<br/><strong>Their words:</strong> "${s.cancellationComment}"` : ""}
        </p>
        <p style="color: #444; line-height: 1.6;">${keepsAccess}</p>
        ${activityTable(s)}
        <p style="color: #444; line-height: 1.6; margin-top: 16px;">
          ${s.email} · ${args.trigger === "cancelled" ? "status: cancelled" : "cancel at period end"}
        </p>
      `,
    });
    return { sent: result.sent };
  },
});

export const sendActivationAlert = internalAction({
  args: { userId: v.id("b2cUsers") },
  handler: async (ctx, args): Promise<{ sent: boolean; reason?: string }> => {
    const s = await ctx.runQuery(internal.b2cMemberActivity.getMemberSnapshot, {
      userId: args.userId,
    });
    if (!s) return { sent: false, reason: "no user" };
    if (s.isTestAccount) return { sent: false, reason: "test account" };
    if (s.hasPassword) return { sent: false, reason: "activated" };
    if (s.subscriptionStatus !== "active" || s.cancelAtPeriodEnd) {
      return { sent: false, reason: "not an active member" };
    }
    const slot = await ctx.runMutation(internal.adminAlerts.claimAlertSlot, {
      kind: `b2c_activation_${args.userId}`,
      cooldownMs: DAY,
    });
    if (!slot.send) return { sent: false, reason: "cooldown" };

    const result = await sendB2cEmail(ctx, {
      kind: "founder",
      subject: `🕳️ ${s.name} paid a day ago and never opened the app`,
      html: `
        <h2 style="margin: 24px 0 8px;">${s.name} hasn't set a password</h2>
        <p style="color: #444; line-height: 1.6;">
          They paid ${fmtDate(s.createdAt)} (${s.planTerm ?? "?"}) and got the welcome email
          plus two nudges, but never set a password — so they have never seen the
          product. A quick personal email or text usually fixes this.
        </p>
        ${activityTable(s)}
        <p style="color: #444; line-height: 1.6; margin-top: 16px;">${s.email}</p>
      `,
    });
    return { sent: result.sent };
  },
});
