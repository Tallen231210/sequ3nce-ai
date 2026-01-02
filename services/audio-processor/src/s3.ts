// AWS S3 integration for recording storage
// Converts raw PCM audio to WAV format before uploading

import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { logger } from "./logger.js";

// Audio format constants (must match desktop app's AudioWorklet output)
// NOTE: Browser may not honor 48kHz request - actual rate appears to be ~24kHz based on chunk timing
const SAMPLE_RATE = 24000;  // Adjusted to match actual observed rate
const NUM_CHANNELS = 2;      // Stereo (Channel 0 = Closer, Channel 1 = Prospect)
const BITS_PER_SAMPLE = 16;  // 16-bit PCM

/**
 * Creates a WAV file header for raw PCM data
 * WAV format: 44-byte header + raw PCM samples
 */
function createWavHeader(pcmDataLength: number): Buffer {
  const header = Buffer.alloc(44);

  const byteRate = SAMPLE_RATE * NUM_CHANNELS * (BITS_PER_SAMPLE / 8);
  const blockAlign = NUM_CHANNELS * (BITS_PER_SAMPLE / 8);

  // RIFF chunk descriptor
  header.write('RIFF', 0);                           // ChunkID
  header.writeUInt32LE(36 + pcmDataLength, 4);       // ChunkSize
  header.write('WAVE', 8);                           // Format

  // fmt sub-chunk
  header.write('fmt ', 12);                          // Subchunk1ID
  header.writeUInt32LE(16, 16);                      // Subchunk1Size (16 for PCM)
  header.writeUInt16LE(1, 20);                       // AudioFormat (1 = PCM)
  header.writeUInt16LE(NUM_CHANNELS, 22);            // NumChannels
  header.writeUInt32LE(SAMPLE_RATE, 24);             // SampleRate
  header.writeUInt32LE(byteRate, 28);                // ByteRate
  header.writeUInt16LE(blockAlign, 32);              // BlockAlign
  header.writeUInt16LE(BITS_PER_SAMPLE, 34);         // BitsPerSample

  // data sub-chunk
  header.write('data', 36);                          // Subchunk2ID
  header.writeUInt32LE(pcmDataLength, 40);           // Subchunk2Size

  return header;
}

/**
 * Converts raw PCM audio buffer to WAV format
 */
function pcmToWav(pcmBuffer: Buffer): Buffer {
  const wavHeader = createWavHeader(pcmBuffer.length);
  return Buffer.concat([wavHeader, pcmBuffer]);
}

// Check if S3 is configured
const isS3Configured = !!(
  process.env.AWS_REGION &&
  process.env.AWS_ACCESS_KEY_ID &&
  process.env.AWS_SECRET_ACCESS_KEY &&
  process.env.AWS_S3_BUCKET
);

let s3Client: S3Client | null = null;

if (isS3Configured) {
  s3Client = new S3Client({
    region: process.env.AWS_REGION!,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    },
  });
  logger.info("S3 client initialized");
} else {
  logger.warn("S3 not configured - recordings will not be uploaded. Set AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, and AWS_S3_BUCKET to enable.");
}

const bucketName = process.env.AWS_S3_BUCKET || "";

export async function uploadRecording(
  teamId: string,
  callId: string,
  audioBuffer: Buffer
): Promise<string> {
  // Skip upload if S3 not configured
  if (!isS3Configured || !s3Client) {
    logger.warn(`S3 not configured - skipping upload for call ${callId}`);
    logger.warn(`S3 config check: AWS_REGION=${!!process.env.AWS_REGION}, AWS_ACCESS_KEY_ID=${!!process.env.AWS_ACCESS_KEY_ID}, AWS_SECRET_ACCESS_KEY=${!!process.env.AWS_SECRET_ACCESS_KEY}, AWS_S3_BUCKET=${!!process.env.AWS_S3_BUCKET}`);
    return ""; // Return empty string, caller should handle gracefully
  }

  const pcmBufferSize = audioBuffer.length;

  // Don't upload empty or tiny buffers
  if (pcmBufferSize < 1000) {
    logger.warn(`Recording buffer too small (${pcmBufferSize} bytes) - skipping upload for call ${callId}`);
    return "";
  }

  // Convert raw PCM to WAV format for browser playback
  logger.info(`Converting PCM to WAV: ${pcmBufferSize} bytes raw PCM`);
  const wavBuffer = pcmToWav(audioBuffer);
  const wavBufferSize = wavBuffer.length;

  const key = `recordings/${teamId}/${callId}/recording.wav`;
  logger.info(`Uploading WAV recording: bucket=${bucketName}, key=${key}, size=${wavBufferSize} bytes`);

  try {
    await s3Client.send(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: key,
        Body: wavBuffer,
        ContentType: "audio/wav",
      })
    );

    const url = `https://${bucketName}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
    logger.info(`Recording uploaded successfully to S3: ${url} (${wavBufferSize} bytes)`);

    return url;
  } catch (error) {
    // Log detailed error info
    logger.error(`Failed to upload recording to S3 for call ${callId}`, error);
    if (error instanceof Error) {
      logger.error(`S3 upload error details: ${error.name} - ${error.message}`);
    }
    return ""; // Return empty string instead of throwing
  }
}
