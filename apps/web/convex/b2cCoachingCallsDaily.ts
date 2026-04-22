"use node";

import { v } from "convex/values";
import { action } from "./_generated/server";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

// Daily.co REST integration for coaching calls. Lives in its own "use node"
// file because Convex forbids queries/mutations alongside Node-runtime actions,
// and these actions need `fetch()` for the Daily REST API.
//
// All DB reads/writes are delegated to internal mutations/queries in
// b2cCoachingCalls.ts (non-node runtime).

// ==================== Constants ====================

const DAILY_API_BASE = "https://api.daily.co/v1";
const FETCH_TIMEOUT_MS = 15_000;
const MAX_PARTICIPANTS = 50;
// Token validity window — we don't want super-long tokens leaking, but it
// needs to exceed any realistic call length. 4 hours from join time is plenty.
const TOKEN_EXP_SECONDS = 4 * 60 * 60;

// ==================== Helpers ====================

function readDailyEnv(): { apiKey: string } {
  const apiKey = process.env.DAILY_CO_COACHING_API_KEY;
  if (!apiKey) {
    throw new Error(
      "DAILY_CO_COACHING_API_KEY env var is not set in Convex. " +
      "Run: npx convex env set DAILY_CO_COACHING_API_KEY '<key>' --prod"
    );
  }
  return { apiKey };
}

async function dailyFetch(
  path: string,
  init: { method: "POST" | "GET" | "DELETE"; body?: unknown; apiKey: string }
): Promise<{ ok: boolean; status: number; data: unknown; error?: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(`${DAILY_API_BASE}${path}`, {
      method: init.method,
      headers: {
        Authorization: `Bearer ${init.apiKey}`,
        "Content-Type": "application/json",
      },
      body: init.body ? JSON.stringify(init.body) : undefined,
      signal: controller.signal,
    });
    let data: unknown = null;
    try { data = await res.json(); } catch { /* non-JSON ok */ }
    return { ok: res.ok, status: res.status, data };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      data: null,
      error: err instanceof Error ? err.message : "fetch failed",
    };
  } finally {
    clearTimeout(timer);
  }
}

async function createDailyRoom(
  apiKey: string,
  roomName: string,
  scheduledStartTime: number,
  scheduledDurationMin: number
): Promise<{ url: string; name: string }> {
  // Reasonable room expiration: scheduled end + 4h buffer. Daily auto-cleans
  // expired rooms, so we don't need to explicitly delete them.
  const expSec = Math.floor(
    (scheduledStartTime + scheduledDurationMin * 60_000 + 4 * 60 * 60_000) / 1000
  );
  const body = {
    name: roomName,
    privacy: "public" as const,
    properties: {
      max_participants: MAX_PARTICIPANTS,
      enable_chat: true,
      enable_screenshare: true,
      enable_knocking: false,
      enable_prejoin_ui: true,
      start_video_off: false,
      start_audio_off: false,
      // Enable Daily cloud recording from the start
      enable_recording: "cloud",
      exp: expSec,
    },
  };
  const res = await dailyFetch("/rooms", { method: "POST", body, apiKey });
  if (res.ok) {
    const data = res.data as { url: string; name: string };
    return { url: data.url, name: data.name };
  }
  // 409 = room already exists — fetch it
  if (res.status === 409) {
    const existing = await dailyFetch(`/rooms/${roomName}`, { method: "GET", apiKey });
    if (existing.ok) {
      const data = existing.data as { url: string; name: string };
      return { url: data.url, name: data.name };
    }
  }
  throw new Error(
    `Daily.co room creation failed (status ${res.status}): ${
      res.error ?? JSON.stringify(res.data)?.slice(0, 200) ?? ""
    }`
  );
}

async function mintMeetingToken(
  apiKey: string,
  roomName: string,
  userName: string,
  isOwner: boolean
): Promise<string> {
  const body = {
    properties: {
      room_name: roomName,
      user_name: userName,
      is_owner: isOwner,
      exp: Math.floor(Date.now() / 1000) + TOKEN_EXP_SECONDS,
      // NOTE: we used to try passing user_data here for profile-photo sharing,
      // but Daily's token API rejects that property. The correct pattern is
      // for the client to call daily.setUserData({...}) after joining; other
      // participants then see it via participant.userData. We return the
      // photoUrl in the action response so the client can set it.
    },
  };
  const res = await dailyFetch("/meeting-tokens", { method: "POST", body, apiKey });
  if (!res.ok) {
    throw new Error(
      `Daily.co token mint failed (status ${res.status}): ${
        res.error ?? JSON.stringify(res.data)?.slice(0, 200) ?? ""
      }`
    );
  }
  return (res.data as { token: string }).token;
}

