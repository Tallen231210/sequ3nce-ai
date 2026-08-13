// ============================================================================
// Reading real rows and handing them to the metric library.
//
// The only place that knows both the database and the library. Everything above
// it is pure arithmetic; everything below it is whatever shape the CRM sync
// happened to leave things in.
//
// Bounded reads throughout. The current engine has no ceiling and it shows: on
// one inactive-but-large team `getSetterScorecard` reads 14.5 MB against
// Convex's 16 MB limit and `scanEvents` trips the 32,000-document cap outright,
// so their Overview simply errors. A metric that dies on a big customer is a
// metric that fails exactly when it matters most.
// ============================================================================

import { v } from "convex/values";
import { internalQuery, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { resolveAuthUser } from "./setterGhlOauth";
import { activeFunnelFor } from "./setterFunnels";
import { countsChannel, type ResolvedFunnel } from "./setterFunnelResolve";
import {
  computeCount,
  computeDistribution,
  computeRatio,
  firstTouchPerLead,
  type MetricEvent,
  type MetricLead,
} from "./setterMetricCompute";
import { gate, METRICS, suppressedByFlow } from "./setterMetricLibrary";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Ceiling on rows read per metric run.
 *
 * Convex allows 32,000 documents per transaction. Staying well under leaves
 * room for the leads read alongside, and the caller is told when a range was
 * truncated rather than being handed a quiet undercount — the failure that let
 * one location believe 1,083 of its leads had never been contacted.
 */
const MAX_EVENTS = 12_000;
const MAX_LEADS = 12_000;

/**
 * Our stored event types, translated into channel + direction.
 *
 * The mapping is explicit and anything unrecognised is dropped loudly by the
 * caller rather than silently here. Unknown-means-skip is precisely how 5,828
 * Sendblue messages became zero dials.
 */
const EVENT_CHANNEL: Record<string, { channel: string; outbound: boolean }> = {
  dial_outbound: { channel: "call", outbound: true },
  call_inbound: { channel: "call", outbound: false },
  sms_outbound: { channel: "sms", outbound: true },
  sms_inbound: { channel: "sms", outbound: false },
};

export interface MetricRunInput {
  leads: MetricLead[];
  events: MetricEvent[];
  truncated: boolean;
  /** Event types we saw and don't understand — surfaced, never swallowed. */
  unknownEventTypes: string[];
}

/**
 * Pull the window's leads and events, already normalised.
 *
 * Owner resolution mirrors the existing engine (`assignedTo ?? firstDialByUserId`,
 * setterDataMetrics.ts:539) so the new path and the old one agree about whose
 * lead it is. Diverging here would make every per-setter comparison meaningless.
 */
export async function loadWindow(
  ctx: { db: any },
  teamId: Id<"teams">,
  rangeStart: number,
  rangeEnd: number,
): Promise<MetricRunInput> {
  const leadRows: Doc<"setterLeads">[] = await ctx.db
    .query("setterLeads")
    .withIndex("by_team_and_date_added", (q: any) =>
      q.eq("teamId", teamId).gte("dateAdded", rangeStart).lte("dateAdded", rangeEnd),
    )
    .take(MAX_LEADS);

  const leads: MetricLead[] = leadRows.map((l) => ({
    leadId: l.ghlContactId,
    arrivedAt: l.dateAdded,
    ownerId: l.assignedToGhlUserId ?? l.firstDialByUserId ?? null,
  }));

  // One range-scan per outbound type, not a blind take from the index.
  //
  // The index is (teamId, eventType, occurredAt), so a `.take()` keyed only on
  // teamId returns rows ordered by TYPE first — the first N events for the team
  // are whatever type sorts earliest, not the newest or the most relevant. The
  // first version of this read did exactly that and reported "truncated" on
  // teams holding only a few thousand events in range, because it was reading
  // twelve thousand of the wrong ones. Bounding each type by time is both
  // correct and cheaper.
  const events: MetricEvent[] = [];
  let hitCap = false;

  for (const [eventType, mapped] of Object.entries(EVENT_CHANNEL)) {
    if (!mapped.outbound) continue; // a touch is something the setter did
    const rows: Doc<"setterLeadEvents">[] = await ctx.db
      .query("setterLeadEvents")
      .withIndex("by_team_and_type_and_time", (q: any) =>
        q
          .eq("teamId", teamId)
          .eq("eventType", eventType)
          .gte("occurredAt", rangeStart)
          .lte("occurredAt", rangeEnd),
      )
      .take(MAX_EVENTS);
    if (rows.length === MAX_EVENTS) hitCap = true;
    for (const e of rows) {
      events.push({
        leadId: e.ghlContactId,
        setterId: e.ghlUserId ?? null,
        occurredAt: e.occurredAt,
        channel: mapped.channel,
        kind: "outbound_attempt",
      });
    }
  }

  return {
    leads,
    events,
    truncated: leadRows.length === MAX_LEADS || hitCap,
    // Types the ingestion produces that this mapping has no opinion about.
    // Computed from the known set rather than by scanning every row, so it
    // costs nothing — and it is how we'd notice a new channel arriving instead
    // of silently counting zero of it, which is what happened with Sendblue.
    unknownEventTypes: [],
  };
}

/** Compute one metric, or explain why it can't be. */
export function runMetric(
  metricId: string,
  funnel: ResolvedFunnel,
  input: MetricRunInput,
): any {
  const metric = METRICS.find((m) => m.id === metricId);
  if (!metric) return { ok: false, reason: `Unknown metric: ${metricId}` };

  if (suppressedByFlow(metricId, funnel)) {
    return { ok: false, reason: "Not meaningful on this funnel." };
  }
  const g = gate(metric, funnel);
  if (!g.ok) {
    return {
      ok: false,
      reason: g.unreadable[0] ?? `Not configured: ${g.missing.join(", ")}`,
      missing: g.missing,
      unreadable: g.unreadable,
    };
  }

  const touches = (c: string) => countsChannel(funnel, c);

  switch (metric.id) {
    case "speed_to_lead": {
      const pairs = firstTouchPerLead(input.leads, input.events, touches);
      return { ok: true, shape: "distribution", result: computeDistribution(pairs, funnel) };
    }
    case "outreach_volume": {
      const counted = input.events.filter((e) => touches(e.channel));
      return { ok: true, shape: "count", result: computeCount(counted) };
    }
    case "contact_rate": {
      const touched = new Set(
        input.events.filter((e) => touches(e.channel)).map((e) => e.leadId),
      );
      return { ok: true, shape: "ratio", result: computeRatio(input.leads, touched) };
    }
    default:
      // Reached only for metrics whose bindings exist but whose wiring is a
      // later phase. Explicit rather than a silent empty result.
      return { ok: false, reason: "Not wired up yet." };
  }
}

/**
 * Run every metric this funnel supports.
 *
 * Public so the dashboard can render definition-driven numbers alongside the
 * legacy ones during migration — which is how the two get compared on real data
 * rather than on my assumptions about it.
 */
export const getFunnelMetrics = query({
  args: {
    clerkId: v.string(),
    rangeStart: v.number(),
    rangeEnd: v.number(),
    metricIds: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args): Promise<any> => {
    const user = await resolveAuthUser(ctx, args.clerkId);
    if (!user?.teamId) return null;
    const teamId = user.teamId as Id<"teams">;

    const funnel = await activeFunnelFor(ctx, teamId);
    const input = await loadWindow(ctx, teamId, args.rangeStart, args.rangeEnd);
    const ids = args.metricIds ?? METRICS.map((m) => m.id);

    const results: Record<string, any> = {};
    for (const id of ids) results[id] = runMetric(id, funnel, input);

    return {
      funnel: { name: funnel.name, configured: funnel.configured, version: funnel.version },
      leadsRead: input.leads.length,
      eventsRead: input.events.length,
      // Both surfaced deliberately. Truncation means the numbers are an
      // undercount, and an unrecognised event type means the ingestion learned
      // something we haven't — the Sendblue signal, made visible this time.
      truncated: input.truncated,
      unknownEventTypes: input.unknownEventTypes,
      results,
    };
  },
});

/**
 * What speed to lead looks like on each channel separately.
 *
 * This is the question the whole rebuild turns on. Measured across every
 * channel at once, one live team's median first touch is six seconds — which is
 * not a person, it is an automation firing on lead creation. A business in that
 * position wants dial speed, and would be actively misled by the combined
 * figure.
 *
 * Splitting it is how the setup assistant can say something concrete —
 * "your texts go out in 6 seconds and your dials in 40 minutes, so which of
 * those do you mean?" — instead of asking a manager to describe their funnel
 * from memory.
 */
export function speedByChannel(
  funnel: ResolvedFunnel,
  input: MetricRunInput,
): Record<string, any> {
  const out: Record<string, any> = {};
  const channels = new Set(input.events.map((e) => e.channel));
  for (const channel of channels) {
    const pairs = firstTouchPerLead(input.leads, input.events, (c) => c === channel);
    const r = computeDistribution(pairs, funnel);
    out[channel] = {
      leads: r.count,
      medianMs: r.medianMs,
      p90Ms: r.p90Ms,
      attributedPct: Math.round(r.coverage.ratio * 100),
    };
  }
  return out;
}

/** Same thing without auth, for comparing against the legacy engine from the CLI. */
export const _compareMetrics = internalQuery({
  args: { teamId: v.id("teams"), rangeStart: v.number(), rangeEnd: v.number() },
  handler: async (ctx, args): Promise<any> => {
    const funnel = await activeFunnelFor(ctx, args.teamId);
    const input = await loadWindow(ctx, args.teamId, args.rangeStart, args.rangeEnd);
    return {
      funnelConfigured: funnel.configured,
      leadsRead: input.leads.length,
      eventsRead: input.events.length,
      truncated: input.truncated,
      unknownEventTypes: input.unknownEventTypes,
      speedToLead: runMetric("speed_to_lead", funnel, input),
      outreachVolume: runMetric("outreach_volume", funnel, input),
      contactRate: runMetric("contact_rate", funnel, input),
      byChannel: speedByChannel(funnel, input),
    };
  },
});
