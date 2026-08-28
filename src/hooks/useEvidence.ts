import { useCallback } from "react";
import { useQuery, useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Claim, ClinicalEvidence, OverturnScoringResult } from "../types";

const convexApi = api as any;

export function useEvidence(claim?: Claim | null) {
  const claimId = claim?._id;

  // Query all evidences for the selected claim
  const rawEvidences = useQuery(
    convexApi.clinicalEvidences.listByClaim,
    claimId ? { claimId: claimId as any } : "skip"
  ) as ClinicalEvidence[] | undefined;

  const crawlPolicyAction = useAction(
    convexApi["actions/policyCrawler"]?.crawlInsurerPolicy ||
    convexApi.actions?.policyCrawler?.crawlInsurerPolicy
  );

  const computeScoreAction = useAction(
    convexApi["actions/precedentMatcher"]?.computeOverturnScore ||
    convexApi.actions?.precedentMatcher?.computeOverturnScore
  );

  const runPipelineAction = useAction(
    convexApi["actions/sentinelPipeline"]?.runAutonomousPipeline ||
    convexApi.actions?.sentinelPipeline?.runAutonomousPipeline
  );

  // Trigger Firecrawl policy crawler with claim parameters
  const crawlPolicy = useCallback(
    async (targetClaimId?: string, customPolicyUrl?: string) => {
      const activeClaimId = targetClaimId || claim?._id;
      if (!activeClaimId) throw new Error("No claim specified for policy crawl");

      return await crawlPolicyAction({
        claimId: activeClaimId as any,
        payer: claim?.patient?.insurancePayer || "UnitedHealthcare",
        cptCodes: claim?.cptCodes?.length ? claim.cptCodes : ["27447"],
        icd10Codes: claim?.icd10Codes?.length ? claim.icd10Codes : ["M17.11"],
        denialReasonCode: claim?.denialReasonCode || "CO-50",
        customPolicyUrl,
      });
    },
    [crawlPolicyAction, claim]
  );

  // Trigger Overturn Probability scoring
  const computeOverturnScore = useCallback(
    async (targetClaimId?: string): Promise<OverturnScoringResult> => {
      const activeClaimId = targetClaimId || claim?._id;
      if (!activeClaimId) {
        throw new Error("No claim selected for scoring");
      }
      return await computeScoreAction({
        claimId: activeClaimId as any,
      });
    },
    [computeScoreAction, claim]
  );

  // Run unified complete analysis (Crawl CPB + Compute Score in 1 step)
  const runCompleteAnalysis = useCallback(
    async (targetClaimId?: string, customPolicyUrl?: string) => {
      const activeClaimId = targetClaimId || claim?._id;
      if (!activeClaimId) throw new Error("No claim selected for analysis");

      await crawlPolicy(activeClaimId, customPolicyUrl);
      return await computeOverturnScore(activeClaimId);
    },
    [crawlPolicy, computeOverturnScore, claim]
  );

  // Run full end-to-end autonomous pipeline (Crawl + Score + Synthesize Brief)
  const runFullPipeline = useCallback(
    async (targetClaimId?: string, customPolicyUrl?: string, physicianNotes?: string) => {
      const activeClaimId = targetClaimId || claim?._id;
      if (!activeClaimId) throw new Error("No claim selected for autonomous pipeline");

      if (runPipelineAction) {
        return await runPipelineAction({
          claimId: activeClaimId as any,
          customPolicyUrl,
          physicianNotes,
        });
      } else {
        // Fallback execution
        await crawlPolicy(activeClaimId, customPolicyUrl);
        await computeOverturnScore(activeClaimId);
        return { success: true, claimId: activeClaimId };
      }
    },
    [runPipelineAction, crawlPolicy, computeOverturnScore, claim]
  );

  return {
    evidences: rawEvidences || [],
    isLoadingEvidences: claimId ? rawEvidences === undefined : false,
    crawlPolicy,
    computeOverturnScore,
    runCompleteAnalysis,
    runFullPipeline,
  };
}
