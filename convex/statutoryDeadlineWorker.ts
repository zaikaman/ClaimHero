import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { internal, components } from "./_generated/api";
import { ping, defineBatchWorkerValidators } from "@convex-dev/batch-worker";
import { calculateDaysRemaining } from "./lib/dateUtils";
import { appendAuditLog } from "./auditLogs";
import { requireAuthUser } from "./lib/auth";

const vClaimsBatch = v.array(
  v.object({
    id: v.id("claims"),
    claimNumber: v.string(),
    userId: v.optional(v.id("users")),
    status: v.string(),
    statutoryDeadline: v.optional(v.number()),
    daysRemaining: v.optional(v.number()),
  })
);

// Define matched validators for work query and worker mutation with string cursor
const { vQueryArgs, vQueryReturns, vMutationArgs } = defineBatchWorkerValidators({
  batch: { claims: vClaimsBatch },
  cursor: v.string(),
});

/**
 * Work query for @convex-dev/batch-worker:
 * Performs bounded cursor-based scans in chunks of 50 across open claims using the by_deadline index.
 * Scales effortlessly from 10 cases to 10,000+ cases without hitting Convex execution limits.
 */
export const getStatutoryDeadlineBatch = internalQuery({
  args: vQueryArgs,
  returns: vQueryReturns,
  handler: async (ctx, { cursor }) => {
    // If previous cursor was marked as empty string "", the full sweep cycle is complete
    if (cursor === "") {
      return { kind: "idle" as const };
    }

    const pageResult = await ctx.db
      .query("claims")
      .withIndex("by_deadline")
      .paginate({ cursor: cursor || null, numItems: 50 });

    if (pageResult.page.length === 0) {
      return { kind: "idle" as const };
    }

    const claims = pageResult.page.map((c) => ({
      id: c._id,
      claimNumber: c.claimNumber,
      userId: c.userId,
      status: c.status,
      statutoryDeadline: c.statutoryDeadline,
      daysRemaining: c.daysRemaining,
    }));

    return {
      kind: "work" as const,
      batch: { claims },
      cursor: pageResult.isDone ? "" : pageResult.continueCursor,
    };
  },
});

/**
 * Worker mutation for @convex-dev/batch-worker:
 * Recalculates statutory days remaining for a bounded chunk of 50 claims.
 * Emits critical ERISA alarm audit events with 24-hour deduplication when remaining days <= 14.
 */
export const processStatutoryDeadlineBatch = internalMutation({
  args: vMutationArgs,
  handler: async (ctx, { claims }) => {
    const now = Date.now();

    for (const claim of claims) {
      if (claim.status === "won" || claim.status === "lost") continue;
      if (claim.statutoryDeadline === undefined) continue;

      // Defensive check: skip if claim was deleted concurrently
      if (typeof ctx.db.get === "function") {
        const existing = await ctx.db.get(claim.id);
        if (!existing) continue;
      }

      const exactRemaining = calculateDaysRemaining(claim.statutoryDeadline, now);

      if (exactRemaining !== claim.daysRemaining) {
        await ctx.db.patch(claim.id, {
          daysRemaining: exactRemaining,
          updatedAt: now,
        });

        if (exactRemaining <= 14 && (claim.daysRemaining === undefined || claim.daysRemaining > 14)) {
          const twentyFourHoursAgo = now - 24 * 60 * 60 * 1000;
          let recentAlarm: unknown = null;
          const dayStr = new Date(now).toISOString().slice(0, 10);
          const alarmKey = `${claim.id}:statutory_alarm_critical:${dayStr}`;
          try {
            if (typeof ctx.db.query("appealAuditLogs").withIndex === "function") {
              recentAlarm = await ctx.db
                .query("appealAuditLogs")
                .withIndex("by_idempotency_key", (q) => q.eq("idempotencyKey", alarmKey))
                .first();
            }
          } catch {
            recentAlarm = await ctx.db
              .query("appealAuditLogs")
              .withIndex("by_claim", (q) => q.eq("claimId", claim.id))
              .filter((q) =>
                q.and(
                  q.eq(q.field("eventType"), "statutory_alarm_critical"),
                  q.gte(q.field("timestamp"), twentyFourHoursAgo)
                )
              )
              .first();
          }

          if (!recentAlarm) {
            await appendAuditLog(ctx, {
              claimId: claim.id,
              ...(claim.userId ? { userId: claim.userId } : {}),
              eventType: "statutory_alarm_critical",
              actor: "Statutory Deadline Sentinel",
              details: `CRITICAL ALARM: Only ${exactRemaining} days remaining before statutory ERISA appeal clock expires for claim ${claim.claimNumber}.`,
              timestamp: now,
              idempotencyKey: alarmKey,
            });
          }
        }
      }
    }
  },
});

/**
 * Internal mutation called by crons to initiate or resume the batch worker loop.
 * Clears cursor before pinging so daily sweeps always scan from the beginning.
 */
export const pingStatutoryDeadlineSweepInternal = internalMutation({
  args: {},
  handler: async (ctx) => {
    try {
      await ctx.runMutation(components.batchWorker.lib.setCursor, {
        name: "statutory_deadline_sweep",
      });
    } catch {
      // First ping: worker not yet created
    }
    await ping(ctx, components.batchWorker, {
      name: "statutory_deadline_sweep",
      workQuery: internal.statutoryDeadlineWorker.getStatutoryDeadlineBatch,
      workerMutation: internal.statutoryDeadlineWorker.processStatutoryDeadlineBatch,
    });
  },
});

/**
 * Public on-demand mutation to trigger a statutory deadline sweep via batch worker.
 * Authenticates user, resets cursor, and starts the sweep loop.
 */
export const triggerStatutoryDeadlineSweep = mutation({
  args: {},
  handler: async (ctx) => {
    await requireAuthUser(ctx);
    try {
      await ctx.runMutation(components.batchWorker.lib.setCursor, {
        name: "statutory_deadline_sweep",
      });
    } catch {
      // First ping: worker not yet created
    }
    await ping(ctx, components.batchWorker, {
      name: "statutory_deadline_sweep",
      workQuery: internal.statutoryDeadlineWorker.getStatutoryDeadlineBatch,
      workerMutation: internal.statutoryDeadlineWorker.processStatutoryDeadlineBatch,
    });
    return { status: "sweep_triggered" };
  },
});

/**
 * Query current run status of the statutory deadline batch worker (idle, running, stopped).
 */
export const getStatutoryDeadlineSweepStatus = query({
  args: {},
  handler: async (ctx) => {
    await requireAuthUser(ctx);
    return await ctx.runQuery(components.batchWorker.lib.status, {
      name: "statutory_deadline_sweep",
    });
  },
});
