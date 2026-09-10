// ============================================================================
// Roster ↔ CRM user, and the per-team words that name booking lanes.
//
// The EOD roster (setterRoster) exists before any CRM is connected, and the
// CRM's users (setterReps) arrive from the sync. Until now nothing joined the
// two: `setterRepId` was declared and never written. The setter-team rules
// need the join — "(s)" on a title is Sophie the roster row, a Close dial is
// Sophie the Close user — so this is where it is made: once by name, then by
// a manager in the roster editor when a name doesn't match.
// ============================================================================

import { v, ConvexError } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { resolveAuthUser } from "./setterGhlOauth";

const ROLE = v.union(v.literal("booking"), v.literal("confirmation"));
const MAX_PATTERNS = 20;
const MAX_PATTERN_LEN = 40;

/** The CRM users a manager can attach a roster row to. */
export const listCrmUsers = query({
  args: { clerkId: v.string() },
  handler: async (ctx, args) => {
    const user = await resolveAuthUser(ctx, args.clerkId);
    if (!user?.teamId) return null;
    if (user.role !== "admin" && user.role !== "manager") return null;
    const reps = (await ctx.db
      .query("setterReps")
      .withIndex("by_team", (q) => q.eq("teamId", user.teamId))
      .take(500)) as Doc<"setterReps">[];
    return reps
      .map((r) => ({ crmUserId: r.ghlUserId, name: r.name, isActive: r.isActive }))
      .sort((a, b) => Number(b.isActive) - Number(a.isActive) || a.name.localeCompare(b.name));
  },
});

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
const first = (s: string) => norm(s).split(" ")[0] ?? "";

/**
 * Attach roster rows to CRM users by name, only where the match is unique.
 * Full name first ("Sophie Howell" = "Sophie Howell"), then first name when
 * exactly one CRM user carries it. Anything ambiguous is left for the picker.
 *   npx convex run setterRosterLink:autoLinkRoster '{"teamId":"…"}' --prod
 */
export const autoLinkRoster = internalMutation({
  args: { teamId: v.id("teams"), overwrite: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const [roster, allReps, roles] = await Promise.all([
      ctx.db.query("setterRoster").withIndex("by_team", (q) => q.eq("teamId", args.teamId)).take(200),
      ctx.db.query("setterReps").withIndex("by_team", (q) => q.eq("teamId", args.teamId)).take(500),
      ctx.db.query("setterRoleAssignments").withIndex("by_team", (q) => q.eq("teamId", args.teamId)).take(500),
    ]);
    // Never bind a roster row to a closer's CRM user by a shared first name:
    // their confirmation dials would then read as setting.
    const notSetters = new Set(roles.filter((r) => r.role !== "setter").map((r) => r.crmUserId));
    const reps = allReps.filter((rep) => !notSetters.has(rep.ghlUserId));
    const linked: Array<{ roster: string; crmUser: string; by: "full" | "first" }> = [];
    const unmatched: string[] = [];
    for (const r of roster) {
      if (r.crmUserId && !args.overwrite) continue;
      const full = reps.filter((rep) => norm(rep.name) === norm(r.name));
      const byFirst = full.length === 0 ? reps.filter((rep) => first(rep.name) === first(r.name)) : [];
      const hit = full.length === 1 ? full[0] : byFirst.length === 1 ? byFirst[0] : null;
      if (!hit) {
        unmatched.push(r.name);
        continue;
      }
      await ctx.db.patch(r._id, { crmUserId: hit.ghlUserId, setterRepId: hit._id });
      linked.push({ roster: r.name, crmUser: hit.name, by: full.length === 1 ? "full" : "first" });
    }
    return { linked, unmatched };
  },
});

interface LinkPatch {
  role?: "booking" | "confirmation";
  tag?: string;
  crmUserId?: string;
  /** CLI only: accept a CRM user id the team's synced user list doesn't carry (yet). */
  allowUnknownCrmUser?: boolean;
}

