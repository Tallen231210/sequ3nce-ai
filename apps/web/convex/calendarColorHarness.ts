// ============================================================================
// End-to-end harness for the color capture, for the DEV deployment.
//
// Drives the real upsertSubscriptionEvents mutation with hand-made payloads,
// the way Google would over successive 15-minute syncs, and checks what the
// event rows, the history table, the backfill page and the check-ins reader
// make of it. Creates its own subscription on a throwaway closer and deletes
// everything it made, pass or fail.
//
//   npx convex run calendarColorHarness:runSyncHarness \
//     '{"closerId":"<closer>","teamId":"<team>"}'
//
// Never run against production: it inserts and deletes calendar rows.
// ============================================================================

import { v } from "convex/values";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { collectRecolorStates } from "./calendarColorCheckinsCore";

const H = 60 * 60 * 1000;
const P = "hz-"; // every fixture uid starts with this

interface Check {
  name: string;
  pass: boolean;
  detail?: string;
}

type EventPayload = {
  uid: string;
  title: string;
  startTime: number;
  endTime: number;
  attendees?: Array<{ email: string }>;
  eventColorId?: string;
  googleUpdatedAt?: number;
};

interface Snapshot {
  events: Array<{
    uid: string;
    eventColorId?: string;
    colorFirstObservedAt?: number;
    colorChangedAt?: number;
    googleUpdatedAt?: number;
  }>;
  history: Array<{
    eventUid: string;
    colorId?: string;
    previousColorId?: string;
    source: string;
    observedAt: number;
  }>;
}

