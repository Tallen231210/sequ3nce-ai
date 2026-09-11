// ============================================================================
// The weekly data-health post, as Slack blocks, a Discord embed, and plain
// text. Statistics only, no judgement: the score, what it is made of, and
// the lists that move it — names and counts, so the fix is obvious.
// ============================================================================

import type { DataHealthWeek } from "./dataHealthQueries";
import type { CrossCheckRange } from "./setterEodCrossCheck";
import { flagPlain } from "./lib/eodCrossCheck";
import { humanDay } from "./lib/dayLabel";
import { missingRows } from "./lib/dataHealthRows";

const pct = (v: number | null) => (v === null ? "—" : `${v}%`);
/**
 * The EOD cross-check as lines: per setter, the days whose filed numbers sat
 * outside tolerance of what Close / the calendar measured, each one saying
 * what they filed and what we saw. Statistics only; the manager judges.
 */
/** Flagged days shown per setter before "…and N more" — keeps a bad week inside Slack's 3,000-character section. */
const MAX_FLAGGED_DAYS_SHOWN = 3;
const SLACK_SECTION_MAX = 2_900;
const DISCORD_DESCRIPTION_MAX = 4_000;

const clip = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 1)}…` : s);

/** One setter's lines: the head, then at most a few flagged days with both numbers on every flag. */
export function eodCheckLinesFor(r: CrossCheckRange["byRoster"][number]): string[] {
  if (r.daysFiled === 0) return [];
  const flagged = r.days.filter((d) => d.flags.length > 0);
  const head =
    `${r.name}: filed ${r.daysFiled} of ${r.daysDue} days` +
    (flagged.length === 0 ? ", every day matches the CRM and the calendar." : `, ${flagged.length} ${flagged.length === 1 ? "day doesn't" : "days don't"} match:`);
  const lines = [head];
  for (const d of flagged.slice(0, MAX_FLAGGED_DAYS_SHOWN)) lines.push(`  ${humanDay(d.dayKey)} — ${d.flags.map(flagPlain).join("; ")}`);
  if (flagged.length > MAX_FLAGGED_DAYS_SHOWN) lines.push(`  …and ${flagged.length - MAX_FLAGGED_DAYS_SHOWN} more ${flagged.length - MAX_FLAGGED_DAYS_SHOWN === 1 ? "day" : "days"} — the Setters page has them all.`);
  return lines;
}

export function eodCheckLines(c: CrossCheckRange | null | undefined): string[] {
  if (!c) return [];
  return c.byRoster.flatMap(eodCheckLinesFor);
}

/** One Slack section per setter, each clipped to Slack's limit, under one heading. */
export function eodCheckBlocks(c: CrossCheckRange | null | undefined): any[] {
  if (!c) return [];
  const perSetter = c.byRoster.map((r) => eodCheckLinesFor(r)).filter((lines) => lines.length > 0);
  if (perSetter.length === 0) return [];
  // Slack allows 50 blocks a message; one section per setter up to 40, the rest folded into one.
  const MAX_SECTIONS = 40;
  const head = perSetter.slice(0, MAX_SECTIONS).map((lines) => ({ type: "section", text: { type: "mrkdwn", text: clip(lines.join("\n"), SLACK_SECTION_MAX) } }));
  const tail = perSetter.slice(MAX_SECTIONS);
  const folded = tail.length > 0 ? [{ type: "section", text: { type: "mrkdwn", text: clip(tail.map((l) => l[0]).join("\n"), SLACK_SECTION_MAX) } }] : [];
  return [{ type: "section", text: { type: "mrkdwn", text: "*End-of-day forms vs the CRM and the calendar*" } }, ...head, ...folded];
}

export function dataHealthLines(d: DataHealthWeek): string[] {
  const a = d.accuracy;
  const lines: string[] = [];
  lines.push(`${pct(a.score)} of finished calls have everything we need — ${a.allKnown} of ${a.due}.`);
  // Source and contact are shares of every booking; the show verdict is a
  // share of the ones that have finished. Saying so keeps them from reading
  // as three slices of the same number.
  lines.push(
    `Of all ${a.bookings} bookings we know where ${pct(a.sourcePct)} came from and who contacted ${pct(a.contactPct)}. Of the ${a.due} that have finished, we know whether ${pct(a.showPct)} showed up.`,
  );
  lines.push(
    `Bookings ${d.bookings}: DM ${d.lanes.dm} · outbound ${d.lanes.outbound} · confirmation ${d.lanes.confirmation} · booked themselves and nobody contacted them ${d.lanes.selfBookedUncontacted} · no setter named ${d.lanes.unattributed}` +
      (d.followUps > 0 ? ` · ${d.followUps} follow-ups not counted as sets` : "") +
      ".",
  );
  const rows = missingRows(d);
  if (rows.length === 0) lines.push("• Nothing is missing this week.");
  for (const r of rows) {
    lines.push(`• ${r.label}: ${r.count}`);
    for (const detail of r.detail) lines.push(`   ${detail}`);
  }
  if (d.claimedThisWeek > 0) lines.push(`${d.claimedThisWeek} ${d.claimedThisWeek === 1 ? "booking was" : "bookings were"} claimed or assigned this week.`);
  if (d.truncated.length > 0) lines.push("Part of this week was too busy to read in one go, so a few of these counts may be low.");
  return lines;
}

export function dataHealthFallbackText(d: DataHealthWeek, checks?: CrossCheckRange | null): string {
  const eod = eodCheckLines(checks);
  return `Is the data complete? · week of ${humanDay(d.weekStartKey)}\n${dataHealthLines(d).join("\n")}` + (eod.length ? `\nEnd-of-day forms vs the CRM and the calendar\n${eod.join("\n")}` : "");
}

export function buildDataHealthSlackBlocks(d: DataHealthWeek, checks?: CrossCheckRange | null): any[] {
  const lines = dataHealthLines(d);
  const [score, parts, lanes, ...rest] = lines;
  return [
    { type: "header", text: { type: "plain_text", text: `Is the data complete? · week of ${humanDay(d.weekStartKey)}`, emoji: false } },
    { type: "section", text: { type: "mrkdwn", text: `*${score}*\n${parts}` } },
    { type: "context", elements: [{ type: "mrkdwn", text: lanes }] },
    // Every row carries a line of names under it now, so this can run long on
    // a bad week. Slack rejects a section over 3,000 characters and the whole
    // post fails with it, so clip it like the per-setter blocks below.
    { type: "section", text: { type: "mrkdwn", text: clip(`*What\u2019s missing, and who can fix it*\n${rest.join("\n")}`, SLACK_SECTION_MAX) } },
    ...eodCheckBlocks(checks),
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: "A call counts as complete when we know three things: where it came from, who contacted them, and whether they showed up. Anything we can't prove stays unknown rather than being guessed.",
        },
      ],
    },
  ];
}

export function buildDataHealthDiscordEmbed(d: DataHealthWeek, checks?: CrossCheckRange | null): any {
  const eod = eodCheckLines(checks);
  return {
    title: `Is the data complete? · week of ${humanDay(d.weekStartKey)}`,
    description: clip(dataHealthLines(d).join("\n") + (eod.length ? `\n\n**End-of-day forms vs the CRM and the calendar**\n${eod.join("\n")}` : ""), DISCORD_DESCRIPTION_MAX),
    color: 0x0d9488,
  };
}
