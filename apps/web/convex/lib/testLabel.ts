// ============================================================================
// The "this is a test" stamp. A test send is a real message into a real
// channel — without a label it is indistinguishable from the scheduled one,
// which is how a manager reports a duplicate-notification bug (E2,
// 2026-08-24: the "double" EOD nudge was their own test button).
// ============================================================================

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Append a muted context line to Slack blocks. Returns a new array. */
export function withSlackTestLabel(blocks: any[]): any[] {
  return [
    ...blocks,
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: "⚙️ Test message — sent manually from settings. The scheduled one still arrives on time.",
        },
      ],
    },
  ];
}

/** Stamp a Discord embed's footer. Mutates and returns the embed. */
export function withDiscordTestLabel<T extends { footer?: { text: string } }>(
  embed: T,
): T {
  embed.footer = { text: "⚙️ Test message — sent manually from settings" };
  return embed;
}
