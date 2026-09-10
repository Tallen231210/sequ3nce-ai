// ============================================================================
// Cadence: how hard each outbound setter works a lead — dials per lead,
// the share of leads pursued to three or more attempts, how many days a
// lead is chased. Read from the setter's own dial rows for the range. One
// number Zion asked to keep from the old tab, now per setter and per lead.
// ============================================================================

import type { QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { dialConnected } from "./lib/dialAnswered";
import { percentiles } from "./settersPageTeams";

/** Dial rows read per setter for the range; a busier fortnight than this is reported as partial. */
const DIALS_TAKE = 4_000;
/** Names looked up for the per-lead list. */
const NAMES_CAP = 300;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface CadenceLead {
  leadId: string;
  attempts: number;
  answered: number;
  firstAt: number;
  lastAt: number;
}

export interface CadenceSummary {
  dials: number;
  leadsDialled: number;
  dialsPerLead: number | null;
  /** Leads dialled three or more times, over leads dialled. */
  threePlusPct: number | null;
  /** Median days from first to last dial over leads dialled at least twice. */
  medianPursuitDays: number | null;
  /** Leads where at least one dial was answered. */
  leadsAnswered: number;
  truncated: boolean;
}

/** Rows one query may read across every setter's cadence — under the 32k-document budget with room for the roster reads. */
export const CADENCE_BUDGET = 20_000;

export async function loadCadence(
  ctx: QueryCtx,
  teamId: Id<"teams">,
  crmUserId: string,
  startMs: number,
  endMs: number,
  connectSec: number,
  budget: { left: number } = { left: DIALS_TAKE },
): Promise<{ leads: CadenceLead[]; summary: CadenceSummary }> {
  // A shared budget: the setters read after it runs out are reported as
  // unread rather than the whole query failing on the document limit.
  const take = Math.min(DIALS_TAKE, Math.max(0, budget.left));
  const rows = take === 0
    ? []
    : await ctx.db
        .query("setterLeadEvents")
        .withIndex("by_team_and_setter_and_time", (q) => q.eq("teamId", teamId).eq("ghlUserId", crmUserId).gte("occurredAt", startMs).lt("occurredAt", endMs))
        .order("desc")
        .take(take);
  budget.left -= rows.length;
  const capped = take === 0 || rows.length >= take;
  const byLead = new Map<string, CadenceLead>();
  let dials = 0;
  for (const e of rows) {
    if (e.eventType !== "dial_outbound") continue;
    dials += 1;
    const l = byLead.get(e.ghlContactId) ?? { leadId: e.ghlContactId, attempts: 0, answered: 0, firstAt: e.occurredAt, lastAt: e.occurredAt };
    l.attempts += 1;
    if (dialConnected(e.details, connectSec)) l.answered += 1;
    l.firstAt = Math.min(l.firstAt, e.occurredAt);
    l.lastAt = Math.max(l.lastAt, e.occurredAt);
    byLead.set(e.ghlContactId, l);
  }
  const leads = Array.from(byLead.values()).sort((a, b) => b.attempts - a.attempts || b.lastAt - a.lastAt);
  const n = leads.length;
  const pursued = leads.filter((l) => l.attempts >= 2).map((l) => (l.lastAt - l.firstAt) / DAY_MS);
  const summary: CadenceSummary = {
    dials,
    leadsDialled: n,
    dialsPerLead: n > 0 ? Math.round((dials / n) * 10) / 10 : null,
    threePlusPct: n > 0 ? Math.round((leads.filter((l) => l.attempts >= 3).length / n) * 100) : null,
    medianPursuitDays: pursued.length > 0 ? Math.round((percentiles(pursued).median ?? 0) * 10) / 10 : null,
    leadsAnswered: leads.filter((l) => l.answered > 0).length,
    truncated: capped,
  };
  return { leads, summary };
}

/** Names for the per-lead list, one point read each, capped. */
export async function nameLeads(ctx: QueryCtx, teamId: Id<"teams">, leads: CadenceLead[]): Promise<Array<CadenceLead & { leadName: string }>> {
  const out: Array<CadenceLead & { leadName: string }> = [];
  for (const l of leads.slice(0, NAMES_CAP)) {
    const lead = await ctx.db
      .query("setterLeads")
      .withIndex("by_team_and_ghl_contact_id", (q) => q.eq("teamId", teamId).eq("ghlContactId", l.leadId))
      .first();
    out.push({ ...l, leadName: lead?.name || lead?.email || "lead" });
  }
  return out;
}
