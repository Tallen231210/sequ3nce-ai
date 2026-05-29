import { v } from "convex/values";
import { query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { computeScorecard } from "./setterDataMetrics";

// ============================================================================
// Setter Data — public read APIs for the dashboard UI.
//
// All queries here are admin-gated via resolveAuthUser → user.role === "admin".
// Closers don't have access to the web dashboard at all (per CLAUDE.md), but
// non-admin users (managers without admin role) similarly get null. Tab is
// hidden for them at the sidebar level too.
//
// Date ranges are Unix ms (UTC). The frontend's DateRangePicker provides
// these directly — no timezone math here.
// ============================================================================

// ----------------------------------------------------------------------------
// AUTH HELPER (mirrors apps/web/convex/ghl.ts:9-20)
// ----------------------------------------------------------------------------

// Resolve the calling user by their Clerk ID (passed explicitly by the
// frontend). Convex + Clerk auth context isn't wired up app-wide, so we
// follow the dominant codebase pattern of taking clerkId as an arg
// (mirrors apps/web/convex/hyros.ts, slack.ts, refgrow.ts, etc).
async function resolveAuthUser(
  ctx: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    db: any;
  },
  clerkId: string,
) {
  const user = await ctx.db
    .query("users")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .withIndex("by_clerk_id", (q: any) => q.eq("clerkId", clerkId))
    .first();
  return user;
}

// ----------------------------------------------------------------------------
// getOverview — Overview tab landing data
// ----------------------------------------------------------------------------

/**
 * Aggregate scorecard data + Overview-tab-specific extras (lead source mix,
 * action queue of stalest untouched leads). Single round-trip for the
 * KPI strip + funnel chart + action queue + source mix card.
 *
 * Returns null when the user isn't an admin (UI shows access-denied state).
 * Returns the data shape regardless of whether the team has connected GHL —
 * `totalLeads = 0` is a valid empty state until the install completes.
 */
