import { v } from "convex/values";
import {
  query,
  mutation,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

// ==================== Constants ====================

const MAX_TITLE_LENGTH = 120;
const MAX_DESCRIPTION_LENGTH = 1000;
const MAX_REASON_LENGTH = 500;
const VALID_DURATIONS = new Set([15, 30, 45, 60, 90, 120]);
const MAX_PARTICIPANTS = 50;
const FAN_OUT_BATCH_SIZE = 500;
const CRON_SWEEP_LIMIT = 500;
const STALE_SCHEDULED_BUFFER_MS = 3 * 60 * 60 * 1000; // 3h past scheduled start → auto-end
const STALE_LIVE_BUFFER_MS = 2 * 60 * 60 * 1000;     // 2h past scheduled end → auto-end

// ==================== Helpers ====================

function isCoachOrAdmin(user: { badges?: string[] } | null): boolean {
  const badges = user?.badges ?? [];
  return (
    badges.includes("coach") ||
    badges.includes("founder") ||
    badges.includes("admin")
  );
}

function isFounderOrAdmin(user: { badges?: string[] } | null): boolean {
  const badges = user?.badges ?? [];
  return badges.includes("founder") || badges.includes("admin");
}

// ==================== Queries ====================

// List coaching calls, optionally filtered by status. Newest-scheduled first.
export const listCoachingCalls = query({
  args: {
    status: v.optional(v.union(
      v.literal("scheduled"),
      v.literal("live"),
      v.literal("ended"),
      v.literal("cancelled"),
    )),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = Math.min(args.limit ?? 30, 100);

    let rows;
    if (args.status) {
      rows = await ctx.db
        .query("b2cCoachingCalls")
        .withIndex("by_status_start", (q) => q.eq("status", args.status!))
        .order("desc")
        .take(limit);
    } else {
      rows = await ctx.db
        .query("b2cCoachingCalls")
        .order("desc")
        .take(limit);
    }

    // Enrich with coach display info
    return await Promise.all(
      rows.map(async (r) => {
        const coach = await ctx.db.get(r.coachUserId);
        return {
          ...r,
          coachName: coach?.name ?? "Unknown",
          coachPhotoUrl: null as string | null, // Profile photos loaded separately if needed
        };
      })
    );
  },
});

// Convenience query for Dashboard widgets — returns live + next 3 upcoming.
export const getUpcomingAndLiveCalls = query({
  args: {},
  handler: async (ctx) => {
    const live = await ctx.db
      .query("b2cCoachingCalls")
      .withIndex("by_status_start", (q) => q.eq("status", "live"))
      .collect();
    const upcoming = await ctx.db
      .query("b2cCoachingCalls")
      .withIndex("by_status_start", (q) => q.eq("status", "scheduled"))
      .order("asc")
      .take(3);
    return { live, upcoming };
  },
});

export const getCoachingCall = query({
  args: { callId: v.id("b2cCoachingCalls") },
  handler: async (ctx, args) => {
    const call = await ctx.db.get(args.callId);
    if (!call) return null;
    const coach = await ctx.db.get(call.coachUserId);
    const attendance = await ctx.db
      .query("b2cCoachingCallAttendance")
      .withIndex("by_call", (q) => q.eq("callId", args.callId))
      .collect();
    return {
      ...call,
      coachName: coach?.name ?? "Unknown",
      attendeeCount: attendance.filter((a) => a.role === "attendee").length,
    };
  },
});

// Past calls with recordings — powers the Training replay section.
export const getPastCoachingCallsWithRecordings = query({
  args: {
    limit: v.optional(v.number()),
    cursor: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = Math.min(args.limit ?? 20, 50);
    let all = await ctx.db
      .query("b2cCoachingCalls")
      .withIndex("by_status_start", (q) => q.eq("status", "ended"))
      .order("desc")
      .collect();

    // Only include rows with a ready recording
    all = all.filter((c) => c.recordingStatus === "ready" && c.recordingUrl);
    if (args.cursor) {
      all = all.filter((c) => c.scheduledStartTime < args.cursor!);
    }
    const page = all.slice(0, limit + 1);
    const hasMore = page.length > limit;
    const results = page.slice(0, limit);

    const enriched = await Promise.all(
      results.map(async (r) => {
        const coach = await ctx.db.get(r.coachUserId);
        return {
          ...r,
          coachName: coach?.name ?? "Unknown",
        };
      })
    );
    return {
      calls: enriched,
      nextCursor: hasMore ? results[results.length - 1].scheduledStartTime : null,
    };
  },
});

// Internal: fetch the full b2cUser row for subscription gate + display name.
// Used by the Daily-runtime join action which can't run queries directly.
export const _getUserForJoin = internalQuery({
  args: { userId: v.id("b2cUsers") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.userId);
  },
});

