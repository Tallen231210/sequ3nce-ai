// Recall.ai API client helpers.
//
// Centralized so the auth header format ("Token <key>", not Bearer) and base
// URL live in one place instead of being copy-pasted at each call site.
// Returns structured results ({ ok, data, error }) so callers can handle
// failures explicitly without try/catch noise.
//
// Architecture note: Recall doesn't expose participants on the bot detail
// endpoint. Per-utterance transcripts (downloaded from S3 via a signed URL
// in media_shortcuts) carry the participant.id + name + is_host on every
// entry. That's all we need to identify the closer and relabel segments —
// no separate participant-roster endpoint required.

const RECALL_BASE_URL = "https://us-west-2.recall.ai/api/v1";
const REQUEST_TIMEOUT_MS = 15000; // higher than bot-detail because S3 downloads can be 1-3 MB
const MAX_RETRIES = 2;

export interface RecallTranscriptUtterance {
  participant: {
    id: number | string;
    name?: string | null;
    is_host?: boolean | null;
    email?: string | null;
  };
  words: Array<{
    text: string;
    start_timestamp?: { absolute?: string; relative?: number } | number;
  }>;
}

export type RecallResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; status?: number };

async function fetchWithRetry(
  url: string,
  init: RequestInit,
  attempt: number = 0,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    if (res.status >= 500 && attempt < MAX_RETRIES) {
      await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
      return fetchWithRetry(url, init, attempt + 1);
    }
    return res;
  } catch (err: unknown) {
    if (attempt < MAX_RETRIES) {
      await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
      return fetchWithRetry(url, init, attempt + 1);
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

function authHeaders(): Record<string, string> {
  const key = process.env.RECALL_API_KEY;
  if (!key) throw new Error("RECALL_API_KEY not configured");
  return { Authorization: `Token ${key}`, "Content-Type": "application/json" };
}

// Fetch the transcript download URL from the bot's first recording, then
// download the actual transcript JSON from S3. Returns the parsed array.
//
// Two-step because Recall doesn't serve transcripts inline — they store the
// processed diarized JSON in S3 and hand out short-lived signed URLs.
export async function fetchRecallTranscript(
  recallBotId: string,
): Promise<RecallResult<RecallTranscriptUtterance[]>> {
  try {
    const botRes = await fetchWithRetry(
      `${RECALL_BASE_URL}/bot/${recallBotId}/`,
      { headers: authHeaders() },
    );
    if (!botRes.ok) {
      return { ok: false, error: `bot detail HTTP ${botRes.status}`, status: botRes.status };
    }
    const bot = (await botRes.json()) as any;

    const recording = bot.recordings?.[0];
    if (!recording) {
      return { ok: false, error: "no recordings on bot" };
    }
    const downloadUrl: string | undefined =
      recording.media_shortcuts?.transcript?.data?.download_url;
    if (!downloadUrl) {
      return { ok: false, error: "no transcript download_url" };
    }
    const status: string | undefined =
      recording.media_shortcuts?.transcript?.status?.code;
    if (status && status !== "done") {
      return { ok: false, error: `transcript status ${status}` };
    }

    // S3 download — no auth header needed (URL is pre-signed)
    const dataRes = await fetchWithRetry(downloadUrl, {});
    if (!dataRes.ok) {
      return { ok: false, error: `S3 download HTTP ${dataRes.status}`, status: dataRes.status };
    }
    const data = (await dataRes.json()) as RecallTranscriptUtterance[];
    if (!Array.isArray(data)) {
      return { ok: false, error: "Transcript response not an array" };
    }
    return { ok: true, data };
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// Token-overlap match — same impl as http.ts:tokenOverlap and
// audio-processor/call-handler.ts:tokenOverlap so pin/verify/decideSpeaker
// all agree on what "names match" means.
export function tokenOverlap(a: string, b: string): boolean {
  const aTokens = a
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length >= 3);
  const bLower = b.toLowerCase();
  return aTokens.some((t) => bLower.includes(t));
}

// Bot-name filter — when scanning participants to find the closer, skip
// anything that looks like our recording bot. Mirrors the legacy patterns
// in services/audio-processor/src/call-handler.ts:trackParticipantJoin.
const BOT_NAME_PATTERNS = [
  "sequ3nce.ai",
  "sequ3nce",
  "notetaker",
  "note taker",
  "meeting bot",
  "recorder",
];
export function isLikelyBotName(
  participantName: string,
  configuredBotName?: string | null,
): boolean {
  const lower = participantName.toLowerCase();
  if (configuredBotName && lower.includes(configuredBotName.toLowerCase())) {
    return true;
  }
  return BOT_NAME_PATTERNS.some((p) => lower.includes(p));
}

// Derive the unique participant roster from a transcript. Each utterance
// carries participant.id + name + is_host; we collapse duplicates by id.
export interface RecallParticipantSummary {
  id: number | string;
  name: string;
  is_host: boolean | null;
}
export function rosterFromTranscript(
  transcript: RecallTranscriptUtterance[],
): RecallParticipantSummary[] {
  const byId = new Map<string, RecallParticipantSummary>();
  for (const u of transcript) {
    if (!u.participant || u.participant.id === undefined) continue;
    const key = String(u.participant.id);
    if (byId.has(key)) continue;
    byId.set(key, {
      id: u.participant.id,
      name: u.participant.name ?? "",
      is_host:
        typeof u.participant.is_host === "boolean" ? u.participant.is_host : null,
    });
  }
  return Array.from(byId.values());
}
