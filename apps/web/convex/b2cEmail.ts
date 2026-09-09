import { v } from "convex/values";
import { internalQuery } from "./_generated/server";
import type { ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { ALERT_EMAIL, FROM_ADDRESS } from "./adminAlerts";

// ============================================================================
// The one way new B2C code sends email.
//
// Every earlier sender inlines its own Resend call; this helper exists so the
// adoption batch (Monday roles, coaching reminders, activation nudges, founder
// alerts) shares four rules in one place:
//   1. EMAIL_DRY_RUN=1 logs the send instead of calling Resend. The dev
//      deployment has a live Resend key, so this is what keeps a dev test from
//      emailing a real member. Prod leaves it unset.
//   2. Test accounts never receive mail; opted-out members receive only
//      "transactional" mail (their own password link).
//   3. "digest" mail carries an unsubscribe footer + List-Unsubscribe headers.
//   4. "founder" mail goes to the founder's inbox, never to a member.
// ============================================================================

export type EmailKind = "transactional" | "reminder" | "digest" | "founder";

export interface SendEmailArgs {
  kind: EmailKind;
  /** Recipient. Ignored for kind "founder" (always the founder). */
  to?: string;
  subject: string;
  /** Inner HTML — wrapped in the house shell by `emailShell` unless `raw`. */
  html: string;
  raw?: boolean;
}

export interface SendEmailResult {
  sent: boolean;
  dryRun?: boolean;
  skipped?: "test-account" | "opted-out" | "no-recipient" | "no-api-key" | "resend-error";
}

/** Recipient policy: is this address a test account, and has it opted out? */
export const getRecipientPolicy = internalQuery({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    const email = args.email.trim().toLowerCase();
    const user = await ctx.db
      .query("b2cUsers")
      .withIndex("by_email", (q) => q.eq("email", email))
      .first();
    if (!user) return { known: false, isTestAccount: false, optedOut: false, userId: null };
    return {
      known: true,
      isTestAccount: user.isTestAccount === true,
      optedOut: user.emailNotificationsOptOut === true,
      userId: user._id,
    };
  },
});

/** The house B2C email frame (matches the welcome email). */
export function emailShell(inner: string, footnote?: string): string {
  return `
    <div style="font-family: -apple-system, Segoe UI, sans-serif; max-width: 520px; margin: 0 auto; color: #111;">
      ${inner}
      ${
        footnote
          ? `<p style="color: #999; font-size: 13px; line-height: 1.5; margin-top: 32px;">${footnote}</p>`
          : ""
      }
    </div>
  `;
}

/** The black pill button every B2C email uses. */
export function emailButton(href: string, label: string): string {
  return `<p style="margin: 24px 0;"><a href="${href}" style="background: #111; color: #fff; padding: 12px 22px; border-radius: 8px; text-decoration: none; font-weight: 600;">${label}</a></p>`;
}

async function hmacHex(key: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Domain-separated so a token for one purpose can never open another. */
export async function unsubscribeToken(userId: Id<"b2cUsers">): Promise<string | null> {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) return null;
  return await hmacHex(key, `b2c-unsub:${userId}`);
}

export async function verifyUnsubscribeToken(
  userId: Id<"b2cUsers">,
  token: string,
): Promise<boolean> {
  const expected = await unsubscribeToken(userId);
  if (!expected || expected.length !== token.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ token.charCodeAt(i);
  }
  return diff === 0;
}

export function unsubscribeUrl(userId: Id<"b2cUsers">, token: string): string {
  const site = process.env.CONVEX_SITE_URL ?? "https://ideal-ram-982.convex.site";
  return `${site}/b2c/email-unsubscribe?u=${encodeURIComponent(userId)}&t=${token}`;
}

/**
 * Send one email under the four rules above. Never throws: a refused or
 * skipped send is reported in the result and logged, so a cron never dies
 * on one bad address.
 */
export async function sendB2cEmail(
  ctx: ActionCtx,
  args: SendEmailArgs,
): Promise<SendEmailResult> {
  const to = args.kind === "founder" ? ALERT_EMAIL : args.to?.trim().toLowerCase();
  if (!to) return { sent: false, skipped: "no-recipient" };

  let html = args.raw ? args.html : emailShell(args.html);
  const headers: Record<string, string> = {};

  if (args.kind !== "founder") {
    const policy = await ctx.runQuery(internal.b2cEmail.getRecipientPolicy, { email: to });
    if (policy.isTestAccount) return { sent: false, skipped: "test-account" };
    if (policy.optedOut && args.kind !== "transactional") {
      return { sent: false, skipped: "opted-out" };
    }
    if (args.kind === "digest" && policy.userId) {
      const token = await unsubscribeToken(policy.userId);
      if (token) {
        const url = unsubscribeUrl(policy.userId, token);
        html += `<p style="color: #999; font-size: 12px; line-height: 1.5; margin-top: 24px; text-align: center;">You're getting this because you're a Sequ3nce Personal member. <a href="${url}" style="color: #999;">Unsubscribe from updates</a> — account emails still send.</p>`;
        headers["List-Unsubscribe"] = `<${url}>`;
        headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";
      }
    }
  }

  if (process.env.EMAIL_DRY_RUN === "1") {
    console.log(`[b2cEmail] DRY RUN (${args.kind}) → ${to}: "${args.subject}"`);
    return { sent: true, dryRun: true };
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error(`[b2cEmail] RESEND_API_KEY not set — ${args.kind} email NOT sent to ${to}`);
    return { sent: false, skipped: "no-api-key" };
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: FROM_ADDRESS,
      to: [to],
      subject: args.subject,
      html,
      ...(Object.keys(headers).length ? { headers } : {}),
    }),
  });
  if (!res.ok) {
    console.error(
      `[b2cEmail] Resend refused ${args.kind} email to ${to}: ${res.status} ${await res.text()}`,
    );
    return { sent: false, skipped: "resend-error" };
  }
  console.log(`[b2cEmail] ${args.kind} email sent to ${to}: "${args.subject}"`);
  return { sent: true };
}
