// ============================================================================
// Setter magic-link auth.
//
// Setters get a 6-digit code emailed to them and a 90-day device session.
// Mirrors closerMagicLink.ts + closerSession.ts (same Resend infra, same
// CSPRNG codes, same hash-at-rest, same constant-time compare, same
// invite-only "no account found — say so plainly" UX). Kept separate because
// setters are a different table entirely (setterRoster, not closers), and
// folding two identity models into one file is how scoping bugs get written.
//
// The old tokenized /setter-eod/[token] links stay valid for the bare EOD
// form; this login exists because call RECORDINGS now sit behind the setter
// app, and a bearer link posted into a shared Slack channel cannot guard
// those.
// ============================================================================

import { v } from "convex/values";
import {
  action,
  mutation,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CODE_REGEX = /^\d{6}$/;
const CODE_EXPIRY_MS = 15 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;
const MAX_FAILED_ATTEMPTS = 5;
/** 90 days. Setters file from their phone daily; anything shorter turns
 *  into a weekly login dance for a two-minute form. */
export const SETTER_SESSION_TTL_MS = 90 * 24 * 60 * 60 * 1000;

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

function generate6DigitCode(): string {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return String(100000 + (buf[0] % 900000));
}

function generateSessionToken(): string {
  const buf = new Uint8Array(32);
  crypto.getRandomValues(buf);
  return Array.from(buf)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Active roster rows for a lowercased email, across all teams. */
async function rosterRowsForEmail(ctx: any, email: string) {
  // setterRoster has no by_email index and stays small (tens of rows per
  // team, a handful of teams with the flag) — a filtered scan is fine and
  // avoids another index migration.
  const all = await ctx.db.query("setterRoster").collect();
  return all.filter(
    (r: any) => r.active === true && (r.email ?? "").toLowerCase() === email,
  );
}

// ============================================================================
// Request a code
// ============================================================================

export const generateSetterCode = internalMutation({
  args: { email: v.string() },
  handler: async (
    ctx,
    args,
  ): Promise<{
    code: string | null;
    setterName?: string;
    rosterId?: Id<"setterRoster">;
    reason?: "cooldown" | "unknown_email" | "invalid_format";
    retryAfterSeconds?: number;
  }> => {
    const email = args.email.trim().toLowerCase();
    if (!EMAIL_REGEX.test(email)) {
      return { code: null, reason: "invalid_format" };
    }

    const rows = await rosterRowsForEmail(ctx, email);
    if (rows.length === 0) {
      return { code: null, reason: "unknown_email" };
    }
    // Same email on two teams: newest active row wins. Genuinely ambiguous
    // duplicates are a support case, not a UI (spec decision).
    const row = rows.sort(
      (a: any, b: any) => b._creationTime - a._creationTime,
    )[0];

    const now = Date.now();
    const existing = await ctx.db
      .query("setterMagicCodes")
      .withIndex("by_email", (q) => q.eq("email", email))
      .collect();

    const lastSent = Math.max(0, ...existing.map((c) => c.createdAt));
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

    // One live code per email: burn predecessors so verify has exactly one
    // candidate and a stale inbox email can't confuse anyone.
    for (const c of existing) {
      await ctx.db.delete(c._id);
    }

    const code = generate6DigitCode();
    await ctx.db.insert("setterMagicCodes", {
      email,
      rosterId: row._id,
      codeHash: await sha256Hex(code),
      createdAt: now,
      expiresAt: now + CODE_EXPIRY_MS,
      attempts: 0,
    });

    return { code, setterName: row.name, rosterId: row._id };
  },
});

export const requestSetterCode = action({
  args: { email: v.string() },
  handler: async (
    ctx,
    args,
  ): Promise<{ success: boolean; error?: string; retryAfter?: number }> => {
    const email = args.email.trim().toLowerCase();
    if (!EMAIL_REGEX.test(email)) {
      return { success: false, error: "That doesn't look like an email address." };
    }

    const result = await ctx.runMutation(internal.setterAuth.generateSetterCode, {
      email,
    });

    if (result.reason === "unknown_email") {
      return {
        success: false,
        error:
          "No setter account found for that email — ask your manager to add it on the roster.",
      };
    }
    if (result.reason === "cooldown") {
      const wait = result.retryAfterSeconds ?? 60;
      return {
        success: false,
        error: `We already sent a code in the last minute — check your inbox and spam. You can request another in ${wait}s.`,
        retryAfter: wait,
      };
    }
    if (!result.code) {
      return { success: false, error: "Couldn't create a sign-in code. Try again." };
    }

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.error("[setterAuth] RESEND_API_KEY not configured");
      return { success: false, error: "Email service not configured" };
    }

    const codeFormatted = `${result.code.slice(0, 3)}-${result.code.slice(3)}`;
    const name = result.setterName?.trim() || "there";
    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 520px; margin: 0 auto; padding: 40px 20px;">
        <h2 style="color: #111; margin-bottom: 8px;">Your Sequ3nce sign-in code</h2>
        <p style="color: #555; font-size: 15px; line-height: 1.5; margin-bottom: 24px;">
          Hi ${name}, enter this code to sign in to the setter app:
        </p>
        <div style="background: #f5f5f5; border-radius: 10px; padding: 18px; text-align: center; margin-bottom: 24px;">
          <span style="font-size: 26px; font-weight: 700; letter-spacing: 8px; color: #111; font-family: ui-monospace, SFMono-Regular, monospace;">${codeFormatted}</span>
        </div>
        <p style="color: #999; font-size: 12px; line-height: 1.5;">
          The code works for 15 minutes. If you didn't request it, you can
          safely ignore this email.
        </p>
      </div>`;

    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "Sequ3nce <noreply@noreply.sequ3nce.ai>",
          to: [email],
          subject: "Your Sequ3nce sign-in code",
          html,
        }),
      });
      if (!response.ok) {
        const text = await response.text();
        console.error(`[setterAuth] Resend ${response.status}: ${text.slice(0, 200)}`);
        return { success: false, error: "Failed to send email" };
      }
      return { success: true };
    } catch (err) {
      console.error("[setterAuth] send failed:", err);
      return { success: false, error: "Failed to send email" };
    }
  },
});

// ============================================================================
// Verify code → session
// ============================================================================

export const verifySetterCode = mutation({
  args: { email: v.string(), code: v.string() },
  handler: async (
    ctx,
    args,
  ): Promise<
    | { success: true; sessionToken: string; name: string }
    | { success: false; error: string }
  > => {
    const email = args.email.trim().toLowerCase();
    const code = args.code.trim();
    if (!EMAIL_REGEX.test(email)) return { success: false, error: "Invalid email" };
    if (!CODE_REGEX.test(code)) return { success: false, error: "Invalid code" };

    const now = Date.now();
    const candidates = await ctx.db
      .query("setterMagicCodes")
      .withIndex("by_email", (q) => q.eq("email", email))
      .collect();
    const live = candidates.filter((c) => !c.usedAt && c.expiresAt > now);

    if (live.length === 0) {
      return { success: false, error: "Invalid or expired code. Request a new one." };
    }
    const record = live[0];

    if (record.attempts >= MAX_FAILED_ATTEMPTS) {
      await ctx.db.delete(record._id);
      return { success: false, error: "Too many failed attempts. Request a new code." };
    }

    const codeHash = await sha256Hex(code);
    if (!constantTimeEqual(record.codeHash, codeHash)) {
      await ctx.db.patch(record._id, { attempts: record.attempts + 1 });
      return { success: false, error: "Invalid or expired code" };
    }

    // Single-use.
    await ctx.db.patch(record._id, { usedAt: now });

    const roster = await ctx.db.get(record.rosterId);
    if (!roster || roster.active !== true) {
      return { success: false, error: "This setter account is no longer active." };
    }

    const sessionToken = generateSessionToken();
    await ctx.db.insert("setterSessions", {
      rosterId: roster._id,
      teamId: roster.teamId,
      tokenHash: await sha256Hex(sessionToken),
      createdAt: now,
      expiresAt: now + SETTER_SESSION_TTL_MS,
      lastSeenAt: now,
    });

    return { success: true, sessionToken, name: roster.name };
  },
});

// ============================================================================
// Session resolution — the ONLY way setter identity enters other functions
// ============================================================================

export type SetterIdentity = {
  rosterId: Id<"setterRoster">;
  teamId: Id<"teams">;
  name: string;
  pod?: string;
};

/** Shared resolver for queries/mutations in other files. Deactivating the
 *  roster row kills every live session instantly — checked on every call. */
export async function resolveSetterSessionCtx(
  ctx: any,
  sessionToken: string,
): Promise<SetterIdentity | null> {
  const token = (sessionToken ?? "").trim();
  if (token.length < 32) return null;
  const tokenHash = await sha256Hex(token);
  const session = await ctx.db
    .query("setterSessions")
    .withIndex("by_token_hash", (q: any) => q.eq("tokenHash", tokenHash))
    .first();
  if (!session || session.expiresAt < Date.now()) return null;
  const roster = await ctx.db.get(session.rosterId);
  if (!roster || roster.active !== true) return null;
  return {
    rosterId: roster._id,
    teamId: roster.teamId,
    name: roster.name,
    pod: roster.pod,
  };
}

export const resolveSetterSession = internalQuery({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => resolveSetterSessionCtx(ctx, args.sessionToken),
});

export const logoutSetter = mutation({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    const tokenHash = await sha256Hex(args.sessionToken.trim());
    const session = await ctx.db
      .query("setterSessions")
      .withIndex("by_token_hash", (q) => q.eq("tokenHash", tokenHash))
      .first();
    if (session) await ctx.db.delete(session._id);
    return { success: true };
  },
});
