import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { buildMatcherIndex, findCallsForLead } from "./setterCloserMatcher";
import {
  classifyMatchedCall,
  computeShowRateEvidence,
  SHOW_ASSUME_COVERAGE,
  SHOW_GRACE_MS,
  SHOW_MATCH_AFTER_MS,
  SHOW_MATCH_BEFORE_MS,
} from "./setterDataMetrics";

// ============================================================================
// Attendance classification sweep.
//
// Nightly, per beta-flagged team, walk the appointment window and persist an
// attendance verdict on every row the machines can answer: showed / no_show /
// cancelled / rescheduled / unverifiable. The verdict logic is the SAME
// evidence waterfall computeShowRateEvidence runs live (shared
// classifyMatchedCall), plus the reschedule-chain linking only a persisted
// pass can do. `manual` verdicts are never touched — the speaker-flip
// contract.
//
// Rollout = the `appointment_attendance` beta flag. Teams without it get
// zero writes, so GHL teams' numbers cannot move.
// ============================================================================

const PAGE_SIZE = 25; // small on purpose: each row can fan out to a contact history read
const SWEEP_LOOKBACK_MS = 16 * 24 * 60 * 60 * 1000;
const SWEEP_LOOKAHEAD_MS = 45 * 24 * 60 * 60 * 1000;
// Verdicts freeze two weeks after the slot: reports stop mutating, and the
// nightly window never has to revisit deep history.
const FINALITY_MS = 14 * 24 * 60 * 60 * 1000;
// A rebook counts as "rescheduled" only if it was booked within this long of
// the cancellation — beyond that it's a new decision, not a moved meeting.
const REBOOK_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;
const CONTACT_HISTORY_CAP = 100;

export const ATTENDANCE_BETA_FLAG = "appointment_attendance";

const CANCELLED_STATUSES = new Set(["Cancelled", "Invalid"]);

type Verdict = {
  attendance: "showed" | "no_show" | "cancelled" | "rescheduled" | "unverifiable";
  source: "crm_status" | "call_evidence" | "reschedule_link" | "assumed";
  callId?: Id<"calls">;
  rescheduledTo?: Id<"setterAppointments">;
};

/** A verdict may not be overwritten by automation once a human set it, or
 *  once the slot is two weeks old AND already classified. Unclassified old
 *  rows stay eligible so backfills can reach history. */
function isFrozen(a: Doc<"setterAppointments">, now: number): boolean {
  if (a.attendance === undefined) return false;
  if (a.attendanceSource === "manual") return true;
  return a.startTime < now - FINALITY_MS;
}

async function writeVerdict(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ctx: { db: any },
  a: Doc<"setterAppointments">,
  verdict: Verdict,
  now: number,
): Promise<boolean> {
  // Idempotence: write only on change — a re-run of the sweep patches 0 rows.
  if (
    a.attendance === verdict.attendance &&
    a.attendanceSource === verdict.source &&
    a.attendanceCallId === verdict.callId &&
    a.rescheduledToAppointmentId === verdict.rescheduledTo
  ) {
    return false;
  }
  await ctx.db.patch(a._id, {
    attendance: verdict.attendance,
    attendanceSource: verdict.source,
    attendanceAt: now,
    attendanceCallId: verdict.callId,
    rescheduledToAppointmentId: verdict.rescheduledTo,
  });
  return true;
}

/**
 * CRM-status stamping shared by the sweep and the live upsert path
 * (setterGhlWebhooks.upsertAppointment calls stampAttendanceFromStatus).
 * Returns the verdict the status alone dictates, or null when the status
 * says nothing terminal (Confirmed / Unconfirmed).
 */
export function verdictFromCrmStatus(
  status: string,
): Verdict | null {
  if (status === "Showed") return { attendance: "showed", source: "crm_status" };
  if (status === "No Show") return { attendance: "no_show", source: "crm_status" };
  if (CANCELLED_STATUSES.has(status)) {
    // Upgradeable to "rescheduled" when the nightly sweep finds the rebook.
    return { attendance: "cancelled", source: "crm_status" };
  }
  return null;
}

