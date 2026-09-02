// ============================================================================
// Rendering for the daily setter scorecard post — pure functions over the
// data shape setterScorecardNotifications.getSetterScorecardData returns, so
// the copy can be previewed from the CLI without posting anywhere.
//
// STATISTICS ONLY. This post reports what setters filed and the ratios that
// fall out of it. It never says who qualified for anything, hit a target, or
// earned a bonus — those are the manager's calls, made off the numbers, and
// the setters read this channel too.
// ============================================================================

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface SetterDayRow {
  rosterId: string;
  name: string;
  filed: boolean;
  dials: number;
  pickUps: number;
  sets: number;
  onCal: number;
  shown: number;
  closed: number;
  cash: number;
  /** false = no entry carried a cash figure (blank ≠ 0 on the handout). */
  cashReported: boolean;
  /** Week-to-date for the same setter, same week as the reported day. */
  week: { sets: number; cash: number; cashReported: boolean };
}

export interface SetterScorecardData {
  reportDayKey: string;
  weekStartKey: string;
  rows: SetterDayRow[];
  team: {
    dials: number;
    pickUps: number;
    sets: number;
    onCal: number;
    shown: number;
    closed: number;
    cash: number;
    cashReported: boolean;
  };
  week: { sets: number; cash: number; cashReported: boolean };
  filedCount: number;
  rosterCount: number;
}

const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
/** Cash as reported — "—" when nobody typed a figure (blank ≠ 0). */
const cashText = (cash: number, reported: boolean) => (reported ? money(cash) : "—");
const pct = (num: number, den: number) =>
  den > 0 ? `${Math.round((num / den) * 100)}%` : "—";
/** Cash ÷ sets. "—" until cash was reported AND there is a set. */
const perSet = (cash: number, sets: number, reported: boolean) =>
  reported && sets > 0 ? money(cash / sets) : "—";
