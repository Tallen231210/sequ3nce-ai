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

// Auto-schedule meeting bots.
//
// Disabled since February, a day after it was built and two weeks before
// Google Calendar OAuth existed. Re-enabled 2026-08-08 once the four things
// that made it unsafe were fixed: it took every team rather than Overwatch
// only, it booked one bot per closer rather than per meeting (43 bots for 13
// meetings on the one customer we could measure), it never told Recall WHEN to
// join so bots would have arrived a day early to empty rooms, and bot calls
// were never classified so internal meetings would have counted.
//
// Safe to run because auto-join is opt-in per closer: with nobody enabled this
// finds nothing. Rollout is one person at a time.
//
// Wall-clock cron, never crons.interval — interval crons reset their next fire
// on every deploy, which is how the setter scorecard silently stopped running
// for weeks. Offset by 7 minutes so it doesn't land on the same tick as the
// calendar sync it depends on.
crons.cron(
  "auto-schedule-meeting-bots",
  "7,22,37,52 * * * *",
  internal.meetingBot.autoScheduleBotsForAllClosers,
  {},
);

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

// Drain: pick up webhook audit rows whose dispatch never ran. Scheduled work
// can be dropped, and when it is, the row sits processed=false forever with
// no error on it — the data is stored and simply never counted. Found 1,881
// such rows, the oldest from June. dispatch is idempotent, so replaying costs
// nothing when there's no backlog.
//
// crons.cron, not crons.interval: an interval cron restarts its countdown on
// every deploy, which is how the setter scorecard quietly stopped running for
// weeks. Minute 47 is unused by the jobs above.
crons.cron(
  "setter-drain-unprocessed-webhooks",
  "47 * * * *",
  internal.setterGhlSync.drainUnprocessedWebhooks,
  {},
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

// Close CRM reconcile: ongoing freshness for connected Close teams. Polls
// each active Close install for activity since lastSyncedAt (with overlap;
// dedup absorbs it). Separate from the GHL reconcile because that one
// excludes provider="close".
crons.interval(
  "setter-close-reconcile",
  { minutes: 30 },
  internal.setterCloseSync.closeReconcile,
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

// Uncontacted Leads Digest: end-of-day rollup (per team-configured hour,
// default 5pm local). Lists every lead added today that's still
// uncontacted as of the digest time — even if a real-time untouched
// alert fired earlier in the day, contacted leads are excluded.
// Complementary to setter-untouched-alert-sweep above: that's the
// real-time poke, this is the batch catch-up. Per-team enabled flag is
// off by default. Wall-clock cron for the same deploy-reset reason.
crons.cron(
  "setter-uncontacted-digest",
  "0 * * * *",
  internal.setterDataNotifications.runUncontactedDigest,
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

// Team Performance rollup sweep. closerDailyStats is derived, so it only
// exists if something recomputes it — a write hook fires on call completion
// and outcome edits, and this repairs whatever the hook missed (failed
// scheduled mutations, calls written by an unhooked path, calendar events
// that synced late).
//
// Hourly rather than daily so a team that connects a calendar during the
// working day sees a populated board within the hour instead of tomorrow.
// Recounts write absolute values, so re-running a day is always harmless.
//
// Wall-clock cron, never crons.interval — interval crons reset their next
// fire on every deploy and, with several deploys a day, would never fire.
// See the setter-daily-scorecard note above for the outage that taught us.
crons.cron(
  "closer-performance-sweep",
  "20 * * * *",
  internal.closerPerformanceSweep.runSweep,
  {},
);

// Team Performance daily scoreboard. Hourly, gated per team on their local
// delivery hour — same pattern as the setter scorecard above, including the
// crons.cron (never crons.interval) rule that outage taught us.
crons.cron(
  "closer-daily-scorecard",
  "5 * * * *",
  internal.closerPerformanceNotifications.runCloserScorecards,
  {},
);

// How Fathom calls actually arrive.
//
// This was meant to be a backstop behind the webhook. The webhook never
// delivered once — three of them, two confirmed correct in Fathom's own UI —
// so polling is the primary path and the webhook is the bonus if it ever
// starts working. Every five minutes: a closer finishing a call shouldn't wait
// longer than that to see it.
//
// Cheap by construction. The list call carries no transcripts, so it sits on
// the standard rate limit, and only a recording we've never seen costs
// anything more.
crons.cron(
  "fathom-poll",
  "*/5 * * * *",
  internal.fathomConnect.pollForNewMeetings,
  {},
);

// The deeper sweep, once a day. The poll looks back two hours; this looks back
// three days and catches anything a longer outage swallowed. crons.cron, not
// crons.interval — an outage must not leave a backlog of overlapping sweeps
// all hammering the same rate limit when the deployment comes back.
crons.cron(
  "fathom-reconcile",
  "20 4 * * *",
  internal.fathomConnect.reconcile,
  {},
);

// The daily outcome nudge. 5pm UTC — late enough in a US afternoon that the
// day's calls are done, early enough that it isn't overnight mail. Only goes
// to closers on a team with a live Fathom connection who actually have calls
// outstanding, so nobody else can receive one.
crons.cron(
  "fathom-outcome-nudge",
  "0 17 * * *",
  internal.fathomNudge.runDailyNudges,
  {},
);

// The Overview tier's only source of call data. Every fifteen minutes, so a
// closer finishing a call sees it waiting for an outcome before they've moved
// on to the next one. Scoped to Overview teams inside the job — running it for
// a team that also has a bot would turn one meeting into two calls.
crons.cron(
  "calendar-bookings-to-calls",
  "*/15 * * * *",
  internal.calendarCalls.pollBookings,
  {},
);

// Outstanding balances digest. Hourly, gated per team on their local delivery
// hour — same pattern as the two scorecards above, including the crons.cron
// (never crons.interval) rule that outage taught us.
//
// Minute 35 because 0, 5 and 20 are already taken and an hourly job that starts
// by scanning six months of call stats for every opted-in team shouldn't land
// on the same tick as the others.
//
// Sends nothing to a team with nothing outstanding, so on most days for most
// teams this job runs and posts nowhere. That silence is the design.
crons.cron(
  "collections-digest",
  "35 * * * *",
  internal.collectionsNotifications.runCollectionsDigest,
  {},
);

// End-of-day cash: today, month to date, year to date, pace and the
// leaderboard. Hourly, because each team picks its own local hour — the job
// runs every hour and posts only for the teams whose hour it is.
//
// crons.cron, never crons.interval. See the note on the collections digest.
crons.cron(
  "cash-digest",
  "10 * * * *",
  internal.cashDigestNotifications.runCashDigest,
  {},
);

export default crons;