// ==================== Public actions ====================

// Coach starts the call. Creates the Daily room on first call (idempotent via
// 409 handling), marks the call live, returns the owner token + room URL.
export const startCoachingCall = action({
  args: {
    callId: v.id("b2cCoachingCalls"),
    coachUserId: v.id("b2cUsers"),
  },
  handler: async (ctx, args): Promise<{ roomUrl: string; token: string; selfPhotoUrl: string | null }> => {
    const env = readDailyEnv();
    const call = await ctx.runQuery(api.b2cCoachingCalls.getCoachingCall, {
      callId: args.callId,
    });
    if (!call) throw new Error("Call not found");
    if (call.coachUserId !== args.coachUserId) {
      throw new Error("Only the scheduled coach can start this call");
    }
    if (call.status === "cancelled") {
      throw new Error("This call was cancelled");
    }
    if (call.status === "ended") {
      throw new Error("This call has already ended");
    }

    // Create (or fetch) the Daily room
    const room = await createDailyRoom(
      env.apiKey,
      call.dailyRoomName,
      call.scheduledStartTime,
      call.scheduledDurationMin
    );

    // Fetch the coach's profile metadata — name goes into the token, photoUrl
    // is returned to the client so it can call daily.setUserData({...}) post-join
    // (which is how Daily broadcasts per-participant metadata to others).
    const meta = await ctx.runQuery(
      internal.b2cCoachingCalls._getUserDailyMetadata,
      { userId: args.coachUserId }
    );
    const token = await mintMeetingToken(env.apiKey, room.name, meta.name, true);

    // Patch the call row to reflect live + room URL
    await ctx.runMutation(internal.b2cCoachingCalls._patchCallLive, {
      callId: args.callId,
      dailyRoomUrl: room.url,
    });
    // Record coach attendance
    await ctx.runMutation(internal.b2cCoachingCalls._recordAttendance, {
      callId: args.callId,
      userId: args.coachUserId,
      role: "coach",
    });

    return { roomUrl: room.url, token, selfPhotoUrl: meta.photoUrl };
  },
});

// Attendee joins the call. Requires active B2C subscription and call status "live".
// Mints a not-owner token so Daily enforces host-only controls for the coach.
export const joinCoachingCall = action({
  args: {
    callId: v.id("b2cCoachingCalls"),
    userId: v.id("b2cUsers"),
  },
  handler: async (ctx, args): Promise<{ roomUrl: string; token: string; selfPhotoUrl: string | null }> => {
    const env = readDailyEnv();
    const call = await ctx.runQuery(api.b2cCoachingCalls.getCoachingCall, {
      callId: args.callId,
    });
    if (!call) throw new Error("Call not found");
    if (call.status !== "live") {
      throw new Error("This call is not currently live");
    }
    if (!call.dailyRoomUrl) {
      throw new Error("Room is not ready yet — please try again in a moment");
    }

    // Check subscription gate
    const user = await ctx.runQuery(internal.b2cCoachingCalls._getUserForJoin, {
      userId: args.userId,
    });
    if (!user) throw new Error("User not found");
    if (user.subscriptionStatus !== "active") {
      throw new Error("Active subscription required to join coaching calls");
    }

    // Block previously-kicked users from rejoining
    const latestAttendance = await ctx.runQuery(
      internal.b2cCoachingCalls._getLatestAttendanceForUser,
      { callId: args.callId, userId: args.userId }
    );
    if (latestAttendance?.kicked) {
      throw new Error("You were removed from this call and cannot rejoin");
    }

    // Fetch attendee's profile metadata — photoUrl is returned to the client
    // so it can call daily.setUserData({...}) after joining (Daily broadcasts
    // that to every other participant via participant.userData).
    const meta = await ctx.runQuery(
      internal.b2cCoachingCalls._getUserDailyMetadata,
      { userId: args.userId }
    );
    const token = await mintMeetingToken(
      env.apiKey,
      call.dailyRoomName,
      meta.name || user.name || "Attendee",
      false
    );

    await ctx.runMutation(internal.b2cCoachingCalls._recordAttendance, {
      callId: args.callId,
      userId: args.userId,
      role: "attendee",
    });

    return { roomUrl: call.dailyRoomUrl, token, selfPhotoUrl: meta.photoUrl };
  },
});

