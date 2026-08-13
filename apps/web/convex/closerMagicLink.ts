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
import { issueSession } from "./closerSession";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CODE_REGEX = /^\d{6}$/;
// 7 days. Most common use case is the manager-adds-closer flow where
// the closer might not check email immediately. Single-use enforcement
// + brute-force lockout + CSPRNG codes make a longer window safe.
const MAGIC_LINK_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;
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
 * Returns shape:
 *   { code: "123456", closerName: "..." }      → success, send email
 *   { code: null, reason: "cooldown" }         → silent success
 *   { code: null, reason: "unknown_email" }    → email not registered
 *
 * "unknown_email" surfaces an error to the user — Sequ3nce desktop is
 * B2B (managers control adds; no public signup), so telling them
 * "your email isn't registered" is the correct UX AND prevents random
 * installs from probing the app via guessed emails. Cooldown stays
 * silent so a real-account-in-cooldown is indistinguishable from a
 * real-account-just-sent (no enumeration via timing).
 */
export const generateMagicLinkCode = internalMutation({
  args: { email: v.string() },
  handler: async (
    ctx,
    args,
  ): Promise<{
    code: string | null;
    closerName?: string;
    isReturning?: boolean;
    reason?: "cooldown" | "unknown_email" | "invalid_format";
    retryAfterSeconds?: number;
  }> => {
    const email = args.email.trim().toLowerCase();
    if (!EMAIL_REGEX.test(email)) {
      return { code: null, reason: "invalid_format" };
    }

    const closers = await ctx.db
      .query("closers")
      .withIndex("by_email", (q) => q.eq("email", email))
      .collect();
    const eligible = closers.filter((c) => c.status !== "deactivated");
    if (eligible.length === 0) {
      return { code: null, reason: "unknown_email" };
    }

    // Cooldown: one send per minute per address.
    //
    // This used to return silently, on the reasoning that reporting a wait
    // would leak whether the address exists. That reasoning no longer holds —
    // the caller above already answers "we couldn't find a closer with that
    // email" outright, which was a deliberate decision for an invite-only
    // product. Withholding the cooldown therefore protects nothing and costs
    // a great deal: the screen said "we sent you a code" when nothing had
    // been sent, and there was no way to tell that from a lost email.
    const now = Date.now();
    const lastSent = Math.max(
      ...eligible.map((c) => c.magicLinkLastSentAt ?? 0),
    );
    if (lastSent && now - lastSent < RESEND_COOLDOWN_MS) {
      return {
        code: null,
        reason: "cooldown",
        retryAfterSeconds: Math.max(
          1,
          Math.ceil((RESEND_COOLDOWN_MS - (now - lastSent)) / 1000),
        ),
      };
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

    // If ANY of the closer's records has logged in before, this is a
    // returning user — pick the lighter "sign in" template variant
    // (no "Welcome to Sequ3nce" framing). First-time closers (no record
    // has lastLoginAt yet) get the fuller welcome, including the calendar step.
    const isReturning = eligible.some((c) => c.lastLoginAt != null);

    return {
      code,
      closerName: greetingCloser.name,
      isReturning,
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
 * Reports failures honestly: an unknown address says so, and an active
 * cooldown says how long is left. Both were once silent to prevent account
 * enumeration, but this is invite-only — a manager adds every closer — and
 * a sign-in screen that claims to have sent a code it didn't send costs far
 * more than the enumeration it prevented. Only a deactivated closer still
 * gets silence, since there is nothing useful or safe to tell them.
 */
export const requestCloserMagicLink = action({
  args: { email: v.string() },
  handler: async (
    ctx,
    args,
  ): Promise<{
    success: boolean;
    error?: string;
    /** Seconds until another code may be requested. */
    retryAfter?: number;
  }> => {
    const normalizedEmail = args.email.trim().toLowerCase();

    if (!EMAIL_REGEX.test(normalizedEmail)) {
      return { success: false, error: "Invalid email format" };
    }

    const result = await ctx.runMutation(
      internal.closerMagicLink.generateMagicLinkCode,
      { email: normalizedEmail },
    );

    // B2B-specific UX: tell the user explicitly when their email isn't
    // registered. No public signup exists for the desktop app — only
    // closers a manager invited can sign in — so this is both better
    // UX (no waiting forever for an email that won't arrive) AND a
    // legitimate security layer against random installs guessing
    // their way into the code-entry screen.
    if (result.reason === "unknown_email") {
      return {
        success: false,
        error:
          "We couldn't find a closer with that email. Ask your manager to invite you, or check the spelling.",
      };
    }

    // Cooldown — say so. A code was genuinely sent moments ago, so the most
    // useful thing to say is "check your inbox", with the wait as the fallback.
    if (result.reason === "cooldown") {
      const wait = result.retryAfterSeconds ?? 60;
      return {
        success: false,
        error: `We already sent a code in the last minute — check your inbox and spam folder. You can request another in ${wait} second${wait === 1 ? "" : "s"}.`,
        retryAfter: wait,
      };
    }

    // Deactivated closer: still silent, since there is nothing useful or safe
    // to tell someone whose access was removed.
    if (!result.code) {
      return { success: true };
    }

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.error("[closerMagicLink] RESEND_API_KEY not configured");
      return { success: false, error: "Email service not configured" };
    }

    const appUrl = process.env.APP_URL?.trim() || "https://sequ3nce.ai";
    // The only link we send. Signs them in on whatever device opened the
    // email, including a phone — which the desktop deep-link never could,
    // since it needs the app on the same machine.
    const webUrl = `${appUrl}/app/login?email=${encodeURIComponent(
      normalizedEmail,
    )}&code=${result.code}`;

    const codeFormatted = `${result.code.slice(0, 3)}-${result.code.slice(3)}`;
    const greetingName = result.closerName?.trim() || "there";
    const isReturning = !!result.isReturning;

    // Closers go to the web app. That is the direction now, so the email says
    // one thing and says it plainly — an invitation that offers two ways in
    // makes the reader choose before they have any basis to, and every closer
    // who picks the desktop app is one more person to migrate later.
    //
    // The desktop app still works and /download is still live; we simply stop
    // recommending it to new closers.

    const WRAP =
      "font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 520px; margin: 0 auto; padding: 40px 20px;";
    const BTN =
      "display: inline-block; background: #111; color: white; text-decoration: none; font-weight: 600; padding: 14px 32px; border-radius: 10px; font-size: 16px;";

    const codeBlock = (intro: string) => `
        <div style="border-top: 1px solid #eee; padding-top: 20px; margin-bottom: 24px;">
          <div style="font-size: 11px; font-weight: 700; color: #888; letter-spacing: 1.5px; text-transform: uppercase; margin-bottom: 8px;">
            Or enter this code
          </div>
          <p style="color: #666; font-size: 13px; line-height: 1.5; margin: 0 0 12px 0;">
            ${intro}
          </p>
          <div style="background: #f5f5f5; border-radius: 10px; padding: 18px; text-align: center;">
            <span style="font-size: 26px; font-weight: 700; letter-spacing: 8px; color: #111; font-family: ui-monospace, SFMono-Regular, monospace;">${codeFormatted}</span>
          </div>
        </div>`;

    const primaryAction = `
        <div style="text-align: center; margin-bottom: 28px;">
          <a href="${webUrl}" style="${BTN}">Open Sequ3nce →</a>
          <p style="color: #999; font-size: 12px; margin: 10px 0 0 0;">
            Opens in your browser — works on any device.
          </p>
        </div>`;

    const html = isReturning
      ? `
      <div style="${WRAP}">
        <h2 style="color: #111; margin-bottom: 8px;">Sign in to Sequ3nce</h2>
        <p style="color: #555; font-size: 15px; line-height: 1.5; margin-bottom: 28px;">
          Hi ${greetingName}, here's your sign-in link.
        </p>

        ${primaryAction}

        ${codeBlock("Already signed in somewhere else? Open Sequ3nce there, choose <em>Email me a sign-in code</em>, and enter:")}

        <p style="color: #999; font-size: 12px; line-height: 1.5;">
          This link is valid for 7 days. If you didn't request it, you can
          safely ignore this email.
        </p>
      </div>
    `
      : `
      <div style="${WRAP}">
        <h2 style="color: #111; margin-bottom: 8px;">Welcome to Sequ3nce 👋</h2>
        <p style="color: #555; font-size: 15px; line-height: 1.6; margin-bottom: 28px;">
          Hi ${greetingName}, your manager added you to the team.
          One click and you're in — there's nothing to install.
        </p>

        ${primaryAction}

        <div style="background: #fafafa; border: 1px solid #eaeaea; border-radius: 12px; padding: 20px 24px; margin-bottom: 24px;">
          <p style="color: #555; font-size: 14px; line-height: 1.6; margin: 0;">
            <strong style="color: #111;">First thing you'll do:</strong>
            connect your calendar. That's how Sequ3nce knows which meetings are
            yours — it takes about a minute, and nothing works until it's done.
            Bookmark the page while you're there; you'll stay signed in.
          </p>
        </div>

        ${codeBlock("On a different device to the one you'll use? Go to sequ3nce.ai, choose <em>Email me a sign-in code</em>, and enter:")}

        <p style="color: #999; font-size: 12px; line-height: 1.5;">
          This invitation is valid for 7 days. If you didn't expect this email,
          you can safely ignore it.
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
          subject: isReturning
            ? "Sign in to Sequ3nce"
            : "You've been added to Sequ3nce — click to sign in",
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
type CloserAuthInfo = {
  closerId: Id<"closers">;
  teamId: Id<"teams">;
  name: string;
  email: string;
  status: string;
  teamName?: string;
};

type TeamChoice = {
  closerId: Id<"closers">;
  teamId: Id<"teams">;
  teamName: string;
  status: string;
};

// Picker tokens are 32-byte hex = 64 chars. Two minutes is enough for
// a thinking closer; long enough not to surprise them, short enough to
// minimize race window if a code was somehow stolen mid-flow.
const PICKER_TOKEN_EXPIRY_MS = 2 * 60 * 1000;
function generatePickerToken(): string {
  const buf = new Uint8Array(32);
  crypto.getRandomValues(buf);
  return Array.from(buf)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export const verifyCloserMagicLink = mutation({
  args: { email: v.string(), code: v.string() },
  handler: async (
    ctx,
    args,
  ): Promise<
    | {
        success: true;
        kind: "signed_in";
        sessionToken: string;
        closer: CloserAuthInfo;
      }
    | {
        success: true;
        kind: "team_picker";
        pickerToken: string;
        choices: TeamChoice[];
      }
    | {
        success: false;
        error: string;
      }
  > => {
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
    //
    // Multi-team disambiguation: the same email can map to closer
    // records on multiple teams (we write the same code to all of
    // them so any of them can verify). When the closer authenticates,
    // we need to pick ONE record to sign them into. Heuristic:
    //   1. Prefer "pending" records over "active" — a fresh
    //      addCloserViaMagicLink is the most common reason a code
    //      exists, and the just-added record is by definition pending.
    //   2. Within each status group, prefer the most recently created.
    // Without this sort, .collect() ordering is undefined and the
    // closer might land on a stale record from a different team.
    const sortedEligible = [...eligible].sort((a, b) => {
      const aPending = a.status === "pending" ? 0 : 1;
      const bPending = b.status === "pending" ? 0 : 1;
      if (aPending !== bPending) return aPending - bPending;
      return b._creationTime - a._creationTime;
    });

    const codeHash = await sha256Hex(code);
    let matched = null;
    for (const closer of sortedEligible) {
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

    // Code is single-use regardless of branch — clear it on ALL matching
    // records (not just the verified one) so a stolen code can't be
    // reused on a sibling team record, and reset failed-attempt counter.
    for (const closer of eligible) {
      if (closer.magicLinkCodeHash) {
        await ctx.db.patch(closer._id, {
          magicLinkCodeHash: undefined,
          magicLinkExpiresAt: undefined,
          magicLinkFailedAttempts: undefined,
        });
      }
    }

    // Single-team closer: sign in directly, no picker.
    if (eligible.length === 1) {
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
      // Proof of login for every request that follows.
      const sessionToken = await issueSession(ctx, matched);
      return {
        success: true,
        kind: "signed_in",
        sessionToken,
        closer: {
          closerId: matched._id,
          teamId: matched.teamId,
          name: matched.name,
          email: matched.email,
          status: loginUpdates.status ?? matched.status,
          teamName: team?.name,
        },
      };
    }

    // Multi-team closer: issue a short-lived picker token to ALL eligible
    // records (so the client can later submit any of them with the
    // token). No activation yet — that happens when the closer picks
    // a team. Semantically right: "I proved I own this email" is not
    // the same as "I'm joining team B."
    const pickerToken = generatePickerToken();
    const pickerTokenHash = await sha256Hex(pickerToken);
    const pickerExpiresAt = now + PICKER_TOKEN_EXPIRY_MS;
    for (const closer of eligible) {
      await ctx.db.patch(closer._id, {
        magicLinkPickerTokenHash: pickerTokenHash,
        magicLinkPickerExpiresAt: pickerExpiresAt,
      });
    }
    const choices: TeamChoice[] = [];
    for (const closer of eligible) {
      const team = await ctx.db.get(closer.teamId);
      choices.push({
        closerId: closer._id,
        teamId: closer.teamId,
        teamName: team?.name ?? "Unknown team",
        status: closer.status,
      });
    }
    return {
      success: true,
      kind: "team_picker",
      pickerToken,
      choices,
    };
  },
});

// ============================================================================
// Public mutation: pick a team after verifyCloserMagicLink returned
// multiple matches. Two-phase auth so the closer can disambiguate.
// ============================================================================

export const pickCloserTeam = mutation({
  args: {
    pickerToken: v.string(),
    closerId: v.id("closers"),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{
    success: boolean;
    error?: string;
    /** Seconds until another code may be requested. */
    retryAfter?: number;
    sessionToken?: string;
    closer?: CloserAuthInfo;
  }> => {
    const token = args.pickerToken.trim();
    if (!token) return { success: false, error: "Missing picker token" };

    const closer = await ctx.db.get(args.closerId);
    if (!closer || closer.status === "deactivated") {
      return { success: false, error: "Invalid team selection" };
    }

    const now = Date.now();
    if (
      !closer.magicLinkPickerTokenHash ||
      !closer.magicLinkPickerExpiresAt ||
      closer.magicLinkPickerExpiresAt < now
    ) {
      // Clean up the closer's stale picker fields opportunistically.
      if (closer.magicLinkPickerTokenHash) {
        await ctx.db.patch(closer._id, {
          magicLinkPickerTokenHash: undefined,
          magicLinkPickerExpiresAt: undefined,
        });
      }
      return {
        success: false,
        error: "Selection timed out. Request a new code.",
      };
    }

    const tokenHash = await sha256Hex(token);
    if (!constantTimeEqual(closer.magicLinkPickerTokenHash, tokenHash)) {
      return { success: false, error: "Invalid picker token" };
    }

    // Token is valid. Clear picker tokens from ALL records with this email
    // (single-use across teams — a closer who picks Team A can't reuse the
    // same token to also sign into Team B without a fresh code).
    const siblings = await ctx.db
      .query("closers")
      .withIndex("by_email", (q) => q.eq("email", closer.email))
      .collect();
    for (const sibling of siblings) {
      if (sibling.magicLinkPickerTokenHash) {
        await ctx.db.patch(sibling._id, {
          magicLinkPickerTokenHash: undefined,
          magicLinkPickerExpiresAt: undefined,
        });
      }
    }

    // Apply activation + lastLoginAt to the chosen closer only.
    const loginUpdates: {
      lastLoginAt: number;
      status?: string;
      activatedAt?: number;
    } = { lastLoginAt: now };
    if (closer.status === "pending") {
      loginUpdates.status = "active";
      loginUpdates.activatedAt = now;
    }
    await ctx.db.patch(closer._id, loginUpdates);

    const team = await ctx.db.get(closer.teamId);
    // The picker is the moment this closer is actually signed in, so the
    // session is issued here rather than at verify — at verify we didn't yet
    // know WHICH of their team memberships they meant.
    const sessionToken = await issueSession(ctx, closer);

    return {
      success: true,
      sessionToken,
      closer: {
        closerId: closer._id,
        teamId: closer.teamId,
        name: closer.name,
        email: closer.email,
        status: loginUpdates.status ?? closer.status,
        teamName: team?.name,
      },
    };
  },
});
