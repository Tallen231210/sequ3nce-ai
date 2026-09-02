import { v } from "convex/values";
import { internalMutation, internalQuery, query } from "./_generated/server";

// ============================================================================
// B2C remote feature flags — flip features in shipped apps without a release.
//
// Each flag has a rollout mode:
//   "off"      — nobody (also the default when no row exists: fail closed)
//   "internal" — founders + isTestAccount only (dogfooding stage)
//   "all"      — everyone
//
// Flip from the CLI, e.g.:
//   npx convex run b2cFeatureFlags:setFlag '{"key":"freehire_job_board","mode":"internal"}' --prod
// ============================================================================

const MODES = ["off", "internal", "all"] as const;
type Mode = (typeof MODES)[number];

const KNOWN_FLAGS = ["freehire_job_board"] as const;

export const setFlag = internalMutation({
  args: { key: v.string(), mode: v.string() },
  handler: async (ctx, args) => {
    if (!(KNOWN_FLAGS as readonly string[]).includes(args.key)) {
      throw new Error(`Unknown flag "${args.key}". Known: ${KNOWN_FLAGS.join(", ")}`);
    }
    if (!(MODES as readonly string[]).includes(args.mode)) {
      throw new Error(`Mode must be one of: ${MODES.join(", ")}`);
    }
    const existing = await ctx.db
      .query("b2cFeatureFlags")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, { mode: args.mode, updatedAt: Date.now() });
    } else {
      await ctx.db.insert("b2cFeatureFlags", {
        key: args.key,
        mode: args.mode,
        updatedAt: Date.now(),
      });
    }
    return { key: args.key, mode: args.mode };
  },
});

async function flagMode(
  ctx: { db: any },
  key: string,
): Promise<Mode> {
  const row = await ctx.db
    .query("b2cFeatureFlags")
    .withIndex("by_key", (q: any) => q.eq("key", key))
    .unique();
  const mode = row?.mode;
  return (MODES as readonly string[]).includes(mode) ? (mode as Mode) : "off";
}

/**
 * Per-user flag decisions for the session's owner. Identity comes only from
 * the bearer token (same standard as /b2c/freehire-tracking); an unknown or
 * missing session gets every flag off — the app falls back to legacy UI.
 */
export const evaluateFlagsForSession = internalQuery({
  args: { sessionToken: v.string() },
  handler: async (ctx, { sessionToken }) => {
    const flags: Record<string, boolean> = {};
    for (const key of KNOWN_FLAGS) flags[key] = false;

    if (!/^[a-f0-9]{64}$/.test(sessionToken)) return { flags };
    const data = new TextEncoder().encode(sessionToken);
    const digest = await crypto.subtle.digest("SHA-256", data);
    const sessionTokenHash = Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    const user = await ctx.db
      .query("b2cUsers")
      .withIndex("by_session_token_hash", (q) =>
        q.eq("sessionTokenHash", sessionTokenHash),
      )
      .unique();
    if (!user) return { flags };

    const isInternal =
      user.isTestAccount === true ||
      (user.badges ?? []).includes("founder");

    for (const key of KNOWN_FLAGS) {
      const mode = await flagMode(ctx, key);
      flags[key] = mode === "all" || (mode === "internal" && isInternal);
    }
    return { flags };
  },
});

/**
 * Global modes only — no user data. Read by the Electron MAIN process so the
 * FreeHire IPC bridge honors the kill switch even in packaged builds ("off"
 * refuses requests app-wide). Public by design: modes leak nothing.
 */
export const getPublicFlagModes = query({
  args: {},
  handler: async (ctx) => {
    const modes: Record<string, Mode> = {};
    for (const key of KNOWN_FLAGS) modes[key] = await flagMode(ctx, key);
    return modes;
  },
});
