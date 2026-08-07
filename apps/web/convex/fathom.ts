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

/** Fathom marks each transcript line "HH:MM:SS" from the start of the call. */
function hmsToSeconds(hms?: string): number | undefined {
  if (!hms) return undefined;
  const parts = hms.split(":").map((n) => Number(n));
  if (parts.some((n) => !Number.isFinite(n))) return undefined;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return undefined;
}

/** Nothing anyone would call a sales call runs longer than this. */
const MAX_CREDIBLE_CALL_SECONDS = 12 * 60 * 60;

/**
 * How long was the call, really?
 *
 * Fathom's own sample recording claims it started in 2021 and ended in 2025,
 * which rendered as "1749665m 44s" on the call. Third-party timestamps are not
 * trustworthy, so an implausible span is discarded rather than stored, and we
 * fall back to where the transcript actually stops — which is derived from the
 * content itself and can't be off by years.
 */
function credibleDuration(
  startedAt: number,
  endedAt: number | undefined,
  transcript: FathomMeeting["transcript"],
): number | undefined {
  if (endedAt) {
    const span = Math.round((endedAt - startedAt) / 1000);
    if (span > 0 && span <= MAX_CREDIBLE_CALL_SECONDS) return span;
  }
  // Last line's offset from the start. Good to the second, and immune to a
  // wrong end timestamp.
  for (let i = (transcript?.length ?? 0) - 1; i >= 0; i--) {
    const secs = hmsToSeconds(transcript?.[i]?.timestamp);
    if (secs !== undefined && secs > 0 && secs <= MAX_CREDIBLE_CALL_SECONDS) {
      return secs;
    }
  }
  return undefined;
}

interface Turn {
  speaker: string;
  text: string;
  timestamp: number;
}

/**
 * Collapse Fathom's transcript into turns.
 *
 * Fathom emits roughly one sentence per segment, each tagged with the speaker,
 * so joining them naively produces "Richard White: All right. Richard White:
 * Hello. Richard White: And welcome to Fathom." — unreadable, and it wastes
 * tokens when the text goes to the AI. Consecutive lines from the same person
 * are one turn.
 */
function toTurns(t: FathomMeeting["transcript"]): Turn[] {
  const turns: Turn[] = [];
  for (const seg of t ?? []) {
    const text = (seg.text ?? "").trim();
    if (!text) continue;
    const who = seg.speaker?.display_name?.trim() || "Unknown";
    const at = hmsToSeconds(seg.timestamp) ?? 0;
    const last = turns[turns.length - 1];
    if (last && last.speaker === who) {
      last.text += ` ${text}`;
    } else {
      turns.push({ speaker: who, text, timestamp: at });
    }
  }
  return turns;
}

/**
 * Flatten to the plain text our AI functions expect.
 *
 * All three take a string, so a Fathom transcript feeds the existing summary
 * and analysis pipeline with no changes at all.
 */
