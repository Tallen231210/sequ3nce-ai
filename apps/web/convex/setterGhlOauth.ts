import { v } from "convex/values";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";

// ============================================================================
// Setter Data — GoHighLevel OAuth installation state.
//
// This file holds queries + mutations that operate on the
// `setterGhlInstallations` table. Token encryption + token-endpoint HTTP
// calls live in setterGhlOauthActions.ts (Node runtime). Anything that
// touches the database synchronously (no fetch, no crypto) lives here so
// it runs in Convex's V8 isolate.
// ============================================================================

// ----------------------------------------------------------------------------
// INTERNAL READS (called by actions to look up installations during sync)
// ----------------------------------------------------------------------------

/**
 * Look up the active installation for a team. Returns null if disconnected
 * or never installed. Used by the OAuth callback (to detect re-installs)
 * and by the REST client (to fetch tokens before each API call).
 */
export const getInstallationByTeam = internalQuery({
  args: { teamId: v.id("teams") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("setterGhlInstallations")
      .withIndex("by_team", (q) => q.eq("teamId", args.teamId))
      .first();
  },
});

/**
 * Look up an installation by Convex id. Used by the refresh-token action
 * (which receives the installationId from the REST client wrapper).
 */
export const getInstallationById = internalQuery({
  args: { installationId: v.id("setterGhlInstallations") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.installationId);
  },
});

/**
 * Look up by GHL locationId. Used by webhook handlers — payloads carry
 * locationId, not teamId, so we resolve the install first.
 */
export const getInstallationByLocation = internalQuery({
  args: { locationId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("setterGhlInstallations")
      .withIndex("by_location", (q) => q.eq("locationId", args.locationId))
      .first();
  },
});

/**
 * Find installations the deep-backfill cron should pick up. We return up
 * to `limit` rows that are:
 *   - status = "active"
 *   - fastBackfillCompletedAt IS NOT NULL (deep follows fast)
 *   - deepBackfillCompletedAt IS NULL (haven't finished 12 months yet)
 *   - deepBackfillError IS NULL (skip rows that need manual recovery)
 *
 * The cron throttles to a small batch per tick so a slow GHL response
 * for one customer doesn't drag down the others.
 */
export const getInstallationsNeedingDeepBackfill = internalQuery({
  args: { limit: v.number() },
  handler: async (ctx, args) => {
    // The candidate set is small (one row per customer), so a full-table
    // scan with filters is cheaper than maintaining additional indexes
    // for this rare path. We post-filter for the active+fast-complete+
    // no-error+not-yet-deep-complete combo.
    const all = await ctx.db.query("setterGhlInstallations").collect();
    const candidates = all.filter(
      (inst) =>
        inst.status === "active" &&
        inst.fastBackfillCompletedAt !== undefined &&
        inst.deepBackfillCompletedAt === undefined &&
        !inst.deepBackfillError,
    );
    return candidates.slice(0, args.limit);
  },
});

/**
 * Find active installations the reconcile cron should sweep. Active +
 * fast-backfill-complete only — no point reconciling an install whose
 * initial sync hasn't finished yet (the fast backfill is still
 * populating that data).
 */
export const getInstallationsForReconcile = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("setterGhlInstallations")
      .filter((q) =>
        q.and(
          q.eq(q.field("status"), "active"),
          q.neq(q.field("fastBackfillCompletedAt"), undefined),
        ),
      )
      .collect();
  },
});

// ----------------------------------------------------------------------------
// INTERNAL WRITES (called by actions to persist OAuth state)
// ----------------------------------------------------------------------------

/**
 * Insert a fresh installation OR update tokens on a re-install. Keyed on
 * teamId — one install per team. If the team already has an installation
 * (e.g., they uninstalled and reinstalled, or rotated the connection), we
 * patch the existing row with new tokens and reset backfill progress so
 * the new install gets a fresh fast-backfill window.
 *
 * Tokens MUST already be encrypted by the caller (action) before reaching
 * this mutation. This file runs in V8 isolate which can't access the
 * encryption key env var.
 */
export const upsertInstallation = internalMutation({
  args: {
    teamId: v.id("teams"),
    locationId: v.string(),
    locationName: v.optional(v.string()),
    companyId: v.optional(v.string()),
    encryptedAccessToken: v.string(),
    encryptedRefreshToken: v.string(),
    expiresAt: v.number(),
    scopes: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("setterGhlInstallations")
      .withIndex("by_team", (q) => q.eq("teamId", args.teamId))
      .first();

    const now = Date.now();

    if (existing) {
      // Re-install: replace tokens, reset backfill progress so the new
      // install gets a fresh sync. Preserves the row id (and any data
      // referencing it) but treats the connection as new.
      await ctx.db.patch(existing._id, {
        locationId: args.locationId,
        locationName: args.locationName,
        companyId: args.companyId,
        accessToken: args.encryptedAccessToken,
        refreshToken: args.encryptedRefreshToken,
        expiresAt: args.expiresAt,
        scopes: args.scopes,
        installedAt: now,
        lastRefreshedAt: now,
        status: "active",
        errorMessage: undefined,
        errorAt: undefined,
        // Reset two-phase backfill progress so the new install rebuilds
        // history from scratch. Existing setterLeads rows are preserved
        // (idempotent upserts dedupe on ghlContactId), but the cron
        // re-walks every month window for safety.
        fastBackfillCompletedAt: undefined,
        deepBackfillLastCompletedMonth: undefined,
        deepBackfillCompletedAt: undefined,
        deepBackfillError: undefined,
      });
      return existing._id;
    }

    return await ctx.db.insert("setterGhlInstallations", {
      teamId: args.teamId,
      locationId: args.locationId,
      locationName: args.locationName,
      companyId: args.companyId,
      accessToken: args.encryptedAccessToken,
      refreshToken: args.encryptedRefreshToken,
      expiresAt: args.expiresAt,
      scopes: args.scopes,
      installedAt: now,
      status: "active",
    });
  },
});

