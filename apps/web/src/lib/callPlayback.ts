// ============================================================================
// "How do I play this call, and where?"
//
// One question, asked from four places, previously answered four different
// ways — which is how the Completed Calls page came to tell a customer "no
// recording available" for five calls that all had perfectly good recordings.
//
// The assumption everywhere predates Fathom: a recording means a video file WE
// host, at `recordingUrl`. That was true when our own bot was the only source.
// A Fathom call has no such file — the media stays on Fathom's side and we only
// ever get a link to their player. Anywhere that asks "does this call have a
// recording?" by checking `recordingUrl` is therefore wrong on the Oversight
// tier, and grep won't find them all because some phrase it as a query filter
// rather than a check.
//
// So: ask here instead. A new source of recordings should mean one new branch
// in this file, not a hunt through the app.
// ============================================================================

export type CallPlayback =
  /** We host the file and can play it inline. */
  | { kind: "video"; url: string }
  | { kind: "audio"; url: string }
  /** Someone else hosts it. All we can do is send the viewer there. */
  | { kind: "external"; url: string; provider: string }
  /** Genuinely nothing — not "we didn't look in the right field". */
  | { kind: "none" };

/** Only the fields that bear on playback; every caller has a superset. */
export interface PlayableCall {
  recordingUrl?: string | null;
  recordingType?: string | null;
  externalShareUrl?: string | null;
  source?: string | null;
}

/** Human name for whoever holds the recording, for button copy. */
function providerName(source: string | null | undefined): string {
  if (source === "fathom") return "Fathom";
  return "the recorder";
}

/**
 * Our own file wins when we have one.
 *
 * A call can legitimately have both — a bot recording plus an external link —
 * and an inline player beats sending someone to another tab.
 */
export function resolvePlayback(call: PlayableCall): CallPlayback {
  if (call.recordingUrl) {
    return call.recordingType === "video"
      ? { kind: "video", url: call.recordingUrl }
      : { kind: "audio", url: call.recordingUrl };
  }

  if (call.externalShareUrl) {
    return {
      kind: "external",
      url: call.externalShareUrl,
      provider: providerName(call.source),
    };
  }

  return { kind: "none" };
}

/**
 * Is there anything to watch at all?
 *
 * The predicate list views want. Deliberately not `!!recordingUrl`, which is
 * the exact mistake this module exists to stop.
 */
export function hasRecording(call: PlayableCall): boolean {
  return resolvePlayback(call).kind !== "none";
}
