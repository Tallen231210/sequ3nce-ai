// ============================================================================
// How long was that call?
//
// Calls placed through a GHL custom conversation provider arrive with no
// duration field at all — Sendblue's are FaceTime Audio rather than carrier
// telephony, so nothing ever populates `callDuration`. Without a duration
// there is no connect rate, no talk time, and the "connected" milestone can
// never fire, which is most of what a setter dashboard is for.
//
// What we do get is the recording, linked from the message's `attachments`.
// Its length IS the duration, and only its header is needed to know that.
//
// Trust the bytes, not the name. Sendblue serves recordings from a `.mp3` URL
// with `Content-Type: audio/mpeg`, and they are WAV files — the body opens
// "RIFF....WAVE". An MP3-only reader doesn't fail on those, which would be
// fine; it finds a byte pair that looks like a frame sync somewhere in the PCM
// and returns a confidently wrong number. One real recording parsed as 528
// seconds at 40kbps when it was 100 seconds. So both containers are handled
// here and the format is detected from the content.
//
// Verified against ffprobe on a real Sendblue recording: 1,604,204 bytes,
// 8kHz 16-bit mono PCM → 100.26s, matching ffprobe's 100.260000.
//
// GHL's own /recording and /transcription endpoints are NOT an alternative —
// both reject custom-provider messages (422 "Invalid recording URL", 400
// "Transcription does not exist"). The attachment URL is the only way in.
// ============================================================================

/** Layer III bitrates in kbps, indexed by the header's 4-bit bitrate index. */
const BITRATES_V1 = [
  0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0,
];
const BITRATES_V2 = [
  0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0,
];

const SAMPLE_RATES: Record<number, number[]> = {
  3: [44100, 48000, 32000, 0], // MPEG 1
  2: [22050, 24000, 16000, 0], // MPEG 2
  0: [11025, 12000, 8000, 0], // MPEG 2.5
};

/**
 * How many bytes we pull to inspect the header. Generous enough to clear a fat
 * ID3 tag (cover art lives there) or an unusual run of WAV chunks, while
 * downloading nothing meaningful of the audio itself.
 */
const HEADER_BYTES = 64 * 1024;

/** Anything longer than this is a parse error, not a sales call. */
const MAX_PLAUSIBLE_SEC = 6 * 60 * 60;

export interface AudioProbe {
  durationSec: number;
  format: "wav" | "mp3";
  sizeBytes: number;
  /** False when the answer assumes a constant bitrate across the whole file. */
  exact: boolean;
}

// ---------------------------------------------------------------------------
// WAV
// ---------------------------------------------------------------------------

const u32 = (b: Uint8Array, i: number) =>
  b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24);
const u16 = (b: Uint8Array, i: number) => b[i] | (b[i + 1] << 8);
const tag = (b: Uint8Array, i: number) =>
  String.fromCharCode(b[i], b[i + 1], b[i + 2], b[i + 3]);

function isWav(buf: Uint8Array): boolean {
  return (
    buf.length >= 12 && tag(buf, 0) === "RIFF" && tag(buf, 8) === "WAVE"
  );
}

/**
 * Duration of a RIFF/WAVE file, from `data` chunk size ÷ byte rate.
 *
 * Walks the chunk list rather than assuming the canonical 44-byte header:
 * recorders routinely insert LIST/fact/bext chunks before the audio, and
 * assuming a fixed offset silently shifts every number.
 */
