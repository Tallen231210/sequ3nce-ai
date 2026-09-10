// ============================================================================
// Read-only diagnostic: what happened to the bots we booked for one team.
//   CONVEX_DEPLOYMENT=dev:fastidious-dragon-782 npx convex run botOutcomeProbe:byStatus '{"teamId":"…","days":14}' --prod
// Answers "are we sending bots, and why aren't they in the meeting?" —
// bots by final status, never-joined bots by status and failure reason, and
// how many bots were booked per calendar event (a sign of re-booking loops).
// ============================================================================

import { v } from "convex/values";
import { internalAction, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";

const DAY_MS = 24 * 60 * 60 * 1000;

export const byStatus = internalQuery({
  args: { teamId: v.id("teams"), days: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const nowMs = Date.now();
    const since = nowMs - Math.min(args.days ?? 14, 30) * DAY_MS;
    const bots = (await ctx.db.query("meetingBots").withIndex("by_team", (q) => q.eq("teamId", args.teamId)).order("desc").take(3_000)).filter(
      (b) => (b.scheduledAt ?? b.createdAt) >= since,
    );
    const closers = await ctx.db.query("closers").withIndex("by_team", (q) => q.eq("teamId", args.teamId)).collect();
    const nameOf = new Map(closers.map((c) => [String(c._id), c.name ?? c.email ?? "closer"]));
    const tally = (m: Record<string, number>, k: string) => {
      m[k] = (m[k] ?? 0) + 1;
    };
    const status: Record<string, number> = {};
    const neverJoinedStatus: Record<string, number> = {};
    const neverJoinedReason: Record<string, number> = {};
    const perCloser: Record<string, { booked: number; joined: number; neverJoined: number; pending: number }> = {};
    const perEvent: Record<string, number> = {};
    let joined = 0;
    let neverJoined = 0;
    let pending = 0;
    for (const b of bots) {
      tally(status, b.status);
      const who = nameOf.get(String(b.closerId)) ?? "?";
      const pc = (perCloser[who] ??= { booked: 0, joined: 0, neverJoined: 0, pending: 0 });
      pc.booked += 1;
      if (b.calendarEventId) tally(perEvent, b.calendarEventId);
      if (b.joinedAt) {
        joined += 1;
        pc.joined += 1;
      } else if ((b.scheduledAt ?? b.createdAt) < nowMs - 30 * 60 * 1000) {
        neverJoined += 1;
        pc.neverJoined += 1;
        tally(neverJoinedStatus, b.status);
        tally(neverJoinedReason, b.failureReason ?? `(no reason, status ${b.status})`);
      } else {
        pending += 1;
        pc.pending += 1;
      }
    }
    // Reasons can carry non-ASCII characters, which Convex refuses as object keys — return tallies as rows.
    const rows = (m: Record<string, number>) => Object.entries(m).map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count);
    const perEventCounts = Object.values(perEvent);
    const eventsWithBots = perEventCounts.length;
    const eventsWithManyBots = perEventCounts.filter((n) => n > 1).length;
    const maxBotsOnOneEvent = perEventCounts.length ? Math.max(...perEventCounts) : 0;
    // A sample of never-joined bots for a look at Recall
    const samples = bots
      .filter((b) => !b.joinedAt && (b.scheduledAt ?? b.createdAt) < nowMs - 30 * 60 * 1000)
      .slice(0, 8)
      .map((b) => ({ title: b.meetingTitle, closer: nameOf.get(String(b.closerId)), status: b.status, reason: b.failureReason ?? null, scheduledAt: new Date(b.scheduledAt ?? b.createdAt).toISOString(), endedAt: b.endedAt ? new Date(b.endedAt).toISOString() : null, url: (b.meetingUrl ?? "").slice(0, 40), recallBotId: b.recallBotId ?? null }));
    return { bots: bots.length, joined, neverJoined, pending, status: rows(status), neverJoinedStatus: rows(neverJoinedStatus), neverJoinedReason: rows(neverJoinedReason), perCloser: Object.entries(perCloser).map(([closer, c]) => ({ closer, ...c })), eventsWithBots, eventsWithManyBots, maxBotsOnOneEvent, samples };
  },
});

