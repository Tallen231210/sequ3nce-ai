import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { QueryCtx, MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";

// Get the current user's team
export const getMyTeam = query({
  args: { clerkId: v.string() },
  handler: async (ctx, args) => {
    // First find the user by clerkId
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .first();

    if (!user) {
      return null;
    }

    // Then get their team
    const team = await ctx.db.get(user.teamId);
    return team;
  },
});

// Get the current user record
export const getMyUser = query({
  args: { clerkId: v.string() },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .first();

    return user;
  },
});

// Create a new team and user (for first-time signup)
/**
 * Ensure the signed-in Clerk user has a team — with reattach-by-email.
 *
 * Why this exists: a manager who deletes their Clerk login (Clerk's
 * "Delete account" button in Manage Account) keeps their team, billing and
 * data, but comes back with a BRAND NEW Clerk id. Matching on clerkId alone
 * (see createTeamAndUser) would strand them in a fresh empty team while
 * their real account sits orphaned — exactly what happened to Create
 * Freedom in July 2026. Matching a verified email instead re-points the
 * existing user row at the new Clerk id, so they land back in their own
 * account with everything intact.
 *
 * SECURITY: reattaching by email is only safe when the email is *proven*.
 * Convex is not wired to Clerk JWTs here (no auth.config.ts), so a public
 * mutation taking a client-supplied email would be account takeover —
 * anyone could claim any team. Hence: ADMIN_SECRET-gated and callable ONLY
 * from /api/auth/bootstrap, which verifies the Clerk session server-side
 * and reads the verified primary email from Clerk's backend API.
 */
export const ensureUserTeam = mutation({
  args: {
    adminSecret: v.string(),
    clerkId: v.string(),
    email: v.string(),
    name: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const secret = process.env.ADMIN_SECRET;
    if (!secret || args.adminSecret !== secret) {
      throw new Error("Unauthorized");
    }

    // 1. Known Clerk id — the normal path.
    const byClerkId = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .first();
    if (byClerkId) {
      const team = await ctx.db.get(byClerkId.teamId);
      return {
        teamId: byClerkId.teamId,
        userId: byClerkId._id,
        team,
        reattached: false,
        created: false,
      };
    }

    // 2. Unknown Clerk id, but we know this (verified) email — the account
    //    was recreated. Re-point the existing row instead of duplicating.
    //    One row per manager, so this table stays tiny; scan + case-
    //    insensitive compare is correct where an exact index wouldn't be.
    const target = args.email.trim().toLowerCase();
    const allUsers = await ctx.db.query("users").take(5000);
    const byEmail = allUsers
      .filter((u) => (u.email || "").trim().toLowerCase() === target)
      .sort((a, b) => a.createdAt - b.createdAt)[0];
    if (byEmail) {
      await ctx.db.patch(byEmail._id, {
        clerkId: args.clerkId,
        ...(args.name ? { name: args.name } : {}),
      });
      const team = await ctx.db.get(byEmail.teamId);
      console.log(
        `[ensureUserTeam] reattached ${target} to existing team ${byEmail.teamId}`,
      );
      return {
        teamId: byEmail.teamId,
        userId: byEmail._id,
        team,
        reattached: true,
        created: false,
      };
    }

    // 3. Nobody by that email, but they were INVITED to a team. Join it.
    //
    //    Rides the same guarantee as step 2: `args.email` is read from Clerk's
    //    backend by the bootstrap route, never from the request body, so an
    //    unverified address can't claim an invite.
    //
    //    Without this a second manager at an existing customer gets their own
    //    empty team and the subscribe page, which reads as the company's
    //    account having lapsed. That cost an hour of live debugging on
    //    2026-08-12 and would have happened to every customer's second hire.
    const invite = await ctx.db
      .query("managerInvites")
      .withIndex("by_email", (q) => q.eq("email", target))
      .filter((q) => q.eq(q.field("acceptedAt"), undefined))
      .first();
    if (invite) {
      const invitedUserId = await ctx.db.insert("users", {
        clerkId: args.clerkId,
        email: args.email,
        name: args.name,
        teamId: invite.teamId,
        role: invite.role,
        createdAt: Date.now(),
      });
      await ctx.db.patch(invite._id, {
        acceptedAt: Date.now(),
        acceptedUserId: invitedUserId,
      });
      const team = await ctx.db.get(invite.teamId);
      console.log(
        `[ensureUserTeam] ${target} accepted an invite to team ${invite.teamId}`,
      );
      return {
        teamId: invite.teamId,
        userId: invitedUserId,
        team,
        reattached: false,
        created: false,
        joinedByInvite: true,
      };
    }

    // 4. Genuinely new — create team + admin user (same shape as
    //    createTeamAndUser).
    const teamId = await ctx.db.insert("teams", {
      name: `${args.name || "My"}'s Team`,
      plan: "active",
      createdAt: Date.now(),
      // Nobody chose to start a company here; we made one because we didn't
      // recognise them. The subscribe page needs to know the difference.
      selfServeCreated: true,
    });
    const userId = await ctx.db.insert("users", {
      clerkId: args.clerkId,
      email: args.email,
      name: args.name,
      teamId,
      role: "admin",
      createdAt: Date.now(),
    });
    const team = await ctx.db.get(teamId);
    return { teamId, userId, team, reattached: false, created: true };
  },
});

