import { Workpool } from "@convex-dev/workpool";
import { components } from "../_generated/api";

/**
 * High-volume RCM clinic bulk denial intake workpool:
 * Enforces a strict concurrency limit (maxParallelism: 3) so that simultaneous
 * Monday morning clinic uploads (e.g. 40 denial PDFs at once) do not exhaust
 * OpenAI Tokens-Per-Minute (TPM) limits or trigger Node memory spikes.
 */
export const intakeWorkpool = new Workpool(components.workpool, {
  maxParallelism: 3,
  retryActionsByDefault: true,
  defaultRetryBehavior: {
    initialBackoffMs: 1500,
    base: 2,
    maxAttempts: 3,
  },
});
