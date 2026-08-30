"use node";

import { action } from "../_generated/server";
import { v } from "convex/values";
import { createStructuredCompletion } from "../lib/openai";
import { api } from "../_generated/api";

const DENIAL_EXTRACTION_SCHEMA = {
  type: "object",
  properties: {
    claimNumber: { type: "string" },
    patientName: { type: "string" },
    memberId: { type: "string" },
    insurancePayer: { type: "string" },
    serviceDate: { type: "string" },
    providerName: { type: "string" },
    deniedAmount: { type: "number" },
    patientOwedAmount: { type: "number" },
    cptCodes: {
      type: "array",
      items: { type: "string" },
    },
    icd10Codes: {
      type: "array",
      items: { type: "string" },
    },
    denialReasonCode: { type: "string" },
    denialReasonDescription: { type: "string" },
    appealFilingDeadlineDays: { type: "number" },
    payerAppealsEmail: { type: "string" },
    payerAppealsAddress: { type: "string" },
  },
  required: [
    "claimNumber",
    "patientName",
    "memberId",
    "insurancePayer",
    "serviceDate",
    "providerName",
    "deniedAmount",
    "patientOwedAmount",
    "cptCodes",
    "icd10Codes",
    "denialReasonCode",
    "denialReasonDescription",
    "appealFilingDeadlineDays",
    "payerAppealsEmail",
    "payerAppealsAddress",
  ],
  additionalProperties: false,
};

export interface DenialExtractionResult {
  claimNumber: string;
  patientName: string;
  memberId: string;
  insurancePayer: string;
  serviceDate: string;
  providerName: string;
  deniedAmount: number;
  patientOwedAmount: number;
  cptCodes: string[];
  icd10Codes: string[];
  denialReasonCode: string;
  denialReasonDescription: string;
  appealFilingDeadlineDays: number;
  payerAppealsEmail?: string;
  payerAppealsAddress?: string;
}

/**
 * Optical Extraction Action: Parse an uploaded denial letter or user-submitted text using gpt-5-nano
 */
