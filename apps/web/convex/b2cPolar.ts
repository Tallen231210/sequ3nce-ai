import { v } from "convex/values";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { internal, api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { emailButton, sendB2cEmail } from "./b2cEmail";

/* eslint-disable @typescript-eslint/no-explicit-any */

// ============================================================================
// Sequ3nce Personal on Polar: pay on the web FIRST, then get the app.
//
// The account is created BY the payment. Polar's subscription webhook is the
// front door: an unknown customer email gets a full account provisioned
// (team-of-one, closer row, b2cUser) with no password and no phone — the
// welcome email carries a set-password link, and the app's login refuses
// passwordless accounts with guidance instead of a dead end. A leaked
// installer is worthless: the paywall is the account, and the account only
// exists because a payment created it.
//
// Deliberately parallel to convex/polar.ts (B2B) rather than shared with it:
// B2B writes to teams keyed by metadata.tier; B2C writes to b2cUsers keyed by
// metadata.b2c_plan. The webhook routes on which metadata key is present, so
// neither side can ever misfile the other's money.
// ============================================================================

const VALID_PLANS = ["monthly", "3month", "6month", "yearly"] as const;

/** Polar statuses in b2cUsers.subscriptionStatus vocabulary. */
export function mapPolarStatusToB2C(
  status: string | undefined,
): "active" | "past_due" | "cancelled" | "none" {
  switch (status) {
    case "active":
    case "trialing": // no trials sold, but if one ever is, it means "in"
      return "active";
    case "past_due":
    case "unpaid":
      return "past_due";
    case "canceled":
    case "revoked":
      return "cancelled";
    default:
      // "incomplete" and anything unknown: not entitled, and if the user
      // doesn't exist yet we don't provision on it.
      return "none";
  }
}

/**
 * The VIP tier grants itself: "vip" rides b2cUsers.badges whenever the
 * member is on an ACTIVE YEARLY plan, and leaves the moment they aren't.
 * Touches only the "vip" string — founder/coach/admin badges are never
 * affected. Cancelled-at-period-end keeps VIP until Polar flips the
 * status at period end, matching how app access already behaves.
 */
function withVipSynced(
  badges: string[] | undefined,
  planTerm: string | undefined,
  status: string,
): string[] | undefined {
  const isVip = planTerm === "yearly" && status === "active";
  const current = badges ?? [];
  const has = current.includes("vip");
  if (isVip && !has) return [...current, "vip"];
  if (!isVip && has) return current.filter((b) => b !== "vip");
  return undefined; // no change needed — avoid pointless writes
}

export const applyB2CSubscription = internalMutation({
  args: {
    polarCustomerId: v.string(),
    polarSubscriptionId: v.string(),
    status: v.string(), // already mapped to b2c vocabulary by the webhook
    planTerm: v.union(...VALID_PLANS.map((p) => v.literal(p))),
    email: v.optional(v.string()),
    name: v.optional(v.string()),
    currentPeriodEnd: v.optional(v.number()),
    // Cancellation signals. `undefined` = not in this payload (leave as is);
    // only an explicit `false` — Polar's `uncanceled` — clears them.
    cancelAtPeriodEnd: v.optional(v.boolean()),
    canceledAt: v.optional(v.number()),
    cancellationReason: v.optional(v.string()),
    cancellationComment: v.optional(v.string()),
    modifiedAt: v.optional(v.number()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ applied: boolean; provisioned: boolean; reason?: string }> => {
    const status = args.status as "active" | "past_due" | "cancelled" | "none";

    // 1. Known Polar customer — plain status update.
    let user = await ctx.db
      .query("b2cUsers")
      .withIndex("by_polar_customer", (q) =>
        q.eq("polarCustomerId", args.polarCustomerId),
      )
      .first();

    // 2. Unknown customer id but the email already has an account — link them.
    //    Covers a lapsed customer buying again (new Polar customer id, same
    //    person) and anyone who signed up in-app back in the Stripe era.
    const email = args.email?.trim().toLowerCase();
    if (!user && email) {
      user = await ctx.db
        .query("b2cUsers")
        .withIndex("by_email", (q) => q.eq("email", email))
        .first();
    }

    if (user) {
      // Polar sends `canceled` AND `updated` for one cancel, and retries can
      // arrive out of order. An event older than the last one applied for
      // this same subscription must not undo a newer one.
      if (
        args.modifiedAt !== undefined &&
        user.polarSubscriptionModifiedAt !== undefined &&
        user.polarSubscriptionId === args.polarSubscriptionId &&
        args.modifiedAt < user.polarSubscriptionModifiedAt
      ) {
        return { applied: false, provisioned: false, reason: "stale event — older than last applied" };
      }

      const badgePatch = withVipSynced(user.badges, args.planTerm, status);

      // Cancellation fields. Access is NOT changed here — subscriptionStatus
      // keeps meaning what it meant, and a cancel-at-period-end member stays
      // "active" until Polar flips the status at period end.
      const cancelPatch: Record<string, unknown> = {};
      if (args.cancelAtPeriodEnd === true) {
        cancelPatch.cancelAtPeriodEnd = true;
      } else if (args.cancelAtPeriodEnd === false) {
        cancelPatch.cancelAtPeriodEnd = false;
        cancelPatch.canceledAt = undefined;
        cancelPatch.cancellationReason = undefined;
        cancelPatch.cancellationComment = undefined;
      }
      if (args.canceledAt !== undefined) cancelPatch.canceledAt = args.canceledAt;
      if (args.cancellationReason !== undefined) cancelPatch.cancellationReason = args.cancellationReason;
      if (args.cancellationComment !== undefined) cancelPatch.cancellationComment = args.cancellationComment;

      // The two transitions worth a human's attention, detected against the
      // row BEFORE the patch so a retried webhook can't alert twice.
      const becameCancelling =
        user.cancelAtPeriodEnd !== true && args.cancelAtPeriodEnd === true;
      const becameCancelled =
        user.subscriptionStatus !== "cancelled" && status === "cancelled";

      await ctx.db.patch(user._id, {
        polarCustomerId: args.polarCustomerId,
        polarSubscriptionId: args.polarSubscriptionId,
        subscriptionStatus: status,
        planTerm: args.planTerm,
        currentPeriodEnd: args.currentPeriodEnd,
        ...(args.modifiedAt !== undefined ? { polarSubscriptionModifiedAt: args.modifiedAt } : {}),
        ...(badgePatch !== undefined ? { badges: badgePatch } : {}),
        ...(status === "cancelled" ? { cancelledAt: Date.now() } : {}),
        ...cancelPatch,
      });

      if (becameCancelling || becameCancelled) {
        await ctx.scheduler.runAfter(0, internal.b2cChurnAlerts.sendCancellationAlert, {
          userId: user._id,
          trigger: becameCancelled ? "cancelled" : "cancel_at_period_end",
        });
      }
      return { applied: true, provisioned: false };
    }

    // 3. Nobody with this customer id or email: this payment IS the signup.
    if (!email) {
      return {
        applied: false,
        provisioned: false,
        reason: "no email on the event and no matching account",
      };
    }
    if (status !== "active") {
      // Don't create accounts for incomplete/failed checkouts — the "active"
      // event for this subscription will do it moments later if payment lands.
      return {
        applied: false,
        provisioned: false,
        reason: `unknown customer with status "${status}" — not provisioning`,
      };
    }

    const name =
      args.name?.trim() ||
      // "jane.doe@x.com" → "Jane Doe" as a placeholder they can change later.
      email
        .split("@")[0]
        .split(/[._-]+/)
        .filter(Boolean)
        .map((w) => w[0].toUpperCase() + w.slice(1))
        .join(" ") ||
      "New Member";
    const now = Date.now();

    const teamId = await ctx.db.insert("teams", {
      name: `${name}'s Workspace`,
      type: "personal",
      plan: "active",
      createdAt: now,
    });
    const closerId = await ctx.db.insert("closers", {
      email,
      name,
      teamId,
      status: "active",
      invitedAt: now,
      activatedAt: now,
    });
    void closerId;
    const b2cUserId = await ctx.db.insert("b2cUsers", {
      email,
      phoneVerified: false,
      emailVerified: true, // they received Polar's receipt at this address
      name,
      personalWorkspaceId: teamId,
      subscriptionStatus: status,
      polarCustomerId: args.polarCustomerId,
      polarSubscriptionId: args.polarSubscriptionId,
      planTerm: args.planTerm,
      currentPeriodEnd: args.currentPeriodEnd,
      ...(args.planTerm === "yearly" ? { badges: ["vip"] } : {}),
      createdAt: now,
    });

    // Same GHL tag as in-app signup, so marketing sequences stay coherent.
    await ctx.scheduler.runAfter(0, api.b2cGhl.syncSignupToGHL, {
      email,
      phone: "",
      name,
    });

    // Welcome email with the set-password link. The code reuses the password
    // reset machinery (hashed 6-digit code) with a longer expiry — setting
    // your first password IS a password reset, from the machine's viewpoint.
    // The welcome action also schedules the 1h / 24h "still not in?" nudges,
    // because they must carry the SAME code (see sendWelcomeEmail).
    await ctx.scheduler.runAfter(0, internal.b2cPolar.sendWelcomeEmail, {
      b2cUserId,
      email,
      name,
    });

    return { applied: true, provisioned: true };
  },
});

/**
 * Welcome email for a checkout-provisioned account: set your password, then
 * download the app. Sent via Resend like every other B2C email.
 */
export const sendWelcomeEmail = internalAction({
  args: {
    b2cUserId: v.id("b2cUsers"),
    email: v.string(),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    // 7 days, not the reset flow's minutes — this code sits in an inbox until
    // they get around to it, and a dead link on day 2 means a support ticket.
    const WELCOME_CODE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
    const { code } = await ctx.runMutation(
      internal.b2cAuth.generatePasswordResetCode,
      { email: args.email, expiryMs: WELCOME_CODE_TTL_MS },
    );

    if (!code) {
      console.error(`[b2cPolar] could not mint a welcome code for ${args.email} — no such user?`);
      return;
    }
    const activateUrl = activationUrl(args.email, code);
    const firstName = args.name.split(/\s+/)[0] || "there";

    const result = await sendB2cEmail(ctx, {
      kind: "transactional",
      to: args.email,
      subject: "Your Sequ3nce Personal access is ready",
      html: `
        <h2 style="margin: 24px 0 8px;">Welcome to Sequ3nce Personal, ${firstName}.</h2>
        <p style="color: #444; line-height: 1.6;">
          Your payment went through and your account is live. Two steps and
          you're recording calls:
        </p>
        ${emailButton(activateUrl, "1&nbsp;·&nbsp;Set your password")}
        <p style="color: #444; line-height: 1.6;">
          2 · Download the app and sign in with
          <strong>${args.email}</strong>.
        </p>
        <p style="color: #444; line-height: 1.6;">
          On your phone right now? No problem — the app runs on Mac and
          Windows. When you're at your computer, open
          <a href="https://sequ3nce.ai/personal/download" style="color: #111; font-weight: 600;">sequ3nce.ai/personal/download</a>
          — this email will still be here.
        </p>
        <p style="color: #999; font-size: 13px; line-height: 1.5; margin-top: 32px;">
          This link works for 7 days. If it expires, use "Forgot password"
          at sign-in — same thing. Questions? Just reply to this email.
        </p>
      `,
    });
    if (!result.sent) {
      console.error(
        `[b2cPolar] welcome email NOT sent to ${args.email} (${result.skipped}). ` +
          `Their account exists but they have no way in without support.`,
      );
    }

    // "Still not in?" nudges. They carry THIS code: minting a new one would
    // overwrite it and kill the welcome link for exactly the buyer who opens
    // the email later. A customer who activated is silently skipped.
    for (const [delayMs, stage] of [
      [60 * 60 * 1000, "1h"],
      [24 * 60 * 60 * 1000, "24h"],
    ] as const) {
      await ctx.scheduler.runAfter(delayMs, internal.b2cPolar.sendActivationReminder, {
        b2cUserId: args.b2cUserId,
        email: args.email,
        name: args.name,
        code,
        stage,
      });
    }
  },
});

function activationUrl(email: string, code: string): string {
  return `https://sequ3nce.ai/personal/activate?email=${encodeURIComponent(email)}&code=${code}`;
}

/**
 * Polar customer portal session for a B2C user — where they update cards,
 * see invoices, or cancel. The app's paywall and settings link here.
 */
export const createPortalSession = internalAction({
  args: { b2cUserId: v.id("b2cUsers") },
  handler: async (ctx, args): Promise<{ url?: string; error?: string }> => {
    const user = await ctx.runQuery(internal.b2cPolar.getUserForPortal, {
      b2cUserId: args.b2cUserId,
    });
    if (!user) return { error: "Account not found" };
    if (!user.polarCustomerId) {
      return { error: "No billing profile yet — subscribe first." };
    }

    const token = process.env.POLAR_ACCESS_TOKEN;
    if (!token) {
      console.error("[b2cPolar] POLAR_ACCESS_TOKEN not set on this deployment");
      return { error: "Billing portal isn't available right now." };
    }
    // Same host discipline as src/lib/polar.ts: unset means PRODUCTION on
    // purpose (a forgotten env var must not silently point at sandbox), and
    // anything that isn't a Polar host is refused.
    const base = process.env.POLAR_API_BASE || "https://api.polar.sh";
    if (base !== "https://api.polar.sh" && base !== "https://sandbox-api.polar.sh") {
      console.error(`[b2cPolar] refusing non-Polar POLAR_API_BASE: ${base}`);
      return { error: "Billing portal isn't available right now." };
    }

    const res = await fetch(`${base}/v1/customer-sessions/`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ customer_id: user.polarCustomerId }),
    });
    if (!res.ok) {
      console.error(
        `[b2cPolar] customer session refused: ${res.status} ${await res.text()}`,
      );
      return { error: "Billing portal isn't available right now." };
    }
    const session = (await res.json()) as { customer_portal_url?: string };
    if (!session.customer_portal_url) {
      return { error: "Billing portal isn't available right now." };
    }
    return { url: session.customer_portal_url };
  },
});

