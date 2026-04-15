import { v } from "convex/values";
import { mutation, query, internalMutation, internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";

// Max calendars a B2C closer can connect
const MAX_CALENDARS = 5;

// Preset color palette — visually distinct, works on light + dark backgrounds
const COLOR_PALETTE = [
  "#3b82f6", // blue
  "#10b981", // emerald
  "#f59e0b", // amber
  "#8b5cf6", // violet
  "#ef4444", // red
];

const MAX_LABEL_LENGTH = 50;

// ==================== Queries ====================

/** Get all calendars for a closer. Strips sensitive fields (refresh tokens). */
export const getCalendars = query({
  args: { closerId: v.id("closers") },
  handler: async (ctx, { closerId }) => {
    const calendars = await ctx.db
      .query("b2cCalendars")
      .withIndex("by_closer", (q) => q.eq("closerId", closerId))
      .collect();
    // Never leak OAuth refresh tokens to the client
    return calendars.map(({ googleRefreshToken, ...safe }) => safe);
  },
});

// ==================== Mutations ====================

/** Add a new calendar connection. Auto-assigns color from palette.
 *  Enforces max 5 calendars and rejects duplicate Google accounts.
 *  NOTE: Does NOT accept googleRefreshToken — tokens are set only via
 *  createFromOAuth (internal mutation) during the OAuth callback. */
export const addCalendar = mutation({
  args: {
    closerId: v.id("closers"),
    teamId: v.id("teams"),
    label: v.string(),
    provider: v.string(),
    googleEmail: v.optional(v.string()),
    icsUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const label = args.label.trim();
    if (!label || label.length > MAX_LABEL_LENGTH) {
      throw new Error("Label is required and must be under 50 characters");
    }

    // Verify closer exists
    const closer = await ctx.db.get(args.closerId);
    if (!closer) throw new Error("Closer not found");

    // Get existing calendars to check count + duplicates
    const existing = await ctx.db
      .query("b2cCalendars")
      .withIndex("by_closer", (q) => q.eq("closerId", args.closerId))
      .collect();

    if (existing.length >= MAX_CALENDARS) {
      throw new Error(`Maximum ${MAX_CALENDARS} calendars allowed`);
    }

    // Reject duplicate Google accounts
    if (args.googleEmail) {
      const dupe = existing.find(
        (c) => c.googleEmail?.toLowerCase() === args.googleEmail!.toLowerCase()
      );
      if (dupe) {
        throw new Error(`Google account ${args.googleEmail} is already connected as "${dupe.label}"`);
      }
    }

    // Auto-assign color: use the next unused color from the palette
    const usedColors = new Set(existing.map((c) => c.color));
    const color = COLOR_PALETTE.find((c) => !usedColors.has(c)) ?? COLOR_PALETTE[existing.length % COLOR_PALETTE.length];

    const id = await ctx.db.insert("b2cCalendars", {
      closerId: args.closerId,
      teamId: args.teamId,
      label,
      color,
      provider: args.provider,
      googleEmail: args.googleEmail,
      icsUrl: args.icsUrl,
      isEnabled: true,
      createdAt: Date.now(),
    });

    return { id, color };
  },
});

/** Remove a calendar and ALL its events. Disconnect is always immediate and
 *  unconditional — never blocked by token revocation or API calls. */
export const removeCalendar = mutation({
  args: {
    calendarId: v.id("b2cCalendars"),
    closerId: v.id("closers"),
  },
  handler: async (ctx, { calendarId, closerId }) => {
    const calendar = await ctx.db.get(calendarId);
    if (!calendar) return { deleted: false };
    if (calendar.closerId !== closerId) {
      throw new Error("Not authorized to remove this calendar");
    }

    // Delete all events belonging to this calendar
    const events = await ctx.db
      .query("calendarEvents")
      .withIndex("by_closer", (q) => q.eq("closerId", closerId))
      .collect();

    let deletedEvents = 0;
    for (const event of events) {
      if (event.calendarId === calendarId) {
        await ctx.db.delete(event._id);
        deletedEvents++;
      }
    }

    // Delete the calendar record itself — this always succeeds
    await ctx.db.delete(calendarId);

    return { deleted: true, deletedEvents };
  },
});

/** Update a calendar's label, color, or enabled state. */
export const updateCalendar = mutation({
  args: {
    calendarId: v.id("b2cCalendars"),
    closerId: v.id("closers"),
    label: v.optional(v.string()),
    color: v.optional(v.string()),
    isEnabled: v.optional(v.boolean()),
  },
  handler: async (ctx, { calendarId, closerId, label, color, isEnabled }) => {
    const calendar = await ctx.db.get(calendarId);
    if (!calendar) throw new Error("Calendar not found");
    if (calendar.closerId !== closerId) {
      throw new Error("Not authorized to update this calendar");
    }

    const patch: Record<string, unknown> = {};
    if (label !== undefined) {
      const trimmed = label.trim();
      if (!trimmed || trimmed.length > MAX_LABEL_LENGTH) {
        throw new Error("Label is required and must be under 50 characters");
      }
      patch.label = trimmed;
    }
    if (color !== undefined) patch.color = color;
    if (isEnabled !== undefined) patch.isEnabled = isEnabled;

    if (Object.keys(patch).length > 0) {
      await ctx.db.patch(calendarId, patch);

      // If label or color changed, update denormalized fields on events
      if (patch.label !== undefined || patch.color !== undefined) {
        const events = await ctx.db
          .query("calendarEvents")
          .withIndex("by_closer", (q) => q.eq("closerId", closerId))
          .collect();

        for (const event of events) {
          if (event.calendarId === calendarId) {
            const eventPatch: Record<string, unknown> = {};
            if (patch.label !== undefined) eventPatch.calendarLabel = patch.label;
            if (patch.color !== undefined) eventPatch.calendarColor = patch.color;
            await ctx.db.patch(event._id, eventPatch);
          }
        }
      }
    }

    return { success: true };
  },
});

// ==================== Internal mutations (for sync + OAuth) ====================

/** Internal: mark a successful sync on a calendar. Clears any previous error. */
export const markSyncSuccess = internalMutation({
  args: {
    calendarId: v.id("b2cCalendars"),
    lastSyncAt: v.number(),
  },
  handler: async (ctx, { calendarId, lastSyncAt }) => {
    const calendar = await ctx.db.get(calendarId);
    if (!calendar) return;
    // Clear syncError on success — Convex doesn't support setting optional to undefined via patch,
    // so we set it to empty string and treat "" as no error in the UI
    await ctx.db.patch(calendarId, { lastSyncAt, syncError: "" });
  },
});

/** Internal: mark a failed sync on a calendar. */
export const markSyncError = internalMutation({
  args: {
    calendarId: v.id("b2cCalendars"),
    syncError: v.string(),
  },
  handler: async (ctx, { calendarId, syncError }) => {
    const calendar = await ctx.db.get(calendarId);
    if (!calendar) return;
    await ctx.db.patch(calendarId, { syncError });
  },
});

/** Internal: create a calendar record from the OAuth callback. */
export const createFromOAuth = internalMutation({
  args: {
    closerId: v.id("closers"),
    teamId: v.id("teams"),
    label: v.string(),
    provider: v.string(),
    googleRefreshToken: v.string(),
    googleEmail: v.string(),
  },
  handler: async (ctx, args) => {
    // Check for duplicates
    const existing = await ctx.db
      .query("b2cCalendars")
      .withIndex("by_closer", (q) => q.eq("closerId", args.closerId))
      .collect();

    if (existing.length >= MAX_CALENDARS) {
      throw new Error(`Maximum ${MAX_CALENDARS} calendars reached`);
    }

    const dupe = existing.find(
      (c) => c.googleEmail?.toLowerCase() === args.googleEmail.toLowerCase()
    );
    if (dupe) {
      // Update the existing calendar's refresh token instead of creating a new one
      await ctx.db.patch(dupe._id, {
        googleRefreshToken: args.googleRefreshToken,
      });
      return dupe._id;
    }

    // Auto-assign color
    const usedColors = new Set(existing.map((c) => c.color));
    const color = COLOR_PALETTE.find((c) => !usedColors.has(c)) ?? COLOR_PALETTE[existing.length % COLOR_PALETTE.length];

    const id = await ctx.db.insert("b2cCalendars", {
      closerId: args.closerId,
      teamId: args.teamId,
      label: args.label.trim() || "Calendar",
      color,
      provider: args.provider,
      googleRefreshToken: args.googleRefreshToken,
      googleEmail: args.googleEmail,
      isEnabled: true,
      createdAt: Date.now(),
    });

    return id;
  },
});

// ==================== Migration ====================

/** Get all B2C closers (those in teams with type="personal") that have
 *  a Google Calendar connection but no b2cCalendar record yet. */
export const getClosersNeedingMigration = internalMutation({
  args: {},
  handler: async (ctx) => {
    // Get all closers with Google Calendar tokens
    const allClosers = await ctx.db.query("closers").collect();
    const googleClosers = allClosers.filter(
      (c) => c.googleCalendarRefreshToken && c.status === "active"
    );

    let migrated = 0;
    for (const closer of googleClosers) {
      // Check if this closer already has a b2cCalendar record
      const existing = await ctx.db
        .query("b2cCalendars")
        .withIndex("by_closer", (q) => q.eq("closerId", closer._id))
        .first();

      if (existing) continue; // Already migrated

      // Auto-assign color
      const color = COLOR_PALETTE[0]; // First calendar gets blue

      await ctx.db.insert("b2cCalendars", {
        closerId: closer._id,
        teamId: closer.teamId,
        label: "Primary",
        color,
        provider: "google",
        googleRefreshToken: closer.googleCalendarRefreshToken,
        googleEmail: closer.email,
        isEnabled: true,
        lastSyncAt: closer.calendarLastSyncAt,
        createdAt: Date.now(),
      });

      migrated++;
    }

    console.log(`[Migration] Migrated ${migrated} closers to b2cCalendars`);
    return { migrated };
  },
});