// Coach ends the call. Stops recording, transitions status, schedules recording
// URL poll.
export const endCoachingCall = action({
  args: {
    callId: v.id("b2cCoachingCalls"),
    coachUserId: v.id("b2cUsers"),
  },
  handler: async (ctx, args): Promise<{ success: boolean }> => {
    const env = readDailyEnv();
    const call = await ctx.runQuery(api.b2cCoachingCalls.getCoachingCall, {
      callId: args.callId,
    });
    if (!call) throw new Error("Call not found");
    if (call.coachUserId !== args.coachUserId) {
      throw new Error("Only the coach can end this call");
    }
    if (call.status !== "live") {
      throw new Error("Only live calls can be ended");
    }

    // Tell Daily to stop all recordings on the room (best-effort; Daily may
    // auto-stop when the room empties too).
    await dailyFetch(`/rooms/${call.dailyRoomName}/recordings/stop`, {
      method: "POST",
      apiKey: env.apiKey,
    });

    await ctx.runMutation(internal.b2cCoachingCalls._patchCallEnded, {
      callId: args.callId,
    });

    // Schedule the recording-URL fetch — Daily needs time to process
    await ctx.scheduler.runAfter(
      2 * 60_000, // first attempt in 2 minutes
      api.b2cCoachingCallsDaily.fetchRecordingUrl,
      { callId: args.callId, attempt: 1 }
    );

    return { success: true };
  },
});

// Coach kicks a user from the live call. Uses Daily's eject API.
export const kickFromCoachingCall = action({
  args: {
    callId: v.id("b2cCoachingCalls"),
    coachUserId: v.id("b2cUsers"),
    targetUserId: v.id("b2cUsers"),
    targetSessionId: v.string(),
  },
  handler: async (ctx, args): Promise<{ success: boolean }> => {
    const env = readDailyEnv();
    const call = await ctx.runQuery(api.b2cCoachingCalls.getCoachingCall, {
      callId: args.callId,
    });
    if (!call) throw new Error("Call not found");
    if (call.coachUserId !== args.coachUserId) {
      throw new Error("Only the coach can kick participants");
    }
    if (call.status !== "live") {
      throw new Error("Can only kick during a live call");
    }

    // Daily eject endpoint takes a list of session IDs
    const res = await dailyFetch(
      `/rooms/${call.dailyRoomName}/eject`,
      {
        method: "POST",
        body: { ids: [args.targetSessionId] },
        apiKey: env.apiKey,
      }
    );
    if (!res.ok) {
      throw new Error(
        `Failed to eject participant (status ${res.status}): ${
          res.error ?? ""
        }`
      );
    }

    await ctx.runMutation(internal.b2cCoachingCalls._markAttendanceKicked, {
      callId: args.callId,
      userId: args.targetUserId,
    });

    return { success: true };
  },
});

// Debug helper — lists recent Daily recordings (all of them) so we can see
// what state the recording is in. Founder-only-ish (we don't enforce here
// since it's called via CLI not HTTP).
export const debugListRecordings = action({
  args: { roomName: v.optional(v.string()) },
  handler: async (_ctx, args): Promise<unknown> => {
    const env = readDailyEnv();
    const path = args.roomName
      ? `/recordings?room_name=${encodeURIComponent(args.roomName)}&limit=20`
      : `/recordings?limit=20`;
    const res = await dailyFetch(path, { method: "GET", apiKey: env.apiKey });
    return { ok: res.ok, status: res.status, data: res.data };
  },
});

