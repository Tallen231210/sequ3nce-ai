// ============================================================================
// The part that actually asks the model, and everything that can go wrong when
// it does.
//
// Split out of compliance.ts because the preview and the real review must use
// EXACTLY the same code. A preview that succeeds where the real path fails
// tells a customer their rules are fine when they aren't.
//
// This started as `JSON.parse` on the model's text with a 2,000-token ceiling,
// and it broke in the least useful way possible: a call with a lot to flag
// produces a long answer, so the calls most worth reviewing were the ones whose
// answers got truncated. In the preview that surfaced as "could not parse". In
// the real pipeline it would have surfaced as nothing at all — and a call with
// no review looks exactly like a call that came back clean.
//
// So: the model is given a tool and forced to call it, which means the shape is
// validated before we ever see it and there is no free text to parse. Anything
// that still goes wrong is retried, and anything that survives the retries is
// recorded as a failure rather than quietly dropped.
// ============================================================================

import Anthropic from "@anthropic-ai/sdk";

/* eslint-disable @typescript-eslint/no-explicit-any */

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const MODEL = "claude-haiku-4-5-20251001";

/**
 * Ten is a working limit, not a truncation.
 *
 * A review with thirty findings isn't more useful than one with ten — it's less
 * useful, because nobody reads it and the rules that produced it were too broad
 * to act on. Bounding it here also bounds the response length, which is what
 * broke the first version.
 */
const MAX_FINDINGS = 10;

/**
 * Generous relative to a bounded ten-finding answer, so a long one has room
 * rather than being cut off mid-sentence. Truncation is still detected below —
 * headroom is not a substitute for checking.
 */
const MAX_TOKENS = 8_000;

/** Roughly 125k tokens. Beyond this the request would fail on the API instead. */
const MAX_TRANSCRIPT_CHARS = 500_000;

const MAX_ATTEMPTS = 3;

/** Consecutive words used to locate a quote in the recording. See locateQuote. */
const PROBE_WORDS = 8;

const QUOTE_MAX = 1_000;
const RULE_MAX = 300;
const CONCERN_MAX = 500;
const SUMMARY_MAX = 500;

const SYSTEM_PROMPT = `You review sales call transcripts against a specific company's own compliance rules.

You will be given: the company's rules, in their own words, and a call transcript.

Report anything in the conversation that MAY conflict with those rules, by calling the report_review tool.

How to judge:

- Review the WHOLE conversation, not just the salesperson. If a customer states something incorrect — a guaranteed return, a medical claim, a promise the company can't keep — and it is left uncorrected, that is worth reporting. Uncorrected claims are often the real risk.
- Speaker labels in transcripts are sometimes wrong. Never say who said something unless the transcript makes it unambiguous. When unsure, report what was said without attributing it.
- Quote exactly, word for word from the transcript. Do not paraphrase, tidy up grammar, or join separate passages together. The quote is looked up in the recording afterwards to find the moment, so an approximate quote loses the timestamp and a reviewer can no longer check it.
- Report only what plausibly touches THEIR stated rules. Do not invent general legal advice, and do not import rules they did not write.
- If nothing conflicts, say so and report an empty findings list. That is a good outcome, not a failure to find something.

What NOT to report. These three make the difference between a list somebody reads and one they stop opening:

- ONE FINDING PER MOMENT. If the same passage touches two or three of their rules, report it once, under the rule it conflicts with most clearly. The same quote appearing twice under different headings makes a call look worse than it is and wastes the reviewer's time.
- EVERY FINDING MUST QUOTE WORDS THAT WERE ACTUALLY SPOKEN. Do not report a question the salesperson didn't ask, a condition they didn't spell out, or a topic that never came up. The single exception is an incorrect claim left uncorrected — and that still has a quote: the claim itself.
- A CUSTOMER DESCRIBING THEIR OWN SITUATION, GOALS OR PREFERENCES IS NOT A CONFLICT. Rules about who a company should or shouldn't sell to are only touched when the conversation shows the problem happening, not when the customer merely mentions something adjacent to one.

THE BAR. Report only what you would actually raise with the salesperson afterwards. A call with real problems typically has one to three; a clean one has none. If you are reporting something because it is loosely adjacent to one of their rules rather than in genuine conflict with it, leave it out — every marginal finding makes the real ones harder to see, and a manager who reads two lists of weak findings stops opening the third.

Scoring, 1-10. Anchor it:
- 10: nothing in the conversation touches their rules.
- 7-9: minor or ambiguous — loose phrasing, something worth a word in coaching.
- 4-6: at least one clear conflict with a stated rule.
- 1-3: repeated or serious conflicts, or a claim that could plainly mislead a customer.

Never state that something IS a violation. Phrase concerns as what a reviewer should look at and why it might matter.`;

