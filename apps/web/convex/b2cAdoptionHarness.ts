// ============================================================================
// End-to-end harness for the adoption batch, for the DEV deployment.
//
// Provisions throwaway members exactly the way a Polar checkout does, then
// drives the real cancellation write-back, activation nudge, coaching
// reminders, weekly roles announcement, new-member digest and unsubscribe
// paths, checking what each wrote. Deletes everything it made, pass or
// fail. Run with EMAIL_DRY_RUN=1 set on the deployment.
//
//   npx convex run b2cAdoptionHarness:runAll '{}'
//
// Refuses to run against production.
// ============================================================================

import { v } from "convex/values";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { sendB2cEmail, unsubscribeToken } from "./b2cEmail";

const HOUR = 3_600_000;
const P = "hz-adopt-";
const DOMAIN = "sequ3nce.test";

interface Check {
  name: string;
  pass: boolean;
  detail?: string;
}

export const hzPatchUser = internalMutation({
  args: { email: v.string(), patch: v.any() },
  handler: async (ctx, args) => {
    const u = await ctx.db.query("b2cUsers").withIndex("by_email", (q) => q.eq("email", args.email)).first();
    if (!u) throw new Error(`no fixture ${args.email}`);
    await ctx.db.patch(u._id, args.patch);
    return u._id;
  },
});

export const hzReadUser = internalQuery({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db.query("b2cUsers").withIndex("by_email", (q) => q.eq("email", args.email)).first();
  },
});

export const hzReadCall = internalQuery({
  args: { callId: v.id("b2cCoachingCalls") },
  handler: async (ctx, args) => await ctx.db.get(args.callId),
});

export const hzLatestSnapshot = internalQuery({
  args: {},
  handler: async (ctx) =>
    await ctx.db.query("b2cWeeklyRolesSnapshots").withIndex("by_computed").order("desc").first(),
});