// Internal: fetch the display metadata we pass into each user's Daily meeting
// token (via user_data). Lets participants see each other's Sequ3nce profile
// photos on their tiles when cameras are off — no handshake or extra queries
// once the call is running.
export const _getUserDailyMetadata = internalQuery({
  args: { userId: v.id("b2cUsers") },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) return { name: "Guest", photoUrl: null as string | null };
    const profile = await ctx.db
      .query("b2cProfiles")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();
    const photoUrl = profile?.photoStorageId
      ? await ctx.storage.getUrl(profile.photoStorageId)
      : null;
    return { name: user.name ?? "Guest", photoUrl };
  },
});

// Internal helper used by attendance check in the join flow.
export const _getLatestAttendanceForUser = internalQuery({
  args: {
    callId: v.id("b2cCoachingCalls"),
    userId: v.id("b2cUsers"),
  },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("b2cCoachingCallAttendance")
      .withIndex("by_call_user", (q) =>
        q.eq("callId", args.callId).eq("userId", args.userId)
      )
      .order("desc")
      .take(1);
    return rows[0] ?? null;
  },
});

// ==================== Mutations ====================

export const createCoachingCall = mutation({
  args: {
    coachUserId: v.id("b2cUsers"),
    title: v.string(),
    description: v.optional(v.string()),
    scheduledStartTime: v.number(),
    scheduledDurationMin: v.number(),
  },
  handler: async (ctx, args) => {
    const coach = await ctx.db.get(args.coachUserId);
    if (!isCoachOrAdmin(coach)) {
      throw new Error("Only users with a coach or founder badge can schedule coaching calls");
    }

    const title = args.title.trim();
    if (!title) throw new Error("Title is required");
    if (title.length > MAX_TITLE_LENGTH) {
      throw new Error(`Title must be ${MAX_TITLE_LENGTH} characters or less`);
    }
    const description = args.description?.trim();
    if (description && description.length > MAX_DESCRIPTION_LENGTH) {
      throw new Error(`Description must be ${MAX_DESCRIPTION_LENGTH} characters or less`);
    }

    if (!VALID_DURATIONS.has(args.scheduledDurationMin)) {
      throw new Error("Duration must be 15, 30, 45, 60, 90, or 120 minutes");
    }
    if (args.scheduledStartTime <= Date.now() - 60_000) {
      // Allow 1 min of clock skew; otherwise block scheduling in the past
      throw new Error("Scheduled start time must be in the future");
    }

    const now = Date.now();
    // Daily room name — random nonce guarantees uniqueness without needing
    // the callId to exist first. Prefixed so Daily's dashboard groups them.
    const nonce = Math.random().toString(36).slice(2, 12);
    const dailyRoomName = `coaching-${nonce}`;
    const callId = await ctx.db.insert("b2cCoachingCalls", {
      coachUserId: args.coachUserId,
      title,
      description: description || undefined,
      scheduledStartTime: args.scheduledStartTime,
      scheduledDurationMin: args.scheduledDurationMin,
      status: "scheduled",
      dailyRoomName,
      createdAt: now,
      updatedAt: now,
    });

    // Fan out calendar events to all active B2C users.
    // Paginated via self-rescheduling action so a 50k-user base doesn't
    // blow the mutation budget.
    await ctx.scheduler.runAfter(0, api.b2cCoachingCalls.fanOutToCalendars, {
      callId,
      cursor: null,
    });

    return { callId };
  },
});

export const cancelCoachingCall = mutation({
  args: {
    callId: v.id("b2cCoachingCalls"),
    callerId: v.id("b2cUsers"),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const call = await ctx.db.get(args.callId);
    if (!call) throw new Error("Call not found");
    if (call.status !== "scheduled" && call.status !== "live") {
      throw new Error(`Cannot cancel a call that is ${call.status}`);
    }
    const caller = await ctx.db.get(args.callerId);
    const isOwner = call.coachUserId === args.callerId;
    if (!isOwner && !isFounderOrAdmin(caller)) {
      throw new Error("Only the coach or a founder can cancel this call");
    }

    const reason = args.reason?.trim().slice(0, MAX_REASON_LENGTH);

    await ctx.db.patch(args.callId, {
      status: "cancelled",
      cancelledReason: reason,
      updatedAt: Date.now(),
    });

    // Schedule cleanup of the fan-out calendar events + user notification
    await ctx.scheduler.runAfter(0, api.b2cCoachingCalls.cleanupCancelledCall, {
      callId: args.callId,
    });

    return { success: true };
  },
});

// ==================== Internal DB helpers (non-node runtime) ====================

