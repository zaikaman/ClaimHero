import { describe, it, expect, vi, beforeEach } from "vitest";
import * as actionClinicalIntake from "../convex/actions/clinicalIntake";
import * as actionOpticalParser from "../convex/actions/opticalParser";
import * as actionPayerContactResolver from "../convex/actions/payerContactResolver";
import * as libOpenAI from "../convex/lib/openai";
import { rateLimiter } from "../convex/lib/rateLimiter";
// @ts-ignore getAuthUserId is injected by vi.mock("@convex-dev/auth/server")
import { getAuthUserId } from "@convex-dev/auth/server";

vi.mock("@convex-dev/auth/server", () => ({
  getAuthUserId: vi.fn(),
}));

describe("Convex Actions: Clinical Intake, Optical Parser & Payer Contact Resolver", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getAuthUserId).mockResolvedValue("user_123" as any);
  });

  describe("convex/actions/clinicalIntake", () => {
    it("generateClinicalIntakeQuestions: generates structured non-leading questions", async () => {
      vi.spyOn(libOpenAI, "createStructuredCompletion").mockResolvedValue({
        questions: [
          {
            field: "symptomsAndFunctionalImpact",
            question: "What symptoms are documented?",
            whyItMatters: "Captures symptoms without inferring.",
          },
          {
            field: "examinationFindings",
            question: "What exam findings are present?",
            whyItMatters: "Captures findings.",
          },
          {
            field: "imagingAndDiagnostics",
            question: "What imaging reports exist?",
            whyItMatters: "Provides objective diagnostic proof.",
          },
          {
            field: "treatmentHistoryAndResponse",
            question: "What prior treatments were tried?",
            whyItMatters: "Captures conservative therapy history.",
          },
          {
            field: "otherDocumentedFacts",
            question: "Are there other documented facts?",
            whyItMatters: "Captures non-clinical authorization facts.",
          },
        ],
      } as any);

      const res = await (actionClinicalIntake.generateClinicalIntakeQuestions as any)._handler({}, {
        denialReasonCode: "CO-50",
        denialReasonDescription: "Not medically necessary",
        cptCodes: ["63047"],
        icd10Codes: ["M51.16"],
      });

      expect(res.questions).toHaveLength(5);
      expect(res.generatedBy).toBe("OpenAI");
    });

    it("generateClinicalIntakeQuestions: falls back to default questions on error", async () => {
      vi.spyOn(libOpenAI, "createStructuredCompletion").mockRejectedValue(new Error("LLM Rate Limit"));

      const res = await (actionClinicalIntake.generateClinicalIntakeQuestions as any)._handler({}, {
        denialReasonCode: "CO-50",
        denialReasonDescription: "Not medically necessary",
        cptCodes: ["63047"],
        icd10Codes: ["M51.16"],
      });

      expect(res.questions).toHaveLength(5);
      expect(res.generatedBy).toBe("ClaimHero intake safeguards");
    });
  });

  describe("convex/actions/opticalParser", () => {
    it("parseDenialDocument: parses raw document text and creates claim", async () => {
      vi.spyOn(rateLimiter, "limit").mockResolvedValue({ ok: true } as any);
      vi.spyOn(libOpenAI, "createStructuredCompletion").mockResolvedValue({
        isMedicalClaimDenial: true,
        documentClassificationReason: "Valid health insurance denial notice for lumbar decompression surgery.",
        claimNumber: "CLM-CA-888",
        patientName: "Alice Walker",
        memberId: "MEM-999",
        insurancePayer: "UnitedHealthcare",
        serviceDate: "2026-02-01",
        providerName: "Dr. Amanda Vance",
        deniedAmount: 12500,
        patientOwedAmount: 12500,
        cptCodes: ["63047"],
        icd10Codes: ["M51.16"],
        denialReasonCode: "CO-50",
        denialReasonDescription: "Medical necessity criteria not satisfied",
        appealFilingDeadlineDays: 180,
        payerAppealsEmail: "appeals@uhc.com",
        payerAppealsAddress: "PO Box 123",
      } as any);

      const mockCtx: any = {
        runMutation: vi.fn().mockResolvedValue("claim_created_123"),
        runAction: vi.fn().mockResolvedValue({ officialAppealsEmail: "appeals@uhc.com", isVerified: true }),
      };

      const res = await (actionOpticalParser.parseDenialDocument as any)._handler(mockCtx, {
        rawDocumentText: "Claim CLM-CA-888 denial letter text",
        patientState: "CA",
        patientEmail: "alice@example.com",
        autoRunPipeline: true,
      });

      expect(res.claimId).toBe("claim_created_123");
      expect(res.claimNumber).toBe("CLM-CA-888");
      expect(mockCtx.runMutation).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
        claimNumber: "CLM-CA-888",
        deniedAmount: 12500,
      }));
    });

    it("parseDenialDocument: rejects non-claim documents with informative classification error", async () => {
      vi.spyOn(rateLimiter, "limit").mockResolvedValue({ ok: true } as any);
      vi.spyOn(libOpenAI, "createStructuredCompletion").mockResolvedValue({
        isMedicalClaimDenial: false,
        documentClassificationReason: "The uploaded file is a photo of a domestic cat, not a medical claim denial letter or Explanation of Benefits.",
        claimNumber: "",
        patientName: "",
        memberId: "",
        insurancePayer: "",
        serviceDate: "",
        providerName: "",
        deniedAmount: 0,
        patientOwedAmount: 0,
        cptCodes: [],
        icd10Codes: [],
        denialReasonCode: "",
        denialReasonDescription: "",
        appealFilingDeadlineDays: 180,
        payerAppealsEmail: "",
        payerAppealsAddress: "",
      } as any);

      const mockCtx: any = {
        runMutation: vi.fn(),
        runAction: vi.fn(),
      };

      await expect(
        (actionOpticalParser.parseDenialDocument as any)._handler(mockCtx, {
          rawDocumentText: "Random photo or text",
          patientState: "CA",
        })
      ).rejects.toThrow(/Non-claim document detected/);

      expect(mockCtx.runMutation).not.toHaveBeenCalled();
    });

    it("parseDenialDocument: rejects document when all core claim signals are empty", async () => {
      vi.spyOn(rateLimiter, "limit").mockResolvedValue({ ok: true } as any);
      vi.spyOn(libOpenAI, "createStructuredCompletion").mockResolvedValue({
        isMedicalClaimDenial: true,
        documentClassificationReason: "Unclear document",
        claimNumber: "",
        patientName: "",
        memberId: "",
        insurancePayer: "",
        serviceDate: "",
        providerName: "",
        deniedAmount: 0,
        patientOwedAmount: 0,
        cptCodes: [],
        icd10Codes: [],
        denialReasonCode: "",
        denialReasonDescription: "",
        appealFilingDeadlineDays: 180,
        payerAppealsEmail: "",
        payerAppealsAddress: "",
      } as any);

      const mockCtx: any = {
        runMutation: vi.fn(),
        runAction: vi.fn(),
      };

      await expect(
        (actionOpticalParser.parseDenialDocument as any)._handler(mockCtx, {
          rawDocumentText: "Blank or unreadable document",
          patientState: "CA",
        })
      ).rejects.toThrow(/does not contain recognizable medical claim denial details/);

      expect(mockCtx.runMutation).not.toHaveBeenCalled();
    });

    it("parseDenialDocument: passes denialLetterStorageId to createWithPatientInternal on successful ingestion", async () => {
      vi.spyOn(rateLimiter, "limit").mockResolvedValue({ ok: true } as any);
      vi.spyOn(libOpenAI, "createStructuredCompletion").mockResolvedValue({
        isMedicalClaimDenial: true,
        claimNumber: "CLM-999",
        patientName: "Jane Doe",
        memberId: "MEM-123",
        insurancePayer: "Aetna",
        serviceDate: "2026-01-01",
        providerName: "General Hospital",
        deniedAmount: 5000,
        patientOwedAmount: 5000,
        cptCodes: ["99213"],
        icd10Codes: ["M54.5"],
        denialReasonCode: "CO-50",
        denialReasonDescription: "Not medically necessary",
        appealFilingDeadlineDays: 180,
      } as any);

      const mockCtx: any = {
        storage: {
          getUrl: vi.fn().mockResolvedValue("https://storage.test/file.txt"),
        },
        runMutation: vi.fn().mockResolvedValue("claim_new_id"),
        runAction: vi.fn().mockResolvedValue({}),
      };

      // Mock fetch for text file
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers({ "content-type": "text/plain", "content-length": "100" }),
        arrayBuffer: vi.fn().mockResolvedValue(new TextEncoder().encode("Medical denial text").buffer),
      } as any);

      const res = await (actionOpticalParser.parseDenialDocument as any)._handler(mockCtx, {
        storageId: "storage_file_123",
        patientEmail: "jane@test.org",
        patientState: "CA",
      });

      expect(res.claimId).toBe("claim_new_id");
      expect(mockCtx.runMutation).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          claimNumber: "CLM-999",
          denialLetterStorageId: "storage_file_123",
        })
      );
    });

    it("parseDenialDocument: cleans up uploaded storageId when document is rejected as non-claim", async () => {
      vi.spyOn(rateLimiter, "limit").mockResolvedValue({ ok: true } as any);
      vi.spyOn(libOpenAI, "createStructuredCompletion").mockResolvedValue({
        isMedicalClaimDenial: false,
        documentClassificationReason: "Image of a dog",
        claimNumber: "",
        patientName: "",
        memberId: "",
        insurancePayer: "",
        serviceDate: "",
        providerName: "",
        deniedAmount: 0,
        patientOwedAmount: 0,
        cptCodes: [],
        icd10Codes: [],
        denialReasonCode: "",
        denialReasonDescription: "",
        appealFilingDeadlineDays: 180,
      } as any);

      const mockCtx: any = {
        storage: {
          getUrl: vi.fn().mockResolvedValue("https://storage.test/file.txt"),
        },
        runMutation: vi.fn().mockResolvedValue(undefined),
        runAction: vi.fn(),
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers({ "content-type": "text/plain", "content-length": "50" }),
        arrayBuffer: vi.fn().mockResolvedValue(new TextEncoder().encode("Not a denial").buffer),
      } as any);

      await expect(
        (actionOpticalParser.parseDenialDocument as any)._handler(mockCtx, {
          storageId: "storage_leak_test_id",
          patientState: "CA",
        })
      ).rejects.toThrow(/Non-claim document detected/);

      // Verify that cleanupStorageFileInternal was called with the orphaned storageId
      expect(mockCtx.runMutation).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          storageId: "storage_leak_test_id",
        })
      );
    });
  });


  describe("convex/actions/payerContactResolver", () => {
    it("resolvePayerGateway: falls back to statutory registry when web crawl returns inconclusive results", async () => {
      const mockClaim = {
        _id: "c1",
        claimNumber: "CLM-100",
        userId: "user_123",
        patient: { insurancePayer: "UnitedHealthcare", state: "CA" },
      };
      const mockCtx: any = {
        runQuery: vi.fn().mockResolvedValue(mockClaim),
        runMutation: vi.fn().mockResolvedValue(undefined),
        runAction: vi.fn().mockResolvedValue({ web: [] }),
      };

      vi.spyOn(libOpenAI, "createStructuredCompletion").mockResolvedValue({
        officialAppealsEmail: "",
        intakePortalUrl: "",
        portalName: "",
        appealsFax: "",
        statutoryPoBox: "",
        ediPayerId: "",
        tollFreeHelpline: "",
        isVerified: false,
        submissionPolicyNote: "",
        source: "unresolved",
      } as any);

      const res = await (actionPayerContactResolver.resolvePayerGateway as any)._handler(mockCtx, {
        claimId: "c1",
        payerName: "UnitedHealthcare",
      });

      expect(res.isVerified).toBe(false);
      expect(res.source).toBe("unresolved");
      expect(res.intakePortalUrl).toBeUndefined();
      expect(res.appealsFax).toBeUndefined();
      expect(mockCtx.runMutation).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
        claimId: "c1",
        payerContact: expect.objectContaining({
          isVerified: false,
          source: "unresolved",
        }),
      }));
    });

    it("resolvePayerGateway: performs live Firecrawl discovery and AI extraction", async () => {
      const mockClaim = {
        _id: "c2",
        claimNumber: "CLM-200",
        userId: "user_123",
        patient: { insurancePayer: "Obscure Regional Health Plan", state: "TX" },
      };
      const mockCtx: any = {
        runQuery: vi.fn().mockResolvedValue(mockClaim),
        runMutation: vi.fn().mockResolvedValue(undefined),
        runAction: vi.fn().mockResolvedValue({ web: [{ title: "Appeals Portal", url: "https://custompayer.org/appeals", markdown: "Official Portal" }] }),
      };

      vi.spyOn(libOpenAI, "createStructuredCompletion").mockResolvedValue({
        officialAppealsEmail: "appeals@custompayer.org",
        intakePortalUrl: "https://custompayer.org/appeals",
        portalName: "Custom Payer Appeals Portal",
        appealsFax: "1-800-555-0199",
        statutoryPoBox: "PO Box 999",
        ediPayerId: "99999",
        tollFreeHelpline: "1-800-555-0100",
        isVerified: true,
        submissionPolicyNote: "Submit via portal or fax",
        source: "firecrawl_live",
      } as any);

      const res = await (actionPayerContactResolver.resolvePayerGateway as any)._handler(mockCtx, {
        claimId: "c2",
        payerName: "Obscure Regional Health Plan",
      });

      expect(res.officialAppealsEmail).toBe("appeals@custompayer.org");
      expect(res.source).toBe("firecrawl_live");
      expect(res.isVerified).toBe(true);
      expect(res.liveVerifiedAt).toBeDefined();
    });

    it("resolvePayerGateway: dynamically recovers claims email from live crawl evidence when LLM is hesitant", async () => {
      const mockClaim = {
        _id: "c2_geo",
        claimNumber: "CLM-201",
        userId: "user_123",
        patient: { insurancePayer: "GeoBlue", state: "PA" },
      };
      const mockCtx: any = {
        runQuery: vi.fn().mockResolvedValue(mockClaim),
        runMutation: vi.fn().mockResolvedValue(undefined),
        runAction: vi.fn().mockResolvedValue({
          web: [
            {
              title: "GeoBlue Claims & Appeals Information",
              url: "https://www.geo-blue.com/claims-disputes",
              markdown:
                "For claim submissions, dispute records, and appeals inquiries, members can email claims@geo-blue.com or fax to 610-482-9623. Customer care is also reached at customerservice@geo-blue.com.",
            },
          ],
        }),
      };

      vi.spyOn(libOpenAI, "createStructuredCompletion").mockResolvedValue({
        officialAppealsEmail: "", // LLM was hesitant and left email empty
        intakePortalUrl: "https://www.geo-blue.com/member-hub",
        portalName: "GeoBlue Member Hub",
        appealsFax: "610-482-9623",
        statutoryPoBox: "PO Box 21974, Eagan, MN 55121",
        ediPayerId: "60054",
        tollFreeHelpline: "1-844-713-7660",
        isVerified: true,
        submissionPolicyNote: "Submit via portal or fax",
        source: "firecrawl_live",
      } as any);

      const res = await (actionPayerContactResolver.resolvePayerGateway as any)._handler(mockCtx, {
        claimId: "c2_geo",
        payerName: "GeoBlue",
      });

      expect(res.officialAppealsEmail).toBe("claims@geo-blue.com");
      expect(res.source).toBe("firecrawl_live");
      expect(res.isVerified).toBe(true);
      expect(res.intakePortalUrl).toBe("https://www.geo-blue.com/member-hub");
      expect(res.appealsFax).toBe("610-482-9623");
    });

    it("resolvePayerGateway: returns unverified status without hardcoded fallbacks when live search fails", async () => {
      const mockClaim = {
        _id: "c1_unknown",
        claimNumber: "CLM-999",
        userId: "user_123",
        patient: { insurancePayer: "Unknown Regional Payer", state: "OH" },
      };
      const mockCtx: any = {
        runQuery: vi.fn().mockResolvedValue(mockClaim),
        runMutation: vi.fn().mockResolvedValue(undefined),
        runAction: vi.fn().mockResolvedValue({ web: [] }),
      };

      vi.spyOn(libOpenAI, "createStructuredCompletion").mockResolvedValue({
        officialAppealsEmail: "",
        intakePortalUrl: "",
        portalName: "",
        appealsFax: "",
        statutoryPoBox: "",
        ediPayerId: "",
        tollFreeHelpline: "",
        isVerified: false,
        submissionPolicyNote: "",
        source: "unresolved",
      } as any);

      const res = await (actionPayerContactResolver.resolvePayerGateway as any)._handler(mockCtx, {
        claimId: "c1_unknown",
        payerName: "Unknown Regional Payer",
      });

      expect(res.isVerified).toBe(false);
      expect(res.source).toBe("unresolved");
      expect(res.officialAppealsEmail).toBeUndefined();
      expect(res.intakePortalUrl).toBeUndefined();
      expect(res.appealsFax).toBeUndefined();
      expect(res.submissionPolicyNote).toContain("could not be verified automatically");
    });

    it("reverifyPayerContactForDispatch: executes live re-verification before dispatch and logs audit event", async () => {
      const mockClaim = {
        _id: "c3",
        claimNumber: "CLM-300",
        userId: "user_123",
        patient: { insurancePayer: "Molina Healthcare", state: "FL" },
      };
      const mockCtx: any = {
        runQuery: vi.fn().mockResolvedValue(mockClaim),
        runMutation: vi.fn().mockResolvedValue(undefined),
        runAction: vi.fn().mockResolvedValue({
          web: [{ title: "Molina Grievance", url: "https://molinahealthcare.com/appeals", markdown: "Direct Appeals Email: MFLGrievanceandAppealsDepartment@MolinaHealthcare.com" }],
        }),
      };

      vi.spyOn(libOpenAI, "createStructuredCompletion").mockResolvedValue({
        officialAppealsEmail: "MFLGrievanceandAppealsDepartment@MolinaHealthcare.com",
        intakePortalUrl: "https://member.molinahealthcare.com",
        portalName: "MyMolina Grievance Gateway",
        appealsFax: "1-877-508-5748",
        statutoryPoBox: "PO Box 521838",
        ediPayerId: "51062",
        tollFreeHelpline: "1-888-560-5716",
        isVerified: true,
        submissionPolicyNote: "Live verified email appeals accepted.",
        source: "firecrawl_live",
      } as any);

      const res = await (actionPayerContactResolver.reverifyPayerContactForDispatch as any)._handler(mockCtx, {
        claimId: "c3",
        intendedChannel: "email",
      });

      expect(res.isVerified).toBe(true);
      expect(res.officialAppealsEmail).toBe("MFLGrievanceandAppealsDepartment@MolinaHealthcare.com");
      expect(mockCtx.runMutation).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
        claimId: "c3",
        eventType: "payer_contact_reverified_for_dispatch",
      }));
    });
  });
});
