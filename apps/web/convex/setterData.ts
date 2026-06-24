import { v } from "convex/values";
import { internalQuery, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { computeScorecard } from "./setterDataMetrics";
import {
  buildMatcherIndex,
  findCallsForLead,
} from "./setterCloserMatcher";
import {
  computeBookingsInsight,
  computeCadenceInsight,
  computeCoverageGapInsight,
  computeDecayInsight,
  computeFunnelInsight,
  computeHeatmapInsight,
  computeHyrosAdSourcesInsight,
  computeRoutingInsight,
  dayName,
  hourRange,
  type PanelInsight,
} from "./setterDataInsights";

// ============================================================================
// Setter Data — public read APIs for the dashboard UI.
//
// All queries here are admin-gated via resolveAuthUser → user.role === "admin".
// Closers don't have access to the web dashboard at all (per CLAUDE.md), but
// non-admin users (managers without admin role) similarly get null. Tab is
// hidden for them at the sidebar level too.
//
// Date ranges are Unix ms (UTC). The frontend's DateRangePicker provides
// these directly — no timezone math here.
// ============================================================================

// ----------------------------------------------------------------------------
// AUTH HELPER (mirrors apps/web/convex/ghl.ts:9-20)
// ----------------------------------------------------------------------------

// Resolve the calling user by their Clerk ID (passed explicitly by the
// frontend). Convex + Clerk auth context isn't wired up app-wide, so we
// follow the dominant codebase pattern of taking clerkId as an arg
// (mirrors apps/web/convex/hyros.ts, slack.ts, refgrow.ts, etc).
async function resolveAuthUser(
  ctx: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    db: any;
  },
  clerkId: string,
) {
  const user = await ctx.db
    .query("users")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .withIndex("by_clerk_id", (q: any) => q.eq("clerkId", clerkId))
    .first();
  return user;
}

