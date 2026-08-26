import { mutation, query, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";

/**
 * List chronological audit trail events for a specific claim
 */
export const listByClaim = query({
  args: {
    claimId: v.id("claims"),
  },
  handler: async (ctx, args) => {
    const logs = await ctx.db
      .query("appealAuditLogs")
      .withIndex("by_claim", (q: any) => q.eq("claimId", args.claimId))
      .collect();

    return (logs as Doc<"appealAuditLogs">[]).sort((a, b) => b.timestamp - a.timestamp);
  },
});

/**
 * Append an immutable event to the appeal audit log
 */
export const logEvent = mutation({
  args: {
    claimId: v.id("claims"),
    eventType: v.string(),
    actor: v.string(),
    details: v.string(),
  },
  handler: async (ctx, args) => {
    const timestamp = Date.now();

    const logId = await ctx.db.insert("appealAuditLogs", {
      claimId: args.claimId,
      eventType: args.eventType,
      actor: args.actor,
      details: args.details,
      timestamp,
    });

    // Update claim's last modified timestamp
    await ctx.db.patch(args.claimId, {
      updatedAt: timestamp,
    });

    return logId;
  },
});

/**
 * Internal mutation for logging events from background actions & crons
 */
export const logEventInternal = internalMutation({
  args: {
    claimId: v.id("claims"),
    eventType: v.string(),
    actor: v.string(),
    details: v.string(),
  },
  handler: async (ctx, args) => {
    const timestamp = Date.now();

    return await ctx.db.insert("appealAuditLogs", {
      claimId: args.claimId,
      eventType: args.eventType,
      actor: args.actor,
      details: args.details,
      timestamp,
    });
  },
});

/**
 * List the most recent audit events across all claims for the live activity feed
 */
export const listRecent = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit || 15;
    const logs = await ctx.db.query("appealAuditLogs").collect();

    return (logs as Doc<"appealAuditLogs">[])
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit);
  },
});