export const parseDenialDocument = action({
  args: {
    rawDocumentText: v.optional(v.string()),
    storageId: v.optional(v.id("_storage")),
    patientState: v.optional(v.string()),
    patientEmail: v.optional(v.string()),
    autoRunPipeline: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<DenialExtractionResult & { claimId: string; pipelineResult?: any }> => {
    let documentContent = args.rawDocumentText?.trim() || "";
    const imageUrls: string[] = [];
    const fileInputs: Array<{ fileData: string; filename: string }> = [];

    // If storage file was uploaded, fetch and prepare document content
    if (args.storageId) {
      const fileUrl = await ctx.storage.getUrl(args.storageId);
      if (!fileUrl) {
        throw new Error(`File storage ID ${args.storageId} not found`);
      }

      try {
        const response = await fetch(fileUrl);
        const contentType = response.headers.get("content-type") || "";

        if (contentType.startsWith("image/")) {
          const arrayBuffer = await response.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);
          const base64 = buffer.toString("base64");
          imageUrls.push(`data:${contentType};base64,${base64}`);
          documentContent = `${documentContent}\nExtract medical claim denial and Explanation of Benefits (EOB) information from the attached image.`.trim();
        } else if (contentType === "application/pdf" || contentType === "application/octet-stream") {
          const arrayBuffer = await response.arrayBuffer();
          fileInputs.push({
            fileData: `data:${contentType};base64,${Buffer.from(arrayBuffer).toString("base64")}`,
            filename: "denial-document.pdf",
          });
          documentContent = `${documentContent}\nExtract medical claim denial and Explanation of Benefits (EOB) information from the attached document.`.trim();
        } else {
          const text = await response.text();
          documentContent = [documentContent, text].filter(Boolean).join("\n\n");
        }
      } catch (err) {
        throw new Error(`Failed to read uploaded document from storage: ${String(err)}`);
      }
    }

    if (!documentContent && imageUrls.length === 0) {
      throw new Error("No document content or file provided for optical extraction.");
    }

    // Call OpenAI Structured Outputs with gpt-5-nano
    const extraction = await createStructuredCompletion<DenialExtractionResult>({
      systemPrompt: `You are an expert Certified Professional Medical Coder (CPC) and ERISA Insurance Claims Auditor.
Your job is to accurately extract all financial amounts, clinical CPT procedure codes, ICD-10 diagnosis codes, denial reason codes (e.g. CO-50, CO-197, CO-16), insurer payer names, and statutory appeal filing deadlines from real denial letters and Explanation of Benefits (EOB) documents.
Rules:
- Extract dollar amounts as pure numbers without currency symbols (e.g. 24500 instead of "$24,500.00").
- If the patient name or provider name is not explicitly mentioned, use the best inferred entity or "Patient Record" / "Treating Provider".
- If the claim number is missing, generate a standard formatted identifier based on payer and date (e.g. "CLM-" + Date.now().toString().slice(-6)).
- If the statutory appeal deadline is not explicitly mentioned, default appealFilingDeadlineDays to 180 (ERISA 29 CFR § 2560.503-1 standard statutory rule).`,
      userPrompt: `Extract structured medical claim metadata from the following denial document:\n\n${documentContent}`,
      schemaName: "DenialExtractionResult",
      schema: DENIAL_EXTRACTION_SCHEMA,
      imageUrls: imageUrls.length > 0 ? imageUrls : undefined,
      fileInputs: fileInputs.length > 0 ? fileInputs : undefined,
      temperature: 0.1,
    });

    // Save patient and claim into Convex database
    const sanitizedPatient = extraction.patientName.toLowerCase().replace(/[^a-z0-9]/g, "") || "patient";
    const sanitizedPayer = (extraction.insurancePayer || "payer").toLowerCase().replace(/[^a-z0-9]/g, "");
    const claimId: string = await ctx.runMutation((api as any).claims.createWithPatient, {
      patientName: extraction.patientName,
       patientEmail: args.patientEmail?.trim() || `${sanitizedPatient}-${sanitizedPayer}@example.com`,
      memberId: extraction.memberId,
      insurancePayer: extraction.insurancePayer,
      state: args.patientState || "California",
      claimNumber: extraction.claimNumber,
      serviceDate: extraction.serviceDate,
      providerName: extraction.providerName,
      deniedAmount: extraction.deniedAmount,
      patientOwedAmount: extraction.patientOwedAmount,
      cptCodes: extraction.cptCodes,
      icd10Codes: extraction.icd10Codes,
      denialReasonCode: extraction.denialReasonCode,
      denialReasonDescription: extraction.denialReasonDescription,
      appealFilingDeadlineDays: extraction.appealFilingDeadlineDays,
    });

    // Autonomously resolve the payer intake gateway right from the moment of ingestion
    try {
      // 1. Resolve base gateway info (portal URL, fax, PO Box, EDI ID, etc.) from verified directory or web search
      const resolvedContact = await ctx.runAction(
        (api as any).actions.payerContactResolver.resolvePayerGateway,
        {
          claimId,
          payerName: extraction.insurancePayer,
        }
      );

      // 2. If OCR extracted an explicit appeals email or specific PO Box, overlay it with document provenance
      if (extraction.payerAppealsEmail && extraction.payerAppealsEmail.includes("@")) {
        await ctx.runMutation((api as any).claims.updatePayerContact, {
          claimId,
          payerContact: {
            ...resolvedContact,
            officialAppealsEmail: extraction.payerAppealsEmail,
            statutoryPoBox:
              extraction.payerAppealsAddress ||
              resolvedContact?.statutoryPoBox ||
              `${extraction.insurancePayer} Appeals Unit`,
            isVerified: true,
            source: "document_ocr",
          },
        });
      }
    } catch (contactErr) {
      console.warn("Auto payer gateway resolution note:", contactErr);
    }

    let pipelineResult: any = undefined;
    if (args.autoRunPipeline) {
      try {
        pipelineResult = await ctx.runAction(
          (api as any).actions.sentinelPipeline.runAutonomousPipeline,
          {
            claimId,
          }
        );
      } catch (pipelineErr) {
        console.error("Auto-pilot pipeline error:", pipelineErr);
      }
    }

    return {
      ...extraction,
      claimId,
      pipelineResult,
    };
  },
});