// Normalize Hyros's raw trafficSource strings to clean display names so
// duplicate platform spellings ("facebook" + "Facebook Ads", "google" +
// "google_v2") don't render as separate rows in the ad-attribution
// panel. Hyros doesn't normalize these on their end — different
// integrations / migrations leave the same platform under several
// labels. Fallback: capitalize the raw value so unknown platforms still
// render reasonably.
function normalizeHyrosPlatform(raw: string): string {
  const lower = raw.toLowerCase().trim();
  if (
    lower === "facebook" ||
    lower === "facebook ads" ||
    lower === "facebook_ads" ||
    lower === "meta" ||
    lower === "meta ads"
  )
    return "Facebook";
  if (
    lower === "google" ||
    lower === "google ads" ||
    lower === "google_ads" ||
    lower === "google_v2" ||
    lower === "adwords"
  )
    return "Google";
  if (lower === "youtube" || lower === "youtube ads") return "YouTube";
  if (lower === "tiktok" || lower === "tiktok ads") return "TikTok";
  if (lower === "instagram" || lower === "instagram ads") return "Instagram";
  if (lower === "twitter" || lower === "x" || lower === "x ads") return "Twitter / X";
  if (lower === "linkedin" || lower === "linkedin ads") return "LinkedIn";
  // Hyros tags traffic it can't tie to a paid click as "automatic" —
  // covers email, direct, and organic. "Organic" reads better than
  // the raw label.
  if (lower === "automatic" || lower === "organic" || lower === "direct")
    return "Organic";
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

// ----------------------------------------------------------------------------
// getOverview — Overview tab landing data
// ----------------------------------------------------------------------------

/**
 * Aggregate scorecard data + Overview-tab-specific extras (lead source mix,
 * action queue of stalest untouched leads). Single round-trip for the
 * KPI strip + funnel chart + action queue + source mix card.
 *
 * Returns null when the user isn't an admin (UI shows access-denied state).
 * Returns the data shape regardless of whether the team has connected GHL —
 * `totalLeads = 0` is a valid empty state until the install completes.
 */
export const getOverview = query({
  args: {
    clerkId: v.string(),
    rangeStart: v.number(),
    rangeEnd: v.number(),
  },
  handler: async (ctx, args) => {
    const user = await resolveAuthUser(ctx, args.clerkId);
    if (!user) return null;
    const teamId = user.teamId as Id<"teams">;

    const scorecard = await computeScorecard(ctx, {
      teamId,
      rangeStart: args.rangeStart,
      rangeEnd: args.rangeEnd,
    });

    // Extras specific to the Overview tab. We re-read leads here rather
    // than threading them through computeScorecard because the scorecard
    // is also used by the cron and we don't want to bloat its response.
    const leads = (await ctx.db
      .query("setterLeads")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .withIndex("by_team_and_date_added", (q: any) =>
        q
          .eq("teamId", teamId)
          .gte("dateAdded", args.rangeStart)
          .lt("dateAdded", args.rangeEnd),
      )
      .collect()) as Doc<"setterLeads">[];

    // Two independent groupings — the panel that consumes these was
    // split (booking-funnel vs ad-attribution) because they answer
    // orthogonal questions: how the lead booked vs. where their
    // traffic originated. Mixing them into one ranked list (the old
    // sourceMix shape) made both numbers misleading because a single
    // lead is usually in both buckets simultaneously.

    // 1. Booking funnel — every lead by lead.source. Top 7 + "Other"
    //    bucket. Denominator = totalLeads. Counts every lead exactly
    //    once regardless of Hyros status.
    const bookingMap = new Map<string, number>();

    // 2. Hyros ad sources — only leads with attribution resolved by
    //    Hyros (status === "found"). Grouped by platform, then nested
    //    by sourceLinkName (the specific ad/video/campaign). Denominator
    //    = attributedCount (NOT totalLeads — the panel answers "of the
    //    Hyros-attributed leads, where did they come from").
    //
    //    Wave 1 ad-outcome augmentation: each ad accumulator also tracks
    //    downstream operator outcomes (showed, closed, cash, time-to-
    //    first-dial, top objection) so the UI can render per-ad show /
    //    close / $ inline. Time-to-dial comes from the setterLead row
    //    itself (no matcher needed); the rest require a second pass via
    //    setterCloserMatcher after we know which leads are attributed.
    interface AdAccumulator {
      count: number;
      timeToDialSumMs: number;
      timeToDialN: number;
      matched: number;
      showed: number;
      closed: number;
      cashCollected: number;
      objectionCounts: Map<string, number>;
      objectionTotal: number;
    }
    const hyrosByPlatform = new Map<
      string,
      { count: number; ads: Map<string, AdAccumulator> }
    >();
    // Wave 2 routing rollups — per-(adName, operatorId) cells.
    // closerByAd indexed by closerId (string from Id<"closers">).
    // setterByAd indexed by setter's GHL user ID.
    interface RoutingCell {
      matched: number;
      showed: number;
      closed: number;
      cashCollected: number;
    }
    const closerByAd = new Map<string, Map<string, RoutingCell>>();
    const setterByAd = new Map<string, Map<string, RoutingCell>>();
    // adName → platform (for emitting alongside routing rows so the UI
    // can render the same platform context Wave 1 uses).
    const adPlatformByName = new Map<string, string>();
    let attributedCount = 0;
    // Cache of attributed leads with their (platform, adName) keys so we
    // can do the matcher lookup pass without re-deriving normalization.
    const attributedLeadsForOutcomes: Array<{
      lead: Doc<"setterLeads">;
      platform: string;
      adName: string;
    }> = [];

    for (const lead of leads) {
      bookingMap.set(
        lead.source || "Unknown",
        (bookingMap.get(lead.source || "Unknown") ?? 0) + 1,
      );

      if (
        lead.hyrosAttributionStatus === "found" &&
        lead.hyrosFirstSource?.trafficSource
      ) {
        attributedCount += 1;
        const platform = normalizeHyrosPlatform(
          lead.hyrosFirstSource.trafficSource,
        );
        const adName = lead.hyrosFirstSource.sourceLinkName ?? "Unspecified";
        const entry = hyrosByPlatform.get(platform) ?? {
          count: 0,
          ads: new Map<string, AdAccumulator>(),
        };
        entry.count += 1;
        const adAcc = entry.ads.get(adName) ?? {
          count: 0,
          timeToDialSumMs: 0,
          timeToDialN: 0,
          matched: 0,
          showed: 0,
          closed: 0,
          cashCollected: 0,
          objectionCounts: new Map<string, number>(),
          objectionTotal: 0,
        };
        adAcc.count += 1;
        if (lead.firstDialAt && lead.firstDialAt > lead.dateAdded) {
          adAcc.timeToDialSumMs += lead.firstDialAt - lead.dateAdded;
          adAcc.timeToDialN += 1;
        }
        entry.ads.set(adName, adAcc);
        hyrosByPlatform.set(platform, entry);
        adPlatformByName.set(adName, platform);
        attributedLeadsForOutcomes.push({ lead, platform, adName });
      }
    }

    // Matcher lookup pass. No date cap any more — the calls table is
    // lean post-callContent migration, so scanning is cheap regardless
    // of range size. Lookahead absorbs follow-up calls scheduled up to
    // 14 days after the lead's range.
    const CLOSER_MATCH_LOOKAHEAD_MS = 14 * 24 * 60 * 60 * 1000;
    const outcomeRangeStart = args.rangeStart;
    const outcomeRangeEnd = args.rangeEnd + CLOSER_MATCH_LOOKAHEAD_MS;

    if (attributedCount > 0) {
      try {
        const matcherIndex = await buildMatcherIndex(
          ctx,
          teamId,
          outcomeRangeStart,
          outcomeRangeEnd,
        );
        for (const entry of attributedLeadsForOutcomes) {
          const platformEntry = hyrosByPlatform.get(entry.platform);
          if (!platformEntry) continue;
          const adAcc = platformEntry.ads.get(entry.adName);
          if (!adAcc) continue;

          const matched = findCallsForLead(matcherIndex, {
            email: entry.lead.email,
            phone: entry.lead.phone,
          });
          if (matched.length === 0) continue;
          adAcc.matched += 1;
          // "Showed" = at least one settled completed call that wasn't
          // a no_show or rescheduled. Matches computeCloserSideShowRate.
          const adShowed = matched.some(
            (c) =>
              c.status === "completed" &&
              c.outcome != null &&
              c.outcome !== "no_show" &&
              c.outcome !== "rescheduled",
          );
          if (adShowed) {
            adAcc.showed += 1;
          }
          const closedCalls = matched.filter((c) => c.outcome === "closed");
          const adClosedSum = closedCalls.reduce(
            (sum, c) => sum + (c.cashCollected ?? 0),
            0,
          );
          if (closedCalls.length > 0) {
            adAcc.closed += 1;
            adAcc.cashCollected += adClosedSum;
          }

          // Wave 2 — routing rollups. Pick the most recent matched
          // call by createdAt as the representative closer. Avoids
          // splitting credit when multiple closers worked the same
          // lead; matches Wave 1's single-representative convention.
          const repCall = matched.reduce((a, b) =>
            a.createdAt >= b.createdAt ? a : b,
          );
          const repCloserId = String(repCall.closerId);
          const closerMap =
            closerByAd.get(entry.adName) ?? new Map<string, RoutingCell>();
          const closerCell = closerMap.get(repCloserId) ?? {
            matched: 0,
            showed: 0,
            closed: 0,
            cashCollected: 0,
          };
          closerCell.matched += 1;
          if (adShowed) closerCell.showed += 1;
          if (closedCalls.length > 0) {
            closerCell.closed += 1;
            closerCell.cashCollected += adClosedSum;
          }
          closerMap.set(repCloserId, closerCell);
          closerByAd.set(entry.adName, closerMap);

          // Setter rollup — indexed by the lead's qualifying setter.
          // Skipped for leads with no assignedToGhlUserId (unassigned
          // or pre-assignment-tracking leads).
          const setterGhlUserId = entry.lead.assignedToGhlUserId;
          if (setterGhlUserId) {
            const setterMap =
              setterByAd.get(entry.adName) ?? new Map<string, RoutingCell>();
            const setterCell = setterMap.get(setterGhlUserId) ?? {
              matched: 0,
              showed: 0,
              closed: 0,
              cashCollected: 0,
            };
            setterCell.matched += 1;
            if (adShowed) setterCell.showed += 1;
            // Setter cells don't track closes / cash — those are closer
            // attribution. Showing show-rate keeps the metric meaningful
            // (qualifying-stage performance).
            setterMap.set(setterGhlUserId, setterCell);
            setterByAd.set(entry.adName, setterMap);
          }
          // Top objection — only count primaryObjection on lost /
          // follow_up calls. "other" and missing values are excluded
          // from the mode so the rollup reflects real signal.
          for (const c of matched) {
            if (
              (c.outcome === "lost" || c.outcome === "follow_up") &&
              c.primaryObjection &&
              c.primaryObjection.toLowerCase() !== "other"
            ) {
              adAcc.objectionCounts.set(
                c.primaryObjection,
                (adAcc.objectionCounts.get(c.primaryObjection) ?? 0) + 1,
              );
              adAcc.objectionTotal += 1;
            }
          }
        }
      } catch (err) {
        // Belt-and-suspenders kept in place: if a future change
        // re-introduces a heavy field on calls we'd at least degrade
        // gracefully instead of crashing the whole tab.
        const msg = err instanceof Error ? err.message : String(err);
        if (!/16777216|read limit|too many bytes/i.test(msg)) {
          throw err;
        }
      }
    }

    const sortedBookings = Array.from(bookingMap.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
    const topBookings = sortedBookings.slice(0, 7);
    const otherBookingCount = sortedBookings
      .slice(7)
      .reduce((sum, r) => sum + r.count, 0);
    const bookingFunnel =
      otherBookingCount > 0
        ? [...topBookings, { name: "Other", count: otherBookingCount }]
        : topBookings;

    // Outcome thresholds. Two distinct gates because they answer
    // different questions:
    // - MIN_MATCHED_SAMPLE: how many leads from this ad have we
    //   actually called yet. Drives show% / close% / $ — denominator
    //   is matched, NOT bookings (matches computeCloserSideShowRate's
    //   convention). Skipping outcomes when matched is low avoids
    //   showing "0% show" on ads whose leads are mostly booked-but-
    //   not-yet-called (the AICom-style cohort where most bookings
    //   are recent).
    // - MIN_TIME_TO_DIAL_SAMPLE: ops metric, independent of calls.
    //   Computed from firstDialAt on the lead itself.
    // - MIN_OBJECTION_SAMPLE: stricter — surfaces the modal lost
    //   reason only when there's a real cluster.
    const MIN_MATCHED_SAMPLE = 5;
    const MIN_TIME_TO_DIAL_SAMPLE = 3;
    const MIN_OBJECTION_SAMPLE = 5;

    const hyrosAdSources = Array.from(hyrosByPlatform.entries())
      .map(([platform, { count, ads }]) => ({
        platform,
        count,
        ads: Array.from(ads.entries())
          .map(([name, acc]) => {
            const row: {
              name: string;
              count: number;
              matchedCount?: number;
              showedCount?: number;
              closedCount?: number;
              cashCollected?: number;
              avgTimeToDialMs?: number;
              topObjection?: { name: string; count: number };
            } = { name, count: acc.count };
            if (acc.matched >= MIN_MATCHED_SAMPLE) {
              row.matchedCount = acc.matched;
              row.showedCount = acc.showed;
              row.closedCount = acc.closed;
              if (acc.cashCollected > 0) row.cashCollected = acc.cashCollected;
              if (acc.objectionTotal >= MIN_OBJECTION_SAMPLE) {
                let topName: string | null = null;
                let topCount = 0;
                for (const [oname, ocount] of acc.objectionCounts.entries()) {
                  if (ocount > topCount) {
                    topName = oname;
                    topCount = ocount;
                  }
                }
                if (topName) {
                  row.topObjection = { name: topName, count: topCount };
                }
              }
            }
            // Time-to-first-dial is independent of call matching —
            // it's an ops metric driven by firstDialAt on the lead.
            // Surface separately so an ad with too few matches still
            // shows its ops timing.
            if (acc.timeToDialN >= MIN_TIME_TO_DIAL_SAMPLE) {
              row.avgTimeToDialMs = Math.round(
                acc.timeToDialSumMs / acc.timeToDialN,
              );
            }
            return row;
          })
          .sort((a, b) => b.count - a.count),
      }))
      .sort((a, b) => b.count - a.count);

    // Load setter reps early — needed by both the routing rollup
    // (Wave 2) and the action queue below.
    const reps = (await ctx.db
      .query("setterReps")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .withIndex("by_team", (q: any) => q.eq("teamId", teamId))
      .collect()) as Doc<"setterReps">[];
    const repNameByGhlUserId = new Map(reps.map((r) => [r.ghlUserId, r.name]));

    // Wave 2 — Routing performance per ad.
    // Collapse the closerByAd / setterByAd accumulators into best/worst
    // pairs per ad with sample-size gating. The MIN_AD_MATCHED_FOR_ROW
    // threshold (5) matches the existing Wave 1 outcome-line gate.
    // MIN_CELL_SAMPLE (3) gates which individual operators qualify for
    // best/worst on a given ad. If only one operator qualifies per
    // role, we emit it as a sole-performer instead of best/worst —
    // avoids the misleading "best of one" framing.
    const MIN_AD_MATCHED_FOR_ROW = 5;
    const MIN_CELL_SAMPLE = 3;

    interface RoutingPerf {
      name: string;
      matched: number;
      // role-dependent: closer uses closed/closeRate, setter uses
      // showed/showRate. Frontend reads whichever is present.
      closed?: number;
      closeRate?: number;
      showed?: number;
      showRate?: number;
    }

    // Pre-resolve closer names once per unique closerId (small set —
    // AICom has 5 active closers).
    const closerNameById = new Map<string, string>();
    const uniqueCloserIds = new Set<string>();
    for (const closerMap of closerByAd.values()) {
      for (const id of closerMap.keys()) uniqueCloserIds.add(id);
    }
    for (const id of uniqueCloserIds) {
      const closer = await ctx.db.get(id as Id<"closers">);
      closerNameById.set(id, closer?.name ?? "Unknown closer");
    }

    function resolveSetterName(ghlUserId: string): string {
      return repNameByGhlUserId.get(ghlUserId) ?? "Unknown setter";
    }

    // Deterministic tiebreaker: larger sample wins, then alphabetical
    // — keeps the rendered best/worst stable across re-fetches.
    function pickExtreme(
      qualified: RoutingPerf[],
      compare: (a: number, b: number) => number,
      rateKey: "closeRate" | "showRate",
    ): RoutingPerf | undefined {
      if (qualified.length === 0) return undefined;
      return [...qualified].sort((a, b) => {
        const rateDiff = compare(b[rateKey] ?? 0, a[rateKey] ?? 0);
        if (rateDiff !== 0) return rateDiff;
        if (b.matched !== a.matched) return b.matched - a.matched;
        return a.name.localeCompare(b.name);
      })[0];
    }

    const hyrosRoutingPerAd: Array<{
      adName: string;
      platform: string;
      matchedTotal: number;
      bestCloser?: RoutingPerf;
      worstCloser?: RoutingPerf;
      closerSpreadPp?: number;
      soleCloser?: RoutingPerf;
      bestSetter?: RoutingPerf;
      worstSetter?: RoutingPerf;
      setterSpreadPp?: number;
      soleSetter?: RoutingPerf;
    }> = [];

    // Build the per-ad rows. Iterate the union of ad keys from both
    // maps (every ad in closerByAd is also in adPlatformByName, and
    // setterByAd is a subset by construction).
    const adsToConsider = new Set<string>();
    for (const ad of closerByAd.keys()) adsToConsider.add(ad);
    for (const ad of setterByAd.keys()) adsToConsider.add(ad);

    for (const adName of adsToConsider) {
      const closerCells = closerByAd.get(adName) ?? new Map();
      const setterCells = setterByAd.get(adName) ?? new Map();

      let matchedTotal = 0;
      for (const cell of closerCells.values()) matchedTotal += cell.matched;
      if (matchedTotal < MIN_AD_MATCHED_FOR_ROW) continue;

      const closerPerfs: RoutingPerf[] = Array.from(closerCells.entries()).map(
        ([id, cell]) => ({
          name: closerNameById.get(id as string) ?? "Unknown closer",
          matched: cell.matched,
          closed: cell.closed,
          closeRate: cell.matched > 0 ? (cell.closed / cell.matched) * 100 : 0,
        }),
      );
      const setterPerfs: RoutingPerf[] = Array.from(setterCells.entries()).map(
        ([id, cell]) => ({
          name: resolveSetterName(id as string),
          matched: cell.matched,
          showed: cell.showed,
          showRate: cell.matched > 0 ? (cell.showed / cell.matched) * 100 : 0,
        }),
      );

      const qualifiedClosers = closerPerfs.filter(
        (p) => p.matched >= MIN_CELL_SAMPLE,
      );
      const qualifiedSetters = setterPerfs.filter(
        (p) => p.matched >= MIN_CELL_SAMPLE,
      );

      const row: (typeof hyrosRoutingPerAd)[number] = {
        adName,
        platform: adPlatformByName.get(adName) ?? "unknown",
        matchedTotal,
      };

      if (qualifiedClosers.length >= 2) {
        row.bestCloser = pickExtreme(
          qualifiedClosers,
          (a, b) => a - b,
          "closeRate",
        );
        row.worstCloser = pickExtreme(
          qualifiedClosers,
          (a, b) => b - a,
          "closeRate",
        );
        if (row.bestCloser && row.worstCloser) {
          row.closerSpreadPp = Math.round(
            (row.bestCloser.closeRate ?? 0) - (row.worstCloser.closeRate ?? 0),
          );
        }
      } else if (qualifiedClosers.length === 1) {
        row.soleCloser = qualifiedClosers[0];
      }

      if (qualifiedSetters.length >= 2) {
        row.bestSetter = pickExtreme(
          qualifiedSetters,
          (a, b) => a - b,
          "showRate",
        );
        row.worstSetter = pickExtreme(
          qualifiedSetters,
          (a, b) => b - a,
          "showRate",
        );
        if (row.bestSetter && row.worstSetter) {
          row.setterSpreadPp = Math.round(
            (row.bestSetter.showRate ?? 0) - (row.worstSetter.showRate ?? 0),
          );
        }
      } else if (qualifiedSetters.length === 1) {
        row.soleSetter = qualifiedSetters[0];
      }

      hyrosRoutingPerAd.push(row);
    }

    hyrosRoutingPerAd.sort((a, b) => b.matchedTotal - a.matchedTotal);

    // Count ads hidden by the threshold for the footer caption.
    let routingAdsHidden = 0;
    for (const adName of adsToConsider) {
      const closerCells = closerByAd.get(adName) ?? new Map();
      let total = 0;
      for (const cell of closerCells.values()) total += cell.matched;
      if (total > 0 && total < MIN_AD_MATCHED_FOR_ROW) routingAdsHidden += 1;
    }

    // team.hyrosEnabled drives the right panel's "not connected" empty
    // state vs "connected but no attributed leads yet" empty state.
    const team = (await ctx.db.get(teamId)) as Doc<"teams"> | null;
    const hyrosCoverage = {
      attributedCount,
      totalLeads: leads.length,
      hyrosEnabled: team?.hyrosEnabled === true,
    };

    // Action queue: top-5 untouched leads, oldest first ("stalest first
    // wins" — managers want to know what's been waiting longest).

    const actionQueue = leads
      .filter((l) => l.dialCount === 0 && l.smsOutboundCount === 0)
      .sort((a, b) => a.dateAdded - b.dateAdded)
      .slice(0, 5)
      .map((l) => ({
        leadId: l._id,
        name: l.name,
        email: l.email,
        phone: l.phone,
        dateAdded: l.dateAdded,
        assignedToName: l.assignedToGhlUserId
          ? l.assignedToName ?? repNameByGhlUserId.get(l.assignedToGhlUserId) ?? "Unassigned"
          : "Unassigned",
      }));

    // Auto-generated panel insights — the "so what" layer under each chart.
    // Pure deterministic computation over data already in hand; no extra DB
    // reads. Each helper returns null when below its sample-size gate.
    const cadenceInsight: PanelInsight | null = computeCadenceInsight(
      scorecard.perSetter
        .filter(
          (r): r is typeof r & { cadence: { avgDialsPerLead: number } } =>
            r.cadence.avgDialsPerLead != null,
        )
        .map((r) => ({
          name: r.name,
          leadsWithDials: r.cadence.leadsWithDials,
          avgDialsPerLead: r.cadence.avgDialsPerLead,
          pctLeadsThreeOrMoreAttempts: r.cadence.pctLeadsThreeOrMoreAttempts,
        })),
    );

    const bookingsInsight: PanelInsight | null = computeBookingsInsight({
      total: scorecard.bookings.total,
      byDayOfWeek: scorecard.bookings.byDayOfWeek.map((count, day) => ({
        day,
        count,
      })),
      connectionsToBookingsRate: scorecard.bookings.connectionsToBookingsRate,
      perSetter: scorecard.bookings.perSetter.map((s) => ({
        name: s.name,
        bookings: s.bookingCount,
      })),
      flowType: scorecard.bookings.flowType,
    });

    const funnelInsight: PanelInsight | null = computeFunnelInsight({
      totalLeads: scorecard.totalLeads,
      connectedLeads: scorecard.connectedLeads,
      totalAppointments: scorecard.totalAppointments,
      totalShowed: scorecard.totalShowed,
      bookingsThirdStage:
        scorecard.bookings.source !== "none" && scorecard.bookings.total > 0
          ? { count: scorecard.bookings.total }
          : null,
      // Show outcomes only exist on the setterAppointments source (GHL
      // appointment objects carry a status field). calendarEvents-sourced
      // bookings have no show data, so the third-stage drop isn't a leak.
      showsTracked: scorecard.bookings.source === "setterAppointments",
    });

    // For Hyros ad sources: flatten all ads across all platforms before passing
    // to the insight helper — it picks best/worst across the entire range.
    const flatAds = hyrosAdSources.flatMap((p) => p.ads);
    const hyrosAdSourcesInsight: PanelInsight | null = computeHyrosAdSourcesInsight(
      attributedCount,
      flatAds,
    );

    const routingInsight: PanelInsight | null = computeRoutingInsight(
      hyrosRoutingPerAd.map((r) => ({
        adName: r.adName,
        matchedTotal: r.matchedTotal,
        bestCloser: r.bestCloser
          ? { name: r.bestCloser.name, closeRate: r.bestCloser.closeRate }
          : undefined,
        worstCloser: r.worstCloser
          ? { name: r.worstCloser.name, closeRate: r.worstCloser.closeRate }
          : undefined,
        closerSpreadPp: r.closerSpreadPp,
        bestSetter: r.bestSetter
          ? { name: r.bestSetter.name, showRate: r.bestSetter.showRate }
          : undefined,
        worstSetter: r.worstSetter
          ? { name: r.worstSetter.name, showRate: r.worstSetter.showRate }
          : undefined,
        setterSpreadPp: r.setterSpreadPp,
      })),
    );

    return {
      ...scorecard,
      bookingFunnel,
      hyrosAdSources,
      hyrosCoverage,
      hyrosRoutingPerAd,
      hyrosRoutingAdsHidden: routingAdsHidden,
      actionQueue,
      // Wave 1 insight payloads — null when below sample gate.
      cadenceInsight,
      bookingsInsight,
      funnelInsight,
      hyrosAdSourcesInsight,
      routingInsight,
    };
  },
});

// ----------------------------------------------------------------------------
// getLeads — Leads tab paginated table
// ----------------------------------------------------------------------------

/**
 * Filterable, searchable lead list for the Leads tab. Filters apply in JS
 * since the candidate set per team per date range is small (typical
 * ~50 leads/day × range). Pagination is page-based since search/filter
 * combinations make cursor pagination awkward.
 */
export const getLeads = query({
  args: {
    clerkId: v.string(),
    rangeStart: v.number(),
    rangeEnd: v.number(),
    filter: v.optional(
      v.union(
        v.literal("all"),
        v.literal("preConnection"),
        v.literal("connected"),
        v.literal("untouched"),
      ),
    ),
    assignedToGhlUserId: v.optional(v.string()),
    search: v.optional(v.string()),
    page: v.optional(v.number()),
    pageSize: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await resolveAuthUser(ctx, args.clerkId);
    if (!user) return null;
    const teamId = user.teamId as Id<"teams">;

    const pageSize = clamp(args.pageSize ?? 50, 1, 200);
    const page = Math.max(1, args.page ?? 1);

    let leads = (await ctx.db
      .query("setterLeads")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .withIndex("by_team_and_date_added", (q: any) =>
        q
          .eq("teamId", teamId)
          .gte("dateAdded", args.rangeStart)
          .lt("dateAdded", args.rangeEnd),
      )
      .collect()) as Doc<"setterLeads">[];

    // Filter chain. Order matters minimally — all filters are O(n) over
    // the same array.
    if (args.filter === "preConnection") {
      leads = leads.filter((l) => !l.isConnected);
    } else if (args.filter === "connected") {
      leads = leads.filter((l) => l.isConnected);
    } else if (args.filter === "untouched") {
      leads = leads.filter((l) => l.dialCount === 0 && l.smsOutboundCount === 0);
    }

    if (args.assignedToGhlUserId) {
      leads = leads.filter((l) => l.assignedToGhlUserId === args.assignedToGhlUserId);
    }

    if (args.search) {
      const term = args.search.toLowerCase();
      leads = leads.filter(
        (l) =>
          (l.name?.toLowerCase().includes(term) ?? false) ||
          (l.email?.toLowerCase().includes(term) ?? false) ||
          (l.phone?.includes(term) ?? false),
      );
    }

    // Sort newest first — most operationally relevant order for managers
    // scanning who's just come in.
    leads.sort((a, b) => b.dateAdded - a.dateAdded);

    const total = leads.length;
    const items = leads.slice((page - 1) * pageSize, page * pageSize);

    // Hydrate assignedToName for any leads where the snapshot field is
    // missing (rare — happens when Contact.Create webhook arrived
    // before the rep was synced).
    const reps = (await ctx.db
      .query("setterReps")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .withIndex("by_team", (q: any) => q.eq("teamId", teamId))
      .collect()) as Doc<"setterReps">[];
    const repNameByGhlUserId = new Map(reps.map((r) => [r.ghlUserId, r.name]));

    return {
      items: items.map((l) => ({
        leadId: l._id,
        ghlContactId: l.ghlContactId,
        name: l.name,
        email: l.email,
        phone: l.phone,
        dateAdded: l.dateAdded,
        dialCount: l.dialCount,
        firstDialAt: l.firstDialAt,
        smsStatus: l.smsStatus,
        isConnected: l.isConnected,
        connectedAt: l.connectedAt,
        assignedToGhlUserId: l.assignedToGhlUserId,
        assignedToName: l.assignedToGhlUserId
          ? l.assignedToName ?? repNameByGhlUserId.get(l.assignedToGhlUserId)
          : undefined,
        lastActivityAt: l.lastActivityAt,
        source: l.source,
        tags: l.tags,
      })),
      total,
      page,
      pageSize,
      hasMore: total > page * pageSize,
    };
  },
});

// ----------------------------------------------------------------------------
// getLeadActivity — drilldown panel for one lead
// ----------------------------------------------------------------------------

/**
 * Full lead detail + recent event log for the Leads-tab drilldown.
 * Returns null if the lead doesn't belong to the caller's team
 * (defense-in-depth — the leadId arg is from the URL and shouldn't be
 * trusted to belong to the right team without checking).
 */
export const getLeadActivity = query({
  args: { clerkId: v.string(), leadId: v.id("setterLeads") },
  handler: async (ctx, args) => {
    const user = await resolveAuthUser(ctx, args.clerkId);
    if (!user) return null;
    const teamId = user.teamId as Id<"teams">;

    const lead = (await ctx.db.get(args.leadId)) as Doc<"setterLeads"> | null;
    if (!lead || lead.teamId !== teamId) return null;

    // Most recent 100 events. The drilldown panel displays them in a
    // timeline; older history is rarely useful at-a-glance.
    const events = (await ctx.db
      .query("setterLeadEvents")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .withIndex("by_team_and_contact", (q: any) =>
        q.eq("teamId", teamId).eq("ghlContactId", lead.ghlContactId),
      )
      .order("desc")
      .take(100)) as Doc<"setterLeadEvents">[];

    // Hydrate setter name for each event.
    const setterIds = new Set(
      events.map((e) => e.ghlUserId).filter((id): id is string => !!id),
    );
    const reps = (await ctx.db
      .query("setterReps")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .withIndex("by_team", (q: any) => q.eq("teamId", teamId))
      .collect()) as Doc<"setterReps">[];
    const repNameByGhlUserId = new Map(reps.map((r) => [r.ghlUserId, r.name]));

    // Look up transcripts for this lead's calls so the activity timeline
    // can show summary + talk ratio on each dial without a per-row
    // additional query. We fetch by (teamId, ghlContactId) which covers
    // every call on this lead. We DON'T include the full transcriptJson
    // — that's served separately via getCallTranscript when the user
    // clicks "Show full transcript" — payload size matters.
    const transcripts = (await ctx.db
      .query("setterCallTranscripts")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .withIndex("by_team_and_contact_and_time", (q: any) =>
        q.eq("teamId", teamId).eq("ghlContactId", lead.ghlContactId),
      )
      .collect()) as Doc<"setterCallTranscripts">[];
    const transcriptByMessageId = new Map(
      transcripts.map((t) => [t.ghlMessageId, t]),
    );

    return {
      lead: {
        leadId: lead._id,
        ghlContactId: lead.ghlContactId,
        name: lead.name,
        email: lead.email,
        phone: lead.phone,
        dateAdded: lead.dateAdded,
        source: lead.source,
        tags: lead.tags,
        assignedToName: lead.assignedToGhlUserId
          ? lead.assignedToName ?? repNameByGhlUserId.get(lead.assignedToGhlUserId)
          : undefined,
        dialCount: lead.dialCount,
        firstDialAt: lead.firstDialAt,
        lastDialAt: lead.lastDialAt,
        smsOutboundCount: lead.smsOutboundCount,
        smsInboundCount: lead.smsInboundCount,
        smsStatus: lead.smsStatus,
        isConnected: lead.isConnected,
        connectedAt: lead.connectedAt,
        connectedCallDurationSec: lead.connectedCallDurationSec,
        lastActivityAt: lead.lastActivityAt,
      },
      events: events.map((e) => {
        const messageId = e.ghlEventKey?.startsWith("msg:")
          ? e.ghlEventKey.slice(4)
          : null;
        const transcript = messageId
          ? transcriptByMessageId.get(messageId)
          : null;
        return {
          eventId: e._id,
          eventType: e.eventType,
          occurredAt: e.occurredAt,
          ghlUserId: e.ghlUserId,
          setterName: e.ghlUserId ? repNameByGhlUserId.get(e.ghlUserId) : undefined,
          details: e.details,
          transcript: transcript
            ? {
                transcriptRowId: transcript._id,
                status: transcript.transcriptionStatus,
                aiSummary: transcript.aiSummary,
                setterTalkTimeSec: transcript.setterTalkTimeSec,
                prospectTalkTimeSec: transcript.prospectTalkTimeSec,
                setterSpeakerIndex: transcript.setterSpeakerIndex,
                hasFullTranscript:
                  transcript.transcriptionStatus === "available",
              }
            : null,
        };
      }),
      setterIdsCount: setterIds.size,
    };
  },
});

// ----------------------------------------------------------------------------
// getMySettings — Settings tab populator
// ----------------------------------------------------------------------------

/**
 * Returns everything the Settings tab needs: GHL connection status,
 * scorecard config, connection threshold. Single query instead of
 * three separate ones — Settings tab does one read on mount.
 *
 * Note: getMyInstallationStatus already exists in setterGhlOauth.ts;
 * the Settings UI will use both queries together (this one for non-
 * connection-specific state, that one for the connection status card).
 */
export const getMySettings = query({
  args: { clerkId: v.string() },
  handler: async (ctx, args) => {
    const user = await resolveAuthUser(ctx, args.clerkId);
    if (!user) return null;
    const teamId = user.teamId as Id<"teams">;

    const team = (await ctx.db.get(teamId)) as Doc<"teams"> | null;
    if (!team) return null;

    return {
      // Master toggle (admin override). undefined = visible (default).
      setterDataEnabled: team.setterDataEnabled,
      // Connection threshold for "what counts as a connection". Default 60.
      setterConnectionThresholdSec: team.setterConnectionThresholdSec ?? 60,
      // Scorecard config. Mirrors the field shape on the team table.
      scorecard: {
        enabled: team.setterDailyScorecardEnabled ?? false,
        channel: team.setterDailyScorecardChannel,
        slackChannelId: team.setterDailyScorecardSlackChannelId,
        slackChannelName: team.setterDailyScorecardSlackChannelName,
        discordWebhookUrl: team.setterDailyScorecardDiscordWebhookUrl,
        hourLocal: team.setterDailyScorecardHourLocal,
      },
      // Untouched-lead alert config (Phase 2). Off by default.
      untouchedAlert: {
        enabled: team.setterUntouchedAlertEnabled ?? false,
        thresholdMinutes: team.setterUntouchedAlertThresholdMinutes,
        channel: team.setterUntouchedAlertChannel,
        slackChannelId: team.setterUntouchedAlertSlackChannelId,
        slackChannelName: team.setterUntouchedAlertSlackChannelName,
        discordWebhookUrl: team.setterUntouchedAlertDiscordWebhookUrl,
      },
      // Disposition sync toggle (Phase 3c). When true AND a setterGhl
      // installation exists, post-call disposition routes via OAuth
      // tokens instead of the legacy api-key path.
      dispositionSync: {
        enabled: team.setterDispositionSyncEnabled ?? false,
      },
      // Dashboard Phase 1 — per-lead speed-to-lead ping config. Off by
      // default; opt-in per team.
      speedToLead: {
        enabled: team.setterSpeedToLeadEnabled ?? false,
        channel: team.setterSpeedToLeadChannel,
        slackChannelId: team.setterSpeedToLeadSlackChannelId,
        slackChannelName: team.setterSpeedToLeadSlackChannelName,
        discordWebhookUrl: team.setterSpeedToLeadDiscordWebhookUrl,
        slowThresholdMinutes:
          team.setterSpeedToLeadSlowThresholdMs !== undefined
            ? Math.round(team.setterSpeedToLeadSlowThresholdMs / 60000)
            : undefined,
      },
      // Dashboard Phase 3 — daily coverage-gap digest config. Off by default.
      coverageGap: {
        enabled: team.setterCoverageGapEnabled ?? false,
        channel: team.setterCoverageGapChannel,
        slackChannelId: team.setterCoverageGapSlackChannelId,
        slackChannelName: team.setterCoverageGapSlackChannelName,
        discordWebhookUrl: team.setterCoverageGapDiscordWebhookUrl,
        hourLocal: team.setterCoverageGapHourLocal,
        minLeads: team.setterCoverageGapMinLeadsThreshold,
      },
      // Team timezone (read-only here — set elsewhere in account settings).
      timezone: team.timezone,
      // Phase 2 — Setter Scorecard team-level overlay config.
      scorecardConfig: {
        cadenceDefault: team.setterCadenceDefault === "B" ? "B" : "A",
        dialsPerDayTarget: team.setterDialsPerDayTarget ?? 150,
        contactsPerDayTarget:
          team.setterContactsPerDayTarget ??
          (team.setterCadenceDefault === "B" ? 25 : 12.5),
        setRateTarget: team.setterSetRateTarget ?? 15,
        typicalDealValue: team.setterTypicalDealValue ?? null,
      },
      // Phase 1 — Closer ROI / Meta Ads connection state.
      // Drives the Meta Ads card on the Settings tab. We don't return
      // the encrypted token; only the metadata needed to render state.
      metaAds: {
        connected: !!team.metaAdsAccessToken && !!team.metaAdsAdAccountId,
        adAccountId: team.metaAdsAdAccountId ?? null,
        connectedAt: team.metaAdsConnectedAt ?? null,
        tokenExpiresAt: team.metaAdsTokenExpiresAt ?? null,
        lastSyncedAt: team.metaAdsLastSyncedAt ?? null,
        lastSyncError: team.metaAdsLastSyncError ?? null,
      },
    };
  },
});

// ----------------------------------------------------------------------------
// getPipelineStageDistribution — Phase 3 pipeline funnel on Overview tab
// ----------------------------------------------------------------------------

/**
 * Returns each pipeline's stages with the current count of open
 * opportunities in each. Powers the Pipeline Funnel chart on Overview.
 *
 * "Current" means: opportunities with status="open" right now,
 * regardless of when they entered. Won/lost/abandoned are excluded
 * since they've left the active pipeline.
 *
 * Date-range-bounded "stage transitions in the last X days" is a
 * separate metric that the Trends/per-setter views can use later;
 * this query intentionally keeps the funnel simple — current-state
 * snapshot only.
 */
export const getPipelineStageDistribution = query({
  args: { clerkId: v.string() },
  handler: async (ctx, args) => {
    const user = await resolveAuthUser(ctx, args.clerkId);
    if (!user) return null;
    const teamId = user.teamId as Id<"teams">;

    const pipelines = (await ctx.db
      .query("setterPipelines")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .withIndex("by_team", (q: any) => q.eq("teamId", teamId))
      .collect()) as Doc<"setterPipelines">[];

    if (pipelines.length === 0) return [];

    // Pull all opportunities for this team. Typical org has hundreds,
    // not thousands; full collect is fine. If we ever need to scale,
    // add a per-pipeline by_team_and_pipeline_and_status index.
    const opps = (await ctx.db
      .query("setterOpportunities")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .withIndex("by_team", (q: any) => q.eq("teamId", teamId))
      .collect()) as Doc<"setterOpportunities">[];

    return pipelines
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((pipeline) => {
        // Count opportunities per stage, open status only.
        const counts = new Map<string, number>();
        let totalOpen = 0;
        let totalValue = 0;
        for (const opp of opps) {
          if (opp.ghlPipelineId !== pipeline.ghlPipelineId) continue;
          if (opp.status !== "open") continue;
          totalOpen += 1;
          if (typeof opp.monetaryValue === "number") {
            totalValue += opp.monetaryValue;
          }
          counts.set(opp.ghlStageId, (counts.get(opp.ghlStageId) ?? 0) + 1);
        }

        const stages = pipeline.stages
          .slice()
          .sort((a, b) => a.position - b.position)
          .map((s) => ({
            ghlStageId: s.ghlStageId,
            name: s.name,
            position: s.position,
            count: counts.get(s.ghlStageId) ?? 0,
          }));

        return {
          ghlPipelineId: pipeline.ghlPipelineId,
          name: pipeline.name,
          totalOpen,
          totalValue,
          stages,
        };
      });
  },
});

// ----------------------------------------------------------------------------
// getReps — used by Leads-tab "Filter by setter" dropdown
// ----------------------------------------------------------------------------

// ----------------------------------------------------------------------------
// getSetterDetail — Setters tab drilldown panel (Phase 2)
// ----------------------------------------------------------------------------

/**
 * Per-setter drilldown for the Setters tab. Returns the setter's
 * scorecard row, their recent leads, their recent appointments, and
 * recent dial activity in the date range. The drilldown UI renders
 * this as a side panel when a leaderboard row is clicked.
 */
export const getSetterDetail = query({
  args: {
    clerkId: v.string(),
    ghlUserId: v.string(),
    rangeStart: v.number(),
    rangeEnd: v.number(),
  },
  handler: async (ctx, args) => {
    const user = await resolveAuthUser(ctx, args.clerkId);
    if (!user) return null;
    const teamId = user.teamId as Id<"teams">;

    // Setter identity. We allow null here — historical activity
    // attributed to a since-removed GHL user still resolves.
    const rep = (await ctx.db
      .query("setterReps")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .withIndex("by_team_and_ghl_user_id", (q: any) =>
        q.eq("teamId", teamId).eq("ghlUserId", args.ghlUserId),
      )
      .first()) as Doc<"setterReps"> | null;

    // Reuse the scorecard helper, then pluck out this setter's row.
    const scorecard = await computeScorecard(ctx, {
      teamId,
      rangeStart: args.rangeStart,
      rangeEnd: args.rangeEnd,
    });
    const myRow =
      scorecard.perSetter.find((r) => r.ghlUserId === args.ghlUserId) ?? null;

    // Leads assigned to this setter in the date range.
    const leads = (await ctx.db
      .query("setterLeads")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .withIndex("by_team_and_assigned", (q: any) =>
        q.eq("teamId", teamId).eq("assignedToGhlUserId", args.ghlUserId),
      )
      .collect()) as Doc<"setterLeads">[];
    const leadsInRange = leads
      .filter(
        (l) => l.dateAdded >= args.rangeStart && l.dateAdded < args.rangeEnd,
      )
      .sort((a, b) => b.dateAdded - a.dateAdded)
      .slice(0, 50);

    // Appointments booked by this setter in the date range.
    const appts = (await ctx.db
      .query("setterAppointments")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .withIndex("by_team_and_setter", (q: any) =>
        q.eq("teamId", teamId).eq("bookedByGhlUserId", args.ghlUserId),
      )
      .collect()) as Doc<"setterAppointments">[];
    const apptsInRange = appts
      .filter((a) => a.bookedAt >= args.rangeStart && a.bookedAt < args.rangeEnd)
      .sort((a, b) => b.bookedAt - a.bookedAt)
      .slice(0, 50);

    // ALL dial events by this setter — used by the heatmap (which buckets
    // them by team-tz day-of-week × hour-of-day) and the timeline (most
    // recent 100). Capped at 5000 to keep a single query response under
    // Convex's payload limit even for very high-volume setters.
    const eventsAll = (await ctx.db
      .query("setterLeadEvents")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .withIndex("by_team_and_setter_and_time", (q: any) =>
        q
          .eq("teamId", teamId)
          .eq("ghlUserId", args.ghlUserId)
          .gte("occurredAt", args.rangeStart)
          .lt("occurredAt", args.rangeEnd),
      )
      .order("desc")
      .take(5000)) as Doc<"setterLeadEvents">[];

    // Look up team timezone for heatmap bucketing. Falls back to
    // America/New_York to match the daily-scorecard cron's default.
    const team = (await ctx.db.get(teamId)) as Doc<"teams"> | null;
    const timezone = team?.timezone || "America/New_York";

    // 7×24 grid of dial-outbound counts. Bucketed in team timezone so
    // "9-10am Mon" means 9-10am in the team's local clock, not UTC.
    const heatmap = bucketDialEventsByDayHour(eventsAll, timezone);

    // Per-source breakdown for this setter's leads in range. Lets the
    // drilldown answer "this setter is great with referrals but
    // terrible with cold inbound" type questions.
    const sourceMix = computeSourceMixForLeads(leadsInRange);

    return {
      setter: rep
        ? {
            ghlUserId: rep.ghlUserId,
            name: rep.name,
            email: rep.email,
            phone: rep.phone,
            isActive: rep.isActive,
          }
        : { ghlUserId: args.ghlUserId, name: "Unknown setter" },
      scorecardRow: myRow,
      timezone,
      heatmap,
      sourceMix,
      leads: leadsInRange.map((l) => ({
        leadId: l._id,
        ghlContactId: l.ghlContactId,
        name: l.name,
        email: l.email,
        phone: l.phone,
        dateAdded: l.dateAdded,
        dialCount: l.dialCount,
        firstDialAt: l.firstDialAt,
        isConnected: l.isConnected,
        appointmentCount: l.appointmentCount,
        showedCount: l.showedCount,
      })),
      appointments: apptsInRange.map((a) => ({
        appointmentId: a._id,
        ghlAppointmentId: a.ghlAppointmentId,
        ghlContactId: a.ghlContactId,
        startTime: a.startTime,
        status: a.status,
        bookedAt: a.bookedAt,
      })),
      events: await Promise.all(
        eventsAll.slice(0, 100).map(async (e) => {
          const messageId = e.ghlEventKey?.startsWith("msg:")
            ? e.ghlEventKey.slice(4)
            : null;
          const transcript = messageId
            ? ((await ctx.db
                .query("setterCallTranscripts")
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                .withIndex("by_team_and_message", (q: any) =>
                  q.eq("teamId", teamId).eq("ghlMessageId", messageId),
                )
                .first()) as Doc<"setterCallTranscripts"> | null)
            : null;
          return {
            eventId: e._id,
            eventType: e.eventType,
            occurredAt: e.occurredAt,
            ghlContactId: e.ghlContactId,
            details: e.details,
            transcript: transcript
              ? {
                  transcriptRowId: transcript._id,
                  status: transcript.transcriptionStatus,
                  aiSummary: transcript.aiSummary,
                  setterTalkTimeSec: transcript.setterTalkTimeSec,
                  prospectTalkTimeSec: transcript.prospectTalkTimeSec,
                  setterSpeakerIndex: transcript.setterSpeakerIndex,
                  hasFullTranscript:
                    transcript.transcriptionStatus === "available",
                }
              : null,
          };
        }),
      ),
    };
  },
});

// ----------------------------------------------------------------------------
// Helpers used by getSetterDetail (kept private to this file)
// ----------------------------------------------------------------------------

/**
 * Bucket dial-outbound events into a 7×24 grid in the given IANA
 * timezone. Index 0 = Sunday so the rendered grid follows the standard
 * week-starts-Sunday convention managers expect.
 */
function bucketDialEventsByDayHour(
  events: Array<{ occurredAt: number; eventType: string }>,
  timezone: string,
): number[][] {
  const grid: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
  const dowMap: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };
  for (const ev of events) {
    if (ev.eventType !== "dial_outbound") continue;
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      weekday: "short",
      hour: "2-digit",
      hour12: false,
    }).formatToParts(new Date(ev.occurredAt));
    const weekday = parts.find((p) => p.type === "weekday")?.value ?? "Mon";
    const hourStr = parts.find((p) => p.type === "hour")?.value ?? "0";
    // Intl with hour12=false sometimes returns "24" at midnight.
    const hour = parseInt(hourStr, 10) % 24;
    const dow = dowMap[weekday];
    if (dow !== undefined) grid[dow][hour]++;
  }
  return grid;
}

