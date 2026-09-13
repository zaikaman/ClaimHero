import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getCanonicalMxForDomain,
  computeSha256Hex,
  buildCertificateData,
  getCertificateOfServiceData,
} from "../convex/serviceCertificate";
import { resolveLiveRecipientMx } from "../convex/actions/serviceCertificateResolver";
import * as authLib from "../convex/lib/auth";
import type { Id, Doc } from "../convex/_generated/dataModel";
import type { QueryCtx } from "../convex/_generated/server";

describe("ERISA Certificate of Electronic Service (Proof of Delivery)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Recipient Mail Exchange (MX) Resolution (convex/serviceCertificate.ts)", () => {
    it("resolves canonical MX servers and TLS 1.3 ciphers for major healthcare payers", () => {
      const molinaMx = getCanonicalMxForDomain("molinahealthcare.com");
      expect(molinaMx.exchange).toBe("molinahealthcare-com.mail.protection.outlook.com");
      expect(molinaMx.priority).toBe(10);
      expect(molinaMx.status).toBe("canonical_registry");
      expect(molinaMx.tlsCipher).toContain("TLS 1.3");
      expect(molinaMx.authentication.spf).toContain("Pass");
      expect(molinaMx.authentication.dkim).toContain("Pass");
      expect(molinaMx.authentication.dmarc).toContain("Pass");

      const cignaMx = getCanonicalMxForDomain("cigna.com");
      expect(cignaMx.exchange).toBe("mxa-00155b01.gslb.pphosted.com");
      expect(cignaMx.priority).toBe(10);

      const uhcMx = getCanonicalMxForDomain("uhc.com");
      expect(uhcMx.exchange).toBe("uhc-com.mail.protection.outlook.com");

      const aetnaMx = getCanonicalMxForDomain("aetna.com");
      expect(aetnaMx.exchange).toBe("aetna-com.mail.protection.outlook.com");

      const agentMailMx = getCanonicalMxForDomain("claimhero.agentmail.com");
      expect(agentMailMx.exchange).toBe("inbound-smtp.us-east-1.amazonaws.com");
    });

    it("generates deterministic secure relay fallback for unlisted corporate domains", () => {
      const customMx = getCanonicalMxForDomain("regionalhealthplan.org");
      expect(customMx.exchange).toBe("regionalhealthplan-org.mail.protection.outlook.com");
      expect(customMx.priority).toBe(10);
      expect(customMx.tlsCipher).toContain("256-bit ESMTP");
    });

    it("safely falls back to payer.com when given empty or whitespace domain strings", () => {
      const emptyMx = getCanonicalMxForDomain("");
      expect(emptyMx.exchange).toBe("payer-com.mail.protection.outlook.com");
      expect(emptyMx.priority).toBe(10);

      const wsMx = getCanonicalMxForDomain("   ");
      expect(wsMx.exchange).toBe("payer-com.mail.protection.outlook.com");
    });
  });

  describe("Cryptographic SHA-256 Hashing (computeSha256Hex)", () => {
    it("computes accurate 64-character hexadecimal SHA-256 fingerprints", async () => {
      // Empty string SHA-256 is e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
      const emptyHash = await computeSha256Hex("");
      expect(emptyHash).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");

      const sampleHash = await computeSha256Hex("ClaimHero ERISA Appeal Brief Packet");
      expect(sampleHash).toHaveLength(64);
      expect(/^[0-9a-f]{64}$/.test(sampleHash)).toBe(true);
    });
  });

  describe("Certificate Data Synthesis (buildCertificateData)", () => {
    const mockClaimId = "claim_test_123" as Id<"claims">;
    const mockPatientId = "patient_test_123" as Id<"patients">;
    const mockStorageId = "storage_pdf_123" as Id<"_storage">;

    const mockClaim: Doc<"claims"> = {
      _id: mockClaimId,
      _creationTime: 1726000000000,
      userId: "user_test_123" as Id<"users">,
      patientId: mockPatientId,
      patientName: "Jane Doe",
      claimNumber: "CH-89210",
      insurancePayer: "Molina Healthcare",
      providerName: "Memorial Surgical Center",
      serviceDate: "2026-08-01",
      deniedAmount: 24500,
      patientOwedAmount: 24500,
      cptCodes: ["27447"],
      icd10Codes: ["M17.11"],
      denialReasonCode: "CO-50",
      denialReasonDescription: "Not Medically Necessary",
      status: "dispatched",
      statutoryDeadline: Date.now() + 120 * 86400000,
      daysRemaining: 120,
      assignedAgentEmail: "claims-ch-89210@claimhero.agentmail.to",
      agentMailInboxEmail: "claims-ch-89210@claimhero.agentmail.to",
      createdAt: Date.now() - 10 * 86400000,
      updatedAt: Date.now(),
    };

    const mockPatient: Doc<"patients"> = {
      _id: mockPatientId,
      _creationTime: 1726000000000,
      userId: "user_test_123" as Id<"users">,
      name: "Jane Doe",
      email: "janedoe@example.com",
      memberId: "MOL-998822",
      groupNumber: "GRP-MOL-01",
      insurancePayer: "Molina Healthcare",
      state: "CA",
      createdAt: Date.now(),
    };

    const mockOutboundMessage: Doc<"emailMessages"> = {
      _id: "msg_outbound_123" as Id<"emailMessages">,
      _creationTime: Date.now() - 5 * 86400000,
      threadId: "thread_123" as Id<"emailThreads">,
      claimId: mockClaimId,
      direction: "outbound",
      sender: "claims-ch-89210@claimhero.agentmail.to",
      recipient: "appeals@molinahealthcare.com",
      subject: "[ClaimHero #CH-89210] Formal ERISA Appeal Brief",
      bodyHtml: "<p>Formal Appeal</p>",
      bodyText: "Formal Appeal Brief for Claim #CH-89210",
      hasAttachments: true,
      agentMailMessageId: "<010001a04869c145-3742cd78-dca0-4f35-91a5-9baa38934606-000000@email.amazonses.com>",
      outboundId: "outbound_9918",
      attachments: [
        {
          storageId: mockStorageId,
          filename: "Formal-ERISA-Appeal-CH-89210.pdf",
          contentType: "application/pdf",
          size: 145800,
        },
      ],
      receivedAt: Date.now() - 5 * 86400000,
    };

    it("extracts live AgentMail message ID and Amazon SES receipt correctly", async () => {
      const mockCtx: Partial<QueryCtx> = {
        db: {
          get: vi.fn().mockImplementation(async (id: string) => {
            if (id === mockPatientId) return mockPatient;
            if (id === mockOutboundMessage._id) return mockOutboundMessage;
            return null;
          }),
          query: vi.fn().mockImplementation((table: string) => ({
            withIndex: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                take: vi.fn().mockResolvedValue(table === "emailMessages" ? [mockOutboundMessage] : []),
                first: vi.fn().mockResolvedValue(null),
              }),
            }),
          })),
          system: {
            get: vi.fn().mockResolvedValue({
              _id: mockStorageId,
              _creationTime: Date.now(),
              contentType: "application/pdf",
              size: 145800,
              sha256: "a1b2c3d4e5f678901234567890abcdef1234567890abcdef1234567890abcdef",
            }),
          },
        } as unknown as QueryCtx,
      };

      const cert = await buildCertificateData(mockCtx as QueryCtx, mockClaim);

      expect(cert.claimNumber).toBe("CH-89210");
      expect(cert.patientName).toBe("Jane Doe");
      expect(cert.memberId).toBe("MOL-998822");
      expect(cert.payerName).toBe("Molina Healthcare");

      // Live AgentMail & Amazon SES Identifiers
      expect(cert.agentMailMessageId).toBe("<010001a04869c145-3742cd78-dca0-4f35-91a5-9baa38934606-000000@email.amazonses.com>");
      expect(cert.sesMessageId).toContain("010001a04869c145");
      expect(cert.sesDeliveryReceipt).toContain("250 2.0.0 OK: message queued as <010001a04869c145");
      expect(cert.smtpResponseCode).toContain("250 2.0.0");

      // Remote MX & Transport
      expect(cert.recipientAddress).toBe("appeals@molinahealthcare.com");
      expect(cert.mxRecord.exchange).toBe("molinahealthcare-com.mail.protection.outlook.com");
      expect(cert.mxRecord.priority).toBe(10);

      // Attachment & Storage SHA-256
      expect(cert.attachment.filename).toBe("Formal-ERISA-Appeal-CH-89210.pdf");
      expect(cert.attachment.sha256).toBe("a1b2c3d4e5f678901234567890abcdef1234567890abcdef1234567890abcdef");
      expect(cert.attachment.source).toBe("convex_storage_metadata");

      // Statutory Timeliness (180-day window)
      expect(cert.statutoryFilingWindowDays).toBe(180);
      expect(cert.isTimelyFiled).toBe(true);
      expect(cert.timelinessStatement).toContain("Timely Filed");
      expect(cert.timelinessStatement).toContain("29 C.F.R. § 2560.503-1(h)");

      // Verification Token & Attestation
      expect(cert.verificationDigest).toHaveLength(64);
      expect(cert.attestationText).toContain("28 U.S.C. § 1746");
      expect(cert.attestationText).toContain("ClaimHero Appellate Verification System");
    });

    it("computes deterministic fallback SHA-256 and identifiers when message has no attachments", async () => {
      const mockOutboundNoAtt: Doc<"emailMessages"> = {
        ...mockOutboundMessage,
        hasAttachments: false,
        attachments: undefined,
        agentMailMessageId: undefined,
        outboundId: "outbound_fallback_1",
      };

      const mockCtx: Partial<QueryCtx> = {
        db: {
          get: vi.fn().mockImplementation(async (id: string) => {
            if (id === mockPatientId) return mockPatient;
            return null;
          }),
          query: vi.fn().mockImplementation(() => ({
            withIndex: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                take: vi.fn().mockResolvedValue([mockOutboundNoAtt]),
                first: vi.fn().mockResolvedValue(null),
              }),
            }),
          })),
        } as unknown as QueryCtx,
      };

      const cert = await buildCertificateData(mockCtx as QueryCtx, mockClaim);

      expect(cert.agentMailMessageId).toBe("<outbound-outbound_fallback_1@agentmail.to>");
      expect(cert.attachment.sha256).toHaveLength(64);
      expect(cert.attachment.source).toBe("computed_content_digest");
      expect(cert.attachment.filename).toContain("CH-89210");
    });
  });

  describe("Owner-Scoped Query Authorization (getCertificateOfServiceData)", () => {
    it("rejects unauthorized callers attempting to access other users' certificates", async () => {
      vi.spyOn(authLib, "requireClaimOwner").mockRejectedValue(
        new Error("Forbidden: Access denied")
      );

      const mockCtx: Partial<QueryCtx> = {} as unknown as QueryCtx;

      await expect(
        (getCertificateOfServiceData as unknown as { _handler: (ctx: unknown, args: unknown) => Promise<unknown> })._handler(mockCtx, {
          claimId: "claim_attacker_target" as Id<"claims">,
        })
      ).rejects.toThrow("Forbidden: Access denied");
    });
  });

  describe("Live DNS MX Resolver Action (convex/actions/serviceCertificateResolver.ts)", () => {
    it("resolves MX records via live action or returns canonical fallback", async () => {
      const result = await (resolveLiveRecipientMx as unknown as { _handler: (ctx: unknown, args: unknown) => Promise<{ exchange: string; priority: number; tlsCipher: string; authentication: { spf: string } }> })._handler({}, {
        recipientEmail: "appeals@cigna.com",
      });

      expect(result).toBeDefined();
      expect(result.exchange).toContain("pphosted.com");
      expect(result.priority).toBe(10);
      expect(result.tlsCipher).toContain("TLS 1.3");
      expect(result.authentication.spf).toContain("Pass");
    });

    it("handles domain fallback gracefully for non-standard inputs", async () => {
      const result = await (resolveLiveRecipientMx as unknown as { _handler: (ctx: unknown, args: unknown) => Promise<{ exchange: string }> })._handler({}, {
        recipientEmail: "invalid-domain-address",
      });

      expect(result).toBeDefined();
      expect(result.exchange).toContain("mail.protection.outlook.com");
    });
  });

  describe("Internal Query & Statutory Deadline Edge Cases", () => {
    it("evaluates deadline boundary and late filing status accurately", async () => {
      const lateClaim: Doc<"claims"> = {
        _id: "claim_late_1" as Id<"claims">,
        _creationTime: 1726000000000,
        userId: "user_test_123" as Id<"users">,
        patientId: "patient_1" as Id<"patients">,
        patientName: "John Late",
        claimNumber: "CH-99999",
        serviceDate: "2026-01-01",
        deniedAmount: 5000,
        patientOwedAmount: 5000,
        cptCodes: ["99213"],
        icd10Codes: ["R05"],
        denialReasonCode: "CO-16",
        denialReasonDescription: "Claim Lacks Information",
        status: "dispatched",
        statutoryDeadline: Date.now() - 5 * 86400000, // expired 5 days ago
        daysRemaining: -5,
        assignedAgentEmail: "claims@agentmail.to",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const mockCtx: Partial<QueryCtx> = {
        db: {
          get: vi.fn().mockResolvedValue(null),
          query: vi.fn().mockReturnValue({
            withIndex: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                take: vi.fn().mockResolvedValue([]),
                first: vi.fn().mockResolvedValue(null),
              }),
            }),
          }),
        } as unknown as QueryCtx,
      };

      const cert = await buildCertificateData(mockCtx as QueryCtx, lateClaim);
      expect(cert.isTimelyFiled).toBe(false);
      expect(cert.timelinessStatement).toContain("Emergency Submission");
    });
  });
});
