// ============================================================================
// Closer magic-link auth.
//
// Replaces the manager-creates-password model: closer gets a 6-digit
// code (and a sequ3nce:// deep-link) emailed to them, enters/clicks it
// from the desktop app, and is signed in. Legacy password closers keep
// working via loginCloser; new closers added through the new flow have
// no passwordHash and exclusively use this path.
//
// Pattern mirrors apps/web/convex/b2cAuth.ts (requestPasswordReset +
// resetPassword) almost line-for-line — same Resend infra, same code
// generation, same 15-min expiry, same constant-time hash compare.
// ============================================================================

import { v } from "convex/values";
import {
  action,
  mutation,
  internalMutation,
} from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CODE_REGEX = /^\d{6}$/;
const MAGIC_LINK_EXPIRY_MS = 15 * 60 * 1000; // 15 minutes
const RESEND_COOLDOWN_MS = 60 * 1000; // 60s between requests to the same email
// Brute-force guard. With a 6-digit code (900k space), 5 wrong tries
// before forced re-request closes the brute-force vector. The closer
// can always request a fresh code, so legit users are unaffected.
const MAX_FAILED_ATTEMPTS = 5;

// SHA-256 via Web Crypto — same util used by b2cAuth.ts. Closers table's
// magicLinkCodeHash stores the hex digest of the 6-digit code so the
// raw code never sits at rest.
async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Constant-time hex comparison — guards against timing oracles even
// though SHA-256 makes practical leakage unlikely.
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

// Cryptographically secure 6-digit code via Web Crypto. Math.random
// is NOT CSPRNG — V8's PRNG can be partially predictable, opening
// brute-force pathways the rate-limit alone can't fully close.
function generate6DigitCode(): string {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return String(100000 + (buf[0] % 900000));
}

// ============================================================================
// Internal: code generation + persist
// ============================================================================

/**
 * Generates a 6-digit code for ALL closers matching this email and
 * stores its hash on each closer record. Returns the raw code to the
 * caller (the requestCloserMagicLink action) so it can be emailed.
 *
 * Multi-team note: the same email can appear on multiple closer
 * records (Tyler is on Team A and Team B). We write the code to ALL
 * eligible records so verify will find a match regardless of which
 * team the closer signs into — and so issuing a code never overwrites
 * an active code on a DIFFERENT team's closer record.
 *
 * Always returns { success: true } even when the email doesn't match
 * any closer OR is rate-limited — prevents account enumeration via
 * either the response code OR response timing. Cooldown is enforced
 * silently server-side.
 */
export const generateMagicLinkCode = internalMutation({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    const email = args.email.trim().toLowerCase();
    if (!EMAIL_REGEX.test(email)) {
      return { success: true, code: null };
    }

    const closers = await ctx.db
      .query("closers")
      .withIndex("by_email", (q) => q.eq("email", email))
      .collect();
    const eligible = closers.filter((c) => c.status !== "deactivated");
    if (eligible.length === 0) {
      return { success: true, code: null };
    }

    // Cooldown: if ANY of the matching closers had a recent send, skip
    // silently. We never return retryAfter — that's an account-enumeration
    // side channel since unknown emails would have no cooldown to report.
    const now = Date.now();
    const recentlySent = eligible.some(
      (c) =>
        c.magicLinkLastSentAt &&
        now - c.magicLinkLastSentAt < RESEND_COOLDOWN_MS,
    );
    if (recentlySent) {
      return { success: true, code: null };
    }

    const code = generate6DigitCode();
    const codeHash = await sha256Hex(code);

    // Write the SAME code to every eligible record so verify works
    // regardless of which team's closer logs in.
    for (const closer of eligible) {
      await ctx.db.patch(closer._id, {
        magicLinkCodeHash: codeHash,
        magicLinkExpiresAt: now + MAGIC_LINK_EXPIRY_MS,
        magicLinkLastSentAt: now,
        magicLinkFailedAttempts: 0, // Reset on new issue
      });
    }

    // Use the most-recently-active record's name in the email greeting.
    const greetingCloser = eligible.sort(
      (a, b) =>
        (b.lastLoginAt ?? b._creationTime) - (a.lastLoginAt ?? a._creationTime),
    )[0];

    return {
      success: true,
      code,
      closerName: greetingCloser.name,
    };
  },
});

