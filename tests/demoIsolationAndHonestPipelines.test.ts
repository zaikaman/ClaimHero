import { describe, it, expect, vi } from "vitest";
import { DEMO_CASE_FIXTURES, SAMPLE_CASE_PRESETS } from "../src/lib/constants";
import { buildDossierData } from "../src/lib/dossierBuilder";
import { Claim, Appeal } from "../src/types";

describe("Demo Isolation, Provenance Attribution & Honest Evaluation Pipeline", () => {
  describe("Demo Fixtures Provenance & Safe Harbor Tagging", () => {
    it("tags all demo case fixtures with isDemo, demo-fixture origin, and isSyntheticPII flag", () => {
      expect(DEMO_CASE_FIXTURES.length).toBeGreaterThanOrEqual(3);
      for (const fixture of DEMO_CASE_FIXTURES) {
        expect(fixture.origin).toBe("demo-fixture");
        expect(fixture.isSyntheticPII).toBe(true);
        expect(fixture.isDemo).toBe(true);
        expect(fixture.content).toBeDefined();
        expect(fixture.title).toBeDefined();
        expect(fixture.cpt).toBeDefined();
        expect(fixture.carc).toBeDefined();
      }
    });

    it("maintains backward compatibility with SAMPLE_CASE_PRESETS alias", () => {
      expect(SAMPLE_CASE_PRESETS).toBe(DEMO_CASE_FIXTURES);
    });
  });

  describe("Physician Dossier Builder: Purged Hardcoded Fake PII", () => {
    it("uses provided sender NPI and phone rather than hardcoding fake numbers", () => {
      const mockClaim = {
        _id: "claim_real_1",
        patientId: "pat_1",
        claimNumber: "CLM-REAL-001",
        serviceDate: "2024-04-10",
        providerName: "Dr. Real Physician, MD",
        deniedAmount: 12500,
        patientOwedAmount: 12500,
        cptCodes: ["29881"],
        icd10Codes: ["M23.22"],
        denialReasonCode: "CO-50",
        denialReasonDescription: "Investigational procedure",
        status: "ready_for_review",
        statutoryDeadline: Date.now() + 86400000 * 30,
        daysRemaining: 30,
        assignedAgentEmail: "advocate@realpractice.org",
        appealContext: {
          sender: {
            name: "Dr. Real Physician, MD",
            credentials: "Board Certified Orthopedic Surgeon",
            email: "rphysician@realpractice.org",
            phone: "+1 (555) 789-0123",
            npiNumber: "1234567890",
          },
          clinicalFacts: {},
          confirmedAt: Date.now(),
        },
        patient: {
          _id: "pat_1",
          name: "Real Patient",
          email: "patient@example.com",
          memberId: "MEM-REAL-99",
          insurancePayer: "Aetna",
          state: "CA",
          createdAt: Date.now(),
        },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      } as unknown as Claim;

      const mockAppeal = {
        _id: "appeal_1",
        claimId: "claim_real_1",
        executiveSummary: "Summary",
        medicalNecessityArguments: "Arguments",
        policyCitations: [],
        statutoryRightsNotice: "Notice",
        fullAppealMarkdown: "Markdown",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      } as unknown as Appeal;

      const dossier = buildDossierData(mockClaim, mockAppeal, []);
      expect(dossier.physicianInfo.npiNumber).toBe("1234567890");
      expect(dossier.physicianInfo.phone).toBe("+1 (555) 789-0123");
      expect(dossier.physicianInfo.name).toBe("Dr. Real Physician, MD");
    });

    it("falls back cleanly to 'Not provided' when sender NPI and phone are absent", () => {
      const mockClaim = {
        _id: "claim_real_2",
        patientId: "pat_2",
        claimNumber: "CLM-REAL-002",
        serviceDate: "2024-04-10",
        providerName: "Dr. Anonymous Provider",
        deniedAmount: 8500,
        patientOwedAmount: 8500,
        cptCodes: ["73721"],
        icd10Codes: ["M17.11"],
        denialReasonCode: "CO-50",
        denialReasonDescription: "Pre-authorization absent",
        status: "ready_for_review",
        statutoryDeadline: Date.now() + 86400000 * 30,
        daysRemaining: 30,
        assignedAgentEmail: "advocate@realpractice.org",
        patient: {
          _id: "pat_2",
          name: "Second Patient",
          email: "patient2@example.com",
          memberId: "MEM-REAL-88",
          insurancePayer: "Cigna",
          state: "FL",
          createdAt: Date.now(),
        },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      } as unknown as Claim;

      const dossier = buildDossierData(mockClaim, null, []);
      expect(dossier.physicianInfo.npiNumber).toBe("Not provided");
      expect(dossier.physicianInfo.phone).toBe("Not provided");
    });
  });

  describe("Backend Claims Demo Tagging & Scoped Purge", () => {
    it("exports clearDemoData mutation", async () => {
      const claimsModule = await import("../convex/claims");
      expect(claimsModule.clearDemoData).toBeDefined();
    });

    it("claims.clearDemoData identifies and deletes only isDemo claims", async () => {
      const claimsModule = await import("../convex/claims");
      const clearHandler = (claimsModule.clearDemoData as any)._handler;

      const mockClaims = [
        { _id: "claim_demo_1", userId: "user_test", isDemo: true, claimNumber: "CLM-DEMO-1" },
        { _id: "claim_demo_2", userId: "user_test", isDemo: true, claimNumber: "CLM-DEMO-2" },
      ];

      const mockQueryInstance: any = {};
      mockQueryInstance.withIndex = vi.fn().mockReturnValue(mockQueryInstance);
      mockQueryInstance.filter = vi.fn().mockReturnValue(mockQueryInstance);
      mockQueryInstance.collect = vi.fn().mockImplementation(() => Promise.resolve(mockClaims));

      const deletedIds: string[] = [];
      const mockCtx: any = {
        auth: {
          getUserIdentity: vi.fn().mockResolvedValue({ subject: "user_test" }),
        },
        db: {
          query: vi.fn().mockReturnValue(mockQueryInstance),
          get: vi.fn().mockImplementation((id: string) => {
            const found = mockClaims.find((c) => c._id === id);
            return Promise.resolve(found || null);
          }),
          delete: vi.fn().mockImplementation((id: string) => {
            deletedIds.push(id);
            return Promise.resolve();
          }),
        },
      };

      const result = await clearHandler(mockCtx, {});
      expect(result.success).toBe(true);
      expect(result.deletedClaimsCount).toBe(2);
      expect(deletedIds).toContain("claim_demo_1");
      expect(deletedIds).toContain("claim_demo_2");
    });
  });

  describe("Honest LLM Fallbacks & Generation Provenance", () => {
    it("precedentMatcher returns empty contradictions and llmAvailable:false on LLM failure without fabricating policy quotes", async () => {
      const precedentMatcher = await import("../convex/actions/precedentMatcher");
      const openai = await import("../convex/lib/openai");

      vi.spyOn(openai, "createStructuredCompletion").mockRejectedValue(new Error("API rate limit exceeded"));

      const mockClaim = {
        _id: "claim_test_99",
        claimNumber: "CLM-TEST-99",
        patient: { name: "Test Patient", memberId: "MEM-99", insurancePayer: "Aetna" },
        providerName: "Dr. Test",
        serviceDate: "2024-01-01",
        cptCodes: ["27447"],
        icd10Codes: ["M17.11"],
        deniedAmount: 50000,
        patientOwedAmount: 50000,
        denialReasonCode: "CO-50",
        denialReasonDescription: "Medical necessity not established",
        assignedAgentEmail: "advocate@test.org",
      };

      let callCount = 0;
      const mockCtx: any = {
        runQuery: vi.fn().mockImplementation(() => {
          callCount++;
          if (callCount === 1) return Promise.resolve(mockClaim);
          return Promise.resolve([]); // evidences array
        }),
        runMutation: vi.fn().mockResolvedValue(undefined),
      };

      const result = await (precedentMatcher.computeOverturnScore as any)._handler(mockCtx, {
        claimId: "claim_test_99",
      });

      expect(result.llmAvailable).toBe(false);
      expect(result.generatedBy).toBe("fallback");
      // No fabricated citations: must be an empty array
      expect(result.keyPolicyContradictions).toEqual([]);
      expect(result.overturnProbabilityScore).toBeGreaterThan(0);
    });

    it("p2pDefenseGenerator sets generatedBy:fallback when LLM fails", async () => {
      const p2pGenerator = await import("../convex/actions/p2pDefenseGenerator");
      const openai = await import("../convex/lib/openai");
      const { rateLimiter } = await import("../convex/lib/rateLimiter");

      vi.spyOn(openai, "createStructuredCompletion").mockRejectedValue(new Error("OpenAI down"));
      vi.spyOn(rateLimiter, "limit").mockResolvedValue({ ok: true } as any);

      const mockClaim = {
        _id: "claim_p2p_1",
        claimNumber: "CLM-P2P-1",
        patient: { name: "Test Patient", insurancePayer: "UnitedHealthcare", state: "TX" },
        cptCodes: ["29881"],
        icd10Codes: ["M23.22"],
        deniedAmount: 15000,
        denialReasonCode: "CO-50",
        denialReasonDescription: "Investigational",
      };

      let p2pQueryCalls = 0;
      const mockCtx: any = {
        runQuery: vi.fn().mockImplementation(() => {
          p2pQueryCalls++;
          if (p2pQueryCalls === 1) return Promise.resolve(mockClaim);
          return Promise.resolve([]);
        }),
        runMutation: vi.fn().mockResolvedValue("script_123"),
      };

      const result = await (p2pGenerator.generateP2PScript as any)._handler(mockCtx, {
        claimId: "claim_p2p_1",
      });

      expect(result.generatedBy).toBe("fallback");
      expect(result.scriptId).toBe("script_123");
      expect(result.openingStatutoryStatement).toBeDefined();
    });
  });
});
