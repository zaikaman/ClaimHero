"use node";

import { action } from "../_generated/server";
import { v } from "convex/values";
import { createStructuredCompletion } from "../lib/openai";
import { api } from "../_generated/api";
import { precedentMatchValidator } from "../lib/precedentValidators";

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

export interface AppealSenderDetails {
  name?: string;
  credentials?: string;
  email?: string;
  phone?: string;
}

export interface ClinicalFacts {
  symptomsAndFunctionalImpact?: string;
  examinationFindings?: string;
  imagingAndDiagnostics?: string;
  treatmentHistoryAndResponse?: string;
  otherDocumentedFacts?: string;
  recordsAreIncomplete: boolean;
}

const SAFE_STATUTORY_RIGHTS_NOTICE =
  "Please process this appeal under the plan's claims and appeals procedure and the instructions in the denial notice. If ERISA applies, please treat this as a request for full and fair review under 29 C.F.R. § 2560.503-1 and provide, upon request, the documents, records, plan provisions, clinical policies or criteria, and other information relevant to this claim. If external review is available, please include the applicable process and deadline in your determination.";

function cleanGeneratedSection(value?: string): string {
  if (!value) return "";

  const text = value.replace(/\r/g, "").trim();
  const internalMarker = text.search(
    /(?:^|\n)#{1,3}\s+(?:Vector-Retrieved|Index of Attached|Case Identification)|(?:^|\n)Convex native vector search/i
  );

  return (internalMarker >= 0 ? text.slice(0, internalMarker) : text)
    .replace(/[‐‑‒–—]/g, "-")
    .replace(/^#{1,6}\s+/gm, "")
    .trim();
}

function formatMoney(amount: number): string {
  return `$${amount.toLocaleString("en-US")}`;
}

function formatServiceDate(value?: string): string {
  if (!value) return "Not provided";
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return value;

  const [, year, month, day] = match;
  return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day))).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function formatDenialReason(code?: string, description?: string): string {
  const cleanDescription = description?.replace(/\s+/g, " ").trim().replace(/[.?!]+$/, "");
  if (!code && !cleanDescription) return "Not provided";

  if (
    code?.toUpperCase() === "CO-50" &&
    cleanDescription &&
    /these are non-covered services because this is not deemed a medical necessity by the payer/i.test(cleanDescription)
  ) {
    return `${code} - Service denied as not medically necessary`;
  }

  return [code, cleanDescription].filter(Boolean).join(" - ");
}

const UNSUPPORTED_CLINICAL_CONCLUSION =
  /clinical documentation confirms|meets? (?:the |applicable )?criteria|does not present with|does not document (?:any )?active joint or systemic infection|does not document (?:any )?(?:active )?(?:joint|systemic) infection|no (?:absolute )?contraindications?|absence of (?:an )?(?:active )?(?:joint|systemic) infection|(?:failed|failure of|exhausted) conservative|end[- ]stage|bone[- ]on[- ]bone|necessitated the surgical intervention|supports? (?:the )?medical necessity|is medically appropriate|is medically necessary|we maintain that treatment was medically appropriate/i;

function buildNeutralClinicalBasis(claim: any): string {
  const procedureCodes = claim.cptCodes?.join(", ") || "the procedure listed on the claim";
  const diagnosisCodes = claim.icd10Codes?.join(", ") || "the diagnosis listed on the claim";

  return `The claim record identifies procedure code(s) ${procedureCodes} and diagnosis code(s) ${diagnosisCodes}. The available claim record does not independently document the patient-specific examination findings, imaging, functional limitations, or treatment history needed to state additional medical-necessity facts. Please evaluate the clinical records submitted with this appeal against the applicable plan criteria.`;
}

function quoteUserFact(value: string): string {
  return value
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n");
}

