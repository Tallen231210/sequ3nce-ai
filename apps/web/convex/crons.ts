import { cronJobs } from "convex/server";
import { api, internal } from "./_generated/api";

const crons = cronJobs();

// Sync all connected calendars every 15 minutes (legacy single-calendar + B2B)
crons.interval(
  "sync-all-calendars",
  { minutes: 15 },
  api.calendar.syncAllCalendars
);

// Sync all B2C multi-calendar connections every 15 minutes
crons.interval(
  "sync-b2c-calendars",
  { minutes: 15 },
  internal.googleCalendar.syncAllB2cCalendars
);

// Money Bells — determine monthly winner at 00:00 UTC on the 1st of each month
crons.cron(
  "determine-money-bells-winner",
  "0 0 1 * *",
  internal.b2cMoneyBells.determineMonthWinner
);

// GHL lead sync — retry any failed or stuck-pending lead syncs every 10 min
crons.interval(
  "retry-failed-ghl-lead-syncs",
  { minutes: 10 },
  api.b2cGhl.retryFailedLeadSyncs
);

// Personal Goal Tracker — hourly sweep to transition active goals to
// completed (target hit) or expired (deadline passed). Idempotent, paginated.
crons.interval(
  "transition-stale-goals",
  { hours: 1 },
  internal.b2cPersonalGoals.transitionStaleGoals,
);

// Coaching Calls — hourly sweep to end "live" calls whose deadline is long
// past and mark "scheduled" calls as ended if the coach never showed.
crons.interval(
  "transition-stale-coaching-calls",
  { hours: 1 },
  internal.b2cCoachingCalls.transitionStaleCoachingCalls,
);

// Auto-schedule meeting bots — DISABLED: bots are now created on-demand when closer clicks "Join & Record"
// crons.interval(
//   "auto-schedule-meeting-bots",
//   { minutes: 15 },
//   api.meetingBot.autoScheduleBotsForAllClosers
// );

// ============================================================================
// Setter Data — GoHighLevel Marketplace App sync jobs
// ============================================================================

// Deep backfill: extends history backward one month at a time. Each tick
// picks up to 5 active installations, processes one month per installation,
// stops when each reaches 12 months total. Customers see "Extending
// history... N of 12 months synced" in the UI until complete.
crons.interval(
  "setter-deep-backfill-extender",
  { minutes: 30 },
  internal.setterGhlSync.deepBackfillStep,
);

// Reconcile: hourly safety net. Pulls contacts modified in the last 90
// minutes from each active installation and routes them through the same
// dispatch pipeline as live webhooks. Catches any events GHL retries
// gave up on or that were dropped during a deploy. Idempotent via the
// ghlEventKey index on setterLeadEvents.
crons.interval(
  "setter-data-reconcile",
  { hours: 1 },
  internal.setterGhlSync.reconcile,
);

// Audit-log prune: deletes setterWebhookEvents rows older than 30 days.
// The audit log is forensic only (debugging webhook delivery + replaying
// missed events for support); reports run off setterLeads / setterLeadEvents
// which are kept indefinitely.
crons.daily(
  "setter-webhook-audit-prune",
  { hourUTC: 7, minuteUTC: 0 },
  internal.setterGhlSync.pruneWebhookAudit,
);

// Daily Scorecard: runs hourly + filters per team based on their
// configured local-tz delivery hour. Sends yesterday's KPIs (speed-to-
// lead, connections, untouched count, top setter performers) to
// whichever channel (slack/discord) the team has configured. Dedupes
// via slackNotifications.dedupKey so a team gets at most one scorecard
// per local day.
//
// Wall-clock cron (not crons.interval) — interval crons reset their
// "next fire" on every Convex deploy. With deploys happening multiple
// times per day, the hourly interval would get pushed forward and
// never actually fire within a team's target-hour window. The cron
// expression below fires at the top of every UTC hour regardless of
// deploy activity. Caused weeks of "scorecard never delivered" reports
// before the cause was identified 2026-06-26.
crons.cron(
  "setter-daily-scorecard",
  "0 * * * *",
  internal.setterDataNotifications.runScorecards,
);

// Untouched-lead alert sweep (Phase 2): runs every 2 minutes. Per-team
// gating + per-lead 15-min dedup buckets keep noise low. Off by default
// — only fires for teams that have explicitly opted into real-time
// alerts in Settings.
crons.interval(
  "setter-untouched-alert-sweep",
  { minutes: 2 },
  internal.setterDataNotifications.runUntouchedAlertSweep,
);

// Coverage Gap Digest (Dashboard Phase 3): hourly cron + per-team gating
// on local-tz delivery hour (default 9am). Surfaces yesterday's worst
// lead-coverage windows in a Slack/Discord digest. Empty-state aware:
// teams with no gaps don't get pinged. Off by default.
//
// Same deploy-reset rationale as the scorecard cron above — use a
// wall-clock cron expression so deploys don't push the schedule
// forward indefinitely.
crons.cron(
  "setter-coverage-gap-digest",
  "0 * * * *",
  internal.setterDataNotifications.runCoverageGapDigest,
);

// Hyros Attribution Poll (Phase 5 read direction): every 30 min, bounded
// per-team at 100 leads. Reconciliation backstop for the webhook path —
// if a webhook never fires or arrives delayed, the poll catches up. Only
// fires for teams that have configured a Hyros API key. No-op for the
// many teams without Hyros integrated.
crons.interval(
  "setter-hyros-attribution-poll",
  { minutes: 30 },
  internal.hyrosReadActions.runHyrosAttributionPoll,
);

// callStats sidecar reconcile: every 5 min, re-sync any calls created in
// the last 2 hours into the callStats table. The sidecar holds only the
// thin fields stats queries need (no transcript blobs), so
// getCloserStats / getTeamStats can scan thousands of rows without
// hitting Convex's 16 MiB per-query read limit. Drift-free without
// hooking every individual calls mutation site.
crons.interval(
  "call-stats-reconcile",
  { minutes: 5 },
  internal.callStats.reconcileRecentCallStats,
  { windowHours: 2 },
);

// Booking Flow Detection (Dashboard Phase 4): daily sweep. For each team
// with stale (>7 day old) or missing flow detection, recompute by
// comparing lead.firstDialAt vs matched calendar event creation time
// over the last 60 days. Result drives whether the dashboard shows
// Tier 2 attribution stats prominently or de-emphasizes them.
crons.daily(
  "setter-booking-flow-detection",
  { hourUTC: 8, minuteUTC: 0 },
  internal.setterDataNotifications.runBookingFlowDetectionSweep,
);

// Phase 1 (Closer Unit Economics) — Meta Ads daily spend sync. Pulls
// yesterday + today's per-ad spend for each team with Meta connected.
// The 2-day window catches Meta's late-attribution adjustments.
crons.daily(
  "ad-spend-meta-daily-sync",
  { hourUTC: 9, minuteUTC: 0 },
  internal.adSpend.runDailyMetaSync,
);

export default crons;
