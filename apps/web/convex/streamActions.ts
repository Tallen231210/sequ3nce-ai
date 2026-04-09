"use node";

import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";

// Groq exposes an OpenAI-compatible transcription endpoint. We call it via
// plain fetch + FormData so we don't have to add the `openai` npm package
// to apps/web just for one request.
const GROQ_TRANSCRIPTION_URL = "https://api.groq.com/openai/v1/audio/transcriptions";
const GROQ_MODEL = "whisper-large-v3-turbo";

// Hard ceilings so malicious or bugged clients can't drive up our Groq bill.
const MAX_AUDIO_BYTES = 10 * 1024 * 1024; // 10 MB — plenty for short dictation clips
const MAX_DURATION_SEC = 300; // 5 minutes

/**
 * Internal action — transcribe a base64-encoded audio clip using Groq Whisper,
 * save the result to streamTranscriptions (pruning old rows), and return the text.
 *
 * Called from the /b2c/stream/transcribe HTTP route. The Electron overlay posts
 * audio captured via MediaRecorder as base64. Groq Whisper accepts WebM/Opus directly.
 */
export const transcribeAudio = internalAction({
  args: {
    b2cUserId: v.id("b2cUsers"),
    audioBase64: v.string(),
    mimeType: v.string(), // e.g. "audio/webm" or "audio/ogg"
    durationSec: v.optional(v.number()),
  },
  handler: async (
    ctx,
    { b2cUserId, audioBase64, mimeType, durationSec }
  ): Promise<{ text: string; transcriptionId: string | null }> => {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      throw new Error("GROQ_API_KEY is not set on the Convex deployment");
    }

    // Validate the user exists before burning Groq credits on an unknown id.
    const user = await ctx.runQuery(internal.stream.getUserForStreamInternal, {
      b2cUserId,
    });
    if (!user) {
      throw new Error("User not found");
    }

    // Decode base64 → Buffer. Node's Buffer gives us byte-length cheaply for the guard.
    const audioBuffer = Buffer.from(audioBase64, "base64");
    if (audioBuffer.byteLength === 0) {
      throw new Error("Empty audio payload");
    }
    if (audioBuffer.byteLength > MAX_AUDIO_BYTES) {
      throw new Error(
        `Audio payload too large (${audioBuffer.byteLength} bytes; max ${MAX_AUDIO_BYTES})`
      );
    }
    if (durationSec !== undefined && durationSec > MAX_DURATION_SEC) {
      throw new Error(
        `Audio duration too long (${durationSec}s; max ${MAX_DURATION_SEC}s)`
      );
    }

    // Wrap the buffer in a Blob so FormData can send it as a file part.
    // `Blob` and `FormData` are globally available in Convex's Node runtime.
    const extension = mimeType.includes("webm")
      ? "webm"
      : mimeType.includes("ogg")
        ? "ogg"
        : mimeType.includes("wav")
          ? "wav"
          : "mp3";
    const audioBlob = new Blob([audioBuffer], { type: mimeType });

    const form = new FormData();
    form.append("file", audioBlob, `dictation.${extension}`);
    form.append("model", GROQ_MODEL);
    form.append("language", "en");
    form.append("response_format", "json");
    // temperature left at default (0) — deterministic transcription

    const response = await fetch(GROQ_TRANSCRIPTION_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        // Do NOT set Content-Type — fetch will set the correct multipart boundary automatically
      },
      body: form,
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => "<no body>");
      throw new Error(
        `Groq transcription failed (${response.status}): ${errText.slice(0, 500)}`
      );
    }

    const payload = (await response.json()) as { text?: string };
    const text = (payload.text ?? "").trim();

    if (!text) {
      // Don't persist empty transcriptions — they're just noise on the history list.
      return { text: "", transcriptionId: null };
    }

    const transcriptionId = await ctx.runMutation(
      internal.stream.insertTranscriptionInternal,
      {
        b2cUserId,
        text,
        durationSec,
      }
    );

    return { text, transcriptionId };
  },
});
