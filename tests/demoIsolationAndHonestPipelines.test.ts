import { describe, it, expect, vi } from "vitest";
import { DEMO_CASE_FIXTURES, SAMPLE_CASE_PRESETS } from "../src/lib/constants";
import { buildDossierData } from "../src/lib/dossierBuilder";
import { Claim, Appeal } from "../src/types";
import { getAuthUserId } from "@convex-dev/auth/server";

vi.mock("@convex-dev/auth/server", () => ({
  getAuthUserId: vi.fn().mockResolvedValue("user_123"),
}));

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
        userId: "user_123",
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
        userId: "user_123",
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

  describe("Explicit Origin Gated Demo Recognition & Real Patient Protection", () => {
    it("recognizes demo fixtures strictly when explicit origin: 'demo-fixture' or dataOrigin: 'demo-fixture' is set", async () => {
      const { isSyntheticDemoClaimIdentifier } = await import("../convex/claims");

      // Fixtures with explicit demo origin evaluate to true
      expect(isSyntheticDemoClaimIdentifier({ origin: "demo-fixture" })).toBe(true);
      expect(isSyntheticDemoClaimIdentifier({ dataOrigin: "demo-fixture" })).toBe(true);
      expect(isSyntheticDemoClaimIdentifier({ origin: "demo-fixture", patientName: "Eleanor Vance" })).toBe(true);
      expect(isSyntheticDemoClaimIdentifier({ origin: "demo-fixture", patientName: "Marcus Sterling" })).toBe(true);
      expect(isSyntheticDemoClaimIdentifier({ origin: "demo-fixture", patientName: "Michael Patel" })).toBe(true);

      // Real patients with matching names or member IDs MUST evaluate to false without explicit demo origin
      expect(isSyntheticDemoClaimIdentifier({ patientName: "Eleanor Vance" })).toBe(false);
      expect(isSyntheticDemoClaimIdentifier({ patientName: "eleanor vance" })).toBe(false);
      expect(isSyntheticDemoClaimIdentifier({ claimNumber: "CLM-8942-CIG-2388" })).toBe(false);
      expect(isSyntheticDemoClaimIdentifier({ memberId: "CIG-982341-01" })).toBe(false);

      expect(isSyntheticDemoClaimIdentifier({ patientName: "Marcus Sterling" })).toBe(false);
      expect(isSyntheticDemoClaimIdentifier({ patientName: "marcus sterling" })).toBe(false);
      expect(isSyntheticDemoClaimIdentifier({ claimNumber: "CLM-6104-GEO-7260" })).toBe(false);
      expect(isSyntheticDemoClaimIdentifier({ memberId: "GEO-554210-99" })).toBe(false);

      expect(isSyntheticDemoClaimIdentifier({ patientName: "Michael Patel" })).toBe(false);
      expect(isSyntheticDemoClaimIdentifier({ patientName: "michael patel" })).toBe(false);
      expect(isSyntheticDemoClaimIdentifier({ claimNumber: "CLM-3912-AET-2952" })).toBe(false);
      expect(isSyntheticDemoClaimIdentifier({ memberId: "AET-773419-02" })).toBe(false);

      // Non-demo genuine claims evaluate to false
      expect(isSyntheticDemoClaimIdentifier({
        patientName: "John Doe",
        claimNumber: "CLM-9912-UHC-1234",
        memberId: "UHC-123456-00",
      })).toBe(false);
      expect(isSyntheticDemoClaimIdentifier({})).toBe(false);
    });

    it("claims.list with includeDemo: false does NOT silently exclude real patients named Eleanor Vance", async () => {
      const claimsModule = await import("../convex/claims");
      const listHandler = (claimsModule.list as any)._handler;

      const mockRealClaim = {
        _id: "claim_real_eleanor",
        userId: "user_test",
        patientId: "pat_eleanor",
        patientName: "Eleanor Vance",
        insurancePayer: "Cigna Global",
        claimNumber: "CLM-8942-CIG-REAL",
        isDemo: false,
        dataOrigin: "live-pipeline",
        status: "ingested",
        deniedAmount: 14200,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const mockDemoClaim = {
        _id: "claim_demo_eleanor",
        userId: "user_test",
        patientId: "pat_eleanor_demo",
        patientName: "Eleanor Vance",
        insurancePayer: "Cigna Global",
        claimNumber: "CLM-8942-CIG-DEMO",
        isDemo: true,
        origin: "demo-fixture",
        dataOrigin: "demo-fixture",
        status: "ingested",
        deniedAmount: 14200,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const mockQueryInstance: any = {};
      mockQueryInstance.withIndex = vi.fn().mockReturnValue(mockQueryInstance);
      mockQueryInstance.filter = vi.fn().mockReturnValue(mockQueryInstance);
      mockQueryInstance.order = vi.fn().mockReturnValue(mockQueryInstance);
      mockQueryInstance.take = vi.fn().mockResolvedValue([mockRealClaim]);

      const mockCtx: any = {
        auth: {
          getUserIdentity: vi.fn().mockResolvedValue({ subject: "user_test" }),
        },
        db: {
          query: vi.fn().mockReturnValue(mockQueryInstance),
          get: vi.fn().mockImplementation((id: string) => {
            if (id === "pat_eleanor") {
              return Promise.resolve({
                _id: "pat_eleanor",
                userId: "user_test",
                name: "Eleanor Vance",
                memberId: "CIG-982341-01",
                insurancePayer: "Cigna Global",
                createdAt: Date.now(),
              });
            }
            return Promise.resolve(null);
          }),
        },
      };

      const results = await listHandler(mockCtx, { includeDemo: false });
      expect(results.length).toBe(1);
      expect(results[0].patientName).toBe("Eleanor Vance");
      expect(results[0].isDemo).toBe(false);
      expect(results[0].dataOrigin).toBe("live-pipeline");
    });

    it("createWithPatient assigns dataOrigin: live-pipeline and isDemo: false to real patients named Marcus Sterling or Eleanor Vance", async () => {
      const claimsModule = await import("../convex/claims");
      const createHandler = (claimsModule.createWithPatient as any)._handler;

      let insertedClaim: any = null;
      const mockCtx: any = {
        auth: {
          getUserIdentity: vi.fn().mockResolvedValue({ subject: "user_test" }),
        },
        db: {
          query: vi.fn().mockReturnValue({
            withIndex: vi.fn().mockReturnValue({
              take: vi.fn().mockResolvedValue([]),
              first: vi.fn().mockResolvedValue(null),
            }),
          }),
          insert: vi.fn().mockImplementation((table: string, doc: any) => {
            if (table === "claims") {
              insertedClaim = { _id: "claim_new_123", ...doc };
              return Promise.resolve("claim_new_123");
            }
            if (table === "patients") {
              return Promise.resolve("pat_new_123");
            }
            return Promise.resolve("doc_id");
          }),
          get: vi.fn().mockImplementation((id: string) => {
            if (id === "claim_new_123") return Promise.resolve(insertedClaim);
            return Promise.resolve(null);
          }),
        },
        scheduler: {
          runAfter: vi.fn().mockResolvedValue(undefined),
        },
      };

      await createHandler(mockCtx, {
        patientName: "Marcus Sterling",
        patientEmail: "marcus.sterling@realpatient.com",
        memberId: "GEO-554210-99",
        insurancePayer: "GeoBlue",
        state: "FL",
        claimNumber: "CLM-6104-GEO-9999",
        serviceDate: "2026-05-12",
        providerName: "Orlando Regional Medical",
        deniedAmount: 8500,
        patientOwedAmount: 8500,
        cptCodes: ["29881"],
        icd10Codes: ["M23.22"],
        denialReasonCode: "CO-50",
        denialReasonDescription: "Investigational service",
      });

      expect(insertedClaim).toBeDefined();
      expect(insertedClaim.isDemo).toBe(false);
      expect(insertedClaim.dataOrigin).toBe("live-pipeline");
      expect(insertedClaim.origin).toBeUndefined();
      expect(insertedClaim.isSyntheticPII).toBe(false);
    });

    it("createWithPatient sets isDemo: true only when origin: 'demo-fixture' is explicitly provided", async () => {
      const claimsModule = await import("../convex/claims");
      const createHandler = (claimsModule.createWithPatient as any)._handler;

      let insertedClaim: any = null;
      const mockCtx: any = {
        auth: {
          getUserIdentity: vi.fn().mockResolvedValue({ subject: "user_test" }),
        },
        db: {
          query: vi.fn().mockReturnValue({
            withIndex: vi.fn().mockReturnValue({
              take: vi.fn().mockResolvedValue([]),
              first: vi.fn().mockResolvedValue(null),
            }),
          }),
          insert: vi.fn().mockImplementation((table: string, doc: any) => {
            if (table === "claims") {
              insertedClaim = { _id: "claim_demo_456", ...doc };
              return Promise.resolve("claim_demo_456");
            }
            if (table === "patients") {
              return Promise.resolve("pat_demo_456");
            }
            return Promise.resolve("doc_id");
          }),
          get: vi.fn().mockImplementation((id: string) => {
            if (id === "claim_demo_456") return Promise.resolve(insertedClaim);
            return Promise.resolve(null);
          }),
        },
        scheduler: {
          runAfter: vi.fn().mockResolvedValue(undefined),
        },
      };

      await createHandler(mockCtx, {
        patientName: "Marcus Sterling",
        patientEmail: "marcus.sterling@realpatient.com",
        memberId: "GEO-554210-99",
        insurancePayer: "GeoBlue",
        state: "FL",
        claimNumber: "CLM-6104-GEO-9999",
        serviceDate: "2026-05-12",
        providerName: "Orlando Regional Medical",
        deniedAmount: 8500,
        patientOwedAmount: 8500,
        cptCodes: ["29881"],
        icd10Codes: ["M23.22"],
        denialReasonCode: "CO-50",
        denialReasonDescription: "Investigational service",
        origin: "demo-fixture",
      });

      expect(insertedClaim).toBeDefined();
      expect(insertedClaim.isDemo).toBe(true);
      expect(insertedClaim.origin).toBe("demo-fixture");
      expect(insertedClaim.dataOrigin).toBe("demo-fixture");
      expect(insertedClaim.isSyntheticPII).toBe(true);
    });

    it("clearDemoData retains real patient claims named Eleanor Vance", async () => {
      const claimsModule = await import("../convex/claims");
      const clearHandler = (claimsModule.clearDemoData as any)._handler;

      const realClaim = {
        _id: "claim_real_eleanor",
        userId: "user_test",
        patientName: "Eleanor Vance",
        claimNumber: "CLM-8942-CIG-REAL",
        isDemo: false,
        dataOrigin: "live-pipeline",
      };

      const demoClaim = {
        _id: "claim_demo_fixture",
        userId: "user_test",
        patientName: "Eleanor Vance",
        claimNumber: "CLM-8942-CIG-DEMO",
        isDemo: true,
        origin: "demo-fixture",
        dataOrigin: "demo-fixture",
      };

      const deletedIds: string[] = [];
      const mockQueryInstance: any = {};
      mockQueryInstance.withIndex = vi.fn().mockReturnValue(mockQueryInstance);
      mockQueryInstance.take = vi.fn().mockResolvedValue([realClaim, demoClaim]);

      const mockCtx: any = {
        auth: {
          getUserIdentity: vi.fn().mockResolvedValue({ subject: "user_test" }),
        },
        db: {
          query: vi.fn().mockReturnValue(mockQueryInstance),
          delete: vi.fn().mockImplementation((id: string) => {
            deletedIds.push(id);
            return Promise.resolve();
          }),
        },
      };

      const res = await clearHandler(mockCtx, {});
      expect(res.deletedClaimsCount).toBe(1);
      expect(deletedIds).toEqual(["claim_demo_fixture"]);
      expect(deletedIds).not.toContain("claim_real_eleanor");
    });

    it("getPortfolioStats counts demo claims when includeDemo is true or omitted", async () => {
      const claimsModule = await import("../convex/claims");
      const statsHandler = (claimsModule.getPortfolioStats as any)._handler;

      const realClaim = {
        _id: "c_real",
        userId: "user_test",
        claimNumber: "CLM-REAL-1",
        patientName: "Real Patient",
        insurancePayer: "Aetna",
        deniedAmount: 10000,
        status: "ready_for_review",
        daysRemaining: 20,
        isDemo: false,
        dataOrigin: "live-pipeline",
        origin: "live-pipeline",
        overturnProbabilityScore: 80,
      };

      const demoClaim1 = {
        _id: "c_demo_1",
        userId: "user_test",
        claimNumber: "CLM-DEMO-1",
        patientName: "Eleanor Vance",
        insurancePayer: "Cigna Global",
        deniedAmount: 18500,
        status: "ready_for_review",
        daysRemaining: 10,
        isDemo: true,
        dataOrigin: "demo-fixture",
        origin: "demo-fixture",
        overturnProbabilityScore: 92,
      };

      const demoClaim2 = {
        _id: "c_demo_2",
        userId: "user_test",
        claimNumber: "CLM-DEMO-2",
        patientName: "Michael Patel",
        insurancePayer: "Aetna International",
        deniedAmount: 24000,
        status: "won",
        daysRemaining: 45,
        isDemo: true,
        dataOrigin: "demo-fixture",
        origin: "demo-fixture",
        overturnProbabilityScore: 85,
      };

      const mockQueryInstance: any = {};
      mockQueryInstance.withIndex = vi.fn().mockReturnValue(mockQueryInstance);
      mockQueryInstance.filter = vi.fn().mockReturnValue(mockQueryInstance);
      mockQueryInstance.order = vi.fn().mockReturnValue(mockQueryInstance);
      mockQueryInstance.take = vi.fn().mockResolvedValue([realClaim, demoClaim1, demoClaim2]);

      const mockCtx: any = {
        db: {
          query: vi.fn().mockReturnValue(mockQueryInstance),
        },
      };

      // When includeDemo is omitted (default), demo claims MUST be counted in portfolio stats
      const statsDefault = await statsHandler(mockCtx, {});
      expect(statsDefault.totalClaims).toBe(3);
      expect(statsDefault.totalDisputedAmount).toBe(52500); // 10000 + 18500 + 24000
      expect(statsDefault.portfolioTotalClaims).toBe(3);
      expect(statsDefault.portfolioTotalDisputedAmount).toBe(52500);
      expect(statsDefault.overturnedWonAmount).toBe(24000);
      expect(statsDefault.activeDisputedAmount).toBe(28500); // 10000 + 18500
      expect(statsDefault.claimsByStatus.ready_for_review).toBe(2);
      expect(statsDefault.claimsByStatus.won).toBe(1);

      // When includeDemo is explicitly true, demo claims MUST be counted in portfolio stats
      const statsInclude = await statsHandler(mockCtx, { includeDemo: true });
      expect(statsInclude.totalClaims).toBe(3);
      expect(statsInclude.totalDisputedAmount).toBe(52500);
      expect(statsInclude.portfolioTotalClaims).toBe(3);
      expect(statsInclude.portfolioTotalDisputedAmount).toBe(52500);
      expect(statsInclude.claimsByStatus.ready_for_review).toBe(2);
      expect(statsInclude.claimsByStatus.won).toBe(1);
    });

    it("getPortfolioStats excludes demo claims and does not double-count or leak when includeDemo is false", async () => {
      const claimsModule = await import("../convex/claims");
      const statsHandler = (claimsModule.getPortfolioStats as any)._handler;

      const realClaim = {
        _id: "c_real",
        userId: "user_test",
        claimNumber: "CLM-REAL-1",
        patientName: "Real Patient",
        insurancePayer: "Aetna",
        deniedAmount: 10000,
        status: "ready_for_review",
        daysRemaining: 20,
        isDemo: false,
        dataOrigin: "live-pipeline",
        origin: "live-pipeline",
        overturnProbabilityScore: 80,
      };

      const demoClaim = {
        _id: "c_demo_1",
        userId: "user_test",
        claimNumber: "CLM-DEMO-1",
        patientName: "Eleanor Vance",
        insurancePayer: "Cigna Global",
        deniedAmount: 18500,
        status: "ready_for_review",
        daysRemaining: 10,
        isDemo: true,
        dataOrigin: "demo-fixture",
        origin: "demo-fixture",
        overturnProbabilityScore: 92,
      };

      const mockQueryInstance: any = {};
      mockQueryInstance.withIndex = vi.fn().mockReturnValue(mockQueryInstance);
      mockQueryInstance.filter = vi.fn().mockReturnValue(mockQueryInstance);
      mockQueryInstance.order = vi.fn().mockReturnValue(mockQueryInstance);
      // Simulating query results where demo claims might be returned by db before client filter
      mockQueryInstance.take = vi.fn().mockResolvedValue([realClaim, demoClaim]);

      const mockCtx: any = {
        db: {
          query: vi.fn().mockReturnValue(mockQueryInstance),
        },
      };

      const stats = await statsHandler(mockCtx, { includeDemo: false });
      // Demo claim MUST be excluded: exactly 1 real claim
      expect(stats.totalClaims).toBe(1);
      expect(stats.totalDisputedAmount).toBe(10000);
      expect(stats.portfolioTotalClaims).toBe(1);
      expect(stats.portfolioTotalDisputedAmount).toBe(10000);
      expect(stats.activeDisputedAmount).toBe(10000);
      expect(stats.overturnedWonAmount).toBe(0);
      expect(stats.claimsByStatus.ready_for_review).toBe(1);
      expect(stats.claimsByStatus.won).toBe(0);
    });
  });
});