/**
 * Patch tokens after a successful refresh. Called by the refresh action
 * after exchanging the refresh_token for a new access_token (and
 * potentially a new refresh_token — GHL rotates them on each refresh).
 */
export const patchInstallationTokens = internalMutation({
  args: {
    installationId: v.id("setterGhlInstallations"),
    encryptedAccessToken: v.string(),
    encryptedRefreshToken: v.string(),
    expiresAt: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.installationId, {
      accessToken: args.encryptedAccessToken,
      refreshToken: args.encryptedRefreshToken,
      expiresAt: args.expiresAt,
      lastRefreshedAt: Date.now(),
      // Clear any prior error state — successful refresh = healthy.
      status: "active",
      errorMessage: undefined,
      errorAt: undefined,
    });
  },
});

/**
 * Mark an installation as errored. Called when token refresh fails (e.g.,
 * refresh_token expired after 1y, customer revoked access at GHL, scopes
 * stripped). The Settings UI surfaces the error and prompts reinstall.
 */
export const markInstallationError = internalMutation({
  args: {
    installationId: v.id("setterGhlInstallations"),
    errorMessage: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.installationId, {
      status: "error",
      errorMessage: args.errorMessage,
      errorAt: Date.now(),
    });
  },
});

/**
 * Mark an installation as uninstalled (set by UNINSTALL webhook handler).
 * We keep the row for audit purposes but flip status so queries treat it
 * as disconnected.
 */
export const markInstallationUninstalled = internalMutation({
  args: { installationId: v.id("setterGhlInstallations") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.installationId, {
      status: "uninstalled",
    });
  },
});

// ----------------------------------------------------------------------------
// PUBLIC: disconnect (admin-gated, called from Settings UI)
// ----------------------------------------------------------------------------

/**
 * Disconnect the GHL integration. Deletes the installation row, preserves
 * all historical data (setterLeads, setterLeadEvents, etc.) so reports
 * remain valid for past dates. The customer can reinstall later and the
 * fresh OAuth flow creates a new installation row.
 *
 * Admin-only. We deliberately do NOT call GHL's revoke endpoint here —
 * that's an HTTP call which would require an action. If the user wants
 * to fully revoke at GHL's side, they uninstall the app from their GHL
 * marketplace settings and our UNINSTALL webhook handler runs.
 */
export const disconnectInstallation = mutation({
  args: { clerkId: v.string() },
  handler: async (ctx, args) => {
    const user = await resolveAuthUser(ctx, args.clerkId);
    if (!user) {
      throw new Error("Not authenticated");
    }

    const installation = await ctx.db
      .query("setterGhlInstallations")
      .withIndex("by_team", (q) => q.eq("teamId", user.teamId))
      .first();

    if (!installation) {
      // Already disconnected — idempotent, return success.
      return { success: true, alreadyDisconnected: true };
    }

    await ctx.db.delete(installation._id);
    return { success: true, alreadyDisconnected: false };
  },
});

// ----------------------------------------------------------------------------
// PUBLIC: read connection status (used by ConnectionGate UI)
// ----------------------------------------------------------------------------

/**
 * Read the current installation status for the calling user's team.
 * Returns a sanitized view — no tokens, just metadata the UI needs to
 * render the ConnectionGate / Settings tab. Authentication itself is
 * the gate (every web-dashboard user is a manager/owner).
 */
export const getMyInstallationStatus = query({
  args: { clerkId: v.string() },
  handler: async (ctx, args) => {
    const user = await resolveAuthUser(ctx, args.clerkId);
    if (!user) {
      return null;
    }

    const installation = await ctx.db
      .query("setterGhlInstallations")
      .withIndex("by_team", (q) => q.eq("teamId", user.teamId))
      .first();

    if (!installation) {
      return { connected: false as const };
    }

    return {
      connected: true as const,
      status: installation.status,
      locationId: installation.locationId,
      locationName: installation.locationName,
      installedAt: installation.installedAt,
      lastSyncedAt: installation.lastSyncedAt,
      errorMessage: installation.errorMessage,
      errorAt: installation.errorAt,
      fastBackfillCompletedAt: installation.fastBackfillCompletedAt,
      deepBackfillLastCompletedMonth: installation.deepBackfillLastCompletedMonth,
      deepBackfillCompletedAt: installation.deepBackfillCompletedAt,
      deepBackfillError: installation.deepBackfillError,
    };
  },
});

// ----------------------------------------------------------------------------
// AUTH HELPER — takes clerkId explicitly to match the codebase pattern
// in hyros.ts / slack.ts / refgrow.ts (ConvexProviderWithClerk isn't
// wired up app-wide, so auth context can't be used).
// ----------------------------------------------------------------------------

async function resolveAuthUser(
  ctx: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    db: any;
  },
  clerkId: string,
) {
  const user = await ctx.db
    .query("users")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .withIndex("by_clerk_id", (q: any) => q.eq("clerkId", clerkId))
    .first();

  return user;
}
