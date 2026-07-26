import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { resolveAuthUser } from "./setterGhlOauth";
import { DEFAULT_TIMEZONE, dayKeyInTz } from "./closerPerformance";

/* eslint-disable @typescript-eslint/no-explicit-any */

// ============================================================================
// Manager corrections to the daily numbers.
//
// Overrides live in their own table because the nightly recount writes
// ABSOLUTE values — storing a correction on the derived row would have it
// silently erased the next time that day was recomputed.
//
// A correction never edits history: we keep the measured value alongside it so
// the UI can always show both, and clearing an override restores the measured
// number exactly.
// ============================================================================

/** Fields a manager may correct. Rates are derived and never stored. */
const OVERRIDE_FIELDS = [
  "slots", "booked", "taken", "offers", "closes", "cash",
] as const;
type OverrideField = (typeof OVERRIDE_FIELDS)[number];

const MAX_COUNT = 1000;        // calls/day per closer — generous but bounded
const MAX_CASH = 100_000_000;  // $100M/day

function validate(field: OverrideField, value: number): string | null {
  if (!Number.isFinite(value)) return "Value must be a number";
  if (value < 0) return "Value cannot be negative";
  if (field === "cash") {
    if (value > MAX_CASH) return "Value is unrealistically large";
  } else {
    if (!Number.isInteger(value)) return "Value must be a whole number";
    if (value > MAX_COUNT) return "Value is unrealistically large";
  }
  return null;
}

const DAY_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Only managers/admins may correct the board. `users` holds the web-dashboard
 * accounts (managers), separate from `closers` (reps in the desktop app), so
 * a rep has no path to this mutation at all — a closer editing their own cash
 * would turn the leaderboard into a self-reported number, which is the exact
 * failure mode this product exists to remove.
 */
function canEdit(user: Doc<"users">): boolean {
  return user.role === "admin" || user.role === "manager";
}

export const setDailyOverride = mutation({
  args: {
    clerkId: v.string(),
    closerId: v.id("closers"),
    dayKey: v.string(),
    field: v.string(),
    /** null clears the override and restores the measured value. */
    value: v.union(v.number(), v.null()),
  },
  handler: async (ctx, args) => {
    const user = await resolveAuthUser(ctx, args.clerkId);
    if (!user) throw new Error("Not authorised");
    if (!canEdit(user)) {
      throw new Error("Only managers can edit the performance board");
    }
    if (!DAY_KEY_RE.test(args.dayKey)) throw new Error("Invalid date");
    if (!OVERRIDE_FIELDS.includes(args.field as OverrideField)) {
      throw new Error(`Cannot edit "${args.field}"`);
    }
    const field = args.field as OverrideField;

    // The closer must belong to the editing manager's team — never trust a
    // client-supplied id to scope a write.
    const target = await ctx.db.get(args.closerId);
    if (!target || target.teamId !== user.teamId) {
      throw new Error("Closer not found on your team");
    }

    // Refuse edits dated in the future: they can't be corrections, and they'd
    // be overwritten by the recount the moment that day actually happens.
    const team = await ctx.db.get(user.teamId as Id<"teams">);
    const tz = team?.timezone || DEFAULT_TIMEZONE;
    if (args.dayKey > dayKeyInTz(Date.now(), tz)) {
      throw new Error("Cannot edit a future date");
    }

    if (args.value !== null) {
      const err = validate(field, args.value);
      if (err) throw new Error(err);
    }

    const existing = (await ctx.db
      .query("closerDailyOverrides")
      .withIndex("by_team_day_closer", (q: any) =>
        q
          .eq("teamId", user.teamId)
          .eq("dayKey", args.dayKey)
          .eq("closerId", args.closerId),
      )
      .first()) as Doc<"closerDailyOverrides"> | null;

    if (args.value === null) {
      if (!existing) return { cleared: true };
      const remaining = OVERRIDE_FIELDS.filter(
        (f) => f !== field && typeof existing[f] === "number",
      );
      // Last override on the row — drop the row entirely rather than leave an
      // empty shell that would keep flagging the day as "edited".
      if (remaining.length === 0) await ctx.db.delete(existing._id);
      else
        await ctx.db.patch(existing._id, {
          [field]: undefined,
          updatedAt: Date.now(),
          updatedByClerkId: args.clerkId,
        });
      return { cleared: true };
    }

    if (existing) {
      await ctx.db.patch(existing._id, {
        [field]: args.value,
        updatedAt: Date.now(),
        updatedByClerkId: args.clerkId,
      });
    } else {
      await ctx.db.insert("closerDailyOverrides", {
        teamId: user.teamId as Id<"teams">,
        dayKey: args.dayKey,
        closerId: args.closerId,
        [field]: args.value,
        updatedAt: Date.now(),
        updatedByClerkId: args.clerkId,
      });
    }
    return { cleared: false };
  },
});