export const _patchCallLive = internalMutation({
  args: {
    callId: v.id("b2cCoachingCalls"),
    dailyRoomUrl: v.string(),
    actualStartTime: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.callId, {
      status: "live",
      dailyRoomUrl: args.dailyRoomUrl,
      actualStartTime: args.actualStartTime,
      recordingStatus: "recording",
      updatedAt: args.actualStartTime,
    });
  },
});

export const _patchCallEnded = internalMutation({
  args: {
    callId: v.id("b2cCoachingCalls"),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    await ctx.db.patch(args.callId, {
      status: "ended",
      actualEndTime: now,
      recordingStatus: "processing",
      updatedAt: now,
    });
    // Remove the fanned-out calendar events. Once the call is over, it no
    // longer belongs in attendees' Schedule tabs — the call's recording
    // appears in PastCoachingCallsList instead. This also cleans up the
    // common test case where a coach schedules a call for the future,
    // starts it early, and ends it; without cleanup the phantom event
    // sticks around in everyone's calendar at its original scheduled time.
    const events = await ctx.db
      .query("calendarEvents")
      .withIndex("by_coaching_call", (q) => q.eq("coachingCallId", args.callId))
      .collect();
    for (const e of events) {
      await ctx.db.delete(e._id);
    }
  },
});

export const _patchCallRecording = internalMutation({
  args: {
    callId: v.id("b2cCoachingCalls"),
    recordingUrl: v.optional(v.string()),
    recordingStatus: v.union(
      v.literal("recording"),
      v.literal("processing"),
      v.literal("ready"),
      v.literal("failed"),
      v.literal("deleted"),
    ),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.callId, {
      recordingUrl: args.recordingUrl,
      recordingStatus: args.recordingStatus,
      updatedAt: Date.now(),
    });
  },
});

export const _recordAttendance = internalMutation({
  args: {
    callId: v.id("b2cCoachingCalls"),
    userId: v.id("b2cUsers"),
    role: v.union(v.literal("coach"), v.literal("attendee")),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("b2cCoachingCallAttendance", {
      callId: args.callId,
      userId: args.userId,
      joinedAt: Date.now(),
      role: args.role,
    });
  },
});

export const _markAttendanceKicked = internalMutation({
  args: {
    callId: v.id("b2cCoachingCalls"),
    userId: v.id("b2cUsers"),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("b2cCoachingCallAttendance")
      .withIndex("by_call_user", (q) =>
        q.eq("callId", args.callId).eq("userId", args.userId)
      )
      .order("desc")
      .first();
    if (!row) return;
    await ctx.db.patch(row._id, {
      kicked: true,
      leftAt: Date.now(),
    });
  },
});

// ==================== Fan-out + cleanup actions (non-node — just DB work) ====================

// Paginated fan-out: insert a calendarEvents row for each active B2C user so
// every subscriber sees the coaching call on their Schedule tab with a Join
// button. Uses self-rescheduling pattern for large user bases.
export const fanOutToCalendars = mutation({
  args: {
    callId: v.id("b2cCoachingCalls"),
    cursor: v.union(v.null(), v.number()),
  },
  handler: async (ctx, args) => {
    const call = await ctx.db.get(args.callId);
    if (!call || call.status === "cancelled") return { done: true as const };

    // Page through active users (Stripe treats free-trial users as "active"
    // once they've checked out). Users still on "none" haven't converted.
    const users = await ctx.db
      .query("b2cUsers")
      .withIndex("by_subscription_status", (q) =>
        q.eq("subscriptionStatus", "active")
      )
      .collect();
    users.sort((a, b) => a._creationTime - b._creationTime);

    const startIdx = args.cursor == null
      ? 0
      : users.findIndex((u) => u._creationTime > args.cursor!);
    const slice = users.slice(
      startIdx < 0 ? users.length : startIdx,
      (startIdx < 0 ? users.length : startIdx) + FAN_OUT_BATCH_SIZE
    );

    const startTime = call.scheduledStartTime;
    const endTime = startTime + call.scheduledDurationMin * 60_000;
    const now = Date.now();

    for (const user of slice) {
      const teamId = user.personalWorkspaceId;
      if (!teamId) continue;
      const closer = await ctx.db
        .query("closers")
        .withIndex("by_team", (q) => q.eq("teamId", teamId))
        .first();
      if (!closer) continue;

      // Idempotent: skip if we've already inserted for this call + closer.
      const existing = await ctx.db
        .query("calendarEvents")
        .withIndex("by_coaching_call", (q) => q.eq("coachingCallId", args.callId))
        .filter((q) => q.eq(q.field("closerId"), closer._id))
        .first();
      if (existing) continue;

      // Look up the coach's display name for clarity on calendar events.
      const coach = await ctx.db.get(call.coachUserId);
      const coachName = (coach as { name?: string } | null)?.name ?? "Coach";

      // Title prefix makes it unmistakable — users must not confuse this with
      // a sales call. Description leads with the coach name.
      const eventTitle = `Sequ3nce Coaching: ${call.title}`;
      const eventDescription = call.description
        ? `Hosted by Coach ${coachName}\n\n${call.description}`
        : `Hosted by Coach ${coachName}`;

      await ctx.db.insert("calendarEvents", {
        closerId: closer._id as Id<"closers">,
        teamId,
        uid: `coaching-${args.callId}-${closer._id}`,
        title: eventTitle,
        description: eventDescription,
        startTime,
        endTime,
        // Marker URL — never opened externally; the Schedule Join handler
        // routes based on coachingCallId instead.
        meetingUrl: `sequ3nce-coaching://${args.callId}`,
        fetchedAt: now,
        coachingCallId: args.callId,
      });
    }

    // Reschedule if more users remain
    if (slice.length === FAN_OUT_BATCH_SIZE) {
      const lastTimestamp = slice[slice.length - 1]._creationTime;
      await ctx.scheduler.runAfter(0, api.b2cCoachingCalls.fanOutToCalendars, {
        callId: args.callId,
        cursor: lastTimestamp,
      });
      return { done: false as const, processed: slice.length };
    }
    return { done: true as const, processed: slice.length };
  },
});