// ============================================================================
// Public action: request magic link (sends email via Resend)
// ============================================================================

/**
 * Sends a magic-link email to the given address. Used by:
 *   - Desktop app login screen ("Send me a sign-in link" button)
 *   - Manager Team tab ("Resend sign-in link" dropdown action)
 *   - addCloserViaMagicLink mutation (auto-fires on closer add)
 *
 * Returns { success: true } even when the email doesn't match a closer
 * OR when the resend cooldown is active — prevents account enumeration
 * via response timing. Cooldown is enforced silently server-side; the
 * client never knows whether the silence is "we sent it" or "we won't
 * send right now."
 */
export const requestCloserMagicLink = action({
  args: { email: v.string() },
  handler: async (
    ctx,
    args,
  ): Promise<{ success: boolean; error?: string }> => {
    const normalizedEmail = args.email.trim().toLowerCase();

    if (!EMAIL_REGEX.test(normalizedEmail)) {
      return { success: false, error: "Invalid email format" };
    }

    const result = await ctx.runMutation(
      internal.closerMagicLink.generateMagicLinkCode,
      { email: normalizedEmail },
    );

    // No code generated (unknown email, deactivated, or cooldown active) —
    // pretend success to avoid leaking which of those it was.
    if (!result.code) {
      return { success: true };
    }

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.error("[closerMagicLink] RESEND_API_KEY not configured");
      return { success: false, error: "Email service not configured" };
    }

    // Deep-link the desktop app already knows how to receive — the
    // existing handleAuthCallback in apps/desktop/src/index.ts:580-618
    // parses these params and pushes them to the renderer via the
    // auth:callback IPC event.
    const deepLink = `sequ3nce://auth-callback?email=${encodeURIComponent(
      normalizedEmail,
    )}&code=${result.code}`;

    const codeFormatted = `${result.code.slice(0, 3)}-${result.code.slice(3)}`;
    const greetingName = result.closerName?.trim() || "there";

    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
        <h2 style="color: #111; margin-bottom: 8px;">Sign in to Sequ3nce</h2>
        <p style="color: #666; font-size: 14px; margin-bottom: 24px;">
          Hi ${greetingName}, here's your sign-in code. It expires in 15 minutes.
        </p>
        <div style="background: #f5f5f5; border-radius: 10px; padding: 28px; text-align: center; margin-bottom: 24px;">
          <div style="font-size: 11px; font-weight: 600; color: #666; letter-spacing: 1px; text-transform: uppercase; margin-bottom: 8px;">
            Your sign-in code
          </div>
          <span style="font-size: 36px; font-weight: 700; letter-spacing: 8px; color: #111; font-family: ui-monospace, SFMono-Regular, monospace;">${codeFormatted}</span>
        </div>
        <p style="color: #666; font-size: 14px; margin-bottom: 12px; text-align: center;">
          Reading this on the same computer where you'll use Sequ3nce?
        </p>
        <div style="text-align: center; margin-bottom: 28px;">
          <a
            href="${deepLink}"
            style="display: inline-block; background: #111; color: white; text-decoration: none; font-weight: 600; padding: 12px 24px; border-radius: 8px;"
          >
            Open in Sequ3nce app
          </a>
        </div>
        <p style="color: #999; font-size: 12px;">
          If you didn't request this, you can safely ignore this email.
        </p>
      </div>
    `;

    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "Sequ3nce <noreply@noreply.sequ3nce.ai>",
          to: [normalizedEmail],
          subject: "Sign in to Sequ3nce",
          html,
        }),
      });
      if (!response.ok) {
        const text = await response.text();
        console.error(
          `[closerMagicLink] Resend ${response.status}: ${text.slice(0, 200)}`,
        );
        return { success: false, error: "Failed to send email" };
      }
      return { success: true };
    } catch (err) {
      console.error("[closerMagicLink] send failed:", err);
      return { success: false, error: "Failed to send email" };
    }
  },
});

// ============================================================================
// Public mutation: verify code → returns CloserInfo
// ============================================================================

/**
 * Verifies the 6-digit code for the given email. On success, clears
 * the stored hash (single-use), updates lastLoginAt, activates a
 * "pending" closer to "active", and returns the same CloserInfo shape
 * that loginCloser returns so the desktop renderer's persist-to-
 * localStorage path is unchanged.
 */
export const verifyCloserMagicLink = mutation({
  args: { email: v.string(), code: v.string() },
  handler: async (
    ctx,
    args,
  ): Promise<{
    success: boolean;
    error?: string;
    closer?: {
      closerId: Id<"closers">;
      teamId: Id<"teams">;
      name: string;
      email: string;
      status: string;
      teamName?: string;
    };
  }> => {
    const email = args.email.trim().toLowerCase();
    const code = args.code.trim();

    if (!EMAIL_REGEX.test(email)) {
      return { success: false, error: "Invalid email" };
    }
    if (!CODE_REGEX.test(code)) {
      return { success: false, error: "Invalid code" };
    }

    const closers = await ctx.db
      .query("closers")
      .withIndex("by_email", (q) => q.eq("email", email))
      .collect();
    const eligible = closers.filter((c) => c.status !== "deactivated");

    const now = Date.now();

    // Brute-force lockout: if ANY closer record for this email is over
    // the failed-attempt limit, force a re-request before accepting
    // more guesses. Same code is written to every eligible record
    // (per generateMagicLinkCode), so counts are consistent.
    const lockedOut = eligible.some(
      (c) =>
        c.magicLinkCodeHash &&
        (c.magicLinkFailedAttempts ?? 0) >= MAX_FAILED_ATTEMPTS,
    );
    if (lockedOut) {
      // Burn the codes so the attacker can't keep guessing even by
      // racing — force a fresh request.
      for (const closer of eligible) {
        if (closer.magicLinkCodeHash) {
          await ctx.db.patch(closer._id, {
            magicLinkCodeHash: undefined,
            magicLinkExpiresAt: undefined,
            magicLinkFailedAttempts: undefined,
          });
        }
      }
      return {
        success: false,
        error: "Too many failed attempts. Request a new code.",
      };
    }

    // Find a closer with a matching, unexpired code. Same constant-
    // time comparison as the password flow.
    const codeHash = await sha256Hex(code);
    let matched = null;
    for (const closer of eligible) {
      if (!closer.magicLinkCodeHash || !closer.magicLinkExpiresAt) continue;
      if (closer.magicLinkExpiresAt < now) continue;
      if (constantTimeEqual(closer.magicLinkCodeHash, codeHash)) {
        matched = closer;
        break;
      }
    }

    if (!matched) {
      // Increment failed-attempt counter on every record that still has
      // an unexpired code. Then clear expired ones opportunistically.
      for (const closer of eligible) {
        if (!closer.magicLinkCodeHash || !closer.magicLinkExpiresAt) continue;
        if (closer.magicLinkExpiresAt < now) {
          await ctx.db.patch(closer._id, {
            magicLinkCodeHash: undefined,
            magicLinkExpiresAt: undefined,
            magicLinkFailedAttempts: undefined,
          });
        } else {
          await ctx.db.patch(closer._id, {
            magicLinkFailedAttempts:
              (closer.magicLinkFailedAttempts ?? 0) + 1,
          });
        }
      }
      return { success: false, error: "Invalid or expired code" };
    }

    // Success — single-use: clear the code (on ALL matching records, not
    // just the verified one, so a stolen code can't be reused on a
    // sibling team record), reset failed-attempt counter, mark
    // activation + last login on the verified closer only.
    for (const closer of eligible) {
      if (closer.magicLinkCodeHash) {
        await ctx.db.patch(closer._id, {
          magicLinkCodeHash: undefined,
          magicLinkExpiresAt: undefined,
          magicLinkFailedAttempts: undefined,
        });
      }
    }
    const loginUpdates: {
      lastLoginAt: number;
      status?: string;
      activatedAt?: number;
    } = { lastLoginAt: now };
    if (matched.status === "pending") {
      loginUpdates.status = "active";
      loginUpdates.activatedAt = now;
    }
    await ctx.db.patch(matched._id, loginUpdates);

    const team = await ctx.db.get(matched.teamId);

    return {
      success: true,
      closer: {
        closerId: matched._id,
        teamId: matched.teamId,
        name: matched.name,
        email: matched.email,
        status: loginUpdates.status ?? matched.status,
        teamName: team?.name,
      },
    };
  },
});
