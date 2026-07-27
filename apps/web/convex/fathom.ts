// ============================================================================
// Fathom ingest.
//
// A second way for a call to reach Sequ3nce, alongside the meeting bot. Built
// as a parallel route rather than a branch inside the bot's path — a bug here
// must not be able to stop recording for everyone using the bot.
//
// Fathom hosts the media and only ever gives us a link to their player, so
// there is no recording file to store. What we take is the transcript, the
// summary, who recorded it, and who else was on it.
// ============================================================================

import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { upsertCallContentTx } from "./callContent";
import { classifyMeeting } from "./fathomClassify";

/** Shape of what Fathom sends us, narrowed to what we actually use. */
export interface FathomMeeting {
  recording_id: number | string;
  title?: string;
  meeting_title?: string | null;
  share_url?: string;
  recording_start_time?: string;
  recording_end_time?: string;
  created_at?: string;
  recorded_by?: { email?: string; name?: string };
  calendar_invitees?: Array<{ email?: string; name?: string; is_external?: boolean }>;
  transcript?: Array<{
    speaker?: { display_name?: string; matched_calendar_invitee_email?: string | null };
    text?: string;
    timestamp?: string;
  }> | null;
  default_summary?: unknown;
}

/** Fathom's timestamps are ISO strings; everything here works in epoch ms. */
function ms(iso?: string): number | undefined {
  if (!iso) return undefined;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : undefined;
}

/**
 * Flatten Fathom's transcript into the plain text our AI functions expect.
 *
 * All three of them take a string, so a Fathom transcript feeds the existing
 * summary and analysis pipeline with no changes at all.
 */
function transcriptToText(t: FathomMeeting["transcript"]): string | undefined {
  if (!t?.length) return undefined;
  return t
    .map((seg) => {
      const who = seg.speaker?.display_name?.trim();
      const text = (seg.text ?? "").trim();
      if (!text) return "";
      return who ? `${who}: ${text}` : text;
    })
    .filter(Boolean)
    .join("\n");
}

/**
 * Which closer recorded this?
 *
 * Fathom tells us the email on the recorder's Fathom account. That is often
 * NOT their work email — a personal Google account is common — so closers tell
 * us their Fathom address once and we match on that first, falling back to
 * their normal email.
 */
export const findCloserByFathomEmail = internalQuery({
  args: { teamId: v.id("teams"), email: v.string() },
  handler: async (ctx, args) => {
    const email = args.email.trim().toLowerCase();
    const roster = await ctx.db
      .query("closers")
      .withIndex("by_team", (q) => q.eq("teamId", args.teamId))
      .collect();

    const byFathom = roster.find(
      (c) => (c.fathomEmail ?? "").trim().toLowerCase() === email,
    );
    if (byFathom) return { closerId: byFathom._id, matchedOn: "fathomEmail" };

    const byEmail = roster.find(
      (c) => (c.email ?? "").trim().toLowerCase() === email,
    );
    if (byEmail) return { closerId: byEmail._id, matchedOn: "email" };

    return null;
  },
});

/**
 * Turn one Fathom meeting into a call.
 *
 * Idempotent on Fathom's recording id: a replayed webhook, or the
 * reconciliation sweep finding something the webhook already delivered, must
 * update the existing call rather than create a second one.
 */