export const getUserForPortal = internalQuery({
  args: { b2cUserId: v.id("b2cUsers") },
  handler: async (ctx, args) => {
    const u = await ctx.db.get(args.b2cUserId);
    return u ? { polarCustomerId: u.polarCustomerId ?? null } : null;
  },
});


/**
 * "Still not in?" nudges at 1h and 24h after purchase, only while they have
 * never set a password. Scheduled by sendWelcomeEmail with the welcome
 * email's own code, so all three links are the same, still-valid link.
 * `code`/`stage` are optional only for jobs scheduled by the previous
 * version (24h, no code) still sitting in the queue at deploy time.
 */
export const sendActivationReminder = internalAction({
  args: {
    b2cUserId: v.id("b2cUsers"),
    email: v.string(),
    name: v.string(),
    code: v.optional(v.string()),
    stage: v.optional(v.union(v.literal("1h"), v.literal("24h"))),
  },
  handler: async (ctx, args) => {
    const user = await ctx.runQuery(internal.b2cPolar.getActivationState, {
      b2cUserId: args.b2cUserId,
    });
    if (!user) return;
    if (user.hasPassword) return; // they're in — nothing to say
    if (user.subscriptionStatus !== "active") return; // refunded/cancelled — don't nudge
    if (user.cancelAtPeriodEnd) return; // already leaving — don't chase

    const stage = args.stage ?? "24h";
    let code = args.code;
    if (!code) {
      // Legacy job from before the nudges carried the welcome code.
      const minted = await ctx.runMutation(internal.b2cAuth.generatePasswordResetCode, {
        email: args.email,
        expiryMs: 7 * 24 * 60 * 60 * 1000,
      });
      code = minted.code ?? undefined;
    }
    if (!code) {
      console.error(`[b2cPolar] no activation code for ${args.email} — reminder not sent`);
      return;
    }
    const activateUrl = activationUrl(args.email, code);
    const firstName = args.name.split(/\s+/)[0] || "there";
    const when = stage === "1h" ? "about an hour ago" : "yesterday";

    const result = await sendB2cEmail(ctx, {
      kind: "transactional",
      to: args.email,
      subject:
        stage === "1h"
          ? "Your Sequ3nce Personal login — one step left"
          : "Your Sequ3nce Personal access is waiting",
      html: `
        <h2 style="margin: 24px 0 8px;">${firstName}, your access is ready — you just haven't stepped in yet.</h2>
        <p style="color: #444; line-height: 1.6;">
          You joined Sequ3nce Personal ${when} but haven't set your
          password. It takes thirty seconds:
        </p>
        ${emailButton(activateUrl, "Set your password &amp; download the app")}
        <p style="color: #444; line-height: 1.6;">
          On your phone? The app runs on Mac and Windows — when you're at
          your computer, open
          <a href="https://sequ3nce.ai/personal/download" style="color: #111; font-weight: 600;">sequ3nce.ai/personal/download</a>.
        </p>
        <p style="color: #999; font-size: 13px; line-height: 1.5; margin-top: 32px;">
          Sign in afterwards with <strong>${args.email}</strong>. Stuck on
          anything? Reply to this email and a human reads it.
        </p>
      `,
    });
    if (result.sent) {
      await ctx.runMutation(internal.b2cPolar.stampActivationNudge, {
        b2cUserId: args.b2cUserId,
      });
    }

    // A day in, still never opened the app: that's a refund brewing, and a
    // human can still catch it. One heads-up per member.
    if (stage === "24h") {
      await ctx.scheduler.runAfter(0, internal.b2cChurnAlerts.sendActivationAlert, {
        userId: args.b2cUserId,
      });
    }
  },
});

