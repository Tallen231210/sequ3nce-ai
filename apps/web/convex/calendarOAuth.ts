import { v } from "convex/values";
import { mutation, action, internalMutation, internalQuery } from "./_generated/server";
import { api, internal } from "./_generated/api";

// ============================================
// INTERNAL QUERIES
// ============================================

/**
 * Get closer by ID for use in actions
 */
export const getCloserById = internalQuery({
  args: { closerId: v.id("closers") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.closerId);
  },
});

// ============================================
// MUTATIONS
// ============================================

/**
 * Save Google Calendar OAuth connection on a closer record.
 * Called after the OAuth callback exchanges the authorization code for tokens.
 */
export const saveGoogleCalendarConnection = mutation({
  args: {
    closerId: v.id("closers"),
    refreshToken: v.string(),
    email: v.string(),
  },
  handler: async (ctx, args) => {
    const closer = await ctx.db.get(args.closerId);
    if (!closer) {
      throw new Error("Closer not found");
    }

    await ctx.db.patch(args.closerId, {
      googleCalendarRefreshToken: args.refreshToken,
      calendarProvider: "google",
      calendarConnectedAt: Date.now(),
    });

    return { success: true };
  },
});

/**
 * Save Microsoft/Outlook Calendar OAuth connection on a closer record.
 * Called after the OAuth callback exchanges the authorization code for tokens.
 */
export const saveMicrosoftCalendarConnection = mutation({
  args: {
    closerId: v.id("closers"),
    refreshToken: v.string(),
    email: v.string(),
  },
  handler: async (ctx, args) => {
    const closer = await ctx.db.get(args.closerId);
    if (!closer) {
      throw new Error("Closer not found");
    }

    await ctx.db.patch(args.closerId, {
      microsoftCalendarRefreshToken: args.refreshToken,
      calendarProvider: "microsoft",
      calendarConnectedAt: Date.now(),
    });

    return { success: true };
  },
});

/**
 * Disconnect calendar integration from a closer.
 * Clears all calendar OAuth fields (refresh tokens, provider, Meeting BaaS calendar ID, onboarding).
 */
export const disconnectCalendar = mutation({
  args: {
    closerId: v.id("closers"),
  },
  handler: async (ctx, args) => {
    const closer = await ctx.db.get(args.closerId);
    if (!closer) {
      throw new Error("Closer not found");
    }

    await ctx.db.patch(args.closerId, {
      googleCalendarRefreshToken: undefined,
      microsoftCalendarRefreshToken: undefined,
      calendarProvider: undefined,
      calendarConnectedAt: undefined,
      meetingBaasCalendarId: undefined,
      calendarOnboardingCompleted: undefined,
    });

    return { success: true };
  },
});

/**
 * Mark calendar onboarding as completed for a closer.
 * Called after the closer has finished the bot setup flow.
 */
export const markOnboardingCompleted = mutation({
  args: {
    closerId: v.id("closers"),
  },
  handler: async (ctx, args) => {
    const closer = await ctx.db.get(args.closerId);
    if (!closer) {
      throw new Error("Closer not found");
    }

    await ctx.db.patch(args.closerId, {
      calendarOnboardingCompleted: true,
    });

    return { success: true };
  },
});

// ============================================
// INTERNAL MUTATIONS (for actions)
// ============================================

/**
 * Internal mutation to save the Meeting BaaS calendar integration ID on a closer.
 */
export const saveMeetingBaasCalendarId = internalMutation({
  args: {
    closerId: v.id("closers"),
    meetingBaasCalendarId: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.closerId, {
      meetingBaasCalendarId: args.meetingBaasCalendarId,
    });
  },
});

// ============================================
// ACTIONS (external API calls)
// ============================================

/**
 * Sync a closer's calendar with Meeting BaaS.
 * Registers the calendar OAuth credentials with Meeting BaaS so that it can
 * monitor upcoming meetings and auto-join with a bot.
 *
 * This action:
 * 1. Reads the closer record to get the refresh token and calendar provider
 * 2. Calls Meeting BaaS API to register the calendar integration
 * 3. Stores the returned calendar integration ID on the closer via mutation
 */
export const syncCalendarWithMeetingBaas = action({
  args: {
    closerId: v.id("closers"),
  },
  handler: async (ctx, args): Promise<{ success: boolean; meetingBaasCalendarId?: string; error?: string }> => {
    // Get the closer record
    const closer: any = await ctx.runQuery(internal.calendarOAuth.getCloserById, {
      closerId: args.closerId,
    });

    if (!closer) {
      throw new Error("Closer not found");
    }

    // Determine which refresh token to use based on calendar provider
    const calendarProvider: string | undefined = closer.calendarProvider;
    let refreshToken: string | undefined;

    if (calendarProvider === "google") {
      refreshToken = closer.googleCalendarRefreshToken;
    } else if (calendarProvider === "microsoft") {
      refreshToken = closer.microsoftCalendarRefreshToken;
    }

    if (!calendarProvider || !refreshToken) {
      throw new Error("No calendar connected. Please connect Google or Microsoft calendar first.");
    }

    const apiKey = process.env.MEETING_BAAS_API_KEY;
    if (!apiKey) {
      throw new Error("Meeting BaaS API key not configured");
    }

    try {
      // TODO: Replace with actual Meeting BaaS calendar registration endpoint
      // The exact endpoint and request body format will be configured once
      // Meeting BaaS API documentation is available.
      //
      // Expected flow:
      // 1. POST to Meeting BaaS API with calendar credentials
      // 2. Meeting BaaS returns a calendar integration ID
      // 3. We store that ID on the closer record
      //
      // Placeholder API call:
      const response: Response = await fetch("https://api.meetingbaas.com/v2/calendars", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          provider: calendarProvider, // "google" | "microsoft"
          refresh_token: refreshToken,
          // TODO: Add any additional required fields (e.g., client_id, webhook URL)
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("[CalendarOAuth] Meeting BaaS API error:", response.status, errorText);
        throw new Error(`Meeting BaaS API error: ${response.status}`);
      }

      const data: Record<string, any> = await response.json();

      // TODO: Extract the calendar integration ID from the response
      // The field name will depend on the actual Meeting BaaS API response format
      const meetingBaasCalendarId: string | undefined = data.id || data.calendar_id;

      if (meetingBaasCalendarId) {
        // Save the Meeting BaaS calendar ID on the closer record
        await ctx.runMutation(internal.calendarOAuth.saveMeetingBaasCalendarId, {
          closerId: args.closerId,
          meetingBaasCalendarId: String(meetingBaasCalendarId),
        });
      }

      return {
        success: true,
        meetingBaasCalendarId: meetingBaasCalendarId || undefined,
      };
    } catch (error) {
      console.error("[CalendarOAuth] Failed to sync calendar with Meeting BaaS:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },
});
