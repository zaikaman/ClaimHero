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
      systemPrompt: `You are an elite Healthcare Appellate Attorney, Board-Certified Medical Necessity Specialist, and ERISA Regulatory Counsel.
Your mission is to synthesize a legally airtight, cited, highly professional medical appeal brief and formal demand for reconsideration to overturn an improper insurance claim denial.

APPEAL DRAFTING STANDARDS:
1. Legal & Regulatory Foundation: Explicitly cite federal ERISA protections (29 U.S.C. § 1133, 29 CFR § 2560.503-1(h) full-and-fair review standard), the Affordable Care Act § 2719 internal claims requirements (45 CFR § 147.136), and relevant state insurance codes.
2. Clinical Necessity & CPB Alignment: Quote the insurer's Clinical Policy Bulletins (CPBs) to prove the claimant met all prerequisite criteria (e.g. conservative therapy duration, medication trials, physical therapy compliance, diagnostic indications).
3. Professional Tone: Authoritative, formal, evidentiary, and uncompromisingly clinical. Avoid overly emotional accusations; use precise legal-medical terminology (e.g., "arbitrary and procedurally deficient adverse benefit determination", "fiduciary obligation under plan documents").
4. Required Document Architecture for fullAppealMarkdown:
   - Header Block: "VIA CERTIFIED TRANSMISSION & SECURE ELECTRONIC GRIEVANCE PORTAL", Recipient Insurer Appeals Committee, and Date.
   - Case Metadata Block: Formatted tabular summary (Patient, DOB/Member ID, Group #, Claim #, Date of Service, CPT Codes, ICD-10 Diagnosis, Disputed Amount, Denial Reason).
   - Salutation: "Dear Appeals Committee and Clinical Review Board,"
   - Section I. STATEMENT OF RELEVANT CLINICAL FACTS & PRIOR CONSERVATIVE CARE (Document patient symptoms, failure of conservative therapy, treating physician rationale).
   - Section II. GOVERNING LEGAL STANDARD & ERISA 29 CFR § 2560.503-1 STATUTORY PROTECTIONS (Demand for de novo review, full access to claim file and internal clinical criteria).
   - Section III. CLINICAL POLICY BULLETIN (CPB) ALIGNMENT & EVIDENCE OF MEDICAL NECESSITY (Explicit comparison of patient medical record against payer coverage criteria, citing Exhibits).
   - Section IV. FORMAL REBUTTAL OF DENIAL REASON & DEMAND FOR IMMEDIATE OVERTURN (Direct refutation of denial code, demand for full reimbursement, notice of external review/DOL complaint).
   - Formal Signature Block: "Respectfully submitted on behalf of the Claimant", Treating Physician / Authorized Advocate signature, NPI, and Facility info.
   - Enclosures & Exhibits: List of indexed exhibits (e.g. Exhibit A: Physician Progress Notes, Exhibit B: Physical Therapy Record, Exhibit C: CPB Documentation).`,
      userPrompt: `Synthesize a formal ${appealLevel.replace(/_/g, " ").toUpperCase()} medical appeal brief for:

Case Details:
- Claim Number: ${claim.claimNumber}
- Patient Name: ${claim.patient?.name || "Patient"}
- Member ID: ${claim.patient?.memberId || "N/A"}
- Group Number: ${claim.patient?.groupNumber || "Standard Employer Plan"}
- Insurance Payer: ${claim.patient?.insurancePayer} (Grievances & Appeals Department)
- Treating Physician: ${claim.providerName}
- Date of Service: ${claim.serviceDate}
- Disputed Claim Amount: $${claim.deniedAmount.toLocaleString()}
- Patient Financial Liability: $${claim.patientOwedAmount.toLocaleString()}
- Procedure Codes (CPT): ${claim.cptCodes.join(", ")}
- Diagnosis Codes (ICD-10): ${claim.icd10Codes.join(", ")}
- Adverse Denial Code: ${claim.denialReasonCode}
- Payer Denial Description: ${claim.denialReasonDescription}
- Statutory Days Remaining: ${claim.daysRemaining} days

Indexed Clinical Evidence & Policy Contradictions:
${evidenceText}

${args.physicianNotes ? `Treating Physician Clinical Notes / Addendum:\n${args.physicianNotes}\n` : ""}
${args.customInstructions ? `Advocate Custom Instructions:\n${args.customInstructions}\n` : ""}`,
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
