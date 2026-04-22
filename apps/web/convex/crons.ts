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

export default crons;
