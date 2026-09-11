import { internalMutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getClaimIfAuthorized } from "./lib/auth";

export const pipelineStageValidator = v.union(
  v.literal("run"),
  v.literal("crawl"),
  v.literal("score"),
  v.literal("precedents"),
  v.literal("synthesis")
);

export const pipelineActivityStatusValidator = v.union(
  v.literal("running"),
  v.literal("completed"),
  v.literal("error")
);

// Cap retained events per claim so repeated pipeline runs cannot grow the
// table without bound. A single run emits roughly a dozen events.
const MAX_ACTIVITIES_PER_CLAIM = 150;
const MAX_MESSAGE_CHARS = 500;

/**
 * Append a human-language progress event to a claim's live pipeline activity
 * stream. Messages must be plain English with no PHI and no raw technical
 * dumps (no URLs, JSON, or stack traces).
 */
export const logPipelineActivityInternal = internalMutation({
  args: {
    claimId: v.id("claims"),
    runId: v.string(),
    stage: pipelineStageValidator,
    status: pipelineActivityStatusValidator,
    message: v.string(),
  },
  handler: async (ctx, args) => {
    const message = args.message.trim().slice(0, MAX_MESSAGE_CHARS);
    if (!message) return null;
    const runId = args.runId.trim().slice(0, 128) || "run_unknown";

    const now = Date.now();
    const activityId = await ctx.db.insert("pipelineActivities", {
      claimId: args.claimId,
      runId,
      stage: args.stage,
      status: args.status,
      message,
      createdAt: now,
    });

    // Trim oldest overflow so the stream stays bounded per claim.
    const recent = await ctx.db
      .query("pipelineActivities")
      .withIndex("by_claim", (q) => q.eq("claimId", args.claimId))
      .order("desc")
      .take(MAX_ACTIVITIES_PER_CLAIM + 1);
    if (recent.length > MAX_ACTIVITIES_PER_CLAIM) {
      const overflow = recent.slice(MAX_ACTIVITIES_PER_CLAIM);
      for (const stale of overflow) {
        await ctx.db.delete(stale._id);
      }
    }

    return activityId;
  },
});

/**
 * List a claim's pipeline activity events in chronological order for the
 * live "watch the agent think" feed.
 */
export const listByClaim = query({
  args: {
    claimId: v.id("claims"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const authorized = await getClaimIfAuthorized(ctx, args.claimId);
    if (!authorized) return [];

    const limit = Math.max(1, Math.min(args.limit ?? 80, 100));
    const events = await ctx.db
      .query("pipelineActivities")
      .withIndex("by_claim", (q) => q.eq("claimId", args.claimId))
      .order("desc")
      .take(limit);
    return events.reverse();
  },
});