function wavDuration(buf: Uint8Array, totalSize: number): AudioProbe | null {
  let byteRate = 0;
  let dataSize = 0;
  let dataStart = 0;
  let pos = 12;

  while (pos + 8 <= buf.length) {
    const chunkId = tag(buf, pos);
    const chunkSize = u32(buf, pos + 4) >>> 0;

    if (chunkId === "fmt ") {
      if (pos + 8 + 16 > buf.length) return null;
      byteRate = u32(buf, pos + 16) >>> 0;
      if (!byteRate) {
        // Derive it if the field is zero: sampleRate × channels × bytes/sample.
        const channels = u16(buf, pos + 10);
        const sampleRate = u32(buf, pos + 12) >>> 0;
        const bitsPerSample = u16(buf, pos + 30 - 8);
        byteRate = (sampleRate * channels * bitsPerSample) / 8;
      }
    } else if (chunkId === "data") {
      dataSize = chunkSize;
      dataStart = pos + 8;
      break;
    }

    // Chunks are word-aligned; an odd size is followed by a pad byte.
    pos += 8 + chunkSize + (chunkSize % 2);
    if (chunkSize === 0) break; // malformed — don't spin
  }

  if (!byteRate || !dataStart) return null;

  // A streamed WAV can carry a placeholder data size (0 or 0xFFFFFFFF). Fall
  // back to what's actually there.
  const bytesAfterHeader = Math.max(0, totalSize - dataStart);
  const usable =
    dataSize > 0 && dataSize !== 0xffffffff
      ? Math.min(dataSize, bytesAfterHeader)
      : bytesAfterHeader;

  const durationSec = usable / byteRate;
  if (!Number.isFinite(durationSec) || durationSec <= 0) return null;

  return {
    durationSec: Math.round(durationSec),
    format: "wav",
    sizeBytes: totalSize,
    exact: true,
  };
}

// ---------------------------------------------------------------------------
// MP3
// ---------------------------------------------------------------------------

/** Skip an ID3v2 tag if the file opens with one, returning the audio offset. */
function audioStartOffset(buf: Uint8Array): number {
  if (buf.length < 10) return 0;
  if (buf[0] !== 0x49 || buf[1] !== 0x44 || buf[2] !== 0x33) return 0; // "ID3"
  const size =
    ((buf[6] & 0x7f) << 21) |
    ((buf[7] & 0x7f) << 14) |
    ((buf[8] & 0x7f) << 7) |
    (buf[9] & 0x7f);
  const hasFooter = (buf[5] & 0x10) !== 0;
  return 10 + size + (hasFooter ? 10 : 0);
}

interface FrameHeader {
  offset: number;
  bitrateKbps: number;
  sampleRate: number;
  samplesPerFrame: number;
  isVersion1: boolean;
  isMono: boolean;
  frameLength: number;
}

function decodeFrame(buf: Uint8Array, i: number): FrameHeader | null {
  if (i + 4 > buf.length) return null;
  if (buf[i] !== 0xff || (buf[i + 1] & 0xe0) !== 0xe0) return null;

  const versionBits = (buf[i + 1] >> 3) & 0x03;
  const layerBits = (buf[i + 1] >> 1) & 0x03;
  if (versionBits === 1) return null; // reserved
  if (layerBits !== 1) return null; // Layer III only

  const bitrateIndex = (buf[i + 2] >> 4) & 0x0f;
  const sampleRateIndex = (buf[i + 2] >> 2) & 0x03;
  if (bitrateIndex === 0 || bitrateIndex === 15) return null;
  if (sampleRateIndex === 3) return null;

  const isVersion1 = versionBits === 3;
  const bitrateKbps = isVersion1
    ? BITRATES_V1[bitrateIndex]
    : BITRATES_V2[bitrateIndex];
  const sampleRate = SAMPLE_RATES[versionBits]?.[sampleRateIndex] ?? 0;
  if (!bitrateKbps || !sampleRate) return null;

  const padding = (buf[i + 2] >> 1) & 0x01;
  const samplesPerFrame = isVersion1 ? 1152 : 576;
  const frameLength =
    Math.floor(((samplesPerFrame / 8) * (bitrateKbps * 1000)) / sampleRate) +
    padding;
  const isMono = ((buf[i + 3] >> 6) & 0x03) === 3;

  return {
    offset: i,
    bitrateKbps,
    sampleRate,
    samplesPerFrame,
    isVersion1,
    isMono,
    frameLength,
  };
}

/**
 * Find the first real audio frame.
 *
 * Requires a SECOND valid frame exactly where the first one says it ends.
 * A lone 11-bit sync pattern occurs constantly in arbitrary binary — that's
 * precisely how a WAV got read as a 528-second MP3 — and demanding two
 * consecutive frames makes a false positive vanishingly unlikely.
 */