function buildDocumentedClinicalBasis(claim: any, clinicalFacts?: ClinicalFacts): string {
  const fields: Array<[string, string | undefined]> = [
    ["Symptoms and functional impact", clinicalFacts?.symptomsAndFunctionalImpact],
    ["Examination findings", clinicalFacts?.examinationFindings],
    ["Imaging and diagnostic findings", clinicalFacts?.imagingAndDiagnostics],
    ["Treatment history and response", clinicalFacts?.treatmentHistoryAndResponse],
    ["Other documented facts", clinicalFacts?.otherDocumentedFacts],
  ];
  const presentFields = fields.filter(([, value]) => value?.trim());
  const missingFields = fields.filter(([, value]) => !value?.trim()).map(([label]) => label.toLowerCase());

  if (presentFields.length === 0) {
    return `${buildNeutralClinicalBasis(claim)} No conclusion about medical necessity is asserted because the patient-specific clinical record was not provided to ClaimHero.`;
  }

  let basis = clinicalFacts?.recordsAreIncomplete || missingFields.length > 0
    ? `The clinical record available for review is incomplete. The following areas were not provided: ${missingFields.join(", ") || "none identified"}. No conclusion about medical necessity is asserted from those missing areas.\n\n`
    : "The following patient-specific information was supplied for review. ClaimHero has not independently verified these entries and does not treat them as established solely because they were entered here:\n\n";

  basis += presentFields
    .map(([label, value]) => `**${label}:**\n\n${quoteUserFact(value!.trim())}`)
    .join("\n\n");

  return basis;
}

function buildGroundedClinicalBasis(
  value: string | undefined,
  claim: any,
  clinicalFacts?: ClinicalFacts
): string {
  if (clinicalFacts) return buildDocumentedClinicalBasis(claim, clinicalFacts);

  const cleaned = cleanGeneratedSection(value);
  return cleaned && !UNSUPPORTED_CLINICAL_CONCLUSION.test(cleaned)
    ? cleaned
    : buildNeutralClinicalBasis(claim);
}

function buildPaymentRequest(claimNumber: string): string {
  return `Reconsider and reprocess Claim #${claimNumber} under the applicable plan terms. If benefits are payable, please issue payment according to the plan and applicable provider agreement for the covered amount.`;
}

function buildSignature(providerName: string, sender?: AppealSenderDetails): string {
  const senderLines = [sender?.name, sender?.credentials, sender?.email, sender?.phone]
    .map((value) => value?.trim())
    .filter(Boolean) as string[];

  if (senderLines.length === 0) {
    return `Sincerely,\n\nClaimHero Appeals Desk\nTreating provider listed in the claim: ${providerName}`;
  }

  return `Sincerely,\n\n${senderLines.join("\n")}\nTreating provider listed in the claim: ${providerName}`;
}

