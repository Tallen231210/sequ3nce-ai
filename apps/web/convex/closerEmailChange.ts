import { internalMutation } from "./_generated/server";
import { v } from "convex/values";

// ============================================================================
// Change a closer's email without destroying who they are.
//
// Written for a rebrand: ManyJobs (formerly RemoteStack) moved Google Workspace
// and every closer's address changed domain. The obvious route — remove the
// closer and re-invite them — silently throws away their history, because a new
// record means a new id and every call, stat, recording and bot points at the
// old one. The record has to survive; only the field changes.
//
// Internal on purpose. There is no manager-facing way to edit a closer's email
// yet, and this is not it: it exists to be called from the CLI by us, with the
// checks that a real feature would need already in place.
// ============================================================================

/**
 * Point a closer at a new address, keeping the same record.
 *
 * `closers.by_email` is a GLOBAL index and login resolves with `.first()`, so a
 * duplicate address doesn't error — it silently sends someone to whichever row
 * the index happens to return, potentially on another team. Uniqueness is
 * therefore a correctness requirement, not tidiness, and it is checked here
 * rather than trusted from the caller.
 */
export const changeCloserEmail = internalMutation({
  args: {
    closerId: v.id("closers"),
    newEmail: v.string(),
  },
  handler: async (ctx, args) => {
    const closer = await ctx.db.get(args.closerId);
    if (!closer) throw new Error(`No closer ${args.closerId}`);

    // Match how login normalises, or a capitalised address becomes unfindable.
    const email = args.newEmail.trim().toLowerCase();
    if (!email.includes("@") || email.length < 3) {
      throw new Error(`"${args.newEmail}" is not an email address`);
    }

    if (email === closer.email) {
      return { changed: false, reason: "already set", email };
    }

    const clash = await ctx.db
      .query("closers")
      .withIndex("by_email", (q) => q.eq("email", email))
      .first();
    if (clash) {
      throw new Error(
        `${email} already belongs to closer ${clash._id} (${clash.name ?? "unnamed"}) — refusing`,
      );
    }

    const previous = closer.email;
    await ctx.db.patch(args.closerId, { email });
    return { changed: true, name: closer.name, previous, email };
  },
});

/**
 * Sign a closer out everywhere.
 *
 * Sessions key on closerId, not email, so changing an address leaves every
 * existing session valid — the closer stays logged in for weeks against an
 * account that no longer answers to the address they'd use to log back in.
 * Revoking is the only thing that makes the change visible to them.
 *
 * Sets revokedAt rather than deleting, matching revokeSession: the row is kept
 * for auditability.
 */
export const revokeAllSessionsForCloser = internalMutation({
  args: { closerId: v.id("closers") },
  handler: async (ctx, args) => {
    const sessions = await ctx.db
      .query("closerSessions")
      .withIndex("by_closer", (q) => q.eq("closerId", args.closerId))
      .collect();

    const now = Date.now();
    let revoked = 0;
    for (const s of sessions) {
      if (s.revokedAt) continue;
      if (s.expiresAt < now) continue; // already dead; leave the record honest
      await ctx.db.patch(s._id, { revokedAt: now });
      revoked++;
    }
    return { revoked, examined: sessions.length };
  },
});
