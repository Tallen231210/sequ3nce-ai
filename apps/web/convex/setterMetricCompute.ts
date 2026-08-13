// ============================================================================
// The arithmetic. Four shapes, no database, no clock.
//
// Pure on purpose, the same split as callExtraction.ts (model call + guards)
// versus callExtractionRun.ts (owns the database). Everything here takes rows
// in and returns numbers out, so the whole library can be tested against
// fixtures rather than against whatever happens to be in production today.
//
// Determinism is the point. Same rows plus same definition must always give the
// same number — if a figure can move between two page loads, nobody can be
// asked to act on it. This is also why AI never runs at this layer: it proposes
// what the words mean, and then plain code does the counting.
// ============================================================================

import type { ResolvedFunnel } from "./setterFunnelResolve";
import { elapsedWorkingMs } from "./setterFunnelResolve";

/* eslint-disable @typescript-eslint/no-explicit-any */

/** One thing that happened, already normalised out of whichever CRM it came from. */
export interface MetricEvent {
  leadId: string;
  setterId: string | null;
  occurredAt: number;
  channel: string;
  kind: string;
}

export interface MetricLead {
  leadId: string;
  arrivedAt: number;
  ownerId: string | null;
}

/**
 * Coverage travels with every result.
 *
 * On the pilot Close org 149,061 of 150,961 dials carry no user at all — a power
 * dialer doing ~1,700 a day. A per-setter number computed from the remaining
 * 1.3% is not wrong, but presenting it without saying so implies a completeness
 * that isn't there. Every result therefore states what it could and couldn't
 * attribute, and the UI is expected to show it.
 */
export interface Coverage {
  total: number;
  attributed: number;
  /** 0–1. Low numbers are a warning to the reader, not an error. */
  ratio: number;
}

export interface CountResult {
  bySetter: Record<string, number>;
  unattributed: number;
  coverage: Coverage;
}

export interface RatioResult {
  numerator: number;
  denominator: number;
  /** Null rather than 0 when there is nothing to divide — an empty denominator
   *  is "we don't know", and 0% is a claim. */
  value: number | null;
  bySetter: Record<string, { numerator: number; denominator: number; value: number | null }>;
  coverage: Coverage;
}

export interface DistributionResult {
  count: number;
  medianMs: number | null;
  p90Ms: number | null;
  meanMs: number | null;
  /** The slowest few, so a manager can go and look at them. */
  worst: Array<{ leadId: string; valueMs: number; setterId: string | null }>;
  coverage: Coverage;
}

function coverageOf(total: number, attributed: number): Coverage {
  return { total, attributed, ratio: total === 0 ? 0 : attributed / total };
}

/** How many of something, per setter. */
export function computeCount(events: MetricEvent[]): CountResult {
  const bySetter: Record<string, number> = {};
  let unattributed = 0;
  for (const e of events) {
    if (!e.setterId) {
      unattributed += 1;
      continue;
    }
    bySetter[e.setterId] = (bySetter[e.setterId] ?? 0) + 1;
  }
  return {
    bySetter,
    unattributed,
    coverage: coverageOf(events.length, events.length - unattributed),
  };
}

/**
 * What fraction of one population became another.
 *
 * Takes the two populations already resolved rather than trying to derive them,
 * because "which leads count" is a funnel question and answering it here would
 * bake in an assumption — which is the whole reason this rebuild exists.
 */
export function computeRatio(
  denominatorLeads: MetricLead[],
  numeratorLeadIds: Set<string>,
): RatioResult {
  const bySetter: Record<string, { numerator: number; denominator: number; value: number | null }> = {};
  let attributed = 0;

  for (const lead of denominatorLeads) {
    if (!lead.ownerId) continue;
    attributed += 1;
    const row = (bySetter[lead.ownerId] ??= {
      numerator: 0,
      denominator: 0,
      value: null,
    });
    row.denominator += 1;
    if (numeratorLeadIds.has(lead.leadId)) row.numerator += 1;
  }
  for (const row of Object.values(bySetter)) {
    row.value = row.denominator === 0 ? null : row.numerator / row.denominator;
  }

  const denominator = denominatorLeads.length;
  const numerator = denominatorLeads.filter((l) =>
    numeratorLeadIds.has(l.leadId),
  ).length;

  return {
    numerator,
    denominator,
    value: denominator === 0 ? null : numerator / denominator,
    bySetter,
    coverage: coverageOf(denominator, attributed),
  };
}

/**
 * The spread of a time gap.
 *
 * Median and p90 rather than a mean alone: a team where most leads are answered
 * in four minutes and one waited three days has an average that describes
 * neither case. The p90 is the number a manager should be looking at, and
 * `worst` gives them the actual leads to open.
 */
export function computeDistribution(
  pairs: Array<{ leadId: string; startMs: number; endMs: number; setterId: string | null }>,
  funnel: ResolvedFunnel,
): DistributionResult {
  const values: Array<{ leadId: string; valueMs: number; setterId: string | null }> = [];
  let attributed = 0;

  for (const p of pairs) {
    if (p.endMs < p.startMs) continue; // clock skew, not a measurement
    const valueMs = elapsedWorkingMs(p.startMs, p.endMs, funnel.businessHours);
    if (p.setterId) attributed += 1;
    values.push({ leadId: p.leadId, valueMs, setterId: p.setterId });
  }

  const sorted = values.map((v) => v.valueMs).sort((a, b) => a - b);
  const worst = [...values].sort((a, b) => b.valueMs - a.valueMs).slice(0, 5);

  return {
    count: values.length,
    medianMs: percentile(sorted, 0.5),
    p90Ms: percentile(sorted, 0.9),
    meanMs:
      sorted.length === 0
        ? null
        : Math.round(sorted.reduce((s, v) => s + v, 0) / sorted.length),
    worst,
    coverage: coverageOf(values.length, attributed),
  };
}

/**
 * Nearest-rank percentile.
 *
 * Chosen over interpolation because the result is always a real observed
 * value — when a manager clicks through to see the rows behind a median, the
 * number they were shown is one of the rows, not an average of two of them.
 */
function percentile(sortedAsc: number[], p: number): number | null {
  if (sortedAsc.length === 0) return null;
  const rank = Math.ceil(p * sortedAsc.length);
  return sortedAsc[Math.min(Math.max(rank - 1, 0), sortedAsc.length - 1)];
}

/**
 * Pair each lead with the first touch that counts for this funnel.
 *
 * "Counts" is the whole game: a business measuring dial speed must not have its
 * clock stopped by an automated welcome text, which is precisely the mistake
 * that would make a slow team look instant.
 */
export function firstTouchPerLead(
  leads: MetricLead[],
  events: MetricEvent[],
  countsChannel: (channel: string) => boolean,
): Array<{ leadId: string; startMs: number; endMs: number; setterId: string | null }> {
  const firstByLead = new Map<string, MetricEvent>();
  for (const e of events) {
    if (!countsChannel(e.channel)) continue;
    const existing = firstByLead.get(e.leadId);
    if (!existing || e.occurredAt < existing.occurredAt) firstByLead.set(e.leadId, e);
  }

  const out: Array<{ leadId: string; startMs: number; endMs: number; setterId: string | null }> = [];
  for (const lead of leads) {
    const first = firstByLead.get(lead.leadId);
    if (!first) continue; // never touched — belongs to contact rate, not speed
    out.push({
      leadId: lead.leadId,
      startMs: lead.arrivedAt,
      endMs: first.occurredAt,
      setterId: first.setterId ?? lead.ownerId,
    });
  }
  return out;
}
