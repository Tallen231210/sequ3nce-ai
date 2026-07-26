// ============================================================================
// Closer sessions — proof that a request came from someone who logged in.
//
// The problem this solves: closers authenticate properly (password or emailed
// code), but every request afterwards just carries a `closerId` in the body and
// the backend takes it at face value. Nothing links the request to the login.
// A closer could submit numbers as a teammate, and pasting an ID into browser
// storage grants full access with no password at all.
//
// Login now also issues a random token. We store only its SHA-256 hash. On
// every later request the token is hashed and looked up, and the closer is
// resolved FROM THE SESSION — never from anything the client claims.
//
// Deliberately mirrors the picker-token pattern already in closerMagicLink.ts
// (same crypto, same hash-at-rest approach), just with a longer life.
// ============================================================================

import { v } from "convex/values";
import { internalMutation, internalQuery, mutation } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";

/**
 * 30 days, extended on use. Long enough that closers aren't re-authenticating
 * constantly — a sales floor opening this every morning should sign in once a
 * month at most, and anything shorter turns into a daily irritation people
 * route around.
 */
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** Only bother rewriting `lastUsedAt` once an hour — every request would make
 *  each read a write and put every closer's session in constant contention. */
const TOUCH_INTERVAL_MS = 60 * 60 * 1000;

/** SHA-256 hex. Same helper as closerMagicLink.ts / b2cAuth.ts. */
async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * 256 bits from the CSPRNG. `Math.random` is not cryptographically secure —
 * V8's PRNG is partially predictable, which would make session tokens
 * guessable no matter how long they look.
 */
function generateToken(): string {
  const buf = new Uint8Array(32);
  crypto.getRandomValues(buf);
  return Array.from(buf)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Creates a session and returns the raw token — the only time it exists in
 * readable form. Call from within a login mutation that has already verified
 * the closer's credentials.
 */
export async function issueSession(
  ctx: MutationCtx,
  closer: Doc<"closers">,
  userAgent?: string,
): Promise<string> {
  const token = generateToken();
  const now = Date.now();
  await ctx.db.insert("closerSessions", {
    closerId: closer._id,
    teamId: closer.teamId,
    tokenHash: await sha256Hex(token),
    createdAt: now,
    expiresAt: now + SESSION_TTL_MS,
    lastUsedAt: now,
    ...(userAgent ? { userAgent: userAgent.slice(0, 256) } : {}),
  });
  return token;
}

export type ResolvedCloser = {
  closerId: Id<"closers">;
  teamId: Id<"teams">;
  /** True when the caller proved they logged in. False = legacy trust path. */
  verified: boolean;
};

/**
 * Looks up a session by token. Read-only, so it is safe from queries.
 * Returns null for unknown, revoked or expired tokens — the caller cannot
 * tell which, deliberately.
 */
export async function resolveSession(
  ctx: QueryCtx,
  sessionToken: string,
): Promise<ResolvedCloser | null> {
  if (typeof sessionToken !== "string" || sessionToken.length !== 64) {
    return null;
  }
  const hash = await sha256Hex(sessionToken);
  const session = await ctx.db
    .query("closerSessions")
    .withIndex("by_token_hash", (q) => q.eq("tokenHash", hash))
    .unique();

  if (!session) return null;
  if (session.revokedAt) return null;
  if (session.expiresAt < Date.now()) return null;

  return {
    closerId: session.closerId,
    teamId: session.teamId,
    verified: true,
  };
}

/**
 * Who is this request actually from?
 *
 * With a token: the closer on the session. **Any `closerId` in the body is
 * ignored entirely** — that is the whole point, since the body is the thing
 * the client controls.
 *
 * Without one: falls back to trusting the body's `closerId`, which is how
 * every closer route works today. This fallback is NOT optional politeness —
 * installed desktop apps keep running on people's machines for months after
 * we stop shipping them, and requiring a token would break all of them at
 * once. It is removed when the desktop app is retired; the warning below is
 * how we tell when nothing is relying on it any more.
 */
export async function resolveCloserFromRequest(
  ctx: QueryCtx,
  body: { sessionToken?: unknown; closerId?: unknown },
): Promise<ResolvedCloser | null> {
  if (typeof body.sessionToken === "string" && body.sessionToken.length > 0) {
    // Read-only on purpose: HTTP routes run as actions and resolve through a
    // query, so every request stays a cheap read. Expiry is extended by
    // refreshSession, which the client calls once when the app loads rather
    // than on every request.
    const resolved = await resolveSession(ctx, body.sessionToken);
    if (resolved) return resolved;
    // A token was offered and it was bad. Do NOT quietly fall through to the
    // body's closerId — that would make a rejected session indistinguishable
    // from no session, and hand an attacker the legacy path on request.
    return null;
  }

  if (typeof body.closerId !== "string" || body.closerId.length === 0) {
    return null;
  }
  const closer = await ctx.db.get(body.closerId as Id<"closers">);
  if (!closer) return null;

  console.warn(
    `[closerSession] unauthenticated request for closer ${body.closerId} — ` +
      `legacy desktop client. Safe to remove this fallback once these stop.`,
  );
  return {
    closerId: closer._id,
    teamId: closer.teamId,
    verified: false,
  };
}

/**
 * The entry point HTTP routes use. They run as actions with no direct database
 * access, so resolution has to be callable rather than a plain helper.
 *
 * Returns null for "we could not establish who this is" — the caller should
 * answer 401 and let the client clear its stored token and sign in again.
 */
export const resolveCloser = internalQuery({
  args: {
    sessionToken: v.optional(v.string()),
    closerId: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<ResolvedCloser | null> =>
    resolveCloserFromRequest(ctx, args),
});

/**
 * Extends an active session. Called once when the app loads, not per request —
 * doing it on every request would turn every read into a write and put a
 * closer's own session under constant contention with itself.
 */
export const refreshSession = mutation({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    const hash = await sha256Hex(args.sessionToken);
    const session = await ctx.db
      .query("closerSessions")
      .withIndex("by_token_hash", (q) => q.eq("tokenHash", hash))
      .unique();
    if (!session || session.revokedAt || session.expiresAt < Date.now()) {
      return { valid: false };
    }
    const now = Date.now();
    if (now - session.lastUsedAt >= TOUCH_INTERVAL_MS) {
      await ctx.db.patch(session._id, {
        lastUsedAt: now,
        expiresAt: now + SESSION_TTL_MS,
      });
    }
    return { valid: true };
  },
});

/** Sign-out. Idempotent, and silent on an unknown token so it can't be used
 *  to probe which tokens exist. */
export const revokeSession = mutation({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    const hash = await sha256Hex(args.sessionToken);
    const session = await ctx.db
      .query("closerSessions")
      .withIndex("by_token_hash", (q) => q.eq("tokenHash", hash))
      .unique();
    if (session && !session.revokedAt) {
      await ctx.db.patch(session._id, { revokedAt: Date.now() });
    }
    return { success: true };
  },
});

