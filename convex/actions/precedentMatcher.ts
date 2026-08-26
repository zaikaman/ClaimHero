"use node";

import { action } from "../_generated/server";
import { v } from "convex/values";
import { createStructuredCompletion } from "../lib/openai";
import { api } from "../_generated/api";

const OVERTURN_SCORING_SCHEMA = {
  type: "object",
  properties: {
    overturnProbabilityScore: { type: "number" },
    riskLevel: {
      type: "string",
      enum: ["high_confidence", "moderate", "complex_litigation"],
    },
    keyPolicyContradictions: {
      type: "array",
      items: { type: "string" },
    },
    winningPrecedentSummary: { type: "string" },
    suggestedAppealLevel: {
      type: "string",
      enum: ["level_1_internal", "level_2_grievance", "level_3_external_state_review"],
    },
  },
  required: [
    "overturnProbabilityScore",
    "riskLevel",
    "keyPolicyContradictions",
    "winningPrecedentSummary",
    "suggestedAppealLevel",
  ],
  additionalProperties: false,
};

export interface OverturnScoringResult {
  overturnProbabilityScore: number;
  riskLevel: "high_confidence" | "moderate" | "complex_litigation";
  keyPolicyContradictions: string[];
  winningPrecedentSummary: string;
  suggestedAppealLevel: "level_1_internal" | "level_2_grievance" | "level_3_external_state_review";
}

/**
 * Precedent Matcher Action: Evaluate clinical evidence and compute Overturn Probability Score
 */
export const computeOverturnScore = action({
  args: {
    claimId: v.id("claims"),
  },
  handler: async (ctx, args): Promise<OverturnScoringResult> => {
    // 1. Fetch claim details with joined patient data
    const claim = await ctx.runQuery((api as any).claims.getById, {
      claimId: args.claimId,
    });

    if (!claim) {
      throw new Error(`Claim ${args.claimId} not found`);
    }

    // 2. Fetch indexed clinical evidence clauses
    const evidences = await ctx.runQuery((api as any).clinicalEvidences.listByClaim, {
      claimId: args.claimId,
    });

    const evidencesSummary = evidences.length > 0
      ? evidences.map((e: any, i: number) => `[Evidence ${i + 1}] (${e.sourceType.toUpperCase()} - ${e.citationClause}):\n${e.extractedEvidenceMarkdown}`).join("\n\n")
      : "Standard national clinical practice guideline applied.";

    // 3. Call OpenAI gpt-5-nano with structured JSON schema
    const scoringResult = await createStructuredCompletion<OverturnScoringResult>({
      systemPrompt: `You are a Senior Medical Director, ERISA Claim Adjudication Expert, and Clinical Appeals Evaluator.
Your task is to cross-examine an insurance denial against the insurer's own Clinical Policy Bulletins (CPBs), FDA indications, and medical necessity criteria.
Rules for scoring:
- If the denial reason (e.g. CO-50 Not Medically Necessary) contradicts established CPB criteria or clinical documentation, score high (85–98%).
- If the denial is administrative (e.g. CO-197 Prior Auth Lacking) but clinical emergency or retroactive review exceptions apply under 29 CFR § 2560.503-1, score moderate-to-high (70–88%).
- Identify 2 to 4 concrete, cited contradictions showing why the insurer's adverse determination is arbitrary and capricious.
- Formulate a winning precedent summary citing specific clause numbers and clinical literature.`,
      userPrompt: `Evaluate the following insurance denial case and compute the Overturn Probability Score:

Claim Details:
- Claim Number: ${claim.claimNumber}
- Patient: ${claim.patient?.name || "Patient"} (Member ID: ${claim.patient?.memberId || "N/A"})
- Insurance Payer: ${claim.patient?.insurancePayer || "Health Insurer"}
- Provider: ${claim.providerName}
- Date of Service: ${claim.serviceDate}
- CPT Codes: ${claim.cptCodes.join(", ")}
- ICD-10 Codes: ${claim.icd10Codes.join(", ")}
- Denied Amount: $${claim.deniedAmount.toLocaleString()}
- Patient Responsibility: $${claim.patientOwedAmount.toLocaleString()}
- Denial Code: ${claim.denialReasonCode}
- Denial Description: ${claim.denialReasonDescription}

Retrieved Clinical Policy Evidence & Precedents:
${evidencesSummary}`,
      schemaName: "OverturnScoringResult",
      schema: OVERTURN_SCORING_SCHEMA,
      temperature: 0.1,
    });

    // 4. Update claim in database with new score and risk level
    await ctx.runMutation((api as any).claims.updateStatus, {
      claimId: args.claimId,
      status: "precedent_matched",
      overturnProbabilityScore: scoringResult.overturnProbabilityScore,
      riskLevel: scoringResult.riskLevel,
      actor: "Precedent & Clinical Reasoning Engine",
      details: `Calculated ${scoringResult.overturnProbabilityScore}% Overturn Probability (${scoringResult.riskLevel.replace("_", " ").toUpperCase()}) with ${scoringResult.keyPolicyContradictions.length} identified policy contradictions.`,
    });

    return scoringResult;
  },
});