export const createTeamAndUser = mutation({
  args: {
    clerkId: v.string(),
    email: v.string(),
    name: v.optional(v.string()),
    teamName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Check if user already exists
    const existingUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .first();

    if (existingUser) {
      // User already exists, return their team
      const team = await ctx.db.get(existingUser.teamId);
      return { teamId: existingUser.teamId, userId: existingUser._id, team };
    }

    // Create the team
    const teamId = await ctx.db.insert("teams", {
      name: args.teamName || `${args.name || "My"}'s Team`,
      plan: "active",
      createdAt: Date.now(),
    });

    // Create the user as admin of the team
    const userId = await ctx.db.insert("users", {
      clerkId: args.clerkId,
      email: args.email,
      name: args.name,
      teamId,
      role: "admin",
      createdAt: Date.now(),
    });

    const team = await ctx.db.get(teamId);

    return { teamId, userId, team };
  },
});

// Get team by ID (used by audio processor)
export const getTeamById = query({
  args: { teamId: v.id("teams") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.teamId);
  },
});

// Update team name
export const updateTeamName = mutation({
  args: {
    clerkId: v.string(),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    // Get the user's team
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .first();

    if (!user) {
      throw new Error("User not found");
    }

    // Update the team name
    await ctx.db.patch(user.teamId, { name: args.name });

    return { success: true };
  },
});

// ============================================================================
// Manager invites
//
// The invite is only a record to match against. All the matching lives in
// `ensureUserTeam` above, on the verified-email path that already existed for
// reattaching a recreated login — so this adds no new way into an account.
// ============================================================================

function canManage(user: Doc<"users">): boolean {
  return user.role === "admin" || user.role === "manager";
}

async function requireManager(ctx: QueryCtx | MutationCtx, clerkId: string) {
  const user = await ctx.db
    .query("users")
    .withIndex("by_clerk_id", (q) => q.eq("clerkId", clerkId))
    .first();
  if (!user) return null;
  return canManage(user) ? user : null;
}

/**
 * Invite someone to this team's dashboard.
 *
 * Refuses an email that already belongs to a user on ANY team. Accepting such
 * an invite would silently move that person off their current team and strand
 * whatever they were the only manager of — an error they can read is better
 * than a surprise nobody notices.
 */
export const createManagerInvite = mutation({
  args: {
    clerkId: v.string(),
    email: v.string(),
    role: v.optional(v.string()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ success: boolean; error?: string; inviteId?: Id<"managerInvites"> }> => {
    const me = await requireManager(ctx, args.clerkId);
    if (!me) return { success: false, error: "Only managers can invite people." };

    const email = args.email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return { success: false, error: "That doesn't look like an email address." };
    }
    if (email.length > 200) {
      return { success: false, error: "That email is too long." };
    }

    const role = args.role === "manager" ? "manager" : "admin";

    // Same scan the reattach path uses — this table stays tiny (one row per
    // manager), and a case-insensitive compare is correct where an exact index
    // wouldn't be.
    const allUsers = await ctx.db.query("users").take(5000);
    const existing = allUsers.find(
      (u) => (u.email || "").trim().toLowerCase() === email,
    );
    if (existing) {
      return {
        success: false,
        error:
          String(existing.teamId) === String(me.teamId)
            ? "They're already on this team."
            : "That email already belongs to another team. Ask support to move it.",
      };
    }

    const pending = await ctx.db
      .query("managerInvites")
      .withIndex("by_email", (q) => q.eq("email", email))
      .filter((q) => q.eq(q.field("acceptedAt"), undefined))
      .first();
    if (pending) {
      return { success: false, error: "There's already a pending invite for that email." };
    }

    const inviteId = await ctx.db.insert("managerInvites", {
      teamId: me.teamId,
      email,
      role,
      invitedByUserId: me._id,
      createdAt: Date.now(),
    });
    return { success: true, inviteId };
  },
});

