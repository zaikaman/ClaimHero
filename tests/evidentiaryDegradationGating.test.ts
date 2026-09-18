import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  calculateDeterministicRubric,
  isStatutoryBaselineEvidence,
} from "../convex/actions/precedentMatcher";
import { ERISA_STATUTORY_EVIDENCE } from "../convex/lib/erisaEvidence";
import * as claimsModule from "../convex/claims";
import * as appealsModule from "../convex/appeals";
import { executeDurableClaimPipeline } from "../convex/workflows";

describe("Evidentiary Degradation & Provisional Review Gating", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("calculateDeterministicRubric: Permissive Fallback Prevention", () => {
    it("recognizes ERISA_STATUTORY_EVIDENCE as statutory baseline protocol", () => {
      expect(isStatutoryBaselineEvidence(ERISA_STATUTORY_EVIDENCE)).toBe(true);
      expect(
        isStatutoryBaselineEvidence({
          sourceType: "payer_cpb",
          citationClause: "Section 4.1",
          title: "Carelon Knee Guidelines",
        })
      ).toBe(false);
      expect(
        isStatutoryBaselineEvidence({
          sourceType: "pubmed_study",
          citationClause: "PMID 99281",
          title: "Randomized Trial",
        })
      ).toBe(false);
    });

    it("prevents score inflation when live crawl fails and inserts only fallback statutory evidence", () => {
      const claim = {
        cptCodes: ["29881"],
        denialReasonCode: "CO-50",
        denialReasonDescription: "Procedure not medically necessary",
      };
      const fallbackEvidence = [{ ...ERISA_STATUTORY_EVIDENCE }];

      const result = calculateDeterministicRubric(claim, fallbackEvidence, []);

      const policyCriterion = result.scoringBreakdown.find((c) => c.category === "policy_alignment");
      expect(policyCriterion?.score).toBe(8);
      expect(policyCriterion?.status).toBe("weak");
      expect(policyCriterion?.rationale).toContain("No published CPB");

      const clinicalCriterion = result.scoringBreakdown.find((c) => c.category === "clinical_documentation");
      expect(clinicalCriterion?.score).toBe(5);
      expect(clinicalCriterion?.status).toBe("weak");
      expect(clinicalCriterion?.rationale).toContain("No objective clinical documentation");

      const erisaCriterion = result.scoringBreakdown.find((c) => c.category === "statutory_erisa");
      expect(erisaCriterion?.score).toBe(4);
      expect(erisaCriterion?.status).toBe("weak");

      const precedentCriterion = result.scoringBreakdown.find((c) => c.category === "precedent_strength");
      expect(precedentCriterion?.score).toBe(4);
      expect(precedentCriterion?.status).toBe("weak");

      expect(result.scoreStatus).toBe("provisional_capped");
      expect(result.riskLevel).toBe("complex_litigation");
      expect(result.overturnProbabilityScore).toBe(21);
      expect(result.appealReadinessScore).toBe(21);
      expect(result.evidenceCoverageScore).toBe(21);
      expect(result.degradationWarnings).toBeDefined();
      expect(result.degradationWarnings?.[0]).toContain("CPB");
    });

    it("caps score and records warning when precedent vector archive is unreachable", () => {
      const claim = {
        cptCodes: ["63047"],
        denialReasonCode: "CO-50",
        denialReasonDescription: "Not medically necessary",
      };
      const evidences = [
        {
          sourceType: "payer_cpb",
          citationClause: "Section 3.A",
          extractedEvidenceMarkdown: "Decompression indication satisfied",
        },
        {
          sourceType: "pubmed_study",
          citationClause: "Spine J. 2023",
          extractedEvidenceMarkdown: "Clinical efficacy established",
        },
      ];

      const result = calculateDeterministicRubric(claim, evidences, [], {
        precedentsUnavailable: true,
      });

      expect(result.scoreStatus).toBe("provisional_capped");
      expect(result.riskLevel).toBe("complex_litigation");
      expect(result.overturnProbabilityScore).toBeLessThanOrEqual(40);

      const precedentCriterion = result.scoringBreakdown.find((c) => c.category === "precedent_strength");
      expect(precedentCriterion?.rationale).toContain("unavailable");
      expect(result.degradationWarnings).toContain(
        "Precedent vector retrieval was unavailable during evaluation; appellate documentation benchmark unverified."
      );
    });

    it("caps score and marks provisional_capped when dossier has zero evidence items", () => {
      const claim = {
        cptCodes: ["63047"],
        denialReasonCode: "CO-50",
        denialReasonDescription: "Not medically necessary",
      };

      const result = calculateDeterministicRubric(claim, [], []);

      expect(result.scoreStatus).toBe("provisional_capped");
      expect(result.overturnProbabilityScore).toBeLessThanOrEqual(40);
      expect(result.riskLevel).toBe("complex_litigation");
      expect(result.degradationWarnings.length).toBeGreaterThan(0);
      expect(result.degradationWarnings[0]).toContain("No insurer clinical policy bulletins (CPB)");
    });

    it("evaluates certified high confidence when CPB and precedents are fully verified", () => {
      const claim = {
        cptCodes: ["29881"],
        denialReasonCode: "CO-50",
        denialReasonDescription: "Not medically necessary",
      };
      const robustEvidences = [
        {
          sourceType: "payer_cpb",
          citationClause: "Section 2.1",
          extractedEvidenceMarkdown: "Knee arthroscopy covered for mechanical lock",
        },
        {
          sourceType: "pubmed_study",
          citationClause: "NEJM 2024",
          extractedEvidenceMarkdown: "Conservative failure verified",
        },
        {
          sourceType: "nccn_guideline",
          citationClause: "Section 4",
          extractedEvidenceMarkdown: "Diagnostic criteria met",
        },
      ];
      const matchedPrecedents = [
        {
          title: "Overturned Knee Meniscectomy Denial",
          citation: "Cal. IMR Case #MN-9921",
          outcome: "Overturned",
          vectorScore: 0.92,
          combinedScore: 0.94,
          carcCodes: ["CO-50"],
          cptCodes: ["29881"],
        },
      ];

      const result = calculateDeterministicRubric(claim, robustEvidences, matchedPrecedents);

      expect(result.scoreStatus).toBe("certified");
      expect(result.riskLevel).toBe("high_confidence");
      expect(result.overturnProbabilityScore).toBeGreaterThanOrEqual(80);
      expect(result.degradationWarnings).toHaveLength(0);
    });
  });

  describe("claims: acknowledgeEvidentiaryDegradation Mutation", () => {
    it("acknowledges evidentiary degradation and elevates claim from review_provisional to ready_for_review", async () => {
      const mockClaim = {
        _id: "claim_prov_1",
        userId: "user_advocate",
        status: "review_provisional",
        evidenceIntegrity: {
          cpbStatus: "fallback_statutory",
          precedentStatus: "none_found",
          scoreStatus: "provisional_capped",
          degradationWarnings: ["Crawl failed; statutory baseline applied."],
          requiresEvidentiaryAcknowledgement: true,
        },
      };

      const mockUser = {
        _id: "user_advocate",
        name: "Advocate Sarah Chen, BSN",
        email: "sarah@advocacy.org",
      };

      const patchMock = vi.fn().mockResolvedValue(undefined);
      const mockCtx: any = {
        db: {
          get: vi.fn().mockImplementation((id: string) => {
            if (id === "claim_prov_1") return Promise.resolve(mockClaim);
            if (id === "user_advocate") return Promise.resolve(mockUser);
            return Promise.resolve(null);
          }),
          patch: patchMock,
          insert: vi.fn().mockResolvedValue("log_1"),
          query: vi.fn().mockReturnValue({
            withIndex: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                first: vi.fn().mockResolvedValue(null),
                take: vi.fn().mockResolvedValue([]),
              }),
            }),
          }),
        },
        auth: {
          getUserIdentity: vi.fn().mockResolvedValue({ subject: "user_advocate" }),
        },
      };

      const res = await (claimsModule.acknowledgeEvidentiaryDegradation as any)._handler(mockCtx, {
        claimId: "claim_prov_1",
        acknowledgmentReason: "I confirm this appeal relies on ERISA statutory procedural standing.",
      });

      expect(res.success).toBe(true);
      expect(res.status).toBe("ready_for_review");

      expect(patchMock).toHaveBeenCalledWith(
        "claim_prov_1",
        expect.objectContaining({
          status: "ready_for_review",
          evidenceIntegrity: expect.objectContaining({
            requiresEvidentiaryAcknowledgement: false,
            acknowledgedBy: "Advocate Sarah Chen, BSN",
            acknowledgmentReason: "I confirm this appeal relies on ERISA statutory procedural standing.",
          }),
        })
      );
    });

    it("refuses acknowledgment when claim is not in review_provisional and has no pending acknowledgment", async () => {
      const mockClaim = {
        _id: "claim_dispatched_1",
        userId: "user_advocate",
        status: "dispatched",
        evidenceIntegrity: {
          requiresEvidentiaryAcknowledgement: false,
        },
      };

      const mockCtx: any = {
        db: {
          get: vi.fn().mockImplementation((id: string) => {
            if (id === "claim_dispatched_1") return Promise.resolve(mockClaim);
            return Promise.resolve({ _id: "user_advocate", name: "Advocate" });
          }),
        },
        auth: {
          getUserIdentity: vi.fn().mockResolvedValue({ subject: "user_advocate" }),
        },
      };

      await expect(
        (claimsModule.acknowledgeEvidentiaryDegradation as any)._handler(mockCtx, {
          claimId: "claim_dispatched_1",
        })
      ).rejects.toThrow(/Cannot acknowledge evidentiary degradation/);
    });
  });

  describe("appeals: Mandatory Human Review Gate Enforcement", () => {
    it("refuses approval when claim is in review_provisional status", async () => {
      const mockAppeal = {
        _id: "appeal_1",
        claimId: "claim_prov_2",
        version: 1,
      };
      const mockClaim = {
        _id: "claim_prov_2",
        userId: "user_advocate",
        status: "review_provisional",
      };

      const mockCtx: any = {
        db: {
          get: vi.fn().mockImplementation((id: string) => {
            if (id === "appeal_1") return Promise.resolve(mockAppeal);
            if (id === "claim_prov_2") return Promise.resolve(mockClaim);
            return Promise.resolve({ _id: "user_advocate", name: "Reviewer" });
          }),
        },
        auth: {
          getUserIdentity: vi.fn().mockResolvedValue({ subject: "user_advocate" }),
        },
      };

      await expect(
        (appealsModule.approveAppeal as any)._handler(mockCtx, {
          appealId: "appeal_1",
          notes: "Approved",
        })
      ).rejects.toThrow(/Cannot approve appeal: claim status is "review_provisional"/);
    });

    it("allows approval once claim reaches ready_for_review", async () => {
      const mockAppeal = {
        _id: "appeal_1",
        claimId: "claim_ready_1",
        version: 1,
      };
      const mockClaim = {
        _id: "claim_ready_1",
        userId: "user_advocate",
        status: "ready_for_review",
      };

      const patchMock = vi.fn().mockResolvedValue(undefined);
      const mockCtx: any = {
        db: {
          get: vi.fn().mockImplementation((id: string) => {
            if (id === "appeal_1") return Promise.resolve(mockAppeal);
            if (id === "claim_ready_1") return Promise.resolve(mockClaim);
            return Promise.resolve({ _id: "user_advocate", name: "Reviewer Taylor" });
          }),
          patch: patchMock,
          insert: vi.fn().mockResolvedValue("log_ok"),
          query: vi.fn().mockReturnValue({
            withIndex: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                first: vi.fn().mockResolvedValue(null),
              }),
            }),
          }),
        },
        auth: {
          getUserIdentity: vi.fn().mockResolvedValue({ subject: "user_advocate" }),
        },
      };

      const res = await (appealsModule.approveAppeal as any)._handler(mockCtx, {
        appealId: "appeal_1",
        notes: "Approved for transmission",
      });

      expect(res.success).toBe(true);
      expect(patchMock).toHaveBeenCalledWith(
        "claim_ready_1",
        expect.objectContaining({ isHumanApproved: true })
      );
    });
  });

  describe("executeDurableClaimPipeline: Durable Degradation Checkpoint", () => {
    it("checkpoints to review_provisional when live crawl fails", async () => {
      const mockClaim = {
        _id: "claim_pipe_1",
        userId: "user_test",
        claimNumber: "CLM-991",
        insurancePayer: "Anthem Blue Cross",
        cptCodes: ["29881"],
        icd10Codes: ["M17.11"],
        denialReasonCode: "CO-50",
        denialReasonDescription: "Not medically necessary",
        appealContext: {
          sender: { name: "Dr. Gregory House", email: "house@princeton.org" },
        },
      };

      const runMutationCalls: any[] = [];
      const step: any = {
        runQuery: vi.fn().mockImplementation((_, args) => {
          if (args.claimId) return Promise.resolve(mockClaim);
          return Promise.resolve([]);
        }),
        runMutation: vi.fn().mockImplementation((_, args) => {
          runMutationCalls.push(args);
          return Promise.resolve(null);
        }),
        runAction: vi.fn().mockImplementation((_fn, _args, opts) => {
          const actionName = opts?.name || "";
          if (actionName === "crawlInsurerPolicy") {
            throw new Error("Firecrawl scraper connection timeout");
          }
          if (actionName === "retrieveTopPrecedents") {
            return Promise.resolve([]);
          }
          if (actionName === "computeOverturnScore") {
            return Promise.resolve({
              overturnProbabilityScore: 36,
              riskLevel: "complex_litigation",
              scoringBreakdown: [],
            });
          }
          if (actionName === "generateAppealBrief") {
            return Promise.resolve({ appealId: "appeal_draft_1" });
          }
          return Promise.resolve({});
        }),
      };

      const result = await executeDurableClaimPipeline(step, {
        claimId: "claim_pipe_1" as any,
      });

      expect(result.success).toBe(true);
      expect(result.status).toBe("review_provisional");
      expect(result.cpbDegraded).toBe(true);
      expect(result.evidenceIntegrity?.scoreStatus).toBe("provisional_capped");
      expect(result.evidenceIntegrity?.requiresEvidentiaryAcknowledgement).toBe(true);

      const finalStatusUpdate = runMutationCalls.find(
        (call) => call.status === "review_provisional"
      );
      expect(finalStatusUpdate).toBeDefined();
      expect(finalStatusUpdate.evidenceIntegrity?.requiresEvidentiaryAcknowledgement).toBe(true);
    });

    it("checkpoints to review_provisional when precedent vector search fails", async () => {
      const mockClaim = {
        _id: "claim_pipe_2",
        userId: "user_test",
        claimNumber: "CLM-992",
        insurancePayer: "Cigna",
        cptCodes: ["63047"],
        icd10Codes: ["M51.16"],
        denialReasonCode: "CO-50",
        denialReasonDescription: "Not medically necessary",
        appealContext: {
          sender: { name: "Dr. Allison Cameron", email: "cameron@princeton.org" },
        },
      };

      const runMutationCalls: any[] = [];
      const step: any = {
        runQuery: vi.fn().mockImplementation((_, args) => {
          if (args.claimId) return Promise.resolve(mockClaim);
          return Promise.resolve([]);
        }),
        runMutation: vi.fn().mockImplementation((_, args) => {
          runMutationCalls.push(args);
          return Promise.resolve(null);
        }),
        runAction: vi.fn().mockImplementation((_fn, _args, opts) => {
          const actionName = opts?.name || "";
          if (actionName === "crawlInsurerPolicy") {
            return Promise.resolve({ policyTitle: "Verified CPB", clausesExtracted: 3 });
          }
          if (actionName === "retrieveTopPrecedents") {
            throw new Error("Convex Vector Index unreachable");
          }
          if (actionName === "computeOverturnScore") {
            return Promise.resolve({
              overturnProbabilityScore: 40,
              riskLevel: "complex_litigation",
              scoringBreakdown: [],
            });
          }
          if (actionName === "generateAppealBrief") {
            return Promise.resolve({ appealId: "appeal_draft_2" });
          }
          return Promise.resolve({});
        }),
      };

      const result = await executeDurableClaimPipeline(step, {
        claimId: "claim_pipe_2" as any,
      });

      expect(result.success).toBe(true);
      expect(result.status).toBe("review_provisional");
      expect(result.precedentsUnavailable).toBe(true);
      expect(result.evidenceIntegrity?.precedentStatus).toBe("archive_unavailable");
      expect(result.evidenceIntegrity?.requiresEvidentiaryAcknowledgement).toBe(true);
    });

    it("checkpoints directly to ready_for_review when both crawl and precedents succeed", async () => {
      const mockClaim = {
        _id: "claim_pipe_3",
        userId: "user_test",
        claimNumber: "CLM-993",
        insurancePayer: "Aetna",
        cptCodes: ["73721"],
        icd10Codes: ["M23.22"],
        denialReasonCode: "CO-16",
        denialReasonDescription: "Prior records required",
        appealContext: {
          sender: { name: "Dr. James Wilson", email: "wilson@princeton.org" },
        },
      };

      const runMutationCalls: any[] = [];
      const step: any = {
        runQuery: vi.fn().mockImplementation((_, args) => {
          if (args.claimId) return Promise.resolve(mockClaim);
          return Promise.resolve([]);
        }),
        runMutation: vi.fn().mockImplementation((_, args) => {
          runMutationCalls.push(args);
          return Promise.resolve(null);
        }),
        runAction: vi.fn().mockImplementation((_fn, _args, opts) => {
          const actionName = opts?.name || "";
          if (actionName === "crawlInsurerPolicy") {
            return Promise.resolve({ policyTitle: "Aetna CPB 0244", clausesExtracted: 4 });
          }
          if (actionName === "retrieveTopPrecedents") {
            return Promise.resolve([{ _id: "prec_1", outcome: "Overturned" }]);
          }
          if (actionName === "computeOverturnScore") {
            return Promise.resolve({
              overturnProbabilityScore: 92,
              riskLevel: "high_confidence",
              scoringBreakdown: [],
            });
          }
          if (actionName === "generateAppealBrief") {
            return Promise.resolve({ appealId: "appeal_draft_3" });
          }
          return Promise.resolve({});
        }),
      };

      const result = await executeDurableClaimPipeline(step, {
        claimId: "claim_pipe_3" as any,
      });

      expect(result.success).toBe(true);
      expect(result.status).toBe("ready_for_review");
      expect(result.evidenceIntegrity?.scoreStatus).toBe("certified");
      expect(result.evidenceIntegrity?.requiresEvidentiaryAcknowledgement).toBe(false);

      const finalStatusUpdate = runMutationCalls.find(
        (call) => call.status === "ready_for_review"
      );
      expect(finalStatusUpdate).toBeDefined();
    });
  });

  describe("Issue 21: Canonical Appeal Readiness, Evidence Coverage & Honest Floor", () => {
    it("ensures fallback statutory baseline hits the floor (21), not the 40 cap", () => {
      const claim = {
        cptCodes: ["29881"],
        denialReasonCode: "CO-50",
        denialReasonDescription: "Not medically necessary",
      };
      const fallbackEvidence = [{ ...ERISA_STATUTORY_EVIDENCE }];
      const result = calculateDeterministicRubric(claim, fallbackEvidence, []);

      // Pillar 3 should be 4 (unsubstantiated standing floor), not gifted 19
      const erisaCriterion = result.scoringBreakdown.find((c) => c.category === "statutory_erisa");
      expect(erisaCriterion?.score).toBe(4);
      expect(erisaCriterion?.status).toBe("weak");

      // Degraded dossier hits floor 21, not cap 40
      expect(result.appealReadinessScore).toBe(21);
      expect(result.evidenceCoverageScore).toBe(21);
      expect(result.overturnProbabilityScore).toBe(21);
      expect(result.scoreStatus).toBe("provisional_capped");
      expect(result.riskLevel).toBe("complex_litigation");
    });

    it("does not award CO-50 special-case forcing bonus when precedent lacks code match", () => {
      const claim = {
        cptCodes: ["29881"],
        denialReasonCode: "CO-50",
        denialReasonDescription: "Not medically necessary",
      };
      const evidences = [
        {
          sourceType: "payer_cpb",
          citationClause: "Sec 2",
          extractedEvidenceMarkdown: "Covered indication",
        },
      ];
      // Precedent matches vector similarity only, but has no CARC CO-50 and no CPT 29881
      const precedentWithoutCodeMatch = [
        {
          title: "Generic Appeal Ruling",
          outcome: "Overturned",
          vectorScore: 0.85,
          combinedScore: 0.85,
          carcCodes: ["CO-197"],
          cptCodes: ["99213"],
        },
      ];

      const result = calculateDeterministicRubric(claim, evidences, precedentWithoutCodeMatch);
      const precedentCriterion = result.scoringBreakdown.find((c) => c.category === "precedent_strength");

      // baseScore (12) + similarityBonus (3) + codeMatchBonus (0) = 15.
      // Must NOT be forced to 19 by old CO-50 special case!
      expect(precedentCriterion?.score).toBe(15);
    });

    it("calculates distinct appealReadinessScore and evidenceCoverageScore when degraded", () => {
      const claim = {
        cptCodes: ["29881"],
        denialReasonCode: "CO-16",
        denialReasonDescription: "Claim lacked information",
      };
      // Robust clinical docs and genuine legal precedent with raw sum > 40, but cpb is degraded
      const evidences = [
        {
          sourceType: "pubmed_study",
          citationClause: "Study 1",
          extractedEvidenceMarkdown: "Clinical efficacy verified",
        },
        {
          sourceType: "pubmed_study",
          citationClause: "Study 2",
          extractedEvidenceMarkdown: "Trial verified",
        },
        {
          sourceType: "legal_precedent",
          citationClause: "Court Ruling",
          extractedEvidenceMarkdown: "Overturned CO-16 denial",
        },
      ];

      const result = calculateDeterministicRubric(claim, evidences, [], {
        cpbDegraded: true,
      });

      expect(result.scoreStatus).toBe("provisional_capped");
      // Appeal readiness held at provisional cap (40)
      expect(result.appealReadinessScore).toBe(40);
      // Evidence coverage reflects true documentary completeness without the cap
      expect(result.evidenceCoverageScore).toBeGreaterThan(40);
      // overturnProbabilityScore follows appealReadinessScore for backward compatibility
      expect(result.overturnProbabilityScore).toBe(40);
    });
  });
});
