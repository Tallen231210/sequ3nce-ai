import Anthropic from "@anthropic-ai/sdk";

/* eslint-disable @typescript-eslint/no-explicit-any */

// ============================================================================
// Reading a manager's meeting.
//
// Pure: takes a transcript, returns a shape. No database access, so it can be
// exercised against a pasted transcript without waiting for a real meeting —
// the same split callExtraction uses, and the reason its objection logic could
// be tested against situations that hadn't happened yet.
//
// What this deliberately does NOT do is judge anyone. It reports what was said
// and what was agreed. Whether an agreement was kept is answered later, from
// numbers we already hold, and only where we hold them.
// ============================================================================

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const MODEL = "claude-haiku-4-5-20251001";
const MAX_TOKENS = 2000;
const MAX_ATTEMPTS = 3;

/** Below this a transcript is a greeting and a disconnect, not a meeting. */
const MIN_TRANSCRIPT_CHARS = 400;

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

export type MeetingKind = "one_to_one" | "team" | "leadership" | "interview" | "other";

export interface ManagerMeetingAnalysis {
  kind: MeetingKind;
  summary: string;
  topics: string[];
  actionItems: Array<{ who: string; what: string }>;
  agreements: Array<{ who: string; what: string; measurable: boolean }>;
  /** Interviews only. Null everywhere else. */
  candidateName: string | null;
  role: "closer" | "setter" | null;
  talkingPoints: string[];
}

const SYSTEM_PROMPT = `You read the recording of a SALES MANAGER's internal meeting and report what happened.

These are never sales calls. There is no prospect, no deal, no money to collect. Do not report outcomes, objections or revenue.

A manager's meeting is one of:
- one_to_one: the manager and ONE person from their sales team. Coaching, pipeline, performance.
- team: the manager and several reps. Announcements, training, targets.
- leadership: the manager with owners or executives. Decisions, headcount, forecast.
- interview: the manager and a CANDIDATE who does not work here yet.
- other: anything else.

Decide the kind from what is actually discussed, not from the meeting title. A meeting called "1:1" that turns out to be an interview is an interview.

RULES

Summary: what the meeting was actually about, in three or four sentences. Write it for someone who wasn't there and needs to know what happened, not a list of headings.

Topics: what was covered. Short phrases, not sentences.

Agreements: EVERY thing a person said they will do, in their own words as closely as possible. This is the most important field in the report.

If someone said they will do it, it is an agreement. It does not matter whether it sounds like a task, a habit, a one-off or a promise. "I'll get those in tonight" is an agreement. "Will do" in answer to a request is an agreement. Do not leave a commitment out of this list because it also looks like an action item — the two lists are allowed to overlap and usually should.

Set measurable=true ONLY when a number or a record could later settle whether it happened:
- filling in end-of-day reports — yes, we can count the days
- chasing a specific customer's outstanding balance — yes, we know when it clears
- following up with a NAMED person — yes, we can see whether that call happened
- a count of anything: "twenty dials a day", "pitch on every call" — yes

Set measurable=false for anything about behaviour, effort, attitude or technique:
- "use the new objection handling" — no
- "be more consistent" — no
- "have better energy" — no
- "ask better questions" — no

If you are unsure, measurable is false. Never mark something measurable because it sounds important; the only question is whether a record could settle it.

Action items: things that need doing which nobody explicitly committed to out loud — a manager assigning something with no reply, or a task left hanging. If the person agreed to it, it belongs in agreements, and it may appear in both. If nothing was left hanging, return an empty list. Do not invent tidy follow-ups to fill the space.

INTERVIEWS

For interviews only, also report:
- candidateName: the person being interviewed, if said aloud. Null if never stated.
- role: "closer" or "setter" if clear from the conversation. Null otherwise.
- talkingPoints: the things worth remembering about this candidate — what they claimed about their numbers, why they left their last role, what they asked about, anything that stood out.

Do NOT assess, score, rank or recommend a candidate. No "strong communicator", no "good fit", no "would hire". Report what was said and let the manager judge. This is not caution about phrasing — an opinion here is worth nothing and costs trust in everything else on the page.

For non-interviews, candidateName and role are null and talkingPoints is empty.`;

const ANALYSIS_TOOL: Anthropic.Tool = {
  name: "report_meeting",
  description: "Report what happened in this manager's meeting.",
  input_schema: {
    type: "object",
    properties: {
      kind: {
        type: "string",
        enum: ["one_to_one", "team", "leadership", "interview", "other"],
      },
      summary: { type: "string" },
      topics: { type: "array", items: { type: "string" } },
      actionItems: {
        type: "array",
        items: {
          type: "object",
          properties: { who: { type: "string" }, what: { type: "string" } },
          required: ["who", "what"],
        },
      },
      agreements: {
        type: "array",
        items: {
          type: "object",
          properties: {
            who: { type: "string" },
            what: { type: "string" },
            measurable: { type: "boolean" },
          },
          required: ["who", "what", "measurable"],
        },
      },
      candidateName: { type: ["string", "null"] },
      role: { type: ["string", "null"], enum: ["closer", "setter", null] },
      talkingPoints: { type: "array", items: { type: "string" } },
    },
    required: ["kind", "summary", "topics", "actionItems", "agreements"],
  },
};

