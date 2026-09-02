import { describe, it, expect, vi, beforeEach } from "vitest";
import * as actionClinicalIntake from "../convex/actions/clinicalIntake";
import * as actionOpticalParser from "../convex/actions/opticalParser";
import * as actionPayerContactResolver from "../convex/actions/payerContactResolver";
import * as libOpenAI from "../convex/lib/openai";
import { rateLimiter } from "../convex/lib/rateLimiter";

describe("Convex Actions: Clinical Intake, Optical Parser & Payer Contact Resolver", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
  });

  describe("convex/actions/payerContactResolver", () => {
    it("resolvePayerGateway: matches preset payer directory", async () => {
      const mockClaim = {
        _id: "c1",
        claimNumber: "CLM-100",
        patient: { insurancePayer: "UnitedHealthcare", state: "CA" },
      };
      const mockCtx: any = {
        runQuery: vi.fn().mockResolvedValue(mockClaim),
        runMutation: vi.fn().mockResolvedValue(undefined),
      };

      const res = await (actionPayerContactResolver.resolvePayerGateway as any)._handler(mockCtx, {
        claimId: "c1",
        payerName: "UnitedHealthcare",
      });

      expect(res.portalName).toContain("UHC");
      expect(res.isVerified).toBe(true);
      expect(res.source).toBe("preset");
      expect(mockCtx.runMutation).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
        claimId: "c1",
        payerContact: expect.objectContaining({
          isVerified: true,
        }),
      }));
    });

    it("resolvePayerGateway: performs web search fallback when payer is unfamiliar", async () => {
      const mockClaim = {
        _id: "c2",
        claimNumber: "CLM-200",
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
      } as any);

      const res = await (actionPayerContactResolver.resolvePayerGateway as any)._handler(mockCtx, {
        claimId: "c2",
        payerName: "Obscure Regional Health Plan",
        forceWebSearch: true,
      });

      expect(res.officialAppealsEmail).toBe("appeals@custompayer.org");
      expect(res.source).toBe("firecrawl_live");
    });
  });
});
