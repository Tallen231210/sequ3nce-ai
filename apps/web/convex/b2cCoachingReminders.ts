import { v } from "convex/values";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { emailButton, sendB2cEmail } from "./b2cEmail";

// ============================================================================
// Coaching-call reminders. Before this, a call went on everyone's in-app
// Schedule and that was it — the first real call had zero attendees while
// two brand-new members had just joined the classroom.
//
//   24h before → in-app note to every active member (minus the coach) and an
//                EMAIL to the coach's classroom members (they opted in by
//                joining; keeps the weekly email count honest).
//   1h before  → in-app only, classroom members only.
//   cancelled  → in-app note to classroom members (closes the old TODO).
//
// Jobs are stored on the call (`reminderJobIds`) so cancel/reschedule can
// cancel them, and every job re-checks the call before sending — a stale
// job is harmless. No per-member timezone exists, so times are written as
// "12:00 PM ET (9:00 AM PT)", with the landing-page lead's timezone as an
// optional override in email.
// ============================================================================

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const IMMINENT_MS = 5 * 60_000;
type Kind = "24h" | "1h";
const OFFSETS: Record<Kind, number> = { "24h": DAY, "1h": HOUR };

function fmtIn(ms: number, timeZone: string, withDay: boolean): string | null {
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone,
      ...(withDay ? { weekday: "short" } : {}),
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(ms));
  } catch {
    return null;
  }
}

/** "Thu 12:00 PM ET (9:00 AM PT)" — or the member's own zone first when known. */
export function describeCallTime(ms: number, memberTz?: string): string {
  const et = fmtIn(ms, "America/New_York", true);
  const pt = fmtIn(ms, "America/Los_Angeles", false);
  if (!et || !pt) return new Date(ms).toUTCString();
  if (memberTz && memberTz !== "America/New_York") {
    const own = fmtIn(ms, memberTz, true);
    if (own) {
      const label = memberTz.split("/").pop()?.replace(/_/g, " ") ?? memberTz;
      return `${own} (${label}) · ${et} ET`;
    }
  }
  return `${et} ET (${pt} PT)`;
}

async function scheduleJobs(ctx: MutationCtx, call: Doc<"b2cCoachingCalls">): Promise<number> {
  const now = Date.now();
  const ids: Id<"_scheduled_functions">[] = [];
  for (const kind of ["24h", "1h"] as Kind[]) {
    let delay = call.scheduledStartTime - OFFSETS[kind] - now;
    if (delay < 0) {
      // Less than 24h out: no "tomorrow" note. Less than 1h out but not
      // imminent: send the 1h note right away.
      if (kind === "24h" || call.scheduledStartTime - now < IMMINENT_MS) continue;
      delay = 0;
    }
    ids.push(
      await ctx.scheduler.runAfter(delay, internal.b2cCoachingReminders.sendReminder, {
        callId: call._id,
        kind,
        expectedStart: call.scheduledStartTime,
      }),
    );
  }
  await ctx.db.patch(call._id, { reminderJobIds: ids });
  return ids.length;
}

async function cancelJobs(ctx: MutationCtx, call: Doc<"b2cCoachingCalls">): Promise<number> {
  const ids = call.reminderJobIds ?? [];
  for (const id of ids) {
    try {
      await ctx.scheduler.cancel(id);
    } catch {
      // Already ran or was cleaned up — the job's own guard covers the rest.
    }
  }
  if (ids.length) await ctx.db.patch(call._id, { reminderJobIds: undefined });
  return ids.length;
}

/** Called after create and after reschedule (cancels any older jobs first). */
export const scheduleForCall = internalMutation({
  args: { callId: v.id("b2cCoachingCalls") },
  handler: async (ctx, args) => {
    const call = await ctx.db.get(args.callId);
    if (!call || call.status !== "scheduled") return { scheduled: 0 };
    const cancelled = await cancelJobs(ctx, call);
    const scheduled = await scheduleJobs(ctx, { ...call, reminderJobIds: undefined });
    return { scheduled, cancelled };
  },
});

export const cancelForCall = internalMutation({
  args: { callId: v.id("b2cCoachingCalls") },
  handler: async (ctx, args) => {
    const call = await ctx.db.get(args.callId);
    if (!call) return { cancelled: 0 };
    return { cancelled: await cancelJobs(ctx, call) };
  },
});

/** One-off after deploy: give already-scheduled future calls their jobs. */
export const scheduleRemindersForUpcoming = internalMutation({
  args: { dryRun: v.boolean() },
  handler: async (ctx, args) => {
    const calls = await ctx.db
      .query("b2cCoachingCalls")
      .withIndex("by_status_start", (q) => q.eq("status", "scheduled").gt("scheduledStartTime", Date.now()))
      .collect();
    const pending = calls.filter((c) => !c.reminderJobIds?.length);
    if (args.dryRun) return { upcoming: calls.length, wouldSchedule: pending.map((c) => c.title) };
    let scheduled = 0;
    for (const c of pending) scheduled += await scheduleJobs(ctx, c);
    return { upcoming: calls.length, scheduledCalls: pending.length, jobs: scheduled };
  },
});

