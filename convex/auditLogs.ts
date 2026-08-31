import { mutation, query, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { getClaimIfAuthorized, requireClaimOwner } from "./lib/auth";

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
      .withIndex("by_claim_and_timestamp", (q: any) => q.eq("claimId", args.claimId))
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
    await requireClaimOwner(ctx, args.claimId);

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
 * List the most recent audit events strictly across the authenticated user's claims
 */
export const listRecent = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    const limit = args.limit || 15;

    const userClaims = await ctx.db
      .query("claims")
      .withIndex("by_user", (q: any) => q.eq("userId", userId))
      .collect();

    if (userClaims.length === 0) return [];

    // Focus on active/recent claims if user has many
    const activeClaims = userClaims
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
      .slice(0, 30);

    // Fetch indexed recent logs for each claim in parallel
    const logsPerClaim = await Promise.all(
      activeClaims.map((claim) =>
        ctx.db
          .query("appealAuditLogs")
          .withIndex("by_claim_and_timestamp", (q: any) => q.eq("claimId", claim._id))
          .order("desc")
          .take(limit)
      )
    );

    const mergedLogs = logsPerClaim.flat();

    return mergedLogs
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit);
  },
});