/**
 * Live tier-0 stamp for CRM status changes, called from upsertAppointment.
 * Beta-gated by the CALLER (which already holds the team doc), non-manual
 * rows only. Kept tiny: the reschedule linking and call evidence stay the
 * sweep's job.
 */
export async function stampAttendanceFromStatus(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ctx: { db: any },
  appointmentId: Id<"setterAppointments">,
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const a: Doc<"setterAppointments"> | null = await ctx.db.get(appointmentId);
  if (!a || a.attendanceSource === "manual") return;
  const verdict = verdictFromCrmStatus(a.status);
  const now = Date.now();
  if (verdict) {
    // Never downgrade a linked reschedule back to plain "cancelled" — the
    // sweep proved the rebook; a redelivered Cancelled webhook doesn't unprove it.
    if (
      verdict.attendance === "cancelled" &&
      a.attendance === "rescheduled" &&
      a.rescheduledToAppointmentId !== undefined
    ) {
      return;
    }
    await writeVerdict(ctx, a, verdict, now);
  } else if (a.attendanceSource === "crm_status") {
    // Status walked back to Confirmed/Unconfirmed: the old CRM verdict no
    // longer has a basis. Clear it; the sweep re-judges from evidence.
    await ctx.db.patch(a._id, {
      attendance: undefined,
      attendanceSource: undefined,
      attendanceAt: undefined,
      attendanceCallId: undefined,
      rescheduledToAppointmentId: undefined,
    });
  }
}

// ---------------------------------------------------------------------------
// Nightly entry point
// ---------------------------------------------------------------------------

export const runNightlySweep = internalMutation({
  args: {},
  handler: async (ctx) => {
    const teams = (await ctx.db.query("teams").collect()).filter(
      (t) =>
        t.setterDataEnabled !== false &&
        (t.betaFeatures ?? []).includes(ATTENDANCE_BETA_FLAG),
    );
    // Each team is its own scheduled chain — one team's failure can't take
    // down another's. Staggered so chains never share a tick.
    for (let i = 0; i < teams.length; i++) {
      await ctx.scheduler.runAfter(
        i * 5000,
        internal.setterAttendance.startTeamSweep,
        { teamId: teams[i]._id },
      );
    }
    console.log(`[attendance] nightly sweep kicked for ${teams.length} team(s)`);
  },
});

/** Kick one team's sweep. `rangeStartMs` widens the window for backfills;
 *  the nightly run omits it and gets the rolling 16-day window. */
export const startTeamSweep = internalMutation({
  args: {
    teamId: v.id("teams"),
    rangeStartMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    await ctx.scheduler.runAfter(0, internal.setterAttendance.sweepPage, {
      teamId: args.teamId,
      rangeStartMs: args.rangeStartMs ?? now - SWEEP_LOOKBACK_MS,
      rangeEndMs: now + SWEEP_LOOKAHEAD_MS,
      pass: 1,
      pastCandidates: 0,
      evidenceSettled: 0,
      patched: 0,
    });
  },
});

/**
 * One page of the sweep. Self-schedules until done — kicked ONCE per team
 * per run, never twice (concurrent chains OCC-thrash each other to death).
 *
 * Pass 1 writes every verdict evidence can prove (CRM status, reschedule
 * links, matched-call evidence) and counts coverage. Pass 2 re-pages and
 * settles what's left: assumed no-show when coverage earned it, otherwise
 * the honest "unverifiable".
 */
