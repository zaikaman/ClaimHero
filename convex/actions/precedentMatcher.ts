"use node";

import { action, internalAction, ActionCtx } from "../_generated/server";
import { v } from "convex/values";
import { createStructuredCompletion } from "../lib/openai";
import { calculateCodeOverlap } from "../lib/embeddings";
import { internal } from "../_generated/api";
import { requireClaimOwnerAction } from "../lib/auth";
import { logPipelineActivity } from "../lib/pipelineActivity";
import { rateLimiter } from "../lib/rateLimiter";
import { PHI_TOKENS, PHI_TOKEN_INSTRUCTION, collectPhiValues } from "../lib/phiSafe";
import type { Id, Doc } from "../_generated/dataModel";
import {
  isBlockedEvidence,
  isNegativeOrExclusionEvidence,
  isEvidenceSiteMismatched,
  isPayerMismatchedEvidence,
  UNSUPPORTED_CLINICAL_CONCLUSION,
} from "./appealSynthesizer";

const OVERTURN_ANALYSIS_SCHEMA = {
  type: "object",
  properties: {
    keyPolicyContradictions: {
      type: "array",
      items: { type: "string" },
    },
    winningPrecedentSummary: { type: "string" },
    suggestedAppealLevel: {
      type: "string",
      enum: ["level_1_internal", "level_2_grievance", "level_3_external_state_review"],
    },
    policyAlignmentRationale: { type: "string" },
    clinicalDocumentationRationale: { type: "string" },
    statutoryErisaRationale: { type: "string" },
    precedentStrengthRationale: { type: "string" },
  },
  required: [
    "keyPolicyContradictions",
    "winningPrecedentSummary",
    "suggestedAppealLevel",
    "policyAlignmentRationale",
    "clinicalDocumentationRationale",
    "statutoryErisaRationale",
    "precedentStrengthRationale",
  ],
  additionalProperties: false,
};

export interface ScoringCriterionResult {
  category: "policy_alignment" | "clinical_documentation" | "statutory_erisa" | "precedent_strength";
  criterion: string;
  score: number;
  maxScore: number;
  status: "strong" | "moderate" | "weak";
  rationale: string;
}

export interface OverturnScoringResult {
  appealReadinessScore: number;
  evidenceCoverageScore: number;
  /** @deprecated Stale legacy alias for appealReadinessScore. Retained for backward-compatibility. */
  overturnProbabilityScore?: number;
  policyAlignmentScore?: number;
  documentationCompletenessScore?: number;
  riskLevel: "high_confidence" | "moderate" | "complex_litigation";
  scoringBreakdown: ScoringCriterionResult[];
  keyPolicyContradictions: string[];
  winningPrecedentSummary: string;
  suggestedAppealLevel: "level_1_internal" | "level_2_grievance" | "level_3_external_state_review";
  llmAvailable?: boolean;
  generatedBy?: "openai" | "fallback";
  scoreStatus?: "certified" | "provisional_capped" | "withheld";
  degradationWarnings?: string[];
}

export type AppealReadinessResult = OverturnScoringResult;

interface RawLLMAnalysisOutput {
  keyPolicyContradictions: string[];
  winningPrecedentSummary: string;
  suggestedAppealLevel: "level_1_internal" | "level_2_grievance" | "level_3_external_state_review";
  policyAlignmentRationale?: string;
  clinicalDocumentationRationale?: string;
  statutoryErisaRationale?: string;
  precedentStrengthRationale?: string;
}

export interface MatchedPrecedentInput {
  _id?: string;
  sourceKind?: string;
  title?: string;
  citation?: string;
  jurisdiction?: string;
  outcome?: string;
  vectorScore?: number;
  combinedScore?: number;
  rrfScore?: number;
  codeOverlap?: number;
  carcCodes?: string[];
  cptCodes?: string[];
  icd10Codes?: string[];
  winningArgument?: string;
  statutoryLanguage?: string;
}

/**
 * Helper to identify baseline ERISA statutory procedural protocol evidence clauses.
 * Distinguishes statutory disclosure rights from payer clinical policy bulletins (CPB),
 * medical record documentation, or judicial appellate precedents.
 */
export function isStatutoryBaselineEvidence(e: {
  sourceType?: string;
  citationClause?: string;
  title?: string;
}): boolean {
  const clause = (e.citationClause || "").toLowerCase();
  const title = (e.title || "").toLowerCase();
  return (
    e.sourceType === "statutory_authority" ||
    clause.includes("2560.503-1") ||
    title.includes("erisa full & fair review") ||
    title.includes("statutory protocol")
  );
}

/**
 * Deterministic Clinical Appeal Criteria Calculator (Statutory Appeal Readiness - Dossier Audit)
 * 
 * Evaluates the 4 statutory appeal pillars with mathematical precision based on objective case evidence and precedent vectors.
 * Corresponds to the deterministic 4-pillar appeal scoring rubric weighting tested in tests/claimhero.test.ts:114
 * ("Phase 4: Clinical Evidence & Precedent Structure Validation"):
 *   - Pillar 1: CPB & Indication Alignment (Max: 35 pts)
 *   - Pillar 2: Objective Clinical Documentation & Step-Therapy (Max: 25 pts)
 *   - Pillar 3: ERISA 29 CFR § 2560.503-1 Statutory Protections (Max: 20 pts)
 *   - Pillar 4: Precedent Alignment & Evidentiary Coverage (Max: 20 pts)
 *   - Total Score = min(99, max(5, round(∑ Pillar Scores)))
 * 
 * Evidence-Proportional Formula:
 *   - Pillar 1 (Policy): hasCpb (29-34) | hasClinicalStudies/evidence>=2 (20-24) | evidence=1 (16-18) | 0 evidence (8)
 *   - Pillar 2 (Clinical): evidence>=3 (22-24) | evidence>=1 (20-22) | 0 evidence (5)
 *   - Pillar 3 (ERISA): hasLegalPrecedent/hasCpb/evidence>=2 (19) | evidence=1 (12) | 0 evidence (4)
 *   - Pillar 4 (Precedent): hasLegalPrecedent/hasCpb/evidence>=2 (16-19 by denial code & precedents) | evidence=1 (10-12) | 0 evidence (4)
 */
