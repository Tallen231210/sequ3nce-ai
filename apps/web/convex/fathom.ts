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
 * The closer telling us we got it wrong.
 *
 * Their answer outranks ours permanently — `classifiedBy: "closer"` is the
 * flag that stops every later sync from flipping it back. That guard is in
 * ingestMeeting, and it is the whole reason this is safe to expose.
 *
 * Confirming a call also earns it an AI summary. We skip that at ingest for
 * anything we aren't sure about, because running analysis over a team standup
 * costs money and tells nobody anything — but once a human says it was a sales
 * call, it should get the same treatment as any other.
 */
export const reclassifyCall = internalMutation({
  args: {
    callId: v.id("calls"),
    closerId: v.id("closers"),
    isSalesCall: v.boolean(),
  },
  handler: async (ctx, args): Promise<{ success: boolean; error?: string }> => {
    const call = await ctx.db.get(args.callId);
    if (!call) return { success: false, error: "That call no longer exists." };

    // Yours to correct, not anyone's. A closer editing another closer's call
    // would let one person quietly move numbers on the team board.
    if (String(call.closerId) !== String(args.closerId)) {
      return { success: false, error: "That isn't your call." };
    }

    // Also checks the status agrees. Without that last clause a row whose
    // status had drifted from its classification would take this early exit
    // and never be repaired — the same drift that was letting a call marked
    // internal go on being counted.
    const alreadyRight =
      call.classifiedBy === "closer" &&
      call.countsTowardStats === args.isSalesCall &&
      call.status === (args.isSalesCall ? "completed" : "unclassified");
    if (alreadyRight) return { success: true };

    await ctx.db.patch(args.callId, {
      classifiedAs: args.isSalesCall ? "sales" : "internal",
      classifiedBy: "closer",
      countsTowardStats: args.isSalesCall,
      // The half that actually moves the numbers.
      status: args.isSalesCall ? "completed" : "unclassified",
    });

    // Only on the way up, and only once — a call flipped back and forth must
    // not queue a fresh summary every time.
    if (args.isSalesCall && !call.countsTowardStats) {
      const content = await ctx.db
        .query("callContent")
        .withIndex("by_call", (q) => q.eq("callId", args.callId))
        .first();
      if (content?.transcriptText) {
        await ctx.scheduler.runAfter(0, internal.ai.generateCallSummary, {
          callId: args.callId,
          transcript: content.transcriptText,
          ...(call.prospectName ? { prospectName: call.prospectName } : {}),
        });
      }
    }

    return { success: true };
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
    /** Pulled from history rather than arriving live. See `isHistorical`. */
    historical: v.optional(v.boolean()),
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
      await ctx.runMutation(internal.fathomConnections.noteUnmatchedRecorder, {
        teamId: args.teamId,
        email: recorderEmail,
      });
      return { status: "skipped", reason: `unmatched recorder: ${recorderEmail}` };
    }

    // Sales call or team meeting?
    const teamEmails = new Set<string>();
    for (const c of roster) {
      if (c.email) teamEmails.add(c.email.toLowerCase());
      if (c.fathomEmail) teamEmails.add(c.fathomEmail.toLowerCase());
    }
    const teamNames = new Set<string>();
    for (const c of roster) {
      if (c.name) teamNames.add(c.name);
    }
    // Who actually spoke. On impromptu meetings this is the ONLY record of who
    // was there — Fathom's invitee list names the account owner and nobody else.
    const speakerNames = Array.from(
      new Set(
        (m.transcript ?? [])
          .map((seg) => seg.speaker?.display_name?.trim() ?? "")
          .filter(Boolean),
      ),
    );

    const verdict = classifyMeeting({
      inviteeEmails: (m.calendar_invitees ?? [])
        .map((i) => i.email ?? "")
        .filter(Boolean),
      recorderEmail,
      recorderName: m.recorded_by?.name,
      teamEmails,
      teamNames,
      speakerNames,
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
      // This is what actually keeps a team standup out of someone's close rate.
      // Every stats query in the codebase already narrows to "completed" —
      // around twenty of them — so giving an unconfirmed call a different
      // status excludes it from all of them without editing a single one. The
      // call history query is widened separately so the closer still sees it.
      status:
        !args.historical && verdict.countsTowardStats
          ? "completed"
          : "unclassified",
      ...(args.historical ? { isHistorical: true } : {}),
      // Only ever set automatically. A closer's own correction wins and is
      // never overwritten by a later sync — see the guard below.
      classifiedAs: verdict.classification,
      classifiedBy: "auto",
      // A historical call never counts on arrival, however sure we are it was
      // a sales call — it has no outcome and no cash figure, and those only
      // come from the closer. It shows, it's searchable, the AI can read it;
      // it just doesn't move a number until someone says what happened.
      countsTowardStats: args.historical ? false : verdict.countsTowardStats,
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
              // Derived from their decision, never copied from the stored
              // status. Copying it let the two drift: a call the closer had
              // marked internal kept an old "completed" status and went on
              // being counted, and every later sync preserved the mistake.
              // Deriving it here means any such row self-heals on next sync.
              status: existing.countsTowardStats ? "completed" : "unclassified",
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
