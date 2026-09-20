"use node";

import { action } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { requireClaimOwnerAction, requireAuthUser } from "../lib/auth";
import { actionRetrier, executeActionWithRetry } from "../lib/retrier";
import { crawlInsurerPolicyArgs } from "./policyCrawler";
import { dispatchAppealPacketArgs } from "./mailDispatcher";
import type { RunId, RunStatus } from "@convex-dev/action-retrier";

/**
 * Adversarially resilient policy crawler:
 * Wraps the Firecrawl crawler in ActionRetrier with exponential backoff and jitter.
 * If an insurer website (UHC, Cigna, CMS portal) returns 503 Service Unavailable,
 * transient gateway timeout, or Cloudflare challenge, it automatically retries with backoff.
 */
export const crawlInsurerPolicyWithRetry = action({
  args: crawlInsurerPolicyArgs,
  handler: async (ctx, args): Promise<unknown> => {
    await requireClaimOwnerAction(ctx, args.claimId);
    return await executeActionWithRetry(
      ctx,
      internal.actions.policyCrawler.crawlInsurerPolicyInternal,
      args,
      {
        maxFailures: 4,
        initialBackoffMs: 1500,
        timeoutMs: 120_000,
      }
    );
  },
});

/**
 * Resilient policy crawl trigger that returns a runId immediately
 * for non-blocking asynchronous execution.
 */
export const enqueueCrawlWithRetry = action({
  args: crawlInsurerPolicyArgs,
  handler: async (ctx, args): Promise<{ runId: string; status: string }> => {
    await requireClaimOwnerAction(ctx, args.claimId);
    const runId = await actionRetrier.run(
      ctx,
      internal.actions.policyCrawler.crawlInsurerPolicyInternal,
      args,
      {
        maxFailures: 4,
        initialBackoffMs: 1500,
      }
    );
    return { runId: runId as string, status: "enqueued" };
  },
});

/**
 * Adversarially resilient AgentMail appeal packet dispatcher:
 * Wraps appeal transmission in ActionRetrier with exponential backoff and jitter.
 * Prevents transient SMTP/AgentMail gateway timeouts from crashing the pipeline
 * right before a strict statutory filing deadline.
 */
export const dispatchAppealPacketWithRetry = action({
  args: dispatchAppealPacketArgs,
  handler: async (ctx, args): Promise<unknown> => {
    await requireClaimOwnerAction(ctx, args.claimId);
    return await executeActionWithRetry(
      ctx,
      internal.actions.mailDispatcher.dispatchAppealPacketInternal,
      args,
      {
        maxFailures: 4,
        initialBackoffMs: 1500,
        timeoutMs: 90_000,
      }
    );
  },
});

/**
 * Resilient appeal dispatch trigger that returns a runId immediately.
 */
export const enqueueDispatchWithRetry = action({
  args: dispatchAppealPacketArgs,
  handler: async (ctx, args): Promise<{ runId: string; status: string }> => {
    await requireClaimOwnerAction(ctx, args.claimId);
    const runId = await actionRetrier.run(
      ctx,
      internal.actions.mailDispatcher.dispatchAppealPacketInternal,
      args,
      {
        maxFailures: 4,
        initialBackoffMs: 1500,
      }
    );
    return { runId: runId as string, status: "enqueued" };
  },
});

/**
 * Query the status of an ongoing or completed retried action run.
 */
export const getRetriedActionStatus = action({
  args: {
    runId: v.string(),
  },
  handler: async (ctx, args): Promise<RunStatus> => {
    await requireAuthUser(ctx);
    const status = await actionRetrier.status(ctx, args.runId as RunId);
    return status;
  },
});
