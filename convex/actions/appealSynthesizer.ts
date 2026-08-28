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
 * Assemble a formal legal memorandum in standard Markdown structure.
 * Guarantees proper headers (#, ##), tables, blockquotes, bullet lists, and horizontal dividers.
 */
function assembleProfessionalMemorandum(
  claim: any,
  appealLevel: string,
  result: AppealBriefSynthesisResult,
  evidences: any[],
  physicianNotes?: string
): string {
  const dateStr = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const payerName = claim.patient?.insurancePayer || "Health Plan Administrator";
  const providerName = claim.providerName || "Treating Physician";
  const patientName = claim.patient?.name || "Patient";
  const memberId = claim.patient?.memberId || "N/A";
  const groupNumber = claim.patient?.groupNumber || "Standard Employer Plan (ERISA Qualified)";
  const claimNumber = claim.claimNumber;
  const dos = claim.serviceDate;
  const deniedAmount = `$${claim.deniedAmount.toLocaleString()}`;
  const patientOwed = `$${claim.patientOwedAmount.toLocaleString()}`;
  const cptCodes = (claim.cptCodes || []).join(", ");
  const icd10Codes = (claim.icd10Codes || []).join(", ");
  const denialReason = `${claim.denialReasonCode || "CO-50"} - ${claim.denialReasonDescription || "Adverse Determination"}`;

  // If the LLM already returned a well-structured markdown document with headers and table, use it
  if (
    result.fullAppealMarkdown &&
    result.fullAppealMarkdown.includes("# ") &&
    result.fullAppealMarkdown.includes("## ") &&
    result.fullAppealMarkdown.includes("|") &&
    result.fullAppealMarkdown.includes("\n\n")
  ) {
    return result.fullAppealMarkdown.trim();
  }

  // Otherwise, construct the formal appellate memorandum from the verified structured fields
  let brief = `# FORMAL MEDICAL APPEAL & LEGAL RECONSIDERATION MEMORANDUM\n\n`;
  brief += `**VIA CERTIFIED SECURE ELECTRONIC GRIEVANCE PORTAL & REGISTERED TRANSMISSION**\n\n`;
  brief += `**DATE:** ${dateStr}  \n`;
  brief += `**TO:** ${payerName} Appeals Committee & Medical Review Board  \n`;
  brief += `**FROM:** ${providerName} (Treating Provider / Designated Authorized Representative)  \n`;
  brief += `**RE:** Formal ${appealLevel.replace(/_/g, " ").toUpperCase()} Appeal & Demand for Claim Overturn — 29 CFR § 2560.503-1  \n\n`;
  brief += `---\n\n`;

  brief += `### CASE IDENTIFICATION & CLAIM METADATA\n\n`;
  brief += `| Case Parameter | Clinical & Policy Record Details |\n`;
  brief += `| :--- | :--- |\n`;
  brief += `| **Patient Name** | ${patientName} |\n`;
  brief += `| **Subscriber / Member ID** | ${memberId} |\n`;
  brief += `| **Group / Plan Identifier** | ${groupNumber} |\n`;
  brief += `| **Claim / Reference Number** | ${claimNumber} |\n`;
  brief += `| **Date of Service (DOS)** | ${dos} |\n`;
  brief += `| **Treating Physician** | ${providerName} |\n`;
  brief += `| **Procedure Codes (CPT)** | ${cptCodes} |\n`;
  brief += `| **Diagnosis Codes (ICD-10)** | ${icd10Codes} |\n`;
  brief += `| **Disputed Claim Amount** | ${deniedAmount} |\n`;
  brief += `| **Patient Financial Liability** | ${patientOwed} |\n`;
  brief += `| **Adverse Denial Code** | ${denialReason} |\n\n`;
  brief += `---\n\n`;

  brief += `### FORMAL NOTICE OF APPEAL & JURISDICTIONAL STATEMENT\n\n`;
  brief += `**Dear Members of the Appeals Committee and Medical Review Board:**\n\n`;
  brief += `Please accept this formal written appeal submitted pursuant to the Employee Retirement Income Security Act of 1974 (ERISA, 29 U.S.C. § 1133), federal claims procedure regulations (29 CFR § 2560.503-1), and the Affordable Care Act (ACA § 2719, 45 CFR § 147.136), challenging the adverse benefit determination rendered regarding Claim #${claimNumber}.\n\n`;
  brief += `${result.executiveSummary}\n\n`;
  brief += `---\n\n`;

  brief += `## SECTION I: STATEMENT OF RELEVANT CLINICAL FACTS & CONSERVATIVE THERAPY HISTORY\n\n`;
  brief += `${result.medicalNecessityArguments}\n\n`;
  if (physicianNotes && physicianNotes.trim()) {
    brief += `> **Treating Physician Clinical Addendum:**  \n> "${physicianNotes.trim()}"  \n> — *${providerName}*\n\n`;
  }
  brief += `---\n\n`;

  brief += `## SECTION II: STATUTORY ERISA PROTECTIONS & GOVERNING LEGAL STANDARD\n\n`;
  brief += `${result.statutoryRightsNotice}\n\n`;
  brief += `1. **Mandatory De Novo Review (29 CFR § 2560.503-1(h)(3)(ii)):** The plan administrator is mandated to conduct a full and independent clinical review that affords no deference to the initial adverse determination and is conducted by an appropriately credentialed clinical specialist in the relevant field of medicine.\n`;
  brief += `2. **Right to Full Record Disclosure (29 CFR § 2560.503-1(h)(2)(iii)):** The claimant hereby requests, at no cost, complete copies of all documents, internal clinical policies, medical reviewer qualifications, and medical director rationales relied upon in making the adverse determination.\n`;
  brief += `3. **Statutory 180-Day Regulatory Limitation:** This appeal is filed well within the 180-day statutory limitation window mandated under federal law.\n\n`;
  brief += `---\n\n`;

  brief += `## SECTION III: CLINICAL POLICY BULLETIN (CPB) ALIGNMENT & EVIDENTIARY CITATIONS\n\n`;
  if (result.policyCitations && result.policyCitations.length > 0) {
    brief += `The claimant's clinical record definitively satisfies every requisite indication outlined in ${payerName}'s published Clinical Policy Bulletins:\n\n`;
    brief += `| Policy Source | Target Clause / Criterion | Clinical Record Evidence & Direct Quote |\n`;
    brief += `| :--- | :--- | :--- |\n`;
    result.policyCitations.forEach((cit, idx) => {
      brief += `| **${cit.source}** | \`${cit.clause}\` | "${cit.quote}" **(Exhibit ${String.fromCharCode(65 + idx)})** |\n`;
    });
    brief += `\n`;
  } else {
    brief += `The medical services rendered fully conform to established national standard-of-care guidelines and prevailing peer-reviewed clinical literature.\n\n`;
  }
  brief += `---\n\n`;

  brief += `## SECTION IV: FORMAL REBUTTAL OF DENIAL & DEMAND FOR IMMEDIATE OVERTURN\n\n`;
  brief += `${result.formalDemandForPayment}\n\n`;
  brief += `The assertion under denial code **${claim.denialReasonCode || "CO-50"}** that the requested treatment lacks medical necessity or fails prerequisite indications is directly contradicted by the patient's objective clinical records and documented diagnostic failure of conservative care.\n\n`;
  brief += `**We hereby formally demand:**\n`;
  brief += `1. **Immediate Overturn** of the adverse benefit determination and full authorization/reimbursement of the disputed amount of **${deniedAmount}**.\n`;
  brief += `2. **Written Confirmation** of overturn and claim adjudication within the thirty (30) day statutory deadline.\n`;
  brief += `3. In the event of an adverse reconsideration, immediate provision of notice of rights to Independent External Review under ACA § 2719 and filing of a formal complaint with the Department of Labor Employee Benefits Security Administration (EBSA).\n\n`;
  brief += `---\n\n`;

  brief += `### SIGNATURE & CERTIFICATION\n\n`;
  brief += `**Respectfully submitted,**\n\n`;
  brief += `**/s/ ${providerName}**  \n`;
  brief += `Authorized Treating Healthcare Provider / Designated Representative  \n`;
  brief += `On behalf of ${patientName} (Claimant)\n\n`;
  brief += `---\n\n`;

  brief += `### INDEX OF ATTACHED EXHIBITS & CLINICAL DOCUMENTATION\n\n`;
  if (evidences && evidences.length > 0) {
    evidences.forEach((ev: any, idx: number) => {
      brief += `* **Exhibit ${String.fromCharCode(65 + idx)}:** ${ev.title} — *${ev.sourceType.toUpperCase()} (Clause: ${ev.citationClause})*\n`;
    });
  } else {
    brief += `* **Exhibit A:** Treating Physician Clinical Progress Notes & Comprehensive Evaluation\n`;
    brief += `* **Exhibit B:** Diagnostic Imaging Reports & Radiographic Examination Findings\n`;
    brief += `* **Exhibit C:** Prior Conservative Therapy Documentation & Medication Flowsheets\n`;
    brief += `* **Exhibit D:** Insurer Clinical Policy Bulletin (CPB) Coverage Criteria\n`;
  }

  return brief;
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
    const rawResult = await createStructuredCompletion<AppealBriefSynthesisResult>({
      systemPrompt: `You are an elite Healthcare Appellate Attorney, Board-Certified Medical Necessity Specialist, and ERISA Regulatory Counsel.
Your mission is to synthesize a legally airtight, cited, highly professional medical appeal brief and formal demand for reconsideration to overturn an improper insurance claim denial.

CRITICAL FORMATTING RULES:
1. Markdown Headings: You MUST use # for the title, ## for major numbered sections (e.g. ## SECTION I: ...), ### for subsections, and --- horizontal dividers between sections.
2. Paragraphs & Spacing: You MUST use double newlines (\\n\\n) between paragraphs. Never output a single continuous run-on block of text.
3. Tables: You MUST use formatted Markdown tables with header separators (| :--- | :--- |) for metadata and clinical criteria comparisons.
4. Blockquotes: Use > for physician clinical necessity statements and direct policy quotes.
5. Legal Citing: Explicitly cite federal ERISA protections (29 U.S.C. § 1133, 29 CFR § 2560.503-1(h) full-and-fair review standard), the Affordable Care Act § 2719 internal claims requirements (45 CFR § 147.136), and insurer CPBs.
6. Tone: Authoritative, formal, evidentiary, and uncompromisingly clinical.`,
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
- Procedure Codes (CPT): ${(claim.cptCodes || []).join(", ")}
- Diagnosis Codes (ICD-10): ${(claim.icd10Codes || []).join(", ")}
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

    // 4. Assemble the definitive, perfectly structured legal memorandum
    const formattedMarkdown = assembleProfessionalMemorandum(
      claim,
      appealLevel,
      rawResult,
      evidences,
      args.physicianNotes
    );

    const result: AppealBriefSynthesisResult = {
      ...rawResult,
      fullAppealMarkdown: formattedMarkdown,
    };

    // 5. Format legal citations string
    const citationsSummary = result.policyCitations
      .map((c: PolicyCitationItem) => `- ${c.source} (${c.clause}): "${c.quote}"`)
      .join("\n");

    // 6. Persist the generated brief to Convex database
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