/**
 * Force the shape, and drop anything that doesn't belong.
 *
 * The model reliably fills fields it was given even when they don't apply —
 * callExtraction learned this when a recruitment call came back reported as a
 * closed deal, purely because every field it had was a sales field.
 */
export function sanitiseAnalysis(raw: any): ManagerMeetingAnalysis | null {
  if (!raw || typeof raw !== "object") return null;
  if (typeof raw.summary !== "string" || raw.summary.trim().length === 0) return null;

  const kinds = ["one_to_one", "team", "leadership", "interview", "other"];
  const kind: MeetingKind = kinds.includes(raw.kind) ? raw.kind : "other";

  const strList = (v: any): string[] =>
    Array.isArray(v)
      ? v.filter((x) => typeof x === "string" && x.trim()).map((s: string) => s.trim()).slice(0, 20)
      : [];

  const pairList = (v: any) =>
    Array.isArray(v)
      ? v
          .filter(
            (x) =>
              x && typeof x.who === "string" && typeof x.what === "string" && x.what.trim(),
          )
          .map((x: any) => ({ who: x.who.trim(), what: x.what.trim() }))
          .slice(0, 20)
      : [];

  const agreements = Array.isArray(raw.agreements)
    ? raw.agreements
        .filter(
          (x: any) =>
            x && typeof x.who === "string" && typeof x.what === "string" && x.what.trim(),
        )
        .map((x: any) => ({
          who: x.who.trim(),
          what: x.what.trim(),
          // Default to false. A wrongly-measurable agreement puts a number
          // next to a promise we cannot actually check, which is the one way
          // this feature could lie.
          measurable: x.measurable === true,
        }))
        .slice(0, 20)
    : [];

  const out: ManagerMeetingAnalysis = {
    kind,
    summary: raw.summary.trim(),
    topics: strList(raw.topics),
    actionItems: pairList(raw.actionItems),
    agreements,
    candidateName: null,
    role: null,
    talkingPoints: [],
  };

  // Interview fields exist only on interviews. Enforced here rather than
  // trusted from the prompt, because a candidate name attached to a team
  // meeting would put a stranger into the manager's hiring list.
  if (kind === "interview") {
    out.candidateName =
      typeof raw.candidateName === "string" && raw.candidateName.trim()
        ? raw.candidateName.trim().slice(0, 120)
        : null;
    out.role = raw.role === "closer" || raw.role === "setter" ? raw.role : null;
    out.talkingPoints = strList(raw.talkingPoints);
  }

  return out;
}

export async function analyseMeetingTranscript(
  transcript: string,
): Promise<
  | { ok: true; data: ManagerMeetingAnalysis; attempts: number }
  | { ok: false; reason: string; attempts: number }
> {
  if (!transcript || transcript.trim().length < MIN_TRANSCRIPT_CHARS) {
    return {
      ok: false,
      reason: `transcript is ${transcript?.trim().length ?? 0} characters — too short to read`,
      attempts: 0,
    };
  }

  let lastReason = "Unknown failure";

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const message = await anthropic.messages.create({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: SYSTEM_PROMPT,
        tools: [ANALYSIS_TOOL],
        tool_choice: { type: "tool", name: ANALYSIS_TOOL.name },
        messages: [{ role: "user", content: `Meeting transcript:\n\n${transcript}` }],
      });

      // A truncated answer is a half-written summary and a cut-off agreement
      // list, which reads as complete. Retry rather than store it.
      if (message.stop_reason === "max_tokens") {
        lastReason = "the answer came back cut off";
        console.warn(`[managerAnalysis] Attempt ${attempt}: ${lastReason}`);
        await pause(400);
        continue;
      }

      const block = message.content.find((b) => b.type === "tool_use");
      if (!block || block.type !== "tool_use") {
        lastReason = "the model answered without reporting";
        console.warn(`[managerAnalysis] Attempt ${attempt}: ${lastReason}`);
        await pause(400);
        continue;
      }

      const data = sanitiseAnalysis(block.input);
      if (!data) {
        lastReason = "the answer came back in a shape we couldn't use";
        console.warn(`[managerAnalysis] Attempt ${attempt}: ${lastReason}`);
        await pause(400);
        continue;
      }

      return { ok: true, data, attempts: attempt };
    } catch (error) {
      lastReason = error instanceof Error ? error.message : String(error);
      console.warn(`[managerAnalysis] Attempt ${attempt} errored: ${lastReason}`);
      if (attempt < MAX_ATTEMPTS) await pause(attempt * 1_200);
    }
  }

  return { ok: false, reason: lastReason, attempts: MAX_ATTEMPTS };
}
