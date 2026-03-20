import { cronJobs } from "convex/server";
import { api, internal } from "./_generated/api";

const crons = cronJobs();

// Sync all connected calendars every 15 minutes
crons.interval(
  "sync-all-calendars",
  { minutes: 15 },
  api.calendar.syncAllCalendars
);

// Auto-schedule meeting bots — DISABLED: bots are now created on-demand when closer clicks "Join & Record"
// crons.interval(
//   "auto-schedule-meeting-bots",
//   { minutes: 15 },
//   api.meetingBot.autoScheduleBotsForAllClosers
// );

export default crons;
