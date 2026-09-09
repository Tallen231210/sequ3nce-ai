import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { sendB2cEmail } from "./b2cEmail";
import type { MemberSnapshot } from "./b2cMemberActivity";

// ============================================================================
// Daily new-member health digest for the founder: one line per member in
// their first 14 days — profile %, calls, roles tracked, channels opened,
// last seen, cancelled or not. At three signups a week the founder IS the
// retention system; this gives them eyes without a dashboard. Silent when
// the cohort is empty (silence-when-nothing is load-bearing, like the
// collections digest). Cron: crons.ts "new-member-digest".
// ============================================================================

const COHORT_DAYS = 14;

function ago(ms?: number): string {
  if (!ms) return "never";
  const h = (Date.now() - ms) / 3_600_000;
  if (h < 1) return `${Math.round(h * 60)}m`;
  if (h < 48) return `${Math.round(h)}h`;
  return `${Math.round(h / 24)}d`;
}

function row(s: MemberSnapshot): string {
  const flag = s.cancelAtPeriodEnd || s.subscriptionStatus === "cancelled";
  const status = flag
    ? `<strong style="color: #b00;">CANCELLED${s.cancellationReason ? ` (${s.cancellationReason})` : ""}</strong>`
    : s.hasPassword
      ? "active"
      : `<strong style="color: #b00;">never activated</strong>`;
  const cells = [
    `${s.name}<br/><span style="color: #888; font-size: 12px;">${s.email}</span>`,
    `${s.daysSinceSignup}d`,
    status,
    ago(s.lastSeenAt),
    `${s.profilePct}%`,
    String(s.callsRecorded),
    String(s.rolesTracked),
    String(s.channelsOpened),
    `${s.posts}/${s.comments}`,
    `${s.coachingAttended}${s.classroomJoined ? " · in classroom" : ""}`,
  ];
  return `<tr>${cells
    .map((c) => `<td style="padding: 6px 10px; border-top: 1px solid #eee; vertical-align: top;">${c}</td>`)
    .join("")}</tr>`;
}

export const runNewMemberDigest = internalAction({
  args: { dryRun: v.optional(v.boolean()) },
  handler: async (
    ctx,
    args,
  ): Promise<{ members: number; sent: boolean; html?: string; skipped?: string }> => {
    const snapshots = await ctx.runQuery(internal.b2cMemberActivity.listRecentMemberSnapshots, {
      withinDays: COHORT_DAYS,
    });
    if (snapshots.length === 0) return { members: 0, sent: false, skipped: "empty cohort — silent" };

    const headers = ["Member", "Age", "Status", "Seen", "Profile", "Calls", "Roles", "Channels", "Posts/Comments", "Coaching"];
    const html = `
      <h2 style="margin: 24px 0 8px;">New members — first ${COHORT_DAYS} days</h2>
      <p style="color: #444; line-height: 1.6;">${snapshots.length} member${snapshots.length === 1 ? "" : "s"}, newest first.</p>
      <table style="border-collapse: collapse; font-size: 13px; width: 100%;">
        <thead><tr>${headers
          .map((h) => `<th style="text-align: left; padding: 6px 10px; color: #666; font-weight: 600;">${h}</th>`)
          .join("")}</tr></thead>
        <tbody>${snapshots.map(row).join("")}</tbody>
      </table>
      <p style="color: #999; font-size: 12px; line-height: 1.5; margin-top: 24px;">
        Daily at 9:33 ET while anyone is in their first ${COHORT_DAYS} days. Red = worth a message today.
      </p>
    `;
    if (args.dryRun) return { members: snapshots.length, sent: false, html };

    const flagged = snapshots.filter(
      (s) => s.cancelAtPeriodEnd || s.subscriptionStatus === "cancelled" || !s.hasPassword,
    ).length;
    const result = await sendB2cEmail(ctx, {
      kind: "founder",
      subject: `New members: ${snapshots.length} in their first ${COHORT_DAYS} days${flagged ? ` · ${flagged} need attention` : ""}`,
      html,
      raw: false,
    });
    return { members: snapshots.length, sent: result.sent };
  },
});