/** Current managers and outstanding invites, for the Team page. */
export const listTeamManagers = query({
  args: { clerkId: v.string() },
  handler: async (ctx, args): Promise<any> => {
    const me = await requireManager(ctx, args.clerkId);
    if (!me) return null;

    const members = await ctx.db
      .query("users")
      .withIndex("by_team", (q) => q.eq("teamId", me.teamId))
      .collect();

    const invites = await ctx.db
      .query("managerInvites")
      .withIndex("by_team", (q) => q.eq("teamId", me.teamId))
      .collect();

    return {
      members: members.map((u) => ({
        _id: u._id,
        email: u.email,
        name: u.name ?? null,
        role: u.role,
        isYou: String(u._id) === String(me._id),
      })),
      pending: invites
        .filter((i) => !i.acceptedAt)
        .map((i) => ({
          _id: i._id,
          email: i.email,
          role: i.role,
          createdAt: i.createdAt,
        })),
    };
  },
});

export const revokeManagerInvite = mutation({
  args: { clerkId: v.string(), inviteId: v.id("managerInvites") },
  handler: async (ctx, args): Promise<{ success: boolean; error?: string }> => {
    const me = await requireManager(ctx, args.clerkId);
    if (!me) return { success: false, error: "Only managers can do that." };

    const invite = await ctx.db.get(args.inviteId);
    if (!invite) return { success: true };
    // Scoped from the caller's own identity — the client never supplies a team.
    if (String(invite.teamId) !== String(me.teamId)) {
      return { success: false, error: "That invite isn't for your team." };
    }
    if (invite.acceptedAt) {
      return { success: false, error: "That invite has already been accepted." };
    }

    await ctx.db.delete(args.inviteId);
    return { success: true };
  },
});

/**
 * Flag calls whose post-call form was never filled in, on the completed-call
 * notification.
 *
 * Managers only. Closers can't turn off a warning that's about them.
 */
export const setFlagMissingPostCallForm = mutation({
  args: {
    clerkId: v.string(),
    enabled: v.boolean(),
  },
  handler: async (ctx, args): Promise<{ success: boolean }> => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .first();
    if (!user) throw new Error("User not found");
    if (user.role !== "admin" && user.role !== "manager") {
      throw new Error("Only managers can change this");
    }

    await ctx.db.patch(user.teamId, {
      flagMissingPostCallForm: args.enabled,
    });
    return { success: true };
  },
});

// Update user name
export const updateUserName = mutation({
  args: {
    clerkId: v.string(),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .first();

    if (!user) {
      throw new Error("User not found");
    }

    await ctx.db.patch(user._id, { name: args.name });

    return { success: true };
  },
});

/**
 * Reject anything that isn't a real IANA zone.
 *
 * An unvalidated string reaches formatInTimeZone in the rollups, the setter
 * scorecard and the closer scoreboard, where it throws — so a typo here would
 * surface later as several unrelated features failing at once.
 */
function assertValidTimezone(tz: string): void {
  if (!tz || tz.length > 64) throw new Error("Invalid timezone");
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
  } catch {
    throw new Error(`Unknown timezone: ${tz}`);
  }
}

// Update team timezone
export const updateTeamTimezone = mutation({
  args: {
    clerkId: v.string(),
    timezone: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .first();

    if (!user) {
      throw new Error("User not found");
    }

    assertValidTimezone(args.timezone);
    await ctx.db.patch(user.teamId, { timezone: args.timezone });

    return { success: true };
  },
});

