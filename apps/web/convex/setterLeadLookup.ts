// ============================================================================
// Calendar guest → Close lead, by normalised email.
//
// One point read per UNIQUE address on the by_team_and_email_norm index. The
// alternative — collecting a team's leads and matching in memory — blew the
// 32k-document budget on the first genuinely large org (E2, ~200 leads/day),
// which is why the booking matcher moved to this shape. Shared so the two
// readers (the bookings matcher and the setter-team pass) can't drift.
// ============================================================================

import type { Doc, Id } from "./_generated/dataModel";

export const LEAD_LOOKUP_CAP = 5_000;

export interface LeadLookup {
  /** emailNorm → lead. Addresses with no lead are simply absent. */
  leads: Map<string, Doc<"setterLeads">>;
  /** More unique addresses than the cap; the rest went unmatched. */
  capped: boolean;
  lookedUp: number;
}

export async function lookupLeadsByEmailNorm(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ctx: { db: any },
  teamId: Id<"teams">,
  emailNorms: Iterable<string>,
  cap: number = LEAD_LOOKUP_CAP,
): Promise<LeadLookup> {
  const unique = new Set<string>();
  let capped = false;
  for (const e of emailNorms) {
    if (unique.size >= cap) {
      capped = true;
      break;
    }
    if (e) unique.add(e);
  }
  if (capped) {
    console.warn(`[leadLookup] >${cap} unique guest emails for team ${teamId} — matching capped`);
  }
  const leads = new Map<string, Doc<"setterLeads">>();
  for (const norm of unique) {
    const lead = (await ctx.db
      .query("setterLeads")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .withIndex("by_team_and_email_norm", (q: any) =>
        q.eq("teamId", teamId).eq("emailNorm", norm),
      )
      .first()) as Doc<"setterLeads"> | null;
    if (lead) leads.set(norm, lead);
  }
  return { leads, capped, lookedUp: unique.size };
}
