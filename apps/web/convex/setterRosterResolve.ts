"use node";

// ============================================================================
// Putting names to the people already doing the work.
//
// The roster listed thirteen people and could only name eight, which makes it
// useless — nobody can tell you whether "Unnamed user nLKs6QoN…" is a setter.
//
// The cause is the user sync: it calls /users/ once with a locationId filter,
// takes whatever comes back, and never pages. Agency-level users who work in a
// sub-account, and anyone the filter or the first page misses, simply never
// arrive. Same shape as the pagination bug that left a location believing 1,083
// of its leads had never been contacted.
//
// Rather than re-engineer the sync blind, this asks GHL directly about the
// specific ids we've seen working leads. One lookup per unknown person, and
// only for people who have actually done something — so the cost is bounded by
// reality rather than by the size of the account.
// ============================================================================

import { v } from "convex/values";
import { action, internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { ghlFetch } from "./setterGhlClient";

/* eslint-disable @typescript-eslint/no-explicit-any */

interface GhlUser {
  id?: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  roles?: { type?: string; role?: string };
}

/**
 * Look up every user id we've seen acting but can't name, and store what we
 * find.
 *
 * Best-effort per id: a 404 means the user is genuinely gone from GHL (someone
 * who left), which is worth knowing and is recorded as such rather than
 * retried forever. One failure never stops the rest — the point is to name as
 * many as possible, not to be all-or-nothing.
 */
export const resolveUnknownUsers = internalAction({
  args: { teamId: v.id("teams"), userIds: v.array(v.string()) },
  handler: async (ctx, args): Promise<any> => {
    const install = await ctx.runQuery(
      internal.setterGhlOauth.getActiveInstallationForTeam,
      { teamId: args.teamId },
    );
    if (!install) return { ok: false, reason: "No CRM connected for this team." };

    const resolved: Array<{ id: string; name: string; role?: string }> = [];
    const gone: string[] = [];
    const failed: Array<{ id: string; error: string }> = [];

    for (const userId of args.userIds) {
      try {
        const resp = await ghlFetch<{ user?: GhlUser } & GhlUser>(
          ctx,
          install._id as never,
          `/users/${userId}`,
        );
        // GHL returns the user either bare or wrapped depending on endpoint
        // version; accept both rather than guess.
        const u: GhlUser = (resp as any).user ?? (resp as any);
        const name =
          u.name ||
          [u.firstName, u.lastName].filter(Boolean).join(" ") ||
          u.email ||
          "";
        if (!name) {
          failed.push({ id: userId, error: "no name on the record" });
          continue;
        }
        await ctx.runMutation(internal.setterGhlSyncMutations.upsertSetterRep, {
          teamId: args.teamId,
          ghlUserId: userId,
          name,
          email: u.email,
          phone: u.phone,
          ghlRole: u.roles?.type,
        });
        resolved.push({ id: userId, name, role: u.roles?.type });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        // Both of these are answers rather than errors, and neither is worth
        // retrying. A 404 means the person has left GHL. A 400 "user id is
        // invalid" means it was never a user id — on one live team an id with
        // 44 texts against it is rejected outright, which most likely means an
        // integration or app acting through the API rather than a person.
        if (/404|not found/i.test(msg) || /user id is invalid/i.test(msg)) {
          gone.push(userId);
        } else failed.push({ id: userId, error: msg.slice(0, 120) });
      }
    }

    return { ok: true, resolved, gone, failed };
  },
});

/**
 * Name whoever we can't name, for the caller's own team.
 *
 * Called by the roster card when it finds people it can only show as an id,
 * because "Unnamed user nLKs6QoN…" is not something a manager can make a
 * decision about. Manager-gated and scoped to their own team; the ids come from
 * their own activity, never from the client.
 */
export const resolveMissingNamesForMyTeam = action({
  args: { clerkId: v.string() },
  handler: async (ctx, args): Promise<any> => {
    const target = await ctx.runQuery(internal.setterRosterQueries.unnamedActorsForUser, {
      clerkId: args.clerkId,
    });
    if (!target?.ok) return { ok: false, reason: target?.reason ?? "Not authorised." };
    if (target.userIds.length === 0) return { ok: true, resolved: [], gone: [], failed: [] };
    return await ctx.runAction(internal.setterRosterResolve.resolveUnknownUsers, {
      teamId: target.teamId,
      userIds: target.userIds,
    });
  },
});
