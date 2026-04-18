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

// Auto-schedule meeting bots — DISABLED: bots are now created on-demand when closer clicks "Join & Record"
// crons.interval(
//   "auto-schedule-meeting-bots",
//   { minutes: 15 },
//   api.meetingBot.autoScheduleBotsForAllClosers
// );

export default crons;
