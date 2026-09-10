// ============================================================================
// Claims and assignments on bookings with no setter named on them. One row
// per booking key; the attribution engine reads it before initials and
// touches. Two doors: a manager assigns from the Setters page, a setter
// claims from their EOD page. No approval step — a claim is applied at once
// and stays visibly "claimed" so a manager can undo it.
// ============================================================================

import { ConvexError, v } from "convex/values";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { resolveAuthUser } from "./setterGhlOauth";
import { resolveSetterSessionCtx } from "./setterAuth";
import { RANGE_COHORT_TAKE, loadCohortRecords } from "./setterEodMeasured";
import { collectTeamBookings, type BookingRecord } from "./setterTeamBookings";
import { teamHasSetterTeams } from "./setterTeamQueries";

const DAY_MS = 24 * 60 * 60 * 1000;
/** How far back and forward the setter-side list looks for bookings they touched — three weeks keeps one query inside its operation budget. */
const MINE_LOOKBACK_MS = 7 * DAY_MS;
const MINE_LOOKAHEAD_MS = 14 * DAY_MS;
const MINE_MAX = 50;

/** "<calendar uid>|<startTime>" — the engine's booking key; the uid can carry anything but "|". */
function parseKey(bookingKey: string): { uid: string; startTime: number } | null {
  const at = bookingKey.lastIndexOf("|");
  if (at <= 0 || bookingKey.length > 400) return null;
  const startTime = Number(bookingKey.slice(at + 1));
  if (!Number.isInteger(startTime) || startTime <= 0) return null;
  return { uid: bookingKey.slice(0, at), startTime };
}

/** The calendar rows starting at the key's instant, when one of them carries the key's uid — or null. */
async function bookingRows(ctx: QueryCtx | MutationCtx, teamId: Id<"teams">, bookingKey: string): Promise<Doc<"calendarEvents">[] | null> {
  const parsed = parseKey(bookingKey);
  if (!parsed) return null;
  const rows = await ctx.db
    .query("calendarEvents")
    .withIndex("by_team_and_time", (q) => q.eq("teamId", teamId).gte("startTime", parsed.startTime).lt("startTime", parsed.startTime + 1))
    .take(300);
  return rows.some((e) => e.uid === parsed.uid) ? rows : null;
}

/** The engine's own record for the key — attribution only, no call lookups. */
async function recordFor(ctx: QueryCtx | MutationCtx, teamId: Id<"teams">, bookingKey: string, rows: Doc<"calendarEvents">[]): Promise<BookingRecord | null> {
  const parsed = parseKey(bookingKey);
  if (!parsed) return null;
  const data = await collectTeamBookings(ctx as QueryCtx, teamId, parsed.startTime, parsed.startTime + 1, Date.now(), { eventRows: rows, skipCalls: true });
  return data.records.find((r) => r.key === bookingKey) ?? null;
}

async function existingClaim(ctx: QueryCtx | MutationCtx, teamId: Id<"teams">, bookingKey: string): Promise<Doc<"setterBookingClaims"> | null> {
  return ctx.db
    .query("setterBookingClaims")
    .withIndex("by_team_and_key", (q) => q.eq("teamId", teamId).eq("bookingKey", bookingKey))
    .order("desc")
    .first();
}

async function managerTeam(ctx: QueryCtx | MutationCtx, clerkId: string): Promise<{ teamId: Id<"teams">; team: Doc<"teams"> }> {
  const user = await resolveAuthUser(ctx, clerkId);
  if (!user?.teamId) throw new ConvexError("Not authorised");
  if (user.role !== "admin" && user.role !== "manager") throw new ConvexError("Only managers can do that");
  const team = await ctx.db.get(user.teamId as Id<"teams">);
  if (!team || !teamHasSetterTeams(team)) throw new ConvexError("The Setters page isn't switched on for this team");
  return { teamId: team._id, team };
}

/**
 * Manager: name the setter on a booking, or mark it "not a set". Passing
 * neither clears the claim (the booking goes back to Unlabeled).
 */
