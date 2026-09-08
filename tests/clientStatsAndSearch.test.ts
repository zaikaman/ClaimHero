/// <reference path="./auth-mock.d.ts" />
import { describe, it, expect, vi, beforeEach } from "vitest";
import * as claims from "../convex/claims";
import { matchesClaimSearch } from "../src/lib/utils";
import { getAuthUserId } from "@convex-dev/auth/server";

vi.mock("@convex-dev/auth/server", () => ({
  getAuthUserId: vi.fn(),
}));

describe("Client Stats Drift Elimination & Server-Side Claims Search", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const createMockDb = (customMocks: any = {}) => {
    const qBuilder: any = {};
    qBuilder.search = vi.fn().mockReturnValue(qBuilder);
    qBuilder.eq = vi.fn().mockReturnValue(qBuilder);
    qBuilder.field = vi.fn().mockReturnValue("field");

    const queryInstance: any = {};
    queryInstance.withIndex = vi.fn().mockImplementation((_idx, cb) => {
      if (typeof cb === "function") cb(qBuilder);
      return queryInstance;
    });
    queryInstance.withSearchIndex = vi.fn().mockImplementation((_idx, cb) => {
      if (typeof cb === "function") cb(qBuilder);
      return queryInstance;
    });
    queryInstance.filter = vi.fn().mockImplementation((cb) => {
      if (typeof cb === "function") cb(qBuilder);
      return queryInstance;
    });
    queryInstance.order = vi.fn().mockReturnValue(queryInstance);
    queryInstance.take = vi.fn().mockResolvedValue([]);
    queryInstance.first = vi.fn().mockResolvedValue(null);
    queryInstance.collect = vi.fn().mockResolvedValue([]);
    queryInstance.unique = vi.fn().mockResolvedValue(null);
    queryInstance.paginate = vi.fn().mockResolvedValue({ page: [], isDone: true, continueCursor: "" });

    return {
      get: vi.fn().mockResolvedValue(null),
      insert: vi.fn().mockResolvedValue("id_new"),
      patch: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
      query: vi.fn().mockReturnValue(queryInstance),
      ...customMocks,
    };
  };

  describe("matchesClaimSearch helper", () => {
    const sampleClaim = {
      claimNumber: "CLM-2024-9981",
      patientName: "Eleanor Vance",
      insurancePayer: "Molina Healthcare",
      providerName: "Cedars-Sinai Medical Center",
      denialReasonCode: "CO-50",
      denialReasonDescription: "Procedure deemed experimental or investigational",
      cptCodes: ["27447", "29881"],
      icd10Codes: ["M17.11"],
    };

    it("matches empty query by default", () => {
      expect(matchesClaimSearch(sampleClaim, "")).toBe(true);
      expect(matchesClaimSearch(sampleClaim, "   ")).toBe(true);
    });

    it("matches claim number case-insensitively", () => {
      expect(matchesClaimSearch(sampleClaim, "9981")).toBe(true);
      expect(matchesClaimSearch(sampleClaim, "clm-2024")).toBe(true);
      expect(matchesClaimSearch(sampleClaim, "CLM-8888")).toBe(false);
    });

    it("matches patient name", () => {
      expect(matchesClaimSearch(sampleClaim, "eleanor")).toBe(true);
      expect(matchesClaimSearch(sampleClaim, "VANCE")).toBe(true);
      expect(matchesClaimSearch(sampleClaim, "Marcus")).toBe(false);
    });

    it("matches nested patient.name", () => {
      const nestedClaim = {
        claimNumber: "CLM-100",
        providerName: "Clinic",
        denialReasonCode: "CO-16",
        patient: { name: "Marcus Sterling", insurancePayer: "Aetna" },
      };
      expect(matchesClaimSearch(nestedClaim, "marcus")).toBe(true);
      expect(matchesClaimSearch(nestedClaim, "aetna")).toBe(true);
    });

    it("matches provider name", () => {
      expect(matchesClaimSearch(sampleClaim, "cedars-sinai")).toBe(true);
      expect(matchesClaimSearch(sampleClaim, "Mayo")).toBe(false);
    });

    it("matches denial reason code and description", () => {
      expect(matchesClaimSearch(sampleClaim, "co-50")).toBe(true);
      expect(matchesClaimSearch(sampleClaim, "experimental")).toBe(true);
      expect(matchesClaimSearch(sampleClaim, "timely filing")).toBe(false);
    });

    it("matches CPT codes and ICD-10 codes", () => {
      expect(matchesClaimSearch(sampleClaim, "27447")).toBe(true);
      expect(matchesClaimSearch(sampleClaim, "M17.11")).toBe(true);
      expect(matchesClaimSearch(sampleClaim, "99214")).toBe(false);
    });
  });

  describe("claims.list server-side search and critical deadline", () => {
    it("returns empty when user is not authenticated", async () => {
      vi.mocked(getAuthUserId).mockResolvedValue(null);
      const mockDb = createMockDb();
      const mockCtx: any = { db: mockDb };
      const res = await (claims.list as any)._handler(mockCtx, { search: "knee" });
      expect(res).toEqual([]);
    });

    it("performs candidate scan (up to 500) and filters by search query on server", async () => {
      vi.mocked(getAuthUserId).mockResolvedValue("user_1" as any);

      // 120 claims where claim #115 matches search
      const candidateList: any[] = [];
      for (let i = 1; i <= 120; i++) {
        candidateList.push({
          _id: `claim_${i}`,
          userId: "user_1",
          patientId: `pat_${i}`,
          patientName: i === 115 ? "Search Target Patient" : `Patient ${i}`,
          claimNumber: `CLM-2024-${1000 + i}`,
          insurancePayer: "Aetna",
          providerName: "General Hospital",
          deniedAmount: 5000,
          patientOwedAmount: 500,
          cptCodes: ["99213"],
          icd10Codes: ["I10"],
          denialReasonCode: "CO-16",
          denialReasonDescription: "Lack of pre-authorization",
          status: "ready_for_review",
          statutoryDeadline: 1700000000000,
          daysRemaining: 25,
          createdAt: 1700000000000 + i,
        });
      }

      const mockDb = createMockDb();
      mockDb.query().withIndex().order().take.mockResolvedValue(candidateList);
      const mockCtx: any = { db: mockDb };

      // Query specifically for the target patient that exists on claim #115 (beyond the 100-limit page)
      const res = await (claims.list as any)._handler(mockCtx, {
        search: "Search Target Patient",
        limit: 100,
      });

      expect(res).toHaveLength(1);
      expect(res[0].claimNumber).toBe("CLM-2024-1115");
      expect(res[0].patient.name).toBe("Search Target Patient");
    });

    it("supports status: 'critical_deadline' on server without index collision", async () => {
      vi.mocked(getAuthUserId).mockResolvedValue("user_1" as any);

      const candidateList: any[] = [
        {
          _id: "c1",
          userId: "user_1",
          patientId: "p1",
          patientName: "Alice",
          claimNumber: "CLM-1",
          insurancePayer: "Cigna",
          providerName: "Hospital",
          deniedAmount: 10000,
          patientOwedAmount: 0,
          cptCodes: ["27447"],
          icd10Codes: [],
          denialReasonCode: "CO-50",
          denialReasonDescription: "Medical necessity",
          status: "ready_for_review",
          statutoryDeadline: 1700000000000,
          daysRemaining: 5, // <= 14 days and not won: CRITICAL
          createdAt: 1000,
        },
        {
          _id: "c2",
          userId: "user_1",
          patientId: "p2",
          patientName: "Bob",
          claimNumber: "CLM-2",
          insurancePayer: "Cigna",
          providerName: "Hospital",
          deniedAmount: 8000,
          patientOwedAmount: 0,
          cptCodes: ["27447"],
          icd10Codes: [],
          denialReasonCode: "CO-50",
          denialReasonDescription: "Medical necessity",
          status: "ready_for_review",
          statutoryDeadline: 1700000000000,
          daysRemaining: 40, // > 14 days: NOT critical
          createdAt: 2000,
        },
        {
          _id: "c3",
          userId: "user_1",
          patientId: "p3",
          patientName: "Charlie",
          claimNumber: "CLM-3",
          insurancePayer: "Cigna",
          providerName: "Hospital",
          deniedAmount: 12000,
          patientOwedAmount: 0,
          cptCodes: ["27447"],
          icd10Codes: [],
          denialReasonCode: "CO-50",
          denialReasonDescription: "Medical necessity",
          status: "won", // Already won: excluded
          statutoryDeadline: 1700000000000,
          daysRemaining: 2,
          createdAt: 3000,
        },
      ];

      const mockDb = createMockDb();
      mockDb.query().withIndex().order().take.mockResolvedValue(candidateList);
      const mockCtx: any = { db: mockDb };

      const res = await (claims.list as any)._handler(mockCtx, {
        status: "critical_deadline",
      });

      expect(res).toHaveLength(1);
      expect(res[0]._id).toBe("c1");
    });
  });

  describe("claims.getPortfolioStats server-side filter aggregation", () => {
    it("computes accurate aggregates for filtered payer without 100-item truncation", async () => {
      vi.mocked(getAuthUserId).mockResolvedValue("user_1" as any);

      // 150 claims for Molina Healthcare, each $2,000
      const candidateList: any[] = [];
      for (let i = 1; i <= 150; i++) {
        candidateList.push({
          _id: `claim_${i}`,
          userId: "user_1",
          patientId: `pat_${i}`,
          patientName: `Patient ${i}`,
          insurancePayer: "Molina Healthcare",
          deniedAmount: 2000,
          status: i <= 50 ? "won" : "ready_for_review",
          daysRemaining: i % 10 === 0 ? 5 : 30,
          overturnProbabilityScore: 85,
          createdAt: 1000 + i,
        });
      }

      const mockDb = createMockDb();
      mockDb.query().withIndex().order().take.mockResolvedValue(candidateList);
      const mockCtx: any = { db: mockDb };

      const res = await (claims.getPortfolioStats as any)._handler(mockCtx, {
        payer: "Molina Healthcare",
      });

      // Total claims must be 150 (not capped at 100!)
      expect(res.totalClaims).toBe(150);
      expect(res.totalDisputedAmount).toBe(300000); // 150 * $2,000
      expect(res.overturnedWonAmount).toBe(100000); // 50 won * $2,000
      expect(res.activeDisputedAmount).toBe(200000); // 100 active * $2,000
      expect(res.averageWinScore).toBe(85);
      expect(res.claimsByStatus.won).toBe(50);
      expect(res.claimsByStatus.ready_for_review).toBe(100);
      expect(res.criticalDeadlinesCount).toBeGreaterThan(0);
    });

    it("aggregates correctly when both status and search query are applied", async () => {
      vi.mocked(getAuthUserId).mockResolvedValue("user_1" as any);

      const candidateList: any[] = [
        {
          _id: "c1",
          userId: "user_1",
          patientId: "p1",
          claimNumber: "CLM-2024-KNEE-01",
          patientName: "Alice Smith",
          insurancePayer: "Aetna",
          deniedAmount: 15000,
          status: "ready_for_review",
          daysRemaining: 10,
          overturnProbabilityScore: 90,
          cptCodes: ["27447"],
          createdAt: 1000,
        },
        {
          _id: "c2",
          userId: "user_1",
          patientId: "p2",
          claimNumber: "CLM-2024-SHOULDER-02",
          patientName: "Bob Jones",
          insurancePayer: "Aetna",
          deniedAmount: 12000,
          status: "ready_for_review",
          daysRemaining: 20,
          overturnProbabilityScore: 75,
          cptCodes: ["29827"],
          createdAt: 2000,
        },
        {
          _id: "c3",
          userId: "user_1",
          patientId: "p3",
          claimNumber: "CLM-2024-KNEE-03",
          patientName: "Charlie Brown",
          insurancePayer: "Aetna",
          deniedAmount: 18000,
          status: "won",
          daysRemaining: 30,
          overturnProbabilityScore: 95,
          cptCodes: ["27447"],
          createdAt: 3000,
        },
      ];

      const mockDb = createMockDb();
      mockDb.query().withIndex().order().take.mockResolvedValue(candidateList);
      const mockCtx: any = { db: mockDb };

      // Search for "knee" with status "ready_for_review"
      const res = await (claims.getPortfolioStats as any)._handler(mockCtx, {
        status: "ready_for_review",
        search: "knee",
      });

      // Matches only c1 (c2 is shoulder, c3 is won)
      expect(res.totalClaims).toBe(1);
      expect(res.totalDisputedAmount).toBe(15000);
      expect(res.activeDisputedAmount).toBe(15000);
      expect(res.overturnedWonAmount).toBe(0);
      expect(res.averageWinScore).toBe(90);
      // But status breakdown reflects all "knee" search matches (c1 ready_for_review + c3 won)
      expect(res.claimsByStatus.ready_for_review).toBe(1);
      expect(res.claimsByStatus.won).toBe(1);
    });
  });
});
