import { cronJobs } from "convex/server";
import { api } from "./_generated/api";

const crons = cronJobs();

/**
 * Daily Statutory Deadline Sweep Cron:
 * Recalculates remaining appeal deadline days for all active cases and triggers alarms for cases near expiry.
 */
crons.daily(
  "statutory-deadline-daily-sweep",
  { hourUTC: 0, minuteUTC: 0 },
  (api as any).claims.sweepDeadlines
);

export default crons;