function isExternalEvidence(evidence: any): boolean {
  const searchableText = [
    evidence.sourceType,
    evidence.title,
    evidence.citationClause,
    evidence.extractedEvidenceMarkdown,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return evidence.sourceType !== "legal_precedent" &&
    !/(?:vector similarity|combined score|winning brief|claimhero overturned)/i.test(searchableText);
}

function cleanEvidenceSummary(value?: string): string {
  const summary = cleanGeneratedSection(value)
    .split("\n")
    .filter((line) => !/^\s*(?:outcome|vector similarity|combined score)\s*:/i.test(line))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

  if (summary.length <= 220) return summary;
  return `${summary.slice(0, 217).replace(/\s+\S*$/, "")}...`;
}

function buildGroundedPolicyCitations(evidences: any[]): PolicyCitationItem[] {
  return evidences
    .filter((e) => isExternalEvidence(e) && e.title && e.citationClause && e.extractedEvidenceMarkdown)
    .slice(0, 5)
    .map((e) => ({
      source: e.title,
      clause: e.citationClause,
      quote: e.extractedEvidenceMarkdown,
    }));
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

export function assembleProfessionalAppealEmail(
  claim: any,
  _appealLevel: string,
  result: AppealBriefSynthesisResult,
  evidences: any[],
  physicianNotes?: string,
  _vectorPrecedents?: VectorPrecedentMatch[],
  sender?: AppealSenderDetails,
  clinicalFacts?: ClinicalFacts
): string {
  const providerName = claim.providerName;
  const patientName = claim.patient.name;
  const claimNumber = claim.claimNumber;
  const cptCodes = claim.cptCodes.join(", ");
  const icd10Codes = claim.icd10Codes.join(", ");
  const denialReason = formatDenialReason(claim.denialReasonCode, claim.denialReasonDescription);
  const clinicalBasis = buildGroundedClinicalBasis(result.medicalNecessityArguments, claim, clinicalFacts);
  const supportingEvidences = evidences.filter(isExternalEvidence);

  let email = `# Appeal of Adverse Benefit Determination\n\n`;
  email += `**Claim reference:** #${claimNumber}\n\n`;
  email += `**Claim details**\n`;
  email += `- Patient/member: ${patientName}\n`;
  email += `- Member ID: ${claim.patient.memberId}\n`;
  if (claim.patient.groupNumber) email += `- Group number: ${claim.patient.groupNumber}\n`;
  email += `- Date of service: ${formatServiceDate(claim.serviceDate)}\n`;
  email += `- Procedure code(s): ${cptCodes}\n`;
  email += `- Diagnosis code(s): ${icd10Codes}\n`;
  email += `- Denial reason: ${denialReason}\n`;
  email += `- Amount at issue: ${formatMoney(claim.deniedAmount)}\n\n`;
  email += `Dear Appeals and Grievances Team,\n\n`;
  email += `I request reconsideration of the adverse benefit determination for Claim #${claimNumber}, relating to the service provided on ${formatServiceDate(claim.serviceDate)}. The denial notice identifies ${denialReason}. Please review the submitted clinical records and applicable plan criteria and reprocess the claim if benefits are payable under the plan.\n\n`;

  email += `## Clinical basis for reconsideration\n\n`;
  email += `${clinicalBasis ||
    "The claim record currently contains the identifying and denial information above but does not provide enough clinical history to state additional medical-necessity facts. Please evaluate the submitted clinical records and the applicable coverage criteria."}\n\n`;

  if (physicianNotes?.trim()) {
    const label = clinicalFacts
      ? "Additional clinical information supplied for review (not independently verified)"
      : "Treating provider note submitted for review";
    email += `${label}:\n\n> ${physicianNotes.trim().replace(/\n/g, "\n> ")}\n\n`;
  }

  if (supportingEvidences.length > 0) {
    email += `## Supporting documentation for review\n\n`;
    email += `The following policy materials are identified as review references. They should be evaluated together with the patient-specific clinical records:\n\n`;
    supportingEvidences.slice(0, 5).forEach((evidence: any) => {
      const details = cleanEvidenceSummary(evidence.extractedEvidenceMarkdown);
      const sourceLink = evidence.sourceUrl ? ` [Official source](${evidence.sourceUrl})` : "";
      email += `- **${evidence.title}** - ${evidence.citationClause}${sourceLink}${details ? `: ${details}` : ""}\n`;
    });
    email += `\n`;
  }

  email += `## Review requested\n\n`;
  email += `Please:\n\n`;
  email += `1. ${buildPaymentRequest(claimNumber)}\n`;
  email += `2. If the denial is upheld, provide the specific clinical rationale, plan provision, criteria applied, and documents relied upon.\n`;
  email += `3. Confirm receipt of this appeal and identify the applicable decision timeframe and any further review or external-review instructions.\n\n`;
  email += `${SAFE_STATUTORY_RIGHTS_NOTICE}\n\n`;
  email += `Thank you for your review. Please reference Claim #${claimNumber} in any response or request for additional information.\n\n`;
  email += buildSignature(providerName, sender);

  return email;
}

// Kept as a compatibility export for existing studio and test integrations.
export const assembleProfessionalMemorandum = assembleProfessionalAppealEmail;

/**
 * Appeal Synthesizer Action: Generate grounded professional payer appeal correspondence.
 */
export const generateAppealBrief = action({
  args: {
    claimId: v.id("claims"),
    appealLevel: v.optional(v.string()),
    physicianNotes: v.optional(v.string()),
    senderName: v.optional(v.string()),
    senderCredentials: v.optional(v.string()),
    senderEmail: v.optional(v.string()),
    senderPhone: v.optional(v.string()),
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
    customInstructions: v.optional(v.string()),
    vectorPrecedents: v.optional(v.array(precedentMatchValidator)),
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

    const externalEvidences = evidences.filter(isExternalEvidence);
    const persistedContext = claim.appealContext;
    const clinicalFacts: ClinicalFacts | undefined = args.clinicalFacts || persistedContext?.clinicalFacts;
    const sender: AppealSenderDetails | undefined = args.senderName?.trim()
      ? {
          name: args.senderName,
          credentials: args.senderCredentials,
          email: args.senderEmail,
          phone: args.senderPhone,
        }
      : persistedContext?.sender || {
      name: args.senderName,
      credentials: args.senderCredentials,
      email: args.senderEmail,
      phone: args.senderPhone,
    };

    if (!sender?.name?.trim() || (!sender.email?.trim() && !sender.phone?.trim())) {
      throw new Error("Complete sender details before generating an appeal");
    }
    if (!clinicalFacts) {
      throw new Error("Confirm the available clinical record before generating an appeal");
    }
    const evidenceText = externalEvidences.length > 0
      ? externalEvidences.map((e: any, idx: number) => `[Source ${idx + 1}] (${e.sourceType.toUpperCase()} - ${e.title} - ${e.citationClause}):\n${e.extractedEvidenceMarkdown}`).join("\n\n")
      : "Standard national clinical practice guideline and ERISA disclosure rules apply.";

    let vectorPrecedents: VectorPrecedentMatch[] = args.vectorPrecedents || [];
    if (!args.vectorPrecedents) {
      try {
        vectorPrecedents = await ctx.runAction(
          (api as any).actions.precedentArchive.retrieveTopPrecedents,
          { claimId: args.claimId }
        );
      } catch (precedentErr) {
        console.warn("Precedent vector retrieval note:", precedentErr);
      }
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
    const cptList = (claim.cptCodes || []).join(", ");
    const icdList = (claim.icd10Codes || []).join(", ");

    // 3. Call OpenAI with structured JSON schema and robust fallback
    let rawResult: AppealBriefSynthesisResult;
    try {
      rawResult = await createStructuredCompletion<AppealBriefSynthesisResult>({
        systemPrompt: `You draft professional healthcare payer correspondence. Produce content that can be sent as the body of a normal appeal email, not a litigation memorandum and not legal advice.

Evidence and safety rules:
1. Use only facts explicitly present in the case details, indexed evidence, and treating-provider notes. Never invent symptoms, severity grades, measurements, treatment dates, medication names or doses, outcome scores, functional limitations, clearance, authorization, representation authority, plan type, jurisdiction, deadlines, or eligibility.
2. Do not infer patient-specific clinical facts from diagnosis or procedure codes, policy criteria, or the absence of a documented contraindication. If the record does not contain clinical findings, say so plainly.
3. Do not turn an evidence summary into a quotation. Preserve the source's meaning and identify it as a source or review reference.
4. Treat the precedent archive as internal retrieval context. Never mention vector search, similarity scores, ClaimHero winning briefs, or internal archive labels in the email.
5. Do not state that a legal rule was violated or that ERISA, ACA, external review, a 180-day filing period, or a 30-day response period applies unless the case record establishes that applicability. Use conditional, review-oriented language when necessary.
6. Be concise and practical: a salutation, short paragraphs, a clinical rationale grounded in the record, a specific request, and a professional closing. The application supplies the email subject separately. Do not use all-caps filler, exhibit indexes, markdown tables, horizontal rules, threats, or ceremonial language.
7. The application assembles the final email from your structured fields. Return an empty string for fullAppealMarkdown; do not write a second full document there.

Write the structured fields in English unless the denial materials clearly establish another language.`,
        userPrompt: `Draft the content for a ${appealLevel.replace(/_/g, " ")} medical appeal email for:

Case Details:
- Claim Number: ${claim.claimNumber}
- Patient Name: ${claim.patient?.name}
- Member ID: ${claim.patient?.memberId}
- Group Number: ${claim.patient?.groupNumber || "Not provided"}
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

Internal precedent retrieval context. Use only to identify potentially relevant issues; do not mention this context or copy its language into the email:
${precedentText}

${args.physicianNotes ? `Treating Physician Clinical Notes / Addendum:\n${args.physicianNotes}\n` : ""}
${clinicalFacts ? `Human-confirmed clinical intake facts. Quote or accurately summarize only these entries; do not infer additional facts:\n${JSON.stringify(clinicalFacts)}\n` : "No patient-specific clinical intake facts were provided. State that the clinical record is incomplete.\n"}
${sender?.name ? `Sender details for the closing (use only as provided):\n- Name: ${sender.name}\n- Credentials or role: ${sender.credentials || "Not provided"}\n- Email: ${sender.email || "Not provided"}\n- Phone: ${sender.phone || "Not provided"}\n` : ""}
${args.customInstructions ? `Advocate Custom Instructions:\n${args.customInstructions}\n` : ""}

Return a short, evidence-grounded email draft in the structured fields. If a clinical detail is not present, say that the current record does not provide it rather than filling the gap.`,
        schemaName: "AppealBriefSynthesisResult",
        schema: APPEAL_SYNTHESIS_SCHEMA,
        temperature: 0.15,
      });
    } catch (llmErr) {
      console.warn("LLM appeal synthesis fallback engaged:", llmErr);
      rawResult = {
        executiveSummary: `This appeal requests reconsideration of the adverse benefit determination for Claim #${claim.claimNumber}, based on the claim details and supporting sources currently available.`,
        medicalNecessityArguments: buildNeutralClinicalBasis(claim),
        statutoryRightsNotice: SAFE_STATUTORY_RIGHTS_NOTICE,
        policyCitations: buildGroundedPolicyCitations(evidences),
        formalDemandForPayment: buildPaymentRequest(claim.claimNumber),
        fullAppealMarkdown: "",
      };
    }

    const groundedPolicyCitations = buildGroundedPolicyCitations(evidences);
    const groundedMedicalNecessityArguments = buildGroundedClinicalBasis(
      rawResult.medicalNecessityArguments,
      claim,
      clinicalFacts
    );
    const safeResult: AppealBriefSynthesisResult = {
      ...rawResult,
      // These fields are deliberately deterministic so the model cannot turn
      // an uncertain jurisdiction or deadline into a legal conclusion.
      statutoryRightsNotice: SAFE_STATUTORY_RIGHTS_NOTICE,
      medicalNecessityArguments: groundedMedicalNecessityArguments,
      policyCitations: groundedPolicyCitations,
      formalDemandForPayment: buildPaymentRequest(claim.claimNumber),
      fullAppealMarkdown: "",
    };

    // 4. Assemble a sendable email from grounded case data and concise model sections.
    const formattedMarkdown = assembleProfessionalMemorandum(
      claim,
      appealLevel,
      safeResult,
      evidences,
      args.physicianNotes,
      vectorPrecedents,
      sender,
      clinicalFacts
    );

    const result: AppealBriefSynthesisResult = {
      ...safeResult,
      fullAppealMarkdown: formattedMarkdown,
    };

    // 5. Persist only grounded source summaries, never model-invented citations.
    const citationsSummary = groundedPolicyCitations
      .map((c: PolicyCitationItem) => `- ${c.source} (${c.clause}): ${c.quote}`)
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
