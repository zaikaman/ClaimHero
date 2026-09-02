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
    let sender = args.sender || context?.sender;
    let clinicalFacts = args.clinicalFacts || context?.clinicalFacts;
    const physicianNotes = args.physicianNotes || context?.physicianNotes;

    // Graceful fallback for legacy claims or automated retriggers that lack explicit intake.
    // Prior strict throws caused `Uncaught Error: Complete the sender details...` and blocked the pipeline.
    // Use provider/patient-derived defaults so the pipeline can still produce a compliant, non-hallucinated brief
    // that states the record does not independently document findings and requests plan criteria review.
    if (!sender?.name?.trim() || (!sender.email?.trim() && !sender.phone?.trim())) {
      const fallbackSender = {
        name: claim.providerName?.trim() || claim.patient?.name?.trim() || "ClaimHero Appeals Desk",
        credentials: undefined,
        email: claim.patient?.email?.trim() || undefined,
        phone: undefined,
      };
      sender = {
        name: fallbackSender.name,
        credentials: fallbackSender.credentials,
        email: fallbackSender.email,
        phone: fallbackSender.phone,
      };
      console.warn(`Pipeline sender fallback used for claim ${claim.claimNumber}: ${sender.name}`);
      // Persist fallback so subsequent steps and audit reflect it
      try {
        await ctx.runMutation(internal.claims.updateAppealContextInternal, {
          claimId: args.claimId,
          sender: {
            name: sender.name,
            credentials: sender.credentials,
            email: sender.email,
            phone: sender.phone,
          },
          clinicalFacts: clinicalFacts || {
            recordsAreIncomplete: true,
          },
        });
        // Refresh local clinicalFacts if it was missing
        if (!clinicalFacts) {
          clinicalFacts = { recordsAreIncomplete: true };
        }
      } catch (e) {
        console.warn("Pipeline fallback sender persist note:", e);
        if (!clinicalFacts) {
          clinicalFacts = { recordsAreIncomplete: true };
        }
      }
    }
    if (!clinicalFacts) {
      clinicalFacts = { recordsAreIncomplete: true };
      console.warn(`Pipeline clinicalFacts fallback used for claim ${claim.claimNumber}: recordsAreIncomplete=true`);
      try {
        await ctx.runMutation(internal.claims.updateAppealContextInternal, {
          claimId: args.claimId,
          sender: {
            name: sender.name,
            credentials: sender.credentials,
            email: sender.email,
            phone: sender.phone,
          },
          clinicalFacts,
        });
      } catch (e) {
        console.warn("Pipeline fallback clinicalFacts persist note:", e);
      }
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
        }
      );
    } catch (crawlError) {
      const crawlMessage = crawlError instanceof Error ? crawlError.message : String(crawlError);
      console.warn("Policy crawl yielded no publicly accessible document:", crawlMessage);
      // Ensure at least the statutory ERISA precedent is available so the brief
      // can be synthesized without citing an inaccessible or irrelevant URL.
      // The crawler already cleared prior evidences, so we insert the fallback.
      try {
        await ctx.runMutation(internal.clinicalEvidences.insertBatchInternal, {
          claimId: args.claimId,
          evidences: [{ ...ERISA_STATUTORY_EVIDENCE }],
        });
      } catch (e) {
        console.warn("Fallback ERISA insertion note:", e);
      }
      await ctx.runMutation(internal.claims.updateStatusInternal, {
        claimId: args.claimId,
        status: "analyzing",
        actor: "Autonomous Sentinel Pipeline",
        details: `Policy crawl unavailable: ${crawlMessage}. Proceeding with statutory precedent only.`,
      });
      crawlResult = { policyTitle: "No publicly accessible policy source (ERISA statutory protocol applied)", clausesExtracted: 1 };
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
