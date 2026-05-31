"use node";

/**
 * AES-256-GCM encryption utilities for API keys.
 *
 * Only usable inside Convex **actions** (Node.js runtime) because
 * queries/mutations cannot access environment variables.
 *
 * Convention: encrypted values are stored as  "enc:<iv_hex>:<ciphertext_hex>:<tag_hex>"
 * Values without the "enc:" prefix are treated as plaintext (backward-compat).
 */

import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12; // 96-bit IV recommended for GCM
const KEY_BYTES = 32; // 256-bit key

function getEncryptionKey(): Buffer {
  const hex = process.env.ENCRYPTION_KEY;
  if (!hex) {
    throw new Error(
      "ENCRYPTION_KEY environment variable is not set. " +
        "Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\""
    );
  }
  const buf = Buffer.from(hex, "hex");
  if (buf.length !== KEY_BYTES) {
    throw new Error(`ENCRYPTION_KEY must be ${KEY_BYTES * 2} hex chars (${KEY_BYTES} bytes)`);
  }
  return buf;
}

/** Returns true if the value is already encrypted (has the enc: prefix). */
export function isEncrypted(value: string): boolean {
  return value.startsWith("enc:");
}

/** Encrypt a plaintext string. Returns "enc:<iv>:<ciphertext>:<tag>". */
export function encryptApiKey(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return `enc:${iv.toString("hex")}:${encrypted.toString("hex")}:${tag.toString("hex")}`;
}

/** Decrypt an encrypted value. Handles both encrypted ("enc:...") and plaintext (backward-compat). */
export function decryptApiKey(value: string): string {
  // Backward-compat: plaintext values pass through unchanged
  if (!isEncrypted(value)) {
    return sanitizeApiKey(value);
  }

  const key = getEncryptionKey();
  const parts = value.split(":");
  // Format: "enc:<iv>:<ciphertext>:<tag>"
  if (parts.length !== 4) {
    throw new Error("Invalid encrypted value format");
  }

  const iv = Buffer.from(parts[1], "hex");
  const ciphertext = Buffer.from(parts[2], "hex");
  const tag = Buffer.from(parts[3], "hex");

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);

  return sanitizeApiKey(decrypted.toString("utf8"));
}

/**
 * Strip non-ASCII characters and leading/trailing whitespace from an API
 * key. Users sometimes paste keys from formatted documents (Slack, email,
 * Notion) that wrap the key in invisible Unicode formatting characters
 * (e.g., U+2068/U+2069 directional isolates, zero-width spaces) or
 * prefix it with mention syntax like "@user". This sanitizer extracts
 * the actual API key pattern.
 *
 * Conservative: drop anything outside printable ASCII (0x21-0x7E), then
 * trim. If the result contains an obvious API key pattern (alphanumerics
 * and underscores after a prefix like "API_"), extract that.
 */
export function sanitizeApiKey(raw: string): string {
  if (!raw) return raw;
  // Drop non-printable + non-ASCII characters
  const cleaned = raw
    .split("")
    .filter((ch) => {
      const c = ch.charCodeAt(0);
      return c >= 0x21 && c <= 0x7e; // printable ASCII excluding space
    })
    .join("");
  // If the cleaned string contains an "API_" pattern, take everything
  // from there to the end (the API key proper).
  const apiMatch = cleaned.match(/API_[A-Za-z0-9_-]+/);
  if (apiMatch) return apiMatch[0];
  return cleaned;
}
