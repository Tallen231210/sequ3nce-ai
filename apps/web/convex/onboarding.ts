// ============================================================================
// Post-signup onboarding pack — queries + mutations that drive:
//   - The blue "Book your onboarding call" banner on every /dashboard/* route
//   - The /dashboard/onboarding checklist page (5 auto-checking items)
//   - The sidebar "Onboarding" nav item with N/5 progress badge
//
// The checklist auto-checks against existing state across multiple tables so
// the manager never has to "tick" anything except "Book onboarding call"
// (manual self-check since we haven't wired the calendar provider's
// booking webhook yet — GHL/Calendly/Cal.com all expose this).
//
// State is owned by the teams table (4 optional fields added in schema):
//   - welcomeEmailSentAt          → set by welcomeEmail action, idempotency
//   - onboardingBookedCallAt      → set by markCallBooked mutation
//   - onboardingBannerDismissedAt → set by dismissBanner mutation
//   - onboardingCompletedAt       → set by markCompleted when all 5 checked
// ============================================================================

import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";

// Mirror of resolveAuthUser from setterData.ts — taking clerkId via arg
// is the codebase convention (Convex + Clerk JWT auth isn't wired
// app-wide). Loose typing on ctx.db keeps this composable across
// queries + mutations.
async function resolveAuthUser(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ctx: { db: any },
  clerkId: string,
): Promise<Doc<"users"> | null> {
  return await ctx.db
    .query("users")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .withIndex("by_clerk_id", (q: any) => q.eq("clerkId", clerkId))
    .first();
}

export const getOnboardingState = query({
  args: { clerkId: v.string() },
  handler: async (ctx, args) => {
    const user = await resolveAuthUser(ctx, args.clerkId);
    if (!user) return null;
    const teamId = user.teamId as Id<"teams">;
    const team = (await ctx.db.get(teamId)) as Doc<"teams"> | null;
    if (!team) return null;

    // Item 2 — at least one closer added
    const closer = await ctx.db
      .query("closers")
      .withIndex("by_team", (q) => q.eq("teamId", teamId))
      .first();
    const addedCloser = closer !== null;

    // Item 3 — GHL installation in active state
    const ghl = await ctx.db
      .query("setterGhlInstallations")
      .withIndex("by_team", (q) => q.eq("teamId", teamId))
      .first();
    const installedGhl = ghl?.status === "active";

    // Item 4 — Hyros API key configured
    const connectedHyros = !!team.hyrosApiKey;

    // Item 5 — at least one Slack notification channel configured.
    // We accept any of the per-notification channel fields OR the legacy
    // single slackChannelId. Manager only has to set one for credit.
    const configuredSlack = !!(
      team.slackChannelId ||
      team.setterDailyScorecardSlackChannelId ||
      team.setterUntouchedAlertSlackChannelId ||
      team.setterCoverageGapSlackChannelId
    );

    // Grandfather established customers — anyone older than 14 days
    // signed up before this onboarding pack shipped (or has been
    // around long enough that the pack is irrelevant). For them, mark
    // EVERY item complete + force completed=true so they don't see
    // the banner OR the sidebar tab regardless of whether they have
    // GHL/Hyros/Slack configured. The pack is meant for fresh signups
    // only; established customers got their onboarding manually via
    // Tyler and shouldn't be re-prompted now.
    const GRANDFATHER_AGE_MS = 14 * 24 * 60 * 60 * 1000;
    const isEstablished =
      Date.now() - team._creationTime > GRANDFATHER_AGE_MS;

    if (isEstablished) {
      return {
        bookedCall: true,
        addedCloser: true,
        installedGhl: true,
        connectedHyros: true,
        configuredSlack: true,
        completed: true,
        bannerDismissed: team.onboardingBannerDismissedAt != null,
        bookingUrl: process.env.ONBOARDING_BOOKING_URL ?? null,
        onboardingCompletedAt: team.onboardingCompletedAt ?? null,
      };
    }

    const bookedCall = team.onboardingBookedCallAt != null;
    const completed =
      bookedCall &&
      addedCloser &&
      installedGhl &&
      connectedHyros &&
      configuredSlack;

    return {
      bookedCall,
      addedCloser,
      installedGhl,
      connectedHyros,
      configuredSlack,
      completed,
      bannerDismissed: team.onboardingBannerDismissedAt != null,
      // Surfaced to client so the banner + email use the same source of truth.
      // Empty string => not configured yet; client hides the CTA gracefully.
      //
      // IMPORTANT: This is a CONVEX env var (set via `npx convex env set
      // ONBOARDING_BOOKING_URL ... --prod`), NOT a Next.js NEXT_PUBLIC_*.
      // Convex queries run in the Convex runtime which doesn't have access
      // to Vercel's NEXT_PUBLIC_* env vars.
      //
      // Provider-agnostic — Sequ3nce currently uses GoHighLevel's calendar
      // booking link, but it could be Calendly, Cal.com, or any URL that
      // accepts a click-through to book a meeting.
      bookingUrl: process.env.ONBOARDING_BOOKING_URL ?? null,
      onboardingCompletedAt: team.onboardingCompletedAt ?? null,
    };
  },
});

export const markCallBooked = mutation({
  args: { clerkId: v.string() },
  handler: async (ctx, args) => {
    const user = await resolveAuthUser(ctx, args.clerkId);
    if (!user) return { ok: false as const };
    const teamId = user.teamId as Id<"teams">;
    const team = (await ctx.db.get(teamId)) as Doc<"teams"> | null;
    if (!team) return { ok: false as const };
    // Idempotent — don't overwrite an earlier booking timestamp.
    if (team.onboardingBookedCallAt) return { ok: true as const };
    await ctx.db.patch(teamId, { onboardingBookedCallAt: Date.now() });
    return { ok: true as const };
  },
});

export const dismissBanner = mutation({
  args: { clerkId: v.string() },
  handler: async (ctx, args) => {
    const user = await resolveAuthUser(ctx, args.clerkId);
    if (!user) return { ok: false as const };
    const teamId = user.teamId as Id<"teams">;
    await ctx.db.patch(teamId, {
      onboardingBannerDismissedAt: Date.now(),
    });
    return { ok: true as const };
  },
});

/**
 * Marks onboarding complete. Safe to call multiple times — only patches
 * if not already set. Intended to fire automatically from the checklist
 * page when getOnboardingState.completed becomes true.
 */
export const markCompleted = mutation({
  args: { clerkId: v.string() },
  handler: async (ctx, args) => {
    const user = await resolveAuthUser(ctx, args.clerkId);
    if (!user) return { ok: false as const };
    const teamId = user.teamId as Id<"teams">;
    const team = (await ctx.db.get(teamId)) as Doc<"teams"> | null;
    if (!team) return { ok: false as const };
    if (team.onboardingCompletedAt) return { ok: true as const };
    await ctx.db.patch(teamId, { onboardingCompletedAt: Date.now() });
    return { ok: true as const };
  },
});
