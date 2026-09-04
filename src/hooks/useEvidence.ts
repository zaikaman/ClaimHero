import { useCallback } from "react";
import { useQuery, useAction, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Claim, ClinicalEvidence, OverturnScoringResult } from "../types";
import { Id } from "../../convex/_generated/dataModel";

export function useEvidence(claim?: Claim | null, options?: { enabled?: boolean }) {
  const isEnabled = options?.enabled !== false;
  const claimId = claim?._id as Id<"claims"> | undefined;

  // Query all evidences for the selected claim
  const rawEvidences = useQuery(
    api.clinicalEvidences.listByClaim,
    isEnabled && claimId ? { claimId } : "skip"
  ) as ClinicalEvidence[] | undefined;

  // Query summary breakdown of evidence sources
  const sourcesSummary = useQuery(
    api.clinicalEvidences.listSourcesSummary,
    isEnabled && claimId ? { claimId } : "skip"
  );

  const crawlPolicyAction = useAction(api.actions.policyCrawler.crawlInsurerPolicy);
  const crawlPubMedAction = useAction(api.actions.policyCrawler.crawlPubMedAndTrials);
  const crawlFdaAction = useAction(api.actions.policyCrawler.crawlFdaIndications);
  const crawlCustomUrlAction = useAction(api.actions.policyCrawler.crawlCustomResearchUrl);
  const crawlMultiSourceHubAction = useAction(api.actions.policyCrawler.crawlMultiSourceHub);
  const computeScoreAction = useAction(api.actions.precedentMatcher.computeOverturnScore);
  const runPipelineAction = useAction(api.actions.sentinelPipeline.runAutonomousPipeline);
  const deleteEvidenceMutation = useMutation(api.clinicalEvidences.deleteEvidence);
  const insertSingleEvidenceMutation = useMutation(api.clinicalEvidences.insertSingle);
  const startDurablePipelineMutation = useMutation(api.workflows.startDurablePipeline);
  const cancelDurableWorkflowMutation = useMutation(api.workflows.cancelDurableWorkflow);
  const startStatutoryCountdownMutation = useMutation(api.workflows.startStatutoryCountdown);

  // Real-time reactive query tracking durable workflow execution status
  const workflowExecutionStatus = useQuery(
    api.workflows.getWorkflowExecutionStatus,
    isEnabled && claimId ? { claimId } : "skip"
  );

  // Trigger Firecrawl policy crawler with claim parameters
  const crawlPolicy = useCallback(
    async (targetClaimId?: string, customPolicyUrl?: string) => {
      const activeClaimId = (targetClaimId || claim?._id) as Id<"claims"> | undefined;
      if (!activeClaimId) throw new Error("No claim specified for policy crawl");

      return await crawlPolicyAction({
        claimId: activeClaimId,
        payer: claim?.patient?.insurancePayer || "Molina Healthcare",
        cptCodes: claim?.cptCodes?.length ? claim.cptCodes : ["27447"],
        icd10Codes: claim?.icd10Codes?.length ? claim.icd10Codes : ["M17.11"],
        denialReasonCode: claim?.denialReasonCode || "CO-50",
        denialReasonDescription: claim?.denialReasonDescription,
        customPolicyUrl,
      });
    },
    [crawlPolicyAction, claim]
  );

  // Trigger PubMed & ClinicalTrials.gov scraper
  const crawlPubMed = useCallback(
    async (targetClaimId?: string, customQuery?: string, customUrl?: string) => {
      const activeClaimId = (targetClaimId || claim?._id) as Id<"claims"> | undefined;
      if (!activeClaimId) throw new Error("No claim specified for PubMed research");

      return await crawlPubMedAction({
        claimId: activeClaimId,
        cptCodes: claim?.cptCodes?.length ? claim.cptCodes : ["27447"],
        icd10Codes: claim?.icd10Codes?.length ? claim.icd10Codes : ["M17.11"],
        denialReasonCode: claim?.denialReasonCode || "CO-50",
        denialReasonDescription: claim?.denialReasonDescription,
        customQuery,
        customUrl,
      });
    },
    [crawlPubMedAction, claim]
  );

  // Trigger FDA package insert & indication crawler
  const crawlFda = useCallback(
    async (targetClaimId?: string, customUrl?: string, drugOrDeviceName?: string) => {
      const activeClaimId = (targetClaimId || claim?._id) as Id<"claims"> | undefined;
      if (!activeClaimId) throw new Error("No claim specified for FDA indication research");

      return await crawlFdaAction({
        claimId: activeClaimId,
        cptCodes: claim?.cptCodes?.length ? claim.cptCodes : ["27447"],
        icd10Codes: claim?.icd10Codes?.length ? claim.icd10Codes : ["M17.11"],
        denialReasonCode: claim?.denialReasonCode || "CO-50",
        customUrl,
        drugOrDeviceName,
      });
    },
    [crawlFdaAction, claim]
  );

  // Trigger Custom URL guideline scraper
  const crawlCustomUrl = useCallback(
    async (
      targetClaimId: string,
      customUrl: string,
      sourceCategory: string = "payer_cpb",
      clinicalNotes?: string
    ) => {
      const activeClaimId = (targetClaimId || claim?._id) as Id<"claims"> | undefined;
      if (!activeClaimId) throw new Error("No claim specified for custom URL scraping");

      return await crawlCustomUrlAction({
        claimId: activeClaimId,
        customUrl,
        sourceCategory,
        clinicalNotes,
      });
    },
    [crawlCustomUrlAction, claim]
  );

  // Trigger full Multi-Source Sentinel Hub crawl (Insurer CPB + PubMed + FDA)
  const crawlMultiSourceHub = useCallback(
    async (targetClaimId?: string, customPolicyUrl?: string) => {
      const activeClaimId = (targetClaimId || claim?._id) as Id<"claims"> | undefined;
      if (!activeClaimId) throw new Error("No claim specified for multi-source crawl");

      return await crawlMultiSourceHubAction({
        claimId: activeClaimId,
        payer: claim?.patient?.insurancePayer || "Molina Healthcare",
        cptCodes: claim?.cptCodes?.length ? claim.cptCodes : ["27447"],
        icd10Codes: claim?.icd10Codes?.length ? claim.icd10Codes : ["M17.11"],
        denialReasonCode: claim?.denialReasonCode || "CO-50",
        denialReasonDescription: claim?.denialReasonDescription,
        customPolicyUrl,
      });
    },
    [crawlMultiSourceHubAction, claim]
  );

  // Delete a single evidence clause
  const deleteEvidence = useCallback(
    async (evidenceId: string) => {
      return await deleteEvidenceMutation({
        evidenceId: evidenceId as Id<"clinicalEvidences">,
      });
    },
    [deleteEvidenceMutation]
  );

  // Insert a single custom evidence clause
  const insertSingleEvidence = useCallback(
    async (
      targetClaimId: string,
      evidence: {
        sourceType: string;
        title: string;
        sourceUrl?: string;
        citationClause: string;
        extractedEvidenceMarkdown: string;
        relevanceScore: number;
      }
    ) => {
      return await insertSingleEvidenceMutation({
        claimId: targetClaimId as Id<"claims">,
        ...evidence,
      });
    },
    [insertSingleEvidenceMutation]
  );

  // Trigger Overturn Probability scoring
  const computeOverturnScore = useCallback(
    async (targetClaimId?: string): Promise<OverturnScoringResult> => {
      const activeClaimId = (targetClaimId || claim?._id) as Id<"claims"> | undefined;
      if (!activeClaimId) {
        throw new Error("No claim selected for scoring");
      }
      return await computeScoreAction({
        claimId: activeClaimId,
      });
    },
    [computeScoreAction, claim]
  );

  // Run unified complete analysis (Crawl CPB + Compute Score in 1 step)
  const runCompleteAnalysis = useCallback(
    async (targetClaimId?: string, customPolicyUrl?: string) => {
      const activeClaimId = (targetClaimId || claim?._id) as Id<"claims"> | undefined;
      if (!activeClaimId) throw new Error("No claim selected for analysis");

      await crawlPolicy(activeClaimId, customPolicyUrl);
      return await computeOverturnScore(activeClaimId);
    },
    [crawlPolicy, computeOverturnScore, claim]
  );

  // Run full end-to-end autonomous pipeline (Crawl + Score + Synthesize Brief)
  const runFullPipeline = useCallback(
    async (targetClaimId?: string, customPolicyUrl?: string, physicianNotes?: string) => {
      const activeClaimId = (targetClaimId || claim?._id) as Id<"claims"> | undefined;
      if (!activeClaimId) throw new Error("No claim selected for autonomous pipeline");

      if (runPipelineAction) {
        try {
          return await runPipelineAction({
            claimId: activeClaimId,
            customPolicyUrl,
            physicianNotes,
          });
        } catch (err) {
          const errStr = err instanceof Error ? err.message : String(err);
          if (errStr.includes("Token expired") || errStr.includes("InvalidAuthHeader")) {
            console.warn("Auth token expired mid-pipeline; retrying after session refresh...", err);
            await new Promise((resolve) => setTimeout(resolve, 1200));
            return await runPipelineAction({
              claimId: activeClaimId,
              customPolicyUrl,
              physicianNotes,
            });
          }
          throw err;
        }
      } else {
        // Fallback execution
        await crawlPolicy(activeClaimId, customPolicyUrl);
        await computeOverturnScore(activeClaimId);
        return { success: true, claimId: activeClaimId };
      }
    },
    [runPipelineAction, crawlPolicy, computeOverturnScore, claim]
  );

  // Start the resilient durable workflow pipeline (@convex-dev/workflow)
  const startDurablePipeline = useCallback(
    async (
      targetClaimId?: string,
      options?: {
        customPolicyUrl?: string;
        physicianNotes?: string;
        appealLevel?: string;
        autoDispatch?: boolean;
        followUpCadenceDays?: number;
      }
    ) => {
      const activeClaimId = (targetClaimId || claim?._id) as Id<"claims"> | undefined;
      if (!activeClaimId) throw new Error("No claim selected for durable workflow");

      return await startDurablePipelineMutation({
        claimId: activeClaimId,
        customPolicyUrl: options?.customPolicyUrl,
        physicianNotes: options?.physicianNotes,
        appealLevel: options?.appealLevel,
        autoDispatch: options?.autoDispatch,
        followUpCadenceDays: options?.followUpCadenceDays,
      });
    },
    [startDurablePipelineMutation, claim]
  );

  // Cancel an in-progress durable workflow
  const cancelWorkflow = useCallback(
    async (targetClaimId?: string, workflowId?: string) => {
      const activeClaimId = (targetClaimId || claim?._id) as Id<"claims"> | undefined;
      if (!activeClaimId) throw new Error("No claim selected for workflow cancellation");

      return await cancelDurableWorkflowMutation({
        claimId: activeClaimId,
        workflowId,
      });
    },
    [cancelDurableWorkflowMutation, claim]
  );

  // Trigger dedicated ERISA statutory countdown workflow using step.sleep()
  const startStatutoryCountdown = useCallback(
    async (targetClaimId?: string, cadenceDays?: number) => {
      const activeClaimId = (targetClaimId || claim?._id) as Id<"claims"> | undefined;
      if (!activeClaimId) throw new Error("No claim selected for statutory countdown");

      return await startStatutoryCountdownMutation({
        claimId: activeClaimId,
        cadenceDays,
      });
    },
    [startStatutoryCountdownMutation, claim]
  );

  return {
    evidences: rawEvidences || [],
    isLoadingEvidences: claimId ? rawEvidences === undefined : false,
    sourcesSummary,
    workflowExecutionStatus,
    crawlPolicy,
    crawlPubMed,
    crawlFda,
    crawlCustomUrl,
    crawlMultiSourceHub,
    deleteEvidence,
    insertSingleEvidence,
    computeOverturnScore,
    runCompleteAnalysis,
    runFullPipeline,
    startDurablePipeline,
    cancelWorkflow,
    startStatutoryCountdown,
  };
}