/**
 * Housekeeping: drop sessions that expired or were revoked a while ago.
 * Bounded per run so it can never blow the transaction limits.
 */
export const purgeDeadSessions = internalMutation({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const limit = Math.max(1, Math.min(args.limit ?? 500, 2000));
    const stale = await ctx.db
      .query("closerSessions")
      .filter((q) =>
        q.or(
          q.lt(q.field("expiresAt"), cutoff),
          q.and(
            q.neq(q.field("revokedAt"), undefined),
            q.lt(q.field("revokedAt"), cutoff),
          ),
        ),
      )
      .take(limit);
    for (const s of stale) await ctx.db.delete(s._id);
    return { deleted: stale.length };
  },
});

/**
 * Everything the closer app needs on load, in one round trip: is the session
 * still good, who is it, and what is this team allowed to see.
 *
 * Extends the session as a side effect, which is why this is a mutation —
 * it replaces a separate refresh call rather than adding to it.
 */
export const me = mutation({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    const hash = await sha256Hex(args.sessionToken);
    const session = await ctx.db
      .query("closerSessions")
      .withIndex("by_token_hash", (q) => q.eq("tokenHash", hash))
      .unique();
    if (!session || session.revokedAt || session.expiresAt < Date.now()) {
      return { valid: false as const };
    }

    const closer = await ctx.db.get(session.closerId);
    if (!closer || closer.status === "deactivated") {
      return { valid: false as const };
    }

    const now = Date.now();
    if (now - session.lastUsedAt >= TOUCH_INTERVAL_MS) {
      await ctx.db.patch(session._id, {
        lastUsedAt: now,
        expiresAt: now + SESSION_TTL_MS,
      });
    }

    const team = await ctx.db.get(closer.teamId);
    return {
      valid: true as const,
      closer: {
        closerId: String(closer._id),
        teamId: String(closer.teamId),
        name: closer.name,
        email: closer.email,
        status: closer.status,
        teamName: team?.name,
      },
      // Staged rollout, same mechanism the Setter Data tab uses. Until a team
      // is added, they see a plain "not available yet" rather than a half-built
      // app — and a closer who guesses the URL gets nothing.
      webAppEnabled: (team?.betaFeatures ?? []).includes("closerWebApp"),
    };
  },
});
