// ============================================================================
// Reading the post-call form off the call itself.
//
// Closers don't fill the form in. Measured, not assumed: RemoteStack 17 of 100
// completed calls, CreateFreedom 0 of 21. `closerPerformanceMetrics.ts` has
// carried a comment about completion "ranging 6-100% across real teams" for
// months. So the form is asking a question nobody answers, and every screen
// downstream of it shows less than the truth.
//
// This reads the same facts from the transcript and writes them into the same
// fields, so nothing downstream changes. It NEVER overwrites something a human
// said — a closer's answer outranks ours permanently.
//
// Same machinery as complianceReview.ts: the model is handed a tool and forced
// to call it, so there is no free text to parse; truncation is checked rather
// than inferred from a parse failure; three attempts because nothing downstream
// retries.
//
// THE FAILURE THAT MATTERS: payment plans. A $5,000 contract taken as $500 down
// and $500 a month is the normal shape of these deals, and putting $5,000 in
// the cash field would mark it fully paid and delete a real outstanding balance
// from Collections. Hence a hard, non-negotiable guard below rather than trust
// in the prompt.
// ============================================================================

import Anthropic from "@anthropic-ai/sdk";

/* eslint-disable @typescript-eslint/no-explicit-any */

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const MODEL = "claude-haiku-4-5-20251001";
const MAX_TOKENS = 2_000;
const MAX_ATTEMPTS = 3;

/** Below this there isn't enough conversation to say anything about. */
export const MIN_TRANSCRIPT_CHARS = 200;

/** Anything past this is almost certainly a misheard figure, not a deal. */
const IMPLAUSIBLE_AMOUNT = 5_000_000;

/**
 * The outcomes the rest of the product already understands. Anything else is
 * discarded rather than stored — a novel value would silently vanish from every
 * stats query, all of which filter on these exact strings.
 */
const OUTCOMES = ["closed", "lost", "no_show", "follow_up", "rescheduled"];

/**
 * The objection list the dropdown already offered, unchanged.
 *
 * Classifying free-form objections into a fixed set is the part that has to be
 * right for Analytics to mean anything — a new label every call would make the
 * objection panels useless. The model picks from these or says "other".
 */
const OBJECTIONS = [
  "spouse_partner",
  "price_money",
  "timing",
  "need_to_think",
  "not_qualified",
  "logistics",
  "competitor",
  "other",
];

const SYSTEM_PROMPT = `You read a sales call transcript and report what factually happened on it. You are replacing a form the salesperson used to fill in themselves.

Report ONLY what the conversation actually supports. Leaving a field out is always better than guessing it — a missing number is obvious and harmless, a wrong one is believed and acted on.

OUTCOME — what happened by the end of the call:
- "closed": they agreed to buy and payment was taken or arranged.
- "lost": they declined, or made clear they aren't going ahead.
- "follow_up": no decision yet, but the conversation continues — "let me think about it", "I need to speak to my wife", another call booked.
- "no_show": the prospect never joined. Voicemail, an empty room, or only the salesperson talking.
- "rescheduled": they showed up only to move the meeting.
If the call is too short or too fragmentary to tell, omit outcome entirely.

MONEY — these two are different and confusing them is the worst error you can make:
- contractValue = the TOTAL the prospect committed to. The full price of the programme.
- cashCollected = the money actually taken TODAY, on this call.

Payment plans are normal here. "It's $5,000, we'll do $500 down and $500 a month" means contractValue 5000 and cashCollected 500 — NOT 5000. "Paid in full today" means the two are equal. If they discussed a price but paid nothing today, report contractValue and omit cashCollected.
cashCollected can never exceed contractValue. If you find yourself about to report that, you have misread a payment plan — report contractValue only.
Take the price they AGREED, not a higher figure floated earlier and then discounted. If several prices were discussed and none was agreed, report the one they were working from at the end.
Report numbers only when a figure was actually said. Never infer a price from the type of product.

OBJECTIONS — classify into exactly one of these, or omit:
${OBJECTIONS.join(", ")}
- primaryObjection: for calls that did NOT close — the main thing that stopped them.
- objectionsOvercome: for calls that DID close — the main hesitation they raised and the salesperson worked through. Use "none" if they bought without real resistance.
Pick the closest category rather than inventing one. Use "other" only when nothing fits.

Report your findings by calling the report_call tool. Omit any field you are not confident about.`;

