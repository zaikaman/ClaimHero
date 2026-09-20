"use node";

import { internalAction } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Id, Doc } from "../_generated/dataModel";
import { createStructuredCompletion } from "../lib/openai";
import { collectPhiValues } from "../lib/phiSafe";
import { DENIAL_EXTRACTION_SCHEMA, type DenialExtractionResult } from "./opticalParser";

/**
 * Worker action for draining the RCM clinic bulk denial intake queue.
 * Executed inside @convex-dev/workpool with concurrency: 3.
 * Smoothly processes 40+ Monday morning denial letters without blowing
 * past OpenAI Tokens-Per-Minute (TPM) limits or memory caps.
 */
export const processBulkIntakeItemAction = internalAction({
  args: {
    itemId: v.id("bulkIntakeItems"),
    batchId: v.id("bulkIntakeBatches"),
    userId: v.id("users"),
  },
  handler: async (ctx, args): Promise<{ success: boolean; claimId?: string; error?: string }> => {
    await ctx.runMutation(internal.bulkIntake.markItemProcessingInternal, {
      itemId: args.itemId,
    });

    const item = (await ctx.runQuery(internal.bulkIntake.getItemInternal, {
      itemId: args.itemId,
    })) as Doc<"bulkIntakeItems"> | null;

    if (!item) {
      throw new Error(`Bulk intake item ${args.itemId} not found.`);
    }

    try {
      let documentText = (item.rawDocumentText || "").trim();

      // If storageId was uploaded, fetch and decode the text
      if (item.storageId && !documentText) {
        const fileUrl = await ctx.storage.getUrl(item.storageId);
        if (!fileUrl) {
          throw new Error(`File storage ID ${item.storageId} not found in storage.`);
        }
        const response = await fetch(fileUrl);
        if (!response.ok) {
          throw new Error(`Failed to fetch file from storage: ${response.statusText}`);
        }
        const arrayBuffer = await response.arrayBuffer();
        const header = new Uint8Array(arrayBuffer.slice(0, 5));
        const isPdf = header[0] === 0x25 && header[1] === 0x50 && header[2] === 0x44 && header[3] === 0x46; // "%PDF"
        if (isPdf) {
          throw new Error(
            `Bulk intake item "${item.fileName}" contains raw binary PDF data without extracted text. Please ensure in-browser client OCR text is supplied in rawDocumentText.`
          );
        }
        documentText = new TextDecoder("utf-8").decode(arrayBuffer);
      }

      if (!documentText) {
        throw new Error("No document text or storage payload provided for bulk intake item.");
      }

      // Structured extraction with OpenAI
      const intakePhi = collectPhiValues({
        patientName: undefined,
        memberId: undefined,
        claimNumber: undefined,
      });

      const extraction = await createStructuredCompletion<DenialExtractionResult>({
        phiValues: intakePhi,
        systemPrompt: `You are an expert Certified Professional Medical Coder (CPC) and ERISA Insurance Claims Auditor.
Your job is to classify uploaded denial text and extract structured medical claim denial data for high-volume clinic bulk intake.
Extract patient legal name, member ID, treating provider name, insurer payer name, all financial amounts, clinical CPT procedure codes, ICD-10 diagnosis codes, denial reason codes (e.g. CO-50, CO-197, CO-16), and statutory appeal filing deadlines.
Extract dollar amounts as pure numbers without currency symbols (e.g. 24500 instead of "$24,500.00"). If missing, return 0.
Strict English-Only Mandate: All extracted metadata must be in English.`,
        userPrompt: `Extract structured medical claim metadata from the following denial document:\n\n${documentText}`,
        schemaName: "DenialExtractionResult",
        schema: DENIAL_EXTRACTION_SCHEMA,
        temperature: 0.1,
      });

      const isMedicalClaim = extraction.isMedicalClaimDenial !== false;
      if (!isMedicalClaim) {
        throw new Error(
          extraction.documentClassificationReason ||
            "Uploaded document is not a recognized English healthcare insurance claim denial letter."
        );
      }

      // Create claim for the authenticated user
      const claimId = (await ctx.runMutation(internal.claims.createWithPatientForUserInternal, {
        userId: args.userId,
        patientName: extraction.patientName?.trim() || "Unspecified Patient",
        patientEmail: "",
        memberId: extraction.memberId?.trim() || "",
        groupNumber: extraction.groupNumber?.trim() || undefined,
        dateOfBirth: extraction.dateOfBirth?.trim() || undefined,
        insurancePayer: extraction.insurancePayer?.trim() || "Unspecified Payer",
        state: item.patientState?.trim() || "Unspecified",
        claimNumber: extraction.claimNumber?.trim() || `CLM-${Date.now().toString(36).toUpperCase()}`,
        serviceDate: extraction.serviceDate?.trim() || new Date().toISOString().slice(0, 10),
        denialDate: extraction.denialDate?.trim() || undefined,
        providerName: extraction.providerName?.trim() || "Treating Provider",
        deniedAmount: typeof extraction.deniedAmount === "number" ? extraction.deniedAmount : 0,
        patientOwedAmount: typeof extraction.patientOwedAmount === "number" ? extraction.patientOwedAmount : 0,
        cptCodes: extraction.cptCodes || [],
        icd10Codes: extraction.icd10Codes || [],
        denialReasonCode: extraction.denialReasonCode?.trim() || "CO-50",
        denialReasonDescription: extraction.denialReasonDescription?.trim() || "Medical necessity denial",
        appealFilingDeadlineDays: extraction.appealFilingDeadlineDays || 180,
        denialLetterStorageId: item.storageId,
        origin: item.origin || "rcm-bulk-intake",
        dataOrigin: "live-pipeline",
      })) as Id<"claims">;

      await ctx.runMutation(internal.bulkIntake.markItemCompletedInternal, {
        itemId: args.itemId,
        claimId,
      });

      return {
        success: true,
        claimId,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      await ctx.runMutation(internal.bulkIntake.markItemFailedInternal, {
        itemId: args.itemId,
        error: errorMessage,
      });
      throw error;
    }
  },
});