export const ingestMeeting = internalMutation({
  args: {
    teamId: v.id("teams"),
    meeting: v.any(),
  },
  handler: async (ctx, args): Promise<{
    status: "created" | "updated" | "skipped";
    callId?: Id<"calls">;
    reason?: string;
  }> => {
    const m = args.meeting as FathomMeeting;
    const recordingId = String(m.recording_id ?? "").trim();
    if (!recordingId) return { status: "skipped", reason: "no recording id" };

    const recorderEmail = (m.recorded_by?.email ?? "").trim().toLowerCase();
    if (!recorderEmail) {
      return { status: "skipped", reason: "no recorder email" };
    }

    // Whose call is this?
    const roster = await ctx.db
      .query("closers")
      .withIndex("by_team", (q) => q.eq("teamId", args.teamId))
      .collect();
    const closer =
      roster.find(
        (c) => (c.fathomEmail ?? "").trim().toLowerCase() === recorderEmail,
      ) ??
      roster.find((c) => (c.email ?? "").trim().toLowerCase() === recorderEmail);

    if (!closer) {
      // Do NOT drop it. A call vanishing because we couldn't name the owner is
      // how a manager ends up with a board quietly missing a person. Recorded
      // as skipped with the email attached so it can be mapped by hand.
      console.warn(
        `[fathom] no closer on team ${args.teamId} matches ${recorderEmail} — ` +
          `recording ${recordingId} not ingested, needs manual mapping`,
      );
      return { status: "skipped", reason: `unmatched recorder: ${recorderEmail}` };
    }

    // Sales call or team meeting?
    const teamEmails = new Set<string>();
    for (const c of roster) {
      if (c.email) teamEmails.add(c.email.toLowerCase());
      if (c.fathomEmail) teamEmails.add(c.fathomEmail.toLowerCase());
    }
    const verdict = classifyMeeting({
      inviteeEmails: (m.calendar_invitees ?? [])
        .map((i) => i.email ?? "")
        .filter(Boolean),
      recorderEmail,
      teamEmails,
    });

    const startedAt = ms(m.recording_start_time) ?? ms(m.created_at) ?? Date.now();
    const endedAt = ms(m.recording_end_time);
    const duration = endedAt ? Math.max(0, Math.round((endedAt - startedAt) / 1000)) : undefined;

    // The prospect is whoever isn't a colleague. Best effort — a call with no
    // identifiable outsider keeps the meeting title instead of inventing a name.
    const outsider = (m.calendar_invitees ?? []).find(
      (i) =>
        i.email &&
        i.email.toLowerCase() !== recorderEmail &&
        !teamEmails.has(i.email.toLowerCase()),
    );
    const prospectName =
      outsider?.name?.trim() ||
      outsider?.email?.trim() ||
      m.meeting_title?.trim() ||
      m.title?.trim() ||
      undefined;

    const existing = await ctx.db
      .query("calls")
      .withIndex("by_external_recording", (q) =>
        q.eq("externalRecordingId", recordingId),
      )
      .first();

    const fields = {
      prospectName,
      startedAt,
      endedAt,
      duration,
      externalShareUrl: m.share_url,
      // Only ever set automatically. A closer's own correction wins and is
      // never overwritten by a later sync — see the guard below.
      classifiedAs: verdict.classification,
      classifiedBy: "auto",
      countsTowardStats: verdict.countsTowardStats,
    };

    let callId: Id<"calls">;
    let status: "created" | "updated";

    if (existing) {
      // Never undo a closer's decision. If they told us this was a sales call,
      // a re-sync must not silently flip it back.
      const keepTheirCall = existing.classifiedBy === "closer";
      await ctx.db.patch(existing._id, {
        ...fields,
        ...(keepTheirCall
          ? {
              classifiedAs: existing.classifiedAs,
              classifiedBy: existing.classifiedBy,
              countsTowardStats: existing.countsTowardStats,
            }
          : {}),
      });
      callId = existing._id;
      status = "updated";
    } else {
      // No `as never` here on purpose. The cast that used to be here hid a
      // real mistake: closerSpeaker and confirmed are nested inside
      // speakerMapping, not top-level, and the schema rejected the insert at
      // runtime instead of the type checker catching it.
      callId = await ctx.db.insert("calls", {
        closerId: closer._id,
        teamId: args.teamId,
        status: "completed",
        speakerCount: (m.calendar_invitees ?? []).length || 2,
        createdAt: startedAt,
        source: "fathom",
        externalRecordingId: recordingId,
        // Fathom hosts the media, so there is no file — only their player.
        recordingType: "video",
        ...fields,
      });
      status = "created";
    }

    // Transcript and summary go to the sibling table, never onto the call row —
    // that split exists because heavy blobs on `calls` blew Convex's read limit.
    const text = transcriptToText(m.transcript);
    if (text) {
      await upsertCallContentTx(ctx, {
        callId,
        teamId: args.teamId,
        transcriptText: text,
      });
      // Same pipeline the bot uses. Only for calls that count — running AI
      // over a team standup costs money and tells nobody anything.
      if (verdict.countsTowardStats && status === "created") {
        await ctx.scheduler.runAfter(0, internal.ai.generateCallSummary, {
          callId,
          transcript: text,
          ...(prospectName ? { prospectName } : {}),
        });
      }
    }

    return { status, callId };
  },
});
