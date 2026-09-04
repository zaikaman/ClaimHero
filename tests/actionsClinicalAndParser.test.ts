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

      expect(res.portalName).toContain("UHC");
      expect(res.isVerified).toBe(true);
      expect(res.source).toBe("registry_fallback");
      expect(mockCtx.runMutation).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
        claimId: "c1",
        payerContact: expect.objectContaining({
          isVerified: true,
          source: "registry_fallback",
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
    });
  });
});
