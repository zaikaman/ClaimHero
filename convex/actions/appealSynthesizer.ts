"use node";

import { action } from "../_generated/server";
import { v } from "convex/values";
import { createStructuredCompletion } from "../lib/openai";
import { api } from "../_generated/api";

const APPEAL_SYNTHESIS_SCHEMA = {
  type: "object",
  properties: {
    executiveSummary: { type: "string" },
    statutoryRightsNotice: { type: "string" },
    medicalNecessityArguments: { type: "string" },
    policyCitations: {
      type: "array",
      items: {
        type: "object",
        properties: {
          source: { type: "string" },
          clause: { type: "string" },
          quote: { type: "string" },
        },
        required: ["source", "clause", "quote"],
        additionalProperties: false,
      },
    },
    formalDemandForPayment: { type: "string" },
    fullAppealMarkdown: { type: "string" },
  },
  required: [
    "executiveSummary",
    "statutoryRightsNotice",
    "medicalNecessityArguments",
    "policyCitations",
    "formalDemandForPayment",
    "fullAppealMarkdown",
  ],
  additionalProperties: false,
};

export interface PolicyCitationItem {
  source: string;
  clause: string;
  quote: string;
}

export interface AppealBriefSynthesisResult {
  executiveSummary: string;
  statutoryRightsNotice: string;
  medicalNecessityArguments: string;
  policyCitations: PolicyCitationItem[];
  formalDemandForPayment: string;
  fullAppealMarkdown: string;
}

/**
 * Appeal Synthesizer Action: Generate comprehensive ERISA & clinical medical appeal brief using gpt-5-nano
 */
export const generateAppealBrief = action({
  args: {
    claimId: v.id("claims"),
    appealLevel: v.optional(v.string()),
    physicianNotes: v.optional(v.string()),
    customInstructions: v.optional(v.string()),
  },
  handler: async (
    ctx,
    args
  ): Promise<AppealBriefSynthesisResult & { appealId: string }> => {
    const appealLevel = args.appealLevel || "level_1_internal";

    // 1. Fetch claim details with joined patient data
    const claim: any = await ctx.runQuery((api as any).claims.getById, {
      claimId: args.claimId,
    });

    if (!claim) {
      throw new Error(`Claim ${args.claimId} not found`);
    }

    // 2. Fetch indexed clinical evidence clauses
    const evidences: any[] = await ctx.runQuery((api as any).clinicalEvidences.listByClaim, {
      claimId: args.claimId,
    });

    const evidenceText = evidences.length > 0
      ? evidences.map((e: any, idx: number) => `[Exhibit ${String.fromCharCode(65 + idx)}] (${e.sourceType.toUpperCase()} - ${e.title} - ${e.citationClause}):\n${e.extractedEvidenceMarkdown}`).join("\n\n")
      : "Standard national clinical practice guideline and ERISA disclosure rules apply.";

    // 3. Call OpenAI gpt-5-nano with structured JSON schema
    const result = await createStructuredCompletion<AppealBriefSynthesisResult>({
      systemPrompt: `You are a world-class Healthcare Appellate Attorney, Board-Certified Medical Necessity Specialist, and ERISA Regulatory Counsel.
Your task is to synthesize a legally airtight, cited medical appeal brief to demand the immediate overturn and payment of an improper insurance claim denial.
Appeal Rules:
1. Legal Citations: Explicitly cite federal ERISA protections (29 CFR § 2560.503-1), the Affordable Care Act § 2719 internal claims regulations, and relevant state insurance statutes.
2. Clinical Necessity Arguments: Directly quote the insurer's own Clinical Policy Bulletins (CPBs) to prove the claimant met or exceeded all conservative therapy and diagnostic prerequisites.
3. Tone: Rigorous, authoritative, factual, and uncompromisingly clinical.
4. Structure fullAppealMarkdown with clear markdown headers (# Formal Request for Reconsideration, ## Statement of Clinical Facts, ## Legal & Statutory Protections Under ERISA, ## Medical Necessity Analysis & CPB Alignment, ## Formal Demand for Full Reimbursement).`,
      userPrompt: `Generate a comprehensive ${appealLevel.replace(/_/g, " ").toUpperCase()} medical appeal brief for:

Claim Information:
- Claim Number: ${claim.claimNumber}
- Patient Name: ${claim.patient?.name || "Patient"}
- Member ID: ${claim.patient?.memberId || "N/A"}
- Group Number: ${claim.patient?.groupNumber || "N/A"}
- Insurance Payer: ${claim.patient?.insurancePayer} (Grievances & Appeals Dept)
- Treating Physician: ${claim.providerName}
- Date of Service: ${claim.serviceDate}
- Disputed Claim Amount: $${claim.deniedAmount.toLocaleString()}
- Patient Financial Liability: $${claim.patientOwedAmount.toLocaleString()}
- Procedure Codes (CPT): ${claim.cptCodes.join(", ")}
- Diagnosis Codes (ICD-10): ${claim.icd10Codes.join(", ")}
- Adverse Denial Code: ${claim.denialReasonCode}
- Payer Reason Description: ${claim.denialReasonDescription}
- Statutory Days Remaining: ${claim.daysRemaining} days

Indexed Clinical Evidence & Policy Contradictions:
${evidenceText}

${args.physicianNotes ? `Additional Treating Physician Clinical Addendum:\n${args.physicianNotes}\n` : ""}
${args.customInstructions ? `Specific Advocate Instructions:\n${args.customInstructions}\n` : ""}`,
      schemaName: "AppealBriefSynthesisResult",
      schema: APPEAL_SYNTHESIS_SCHEMA,
      temperature: 0.15,
    });

    // 4. Format legal citations string
    const citationsSummary = result.policyCitations
      .map((c: PolicyCitationItem) => `- ${c.source} (${c.clause}): "${c.quote}"`)
      .join("\n");

    // 5. Persist the generated brief to Convex database
    const appealId: string = await ctx.runMutation((api as any).appeals.createOrUpdateDraft, {
      claimId: args.claimId,
      appealLevel,
      executiveSummary: result.executiveSummary,
      medicalNecessityArguments: result.medicalNecessityArguments,
      legalCitations: citationsSummary,
      fullAppealMarkdown: result.fullAppealMarkdown,
      lastEditedBy: "OpenAI gpt-5-nano Appeal Synthesizer",
    });

    return {
      appealId,
      ...result,
    };
  },
});