/** Recall bot ids of "nobody joined" bots in the window, newest first — for the history probe. */
export const neverJoinedBotIds = internalQuery({
  args: { teamId: v.id("teams"), days: v.optional(v.number()), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const nowMs = Date.now();
    const since = nowMs - Math.min(args.days ?? 14, 30) * DAY_MS;
    const bots = (await ctx.db.query("meetingBots").withIndex("by_team", (q) => q.eq("teamId", args.teamId)).order("desc").take(3_000)).filter(
      (b) => (b.scheduledAt ?? b.createdAt) >= since && !b.joinedAt && b.status === "completed" && !!b.recallBotId,
    );
    return bots.slice(0, Math.min(args.limit ?? 40, 100)).map((b) => ({ recallBotId: b.recallBotId as string, title: b.meetingTitle ?? "", url: b.meetingUrl }));
  },
});

/**
 * Ask Recall what happened to a sample of "nobody joined" bots: the status
 * codes and sub-codes it logged (waiting room, only participant, everyone
 * left, kicked…). Read-only; one GET per bot.
 *   … npx convex run botOutcomeProbe:recallHistory '{"teamId":"…","days":14,"sample":40}' --prod
 */
export const recallHistory = internalAction({
  args: { teamId: v.id("teams"), days: v.optional(v.number()), sample: v.optional(v.number()) },
  handler: async (ctx, args): Promise<unknown> => {
    const key = process.env.RECALL_API_KEY;
    if (!key) return { error: "RECALL_API_KEY not configured" };
    const bots: Array<{ recallBotId: string; title: string; url: string }> = await ctx.runQuery(internal.botOutcomeProbe.neverJoinedBotIds, { teamId: args.teamId, days: args.days, limit: args.sample ?? 40 });
    const ending: Record<string, number> = {};
    const sawWaitingRoom = { yes: 0, no: 0 };
    const platform: Record<string, number> = {};
    const detail: Array<{ title: string; codes: string[]; ending: string }> = [];
    for (const b of bots) {
      const res = await fetch(`https://us-west-2.recall.ai/api/v1/bot/${b.recallBotId}/`, { headers: { Authorization: `Token ${key}` } });
      if (!res.ok) {
        ending[`http ${res.status}`] = (ending[`http ${res.status}`] ?? 0) + 1;
        continue;
      }
      const data = (await res.json()) as { status_changes?: Array<{ code: string; sub_code?: string | null }>; meeting_url?: { platform?: string } };
      const changes = data.status_changes ?? [];
      const codes = changes.map((c) => c.code + (c.sub_code ? `/${c.sub_code}` : ""));
      const last = changes.filter((c) => c.code === "done" || c.code === "fatal" || c.code === "call_ended").map((c) => c.code + (c.sub_code ? `/${c.sub_code}` : ""));
      const end = last[last.length - 1] ?? codes[codes.length - 1] ?? "(no status)";
      ending[end] = (ending[end] ?? 0) + 1;
      if (codes.some((c) => c.startsWith("in_waiting_room"))) sawWaitingRoom.yes += 1;
      else sawWaitingRoom.no += 1;
      const p = data.meeting_url?.platform ?? (b.url.includes("meet.google") ? "google_meet" : b.url.includes("zoom") ? "zoom" : "other");
      platform[p] = (platform[p] ?? 0) + 1;
      detail.push({ title: b.title.slice(0, 40), codes, ending: end });
    }
    const rows = (m: Record<string, number>) => Object.entries(m).map(([k, count]) => ({ key: k, count })).sort((a, b) => b.count - a.count);
    return { sampled: bots.length, ending: rows(ending), sawWaitingRoom, platform: rows(platform), detail: detail.slice(0, 12) };
  },
});
