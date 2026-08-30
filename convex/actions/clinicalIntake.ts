"use node";

import { action } from "../_generated/server";
import { v } from "convex/values";
import { createStructuredCompletion } from "../lib/openai";

const CLINICAL_INTAKE_SCHEMA = {
  type: "object",
  properties: {
    questions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          field: {
            type: "string",
            enum: [
              "symptomsAndFunctionalImpact",
              "examinationFindings",
              "imagingAndDiagnostics",
              "treatmentHistoryAndResponse",
              "otherDocumentedFacts",
            ],
          },
          question: { type: "string" },
          whyItMatters: { type: "string" },
        },
        required: ["field", "question", "whyItMatters"],
        additionalProperties: false,
      },
    },
  },
  required: ["questions"],
  additionalProperties: false,
};

type ClinicalIntakeField =
  | "symptomsAndFunctionalImpact"
  | "examinationFindings"
  | "imagingAndDiagnostics"
  | "treatmentHistoryAndResponse"
  | "otherDocumentedFacts";

export interface ClinicalIntakeQuestion {
  field: ClinicalIntakeField;
  question: string;
  whyItMatters: string;
}

const DEFAULT_QUESTIONS: ClinicalIntakeQuestion[] = [
  {
    field: "symptomsAndFunctionalImpact",
    question: "What symptoms or day-to-day functional limitations are explicitly described in the available record?",
    whyItMatters: "This captures the patient's documented presentation without inferring severity from a code.",
  },
  {
    field: "examinationFindings",
    question: "What examination findings are documented by a treating clinician?",
    whyItMatters: "The appeal can reference findings only when they appear in the record.",
  },
  {
    field: "imagingAndDiagnostics",
    question: "What imaging, laboratory, or other diagnostic findings are documented, including dates if available?",
    whyItMatters: "Objective results may help the payer compare the record with its stated criteria.",
  },
  {
    field: "treatmentHistoryAndResponse",
    question: "What prior treatments are documented, and what response or outcome is recorded?",
    whyItMatters: "This preserves treatment history as reported instead of assuming that treatment failed.",
  },
  {
    field: "otherDocumentedFacts",
    question: "Are there any other documented facts relevant to the denial, such as authorization communications or an urgent-care rationale?",
    whyItMatters: "This gives the record a place for denial-specific facts that do not fit the clinical categories above.",
  },
];

function isValidQuestion(value: unknown): value is ClinicalIntakeQuestion {
  if (!value || typeof value !== "object") return false;
  const question = value as Partial<ClinicalIntakeQuestion>;
  return (
    typeof question.field === "string" &&
    DEFAULT_QUESTIONS.some((item) => item.field === question.field) &&
    typeof question.question === "string" &&
    question.question.trim().length > 0 &&
    typeof question.whyItMatters === "string" &&
    question.whyItMatters.trim().length > 0
  );
}

/**
 * Creates denial-specific prompts for the human who has the clinical record.
 * The action only generates questions; it never generates patient facts.
 */
export const generateClinicalIntakeQuestions = action({
  args: {
    denialReasonCode: v.string(),
    denialReasonDescription: v.string(),
    cptCodes: v.array(v.string()),
    icd10Codes: v.array(v.string()),
  },
  handler: async (_ctx, args): Promise<{ questions: ClinicalIntakeQuestion[]; generatedBy: string }> => {
    try {
      const result = await createStructuredCompletion<{ questions: ClinicalIntakeQuestion[] }>({
        systemPrompt: `You design neutral intake questions for a medical insurance appeal workflow.
Ask the person with access to the clinical record for exact documented facts only. Do not answer the questions, diagnose the patient, infer severity from CPT or ICD-10 codes, or imply that a treatment was medically necessary or unsuccessful. Questions must be non-leading and must tell the user to leave the field blank if the record does not contain the information. Return exactly one question for each of the five allowed fields. Keep questions concise and in English.`,
        userPrompt: `Create one neutral question for each allowed field for this denial:
- Denial code: ${args.denialReasonCode}
- Denial description: ${args.denialReasonDescription}
- Procedure codes: ${args.cptCodes.join(", ") || "Not provided"}
- Diagnosis codes: ${args.icd10Codes.join(", ") || "Not provided"}

Allowed fields:
- symptomsAndFunctionalImpact
- examinationFindings
- imagingAndDiagnostics
- treatmentHistoryAndResponse
- otherDocumentedFacts`,
        schemaName: "ClinicalIntakeQuestions",
        schema: CLINICAL_INTAKE_SCHEMA,
        temperature: 0.1,
      });

      const questions = result.questions.filter(isValidQuestion);
      const byField = new Map(questions.map((question) => [question.field, question]));
      if (byField.size === DEFAULT_QUESTIONS.length) {
        return { questions: DEFAULT_QUESTIONS.map((fallback) => byField.get(fallback.field) as ClinicalIntakeQuestion), generatedBy: "OpenAI" };
      }
    } catch (error) {
      console.warn("Clinical intake question generation fallback engaged:", error);
    }

    return { questions: DEFAULT_QUESTIONS, generatedBy: "ClaimHero intake safeguards" };
  },
});
