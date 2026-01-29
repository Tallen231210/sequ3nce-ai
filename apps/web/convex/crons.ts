import { cronJobs } from "convex/server";
import { api, internal } from "./_generated/api";

const crons = cronJobs();

// Sync all connected calendars every 15 minutes
crons.interval(
  "sync-all-calendars",
  { minutes: 15 },
  api.calendar.syncAllCalendars
);

// Check for long-running calls and send 30/60 minute summaries
crons.interval(
  "check-call-milestones",
  { minutes: 5 },
  internal.slack.checkCallMilestones
);

export default crons;
