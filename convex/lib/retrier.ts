import { ActionRetrier, type RunId, type RunStatus } from "@convex-dev/action-retrier";
import { components } from "../_generated/api";
import type { ActionCtx } from "../_generated/server";
import type { FunctionReference, FunctionArgs, FunctionVisibility } from "convex/server";

/**
 * Shared ActionRetrier component instance for ClaimHero.
 * Configured with exponential backoff and jitter to withstand adversarial
 * insurer portal outages (e.g. 503 Service Unavailable, Cloudflare challenges,
 * and gateway timeouts) as well as transient AgentMail transport failures.
 */
export const actionRetrier = new ActionRetrier(components.actionRetrier, {
  initialBackoffMs: 1000,
  base: 2,
  maxFailures: 4,
});

export interface RetriedExecutionResult<T = unknown> {
  success: boolean;
  runId: RunId;
  returnValue?: T;
  error?: string;
}

/**
 * Execute an action with ActionRetrier and await its final result.
 * Automatically polls until the retried run succeeds or exhausts maxFailures,
 * cleans up the run database record, and returns the result.
 */
export async function executeActionWithRetry<
  F extends FunctionReference<"action", FunctionVisibility, Record<string, unknown>, unknown>
>(
  ctx: ActionCtx,
  reference: F,
  args: FunctionArgs<F>,
  options?: {
    timeoutMs?: number;
    pollIntervalMs?: number;
    maxFailures?: number;
    initialBackoffMs?: number;
  }
): Promise<unknown> {
  const timeoutMs = options?.timeoutMs ?? 60_000;
  const pollIntervalMs = options?.pollIntervalMs ?? 1_000;

  const runId = await actionRetrier.run(ctx, reference, args, {
    maxFailures: options?.maxFailures ?? 4,
    initialBackoffMs: options?.initialBackoffMs ?? 1000,
  });

  const startTime = Date.now();

  try {
    while (Date.now() - startTime < timeoutMs) {
      const status: RunStatus = await actionRetrier.status(ctx, runId);
      if (status.type === "completed") {
        if (status.result.type === "success") {
          return status.result.returnValue;
        } else if (status.result.type === "failed") {
          throw new Error(`Retried action failed after attempts: ${status.result.error}`);
        } else {
          throw new Error("Retried action was canceled.");
        }
      }
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }
    throw new Error(`Retried action timed out after ${timeoutMs}ms.`);
  } finally {
    try {
      await actionRetrier.cleanup(ctx, runId);
    } catch {
      // Ignore cleanup error if already removed
    }
  }
}
