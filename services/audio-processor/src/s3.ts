// AWS S3 integration for recording storage

import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { logger } from "./logger.js";

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

  const key = `recordings/${teamId}/${callId}/recording.webm`;
  const bufferSize = audioBuffer.length;

  logger.info(`Attempting to upload recording: bucket=${bucketName}, key=${key}, size=${bufferSize} bytes`);

  // Don't upload empty or tiny buffers
  if (bufferSize < 1000) {
    logger.warn(`Recording buffer too small (${bufferSize} bytes) - skipping upload for call ${callId}`);
    return "";
  }

  try {
    await s3Client.send(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: key,
        Body: audioBuffer,
        ContentType: "audio/webm",
      })
    );

    const url = `https://${bucketName}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
    logger.info(`Recording uploaded successfully to S3: ${url} (${bufferSize} bytes)`);

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
