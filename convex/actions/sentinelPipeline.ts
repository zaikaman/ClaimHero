"use node";

import { action } from "../_generated/server";
import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { api, internal } from "../_generated/api";
import { rateLimiter } from "../lib/rateLimiter";
import { requireClaimOwnerAction } from "../lib/auth";
import { ERISA_STATUTORY_EVIDENCE } from "./policyCrawler";

export interface PipelineResult {
  success: boolean;
  claimId: string;
  workflowId?: string;
  policyTitle?: string;
  clausesExtracted?: number;
  overturnProbabilityScore?: number;
  riskLevel?: string;
  appealId?: string;
  error?: string;
}

/**
 * Autonomous Sentinel Master Pipeline Action:
 * Sequentially executes the full end-to-end medical appeal workflow:
 * 1. Crawl Insurer Clinical Policy Bulletin (Firecrawl / Knowledge Base)
 * 2. Match precedents & compute 4-pillar Overturn Probability Score
 * 3. Synthesize cited ERISA 29 CFR § 2560.503-1 Appeal Brief
 * 4. Update status to 'ready_for_review' with audit trail
 */
export const runAutonomousPipeline = action({
  args: {
    claimId: v.id("claims"),
    customPolicyUrl: v.optional(v.string()),
    physicianNotes: v.optional(v.string()),
    appealLevel: v.optional(v.string()),
    useDurableWorkflow: v.optional(v.boolean()),
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
  },
  handler: async (ctx, args): Promise<PipelineResult> => {
    if (args.useDurableWorkflow) {
      const res = await ctx.runMutation(api.workflows.startDurablePipeline, {
        claimId: args.claimId,
        customPolicyUrl: args.customPolicyUrl,
        physicianNotes: args.physicianNotes,
        appealLevel: args.appealLevel,
        sender: args.sender,
        clinicalFacts: args.clinicalFacts,
      });
      return {
        success: true,
        claimId: args.claimId,
        workflowId: res.workflowId,
      };
    }

    // 1. Fetch and authorize claim ownership
    const { claim, userId } = await requireClaimOwnerAction(ctx, args.claimId);

    // Enforce rate limiting per user
    const limitStatus = await rateLimiter.limit(ctx, "sentinelPipeline", {
      key: userId || "global",
    });
    if (!limitStatus.ok) {
      throw new Error(
        `Rate limit reached for autonomous pipeline execution. Please retry in ${Math.ceil((limitStatus.retryAfter || 1000) / 1000)} seconds.`
      );
    }

    const payer = claim.patient?.insurancePayer || "Health Insurer";
    const context = claim.appealContext;
    const sender = args.sender || context?.sender;
    const clinicalFacts = args.clinicalFacts || context?.clinicalFacts;
    const physicianNotes = args.physicianNotes || context?.physicianNotes;

    if (!sender?.name?.trim() || (!sender.email?.trim() && !sender.phone?.trim())) {
      throw new Error("Complete sender details before drafting");
    }

    // Auto-resolve payer intake gateway if not yet cached
    if (!claim.payerContact) {
      try {
        await ctx.runAction(api.actions.payerContactResolver.resolvePayerGateway, {
          claimId: args.claimId,
          payerName: payer,
        });
      } catch (e) {
        console.warn("Payer gateway auto-resolution note:", e);
      }
    }

    // Step 1: Policy Crawling & Evidence Extraction
    await ctx.runMutation(internal.claims.updateStatusInternal, {
      claimId: args.claimId,
      status: "analyzing",
      actor: "Autonomous Sentinel Pipeline",
      details: "Step 1/3: Crawling clinical policy bulletins & medical guidelines...",
    });

    let crawlResult: { policyTitle?: string; clausesExtracted?: number } | null = null;
    try {
      crawlResult = await ctx.runAction(
        api.actions.policyCrawler.crawlInsurerPolicy,
        {
          claimId: args.claimId,
          payer,
          cptCodes: claim.cptCodes || [],
          icd10Codes: claim.icd10Codes || [],
          denialReasonCode: claim.denialReasonCode || "CO-50",
          denialReasonDescription: claim.denialReasonDescription || "",
          customPolicyUrl: args.customPolicyUrl,
          serviceDate: claim.serviceDate,
        }
      );
    } catch (crawlError) {
      const crawlMessage = crawlError instanceof Error ? crawlError.message : String(crawlError);
      // Check if clinical evidences already exist for this claim (preserved via clear-after-success).
      // If none exist (e.g. brand new claim where crawl failed due to 429/WAF), insert the statutory ERISA fallback.
      const existingEvidences = await ctx.runQuery(
        internal.clinicalEvidences.listByClaimInternal,
        { claimId: args.claimId }
      );
      if (existingEvidences.length === 0) {
        try {
          await ctx.runMutation(internal.clinicalEvidences.insertBatchInternal, {
            claimId: args.claimId,
            evidences: [{ ...ERISA_STATUTORY_EVIDENCE }],
          });
        } catch (e) {
          console.warn("Fallback ERISA insertion note:", e);
        }
      }
      await ctx.runMutation(internal.claims.updateStatusInternal, {
        claimId: args.claimId,
        status: "analyzing",
        actor: "Autonomous Sentinel Pipeline",
        details: `Policy crawl unavailable: ${crawlMessage}. Proceeding with ${existingEvidences.length > 0 ? "retained clinical evidence and " : ""}statutory precedent.`,
      });
      crawlResult = {
        policyTitle: existingEvidences.length > 0
          ? "Retained existing clinical evidence (live crawler fallback applied)"
          : "No publicly accessible policy source (ERISA statutory protocol applied)",
        clausesExtracted: Math.max(existingEvidences.length, 1),
      };
    }

    // Step 2: Precedent Matching & Overturn Probability Scoring
    await ctx.runMutation(internal.claims.updateStatusInternal, {
      claimId: args.claimId,
      status: "analyzing",
      actor: "Autonomous Sentinel Pipeline",
      details: "Step 2/3: Matching precedent vectors & evaluating 4-pillar overturn score...",
    });

    const scoreResult = await ctx.runAction(
      api.actions.precedentMatcher.computeOverturnScore,
      {
        claimId: args.claimId,
      }
    );

    await ctx.runMutation(internal.claims.updateStatusInternal, {
      claimId: args.claimId,
      status: "precedent_matched",
      actor: "Autonomous Sentinel Pipeline",
      details: "Step 2b/3: Running Convex native vector search against the Precedent Vector Archive...",
    });

    let vectorPrecedents: Array<{
      _id: Id<"precedents">;
      sourceKind: string;
      title: string;
      citation: string;
      jurisdiction: string;
      sourceUrl?: string;
      icd10Codes: string[];
      cptCodes: string[];
      carcCodes: string[];
      winningArgument: string;
      statutoryLanguage: string;
      outcome: string;
      vectorScore: number;
      combinedScore: number;
      codeOverlap: number;
    }> = [];
    try {
      vectorPrecedents = await ctx.runAction(
        api.actions.precedentArchive.retrieveTopPrecedents,
        { claimId: args.claimId }
      );
    } catch (precedentErr) {
      console.warn("Pipeline vector archive note:", precedentErr);
    }

    // Step 3: Formal ERISA Appeal Brief Synthesis
    await ctx.runMutation(internal.claims.updateStatusInternal, {
      claimId: args.claimId,
      status: "drafting",
      actor: "Autonomous Sentinel Pipeline",
      details: "Step 3/3: Synthesizing cited ERISA & clinical appeal brief...",
    });

    const synthesisResult = await ctx.runAction(
      api.actions.appealSynthesizer.generateAppealBrief,
      {
        claimId: args.claimId,
        appealLevel: args.appealLevel || "level_1_internal",
        physicianNotes,
        senderName: sender.name,
        senderCredentials: sender.credentials,
        senderEmail: sender.email,
        senderPhone: sender.phone,
        clinicalFacts,
        vectorPrecedents,
      }
    );

    // Step 4: Final status update to ready_for_review
    await ctx.runMutation(internal.claims.updateStatusInternal, {
      claimId: args.claimId,
      status: "ready_for_review",
      actor: "Autonomous Sentinel Pipeline",
      details: `Autonomous pipeline completed: ${crawlResult?.clausesExtracted || 0} evidence clauses indexed, ${scoreResult?.overturnProbabilityScore || 0}% win likelihood score computed, and formal brief synthesized. Ready for dispatch.`,
      overturnProbabilityScore: scoreResult?.overturnProbabilityScore,
      riskLevel: scoreResult?.riskLevel,
      scoringBreakdown: scoreResult?.scoringBreakdown,
    });

    return {
      success: true,
      claimId: args.claimId,
      policyTitle: crawlResult?.policyTitle,
      clausesExtracted: crawlResult?.clausesExtracted,
      overturnProbabilityScore: scoreResult?.overturnProbabilityScore,
      riskLevel: scoreResult?.riskLevel,
      appealId: synthesisResult?.appealId,
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
    appealLevel: v.optional(v.string()),
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