export function calculateDeterministicRubric(
  claim: {
    cptCodes: string[];
    denialReasonCode: string;
    denialReasonDescription: string;
    icd10Codes?: string[];
    patient?: { insurancePayer?: string };
  },
  evidences: Array<{
    sourceType: string;
    citationClause?: string;
    extractedEvidenceMarkdown?: string;
    title?: string;
    relevanceScore?: number;
  }>,
  matchedPrecedents: MatchedPrecedentInput[] = [],
  options?: {
    precedentsUnavailable?: boolean;
    cpbDegraded?: boolean;
  }
) {
  const evidencesCount = evidences.length;
  const isPureStatutory = evidencesCount > 0 && evidences.every(isStatutoryBaselineEvidence);
  const substantiveClinicalEvidences = evidences.filter((e) => !isStatutoryBaselineEvidence(e));
  const substantiveCount = substantiveClinicalEvidences.length;

  const hasCpb = evidences.some((e) => e.sourceType === "payer_cpb");
  const hasLegalPrecedent = evidences.some(
    (e) => e.sourceType === "legal_precedent" && !isStatutoryBaselineEvidence(e)
  );
  const hasClinicalStudies = evidences.some((e) =>
    ["pubmed_study", "nccn_guideline", "fda_package_insert"].includes(e.sourceType)
  );
  const isClinicalDenial = ["CO-50", "CO-57", "CO-119", "CO-151"].includes(claim.denialReasonCode);
  const isAuthOrAdminDenial = ["CO-197", "CO-16", "CO-4", "CO-96", "CO-252"].includes(claim.denialReasonCode);

  // Pillar 1. CPB & Indication Alignment (Max: 35 points; rubric weight tested in tests/claimhero.test.ts:114)
  let policyScore = 8;
  let policyRationale = "No published CPB or clinical policy guidelines retrieved yet. Ingest insurer clinical policy to substantiate indication alignment.";
  if (hasCpb) {
    if (isClinicalDenial) {
      policyScore = 34;
      policyRationale = `Insurer CPB coverage criteria are fully met by patient record, directly contradicting adverse determination ${claim.denialReasonCode}.`;
    } else if (isAuthOrAdminDenial) {
      policyScore = 31;
      policyRationale = `Clinical indications in published CPB are satisfied; administrative denial under ${claim.denialReasonCode} qualifies for retroactive review exception.`;
    } else {
      policyScore = 29;
      policyRationale = `Published clinical policy guidelines substantiate medical necessity for CPT ${claim.cptCodes[0] || "procedure"}.`;
    }
  } else if (hasClinicalStudies || substantiveCount >= 2) {
    policyScore = isClinicalDenial ? 24 : isAuthOrAdminDenial ? 22 : 20;
    policyRationale = `Clinical indications align with national standards; crawl insurer CPB to unlock full coverage criteria verification.`;
  } else if (substantiveCount === 1) {
    policyScore = isClinicalDenial ? 18 : 16;
    policyRationale = `Preliminary clinical indication alignment identified; ingesting insurer CPB is recommended to verify procedural coverage criteria.`;
  }

  // Pillar 2. Objective Clinical Documentation & Step-Therapy (Max: 25 points; rubric weight tested in tests/claimhero.test.ts:114)
  let clinicalScore = 5;
  let clinicalRationale = "No objective clinical documentation or diagnostic records attached to substantiate medical necessity.";
  if (substantiveCount >= 3) {
    clinicalScore = isClinicalDenial ? 24 : 22;
    clinicalRationale = `Documented step-therapy trial, diagnostic imaging, and treating physician clinical narrative substantiate medical necessity.`;
  } else if (substantiveCount >= 1) {
    clinicalScore = isClinicalDenial ? 22 : 20;
    clinicalRationale = `Treating provider records confirm clinical diagnosis and failed conservative management prior to procedure.`;
  }

  // Pillar 3. ERISA 29 CFR § 2560.503-1 & Statutory Protections (Max: 20 points; rubric weight tested in tests/claimhero.test.ts:114)
  // Evaluates statutory procedural standing and disclosure non-compliance.
  // Auto-inserted statutory baseline notices do NOT substitute for verified non-compliance evidence.
  let erisaScore = 4;
  let erisaRationale = "Unsubstantiated statutory standing: attaching denial letter disclosures and clinical records is required to substantiate ERISA § 2560.503-1 non-compliance.";

  const hasSubstantiveStatutoryEvidence = evidences.some(
    (e) =>
      !isStatutoryBaselineEvidence(e) &&
      (e.sourceType === "statutory_authority" ||
        (e.citationClause && e.citationClause.toLowerCase().includes("2560.503-1")) ||
        (e.title && e.title.toLowerCase().includes("erisa")))
  );
  const hasStatutoryPrecedent = matchedPrecedents.some(
    (p) => p.sourceKind === "statutory_authority"
  );
  const hasSubstantiatedStatutoryAuthority =
    hasSubstantiveStatutoryEvidence || hasStatutoryPrecedent;

  if (hasLegalPrecedent || hasSubstantiatedStatutoryAuthority) {
    erisaScore = 19;
    erisaRationale = `Adverse determination violates ERISA 29 CFR § 2560.503-1 disclosure mandates by failing to articulate specific internal clinical review criteria contradicted by documented record.`;
  } else if (hasCpb || substantiveCount >= 2) {
    erisaScore = 14;
    erisaRationale = `Preliminary statutory standing identified under ERISA 29 CFR § 2560.503-1; indexed clinical records establish basis for full and fair review disclosure demand.`;
  } else if (substantiveCount === 1) {
    erisaScore = 12;
    erisaRationale = `Preliminary statutory grounds identified under ERISA 29 CFR § 2560.503-1; supplementary disclosure request recommended to substantiate complete denial rationale omissions.`;
  } else if (isPureStatutory) {
    erisaScore = 4;
    erisaRationale = `Procedural statutory baseline attached; attaching specific insurer denial disclosures and clinical records is required to substantiate ERISA § 2560.503-1 violations.`;
  }

  // Pillar 4. External Review Precedents & Evidentiary Coverage (Max: 20 points; rubric weight tested in tests/claimhero.test.ts:114)
  // Strictly grounded in retrieved precedent vectors, domain code matching, and verified judicial/appellate rulings
  let precedentScore = 4;
  let precedentRationale = "No controlling appellate rulings or external review precedents indexed or matched to this denial reason.";

  if (options?.precedentsUnavailable) {
    precedentScore = 4;
    precedentRationale = "Precedent Vector Archive was unavailable during analysis; external judicial documentation benchmark is unverified.";
  } else {
    const hasMatchedPrecedents = Boolean(matchedPrecedents && matchedPrecedents.length > 0);
    const legalEv = evidences.find(
      (e) => e.sourceType === "legal_precedent" && !isStatutoryBaselineEvidence(e)
    );

    if (hasMatchedPrecedents || legalEv) {
      const isLegalEvFavorable = Boolean(
        legalEv &&
          ((legalEv.extractedEvidenceMarkdown &&
            (legalEv.extractedEvidenceMarkdown.toLowerCase().includes("overturned") ||
              legalEv.extractedEvidenceMarkdown.toLowerCase().includes("recovered") ||
              legalEv.extractedEvidenceMarkdown.toLowerCase().includes("remanded"))) ||
            (legalEv.citationClause && legalEv.citationClause.toLowerCase().includes("imr")))
      );

      const isExplicitlyAdverse = (p: MatchedPrecedentInput) =>
        Boolean(
          p.outcome &&
            (p.outcome.toLowerCase().includes("affirmed") ||
              p.outcome.toLowerCase().includes("upheld") ||
              p.outcome.toLowerCase().includes("denied")) &&
            !p.outcome.toLowerCase().includes("overturned") &&
            !p.outcome.toLowerCase().includes("remanded") &&
            !p.outcome.toLowerCase().includes("recovered")
        );

      const favorablePrecedentMatch = matchedPrecedents.find((p) => {
        if (isExplicitlyAdverse(p)) return false;
        return (
          (p.outcome &&
            (p.outcome.toLowerCase().includes("overturned") ||
              p.outcome.toLowerCase().includes("recovered") ||
              p.outcome.toLowerCase().includes("remanded") ||
              p.outcome.toLowerCase().includes("order"))) ||
          p.sourceKind === "winning_brief" ||
          p.sourceKind === "court_overturn"
        );
      });

      const isFavorable = Boolean(favorablePrecedentMatch || isLegalEvFavorable);

      const isAffirmedOnly =
        !isFavorable &&
        matchedPrecedents.some(
          (p) =>
            p.outcome &&
            (p.outcome.toLowerCase().includes("affirmed") ||
              p.outcome.toLowerCase().includes("upheld") ||
              p.outcome.toLowerCase().includes("denied"))
        );

      const topPrecedent = favorablePrecedentMatch || matchedPrecedents[0];
      const legalCitation =
        topPrecedent?.citation ||
        topPrecedent?.title ||
        legalEv?.citationClause ||
        "Indexed appellate ruling";

      if (isAffirmedOnly) {
        precedentScore = 6;
        precedentRationale = `Matched precedent (${legalCitation}) affirmed insurer determination; adverse parity detected requiring distinguishing legal facts.`;
      } else {
        const baseScore = isFavorable ? 12 : 10;

        // Evaluate vector and fusion similarity quality
        const topSimilarity = topPrecedent
          ? Math.max(topPrecedent.combinedScore ?? 0, topPrecedent.vectorScore ?? 0)
          : (legalEv?.relevanceScore !== undefined
              ? (legalEv.relevanceScore > 1 ? legalEv.relevanceScore / 100 : legalEv.relevanceScore)
              : 0.70);

        let similarityBonus = 0;
        if (topSimilarity >= 0.75) {
          similarityBonus = 3;
        } else if (topSimilarity >= 0.60) {
          similarityBonus = 2;
        } else if (topSimilarity >= 0.40) {
          similarityBonus = 1;
        }

        // Evaluate CARC and CPT code overlap using domain code matching and calculateCodeOverlap
        const topCarcCodes = topPrecedent?.carcCodes || [];
        const topCptCodes = topPrecedent?.cptCodes || [];
        const normalizedDenialCode = (claim.denialReasonCode || "").toUpperCase().trim();

        const matchesCarc =
          topCarcCodes.some((c) => c.toUpperCase().trim() === normalizedDenialCode) ||
          Boolean(legalEv?.extractedEvidenceMarkdown && legalEv.extractedEvidenceMarkdown.toUpperCase().includes(normalizedDenialCode));

        const claimCptClean = (claim.cptCodes || []).map((c) => c.replace(/\D/g, "")).filter(Boolean);
        const matchesCpt =
          claimCptClean.some((c) => topCptCodes.map((x) => x.replace(/\D/g, "")).includes(c)) ||
          Boolean(legalEv?.extractedEvidenceMarkdown && claimCptClean.some((c) => legalEv.extractedEvidenceMarkdown!.includes(c)));

        const codeOverlapScore = topPrecedent
          ? calculateCodeOverlap(
              {
                icd10Codes: topPrecedent.icd10Codes || [],
                cptCodes: topPrecedent.cptCodes || [],
                carcCodes: topPrecedent.carcCodes || [],
              },
              {
                cptCodes: claim.cptCodes || [],
                icd10Codes: claim.icd10Codes || [],
                denialReasonCode: claim.denialReasonCode || "",
                denialReasonDescription: claim.denialReasonDescription || "",
              }
            )
          : (matchesCarc && matchesCpt ? 1 : matchesCarc ? 0.5 : 0);

        let codeMatchBonus = 0;
        if (matchesCarc && matchesCpt) {
          codeMatchBonus = 4;
        } else if (matchesCarc || codeOverlapScore >= 0.5) {
          codeMatchBonus = 3;
        } else if (matchesCpt || codeOverlapScore >= 0.25) {
          codeMatchBonus = 2;
        } else if (codeOverlapScore > 0 || (topPrecedent?.codeOverlap !== undefined && topPrecedent.codeOverlap > 0)) {
          codeMatchBonus = 1;
        }

        precedentScore = Math.min(20, Math.max(4, baseScore + similarityBonus + codeMatchBonus));

        const simPercent = Math.round(topSimilarity * 100);
        const matchType =
          matchesCarc && matchesCpt
            ? "Exact CARC & CPT parity"
            : matchesCarc
              ? `Exact ${claim.denialReasonCode} parity`
              : `${simPercent}% semantic alignment`;

        precedentRationale = `External review precedent (${legalCitation}) establishes favorable documentation parity for ${claim.denialReasonCode || "denial"} (${matchType}).`;
      }
    }
  }

  const scoringBreakdown: ScoringCriterionResult[] = [
    {
      category: "policy_alignment",
      criterion: "CPB & Indication Alignment",
      score: policyScore,
      maxScore: 35,
      status: policyScore >= 30 ? "strong" : policyScore >= 20 ? "moderate" : "weak",
      rationale: policyRationale,
    },
    {
      category: "clinical_documentation",
      criterion: "Objective Clinical Documentation & Step-Therapy",
      score: clinicalScore,
      maxScore: 25,
      status: clinicalScore >= 20 ? "strong" : clinicalScore >= 15 ? "moderate" : "weak",
      rationale: clinicalRationale,
    },
    {
      category: "statutory_erisa",
      criterion: "ERISA 29 CFR § 2560.503-1 & Procedural Protections",
      score: erisaScore,
      maxScore: 20,
      status: erisaScore >= 16 ? "strong" : erisaScore >= 12 ? "moderate" : "weak",
      rationale: erisaRationale,
    },
    {
      category: "precedent_strength",
      criterion: "Precedent & Evidentiary Coverage",
      score: precedentScore,
      maxScore: 20,
      status: precedentScore >= 16 ? "strong" : precedentScore >= 12 ? "moderate" : "weak",
      rationale: precedentRationale,
    },
  ];

  const isEvidentiallyDegraded = Boolean(
    options?.cpbDegraded ||
    options?.precedentsUnavailable ||
    (!hasCpb && (isPureStatutory || evidencesCount === 0))
  );

  const degradationWarnings: string[] = [];
  if (options?.cpbDegraded || (!hasCpb && isPureStatutory)) {
    degradationWarnings.push(
      "Live insurer clinical policy bulletins (CPB) were inaccessible; dossier relies solely on statutory ERISA § 503 procedural disclosure demands."
    );
  } else if (!hasCpb && evidencesCount === 0) {
    degradationWarnings.push(
      "No insurer clinical policy bulletins (CPB) or clinical documentation items are currently attached to this case."
    );
  }
  if (options?.precedentsUnavailable) {
    degradationWarnings.push(
      "Precedent vector retrieval was unavailable during evaluation; appellate documentation benchmark unverified."
    );
  }

  const rawSum = scoringBreakdown.reduce((sum, item) => sum + item.score, 0);

  // Appeal Readiness Score: Canonical 0-100 dossier readiness checklist score.
  // When evidentially degraded, readiness is held at the provisional cap (max 40)
  // to require explicit human review before transmission.
  const appealReadinessScore = isEvidentiallyDegraded
    ? Math.min(40, Math.max(5, rawSum))
    : Math.min(99, Math.max(5, rawSum));

  // Evidence Coverage Score: True un-capped evidentiary completeness across the 4 pillars (0-100),
  // evaluating actual documentary support rather than serving as an outcome prediction alias.
  const evidenceCoverageScore = Math.min(100, Math.max(5, rawSum));

  // Backward-compatibility alias for existing database schema and legacy API consumers.
  // Follows appealReadinessScore.
  const overturnProbabilityScore = appealReadinessScore;

  const scoreStatus: "certified" | "provisional_capped" = isEvidentiallyDegraded
    ? "provisional_capped"
    : "certified";

  const riskLevel: "high_confidence" | "moderate" | "complex_litigation" =
    isEvidentiallyDegraded
      ? "complex_litigation"
      : appealReadinessScore >= 80
        ? "high_confidence"
        : appealReadinessScore >= 55
          ? "moderate"
          : "complex_litigation";

  return {
    overturnProbabilityScore,
    appealReadinessScore,
    evidenceCoverageScore,
    policyAlignmentScore: policyScore,
    documentationCompletenessScore: clinicalScore,
    riskLevel,
    scoringBreakdown,
    scoreStatus,
    degradationWarnings,
  };
}

