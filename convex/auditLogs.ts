import { mutation, query, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { getClaimIfAuthorized, requireClaimEditor, getAuthUserId } from "./lib/auth";

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

    const limit = Math.max(1, Math.min(args.limit ?? 100, 100));

    return await ctx.db
      .query("appealAuditLogs")
      .withIndex("by_claim_and_timestamp", (q) => q.eq("claimId", args.claimId))
      .order("desc")
      .take(limit);
  },
});

/**
 * Computes deterministic audit log idempotency key (claimId:eventType:day)
 * to prevent retry storms from sweeps, crons, and webhooks.
 */
export function computeAuditIdempotencyKey(
  claimId: string,
  eventType: string,
  timestamp: number = Date.now()
): string {
  const day = new Date(timestamp).toISOString().slice(0, 10);
  return `${claimId}:${eventType}:${day}`;
}

/**
 * Append an event to the case audit log, checking claim ownership
 */
export const logEvent = mutation({
  args: {
    claimId: v.id("claims"),
    eventType: v.string(),
    actor: v.string(),
    details: v.string(),
    idempotencyKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireClaimEditor(ctx, args.claimId);

    const eventType = args.eventType.trim();
    if (!eventType || eventType.length > 64) {
      throw new Error("Invalid eventType: must be a non-empty string under 64 characters");
    }
    const actor = args.actor.trim();
    if (!actor || actor.length > 128) {
      throw new Error("Invalid actor: must be a non-empty string under 128 characters");
    }
    const details = args.details.trim();
    if (details.length > 4000) {
      throw new Error("Invalid details: exceeds 4,000 character limit");
    }

    const timestamp = Date.now();
    const effectiveKey =
      args.idempotencyKey ||
      (eventType.startsWith("statutory_alarm") || eventType.includes("alarm")
        ? computeAuditIdempotencyKey(args.claimId, eventType, timestamp)
        : undefined);

    if (effectiveKey && typeof ctx.db.query === "function") {
      try {
        const existing = await ctx.db
          .query("appealAuditLogs")
          .withIndex("by_idempotency_key", (q) => q.eq("idempotencyKey", effectiveKey))
          .first();
        if (existing) {
          return existing._id;
        }
      } catch {
        // Safe fallback for mock runners without idempotency index
      }
    }

    const logId = await ctx.db.insert("appealAuditLogs", {
      claimId: args.claimId,
      userId,
      eventType,
      actor,
      details,
      timestamp,
      idempotencyKey: effectiveKey,
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
    idempotencyKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const timestamp = Date.now();
    const claim = typeof ctx.db.get === "function" ? await ctx.db.get(args.claimId) : null;
    const resolvedUserId = args.userId || claim?.userId;

    const effectiveKey =
      args.idempotencyKey ||
      (args.eventType.startsWith("statutory_alarm") || args.eventType.includes("alarm")
        ? computeAuditIdempotencyKey(args.claimId, args.eventType, timestamp)
        : undefined);

    if (effectiveKey && typeof ctx.db.query === "function") {
      try {
        const existing = await ctx.db
          .query("appealAuditLogs")
          .withIndex("by_idempotency_key", (q) => q.eq("idempotencyKey", effectiveKey))
          .first();
        if (existing) {
          return existing._id;
        }
      } catch {
        // Safe fallback for mock runners
      }
    }

    return await ctx.db.insert("appealAuditLogs", {
      claimId: args.claimId,
      ...(resolvedUserId ? { userId: resolvedUserId } : {}),
      eventType: args.eventType,
      actor: args.actor,
      details: args.details,
      timestamp,
      idempotencyKey: effectiveKey,
    });
  },
});

/**
 * List the most recent audit events strictly across the authenticated user's claims.
 * Filters out tombstoned records by default to keep active portfolio dashboards clean.
 */
export const listRecent = query({
  args: {
    limit: v.optional(v.number()),
    includeTombstoned: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    const limit = Math.min(Math.max(1, args.limit ?? 15), 20);

    // Primary fast path: single index scan via by_user_and_timestamp
    const userLogs = await ctx.db
      .query("appealAuditLogs")
      .withIndex("by_user_and_timestamp", (q) => q.eq("userId", userId))
      .order("desc")
      .take(args.includeTombstoned ? limit : limit * 2);

    const filtered = args.includeTombstoned
      ? userLogs
      : userLogs.filter((log) => !log.isTombstoned);

    if (filtered.length > 0) {
      return filtered.slice(0, limit);
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

    const combined = logsPerClaim
      .flat()
      .filter((log) => args.includeTombstoned || !log.isTombstoned)
      .sort((a, b) => b.timestamp - a.timestamp);

    return combined.slice(0, limit);
  },
});

/**
 * List sealed and tombstoned audit records for ERISA § 503 statutory compliance and regulatory inspection.
 */
export const listTombstoned = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    const limit = Math.min(Math.max(1, args.limit ?? 20), 50);

    const userLogs = await ctx.db
      .query("appealAuditLogs")
      .withIndex("by_user_and_timestamp", (q) => q.eq("userId", userId))
      .order("desc")
      .take(limit * 3);

    return userLogs.filter((log) => Boolean(log.isTombstoned)).slice(0, limit);
  },
});
