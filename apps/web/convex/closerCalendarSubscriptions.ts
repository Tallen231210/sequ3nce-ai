/**
 * B2B multi-calendar subscriptions — one row per sub-calendar the closer
 * wants to sync from their one connected Google account.
 *
 * Architecture note: B2B is single-OAuth-account. The refresh token lives on
 * the `closers` table (`googleCalendarRefreshToken`). This table tracks WHICH
 * sub-calendars under that account to sync — primary, custom calendars the
 * closer created in Google ("Sales Demos"), shared calendars, subscribed
 * calendars. Each row points back at the same OAuth credential.
 *
 * Contrast with B2C: B2C uses `b2cCalendars` table where each row carries its
 * own OAuth token (because B2C closers connect MULTIPLE Google accounts —
 * "Solar Co" Gmail + "Coaching Co" Gmail). B2B doesn't have that need — one
 * closer = one work Google account = many sub-calendars under it.
 *
 * Plan: .claude/plans/b2b-multi-calendar-subscriptions.md
 */

import { v } from "convex/values";
import {
  action,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

const MAX_SUBSCRIPTIONS_PER_CLOSER = 10;

// ============================================================================
// QUERIES
// ============================================================================

/** All subscriptions for a closer (enabled or not), sorted oldest first. */
export const getMySubscriptions = query({
  args: { closerId: v.id("closers") },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("closerCalendarSubscriptions")
      .withIndex("by_closer", (q) => q.eq("closerId", args.closerId))
      .collect();
    rows.sort((a, b) => a.createdAt - b.createdAt);
    return rows;
  },
});

/** Internal helper — used by sync to iterate the enabled subs. */
export const getEnabledSubscriptionsForCloserInternal = internalQuery({
  args: { closerId: v.id("closers") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("closerCalendarSubscriptions")
      .withIndex("by_closer_and_enabled", (q) =>
        q.eq("closerId", args.closerId).eq("enabled", true),
      )
      .collect();
  },
});

/** Internal helper — get all subs (any state) for a closer. */
export const getAllSubscriptionsForCloserInternal = internalQuery({
  args: { closerId: v.id("closers") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("closerCalendarSubscriptions")
      .withIndex("by_closer", (q) => q.eq("closerId", args.closerId))
      .collect();
  },
});

/**
 * Internal helper for the HTTP-route ownership checks. Returns the
 * subscription's closerId so the route can compare against the closer
 * resolved from email+teamId before invoking remove/toggle. Returns
 * null when the subscriptionId is bogus.
 */
export const getSubscriptionOwnerInternal = internalQuery({
  args: { subscriptionId: v.id("closerCalendarSubscriptions") },
  handler: async (ctx, args) => {
    const sub = await ctx.db.get(args.subscriptionId);
    if (!sub) return null;
    return { closerId: sub.closerId, teamId: sub.teamId };
  },
});

// ============================================================================
// MUTATIONS
// ============================================================================

/**
 * Add a new sub-calendar subscription. Idempotent — if the closer is already
 * subscribed to this googleCalendarId, just re-enables it (preserving label).
 * Enforces the 10-subscription cap.
 */
export const addSubscription = mutation({
  args: {
    closerId: v.id("closers"),
    googleCalendarId: v.string(),
    label: v.string(),
    backgroundColor: v.optional(v.string()),
    accessRole: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const closer = await ctx.db.get(args.closerId);
    if (!closer) throw new Error("Closer not found");

    const existing = await ctx.db
      .query("closerCalendarSubscriptions")
      .withIndex("by_closer", (q) => q.eq("closerId", args.closerId))
      .collect();

    // Idempotent — re-adding an existing googleCalendarId re-enables it
    // and refreshes its metadata. Preserves the user's customized label.
    const dupe = existing.find(
      (s) => s.googleCalendarId === args.googleCalendarId,
    );
    if (dupe) {
      await ctx.db.patch(dupe._id, {
        enabled: true,
        calendarBackgroundColor:
          args.backgroundColor ?? dupe.calendarBackgroundColor,
        accessRole: args.accessRole ?? dupe.accessRole,
        syncErrorCode: undefined,
      });
      return { success: true, subscriptionId: dupe._id, reactivated: true };
    }

    const activeCount = existing.filter((s) => s.enabled).length;
    if (activeCount >= MAX_SUBSCRIPTIONS_PER_CLOSER) {
      throw new Error(
        `Calendar limit reached — remove a subscription before adding another (max ${MAX_SUBSCRIPTIONS_PER_CLOSER}).`,
      );
    }

    const id = await ctx.db.insert("closerCalendarSubscriptions", {
      closerId: args.closerId,
      teamId: closer.teamId,
      googleCalendarId: args.googleCalendarId,
      label: args.label,
      calendarBackgroundColor: args.backgroundColor,
      accessRole: args.accessRole,
      enabled: true,
      createdAt: Date.now(),
    });
    return { success: true, subscriptionId: id, reactivated: false };
  },
});