/**
 * Compute per-source aggregates for a list of leads. Returns top 10
 * sources by lead count, with connect rate per source. Phase 3 — the
 * Setters drilldown surfaces "this setter is best with [source]" by
 * eyeballing this list.
 */
function computeSourceMixForLeads(
  leads: Array<{
    source?: string;
    isConnected: boolean;
    appointmentCount: number;
    showedCount: number;
  }>,
): Array<{
  source: string;
  leadCount: number;
  connectedCount: number;
  appointmentCount: number;
  showedCount: number;
  connectRate: number | null;
}> {
  const map = new Map<
    string,
    {
      leadCount: number;
      connectedCount: number;
      appointmentCount: number;
      showedCount: number;
    }
  >();
  for (const lead of leads) {
    const source = lead.source || "Unknown";
    const entry = map.get(source) ?? {
      leadCount: 0,
      connectedCount: 0,
      appointmentCount: 0,
      showedCount: 0,
    };
    entry.leadCount += 1;
    if (lead.isConnected) entry.connectedCount += 1;
    entry.appointmentCount += lead.appointmentCount;
    entry.showedCount += lead.showedCount;
    map.set(source, entry);
  }
  return Array.from(map.entries())
    .map(([source, data]) => ({
      source,
      ...data,
      connectRate:
        data.leadCount > 0 ? data.connectedCount / data.leadCount : null,
    }))
    .sort((a, b) => b.leadCount - a.leadCount)
    .slice(0, 10);
}