function findFirstFrame(buf: Uint8Array, from: number): FrameHeader | null {
  const limit = Math.min(buf.length - 4, HEADER_BYTES);
  for (let i = Math.max(0, from); i < limit; i++) {
    const frame = decodeFrame(buf, i);
    if (!frame) continue;
    const next = decodeFrame(buf, i + frame.frameLength);
    if (!next) continue;
    if (next.sampleRate !== frame.sampleRate) continue;
    return frame;
  }
  return null;
}

/** Read a Xing/Info frame count if present — the only VBR-safe answer. */
function readXingFrameCount(buf: Uint8Array, f: FrameHeader): number | null {
  const sideInfo = f.isVersion1 ? (f.isMono ? 17 : 32) : f.isMono ? 9 : 17;
  const at = f.offset + 4 + sideInfo;
  if (at + 12 > buf.length) return null;

  const name = tag(buf, at);
  if (name !== "Xing" && name !== "Info") return null;

  const flags =
    (buf[at + 4] << 24) | (buf[at + 5] << 16) | (buf[at + 6] << 8) | buf[at + 7];
  if ((flags & 0x01) === 0) return null;

  const frames =
    (buf[at + 8] << 24) |
    (buf[at + 9] << 16) |
    (buf[at + 10] << 8) |
    buf[at + 11];
  return frames > 0 ? frames : null;
}

function mp3Duration(buf: Uint8Array, totalSize: number): AudioProbe | null {
  const frame = findFirstFrame(buf, audioStartOffset(buf));
  if (!frame) return null;

  const xingFrames = readXingFrameCount(buf, frame);
  if (xingFrames) {
    const durationSec = (xingFrames * frame.samplesPerFrame) / frame.sampleRate;
    if (!Number.isFinite(durationSec) || durationSec <= 0) return null;
    return {
      durationSec: Math.round(durationSec),
      format: "mp3",
      sizeBytes: totalSize,
      exact: true,
    };
  }

  // Constant-bitrate assumption over the audio bytes only — a leading ID3 tag
  // isn't sound and would inflate the answer.
  const audioBytes = Math.max(0, totalSize - frame.offset);
  const durationSec = (audioBytes * 8) / (frame.bitrateKbps * 1000);
  if (!Number.isFinite(durationSec) || durationSec <= 0) return null;

  return {
    durationSec: Math.round(durationSec),
    format: "mp3",
    sizeBytes: totalSize,
    exact: false,
  };
}

// ---------------------------------------------------------------------------

/**
 * Work out how long the recording at `url` runs, downloading only its header.
 *
 * Returns null rather than throwing on anything unexpected — a missing or
 * unreadable recording must not fail the sync that was merely trying to
 * enrich it. Returning null costs a connect; returning a guess corrupts the
 * customer's numbers.
 */
export async function probeAudioDuration(
  url: string,
): Promise<AudioProbe | null> {
  try {
    const res = await fetch(url, {
      headers: { Range: `bytes=0-${HEADER_BYTES - 1}` },
    });
    if (!res.ok && res.status !== 206) return null;

    // With a range request the true total is in Content-Range
    // ("bytes 0-N/TOTAL"); if the server ignored the range, Content-Length is
    // the whole file.
    let sizeBytes = 0;
    const contentRange = res.headers.get("content-range");
    if (contentRange) {
      const total = contentRange.split("/")[1];
      if (total && total !== "*") sizeBytes = Number(total);
    }
    if (!sizeBytes) sizeBytes = Number(res.headers.get("content-length") ?? 0);
    if (!sizeBytes || !Number.isFinite(sizeBytes)) return null;

    const buf = new Uint8Array(await res.arrayBuffer());

    // Content sniffing, not the URL or Content-Type — Sendblue's ".mp3" files
    // served as audio/mpeg are WAV.
    const probe = isWav(buf)
      ? wavDuration(buf, sizeBytes)
      : mp3Duration(buf, sizeBytes);

    if (!probe) return null;
    if (probe.durationSec <= 0 || probe.durationSec > MAX_PLAUSIBLE_SEC) {
      return null;
    }
    return probe;
  } catch {
    // Network blip, expired link, provider outage. The dial still counts; it
    // just won't count as a connect until something re-runs.
    return null;
  }
}