export const getReminderContext = internalQuery({
  args: { callId: v.id("b2cCoachingCalls") },
  handler: async (ctx, args) => {
    const call = await ctx.db.get(args.callId);
    if (!call) return null;
    const coachUser = await ctx.db.get(call.coachUserId);
    const coach = await ctx.db
      .query("b2cCoaches")
      .withIndex("by_user", (q) => q.eq("userId", call.coachUserId))
      .first();
    const memberships = coach
      ? await ctx.db
          .query("b2cClassroomMemberships")
          .withIndex("by_coach", (q) => q.eq("coachId", coach._id))
          .collect()
      : [];
    const members: Array<{ userId: Id<"b2cUsers">; email: string; name: string; timezone?: string }> = [];
    for (const m of memberships) {
      const u = await ctx.db.get(m.userId);
      if (!u || u.isTestAccount === true || u.subscriptionStatus !== "active") continue;
      if (u._id === call.coachUserId) continue;
      const lead = await ctx.db
        .query("b2cLeads")
        .withIndex("by_email", (q) => q.eq("email", u.email.toLowerCase()))
        .first();
      members.push({ userId: u._id, email: u.email, name: u.name, timezone: lead?.timezone ?? undefined });
    }
    return { call, coachName: coachUser?.name ?? "your coach", members };
  },
});

export const sendReminder = internalAction({
  args: {
    callId: v.id("b2cCoachingCalls"),
    kind: v.union(v.literal("24h"), v.literal("1h")),
    expectedStart: v.number(),
  },
  handler: async (ctx, args): Promise<{ skipped?: string; inApp: number; emailed: number }> => {
    const data = await ctx.runQuery(internal.b2cCoachingReminders.getReminderContext, { callId: args.callId });
    if (!data) return { skipped: "no call", inApp: 0, emailed: 0 };
    const { call, coachName, members } = data;
    if (call.status !== "scheduled") return { skipped: `status ${call.status}`, inApp: 0, emailed: 0 };
    if (call.scheduledStartTime !== args.expectedStart) return { skipped: "rescheduled", inApp: 0, emailed: 0 };

    const when = describeCallTime(call.scheduledStartTime);
    const lead = args.kind === "24h" ? "Coaching call tomorrow" : "Coaching call in 1 hour";
    const body = `${lead}: "${call.title}" with ${coachName} — ${when}. Open Sequ3nce → Community → Coaching to join.`;

    let recipientIds: Id<"b2cUsers">[] | undefined;
    if (args.kind === "24h") {
      const all = await ctx.runQuery(internal.b2cSystemNotifications.listNotifiableMembers, {});
      recipientIds = all.map((m) => m.userId).filter((id) => id !== call.coachUserId);
    } else {
      recipientIds = members.map((m) => m.userId);
    }
    let inApp = 0;
    if (recipientIds.length) {
      const r = await ctx.runMutation(internal.b2cSystemNotifications.sendSystemNotification, {
        kind: `coaching_${args.kind}`,
        body,
        recipientIds,
      });
      inApp = r.recipientCount;
    }

    let emailed = 0;
    if (args.kind === "24h") {
      for (const m of members) {
        const first = m.name.split(/\s+/)[0] || "there";
        const result = await sendB2cEmail(ctx, {
          kind: "reminder",
          to: m.email,
          subject: `Coaching call tomorrow: ${call.title}`,
          html: `
            <h2 style="margin: 24px 0 8px;">${first}, ${coachName} is live tomorrow.</h2>
            <p style="color: #444; line-height: 1.6;"><strong>${call.title}</strong><br/>${describeCallTime(call.scheduledStartTime, m.timezone)} · ${call.scheduledDurationMin} min</p>
            ${call.description ? `<p style="color: #444; line-height: 1.6;">${call.description}</p>` : ""}
            <p style="color: #444; line-height: 1.6;">Join from the app: Community → Coaching → Join. You'll get an in-app nudge an hour before.</p>
            ${emailButton("https://sequ3nce.ai/personal/download", "Open Sequ3nce")}
          `,
        });
        if (result.sent) emailed++;
      }
    }
    return { inApp, emailed };
  },
});

export const notifyCancelled = internalAction({
  args: { callId: v.id("b2cCoachingCalls") },
  handler: async (ctx, args): Promise<{ inApp: number }> => {
    const data = await ctx.runQuery(internal.b2cCoachingReminders.getReminderContext, { callId: args.callId });
    if (!data || data.members.length === 0) return { inApp: 0 };
    const { call, coachName, members } = data;
    const reason = call.cancelledReason ? ` Reason: ${call.cancelledReason}` : "";
    const r = await ctx.runMutation(internal.b2cSystemNotifications.sendSystemNotification, {
      kind: "coaching_cancelled",
      body: `Cancelled: "${call.title}" with ${coachName} (was ${describeCallTime(call.scheduledStartTime)}).${reason}`,
      recipientIds: members.map((m) => m.userId),
    });
    return { inApp: r.recipientCount };
  },
});