const EXTRACTION_TOOL: Anthropic.Tool = {
  name: "report_call",
  description: "Report the facts of this sales call. Omit anything uncertain.",
  input_schema: {
    type: "object",
    properties: {
      outcome: {
        type: "string",
        enum: OUTCOMES,
        description: "What happened by the end. Omit if unclear.",
      },
      contractValue: {
        type: "number",
        description: "Total amount committed to. Omit if no price was agreed.",
      },
      cashCollected: {
        type: "number",
        description:
          "Money taken TODAY only. On a payment plan this is the deposit, not the total. Omit if nothing was paid.",
      },
      primaryObjection: {
        type: "string",
        enum: OBJECTIONS,
        description: "Main blocker on a call that did not close.",
      },
      objectionsOvercome: {
        type: "string",
        enum: [...OBJECTIONS, "none"],
        description: "Main hesitation worked through on a call that closed.",
      },
      reasoning: {
        type: "string",
        description:
          "One sentence on the money specifically: what was said, and why you split it the way you did.",
      },
    },
    required: [],
  },
};

export interface ExtractedCall {
  outcome?: string;
  contractValue?: number;
  cashCollected?: number;
  primaryObjection?: string;
  objectionsOvercome?: string;
  reasoning?: string;
  /** Guards that fired, so a dry run can show what was thrown away and why. */
  discarded: string[];
}

export type ExtractionOutcome =
  | { ok: true; data: ExtractedCall; attempts: number }
  | { ok: false; reason: string; attempts: number };

function cleanAmount(
  v: unknown,
  label: string,
  discarded: string[],
): number | undefined {
  if (typeof v !== "number" || !Number.isFinite(v)) return undefined;
  if (v < 0) {
    discarded.push(`${label}: negative`);
    return undefined;
  }
  if (v === 0) return undefined; // "nothing" is absence, not a zero deal
  if (v > IMPLAUSIBLE_AMOUNT) {
    discarded.push(`${label}: ${v} is implausible`);
    return undefined;
  }
  return Math.round(v);
}

/**
 * Everything the model returned, reduced to what we're willing to believe.
 *
 * Deterministic on purpose. The prompt explains payment plans and the model
 * will usually get them right — but "usually" is not good enough for a number
 * that decides whether we chase a customer for money, so the arithmetic is
 * checked here rather than trusted there.
 */