export const getReps = query({
  args: { clerkId: v.string() },
  handler: async (ctx, args) => {
    const user = await resolveAuthUser(ctx, args.clerkId);
    if (!user) return [];
    const teamId = user.teamId as Id<"teams">;

    const reps = (await ctx.db
      .query("setterReps")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .withIndex("by_team", (q: any) => q.eq("teamId", teamId))
      .collect()) as Doc<"setterReps">[];

    return reps
      .filter((r) => r.isActive)
      .map((r) => ({
        ghlUserId: r.ghlUserId,
        name: r.name,
        email: r.email,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  },
});

// ----------------------------------------------------------------------------
// Lead-age decay curve — connect rate by speed-to-lead bucket
// ----------------------------------------------------------------------------

// Fixed buckets — chosen to give visual density in the 0–60min window where
// the steepest decay happens, then coarser bins for the long tail.
const DECAY_BUCKETS: Array<{ label: string; minMs: number; maxMs: number }> = [
  { label: "<1m",    minMs: 0,                      maxMs: 60_000 },
  { label: "1-5m",   minMs: 60_000,                 maxMs: 5 * 60_000 },
  { label: "5-15m",  minMs: 5 * 60_000,             maxMs: 15 * 60_000 },
  { label: "15-60m", minMs: 15 * 60_000,            maxMs: 60 * 60_000 },
  { label: "1-4h",   minMs: 60 * 60_000,            maxMs: 4 * 60 * 60_000 },
  { label: "4-24h",  minMs: 4 * 60 * 60_000,        maxMs: 24 * 60 * 60_000 },
  { label: "1-3d",   minMs: 24 * 60 * 60_000,       maxMs: 3 * 24 * 60 * 60_000 },
  { label: ">3d",    minMs: 3 * 24 * 60 * 60_000,   maxMs: Number.POSITIVE_INFINITY },
];

const MAX_DECAY_RANGE_MS = 90 * 24 * 60 * 60_000;
// Outliers: a lead "re-engaged" months/years after creation skews the curve.
// Drop anything where speedMs > 30d from the aggregation (and exclude that
// row from totalLeads too — it's data hygiene, not a measurement).
const DECAY_SPEED_OUTLIER_MS = 30 * 24 * 60 * 60_000;

export function pickDecayBucketLabel(speedMs: number): string | null {
  if (!Number.isFinite(speedMs) || speedMs < 0) return null;
  for (const b of DECAY_BUCKETS) {
    if (speedMs >= b.minMs && speedMs < b.maxMs) return b.label;
  }
  return null;
}

async function computeDecayCurve(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ctx: { db: any },
  teamId: Id<"teams">,
  rangeStart: number,
  rangeEnd: number,
) {
  // Server-side clamp — protects against a manager picking a 6-month range
  // on a high-volume team and blowing the 16 MiB read limit.
  const effectiveStart = Math.max(rangeStart, rangeEnd - MAX_DECAY_RANGE_MS);

  const leads = (await ctx.db
    .query("setterLeads")
    .withIndex("by_team_and_date_added", (q: any) =>
      q.eq("teamId", teamId).gte("dateAdded", effectiveStart).lt("dateAdded", rangeEnd),
    )
    .collect()) as Doc<"setterLeads">[];

  const bucketRows = DECAY_BUCKETS.map((b) => ({
    label: b.label,
    minMs: b.minMs,
    // Replace Infinity with null for JSON cleanliness on the wire
    maxMs: Number.isFinite(b.maxMs) ? b.maxMs : null,
    leadCount: 0,
    connectedCount: 0,
    rate: 0,
  }));
  const speeds: number[] = [];

  for (const lead of leads) {
    if (lead.firstDialAt == null) continue;
    const speedMs = lead.firstDialAt - lead.dateAdded;
    if (speedMs < 0) continue;                              // dial-before-create race; ignore
    if (speedMs > DECAY_SPEED_OUTLIER_MS) continue;         // re-engaged old lead; outlier
    const idx = DECAY_BUCKETS.findIndex(
      (b) => speedMs >= b.minMs && speedMs < b.maxMs,
    );
    if (idx === -1) continue;
    bucketRows[idx].leadCount += 1;
    if (lead.isConnected) bucketRows[idx].connectedCount += 1;
    speeds.push(speedMs);
  }

  for (const b of bucketRows) {
    b.rate = b.leadCount > 0 ? b.connectedCount / b.leadCount : 0;
  }

  speeds.sort((a, b) => a - b);
  const medianSpeedMs =
    speeds.length > 0 ? speeds[Math.floor(speeds.length * 0.5)] : null;
  const p90SpeedMs =
    speeds.length > 0 ? speeds[Math.floor(speeds.length * 0.9)] : null;

  const insight = computeDecayInsight(
    bucketRows.map((b) => ({
      label: b.label,
      leadCount: b.leadCount,
      connectedCount: b.connectedCount,
      rate: b.rate,
    })),
    speeds.length,
  );

  return {
    buckets: bucketRows,
    medianSpeedMs,
    p90SpeedMs,
    totalLeads: speeds.length,
    rangeClampedTo90Days: effectiveStart > rangeStart,
    insight,
  };
}

/**
 * Public query — feeds the LeadAgeDecayCurve panel on the Overview tab.
 * Returns the speed-to-lead bucket histogram + median/p90 for the team's
 * leads created in the date range. Range capped server-side at 90 days
 * to keep the read bounded for high-volume teams.
 */
export const getLeadAgeDecayCurve = query({
  args: {
    clerkId: v.string(),
    rangeStart: v.number(),
    rangeEnd: v.number(),
  },
  handler: async (ctx, args) => {
    const user = await resolveAuthUser(ctx, args.clerkId);
    if (!user) return null;
    return computeDecayCurve(
      ctx,
      user.teamId as Id<"teams">,
      args.rangeStart,
      args.rangeEnd,
    );
  },
});

/**
 * Internal variant — same logic, takes teamId directly (no clerkId auth).
 * Used by sendSpeedToLeadNotification in setterDataNotifications to look
 * up the team's historical decay rate when building the per-lead Slack ping.
 */
export const getLeadAgeDecayCurveInternal = internalQuery({
  args: {
    teamId: v.id("teams"),
    rangeStart: v.number(),
    rangeEnd: v.number(),
  },
  handler: async (ctx, args) => {
    return computeDecayCurve(ctx, args.teamId, args.rangeStart, args.rangeEnd);
  },
});

// ----------------------------------------------------------------------------
// Best-time-to-call heatmap — 7×24 grid of connect rate by hour-of-day +
// day-of-week. Universal-signal (no GHL appointment data needed).
// ----------------------------------------------------------------------------

const HEATMAP_MAX_RANGE_MS = 30 * 24 * 60 * 60_000;
const HEATMAP_EVENT_TAKE = 50_000;
const HEATMAP_MIN_DIALS_FOR_RATE = 5;

interface HeatmapCell {
  dialCount: number;
  connectedCount: number;
  rate: number | null;
}

function emptyHeatmapGrid(): HeatmapCell[][] {
  return Array.from({ length: 7 }, () =>
    Array.from({ length: 24 }, () => ({
      dialCount: 0,
      connectedCount: 0,
      rate: null as number | null,
    })),
  );
}

const DOW_MAP: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
};

function bucketLocal(
  ts: number,
  timezone: string,
): { dow: number; hour: number } | null {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(new Date(ts));
  const weekday = parts.find((p) => p.type === "weekday")?.value ?? "Mon";
  const hourStr = parts.find((p) => p.type === "hour")?.value ?? "0";
  const hour = parseInt(hourStr, 10) % 24;
  const dow = DOW_MAP[weekday];
  if (dow === undefined) return null;
  return { dow, hour };
}

export const getBestTimeToCallHeatmap = query({
  args: {
    clerkId: v.string(),
    rangeStart: v.number(),
    rangeEnd: v.number(),
  },
  handler: async (ctx, args) => {
    const user = await resolveAuthUser(ctx, args.clerkId);
    if (!user) return null;
    const teamId = user.teamId as Id<"teams">;
    const team = (await ctx.db.get(teamId)) as Doc<"teams"> | null;
    const timezone = team?.timezone || "America/New_York";

    const requestedStart = args.rangeStart;
    const effectiveStart = Math.max(
      requestedStart,
      args.rangeEnd - HEATMAP_MAX_RANGE_MS,
    );
    const rangeClampedTo30Days = effectiveStart > requestedStart;

    // Fetch dial + connected events in parallel using the type-and-time index.
    // Each query is bounded by HEATMAP_EVENT_TAKE; we surface sampleCapHit so
    // the UI can show a "trimmed" warning if a high-volume team blows the cap.
    const [dials, connects] = await Promise.all([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ctx.db
        .query("setterLeadEvents")
        .withIndex("by_team_and_type_and_time", (q: any) =>
          q
            .eq("teamId", teamId)
            .eq("eventType", "dial_outbound")
            .gte("occurredAt", effectiveStart)
            .lt("occurredAt", args.rangeEnd),
        )
        .take(HEATMAP_EVENT_TAKE),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ctx.db
        .query("setterLeadEvents")
        .withIndex("by_team_and_type_and_time", (q: any) =>
          q
            .eq("teamId", teamId)
            .eq("eventType", "connected")
            .gte("occurredAt", effectiveStart)
            .lt("occurredAt", args.rangeEnd),
        )
        .take(HEATMAP_EVENT_TAKE),
    ]);

    const grid = emptyHeatmapGrid();
    for (const ev of dials as Array<{ occurredAt: number }>) {
      const b = bucketLocal(ev.occurredAt, timezone);
      if (!b) continue;
      grid[b.dow][b.hour].dialCount += 1;
    }
    for (const ev of connects as Array<{ occurredAt: number }>) {
      const b = bucketLocal(ev.occurredAt, timezone);
      if (!b) continue;
      grid[b.dow][b.hour].connectedCount += 1;
    }
    for (let d = 0; d < 7; d++) {
      for (let h = 0; h < 24; h++) {
        const cell = grid[d][h];
        cell.rate =
          cell.dialCount >= HEATMAP_MIN_DIALS_FOR_RATE
            ? cell.connectedCount / cell.dialCount
            : null;
      }
    }

    // Flatten the 7×24 grid into the {day,hour,dials,connects} shape the
    // insight helper expects.
    const flatCells = grid.flatMap((row, day) =>
      row.map((cell, hour) => ({
        day,
        hour,
        dials: cell.dialCount,
        connects: cell.connectedCount,
      })),
    );
    const insight = computeHeatmapInsight(
      flatCells,
      dials.length,
      connects.length,
    );

    return {
      grid,
      timezone,
      totalDials: dials.length,
      totalConnects: connects.length,
      rangeClampedTo30Days,
      sampleCapHit:
        dials.length === HEATMAP_EVENT_TAKE ||
        connects.length === HEATMAP_EVENT_TAKE,
      insight,
    };
  },
});

// ----------------------------------------------------------------------------
// Dashboard Phase 3 — Connect-rate anomaly detection
// ----------------------------------------------------------------------------

const ANOMALY_THIS_WEEK_MS = 7 * 24 * 60 * 60_000;
const ANOMALY_BASELINE_WEEKS = 4;
const ANOMALY_BASELINE_MS = ANOMALY_BASELINE_WEEKS * ANOMALY_THIS_WEEK_MS;
// Sample-size floors prevent false positives on low-volume weeks.
const ANOMALY_MIN_THIS_WEEK_DIALS = 50;
const ANOMALY_MIN_BASELINE_DIALS = 200;
// Significance threshold — a drop is only flagged when this severe.
const ANOMALY_RELATIVE_DROP_THRESHOLD = 0.30;
const ANOMALY_TOP_CONTRIBUTORS_N = 3;

interface ConnectRateAnomaly {
  thisWeekRate: number;
  baselineRate: number;
  relativeDropPct: number;
  absoluteDropPts: number;
  thisWeekDials: number;
  baselineDials: number;
  topContributors: Array<{
    ghlUserId: string;
    name: string;
    thisWeekRate: number | null;
    baselineRate: number | null;
    dropPts: number;
  }>;
}

export const getConnectRateAnomaly = query({
  args: { clerkId: v.string() },
  handler: async (ctx, args): Promise<ConnectRateAnomaly | null> => {
    const user = await resolveAuthUser(ctx, args.clerkId);
    if (!user) return null;
    const teamId = user.teamId as Id<"teams">;

    const now = Date.now();
    const thisWeekStart = now - ANOMALY_THIS_WEEK_MS;
    const baselineStart = now - ANOMALY_THIS_WEEK_MS - ANOMALY_BASELINE_MS;
    const baselineEnd = thisWeekStart;

    // Pull dial + connected events for the full 5-week window in a single
    // pass per event type — cheaper than two separate queries.
    const fullWindowStart = baselineStart;
    const [allDials, allConnects] = await Promise.all([
      ctx.db
        .query("setterLeadEvents")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .withIndex("by_team_and_type_and_time", (q: any) =>
          q
            .eq("teamId", teamId)
            .eq("eventType", "dial_outbound")
            .gte("occurredAt", fullWindowStart)
            .lt("occurredAt", now),
        )
        .take(50_000),
      ctx.db
        .query("setterLeadEvents")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .withIndex("by_team_and_type_and_time", (q: any) =>
          q
            .eq("teamId", teamId)
            .eq("eventType", "connected")
            .gte("occurredAt", fullWindowStart)
            .lt("occurredAt", now),
        )
        .take(50_000),
    ]);

    let thisWeekDials = 0;
    let thisWeekConnects = 0;
    let baselineDials = 0;
    let baselineConnects = 0;
    const setterStats = new Map<
      string,
      { tDials: number; tConnects: number; bDials: number; bConnects: number }
    >();
    function ensureSetter(id: string) {
      let s = setterStats.get(id);
      if (!s) {
        s = { tDials: 0, tConnects: 0, bDials: 0, bConnects: 0 };
        setterStats.set(id, s);
      }
      return s;
    }

    for (const ev of allDials as Array<{
      occurredAt: number;
      ghlUserId?: string;
    }>) {
      const isThisWeek = ev.occurredAt >= thisWeekStart;
      const isBaseline =
        ev.occurredAt >= baselineStart && ev.occurredAt < baselineEnd;
      if (isThisWeek) thisWeekDials += 1;
      else if (isBaseline) baselineDials += 1;
      if (ev.ghlUserId) {
        const s = ensureSetter(ev.ghlUserId);
        if (isThisWeek) s.tDials += 1;
        else if (isBaseline) s.bDials += 1;
      }
    }
    for (const ev of allConnects as Array<{
      occurredAt: number;
      ghlUserId?: string;
    }>) {
      const isThisWeek = ev.occurredAt >= thisWeekStart;
      const isBaseline =
        ev.occurredAt >= baselineStart && ev.occurredAt < baselineEnd;
      if (isThisWeek) thisWeekConnects += 1;
      else if (isBaseline) baselineConnects += 1;
      if (ev.ghlUserId) {
        const s = ensureSetter(ev.ghlUserId);
        if (isThisWeek) s.tConnects += 1;
        else if (isBaseline) s.bConnects += 1;
      }
    }

    // Sample-size suppression — avoid flagging variance on low-volume teams.
    if (
      thisWeekDials < ANOMALY_MIN_THIS_WEEK_DIALS ||
      baselineDials < ANOMALY_MIN_BASELINE_DIALS
    ) {
      return null;
    }

    const thisWeekRate = thisWeekConnects / thisWeekDials;
    const baselineRate = baselineConnects / baselineDials;
    if (baselineRate === 0) return null;
    const relativeDropPct = (baselineRate - thisWeekRate) / baselineRate;
    if (relativeDropPct < ANOMALY_RELATIVE_DROP_THRESHOLD) return null;

    // Per-setter top contributors (largest absolute drop in pts).
    const reps = (await ctx.db
      .query("setterReps")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .withIndex("by_team", (q: any) => q.eq("teamId", teamId))
      .collect()) as Doc<"setterReps">[];
    const repNameByGhlUserId = new Map(reps.map((r) => [r.ghlUserId, r.name]));

    const contributors: Array<{
      ghlUserId: string;
      name: string;
      thisWeekRate: number | null;
      baselineRate: number | null;
      dropPts: number;
    }> = [];
    for (const [ghlUserId, s] of setterStats) {
      // Require a meaningful sample on both sides — a setter with 2 baseline
      // dials and 0 this-week creates noisy "top contributor" rows.
      if (s.bDials < 20 || s.tDials < 5) continue;
      const tr = s.tDials > 0 ? s.tConnects / s.tDials : null;
      const br = s.bDials > 0 ? s.bConnects / s.bDials : null;
      if (tr === null || br === null) continue;
      const drop = br - tr;
      if (drop <= 0) continue; // not a contributor to the drop
      contributors.push({
        ghlUserId,
        name: repNameByGhlUserId.get(ghlUserId) ?? "Unknown",
        thisWeekRate: tr,
        baselineRate: br,
        dropPts: drop,
      });
    }
    contributors.sort((a, b) => b.dropPts - a.dropPts);

    return {
      thisWeekRate,
      baselineRate,
      relativeDropPct,
      absoluteDropPts: baselineRate - thisWeekRate,
      thisWeekDials,
      baselineDials,
      topContributors: contributors.slice(0, ANOMALY_TOP_CONTRIBUTORS_N),
    };
  },
});

// ----------------------------------------------------------------------------
// Dashboard Phase 3 — Coverage gap detection
// ----------------------------------------------------------------------------

const COVERAGE_GAP_BASELINE_DAYS = 30;
const COVERAGE_GAP_MIN_LEADS_DEFAULT = 3;
const COVERAGE_GAP_BASELINE_MULTIPLIER = 3;        // gap = median >= 3× baseline
const COVERAGE_GAP_ABSOLUTE_FLOOR_MS = 60 * 60_000; // …AND ≥ 60 minutes
const COVERAGE_GAP_TOP_N = 5;

const DAY_LABELS_FULL = [
  "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
];

interface CoverageGapWindow {
  dayLabel: string;
  dow: number;
  startHour: number;
  endHour: number;
  leadCount: number;
  medianTimeToFirstDialMs: number | null;
  neverDialedCount: number;
}

interface CoverageGapDigest {
  date: string;                   // "YYYY-MM-DD" in team timezone
  timezone: string;
  windows: CoverageGapWindow[];
  baselineMedianMs: number | null;
  totalLeadsInDay: number;
  insight: PanelInsight | null;
}

async function computeCoverageGapDigest(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ctx: { db: any },
  teamId: Id<"teams">,
  forDate: { year: number; month: number; day: number },
  timezone: string,
  minLeadsThreshold: number,
): Promise<CoverageGapDigest> {
  // Resolve the [start, end) UTC ms range for the target local date.
  const dateStr = `${forDate.year}-${String(forDate.month).padStart(2, "0")}-${String(forDate.day).padStart(2, "0")}`;
  const targetRange = getLocalDateRangeUtcLocal(dateStr, timezone);

  // Pull yesterday's leads + 30-day baseline leads in parallel.
  const [dayLeads, baselineLeads] = await Promise.all([
    ctx.db
      .query("setterLeads")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .withIndex("by_team_and_date_added", (q: any) =>
        q
          .eq("teamId", teamId)
          .gte("dateAdded", targetRange.startMs)
          .lt("dateAdded", targetRange.endMs),
      )
      .collect(),
    ctx.db
      .query("setterLeads")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .withIndex("by_team_and_date_added", (q: any) =>
        q
          .eq("teamId", teamId)
          .gte(
            "dateAdded",
            targetRange.startMs -
              COVERAGE_GAP_BASELINE_DAYS * 24 * 60 * 60_000,
          )
          .lt("dateAdded", targetRange.startMs),
      )
      .collect(),
  ]);

  const empty: CoverageGapDigest = {
    date: dateStr,
    timezone,
    windows: [],
    baselineMedianMs: null,
    totalLeadsInDay: 0,
    insight: null,
  };
  if (!dayLeads || dayLeads.length === 0) return empty;

  // Baseline median time-to-first-dial across the prior 30 days.
  const baselineSpeeds = (baselineLeads as Doc<"setterLeads">[])
    .filter((l) => typeof l.firstDialAt === "number")
    .map((l) => (l.firstDialAt as number) - l.dateAdded)
    .filter((ms) => ms >= 0 && ms <= 30 * 24 * 60 * 60_000)
    .sort((a, b) => a - b);
  const baselineMedianMs =
    baselineSpeeds.length > 0
      ? baselineSpeeds[Math.floor(baselineSpeeds.length * 0.5)]
      : null;

  // Bucket day's leads by hour-of-arrival in team timezone.
  interface HourBucket {
    speeds: number[];
    leadCount: number;
    neverDialedCount: number;
  }
  const hourBuckets: HourBucket[] = Array.from({ length: 24 }, () => ({
    speeds: [],
    leadCount: 0,
    neverDialedCount: 0,
  }));
  let dayDow = -1;
  for (const lead of dayLeads as Doc<"setterLeads">[]) {
    const local = bucketLocal(lead.dateAdded, timezone);
    if (!local) continue;
    if (dayDow === -1) dayDow = local.dow;
    const bucket = hourBuckets[local.hour];
    bucket.leadCount += 1;
    if (typeof lead.firstDialAt === "number") {
      const speed = lead.firstDialAt - lead.dateAdded;
      if (speed >= 0) bucket.speeds.push(speed);
    } else {
      bucket.neverDialedCount += 1;
    }
  }

  // Identify gap hours: leadCount >= threshold AND median time-to-first-dial
  // exceeds the gap threshold. Never-dialed leads also raise concern even if
  // no median can be computed — treat all-never-dialed hours as gaps too.
  const gapThresholdMs = baselineMedianMs
    ? Math.max(
        baselineMedianMs * COVERAGE_GAP_BASELINE_MULTIPLIER,
        COVERAGE_GAP_ABSOLUTE_FLOOR_MS,
      )
    : COVERAGE_GAP_ABSOLUTE_FLOOR_MS;

  const gapHours: Array<{
    hour: number;
    leadCount: number;
    medianMs: number | null;
    neverDialedCount: number;
  }> = [];
  for (let h = 0; h < 24; h++) {
    const b = hourBuckets[h];
    if (b.leadCount < minLeadsThreshold) continue;
    const sortedSpeeds = b.speeds.slice().sort((a, b) => a - b);
    const median =
      sortedSpeeds.length > 0
        ? sortedSpeeds[Math.floor(sortedSpeeds.length * 0.5)]
        : null;
    // Pull leads with no dial yet count as the worst possible gap signal.
    const allNeverDialed = b.neverDialedCount === b.leadCount;
    const isGap = allNeverDialed || (median !== null && median >= gapThresholdMs);
    if (isGap) {
      gapHours.push({
        hour: h,
        leadCount: b.leadCount,
        medianMs: median,
        neverDialedCount: b.neverDialedCount,
      });
    }
  }

  // Cluster adjacent gap hours into windows.
  const windows: CoverageGapWindow[] = [];
  let cur: CoverageGapWindow | null = null;
  for (const g of gapHours) {
    if (cur && cur.endHour === g.hour) {
      cur.endHour = g.hour + 1;
      cur.leadCount += g.leadCount;
      cur.neverDialedCount += g.neverDialedCount;
      // Recompute median across the window? Keep the worst (max) hour's
      // median as the displayed signal — manager cares about the floor.
      if (
        g.medianMs !== null &&
        (cur.medianTimeToFirstDialMs === null ||
          g.medianMs > cur.medianTimeToFirstDialMs)
      ) {
        cur.medianTimeToFirstDialMs = g.medianMs;
      }
    } else {
      cur = {
        dayLabel: dayDow >= 0 ? DAY_LABELS_FULL[dayDow] : "—",
        dow: dayDow,
        startHour: g.hour,
        endHour: g.hour + 1,
        leadCount: g.leadCount,
        medianTimeToFirstDialMs: g.medianMs,
        neverDialedCount: g.neverDialedCount,
      };
      windows.push(cur);
    }
  }

  // Rank by impact: leadCount × (median/baseline ratio). Higher = worse.
  windows.sort((a, b) => {
    const ratioA =
      a.medianTimeToFirstDialMs !== null && baselineMedianMs !== null
        ? a.medianTimeToFirstDialMs / baselineMedianMs
        : a.neverDialedCount > 0
          ? Number.POSITIVE_INFINITY
          : 1;
    const ratioB =
      b.medianTimeToFirstDialMs !== null && baselineMedianMs !== null
        ? b.medianTimeToFirstDialMs / baselineMedianMs
        : b.neverDialedCount > 0
          ? Number.POSITIVE_INFINITY
          : 1;
    const impactA = a.leadCount * (Number.isFinite(ratioA) ? ratioA : 100);
    const impactB = b.leadCount * (Number.isFinite(ratioB) ? ratioB : 100);
    return impactB - impactA;
  });

  const topWindows = windows.slice(0, COVERAGE_GAP_TOP_N);
  // Format windows for the insight helper. Window label format:
  //   "Mon 7am–8am" (single hour) / "Mon 9am–11am" (multi-hour cluster)
  const insight =
    baselineMedianMs !== null
      ? computeCoverageGapInsight(
          topWindows
            .filter((w) => w.medianTimeToFirstDialMs !== null)
            .map((w) => ({
              label: `${dayName(w.dow)} ${hourRange(w.startHour).split("–")[0]}–${hourRange(w.endHour - 1).split("–")[1]}`,
              medianFirstDialMs: w.medianTimeToFirstDialMs as number,
              leadsArrived: w.leadCount,
            })),
          baselineMedianMs,
        )
      : null;

  return {
    date: dateStr,
    timezone,
    windows: topWindows,
    baselineMedianMs,
    totalLeadsInDay: dayLeads.length,
    insight,
  };
}

/**
 * Public query — feeds the CoverageGapPanel on the Overview tab. Defaults
 * to yesterday in team timezone if no targetDate provided.
 */
export const getCoverageGapDigest = query({
  args: {
    clerkId: v.string(),
    targetDate: v.optional(v.string()), // "YYYY-MM-DD" in team timezone
  },
  handler: async (ctx, args) => {
    const user = await resolveAuthUser(ctx, args.clerkId);
    if (!user) return null;
    const teamId = user.teamId as Id<"teams">;
    const team = (await ctx.db.get(teamId)) as Doc<"teams"> | null;
    if (!team) return null;
    const timezone = team.timezone || "America/New_York";

    const minLeads =
      team.setterCoverageGapMinLeadsThreshold ?? COVERAGE_GAP_MIN_LEADS_DEFAULT;

    const forDate = args.targetDate
      ? parseDateStringSafe(args.targetDate)
      : yesterdayInTimezone(timezone);
    if (!forDate) return null;

    return computeCoverageGapDigest(ctx, teamId, forDate, timezone, minLeads);
  },
});

/**
 * Internal variant — used by the daily coverage-gap cron. Same logic,
 * takes teamId + the target date + timezone directly.
 */
export const getCoverageGapDigestInternal = internalQuery({
  args: {
    teamId: v.id("teams"),
    targetYear: v.number(),
    targetMonth: v.number(),
    targetDay: v.number(),
    timezone: v.string(),
    minLeadsThreshold: v.number(),
  },
  handler: async (ctx, args) => {
    return computeCoverageGapDigest(
      ctx,
      args.teamId,
      {
        year: args.targetYear,
        month: args.targetMonth,
        day: args.targetDay,
      },
      args.timezone,
      args.minLeadsThreshold,
    );
  },
});

// ----------------------------------------------------------------------------
// Date helpers for coverage gap (mirror setterDataNotifications timezone math
// but kept local so this file stays V8-runtime independent of the cron file).
// ----------------------------------------------------------------------------

function yesterdayInTimezone(tz: string): {
  year: number;
  month: number;
  day: number;
} {
  const now = Date.now();
  const yesterday = now - 24 * 60 * 60_000;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(yesterday));
  const get = (type: string) =>
    parseInt(parts.find((p) => p.type === type)?.value ?? "0", 10);
  return { year: get("year"), month: get("month"), day: get("day") };
}

function parseDateStringSafe(s: string): {
  year: number;
  month: number;
  day: number;
} | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  return {
    year: parseInt(m[1], 10),
    month: parseInt(m[2], 10),
    day: parseInt(m[3], 10),
  };
}