/**
 * The editable daily grid for one month: measured values, any correction on
 * top, and both kept distinct so the UI can show what Sequ3nce recorded next
 * to what the manager says actually happened.
 */
export const getDailyGrid = query({
  args: {
    clerkId: v.string(),
    monthKey: v.string(),
    closerId: v.optional(v.id("closers")),
  },
  handler: async (ctx, args): Promise<any> => {
    const user = await resolveAuthUser(ctx, args.clerkId);
    if (!user) return null;
    if (!/^\d{4}-\d{2}$/.test(args.monthKey)) return null;

    const teamId = user.teamId as Id<"teams">;
    const team = await ctx.db.get(teamId);
    const tz = team?.timezone || DEFAULT_TIMEZONE;
    const start = `${args.monthKey}-01`;
    const end = `${args.monthKey}-31`;

    const [stats, overrides, closers] = await Promise.all([
      ctx.db
        .query("closerDailyStats")
        .withIndex("by_team_and_day", (q: any) =>
          q.eq("teamId", teamId).gte("dayKey", start).lte("dayKey", end),
        )
        .collect(),
      ctx.db
        .query("closerDailyOverrides")
        .withIndex("by_team_and_day", (q: any) =>
          q.eq("teamId", teamId).gte("dayKey", start).lte("dayKey", end),
        )
        .collect(),
      ctx.db
        .query("closers")
        .withIndex("by_team", (q: any) => q.eq("teamId", teamId))
        .take(500),
    ]);

    const closerId = args.closerId ?? null;
    const activeClosers = closers.filter((c) => c.status !== "deactivated");

    const ovByKey = new Map(
      overrides.map((o) => [`${o.dayKey}|${String(o.closerId)}`, o]),
    );
    const statByKey = new Map(
      stats.map((r) => [`${r.dayKey}|${String(r.closerId)}`, r]),
    );

    // Emit EVERY day of the month up to today, not just days we recorded
    // something for. A recount deletes a day that measured nothing, so
    // walking the derived rows would leave a manager unable to enter figures
    // for exactly the day the meeting bot missed — the case this grid exists
    // to handle. Future days are excluded: they can't be corrected, only
    // guessed at.
    const todayKey = dayKeyInTz(Date.now(), tz);
    const [yy, mm] = args.monthKey.split("-").map((x) => parseInt(x, 10));
    const daysInMonth = new Date(Date.UTC(yy, mm, 0)).getUTCDate();

    const targets = closerId
      ? activeClosers.filter((c) => String(c._id) === String(closerId))
      : activeClosers;

    const rows = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const dayKey = `${args.monthKey}-${String(d).padStart(2, "0")}`;
      if (dayKey > todayKey) break;
      for (const closer of targets) {
        const key = `${dayKey}|${String(closer._id)}`;
        const st = statByKey.get(key);
        const ov = ovByKey.get(key);
        const measured: Record<string, number> = {
          slots: st?.slots ?? 0, booked: st?.booked ?? 0, taken: st?.taken ?? 0,
          offers: st?.offers ?? 0, closes: st?.closes ?? 0, cash: st?.cash ?? 0,
        };
        const overridden: Record<string, number> = {};
        for (const f of OVERRIDE_FIELDS) {
          const val = ov?.[f];
          if (typeof val === "number") overridden[f] = val;
        }
        rows.push({
          dayKey,
          closerId: String(closer._id),
          measured,
          overridden,
          missingOutcomes: st?.missingOutcomes ?? 0,
          // No measurement at all — the grid dims it so a manager can tell
          // "we recorded a zero" from "we recorded nothing".
          measuredExists: !!st,
          updatedAt: ov?.updatedAt ?? null,
        });
      }
    }
    rows.reverse(); // most recent day first — that's what a manager checks

    return {
      monthKey: args.monthKey,
      timezone: tz,
      canEdit: canEdit(user),
      todayKey: dayKeyInTz(Date.now(), tz),
      closers: activeClosers.map((c) => ({
        closerId: String(c._id),
        name: c.name ?? "Unknown",
      })),
      rows,
    };
  },
});