const REVIEW_TOOL: Anthropic.Tool = {
  name: "report_review",
  description:
    "Report the compliance review of this call. Call this exactly once.",
  input_schema: {
    type: "object",
    properties: {
      score: {
        type: "integer",
        minimum: 1,
        maximum: 10,
        description: "1-10, using the anchors given.",
      },
      summary: {
        type: "string",
        description:
          "One sentence a manager can read without opening the call.",
      },
      findings: {
        type: "array",
        maxItems: MAX_FINDINGS,
        description: "Empty when nothing in the call touches their rules.",
        items: {
          type: "object",
          properties: {
            rule: {
              type: "string",
              description:
                "The rule of theirs this may touch, in their own words.",
            },
            quote: {
              type: "string",
              description: "The exact words from the transcript.",
            },
            concern: {
              type: "string",
              description:
                "Why this is worth a look, phrased for a human to judge.",
            },
          },
          required: ["rule", "quote", "concern"],
        },
      },
    },
    required: ["score", "summary", "findings"],
  },
};

export interface ComplianceFinding {
  rule: string;
  quote: string;
  concern: string;
  timestamp?: number;
  speaker?: string;
}

export interface ComplianceReviewResult {
  score: number;
  summary: string;
  findings: ComplianceFinding[];
}

export type ReviewOutcome =
  | { ok: true; review: ComplianceReviewResult; attempts: number }
  | { ok: false; reason: string; attempts: number };

function clip(text: string, max: number): string {
  const t = String(text ?? "").trim();
  return t.length <= max ? t : `${t.slice(0, max - 1)}…`;
}

function normaliseQuote(quote: string): string {
  return quote.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/**
 * Is this the same moment as one already reported?
 *
 * "One finding per moment" is in the prompt and the model still breaks it, in a
 * specific way that an exact-match check sails straight past: the same sentence
 * quoted twice with one copy starting a word earlier. Observed on a real call —
 * "you should be landing a job..." and "so you should be landing a job..."
 * reported as two separate findings.
 *
 * So: same timestamp is the same moment, and either quote containing the other
 * is the same quote. Both are more aggressive than exact matching, and both err
 * toward showing a manager one finding instead of the same one twice — which is
 * the right direction, because a duplicated finding makes a call look worse
 * than it is.
 */
function isDuplicate(
  candidate: { quote: string; timestamp?: number },
  kept: { quote: string; timestamp?: number }[],
): boolean {
  const q = normaliseQuote(candidate.quote);
  if (!q) return true;

  return kept.some((k) => {
    if (
      typeof candidate.timestamp === "number" &&
      candidate.timestamp === k.timestamp
    ) {
      return true;
    }
    const other = normaliseQuote(k.quote);
    return q.includes(other) || other.includes(q);
  });
}

export interface TranscriptSegment {
  timestamp: number;
  speaker: string;
  text: string;
}

/**
 * Where in the recording a quote actually occurs.
 *
 * The model used to be asked for the timestamp directly, and it answered — but
 * `transcriptText` carries no timestamps at all, so every number it gave was a
 * guess. Two runs over the same call put the same sentence twenty minutes
 * apart. Those numbers were rendered as clickable seek links, which is worse
 * than showing nothing: a reviewer clicks, lands somewhere unrelated, and stops
 * believing the finding rather than the timestamp.
 *
 * So the model no longer reports a timestamp or a speaker. Both are looked up
 * here from the stored segments, which have real values from the recording.
 * When a quote can't be located, the finding is shown without either, and that
 * is the correct outcome — the quote itself is still checkable.
 */
function locateQuote(
  quote: string,
  index: { haystack: string; offsets: number[]; segments: TranscriptSegment[] } | null,
): { timestamp?: number; speaker?: string } {
  if (!index) return {};

  const words = normaliseQuote(quote).split(" ").filter(Boolean);
  if (words.length < PROBE_WORDS) return {};

  // Probe with a run of consecutive words rather than the head of the string.
  //
  // Model quotes are near-verbatim but not exactly: observed real cases include
  // an added leading "so", a dropped one, and an ellipsis joining two passages.
  // Anchoring on the first characters fails on all three — one wrong word at
  // the front and every probe misses. Starting a few words in, and again at a
  // quarter and half way through, recovers those without loosening the match:
  // eight consecutive words are distinctive enough that a false hit elsewhere
  // in the same call is not a realistic concern.
  const starts = [
    0,
    1,
    2,
    3,
    Math.floor(words.length * 0.25),
    Math.floor(words.length * 0.5),
  ];

  for (const start of starts) {
    if (start + PROBE_WORDS > words.length) continue;
    const probe = words.slice(start, start + PROBE_WORDS).join(" ");
    const at = index.haystack.indexOf(probe);
    if (at === -1) continue;

    // offsets[i] is where segment i starts in the haystack.
    let lo = 0;
    let hi = index.offsets.length - 1;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      if (index.offsets[mid] <= at) lo = mid;
      else hi = mid - 1;
    }
    const segment = index.segments[lo];
    if (!segment) return {};
    return {
      timestamp: Math.max(0, Math.round(segment.timestamp)),
      speaker: segment.speaker === "closer" ? "Closer" : segment.speaker === "prospect" ? "Prospect" : undefined,
    };
  }

  return {};
}