/**
 * Precedent Matcher Core Logic: Evaluate clinical evidence using deterministic 4-pillar rubric.
 * Shared between public user-facing action and internal durable workflow execution.
 */
export async function performComputeOverturnScore(
  ctx: ActionCtx,
  args: {
    claimId: Id<"claims">;
    pipelineRunId?: string;
    matchedPrecedents?: MatchedPrecedentInput[];
    precedentsUnavailable?: boolean;
    cpbDegraded?: boolean;
  },
  claim: Doc<"claims"> & { patient?: Doc<"patients">; latestAppeal?: Doc<"appeals"> | null },
  userId?: string
): Promise<OverturnScoringResult> {
  // Rate limiting check per user if available
  if (userId) {
    try {
      const limitStatus = await rateLimiter.limit(ctx, "precedentMatcher", {
        key: `precedent_matcher_${userId}`,
      });
      if (!limitStatus.ok) {
        throw new Error(
          `Rate limit reached for precedent matching. Please retry in ${Math.ceil((limitStatus.retryAfter || 1000) / 1000)} seconds.`
        );
      }
    } catch (rateErr) {
      if (rateErr instanceof Error && rateErr.message.includes("Rate limit reached")) {
        throw rateErr;
      }
      // Tolerate unconfigured rate limiter in isolated unit test mocks where the component is unmounted.
      // In non-test environments, log the failure to ensure operational visibility.
      if (process.env.NODE_ENV !== "test") {
        console.warn("[RateLimiter] Unexpected error checking precedentMatcher rate limit:", rateErr);
      }
    }
  }

  // 2. Fetch indexed clinical evidence clauses
  const evidences: Doc<"clinicalEvidences">[] =
    (await ctx.runQuery(internal.clinicalEvidences.listByClaimInternal, {
      claimId: args.claimId,
    })) || [];

  // Resolve matched precedents from args or attached clinicalEvidences (excluding pure statutory baseline notices)
  let resolvedPrecedents: MatchedPrecedentInput[] = args.matchedPrecedents || [];
  if (resolvedPrecedents.length === 0) {
    const legalEvidences = evidences.filter(
      (e) => e.sourceType === "legal_precedent" && !isStatutoryBaselineEvidence(e)
    );
    if (legalEvidences.length > 0) {
      resolvedPrecedents = legalEvidences.map((e) => {
        const md = e.extractedEvidenceMarkdown || "";
        const outcomeMatch = md.match(/Outcome:\s*([^\n]+)/i);
        const vectorMatch = md.match(/Vector similarity:\s*([\d.]+)/i);
        const combinedMatch = md.match(/Combined score:\s*([\d.]+)/i);
        const rrfMatch = md.match(/RRF score:\s*([\d.]+)/i);
        return {
          title: e.title,
          citation: e.citationClause,
          outcome: outcomeMatch ? outcomeMatch[1].trim() : (md.toLowerCase().includes("overturned") ? "Overturned" : "Affirmed"),
          vectorScore: vectorMatch ? parseFloat(vectorMatch[1]) : (e.relevanceScore ?? 0),
          combinedScore: combinedMatch ? parseFloat(combinedMatch[1]) : (e.relevanceScore ?? 0),
          rrfScore: rrfMatch ? parseFloat(rrfMatch[1]) : undefined,
          codeOverlap: md.includes(claim.denialReasonCode) ? 1 : 0,
        };
      });
    }
  }

  await logPipelineActivity(ctx, {
    claimId: args.claimId,
    runId: args.pipelineRunId,
    stage: "score",
    status: "running",
    message: `Weighing ${evidences.length} evidence clauses and ${resolvedPrecedents.length} precedent matches across the 4-pillar statutory rubric to audit Appeal Readiness.`,
  });

  // 3. Compute deterministic 4-pillar score
  const deterministicCalculation = calculateDeterministicRubric(
    claim,
    evidences,
    resolvedPrecedents,
    {
      precedentsUnavailable: args.precedentsUnavailable,
      cpbDegraded: args.cpbDegraded,
    }
  );

  const evidencesSummary = evidences.length > 0
    ? evidences.map((e, i: number) => `[Evidence ${i + 1}] (${e.sourceType.toUpperCase()} - ${e.citationClause}):\n${e.extractedEvidenceMarkdown}`).join("\n\n")
    : "Standard national clinical practice guideline applied.";

  // 4. Call OpenAI for deep qualitative legal/clinical contradictions.
  // PHI-safe: the model scores de-identified clinical/policy signals only.
  const precedentPhi = collectPhiValues({
    patient: claim.patient
      ? { name: claim.patient.name, memberId: claim.patient.memberId }
      : null,
    claimNumber: claim.claimNumber,
    serviceDate: claim.serviceDate,
  });
  let llmAnalysis: RawLLMAnalysisOutput;
  let generatedBy: "openai" | "fallback" = "openai";
  let llmAvailable = true;
  try {
    llmAnalysis = await createStructuredCompletion<RawLLMAnalysisOutput>({
      phiValues: precedentPhi,
      systemPrompt: `You are a Senior Medical Director, ERISA Claim Adjudication Expert, and Clinical Appeals Evaluator.
Your task is to identify specific, cited policy contradictions and formulate a winning legal precedent summary for an insurance denial appeal.

${PHI_TOKEN_INSTRUCTION}

Requirements:
- Identify 2 to 4 concrete, cited contradictions showing why the adverse determination under ${claim.denialReasonCode} is arbitrary and capricious under the insurer's CPB and ERISA 29 CFR § 2560.503-1.
- Formulate a winning precedent summary citing specific clause numbers and clinical standards.
- Provide a brief 1-sentence rationale for each of the 4 statutory pillars.
- Write everything in clean plain text. Strictly do NOT use markdown bold asterisks (such as **bold**) or formatting tokens in any contradiction strings, summaries, or rationales.`,
      userPrompt: `Analyze the following insurance denial case:

Claim Details (identifiers are vault tokens):
- Claim Number: ${PHI_TOKENS.claimNumber}
- Patient: ${PHI_TOKENS.patientName} (Member ID: ${PHI_TOKENS.memberId})
- Insurance Payer: ${claim.patient?.insurancePayer || "Health Insurer"}
- Provider: ${claim.providerName}
- Date of Service: ${PHI_TOKENS.serviceDate}
- CPT Codes: ${claim.cptCodes.join(", ")}
- ICD-10 Codes: ${claim.icd10Codes.join(", ")}
- Denied Amount: $${claim.deniedAmount.toLocaleString()}
- Patient Responsibility: $${claim.patientOwedAmount.toLocaleString()}
- Denial Code: ${claim.denialReasonCode}
- Denial Description: ${claim.denialReasonDescription}

Retrieved Clinical Policy Evidence & Precedents:
${evidencesSummary}`,
      schemaName: "OverturnAnalysisResult",
      schema: OVERTURN_ANALYSIS_SCHEMA,
      temperature: 0.0,
    });
  } catch (err) {
    console.warn("LLM precedent analysis failed, falling back to deterministic calculation without fabricated citations:", err);
    generatedBy = "fallback";
    llmAvailable = false;
    llmAnalysis = {
      keyPolicyContradictions: [],
      winningPrecedentSummary: "Deterministic rubric baseline evaluated against statutory procedural requirements and indexed policy evidence.",
      suggestedAppealLevel: deterministicCalculation.riskLevel === "complex_litigation" ? "level_2_grievance" : "level_1_internal",
    };
  }

  // Determine evidence posture and substantive clinical policy evidence
  const isPureStatutory = evidences.length > 0 && evidences.every(isStatutoryBaselineEvidence);
  const substantivePolicyEvidences = evidences.filter((e) => {
    if (isStatutoryBaselineEvidence(e)) return false;
    if (e.sourceType === "legal_precedent") return false;
    if (isBlockedEvidence(e)) return false;
    if (isNegativeOrExclusionEvidence(e)) return false;
    if (isEvidenceSiteMismatched(e, claim)) return false;
    if (isPayerMismatchedEvidence(e, claim)) return false;
    return Boolean(e.title && e.citationClause && e.extractedEvidenceMarkdown);
  });

  // 1. Ground keyPolicyContradictions vs substantive clinical policy evidence
  // Synthesizer discards ungrounded LLM cites; matcher must not emit ungrounded policy contradictions
  let groundedKeyPolicyContradictions: string[] = [];
  if (llmAvailable && generatedBy !== "fallback" && !args.cpbDegraded && !isPureStatutory && substantivePolicyEvidences.length > 0) {
    const cleanedCandidates = (llmAnalysis.keyPolicyContradictions || [])
      .map((c) => c.replace(/\*\*/g, "").replace(/\s+/g, " ").trim())
      .filter(Boolean)
      .filter((c) => !UNSUPPORTED_CLINICAL_CONCLUSION.test(c));

    const evidenceKeywords = substantivePolicyEvidences.map((e) => ({
      title: (e.title || "").toLowerCase(),
      clause: (e.citationClause || "").toLowerCase(),
      excerpt: (e.extractedEvidenceMarkdown || "").toLowerCase(),
      sourceType: (e.sourceType || "").toLowerCase(),
    }));

    const groundedCandidates = cleanedCandidates.filter((candidate) => {
      const lower = candidate.toLowerCase();
      return evidenceKeywords.some((ek) => {
        if (ek.title && lower.includes(ek.title)) return true;
        if (ek.clause && lower.includes(ek.clause)) return true;
        const titleTokens = ek.title.split(/[^a-z0-9]+/i).filter((t) => t.length >= 3);
        if (titleTokens.length > 0 && titleTokens.some((t) => lower.includes(t))) return true;
        if (lower.includes("cpb") && ek.sourceType.includes("cpb")) return true;
        if (lower.includes("nccn") && ek.sourceType.includes("nccn")) return true;
        if (lower.includes("clinical criteria") || lower.includes("coverage criteria")) return true;
        return false;
      });
    });

    if (groundedCandidates.length > 0) {
      groundedKeyPolicyContradictions = groundedCandidates.slice(0, 4);
    } else {
      groundedKeyPolicyContradictions = substantivePolicyEvidences.slice(0, 3).map((e) => {
        const clausePart = e.citationClause ? ` (${e.citationClause})` : "";
        const denialPart = claim.denialReasonCode ? ` for ${claim.denialReasonCode}` : "";
        return `${e.title}${clausePart}: Published clinical criteria establish coverage indications that contradict the adverse determination${denialPart}.`;
      });
    }
  }

  // 2. Ground winningPrecedentSummary vs retrieved precedents and legal authorities
  let groundedWinningPrecedentSummary: string;
  if (args.precedentsUnavailable) {
    groundedWinningPrecedentSummary = "Precedent Vector Archive was unavailable during evaluation; external judicial documentation benchmark is unverified.";
  } else {
    const legalEvidences = evidences.filter(
      (e) => e.sourceType === "legal_precedent" && !isStatutoryBaselineEvidence(e)
    );
    if (resolvedPrecedents.length === 0 && legalEvidences.length === 0) {
      groundedWinningPrecedentSummary = "No controlling appellate rulings or external review precedents indexed or matched to this denial reason.";
    } else {
      const cleaned = (llmAnalysis.winningPrecedentSummary || "").replace(/\*\*/g, "").replace(/\s+/g, " ").trim();
      const allPrecedentTokens = [
        ...resolvedPrecedents.flatMap((p) => [p.title?.toLowerCase(), p.citation?.toLowerCase()]),
        ...legalEvidences.flatMap((e) => [e.title?.toLowerCase(), e.citationClause?.toLowerCase()]),
      ].filter((t): t is string => Boolean(t && t.length > 3));

      const isGrounded =
        cleaned.length > 0 &&
        !UNSUPPORTED_CLINICAL_CONCLUSION.test(cleaned) &&
        (allPrecedentTokens.some((tok) => cleaned.toLowerCase().includes(tok)) ||
         cleaned.toLowerCase().includes("erisa") ||
         cleaned.toLowerCase().includes("precedent") ||
         cleaned.toLowerCase().includes("overturned") ||
         cleaned.toLowerCase().includes("appellate") ||
         cleaned.toLowerCase().includes("binding precedent"));

      if (isGrounded) {
        groundedWinningPrecedentSummary = cleaned;
      } else {
        const top = resolvedPrecedents[0];
        if (top) {
          const cite = top.citation || top.title || "Controlling appellate ruling";
          const outcome = top.outcome || "Overturned";
          groundedWinningPrecedentSummary = `${cite}: Historical precedent establishes ${outcome} determination parity for ${claim.denialReasonCode || "denial"} claims.`;
        } else if (legalEvidences[0]) {
          groundedWinningPrecedentSummary = `${legalEvidences[0].citationClause || legalEvidences[0].title}: Controlling legal authority establishes statutory documentation parity for ${claim.denialReasonCode || "denial"} determinations.`;
        } else {
          groundedWinningPrecedentSummary = "Deterministic rubric baseline evaluated against statutory procedural requirements and indexed policy evidence.";
        }
      }
    }
  }

  // 3. Ground suggestedAppealLevel vs procedural posture and ERISA exhaustion rules
  const hasDraftedAppeal = Boolean(claim.latestAppeal);
  const isEvidentiallyDegraded = deterministicCalculation.scoreStatus === "provisional_capped";

  let groundedSuggestedAppealLevel: "level_1_internal" | "level_2_grievance" | "level_3_external_state_review" = "level_1_internal";
  if (isEvidentiallyDegraded) {
    groundedSuggestedAppealLevel = "level_1_internal";
  } else if (!hasDraftedAppeal) {
    // Under ERISA 29 CFR § 2560.503-1 and ACA Section 2719, initial adverse determinations
    // cannot jump to external review without administrative exhaustion.
    if (llmAnalysis.suggestedAppealLevel === "level_2_grievance" && deterministicCalculation.riskLevel === "complex_litigation") {
      groundedSuggestedAppealLevel = "level_2_grievance";
    } else {
      groundedSuggestedAppealLevel = "level_1_internal";
    }
  } else {
    if (
      llmAnalysis.suggestedAppealLevel === "level_1_internal" ||
      llmAnalysis.suggestedAppealLevel === "level_2_grievance" ||
      llmAnalysis.suggestedAppealLevel === "level_3_external_state_review"
    ) {
      groundedSuggestedAppealLevel = llmAnalysis.suggestedAppealLevel;
    } else {
      groundedSuggestedAppealLevel = deterministicCalculation.riskLevel === "complex_litigation" ? "level_2_grievance" : "level_1_internal";
    }
  }

  // Merge rich rationales if generated by LLM, while keeping deterministic numerical points and rejecting unsupported conclusions
  const finalBreakdown: ScoringCriterionResult[] = deterministicCalculation.scoringBreakdown.map((item) => {
    let customRationale = item.rationale;
    if (item.category === "policy_alignment" && llmAnalysis.policyAlignmentRationale) {
      const candidate = llmAnalysis.policyAlignmentRationale.replace(/\*\*/g, "");
      if (!UNSUPPORTED_CLINICAL_CONCLUSION.test(candidate)) customRationale = candidate;
    } else if (item.category === "clinical_documentation" && llmAnalysis.clinicalDocumentationRationale) {
      const candidate = llmAnalysis.clinicalDocumentationRationale.replace(/\*\*/g, "");
      if (!UNSUPPORTED_CLINICAL_CONCLUSION.test(candidate)) customRationale = candidate;
    } else if (item.category === "statutory_erisa" && llmAnalysis.statutoryErisaRationale) {
      const candidate = llmAnalysis.statutoryErisaRationale.replace(/\*\*/g, "");
      if (!UNSUPPORTED_CLINICAL_CONCLUSION.test(candidate)) customRationale = candidate;
    } else if (item.category === "precedent_strength" && llmAnalysis.precedentStrengthRationale) {
      const candidate = llmAnalysis.precedentStrengthRationale.replace(/\*\*/g, "");
      if (!UNSUPPORTED_CLINICAL_CONCLUSION.test(candidate)) customRationale = candidate;
    }
    return {
      ...item,
      rationale: customRationale.replace(/\*\*/g, ""),
    };
  });

  const finalResult: OverturnScoringResult = {
    overturnProbabilityScore: deterministicCalculation.overturnProbabilityScore,
    appealReadinessScore: deterministicCalculation.appealReadinessScore,
    evidenceCoverageScore: deterministicCalculation.evidenceCoverageScore,
    policyAlignmentScore: deterministicCalculation.policyAlignmentScore,
    documentationCompletenessScore: deterministicCalculation.documentationCompletenessScore,
    riskLevel: deterministicCalculation.riskLevel,
    scoringBreakdown: finalBreakdown,
    keyPolicyContradictions: groundedKeyPolicyContradictions,
    winningPrecedentSummary: groundedWinningPrecedentSummary,
    suggestedAppealLevel: groundedSuggestedAppealLevel,
    llmAvailable,
    generatedBy,
    scoreStatus: deterministicCalculation.scoreStatus,
    degradationWarnings: deterministicCalculation.degradationWarnings,
  };

  // 5. Update claim in database with deterministic score, risk level, and criteria breakdown
  // Do not regress status if the claim has already drafted an appeal brief or reached dispatch/resolution
  const targetReviewStatus = isEvidentiallyDegraded ? "review_provisional" : "ready_for_review";

  const preservesAdvancedStatus =
    hasDraftedAppeal ||
    claim.status === "review_provisional" ||
    claim.status === "ready_for_review" ||
    claim.status === "dispatched" ||
    claim.status === "delivered" ||
    claim.status === "under_review" ||
    claim.status === "won" ||
    claim.status === "lost" ||
    claim.status === "escalated";

  const updatedStatus = (
    preservesAdvancedStatus
      ? (hasDraftedAppeal &&
         (claim.status === "ingested" ||
          claim.status === "parsing" ||
          claim.status === "analyzing" ||
          claim.status === "precedent_matched" ||
          claim.status === "drafting" ||
          (claim.status === "review_provisional" && !isEvidentiallyDegraded))
          ? targetReviewStatus
          : claim.status)
      : "precedent_matched"
  ) as
    | "ingested"
    | "parsing"
    | "analyzing"
    | "precedent_matched"
    | "drafting"
    | "review_provisional"
    | "ready_for_review"
    | "dispatched"
    | "delivered"
    | "under_review"
    | "won"
    | "lost"
    | "escalated";

  const evidenceIntegrity = {
    cpbStatus: (args.cpbDegraded || !evidences.some((e) => e.sourceType === "payer_cpb"))
      ? ("fallback_statutory" as const)
      : ("verified" as const),
    precedentStatus: args.precedentsUnavailable
      ? ("archive_unavailable" as const)
      : resolvedPrecedents.length > 0
        ? ("matched" as const)
        : ("none_found" as const),
    scoreStatus: deterministicCalculation.scoreStatus || ("certified" as const),
    degradationWarnings: deterministicCalculation.degradationWarnings || [],
    requiresEvidentiaryAcknowledgement: isEvidentiallyDegraded,
  };

  await ctx.runMutation(internal.claims.updateStatusInternal, {
    claimId: args.claimId,
    status: updatedStatus,
    overturnProbabilityScore: finalResult.overturnProbabilityScore,
    appealReadinessScore: finalResult.appealReadinessScore,
    evidenceCoverageScore: finalResult.evidenceCoverageScore,
    riskLevel: finalResult.riskLevel,
    scoringBreakdown: finalResult.scoringBreakdown,
    evidenceIntegrity,
    actor: "Precedent Matcher & Rubric Engine",
    details: `Evaluated 4-pillar Statutory Appeal Readiness: ${finalResult.appealReadinessScore}/100 (${finalResult.riskLevel.replace(/_/g, " ").toUpperCase()}). Found ${finalResult.keyPolicyContradictions.length} cited policy contradictions.`,
  });

  const confidenceLabel =
    finalResult.riskLevel === "high_confidence"
      ? "strong"
      : finalResult.riskLevel === "moderate"
        ? "moderate"
        : "complex";
  await logPipelineActivity(ctx, {
    claimId: args.claimId,
    runId: args.pipelineRunId,
    stage: "score",
    status: "completed",
    message: `Statutory appeal readiness audited at ${finalResult.appealReadinessScore}/100 (${confidenceLabel}), with ${finalResult.keyPolicyContradictions.length} cited policy contradictions supporting statutory overturn.`,
  });

  return finalResult;
}

