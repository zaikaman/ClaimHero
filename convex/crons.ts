import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

/**
 * Daily Statutory Deadline Sweep Cron:
 * Recalculates remaining appeal deadline days for all active cases and triggers alarms for cases near expiry.
 */
crons.cron(
  "statutory-deadline-daily-sweep",
  "0 0 * * *",
  (internal as any).claims.sweepDeadlines
);

export default crons;