/** Validate and write role / tag / CRM user on one roster row. Shared by the CLI and the manager UI. */
async function applyRosterLink(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ctx: { db: any },
  row: Doc<"setterRoster">,
  args: LinkPatch,
): Promise<Partial<Doc<"setterRoster">>> {
  const patch: Partial<Doc<"setterRoster">> = {};
  if (args.role !== undefined) patch.role = args.role;
  if (args.tag !== undefined) {
    const tag = args.tag.trim().toLowerCase();
    if (tag.length > 5) throw new ConvexError("Tag is at most 5 characters");
    patch.tag = tag || undefined;
  }
  if (args.crmUserId !== undefined) {
    const id = args.crmUserId.trim();
    if (id.length > 200) throw new ConvexError("Check the CRM user id");
    if (id.length === 0) {
      patch.crmUserId = undefined;
      patch.setterRepId = undefined;
    } else {
      const rep = (await ctx.db
        .query("setterReps")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .withIndex("by_team_and_ghl_user_id", (q: any) => q.eq("teamId", row.teamId).eq("ghlUserId", id))
        .first()) as Doc<"setterReps"> | null;
      if (!rep && !args.allowUnknownCrmUser) throw new ConvexError("That CRM user isn't in this team's synced user list");
      // One active row per CRM user, or two cards would carry the same dials.
      const rows = (await ctx.db
        .query("setterRoster")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .withIndex("by_team", (q: any) => q.eq("teamId", row.teamId))
        .take(200)) as Doc<"setterRoster">[];
      const other = rows.find((r) => String(r._id) !== String(row._id) && r.active !== false && r.crmUserId === id);
      if (other) throw new ConvexError(`That CRM user is already linked to ${other.name}. Unlink it there first.`);
      patch.crmUserId = id;
      patch.setterRepId = rep?._id;
    }
  }
  // A confirmation setter is recognised on the calendar by her tag ("(s)");
  // without one, a bare first letter would prefix-match other setters and
  // her lane would drain into Outbound.
  const role = patch.role ?? row.role;
  const tag = args.tag !== undefined ? patch.tag : row.tag;
  if (role === "confirmation" && !tag) {
    throw new ConvexError("A confirmation setter needs a calendar tag first — the initials closers write on her bookings");
  }
  await ctx.db.patch(row._id, patch);
  return patch;
}

/**
 * Founder CLI: set a roster row's role, tag and CRM user in one go.
 *   npx convex run setterRosterLink:setRoleAndLink '{"rosterId":"…","role":"confirmation","crmUserId":"user_…","tag":"s"}' --prod
 */
export const setRoleAndLink = internalMutation({
  args: {
    rosterId: v.id("setterRoster"),
    role: v.optional(ROLE),
    crmUserId: v.optional(v.string()),
    tag: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.rosterId);
    if (!row) throw new ConvexError("No such roster row");
    const patch = await applyRosterLink(ctx, row, { ...args, allowUnknownCrmUser: true });
    return { ok: true, name: row.name, ...patch };
  },
});

/** Manager UI: role and CRM user on a roster row of the manager's own team. */
export const updateRosterLink = mutation({
  args: {
    clerkId: v.string(),
    rosterId: v.id("setterRoster"),
    role: v.optional(ROLE),
    crmUserId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await resolveAuthUser(ctx, args.clerkId);
    if (!user?.teamId) throw new ConvexError("Not authorised");
    if (user.role !== "admin" && user.role !== "manager") throw new ConvexError("Only managers can do that");
    const row = await ctx.db.get(args.rosterId);
    if (!row || row.teamId !== user.teamId) throw new ConvexError("No such roster row");
    await applyRosterLink(ctx, row, { role: args.role, crmUserId: args.crmUserId });
    return { ok: true };
  },
});

/**
 * The words that name a team's booking lanes, matched inside the Calendly
 * Event Name ("instagram", "davud", "lazar" → DM; "facebook", "main training"
 * → self-booked funnel).
 *   npx convex run setterRosterLink:setLanePatterns '{"teamId":"…","dm":["instagram","davud","lazar"],"funnel":["facebook","main training"]}' --prod
 */
export const setLanePatterns = internalMutation({
  args: {
    teamId: v.id("teams"),
    dm: v.optional(v.array(v.string())),
    funnel: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const clean = (list: string[] | undefined) => {
      if (list === undefined) return undefined;
      const out = Array.from(new Set(list.map((s) => s.trim().toLowerCase()).filter((s) => s.length >= 2)));
      if (out.length > MAX_PATTERNS) throw new ConvexError(`At most ${MAX_PATTERNS} words`);
      if (out.some((s) => s.length > MAX_PATTERN_LEN)) throw new ConvexError("A word is too long");
      return out;
    };
    const patch: { setterDmEventNamePatterns?: string[]; setterFunnelEventNamePatterns?: string[] } = {};
    const dm = clean(args.dm);
    const funnel = clean(args.funnel);
    if (dm) patch.setterDmEventNamePatterns = dm;
    if (funnel) patch.setterFunnelEventNamePatterns = funnel;
    await ctx.db.patch(args.teamId as Id<"teams">, patch);
    return patch;
  },
});