/**
 * One line per segment, and the ONLY place this format is defined.
 *
 * The lookup index below is built from the identical string, which matters: a
 * verbatim quote often includes the speaker label because that is genuinely
 * what the model was shown. Indexing the bare text instead would silently drop
 * the timestamp on exactly those findings.
 */
export function renderTranscript(segments: TranscriptSegment[]): string {
  return segments.map((s) => `${s.speaker}: ${s.text}`).join("\n");
}

/** Built once per review rather than per finding. */
function buildQuoteIndex(segments: TranscriptSegment[] | null) {
  if (!segments || segments.length === 0) return null;
  const offsets: number[] = [];
  let haystack = "";
  for (const s of segments) {
    offsets.push(haystack.length);
    haystack += `${normaliseQuote(`${s.speaker}: ${s.text}`)} `;
  }
  return { haystack, offsets, segments };
}

/**
 * Drop a speaker label the model carried into the quote.
 *
 * Cosmetic but worth doing: a finding that opens with "closer:" exposes our
 * internal formatting to a customer, and reads as though the label is part of
 * what was said.
 */
function stripLeadingLabel(quote: string): string {
  return quote.replace(/^\s*(closer|prospect|speaker\s*\d*)\s*:\s*/i, "").trim();
}

/**
 * Turn whatever the model produced into something safe to store and render.
 *
 * The tool schema guarantees the shape but not the sense: a finding can still
 * arrive with an empty quote, a duplicate of the one above it, or a timestamp
 * past the end of the call. Each of those renders as something a manager would
 * reasonably read as a bug in the product.
 *
 * Returns null when the response is incoherent enough to be worth retrying.
 */
