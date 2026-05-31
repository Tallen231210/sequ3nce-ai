// ============================================================================
// Transcripts Roadmap Phase 2 + 3 — pre-call briefing for closers.
//
// Reverse direction of the setterCloserMatcher: given a closer's upcoming
// calendar event, find the matching setter lead by prospect email/phone and
// return the most-recent qualifying setterCallTranscripts row with
// transcriptionStatus="available" + aiSummary set. Both surfaces (web
// dashboard Schedule page + B2B Desktop Schedule modal) consume the same
// helper, with two auth-gated entry points:
//   1. Public clerkId-authenticated query for the web dashboard
//   2. Public closerEmail+teamId-authenticated query for the Desktop
//      HTTP-action wrapper (mirrors /getCloserEventsByEmail pattern)
//
// Reads are deliberately tiny (1 calendarEvent + by_team setterLeads collect
// + 1 setterCallTranscripts + 1 setterRep), well under 16 MiB. The
// by_team collect on setterLeads is the only sizable read (~2.3 MB on AICom)
// — acceptable because the query is lazy/per-event in both surfaces.
// ============================================================================

import { v } from "convex/values";
import { query, internalQuery } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { normalizeEmail, normalizePhone } from "./setterCloserMatcher";

type Reason =
  | "no_calendar_event"
  | "no_prospect_identity"
  | "no_matching_setter_lead"
  | "no_transcript_yet";

interface CloserBriefing {
  matchedSetterLead: {
    setterLeadId: Id<"setterLeads">;
    name?: string;
    email?: string;
    phone?: string;
    source?: string;
    tags: string[];
  } | null;
  transcript: {
    transcriptRowId: Id<"setterCallTranscripts">;
    occurredAt: number;
    direction: "outbound" | "inbound";
    durationSec?: number;
    aiSummary?: string;
    setterTalkTimeSec?: number;
    prospectTalkTimeSec?: number;
    setterSpeakerIndex?: 0 | 1;
    hasFullTranscript: boolean;
  } | null;
  setterName: string | null;
  reason?: Reason;
}

const EMPTY: CloserBriefing = {
  matchedSetterLead: null,
  transcript: null,
  setterName: null,
};

/**
 * Extract the prospect attendee email from a calendar event. Prefers the
 * first non-organizer attendee — internal team meetings (all-organizer or
 * empty attendees) return null. Documented limitation: phone identity
 * isn't carried in calendarEvents.attendees, so phone-only matches don't
 * happen here.
 */
export function findSetterLeadKeysForCalendarEvent(
  event: Doc<"calendarEvents"> | null,
): { email: string | null; phone: string | null } {
  if (!event || !event.attendees || event.attendees.length === 0) {
    return { email: null, phone: null };
  }
  const guest = event.attendees.find((a) => a.isOrganizer !== true);
  const picked = guest ?? event.attendees[0];
  return { email: normalizeEmail(picked.email), phone: null };
}

/**
 * Core briefing computation. Reusable across both auth paths. Pure read —
 * returns the typed result (with `reason` when null) instead of throwing.
 */
