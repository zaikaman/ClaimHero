"use node";

import { action } from "../_generated/server";
import { v } from "convex/values";
import { createStructuredCompletion } from "../lib/openai";
import { internal } from "../_generated/api";
import { rateLimiter } from "../lib/rateLimiter";

const P2P_DEFENSE_SCHEMA = {
  type: "object",
  properties: {
    openingStatutoryStatement: { type: "string" },
    clinicalPolicyCitations: {
      type: "array",
      items: {
        type: "object",
        properties: {
          cpbTitle: { type: "string" },
          section: { type: "string" },
          criteriaMetText: { type: "string" },
          rebuttalBullet: { type: "string" },
          sourceUrl: { type: "string" },
        },
        required: ["cpbTitle", "section", "criteriaMetText", "rebuttalBullet", "sourceUrl"],
        additionalProperties: false,
      },
    },
    disqualificationCounters: {
      type: "array",
      items: {
        type: "object",
        properties: {
          insurerTrapQuestion: { type: "string" },
          physicianDirectRebuttal: { type: "string" },
          clinicalRationale: { type: "string" },
          regulatoryLeverage: { type: "string" },
        },
        required: [
          "insurerTrapQuestion",
          "physicianDirectRebuttal",
          "clinicalRationale",
          "regulatoryLeverage",
        ],
        additionalProperties: false,
      },
    },
    statutoryDemands: { type: "string" },
    condensedCheatSheet: {
      type: "object",
      properties: {
        rapidChecklist: {
          type: "array",
          items: { type: "string" },
        },
        keyDiagnosisCodes: {
          type: "array",
          items: { type: "string" },
        },
        keyProcedureCodes: {
          type: "array",
          items: { type: "string" },
        },
        mustSayPoints: {
          type: "array",
          items: { type: "string" },
        },
        doNotConcedePoints: {
          type: "array",
          items: { type: "string" },
        },
        closingDemandStatement: { type: "string" },
      },
      required: [
        "rapidChecklist",
        "keyDiagnosisCodes",
        "keyProcedureCodes",
        "mustSayPoints",
        "doNotConcedePoints",
        "closingDemandStatement",
      ],
      additionalProperties: false,
    },
  },
  required: [
    "openingStatutoryStatement",
    "clinicalPolicyCitations",
    "disqualificationCounters",
    "statutoryDemands",
    "condensedCheatSheet",
  ],
  additionalProperties: false,
};

export interface PolicyCitationScriptItem {
  cpbTitle: string;
  section: string;
  criteriaMetText: string;
  rebuttalBullet: string;
  sourceUrl?: string;
}

export interface DisqualificationCounter {
  insurerTrapQuestion: string;
  physicianDirectRebuttal: string;
  clinicalRationale: string;
  regulatoryLeverage?: string;
}

export interface CondensedCheatSheet {
  rapidChecklist: string[];
  keyDiagnosisCodes: string[];
  keyProcedureCodes: string[];
  mustSayPoints: string[];
  doNotConcedePoints: string[];
  closingDemandStatement: string;
}

export interface P2PDefenseSynthesisResult {
  openingStatutoryStatement: string;
  clinicalPolicyCitations: PolicyCitationScriptItem[];
  disqualificationCounters: DisqualificationCounter[];
  statutoryDemands: string;
  condensedCheatSheet: CondensedCheatSheet;
  fullScriptMarkdown: string;
}

import type { Doc, Id } from "../_generated/dataModel";

interface P2PClaimContext {
  _id: Id<"claims">;
  claimNumber: string;
  patient?: { name?: string; memberId?: string; state?: string; insurancePayer?: string };
  cptCodes?: string[];
  icd10Codes?: string[];
  deniedAmount: number;
  denialReasonCode?: string;
  denialReasonDescription?: string;
  providerName?: string;
  appealContext?: {
    sender?: { name?: string; credentials?: string };
    physicianNotes?: string;
  };
  userId?: Id<"users">;
}