export const hzSetup = internalMutation({
  args: { coachEmail: v.string(), memberEmail: v.string() },
  handler: async (ctx, args) => {
    const coach = await ctx.db.query("b2cUsers").withIndex("by_email", (q) => q.eq("email", args.coachEmail)).first();
    const member = await ctx.db.query("b2cUsers").withIndex("by_email", (q) => q.eq("email", args.memberEmail)).first();
    if (!coach || !member) throw new Error("fixtures missing");
    await ctx.db.patch(coach._id, { badges: ["coach"] });
    const now = Date.now();
    const coachId = await ctx.db.insert("b2cCoaches", {
      userId: coach._id,
      slug: `${P}coach`,
      displayName: "Harness Coach",
      isActive: true,
      createdAt: now,
    });
    await ctx.db.insert("b2cClassroomMemberships", { coachId, userId: member._id, tier: "free", joinedAt: now });
    const founders = (await ctx.db.query("b2cUsers").collect()).filter((u) => u.badges?.includes("founder"));
    let founderCreated = false;
    if (founders.length === 0) {
      // System messages need a sender. Kept after the run (dev only).
      await ctx.db.patch(member._id, { badges: undefined });
      const teamId = await ctx.db.insert("teams", { name: "Harness Founder", type: "personal", plan: "active", createdAt: now });
      await ctx.db.insert("b2cUsers", {
        email: `${P}founder@${DOMAIN}`,
        phoneVerified: false,
        emailVerified: true,
        name: "Harness Founder",
        personalWorkspaceId: teamId,
        subscriptionStatus: "active",
        badges: ["founder"],
        isTestAccount: true,
        createdAt: now,
      });
      founderCreated = true;
    }
    const jobId = await ctx.db.insert("b2cPublicJobs", {
      companyName: "Harness Co",
      title: `${P}Closer — Coaching Offer`,
      location: "Remote",
      industry: "Coaching",
      applyUrl: `https://${DOMAIN}/${P}job`,
      addedBy: coach._id,
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
    return { coachId, jobId, founderCreated };
  },
});

export const hzCleanup = internalMutation({
  args: { emails: v.array(v.string()), callId: v.optional(v.id("b2cCoachingCalls")), jobId: v.optional(v.id("b2cPublicJobs")), snapshotsSince: v.optional(v.number()) },
  handler: async (ctx, args) => {
    let deleted = 0;
    for (const email of args.emails) {
      const u = await ctx.db.query("b2cUsers").withIndex("by_email", (q) => q.eq("email", email)).first();
      if (!u) continue;
      for (const c of await ctx.db.query("b2cCoaches").withIndex("by_user", (q) => q.eq("userId", u._id)).collect()) {
        for (const m of await ctx.db.query("b2cClassroomMemberships").withIndex("by_coach", (q) => q.eq("coachId", c._id)).collect()) {
          await ctx.db.delete(m._id); deleted++;
        }
        await ctx.db.delete(c._id); deleted++;
      }
      const thread = await ctx.db.query("b2cDirectMessageThreads").withIndex("by_participant_key", (q) => q.eq("participantKey", `team_${u._id}`)).first();
      if (thread) {
        for (const m of await ctx.db.query("b2cDirectMessages").withIndex("by_thread", (q) => q.eq("threadId", thread._id)).collect()) {
          await ctx.db.delete(m._id); deleted++;
        }
        await ctx.db.delete(thread._id); deleted++;
      }
      for (const kind of [`b2c_cancel_${u._id}`, `b2c_activation_${u._id}`]) {
        for (const a of await ctx.db.query("adminAlerts").withIndex("by_kind", (q) => q.eq("kind", kind)).collect()) {
          await ctx.db.delete(a._id); deleted++;
        }
      }
      if (u.personalWorkspaceId) {
        for (const c of await ctx.db.query("closers").withIndex("by_team", (q) => q.eq("teamId", u.personalWorkspaceId)).collect()) {
          await ctx.db.delete(c._id); deleted++;
        }
        await ctx.db.delete(u.personalWorkspaceId); deleted++;
      }
      await ctx.db.delete(u._id); deleted++;
    }
    if (args.callId) {
      for (const e of await ctx.db.query("calendarEvents").withIndex("by_coaching_call", (q) => q.eq("coachingCallId", args.callId)).collect()) {
        await ctx.db.delete(e._id); deleted++;
      }
      const call = await ctx.db.get(args.callId);
      if (call) {
        for (const id of call.reminderJobIds ?? []) { try { await ctx.scheduler.cancel(id); } catch { /* fired */ } }
        await ctx.db.delete(call._id); deleted++;
      }
    }
    if (args.jobId && (await ctx.db.get(args.jobId))) { await ctx.db.delete(args.jobId); deleted++; }
    for (const a of await ctx.db.query("adminAlerts").withIndex("by_kind", (q) => q.eq("kind", "weekly_roles")).collect()) {
      await ctx.db.delete(a._id); deleted++;
    }
    if (args.snapshotsSince !== undefined) {
      for (const s of await ctx.db.query("b2cWeeklyRolesSnapshots").withIndex("by_computed", (q) => q.gte("computedAt", args.snapshotsSince!)).collect()) {
        await ctx.db.delete(s._id); deleted++;
      }
    }
    return { deleted };
  },
});

export const runAll = internalAction({
  args: {},
  handler: async (ctx): Promise<{ allPass: boolean; checks: Check[] }> => {
    const site = process.env.CONVEX_SITE_URL ?? "";
    if (site.includes("ideal-ram-982")) throw new Error("Refusing to run the harness against production");
    if (process.env.EMAIL_DRY_RUN !== "1") throw new Error("Set EMAIL_DRY_RUN=1 on this deployment first");

    const checks: Check[] = [];
    const ok = (name: string, pass: boolean, detail?: string) => checks.push({ name, pass, detail });
    const now = Date.now();
    const memberEmail = `${P}member-${now}@${DOMAIN}`;
    const coachEmail = `${P}coach-${now}@${DOMAIN}`;
    let callId: Id<"b2cCoachingCalls"> | undefined;
    let jobId: Id<"b2cPublicJobs"> | undefined;

    try {
      // --- provisioning through the real checkout path -------------------
      for (const [email, name] of [[memberEmail, "Harness Member"], [coachEmail, "Harness Coach"]]) {
        const r = await ctx.runMutation(internal.b2cPolar.applyB2CSubscription, {
          polarCustomerId: `${P}cus-${email}`, polarSubscriptionId: `${P}sub-${email}`, status: "active",
          planTerm: "monthly", email, name, currentPeriodEnd: now + 30 * 24 * HOUR, modifiedAt: now,
        });
        ok(`provision ${name}`, r.provisioned === true, JSON.stringify(r));
      }
      const member = await ctx.runQuery(internal.b2cAdoptionHarness.hzReadUser, { email: memberEmail });
      if (!member) throw new Error("member fixture missing");
      const setup = await ctx.runMutation(internal.b2cAdoptionHarness.hzSetup, { coachEmail, memberEmail });
      jobId = setup.jobId;

      // --- 1. cancellation write-back ---------------------------------------
      const cancelArgs = {
        polarCustomerId: `${P}cus-${memberEmail}`, polarSubscriptionId: `${P}sub-${memberEmail}`, status: "active",
        planTerm: "monthly" as const, email: memberEmail, currentPeriodEnd: now + 30 * 24 * HOUR,
      };
      await ctx.runMutation(internal.b2cPolar.applyB2CSubscription, {
        ...cancelArgs, cancelAtPeriodEnd: true, canceledAt: now + 1, cancellationReason: "too_expensive", cancellationComment: "harness", modifiedAt: now + 1000,
      });
      let u = await ctx.runQuery(internal.b2cAdoptionHarness.hzReadUser, { email: memberEmail });
      ok("cancel: flag + reason stored, status still active",
        u?.cancelAtPeriodEnd === true && u?.cancellationReason === "too_expensive" && u?.subscriptionStatus === "active", JSON.stringify({ c: u?.cancelAtPeriodEnd, r: u?.cancellationReason, s: u?.subscriptionStatus }));
      const stale = await ctx.runMutation(internal.b2cPolar.applyB2CSubscription, { ...cancelArgs, cancelAtPeriodEnd: false, modifiedAt: now + 500 });
      u = await ctx.runQuery(internal.b2cAdoptionHarness.hzReadUser, { email: memberEmail });
      ok("cancel: stale older event ignored", stale.applied === false && u?.cancelAtPeriodEnd === true, JSON.stringify(stale));
      const a1 = await ctx.runAction(internal.b2cChurnAlerts.sendCancellationAlert, { userId: member._id, trigger: "cancel_at_period_end" });
      const a2 = await ctx.runAction(internal.b2cChurnAlerts.sendCancellationAlert, { userId: member._id, trigger: "cancel_at_period_end" });
      // The transition itself schedules the alert (runAfter 0), so a direct
      // call usually lands on the cooldown — either way, exactly one send.
      ok("cancel: founder alert fires once (transition), repeats hit cooldown", (a1.sent === true || a1.reason === "cooldown") && a2.sent === false && a2.reason === "cooldown", JSON.stringify({ a1, a2 }));
      await ctx.runMutation(internal.b2cPolar.applyB2CSubscription, { ...cancelArgs, cancelAtPeriodEnd: false, modifiedAt: now + 2000 });
      u = await ctx.runQuery(internal.b2cAdoptionHarness.hzReadUser, { email: memberEmail });
      ok("cancel: uncanceled clears the fields", u?.cancelAtPeriodEnd === false && !u?.cancellationReason, JSON.stringify({ c: u?.cancelAtPeriodEnd, r: u?.cancellationReason }));

      // --- 3. activation nudges keep the welcome code -----------------------
      await ctx.runMutation(internal.b2cAdoptionHarness.hzPatchUser, { email: memberEmail, patch: { passwordResetCode: "hz-code-hash" } });
      await ctx.runAction(internal.b2cPolar.sendActivationReminder, { b2cUserId: member._id, email: memberEmail, name: "Harness Member", code: "123456", stage: "1h" });
      u = await ctx.runQuery(internal.b2cAdoptionHarness.hzReadUser, { email: memberEmail });
      ok("nudge: sent (stamped) without minting a new code", !!u?.activationNudgedAt && u?.passwordResetCode === "hz-code-hash", JSON.stringify({ stamped: u?.activationNudgedAt, code: u?.passwordResetCode }));
      const act = await ctx.runAction(internal.b2cChurnAlerts.sendActivationAlert, { userId: member._id });
      ok("nudge: 24h founder alert for a passwordless member", act.sent === true, JSON.stringify(act));
      const stampBefore = u?.activationNudgedAt;
      await ctx.runMutation(internal.b2cAdoptionHarness.hzPatchUser, { email: memberEmail, patch: { passwordHash: "hz" } });
      await ctx.runAction(internal.b2cPolar.sendActivationReminder, { b2cUserId: member._id, email: memberEmail, name: "Harness Member", code: "123456", stage: "24h" });
      u = await ctx.runQuery(internal.b2cAdoptionHarness.hzReadUser, { email: memberEmail });
      ok("nudge: silent once a password exists (stamp unchanged)", u?.activationNudgedAt === stampBefore, JSON.stringify({ before: stampBefore, after: u?.activationNudgedAt }));

      // --- 2. coaching reminders --------------------------------------------
      const coach = await ctx.runQuery(internal.b2cAdoptionHarness.hzReadUser, { email: coachEmail });
      if (!coach) throw new Error("coach fixture missing");
      const created = await ctx.runMutation(api.b2cCoachingCalls.createCoachingCall, {
        coachUserId: coach._id, title: `${P}call`, scheduledStartTime: now + 90 * 60_000, scheduledDurationMin: 30,
      });
      const cid = created.callId;
      callId = cid;
      let s = await ctx.runMutation(internal.b2cCoachingReminders.scheduleForCall, { callId: cid });
      let call = await ctx.runQuery(internal.b2cAdoptionHarness.hzReadCall, { callId: cid });
      ok("reminders: 90 min out → only the 1h job", s.scheduled === 1 && call?.reminderJobIds?.length === 1, JSON.stringify(s));
      const later = now + 2 * 24 * HOUR;
      await ctx.runMutation(api.b2cCoachingCalls.rescheduleCoachingCall, { callId: cid,callerId: coach._id, scheduledStartTime: later });
      s = await ctx.runMutation(internal.b2cCoachingReminders.scheduleForCall, { callId: cid });
      call = await ctx.runQuery(internal.b2cAdoptionHarness.hzReadCall, { callId: cid });
      ok("reminders: reschedule → old cancelled, 24h + 1h scheduled", s.cancelled === 1 && s.scheduled === 2 && call?.reminderJobIds?.length === 2, JSON.stringify(s));
      const staleJob = await ctx.runAction(internal.b2cCoachingReminders.sendReminder, { callId: cid,kind: "24h", expectedStart: now + 90 * 60_000 });
      ok("reminders: job for the old time is skipped", staleJob.skipped === "rescheduled", JSON.stringify(staleJob));
      const r24 = await ctx.runAction(internal.b2cCoachingReminders.sendReminder, { callId: cid,kind: "24h", expectedStart: later });
      ok("reminders: 24h → in-app to members, email to the classroom member", r24.inApp >= 1 && r24.emailed === 1, JSON.stringify(r24));
      const r1 = await ctx.runAction(internal.b2cCoachingReminders.sendReminder, { callId: cid,kind: "1h", expectedStart: later });
      ok("reminders: 1h → classroom member in-app only", r1.inApp === 1 && r1.emailed === 0, JSON.stringify(r1));
      await ctx.runMutation(api.b2cCoachingCalls.cancelCoachingCall, { callId: cid,callerId: coach._id, reason: "harness" });
      const c = await ctx.runMutation(internal.b2cCoachingReminders.cancelForCall, { callId: cid });
      const n = await ctx.runAction(internal.b2cCoachingReminders.notifyCancelled, { callId: cid });
      call = await ctx.runQuery(internal.b2cAdoptionHarness.hzReadCall, { callId: cid });
      ok("reminders: cancel → jobs dropped + member told", (c.cancelled === 2 || !call?.reminderJobIds?.length) && n.inApp === 1, JSON.stringify({ c, n }));

      // --- A. weekly roles ---------------------------------------------------
      const dry = await ctx.runAction(internal.b2cWeeklyRoles.announceWeeklyRoles, { dryRun: true });
      ok("weekly roles: dry run counts the fixture role + audience", dry.curated.count >= 1 && dry.audience >= 1 && !dry.skipped, JSON.stringify({ count: dry.curated.count, audience: dry.audience, skipped: dry.skipped }));
      ok("weekly roles: live feed totals fetched and folded into the headline",
        !!dry.feed && dry.feed.total > 0 && dry.headline === dry.curated.count + dry.feed.total && dry.preview.includes(`${dry.headline.toLocaleString("en-US")} new sales roles`),
        JSON.stringify({ feed: dry.feed, feedError: dry.feedError, headline: dry.headline }));
      const real = await ctx.runAction(internal.b2cWeeklyRoles.announceWeeklyRoles, { dryRun: false });
      ok("weekly roles: real run posts in-app + emails (dry-run logged)", real.inApp >= 1 && real.emailed >= 1, JSON.stringify({ inApp: real.inApp, emailed: real.emailed, skipped: real.skipped }));
      const snap = await ctx.runQuery(internal.b2cAdoptionHarness.hzLatestSnapshot, {});
      ok("weekly roles: snapshot recorded for the dashboard tile", !!snap && snap.sent === true && snap.feedTotal === real.feed?.total, JSON.stringify({ snap }));
      const again = await ctx.runAction(internal.b2cWeeklyRoles.announceWeeklyRoles, { dryRun: false });
      ok("weekly roles: re-run blocked by the 5-day slot", again.skipped?.includes("already") === true, JSON.stringify({ skipped: again.skipped }));

      // --- D. digest -----------------------------------------------------------
      const digest = await ctx.runAction(internal.b2cNewMemberDigest.runNewMemberDigest, { dryRun: true });
      ok("digest: renders the recent cohort incl. the fixture", digest.members >= 1 && (digest.html ?? "").includes("Harness Member"), JSON.stringify({ members: digest.members }));

      // --- S. unsubscribe --------------------------------------------------------
      const token = await unsubscribeToken(member._id);
      const good = await ctx.runQuery(internal.b2cEmailPrefs.checkUnsubscribeToken, { userId: member._id, token: token ?? "" });
      const bad = await ctx.runQuery(internal.b2cEmailPrefs.checkUnsubscribeToken, { userId: member._id, token: "0".repeat(64) });
      ok("unsubscribe: token verifies, tampered token refused", good.valid === true && bad.valid === false, JSON.stringify({ good, bad }));
      const flip = await ctx.runMutation(internal.b2cEmailPrefs.unsubscribeWithToken, { userId: member._id, token: token ?? "" });
      const skipped = await sendB2cEmail(ctx, { kind: "digest", to: memberEmail, subject: "hz", html: "<p>hz</p>" });
      const still = await sendB2cEmail(ctx, { kind: "transactional", to: memberEmail, subject: "hz", html: "<p>hz</p>" });
      ok("unsubscribe: digest skipped, transactional still sends", flip.ok && skipped.skipped === "opted-out" && still.sent === true, JSON.stringify({ flip, skipped, still }));
    } catch (error) {
      ok("harness threw", false, error instanceof Error ? error.message : String(error));
    } finally {
      const emails = [memberEmail, coachEmail];
      const cleaned = await ctx.runMutation(internal.b2cAdoptionHarness.hzCleanup, { emails, callId, jobId, snapshotsSince: now });
      ok("cleanup", true, `${cleaned.deleted} rows deleted`);
    }
    return { allPass: checks.every((c) => c.pass), checks };
  },
});
