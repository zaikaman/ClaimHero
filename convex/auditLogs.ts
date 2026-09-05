import { mutation, query, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { getClaimIfAuthorized, requireClaimOwner, getAuthUserId } from "./lib/auth";

/**
 * List chronological audit trail events for a specific claim, checking authorization
 */
export const listByClaim = query({
  args: {
    claimId: v.id("claims"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const authorized = await getClaimIfAuthorized(ctx, args.claimId);
    if (!authorized) return [];

    const limit = args.limit ?? 100;

    return await ctx.db
      .query("appealAuditLogs")
      .withIndex("by_claim_and_timestamp", (q) => q.eq("claimId", args.claimId))
      .order("desc")
      .take(limit);
  },
});

/**
 * Append an immutable event to the appeal audit log, checking claim ownership
 */
export const logEvent = mutation({
  args: {
    claimId: v.id("claims"),
    eventType: v.string(),
    actor: v.string(),
    details: v.string(),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireClaimOwner(ctx, args.claimId);

    const timestamp = Date.now();

    const logId = await ctx.db.insert("appealAuditLogs", {
      claimId: args.claimId,
      userId,
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
    userId: v.optional(v.id("users")),
    eventType: v.string(),
    actor: v.string(),
    details: v.string(),
  },
  handler: async (ctx, args) => {
    const timestamp = Date.now();
    const claim = typeof ctx.db.get === "function" ? await ctx.db.get(args.claimId) : null;
    const resolvedUserId = args.userId || claim?.userId;

    return await ctx.db.insert("appealAuditLogs", {
      claimId: args.claimId,
      ...(resolvedUserId ? { userId: resolvedUserId } : {}),
      eventType: args.eventType,
      actor: args.actor,
      details: args.details,
      timestamp,
    });
  },
});

/**
 * List the most recent audit events strictly across the authenticated user's claims.
 * Uses bounded queries (take(10) instead of unbounded/oversized scans) to eliminate unnecessary I/O.
 */
export const listRecent = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    const limit = Math.min(Math.max(1, args.limit ?? 15), 20);

    // Primary fast path: single index scan via by_user_and_timestamp (~15 docs vs 210 docs)
    const userLogs = await ctx.db
      .query("appealAuditLogs")
      .withIndex("by_user_and_timestamp", (q) => q.eq("userId", userId))
      .order("desc")
      .take(limit);

    if (userLogs.length > 0) {
      return userLogs;
    }

    // Graceful fallback for legacy logs created prior to userId index denormalization
    const userClaims = await ctx.db
      .query("claims")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .take(5);

    if (userClaims.length === 0) return [];

    const logsPerClaim = await Promise.all(
      userClaims.map((claim) =>
        ctx.db
          .query("appealAuditLogs")
          .withIndex("by_claim_and_timestamp", (q) => q.eq("claimId", claim._id))
          .order("desc")
          .take(limit)
      )
    );

    return logsPerClaim
      .flat()
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit);
  },
});
