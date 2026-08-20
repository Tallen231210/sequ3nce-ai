import { v } from "convex/values";
import { internalAction, internalMutation } from "./_generated/server";
import { internal, api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

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

export const applyB2CSubscription = internalMutation({
  args: {
    polarCustomerId: v.string(),
    polarSubscriptionId: v.string(),
    status: v.string(), // already mapped to b2c vocabulary by the webhook
    planTerm: v.union(...VALID_PLANS.map((p) => v.literal(p))),
    email: v.optional(v.string()),
    name: v.optional(v.string()),
    currentPeriodEnd: v.optional(v.number()),
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
      await ctx.db.patch(user._id, {
        polarCustomerId: args.polarCustomerId,
        polarSubscriptionId: args.polarSubscriptionId,
        subscriptionStatus: status,
        planTerm: args.planTerm,
        currentPeriodEnd: args.currentPeriodEnd,
        ...(status === "cancelled" ? { cancelledAt: Date.now() } : {}),
      });
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

    const resendApiKey = process.env.RESEND_API_KEY;
    if (!resendApiKey) {
      console.error(
        `[b2cPolar] RESEND_API_KEY not set — welcome email NOT sent to ${args.email}. ` +
          `Their account exists but they have no way in without support.`,
      );
      return;
    }

    const activateUrl = `https://sequ3nce.ai/personal/activate?email=${encodeURIComponent(args.email)}&code=${code}`;
    const firstName = args.name.split(/\s+/)[0] || "there";

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Sequ3nce <noreply@noreply.sequ3nce.ai>",
        to: args.email,
        subject: "Your Sequ3nce Personal access is ready",
        html: `
          <div style="font-family: -apple-system, Segoe UI, sans-serif; max-width: 520px; margin: 0 auto; color: #111;">
            <h2 style="margin: 24px 0 8px;">Welcome to Sequ3nce Personal, ${firstName}.</h2>
            <p style="color: #444; line-height: 1.6;">
              Your payment went through and your account is live. Two steps and
              you're recording calls:
            </p>
            <p style="margin: 24px 0;">
              <a href="${activateUrl}"
                 style="background: #111; color: #fff; padding: 12px 22px; border-radius: 8px; text-decoration: none; font-weight: 600;">
                1&nbsp;·&nbsp;Set your password
              </a>
            </p>
            <p style="color: #444; line-height: 1.6;">
              2 · Download the app from the same page and sign in with
              <strong>${args.email}</strong>.
            </p>
            <p style="color: #999; font-size: 13px; line-height: 1.5; margin-top: 32px;">
              This link works for 7 days. If it expires, use "Forgot password"
              at sign-in — same thing. Questions? Just reply to this email.
            </p>
          </div>
        `,
      }),
    });

    if (!response.ok) {
      console.error(
        `[b2cPolar] Resend refused the welcome email for ${args.email}: ` +
          `${response.status} ${await response.text()}`,
      );
    } else {
      console.log(`[b2cPolar] welcome email sent to ${args.email}`);
    }
  },
});