export function sanitiseExtraction(raw: any): ExtractedCall | null {
  if (!raw || typeof raw !== "object") return null;

  const discarded: string[] = [];
  const out: ExtractedCall = { discarded };

  if (typeof raw.outcome === "string" && OUTCOMES.includes(raw.outcome)) {
    out.outcome = raw.outcome;
  } else if (raw.outcome !== undefined) {
    discarded.push(`outcome: "${raw.outcome}" is not a known outcome`);
  }

  const contract = cleanAmount(raw.contractValue, "contractValue", discarded);
  let cash = cleanAmount(raw.cashCollected, "cashCollected", discarded);

  // THE guard. Cash above contract means a payment plan was read as a lump sum,
  // which would mark a call fully paid and erase a real balance from
  // Collections. Drop the cash rather than the contract: the total is the
  // figure we're more likely to have heard correctly, and an absent cash value
  // leaves the call looking exactly as it does today.
  if (contract !== undefined && cash !== undefined && cash > contract) {
    discarded.push(
      `cashCollected ${cash} exceeded contractValue ${contract} — likely a payment plan read as paid in full`,
    );
    cash = undefined;
  }

  if (contract !== undefined) out.contractValue = contract;
  if (cash !== undefined) out.cashCollected = cash;

  if (typeof raw.primaryObjection === "string") {
    if (OBJECTIONS.includes(raw.primaryObjection)) {
      out.primaryObjection = raw.primaryObjection;
    } else {
      out.primaryObjection = "other";
      discarded.push(`primaryObjection: "${raw.primaryObjection}" → other`);
    }
  }
  if (typeof raw.objectionsOvercome === "string") {
    if (
      OBJECTIONS.includes(raw.objectionsOvercome) ||
      raw.objectionsOvercome === "none"
    ) {
      out.objectionsOvercome = raw.objectionsOvercome;
    } else {
      out.objectionsOvercome = "other";
      discarded.push(`objectionsOvercome: "${raw.objectionsOvercome}" → other`);
    }
  }

  if (typeof raw.reasoning === "string") {
    out.reasoning = raw.reasoning.slice(0, 400);
  }

  // Objections only make sense on the matching kind of call. Keeping a
  // "primary objection" on a closed deal would corrupt the loss analysis, which
  // counts exactly those.
  if (out.outcome === "closed" && out.primaryObjection) {
    discarded.push("primaryObjection dropped on a closed call");
    delete out.primaryObjection;
  }
  if (out.outcome && out.outcome !== "closed" && out.objectionsOvercome) {
    discarded.push(`objectionsOvercome dropped on a ${out.outcome} call`);
    delete out.objectionsOvercome;
  }

  // A no-show has no money and nothing to object to, whatever was heard.
  if (out.outcome === "no_show") {
    if (out.cashCollected || out.contractValue) {
      discarded.push("money dropped on a no-show");
    }
    delete out.cashCollected;
    delete out.contractValue;
    delete out.primaryObjection;
    delete out.objectionsOvercome;
  }

  return out;
}

function pause(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function runCallExtraction(args: {
  transcript: string;
}): Promise<ExtractionOutcome> {
  const transcript = args.transcript.trim();
  if (transcript.length < MIN_TRANSCRIPT_CHARS) {
    return {
      ok: false,
      attempts: 0,
      reason: `transcript is ${transcript.length} characters — too short to read`,
    };
  }

  let lastReason = "Unknown failure";

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const message = await anthropic.messages.create({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: SYSTEM_PROMPT,
        tools: [EXTRACTION_TOOL],
        tool_choice: { type: "tool", name: EXTRACTION_TOOL.name },
        messages: [
          { role: "user", content: `Call transcript:\n\n${transcript}` },
        ],
      });

      if (message.stop_reason === "max_tokens") {
        lastReason = "the answer came back cut off";
        console.warn(`[CallExtraction] Attempt ${attempt}: ${lastReason}`);
        await pause(400);
        continue;
      }

      const block = message.content.find((b) => b.type === "tool_use");
      if (!block || block.type !== "tool_use") {
        lastReason = "the model answered without reporting";
        console.warn(`[CallExtraction] Attempt ${attempt}: ${lastReason}`);
        await pause(400);
        continue;
      }

      const data = sanitiseExtraction(block.input);
      if (!data) {
        lastReason = "the answer came back in a shape we couldn't use";
        console.warn(`[CallExtraction] Attempt ${attempt}: ${lastReason}`);
        await pause(400);
        continue;
      }

      return { ok: true, data, attempts: attempt };
    } catch (error) {
      lastReason = error instanceof Error ? error.message : String(error);
      console.warn(`[CallExtraction] Attempt ${attempt} errored: ${lastReason}`);
      if (attempt < MAX_ATTEMPTS) await pause(attempt * 1_200);
    }
  }

  return { ok: false, reason: lastReason, attempts: MAX_ATTEMPTS };
}
