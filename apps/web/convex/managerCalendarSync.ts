import { v } from "convex/values";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { matchMeetingToRep, type Candidate } from "./managerMeetingMatch";

/* eslint-disable @typescript-eslint/no-explicit-any */

// ============================================================================
// Read a manager's upcoming meetings from Google.
//
// Simpler than the closer sync: one calendar, no sub-calendar picker, no
// attribution. Everything on this calendar belongs to the manager whose token
// it is, which is the whole reason Manager Mode is small.
// ============================================================================

/** How far ahead to look. Bots are only ever scheduled minutes out; a week is
 *  enough for the tab to show what's coming without dragging in noise. */
const LOOKAHEAD_MS = 7 * 24 * 60 * 60 * 1000;

/** Reps this manager's meetings could be with. */
export const getMatchCandidates = internalQuery({
  args: { teamId: v.id("teams") },
  handler: async (ctx, args): Promise<Candidate[]> => {
    const closers = await ctx.db
      .query("closers")
      .withIndex("by_team", (q: any) => q.eq("teamId", args.teamId))
      .take(200);
    return closers
      .filter((c) => c.status === "active")
      .map((c) => ({
        closerId: String(c._id),
        name: c.name ?? "",
        email: c.email ?? "",
      }));
  },
});

export const getManagerForSync = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const u = await ctx.db.get(args.userId);
    if (!u) return null;
    return {
      userId: u._id,
      teamId: u.teamId as Id<"teams">,
      refreshToken: u.googleCalendarRefreshToken ?? null,
    };
  },
});

/** Google revoked us. Clear the connection rather than retry forever. */
export const clearRevokedConnection = internalMutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.userId, {
      googleCalendarRefreshToken: undefined,
      calendarProvider: undefined,
      calendarConnectedAt: undefined,
      // Leaves a visible trace so the connect card can say the connection
      // expired rather than rendering as never-connected.
      calendarDisconnectReason: "google_revoked",
    });
  },
});

export const upsertManagerEvent = internalMutation({
  args: {
    userId: v.id("users"),
    teamId: v.id("teams"),
    uid: v.string(),
    title: v.string(),
    description: v.optional(v.string()),
    meetingUrl: v.optional(v.string()),
    startTime: v.number(),
    endTime: v.number(),
    isAllDay: v.optional(v.boolean()),
    attendees: v.optional(v.string()),
    matchedCloserId: v.optional(v.id("closers")),
    matchedBy: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("managerCalendarEvents")
      .withIndex("by_uid", (q) => q.eq("uid", args.uid))
      .first();

    if (existing) {
      // `excluded` is deliberately not in args, so a manager who pressed
      // "don't record this one" cannot have that undone by the next sync.
      await ctx.db.patch(existing._id, { ...args, fetchedAt: Date.now() });
      return existing._id;
    }
    return await ctx.db.insert("managerCalendarEvents", {
      ...args,
      fetchedAt: Date.now(),
    });
  },
});

/** Drop events that have fallen out of the window or vanished from Google. */
export const pruneStaleEvents = internalMutation({
  args: { userId: v.id("users"), keepUids: v.array(v.string()), horizon: v.number() },
  handler: async (ctx, args) => {
    const keep = new Set(args.keepUids);
    const rows = await ctx.db
      .query("managerCalendarEvents")
      .withIndex("by_user_and_start", (q) => q.eq("userId", args.userId))
      .collect();
    let removed = 0;
    for (const r of rows) {
      // Only prune the future. A past event may have a recording hanging off
      // it, and deleting it would orphan the meeting it produced.
      if (r.startTime < Date.now()) continue;
      if (r.startTime > args.horizon) continue;
      if (keep.has(r.uid)) continue;
      await ctx.db.delete(r._id);
      removed++;
    }
    return { removed };
  },
});

/**
 * Pull the meeting URL out of an event.
 *
 * Google puts it in three different places depending on how the meeting was
 * created, and a manager's calendar has all three — Meet links auto-attached,
 * Zoom links pasted into the description by a booking tool, and conference
 * data from a proper integration.
 */