// Cleanup on cancel: remove all calendar event fan-out rows + send notification.
export const cleanupCancelledCall = mutation({
  args: { callId: v.id("b2cCoachingCalls") },
  handler: async (ctx, args) => {
    const events = await ctx.db
      .query("calendarEvents")
      .withIndex("by_coaching_call", (q) => q.eq("coachingCallId", args.callId))
      .collect();
    for (const e of events) {
      await ctx.db.delete(e._id);
    }
    // Team notification send is handled outside this path (TODO: wire once
    // the broadcast pattern here is ready; cron + DM is fine for v1 MVP).
    return { deleted: events.length };
  },
});

// Founder/admin: nuke a coaching call + all its side effects. Used for
// test/mistake cleanup — removes the call row, attendance rows, and all
// fan-out calendarEvents. Does NOT delete Daily recordings; call the Daily
// delete-recording action first if you want that too.
export const adminHardDeleteCoachingCall = mutation({
  args: {
    callerId: v.id("b2cUsers"),
    callId: v.id("b2cCoachingCalls"),
  },
  handler: async (ctx, args) => {
    const caller = await ctx.db.get(args.callerId);
    if (!isFounderOrAdmin(caller)) {
      throw new Error("Only founders can hard-delete coaching calls");
    }

    // Delete fan-out calendarEvents
    const events = await ctx.db
      .query("calendarEvents")
      .withIndex("by_coaching_call", (q) => q.eq("coachingCallId", args.callId))
      .collect();
    for (const e of events) await ctx.db.delete(e._id);

    // Delete attendance rows
    const attendance = await ctx.db
      .query("b2cCoachingCallAttendance")
      .withIndex("by_call", (q) => q.eq("callId", args.callId))
      .collect();
    for (const a of attendance) await ctx.db.delete(a._id);

    // Delete the call itself
    await ctx.db.delete(args.callId);

    return {
      deleted: true,
      calendarEventsRemoved: events.length,
      attendanceRowsRemoved: attendance.length,
    };
  },
});

// Hourly cron sweep: end stale "live" calls whose deadline has long passed,
// and mark "scheduled" calls as ended if the coach never showed.
export const transitionStaleCoachingCalls = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    let endedLive = 0;
    let endedAbandoned = 0;

    // Live calls whose expected end is past by 2h
    const liveCalls = await ctx.db
      .query("b2cCoachingCalls")
      .withIndex("by_status_start", (q) => q.eq("status", "live"))
      .take(CRON_SWEEP_LIMIT);

    for (const c of liveCalls) {
      const expectedEnd =
        c.scheduledStartTime + c.scheduledDurationMin * 60_000;
      if (now - expectedEnd > STALE_LIVE_BUFFER_MS) {
        await ctx.db.patch(c._id, {
          status: "ended",
          actualEndTime: now,
          recordingStatus: c.recordingStatus ?? "processing",
          updatedAt: now,
        });
        endedLive++;
      }
    }

    // Scheduled calls whose start is past by 3h (coach never showed)
    const scheduledCalls = await ctx.db
      .query("b2cCoachingCalls")
      .withIndex("by_status_start", (q) => q.eq("status", "scheduled"))
      .take(CRON_SWEEP_LIMIT);

    for (const c of scheduledCalls) {
      if (now - c.scheduledStartTime > STALE_SCHEDULED_BUFFER_MS) {
        await ctx.db.patch(c._id, {
          status: "ended",
          cancelledReason: "Coach never started the call",
          updatedAt: now,
        });
        endedAbandoned++;
      }
    }

    return { endedLive, endedAbandoned };
  },
});