/**
 * Internal helper used by the OAuth callback and the lazy-migration path in
 * sync. Creates a "primary" subscription idempotently. Returns the new (or
 * existing) subscription id.
 */
export const addPrimarySubscriptionInternal = internalMutation({
  args: {
    closerId: v.id("closers"),
    backgroundColor: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const closer = await ctx.db.get(args.closerId);
    if (!closer) return null;

    const existingPrimary = await ctx.db
      .query("closerCalendarSubscriptions")
      .withIndex("by_closer", (q) => q.eq("closerId", args.closerId))
      .collect();
    const primary = existingPrimary.find(
      (s) => s.googleCalendarId === "primary",
    );
    if (primary) {
      // Refresh backgroundColor if we have a new one. Idempotent.
      if (args.backgroundColor && !primary.calendarBackgroundColor) {
        await ctx.db.patch(primary._id, {
          calendarBackgroundColor: args.backgroundColor,
        });
      }
      return primary._id;
    }

    return await ctx.db.insert("closerCalendarSubscriptions", {
      closerId: args.closerId,
      teamId: closer.teamId,
      googleCalendarId: "primary",
      label: "Primary",
      calendarBackgroundColor: args.backgroundColor,
      accessRole: "owner",
      enabled: true,
      createdAt: Date.now(),
    });
  },
});

/**
 * Public wrapper of addPrimarySubscriptionInternal so the Next.js OAuth
 * callback can invoke it via the standard Convex HTTP client. Idempotent —
 * the primary-already-exists check short-circuits before any cap concern,
 * but if a (degenerate) state has 10 enabled non-primary subs AND no
 * primary, this enforces the cap symmetrically with addSubscription
 * rather than silently inserting an 11th row.
 */
export const addPrimarySubscription = mutation({
  args: { closerId: v.id("closers") },
  handler: async (ctx, args): Promise<Id<"closerCalendarSubscriptions"> | null> => {
    const closer = await ctx.db.get(args.closerId);
    if (!closer) return null;
    const existing = await ctx.db
      .query("closerCalendarSubscriptions")
      .withIndex("by_closer", (q) => q.eq("closerId", args.closerId))
      .collect();
    const primary = existing.find((s) => s.googleCalendarId === "primary");
    if (primary) return primary._id;

    // Cap symmetry with addSubscription. Only counts enabled subs; disabled
    // ones don't block the user from getting their primary back.
    const activeCount = existing.filter((s) => s.enabled).length;
    if (activeCount >= MAX_SUBSCRIPTIONS_PER_CLOSER) {
      throw new Error(
        `Calendar limit reached — remove a subscription before adding another (max ${MAX_SUBSCRIPTIONS_PER_CLOSER}).`,
      );
    }

    return await ctx.db.insert("closerCalendarSubscriptions", {
      closerId: args.closerId,
      teamId: closer.teamId,
      googleCalendarId: "primary",
      label: "Primary",
      accessRole: "owner",
      enabled: true,
      createdAt: Date.now(),
    });
  },
});

/**
 * Remove a sub-calendar subscription + cascade-delete its events.
 * Caps cleanup at 5000 events per call to keep within the per-mutation
 * budget; larger sets would need a paginated background job.
 */
export const removeSubscription = mutation({
  args: { subscriptionId: v.id("closerCalendarSubscriptions") },
  handler: async (ctx, args) => {
    const sub = await ctx.db.get(args.subscriptionId);
    if (!sub) return { success: false, reason: "not_found" };

    // Cascade-delete events from this subscription. Uses the by_subscription
    // index added in this cleanup commit so we don't scan the entire closer
    // event set just to find one sub's events (was M2/M4 from the review).
    const orphanEvents = await ctx.db
      .query("calendarEvents")
      .withIndex("by_subscription", (q) => q.eq("subscriptionId", args.subscriptionId))
      .collect();
    let deleted = 0;
    for (const ev of orphanEvents) {
      if (deleted >= 5000) break;
      await ctx.db.delete(ev._id);
      deleted++;
    }
    await ctx.db.delete(args.subscriptionId);
    return { success: true, eventsDeleted: deleted };
  },
});

/** Rename the subscription's user-facing label. Cosmetic only. */
export const renameSubscription = mutation({
  args: {
    subscriptionId: v.id("closerCalendarSubscriptions"),
    label: v.string(),
  },
  handler: async (ctx, args) => {
    const trimmed = args.label.trim();
    if (!trimmed) throw new Error("Label cannot be empty");
    if (trimmed.length > 100) throw new Error("Label too long (max 100)");
    await ctx.db.patch(args.subscriptionId, { label: trimmed });
    return { success: true };
  },
});

