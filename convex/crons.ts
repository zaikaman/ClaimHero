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
 * Periodic catch-up synchronizing recent messages from AgentMail inboxes every 15 minutes
 * for any messages delayed when webhooks were temporarily unreachable.
 */
crons.interval(
  "sync-agentmail-inboxes",
  { minutes: 15 },
  internal.actions.agentMail.syncInboundMessagesInternal,
  {}
);

/**
 * Sentinel Auto-Pilot 1-Hour SLA Sweep Cron:
 * Sweeps pending inbound clinical rebuttals every 15 minutes and autonomously dispatches
 * any whose 1-hour review SLA has elapsed.
 */
crons.interval(
  "sentinel-autopilot-sla-sweep",
  { minutes: 15 },
  internal.actions.mailDispatcher.sweepPendingAutoPilotReplies,
  {}
);

/**
 * Daily Orphaned Uploads Sweep Cron:
 * Sweeps unattached pending uploads older than 24 hours to prevent storage leaks.
 */
crons.interval(
  "sweep-orphaned-uploads",
  { hours: 24 },
  internal.claims.sweepOrphanedPendingUploadsInternal,
  {}
);

export default crons;
