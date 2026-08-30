"use node";

import { action } from "../_generated/server";
import { v } from "convex/values";
import { api } from "../_generated/api";

export interface PipelineResult {
  success: boolean;
  claimId: string;
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
    // 1. Fetch current claim details
    const claim: any = await ctx.runQuery((api as any).claims.getById, {
      claimId: args.claimId,
    });

    if (!claim) {
      throw new Error(`Claim with ID ${args.claimId} not found`);
    }

    const payer = claim.patient?.insurancePayer || "Health Insurer";
    const context = claim.appealContext;
    const sender = args.sender || context?.sender;
    const clinicalFacts = args.clinicalFacts || context?.clinicalFacts;

    if (!sender?.name?.trim() || (!sender.email?.trim() && !sender.phone?.trim())) {
      throw new Error("Complete the sender details before running appeal analysis");
    }
    if (!clinicalFacts) {
      throw new Error("Confirm the available clinical record before running appeal analysis");
    }

    // Auto-resolve payer intake gateway if not yet cached
    if (!claim.payerContact) {
      try {
        await ctx.runAction((api as any).actions.payerContactResolver.resolvePayerGateway, {
          claimId: args.claimId,
          payerName: payer,
        });
      } catch (e) {
        console.warn("Payer gateway auto-resolution note:", e);
      }
    }

    // Step 1: Policy Crawling & Evidence Extraction
    await ctx.runMutation((api as any).claims.updateStatus, {
      claimId: args.claimId,
      status: "analyzing",
      actor: "Autonomous Sentinel Pipeline",
      details: "Step 1/3: Crawling clinical policy bulletins & medical guidelines...",
    });

    const crawlResult: any = await ctx.runAction(
      (api as any).actions.policyCrawler.crawlInsurerPolicy,
      {
        claimId: args.claimId,
        payer,
        cptCodes: claim.cptCodes || [],
        icd10Codes: claim.icd10Codes || [],
        denialReasonCode: claim.denialReasonCode || "CO-50",
        customPolicyUrl: args.customPolicyUrl,
      }
    );

    // Step 2: Precedent Matching & Overturn Probability Scoring
    await ctx.runMutation((api as any).claims.updateStatus, {
      claimId: args.claimId,
      status: "analyzing",
      actor: "Autonomous Sentinel Pipeline",
      details: "Step 2/3: Matching precedent vectors & evaluating 4-pillar overturn score...",
    });

    const scoreResult: any = await ctx.runAction(
      (api as any).actions.precedentMatcher.computeOverturnScore,
      {
        claimId: args.claimId,
      }
    );

    await ctx.runMutation((api as any).claims.updateStatus, {
      claimId: args.claimId,
      status: "precedent_matched",
      actor: "Autonomous Sentinel Pipeline",
      details: "Step 2b/3: Running Convex native vector search against the Precedent Vector Archive...",
    });

    let vectorPrecedents: any[] = [];
    try {
      vectorPrecedents = await ctx.runAction(
        (api as any).actions.precedentArchive.retrieveTopPrecedents,
        { claimId: args.claimId }
      );
    } catch (precedentErr) {
      console.warn("Pipeline vector archive note:", precedentErr);
    }

    // Step 3: Formal ERISA Appeal Brief Synthesis
    await ctx.runMutation((api as any).claims.updateStatus, {
      claimId: args.claimId,
      status: "drafting",
      actor: "Autonomous Sentinel Pipeline",
      details: "Step 3/3: Synthesizing cited ERISA & clinical appeal brief...",
    });

    const synthesisResult: any = await ctx.runAction(
      (api as any).actions.appealSynthesizer.generateAppealBrief,
      {
        claimId: args.claimId,
        appealLevel: args.appealLevel || "level_1_internal",
        physicianNotes: args.physicianNotes,
        senderName: sender.name,
        senderCredentials: sender.credentials,
        senderEmail: sender.email,
        senderPhone: sender.phone,
        clinicalFacts,
        vectorPrecedents,
      }
    );

    // Step 4: Final status update to ready_for_review
    await ctx.runMutation((api as any).claims.updateStatus, {
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