function getLocalDateRangeUtcLocal(
  dateStr: string,
  tz: string,
): { startMs: number; endMs: number } {
  const [y, m, d] = dateStr.split("-").map((s) => parseInt(s, 10));
  // Compute offset for local midnight on this date in this timezone.
  const utcGuess = Date.UTC(y, m - 1, d, 0, 0, 0);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(new Date(utcGuess));
  const localHour =
    parseInt(parts.find((p) => p.type === "hour")?.value ?? "0", 10) % 24;
  const localMinute = parseInt(
    parts.find((p) => p.type === "minute")?.value ?? "0",
    10,
  );
  const localSecond = parseInt(
    parts.find((p) => p.type === "second")?.value ?? "0",
    10,
  );
  // Compute the diff between local hour and 0 (midnight target) to find the
  // offset. e.g., if local hour reads 20:00, we're 4 hours west; offsetMs = +4h.
  const offsetMs = (localHour * 60 + localMinute) * 60_000 + localSecond * 1000;
  const startMs = utcGuess - offsetMs;
  return { startMs, endMs: startMs + 24 * 60 * 60_000 };
}

// ----------------------------------------------------------------------------
// utility
// ----------------------------------------------------------------------------

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

// ----------------------------------------------------------------------------
// Setter Scorecard (Phase 2) — playbook-anchored per-setter performance.
//
// Fixed trailing 60-day window. Ignores the dashboard date picker because
// the playbook's central rule is "promote on consistency, fire the yo-yos
// — we evaluate on trailing 60-90 days, not week-over-week." A manager
// looking at this view is making hire/fire/coach calls, not range-specific
// diagnostics.
//
// Targets come from the playbook's published baselines + the team's
// optional overrides (teams.setter*Target). Dollar leakage is anchored to
// team-average close rate × team-average cash collected so the numbers
// stay defensible (no leader-peak math).
// ----------------------------------------------------------------------------