function assembleFullP2PScriptMarkdown(
  claim: P2PClaimContext,
  physicianName: string,
  physicianSpecialty: string,
  medicalDirectorRole: string,
  data: {
    openingStatutoryStatement: string;
    clinicalPolicyCitations: PolicyCitationScriptItem[];
    disqualificationCounters: DisqualificationCounter[];
    statutoryDemands: string;
  }
): string {
  const payer = claim.patient?.insurancePayer || "Health Insurer";
  const cptList = (claim.cptCodes || []).join(", ");
  const icdList = (claim.icd10Codes || []).join(", ");

  let md = `# Peer-to-Peer (P2P) Defense Tele-Script\n\n`;
  md += `**Case Reference:** Claim #${claim.claimNumber} | **Member:** ${claim.patient?.name || "Patient"} (ID: ${claim.patient?.memberId || "N/A"})\n`;
  md += `**Target Call Duration:** 3 Minutes | **Payer:** ${payer} (${medicalDirectorRole})\n`;
  md += `**Treating Physician:** ${physicianName}${physicianSpecialty ? ` (${physicianSpecialty})` : ""}\n`;
  md += `**Codes at Issue:** CPT ${cptList} | ICD-10 ${icdList} | **Denied Amount:** $${(claim.deniedAmount || 0).toLocaleString()}\n\n`;

  md += `---\n\n`;
  md += `## [0:00 - 0:45] Phase 1: Statutory Opening & Credential Challenge\n\n`;
  md += `> **Physician Verbal Script (Read directly upon call connection):**\n\n`;
  md += `${data.openingStatutoryStatement}\n\n`;

  md += `---\n\n`;
  md += `## [0:45 - 2:00] Phase 2: Exact Policy Section Citations & Clinical Defense\n\n`;
  md += `> **Physician Verbal Script (Cite exact published criteria sections):**\n\n`;
  if (data.clinicalPolicyCitations.length > 0) {
    data.clinicalPolicyCitations.forEach((cit, idx) => {
      md += `**Point ${idx + 1} (${cit.cpbTitle} § ${cit.section}):**\n`;
      md += `"${cit.rebuttalBullet}"\n`;
      md += `*Documented clinical proof:* ${cit.criteriaMetText}\n\n`;
    });
  } else {
    md += `"Under ${payer}'s published clinical policy bulletin criteria and established national standard of care, the patient meets all medical necessity indications for CPT ${cptList} under diagnosis ${icdList}. The clinical chart submitted confirms objective failure of conservative modalities and acute functional limitation."\n\n`;
  }

  md += `---\n\n`;
  md += `## [2:00 - 2:45] Phase 3: Disqualification Trap Counters\n\n`;
  md += `*When the medical director attempts the following standard disqualification questions, deliver the direct rebuttal:*\n\n`;
  data.disqualificationCounters.forEach((dc, idx) => {
    md += `### Trap Question ${idx + 1}: "${dc.insurerTrapQuestion}"\n`;
    md += `**Physician Counter-Strike:**\n`;
    md += `> "${dc.physicianDirectRebuttal}"\n\n`;
    md += `*Clinical Rationale:* ${dc.clinicalRationale}\n`;
    if (dc.regulatoryLeverage) {
      md += `*Regulatory Leverage:* ${dc.regulatoryLeverage}\n`;
    }
    md += `\n`;
  });

  md += `---\n\n`;
  md += `## [2:45 - 3:30] Phase 4: State Bad-Faith Warning & Written Denial Demand\n\n`;
  md += `> **Physician Closing Salvo (Before concluding the call):**\n\n`;
  md += `${data.statutoryDemands}\n\n`;

  return md;
}

