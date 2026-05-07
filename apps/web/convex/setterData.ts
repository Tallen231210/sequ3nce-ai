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

async function resolveAuthUser(ctx: {
  auth: { getUserIdentity: () => Promise<{ subject: string } | null> };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any;
}) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;
  const clerkId = identity.subject;
  const user = await ctx.db
    .query("users")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .withIndex("by_clerk_id", (q: any) => q.eq("clerkId", clerkId))
    .first();
  return user;
}

function isAdmin(user: { role?: string } | null | undefined): boolean {
  return user?.role === "admin";
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
    rangeStart: v.number(),
    rangeEnd: v.number(),
  },
  handler: async (ctx, args) => {
    const user = await resolveAuthUser(ctx);
    if (!isAdmin(user)) return null;
    const teamId = user!.teamId as Id<"teams">;

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
    const user = await resolveAuthUser(ctx);
    if (!isAdmin(user)) return null;
    const teamId = user!.teamId as Id<"teams">;

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
  args: { leadId: v.id("setterLeads") },
  handler: async (ctx, args) => {
    const user = await resolveAuthUser(ctx);
    if (!isAdmin(user)) return null;
    const teamId = user!.teamId as Id<"teams">;

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
      events: events.map((e) => ({
        eventId: e._id,
        eventType: e.eventType,
        occurredAt: e.occurredAt,
        ghlUserId: e.ghlUserId,
        setterName: e.ghlUserId ? repNameByGhlUserId.get(e.ghlUserId) : undefined,
        details: e.details,
      })),
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
  args: {},
  handler: async (ctx) => {
    const user = await resolveAuthUser(ctx);
    if (!isAdmin(user)) return null;
    const teamId = user!.teamId as Id<"teams">;

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
      // Team timezone (read-only here — set elsewhere in account settings).
      timezone: team.timezone,
    };
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
    ghlUserId: v.string(),
    rangeStart: v.number(),
    rangeEnd: v.number(),
  },
  handler: async (ctx, args) => {
    const user = await resolveAuthUser(ctx);
    if (!isAdmin(user)) return null;
    const teamId = user!.teamId as Id<"teams">;

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

    // Recent dial events by this setter (for the activity timeline).
    const events = (await ctx.db
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
      .take(100)) as Doc<"setterLeadEvents">[];

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
      events: events.map((e) => ({
        eventId: e._id,
        eventType: e.eventType,
        occurredAt: e.occurredAt,
        ghlContactId: e.ghlContactId,
        details: e.details,
      })),
    };
  },
});

export const getReps = query({
  args: {},
  handler: async (ctx) => {
    const user = await resolveAuthUser(ctx);
    if (!isAdmin(user)) return [];
    const teamId = user!.teamId as Id<"teams">;

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