const SCORECARD_WINDOW_DAYS = 60;
const SCORECARD_STABILIZED_TENURE_DAYS = 60;
// Playbook baselines (Section 2 of the published doc Tyler shared).
const PLAYBOOK_DEFAULT_DIALS_PER_DAY = 150;
const PLAYBOOK_DEFAULT_CONTACTS_PER_DAY_A = 12.5; // Cadence A (B2C)
const PLAYBOOK_DEFAULT_CONTACTS_PER_DAY_B = 25;   // Cadence B (B2B)
const PLAYBOOK_DEFAULT_AVG_DIALS_PER_LEAD_A = 12; // Cadence A target
const PLAYBOOK_DEFAULT_AVG_DIALS_PER_LEAD_B = 5;  // Cadence B target
const PLAYBOOK_DEFAULT_PCT_LEADS_HITTING_CADENCE = 80; // either cadence
const PLAYBOOK_RAMPING_SHOW_RATE = 60;
const PLAYBOOK_STABILIZED_SHOW_RATE = 70;
// Conservative connect-rate lift per additional dial — anchored to industry
// research, not team-leader peaks. Used in cadence-gap dollar math.
const CONSERVATIVE_CONNECT_LIFT_PER_DIAL = 0.04; // 4pp per missed dial

interface ScorecardKpiCell {
  actual: number | null;
  target: number;
  status: "red" | "amber" | "green" | "na";
}

