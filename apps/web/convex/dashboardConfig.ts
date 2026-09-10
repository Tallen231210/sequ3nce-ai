// ============================================================================
// Per-team dashboard shape: which sidebar entries a team doesn't need. The
// routes keep working (a link still lands); only the menu changes.
//   npx convex run dashboardConfig:setHiddenTabsForTeam '{"teamId":"…","hrefs":["/dashboard/playbook","/dashboard/analytics"]}' --prod
// ============================================================================

import { ConvexError, v } from "convex/values";
import { internalMutation } from "./_generated/server";

const HIDEABLE = new Set([
  "/dashboard/live",
  "/dashboard/schedule",
  "/dashboard/calls",
  "/dashboard/call-reviews",
  "/dashboard/analytics",
  "/dashboard/team-performance",
  "/dashboard/manager-mode",
  "/dashboard/collections",
  "/dashboard/playbook",
  "/dashboard/resources",
]);

export const setHiddenTabsForTeam = internalMutation({
  args: { teamId: v.id("teams"), hrefs: v.array(v.string()) },
  handler: async (ctx, args) => {
    const bad = args.hrefs.filter((h) => !HIDEABLE.has(h));
    if (bad.length > 0) throw new ConvexError(`Not hideable: ${bad.join(", ")}`);
    const hrefs = Array.from(new Set(args.hrefs));
    await ctx.db.patch(args.teamId, { hiddenDashboardTabs: hrefs });
    return { ok: true, hidden: hrefs };
  },
});
