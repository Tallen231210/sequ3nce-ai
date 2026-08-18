// ============================================================================
// Token generation and password checking for share links.
//
// New file rather than exporting these from `sharedLinks.ts`, where the same
// three helpers live privately. Editing that file to export them would be a
// change to the module behind the public share page and compliance links for
// no functional gain. These are fifteen lines; the risk isn't worth saving them.
// ============================================================================

/** URL-safe random token. */
export function generateShareToken(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(36).padStart(2, "0"))
    .join("")
    .slice(0, 22);
}

/** SHA-256, hex. Passwords are never stored or logged in the clear. */
export async function hashSharePassword(password: string): Promise<string> {
  const data = new TextEncoder().encode(password);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Compare without leaking where the strings diverge.
 *
 * A plain `===` returns faster the earlier it finds a mismatch, which is
 * enough to recover a hash one character at a time given enough attempts.
 */
export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}
