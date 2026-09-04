"use node";

import { action } from "../_generated/server";
import { ConvexError, v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { createStructuredCompletion } from "../lib/openai";
import { api, internal } from "../_generated/api";
import { rateLimiter } from "../lib/rateLimiter";

const DENIAL_EXTRACTION_SCHEMA = {
  type: "object",
  properties: {
    isMedicalClaimDenial: {
      type: "boolean",
      description:
        "Set to true ONLY IF this document or image is an actual healthcare insurance claim denial letter, Explanation of Benefits (EOB), adverse benefit determination, medical necessity denial, or medical bill denial. Set to false if the document or image is NOT a healthcare denial notice (e.g. photos of animals, pets, scenery, food, receipts, memes, general letters, non-medical invoices, or unrelated graphics).",
    },
    documentClassificationReason: {
      type: "string",
      description:
        "Brief explanation describing what the document is and why it is or is not a genuine healthcare insurance claim denial document.",
    },
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
    "isMedicalClaimDenial",
    "documentClassificationReason",
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
  isMedicalClaimDenial?: boolean;
  documentClassificationReason?: string;
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

const MAX_DOCUMENT_BYTES = 15 * 1024 * 1024; // 15 MB
export const MAX_RAW_DOCUMENT_CHARS = 100_000; // 100k characters max input

function detectFileFormat(
  contentType: string,
  bytes: Uint8Array
): { type: "pdf" | "image" | "text" | "unsupported"; mime: string } {
  const normType = contentType.toLowerCase().trim();

  // Check magic bytes for PDF (%PDF-)
  if (bytes.length >= 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) {
    return { type: "pdf", mime: "application/pdf" };
  }

  // Check magic bytes for PNG (\x89PNG)
  if (bytes.length >= 4 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return { type: "image", mime: "image/png" };
  }

  // Check magic bytes for JPEG (\xFF\xD8\xFF)
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { type: "image", mime: "image/jpeg" };
  }

  // Check magic bytes for WebP (RIFF....WEBP)
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return { type: "image", mime: "image/webp" };
  }

  if (normType === "application/pdf") {
    return { type: "pdf", mime: "application/pdf" };
  }

  if (normType.startsWith("image/")) {
    return { type: "image", mime: normType };
  }

  if (normType.startsWith("text/") || normType === "application/json" || normType === "application/xml") {
    return { type: "text", mime: normType || "text/plain" };
  }

  // If octet-stream or unknown, check if mostly printable ASCII/UTF-8
  if (bytes.length > 0) {
    let isPrintableText = true;
    for (let i = 0; i < Math.min(bytes.length, 512); i++) {
      const b = bytes[i];
      if (b === 0 || (b < 9 && b !== 0x09) || (b > 13 && b < 32 && b !== 0x1b)) {
        isPrintableText = false;
        break;
      }
    }
    if (isPrintableText) {
      return { type: "text", mime: "text/plain" };
    }
  }

  return { type: "unsupported", mime: normType };
}

/**
 * Optical Extraction Action: Parse an uploaded denial letter or user-submitted text using gpt-5.4-nano
 */
export const parseDenialDocument = action({
  args: {
    rawDocumentText: v.optional(v.string()),
    storageId: v.optional(v.id("_storage")),
    patientState: v.optional(v.string()),
    patientEmail: v.optional(v.string()),
    autoRunPipeline: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<DenialExtractionResult & { claimId: string; pipelineResult?: Record<string, unknown> }> => {
    if (args.rawDocumentText && args.rawDocumentText.length > MAX_RAW_DOCUMENT_CHARS) {
      throw new Error(`Submitted raw document text exceeds the ${MAX_RAW_DOCUMENT_CHARS.toLocaleString()} character limit.`);
    }

    // Enforce rate limiting
    try {
      const limitStatus = await rateLimiter.limit(ctx, "opticalParser", {
        key: args.patientEmail || "global",
      });
      if (!limitStatus.ok) {
        throw new Error(
          `Rate limit reached for optical document parsing. Please retry in ${Math.ceil((limitStatus.retryAfter || 1000) / 1000)} seconds.`
        );
      }
    } catch (rateErr) {
      if (rateErr instanceof Error && rateErr.message.includes("Rate limit reached")) {
        throw rateErr;
      }
    }

    let documentContent = args.rawDocumentText?.trim() || "";
    const imageUrls: string[] = [];
    const fileInputs: Array<{ fileData: string; filename: string }> = [];

    let claimId: Id<"claims">;
    let extraction: DenialExtractionResult;
    try {
      // If storage file was uploaded, fetch and prepare document content with strict size & MIME validation
      if (args.storageId) {
        const fileUrl = await ctx.storage.getUrl(args.storageId);
        if (!fileUrl) {
          throw new Error(`File storage ID ${args.storageId} not found`);
        }

        try {
          const response = await fetch(fileUrl);
          if (!response.ok) {
            throw new Error(`Failed to fetch file from storage: ${response.statusText}`);
          }

          const contentLength = response.headers.get("content-length");
          if (contentLength && parseInt(contentLength, 10) > MAX_DOCUMENT_BYTES) {
            throw new Error(`Uploaded document exceeds the ${MAX_DOCUMENT_BYTES / (1024 * 1024)} MB intake limit.`);
          }

          const arrayBuffer = await response.arrayBuffer();
          if (arrayBuffer.byteLength > MAX_DOCUMENT_BYTES) {
            throw new Error(`Uploaded document exceeds the ${MAX_DOCUMENT_BYTES / (1024 * 1024)} MB intake limit.`);
          }

          const rawContentType = response.headers.get("content-type") || "";
          const detected = detectFileFormat(rawContentType, new Uint8Array(arrayBuffer));

          if (detected.type === "image") {
            const buffer = Buffer.from(arrayBuffer);
            const base64 = buffer.toString("base64");
            imageUrls.push(`data:${detected.mime};base64,${base64}`);
            documentContent = `${documentContent}\nExtract medical claim denial and Explanation of Benefits (EOB) information from the attached image.`.trim();
          } else if (detected.type === "pdf") {
            const buffer = Buffer.from(arrayBuffer);
            const base64 = buffer.toString("base64");
            fileInputs.push({
              fileData: `data:application/pdf;base64,${base64}`,
              filename: "denial-document.pdf",
            });
            documentContent = `${documentContent}\nExtract medical claim denial and Explanation of Benefits (EOB) information from the attached document.`.trim();
          } else if (detected.type === "text") {
            const text = new TextDecoder("utf-8").decode(arrayBuffer);
            documentContent = [documentContent, text].filter(Boolean).join("\n\n");
          } else {
            throw new Error(`Unsupported document format (${rawContentType || "binary"}). Please upload a PDF, image (PNG/JPEG/WebP), or text document.`);
          }
        } catch (err) {
          throw new Error(`Failed to read uploaded document from storage: ${String(err)}`);
        }
      }

      if (!documentContent && imageUrls.length === 0) {
        throw new Error("No document content or file provided for optical extraction.");
      }

      // Call OpenAI Structured Outputs with gpt-5.4-nano
      extraction = await createStructuredCompletion<DenialExtractionResult>({
        systemPrompt: `You are an expert Certified Professional Medical Coder (CPC) and ERISA Insurance Claims Auditor.
Your job is to rigorously classify uploaded documents/images and extract structured medical claim denial data.

CRITICAL DOCUMENT CLASSIFICATION & VALIDATION RULES:
1. First, determine whether the input document or image is an actual healthcare insurance claim denial, Explanation of Benefits (EOB), adverse benefit determination, or medical necessity denial letter.
2. If the document or image is NOT a medical claim denial (for example: photographs of animals, pets, scenery, food, receipts, general letters, memes, non-medical invoices, or unreadable graphics):
   - Set "isMedicalClaimDenial" to FALSE.
   - Provide a clear, polite 1-sentence reason in "documentClassificationReason" (e.g. "The uploaded file is an image of an animal/non-medical subject, not a healthcare insurance claim denial or EOB.").
   - Set all string fields to "", numbers to 0, and arrays to [].
3. If the document IS a valid medical claim denial:
   - Set "isMedicalClaimDenial" to TRUE.
   - Extract all financial amounts, clinical CPT procedure codes, ICD-10 diagnosis codes, denial reason codes (e.g. CO-50, CO-197, CO-16), insurer payer names, and statutory appeal filing deadlines.
   - Extract dollar amounts as pure numbers without currency symbols (e.g. 24500 instead of "$24,500.00"). If missing, return 0.
   - If identifiers (patient name, member ID, provider, claim number, service date) are not explicitly mentioned, return "". NEVER invent or fabricate identifiers.
   - If CPT or ICD-10 codes are missing, return [].
   - If statutory appeal deadline is not explicitly mentioned, default appealFilingDeadlineDays to 180.
4. Always extract and output all textual metadata, denial reasons, descriptions, and classification reasons exclusively in English.`,
        userPrompt: `Extract structured medical claim metadata from the following denial document:\n\n${documentContent}`,
        schemaName: "DenialExtractionResult",
        schema: DENIAL_EXTRACTION_SCHEMA,
        imageUrls: imageUrls.length > 0 ? imageUrls : undefined,
        fileInputs: fileInputs.length > 0 ? fileInputs : undefined,
        temperature: 0.1,
      });

      // Enforce claim validation safeguards - reject non-claim documents
      if (extraction.isMedicalClaimDenial === false) {
        const reason =
          extraction.documentClassificationReason?.trim() ||
          "The uploaded file is not a valid healthcare insurance claim denial letter or Explanation of Benefits (EOB).";
        throw new ConvexError(
          `Non-claim document detected: ${reason} Please upload a genuine adverse determination letter, medical denial notice, or EOB document.`
        );
      }

      // Additional sanity check: ensure at least one core claim signal exists
      const hasFinancials = (extraction.deniedAmount || 0) > 0 || (extraction.patientOwedAmount || 0) > 0;
      const hasCodes =
        (extraction.cptCodes && extraction.cptCodes.length > 0) ||
        (extraction.icd10Codes && extraction.icd10Codes.length > 0) ||
        Boolean(extraction.denialReasonCode?.trim());
      const hasClaimIdentifiers =
        Boolean(extraction.claimNumber?.trim()) ||
        Boolean(extraction.memberId?.trim()) ||
        Boolean(extraction.denialReasonDescription?.trim());

      if (!hasFinancials && !hasCodes && !hasClaimIdentifiers) {
        throw new ConvexError(
          "The uploaded document does not contain recognizable medical claim denial details (missing denial reason, CPT codes, claim identifiers, and denied amount). Please upload a complete Explanation of Benefits or adverse determination letter."
        );
      }

      // Save patient and claim into Convex database with denialLetterStorageId linked
      claimId = await ctx.runMutation(internal.claims.createWithPatientInternal, {
        patientName: extraction.patientName?.trim() || "",
        patientEmail: args.patientEmail?.trim() || "",
        memberId: extraction.memberId?.trim() || "",
        insurancePayer: extraction.insurancePayer?.trim() || "Unspecified Payer",
        state: args.patientState || "California",
        claimNumber: extraction.claimNumber?.trim() || "",
        serviceDate: extraction.serviceDate?.trim() || "",
        providerName: extraction.providerName?.trim() || "",
        deniedAmount: typeof extraction.deniedAmount === "number" ? extraction.deniedAmount : 0,
        patientOwedAmount: typeof extraction.patientOwedAmount === "number" ? extraction.patientOwedAmount : 0,
        cptCodes: Array.isArray(extraction.cptCodes) ? extraction.cptCodes.filter(Boolean) : [],
        icd10Codes: Array.isArray(extraction.icd10Codes) ? extraction.icd10Codes.filter(Boolean) : [],
        denialReasonCode: extraction.denialReasonCode?.trim() || "",
        denialReasonDescription: extraction.denialReasonDescription?.trim() || "",
        appealFilingDeadlineDays: extraction.appealFilingDeadlineDays || 180,
        denialLetterStorageId: args.storageId,
      });
    } catch (ingestionError) {
      // Clean up orphaned storage file immediately on document rejection or parsing error
      if (args.storageId) {
        try {
          await ctx.runMutation(internal.claims.cleanupStorageFileInternal, {
            storageId: args.storageId,
          });
        } catch (cleanupErr) {
          console.warn("Storage cleanup note on parser error:", cleanupErr);
        }
      }
      throw ingestionError;
    }

    // Autonomously resolve the payer intake gateway right from the moment of ingestion
    try {
      // 1. Resolve base gateway info (portal URL, fax, PO Box, EDI ID, etc.) from verified directory or web search
      const resolvedContact = await ctx.runAction(
        api.actions.payerContactResolver.resolvePayerGateway,
        {
          claimId,
          payerName: extraction.insurancePayer,
        }
      );

      // 2. If OCR extracted an explicit appeals email or specific PO Box, overlay it with document provenance
      if (extraction.payerAppealsEmail && extraction.payerAppealsEmail.includes("@")) {
        await ctx.runMutation(internal.claims.updatePayerContactInternal, {
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

    let pipelineResult: Record<string, unknown> | undefined = undefined;
    if (args.autoRunPipeline) {
      try {
        pipelineResult = (await ctx.runAction(
          api.actions.sentinelPipeline.runAutonomousPipeline,
          {
            claimId,
          }
        )) as unknown as Record<string, unknown>;
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
