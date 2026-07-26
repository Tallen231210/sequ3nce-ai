import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { resolveAuthUser } from "./setterGhlOauth";
import { isOwnCapacityCalendar } from "./closerPerformance";

/* eslint-disable @typescript-eslint/no-explicit-any */

// ============================================================================
// Which calendars represent a closer's availability.
//
// Slots are inferred from free time, which requires knowing which of a rep's
// subscribed calendars is actually theirs. We infer it from the address
// ("primary", or one matching their email), but inference has limits: on one
// live team every subscription reports accessRole "owner" because they share
// a Google Workspace, and reps run second calendars under varied names.
//
// This lets a manager state it outright. The stored flag always beats the
// inference — see isOwnCapacityCalendar.
// ============================================================================

function canEdit(user: Doc<"users">): boolean {
  return user.role === "admin" || user.role === "manager";
}

export const getCapacitySettings = query({
  args: { clerkId: v.string() },
  handler: async (ctx, args): Promise<any> => {
    const user = await resolveAuthUser(ctx, args.clerkId);
    if (!user) return null;
    const teamId = user.teamId as Id<"teams">;

    const [closers, subs] = await Promise.all([
      ctx.db
        .query("closers")
        .withIndex("by_team", (q: any) => q.eq("teamId", teamId))
        .take(500),
      ctx.db
        .query("closerCalendarSubscriptions")
        .withIndex("by_team", (q: any) => q.eq("teamId", teamId))
        .take(1000),
    ]);

    const active = closers.filter((c) => c.status !== "deactivated");
    return {
      canEdit: canEdit(user),
      closers: active.map((c) => {
        const mine = subs.filter(
          (s) => String(s.closerId) === String(c._id) && s.enabled !== false,
        );
        return {
          closerId: String(c._id),
          name: c.name ?? "Unknown",
          email: c.email ?? null,
          calendars: mine
            .map((s) => ({
              subscriptionId: String(s._id),
              calendarId: s.googleCalendarId,
              label: s.label,
              // What the board is currently doing for this calendar...
              countsTowardCapacity: isOwnCapacityCalendar(s, c.email),
              // ...and whether that came from a manager or from inference.
              isExplicit: typeof s.countsTowardCapacity === "boolean",
            }))
            .sort((a, b) => a.calendarId.localeCompare(b.calendarId)),
        };
      }),
    };
  },
});

export const setCalendarCapacity = mutation({
  args: {
    clerkId: v.string(),
    subscriptionId: v.id("closerCalendarSubscriptions"),
    /** null clears the manager's choice and restores inference. */
    countsTowardCapacity: v.union(v.boolean(), v.null()),
  },
  handler: async (ctx, args) => {
    const user = await resolveAuthUser(ctx, args.clerkId);
    if (!user) throw new Error("Not authorised");
    if (!canEdit(user)) {
      throw new Error("Only managers can change capacity settings");
    }

    const sub = await ctx.db.get(args.subscriptionId);
    // Scope the write to the caller's own team — never trust a client id.
    if (!sub || sub.teamId !== user.teamId) {
      throw new Error("Calendar not found on your team");
    }

    await ctx.db.patch(args.subscriptionId, {
      countsTowardCapacity:
        args.countsTowardCapacity === null
          ? undefined
          : args.countsTowardCapacity,
    });

    // The change alters every future recount; the hourly sweep re-derives the
    // recent window, so the board catches up without a manual backfill.
    return { ok: true };
  },
});
