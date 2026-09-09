// ============================================================================
// The weekly data-health post, as Slack blocks, a Discord embed, and plain
// text. Statistics only, no judgement: the score, what it is made of, and
// the lists that move it — names and counts, so the fix is obvious.
// ============================================================================

import type { DataHealthWeek } from "./dataHealthQueries";

/** "Mon 1 Sep" from a day key. */
export function humanDay(dayKey: string): string {
  const [y, m, d] = dayKey.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}

const pct = (v: number | null) => (v === null ? "—" : `${v}%`);
const named = (rows: Array<{ name: string; count: number }>, max = 6) =>
  rows.slice(0, max).map((r) => `${r.name} ${r.count}`).join(", ") + (rows.length > max ? ", …" : "");

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

export function dataHealthFallbackText(d: DataHealthWeek): string {
  return `Data health · week of ${humanDay(d.weekStartKey)}\n${dataHealthLines(d).join("\n")}`;
}

export function buildDataHealthSlackBlocks(d: DataHealthWeek): any[] {
  const lines = dataHealthLines(d);
  const [score, parts, lanes, ...rest] = lines;
  return [
    { type: "header", text: { type: "plain_text", text: `Data health · week of ${humanDay(d.weekStartKey)}`, emoji: false } },
    { type: "section", text: { type: "mrkdwn", text: `*${score}*\n${parts}` } },
    { type: "context", elements: [{ type: "mrkdwn", text: lanes }] },
    { type: "section", text: { type: "mrkdwn", text: `*What moves it*\n${rest.join("\n")}` } },
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

export function buildDataHealthDiscordEmbed(d: DataHealthWeek): any {
  return {
    title: `Data health · week of ${humanDay(d.weekStartKey)}`,
    description: dataHealthLines(d).join("\n"),
    color: 0x0d9488,
  };
}
