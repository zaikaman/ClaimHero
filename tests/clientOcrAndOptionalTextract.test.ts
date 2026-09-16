import { describe, it, expect, vi, beforeEach } from "vitest";
import { extractClientVaultIdentifiers, extractDocumentInBrowser } from "../src/lib/clientOcr";
import { redactBeforeLLM } from "../src/lib/redactionEngine";
import * as authLib from "../convex/lib/auth";
import * as auditLogsModule from "../convex/auditLogs";
import { updateAttachmentClientOcr } from "../convex/emails";

describe("In-Browser Client OCR & De-Identification Architecture", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("extractClientVaultIdentifiers", () => {
    it("extracts authentic patient name, member ID, and claim number from raw denial text", () => {
      const rawText = `
        EXPLANATION OF BENEFITS
        Payer: Aetna Life Insurance
        Patient Name: Marcus Sterling
        Member ID: GEO-554210-99
        Claim Number: CLM-89210-A
        Date of Service: 2026-02-15
        Total Denied: $24,500.00
      `;

      const identifiers = extractClientVaultIdentifiers(rawText);

      expect(identifiers.patientName).toBe("Marcus Sterling");
      expect(identifiers.memberId).toBe("GEO-554210-99");
      expect(identifiers.claimNumber).toBe("CLM-89210-A");
    });

    it("rejects non-name header labels and false positives", () => {
      const rawText = `
        Notice of Adverse Benefit Determination
        Medical Director Review
        Claim #: CLM-112233
      `;

      const identifiers = extractClientVaultIdentifiers(rawText);

      expect(identifiers.patientName).toBeUndefined();
      expect(identifiers.claimNumber).toBe("CLM-112233");
    });
  });

  describe("Client-Side redactBeforeLLM (src/lib/redactionEngine)", () => {
    it("masks direct patient identifiers under HIPAA Safe Harbor in the browser before transmission", () => {
      const sensitiveText = "Marcus Sterling with SSN 000-12-3456 and Member ID GEO-554210 was denied coverage. Contact at 415-555-0199 or marcus@example.com.";
      const sanitized = redactBeforeLLM(sensitiveText);

      expect(sanitized).not.toContain("000-12-3456");
      expect(sanitized).not.toContain("415-555-0199");
      expect(sanitized).not.toContain("marcus@example.com");
      expect(sanitized).toContain("***-**-****");
    });
  });

  describe("extractDocumentInBrowser pipeline", () => {
    it("processes text files, extracts client identifiers, and produces Safe Harbor de-identified text", async () => {
      const textContent = `
        Aetna Health Insurance Denial
        Patient Name: Eleanor Vance
        Member ID: AET-882100
        Claim Number: CLM-445566
        SSN: 987-65-4321
        The requested procedure CPT 27447 is denied under Clinical Policy Bulletin 0211.
      `;

      const blob = new Blob([textContent], { type: "text/plain" });
      const result = await extractDocumentInBrowser(blob, "denial_letter.txt");

      expect(result.sourceProvenance).toBe("client_text");
      expect(result.clientIdentifiers.patientName).toBe("Eleanor Vance");
      expect(result.clientIdentifiers.memberId).toBe("AET-882100");
      expect(result.clientIdentifiers.claimNumber).toBe("CLM-445566");
      expect(result.sanitizedText).not.toContain("987-65-4321");
      expect(result.sanitizedText).toContain("***-**-****");
      expect(result.sanitizedText).toContain("CPT 27447");
    });
  });

  describe("updateAttachmentClientOcr Mutation (convex/emails)", () => {
    it("updates attachment with extracted status, stores extractedText, and logs audit trail", async () => {
      vi.spyOn(authLib, "requireClaimEditor").mockResolvedValue({
        userId: "user_owner",
        claim: { _id: "claim_123", userId: "user_owner" } as any,
      });

      const mockMessage = {
        _id: "msg_inbound_1",
        claimId: "claim_123",
        bodyText: "Payer response received with attached document.",
        attachments: [
          {
            storageId: "storage_att_1",
            filename: "Denial-Notice.pdf",
            contentType: "application/pdf",
            size: 45000,
            ocrStatus: "needs_client_ocr",
          },
        ],
      };

      const mockCtx: any = {
        db: {
          get: vi.fn().mockImplementation(async (id: string) => {
            if (id === "msg_inbound_1") return mockMessage;
            return null;
          }),
          patch: vi.fn().mockResolvedValue(undefined),
          insert: vi.fn().mockResolvedValue("audit_log_1"),
        },
      };

      const result = await (updateAttachmentClientOcr as any)._handler(mockCtx, {
        claimId: "claim_123" as any,
        messageId: "msg_inbound_1" as any,
        storageId: "storage_att_1" as any,
        extractedText: "Procedure CPT 27447 denied under CPB 0211 as experimental.",
      });

      expect(result).toEqual({ success: true });

      // Assert message was patched with extracted attachment status and enriched body text
      expect(mockCtx.db.patch).toHaveBeenCalledWith(
        "msg_inbound_1",
        expect.objectContaining({
          attachments: [
            expect.objectContaining({
              storageId: "storage_att_1",
              ocrStatus: "extracted",
              extractedText: "Procedure CPT 27447 denied under CPB 0211 as experimental.",
            }),
          ],
          bodyText: expect.stringContaining("[In-Browser Client OCR Extracted Text for Attachment]:"),
        })
      );

      // Assert audit log was recorded in appealAuditLogs
      expect(mockCtx.db.insert).toHaveBeenCalledWith(
        "appealAuditLogs",
        expect.objectContaining({
          claimId: "claim_123",
          eventType: "attachment_client_ocr_extracted",
        })
      );
    });

    it("rejects unauthorized caller not owning the claim", async () => {
      vi.spyOn(authLib, "requireClaimEditor").mockRejectedValue(new Error("Unauthorized: you do not have permission to edit this claim"));

      const mockCtx: any = {
        db: {
          get: vi.fn(),
          patch: vi.fn(),
        },
      };

      await expect(
        (updateAttachmentClientOcr as any)._handler(mockCtx, {
          claimId: "claim_unauthorized" as any,
          messageId: "msg_1" as any,
          storageId: "storage_1" as any,
          extractedText: "test",
        })
      ).rejects.toThrow(/Unauthorized/);
    });
  });
});
