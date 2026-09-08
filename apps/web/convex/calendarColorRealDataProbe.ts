// ============================================================================
// Real-data rehearsal for the color capture, on the DEV deployment.
//
// Loads a copy of a real team's calendar rows and real Google colors (pulled
// read-only from production beforehand) under throwaway closers on dev, runs
// the actual backfill and check-ins code over them, and tears everything down.
// This is how the shipped TypeScript meets real volumes and real titles
// before it ever touches production. Driven from a script; see the memory
// note "e2-calendar-color-code" for the recipe.
//
// Never point this at production.
// ============================================================================

import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import { collectRecolorStates } from "./calendarColorCheckinsCore";
import type { RecolorState } from "./lib/calendarColorRules";

const P = "rp-"; // fixture uid prefix

export const seedClosers = internalMutation({
  args: { teamId: v.id("teams"), names: v.array(v.string()) },
  handler: async (ctx, args) => {
    const now = Date.now();
    const out: Array<{ name: string; closerId: string; subscriptionId: string }> = [];
    for (const [i, name] of args.names.entries()) {
      const closerId = await ctx.db.insert("closers", {
        name,
        email: `realprobe-${i}@example.invalid`,
        teamId: args.teamId,
        status: "active",
        invitedAt: now,
      });
      const subscriptionId = await ctx.db.insert("closerCalendarSubscriptions", {
        closerId,
        teamId: args.teamId,
        googleCalendarId: "primary",
        label: "Primary",
        enabled: true,
        createdAt: now,
      });
      out.push({ name, closerId, subscriptionId });
    }
    return out;
  },
});

export const seedEvents = internalMutation({
  args: {
    rows: v.array(
      v.object({
        closerId: v.id("closers"),
        subscriptionId: v.id("closerCalendarSubscriptions"),
        teamId: v.id("teams"),
        uid: v.string(),
        title: v.string(),
        startTime: v.number(),
        endTime: v.number(),
        attendees: v.optional(
          v.array(v.object({ email: v.string(), isOrganizer: v.optional(v.boolean()) })),
        ),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const fetchedAt = Date.now() - 10 * 24 * 60 * 60 * 1000;
    for (const r of args.rows) {
      await ctx.db.insert("calendarEvents", {
        closerId: r.closerId,
        teamId: r.teamId,
        uid: P + r.uid,
        title: r.title,
        startTime: r.startTime,
        endTime: r.endTime,
        attendees: r.attendees,
        subscriptionId: r.subscriptionId,
        calendarLabel: "Primary",
        fetchedAt,
      });
    }
    return { inserted: args.rows.length };
  },
});

export const summarize = internalQuery({
  args: { teamId: v.id("teams"), startMs: v.number(), endMs: v.number() },
  handler: async (ctx, args) => {
    const rows = await collectRecolorStates(ctx, args.teamId, args.startMs, args.endMs, Date.now());
    const byCloser = new Map<string, Record<string, number>>();
    for (const r of rows) {
      const c = byCloser.get(r.closerId) ?? {};
      const key: RecolorState = r.state;
      c[key] = (c[key] ?? 0) + 1;
      // Post-call colors by state, e.g. "pre_colored_untouched:11".
      if (r.colorId && ["10", "11", "5"].includes(r.colorId)) {
        const k = `${r.state}:${r.colorId}`;
        c[k] = (c[k] ?? 0) + 1;
      }
      c.total = (c.total ?? 0) + 1;
      byCloser.set(r.closerId, c);
    }
    return Array.from(byCloser.entries()).map(([closerId, counts]) => ({ closerId, counts }));
  },
});

export const teardown = internalMutation({
  args: { closerIds: v.array(v.id("closers")) },
  handler: async (ctx, args) => {
    let events = 0;
    let history = 0;
    for (const closerId of args.closerIds) {
      const evs = await ctx.db
        .query("calendarEvents")
        .withIndex("by_closer", (q) => q.eq("closerId", closerId))
        .collect();
      for (const e of evs) {
        await ctx.db.delete(e._id);
        events += 1;
      }
      const hist = await ctx.db
        .query("calendarEventColorHistory")
        .withIndex("by_closer_and_uid", (q) => q.eq("closerId", closerId))
        .collect();
      for (const h of hist) {
        await ctx.db.delete(h._id);
        history += 1;
      }
      const subs = await ctx.db
        .query("closerCalendarSubscriptions")
        .withIndex("by_closer", (q) => q.eq("closerId", closerId))
        .collect();
      for (const s of subs) await ctx.db.delete(s._id);
      await ctx.db.delete(closerId);
    }
    return { closers: args.closerIds.length, events, history };
  },
});
