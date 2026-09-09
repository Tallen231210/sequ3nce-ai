import { v } from "convex/values";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { emailButton, sendB2cEmail } from "./b2cEmail";

// ============================================================================
// Monday roles note — one identical message to every member, in-app + email:
// how many new sales roles landed this week (our curated import + the live
// FreeHire feed), with the feed broken down by lane.
//
// Runs from the Monday cron (crons.ts "weekly-roles-digest") whether or not
// the import has landed; `/import-jobs` can also trigger it by hand. A 5-day
// slot in adminAlerts prevents a double send. If the feed is unreachable the
// curated-only note still goes out. Every run — dry or real — records a
// snapshot the dashboard's "New roles this week" tile reads, so the app and
// the note always show the same headline number.
//
// The feed is read with the same public search the app uses (read-only, no
// key). Lanes named here stay off the co-founder's no-list.
// ============================================================================

const DAY = 86_400_000;
const WEEKLY_SLOT_KIND = "weekly_roles";
const WEEKLY_SLOT_COOLDOWN_MS = 5 * DAY;
const FEED_SEARCH = "https://freehire.me/api/v1/jobs/search";
const FEED_TIMEOUT_MS = 10_000;
const FEED_WINDOW_DAYS = 7;
/** Same lane queries the app's job board sends (apps/personal/src/index.ts). */
const FEED_LANES = {
  closer: "closer",
  accountExecutive: '"account executive"',
  leadership: '"sales manager"',
} as const;

export interface RolesWindow {
  count: number;
  topIndustries: string[];
  newestTitles: string[];
}

export interface FeedTotals {
  total: number;
  closer: number;
  accountExecutive: number;
  leadership: number;
  remote: number;
}

async function feedTotal(params: Record<string, string>): Promise<number> {
  const query = new URLSearchParams({
    category: "sales",
    limit: "1",
    offset: "0",
    posted_within_days: String(FEED_WINDOW_DAYS),
    // Feed quirk (verified 2026-09-09): posted_within_days is only honored
    // when salary_currency is present. Without it "7 days" returned 21,912
    // (not a date window); with it, 321 — and 1d/7d/30d scale sanely.
    salary_currency: "USD",
    ...params,
  });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FEED_TIMEOUT_MS);
  try {
    const res = await fetch(`${FEED_SEARCH}?${query.toString()}`, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`feed status ${res.status}`);
    const body = (await res.json()) as { meta?: { total?: unknown } };
    const total = body.meta?.total;
    if (typeof total !== "number") throw new Error("feed response missing meta.total");
    return total;
  } finally {
    clearTimeout(timer);
  }
}

/** Five tiny reads, once a week. Throws if any fails — the caller decides. */
export async function fetchFeedTotals(): Promise<FeedTotals> {
  const [total, closer, accountExecutive, leadership, remote] = await Promise.all([
    feedTotal({}),
    feedTotal({ q: FEED_LANES.closer }),
    feedTotal({ q: FEED_LANES.accountExecutive }),
    feedTotal({ q: FEED_LANES.leadership }),
    feedTotal({ work_mode: "remote" }),
  ]);
  return { total, closer, accountExecutive, leadership, remote };
}

/** Manual check: what the feed reports right now. */
export const probeFeedTotals = internalAction({
  args: {},
  handler: async (): Promise<FeedTotals> => await fetchFeedTotals(),
});

/** Active curated roles added since `since`. */
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
    return { count: jobs.length, topIndustries, newestTitles: jobs.slice(0, 5).map((j) => j.title) };
  },
});

export const saveSnapshot = internalMutation({
  args: {
    curatedCount: v.number(),
    curatedTopIndustries: v.array(v.string()),
    feed: v.optional(
      v.object({
        total: v.number(),
        closer: v.number(),
        accountExecutive: v.number(),
        leadership: v.number(),
        remote: v.number(),
      }),
    ),
    feedError: v.optional(v.string()),
    sent: v.boolean(),
  },
  handler: async (ctx, args) => {
    const { feed, ...rest } = args;
    return await ctx.db.insert("b2cWeeklyRolesSnapshots", {
      ...rest,
      computedAt: Date.now(),
      feedTotal: feed?.total,
      feedLanes: feed
        ? { closer: feed.closer, accountExecutive: feed.accountExecutive, leadership: feed.leadership, remote: feed.remote }
        : undefined,
    });
  },
});

function laneLine(feed: FeedTotals): string {
  return `Closer ${feed.closer} · Account executive ${feed.accountExecutive} · Sales leadership ${feed.leadership} · Remote ${feed.remote}`;
}

