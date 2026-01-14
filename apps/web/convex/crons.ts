import { cronJobs } from "convex/server";
import { api } from "./_generated/api";

const crons = cronJobs();

// Sync all connected calendars every 15 minutes
crons.interval(
  "sync-all-calendars",
  { minutes: 15 },
  api.calendar.syncAllCalendars
);

export default crons;
