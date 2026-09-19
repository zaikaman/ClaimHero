"use node";

import { action } from "../_generated/server";
import { v } from "convex/values";
import { api, internal } from "../_generated/api";
import { appealLevelValidator } from "../lib/statutoryTierValidators";
import { requireClaimOwnerAction } from "../lib/auth";

export interface PipelineResult {
  success: boolean;
  claimId: string;
  workflowId?: string;
  policyTitle?: string;
  clausesExtracted?: number;
  overturnProbabilityScore?: number;
  appealReadinessScore?: number;
  evidenceCoverageScore?: number;
  riskLevel?: string;
  appealId?: string;
  precedentsUnavailable?: boolean;
  cpbDegraded?: boolean;
  status?: string;
  timedOutWaiting?: boolean;
  message?: string;
  evidenceIntegrity?: {
    cpbStatus: "verified" | "fallback_statutory" | "missing";
    precedentStatus: "matched" | "archive_unavailable" | "none_found";
    scoreStatus: "certified" | "provisional_capped" | "withheld";
    degradationWarnings: string[];
    requiresEvidentiaryAcknowledgement: boolean;
  };
  error?: string;
}

/**
 * Evidence Analysis & Appeal Preparation Pipeline Action:
 * Initiates the full end-to-end medical appeal evidence analysis pipeline using the durable
 * Convex workflow engine (@convex-dev/workflow) as the single, unified execution path:
 * 1. Payer Intake Gateway Discovery & Resolution
 * 2. Insurer Clinical Policy Bulletin (CPB) Crawling & Evidence Extraction (Firecrawl)
 * 3. Precedent Vector Search & Statutory Appeal Readiness Scoring
 * 4. Cited ERISA 29 CFR § 2560.503-1 Appeal Brief Synthesis (Human Review Required)
 * 5. Review-Gated Staging: Held in ready_for_review for mandatory human approval before dispatch.
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
    // Authorize before any expensive work: unauthenticated callers are rejected
    // with Unauthorized, and callers without owner/editor access to this claim
    // are rejected with Forbidden (IDOR guard). This protects the downstream
    // Firecrawl/OpenAI spend triggered via startDurablePipelineInternal, which
    // intentionally performs no auth of its own for background execution.
    await requireClaimOwnerAction(ctx, args.claimId);

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
          appealReadinessScore: result.appealReadinessScore ?? result.overturnProbabilityScore,
          evidenceCoverageScore: result.evidenceCoverageScore ?? result.appealReadinessScore ?? result.overturnProbabilityScore,
          overturnProbabilityScore: result.appealReadinessScore ?? result.overturnProbabilityScore,
          riskLevel: result.riskLevel,
          appealId: result.appealId,
          precedentsUnavailable: result.precedentsUnavailable,
          cpbDegraded: result.cpbDegraded,
          status: result.status,
          evidenceIntegrity: result.evidenceIntegrity,
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

    return {
      success: true,
      timedOutWaiting: true,
      claimId: args.claimId,
      workflowId,
      message:
        "Pipeline execution is continuing in the background. Your case radar and workspace will update dynamically upon completion.",
    };
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
    // Fail fast on unauthenticated / unauthorized callers before delegating to
    // the workflow mutation (defense in depth: the mutation re-validates via
    // requireClaimEditor).
    await requireClaimOwnerAction(ctx, args.claimId);
    return await ctx.runMutation(api.workflows.startDurablePipeline, args);
  },
});
