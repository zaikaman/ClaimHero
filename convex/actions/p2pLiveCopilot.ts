"use node";

import { v } from "convex/values";
import { action } from "../_generated/server";
import { api, internal } from "../_generated/api";
import { createStructuredCompletion } from "../lib/openai";

export interface LiveFastAnswerResult {
  id: string;
  trapQuestion: string;
  suggestedQuote: string;
  chartProof: string;
  cpbCitation: string;
  regulatoryLeverage?: string;
  confidenceScore: number;
  timestamp: number;
}

export const generateLiveFastAnswer = action({
  args: {
    sessionId: v.optional(v.id("p2pCallSessions")),
    claimId: v.id("claims"),
    recentTranscript: v.string(), // Latest speech from the insurer medical director
    speakerContext: v.optional(v.string()), // e.g. "insurer"
  },
  handler: async (ctx, args): Promise<LiveFastAnswerResult> => {
    const claim = await ctx.runQuery((internal as any).claims.getByIdInternal, {
      claimId: args.claimId,
    });

    if (!claim) {
      throw new Error(`Claim not found: ${args.claimId}`);
    }

    const evidences = await ctx.runQuery((internal as any).clinicalEvidences.listByClaimInternal, {
      claimId: args.claimId,
    });

    const payer = claim.patient?.insurancePayer || "Health Insurer";
    const cptList = (claim.cptCodes || []).join(", ") || "the procedure";
    const icdList = (claim.icd10Codes || []).join(", ") || "the diagnosis";
    const state = claim.patient?.state || "the State";

    const evidenceList = (evidences || [])
      .map(
        (e: any, i: number) =>
          `[CPB Clause ${i + 1}] ${e.title} (${e.citationClause || "Criteria Section"}): ${e.extractedEvidenceMarkdown}`
      )
      .join("\n");

    const clinicalFacts = claim.appealContext?.clinicalFacts;
    const physicianNotes = claim.appealContext?.physicianNotes || "";

    const systemPrompt = `You are ClaimHero's Real-Time P2P Defense Copilot for Medical Peer-to-Peer Calls.
A treating physician is currently on a live 5-minute phone conference with an insurer medical director regarding a denied insurance claim.
The medical director just made an objection, posed a trap question, or challenged medical necessity.

Your mission: Deliver a sub-second, devastatingly precise, 1-2 sentence spoken rebuttal card that the physician can read ALOUD RIGHT NOW.

Case Context:
- Patient: ${claim.patient?.name || "Patient"} | Payer: ${payer} | State: ${state}
- Procedure: ${cptList} | Diagnosis: ${icdList}
- Denial Reason: ${claim.denialReasonCode || "CO-50"}: ${claim.denialReasonDescription || "Medical Necessity"}
- Clinical Findings: ${clinicalFacts?.examinationFindings || "Documented clinical necessity"}
- Physician Notes: ${physicianNotes || "Immediate intervention indicated"}
- Relevant CPB Evidence:
${evidenceList || "Published policy criteria support coverage upon documented clinical necessity."}

Rules:
1. "suggestedQuote": Write EXACTLY what the physician should say aloud into the phone. Must be 1 to 2 crisp, firm sentences citing patient findings and policy criteria.
2. "chartProof": Identify the exact chart fact (dates, therapy durations, exam results) proving medical necessity.
3. "cpbCitation": Cite the exact policy bulletin name and section clause.
4. "regulatoryLeverage": Cite ERISA 29 CFR § 2560.503-1(h), same-specialty reviewer requirements, or state insurance bad-faith regulations.
5. "confidenceScore": Integer between 85 and 99.`;

    const userPrompt = `The insurer medical director just said on the live call:
"${args.recentTranscript}"

Generate an instant, grounded Fast Answer response card.`;

    const fastAnswerSchema = {
      type: "object",
      properties: {
        trapQuestion: {
          type: "string",
          description: "Summary of the core objection or trap question posed by the insurer.",
        },
        suggestedQuote: {
          type: "string",
          description: "Exact 1-2 sentence verbal statement for the physician to read aloud immediately.",
        },
        chartProof: {
          type: "string",
          description: "Specific documented patient chart evidence refuting the insurer's objection.",
        },
        cpbCitation: {
          type: "string",
          description: "Insurer Clinical Policy Bulletin title and section citation.",
        },
        regulatoryLeverage: {
          type: "string",
          description: "Statutory ERISA or state insurance code citation.",
        },
        confidenceScore: {
          type: "number",
          description: "Confidence percentage (85-99).",
        },
      },
      required: [
        "trapQuestion",
        "suggestedQuote",
        "chartProof",
        "cpbCitation",
        "confidenceScore",
      ],
      additionalProperties: false,
    };

    let result: LiveFastAnswerResult;

    try {
      const completion = await createStructuredCompletion<{
        trapQuestion: string;
        suggestedQuote: string;
        chartProof: string;
        cpbCitation: string;
        regulatoryLeverage?: string;
        confidenceScore: number;
      }>({
        systemPrompt,
        userPrompt,
        schemaName: "LiveFastAnswerResult",
        schema: fastAnswerSchema,
        temperature: 0.2,
      });

      result = {
        id: `fa_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        trapQuestion: completion.trapQuestion,
        suggestedQuote: completion.suggestedQuote,
        chartProof: completion.chartProof,
        cpbCitation: completion.cpbCitation,
        regulatoryLeverage: completion.regulatoryLeverage || `ERISA 29 CFR § 2560.503-1 & ${state} Utilization Review Standards`,
        confidenceScore: completion.confidenceScore || 95,
        timestamp: Date.now(),
      };
    } catch (err) {
      console.warn("OpenAI live fast answer synthesis fallback triggered:", err);
      result = buildDeterministicFastAnswer(
        args.recentTranscript,
        claim,
        evidences,
        payer,
        cptList,
        icdList,
        state
      );
    }

    // If sessionId provided, persist directly to session
    if (args.sessionId) {
      await ctx.runMutation(api.p2pCallSessions.addFastAnswer, {
        sessionId: args.sessionId,
        fastAnswer: result,
      });
    }

    return result;
  },
});

export interface InteractiveReviewerPushbackResult {
  spokenText: string;
  medicalDirectorTone: "skeptical" | "probing" | "defensive" | "conceding";
  callResolutionStage?: "opening" | "probing" | "defensive" | "conceding" | "overturned";
  isOverturned?: boolean;
  authorizationNumber?: string;
  trapQuestion: string;
  suggestedQuote: string;
  chartProof: string;
  cpbCitation: string;
  regulatoryLeverage?: string;
  leverageDelta: number;
}

export const generateInteractiveReviewerPushback = action({
  args: {
    sessionId: v.optional(v.id("p2pCallSessions")),
    claimId: v.id("claims"),
    doctorSpeech: v.string(), // Exact speech spoken by treating physician into microphone
    transcriptHistory: v.optional(
      v.array(
        v.object({
          speaker: v.string(),
          text: v.string(),
        })
      )
    ),
  },
  handler: async (ctx, args): Promise<InteractiveReviewerPushbackResult> => {
    const claim = await ctx.runQuery((internal as any).claims.getByIdInternal, {
      claimId: args.claimId,
    });

    if (!claim) {
      throw new Error(`Claim not found: ${args.claimId}`);
    }

    const evidences = await ctx.runQuery((internal as any).clinicalEvidences.listByClaimInternal, {
      claimId: args.claimId,
    });

    const payer = claim.patient?.insurancePayer || "Health Insurer";
    const cptList = (claim.cptCodes || []).join(", ") || "the procedure";
    const icdList = (claim.icd10Codes || []).join(", ") || "the diagnosis";
    const state = claim.patient?.state || "the State";

    const evidenceList = (evidences || [])
      .map(
        (e: any, i: number) =>
          `[CPB Clause ${i + 1}] ${e.title} (${e.citationClause || "Criteria Section"}): ${e.extractedEvidenceMarkdown}`
      )
      .join("\n");

    const clinicalFacts = claim.appealContext?.clinicalFacts;
    const physicianNotes = claim.appealContext?.physicianNotes || "";

    const historyItems = args.transcriptHistory || [];
    const physicianTurnCount = historyItems.filter((h) => h.speaker === "physician").length + 1;

    const historySnippet = historyItems
      .slice(-8)
      .map((h) => `${h.speaker === "physician" ? "Treating Physician" : "Medical Director"}: "${h.text}"`)
      .join("\n");

    const systemPrompt = `You are the Insurer Medical Director reviewing denied insurance claims for ${payer}.
You are on a live, rapid 3-to-5 minute peer-to-peer (P2P) tele-conference with the treating physician for Claim #${claim.claimNumber} (${cptList}).
Current Physician Speech Turn: #${physicianTurnCount}.

CRITICAL GUIDELINES FOR REALISTIC P2P CALL SIMULATION:

1. SPEECH-TO-TEXT (STT) PHONETIC TOLERANCE:
   The treating physician is speaking live into their microphone. Live Web Speech transcription produces phonetic approximations of medical terms:
   - "children Lawrence" / "Calgary Lawrence" / "Killian Lawrence" = "Kellgren-Lawrence" (Osteoarthritis radiographic grade)
   - "bone unborn" / "bone and bone" = "bone-on-bone" (Grade 4 joint space obliteration)
   - "cardiacosteroid" / "Carly cough steroid" / "cardiosteroid" = "corticosteroid injections"
   - "athroplastomy" / "arthroplasty" = "arthroplasty" (e.g. CPT 27447 Total Knee / Hip Arthroplasty)
   - "meloxicam" / "en said" / "NSAID" = oral anti-inflammatory therapy
   Interpret these terms accurately according to clinical orthopedic/medical context.

2. TURN-BASED CONVERSATION LIFECYCLE (STRICT 3-STAGE PROGRESSION):
   - TURN 1 (Opening Challenge): Reviewer asks why standard conservative management or imaging prerequisites weren't met.
   - TURN 2 (Probing / Verification): Reviewer probes one specific secondary nuance (e.g., injection response, provocative exam findings, or specific policy clause).
   - TURN 3+ (CLINICAL CONCESSION & OVERTURN DETERMINATION):
     * If the physician has articulated:
       (a) 12-16+ weeks of physical therapy or failed trials, OR
       (b) Kellgren-Lawrence Grade 4 / severe radiographic joint destruction / bone-on-bone status, OR
       (c) Failed therapeutic steroid/hyaluronic injections + NSAIDs, OR
       (d) Acute neurological loss or severe functional impairment;
     * THEN YOU MUST CONCEDE, APPROVE THE PROCEDURE, AND OVERTURN THE DENIAL.
     * State clearly on the call that based on the documented clinical severity and policy criteria, you are overturning the adverse determination and issuing immediate verbal authorization.
     * Set "medicalDirectorTone" to "conceding", "callResolutionStage" to "overturned", "isOverturned" to true, and generate an authorization number (e.g. "AUTH-${payer.slice(0, 3).toUpperCase()}-${Math.floor(100000 + Math.random() * 900000)}").

3. STRICT ANTI-REPETITION CONSTRAINT:
   - NEVER repeat the same objection, requirement, or phrase (e.g., do NOT repeat demands for "home exercise programs", "separate maintenance trials", or "longitudinal records" if already mentioned previously in the transcript history).
   - Acknowledge what the physician just stated and either probe a completely new aspect or grant authorization.

Case Details:
- Patient: ${claim.patient?.name || "Patient"}
- Payer: ${payer}
- Jurisdiction: ${state}
- Disputed CPT Codes: ${cptList}
- Diagnosis Codes: ${icdList}
- Denial Reason: ${claim.denialReasonCode || "CO-50"}: ${claim.denialReasonDescription || "Medical Necessity"}
- Clinical Facts on File:
  * Symptoms & Functional Impact: ${clinicalFacts?.symptomsAndFunctionalImpact || "Severe symptoms"}
  * Physical Exam: ${clinicalFacts?.examinationFindings || "Positive exam findings"}
  * Imaging/Diagnostics: ${clinicalFacts?.imagingAndDiagnostics || "Diagnostic imaging confirmed severe pathology"}
  * Prior Conservative Therapy: ${clinicalFacts?.treatmentHistoryAndResponse || "Documented prior therapy"}
- Treating Physician Notes: ${physicianNotes || "Intervention indicated to prevent permanent functional loss"}
- Published Policy Criteria:
${evidenceList || "Published policy requires documented conservative therapy failure or severe radiographic pathology (Grade 3/4) or progressive functional deficit."}`;

    const userPrompt = `Recent Call Transcript History:
${historySnippet || "No prior transcript."}

The treating physician just said to you (Turn #${physicianTurnCount}):
"${args.doctorSpeech}"

Evaluate the clinical merits. Formulate your spoken response as the Medical Director and generate the accompanying Fast Answer card for the physician.`;

    const pushbackSchema = {
      type: "object",
      properties: {
        spokenText: {
          type: "string",
          description: "What the Medical Director speaks out loud next. If conceding on Turn 3+, announce the verbal approval and provide authorization reference number.",
        },
        medicalDirectorTone: {
          type: "string",
          enum: ["skeptical", "probing", "defensive", "conceding"],
          description: "Conversational tone of the reviewer.",
        },
        callResolutionStage: {
          type: "string",
          enum: ["opening", "probing", "defensive", "conceding", "overturned"],
          description: "Current stage of the P2P encounter.",
        },
        isOverturned: {
          type: "boolean",
          description: "True if the Medical Director is overturning the denial and granting prior authorization.",
        },
        authorizationNumber: {
          type: "string",
          description: "Verbal authorization reference number if overturned (e.g. AUTH-MOL-492819).",
        },
        trapQuestion: {
          type: "string",
          description: "Summary of the objection or resolution statement.",
        },
        suggestedQuote: {
          type: "string",
          description: "Knockout verbal counter-strike or final confirmation statement for the physician.",
        },
        chartProof: {
          type: "string",
          description: "Patient chart proof supporting this determination.",
        },
        cpbCitation: {
          type: "string",
          description: "CPB policy section citation.",
        },
        regulatoryLeverage: {
          type: "string",
          description: "ERISA or state statutory leverage.",
        },
        leverageDelta: {
          type: "number",
          description: "Momentum score change (-5 to +30).",
        },
      },
      required: [
        "spokenText",
        "medicalDirectorTone",
        "trapQuestion",
        "suggestedQuote",
        "chartProof",
        "cpbCitation",
        "leverageDelta",
      ],
      additionalProperties: false,
    };

    let result: InteractiveReviewerPushbackResult;

    try {
      const completion = await createStructuredCompletion<InteractiveReviewerPushbackResult>({
        systemPrompt,
        userPrompt,
        schemaName: "InteractiveReviewerPushbackResult",
        schema: pushbackSchema,
        temperature: 0.3,
      });

      result = {
        spokenText: completion.spokenText,
        medicalDirectorTone: completion.medicalDirectorTone || (physicianTurnCount >= 3 ? "conceding" : "probing"),
        callResolutionStage: completion.callResolutionStage || (completion.isOverturned || completion.medicalDirectorTone === "conceding" ? "overturned" : "probing"),
        isOverturned: Boolean(completion.isOverturned || completion.medicalDirectorTone === "conceding" || completion.spokenText.toLowerCase().includes("overturn") || completion.spokenText.toLowerCase().includes("authoriz")),
        authorizationNumber: completion.authorizationNumber || (completion.isOverturned || completion.medicalDirectorTone === "conceding" ? `AUTH-${payer.slice(0, 3).toUpperCase()}-${Math.floor(100000 + Math.random() * 900000)}` : undefined),
        trapQuestion: completion.trapQuestion,
        suggestedQuote: completion.suggestedQuote,
        chartProof: completion.chartProof,
        cpbCitation: completion.cpbCitation,
        regulatoryLeverage: completion.regulatoryLeverage || `ERISA 29 CFR § 2560.503-1 & ${state} Insurance Code`,
        leverageDelta: completion.leverageDelta || (physicianTurnCount >= 3 ? 25 : 10),
      };
    } catch (err) {
      console.warn("OpenAI interactive reviewer synthesis fallback triggered:", err);
      result = buildDeterministicReviewerPushback(
        args.doctorSpeech,
        claim,
        evidences,
        payer,
        cptList,
        icdList,
        state,
        physicianTurnCount
      );
    }

    return result;
  },
});

function buildDeterministicReviewerPushback(
  doctorSpeech: string,
  claim: any,
  evidences: any[],
  payer: string,
  cptList: string,
  icdList: string,
  state: string,
  physicianTurnCount: number = 1
): InteractiveReviewerPushbackResult {
  const lower = (doctorSpeech || "").toLowerCase();
  const cpb = evidences && evidences.length > 0 ? evidences[0] : null;
  const cpbTitle = cpb?.title || `${payer} Clinical Coverage Bulletin`;
  const cpbSection = cpb?.citationClause || "Section 2.1 Criteria";
  const authNum = `AUTH-${payer.slice(0, 3).toUpperCase()}-${Math.floor(100000 + Math.random() * 900000)}`;

  // Concession / Overturn on Turn 3 or when strong orthopedic evidence is cited
  const hasGrade4OrBoneOnBone = lower.includes("grade 4") || lower.includes("bone") || lower.includes("lawrence") || lower.includes("unborn");
  const hasMultipleTherapies = (lower.includes("injection") || lower.includes("steroid")) && (lower.includes("pt") || lower.includes("therapy") || lower.includes("week"));

  if (physicianTurnCount >= 3 || hasGrade4OrBoneOnBone || hasMultipleTherapies) {
    return {
      spokenText: `Doctor, based on the documented failure of 16 weeks of structured physical therapy, failed corticosteroid injections, and radiographic confirmation of Kellgren-Lawrence Grade 4 severity, ${payer} acknowledges that conservative criteria under ${cpbTitle} (${cpbSection}) are satisfied. I am overturning the initial denial today and granting verbal prior authorization #${authNum}.`,
      medicalDirectorTone: "conceding",
      callResolutionStage: "overturned",
      isOverturned: true,
      authorizationNumber: authNum,
      trapQuestion: "Denial Overturned - Medical Necessity Criteria Satisfied",
      suggestedQuote: `Thank you, Doctor. Please log verbal authorization #${authNum} for CPT ${cptList} and submit the formal written determination letter to the clinic within 24 hours.`,
      chartProof: claim.appealContext?.clinicalFacts?.treatmentHistoryAndResponse || "Documented comprehensive conservative therapy failure and severe structural joint destruction.",
      cpbCitation: `${cpbTitle} (${cpbSection})`,
      regulatoryLeverage: `ERISA 29 CFR § 2560.503-1 & ${state} Utilization Review Standards`,
      leverageDelta: 25,
    };
  }

  if (lower.includes("pt") || lower.includes("physical therapy") || lower.includes("weeks") || lower.includes("conservative")) {
    return {
      spokenText: `I understand you documented structured physical therapy, Doctor, but our medical management criteria for ${cptList} also evaluate whether adjunctive corticosteroid injections or structured oral anti-inflammatory regimens were trialed before proceeding to surgery. Were these attempted?`,
      medicalDirectorTone: "probing",
      callResolutionStage: "probing",
      isOverturned: false,
      trapQuestion: "Why were interventional steroid injections or NSAIDs not trialed prior to surgery?",
      suggestedQuote: `Under ${cpbTitle} (${cpbSection}), the patient completed 16 weeks of formal therapy and failed two therapeutic injections with NSAIDs, fully exhausting conservative options.`,
      chartProof: claim.appealContext?.clinicalFacts?.imagingAndDiagnostics || "Patient chart confirms completed formal PT and failed injection series.",
      cpbCitation: `${cpbTitle} (${cpbSection})`,
      regulatoryLeverage: `ERISA 29 CFR § 2560.503-1(h) & ${state} Utilization Review Standards`,
      leverageDelta: 12,
    };
  }

  if (lower.includes("erisa") || lower.includes("license") || lower.includes("24 hour") || lower.includes("bad faith") || lower.includes("specialty")) {
    return {
      spokenText: `Doctor, we are operating within standard utilization review parameters. If you are formally citing ${state} insurance regulations and requesting my active specialty credentials for the record, please confirm whether there is any further objective diagnostic data you wish entered before I finalize today's determination.`,
      medicalDirectorTone: "defensive",
      trapQuestion: "Statutory escalation regarding reviewer credentials and written justification.",
      suggestedQuote: `Yes. Please note on the recording that treating physician is board-certified and demands a written clinical denial within 24 hours under ${state} administrative code if authorization is not granted today.`,
      chartProof: `Board certification and treating clinical records on file for ${cptList}.`,
      cpbCitation: `${cpbTitle} (${cpbSection})`,
      regulatoryLeverage: `${state} Insurance Code Utilization Review Mandate`,
      leverageDelta: 18,
    };
  }

  return {
    spokenText: `Doctor, I have noted your clinical statements for ${claim.patient?.name || "the patient"}. However, under our utilization criteria for ${cptList}, can you specify the exact objective neurological or functional exam findings from the most recent clinical evaluation?`,
    medicalDirectorTone: "skeptical",
    trapQuestion: "What objective physical exam and neurological deficits were documented at the most recent visit?",
    suggestedQuote: `The most recent clinical examination on ${claim.serviceDate || "file"} documented positive provocative testing, reduced reflexes, and objective motor weakness consistent with ${icdList}.`,
    chartProof: claim.appealContext?.clinicalFacts?.examinationFindings || "Objective physical examination demonstrated progressive functional impairment.",
    cpbCitation: `${cpbTitle} (${cpbSection})`,
    regulatoryLeverage: `ERISA 29 CFR § 2560.503-1`,
    leverageDelta: 10,
  };
}

function buildDeterministicFastAnswer(
  transcriptSnippet: string,
  claim: any,
  evidences: any[],
  payer: string,
  cptList: string,
  icdList: string,
  state: string
): LiveFastAnswerResult {
  const lower = (transcriptSnippet || "").toLowerCase();
  const cpb = evidences && evidences.length > 0 ? evidences[0] : null;
  const cpbTitle = cpb?.title || `${payer} Clinical Coverage Policy`;
  const cpbSection = cpb?.citationClause || "Section 2.1 Criteria";

  let trapQuestion = "Insurer challenged medical necessity or conservative therapy duration.";
  let suggestedQuote = `Under ${payer}'s published policy criteria (${cpbSection}), procedure ${cptList} is fully indicated because the patient completed conservative trials and exhibits objective functional impairment.`;
  let chartProof = claim.appealContext?.clinicalFacts?.treatmentHistoryAndResponse || "Documented failure of structured conservative therapy and positive objective clinical findings in chart.";
  const regulatoryLeverage = `ERISA 29 CFR § 2560.503-1(h) & ${state} Insurance Utilization Review Regulations`;

  if (lower.includes("conservative") || lower.includes("physical therapy") || lower.includes("pt") || lower.includes("weeks") || lower.includes("months")) {
    trapQuestion = "Did the patient complete sufficient conservative management before scheduling this procedure?";
    suggestedQuote = `Yes. Patient completed documented conservative therapy without resolution, and under ${cpbTitle} ${cpbSection}, persistent severe symptoms satisfy prior authorization prerequisites.`;
    chartProof = claim.appealContext?.clinicalFacts?.treatmentHistoryAndResponse || "Documented 12 weeks of structured therapy and failed therapeutic injections in medical record.";
  } else if (lower.includes("mri") || lower.includes("imaging") || lower.includes("x-ray") || lower.includes("radiograph")) {
    trapQuestion = "Was diagnostic imaging performed within required clinical timeframes?";
    suggestedQuote = `Yes. Objective diagnostic imaging confirmed severe anatomical pathology for ${icdList}, satisfying ${cpbTitle} criteria.`;
    chartProof = claim.appealContext?.clinicalFacts?.imagingAndDiagnostics || "Diagnostic imaging confirmed severe pathology matching clinical presentation.";
  } else if (lower.includes("experimental") || lower.includes("investigational") || lower.includes("unproven")) {
    trapQuestion = "Is this procedure considered investigational or unproven for this diagnosis?";
    suggestedQuote = `No. CPT code ${cptList} is a Category I established standard of care supported by published clinical guidelines for ${icdList}.`;
    chartProof = "Category I CPT code supported by specialty clinical practice guidelines.";
  } else if (lower.includes("specialty") || lower.includes("license") || lower.includes("board")) {
    trapQuestion = "Medical director reviewer qualifications inquiry.";
    suggestedQuote = `Under ${state} Utilization Review statutes, adverse determinations must be rendered by a physician in the same active clinical specialty as the treating provider.`;
    chartProof = `Treating specialist is board-certified for ${cptList}.`;
  }

  return {
    id: `fa_det_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    trapQuestion,
    suggestedQuote,
    chartProof,
    cpbCitation: `${cpbTitle} (${cpbSection})`,
    regulatoryLeverage,
    confidenceScore: 94,
    timestamp: Date.now(),
  };
}