export const getOverview = query({
  args: {
    clerkId: v.string(),
    rangeStart: v.number(),
    rangeEnd: v.number(),
  },
  handler: async (ctx, args) => {
    const user = await resolveAuthUser(ctx, args.clerkId);
    if (!user) return null;
    const teamId = user.teamId as Id<"teams">;

    const scorecard = await computeScorecard(ctx, {
      teamId,
      rangeStart: args.rangeStart,
      rangeEnd: args.rangeEnd,
    });

    // Extras specific to the Overview tab. We re-read leads here rather
    // than threading them through computeScorecard because the scorecard
    // is also used by the cron and we don't want to bloat its response.
    const leads = (await ctx.db
      .query("setterLeads")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .withIndex("by_team_and_date_added", (q: any) =>
        q
          .eq("teamId", teamId)
          .gte("dateAdded", args.rangeStart)
          .lt("dateAdded", args.rangeEnd),
      )
      .collect()) as Doc<"setterLeads">[];

    // Top-5 lead sources by count.
    const sourceCounts = new Map<string, number>();
    for (const lead of leads) {
      const key = lead.source || "Unknown";
      sourceCounts.set(key, (sourceCounts.get(key) ?? 0) + 1);
    }
    const sourceMix = Array.from(sourceCounts.entries())
      .map(([source, count]) => ({ source, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // Action queue: top-5 untouched leads, oldest first ("stalest first
    // wins" — managers want to know what's been waiting longest).
    const reps = (await ctx.db
      .query("setterReps")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .withIndex("by_team", (q: any) => q.eq("teamId", teamId))
      .collect()) as Doc<"setterReps">[];
    const repNameByGhlUserId = new Map(reps.map((r) => [r.ghlUserId, r.name]));

    const actionQueue = leads
      .filter((l) => l.dialCount === 0 && l.smsOutboundCount === 0)
      .sort((a, b) => a.dateAdded - b.dateAdded)
      .slice(0, 5)
      .map((l) => ({
        leadId: l._id,
        name: l.name,
        email: l.email,
        phone: l.phone,
        dateAdded: l.dateAdded,
        assignedToName: l.assignedToGhlUserId
          ? l.assignedToName ?? repNameByGhlUserId.get(l.assignedToGhlUserId) ?? "Unassigned"
          : "Unassigned",
      }));

    return {
      ...scorecard,
      sourceMix,
      actionQueue,
    };
  },
});

// ----------------------------------------------------------------------------
// getLeads — Leads tab paginated table
// ----------------------------------------------------------------------------

/**
 * Filterable, searchable lead list for the Leads tab. Filters apply in JS
 * since the candidate set per team per date range is small (typical
 * ~50 leads/day × range). Pagination is page-based since search/filter
 * combinations make cursor pagination awkward.
 */
export const getLeads = query({
  args: {
    clerkId: v.string(),
    rangeStart: v.number(),
    rangeEnd: v.number(),
    filter: v.optional(
      v.union(
        v.literal("all"),
        v.literal("preConnection"),
        v.literal("connected"),
        v.literal("untouched"),
      ),
    ),
    assignedToGhlUserId: v.optional(v.string()),
    search: v.optional(v.string()),
    page: v.optional(v.number()),
    pageSize: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await resolveAuthUser(ctx, args.clerkId);
    if (!user) return null;
    const teamId = user.teamId as Id<"teams">;

    const pageSize = clamp(args.pageSize ?? 50, 1, 200);
    const page = Math.max(1, args.page ?? 1);

    let leads = (await ctx.db
      .query("setterLeads")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .withIndex("by_team_and_date_added", (q: any) =>
        q
          .eq("teamId", teamId)
          .gte("dateAdded", args.rangeStart)
          .lt("dateAdded", args.rangeEnd),
      )
      .collect()) as Doc<"setterLeads">[];

    // Filter chain. Order matters minimally — all filters are O(n) over
    // the same array.
    if (args.filter === "preConnection") {
      leads = leads.filter((l) => !l.isConnected);
    } else if (args.filter === "connected") {
      leads = leads.filter((l) => l.isConnected);
    } else if (args.filter === "untouched") {
      leads = leads.filter((l) => l.dialCount === 0 && l.smsOutboundCount === 0);
    }

    if (args.assignedToGhlUserId) {
      leads = leads.filter((l) => l.assignedToGhlUserId === args.assignedToGhlUserId);
    }

    if (args.search) {
      const term = args.search.toLowerCase();
      leads = leads.filter(
        (l) =>
          (l.name?.toLowerCase().includes(term) ?? false) ||
          (l.email?.toLowerCase().includes(term) ?? false) ||
          (l.phone?.includes(term) ?? false),
      );
    }

    // Sort newest first — most operationally relevant order for managers
    // scanning who's just come in.
    leads.sort((a, b) => b.dateAdded - a.dateAdded);

    const total = leads.length;
    const items = leads.slice((page - 1) * pageSize, page * pageSize);

    // Hydrate assignedToName for any leads where the snapshot field is
    // missing (rare — happens when Contact.Create webhook arrived
    // before the rep was synced).
    const reps = (await ctx.db
      .query("setterReps")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .withIndex("by_team", (q: any) => q.eq("teamId", teamId))
      .collect()) as Doc<"setterReps">[];
    const repNameByGhlUserId = new Map(reps.map((r) => [r.ghlUserId, r.name]));

    return {
      items: items.map((l) => ({
        leadId: l._id,
        ghlContactId: l.ghlContactId,
        name: l.name,
        email: l.email,
        phone: l.phone,
        dateAdded: l.dateAdded,
        dialCount: l.dialCount,
        firstDialAt: l.firstDialAt,
        smsStatus: l.smsStatus,
        isConnected: l.isConnected,
        connectedAt: l.connectedAt,
        assignedToGhlUserId: l.assignedToGhlUserId,
        assignedToName: l.assignedToGhlUserId
          ? l.assignedToName ?? repNameByGhlUserId.get(l.assignedToGhlUserId)
          : undefined,
        lastActivityAt: l.lastActivityAt,
        source: l.source,
        tags: l.tags,
      })),
      total,
      page,
      pageSize,
      hasMore: total > page * pageSize,
    };
  },
});

// ----------------------------------------------------------------------------
// getLeadActivity — drilldown panel for one lead
// ----------------------------------------------------------------------------

/**
 * Full lead detail + recent event log for the Leads-tab drilldown.
 * Returns null if the lead doesn't belong to the caller's team
 * (defense-in-depth — the leadId arg is from the URL and shouldn't be
 * trusted to belong to the right team without checking).
 */
export const getLeadActivity = query({
  args: { clerkId: v.string(), leadId: v.id("setterLeads") },
  handler: async (ctx, args) => {
    const user = await resolveAuthUser(ctx, args.clerkId);
    if (!user) return null;
    const teamId = user.teamId as Id<"teams">;

    const lead = (await ctx.db.get(args.leadId)) as Doc<"setterLeads"> | null;
    if (!lead || lead.teamId !== teamId) return null;

    // Most recent 100 events. The drilldown panel displays them in a
    // timeline; older history is rarely useful at-a-glance.
    const events = (await ctx.db
      .query("setterLeadEvents")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .withIndex("by_team_and_contact", (q: any) =>
        q.eq("teamId", teamId).eq("ghlContactId", lead.ghlContactId),
      )
      .order("desc")
      .take(100)) as Doc<"setterLeadEvents">[];

    // Hydrate setter name for each event.
    const setterIds = new Set(
      events.map((e) => e.ghlUserId).filter((id): id is string => !!id),
    );
    const reps = (await ctx.db
      .query("setterReps")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .withIndex("by_team", (q: any) => q.eq("teamId", teamId))
      .collect()) as Doc<"setterReps">[];
    const repNameByGhlUserId = new Map(reps.map((r) => [r.ghlUserId, r.name]));

    // Look up transcripts for this lead's calls so the activity timeline
    // can show summary + talk ratio on each dial without a per-row
    // additional query. We fetch by (teamId, ghlContactId) which covers
    // every call on this lead. We DON'T include the full transcriptJson
    // — that's served separately via getCallTranscript when the user
    // clicks "Show full transcript" — payload size matters.
    const transcripts = (await ctx.db
      .query("setterCallTranscripts")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .withIndex("by_team_and_contact_and_time", (q: any) =>
        q.eq("teamId", teamId).eq("ghlContactId", lead.ghlContactId),
      )
      .collect()) as Doc<"setterCallTranscripts">[];
    const transcriptByMessageId = new Map(
      transcripts.map((t) => [t.ghlMessageId, t]),
    );

    return {
      lead: {
        leadId: lead._id,
        ghlContactId: lead.ghlContactId,
        name: lead.name,
        email: lead.email,
        phone: lead.phone,
        dateAdded: lead.dateAdded,
        source: lead.source,
        tags: lead.tags,
        assignedToName: lead.assignedToGhlUserId
          ? lead.assignedToName ?? repNameByGhlUserId.get(lead.assignedToGhlUserId)
          : undefined,
        dialCount: lead.dialCount,
        firstDialAt: lead.firstDialAt,
        lastDialAt: lead.lastDialAt,
        smsOutboundCount: lead.smsOutboundCount,
        smsInboundCount: lead.smsInboundCount,
        smsStatus: lead.smsStatus,
        isConnected: lead.isConnected,
        connectedAt: lead.connectedAt,
        connectedCallDurationSec: lead.connectedCallDurationSec,
        lastActivityAt: lead.lastActivityAt,
      },
      events: events.map((e) => {
        const messageId = e.ghlEventKey?.startsWith("msg:")
          ? e.ghlEventKey.slice(4)
          : null;
        const transcript = messageId
          ? transcriptByMessageId.get(messageId)
          : null;
        return {
          eventId: e._id,
          eventType: e.eventType,
          occurredAt: e.occurredAt,
          ghlUserId: e.ghlUserId,
          setterName: e.ghlUserId ? repNameByGhlUserId.get(e.ghlUserId) : undefined,
          details: e.details,
          transcript: transcript
            ? {
                transcriptRowId: transcript._id,
                status: transcript.transcriptionStatus,
                aiSummary: transcript.aiSummary,
                setterTalkTimeSec: transcript.setterTalkTimeSec,
                prospectTalkTimeSec: transcript.prospectTalkTimeSec,
                setterSpeakerIndex: transcript.setterSpeakerIndex,
                hasFullTranscript:
                  transcript.transcriptionStatus === "available",
              }
            : null,
        };
      }),
      setterIdsCount: setterIds.size,
    };
  },
});

// ----------------------------------------------------------------------------
// getMySettings — Settings tab populator
// ----------------------------------------------------------------------------

/**
 * Returns everything the Settings tab needs: GHL connection status,
 * scorecard config, connection threshold. Single query instead of
 * three separate ones — Settings tab does one read on mount.
 *
 * Note: getMyInstallationStatus already exists in setterGhlOauth.ts;
 * the Settings UI will use both queries together (this one for non-
 * connection-specific state, that one for the connection status card).
 */
export const getMySettings = query({
  args: { clerkId: v.string() },
  handler: async (ctx, args) => {
    const user = await resolveAuthUser(ctx, args.clerkId);
    if (!user) return null;
    const teamId = user.teamId as Id<"teams">;

    const team = (await ctx.db.get(teamId)) as Doc<"teams"> | null;
    if (!team) return null;

    return {
      // Master toggle (admin override). undefined = visible (default).
      setterDataEnabled: team.setterDataEnabled,
      // Connection threshold for "what counts as a connection". Default 60.
      setterConnectionThresholdSec: team.setterConnectionThresholdSec ?? 60,
      // Scorecard config. Mirrors the field shape on the team table.
      scorecard: {
        enabled: team.setterDailyScorecardEnabled ?? false,
        channel: team.setterDailyScorecardChannel,
        slackChannelId: team.setterDailyScorecardSlackChannelId,
        discordWebhookUrl: team.setterDailyScorecardDiscordWebhookUrl,
        hourLocal: team.setterDailyScorecardHourLocal,
      },
      // Untouched-lead alert config (Phase 2). Off by default.
      untouchedAlert: {
        enabled: team.setterUntouchedAlertEnabled ?? false,
        thresholdMinutes: team.setterUntouchedAlertThresholdMinutes,
        channel: team.setterUntouchedAlertChannel,
        slackChannelId: team.setterUntouchedAlertSlackChannelId,
        discordWebhookUrl: team.setterUntouchedAlertDiscordWebhookUrl,
      },
      // Disposition sync toggle (Phase 3c). When true AND a setterGhl
      // installation exists, post-call disposition routes via OAuth
      // tokens instead of the legacy api-key path.
      dispositionSync: {
        enabled: team.setterDispositionSyncEnabled ?? false,
      },
      // Team timezone (read-only here — set elsewhere in account settings).
      timezone: team.timezone,
    };
  },
});

// ----------------------------------------------------------------------------
// getPipelineStageDistribution — Phase 3 pipeline funnel on Overview tab
// ----------------------------------------------------------------------------

/**
 * Returns each pipeline's stages with the current count of open
 * opportunities in each. Powers the Pipeline Funnel chart on Overview.
 *
 * "Current" means: opportunities with status="open" right now,
 * regardless of when they entered. Won/lost/abandoned are excluded
 * since they've left the active pipeline.
 *
 * Date-range-bounded "stage transitions in the last X days" is a
 * separate metric that the Trends/per-setter views can use later;
 * this query intentionally keeps the funnel simple — current-state
 * snapshot only.
 */
export const getPipelineStageDistribution = query({
  args: { clerkId: v.string() },
  handler: async (ctx, args) => {
    const user = await resolveAuthUser(ctx, args.clerkId);
    if (!user) return null;
    const teamId = user.teamId as Id<"teams">;

    const pipelines = (await ctx.db
      .query("setterPipelines")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .withIndex("by_team", (q: any) => q.eq("teamId", teamId))
      .collect()) as Doc<"setterPipelines">[];

    if (pipelines.length === 0) return [];

    // Pull all opportunities for this team. Typical org has hundreds,
    // not thousands; full collect is fine. If we ever need to scale,
    // add a per-pipeline by_team_and_pipeline_and_status index.
    const opps = (await ctx.db
      .query("setterOpportunities")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .withIndex("by_team", (q: any) => q.eq("teamId", teamId))
      .collect()) as Doc<"setterOpportunities">[];

    return pipelines
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((pipeline) => {
        // Count opportunities per stage, open status only.
        const counts = new Map<string, number>();
        let totalOpen = 0;
        let totalValue = 0;
        for (const opp of opps) {
          if (opp.ghlPipelineId !== pipeline.ghlPipelineId) continue;
          if (opp.status !== "open") continue;
          totalOpen += 1;
          if (typeof opp.monetaryValue === "number") {
            totalValue += opp.monetaryValue;
          }
          counts.set(opp.ghlStageId, (counts.get(opp.ghlStageId) ?? 0) + 1);
        }

        const stages = pipeline.stages
          .slice()
          .sort((a, b) => a.position - b.position)
          .map((s) => ({
            ghlStageId: s.ghlStageId,
            name: s.name,
            position: s.position,
            count: counts.get(s.ghlStageId) ?? 0,
          }));

        return {
          ghlPipelineId: pipeline.ghlPipelineId,
          name: pipeline.name,
          totalOpen,
          totalValue,
          stages,
        };
      });
  },
});

// ----------------------------------------------------------------------------
// getReps — used by Leads-tab "Filter by setter" dropdown
// ----------------------------------------------------------------------------

// ----------------------------------------------------------------------------
// getSetterDetail — Setters tab drilldown panel (Phase 2)
// ----------------------------------------------------------------------------

/**
 * Per-setter drilldown for the Setters tab. Returns the setter's
 * scorecard row, their recent leads, their recent appointments, and
 * recent dial activity in the date range. The drilldown UI renders
 * this as a side panel when a leaderboard row is clicked.
 */
export const getSetterDetail = query({
  args: {
    clerkId: v.string(),
    ghlUserId: v.string(),
    rangeStart: v.number(),
    rangeEnd: v.number(),
  },
  handler: async (ctx, args) => {
    const user = await resolveAuthUser(ctx, args.clerkId);
    if (!user) return null;
    const teamId = user.teamId as Id<"teams">;

    // Setter identity. We allow null here — historical activity
    // attributed to a since-removed GHL user still resolves.
    const rep = (await ctx.db
      .query("setterReps")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .withIndex("by_team_and_ghl_user_id", (q: any) =>
        q.eq("teamId", teamId).eq("ghlUserId", args.ghlUserId),
      )
      .first()) as Doc<"setterReps"> | null;

    // Reuse the scorecard helper, then pluck out this setter's row.
    const scorecard = await computeScorecard(ctx, {
      teamId,
      rangeStart: args.rangeStart,
      rangeEnd: args.rangeEnd,
    });
    const myRow =
      scorecard.perSetter.find((r) => r.ghlUserId === args.ghlUserId) ?? null;

    // Leads assigned to this setter in the date range.
    const leads = (await ctx.db
      .query("setterLeads")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .withIndex("by_team_and_assigned", (q: any) =>
        q.eq("teamId", teamId).eq("assignedToGhlUserId", args.ghlUserId),
      )
      .collect()) as Doc<"setterLeads">[];
    const leadsInRange = leads
      .filter(
        (l) => l.dateAdded >= args.rangeStart && l.dateAdded < args.rangeEnd,
      )
      .sort((a, b) => b.dateAdded - a.dateAdded)
      .slice(0, 50);

    // Appointments booked by this setter in the date range.
    const appts = (await ctx.db
      .query("setterAppointments")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .withIndex("by_team_and_setter", (q: any) =>
        q.eq("teamId", teamId).eq("bookedByGhlUserId", args.ghlUserId),
      )
      .collect()) as Doc<"setterAppointments">[];
    const apptsInRange = appts
      .filter((a) => a.bookedAt >= args.rangeStart && a.bookedAt < args.rangeEnd)
      .sort((a, b) => b.bookedAt - a.bookedAt)
      .slice(0, 50);

    // ALL dial events by this setter — used by the heatmap (which buckets
    // them by team-tz day-of-week × hour-of-day) and the timeline (most
    // recent 100). Capped at 5000 to keep a single query response under
    // Convex's payload limit even for very high-volume setters.
    const eventsAll = (await ctx.db
      .query("setterLeadEvents")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .withIndex("by_team_and_setter_and_time", (q: any) =>
        q
          .eq("teamId", teamId)
          .eq("ghlUserId", args.ghlUserId)
          .gte("occurredAt", args.rangeStart)
          .lt("occurredAt", args.rangeEnd),
      )
      .order("desc")
      .take(5000)) as Doc<"setterLeadEvents">[];

    // Look up team timezone for heatmap bucketing. Falls back to
    // America/New_York to match the daily-scorecard cron's default.
    const team = (await ctx.db.get(teamId)) as Doc<"teams"> | null;
    const timezone = team?.timezone || "America/New_York";

    // 7×24 grid of dial-outbound counts. Bucketed in team timezone so
    // "9-10am Mon" means 9-10am in the team's local clock, not UTC.
    const heatmap = bucketDialEventsByDayHour(eventsAll, timezone);

    // Per-source breakdown for this setter's leads in range. Lets the
    // drilldown answer "this setter is great with referrals but
    // terrible with cold inbound" type questions.
    const sourceMix = computeSourceMixForLeads(leadsInRange);

    return {
      setter: rep
        ? {
            ghlUserId: rep.ghlUserId,
            name: rep.name,
            email: rep.email,
            phone: rep.phone,
            isActive: rep.isActive,
          }
        : { ghlUserId: args.ghlUserId, name: "Unknown setter" },
      scorecardRow: myRow,
      timezone,
      heatmap,
      sourceMix,
      leads: leadsInRange.map((l) => ({
        leadId: l._id,
        ghlContactId: l.ghlContactId,
        name: l.name,
        email: l.email,
        phone: l.phone,
        dateAdded: l.dateAdded,
        dialCount: l.dialCount,
        firstDialAt: l.firstDialAt,
        isConnected: l.isConnected,
        appointmentCount: l.appointmentCount,
        showedCount: l.showedCount,
      })),
      appointments: apptsInRange.map((a) => ({
        appointmentId: a._id,
        ghlAppointmentId: a.ghlAppointmentId,
        ghlContactId: a.ghlContactId,
        startTime: a.startTime,
        status: a.status,
        bookedAt: a.bookedAt,
      })),
      events: await Promise.all(
        eventsAll.slice(0, 100).map(async (e) => {
          const messageId = e.ghlEventKey?.startsWith("msg:")
            ? e.ghlEventKey.slice(4)
            : null;
          const transcript = messageId
            ? ((await ctx.db
                .query("setterCallTranscripts")
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                .withIndex("by_team_and_message", (q: any) =>
                  q.eq("teamId", teamId).eq("ghlMessageId", messageId),
                )
                .first()) as Doc<"setterCallTranscripts"> | null)
            : null;
          return {
            eventId: e._id,
            eventType: e.eventType,
            occurredAt: e.occurredAt,
            ghlContactId: e.ghlContactId,
            details: e.details,
            transcript: transcript
              ? {
                  transcriptRowId: transcript._id,
                  status: transcript.transcriptionStatus,
                  aiSummary: transcript.aiSummary,
                  setterTalkTimeSec: transcript.setterTalkTimeSec,
                  prospectTalkTimeSec: transcript.prospectTalkTimeSec,
                  setterSpeakerIndex: transcript.setterSpeakerIndex,
                  hasFullTranscript:
                    transcript.transcriptionStatus === "available",
                }
              : null,
          };
        }),
      ),
    };
  },
});

// ----------------------------------------------------------------------------
// Helpers used by getSetterDetail (kept private to this file)
// ----------------------------------------------------------------------------

/**
 * Bucket dial-outbound events into a 7×24 grid in the given IANA
 * timezone. Index 0 = Sunday so the rendered grid follows the standard
 * week-starts-Sunday convention managers expect.
 */
function bucketDialEventsByDayHour(
  events: Array<{ occurredAt: number; eventType: string }>,
  timezone: string,
): number[][] {
  const grid: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
  const dowMap: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };
  for (const ev of events) {
    if (ev.eventType !== "dial_outbound") continue;
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      weekday: "short",
      hour: "2-digit",
      hour12: false,
    }).formatToParts(new Date(ev.occurredAt));
    const weekday = parts.find((p) => p.type === "weekday")?.value ?? "Mon";
    const hourStr = parts.find((p) => p.type === "hour")?.value ?? "0";
    // Intl with hour12=false sometimes returns "24" at midnight.
    const hour = parseInt(hourStr, 10) % 24;
    const dow = dowMap[weekday];
    if (dow !== undefined) grid[dow][hour]++;
  }
  return grid;
}