/**
 * Adopt the signed-in manager's own timezone as the team's, but ONLY if the
 * team has never had one set.
 *
 * Day boundaries, the daily rollup and every scheduled post are computed in
 * team.timezone. Unset, everything silently falls back to America/New_York —
 * which is simply wrong for a West Coast team: bookings after 9pm land on the
 * following day and the morning post fires at 5am. Every team in production
 * is currently on that fallback, none of them deliberately.
 *
 * Only-if-unset matters: managers in different offices sign in on different
 * days, and last-writer-wins would make the team's day boundary wander. An
 * explicit choice in Settings always survives.
 */
export const adoptTimezoneIfUnset = mutation({
  args: {
    clerkId: v.string(),
    timezone: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .first();
    if (!user) return { set: false, reason: "unknown user" };

    const team = await ctx.db.get(user.teamId);
    if (!team) return { set: false, reason: "unknown team" };
    if (team.timezone) return { set: false, reason: "already set" };

    assertValidTimezone(args.timezone);
    await ctx.db.patch(user.teamId, { timezone: args.timezone });
    return { set: true, timezone: args.timezone };
  },
});

// Update custom call outcomes
export const updateCustomOutcomes = mutation({
  args: {
    clerkId: v.string(),
    customOutcomes: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .first();

    if (!user) {
      throw new Error("User not found");
    }

    await ctx.db.patch(user.teamId, { customOutcomes: args.customOutcomes });

    return { success: true };
  },
});

// Update custom playbook categories
export const updateCustomPlaybookCategories = mutation({
  args: {
    clerkId: v.string(),
    customPlaybookCategories: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .first();

    if (!user) {
      throw new Error("User not found");
    }

    await ctx.db.patch(user.teamId, { customPlaybookCategories: args.customPlaybookCategories });

    return { success: true };
  },
});

// Update Slack webhook URL
export const updateSlackWebhookUrl = mutation({
  args: {
    clerkId: v.string(),
    slackWebhookUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .first();

    if (!user) {
      throw new Error("User not found");
    }

    // Update the Slack webhook URL (empty string clears it)
    const url = args.slackWebhookUrl?.trim() || undefined;
    await ctx.db.patch(user.teamId, { slackWebhookUrl: url });

    return { success: true };
  },
});

// Update Slack notification channel for a specific notification type
export const updateSlackNotificationChannel = mutation({
  args: {
    clerkId: v.string(),
    notificationType: v.string(), // "reinforcement" | "callStarted" | "callSummary" | "callGoingLong"
    enabled: v.boolean(),
    channelId: v.optional(v.string()),
    channelName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .first();

    if (!user) {
      throw new Error("User not found");
    }

    const team = await ctx.db.get(user.teamId);
    if (!team) {
      throw new Error("Team not found");
    }

    // Get current notification channels or create empty object
    const currentChannels = team.slackNotificationChannels || {};

    // Update the specific notification type
    const validTypes = ["reinforcement", "callStarted", "callSummary", "callGoingLong", "callCompleted"];
    if (!validTypes.includes(args.notificationType)) {
      throw new Error("Invalid notification type");
    }

    const updatedChannels = {
      ...currentChannels,
      [args.notificationType]: {
        enabled: args.enabled,
        channelId: args.channelId,
        channelName: args.channelName,
      },
    };

    await ctx.db.patch(user.teamId, {
      slackNotificationChannels: updatedChannels,
    });

    return { success: true };
  },
});