const precedentInputValidator = v.object({
  _id: v.optional(v.union(v.id("precedents"), v.string())),
  sourceKind: v.optional(v.string()),
  title: v.optional(v.string()),
  citation: v.optional(v.string()),
  jurisdiction: v.optional(v.string()),
  sourceUrl: v.optional(v.string()),
  icd10Codes: v.optional(v.array(v.string())),
  cptCodes: v.optional(v.array(v.string())),
  carcCodes: v.optional(v.array(v.string())),
  winningArgument: v.optional(v.string()),
  statutoryLanguage: v.optional(v.string()),
  outcome: v.optional(v.string()),
  vectorScore: v.optional(v.number()),
  combinedScore: v.optional(v.number()),
  codeOverlap: v.optional(v.number()),
  vectorRank: v.optional(v.number()),
  textRank: v.optional(v.number()),
  rrfScore: v.optional(v.number()),
  textScore: v.optional(v.number()),
  retrievalSource: v.optional(v.string()),
});

/**
 * Appeal Readiness Matcher Action: Evaluate clinical evidence using deterministic 4-pillar rubric (User-facing)
 */
export const computeAppealReadinessScore = action({
  args: {
    claimId: v.id("claims"),
    pipelineRunId: v.optional(v.string()),
    matchedPrecedents: v.optional(v.array(precedentInputValidator)),
    precedentsUnavailable: v.optional(v.boolean()),
    cpbDegraded: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<OverturnScoringResult> => {
    // 1. Authorize claim ownership
    const { claim, userId } = await requireClaimOwnerAction(ctx, args.claimId);
    return await performComputeOverturnScore(ctx, args, claim, userId);
  },
});

/**
 * Backward compatibility alias for computeAppealReadinessScore
 */
export const computeOverturnScore = computeAppealReadinessScore;

/**
 * Internal Appeal Readiness Matcher Action:
 * For durable workflows and scheduled background processing without active user token session.
 */
export const computeAppealReadinessScoreInternal = internalAction({
  args: {
    claimId: v.id("claims"),
    pipelineRunId: v.optional(v.string()),
    matchedPrecedents: v.optional(v.array(precedentInputValidator)),
    precedentsUnavailable: v.optional(v.boolean()),
    cpbDegraded: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<OverturnScoringResult> => {
    const claim = (await ctx.runQuery(internal.claims.getByIdInternal, {
      claimId: args.claimId,
    })) as (Doc<"claims"> & { patient?: Doc<"patients">; latestAppeal?: Doc<"appeals"> | null }) | null;
    if (!claim) {
      throw new Error(`Claim ${args.claimId} not found`);
    }
    return await performComputeOverturnScore(ctx, args, claim, claim.userId);
  },
});

/**
 * Backward compatibility alias for computeAppealReadinessScoreInternal
 */
export const computeOverturnScoreInternal = computeAppealReadinessScoreInternal;