export const assign = mutation({
  args: { clerkId: v.string(), bookingKey: v.string(), rosterId: v.optional(v.id("setterRoster")), notASet: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const { teamId } = await managerTeam(ctx, args.clerkId);
    const parsed = parseKey(args.bookingKey);
    if (!parsed) throw new ConvexError("That booking key isn't valid");
    const current = await existingClaim(ctx, teamId, args.bookingKey);
    if (!args.rosterId && !args.notASet) {
      // Clearing works even when the booking has since moved or vanished.
      if (current) await ctx.db.delete(current._id);
      return { ok: true, cleared: true };
    }
    if (!(await bookingRows(ctx, teamId, args.bookingKey))) throw new ConvexError("That booking isn't on this team's calendar");
    if (args.rosterId) {
      const roster = await ctx.db.get(args.rosterId);
      if (!roster || roster.teamId !== teamId) throw new ConvexError("That setter isn't on this team's roster");
    }
    const row = {
      teamId,
      bookingKey: args.bookingKey,
      uid: parsed.uid,
      startTime: parsed.startTime,
      creditRosterId: args.notASet ? undefined : args.rosterId,
      notASet: args.notASet ? true : undefined,
      claimedByRosterId: undefined,
      claimedByClerkId: args.clerkId,
      claimedAt: Date.now(),
    };
    if (current) await ctx.db.replace(current._id, row);
    else await ctx.db.insert("setterBookingClaims", row);
    return { ok: true, cleared: false };
  },
});

/** Setter: "that was mine" on a booking they touched that carries no name. First claim wins; a manager can change it. */
export const claimMine = mutation({
  args: { sessionToken: v.string(), bookingKey: v.string() },
  handler: async (ctx, args) => {
    const me = await resolveSetterSessionCtx(ctx, args.sessionToken);
    if (!me) throw new ConvexError("Your link has expired — open it again");
    const teamId = me.teamId as Id<"teams">;
    const team = await ctx.db.get(teamId);
    if (!teamHasSetterTeams(team)) throw new ConvexError("Claims aren't switched on for your team");
    const rows = await bookingRows(ctx, teamId, args.bookingKey);
    if (!rows) throw new ConvexError("That booking isn't on the calendar any more");
    const current = await existingClaim(ctx, teamId, args.bookingKey);
    if (current) throw new ConvexError("Someone already claimed that one — ask your manager if it's yours");
    // Only a booking with no setter named on it, and only one they touched:
    // a claim outranks initials, so it must never take a set that carries them.
    const record = await recordFor(ctx, teamId, args.bookingKey, rows);
    if (!record || record.classification.lane !== "unattributed") throw new ConvexError("That booking already has a setter on it — ask your manager if it's yours");
    if (!record.touches.some((t) => t.rosterId === String(me.rosterId))) throw new ConvexError("You can only claim bookings you contacted in Close");
    const parsed = parseKey(args.bookingKey)!;
    await ctx.db.insert("setterBookingClaims", {
      teamId,
      bookingKey: args.bookingKey,
      uid: parsed.uid,
      startTime: parsed.startTime,
      creditRosterId: me.rosterId as Id<"setterRoster">,
      claimedByRosterId: me.rosterId as Id<"setterRoster">,
      claimedAt: Date.now(),
    });
    return { ok: true };
  },
});

/**
 * Setter: bookings with no setter named on them that they touched, recent
 * calls and upcoming ones. Null when the team isn't on the Setters page.
 */
export const getMyUnlabeled = query({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    const me = await resolveSetterSessionCtx(ctx, args.sessionToken);
    if (!me) return null;
    const teamId = me.teamId as Id<"teams">;
    const team = await ctx.db.get(teamId);
    if (!teamHasSetterTeams(team)) return null;
    const nowMs = Date.now();
    // Attribution only: no per-event call lookups, the list doesn't show verdicts.
    const data = await loadCohortRecords(ctx, teamId, nowMs - MINE_LOOKBACK_MS, nowMs + MINE_LOOKAHEAD_MS, nowMs, RANGE_COHORT_TAKE, { skipCalls: true });
    const mine = String(me.rosterId);
    const rows = data.records
      .filter((r) => !r.isFollowUp && r.classification.lane === "unattributed" && r.touches.some((t) => t.rosterId === mine))
      .sort((a, b) => b.startTime - a.startTime)
      .slice(0, MINE_MAX)
      .map((r) => {
        const own = r.touches.filter((t) => t.rosterId === mine);
        return {
          bookingKey: r.key,
          title: r.displayTitle,
          closerName: r.closerName,
          startTime: r.startTime,
          dayKey: r.dayKey,
          source: r.classification.isFunnel ? ("self-booked" as const) : r.eventName ? ("link" as const) : ("hand-made" as const),
          touchedAfterBooking: own.every((t) => t.afterBooking),
          firstTouchAt: Math.min(...own.map((t) => t.at)),
        };
      });
    return { rows, truncated: data.truncated };
  },
});
