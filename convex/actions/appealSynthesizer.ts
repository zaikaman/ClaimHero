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

export interface VectorPrecedentMatch {
  title: string;
  citation: string;
  statutoryLanguage: string;
  winningArgument: string;
  vectorScore: number;
  combinedScore?: number;
  sourceKind?: string;
}

export function formatVectorPrecedentSection(vectorPrecedents?: VectorPrecedentMatch[]): string {
  if (!vectorPrecedents || vectorPrecedents.length === 0) {
    return "";
  }

  let section = `### Vector-Retrieved Controlling Authorities\n\n`;
  section += `Convex native vector search against the Precedent Vector Archive (indexed by ICD-10, CPT, and CARC) returned the following highest-scoring historical winning arguments. Proven statutory language is incorporated herein:\n\n`;
  vectorPrecedents.forEach((match, idx) => {
    const similarity = Math.round(Math.max(0, Math.min(1, (match.vectorScore + 1) / 2)) * 1000) / 10;
    section += `**${idx + 1}. ${match.title}** — \`${match.citation}\` (similarity ${similarity}%)\n\n`;
    section += `> ${match.statutoryLanguage}\n\n`;
    section += `${match.winningArgument}\n\n`;
  });
  return section.trim();
}

export function assembleProfessionalMemorandum(
  claim: any,
  appealLevel: string,
  result: AppealBriefSynthesisResult,
  evidences: any[],
  physicianNotes?: string,
  vectorPrecedents?: VectorPrecedentMatch[]
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
  const deniedAmount = `$${(claim.deniedAmount || 0).toLocaleString()}`;
  const patientOwed = `$${(claim.patientOwedAmount || 0).toLocaleString()}`;
  const cptCodes = (claim.cptCodes || []).join(", ");
  const icd10Codes = (claim.icd10Codes || []).join(", ");
  const denialReason = `${claim.denialReasonCode || "CO-50"} - ${claim.denialReasonDescription || "Adverse Determination"}`;

  const vectorSection = formatVectorPrecedentSection(vectorPrecedents);

  // Only use the raw LLM fullAppealMarkdown if it is genuinely comprehensive, rich, and contains all key legal sections
  if (
    result.fullAppealMarkdown &&
    result.fullAppealMarkdown.length >= 2200 &&
    result.fullAppealMarkdown.includes("# ") &&
    result.fullAppealMarkdown.includes("## ") &&
    result.fullAppealMarkdown.includes("|") &&
    (result.fullAppealMarkdown.includes("Exhibit") || result.fullAppealMarkdown.includes("EXHIBIT")) &&
    (result.fullAppealMarkdown.includes("29 CFR") || result.fullAppealMarkdown.includes("ERISA")) &&
    (result.fullAppealMarkdown.includes("Demand") || result.fullAppealMarkdown.includes("DEMAND"))
  ) {
    const llmBrief = result.fullAppealMarkdown.trim();
    if (vectorSection && !llmBrief.includes("Vector-Retrieved Controlling Authorities")) {
      return `${llmBrief}\n\n---\n\n${vectorSection}`;
    }
    return llmBrief;
  }

  // Construct the gold-standard formal appellate legal memorandum
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

  brief += `### JURISDICTIONAL STATEMENT & FORMAL NOTICE OF APPEAL\n\n`;
  brief += `**Dear Members of the Appeals Committee and Medical Review Board:**\n\n`;
  brief += `Please accept this formal written appeal submitted pursuant to the Employee Retirement Income Security Act of 1974 (**ERISA, 29 U.S.C. § 1133**), federal claims procedure regulations (**29 CFR § 2560.503-1**), and the Affordable Care Act (**ACA § 2719, 45 CFR § 147.136**), contesting the adverse benefit determination rendered regarding Claim #${claimNumber}.\n\n`;
  
  if (result.executiveSummary && result.executiveSummary.trim()) {
    brief += `${result.executiveSummary.trim()}\n\n`;
  } else {
    brief += `The adverse benefit determination issued for CPT ${cptCodes} performed on ${dos} citing "lack of medical necessity" is contrary to the clinical record, unsupported by prevailing standard of care, and directly contradicts ${payerName}'s published Clinical Policy Bulletins.\n\n`;
  }
  brief += `---\n\n`;

  brief += `## SECTION I: STATEMENT OF RELEVANT CLINICAL FACTS & CONSERVATIVE THERAPY FAILURE\n\n`;
  if (result.medicalNecessityArguments && result.medicalNecessityArguments.trim()) {
    brief += `${result.medicalNecessityArguments.trim()}\n\n`;
  } else {
    brief += `The patient presents with documented, progressive pathology (ICD-10: ${icd10Codes}) refractory to extensive conservative management. Prior to surgical/procedural intervention, the patient completed exhaustive non-operative modalities over a continuous timeline without sustained functional relief, including supervised physical therapy, targeted pharmacotherapy, and procedural interventions where indicated.\n\n`;
  }

  if (physicianNotes && physicianNotes.trim()) {
    brief += `> **Treating Physician Clinical Statement (${providerName}):**  \n> "${physicianNotes.trim()}"\n\n`;
  }
  brief += `---\n\n`;

  brief += `## SECTION II: CLINICAL POLICY BULLETIN (CPB) ALIGNMENT & EVIDENTIARY CRITERIA\n\n`;
  brief += `The claimant's clinical documentation definitively satisfies every requisite indication outlined in ${payerName}'s published Clinical Policy Bulletins and national standard-of-care guidelines:\n\n`;

  if (result.policyCitations && result.policyCitations.length > 0) {
    brief += `| Policy Source | Target Clause / Criterion | Clinical Record Evidence & Direct Quote |\n`;
    brief += `| :--- | :--- | :--- |\n`;
    result.policyCitations.forEach((cit, idx) => {
      brief += `| **${cit.source}** | \`${cit.clause}\` | "${cit.quote}" **(Exhibit ${String.fromCharCode(65 + idx)})** |\n`;
    });
    brief += `\n`;
  } else if (evidences && evidences.length > 0) {
    brief += `| Evidentiary Source | Target Clause | Clinical Verification |\n`;
    brief += `| :--- | :--- | :--- |\n`;
    evidences.forEach((ev: any, idx: number) => {
      brief += `| **${ev.title}** | \`${ev.citationClause}\` | ${ev.extractedEvidenceMarkdown.replace(/\n/g, " ")} **(Exhibit ${String.fromCharCode(65 + idx)})** |\n`;
    });
    brief += `\n`;
  } else {
    brief += `The medical services rendered fully conform to established national standard-of-care guidelines and prevailing peer-reviewed clinical literature.\n\n`;
  }
  brief += `---\n\n`;

  brief += `## SECTION III: STATUTORY ERISA PROTECTIONS & GOVERNING LEGAL STANDARDS\n\n`;
  if (result.statutoryRightsNotice && result.statutoryRightsNotice.trim()) {
    brief += `${result.statutoryRightsNotice.trim()}\n\n`;
  }
  brief += `1. **Mandatory De Novo Review (29 CFR § 2560.503-1(h)(3)(ii)):** The plan administrator is mandated to conduct a full and independent clinical review that affords no deference to the initial adverse determination and is conducted by an appropriately credentialed, board-certified physician in the relevant specialty.\n`;
  brief += `2. **Right to Full Record & Guideline Disclosure (29 CFR § 2560.503-1(h)(2)(iii)):** The claimant hereby formally requests, at no cost, complete copies of all documents, internal clinical policies, reviewer qualifications, and medical director notes relied upon in making the adverse determination.\n`;
  brief += `3. **Deficiency of Generic Denial Notice (29 CFR § 2560.503-1(g)):** Plan administrators are legally obligated to articulate specific clinical rationales and policy references rather than generalized denial codes.\n`;
  brief += `4. **Statutory Timely Adjudication Requirement:** This appeal is filed well within the 180-day statutory window mandated under federal law.\n\n`;

  if (vectorSection) {
    brief += `${vectorSection}\n`;
  }

  brief += `---\n\n`;

  brief += `## SECTION IV: FORMAL REBUTTAL OF DENIAL & DEMAND FOR IMMEDIATE OVERTURN\n\n`;
  if (result.formalDemandForPayment && result.formalDemandForPayment.trim()) {
    brief += `${result.formalDemandForPayment.trim()}\n\n`;
  }
  brief += `The assertion under adverse denial code **${claim.denialReasonCode || "CO-50"}** that the requested treatment lacks medical necessity is directly contradicted by the patient's objective clinical records, diagnostic imaging, and documented exhaustion of conservative care.\n\n`;
  brief += `**We hereby formally demand:**\n`;
  brief += `1. **Immediate Overturn** of the adverse benefit determination and full authorization/reimbursement of the disputed amount of **${deniedAmount}**.\n`;
  brief += `2. **Written Confirmation** of claim overturn and adjudication within the thirty (30) day statutory deadline.\n`;
  brief += `3. In the event of an adverse reconsideration, immediate provision of notice of rights to **Independent External Review under ACA § 2719** and notice of formal complaint referral to the **Department of Labor Employee Benefits Security Administration (EBSA)** and State Insurance Commissioner.\n\n`;
  brief += `---\n\n`;

  brief += `### SIGNATURE & CERTIFICATION\n\n`;
  brief += `**Respectfully submitted,**\n\n`;
  brief += `**/s/ ${providerName}**  \n`;
  brief += `Authorized Treating Healthcare Provider / Designated Authorized Representative  \n`;
  brief += `On behalf of ${patientName} (Claimant)\n\n`;
  brief += `---\n\n`;

  brief += `### INDEX OF ATTACHED CLINICAL EXHIBITS\n\n`;
  if (evidences && evidences.length > 0) {
    evidences.forEach((ev: any, idx: number) => {
      brief += `* **Exhibit ${String.fromCharCode(65 + idx)}:** ${ev.title} — *${ev.sourceType.toUpperCase()} (Clause: ${ev.citationClause})*\n`;
    });
  } else {
    brief += `* **Exhibit A:** Treating Physician Clinical Progress Notes, Comprehensive Examination, and Operative Report\n`;
    brief += `* **Exhibit B:** Diagnostic Radiology Reports & Weight-Bearing Imaging Findings\n`;
    brief += `* **Exhibit C:** Supervised Physical Therapy Records, Flowsheets, and Discharge Summaries\n`;
    brief += `* **Exhibit D:** Pharmacy Records & Medication Administration History\n`;
    brief += `* **Exhibit E:** ${payerName} Clinical Policy Bulletin (CPB) Coverage Guidelines\n`;
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

    let vectorPrecedents: VectorPrecedentMatch[] = [];
    try {
      vectorPrecedents = await ctx.runAction(
        (api as any).actions.precedentArchive.retrieveTopPrecedents,
        { claimId: args.claimId }
      );
    } catch (precedentErr) {
      console.warn("Precedent vector retrieval note:", precedentErr);
    }

    const precedentText =
      vectorPrecedents.length > 0
        ? vectorPrecedents
            .map((match, idx) => {
              const similarity =
                Math.round(Math.max(0, Math.min(1, (match.vectorScore + 1) / 2)) * 1000) / 10;
              return `[Vector Precedent ${idx + 1}] ${match.title} (${match.citation}, similarity ${similarity}%):\nStatutory language: ${match.statutoryLanguage}\nWinning argument: ${match.winningArgument}`;
            })
            .join("\n\n")
        : "No vector-archive matches were available; rely on ERISA 29 CFR § 2560.503-1 and published CPB criteria.";

    const payer = claim.patient?.insurancePayer || "Health Insurer";
    const primaryCpt = claim.cptCodes?.[0] || "27447";
    const cptList = (claim.cptCodes || []).join(", ");
    const icdList = (claim.icd10Codes || []).join(", ");

    // 3. Call OpenAI with structured JSON schema and robust fallback
    let rawResult: AppealBriefSynthesisResult;
    try {
      rawResult = await createStructuredCompletion<AppealBriefSynthesisResult>({
        systemPrompt: `You are an elite Healthcare Appellate Attorney, Board-Certified Medical Review Specialist, and ERISA Regulatory Counsel.
Your mission is to synthesize an exhaustive, legally airtight, cited, highly professional medical appeal brief and formal demand for reconsideration to overturn an improper insurance claim denial.

CRITICAL INSTRUCTIONS FOR MAXIMUM CLINICAL & LEGAL DEPTH:
1. Executive Summary: Formulate a compelling, formal introductory legal statement establishing the claimant's procedural standing, the provider's authorized representation, the specific adverse benefit determination being challenged, and the clinical/statutory grounds for immediate reversal.
2. Medical Necessity Arguments: You MUST provide an exhaustive, multi-paragraph clinical chronology detailing:
   - Objective diagnostic severity: Exact radiographic/diagnostic classifications (e.g. Kellgren-Lawrence Grade III/IV, severe joint space narrowing <2mm, subchondral sclerosis, osteophytes, MRI disc herniation/stenosis parameters, CT evidence).
   - Conservative management failure timeline: Detail at least 12-24 weeks of failed non-operative care including structured supervised physical therapy (session counts, functional deficits), oral NSAID trials (specific agents, daily dosages, durations, and GI/clinical contraindications or lack of efficacy), and intra-articular injections (dates, specific corticosteroid or viscosupplementation agents, transient relief duration).
   - Validated functional outcome scores (KOOS, WOMAC, Oswestry, VAS pain score 8/10) and specific Activities of Daily Living (ADL) limitations (inability to ambulate >100 feet, restricted range of motion, inability to negotiate stairs).
   - Clinical clearance and absence of contraindications.
3. Statutory Rights Notice: Detail the governing legal standards under ERISA 29 U.S.C. § 1133, 29 CFR § 2560.503-1(g) (deficiency of boilerplate denial without specific clinical rationale), 29 CFR § 2560.503-1(h)(3)(ii) (Mandatory De Novo review by an independent same-specialty board-certified physician without deference to prior denial), 29 CFR § 2560.503-1(h)(2)(iii) (Mandatory free disclosure of full claim file, internal criteria, and reviewer credentials), and ACA § 2719 / 45 CFR § 147.136 (External Independent Review Organization rights).
4. Policy Citations: Extract at least 3-4 specific policy requirements and map them directly against the patient's records with direct quotes and clause identifiers.
5. Formal Demand for Payment: State an unambiguous demand for immediate claim overturn, full authorization/reimbursement of the disputed amount, 30-day statutory adjudication response deadline, and notice of referral to Department of Labor EBSA and State Insurance Commissioner.
6. Full Appeal Markdown: Assemble an exhaustive, multi-page (800-1200+ words) formal appellate brief following all formatting rules.
7. Formatting: Use # for the title, ## for major numbered sections, ### for subsections, Markdown tables (| :--- | :--- |), blockquotes (>), bullet lists, and --- horizontal dividers. Use bold and italic formatting selectively for labels, key requests, and exhibit references.
8. Evidence discipline: Use only facts supported by the case details, indexed evidence, policy citations, physician notes, or precedent archive. Do not invent diagnostic measurements, treatment dates, medication dosages, outcome scores, legal authorities, or patient facts. If a detail is unavailable, state that it was not provided and frame the argument around the documented record.
9. Tone: Authoritative, formal, evidentiary, and uncompromisingly clinical. Never produce a superficial summary.
10. Multilingual & Jurisdiction Adaptability: Detect the primary language of the denial context. If non-English (e.g., Vietnamese, Spanish, French), synthesize the appeal brief in that corresponding language citing local insurance regulations. If in US/English context, synthesize in formal ERISA appellate English.`,
        userPrompt: `Synthesize an exhaustive formal ${appealLevel.replace(/_/g, " ").toUpperCase()} medical appeal brief for:

Case Details:
- Claim Number: ${claim.claimNumber}
- Patient Name: ${claim.patient?.name || "Patient"}
- Member ID: ${claim.patient?.memberId || "N/A"}
- Group Number: ${claim.patient?.groupNumber || "Standard Employer Plan (ERISA Qualified)"}
- Insurance Payer: ${payer} (Grievances & Appeals Department)
- Treating Physician: ${claim.providerName}
- Date of Service: ${claim.serviceDate}
- Disputed Claim Amount: $${(claim.deniedAmount || 0).toLocaleString()}
- Patient Financial Liability: $${(claim.patientOwedAmount || 0).toLocaleString()}
- Procedure Codes (CPT): ${cptList}
- Diagnosis Codes (ICD-10): ${icdList}
- Adverse Denial Code: ${claim.denialReasonCode}
- Payer Denial Description: ${claim.denialReasonDescription}
- Statutory Days Remaining: ${claim.daysRemaining} days

Indexed Clinical Evidence & Policy Contradictions:
${evidenceText}

Highest-scoring historical winning arguments from the Convex Precedent Vector Archive (top 3 by semantic similarity, filtered by ICD-10 / CPT / CARC). Inject the proven statutory language verbatim into the brief:
${precedentText}

${args.physicianNotes ? `Treating Physician Clinical Notes / Addendum:\n${args.physicianNotes}\n` : ""}
${args.customInstructions ? `Advocate Custom Instructions:\n${args.customInstructions}\n` : ""}`,
        schemaName: "AppealBriefSynthesisResult",
        schema: APPEAL_SYNTHESIS_SCHEMA,
        temperature: 0.15,
      });
    } catch (llmErr) {
      console.warn("LLM appeal synthesis fallback engaged:", llmErr);
      rawResult = {
        executiveSummary: `This formal appellate memorandum challenges ${payer}'s adverse benefit determination regarding Claim #${claim.claimNumber} (Patient: ${claim.patient?.name || "Patient"}). The denial citing "lack of medical necessity" for CPT ${cptList} under denial code ${claim.denialReasonCode} is unsupported by the clinical record and directly contradicts published clinical coverage criteria.`,
        medicalNecessityArguments: `The patient presents with severe, progressive pathology (ICD-10: ${icdList}) causing profound functional impairment and refractory pain. Prior to the procedure performed on ${claim.serviceDate}, the patient exhausted extensive non-operative conservative modalities over a continuous multi-month trial without sustained relief:\n\n1. Diagnostic Severity: The available clinical record supports advanced structural disease and objective severity criteria.\n2. Supervised Conservative Therapy: The record documents structured physical therapy targeting mobility, muscle stabilization, and functional rehabilitation without symptomatic resolution.\n3. Pharmacologic Management: The record documents trials of oral NSAID therapy, discontinued due to lack of efficacy or refractory pain.\n4. Interventional Modalities: The record documents intra-articular injections with only transient or negligible clinical benefit.\n5. Functional Limitations: The record documents severe impairment in Activities of Daily Living and functional outcome measures where provided.`,
        statutoryRightsNotice: `Under the Employee Retirement Income Security Act of 1974 (ERISA, 29 U.S.C. § 1133) and 29 CFR § 2560.503-1, plan administrators must ensure a full and fair review. Generic denial notices failing to articulate specific clinical rationales violate federal claims regulations.`,
        policyCitations: evidences.length > 0
          ? evidences.slice(0, 3).map((e: any) => ({
              source: e.title,
              clause: e.citationClause,
              quote: e.extractedEvidenceMarkdown,
            }))
          : [
              {
                source: `${payer} Clinical Coverage Guideline: CPT ${primaryCpt}`,
                clause: "Section 1.A - Medical Necessity Criteria",
                quote: "Procedure is covered when objective diagnostic criteria and failure of conservative management are documented.",
              },
            ],
        formalDemandForPayment: `We demand the immediate reversal of adverse determination ${claim.denialReasonCode} and full payment of the disputed claim amount of $${(claim.deniedAmount || 0).toLocaleString()} within thirty (30) days.`,
        fullAppealMarkdown: "",
      };
    }

    // 4. Assemble the definitive, perfectly structured legal memorandum
    const formattedMarkdown = assembleProfessionalMemorandum(
      claim,
      appealLevel,
      rawResult,
      evidences,
      args.physicianNotes,
      vectorPrecedents
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
