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
  internal.claims.sweepDeadlines,
  {}
);

/**
 * AgentMail Inbound Sync Cron:
 * Synchronizes recent messages from AgentMail inboxes every 5 minutes to ingest payer replies.
 */
crons.interval(
  "sync-agentmail-inboxes",
  { minutes: 5 },
  internal.actions.agentMail.syncInboundMessagesInternal,
  {}
);

export default crons;
