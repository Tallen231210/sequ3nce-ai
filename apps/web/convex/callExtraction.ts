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

/** A handful is a real call; a dozen is the model narrating. */
const MAX_OBJECTIONS = 6;

/**
 * Anything that outranks "I need to think about it", most actionable first.
 *
 * "Need to think" is the objection people give when they won't name the real
 * one, so whenever a concrete reason is also on the table it is the better
 * answer — "I need to think about the price" is a price objection. "other" is
 * absent deliberately: it is not more specific than thinking, it's just vaguer
 * in a different way.
 */
const MORE_SPECIFIC_THAN_THINKING = [
  "price_money",
  "spouse_partner",
  "not_qualified",
  "competitor",
  "logistics",
  "timing",
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

OBJECTIONS — the categories are:
${OBJECTIONS.join(", ")}

This is NOT optional on a real conversation. A call that ended without a sale ended that way for a reason, and the reason was nearly always said out loud. If the outcome is lost, follow_up or rescheduled, report an objection.

Judge what is BLOCKING them, not which words they used. The same words mean different things:
- spouse_partner — they need another person's agreement. A spouse, a business partner, a parent.
- price_money — the money is the problem. Too expensive, can't afford it, hasn't got it yet, needs to free it up, waiting on a payment, needs to sell something first.
- timing — something in their LIFE makes now impossible, independent of your offer. A family illness, a house move, a busy season, a trip. Test it: if that circumstance vanished, would they buy today? Only if yes is it timing.
- need_to_think — they want time to DECIDE. Nothing external is stopping them but their own mind. "I need to think about it", "let me sit on it", "give me a couple of days", "I just need some time", "can I get back to you". Time to think is NOT timing, however they phrase it.
- not_qualified — wrong fit. Doesn't meet the requirements, or the programme can't do what they need.
- logistics — a practical blocker. Visa, location, equipment, working hours, technical.
- competitor — considering or already using someone else.
- other — a reason was given and none of these fit.

MOST CALLS RAISE MORE THAN ONE. List every distinct objection in "objections", in the order raised. Then pick ONE for primaryObjection using these rules, in order:

1. Take the DEEPEST one, not the first. A stated objection is often cover for the real one, and a good salesperson probes past it. "I need to speak to my wife" → salesperson asks what specifically → "honestly it's the price" — the real objection is price_money. The wife was the surface. Report what was actually standing between them and yes at the END.

2. need_to_think is the WEAKEST label. It is what people say when they will not name the real reason. If any more specific objection is also present, report that one instead. "I need to think about the price" is price_money, not need_to_think. Only use need_to_think when thinking is genuinely all there is.

3. If money is any part of it, it is price_money. "Give me a couple of weeks to get the money together" is money, not timing — the money is the blocker and the weeks are just how long it takes.

4. Otherwise take whichever is most concrete and specific.

- primaryObjection: the single root, by those rules — for calls that did NOT close.
- objections: every one raised, in order. Include the surface ones the salesperson worked past — that trail is the point.
- objectionsOvercome: for calls that DID close — the main hesitation raised and worked through. "none" if they bought without real resistance.

If a call ended with no reason given at all, use "other" — never reach for need_to_think as a catch-all. The only calls with no objection are ones where nobody turned up: on a no_show, report nothing.

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
        description:
          "The single ROOT blocker on a call that did not close — the deepest one, not the first one said.",
      },
      objections: {
        type: "array",
        items: { type: "string", enum: OBJECTIONS },
        description:
          "Every distinct objection raised, in the order it came up, including surface ones the salesperson worked past.",
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
  objections?: string[];
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
  if (Array.isArray(raw.objections)) {
    const seen = new Set<string>();
    for (const o of raw.objections) {
      if (typeof o === "string" && OBJECTIONS.includes(o)) seen.add(o);
    }
    if (out.primaryObjection) seen.add(out.primaryObjection);
    if (seen.size > 0) out.objections = [...seen].slice(0, MAX_OBJECTIONS);
  } else if (out.primaryObjection) {
    out.objections = [out.primaryObjection];
  }

  // Derive the single answer when only the list came back.
  //
  // Given both fields the model will sometimes fill the list, consider the
  // question answered, and leave primaryObjection empty — which would be a
  // silent regression, because every chart, filter and deep link reads the
  // single field and none of them read the list. So the list is allowed to
  // answer for it.
  //
  // Same ranking as the prompt asks for: ignore the vague labels while a
  // concrete one is present, then take the LAST of what remains, because
  // objections surface in order and the one they end on is the real one.
  if (!out.primaryObjection && out.objections?.length) {
    const concrete = out.objections.filter((o) =>
      MORE_SPECIFIC_THAN_THINKING.includes(o),
    );
    const pool = concrete.length > 0 ? concrete : out.objections;
    out.primaryObjection = pool[pool.length - 1];
  }

  // Two deterministic backstops for the ranking rules, because the ordering is
  // the part a prompt is least reliable at and the part that decides what a
  // manager does next.
  //
  // Both come from how these calls actually go: "need to think" is what people
  // say instead of naming the real reason, and "a couple of weeks to get the
  // money together" is a money problem wearing timing's clothes. In both cases
  // the more specific objection is the one worth acting on.
  if (out.objections && out.objections.length > 1 && out.primaryObjection) {
    const promote = (from: string, candidates: string[]) => {
      if (out.primaryObjection !== from) return;
      const better = candidates.find((c) => out.objections!.includes(c));
      if (!better) return;
      discarded.push(`primaryObjection: ${from} → ${better} (more specific)`);
      out.primaryObjection = better;
    };
    promote("need_to_think", MORE_SPECIFIC_THAN_THINKING);
    promote("timing", ["price_money"]);
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
    delete out.objections;
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