function turnsToText(turns: Turn[]): string | undefined {
  if (!turns.length) return undefined;
  return turns.map((t) => `${t.speaker}: ${t.text}`).join("\n\n");
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
        await ctx.scheduler.runAfter(0, internal.ai.generateCallAnalysis, {
          callId: args.callId,
          transcript: content.transcriptText,
          ...(call.prospectName ? { prospectName: call.prospectName } : {}),
          ...(call.duration !== undefined ? { duration: call.duration } : {}),
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
    const rawEndedAt = ms(m.recording_end_time);
    const duration = credibleDuration(startedAt, rawEndedAt, m.transcript);
    // Keep the end time only if it agrees with the duration we trust, so the
    // two can't tell a viewer different stories.
    const endedAt =
      duration !== undefined ? startedAt + duration * 1000 : undefined;

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

    // Is a calendar placeholder already standing in for this meeting?
    //
    // A team that upgrades from Overview to Oversight has both: calendar
    // bookings turned into calls under the old plan, and now Fathom recordings
    // of the same meetings. Inserting alongside would double every call in the
    // changeover window — the calendar call knows only that a meeting was
    // booked, the Fathom one has the transcript, and they are the same call.
    //
    // So take the placeholder over rather than skipping or duplicating. Any
    // outcome the closer already filled in survives, because we patch the row
    // they answered instead of abandoning it for a fresh one.
    let placeholder = null;
    if (!existing) {
      const nearby = await ctx.db
        .query("calls")
        .withIndex("by_team_and_date", (q) =>
          q
            .eq("teamId", args.teamId)
            .gte("createdAt", startedAt - 15 * 60 * 1000)
            .lte("createdAt", startedAt + 15 * 60 * 1000),
        )
        .take(50);
      placeholder =
        nearby.find(
          (c) =>
            c.source === "calendar" &&
            String(c.closerId) === String(closer._id) &&
            !c.externalRecordingId,
        ) ?? null;
    }

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

    const target = existing ?? placeholder;
    if (target) {
      // Never undo a closer's decision. If they told us this was a sales call,
      // a re-sync must not silently flip it back.
      const keepTheirCall = target.classifiedBy === "closer";
      await ctx.db.patch(target._id, {
        ...fields,
        // Absorbing a calendar placeholder: it becomes the Fathom call, and
        // stops being something the booking job would recreate.
        ...(placeholder
          ? { source: "fathom", externalRecordingId: recordingId }
          : {}),
        ...(keepTheirCall
          ? {
              classifiedAs: target.classifiedAs,
              classifiedBy: target.classifiedBy,
              countsTowardStats: target.countsTowardStats,
              // Derived from their decision, never copied from the stored
              // status. Copying it let the two drift: a call the closer had
              // marked internal kept an old "completed" status and went on
              // being counted, and every later sync preserved the mistake.
              // Deriving it here means any such row self-heals on next sync.
              status: target.countsTowardStats ? "completed" : "unclassified",
            }
          : {}),
      });
      callId = target._id;
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
    const turns = toTurns(m.transcript);
    const text = turnsToText(turns);
    if (text) {
      await upsertCallContentTx(ctx, {
        callId,
        teamId: args.teamId,
        transcriptText: text,
      });

      // Write the segments too. Without them the transcript tab has nothing to
      // render and falls back to the 500-character preview meant for list rows,
      // which is why a full hour of conversation showed as three lines and
      // stopped mid-sentence.
      //
      // Speaker is "closer" or "prospect" here, not a name — that is what the
      // rest of the app expects, and the recorder is by definition the closer.
      const recorderName = (m.recorded_by?.name ?? "").trim().toLowerCase();
      const existingSegments = await ctx.db
        .query("transcriptSegments")
        .withIndex("by_call", (q) => q.eq("callId", callId))
        .collect();
      // Replace rather than append. A re-sync must not double the transcript.
      for (const seg of existingSegments) await ctx.db.delete(seg._id);

      // Bounded. A very long call could otherwise push a single transaction
      // toward Convex's document limit, and nobody reads 5,000 turns.
      for (const turn of turns.slice(0, 3000)) {
        await ctx.db.insert("transcriptSegments", {
          callId,
          teamId: args.teamId,
          speaker:
            turn.speaker.trim().toLowerCase() === recorderName
              ? "closer"
              : "prospect",
          text: turn.text,
          timestamp: turn.timestamp,
          createdAt: Date.now(),
        });
      }

      // Same pipeline the bot uses.
      //
      // Gated on "not a team meeting" rather than "counts toward stats". Those
      // are different questions, and using the wrong one meant nothing was
      // ever analysed: a call we're unsure about doesn't count, so it got no
      // analysis, so the tab was empty on almost every call. An unsure call is
      // usually a real sales call we simply couldn't verify, and it needs the
      // analysis ready for the moment someone confirms it.
      //
      // Keyed on the work being missing rather than on the call being new, so
      // a call that was ingested before this pipeline existed — or whose
      // analysis failed — picks it up on the next sync instead of staying
      // permanently blank.
      const existingContent = await ctx.db
        .query("callContent")
        .withIndex("by_call", (q) => q.eq("callId", callId))
        .first();
      const worthAnalysing = verdict.classification !== "internal";
      const needsSummary = worthAnalysing && !existingContent?.summary;
      const needsAnalysis = worthAnalysing && !existingContent?.callAnalysis;

      if (needsSummary) {
        await ctx.scheduler.runAfter(0, internal.ai.generateCallSummary, {
          callId,
          transcript: text,
          ...(prospectName ? { prospectName } : {}),
        });
      }
      // The deep analysis — chapters and the five scores. Scheduled separately
      // from the summary so one failing doesn't cost us the other.
      if (needsAnalysis) {
        await ctx.scheduler.runAfter(0, internal.ai.generateCallAnalysis, {
          callId,
          transcript: text,
          ...(prospectName ? { prospectName } : {}),
          ...(duration !== undefined ? { duration } : {}),
        });
      }
    }

    return { status, callId };
  },
});

/**
 * Fathom calls whose transcript, summary or analysis never arrived.
 *
 * The ingest already claims to be self-healing: it queues whichever of these is
 * missing on every sync, "so a call whose analysis failed picks it up on the
 * next sync instead of staying permanently blank." For an existing call there
 * is no next sync. The poller skips any recording id it already knows, and the
 * daily reconcile only re-ingests the last three days — so anything that fails
 * and then ages out is blank forever, with no error anywhere.
 *
 * Found on CreateFreedom: a call with a transcript and a summary but no
 * analysis, five days old and past the reconcile window.
 */
export const listCallsNeedingAiWork = internalQuery({
  args: { teamId: v.id("teams"), limit: v.optional(v.number()) },
  handler: async (
    ctx,
    args,
  ): Promise<
    Array<{
      callId: Id<"calls">;
      recordingId: string;
      needsTranscript: boolean;
      needsSummary: boolean;
      needsAnalysis: boolean;
    }>
  > => {
    const calls = await ctx.db
      .query("calls")
      .withIndex("by_team", (q) => q.eq("teamId", args.teamId))
      .order("desc")
      .take(500);

    const out = [];
    for (const call of calls) {
      if (call.source !== "fathom") continue;
      if (!call.externalRecordingId) continue;
      // A team meeting is not worth a rate-limited request or an AI bill.
      if (call.classifiedAs === "internal") continue;

      const content = await ctx.db
        .query("callContent")
        .withIndex("by_call", (q) => q.eq("callId", call._id))
        .first();

      const needsTranscript = !content?.transcriptText;
      const needsSummary = !content?.summary;
      const needsAnalysis = !content?.callAnalysis;
      if (!needsTranscript && !needsSummary && !needsAnalysis) continue;

      out.push({
        callId: call._id,
        recordingId: call.externalRecordingId,
        needsTranscript,
        needsSummary,
        needsAnalysis,
      });
      if (out.length >= (args.limit ?? 25)) break;
    }
    return out;
  },
});

/**
 * Queue the AI work for a call that already has its transcript.
 *
 * Separate from the transcript repair because it costs nothing at Fathom —
 * there is no reason to spend a rate-limited request re-fetching a transcript
 * we already hold just because an analysis failed.
 */
export const queueMissingAiWork = internalMutation({
  args: { callId: v.id("calls"), teamId: v.id("teams") },
  handler: async (
    ctx,
    args,
  ): Promise<{ queuedSummary: boolean; queuedAnalysis: boolean }> => {
    const call = await ctx.db.get(args.callId);
    if (!call || String(call.teamId) !== String(args.teamId)) {
      return { queuedSummary: false, queuedAnalysis: false };
    }
    if (call.classifiedAs === "internal") {
      return { queuedSummary: false, queuedAnalysis: false };
    }

    const content = await ctx.db
      .query("callContent")
      .withIndex("by_call", (q) => q.eq("callId", args.callId))
      .first();
    const text = content?.transcriptText;
    if (!text) return { queuedSummary: false, queuedAnalysis: false };

    const queuedSummary = !content?.summary;
    const queuedAnalysis = !content?.callAnalysis;

    if (queuedSummary) {
      await ctx.scheduler.runAfter(0, internal.ai.generateCallSummary, {
        callId: args.callId,
        transcript: text,
        ...(call.prospectName ? { prospectName: call.prospectName } : {}),
      });
    }
    if (queuedAnalysis) {
      await ctx.scheduler.runAfter(0, internal.ai.generateCallAnalysis, {
        callId: args.callId,
        transcript: text,
        ...(call.prospectName ? { prospectName: call.prospectName } : {}),
        ...(call.duration !== undefined ? { duration: call.duration } : {}),
      });
    }

    return { queuedSummary, queuedAnalysis };
  },
});

/**
 * Fill in a transcript for a call that already exists.
 *
 * Deliberately narrow. It writes the transcript, its segments, and queues the
 * summary and analysis — and touches nothing else. Re-running the normal
 * ingest would also recompute classification and counts, which on a call a
 * closer has already answered means quietly moving numbers to fix a blank tab.
 */
export const storeTranscriptForCall = internalMutation({
  args: {
    callId: v.id("calls"),
    teamId: v.id("teams"),
    transcript: v.any(),
    recorderName: v.optional(v.string()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ stored: boolean; turns: number }> => {
    const call = await ctx.db.get(args.callId);
    if (!call) return { stored: false, turns: 0 };
    if (String(call.teamId) !== String(args.teamId)) {
      return { stored: false, turns: 0 };
    }

    const turns = toTurns(args.transcript as FathomMeeting["transcript"]);
    const text = turnsToText(turns);
    if (!text) return { stored: false, turns: 0 };

    await upsertCallContentTx(ctx, {
      callId: args.callId,
      teamId: args.teamId,
      transcriptText: text,
    });

    // Replace rather than append, so a repeated repair can't double a
    // transcript that partially landed.
    const existingSegments = await ctx.db
      .query("transcriptSegments")
      .withIndex("by_call", (q) => q.eq("callId", args.callId))
      .collect();
    for (const seg of existingSegments) await ctx.db.delete(seg._id);

    const recorder = (args.recorderName ?? "").trim().toLowerCase();
    for (const turn of turns.slice(0, 3000)) {
      await ctx.db.insert("transcriptSegments", {
        callId: args.callId,
        teamId: args.teamId,
        speaker:
          recorder && turn.speaker.trim().toLowerCase() === recorder
            ? "closer"
            : "prospect",
        text: turn.text,
        timestamp: turn.timestamp,
        createdAt: Date.now(),
      });
    }

    // Same gate the ingest uses: worth analysing unless it's a team meeting,
    // and only if the work is actually missing.
    const content = await ctx.db
      .query("callContent")
      .withIndex("by_call", (q) => q.eq("callId", args.callId))
      .first();
    const worthAnalysing = call.classifiedAs !== "internal";

    if (worthAnalysing && !content?.summary) {
      await ctx.scheduler.runAfter(0, internal.ai.generateCallSummary, {
        callId: args.callId,
        transcript: text,
        ...(call.prospectName ? { prospectName: call.prospectName } : {}),
      });
    }
    if (worthAnalysing && !content?.callAnalysis) {
      await ctx.scheduler.runAfter(0, internal.ai.generateCallAnalysis, {
        callId: args.callId,
        transcript: text,
        ...(call.prospectName ? { prospectName: call.prospectName } : {}),
        ...(call.duration !== undefined ? { duration: call.duration } : {}),
      });
    }

    return { stored: true, turns: turns.length };
  },
});

/**
 * Which of these have we already got?
 *
 * Lets the poller ask one cheap question before deciding whether to spend a
 * rate-limited request on a transcript.
 */
export const whichExist = internalQuery({
  args: { recordingIds: v.array(v.string()) },
  handler: async (ctx, args): Promise<string[]> => {
    const found: string[] = [];
    for (const id of args.recordingIds) {
      const hit = await ctx.db
        .query("calls")
        .withIndex("by_external_recording", (q) =>
          q.eq("externalRecordingId", id),
        )
        .first();
      if (hit) found.push(id);
    }
    return found;
  },
});