const plural = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`;

/** "Mon 1 Sep" from a YYYY-MM-DD key. */
export function humanDay(dayKey: string): string {
  const [y, m, d] = dayKey.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

/** Slack renders at most 50 blocks; two per setter keeps a 20-seat roster inside that. */
const MAX_SETTERS_SHOWN = 20;

export function buildSetterScorecardSlackBlocks(data: SetterScorecardData): any[] {
  const t = data.team;
  const filed = data.rows.filter((r) => r.filed);
  const notFiled = data.rows.filter((r) => !r.filed);

  const blocks: any[] = [
    {
      type: "header",
      text: { type: "plain_text", text: `📋 Setter scorecard — ${humanDay(data.reportDayKey)}` },
    },
    {
      type: "section",
      fields: [
        { type: "mrkdwn", text: `*Dials*\n${t.dials}` },
        { type: "mrkdwn", text: `*Pick-ups*\n${t.pickUps}` },
        { type: "mrkdwn", text: `*Sets*\n${t.sets}` },
        { type: "mrkdwn", text: `*On calendar*\n${t.onCal}` },
        { type: "mrkdwn", text: `*Shown*\n${t.shown}` },
        { type: "mrkdwn", text: `*Closed*\n${t.closed}` },
        { type: "mrkdwn", text: `*Cash*\n${cashText(t.cash, t.cashReported)}` },
        { type: "mrkdwn", text: `*$ / set*\n${perSet(t.cash, t.sets, t.cashReported)}` },
      ],
    },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text:
            `Pickup ${pct(t.pickUps, t.dials)} · Show ${pct(t.shown, t.onCal)} · ` +
            `Set→close ${pct(t.closed, t.sets)} · filed ${data.filedCount}/${data.rosterCount}`,
        },
      ],
    },
  ];

  if (filed.length > 0) {
    blocks.push({ type: "divider" });
    blocks.push({ type: "section", text: { type: "mrkdwn", text: "*By setter*" } });
    const medals = ["🥇", "🥈", "🥉"];
    for (const [i, r] of filed.slice(0, MAX_SETTERS_SHOWN).entries()) {
      const badge = medals[i] ?? `${i + 1}.`;
      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: r.cashReported
            ? `${badge} *${r.name}* — ${money(r.cash)} · ${plural(r.sets, "set", "sets")}`
            : `${badge} *${r.name}* — ${plural(r.sets, "set", "sets")}`,
        },
        fields: [
          { type: "mrkdwn", text: `*Dials*\n${r.dials}` },
          { type: "mrkdwn", text: `*Pick-ups*\n${r.pickUps}` },
          { type: "mrkdwn", text: `*On cal*\n${r.onCal}` },
          { type: "mrkdwn", text: `*Shown*\n${r.shown}` },
          { type: "mrkdwn", text: `*Closed*\n${r.closed}` },
          { type: "mrkdwn", text: `*$ / set*\n${perSet(r.cash, r.sets, r.cashReported)}` },
        ],
      });
      blocks.push({
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text:
              `Pickup ${pct(r.pickUps, r.dials)} · Show ${pct(r.shown, r.onCal)} · ` +
              (r.week.cashReported
                ? `Week to date: ${money(r.week.cash)} · ${plural(r.week.sets, "set", "sets")} · ${perSet(r.week.cash, r.week.sets, true)}/set`
                : `Week to date: ${plural(r.week.sets, "set", "sets")}`),
          },
        ],
      });
    }
    if (filed.length > MAX_SETTERS_SHOWN) {
      blocks.push({
        type: "context",
        elements: [
          { type: "mrkdwn", text: `_+${filed.length - MAX_SETTERS_SHOWN} more setters — see the scorecard in the app._` },
        ],
      });
    }
  }

  if (notFiled.length > 0) {
    blocks.push({
      type: "context",
      elements: [
        { type: "mrkdwn", text: `No EOD filed for this day: ${notFiled.map((r) => r.name).join(", ")}` },
      ],
    });
  }

  blocks.push({ type: "divider" });
  blocks.push({
    type: "context",
    elements: [
      {
        type: "mrkdwn",
        text:
          data.week.cashReported
            ? `Week to date (from ${humanDay(data.weekStartKey)}): *${money(data.week.cash)}* · ` +
              `${plural(data.week.sets, "set", "sets")} · ${perSet(data.week.cash, data.week.sets, true)} per set`
            : `Week to date (from ${humanDay(data.weekStartKey)}): ${plural(data.week.sets, "set", "sets")} · cash not yet reported`,
      },
    ],
  });
  return blocks;
}

export function buildSetterScorecardDiscordEmbed(data: SetterScorecardData): any {
  const t = data.team;
  const filed = data.rows.filter((r) => r.filed);
  const lines = filed.slice(0, MAX_SETTERS_SHOWN).map(
    (r, i) =>
      `**${i + 1}. ${r.name}** — ${r.cashReported ? money(r.cash) + " · " : ""}${plural(r.sets, "set", "sets")} · ` +
      `dials ${r.dials} · pick-ups ${r.pickUps} · on cal ${r.onCal} · shown ${r.shown} · closed ${r.closed} · ` +
      `$/set ${perSet(r.cash, r.sets, r.cashReported)} · week ${perSet(r.week.cash, r.week.sets, r.week.cashReported)}/set`,
  );
  return {
    title: `📋 Setter scorecard — ${humanDay(data.reportDayKey)}`,
    description:
      (lines.length ? lines.join("\n") : "_No setter filed an EOD for this day._") +
      `\n\nWeek to date (from ${humanDay(data.weekStartKey)}): **${cashText(data.week.cash, data.week.cashReported)}** · ` +
      `${plural(data.week.sets, "set", "sets")} · ${perSet(data.week.cash, data.week.sets, data.week.cashReported)} per set`,
    color: 3447003,
    fields: [
      { name: "Dials", value: String(t.dials), inline: true },
      { name: "Pick-ups", value: String(t.pickUps), inline: true },
      { name: "Sets", value: String(t.sets), inline: true },
      { name: "On calendar", value: String(t.onCal), inline: true },
      { name: "Shown", value: String(t.shown), inline: true },
      { name: "Closed", value: String(t.closed), inline: true },
      { name: "Cash", value: cashText(t.cash, t.cashReported), inline: true },
      { name: "$ / set", value: perSet(t.cash, t.sets, t.cashReported), inline: true },
      { name: "Filed", value: `${data.filedCount}/${data.rosterCount}`, inline: true },
    ],
  };
}

export function setterScorecardFallbackText(data: SetterScorecardData): string {
  const t = data.team;
  return (
    `Setter scorecard ${humanDay(data.reportDayKey)}: ${t.dials} dials, ${t.sets} sets, ` +
    `${t.shown} shown, ${t.closed} closed, ${cashText(t.cash, t.cashReported)} cash (${perSet(t.cash, t.sets, t.cashReported)}/set).`
  );
}