export const runSyncHarness = internalAction({
  args: { closerId: v.id("closers"), teamId: v.id("teams") },
  handler: async (ctx, args): Promise<{ allPass: boolean; checks: Check[] }> => {
    const checks: Check[] = [];
    const ok = (name: string, pass: boolean, detail?: string) =>
      checks.push({ name, pass, detail });
    const now = Date.now();
    // A call that ended 2.5h ago: past the 2h grace, so it is "due".
    const pastStart = now - 3.5 * H;
    const pastEnd = now - 2.5 * H;
    const futureStart = now + 2 * H;
    const futureEnd = now + 3 * H;
    const guest = [{ email: "prospect@example.com" }];

    const { subscriptionId } = await ctx.runMutation(internal.calendarColorHarness.setup, {
      closerId: args.closerId,
      teamId: args.teamId,
      pastStart,
      pastEnd,
    });
    const sync = (events: EventPayload[]) =>
      ctx.runMutation(internal.googleCalendar.upsertSubscriptionEvents, {
        closerId: args.closerId,
        teamId: args.teamId,
        subscriptionId,
        subscriptionLabel: "harness",
        events,
      });
    const snap = (): Promise<Snapshot> =>
      ctx.runQuery(internal.calendarColorHarness.snapshot, {
        closerId: args.closerId,
        subscriptionId,
      });
    const ev = (s: Snapshot, uid: string) => s.events.find((e) => e.uid === P + uid);
    const hist = (s: Snapshot, uid: string) => s.history.filter((h) => h.eventUid === P + uid);

    try {
      const base: EventPayload[] = [
        { uid: P + "past-1", title: "Prospect and Closer", startTime: pastStart, endTime: pastEnd, attendees: guest, eventColorId: "2", googleUpdatedAt: pastStart - H },
        { uid: P + "past-2", title: "Other and Closer", startTime: pastStart, endTime: pastEnd, attendees: guest },
        { uid: P + "clear-1", title: "Third and Closer", startTime: pastStart, endTime: pastEnd, attendees: guest, eventColorId: "5" },
        { uid: P + "legacy-1", title: "Legacy One", startTime: pastStart, endTime: pastEnd, attendees: guest, eventColorId: "11", googleUpdatedAt: pastStart + H },
        { uid: P + "legacy-2", title: "Legacy Two", startTime: pastStart, endTime: pastEnd, attendees: guest, eventColorId: "10", googleUpdatedAt: pastStart - H },
        { uid: P + "block-1", title: "Block", startTime: pastStart, endTime: pastEnd, attendees: guest, eventColorId: "8" },
        { uid: P + "noinvite-1", title: "Gym", startTime: pastStart, endTime: pastEnd, eventColorId: "11" },
        { uid: P + "future-1", title: "Tomorrow and Closer", startTime: futureStart, endTime: futureEnd, attendees: guest, eventColorId: "2" },
      ];

      // A. First color-aware sync.
      await sync(base);
      let s = await snap();
      ok("A new colored row: firstObserved set, no changedAt", !!ev(s, "past-1")?.colorFirstObservedAt && ev(s, "past-1")?.colorChangedAt === undefined);
      ok("A new colored row: one history row, source sync, no previous", hist(s, "past-1").length === 1 && hist(s, "past-1")[0].source === "sync" && hist(s, "past-1")[0].previousColorId === undefined);
      ok("A uncolored row: no history", hist(s, "past-2").length === 0 && ev(s, "past-2")?.eventColorId === undefined);
      ok("A legacy row (pre-existing, no color fields): history row is 'initial', no changedAt", hist(s, "legacy-1").length === 1 && hist(s, "legacy-1")[0].source === "initial" && ev(s, "legacy-1")?.colorChangedAt === undefined, JSON.stringify(hist(s, "legacy-1")));
      ok("A googleUpdatedAt stored", ev(s, "legacy-2")?.googleUpdatedAt === pastStart - H);

      // B. Same payload again: nothing new.
      const before = s.history.length;
      await sync(base);
      s = await snap();
      ok("B unchanged sync writes no history", s.history.length === before, `${before} → ${s.history.length}`);
      ok("B unchanged sync sets no changedAt", s.events.every((e) => e.colorChangedAt === undefined));

      // C. Closer recolors past-1 to red, clears clear-1, legacy-1 unchanged.
      const stepC = base.map((e) =>
        e.uid === P + "past-1" ? { ...e, eventColorId: "11", googleUpdatedAt: now } :
        e.uid === P + "clear-1" ? { ...e, eventColorId: undefined } : e,
      );
      await sync(stepC);
      s = await snap();
      const p1 = ev(s, "past-1");
      ok("C recolor: changedAt set after start", !!p1?.colorChangedAt && p1.colorChangedAt > pastStart);
      ok("C recolor: history row with previous 2 → 11, source sync", hist(s, "past-1").length === 2 && hist(s, "past-1")[1].previousColorId === "2" && hist(s, "past-1")[1].colorId === "11" && hist(s, "past-1")[1].source === "sync");
      ok("C clear: history row with colorId undefined, previous 5", hist(s, "clear-1").length === 2 && hist(s, "clear-1")[1].colorId === undefined && hist(s, "clear-1")[1].previousColorId === "5");
      ok("C clear: event color removed, changedAt set", ev(s, "clear-1")?.eventColorId === undefined && !!ev(s, "clear-1")?.colorChangedAt);
      ok("C untouched legacy row: still no changedAt, still one history row", ev(s, "legacy-1")?.colorChangedAt === undefined && hist(s, "legacy-1").length === 1);

      // D. future-1 disappears (cancelled) → sweep deletes it; then it comes back.
      await sync(stepC.filter((e) => e.uid !== P + "future-1"));
      s = await snap();
      ok("D cancelled future event deleted", ev(s, "future-1") === undefined);
      ok("D its history survives", hist(s, "future-1").length === 1);
      await sync(stepC); // restored with the same color
      s = await snap();
      ok("D restored with same color: re-inserted, no new history row", !!ev(s, "future-1") && hist(s, "future-1").length === 1);
      await sync(stepC.filter((e) => e.uid !== P + "future-1"));
      await sync(stepC.map((e) => (e.uid === P + "future-1" ? { ...e, eventColorId: "10" } : e)));
      s = await snap();
      ok("D restored with a new color: history row with previous 2 → 10", hist(s, "future-1").length === 2 && hist(s, "future-1")[1].previousColorId === "2" && hist(s, "future-1")[1].colorId === "10");
      ok("D re-inserted row has no changedAt (first observation of a new row)", ev(s, "future-1")?.colorChangedAt === undefined);

      // E. Check-ins reader.
      const states: Array<{ uid: string; state: string }> = await ctx.runQuery(
        internal.calendarColorHarness.checkinsProbe,
        { teamId: args.teamId, closerId: args.closerId, startMs: now - 24 * H, endMs: now + 24 * H },
      );
      const st = (uid: string) => states.find((x) => x.uid === P + uid)?.state;
      ok("E past-1 recolored after the call → done", st("past-1") === "done", st("past-1"));
      ok("E past-2 uncolored → uncolored", st("past-2") === "uncolored", st("past-2"));
      ok("E clear-1 cleared → uncolored", st("clear-1") === "uncolored", st("clear-1"));
      ok("E legacy-1 (red, first seen after start, edited after start) → unverified", st("legacy-1") === "unverified", st("legacy-1"));
      ok("E legacy-2 (dark green, Google edit before start) → pre_colored_untouched", st("legacy-2") === "pre_colored_untouched", st("legacy-2"));
      ok("E 'Block' excluded", st("block-1") === undefined, st("block-1"));
      ok("E no-invitee event not a booking", st("noinvite-1") === undefined, st("noinvite-1"));
      ok("E future booking → not_due", st("future-1") === "not_due", st("future-1"));

      // F. Backfill page.
      const page = () =>
        ctx.runMutation(internal.calendarColorBackfill.applyBackfillPage, {
          closerId: args.closerId,
          teamId: args.teamId,
          subscriptionId,
          items: [
            { uid: P + "bf-1", title: "Backfilled", colorId: "11", updatedAt: now - H, startTime: pastStart },
            { uid: P + "past-1", title: "Prospect and Closer", colorId: "11" },
            { uid: P + "nope", colorId: "2" },
          ],
        });
      const f1 = await page();
      s = await snap();
      ok("F backfill: unobserved row patched + history 'backfill'", f1.patched === 1 && f1.historyRows === 1 && hist(s, "bf-1")[0]?.source === "backfill", JSON.stringify(f1));
      ok("F backfill: observed row left alone, unknown uid unmatched", f1.alreadyObserved === 1 && f1.unmatched === 1);
      ok("F backfill: no changedAt on backfilled row", ev(s, "bf-1")?.colorChangedAt === undefined && ev(s, "bf-1")?.eventColorId === "11");
      const f2 = await page();
      ok("F backfill is idempotent", f2.patched === 0 && f2.historyRows === 0 && f2.alreadyObserved === 2, JSON.stringify(f2));
    } catch (err) {
      ok("harness threw", false, err instanceof Error ? err.message : String(err));
    } finally {
      await ctx.runMutation(internal.calendarColorHarness.cleanup, {
        closerId: args.closerId,
        subscriptionId,
      });
    }
    return { allPass: checks.every((c) => c.pass), checks };
  },
});

