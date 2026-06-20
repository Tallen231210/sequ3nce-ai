import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";

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
      // Phase 2 — Setter Scorecard tenure tracking. Set on first sight,
      // never updated. Drives the ramping vs stabilized 60-day flag.
      firstSeenAt: now,
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
    // A successful reconcile auto-heals any previously-stuck error
    // state. Without this clear, a single transient failure (e.g. a
    // 524 from GHL's opportunities/search) left the install banner up
    // forever even after subsequent reconciles succeeded — see the
    // AICom install on 2026-05-26 / -27 for a real example.
    await ctx.db.patch(args.installationId, {
      lastSyncedAt: Date.now(),
      status: "active",
      errorMessage: undefined,
      errorAt: undefined,
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

/**
 * Advance deep-backfill progress for an installation. Called by the
 * deep-backfill cron after a successful month tick:
 *   - completedMonth ≤ 11 → patch deepBackfillLastCompletedMonth
 *   - completedMonth = 12 → also stamp deepBackfillCompletedAt so the
 *     "Extending history..." UI banner disappears and the cron stops
 *     selecting this installation.
 *
 * Idempotent: no-op if completedMonth ≤ existing value (handles the rare
 * case where two cron ticks race for the same installation).
 */
export const advanceDeepBackfill = internalMutation({
  args: {
    installationId: v.id("setterGhlInstallations"),
    completedMonth: v.number(),
  },
  handler: async (ctx, args) => {
    const inst = await ctx.db.get(args.installationId);
    if (!inst) return;
    if (
      inst.deepBackfillLastCompletedMonth !== undefined &&
      args.completedMonth <= inst.deepBackfillLastCompletedMonth
    ) {
      return;
    }
    const now = Date.now();
    await ctx.db.patch(args.installationId, {
      deepBackfillLastCompletedMonth: args.completedMonth,
      lastSyncedAt: now,
      ...(args.completedMonth >= 12 ? { deepBackfillCompletedAt: now } : {}),
      // Successful tick clears any prior transient error.
      deepBackfillError: undefined,
    });
  },
});

/**
 * Stamp a deep-backfill error on the installation. Future cron ticks
 * skip this installation (errored rows are excluded from the candidate
 * query) until a manual reset clears the error — surfaced in the
 * Settings UI with a "Resume backfill" button.
 */
export const setDeepBackfillError = internalMutation({
  args: {
    installationId: v.id("setterGhlInstallations"),
    errorMessage: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.installationId, {
      deepBackfillError: args.errorMessage,
    });
  },
});

/**
 * Upsert pipeline metadata. Called by the pipelines sync helper during
 * fastBackfill + reconcile. Pipelines change rarely, so we just patch
 * the cached row in place — no dedicated event log needed.
 */
export const upsertPipeline = internalMutation({
  args: {
    teamId: v.id("teams"),
    ghlPipelineId: v.string(),
    name: v.string(),
    stages: v.array(
      v.object({
        ghlStageId: v.string(),
        name: v.string(),
        position: v.number(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("setterPipelines")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .withIndex("by_team_and_pipeline_id", (q: any) =>
        q.eq("teamId", args.teamId).eq("ghlPipelineId", args.ghlPipelineId),
      )
      .first();

    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, {
        name: args.name,
        stages: args.stages,
        lastSyncedAt: now,
      });
      return existing._id;
    }
    return await ctx.db.insert("setterPipelines", {
      teamId: args.teamId,
      ghlPipelineId: args.ghlPipelineId,
      name: args.name,
      stages: args.stages,
      lastSyncedAt: now,
    });
  },
});

/**
 * Prune setterWebhookEvents rows older than the given cutoff. Called by
 * the daily audit-prune cron. Convex limits the number of writes per
 * mutation, so we cap the batch — if more rows need pruning, the cron
 * will catch them on the next run.
 */
export const pruneOldWebhookEvents = internalMutation({
  args: {
    olderThan: v.number(), // unix ms; rows with receivedAt < this are deleted
    limit: v.number(),
  },
  handler: async (ctx, args) => {
    const stale = await ctx.db
      .query("setterWebhookEvents")
      .withIndex("by_received_at", (q) => q.lt("receivedAt", args.olderThan))
      .take(args.limit);

    for (const row of stale) {
      await ctx.db.delete(row._id);
    }

    return { deleted: stale.length };
  },
});


/**
 * List the GHL user IDs (setter reps) attached to a team. Used by
 * the appointments-sync action to iterate per user — GHL's
 * /calendars/events endpoint rejects requests scoped only to a
 * locationId; you have to pass userId, calendarId, or groupId.
 */
export const listRepGhlUserIdsForTeam = internalQuery({
  args: { teamId: v.id("teams") },
  handler: async (ctx, args) => {
    const reps = await ctx.db
      .query("setterReps")
      .withIndex("by_team", (q) => q.eq("teamId", args.teamId))
      .collect();
    return reps
      .map((r) => r.ghlUserId)
      .filter((id): id is string => !!id);
  },
});

/**
 * Mark an installation as "transcription disabled" — we've seen too
 * many consecutive `not_available` results from GHL's transcription
 * endpoint to keep wasting API calls. Cleared automatically by
 * clearTranscriptionDisabled the next time a transcript IS returned
 * (customer enabled it) OR after 7 days (handled in the fetch action's
 * re-detection guard).
 */
export const bumpTranscriptionNotAvailableCount = internalMutation({
  args: { installationId: v.id("setterGhlInstallations") },
  handler: async (ctx, args) => {
    const install = await ctx.db.get(args.installationId);
    if (!install) return;
    if (install.transcriptionDisabled) return;

    // Check whether the last 10 transcript attempts for this team are
    // ALL not_available. If yes, flip the flag. Avoids a single 400 on
    // a freshly-installed account flipping the flag prematurely.
    const recent = await ctx.db
      .query("setterCallTranscripts")
      .withIndex("by_team_and_contact_and_time", (q) =>
        q.eq("teamId", install.teamId),
      )
      .order("desc")
      .take(10);
    if (recent.length < 10) return;
    const allNotAvailable = recent.every(
      (r) => r.transcriptionStatus === "not_available",
    );
    if (!allNotAvailable) return;

    await ctx.db.patch(args.installationId, {
      transcriptionDisabled: true,
      transcriptionDisabledAt: Date.now(),
    });
  },
});

/**
 * Clear the transcription-disabled flag. Called when a transcript
 * fetch comes back successfully — proves the customer has it on now
 * (whether they just enabled it or we earlier mis-detected).
 */
export const clearTranscriptionDisabled = internalMutation({
  args: { installationId: v.id("setterGhlInstallations") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.installationId, {
      transcriptionDisabled: undefined,
      transcriptionDisabledAt: undefined,
    });
  },
});
