import { describe, it, expect, vi, beforeEach } from "vitest";
import * as actionPrecedentArchive from "../convex/actions/precedentArchive";
import * as actionPrecedentMatcher from "../convex/actions/precedentMatcher";
import * as actionSentinelPipeline from "../convex/actions/sentinelPipeline";
import * as libOpenAI from "../convex/lib/openai";
import { rateLimiter } from "../convex/lib/rateLimiter";
// @ts-ignore getAuthUserId is injected by vi.mock("@convex-dev/auth/server")
import { getAuthUserId } from "@convex-dev/auth/server";

vi.mock("@convex-dev/auth/server", () => ({
  getAuthUserId: vi.fn(),
}));

describe("Convex Actions: Precedent Archive, Matcher & Autonomous Pipeline", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getAuthUserId).mockResolvedValue("user_123" as any);
  });

  describe("convex/actions/precedentArchive", () => {
    it("indexWonAppeal: indexes a won appeal and computes vector embedding", async () => {
      const mockClaim = {
        _id: "c1",
        claimNumber: "CLM-WON-1",
        patient: { insurancePayer: "UnitedHealthcare", state: "CA" },
        cptCodes: ["63047"],
        icd10Codes: ["M51.16"],
        denialReasonCode: "CO-50",
        denialReasonDescription: "Not medically necessary",
      };
      const mockAppeal = {
        _id: "a1",
        medicalNecessityArguments: "Patient had failed conservative therapy for 12 weeks with neurological deficit.",
        legalCitations: "29 U.S.C. § 1133; 29 CFR § 2560.503-1(h)(2)(iv)",
        executiveSummary: "Appeal requesting full reimbursement for decompressive laminectomy.",
        fullAppealMarkdown: "# Full Appeal Markdown",
      };

      vi.spyOn(libOpenAI, "createEmbedding").mockResolvedValue(new Array(1536).fill(0.1));

      let queryCalls = 0;
      const mockCtx: any = {
        runQuery: vi.fn().mockImplementation(() => {
          queryCalls++;
          if (queryCalls === 1) return Promise.resolve(null);
          if (queryCalls === 2) return Promise.resolve(mockClaim);
          return Promise.resolve(mockAppeal);
        }),
        runMutation: vi.fn().mockResolvedValue("prec_new_1"),
      };

      const res = await (actionPrecedentArchive.indexWonAppeal as any)._handler(mockCtx, {
        claimId: "c1",
      });

      expect(res).toBe("prec_new_1");
      expect(mockCtx.runMutation).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
        title: expect.stringContaining("Winning brief"),
      }));
    });

    it("seedArchive: upserts the initial precedent corpus", async () => {
      vi.spyOn(libOpenAI, "createEmbedding").mockResolvedValue(new Array(1536).fill(0.2));

      const mockCtx: any = {
        runQuery: vi.fn().mockResolvedValue(null),
        runMutation: vi.fn().mockResolvedValue("prec_id"),
      };

      const res = await (actionPrecedentArchive.seedArchive as any)._handler(mockCtx, {});
      expect(res.upserted).toBeGreaterThan(0);
      expect(mockCtx.runMutation).toHaveBeenCalled();
    });

    it("reindexArchive: batches precedent embedding reindex and cascades continuation via scheduler", async () => {
      vi.spyOn(libOpenAI, "createEmbedding").mockResolvedValue(new Array(1536).fill(0.1));

      const mockPrecedents = [
        {
          _id: "p1",
          sourceKind: "winning_brief",
          title: "Precedent 1",
          citation: "Cit 1",
          winningArgument: "Arg 1",
          statutoryLanguage: "Stat 1",
          outcome: "Overturned",
          icd10Codes: ["M51.16"],
          cptCodes: ["63047"],
          carcCodes: ["CO-50"],
        },
        {
          _id: "p2",
          sourceKind: "court_overturn",
          title: "Precedent 2",
          citation: "Cit 2",
          winningArgument: "Arg 2",
          statutoryLanguage: "Stat 2",
          outcome: "Overturned",
          icd10Codes: ["M51.16"],
          cptCodes: ["63047"],
          carcCodes: ["CO-50"],
        },
      ];

      const mockCtx: any = {
        runQuery: vi.fn().mockResolvedValue({
          page: mockPrecedents,
          isDone: false,
          continueCursor: "cursor_next",
        }),
        runMutation: vi.fn().mockResolvedValue(null),
        scheduler: {
          runAfter: vi.fn().mockResolvedValue(undefined),
        },
      };

      const res = await (actionPrecedentArchive.reindexArchive as any)._handler(mockCtx, {
        cursor: null,
        batchSize: 50,
      });

      expect(res.isDone).toBe(false);
      expect(res.continueCursor).toBe("cursor_next");
      expect(res.batchProcessed).toBe(2);
      expect(res.reindexed).toBe(2);
      expect(res.totalReindexed).toBe(2);
      expect(mockCtx.runMutation).toHaveBeenCalledTimes(2);
      expect(mockCtx.scheduler.runAfter).toHaveBeenCalledWith(
        0,
        expect.anything(),
        {
          cursor: "cursor_next",
          batchSize: 50,
          totalReindexed: 2,
        }
      );
    });

    it("reindexArchiveBatch: handles scheduled continuation and marks completion when isDone is true", async () => {
      vi.spyOn(libOpenAI, "createEmbedding").mockResolvedValue(new Array(1536).fill(0.1));

      const mockPrecedents = [
        {
          _id: "p3",
          sourceKind: "statutory_authority",
          title: "Precedent 3",
          citation: "Cit 3",
          winningArgument: "Arg 3",
          statutoryLanguage: "Stat 3",
          outcome: "Affirmed",
          icd10Codes: ["M54.5"],
          cptCodes: ["99214"],
          carcCodes: ["CO-50"],
        },
      ];

      const mockCtx: any = {
        runQuery: vi.fn().mockResolvedValue({
          page: mockPrecedents,
          isDone: true,
          continueCursor: null,
        }),
        runMutation: vi.fn().mockResolvedValue(null),
        scheduler: {
          runAfter: vi.fn().mockResolvedValue(undefined),
        },
      };

      const res = await (actionPrecedentArchive.reindexArchiveBatch as any)._handler(mockCtx, {
        cursor: "cursor_next",
        batchSize: 50,
        totalReindexed: 2,
      });

      expect(res.isDone).toBe(true);
      expect(res.continueCursor).toBeNull();
      expect(res.batchProcessed).toBe(1);
      expect(res.reindexed).toBe(1);
      expect(res.totalReindexed).toBe(3);
      expect(mockCtx.scheduler.runAfter).not.toHaveBeenCalled();
    });

    it("hybridSearchPrecedents: filters search results by sourceKind when provided", async () => {
      vi.spyOn(libOpenAI, "createEmbedding").mockResolvedValue(new Array(1536).fill(0.1));
      vi.spyOn(rateLimiter, "limit").mockResolvedValue({ ok: true } as any);

      const courtDoc = {
        _id: "p_court",
        sourceKind: "court_overturn",
        title: "Wit v. United Behavioral Health",
        citation: "2019 WL 1033730",
        winningArgument: "Breached fiduciary duty by adopting excessively restrictive guidelines",
        outcome: "Overturned",
        icd10Codes: ["F32.9"],
        cptCodes: ["90837"],
        carcCodes: ["CO-50"],
      };
      const statutoryDoc = {
        _id: "p_statute",
        sourceKind: "statutory_authority",
        title: "29 U.S.C. 1133",
        citation: "ERISA § 503",
        winningArgument: "Full and fair review requirement violated",
        outcome: "Mandate",
        icd10Codes: ["M51.16"],
        cptCodes: ["63047"],
        carcCodes: ["CO-50"],
      };

      const mockCtx: any = {
        vectorSearch: vi.fn().mockResolvedValue([
          { _id: "p_court", _score: 0.9 },
        ]),
        runQuery: vi.fn().mockImplementation((_queryRef, args) => {
          if (args?.ids) return Promise.resolve([courtDoc]);
          if (args?.sourceKind === "court_overturn") return Promise.resolve([courtDoc]);
          return Promise.resolve([courtDoc, statutoryDoc]);
        }),
      };

      const res = await (actionPrecedentArchive.hybridSearchPrecedents as any)._handler(mockCtx, {
        query: "fiduciary duty guidelines",
        sourceKind: "court_overturn",
      });

      expect(mockCtx.vectorSearch).toHaveBeenCalledWith("precedents", "by_embedding", expect.objectContaining({
        filter: expect.any(Function),
      }));
      expect(mockCtx.runQuery).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
        sourceKind: "court_overturn",
      }));
      expect(res.every((r: any) => r.sourceKind === "court_overturn")).toBe(true);
    });
  });

  describe("convex/actions/precedentMatcher", () => {
    it("computeOverturnScore: calculates 4-pillar score and updates claim status", async () => {
      const mockClaim = {
        _id: "c1",
        claimNumber: "CLM-100",
        userId: "user_123",
        cptCodes: ["63047"],
        icd10Codes: ["M51.1"],
        denialReasonCode: "CO-50",
        denialReasonDescription: "Not medically necessary",
        deniedAmount: 18450,
        patientOwedAmount: 18450,
      };

      const mockEvidences = [
        {
          _id: "ev1",
          sourceType: "payer_cpb",
          title: "CPB 0016",
          citationClause: "Section 3.B",
          extractedEvidenceMarkdown: "Conservative therapy completed for 12 weeks with MRI documented neural compression.",
          relevanceScore: 95,
        },
      ];

      vi.spyOn(libOpenAI, "createStructuredCompletion").mockResolvedValue({
        keyPolicyContradictions: ["CPB criteria satisfied"],
        winningPrecedentSummary: "Binding precedent supports reversal",
        suggestedAppealLevel: "level_1_internal",
        policyAlignmentRationale: "Strong policy alignment",
        clinicalDocumentationRationale: "Complete documentation",
        statutoryErisaRationale: "ERISA violation present",
        precedentStrengthRationale: "Direct case precedent",
      } as any);

      let qCall = 0;
      const mockCtx: any = {
        runQuery: vi.fn().mockImplementation(() => {
          qCall++;
          if (qCall === 1) return Promise.resolve(mockClaim);
          return Promise.resolve(mockEvidences);
        }),
        runMutation: vi.fn().mockResolvedValue(undefined),
      };

      const res = await (actionPrecedentMatcher.computeOverturnScore as any)._handler(mockCtx, {
        claimId: "c1",
      });

      expect(res.overturnProbabilityScore).toBeGreaterThanOrEqual(5);
      expect(res.scoringBreakdown).toHaveLength(4);
      expect(mockCtx.runMutation).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
        status: "precedent_matched",
      }));
    });

    it("calculateDeterministicRubric: scales ERISA and precedent scores down on zero evidence", () => {
      const claim = {
        cptCodes: ["99214"],
        denialReasonCode: "CO-50",
        denialReasonDescription: "Not medically necessary",
      };
      const zeroEvidences: any[] = [];

      const result = actionPrecedentMatcher.calculateDeterministicRubric(claim, zeroEvidences);

      expect(result.riskLevel).toBe("complex_litigation");
      expect(result.overturnProbabilityScore).toBeLessThan(55);

      const erisaCriterion = result.scoringBreakdown.find((c) => c.category === "statutory_erisa");
      const precedentCriterion = result.scoringBreakdown.find((c) => c.category === "precedent_strength");
      const policyCriterion = result.scoringBreakdown.find((c) => c.category === "policy_alignment");
      const clinicalCriterion = result.scoringBreakdown.find((c) => c.category === "clinical_documentation");

      expect(erisaCriterion?.score).toBe(4);
      expect(erisaCriterion?.status).toBe("weak");
      expect(precedentCriterion?.score).toBe(4);
      expect(precedentCriterion?.status).toBe("weak");
      expect(policyCriterion?.score).toBe(8);
      expect(clinicalCriterion?.score).toBe(5);
      expect(result.overturnProbabilityScore).toBe(21);
    });

    it("calculateDeterministicRubric: yields moderate score on single non-CPB evidence", () => {
      const claim = {
        cptCodes: ["99214"],
        denialReasonCode: "CO-50",
        denialReasonDescription: "Not medically necessary",
      };
      const singleEvidence = [
        {
          sourceType: "pubmed_study",
          citationClause: "PMID 3829102",
          extractedEvidenceMarkdown: "Clinical trial demonstrates efficacy",
        },
      ];

      const result = actionPrecedentMatcher.calculateDeterministicRubric(claim, singleEvidence);

      expect(result.riskLevel).toBe("moderate");
      expect(result.overturnProbabilityScore).toBeGreaterThanOrEqual(55);
      expect(result.overturnProbabilityScore).toBeLessThan(80);

      const erisaCriterion = result.scoringBreakdown.find((c) => c.category === "statutory_erisa");
      const precedentCriterion = result.scoringBreakdown.find((c) => c.category === "precedent_strength");

      expect(erisaCriterion?.score).toBe(12);
      expect(erisaCriterion?.status).toBe("moderate");
      expect(precedentCriterion?.score).toBe(12);
      expect(precedentCriterion?.status).toBe("moderate");
    });

    it("calculateDeterministicRubric: awards high confidence when CPB and precedents are robustly indexed", () => {
      const claim = {
        cptCodes: ["63047"],
        denialReasonCode: "CO-50",
        denialReasonDescription: "Not medically necessary",
      };
      const robustEvidences = [
        {
          sourceType: "payer_cpb",
          citationClause: "Section 3.A",
          extractedEvidenceMarkdown: "Laminectomy indication satisfied",
        },
        {
          sourceType: "legal_precedent",
          citationClause: "IMR 2024-11",
          extractedEvidenceMarkdown: "Overturned upon objective imaging submission",
        },
        {
          sourceType: "pubmed_study",
          citationClause: "Spine J. 2023",
          extractedEvidenceMarkdown: "Decompression efficacy confirmed",
        },
      ];

      const result = actionPrecedentMatcher.calculateDeterministicRubric(claim, robustEvidences);

      expect(result.riskLevel).toBe("high_confidence");
      expect(result.overturnProbabilityScore).toBeGreaterThanOrEqual(80);

      const erisaCriterion = result.scoringBreakdown.find((c) => c.category === "statutory_erisa");
      const precedentCriterion = result.scoringBreakdown.find((c) => c.category === "precedent_strength");

      expect(erisaCriterion?.score).toBe(19);
      expect(erisaCriterion?.status).toBe("strong");
      expect(precedentCriterion?.score).toBe(19);
      expect(precedentCriterion?.status).toBe("strong");
    });
  });

  describe("convex/actions/sentinelPipeline", () => {
    it("runAutonomousPipeline: throws error if sender details are missing", async () => {
      vi.mocked(getAuthUserId).mockResolvedValue("user_123" as any);
      vi.spyOn(rateLimiter, "limit").mockResolvedValue({ ok: true } as any);

      const mockClaim = {
        _id: "c1",
        userId: "user_123",
        claimNumber: "CLM-AUTO-1",
        patient: { name: "Marcus Holloway", insurancePayer: "UnitedHealthcare", state: "CA" },
      };

      const mockCtx: any = {
        runQuery: vi.fn().mockResolvedValue(mockClaim),
        runAction: vi.fn(),
        runMutation: vi.fn(),
      };

      await expect(
        (actionSentinelPipeline.runAutonomousPipeline as any)._handler(mockCtx, {
          claimId: "c1",
        })
      ).rejects.toThrow("Complete sender details before drafting");
    });

    it("runAutonomousPipeline: orchestrates the entire autonomous claim workflow", async () => {
      vi.mocked(getAuthUserId).mockResolvedValue("user_123" as any);
      vi.spyOn(rateLimiter, "limit").mockResolvedValue({ ok: true } as any);

      const mockClaim = {
        _id: "c1",
        userId: "user_123",
        claimNumber: "CLM-AUTO-1",
        patient: { name: "Marcus Holloway", insurancePayer: "UnitedHealthcare", state: "CA" },
        cptCodes: ["63047"],
        icd10Codes: ["M51.16"],
        denialReasonCode: "CO-50",
        denialReasonDescription: "Medical necessity criteria not satisfied",
        deniedAmount: 18450,
        appealContext: {
          sender: {
            name: "Dr. Gregory House, MD",
            credentials: "MD, Board Certified Neurologist",
            email: "ghouse@princetonplainsboro.edu",
          },
        },
      };

      const mockCtx: any = {
        runQuery: vi.fn().mockResolvedValue(mockClaim),
        runAction: vi.fn().mockImplementation((fn) => {
          return Promise.resolve({ success: true, count: 3, appealId: "app_1", scriptId: "sc_1" });
        }),
        runMutation: vi.fn().mockResolvedValue(undefined),
      };

      const res = await (actionSentinelPipeline.runAutonomousPipeline as any)._handler(mockCtx, {
        claimId: "c1",
      });

      expect(res.success).toBe(true);
      expect(mockCtx.runAction).toHaveBeenCalled();
    });
  });
});