function sanitise(
  raw: any,
  quoteIndex: ReturnType<typeof buildQuoteIndex>,
): ComplianceReviewResult | null {
  if (!raw || typeof raw !== "object") return null;
  if (typeof raw.score !== "number" || !Number.isFinite(raw.score)) return null;
  if (!Array.isArray(raw.findings)) return null;

  const findings: ComplianceFinding[] = [];

  for (const f of raw.findings) {
    if (!f || typeof f !== "object") continue;

    // Located against the raw quote, displayed without the label.
    const rawQuote = clip(f.quote, QUOTE_MAX);
    const quote = stripLeadingLabel(rawQuote);
    const rule = clip(f.rule, RULE_MAX);
    // A finding with no quote is unusable by design — the whole promise is that
    // a human can check the moment for themselves in ten seconds.
    if (!quote || !rule) continue;

    // Both come from the recording, never from the model. See locateQuote.
    const located = locateQuote(rawQuote, quoteIndex);

    const finding: ComplianceFinding = {
      rule,
      quote,
      concern: clip(f.concern, CONCERN_MAX),
      ...located,
    };

    if (isDuplicate(finding, findings)) continue;

    findings.push(finding);
    if (findings.length >= MAX_FINDINGS) break;
  }

  // The model reported findings and every one of them was unusable. That is a
  // broken response, NOT a clean call — and the difference matters enormously,
  // because a clean call is exactly what nobody looks at twice.
  if (raw.findings.length > 0 && findings.length === 0) return null;

  return {
    score: Math.max(1, Math.min(10, Math.round(raw.score))),
    summary: clip(raw.summary, SUMMARY_MAX),
    findings,
  };
}

/** Actions run in Convex's runtime, which provides setTimeout. */
function pause(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Review a transcript against a set of rules.
 *
 * Retries because every failure mode here is transient in practice — an
 * overloaded API, a response that stopped short, a finding list that came back
 * unusable. What it must never do is return a plausible-looking clean review
 * when something actually went wrong.
 */
export async function runComplianceReview(args: {
  rules: string;
  transcript: string;
  /** Used to resolve each quote to a real moment. Absent for calls with none. */
  segments?: TranscriptSegment[] | null;
}): Promise<ReviewOutcome> {
  const transcript = args.transcript.trim();
  const quoteIndex = buildQuoteIndex(args.segments ?? null);
  if (transcript.length > MAX_TRANSCRIPT_CHARS) {
    // Not retryable — it would fail identically three times.
    return {
      ok: false,
      attempts: 0,
      reason: `Transcript is ${transcript.length.toLocaleString()} characters, past the ${MAX_TRANSCRIPT_CHARS.toLocaleString()} we can review in one pass.`,
    };
  }

  const userMessage =
    `Our compliance rules:\n\n${args.rules}\n\n` +
    `---\n\nCall transcript:\n\n${transcript}`;

  let lastReason = "Unknown failure";

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const message = await anthropic.messages.create({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: SYSTEM_PROMPT,
        tools: [REVIEW_TOOL],
        // Forced, so there is no path where the model answers in prose and we
        // are left parsing English. This is the fix for "could not parse".
        tool_choice: { type: "tool", name: REVIEW_TOOL.name },
        messages: [{ role: "user", content: userMessage }],
      });

      // Checked explicitly rather than inferred from a parse error. A response
      // that stopped short is a DIFFERENT problem from a malformed one, and
      // reporting it as the latter is what hid this for a whole build.
      if (message.stop_reason === "max_tokens") {
        lastReason =
          "The review came back longer than we allow and stopped mid-answer.";
        console.warn(`[Compliance] Attempt ${attempt} failed: ${lastReason}`);
        await pause(500);
        continue;
      }

      const block = message.content.find((b) => b.type === "tool_use");
      if (!block || block.type !== "tool_use") {
        lastReason = "The model answered without reporting a review.";
        console.warn(`[Compliance] Attempt ${attempt} failed: ${lastReason}`);
        await pause(500);
        continue;
      }

      const review = sanitise(block.input, quoteIndex);
      if (!review) {
        lastReason = "The review came back in a shape we couldn't use.";
        console.warn(`[Compliance] Attempt ${attempt} failed: ${lastReason}`);
        await pause(500);
        continue;
      }

      return { ok: true, review, attempts: attempt };
    } catch (error) {
      // Overloaded, rate limited, or a network blip. Backing off is worth more
      // than failing fast: nothing downstream retries this on its own.
      lastReason = error instanceof Error ? error.message : String(error);
      console.warn(`[Compliance] Attempt ${attempt} errored: ${lastReason}`);
      if (attempt < MAX_ATTEMPTS) await pause(attempt * 1_500);
    }
  }

  return { ok: false, reason: lastReason, attempts: MAX_ATTEMPTS };
}