export const stampActivationNudge = internalMutation({
  args: { b2cUserId: v.id("b2cUsers") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.b2cUserId, { activationNudgedAt: Date.now() });
  },
});

export const getActivationState = internalQuery({
  args: { b2cUserId: v.id("b2cUsers") },
  handler: async (ctx, args) => {
    const u = await ctx.db.get(args.b2cUserId);
    return u
      ? {
          hasPassword: !!u.passwordHash,
          subscriptionStatus: u.subscriptionStatus,
          cancelAtPeriodEnd: u.cancelAtPeriodEnd === true,
        }
      : null;
  },
});

/**
 * One-off sweep: grant/revoke the vip badge for every user according to
 * their CURRENT plan. Safe to re-run (no-ops when already correct).
 */
export const backfillVipBadges = internalMutation({
  args: {},
  handler: async (ctx) => {
    const users = await ctx.db.query("b2cUsers").collect();
    let granted = 0;
    let revoked = 0;
    for (const u of users) {
      const patch = withVipSynced(u.badges, u.planTerm, u.subscriptionStatus);
      if (patch !== undefined) {
        await ctx.db.patch(u._id, { badges: patch });
        if (patch.includes("vip")) granted++;
        else revoked++;
      }
    }
    return { granted, revoked, scanned: users.length };
  },
});