// Coach or founder removes the recording. Clears our URL + marks status as
// "deleted" so the replay button hides everywhere, AND best-effort asks Daily
// to purge the underlying recording file (GDPR-friendly — the bits go away,
// not just our pointer to them).
export const deleteCoachingCallRecording = action({
  args: {
    callId: v.id("b2cCoachingCalls"),
    callerId: v.id("b2cUsers"),
  },
  handler: async (ctx, args): Promise<{ success: boolean }> => {
    const env = readDailyEnv();
    const call = await ctx.runQuery(api.b2cCoachingCalls.getCoachingCall, {
      callId: args.callId,
    });
    if (!call) throw new Error("Call not found");

    // Permission: either the coach who hosted, or a founder/admin
    const caller = await ctx.runQuery(internal.b2cCoachingCalls._getUserForJoin, {
      userId: args.callerId,
    });
    const callerBadges = (caller as { badges?: string[] } | null)?.badges ?? [];
    const isOwner = call.coachUserId === args.callerId;
    const isFounderOrAdmin = callerBadges.includes("founder") || callerBadges.includes("admin");
    if (!isOwner && !isFounderOrAdmin) {
      throw new Error("Only the coach who hosted this call or a founder can delete the recording");
    }

    // Best-effort: ask Daily to delete the recording. We don't hard-fail on
    // error — the point of the action from the user's POV is that the recording
    // is gone from their library. Our DB is the source of truth for what's
    // visible; if Daily still has the file, a later cron can retry.
    try {
      const list = await dailyFetch(
        `/recordings?room_name=${encodeURIComponent(call.dailyRoomName)}&limit=5`,
        { method: "GET", apiKey: env.apiKey }
      );
      if (list.ok) {
        const payload = list.data as { data?: Array<{ id: string }> };
        for (const rec of payload.data ?? []) {
          await dailyFetch(`/recordings/${rec.id}`, {
            method: "DELETE",
            apiKey: env.apiKey,
          });
        }
      }
    } catch {
      // Swallow — DB update below is the user-visible effect
    }

    await ctx.runMutation(internal.b2cCoachingCalls._patchCallRecording, {
      callId: args.callId,
      recordingUrl: undefined,
      recordingStatus: "deleted",
    });

    return { success: true };
  },
});

// Internal: poll Daily for the processed recording URL and persist it.
// Self-rescheduling until the URL is available or we hit max attempts.
export const fetchRecordingUrl = action({
  args: {
    callId: v.id("b2cCoachingCalls"),
    attempt: v.number(),
  },
  handler: async (ctx, args) => {
    const MAX_ATTEMPTS = 15; // 15 attempts × 2 min = 30 min window
    const env = readDailyEnv();
    const call = await ctx.runQuery(api.b2cCoachingCalls.getCoachingCall, {
      callId: args.callId,
    });
    if (!call) return { done: true };

    // Query Daily's recordings endpoint filtered by room
    const res = await dailyFetch(
      `/recordings?room_name=${encodeURIComponent(call.dailyRoomName)}&limit=1`,
      { method: "GET", apiKey: env.apiKey }
    );
    if (res.ok) {
      const payload = res.data as {
        data?: Array<{ id: string; status: string; duration?: number }>;
      };
      const recording = payload.data?.[0];
      if (recording?.status === "finished") {
        // Fetch the signed download link
        const linkRes = await dailyFetch(
          `/recordings/${recording.id}/access-link`,
          { method: "GET", apiKey: env.apiKey }
        );
        if (linkRes.ok) {
          const linkData = linkRes.data as { download_link?: string };
          if (linkData.download_link) {
            await ctx.runMutation(internal.b2cCoachingCalls._patchCallRecording, {
              callId: args.callId,
              recordingUrl: linkData.download_link,
              recordingStatus: "ready",
            });
            return { done: true };
          }
        }
      }
    }

    if (args.attempt >= MAX_ATTEMPTS) {
      await ctx.runMutation(internal.b2cCoachingCalls._patchCallRecording, {
        callId: args.callId,
        recordingUrl: undefined,
        recordingStatus: "failed",
      });
      return { done: true };
    }

    await ctx.scheduler.runAfter(
      2 * 60_000,
      api.b2cCoachingCallsDaily.fetchRecordingUrl,
      { callId: args.callId, attempt: args.attempt + 1 }
    );
    return { done: false };
  },
});