/**
 * Enable/disable a subscription without deleting it. Sync skips disabled
 * subs but preserves the label preference (and existing events stay in the
 * DB — they just won't render once the desktop filters disabled-sub events).
 */
export const toggleSubscription = mutation({
  args: {
    subscriptionId: v.id("closerCalendarSubscriptions"),
    enabled: v.boolean(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.subscriptionId, { enabled: args.enabled });
    return { success: true };
  },
});

/**
 * Internal: patch sync state on a subscription. Called by the sync action
 * after each per-sub fetch — updates lastSyncAt + clears or sets the error
 * code. Color metadata refreshed when Google returns a new backgroundColor.
 */
export const updateSubscriptionSyncStateInternal = internalMutation({
  args: {
    subscriptionId: v.id("closerCalendarSubscriptions"),
    lastSyncAt: v.optional(v.number()),
    syncErrorCode: v.union(v.string(), v.null()),
    calendarBackgroundColor: v.optional(v.string()),
    enabled: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const patch: Record<string, unknown> = {};
    if (args.lastSyncAt !== undefined) patch.lastSyncAt = args.lastSyncAt;
    if (args.syncErrorCode === null) {
      patch.syncErrorCode = undefined;
    } else {
      patch.syncErrorCode = args.syncErrorCode;
    }
    if (args.calendarBackgroundColor !== undefined) {
      patch.calendarBackgroundColor = args.calendarBackgroundColor;
    }
    if (args.enabled !== undefined) patch.enabled = args.enabled;
    await ctx.db.patch(args.subscriptionId, patch);
  },
});

// ============================================================================
// ACTION — listAvailableCalendars
// ============================================================================

/**
 * Call Google's `calendarList.list` endpoint with the closer's refresh token
 * to enumerate all sub-calendars in their connected account. Returns the
 * picker-ready list with `alreadySubscribed` flags so the UI can render
 * existing selections checked. Caller must be authenticated client-side.
 */
export const listAvailableCalendars = action({
  args: { closerId: v.id("closers") },
  handler: async (
    ctx,
    args,
  ): Promise<{
    ok: boolean;
    calendars?: Array<{
      googleCalendarId: string;
      summary: string;
      backgroundColor: string | null;
      accessRole: string;
      primary: boolean;
      alreadySubscribed: boolean;
    }>;
    error?: string;
    needsReauth?: boolean;
  }> => {
    let accessToken: string;
    try {
      accessToken = await ctx.runAction(
        internal.googleCalendar.refreshAccessToken,
        { closerId: args.closerId },
      );
    } catch (err) {
      return {
        ok: false,
        error:
          err instanceof Error
            ? err.message
            : "Failed to refresh Google access token",
      };
    }

    const response = await fetch(
      "https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=250",
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (!response.ok) {
      // Surface Google's actual error body — they put the precise reason
      // (missing scope, quota, etc.) in the JSON. Without this we showed
      // a bare "Google API error 403" and had no way to diagnose without
      // shelling into logs.
      const body = await response.text();
      let detail = "";
      try {
        const parsed = JSON.parse(body) as {
          error?: { message?: string; status?: string };
        };
        detail = parsed.error?.message ?? "";
      } catch {
        detail = body.slice(0, 200);
      }
      // 403 with a scope-related message → tell the closer how to recover.
      // Renderer can react to needsReauth to surface a "Reconnect Google"
      // CTA inline instead of just dumping the error string.
      const isScopeError =
        response.status === 403 &&
        /scope|permission/i.test(detail);
      return {
        ok: false,
        error: detail
          ? `Google API error ${response.status}: ${detail}`
          : `Google API error ${response.status}`,
        needsReauth: isScopeError,
      };
    }
    const data: {
      items?: Array<{
        id: string;
        summary?: string;
        backgroundColor?: string;
        accessRole?: string;
        primary?: boolean;
      }>;
    } = await response.json();

    // Cross-reference existing subscriptions so the picker can show checked
    // state without an extra query round-trip from the renderer.
    const existing = (await ctx.runQuery(
      internal.closerCalendarSubscriptions.getAllSubscriptionsForCloserInternal,
      { closerId: args.closerId },
    )) as Array<{ googleCalendarId: string }>;
    const subscribedIds = new Set(existing.map((s) => s.googleCalendarId));

    return {
      ok: true,
      calendars: (data.items ?? []).map((cal) => ({
        googleCalendarId: cal.primary ? "primary" : cal.id,
        summary: cal.summary ?? cal.id,
        backgroundColor: cal.backgroundColor ?? null,
        accessRole: cal.accessRole ?? "reader",
        primary: !!cal.primary,
        alreadySubscribed:
          subscribedIds.has(cal.id) || (!!cal.primary && subscribedIds.has("primary")),
      })),
    };
  },
});
