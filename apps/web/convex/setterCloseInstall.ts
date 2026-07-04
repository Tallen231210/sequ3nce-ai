import { v } from "convex/values";
import { internalMutation, mutation } from "./_generated/server";
import { resolveAuthUser } from "./setterGhlOauth";

// ============================================================================
// Setter Data — Close installation persistence (V8 isolate; no network/crypto).
// The connectClose action (setterCloseConnect.ts, Node runtime) validates the
// key + encrypts it, then calls upsertCloseInstallation here to write the row.
// ============================================================================

const HUNDRED_YEARS_MS = 100 * 365 * 24 * 60 * 60 * 1000;

/**
 * Persist (or refresh) a Close installation for a team. Enforces one-CRM-per-
 * team: refuses if the team already has an active GoHighLevel install.
 * GHL-required fields get benign placeholders (Close has no location/refresh/
 * expiry/scopes); the encrypted API key lives in `accessToken`.
 */
export const upsertCloseInstallation = internalMutation({
  args: {
    clerkId: v.string(),
    teamId: v.id("teams"),
    encryptedApiKey: v.string(),
    closeOrganizationId: v.string(),
    orgName: v.optional(v.string()),
    funnel: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    // Auth: the caller must belong to the team they're attaching Close to.
    // Blocks attaching a key to an arbitrary teamId.
    const user = await resolveAuthUser(ctx, args.clerkId);
    if (!user || user.teamId !== args.teamId) {
      throw new Error("Not authorized to connect this team.");
    }

    const existing = await ctx.db
      .query("setterGhlInstallations")
      .withIndex("by_team", (q) => q.eq("teamId", args.teamId))
      .collect();
    const active = existing.filter((i) => i.status !== "uninstalled");

    // One CRM per team.
    const ghl = active.find((i) => (i.provider ?? "ghl") === "ghl");
    if (ghl) {
      throw new Error(
        "This team is already connected to GoHighLevel. Disconnect it first to connect Close.",
      );
    }

    const now = Date.now();
    const mine = active.find((i) => i.provider === "close");
    if (mine) {
      await ctx.db.patch(mine._id, {
        accessToken: args.encryptedApiKey,
        closeOrganizationId: args.closeOrganizationId,
        locationName: args.orgName,
        closeFunnel: args.funnel,
        status: "active",
        errorMessage: undefined,
        errorAt: undefined,
        lastRefreshedAt: now,
      });
      return mine._id;
    }

    return await ctx.db.insert("setterGhlInstallations", {
      teamId: args.teamId,
      provider: "close",
      // Close identity + key
      closeOrganizationId: args.closeOrganizationId,
      accessToken: args.encryptedApiKey,
      locationName: args.orgName,
      closeFunnel: args.funnel,
      // GHL-required-field placeholders (unused for Close)
      locationId: `close:${args.closeOrganizationId}`,
      refreshToken: "",
      expiresAt: now + HUNDRED_YEARS_MS,
      scopes: [],
      // Lifecycle
      status: "active",
      installedAt: now,
    });
  },
});

/**
 * Disconnect a Close installation (clears the stored key by marking the row
 * uninstalled). Mirrors the GHL disconnect: historical data preserved.
 * Admin-only via resolveAuthUser.
 */
export const disconnectClose = mutation({
  args: { clerkId: v.string(), teamId: v.id("teams") },
  handler: async (ctx, args) => {
    const user = await resolveAuthUser(ctx, args.clerkId);
    if (!user || user.teamId !== args.teamId) {
      return { ok: false as const, error: "Not authorized for this team" };
    }
    const installs = await ctx.db
      .query("setterGhlInstallations")
      .withIndex("by_team", (q) => q.eq("teamId", args.teamId))
      .collect();
    const close = installs.find((i) => i.provider === "close" && i.status !== "uninstalled");
    if (!close) return { ok: false as const, error: "No Close connection found" };
    await ctx.db.delete(close._id);
    return { ok: true as const };
  },
});
