import { v } from "convex/values";
import { internalMutation } from "./_generated/server";

// ============================================================================
// Setter Data — sync-side mutations.
//
// Internal mutations called by the Node-runtime sync actions in
// setterGhlSync.ts. Keeps DB operations in the V8 isolate (where mutations
// must live) while sync orchestration runs in Node.
//
// Most event-driven writes happen through setterGhlWebhooks.dispatch (the
// backfill flow synthesizes webhook-shaped audit rows and reuses the same
// dispatch pipeline). This file holds the few mutations that don't fit
// that pattern — currently just upserting setter reps and marking the
// fast-backfill phase complete.
// ============================================================================

/**
 * Insert or update a setter rep (GHL sub-account user). Called once per
 * user during sync. lastSeenInSyncAt is bumped every sync; isActive
 * flips false in a separate "stale rep" sweep (TODO Phase 2+).
 */
export const upsertSetterRep = internalMutation({
  args: {
    teamId: v.id("teams"),
    ghlUserId: v.string(),
    name: v.string(),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    ghlRole: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("setterReps")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .withIndex("by_team_and_ghl_user_id", (q: any) =>
        q.eq("teamId", args.teamId).eq("ghlUserId", args.ghlUserId),
      )
      .first();

    const now = Date.now();

    if (existing) {
      await ctx.db.patch(existing._id, {
        name: args.name,
        email: args.email,
        phone: args.phone,
        ghlRole: args.ghlRole,
        isActive: true,
        lastSeenInSyncAt: now,
      });
      return existing._id;
    }

    return await ctx.db.insert("setterReps", {
      teamId: args.teamId,
      ghlUserId: args.ghlUserId,
      name: args.name,
      email: args.email,
      phone: args.phone,
      ghlRole: args.ghlRole,
      isActive: true,
      lastSeenInSyncAt: now,
    });
  },
});

/**
 * Mark the fast-backfill phase complete and seed the deep-backfill cursor
 * at month 3 (the deep backfill extends from month 4 onward). Called by
 * fastBackfill at the end of its run.
 */
export const markFastBackfillComplete = internalMutation({
  args: {
    installationId: v.id("setterGhlInstallations"),
  },
  handler: async (ctx, args) => {
    const installation = await ctx.db.get(args.installationId);
    if (!installation) return;

    const now = Date.now();
    await ctx.db.patch(args.installationId, {
      fastBackfillCompletedAt: now,
      // Fast covers the last 90 days = months 0-3. Deep extends from
      // month 4 backwards via the cron extender.
      deepBackfillLastCompletedMonth: 3,
      lastSyncedAt: now,
    });
  },
});

/**
 * Update lastSyncedAt on the installation. Called by the reconcile cron
 * after each pass so the UI can show "Last synced: X minutes ago".
 */
export const markInstallationSynced = internalMutation({
  args: {
    installationId: v.id("setterGhlInstallations"),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.installationId, {
      lastSyncedAt: Date.now(),
    });
  },
});

/**
 * Patch the locationName on an installation once we've fetched it from
 * /locations/:id (it's not on the OAuth token response). Lets the
 * Settings UI show "Connected to: <Name of GHL Sub-Account>".
 */
export const patchInstallationLocationName = internalMutation({
  args: {
    installationId: v.id("setterGhlInstallations"),
    locationName: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.installationId, {
      locationName: args.locationName,
    });
  },
});
