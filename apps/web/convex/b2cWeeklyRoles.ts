import { v } from "convex/values";
import { internalAction, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { emailButton, sendB2cEmail } from "./b2cEmail";

// ============================================================================
// Monday roles announcement. The job board is the one feature every new
// member used in week one — and nobody knew ~50 roles land on it every
// Monday. After `/import-jobs`, this tells every member, in-app and by
// email. Not a cron: the import is a manual Monday step, so this is its
// last step (`announceWeeklyRoles`), guarded so a re-run can't send twice.
// ============================================================================

const DAY = 86_400_000;
const WEEKLY_SLOT_KIND = "weekly_roles";
const WEEKLY_SLOT_COOLDOWN_MS = 5 * DAY;

export interface RolesWindow {
  count: number;
  topIndustries: string[];
  newestTitles: string[];
}

/** Active roles added since `since`. Also feeds the dashboard "This week" card. */
export const countRolesAddedSince = internalQuery({
  args: { since: v.number() },
  handler: async (ctx, args): Promise<RolesWindow> => {
    const jobs = await ctx.db
      .query("b2cPublicJobs")
      .withIndex("by_status", (q) => q.eq("status", "active").gte("createdAt", args.since))
      .order("desc")
      .collect();
    const byIndustry = new Map<string, number>();
    for (const j of jobs) byIndustry.set(j.industry, (byIndustry.get(j.industry) ?? 0) + 1);
    const topIndustries = [...byIndustry.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([name]) => name);
    return {
      count: jobs.length,
      topIndustries,
      newestTitles: jobs.slice(0, 5).map((j) => j.title),
    };
  },
});

export const announceWeeklyRoles = internalAction({
  args: { dryRun: v.boolean() },
  handler: async (
    ctx,
    args,
  ): Promise<{
    roles: RolesWindow;
    audience: number;
    emailed: number;
    inApp: number;
    subject: string;
    skipped?: string;
  }> => {
    const roles = await ctx.runQuery(internal.b2cWeeklyRoles.countRolesAddedSince, {
      since: Date.now() - 7 * DAY,
    });
    const subject = `${roles.count} new roles on the Sequ3nce board this week`;
    const members = await ctx.runQuery(internal.b2cSystemNotifications.listNotifiableMembers, {});
    const base = { roles, audience: members.length, emailed: 0, inApp: 0, subject };
    if (roles.count === 0) return { ...base, skipped: "no roles added in the last 7 days" };
    if (members.length === 0) return { ...base, skipped: "no notifiable members" };
    if (args.dryRun) return base;

    const slot = await ctx.runMutation(internal.adminAlerts.claimAlertSlot, {
      kind: WEEKLY_SLOT_KIND,
      cooldownMs: WEEKLY_SLOT_COOLDOWN_MS,
    });
    if (!slot.send) return { ...base, skipped: "already announced in the last 5 days" };

    const industries = roles.topIndustries.length ? ` · top: ${roles.topIndustries.join(", ")}` : "";
    const inApp = await ctx.runMutation(internal.b2cSystemNotifications.sendSystemNotification, {
      kind: WEEKLY_SLOT_KIND,
      body:
        `${roles.count} new roles landed on the Job Board this week${industries}. ` +
        `Newest: ${roles.newestTitles.slice(0, 3).join(" · ")}. Open the Job Board → track the ones worth a shot.`,
    });

    let emailed = 0;
    const list = roles.newestTitles.map((t) => `<li style="margin: 4px 0;">${t}</li>`).join("");
    for (const m of members) {
      if (m.optedOut) continue;
      const first = m.name.split(/\s+/)[0] || "there";
      const result = await sendB2cEmail(ctx, {
        kind: "digest",
        to: m.email,
        subject,
        html: `
          <h2 style="margin: 24px 0 8px;">${roles.count} new roles this week, ${first}.</h2>
          <p style="color: #444; line-height: 1.6;">
            Fresh on the Sequ3nce Job Board${industries}. The newest five:
          </p>
          <ul style="color: #444; line-height: 1.6; padding-left: 20px;">${list}</ul>
          ${emailButton("https://sequ3nce.ai/personal/download", "Open Sequ3nce → Job Board")}
          <p style="color: #444; line-height: 1.6;">
            Track the ones worth a shot — a complete profile is what gets you referred to partner roles.
          </p>
        `,
      });
      if (result.sent) emailed++;
    }
    return { ...base, inApp: inApp.recipientCount, emailed };
  },
});
