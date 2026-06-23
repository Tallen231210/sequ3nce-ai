"use node";

// ============================================================================
// B2B welcome email — fires on Stripe checkout.session.completed for new
// customer teams. Reuses the Resend pattern from b2cEmailVerification.ts
// and b2cAuth.ts (raw fetch, inline HTML, verified noreply subdomain).
//
// Idempotency: action checks team.welcomeEmailSentAt before sending so a
// Stripe webhook retry won't double-send. Caller (the webhook handler)
// also checks before scheduling for belt-and-suspenders.
// ============================================================================

import { v } from "convex/values";
import { action, internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

const FROM_ADDRESS = "Sequ3nce <noreply@noreply.sequ3nce.ai>";

// V8 helpers (internalQuery + internalMutation) live in
// welcomeEmailInternal.ts — Convex requires non-Node runtime for them.

/**
 * Sends the welcome email to a brand-new B2B manager. Scheduled by the
 * Stripe webhook on checkout.session.completed for company-type signups.
 *
 * Email contents:
 *  - Subject line introduces Sequ3nce
 *  - Primary CTA: book Tyler's onboarding call (Calendly link via env var)
 *  - Secondary self-serve steps with deep links into the dashboard
 *  - Footer with manual support fallback
 *
 * If RESEND_API_KEY or NEXT_PUBLIC_CALENDLY_URL aren't set, the email
 * still sends but the Calendly section is omitted — graceful degradation
 * so we never block a Stripe webhook on missing config.
 */
export const sendB2BWelcomeEmail = internalAction({
  args: {
    teamId: v.id("teams"),
    managerEmail: v.string(),
    managerName: v.optional(v.string()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ ok: boolean; reason?: string }> => {
    // Idempotency — re-check on the server side in case the webhook
    // retried after we'd already started but before we marked sent.
    const team = await ctx.runQuery(internal.welcomeEmailInternal.getTeamForWelcome, {
      teamId: args.teamId,
    });
    if (!team) return { ok: false, reason: "Team not found" };
    if (team.welcomeEmailSentAt) return { ok: true, reason: "Already sent" };

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.error("[welcomeEmail] RESEND_API_KEY not configured");
      return { ok: false, reason: "Email service not configured" };
    }

    const calendlyUrl = process.env.NEXT_PUBLIC_CALENDLY_URL?.trim();
    const dashboardUrl =
      process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://sequ3nce.ai";

    const greetingName = args.managerName?.trim() || "there";

    const calendlyBlock = calendlyUrl
      ? `
        <div style="background: #1e293b; border-radius: 10px; padding: 24px; margin: 24px 0; text-align: center;">
          <p style="color: #cbd5e1; font-size: 13px; margin: 0 0 12px 0; text-transform: uppercase; letter-spacing: 1px;">
            Step 1 of your setup
          </p>
          <h3 style="color: white; font-size: 18px; margin: 0 0 14px 0;">
            Book your 30-min onboarding call
          </h3>
          <p style="color: #cbd5e1; font-size: 14px; margin: 0 0 20px 0;">
            We'll walk you through the platform live and help you configure
            integrations together.
          </p>
          <a
            href="${calendlyUrl}"
            style="display: inline-block; background: white; color: #111; font-weight: 600; padding: 12px 28px; border-radius: 8px; text-decoration: none;"
          >
            Schedule your call →
          </a>
        </div>`
      : "";

    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 40px 20px; color: #111;">
        <h1 style="font-size: 24px; margin: 0 0 8px 0;">Welcome to Sequ3nce 👋</h1>
        <p style="color: #555; font-size: 15px; line-height: 1.6; margin: 0 0 24px 0;">
          Hi ${greetingName}, you're in. Here's how to get your team running.
        </p>

        ${calendlyBlock}

        <h3 style="font-size: 16px; margin: 28px 0 12px 0;">While you wait — quick self-serve steps</h3>
        <ul style="padding: 0; margin: 0 0 24px 0; list-style: none;">
          <li style="padding: 12px 0; border-bottom: 1px solid #eee;">
            <a href="${dashboardUrl}/dashboard/team" style="color: #111; font-weight: 600; text-decoration: none;">
              Add your closers →
            </a>
            <div style="color: #777; font-size: 13px; margin-top: 4px;">
              Settings → Team. We'll send each of them install instructions.
            </div>
          </li>
          <li style="padding: 12px 0; border-bottom: 1px solid #eee;">
            <a href="${dashboardUrl}/download" style="color: #111; font-weight: 600; text-decoration: none;">
              Forward the desktop app download to each closer →
            </a>
            <div style="color: #777; font-size: 13px; margin-top: 4px;">
              ${dashboardUrl}/download — Mac + Windows, auto-detects platform.
            </div>
          </li>
          <li style="padding: 12px 0;">
            <a href="${dashboardUrl}/dashboard/onboarding" style="color: #111; font-weight: 600; text-decoration: none;">
              See the full setup checklist →
            </a>
            <div style="color: #777; font-size: 13px; margin-top: 4px;">
              GoHighLevel + Hyros + Slack notifications — each step auto-checks
              when you complete it.
            </div>
          </li>
        </ul>

        <p style="color: #555; font-size: 14px; line-height: 1.6; margin: 24px 0 0 0;">
          Stuck on anything? Reply to this email and we'll help — or wait for
          our call and we'll set it all up together.
        </p>
        <p style="color: #aaa; font-size: 12px; margin-top: 28px;">
          — The Sequ3nce team
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
          from: FROM_ADDRESS,
          to: [args.managerEmail],
          subject: "Welcome to Sequ3nce — let's get you set up",
          html,
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        console.error(
          `[welcomeEmail] Resend ${response.status}: ${text.slice(0, 200)}`,
        );
        return { ok: false, reason: `Resend ${response.status}` };
      }

      await ctx.runMutation(internal.welcomeEmailInternal.markWelcomeSent, {
        teamId: args.teamId,
        sentAt: Date.now(),
      });
      return { ok: true };
    } catch (err) {
      console.error("[welcomeEmail] send failed:", err);
      return { ok: false, reason: String(err) };
    }
  },
});

/**
 * Public wrapper invoked by the Stripe webhook handler. Looks up the
 * team by stripeCustomerId then delegates to the internal sender.
 *
 * Returns immediately even on failure — Stripe webhook responses must
 * not block on email infra. Errors are logged via the inner action.
 */
export const scheduleB2BWelcomeEmail = action({
  args: {
    stripeCustomerId: v.string(),
    managerEmail: v.string(),
    managerName: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{ ok: boolean; reason?: string }> => {
    if (!args.managerEmail) {
      return { ok: false, reason: "No manager email provided" };
    }
    const found = await ctx.runQuery(
      internal.welcomeEmailInternal.findTeamByStripeCustomer,
      { stripeCustomerId: args.stripeCustomerId },
    );
    if (!found) return { ok: false, reason: "Team not found" };
    if (found.welcomeEmailSentAt) return { ok: true, reason: "Already sent" };

    return await ctx.runAction(internal.welcomeEmail.sendB2BWelcomeEmail, {
      teamId: found.teamId,
      managerEmail: args.managerEmail,
      managerName: args.managerName,
    });
  },
});

// Belt-and-suspenders: type-import keeps Id reachable for tooling.
export type _OnboardingTeamId = Id<"teams">;