export const announceWeeklyRoles = internalAction({
  args: { dryRun: v.boolean() },
  handler: async (
    ctx,
    args,
  ): Promise<{
    headline: number;
    curated: RolesWindow;
    feed: FeedTotals | null;
    feedError?: string;
    audience: number;
    emailed: number;
    inApp: number;
    subject: string;
    preview: string;
    skipped?: string;
  }> => {
    const curated = await ctx.runQuery(internal.b2cWeeklyRoles.countRolesAddedSince, {
      since: Date.now() - FEED_WINDOW_DAYS * DAY,
    });
    let feed: FeedTotals | null = null;
    let feedError: string | undefined;
    try {
      feed = await fetchFeedTotals();
    } catch (error) {
      feedError = error instanceof Error ? error.message : String(error);
      console.error(`[b2cWeeklyRoles] live feed unreachable — sending curated-only: ${feedError}`);
    }
    const headline = curated.count + (feed?.total ?? 0);
    const industries = curated.topIndustries.length ? ` (${curated.topIndustries.join(", ")})` : "";
    // Name only the sources that actually have roles this week — no
    // "0 hand-picked" when the import hasn't landed yet.
    const parts: string[] = [];
    if (curated.count > 0) parts.push(`${curated.count} hand-picked by Sequ3nce${industries}`);
    if (feed && feed.total > 0) parts.push(`${feed.total} on the live feed`);
    const sources = `${parts.join(" + ")}.${feed && feed.total > 0 ? ` ${laneLine(feed)}.` : ""}`;
    const preview = `This week on the Job Board: ${headline} new sales roles — ${sources} Open the Job Board → track the ones worth a shot.`;
    const subject = `${headline} new sales roles this week on the Sequ3nce board`;

    const members = await ctx.runQuery(internal.b2cSystemNotifications.listNotifiableMembers, {});
    const base = { headline, curated, feed, feedError, audience: members.length, emailed: 0, inApp: 0, subject, preview };

    // The snapshot is a fact about this week; record it even on a dry run.
    await ctx.runMutation(internal.b2cWeeklyRoles.saveSnapshot, {
      curatedCount: curated.count,
      curatedTopIndustries: curated.topIndustries,
      feed: feed ?? undefined,
      feedError,
      sent: false,
    });

    if (headline === 0) return { ...base, skipped: "no new roles in the last 7 days" };
    if (members.length === 0) return { ...base, skipped: "no notifiable members" };
    if (args.dryRun) return base;

    const slot = await ctx.runMutation(internal.adminAlerts.claimAlertSlot, {
      kind: WEEKLY_SLOT_KIND,
      cooldownMs: WEEKLY_SLOT_COOLDOWN_MS,
    });
    if (!slot.send) return { ...base, skipped: "already announced in the last 5 days" };

    const inApp = await ctx.runMutation(internal.b2cSystemNotifications.sendSystemNotification, {
      kind: WEEKLY_SLOT_KIND,
      body: preview,
    });

    const laneRows = feed
      ? [
          ["Closer", feed.closer],
          ["Account executive", feed.accountExecutive],
          ["Sales leadership", feed.leadership],
          ["Remote", feed.remote],
        ]
          .map(
            ([label, n]) =>
              `<tr><td style="padding: 4px 16px 4px 0; color: #666;">${label}</td><td style="padding: 4px 0; font-weight: 600;">${n}</td></tr>`,
          )
          .join("")
      : "";
    const newest = curated.newestTitles.map((t) => `<li style="margin: 4px 0;">${t}</li>`).join("");
    let emailed = 0;
    for (const m of members) {
      if (m.optedOut) continue;
      const result = await sendB2cEmail(ctx, {
        kind: "digest",
        to: m.email,
        subject,
        html: `
          <h2 style="margin: 24px 0 8px;">${headline} new sales roles this week.</h2>
          <p style="color: #444; line-height: 1.6;">${parts.join(" and ")}.</p>
          ${feed ? `<table style="border-collapse: collapse; font-size: 14px;">${laneRows}</table>` : ""}
          ${newest ? `<p style="color: #444; line-height: 1.6; margin-top: 16px;">Newest hand-picked:</p><ul style="color: #444; line-height: 1.6; padding-left: 20px;">${newest}</ul>` : ""}
          ${emailButton("https://sequ3nce.ai/personal/download", "Open Sequ3nce → Job Board")}
          <p style="color: #444; line-height: 1.6;">Track the ones worth a shot — a complete profile is what gets you referred to partner roles.</p>
        `,
      });
      if (result.sent) emailed++;
    }
    await ctx.runMutation(internal.b2cWeeklyRoles.saveSnapshot, {
      curatedCount: curated.count,
      curatedTopIndustries: curated.topIndustries,
      feed: feed ?? undefined,
      feedError,
      sent: true,
    });
    return { ...base, inApp: inApp.recipientCount, emailed };
  },
});
