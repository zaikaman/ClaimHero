"use node";

import { action } from "../_generated/server";
import { v } from "convex/values";
import { api, internal } from "../_generated/api";
import { appealLevelValidator } from "../lib/statutoryTierValidators";

export interface PipelineResult {
  success: boolean;
  claimId: string;
  workflowId?: string;
  policyTitle?: string;
  clausesExtracted?: number;
  overturnProbabilityScore?: number;
  riskLevel?: string;
  appealId?: string;
  precedentsUnavailable?: boolean;
  error?: string;
}

/**
 * Autonomous Sentinel Master Pipeline Action:
 * Initiates the full end-to-end medical appeal pipeline using the durable
 * Convex workflow engine (@convex-dev/workflow) as the single, unified execution path:
 * 1. Payer Intake Gateway Discovery & Resolution
 * 2. Insurer Clinical Policy Bulletin (CPB) Crawling & Evidence Extraction (Firecrawl)
 * 3. Precedent Vector Search & Overturn Probability Scoring
 * 4. Cited ERISA 29 CFR § 2560.503-1 Legal Appeal Brief Synthesis
 * 5. Optional Auto-Pilot Transmission & Statutory Follow-Up Countdown (step.sleep)
 */
export const runAutonomousPipeline = action({
  args: {
    claimId: v.id("claims"),
    customPolicyUrl: v.optional(v.string()),
    physicianNotes: v.optional(v.string()),
    appealLevel: v.optional(appealLevelValidator),
    useDurableWorkflow: v.optional(v.boolean()), // Preserved for backwards compatibility; durable is now the only path
    waitForCompletion: v.optional(v.boolean()), // Defaults to true; caller awaits the full synthesis process
    sender: v.optional(
      v.object({
        name: v.string(),
        credentials: v.optional(v.string()),
        email: v.optional(v.string()),
        phone: v.optional(v.string()),
      })
    ),
    clinicalFacts: v.optional(
      v.object({
        symptomsAndFunctionalImpact: v.optional(v.string()),
        examinationFindings: v.optional(v.string()),
        imagingAndDiagnostics: v.optional(v.string()),
        treatmentHistoryAndResponse: v.optional(v.string()),
        otherDocumentedFacts: v.optional(v.string()),
        recordsAreIncomplete: v.boolean(),
      })
    ),
    autoDispatch: v.optional(v.boolean()),
    followUpCadenceDays: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<PipelineResult> => {
    // Durable @convex-dev/workflow is the single, unified execution architecture.
    const res = await ctx.runMutation(internal.workflows.startDurablePipelineInternal, {
      claimId: args.claimId,
      customPolicyUrl: args.customPolicyUrl,
      physicianNotes: args.physicianNotes,
      appealLevel: args.appealLevel,
      sender: args.sender,
      clinicalFacts: args.clinicalFacts,
      autoDispatch: args.autoDispatch,
      followUpCadenceDays: args.followUpCadenceDays,
    });

    const workflowId = res.workflowId;

    // If running in a mock/test environment without ctx.runQuery, or if caller explicitly opts out of awaiting
    if (!ctx.runQuery || args.waitForCompletion === false) {
      return {
        success: true,
        claimId: args.claimId,
        workflowId,
      };
    }

    // Await completion of the durable workflow so the UI generation flow waits for full synthesis
    const startTime = Date.now();
    const TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes max

    while (Date.now() - startTime < TIMEOUT_MS) {
      const status = await ctx.runQuery(
        internal.workflows.getWorkflowStatusDirectInternal,
        { workflowId }
      );

      if (status && status.type === "completed") {
        const result = (status.result || {}) as Partial<PipelineResult>;
        return {
          success: true,
          claimId: args.claimId,
          workflowId,
          policyTitle: result.policyTitle,
          clausesExtracted: result.clausesExtracted,
          overturnProbabilityScore: result.overturnProbabilityScore,
          riskLevel: result.riskLevel,
          appealId: result.appealId,
          precedentsUnavailable: result.precedentsUnavailable,
        };
      }

      if (status && status.type === "failed") {
        throw new Error(status.error || "Durable workflow pipeline execution failed");
      }

      if (status && status.type === "canceled") {
        throw new Error("Durable workflow pipeline execution was canceled");
      }

      // Poll interval: 1 second
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    throw new Error("Durable workflow pipeline execution timed out after 5 minutes");
  },
});

/**
 * Action wrapper to initiate the durable Convex workflow pipeline
 */
export const startDurablePipelineAction = action({
  args: {
    claimId: v.id("claims"),
    customPolicyUrl: v.optional(v.string()),
    physicianNotes: v.optional(v.string()),
    appealLevel: v.optional(appealLevelValidator),
    sender: v.optional(
      v.object({
        name: v.string(),
        credentials: v.optional(v.string()),
        email: v.optional(v.string()),
        phone: v.optional(v.string()),
      })
    ),
    clinicalFacts: v.optional(
      v.object({
        symptomsAndFunctionalImpact: v.optional(v.string()),
        examinationFindings: v.optional(v.string()),
        imagingAndDiagnostics: v.optional(v.string()),
        treatmentHistoryAndResponse: v.optional(v.string()),
        otherDocumentedFacts: v.optional(v.string()),
        recordsAreIncomplete: v.boolean(),
      })
    ),
    autoDispatch: v.optional(v.boolean()),
    followUpCadenceDays: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<{ workflowId: string; claimId: string }> => {
    return await ctx.runMutation(api.workflows.startDurablePipeline, args);
  },
});