/**
 * A throwaway team + closer for an EMPTY dev deployment (the B2B dev project
 * has no data of its own). Returns the ids to feed runSyncHarness; teardown
 * with `removeFixtureTeam`.
 */
export const seedFixtureTeam = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const teamId = await ctx.db.insert("teams", {
      name: "Harness fixture team",
      plan: "active",
      createdAt: now,
    });
    const closerId = await ctx.db.insert("closers", {
      name: "Harness Closer",
      email: "harness-closer@example.invalid",
      teamId,
      status: "active",
      invitedAt: now,
    });
    return { teamId, closerId };
  },
});

export const removeFixtureTeam = internalMutation({
  args: { teamId: v.id("teams"), closerId: v.id("closers") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.closerId);
    await ctx.db.delete(args.teamId);
    return { removed: true };
  },
});

export const setup = internalMutation({
  args: {
    closerId: v.id("closers"),
    teamId: v.id("teams"),
    pastStart: v.number(),
    pastEnd: v.number(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const subscriptionId = await ctx.db.insert("closerCalendarSubscriptions", {
      closerId: args.closerId,
      teamId: args.teamId,
      googleCalendarId: "harness-calendar",
      label: "harness",
      countsTowardCapacity: true, // own calendar, so the reader judges it
      enabled: true,
      createdAt: now,
    });
    // Rows that predate the color-aware sync: no color fields at all. The
    // backfill fixture sits more than a day back so the sync's cleanup (which
    // deletes recent rows missing from a payload) leaves it for the backfill.
    for (const uid of ["legacy-1", "legacy-2", "bf-1"]) {
      const shift = uid === "bf-1" ? 30 * H : 0;
      await ctx.db.insert("calendarEvents", {
        closerId: args.closerId,
        teamId: args.teamId,
        uid: P + uid,
        title: uid,
        startTime: args.pastStart - shift,
        endTime: args.pastEnd - shift,
        attendees: [{ email: "prospect@example.com" }],
        subscriptionId,
        calendarLabel: "harness",
        fetchedAt: now - 24 * H,
      });
    }
    return { subscriptionId };
  },
});

export const snapshot = internalQuery({
  args: { closerId: v.id("closers"), subscriptionId: v.id("closerCalendarSubscriptions") },
  handler: async (ctx, args): Promise<Snapshot> => {
    const events = await ctx.db
      .query("calendarEvents")
      .withIndex("by_subscription", (q) => q.eq("subscriptionId", args.subscriptionId))
      .collect();
    const history = await ctx.db
      .query("calendarEventColorHistory")
      .withIndex("by_closer_and_uid", (q) => q.eq("closerId", args.closerId))
      .collect();
    return {
      events: events.map((e) => ({
        uid: e.uid,
        eventColorId: e.eventColorId,
        colorFirstObservedAt: e.colorFirstObservedAt,
        colorChangedAt: e.colorChangedAt,
        googleUpdatedAt: e.googleUpdatedAt,
      })),
      history: history
        .filter((h) => h.eventUid.startsWith(P))
        .sort((a, b) => a.observedAt - b.observedAt || a._creationTime - b._creationTime)
        .map((h) => ({
          eventUid: h.eventUid,
          colorId: h.colorId,
          previousColorId: h.previousColorId,
          source: h.source,
          observedAt: h.observedAt,
        })),
    };
  },
});

export const checkinsProbe = internalQuery({
  args: {
    teamId: v.id("teams"),
    closerId: v.id("closers"),
    startMs: v.number(),
    endMs: v.number(),
  },
  handler: async (ctx, args) => {
    const rows = await collectRecolorStates(ctx, args.teamId, args.startMs, args.endMs, Date.now());
    // Map back to uids through the event rows so the harness can name them.
    const events = await ctx.db
      .query("calendarEvents")
      .withIndex("by_closer", (q) => q.eq("closerId", args.closerId))
      .collect();
    const uidByStartAndTitle = new Map(events.map((e) => [`${e.startTime}|${e.title}`, e.uid]));
    return rows
      .filter((r) => r.closerId === String(args.closerId))
      .map((r) => ({ uid: uidByStartAndTitle.get(`${r.startTime}|${r.title}`) ?? "?", state: r.state }));
  },
});

export const cleanup = internalMutation({
  args: { closerId: v.id("closers"), subscriptionId: v.id("closerCalendarSubscriptions") },
  handler: async (ctx, args) => {
    const events = await ctx.db
      .query("calendarEvents")
      .withIndex("by_subscription", (q) => q.eq("subscriptionId", args.subscriptionId))
      .collect();
    for (const e of events) await ctx.db.delete(e._id);
    const history = (await ctx.db
      .query("calendarEventColorHistory")
      .withIndex("by_closer_and_uid", (q) => q.eq("closerId", args.closerId))
      .collect()) as Doc<"calendarEventColorHistory">[];
    for (const h of history) if (h.eventUid.startsWith(P)) await ctx.db.delete(h._id);
    const sub = await ctx.db.get(args.subscriptionId as Id<"closerCalendarSubscriptions">);
    if (sub) await ctx.db.delete(sub._id);
    return { deletedEvents: events.length };
  },
});