interface ScorecardLineItem {
  kpi: string;
  lostUnits: number;        // missed dials / missed shows / late leads / etc.
  dollarValue: number;      // monthly leakage estimate (USD)
  explanation: string;
}

interface ScorecardRow {
  ghlUserId: string;
  name: string;
  tenureDays: number;
  isStabilized: boolean;
  workingDaysInWindow: number;
  kpis: {
    dialsPerDay: ScorecardKpiCell;
    contactsPerDay: ScorecardKpiCell;
    avgDialsPerLead: ScorecardKpiCell;
    pctLeadsHittingCadence: ScorecardKpiCell;
    setRate: ScorecardKpiCell;
    showRate: ScorecardKpiCell;
  };
  dollarLeakageMonthly: number;
  lineItems: ScorecardLineItem[];
}

interface ScorecardResponse {
  windowDays: number;
  rangeStart: number;
  rangeEnd: number;
  workingDaysInWindow: number;
  cadenceDefault: "A" | "B";
  teamAverages: {
    closeRate: number;             // 0..1 fraction
    avgCashCollectedPerClose: number; // USD
  };
  rows: ScorecardRow[];
}

/**
 * Compute weekdays (Mon-Fri, team local time) in a UTC ms range.
 * Used as the divisor for "per day" KPIs so weekends/holidays don't
 * deflate the actual numbers. Team timezone is the right frame because
 * managers pay setters per their local working calendar.
 */
function countWorkingDays(
  rangeStart: number,
  rangeEnd: number,
  timezone: string,
): number {
  let count = 0;
  for (let t = rangeStart; t < rangeEnd; t += 24 * 60 * 60_000) {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      weekday: "short",
    }).formatToParts(new Date(t));
    const wd = parts.find((p) => p.type === "weekday")?.value ?? "";
    if (wd !== "Sat" && wd !== "Sun") count += 1;
  }
  return count;
}

