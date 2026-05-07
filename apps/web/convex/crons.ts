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
crons.interval(
  "setter-daily-scorecard",
  { hours: 1 },
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

export default crons;
