// ============================================================================
// Who touched which lead, from Close activity: one indexed scan per roster
// member with a CRM user over the window plus a week back, and one scan of
// inbound texts. Closers' confirmation dials are deliberately not read — they
// are not setting. Feeds the setter-team pass (setterTeamBookings).
// ============================================================================

import type { QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import type { RosterRef } from "./lib/setterTeamAttribution";

const TOUCH_TAKE = 6_000;
const INBOUND_TAKE = 5_000;

export interface RawTouch {
  crmUserId: string;
  kind: "dial" | "sms";
  at: number;
}

export interface SetterTouches {
  /** Close lead id → outbound dials and texts by roster members. */
  touchesByContact: Map<string, RawTouch[]>;
  /** "lead|user" → times a call by that user connected (≥ the team's threshold). */
  connectedByContactUser: Map<string, number[]>;
  /** Close lead id → times the lead texted back. */
  inboundByContact: Map<string, number[]>;
  truncated: string[];
}

export async function loadSetterTouches(
  ctx: QueryCtx,
  teamId: Id<"teams">,
  rosters: RosterRef[],
  fromMs: number,
  toMs: number,
): Promise<SetterTouches> {
  const truncated: string[] = [];
  const touchesByContact = new Map<string, RawTouch[]>();
  const connectedByContactUser = new Map<string, number[]>();
  const inboundByContact = new Map<string, number[]>();

  for (const r of rosters) {
    if (!r.crmUserId) continue;
    const crmUserId = r.crmUserId;
    const rows = await ctx.db
      .query("setterLeadEvents")
      .withIndex("by_team_and_setter_and_time", (q) =>
        q.eq("teamId", teamId).eq("ghlUserId", crmUserId).gte("occurredAt", fromMs).lte("occurredAt", toMs),
      )
      .take(TOUCH_TAKE);
    if (rows.length >= TOUCH_TAKE) truncated.push(`touches:${r.name}`);
    for (const e of rows) {
      if (e.eventType === "dial_outbound" || e.eventType === "sms_outbound") {
        const list = touchesByContact.get(e.ghlContactId) ?? [];
        list.push({ crmUserId, kind: e.eventType === "dial_outbound" ? "dial" : "sms", at: e.occurredAt });
        touchesByContact.set(e.ghlContactId, list);
      } else if (e.eventType === "connected") {
        const k = `${e.ghlContactId}|${crmUserId}`;
        const list = connectedByContactUser.get(k) ?? [];
        list.push(e.occurredAt);
        connectedByContactUser.set(k, list);
      }
    }
  }

  const inbound = await ctx.db
    .query("setterLeadEvents")
    .withIndex("by_team_and_type_and_time", (q) =>
      q.eq("teamId", teamId).eq("eventType", "sms_inbound").gte("occurredAt", fromMs).lte("occurredAt", toMs),
    )
    .take(INBOUND_TAKE);
  if (inbound.length >= INBOUND_TAKE) truncated.push("inbound");
  for (const e of inbound) {
    const list = inboundByContact.get(e.ghlContactId) ?? [];
    list.push(e.occurredAt);
    inboundByContact.set(e.ghlContactId, list);
  }

  return { touchesByContact, connectedByContactUser, inboundByContact, truncated };
}
