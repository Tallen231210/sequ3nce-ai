// ============================================================================
// The weekly data-health post, as Slack blocks, a Discord embed, and plain
// text. Statistics only, no judgement: the score, what it is made of, and
// the lists that move it — names and counts, so the fix is obvious.
// ============================================================================

import type { DataHealthWeek } from "./dataHealthQueries";
import type { CrossCheckRange } from "./setterEodCrossCheck";
import { flagText } from "./lib/eodCrossCheck";

/** "Mon 1 Sep" from a day key. */
export function humanDay(dayKey: string): string {
  const [y, m, d] = dayKey.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}

const pct = (v: number | null) => (v === null ? "—" : `${v}%`);
const named = (rows: Array<{ name: string; count: number }>, max = 6) =>
  rows.slice(0, max).map((r) => `${r.name} ${r.count}`).join(", ") + (rows.length > max ? ", …" : "");

/**
 * The EOD cross-check as lines: per setter, the days whose filed numbers sat
 * outside tolerance of what Close / the calendar measured — both numbers on
 * every one. Statistics only; the manager decides what a gap means.
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
  const head = `${r.name}: filed ${r.daysFiled} of ${r.daysDue} due days` + (flagged.length === 0 ? ", all within tolerance of Close and the calendar." : `, ${flagged.length} off vs measured:`);
  const lines = [head];
  for (const d of flagged.slice(0, MAX_FLAGGED_DAYS_SHOWN)) lines.push(`  ${humanDay(d.dayKey)} — ${d.flags.map(flagText).join(" · ")}`);
  if (flagged.length > MAX_FLAGGED_DAYS_SHOWN) lines.push(`  …and ${flagged.length - MAX_FLAGGED_DAYS_SHOWN} more ${flagged.length - MAX_FLAGGED_DAYS_SHOWN === 1 ? "day" : "days"} off — the Setters page has them all.`);
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
  return [{ type: "section", text: { type: "mrkdwn", text: "*EODs vs Close and the calendar*" } }, ...head, ...folded];
}

export function dataHealthLines(d: DataHealthWeek): string[] {
  const a = d.accuracy;
  const lines: string[] = [];
  lines.push(`Accuracy ${pct(a.score)} — ${a.allKnown} of ${a.due} due bookings had source, contact and show known.`);
  lines.push(
    `Source known ${pct(a.sourcePct)} · contact known ${pct(a.contactPct)} (of all ${a.bookings}) · show verdict known ${pct(a.showPct)} (of ${a.due} due).`,
  );
  lines.push(
    `Bookings ${d.bookings}: DM ${d.lanes.dm} · outbound ${d.lanes.outbound} · confirmation ${d.lanes.confirmation} · self-booked not contacted ${d.lanes.selfBookedUncontacted} · needs a look ${d.lanes.unattributed}` +
      (d.followUps > 0 ? ` · ${d.followUps} follow-ups not counted as sets` : "") +
      ".",
  );
  const drags: string[] = [];
  if (d.drags.untaggedSelfBooks.total > 0) drags.push(`Self-booked calls with no tag: ${d.drags.untaggedSelfBooks.total} (${named(d.drags.untaggedSelfBooks.byCloser)})`);
  if (d.drags.missingInitials.total > 0) drags.push(`Sets credited from Close only, initials missing: ${d.drags.missingInitials.total} (${named(d.drags.missingInitials.bySetter)})`);
  if (d.drags.unlabeledTouched.total > 0) drags.push(`Unlabeled bookings a setter worked, no initials: ${d.drags.unlabeledTouched.total} (${named(d.drags.unlabeledTouched.bySetter)})` + (d.claimedThisWeek > 0 ? `. Claims and assignments made this week (any booking): ${d.claimedThisWeek}` : ""));
  if (d.drags.notRecolored.total > 0) drags.push(`Calls not recoloured after the call: ${d.drags.notRecolored.total} (${named(d.drags.notRecolored.byCloser)})`);
  if (d.drags.handMadeUntagged > 0) drags.push(`Hand-made bookings with no tag and no Close touch: ${d.drags.handMadeUntagged}`);
  if (d.drags.leadMissing > 0) drags.push(`Funnel bookings with no lead in Close: ${d.drags.leadMissing}`);
  for (const e of d.drags.eodMissed) {
    if (e.days.length > 0) drags.push(`${e.name}'s EOD not filed: ${e.days.map(humanDay).join(", ")}`);
  }
  if (drags.length === 0) drags.push("Nothing dragging the score down this week.");
  lines.push(...drags.map((s) => `• ${s}`));
  if (d.truncated.length > 0) lines.push(`Partial: some reads hit their cap (${d.truncated.join(", ")}).`);
  return lines;
}

export function dataHealthFallbackText(d: DataHealthWeek, checks?: CrossCheckRange | null): string {
  const eod = eodCheckLines(checks);
  return `Data health · week of ${humanDay(d.weekStartKey)}\n${dataHealthLines(d).join("\n")}` + (eod.length ? `\nEODs vs Close and the calendar\n${eod.join("\n")}` : "");
}

export function buildDataHealthSlackBlocks(d: DataHealthWeek, checks?: CrossCheckRange | null): any[] {
  const lines = dataHealthLines(d);
  const [score, parts, lanes, ...rest] = lines;
  return [
    { type: "header", text: { type: "plain_text", text: `Data health · week of ${humanDay(d.weekStartKey)}`, emoji: false } },
    { type: "section", text: { type: "mrkdwn", text: `*${score}*\n${parts}` } },
    { type: "context", elements: [{ type: "mrkdwn", text: lanes }] },
    { type: "section", text: { type: "mrkdwn", text: `*What moves it*\n${rest.join("\n")}` } },
    ...eodCheckBlocks(checks),
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: "Known = a booking link or a setter on the event; a tag, a Close touch, or a lead in Close; a logged outcome, the recording, or a post-call colour we watched change. Unknown stays unknown.",
        },
      ],
    },
  ];
}

export function buildDataHealthDiscordEmbed(d: DataHealthWeek, checks?: CrossCheckRange | null): any {
  const eod = eodCheckLines(checks);
  return {
    title: `Data health · week of ${humanDay(d.weekStartKey)}`,
    description: clip(dataHealthLines(d).join("\n") + (eod.length ? `\n\n**EODs vs Close and the calendar**\n${eod.join("\n")}` : ""), DISCORD_DESCRIPTION_MAX),
    color: 0x0d9488,
  };
}