function buildDeterministicFallback(
  claim: P2PClaimContext,
  evidences: Doc<"clinicalEvidences">[],
  physicianName: string,
  physicianSpecialty: string,
  medicalDirectorRole: string
): P2PDefenseSynthesisResult {
  const payer = claim.patient?.insurancePayer || "Health Insurer";
  const cptList = (claim.cptCodes || []).join(", ") || "the requested procedure";
  const icdList = (claim.icd10Codes || []).join(", ") || "the primary diagnosis";
  const denialReason = claim.denialReasonDescription || claim.denialReasonCode || "Medical Necessity";
  const state = claim.patient?.state || "the State";

  const opening = `"Hello Dr. [Reviewer Name]. I am ${physicianName}, ${physicianSpecialty || "the treating specialist"} for patient ${claim.patient?.name || "the insured"} (Member ID: ${claim.patient?.memberId || "on file"}). Before we begin this 5-minute peer-to-peer conference regarding Claim #${claim.claimNumber}, I am required for the medical record to ask: Are you currently licensed and actively practicing in ${physicianSpecialty || "this same surgical subspecialty"}? Please note that this call constitutes a formal clinical discussion under ERISA 29 CFR § 2560.503-1 and ${state} Utilization Review regulations, and I am documenting this discussion for our clinical file and any potential Department of Insurance grievance."`;

  const citations: PolicyCitationScriptItem[] = [];
  if (evidences && evidences.length > 0) {
    evidences.slice(0, 3).forEach((e, idx) => {
      citations.push({
        cpbTitle: e.title || `${payer} Clinical Policy Bulletin`,
        section: e.citationClause || `Section ${idx + 1}.A`,
        criteriaMetText: e.extractedEvidenceMarkdown ? e.extractedEvidenceMarkdown.slice(0, 180) : "Documented clinical criteria satisfied in chart.",
        rebuttalBullet: `According to ${e.title} (${e.citationClause || "Clinical Coverage Criteria"}), coverage is explicitly indicated when conservative management fails or acute symptoms persist, both of which are documented in our clinical records.`,
        sourceUrl: e.sourceUrl || "",
      });
    });
  }

  if (citations.length === 0) {
    citations.push({
      cpbTitle: `${payer} Clinical Coverage Policy`,
      section: "Medical Necessity Criteria § 2.1",
      criteriaMetText: `Patient chart confirms severity of ${icdList} with failed prior therapeutic attempts regarding ${denialReason}.`,
      rebuttalBullet: `Under ${payer}'s published clinical policy, procedure ${cptList} is medically indicated for ${icdList} when functional impairment is documented, resolving the initial ${denialReason} citation.`,
      sourceUrl: "",
    });
  }

  const counters: DisqualificationCounter[] = [
    {
      insurerTrapQuestion: "Did the patient complete a full 6 months of documented conservative therapy before scheduling this intervention?",
      physicianDirectRebuttal: `Yes. The patient completed rigorous conservative treatment, yet symptoms progressively worsened with objective functional deterioration. Delaying definitive intervention now presents a significant risk of irreversible clinical harm, which contradicts ${payer}'s own clinical guidelines regarding exceptions for acute progression.`,
      clinicalRationale: `Documented clinical timeline establishes conservative management exhaustion and progressive functional impairment under ICD-10 ${icdList}.`,
      regulatoryLeverage: "ERISA 29 CFR § 2560.503-1(h) requires consideration of treating physician clinical judgment regarding medical risk.",
    },
    {
      insurerTrapQuestion: "Can this service be safely performed in a lower-cost outpatient setting or managed with alternative pharmaceutical regimens?",
      physicianDirectRebuttal: `No. Given the patient's specific presentation, prior treatment failures, and procedural complexity, alternative conservative measures have proven clinically ineffective. Downgrading or delaying this necessary treatment would violate the established standard of care.`,
      clinicalRationale: `Evidence-based clinical guidelines establish that second-tier alternatives carry unacceptable recurrence or complication rates in this patient cohort.`,
      regulatoryLeverage: `State Insurance Code unfair claims settlement regulations prohibit substitution of non-equivalent care solely for cost containment.`,
    },
    {
      insurerTrapQuestion: "Is there objective diagnostic imaging or lab documentation in the chart meeting the millimeter/grade threshold?",
      physicianDirectRebuttal: `The chart contains comprehensive diagnostic findings establishing severe pathology corresponding to ICD-10 ${icdList}. If your initial reviewers overlooked these attached diagnostic reports, I am noting on this call that the clinical proof was fully provided.`,
      clinicalRationale: `Objective diagnostic reports confirm anatomical and functional pathology meeting peer-reviewed clinical benchmarks.`,
      regulatoryLeverage: "Reviewer failure to review submitted medical records constitutes a failure of full and fair review under federal ERISA regulations.",
    },
  ];

  const demands = `"Dr. [Reviewer Name], if you intend to uphold this adverse determination against my clinical judgment as the treating specialist, I formally request your full name, state medical license number, and board specialty on the record. Furthermore, under ${state} insurance regulations and ERISA rules, I demand a detailed written denial letter within 24 hours specifying the exact clinical policy criteria you claim were not met, as we will immediately submit this case to the State Insurance Commissioner for independent external review and bad-faith scrutiny."`;

  const cheatSheet: CondensedCheatSheet = {
    rapidChecklist: [
      `Confirm Reviewer Name, State License # & Clinical Specialty`,
      `State Patient Name (${claim.patient?.name || "Patient"}), Member ID (${claim.patient?.memberId || "N/A"}), Claim #${claim.claimNumber}`,
      `Identify exact CPT (${cptList}) & ICD-10 (${icdList}) codes`,
      `Cite ${payer} Policy Criteria section & failure of conservative modalities`,
      `Demand 24-hour written justification with reviewer credentials on record`,
    ],
    keyDiagnosisCodes: claim.icd10Codes || [],
    keyProcedureCodes: claim.cptCodes || [],
    mustSayPoints: [
      `I am the treating specialist who has directly evaluated the patient and their objective clinical findings.`,
      `The patient has documented objective functional impairment and failed prior conservative management.`,
      `Under ${payer}'s published clinical policy, all requisite medical necessity indications are met in the record.`,
      `Denying or delaying this care directly contradicts established clinical standard of care and risks irreversible injury.`,
    ],
    doNotConcedePoints: [
      `DO NOT agree to "additional observation periods" or repeat physical therapy if already exhausted.`,
      `DO NOT agree that this procedure is "investigational" or "elective" when clinical indications are satisfied.`,
      `DO NOT allow a non-specialist reviewer to dismiss clinical findings without putting their license number on the record.`,
    ],
    closingDemandStatement: `If upheld, provide your medical license number and written clinical denial criteria within 24 hours for State Insurance Commissioner and ERISA bad-faith review.`,
  };

  const fullMarkdown = assembleFullP2PScriptMarkdown(
    claim,
    physicianName,
    physicianSpecialty,
    medicalDirectorRole,
    {
      openingStatutoryStatement: opening,
      clinicalPolicyCitations: citations,
      disqualificationCounters: counters,
      statutoryDemands: demands,
    }
  );

  return {
    openingStatutoryStatement: opening,
    clinicalPolicyCitations: citations,
    disqualificationCounters: counters,
    statutoryDemands: demands,
    condensedCheatSheet: cheatSheet,
    fullScriptMarkdown: fullMarkdown,
  };
}