// Update Discord notification channel for a specific notification type
export const updateDiscordNotificationChannel = mutation({
  args: {
    clerkId: v.string(),
    notificationType: v.string(), // "reinforcement" | "callStarted" | "callSummary" | "callGoingLong" | "callCompleted"
    enabled: v.boolean(),
    webhookUrl: v.optional(v.string()),
    channelName: v.optional(v.string()), // Display only
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .first();

    if (!user) {
      throw new Error("User not found");
    }

    const team = await ctx.db.get(user.teamId);
    if (!team) {
      throw new Error("Team not found");
    }

    // Get current notification channels or create empty object
    const currentChannels = team.discordNotificationChannels || {};

    // Update the specific notification type
    const validTypes = ["reinforcement", "callStarted", "callSummary", "callGoingLong", "callCompleted"];
    if (!validTypes.includes(args.notificationType)) {
      throw new Error("Invalid notification type");
    }

    // Preserve existing webhookUrl if not provided (frontend no longer receives URLs)
    const existingConfig = (currentChannels as Record<string, { webhookUrl?: string }>)[args.notificationType];
    const updatedChannels = {
      ...currentChannels,
      [args.notificationType]: {
        enabled: args.enabled,
        webhookUrl: args.webhookUrl !== undefined ? args.webhookUrl : existingConfig?.webhookUrl,
        channelName: args.channelName,
      },
    };

    // Set discordConnectedAt if this is the first webhook being configured
    const wasConnected = team.discordConnectedAt;
    const hasAnyWebhook =
      updatedChannels.reinforcement?.webhookUrl ||
      updatedChannels.callStarted?.webhookUrl ||
      updatedChannels.callSummary?.webhookUrl ||
      updatedChannels.callGoingLong?.webhookUrl ||
      updatedChannels.callCompleted?.webhookUrl;

    await ctx.db.patch(user.teamId, {
      discordNotificationChannels: updatedChannels,
      // Set connectedAt on first webhook, clear if all removed
      discordConnectedAt: hasAnyWebhook ? (wasConnected || Date.now()) : undefined,
    });

    return { success: true };
  },
});

// Toggle meeting bot feature flag for the team
export const updateMeetingBotEnabled = mutation({
  args: {
    clerkId: v.string(),
    enabled: v.boolean(),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .first();

    if (!user) {
      throw new Error("User not found");
    }

    if (user.role !== "admin") {
      throw new Error("Only admins can toggle meeting bot");
    }

    await ctx.db.patch(user.teamId, { meetingBotEnabled: args.enabled });

    return { success: true };
  },
});

// One-time: Enable meeting bot for all teams (v2.0.0 launch)
export const enableMeetingBotForAllTeams = mutation({
  args: {},
  handler: async (ctx) => {
    const teams = await ctx.db.query("teams").collect();
    let updated = 0;
    for (const team of teams) {
      if (team.meetingBotEnabled !== true) {
        await ctx.db.patch(team._id, { meetingBotEnabled: true });
        updated++;
      }
    }
    return { total: teams.length, updated };
  },
});

// Update meeting bot display name
export const updateMeetingBotName = mutation({
  args: {
    clerkId: v.string(),
    botName: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .first();

    if (!user) {
      throw new Error("User not found");
    }

    if (user.role !== "admin") {
      throw new Error("Only admins can update bot name");
    }

    await ctx.db.patch(user.teamId, { meetingBotName: args.botName.trim() });

    return { success: true };
  },
});

// Get full settings data
export const getSettings = query({
  args: { clerkId: v.string() },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .first();

    if (!user) {
      return null;
    }

    const team = await ctx.db.get(user.teamId);

    // Check if any Discord webhook is configured
    const discordChannels = team?.discordNotificationChannels;
    const hasAnyDiscordWebhook =
      discordChannels?.reinforcement?.webhookUrl ||
      discordChannels?.callStarted?.webhookUrl ||
      discordChannels?.callSummary?.webhookUrl ||
      discordChannels?.callGoingLong?.webhookUrl;

    // Redact webhook URLs — never expose full URLs to the frontend.
    // Return channel name + enabled status + boolean hasWebhookUrl instead.
    const redactDiscordChannels = (channels: typeof discordChannels) => {
      if (!channels) return undefined;
      const redacted: Record<string, { enabled?: boolean; channelName?: string; hasWebhookUrl: boolean }> = {};
      for (const [key, config] of Object.entries(channels)) {
        if (config && typeof config === "object") {
          const c = config as { enabled?: boolean; webhookUrl?: string; channelName?: string };
          redacted[key] = {
            enabled: c.enabled,
            channelName: c.channelName,
            hasWebhookUrl: !!c.webhookUrl,
          };
        }
      }
      return redacted;
    };

    return {
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
      team: team ? {
        _id: team._id,
        name: team.name,
        plan: team.plan,
        subscriptionStatus: team.subscriptionStatus,
        seatCount: team.seatCount,
        timezone: team.timezone,
        flagMissingPostCallForm: team.flagMissingPostCallForm === true,
        customOutcomes: team.customOutcomes,
        customPlaybookCategories: team.customPlaybookCategories,
        googleCalendarConnected: team.googleCalendarConnected,
        // Calendly integration
        calendlyConnected: !!team.calendlyAccessToken,
        calendlyConnectedEmail: team.calendlyConnectedEmail,
        calendlyLastSyncAt: team.calendlyLastSyncAt,
        // Slack integration — URL redacted, only boolean returned
        hasSlackWebhookUrl: !!team.slackWebhookUrl,
        // Slack OAuth integration
        slackConnected: !!(team.slackAccessToken || team.slackWebhookUrl),
        slackChannelName: team.slackChannelName,
        slackTeamName: team.slackTeamName,
        slackConnectedAt: team.slackConnectedAt,
        slackNotificationChannels: team.slackNotificationChannels,
        // Discord webhook integration — URLs redacted
        discordConnected: !!hasAnyDiscordWebhook,
        discordConnectedAt: team.discordConnectedAt,
        discordNotificationChannels: redactDiscordChannels(discordChannels),
        // Meeting Bot
        meetingBotEnabled: team.meetingBotEnabled,
        meetingBotName: team.meetingBotName,
      } : null,
    };
  },
});

