// ============================================================================
// "I didn't work that day."
//
// The counting rule shipped first: a day nobody worked stops being owed on
// its own, from the CRM. That fixed the false chasing but left the reps
// unable to say anything — and it can only ever infer. Someone with no CRM
// user linked has invisible dials, not zero dials, and a day spent on
// training or shadowing produces nothing to measure either.
//
// So this is the other half: a way to say it out loud. Two things follow
// from that being a statement rather than a guess —
//
//   1. It is kept apart from the EOD rows. Half the product reads "an entry
//      exists" as "they filed", so a day off stored as a row of zeros would
//      start lying in all of those places at once.
//   2. "Off" and "no activity" stay different words everywhere. One is what
//      somebody told us, the other is what we failed to see. Printing our
//      own guess as their statement would be putting words in their mouth.
//
// A day off leaves the "filed N of M" fraction and is counted on its own, so
// a manager can still tell compliance from attendance.
// ============================================================================

import { v, ConvexError } from "convex/values";
import { internalMutation, mutation, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { DEFAULT_TIMEZONE, dayKeyInTz } from "./closerPerformance";
import { addDaysKey } from "./dataHealthCore";
import { offKey } from "./lib/eodCrossCheck";
import { resolveSetterSessionCtx } from "./setterAuth";
import { resolveAuthUser } from "./setterGhlOauth";

const DAY_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;
const NOTE_MAX = 200;
/** Matches the setter EOD backfill window — the same days the form offers. */
const SETTER_LOOKBACK_DAYS = 14;
/** Closer entries stay editable indefinitely; a year is plenty and stops silly input. */
const CLOSER_LOOKBACK_DAYS = 366;
const OFF_DAYS_TAKE = 4_000;

export type OffSubjectKind = "setter" | "closer";
export type OffMark = Doc<"eodOffDays">;

/** Keyed `${subjectId}|${dayKey}` — the shape every reader wants. */
export type OffMarkMap = Map<string, OffMark>;
export { offKey } from "./lib/eodCrossCheck";

/**
 * Every off mark for a team over a range, in one indexed read. Deliberately
 * one read rather than one per person per day: this is called from the
 * cross-check, which already sits close to Convex's per-query ceilings.
 */
export async function loadOffDays(
  ctx: QueryCtx,
  teamId: Id<"teams">,
  startKey: string,
  endKey: string,
  kind?: OffSubjectKind,
): Promise<{ byKey: OffMarkMap; truncated: boolean }> {
  const rows = await ctx.db
    .query("eodOffDays")
    .withIndex("by_team_and_day", (q) => q.eq("teamId", teamId).gte("dayKey", startKey).lte("dayKey", endKey))
    .take(OFF_DAYS_TAKE);
  const byKey: OffMarkMap = new Map();
  for (const r of rows) {
    if (kind && r.subjectKind !== kind) continue;
    byKey.set(offKey(r.subjectId, r.dayKey), r);
  }
  return { byKey, truncated: rows.length >= OFF_DAYS_TAKE };
}

/** What a reader needs to render "off · marked by Zion · sick". */
export interface OffView {
  by: "self" | "manager";
  byName: string | null;
  note: string | null;
}

export function offViewOf(mark: OffMark | undefined | null): OffView | null {
  if (!mark) return null;
  return { by: mark.markedBy, byName: mark.markedByName ?? null, note: mark.note ?? null };
}

// ----------------------------------------------------------------------------
// Writing
// ----------------------------------------------------------------------------

function cleanNote(note: string | undefined): string | undefined {
  const t = (note ?? "").trim();
  if (!t) return undefined;
  if (t.length > NOTE_MAX) throw new ConvexError(`Keep the note under ${NOTE_MAX} characters`);
  return t;
}

/** Today back to `lookback` days, never the future, never garbage. */
function assertMarkableDay(dayKey: string, today: string, lookback: number) {
  if (!DAY_KEY_RE.test(dayKey)) throw new ConvexError("Invalid date");
  // A day that hasn't happened can only be a guess, and the roster has no
  // concept of planned leave — a manager marks the days as they pass.
  if (dayKey > today) throw new ConvexError("That day hasn't happened yet");
  if (dayKey < addDaysKey(today, -lookback)) throw new ConvexError("That day is too far back to change");
}

async function upsertOffDay(
  ctx: MutationCtx,
  args: {
    teamId: Id<"teams">;
    dayKey: string;
    subjectKind: OffSubjectKind;
    subjectId: string;
    off: boolean;
    note?: string;
    markedBy: "self" | "manager";
    markedByClerkId?: string;
    markedByName?: string;
  },
): Promise<{ off: boolean }> {
  const existing = await ctx.db
    .query("eodOffDays")
    .withIndex("by_subject_and_day", (q) => q.eq("subjectId", args.subjectId).eq("dayKey", args.dayKey))
    .first();

  if (!args.off) {
    // Undo is always allowed, by either side. A mark pressed by accident
    // must never be something only an admin can take back.
    if (existing) await ctx.db.delete(existing._id);
    return { off: false };
  }

  const now = Date.now();
  if (existing) {
    // Last writer wins, and we record who — "off · marked by Zion" and
    // "off · marked by Marcus" are different facts to a manager.
    const note = cleanNote(args.note);
    await ctx.db.patch(existing._id, {
      // Only when one was sent: patching `undefined` deletes the field, so
      // re-marking a day would silently wipe a note somebody had left.
      ...(note === undefined ? {} : { note }),
      markedBy: args.markedBy,
      markedByClerkId: args.markedByClerkId,
      markedByName: args.markedByName,
      updatedAt: now,
    });
    return { off: true };
  }
  await ctx.db.insert("eodOffDays", {
    teamId: args.teamId,
    dayKey: args.dayKey,
    subjectKind: args.subjectKind,
    subjectId: args.subjectId,
    note: cleanNote(args.note),
    markedBy: args.markedBy,
    markedByClerkId: args.markedByClerkId,
    markedByName: args.markedByName,
    createdAt: now,
    updatedAt: now,
  });
  return { off: true };
}

/** A setter marking their own day, from the setter app. */
export const setSetterOffDay = mutation({
  args: { sessionToken: v.string(), dayKey: v.string(), off: v.boolean(), note: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const me = await resolveSetterSessionCtx(ctx, args.sessionToken);
    if (!me) throw new ConvexError("Signed out — log in again");
    const team = await ctx.db.get(me.teamId);
    const tz = (team as { timezone?: string } | null)?.timezone || DEFAULT_TIMEZONE;
    assertMarkableDay(args.dayKey, dayKeyInTz(Date.now(), tz), SETTER_LOOKBACK_DAYS);
    return upsertOffDay(ctx, {
      teamId: me.teamId,
      dayKey: args.dayKey,
      subjectKind: "setter",
      subjectId: String(me.rosterId),
      off: args.off,
      note: args.note,
      markedBy: "self",
    });
  },
});

/**
 * A closer marking their own day, from the closer app (web or desktop).
 *
 * Internal because both closer apps reach Convex over the HTTP routes, where
 * the session is resolved and the closerId is never taken from the body.
 */
export const setCloserOffDay = internalMutation({
  args: { closerId: v.id("closers"), dayKey: v.string(), off: v.boolean(), note: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const closer = await ctx.db.get(args.closerId);
    if (!closer) throw new Error("Closer not found");
    if (closer.status === "deactivated") throw new Error("This closer is deactivated");
    const teamId = closer.teamId as Id<"teams">;
    const team = await ctx.db.get(teamId);
    const tz = team?.timezone || DEFAULT_TIMEZONE;
    assertMarkableDay(args.dayKey, dayKeyInTz(Date.now(), tz), CLOSER_LOOKBACK_DAYS);
    return upsertOffDay(ctx, {
      teamId,
      dayKey: args.dayKey,
      subjectKind: "closer",
      subjectId: String(args.closerId),
      off: args.off,
      note: args.note,
      markedBy: "self",
    });
  },
});

/**
 * A manager marking somebody else's day, from the EOD board.
 *
 * This is the half that covers the cases the rep can't: a week of holiday
 * nobody is opening the app during, someone off sick, someone who left.
 */
export const setOffDayAsManager = mutation({
  args: {
    clerkId: v.string(),
    subjectKind: v.union(v.literal("setter"), v.literal("closer")),
    subjectId: v.string(),
    dayKey: v.string(),
    off: v.boolean(),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await resolveAuthUser(ctx, args.clerkId);
    if (!user?.teamId) throw new ConvexError("Not signed in");
    if (user.role !== "admin" && user.role !== "manager") throw new ConvexError("Managers only");
    const teamId = user.teamId as Id<"teams">;

    // The subject's own record decides the team, never the caller — a
    // manager can only ever mark somebody on their own roster.
    //
    // normalizeId, not a bare get: Convex ids are globally unique, so
    // db.get happily returns a setterRoster row for an id declared as a
    // closer and the team check then passes on the wrong table. Caught by
    // sending a roster id with subjectKind "closer" and watching it succeed.
    if (args.subjectKind === "setter") {
      const id = ctx.db.normalizeId("setterRoster", args.subjectId);
      const roster = id ? await ctx.db.get(id) : null;
      if (!roster || String(roster.teamId) !== String(teamId)) throw new ConvexError("Not on your team");
    } else {
      const id = ctx.db.normalizeId("closers", args.subjectId);
      const closer = id ? await ctx.db.get(id) : null;
      if (!closer || String(closer.teamId) !== String(teamId)) throw new ConvexError("Not on your team");
    }

    const team = await ctx.db.get(teamId);
    const tz = (team as { timezone?: string } | null)?.timezone || DEFAULT_TIMEZONE;
    const lookback = args.subjectKind === "setter" ? SETTER_LOOKBACK_DAYS : CLOSER_LOOKBACK_DAYS;
    assertMarkableDay(args.dayKey, dayKeyInTz(Date.now(), tz), lookback);

    return upsertOffDay(ctx, {
      teamId,
      dayKey: args.dayKey,
      subjectKind: args.subjectKind,
      subjectId: args.subjectId,
      off: args.off,
      note: args.note,
      markedBy: "manager",
      markedByClerkId: args.clerkId,
      markedByName: user.name ?? undefined,
    });
  },
});