export const sweepPage = internalMutation({
  args: {
    teamId: v.id("teams"),
    cursor: v.optional(v.string()),
    rangeStartMs: v.number(),
    rangeEndMs: v.number(),
    pass: v.union(v.literal(1), v.literal(2)),
    // Coverage accumulators, threaded through the chain. Pass 2 receives the
    // final coverage instead.
    pastCandidates: v.number(),
    evidenceSettled: v.number(),
    patched: v.number(),
    coverage: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<void> => {
    const now = Date.now();
    const page = await ctx.db
      .query("setterAppointments")
      .withIndex("by_team_and_start_time", (q) =>
        q
          .eq("teamId", args.teamId)
          .gte("startTime", args.rangeStartMs)
          .lt("startTime", args.rangeEndMs),
      )
      .paginate({ cursor: args.cursor ?? null, numItems: PAGE_SIZE });

    let pastCandidates = args.pastCandidates;
    let evidenceSettled = args.evidenceSettled;
    let patched = args.patched;

    if (args.pass === 1) {
      const r = await sweepPassOne(ctx, args.teamId, page.page, now);
      pastCandidates += r.pastCandidates;
      evidenceSettled += r.evidenceSettled;
      patched += r.patched;
    } else {
      patched += await sweepPassTwo(ctx, page.page, args.coverage ?? 0, now);
    }

    if (!page.isDone) {
      await ctx.scheduler.runAfter(200, internal.setterAttendance.sweepPage, {
        teamId: args.teamId,
        cursor: page.continueCursor,
        rangeStartMs: args.rangeStartMs,
        rangeEndMs: args.rangeEndMs,
        pass: args.pass,
        pastCandidates,
        evidenceSettled,
        patched,
        coverage: args.coverage,
      });
      return;
    }

    if (args.pass === 1) {
      const coverage =
        pastCandidates > 0 ? evidenceSettled / pastCandidates : 0;
      console.log(
        `[attendance] team ${args.teamId} pass 1 done: ${evidenceSettled}/${pastCandidates} by evidence (coverage ${coverage.toFixed(2)}), ${patched} patched`,
      );
      await ctx.scheduler.runAfter(200, internal.setterAttendance.sweepPage, {
        teamId: args.teamId,
        rangeStartMs: args.rangeStartMs,
        rangeEndMs: args.rangeEndMs,
        pass: 2,
        pastCandidates,
        evidenceSettled,
        patched: 0,
        coverage,
      });
    } else {
      console.log(
        `[attendance] team ${args.teamId} pass 2 done: ${patched} rows settled as assumed/unverifiable`,
      );
    }
  },
});

// ---------------------------------------------------------------------------
// Pass 1 — evidence
// ---------------------------------------------------------------------------

async function sweepPassOne(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ctx: { db: any },
  teamId: Id<"teams">,
  rows: Doc<"setterAppointments">[],
  now: number,
): Promise<{ pastCandidates: number; evidenceSettled: number; patched: number }> {
  let pastCandidates = 0;
  let evidenceSettled = 0;
  let patched = 0;

  // The verdicts below need each contact's full appointment history (rebook
  // chains, greedy 1:1 call matching). Fetch it once per contact per page.
  const contactIds = Array.from(new Set(rows.map((a) => a.ghlContactId)));
  const historyByContact = new Map<string, Doc<"setterAppointments">[]>();
  for (const cid of contactIds) {
    const history = await ctx.db
      .query("setterAppointments")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .withIndex("by_team_and_contact", (q: any) =>
        q.eq("teamId", teamId).eq("ghlContactId", cid),
      )
      .take(CONTACT_HISTORY_CAP);
    historyByContact.set(cid, history);
  }

  // Matched-call evidence needs the matcher index once per page, bounded to
  // the page's own time window — never all-time.
  const evidenceRows = rows.filter(
    (a) =>
      !isFrozen(a, now) &&
      !CANCELLED_STATUSES.has(a.status) &&
      verdictFromCrmStatus(a.status) === null &&
      a.startTime <= now - SHOW_GRACE_MS,
  );
  let index = null;
  const leadByContact = new Map<string, Doc<"setterLeads"> | null>();
  if (evidenceRows.length > 0) {
    const minStart = Math.min(...evidenceRows.map((a) => a.startTime));
    const maxStart = Math.max(...evidenceRows.map((a) => a.startTime));
    index = await buildMatcherIndex(
      ctx,
      teamId,
      minStart - SHOW_MATCH_BEFORE_MS,
      maxStart + SHOW_MATCH_AFTER_MS,
    );
    for (const a of evidenceRows) {
      if (leadByContact.has(a.ghlContactId)) continue;
      const lead = await ctx.db
        .query("setterLeads")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .withIndex("by_team_and_ghl_contact_id", (q: any) =>
          q.eq("teamId", teamId).eq("ghlContactId", a.ghlContactId),
        )
        .first();
      leadByContact.set(a.ghlContactId, lead);
    }
  }

  // Greedy 1:1 call assignment per contact, over the contact's FULL
  // non-cancelled history (sorted chronologically) — so page boundaries
  // can't hand one call to two appointments of a reschedule chain.
  const callByAppointment = new Map<string, Doc<"calls">>();
  if (index) {
    const evidenceContacts = new Set(evidenceRows.map((a) => a.ghlContactId));
    for (const cid of evidenceContacts) {
      const lead = leadByContact.get(cid);
      if (!lead) continue;
      const calls = findCallsForLead(index, {
        email: lead.email,
        phone: lead.phone,
      })
        .filter((c) => c.status === "completed" || c.status === "no_show")
        .sort((x, y) => (x.createdAt ?? 0) - (y.createdAt ?? 0));
      if (calls.length === 0) continue;

      const history = (historyByContact.get(cid) ?? [])
        .filter((a) => !CANCELLED_STATUSES.has(a.status))
        .sort((x, y) => x.startTime - y.startTime);
      const consumed = new Set<string>();
      for (const a of history) {
        let best: Doc<"calls"> | null = null;
        let bestDist = Infinity;
        for (const c of calls) {
          if (consumed.has(c._id)) continue;
          const t = c.startedAt ?? c.createdAt ?? 0;
          if (
            t < a.startTime - SHOW_MATCH_BEFORE_MS ||
            t > a.startTime + SHOW_MATCH_AFTER_MS
          ) {
            continue;
          }
          const dist = Math.abs(t - a.startTime);
          if (dist < bestDist) {
            best = c;
            bestDist = dist;
          }
        }
        if (best) {
          consumed.add(best._id);
          callByAppointment.set(a._id, best);
        }
      }
    }
  }

  // Rebook chains: greedy 1:1 over each contact's cancelled rows, oldest
  // cancellation first, each claiming the earliest eligible unclaimed rebook.
  const rebookByAppointment = new Map<string, Id<"setterAppointments">>();
  for (const cid of contactIds) {
    const history = historyByContact.get(cid) ?? [];
    const cancelled = history
      .filter((a) => CANCELLED_STATUSES.has(a.status))
      .sort((x, y) => x.lastUpdatedAt - y.lastUpdatedAt);
    if (cancelled.length === 0) continue;
    const claimed = new Set<string>();
    for (const a of cancelled) {
      const cancelTime = a.lastUpdatedAt; // best available proxy for when it was cancelled
      const candidates = history
        .filter(
          (b) =>
            b._id !== a._id &&
            !claimed.has(b._id) &&
            b.bookedAt > a.bookedAt &&
            b.startTime > a.startTime &&
            b.bookedAt <= cancelTime + REBOOK_WINDOW_MS,
        )
        .sort((x, y) => x.bookedAt - y.bookedAt);
      if (candidates.length > 0) {
        claimed.add(candidates[0]._id);
        rebookByAppointment.set(a._id, candidates[0]._id);
      }
    }
  }

  // Now judge each row on this page.
  for (const a of rows) {
    if (isFrozen(a, now)) continue;

    // Cancelled / Invalid: rescheduled if a rebook claims it, else cancelled.
    if (CANCELLED_STATUSES.has(a.status)) {
      const rebook = rebookByAppointment.get(a._id);
      const verdict: Verdict = rebook
        ? { attendance: "rescheduled", source: "reschedule_link", rescheduledTo: rebook }
        : { attendance: "cancelled", source: "crm_status" };
      if (await writeVerdict(ctx, a, verdict, now)) patched++;
      continue;
    }

    // CRM manual status.
    const crm = verdictFromCrmStatus(a.status);
    if (crm) {
      pastCandidates++;
      evidenceSettled++;
      if (await writeVerdict(ctx, a, crm, now)) patched++;
      continue;
    }

    // Future / inside grace: leave unset — "upcoming" in the funnel.
    if (a.startTime > now - SHOW_GRACE_MS) continue;
    pastCandidates++;

    // Matched-call evidence.
    const call = callByAppointment.get(a._id);
    if (call) {
      const verdict = classifyMatchedCall(call);
      if (verdict === "rescheduled") {
        // The call says the meeting moved. Link the rebook when one exists.
        const history = historyByContact.get(a.ghlContactId) ?? [];
        const later = history
          .filter((b) => b._id !== a._id && b.bookedAt > a.bookedAt && b.startTime > a.startTime)
          .sort((x, y) => x.bookedAt - y.bookedAt)[0];
        const v: Verdict = later
          ? {
              attendance: "rescheduled",
              source: "call_evidence",
              callId: call._id as Id<"calls">,
              rescheduledTo: later._id as Id<"setterAppointments">,
            }
          : {
              attendance: "unverifiable",
              source: "call_evidence",
              callId: call._id as Id<"calls">,
            };
        evidenceSettled++;
        if (await writeVerdict(ctx, a, v, now)) patched++;
      } else {
        const attendance = verdict === "showed" ? "showed" : "no_show";
        evidenceSettled++;
        if (
          await writeVerdict(
            ctx,
            a,
            {
              attendance,
              source: "call_evidence",
              callId: call._id as Id<"calls">,
            },
            now,
          )
        ) {
          patched++;
        }
      }
      continue;
    }
    // No evidence: left for pass 2, which knows the final coverage.
  }

  return { pastCandidates, evidenceSettled, patched };
}

// ---------------------------------------------------------------------------
// Pass 2 — assumed / unverifiable
// ---------------------------------------------------------------------------

async function sweepPassTwo(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ctx: { db: any },
  rows: Doc<"setterAppointments">[],
  coverage: number,
  now: number,
): Promise<number> {
  let patched = 0;
  for (const a of rows) {
    if (isFrozen(a, now)) continue;
    if (CANCELLED_STATUSES.has(a.status)) continue;
    if (verdictFromCrmStatus(a.status) !== null) continue;
    if (a.startTime > now - SHOW_GRACE_MS) continue;
    // Only rows evidence couldn't settle — pass 1 already wrote the rest.
    // "assumed" rows are re-judged so a coverage change updates them.
    if (a.attendance !== undefined && a.attendanceSource !== "assumed") continue;

    const verdict: Verdict =
      coverage >= SHOW_ASSUME_COVERAGE
        ? { attendance: "no_show", source: "assumed" }
        : { attendance: "unverifiable", source: "assumed" };
    if (await writeVerdict(ctx, a, verdict, now)) patched++;
  }
  return patched;
}

// ---------------------------------------------------------------------------
// Verification (CLI support tool)
// ---------------------------------------------------------------------------

/** Team-scoped evidence waterfall, no auth — for before/after regression
 *  checks against saved baselines. Read-only. */
export const evidenceForTeam = internalQuery({
  args: {
    teamId: v.id("teams"),
    rangeStart: v.number(),
    rangeEnd: v.number(),
  },
  handler: async (ctx, args) => {
    return await computeShowRateEvidence(ctx, {
      teamId: args.teamId,
      rangeStart: args.rangeStart,
      rangeEnd: args.rangeEnd,
    });
  },
});

/** Verdict × source counts over a window — how the sweep left a team's rows.
 *  `npx convex run setterAttendance:attendanceStats '{"teamId":"...","days":90}' --prod` */
export const attendanceStats = internalQuery({
  args: { teamId: v.id("teams"), days: v.number() },
  handler: async (ctx, args) => {
    const now = Date.now();
    const from = now - args.days * 24 * 60 * 60 * 1000;
    const rows = await ctx.db
      .query("setterAppointments")
      .withIndex("by_team_and_start_time", (q) =>
        q.eq("teamId", args.teamId).gte("startTime", from),
      )
      .take(8000);
    const byVerdict: Record<string, number> = {};
    const bySource: Record<string, number> = {};
    const byStatus: Record<string, number> = {};
    let unclassified = 0;
    let withRebookLink = 0;
    let withCallEvidence = 0;
    for (const a of rows) {
      byStatus[a.status] = (byStatus[a.status] ?? 0) + 1;
      if (a.attendance === undefined) {
        unclassified++;
        continue;
      }
      byVerdict[a.attendance] = (byVerdict[a.attendance] ?? 0) + 1;
      if (a.attendanceSource) {
        bySource[a.attendanceSource] = (bySource[a.attendanceSource] ?? 0) + 1;
      }
      if (a.rescheduledToAppointmentId) withRebookLink++;
      if (a.attendanceCallId) withCallEvidence++;
    }
    // Where the unclassified rows sit in time — separates "upcoming by
    // design" from "the sweep missed it".
    const unclassifiedBuckets = { past: 0, inGrace: 0, future: 0, beyondSweepWindow: 0 };
    const unclassifiedByStatus: Record<string, number> = {};
    for (const a of rows) {
      if (a.attendance !== undefined) continue;
      unclassifiedByStatus[a.status] = (unclassifiedByStatus[a.status] ?? 0) + 1;
      if (a.startTime > now + SWEEP_LOOKAHEAD_MS) unclassifiedBuckets.beyondSweepWindow++;
      else if (a.startTime > now) unclassifiedBuckets.future++;
      else if (a.startTime > now - SHOW_GRACE_MS) unclassifiedBuckets.inGrace++;
      else unclassifiedBuckets.past++;
    }
    return {
      rows: rows.length,
      truncated: rows.length === 8000,
      unclassified,
      unclassifiedBuckets,
      unclassifiedByStatus,
      byVerdict,
      bySource,
      byStatus,
      withRebookLink,
      withCallEvidence,
    };
  },
});

/** Hand-check reschedule chains: a sample of rescheduled rows with their
 *  linked rebooks, so the link invariants can be eyeballed. */
export const sampleReschedules = internalQuery({
  args: { teamId: v.id("teams"), limit: v.number() },
  handler: async (ctx, args) => {
    const now = Date.now();
    const rows = await ctx.db
      .query("setterAppointments")
      .withIndex("by_team_and_start_time", (q) =>
        q.eq("teamId", args.teamId).gte("startTime", now - 90 * 24 * 60 * 60 * 1000),
      )
      .take(8000);
    const out = [];
    for (const a of rows) {
      if (a.attendance !== "rescheduled" || !a.rescheduledToAppointmentId) continue;
      const b = await ctx.db.get(a.rescheduledToAppointmentId);
      out.push({
        contact: a.ghlContactId,
        aStatus: a.status,
        aStart: new Date(a.startTime).toISOString(),
        aBookedAt: new Date(a.bookedAt).toISOString(),
        aCancelledAt: new Date(a.lastUpdatedAt).toISOString(),
        bSameContact: b ? b.ghlContactId === a.ghlContactId : null,
        bStart: b ? new Date(b.startTime).toISOString() : null,
        bBookedAt: b ? new Date(b.bookedAt).toISOString() : null,
        bStatus: b?.status ?? null,
        bAttendance: b?.attendance ?? null,
      });
      if (out.length >= args.limit) break;
    }
    return out;
  },
});

// ---------------------------------------------------------------------------
// Backfill kick (CLI)
// ---------------------------------------------------------------------------

/** One-shot manual kick: `npx convex run setterAttendance:kickAttendanceBackfill
 *  '{"teamId": "...", "rangeStartDays": 90}' --prod`. Kick ONCE — the chain
 *  self-schedules; a second concurrent kick OCC-thrashes the first. */
export const kickAttendanceBackfill = internalMutation({
  args: {
    teamId: v.id("teams"),
    rangeStartDays: v.number(),
  },
  handler: async (ctx, args) => {
    const rangeStartMs = Date.now() - args.rangeStartDays * 24 * 60 * 60 * 1000;
    await ctx.scheduler.runAfter(0, internal.setterAttendance.startTeamSweep, {
      teamId: args.teamId,
      rangeStartMs,
    });
    return { kicked: true, rangeStartMs };
  },
});