function extractMeetingUrl(ev: any): string | undefined {
  if (ev.hangoutLink) return ev.hangoutLink;

  const entry = ev.conferenceData?.entryPoints?.find(
    (e: any) => e.entryPointType === "video" && e.uri,
  );
  if (entry?.uri) return entry.uri;

  const text = `${ev.description ?? ""} ${ev.location ?? ""}`;
  const match = text.match(
    /https:\/\/(?:[\w-]+\.)?(?:zoom\.us\/j\/\S+|meet\.google\.com\/[\w-]+|teams\.microsoft\.com\/\S+)/i,
  );
  return match?.[0];
}

export const syncManagerCalendar = internalAction({
  args: { userId: v.id("users") },
  handler: async (
    ctx,
    args,
  ): Promise<{ fetched: number; upserted: number; pruned: number; skipped: string[] }> => {
    const mgr = await ctx.runQuery(internal.managerCalendarSync.getManagerForSync, {
      userId: args.userId,
    });
    if (!mgr?.refreshToken) {
      return { fetched: 0, upserted: 0, pruned: 0, skipped: ["not connected"] };
    }

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      throw new Error("Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET env vars");
    }

    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: mgr.refreshToken,
        grant_type: "refresh_token",
      }),
    });
    const tokenData = await tokenRes.json();

    if (!tokenRes.ok || tokenData.error) {
      // invalid_grant means the user revoked us or the Google account is gone
      // — as happens when a company rebrands its Workspace. Retrying forever
      // achieves nothing; clear it so the tab can ask them to reconnect.
      if (tokenData.error === "invalid_grant") {
        await ctx.runMutation(internal.managerCalendarSync.clearRevokedConnection, {
          userId: args.userId,
        });
        return { fetched: 0, upserted: 0, pruned: 0, skipped: ["connection revoked"] };
      }
      throw new Error(`Google token refresh failed: ${tokenData.error ?? tokenRes.status}`);
    }

    const now = Date.now();
    const horizon = now + LOOKAHEAD_MS;
    const params = new URLSearchParams({
      timeMin: new Date(now).toISOString(),
      timeMax: new Date(horizon).toISOString(),
      singleEvents: "true", // expand recurring meetings into instances
      orderBy: "startTime",
      maxResults: "250",
    });

    const evRes = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
      { headers: { Authorization: `Bearer ${tokenData.access_token}` } },
    );
    if (!evRes.ok) {
      throw new Error(`Google events fetch failed: ${evRes.status} ${await evRes.text()}`);
    }
    const body = await evRes.json();
    const items: any[] = body.items ?? [];

    // Who this manager's meetings could be with. Fetched once rather than per
    // event — a week of meetings would otherwise be a query each.
    const candidates = await ctx.runQuery(
      internal.managerCalendarSync.getMatchCandidates,
      { teamId: mgr.teamId },
    );

    let upserted = 0;
    const keepUids: string[] = [];
    const skipped: string[] = [];

    for (const ev of items) {
      if (ev.status === "cancelled") { skipped.push("cancelled"); continue; }
      // Google leaves cancelled meetings on the calendar with the title
      // rewritten rather than removing them.
      if (typeof ev.summary === "string" && ev.summary.startsWith("Canceled:")) {
        skipped.push("titled Canceled:"); continue;
      }
      // All-day entries are holidays, blocks and out-of-office, never a call.
      if (!ev.start?.dateTime) { skipped.push("all-day"); continue; }

      const startTime = new Date(ev.start.dateTime).getTime();
      const endTime = ev.end?.dateTime ? new Date(ev.end.dateTime).getTime() : startTime;

      const attendees = ev.attendees ? JSON.stringify(ev.attendees) : undefined;
      const match = matchMeetingToRep(
        { title: ev.summary ?? undefined, attendees },
        candidates,
      );

      keepUids.push(ev.id);
      await ctx.runMutation(internal.managerCalendarSync.upsertManagerEvent, {
        userId: mgr.userId,
        teamId: mgr.teamId,
        uid: ev.id,
        title: ev.summary ?? "(no title)",
        description: ev.description ?? undefined,
        meetingUrl: extractMeetingUrl(ev),
        startTime,
        endTime,
        isAllDay: false,
        attendees,
        matchedCloserId: (match?.closerId as any) ?? undefined,
        matchedBy: match?.by,
      });
      upserted++;
    }

    const { removed } = await ctx.runMutation(
      internal.managerCalendarSync.pruneStaleEvents,
      { userId: mgr.userId, keepUids, horizon },
    );

    return { fetched: items.length, upserted, pruned: removed, skipped };
  },
});
