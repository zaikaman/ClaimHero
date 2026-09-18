"use node";

import { action } from "../_generated/server";
import { ConvexError, v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { createStructuredCompletion } from "../lib/openai";
import { api, internal } from "../_generated/api";
import { rateLimiter } from "../lib/rateLimiter";
import { requireAuthUser } from "../lib/auth";
import {
  isTextractConfigured,
  extractDocumentWithTextract,
  type TextractExtractionResult,
} from "../lib/textract";

function formatTablesAsMarkdown(tables: string[][][]): string {
  if (!tables || tables.length === 0) return "";
  return tables
    .map((grid) => {
      if (grid.length === 0) return "";
      const header = grid[0].map((c) => c.replace(/\|/g, "\\|"));
      const separator = header.map(() => "---");
      const rows = grid.slice(1);
      const lines = [
        `| ${header.join(" | ")} |`,
        `| ${separator.join(" | ")} |`,
        ...rows.map((r) => `| ${r.map((c) => c.replace(/\|/g, "\\|")).join(" | ")} |`),
      ];
      return lines.join("\n");
    })
    .join("\n\n");
}

const DENIAL_EXTRACTION_SCHEMA = {
  type: "object",
  properties: {
    isMedicalClaimDenial: {
      type: "boolean",
      description:
        "Set to true ONLY IF this document text is an actual English-language healthcare insurance claim denial letter, Explanation of Benefits (EOB), adverse benefit determination, medical necessity denial, or medical bill denial. Set to false if the document text is NOT an English healthcare denial notice (e.g. general non-medical letters, receipts, foreign documents, or unrelated text).",
    },
    documentClassificationReason: {
      type: "string",
      description:
        "Brief explanation describing what the document is and why it is or is not a genuine healthcare insurance claim denial document.",
    },
    claimNumber: { type: "string" },
    patientName: {
      type: "string",
      description:
        "Full legal name of the patient as stated in the denial document, EOB, or notice (e.g. 'Marcus Sterling', 'Eleanor Vance'). If not explicitly stated, return empty string.",
    },
    memberId: {
      type: "string",
      description:
        "The patient or member insurance policy ID as stated in the document (e.g. 'GEO-554210-99'). If not explicitly stated, return empty string.",
    },
    insurancePayer: { type: "string" },
    serviceDate: { type: "string" },
    denialDate: {
      type: "string",
      description:
        "Date of denial notice, adverse determination letter, or Explanation of Benefits (e.g. '2026-07-15' or '07/15/2026'). If not explicitly stated in document, return empty string. NEVER invent or fabricate dates.",
    },
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
    appealFilingDeadlineDays: {
      type: "number",
      description:
        "Statutory or plan appeal filing deadline in days ONLY IF explicitly stated in the denial document text (e.g. 180, 60, 90). If NOT explicitly stated in the document, return 0. NEVER fabricate a deadline window.",
    },
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
    "denialDate",
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
  denialDate: string;
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
 * Optical Extraction Action: Parse an uploaded denial letter (in-browser client
 * OCR via pdf.js/tesseract with zero PHI egress, plus optional AWS Textract
 * server-side table enhancement when credentials are configured) or
 * user-submitted text, sanitized via redactBeforeLLM, using gpt-5.4-nano Structured Outputs.
 */
export const parseDenialDocument = action({
  args: {
    sourceProvenance: v.optional(
      v.union(v.literal("client_text"), v.literal("client_ocr"), v.literal("textract"))
    ),
    extractedText: v.optional(v.string()),
    rawDocumentText: v.optional(v.string()),
    clientIdentifiers: v.optional(
      v.object({
        patientName: v.optional(v.string()),
        memberId: v.optional(v.string()),
        claimNumber: v.optional(v.string()),
      })
    ),
    storageId: v.optional(v.id("_storage")),
    patientState: v.optional(v.string()),
    patientEmail: v.optional(v.string()),
    autoRunPipeline: v.optional(v.boolean()),
    origin: v.optional(v.string()),
    dataOrigin: v.optional(v.string()),
    isDemo: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<DenialExtractionResult & { claimId: string; pipelineResult?: Record<string, unknown> }> => {
    const userId = await requireAuthUser(ctx);

    const inputText = (args.extractedText || args.rawDocumentText || "").trim();
    if (inputText.length > MAX_RAW_DOCUMENT_CHARS) {
      throw new Error(`Submitted raw document text exceeds the ${MAX_RAW_DOCUMENT_CHARS.toLocaleString()} character limit.`);
    }

    // Enforce rate limiting per authenticated user
    try {
      const limitStatus = await rateLimiter.limit(ctx, "opticalParser", {
        key: userId,
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
      // Tolerate unconfigured rate limiter in isolated unit test mocks where the component is unmounted.
      // In non-test environments, log the failure to ensure operational visibility.
      if (process.env.NODE_ENV !== "test") {
        console.warn("[RateLimiter] Unexpected error checking opticalParser rate limit:", rateErr);
      }
    }

    let documentContent = inputText;
    let textractIdentifiers: Partial<TextractExtractionResult> = {};

    let claimId: Id<"claims">;
    let extraction: DenialExtractionResult;
    let isStorageOwner = false;
    try {
      // If storage file was uploaded, fetch and prepare document content with strict size & MIME validation
      if (args.storageId) {
        // Enforce storage ownership verification before reading or parsing
        await ctx.runMutation(internal.claims.verifyStorageOwnershipInternal, {
          storageId: args.storageId,
          userId,
        });
        isStorageOwner = true;

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

          if (detected.type === "image" || detected.type === "pdf") {
            if (isTextractConfigured()) {
              const buffer = Buffer.from(arrayBuffer);
              try {
                const textractRes = await extractDocumentWithTextract(buffer);
                if (textractRes.fullText.trim()) {
                  textractIdentifiers = textractRes;
                  const tableMd = formatTablesAsMarkdown(textractRes.tables);
                  documentContent = [
                    documentContent,
                    "Extracted denial document text from AWS Textract (HIPAA BAA Optical Gate):",
                    textractRes.fullText,
                    tableMd ? `Structured Table Data:\n${tableMd}` : "",
                  ]
                    .filter(Boolean)
                    .join("\n\n");
                }
              } catch (textractErr) {
                // If client-extracted text was already supplied, log warning and use client text
                if (documentContent.trim()) {
                  console.warn("AWS Textract extraction failed; falling back to client-extracted text:", textractErr);
                } else {
                  // Fail closed: never fall back to direct multimodal parsing with raw PHI bytes
                  throw new Error(
                    `AWS Textract document extraction failed: ${textractErr instanceof Error ? textractErr.message : String(textractErr)}. No fallback parsing was attempted to protect PHI. Please retry once AWS Textract recovers.`
                  );
                }
              }
            } else {
              // AWS Textract is not configured.
              // If client extractedText was provided (client_text / client_ocr), accept it and skip Textract!
              if (documentContent.trim()) {
                // Client-side in-browser text extraction accepted (zero PHI egress, zero BAA required)
              } else {
                throw new Error(
                  "AWS Textract credentials not configured. PDF/image denial intake requires AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY in the Convex deployment environment, or in-browser client text extraction (sourceProvenance: 'client_text' | 'client_ocr'). Upload a text extraction instead, or configure Textract and retry."
                );
              }
            }
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

      if (!documentContent) {
        throw new Error("No document content or file provided for optical extraction.");
      }

      // Call OpenAI Structured Outputs with gpt-5.4-nano on de-identified text.
      // The centralized PHI-safe boundary vault-tokenizes the client/Textract
      // vault (authoritative identifiers) before the regex gate and fails
      // closed on leak. The model therefore sees tokens where the vault
      // applies and redacted placeholders elsewhere.
      const { collectPhiValues: collectIntakePhi } = await import("../lib/phiSafe");
      const intakePhi = collectIntakePhi({
        patientName: args.clientIdentifiers?.patientName || textractIdentifiers.patientName,
        memberId: args.clientIdentifiers?.memberId || textractIdentifiers.memberId,
        claimNumber: args.clientIdentifiers?.claimNumber || textractIdentifiers.claimNumber,
        serviceDate: textractIdentifiers.serviceDate,
      });
      extraction = await createStructuredCompletion<DenialExtractionResult>({
        phiValues: intakePhi,
        systemPrompt: `You are an expert Certified Professional Medical Coder (CPC) and ERISA Insurance Claims Auditor.
Your job is to rigorously classify uploaded document text and extract structured medical claim denial data.

Direct identifiers in the source are vault-tokenized (for example [PATIENT], [MEMBER_ID], [CLAIM_REF], [SERVICE_DATE]). When a token appears where an identifier belongs, return the token verbatim in that field; the application restores the authentic value from its trusted vault. Never invent a real name, ID, or date to replace a token.

CRITICAL DOCUMENT CLASSIFICATION & VALIDATION RULES:
1. First, determine whether the input document text is an actual English-language healthcare insurance claim denial, Explanation of Benefits (EOB), adverse benefit determination, or medical necessity denial letter.
2. If the document text is NOT a valid English healthcare claim denial (for example: receipts, general correspondence, non-medical invoices, non-English or foreign documents, or unreadable OCR output):
    - Set "isMedicalClaimDenial" to FALSE.
    - Provide a clear, polite 1-sentence reason in "documentClassificationReason" (e.g. "The uploaded document text is not an English-language healthcare insurance claim denial or EOB. ClaimHero exclusively supports English-language documents under US healthcare jurisdictions.").
    - Set all string fields to "", numbers to 0, and arrays to [].
3. If the document IS a valid English medical claim denial:
    - Set "isMedicalClaimDenial" to TRUE.
    - Extract patient legal name, member ID, treating provider name, insurer payer name, all financial amounts, clinical CPT procedure codes, ICD-10 diagnosis codes, denial reason codes (e.g. CO-50, CO-197, CO-16), and statutory appeal filing deadlines.
    - Extract dollar amounts as pure numbers without currency symbols (e.g. 24500 instead of "$24,500.00"). If missing, return 0.
    - If identifiers or dates (patient name, member ID, provider, claim number, service date, denial date) are not explicitly mentioned, return "". NEVER invent or fabricate identifiers or dates.
    - If CPT or ICD-10 codes are missing, return [].
    - If statutory appeal deadline is explicitly stated in the document, extract the integer days (e.g. 180, 60, 90). If NOT explicitly stated in the document, return 0. NEVER fabricate or assume a 180-day or other statutory deadline.
4. Strict English-Only Mandate: ClaimHero exclusively supports English-language documents and US healthcare jurisdictions (ERISA, ACA, CMS). All extracted textual metadata, denial reasons, descriptions, and classification reasons must be exclusively in English. Non-English and foreign insurance documents must be classified as non-claim documents.
5. You must output all schema properties in the JSON response. If an attribute or identifier is not mentioned in the document, populate it with "" (empty string) for strings, 0 for numbers, and [] for arrays. Do not omit any properties.`,
        userPrompt: `Extract structured medical claim metadata from the following denial document:\n\n${documentContent}`,
        schemaName: "DenialExtractionResult",
        schema: DENIAL_EXTRACTION_SCHEMA,
        temperature: 0.1,
      });

      // TRUST-BOUNDARY REHYDRATION (Convex DB write only, never an LLM input):
      // The model operated on de-identified text, so identifier fields may hold
      // vault tokens or redaction placeholders. Authentic values are restored
      // here from the trusted vault only — the in-browser client identifiers
      // (zero PHI egress) or AWS Textract under the HIPAA BAA — before the
      // claim is persisted. Rehydrated values must never be fed back into a
      // subsequent LLM prompt without passing through the PHI-safe boundary
      // again (all downstream actions supply phiValues for exactly this).
      const isMaskedIdentifier = (value?: string) =>
        !value ||
        value.includes("REDACTED") ||
        value.includes("*") ||
        value.includes("[PATIENT]") ||
        value.includes("[MEMBER_ID]") ||
        value.includes("[CLAIM_REF]") ||
        value.includes("[SERVICE_DATE]");
      // Provider names are workforce operational data, not patient direct
      // identifiers: the trusted UI must never render LLM-redaction
      // placeholders ("Dr. [PATIENT REDACTED], MD") as the treating
      // physician. A masked extraction means the source was over-redacted;
      // fall back to the trusted Textract vault or honest empty.
      const sanitizeProviderNameForStorage = (value?: string): string => {
        const trimmed = (value || "").trim();
        if (!trimmed || isMaskedIdentifier(trimmed)) return "";
        return trimmed;
      };
      const authenticPatientName = args.clientIdentifiers?.patientName || textractIdentifiers.patientName;
      if (authenticPatientName && isMaskedIdentifier(extraction.patientName)) {
        extraction.patientName = authenticPatientName;
      }
      const authenticMemberId = args.clientIdentifiers?.memberId || textractIdentifiers.memberId;
      if (authenticMemberId && isMaskedIdentifier(extraction.memberId)) {
        extraction.memberId = authenticMemberId;
      }
      const authenticClaimNumber = args.clientIdentifiers?.claimNumber || textractIdentifiers.claimNumber;
      if (authenticClaimNumber && isMaskedIdentifier(extraction.claimNumber)) {
        extraction.claimNumber = authenticClaimNumber;
      }
      if (textractIdentifiers.serviceDate && !extraction.serviceDate) {
        extraction.serviceDate = textractIdentifiers.serviceDate;
      }
      if (
        textractIdentifiers.providerName &&
        (!extraction.providerName || isMaskedIdentifier(extraction.providerName))
      ) {
        extraction.providerName = textractIdentifiers.providerName;
      }
      // Fail honest, never persist a redaction placeholder as the provider.
      extraction.providerName = sanitizeProviderNameForStorage(extraction.providerName);
      // Same fail-honest contract for routing identifiers: a masked extraction
      // means the source was over-redacted. Collapse to "" so the database
      // layer falls back to PENDING/regenerated values instead of persisting
      // "[REDACTED MEMBER ID]" (which the appeal letter would print verbatim).
      const sanitizeIdentifierForStorage = (value?: string): string => {
        const trimmed = (value || "").trim();
        if (!trimmed || isMaskedIdentifier(trimmed)) return "";
        return trimmed;
      };
      extraction.memberId = sanitizeIdentifierForStorage(extraction.memberId);
      extraction.claimNumber = sanitizeIdentifierForStorage(extraction.claimNumber);
      if (isMaskedIdentifier(extraction.serviceDate)) {
        extraction.serviceDate = "";
      }
      if (textractIdentifiers.deniedAmount !== undefined && (!extraction.deniedAmount || extraction.deniedAmount === 0)) {
        extraction.deniedAmount = textractIdentifiers.deniedAmount;
      }
      if (textractIdentifiers.patientOwedAmount !== undefined && (!extraction.patientOwedAmount || extraction.patientOwedAmount === 0)) {
        extraction.patientOwedAmount = textractIdentifiers.patientOwedAmount;
      }
      if (textractIdentifiers.payerAppealsEmail && !extraction.payerAppealsEmail) {
        extraction.payerAppealsEmail = textractIdentifiers.payerAppealsEmail;
      }
      if (textractIdentifiers.payerAppealsAddress && !extraction.payerAppealsAddress) {
        extraction.payerAppealsAddress = textractIdentifiers.payerAppealsAddress;
      }
      if (textractIdentifiers.insurancePayer && (!extraction.insurancePayer || extraction.insurancePayer === "Unspecified Payer")) {
        extraction.insurancePayer = textractIdentifiers.insurancePayer;
      }

      // Enforce claim validation safeguards - reject non-claim documents
      if (extraction.isMedicalClaimDenial === false) {
        const reason =
          extraction.documentClassificationReason?.trim() ||
          "The uploaded file is not a valid English-language healthcare insurance claim denial letter or Explanation of Benefits (EOB).";
        throw new ConvexError(
          `Non-claim document detected: ${reason} Please upload a genuine English-language adverse determination letter, medical denial notice, or EOB document.`
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

      const isDemo = args.origin === "demo-fixture" || args.dataOrigin === "demo-fixture" || args.isDemo === true;
      const origin = args.origin || (isDemo ? "demo-fixture" : undefined);
      const dataOrigin = args.dataOrigin || (isDemo ? "demo-fixture" : "live-pipeline");

      let resolvedServiceDate = extraction.serviceDate?.trim() || "";
      if (resolvedServiceDate.includes("**") || !resolvedServiceDate) {
        const dateMatch = documentContent.match(
          /\b(?:DOS|Date\s*of\s*Service|Service\s*Date)[\s:]*([0-9]{1,2}[/.-][0-9]{1,2}[/.-][0-9]{2,4}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+[0-9]{1,2},?\s+[0-9]{4})\b/i
        );
        if (dateMatch) {
          resolvedServiceDate = dateMatch[1];
        }
      }

      let resolvedDenialDate = extraction.denialDate?.trim() || "";
      if (resolvedDenialDate.includes("**") || !resolvedDenialDate) {
        const denialDateMatch = documentContent.match(
          /\b(?:Denial\s*Date|Notice\s*Date|Determination\s*Date|Date\s*of\s*Notice|Date\s*Processed|EOB\s*Date|Adverse\s*Determination\s*Date)[\s:]*([0-9]{1,2}[/.-][0-9]{1,2}[/.-][0-9]{2,4}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+[0-9]{1,2},?\s+[0-9]{4})\b/i
        );
        if (denialDateMatch) {
          resolvedDenialDate = denialDateMatch[1];
        }
      }

      // Save patient and claim into Convex database with denialLetterStorageId linked.
      // Identity is resolved server-side inside createWithPatientInternal from the
      // propagated auth session; no userId is passed so callers cannot spoof ownership.
      claimId = await ctx.runMutation(internal.claims.createWithPatientInternal, {
        patientName: extraction.patientName?.trim() || "",
        patientEmail: args.patientEmail?.trim() || "",
        memberId: extraction.memberId?.trim() || "",
        insurancePayer: extraction.insurancePayer?.trim() || "Unspecified Payer",
        state: args.patientState || "California",
        claimNumber: extraction.claimNumber?.trim() || "",
        serviceDate: resolvedServiceDate,
        denialDate: resolvedDenialDate || undefined,
        providerName: extraction.providerName?.trim() || "",
        deniedAmount: typeof extraction.deniedAmount === "number" ? extraction.deniedAmount : 0,
        patientOwedAmount: typeof extraction.patientOwedAmount === "number" ? extraction.patientOwedAmount : 0,
        cptCodes: Array.isArray(extraction.cptCodes) ? extraction.cptCodes.filter(Boolean) : [],
        icd10Codes: Array.isArray(extraction.icd10Codes) ? extraction.icd10Codes.filter(Boolean) : [],
        denialReasonCode: extraction.denialReasonCode?.trim() || "",
        denialReasonDescription: extraction.denialReasonDescription?.trim() || "",
        appealFilingDeadlineDays:
          typeof extraction.appealFilingDeadlineDays === "number" && extraction.appealFilingDeadlineDays > 0
            ? extraction.appealFilingDeadlineDays
            : undefined,
        denialLetterStorageId: args.storageId,
        origin,
        dataOrigin,
        isDemo,
        isSyntheticPII: isDemo,
      });
    } catch (ingestionError) {
      // Clean up orphaned storage file immediately on document rejection or parsing error ONLY IF caller was verified as owner
      if (args.storageId && isStorageOwner) {
        try {
          await ctx.runMutation(internal.claims.cleanupStorageFileInternal, {
            storageId: args.storageId,
            userId,
          });
        } catch (cleanupErr) {
          console.warn("Storage cleanup note on parser error:", cleanupErr);
        }
      }
      throw ingestionError;
    }

    // Autonomously resolve the payer intake gateway without blocking extraction return.
    // The Document OCR overlay (when present) is applied immediately so the claim is
    // usable instantly; live gateway search runs in the background and the sentinel
    // pipeline re-resolves on demand if payerContact is still missing.
    const ocrAppealsEmail = extraction.payerAppealsEmail;
    const hasOcrContact =
      typeof ocrAppealsEmail === "string" && ocrAppealsEmail.includes("@");
    if (hasOcrContact) {
      try {
        await ctx.runMutation(internal.claims.updatePayerContactInternal, {
          claimId,
          payerContact: {
            officialAppealsEmail: ocrAppealsEmail as string,
            statutoryPoBox:
              extraction.payerAppealsAddress ||
              `${extraction.insurancePayer} Appeals Unit`,
            isVerified: true,
            source: "document_ocr",
          },
        });
      } catch (contactErr) {
        console.warn("Auto payer gateway resolution note:", contactErr);
      }
      // Document-OCR contact is authoritative: skip background search so the
      // scheduled resolver cannot overwrite document provenance. The sentinel
      // pipeline only auto-resolves when payerContact is missing.
    } else {
      try {
        const scheduler = (
          ctx as unknown as {
            scheduler?: {
              runAfter: (delayMs: number, fn: unknown, args: unknown) => Promise<unknown>;
            };
          }
        ).scheduler;
        if (scheduler && typeof scheduler.runAfter === "function") {
          await scheduler.runAfter(
            0,
            internal.actions.payerContactResolver.resolvePayerGatewayInternal,
            {
              claimId,
              payerName: extraction.insurancePayer,
            }
          );
        } else {
          // Fallback for isolated test runners without scheduler: resolve inline.
          // The sentinel pipeline also auto-resolves when payerContact is missing.
          void ctx
            .runAction(internal.actions.payerContactResolver.resolvePayerGatewayInternal, {
              claimId,
              payerName: extraction.insurancePayer,
            })
            .catch((contactErr: unknown) => {
              console.warn("Auto payer gateway resolution note:", contactErr);
            });
        }
      } catch (contactErr) {
        console.warn("Auto payer gateway resolution note:", contactErr);
      }
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
