import { describe, it, expect, vi, beforeEach } from "vitest";
import { generateFormalAppealPdf, ensureAppealPdfStored } from "../convex/lib/pdfGenerator";
import * as pdfGenerator from "../convex/lib/pdfGenerator";
import * as agentMailLib from "../convex/lib/agentMail";
import * as openaiLib from "../convex/lib/openai";
import * as authLib from "../convex/lib/auth";
import * as emailsModule from "../convex/emails";
import { rateLimiter } from "../convex/lib/rateLimiter";
import { api, internal } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { dispatchAppealPacket } from "../convex/actions/mailDispatcher";
import { processInboundClaimReply } from "../convex/actions/agentMail";

describe("Formal PDF Appeal Packet Attachments (Outbound & Inbound)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.AGENTMAIL_API_KEY = "test_agentmail_key";
    process.env.AGENTMAIL_SENDER_INBOX_ID = "inbox_sender";
    process.env.AGENTMAIL_SENDER_EMAIL = "claimhero-sender@agentmail.to";
    process.env.AGENTMAIL_ADJUDICATOR_INBOX_ID = "inbox_adjudicator";
    process.env.AGENTMAIL_ADJUDICATOR_EMAIL = "claimhero-adjudicator@agentmail.to";
  });

  describe("PDF Generation Engine (convex/lib/pdfGenerator)", () => {
    it("compiles a valid standards-compliant PDF 1.4 binary buffer", () => {
      const buffer = generateFormalAppealPdf({
        claimNumber: "CH-89210",
        patientName: "Jane Doe",
        memberId: "MEM-9921",
        insurancePayer: "Aetna Life Insurance",
        serviceDate: "2026-08-15",
        deniedAmount: 18500,
        denialReason: "CO-50 - Not Medically Necessary",
        appealMarkdown: [
          "# Formal Appeal Brief",
          "This is a formal statutory appeal for Claim #CH-89210.",
          "## Clinical Necessity",
          "- Patient underwent emergency surgical arthroplasty after severe trauma.",
          "- Peer-reviewed AAOS guidelines mandate immediate operative intervention.",
          "### Legal Grounds",
          "Under ERISA 29 U.S.C. § 1133 and 29 C.F.R. § 2560.503-1, full and fair review is required.",
        ].join("\n"),
        providerName: "Memorial Regional Hospital",
        cptCodes: ["27447"],
        icd10Codes: ["M17.11"],
      });

      expect(Buffer.isBuffer(buffer)).toBe(true);
      expect(buffer.length).toBeGreaterThan(500);

      const pdfText = buffer.toString("binary");
      expect(pdfText.startsWith("%PDF-1.4")).toBe(true);
      expect(pdfText).toContain("/Type /Catalog");
      expect(pdfText).toContain("/Type /Pages");
      expect(pdfText).toContain("/Type /Font");
      expect(pdfText).toContain("/Helvetica");
      expect(pdfText).toContain("/Helvetica-Bold");
      expect(pdfText).toContain("CH-89210");
      expect(pdfText).toContain("Aetna Life Insurance");
      expect(pdfText).toContain("MEM-9921");
      expect(pdfText).toContain("27447");
      expect(pdfText).toContain("ERISA");
      expect(pdfText).toContain("%%EOF");
    });

    it("handles multi-page overflow and generates footers on all pages", () => {
      const longMarkdown = Array.from({ length: 80 }, (_, i) => `Paragraph line ${i + 1}: Substantive clinical discussion demonstrating medical necessity.`).join("\n\n");
      const buffer = generateFormalAppealPdf({
        claimNumber: "CH-MULTI",
        patientName: "John Smith",
        insurancePayer: "UnitedHealthcare",
        deniedAmount: 45000,
        appealMarkdown: longMarkdown,
      });

      const pdfText = buffer.toString("binary");
      expect(pdfText).toContain("/Type /Page");
      expect(pdfText).toContain("Page 1 of");
      expect(pdfText).toContain("%%EOF");
    });

    it("correctly advances vertical coordinates for multiline headings without overlapping following bullets", () => {
      const buffer = generateFormalAppealPdf({
        claimNumber: "CH-HEADING-TEST",
        patientName: "Jane Doe",
        insurancePayer: "Aetna",
        appealMarkdown: [
          "## Evidentiary Exhibits & Proof of Policy on Date of Service",
          "### Exhibit B: Proof of Policy on Date of Service - Clinical Policy for Laminectomy and Prior Authorization Requirements",
          "- Verified full-page visual capture recorded on 2026-09-05",
          "- Clinical coverage clause: Medical Necessity Criteria Sec. 1",
        ].join("\n"),
      });

      const pdfText = buffer.toString("binary");
      expect(pdfText).toContain("Exhibit B: Proof of Policy on Date of Service - Clinical Policy for");
      expect(pdfText).toContain("Laminectomy and Prior Authorization Requirements");
      expect(pdfText).toContain("- Verified full-page visual capture recorded on 2026-09-05");

      // Extract y coordinates for the second line of heading and the following bullet line
      const line2Regex = /45\s+([0-9.]+)\s+Td\s*\n\((Laminectomy and Prior Authorization Requirements)\)\s*Tj/;
      const bulletRegex = /53\s+([0-9.]+)\s+Td\s*\n\((- Verified full-page visual capture recorded on 2026-09-05)\)\s*Tj/;

      const line2Match = pdfText.match(line2Regex);
      const bulletMatch = pdfText.match(bulletRegex);

      expect(line2Match).toBeTruthy();
      expect(bulletMatch).toBeTruthy();

      const line2Y = parseFloat(line2Match![1]);
      const bulletY = parseFloat(bulletMatch![1]);

      // Bullet baseline MUST be positioned cleanly below heading line 2
      // Prior to the fix, line2Y - bulletY was only 4 pt, rendering the bullet directly on top of line 2.
      // With the fix, line2Y - bulletY is 18 pt (lineHeight 13 + marginBottom 5).
      expect(line2Y - bulletY).toBe(18);
    });

    it("ensureAppealPdfStored: reuses existing storage blob if available", async () => {
      const mockStorageBlob = new Blob([Buffer.from("%PDF-1.4 existing pdf content %%EOF")], { type: "application/pdf" });
      const mockCtx: any = {
        storage: {
          get: vi.fn().mockResolvedValue(mockStorageBlob),
          store: vi.fn(),
        },
        runMutation: vi.fn(),
      };

      const mockClaim: any = {
        _id: "claim_1",
        claimNumber: "CH-1234",
        patientName: "John Smith",
      };

      const mockAppeal: any = {
        _id: "appeal_1",
        pdfExportStorageId: "storage_existing_pdf",
        fullAppealMarkdown: "# Brief",
      };

      const res = await ensureAppealPdfStored(mockCtx, mockClaim, mockAppeal);
      expect(res.storageId).toBe("storage_existing_pdf");
      expect(mockCtx.storage.get).toHaveBeenCalledWith("storage_existing_pdf");
      expect(mockCtx.storage.store).not.toHaveBeenCalled();
    });

    it("ensureAppealPdfStored: generates, stores, and patches appeal when storageId is missing", async () => {
      const mockCtx: any = {
        storage: {
          get: vi.fn().mockResolvedValue(null),
          store: vi.fn().mockResolvedValue("storage_new_pdf"),
        },
        runMutation: vi.fn().mockResolvedValue(null),
      };

      const mockClaim: any = {
        _id: "claim_2",
        claimNumber: "CH-5678",
        patientName: "Alice Walker",
        insurancePayer: "Cigna",
        deniedAmount: 12000,
        denialReasonCode: "CO-16",
        denialReasonDescription: "Missing clinical notes",
      };

      const mockAppeal: any = {
        _id: "appeal_2",
        fullAppealMarkdown: "# Clinical Brief for Cigna",
      };

      const res = await ensureAppealPdfStored(mockCtx, mockClaim, mockAppeal);
      expect(res.storageId).toBe("storage_new_pdf");
      expect(mockCtx.storage.store).toHaveBeenCalled();
      expect(mockCtx.runMutation).toHaveBeenCalledWith(
        internal.appeals.updatePdfStorageIdInternal,
        {
          appealId: "appeal_2",
          pdfExportStorageId: "storage_new_pdf",
        }
      );
    });
  });

  describe("Outbound PDF Dossier Dispatch (convex/actions/mailDispatcher)", () => {
    it("attaches compiled PDF brief to outgoing AgentMail message and records attachment in db", async () => {
      vi.spyOn(rateLimiter, "limit").mockResolvedValue({ ok: true } as any);

      vi.spyOn(authLib, "requireClaimOwnerAction").mockResolvedValue({
        claim: {
          _id: "claim_outbound" as any,
          claimNumber: "CH-7788",
          patientName: "Robert Green",
          patient: { insurancePayer: "Blue Cross Blue Shield", name: "Robert Green" },
          deniedAmount: 25000,
          payerContact: { officialAppealsEmail: "appeals@bcbs.com" },
        } as any,
        userId: "user_test" as Id<"users">,
      });

      const mockPdfBuffer = Buffer.from("%PDF-1.4 mock pdf content %%EOF");
      vi.spyOn(pdfGenerator, "ensureAppealPdfStored").mockResolvedValue({
        storageId: "storage_pdf_brief" as any,
        buffer: mockPdfBuffer,
        filename: "Formal-Appeal-Packet-CH-7788.pdf",
      });

      const mockSend = vi.spyOn(agentMailLib, "sendAgentMailMessage").mockResolvedValue({
        messageId: "msg_outbound_123",
        threadId: "thread_agentmail_1",
      });

      const mockCtx: any = {
        runQuery: vi.fn().mockResolvedValue({
          _id: "appeal_outbound",
          claimId: "claim_outbound",
          fullAppealMarkdown: "# Outbound Brief",
          pdfExportStorageId: "storage_pdf_brief",
        }),
        runMutation: vi.fn().mockImplementation((fn: any) => {
          if (fn === internal.emails.getOrCreateThreadInternal) return "thread_db_1";
          return null;
        }),
        storage: {
          get: vi.fn(),
          store: vi.fn(),
        },
      };

      const receipt = await (dispatchAppealPacket as any)._handler(mockCtx, {
        claimId: "claim_outbound",
        dispatchMode: "official_payer",
        recipientEmail: "appeals@bcbs.com",
      });

      expect(receipt.status).toBe("delivered");
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          attachments: [
            {
              filename: "Formal-Appeal-Packet-CH-7788.pdf",
              content: mockPdfBuffer.toString("base64"),
              contentType: "application/pdf",
            },
          ],
        })
      );

      // Verify outbound message was recorded with attachments metadata
      expect(mockCtx.runMutation).toHaveBeenCalledWith(
        internal.emails.insertMessageInternal,
        expect.objectContaining({
          hasAttachments: true,
          attachments: [
            {
              storageId: "storage_pdf_brief",
              filename: "Formal-Appeal-Packet-CH-7788.pdf",
              contentType: "application/pdf",
              size: mockPdfBuffer.byteLength,
            },
          ],
        })
      );
    });
  });

  describe("Inbound PDF Attachment Storage & Parsing (convex/actions/agentMail)", () => {
    it("downloads inbound PDF attachments, saves to Convex Storage, and feeds into structured multimodal parser", async () => {
      const mockPdfBytes = Buffer.from("%PDF-1.4 Inbound Explanation of Benefits (EOB) Overturn %%EOF");

      vi.spyOn(agentMailLib, "getAgentMailMessage").mockResolvedValue({
        message_id: "msg_inbound_eob",
        inbox_id: "inbox_adjudicator",
        from: "appeals-adjudicator@aetna.com",
        to: ["claimhero-sender@agentmail.to"],
        subject: "Determination regarding Claim #CH-9900",
        text: "Please find attached formal Explanation of Benefits.",
        attachments: [
          {
            attachment_id: "att_eob_1",
            filename: "Explanation-of-Benefits-CH-9900.pdf",
            content_type: "application/pdf",
            size: mockPdfBytes.byteLength,
          },
        ],
      });

      vi.spyOn(agentMailLib, "downloadAgentMailAttachment").mockResolvedValue({
        buffer: mockPdfBytes,
        contentType: "application/pdf",
        filename: "Explanation-of-Benefits-CH-9900.pdf",
        size: mockPdfBytes.byteLength,
      });

      const mockStructuredCompletion = vi.spyOn(openaiLib, "createStructuredCompletion").mockResolvedValue({
        determination: "OVERTURNED_APPROVED",
        clinicalRationale: "Review of operative notes confirmed medical necessity; adverse determination overturned.",
        missingRecordsRequested: [],
        authorizedSettlementAmount: 32000,
        reviewerName: "Dr. Evelyn Vance, MD",
        shouldAutoReply: false,
        suggestedAutoReplyAddendum: "",
      });

      const mockCtx: any = {
        runQuery: vi.fn().mockImplementation((fn: any, args: any) => {
          if (args && "agentMailMessageId" in args) return false;
          return {
            _id: "claim_inbound_eob",
            claimNumber: "CH-9900",
            patientName: "David Miller",
            insurancePayer: "Aetna",
            deniedAmount: 32000,
          };
        }),
        runMutation: vi.fn().mockImplementation((fn: any) => {
          if (fn === internal.emails.getOrCreateThreadInternal) return "thread_inbound_1";
          if (fn === internal.emails.insertInboundMessageInternal) return { messageId: "msg_db_inbound_1", isNew: true };
          return null;
        }),
        storage: {
          store: vi.fn().mockResolvedValue("storage_inbound_eob_pdf"),
        },
      };

      await (processInboundClaimReply as any)._handler(mockCtx, {
        inboxId: "inbox_adjudicator",
        messageId: "msg_inbound_eob",
        eventId: "evt_inbound_1",
      });

      // Assert attachment was downloaded
      expect(agentMailLib.downloadAgentMailAttachment).toHaveBeenCalledWith(
        expect.objectContaining({
          inboxId: "inbox_adjudicator",
          messageId: "msg_inbound_eob",
          attachmentId: "att_eob_1",
        })
      );

      // Assert attachment was stored in Convex Storage
      expect(mockCtx.storage.store).toHaveBeenCalled();

      // Assert multimodal structured completion was called with PDF file inputs
      expect(mockStructuredCompletion).toHaveBeenCalledWith(
        expect.objectContaining({
          fileInputs: [
            {
              fileData: `data:application/pdf;base64,${mockPdfBytes.toString("base64")}`,
              filename: "Explanation-of-Benefits-CH-9900.pdf",
            },
          ],
        })
      );

      // Assert stored message analysis was updated with attachments and authorized settlement amount
      expect(mockCtx.runMutation).toHaveBeenCalledWith(
        internal.emails.updateMessageAnalysisInternal,
        expect.objectContaining({
          detectedDetermination: "OVERTURNED_APPROVED",
          settlementAmount: 32000,
          attachments: [
            {
              storageId: "storage_inbound_eob_pdf",
              filename: "Explanation-of-Benefits-CH-9900.pdf",
              contentType: "application/pdf",
              size: mockPdfBytes.byteLength,
            },
          ],
        })
      );

      // Assert claim was updated to won with settlement details
      expect(mockCtx.runMutation).toHaveBeenCalledWith(
        internal.claims.updateStatusInternal,
        expect.objectContaining({
          claimId: "claim_inbound_eob",
          status: "won",
        })
      );

      // Assert audit log event was recorded
      expect(mockCtx.runMutation).toHaveBeenCalledWith(
        internal.auditLogs.logEventInternal,
        expect.objectContaining({
          claimId: "claim_inbound_eob",
          eventType: "inbound_attachment_processed",
        })
      );
    });
  });

  describe("Thread Query Signed URL Resolution (convex/emails)", () => {
    it("getThreadWithMessages resolves signed storage URLs for attached files", async () => {
      const mockCtx: any = {
        db: {
          get: vi.fn().mockImplementation((id: string) => {
            if (id === "thread_with_att") {
              return { _id: "thread_with_att", claimId: "claim_att_1" };
            }
            if (id === "claim_att_1") {
              return { _id: "claim_att_1", userId: "user_test" };
            }
            return null;
          }),
          query: vi.fn().mockReturnValue({
            withIndex: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                collect: vi.fn().mockResolvedValue([
                  {
                    _id: "msg_1",
                    threadId: "thread_with_att",
                    hasAttachments: true,
                    attachments: [
                      {
                        storageId: "storage_pdf_1",
                        filename: "Formal-Appeal-CH-1122.pdf",
                        contentType: "application/pdf",
                        size: 20480,
                      },
                    ],
                  },
                ]),
              }),
            }),
          }),
        },
        storage: {
          getUrl: vi.fn().mockResolvedValue("https://signed.storage.convex.cloud/storage_pdf_1"),
        },
      };

      vi.spyOn(authLib, "getClaimIfAuthorized").mockResolvedValue({
        _id: "claim_att_1" as any,
        userId: "user_test" as any,
      } as any);

      const result = await (emailsModule.getThreadWithMessages as any)._handler(mockCtx, {
        threadId: "thread_with_att",
      });

      expect(result).not.toBeNull();
      expect(result.messages.length).toBe(1);
      expect(result.messages[0].attachments[0].url).toBe("https://signed.storage.convex.cloud/storage_pdf_1");
      expect(mockCtx.storage.getUrl).toHaveBeenCalledWith("storage_pdf_1");
    });
  });
});