// ============================================================================
// Closer-reported days.
//
// The board counts only what closers submit, so this is the primary write path
// for the whole feature. Deliberately internal: the desktop app reaches it
// through an HTTP action, and nothing should be able to call it directly.
// ============================================================================

/** Fields a closer may report. contractValue is reportable; slots is too. */
const ENTRY_FIELDS = [
  "slots", "booked", "taken", "offers", "closes", "cash", "contractValue",
] as const;
type EntryField = (typeof ENTRY_FIELDS)[number];

const MAX_ENTRY_COUNT = 1000;
const MAX_ENTRY_CASH = 100_000_000;

function validateEntry(field: EntryField, value: number): string | null {
  if (!Number.isFinite(value)) return `${field} must be a number`;
  // Refunds are recorded by reducing the original day, never as a negative —
  // so cash has no reason to go below zero.
  if (value < 0) return `${field} cannot be negative`;
  if (field === "cash" || field === "contractValue") {
    if (value > MAX_ENTRY_CASH) return `${field} is unrealistically large`;
  } else {
    if (!Number.isInteger(value)) return `${field} must be a whole number`;
    if (value > MAX_ENTRY_COUNT) return `${field} is unrealistically large`;
  }
  return null;
}

export const saveCloserDailyEntry = internalMutation({
  args: {
    closerId: v.id("closers"),
    dayKey: v.string(),
    /** Only the fields the closer filled. Null clears one back to measured. */
    values: v.object({
      slots: v.optional(v.union(v.number(), v.null())),
      booked: v.optional(v.union(v.number(), v.null())),
      taken: v.optional(v.union(v.number(), v.null())),
      offers: v.optional(v.union(v.number(), v.null())),
      closes: v.optional(v.union(v.number(), v.null())),
      cash: v.optional(v.union(v.number(), v.null())),
      contractValue: v.optional(v.union(v.number(), v.null())),
    }),
  },
  handler: async (ctx, args): Promise<{ saved: boolean }> => {
    if (!DAY_KEY_RE.test(args.dayKey)) throw new Error("Invalid date");

    // teamId comes from the closer record, never from the caller.
    const closer = await ctx.db.get(args.closerId);
    if (!closer) throw new Error("Closer not found");
    if (closer.status === "deactivated") {
      throw new Error("This closer is deactivated");
    }
    const teamId = closer.teamId as Id<"teams">;

    const team = await ctx.db.get(teamId);
    const tz = team?.timezone || DEFAULT_TIMEZONE;
    // Past days stay editable indefinitely — refunds and balance payments
    // arrive weeks later and have to land on the day of the sale. Future days
    // can only be guesses.
    if (args.dayKey > dayKeyInTz(Date.now(), tz)) {
      throw new Error("Cannot report a future date");
    }

    const patch: Record<string, unknown> = {};
    for (const f of ENTRY_FIELDS) {
      const val = args.values[f];
      if (val === undefined) continue;
      if (val === null) {
        patch[f] = undefined;
        continue;
      }
      const err = validateEntry(f, val);
      if (err) throw new Error(err);
      patch[f] = val;
    }

    const now = Date.now();
    const existing = await ctx.db
      .query("closerDailyEntries")
      .withIndex("by_team_day_closer", (q: any) =>
        q
          .eq("teamId", teamId)
          .eq("dayKey", args.dayKey)
          .eq("closerId", args.closerId),
      )
      .first();

    if (existing) {
      // confirmedAt always moves: submitting an unchanged day is still the
      // closer vouching for it, which is the whole point of the confirm step.
      await ctx.db.patch(existing._id, {
        ...patch,
        confirmedAt: now,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("closerDailyEntries", {
        teamId,
        dayKey: args.dayKey,
        closerId: args.closerId,
        ...patch,
        confirmedAt: now,
        updatedAt: now,
      });
    }
    return { saved: true };
  },
});