function statusForRatio(actual: number, target: number): "red" | "amber" | "green" {
  if (target <= 0) return "green";
  const r = actual / target;
  if (r >= 0.95) return "green";
  if (r >= 0.75) return "amber";
  return "red";
}

function statusForDelta(actualPct: number, targetPct: number): "red" | "amber" | "green" {
  const gap = targetPct - actualPct;
  if (gap <= 5) return "green";
  if (gap <= 15) return "amber";
  return "red";
}

export const getSetterScorecard = query({
  args: { clerkId: v.string() },
  handler: async (ctx, args): Promise<ScorecardResponse | null> => {
    const user = await resolveAuthUser(ctx, args.clerkId);
    if (!user) return null;
    const teamId = user.teamId as Id<"teams">;

    const team = (await ctx.db.get(teamId)) as Doc<"teams"> | null;
    if (!team) return null;

    const cadenceDefault: "A" | "B" =
      team.setterCadenceDefault === "B" ? "B" : "A";
    const dialsTarget =
      team.setterDialsPerDayTarget ?? PLAYBOOK_DEFAULT_DIALS_PER_DAY;
    const contactsTarget =
      team.setterContactsPerDayTarget ??
      (cadenceDefault === "B"
        ? PLAYBOOK_DEFAULT_CONTACTS_PER_DAY_B
        : PLAYBOOK_DEFAULT_CONTACTS_PER_DAY_A);
    const cadenceDialsTarget =
      cadenceDefault === "B"
        ? PLAYBOOK_DEFAULT_AVG_DIALS_PER_LEAD_B
        : PLAYBOOK_DEFAULT_AVG_DIALS_PER_LEAD_A;
    const cadencePctTarget = PLAYBOOK_DEFAULT_PCT_LEADS_HITTING_CADENCE;
    const setRateTarget = team.setterSetRateTarget ?? 15; // pct

    const now = Date.now();
    const rangeStart = now - SCORECARD_WINDOW_DAYS * 24 * 60 * 60_000;
    const rangeEnd = now;
    const timezone = team.timezone || "America/New_York";
    const workingDaysInWindow = countWorkingDays(rangeStart, rangeEnd, timezone);

    // Reuse the scorecard helper — it already computes 6/7 KPIs we need.
    const scorecard = await computeScorecard(ctx, {
      teamId,
      rangeStart,
      rangeEnd,
    });

    // Team averages for dollar-leakage math. Compute from completed calls
    // in the same trailing window — gives us teamCloseRate + avgCashPerClose
    // anchored to recent reality, not historical peaks.
    const closeRateNumerator = scorecard.bookings.total > 0
      ? scorecard.closerSide.closed
      : 0;
    const closeRateDenominator =
      scorecard.closerSide.matched > 0
        ? scorecard.closerSide.matched
        : Math.max(1, scorecard.bookings.total);
    const teamCloseRate =
      closeRateDenominator > 0
        ? closeRateNumerator / closeRateDenominator
        : 0;

    // Average deal value per close — pull from callStats sidecar across
    // the window. The 16 MiB callStats split means we can scan freely.
    // Use contractValue as the primary multiplier with fallback chain:
    // contractValue > cashCollected > dealValue (legacy). Contract value
    // is the right anchor because closers often collect a small day-of
    // cash on a multi-thousand-dollar deal (payment plans, deposits).
    // Using cash-collected-only systematically under-estimates leakage.
    const callStatsRows = await ctx.db
      .query("callStats")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .withIndex("by_team_and_date", (q: any) =>
        q.eq("teamId", teamId).gte("createdAt", rangeStart).lt("createdAt", rangeEnd),
      )
      .collect();
    const closedRows = (callStatsRows as Array<{
      outcome?: string;
      cashCollected?: number;
      contractValue?: number;
      dealValue?: number;
    }>).filter((r) => r.outcome === "closed");
    const dealValueForLeakage = (r: {
      cashCollected?: number;
      contractValue?: number;
      dealValue?: number;
    }) =>
      r.contractValue && r.contractValue > 0
        ? r.contractValue
        : r.cashCollected && r.cashCollected > 0
          ? r.cashCollected
          : r.dealValue ?? 0;
    const computedAvgDealValue =
      closedRows.length > 0
        ? closedRows.reduce((s, r) => s + dealValueForLeakage(r), 0) /
          closedRows.length
        : 0;
    // Use the LARGER of (computed avg, manager override). Override never
    // under-estimates. Override is the right anchor when closer-entered
    // values are patchy or placeholder (a known issue on some teams).
    const avgCashCollectedPerClose = team.setterTypicalDealValue
      ? Math.max(computedAvgDealValue, team.setterTypicalDealValue)
      : computedAvgDealValue;

    // Pull setterReps for tenure data.
    const reps = (await ctx.db
      .query("setterReps")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .withIndex("by_team", (q: any) => q.eq("teamId", teamId))
      .collect()) as Doc<"setterReps">[];
    const repByGhlId = new Map(reps.map((r) => [r.ghlUserId, r]));

    // Build a row per setter that appears in the scorecard.
    const rows: ScorecardRow[] = [];
    for (const setterRow of scorecard.perSetter) {
      const rep = repByGhlId.get(setterRow.ghlUserId);
      // Tenure source: stabilizedAt override > firstSeenAt > _creationTime.
      const tenureBase =
        rep?.firstSeenAt ?? rep?._creationTime ?? now;
      const tenureDays = Math.max(0, (now - tenureBase) / (24 * 60 * 60_000));
      const isStabilized = rep?.stabilizedAt
        ? now >= rep.stabilizedAt
        : tenureDays >= SCORECARD_STABILIZED_TENURE_DAYS;

      const showRateTarget = isStabilized
        ? PLAYBOOK_STABILIZED_SHOW_RATE
        : PLAYBOOK_RAMPING_SHOW_RATE;

      const dialsPerDay =
        workingDaysInWindow > 0
          ? setterRow.dialCount / workingDaysInWindow
          : 0;
      const contactsPerDay =
        workingDaysInWindow > 0
          ? setterRow.leadCount / workingDaysInWindow
          : 0;

      const avgDialsPerLead = setterRow.cadence.avgDialsPerLead;
      const pctLeadsHittingCadence =
        setterRow.cadence.pctLeadsThreeOrMoreAttempts !== null
          ? setterRow.cadence.pctLeadsThreeOrMoreAttempts * 100
          : null;

      const setRate =
        setterRow.connectedCount > 0
          ? (setterRow.appointmentCount / setterRow.connectedCount) * 100
          : null;

      const showRate =
        setterRow.showRate !== null ? setterRow.showRate * 100 : null;

      // KPI cells with status flags. Explicit type on each ternary so the
      // inference doesn't widen "na" | "red" | "amber" | "green" → string.
      type S = "red" | "amber" | "green" | "na";
      const kpis = {
        dialsPerDay: {
          actual: dialsPerDay,
          target: dialsTarget,
          status: statusForRatio(dialsPerDay, dialsTarget) as S,
        },
        contactsPerDay: {
          actual: contactsPerDay,
          target: contactsTarget,
          status: statusForRatio(contactsPerDay, contactsTarget) as S,
        },
        avgDialsPerLead: {
          actual: avgDialsPerLead,
          target: cadenceDialsTarget,
          status: (avgDialsPerLead === null
            ? "na"
            : statusForRatio(avgDialsPerLead, cadenceDialsTarget)) as S,
        },
        pctLeadsHittingCadence: {
          actual: pctLeadsHittingCadence,
          target: cadencePctTarget,
          status: (pctLeadsHittingCadence === null
            ? "na"
            : statusForDelta(pctLeadsHittingCadence, cadencePctTarget)) as S,
        },
        setRate: {
          actual: setRate,
          target: setRateTarget,
          status: (setRate === null
            ? "na"
            : statusForDelta(setRate, setRateTarget)) as S,
        },
        showRate: {
          actual: showRate,
          target: showRateTarget,
          status: (showRate === null
            ? "na"
            : statusForDelta(showRate, showRateTarget)) as S,
        },
      };

      // Dollar leakage — three conservative line items.
      const lineItems: ScorecardLineItem[] = [];

      // 1. Cadence gap: missed dials × conservative connect-lift × close rate × avg cash.
      // Only counts when this setter has enough lead volume to mean something.
      if (
        avgDialsPerLead !== null &&
        avgDialsPerLead < cadenceDialsTarget &&
        setterRow.cadence.leadsWithDials >= 5
      ) {
        const missedDialsPerLead = cadenceDialsTarget - avgDialsPerLead;
        const missedDials =
          missedDialsPerLead * setterRow.cadence.leadsWithDials;
        // Each missed dial costs (probability of connect lift) × close rate × avg cash.
        // Reduce by 30 days / window length to get monthly run-rate.
        const monthly =
          (missedDials * CONSERVATIVE_CONNECT_LIFT_PER_DIAL * teamCloseRate *
            avgCashCollectedPerClose) /
          (SCORECARD_WINDOW_DAYS / 30);
        if (monthly > 0) {
          lineItems.push({
            kpi: "cadence",
            lostUnits: Math.round(missedDials),
            dollarValue: monthly,
            explanation: `${setterRow.cadence.leadsWithDials} leads averaged ${avgDialsPerLead.toFixed(1)} dials vs target ${cadenceDialsTarget}. ${Math.round(
              missedDials,
            )} dials below cadence.`,
          });
        }
      }

      // 2. Show-rate gap: missing shows × close rate × avg cash. Anchored to
      //    setter's own appointments — if they didn't book, no leakage.
      if (
        showRate !== null &&
        setterRow.appointmentCount >= 3 &&
        showRate < showRateTarget
      ) {
        const gapPp = showRateTarget - showRate;
        const missingShows =
          (gapPp / 100) * setterRow.appointmentCount;
        const monthly =
          (missingShows * teamCloseRate * avgCashCollectedPerClose) /
          (SCORECARD_WINDOW_DAYS / 30);
        if (monthly > 0) {
          lineItems.push({
            kpi: "showRate",
            lostUnits: Math.round(missingShows),
            dollarValue: monthly,
            explanation: `Show rate ${Math.round(showRate)}% vs target ${showRateTarget}% on ${setterRow.appointmentCount} bookings. ${Math.round(
              missingShows,
            )} missing shows.`,
          });
        }
      }

      // 3. Set-rate gap: missing sets × downstream show rate × close rate × avg cash.
      if (
        setRate !== null &&
        setterRow.connectedCount >= 5 &&
        setRate < setRateTarget
      ) {
        const gapPp = setRateTarget - setRate;
        const missingSets =
          (gapPp / 100) * setterRow.connectedCount;
        const downstreamShowRate = (showRate ?? showRateTarget) / 100;
        const monthly =
          (missingSets * downstreamShowRate * teamCloseRate *
            avgCashCollectedPerClose) /
          (SCORECARD_WINDOW_DAYS / 30);
        if (monthly > 0) {
          lineItems.push({
            kpi: "setRate",
            lostUnits: Math.round(missingSets),
            dollarValue: monthly,
            explanation: `Set rate ${Math.round(setRate)}% vs target ${setRateTarget}% on ${setterRow.connectedCount} connects. ${Math.round(
              missingSets,
            )} missing sets.`,
          });
        }
      }

      const dollarLeakageMonthly = lineItems.reduce(
        (s, li) => s + li.dollarValue,
        0,
      );

      rows.push({
        ghlUserId: setterRow.ghlUserId,
        name: setterRow.name,
        tenureDays: Math.round(tenureDays),
        isStabilized,
        workingDaysInWindow,
        kpis,
        dollarLeakageMonthly,
        lineItems,
      });
    }

    // Sort by dollar leakage desc — worst performers at top, which is the
    // coaching/firing queue.
    rows.sort((a, b) => b.dollarLeakageMonthly - a.dollarLeakageMonthly);

    return {
      windowDays: SCORECARD_WINDOW_DAYS,
      rangeStart,
      rangeEnd,
      workingDaysInWindow,
      cadenceDefault,
      teamAverages: {
        closeRate: teamCloseRate,
        avgCashCollectedPerClose,
      },
      rows,
    };
  },
});