async function computeBriefing(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ctx: { db: any },
  calendarEventId: Id<"calendarEvents">,
  expectedTeamId: Id<"teams">,
): Promise<CloserBriefing> {
  const event = (await ctx.db.get(
    calendarEventId,
  )) as Doc<"calendarEvents"> | null;
  if (!event) {
    return { ...EMPTY, reason: "no_calendar_event" };
  }
  // Cross-team probe protection. The HTTP route and web auth path each
  // resolve a teamId from their own auth; this check confirms the calendar
  // event actually belongs to that team.
  if (event.teamId !== expectedTeamId) {
    return { ...EMPTY, reason: "no_calendar_event" };
  }

  const { email } = findSetterLeadKeysForCalendarEvent(event);
  if (!email) {
    return { ...EMPTY, reason: "no_prospect_identity" };
  }

  // In-memory lookup against the team's setterLeads. ~2.3MB on AICom; lazy
  // per-event so the load profile is small. If a customer outgrows this,
  // see the future-work note in the briefing roadmap memo.
  const leads = (await ctx.db
    .query("setterLeads")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .withIndex("by_team", (q: any) => q.eq("teamId", expectedTeamId))
    .collect()) as Doc<"setterLeads">[];

  const matched = leads.find((l) => normalizeEmail(l.email) === email) ?? null;
  if (!matched) {
    return { ...EMPTY, reason: "no_matching_setter_lead" };
  }

  // Most recent qualifying transcript: status="available" + aiSummary set.
  const transcripts = (await ctx.db
    .query("setterCallTranscripts")
    .withIndex("by_team_and_contact_and_time", (q: any) =>
      q
        .eq("teamId", expectedTeamId)
        .eq("ghlContactId", matched.ghlContactId),
    )
    .order("desc")
    .take(10)) as Doc<"setterCallTranscripts">[];

  const qualifying = transcripts.find(
    (t) =>
      t.transcriptionStatus === "available" &&
      typeof t.aiSummary === "string" &&
      t.aiSummary.length > 0,
  );
  if (!qualifying) {
    return {
      ...EMPTY,
      matchedSetterLead: {
        setterLeadId: matched._id,
        name: matched.name,
        email: matched.email,
        phone: matched.phone,
        source: matched.source,
        tags: matched.tags ?? [],
      },
      reason: "no_transcript_yet",
    };
  }

  // Resolve setter name. The transcript row itself doesn't denormalize the
  // dialer's ghlUserId, so we look up the qualifying setterLeadEvent by
  // ghlMessageId and pull the rep name.
  let setterName: string | null = null;
  const matchingEvent = (await ctx.db
    .query("setterLeadEvents")
    .withIndex("by_ghl_event_key", (q: any) =>
      q.eq("ghlEventKey", `msg:${qualifying.ghlMessageId}`),
    )
    .first()) as Doc<"setterLeadEvents"> | null;
  if (matchingEvent?.ghlUserId) {
    const rep = (await ctx.db
      .query("setterReps")
      .withIndex("by_team_and_ghl_user_id", (q: any) =>
        q.eq("teamId", expectedTeamId).eq("ghlUserId", matchingEvent.ghlUserId),
      )
      .first()) as Doc<"setterReps"> | null;
    setterName = rep?.name ?? null;
  }

  return {
    matchedSetterLead: {
      setterLeadId: matched._id,
      name: matched.name,
      email: matched.email,
      phone: matched.phone,
      source: matched.source,
      tags: matched.tags ?? [],
    },
    transcript: {
      transcriptRowId: qualifying._id,
      occurredAt: qualifying.occurredAt,
      direction: qualifying.direction,
      durationSec: qualifying.durationSec,
      aiSummary: qualifying.aiSummary,
      setterTalkTimeSec: qualifying.setterTalkTimeSec,
      prospectTalkTimeSec: qualifying.prospectTalkTimeSec,
      setterSpeakerIndex: qualifying.setterSpeakerIndex,
      hasFullTranscript: typeof qualifying.transcriptJson === "string",
    },
    setterName,
  };
}

// ----------------------------------------------------------------------------
// Auth-gated public queries
// ----------------------------------------------------------------------------

/**
 * Web dashboard auth path: clerkId resolves to a user row, which carries
 * the user's teamId. Used by the Schedule page expand-on-click pattern.
 */
export const getBriefingForCalendarEvent = query({
  args: {
    clerkId: v.string(),
    calendarEventId: v.id("calendarEvents"),
  },
  handler: async (ctx, args): Promise<CloserBriefing> => {
    const user = await ctx.db
      .query("users")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .withIndex("by_clerk_id", (q: any) => q.eq("clerkId", args.clerkId))
      .first();
    if (!user) return { ...EMPTY, reason: "no_calendar_event" };
    return computeBriefing(
      ctx,
      args.calendarEventId,
      user.teamId as Id<"teams">,
    );
  },
});

/**
 * Desktop HTTP-action auth path: closerEmail + teamId resolves to a
 * closer row whose teamId we verify against the passed teamId. Mirrors
 * the existing /getCloserEventsByEmail pattern.
 */
export const getBriefingForCalendarEventByCloserEmail = query({
  args: {
    closerEmail: v.string(),
    teamId: v.id("teams"),
    calendarEventId: v.id("calendarEvents"),
  },
  handler: async (ctx, args): Promise<CloserBriefing> => {
    const closer = await ctx.db
      .query("closers")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .withIndex("by_email", (q: any) => q.eq("email", args.closerEmail))
      .first();
    if (!closer || closer.teamId !== args.teamId) {
      // Auth mismatch — could be a security probe. Return empty without
      // leaking why. The HTTP route logs this case to Sentry.
      return { ...EMPTY, reason: "no_calendar_event" };
    }
    if (closer.status === "deactivated") {
      return { ...EMPTY, reason: "no_calendar_event" };
    }
    return computeBriefing(ctx, args.calendarEventId, args.teamId);
  },
});

/**
 * Internal variant — same as the email-auth path but already team-verified.
 * Used internally by the HTTP route to avoid re-fetching the closer.
 */
export const computeBriefingForCalendarEvent = internalQuery({
  args: {
    calendarEventId: v.id("calendarEvents"),
    teamId: v.id("teams"),
  },
  handler: async (ctx, args): Promise<CloserBriefing> => {
    return computeBriefing(ctx, args.calendarEventId, args.teamId);
  },
});
