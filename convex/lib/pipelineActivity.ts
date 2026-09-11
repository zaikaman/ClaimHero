import type { ActionCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";

export type PipelineStage = "run" | "crawl" | "score" | "precedents" | "synthesis";
export type PipelineActivityStatus = "running" | "completed" | "error";

/**
 * Append a human-language progress event to the claim's live activity stream.
 * No-op when no run id is provided so manual single-step runs stay quiet.
 * Messages must be plain English with no PHI and no raw technical dumps.
 */
export async function logPipelineActivity(
  ctx: ActionCtx,
  input: {
    claimId: Id<"claims">;
    runId?: string;
    stage: PipelineStage;
    status: PipelineActivityStatus;
    message: string;
  }
): Promise<null> {
  if (!input.runId) return null;
  try {
    await ctx.runMutation(internal.pipelineActivities.logPipelineActivityInternal, {
      claimId: input.claimId,
      runId: input.runId,
      stage: input.stage,
      status: input.status,
      message: input.message,
    });
  } catch (err) {
    // Activity logging must never break the pipeline itself.
    console.warn("Pipeline activity logging note:", err);
  }
  return null;
}