// Delete team and all associated data
export const deleteTeam = mutation({
  args: {
    clerkId: v.string(),
    confirmTeamName: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .first();

    if (!user) {
      throw new Error("User not found");
    }

    if (user.role !== "admin") {
      throw new Error("Only admins can delete the team");
    }

    const team = await ctx.db.get(user.teamId);

    if (!team) {
      throw new Error("Team not found");
    }

    // Verify team name matches
    if (team.name !== args.confirmTeamName) {
      throw new Error("Team name does not match");
    }

    const teamId = user.teamId;

    // Delete all highlights
    const highlights = await ctx.db
      .query("highlights")
      .withIndex("by_team", (q) => q.eq("teamId", teamId))
      .collect();
    for (const highlight of highlights) {
      await ctx.db.delete(highlight._id);
    }

    // Delete all objections
    const objections = await ctx.db
      .query("objections")
      .withIndex("by_team", (q) => q.eq("teamId", teamId))
      .collect();
    for (const objection of objections) {
      await ctx.db.delete(objection._id);
    }

    // Delete all ammo
    const ammo = await ctx.db
      .query("ammo")
      .withIndex("by_team", (q) => q.eq("teamId", teamId))
      .collect();
    for (const item of ammo) {
      await ctx.db.delete(item._id);
    }

    // Delete all calls
    const calls = await ctx.db
      .query("calls")
      .withIndex("by_team", (q) => q.eq("teamId", teamId))
      .collect();
    for (const call of calls) {
      await ctx.db.delete(call._id);
    }

    // Delete all scheduled calls
    const scheduledCalls = await ctx.db
      .query("scheduledCalls")
      .withIndex("by_team_and_date", (q) => q.eq("teamId", teamId))
      .collect();
    for (const scheduledCall of scheduledCalls) {
      await ctx.db.delete(scheduledCall._id);
    }

    // Delete all closers
    const closers = await ctx.db
      .query("closers")
      .withIndex("by_team", (q) => q.eq("teamId", teamId))
      .collect();
    for (const closer of closers) {
      await ctx.db.delete(closer._id);
    }

    // Delete all users for this team
    const users = await ctx.db
      .query("users")
      .withIndex("by_team", (q) => q.eq("teamId", teamId))
      .collect();
    for (const u of users) {
      await ctx.db.delete(u._id);
    }

    // Delete the team itself
    await ctx.db.delete(teamId);

    return { success: true };
  },
});


/** Display names for the contract-value field, for the manager dashboard.
 *  Mirrors what the closer app receives on /closer/me. */
export const getDealValueLabels = query({
  args: { clerkId: v.string() },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .first();
    if (!user?.teamId) return null;
    const team: any = await ctx.db.get(user.teamId);
    const long = (team?.dealValueLabel as string | undefined)?.trim() || "Contract value";
    const short = (team?.dealValueShortLabel as string | undefined)?.trim() || (team?.dealValueLabel ? long : "Contract");
    return { long, short };
  },
});