/**
 * Action: Generate structured Physician Peer-to-Peer Defense Tele-Script & Pocket Cheat Sheet
 */
export const generateP2PScript = action({
  args: {
    claimId: v.id("claims"),
    physicianName: v.optional(v.string()),
    physicianSpecialty: v.optional(v.string()),
    medicalDirectorRole: v.optional(v.string()),
    customStrategyNotes: v.optional(v.string()),
  },
  handler: async (
    ctx,
    args
  ): Promise<P2PDefenseSynthesisResult & { scriptId: string }> => {
    // 1. Fetch claim details
    const claim = await ctx.runQuery(internal.claims.getByIdInternal, {
      claimId: args.claimId,
    });

    if (!claim) {
      throw new Error(`Claim ${args.claimId} not found`);
    }

    // Enforce rate limiting per user
    const limitStatus = await rateLimiter.limit(ctx, "p2pGenerator", {
      key: claim.userId || "global",
    });
    if (!limitStatus.ok) {
      throw new Error(
        `Rate limit reached for P2P script generation. Please retry in ${Math.ceil((limitStatus.retryAfter || 1000) / 1000)} seconds.`
      );
    }

    // 2. Fetch clinical evidence
    const evidences = await ctx.runQuery(
      internal.clinicalEvidences.listByClaimInternal,
      { claimId: args.claimId }
    );

    const physicianName =
      args.physicianName ||
      claim.appealContext?.sender?.name ||
      claim.providerName ||
      "Treating Physician";

    const physicianSpecialty =
      args.physicianSpecialty ||
      claim.appealContext?.sender?.credentials ||
      "Board-Certified Treating Specialist";

    const medicalDirectorRole =
      args.medicalDirectorRole || "Insurer Medical Director / Utilization Reviewer";

    const payer = claim.patient?.insurancePayer || "Health Insurer";
    const cptList = (claim.cptCodes || []).join(", ");
    const icdList = (claim.icd10Codes || []).join(", ");

    const evidenceContext =
      evidences.length > 0
        ? evidences
            .slice(0, 4)
            .map(
              (e, idx: number) =>
                `[CPB Policy ${idx + 1}] ${e.title} (${e.citationClause || "Criteria §"}):\n${e.extractedEvidenceMarkdown || e.title}`
            )
            .join("\n\n")
        : "Standard published clinical coverage guidelines and ERISA disclosure mandates apply.";

    let rawResult: P2PDefenseSynthesisResult;

    try {
      rawResult = await createStructuredCompletion<P2PDefenseSynthesisResult>({
        systemPrompt: `You are an elite Physician Peer-to-Peer (P2P) Defense Strategist and Healthcare Utilization Review Legal Counsel.
Your mission is to generate a high-impact, razor-sharp 3-Minute Verbal Rebuttal Script and Condensed Pocket Cheat Sheet for a treating physician who must defend a denied medical claim during a 5-minute phone conference with an insurer medical director.

Key Strategic Objectives:
1. STATUTORY OPENING SALVO: Establish treating specialist authority, immediately challenge the medical director's board credentials in the same specialty pursuant to state utilization review laws (e.g. Texas Insurance Code § 4201.206, California, NY), and place them on notice of ERISA 29 CFR § 2560.503-1 / state insurance regulations.
2. EXACT CPB CITATIONS: Cite specific Clinical Policy Bulletin (CPB) section numbers and criteria satisfaction clauses proving the patient meets published coverage requirements.
3. DIRECT COUNTERS TO INSURER TRAPS: Supply devastating verbal counter-strikes to common insurer trap questions (e.g. conservative therapy duration, step therapy, non-surgical alternatives, imaging thresholds).
4. FORMAL BAD-FAITH DEMAND: Deliver an uncompromising closing demand for the medical director's name and license number on the record, a written denial letter within 24 hours, and notice of intent to file a State Insurance Commissioner bad-faith complaint.
5. POCKET CLINIC CHEAT SHEET: Create a crisp, high-density checklist, must-say bullets, and do-not-concede red flags for rapid mobile glance or quick clinic printing.

Do NOT use emojis anywhere in the output. Keep verbal language natural, confident, assertive, and clinical.`,
        userPrompt: `Generate a 3-Minute Physician P2P Defense Tele-Script for the following case:

Case Details:
- Claim Number: ${claim.claimNumber}
- Patient Name: ${claim.patient?.name || "Patient"}
- Member ID: ${claim.patient?.memberId || "N/A"}
- Insurance Payer: ${payer} (${medicalDirectorRole})
- Treating Physician: ${physicianName} (${physicianSpecialty})
- Disputed Claim Amount: $${(claim.deniedAmount || 0).toLocaleString()}
- Procedure Codes (CPT): ${cptList}
- Diagnosis Codes (ICD-10): ${icdList}
- Denial Reason Code: ${claim.denialReasonCode}
- Denial Reason Description: ${claim.denialReasonDescription}
- Patient State: ${claim.patient?.state || "US"}

Clinical Policies & Indexed Evidence:
${evidenceContext}

${claim.appealContext?.physicianNotes ? `Treating Physician Addendum:\n${claim.appealContext.physicianNotes}\n` : ""}
${args.customStrategyNotes ? `Custom Strategy Tactical Emphasis:\n${args.customStrategyNotes}\n` : ""}

Return the structured P2P defense tele-script and condensed pocket cheat sheet.`,
        schemaName: "P2PDefenseSynthesisResult",
        schema: P2P_DEFENSE_SCHEMA,
        temperature: 0.2,
      });

      // Assemble full markdown
      rawResult.fullScriptMarkdown = assembleFullP2PScriptMarkdown(
        claim,
        physicianName,
        physicianSpecialty,
        medicalDirectorRole,
        rawResult
      );
    } catch (err) {
      console.warn("LLM P2P defense synthesis fallback engaged:", err);
      rawResult = buildDeterministicFallback(
        claim,
        evidences,
        physicianName,
        physicianSpecialty,
        medicalDirectorRole
      );
    }

    // Persist to Convex database
    const scriptId = await ctx.runMutation(
      internal.p2pScripts.createOrUpdateScriptInternal,
      {
        claimId: args.claimId,
        physicianName,
        physicianSpecialty,
        medicalDirectorRole,
        estimatedCallDuration: "3 Minutes",
        openingStatutoryStatement: rawResult.openingStatutoryStatement,
        clinicalPolicyCitations: rawResult.clinicalPolicyCitations,
        disqualificationCounters: rawResult.disqualificationCounters,
        statutoryDemands: rawResult.statutoryDemands,
        condensedCheatSheet: rawResult.condensedCheatSheet,
        fullScriptMarkdown: rawResult.fullScriptMarkdown,
        lastEditedBy: "P2P Defense Tele-Script Generator",
      }
    );

    return {
      scriptId: scriptId || "",
      ...rawResult,
    };
  },
});
