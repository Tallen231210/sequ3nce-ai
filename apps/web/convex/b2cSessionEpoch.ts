import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";

// ============================================================================
// Session epoch — the remote-logout switch for Sequ3nce Personal.
//
// Every b2cUser carries a `sessionEpoch` number. The app learns it at login
// and re-reads it on launch and on its 60-second subscription poll; when the
// server's number has moved past the one the app holds, the app signs itself
// out. Bumping is CLI-only. It only signs devices out — it never touches the
// password or the subscription — so it is safe to run on any account
// (rep rotation, or "sign this customer out everywhere" support).
//
// Login deliberately does NOT bump the epoch: the shared demo account has
// several reps signed in at once, and a login must not evict the others.
// ============================================================================

/** The epoch a client should hold. Unset on the row means 0 (never bumped). */
export function currentSessionEpoch(
  user: Pick<Doc<"b2cUsers">, "sessionEpoch">,
): number {
  return user.sessionEpoch ?? 0;
}

export const bumpSessionEpoch = internalMutation({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    const email = args.email.trim().toLowerCase();
    const user = await ctx.db
      .query("b2cUsers")
      .withIndex("by_email", (q) => q.eq("email", email))
      .first();
    if (!user) throw new Error("No such user");
    const sessionEpoch = currentSessionEpoch(user) + 1;
    await ctx.db.patch(user._id, { sessionEpoch });
    return { email, sessionEpoch };
  },
});