/**
 * Compute per-source aggregates for a list of leads. Returns top 10
 * sources by lead count, with connect rate per source. Phase 3 — the
 * Setters drilldown surfaces "this setter is best with [source]" by
 * eyeballing this list.
 */
function computeSourceMixForLeads(
  leads: Array<{
    source?: string;
    isConnected: boolean;
    appointmentCount: number;
    showedCount: number;
  }>,
): Array<{
  source: string;
  leadCount: number;
  connectedCount: number;
  appointmentCount: number;
  showedCount: number;
  connectRate: number | null;
}> {
  const map = new Map<
    string,
    {
      leadCount: number;
      connectedCount: number;
      appointmentCount: number;
      showedCount: number;
    }
  >();
  for (const lead of leads) {
    const source = lead.source || "Unknown";
    const entry = map.get(source) ?? {
      leadCount: 0,
      connectedCount: 0,
      appointmentCount: 0,
      showedCount: 0,
    };
    entry.leadCount += 1;
    if (lead.isConnected) entry.connectedCount += 1;
    entry.appointmentCount += lead.appointmentCount;
    entry.showedCount += lead.showedCount;
    map.set(source, entry);
  }
  return Array.from(map.entries())
    .map(([source, data]) => ({
      source,
      ...data,
      connectRate:
        data.leadCount > 0 ? data.connectedCount / data.leadCount : null,
    }))
    .sort((a, b) => b.leadCount - a.leadCount)
    .slice(0, 10);
}

export const getReps = query({
  args: { clerkId: v.string() },
  handler: async (ctx, args) => {
    const user = await resolveAuthUser(ctx, args.clerkId);
    if (!user) return [];
    const teamId = user.teamId as Id<"teams">;

    const reps = (await ctx.db
      .query("setterReps")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .withIndex("by_team", (q: any) => q.eq("teamId", teamId))
      .collect()) as Doc<"setterReps">[];

    return reps
      .filter((r) => r.isActive)
      .map((r) => ({
        ghlUserId: r.ghlUserId,
        name: r.name,
        email: r.email,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  },
});

// ----------------------------------------------------------------------------
// utility
// ----------------------------------------------------------------------------

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}
