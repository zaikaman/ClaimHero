/// <reference path="./auth-mock.d.ts" />
import { describe, it, expect, vi, beforeEach } from "vitest";
import * as claims from "../convex/claims";
import { getAuthUserId } from "@convex-dev/auth/server";
import { mergeSearchResults } from "../src/components/common/CommandDialog";

vi.mock("@convex-dev/auth/server", () => ({
  getAuthUserId: vi.fn(),
}));

describe("Convex BM25 Full-Text Search in Global Command Palette (⌘K)", () => {
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

    return {
      get: vi.fn().mockResolvedValue(null),
      insert: vi.fn().mockResolvedValue("id_new"),
      patch: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
      query: vi.fn().mockReturnValue(queryInstance),
      ...customMocks,
    };
  };

  describe("claims.search BM25 query handler", () => {
    it("returns empty array immediately when unauthenticated or empty query", async () => {
      vi.mocked(getAuthUserId).mockResolvedValue(null);
      const mockDb = createMockDb();
      const mockCtx: any = { db: mockDb };

      const unauthRes = await (claims.search as any)._handler(mockCtx, { query: "subchondral" });
      expect(unauthRes).toEqual([]);

      vi.mocked(getAuthUserId).mockResolvedValue("user_sentinel_1" as any);
      const emptyRes = await (claims.search as any)._handler(mockCtx, { query: "   " });
      expect(emptyRes).toEqual([]);
      expect(mockDb.query).not.toHaveBeenCalled();
    });

    it("executes search_claims searchIndex targeting clinical terms like subchondral and arthroplasty", async () => {
      vi.mocked(getAuthUserId).mockResolvedValue("user_sentinel_1" as any);
      const mockDb = createMockDb();

      const searchResults = [
        {
          _id: "claim_subchondral_1",
          userId: "user_sentinel_1",
          patientId: "patient_1",
          patientName: "Arthur Pendelton",
          claimNumber: "CLM-2026-ARTHRO",
          insurancePayer: "Aetna International",
          providerName: "Hospital for Special Surgery",
          deniedAmount: 18450,
          patientOwedAmount: 1845,
          cptCodes: ["27447", "29881"],
          icd10Codes: ["M17.11"],
          denialReasonCode: "CO-50",
          denialReasonDescription: "Subchondral defect osteochondral autograft investigational",
          status: "ready_for_review",
          statutoryDeadline: 1780000000000,
          daysRemaining: 42,
          createdAt: 1700000000000,
          updatedAt: 1700000000000,
        },
      ];

      const queryInstance = mockDb.query("claims");
      queryInstance.take.mockResolvedValue(searchResults);
      const mockCtx: any = { db: mockDb };

      const res = await (claims.search as any)._handler(mockCtx, {
        query: "subchondral",
        limit: 25,
      });

      expect(mockDb.query).toHaveBeenCalledWith("claims");
      expect(queryInstance.withSearchIndex).toHaveBeenCalledWith("search_claims", expect.any(Function));
      expect(res).toHaveLength(1);
      expect(res[0]._id).toBe("claim_subchondral_1");
      expect(res[0].denialReasonDescription).toContain("Subchondral");
    });

    it("executes direct claim number lookup when query matches claimNumber pattern", async () => {
      vi.mocked(getAuthUserId).mockResolvedValue("user_sentinel_1" as any);
      const mockDb = createMockDb();

      const directMatch = {
        _id: "claim_direct_99",
        userId: "user_sentinel_1",
        claimNumber: "CLM-2026-9912",
        patientName: "Jonathan Archer",
        insurancePayer: "Cigna Global",
        providerName: "Cedars-Sinai",
        deniedAmount: 6400,
        cptCodes: ["29881"],
        icd10Codes: ["M23.22"],
        denialReasonCode: "CO-50",
        denialReasonDescription: "Meniscectomy deemed not medically necessary",
        status: "drafting",
      };

      const queryInstance = mockDb.query("claims");
      queryInstance.first.mockResolvedValue(directMatch);
      queryInstance.take.mockResolvedValue([]);
      const mockCtx: any = { db: mockDb };

      const res = await (claims.search as any)._handler(mockCtx, {
        query: "CLM-2026-9912",
      });

      expect(queryInstance.withIndex).toHaveBeenCalledWith("by_claim_number", expect.any(Function));
      expect(res).toHaveLength(1);
      expect(res[0].claimNumber).toBe("CLM-2026-9912");
    });

    it("clamps limit argument defensively between 1 and 100", async () => {
      vi.mocked(getAuthUserId).mockResolvedValue("user_sentinel_1" as any);
      const mockDb = createMockDb();
      const queryInstance = mockDb.query("claims");
      const mockCtx: any = { db: mockDb };

      await (claims.search as any)._handler(mockCtx, { query: "CO-50", limit: 500 });
      expect(queryInstance.take).toHaveBeenCalledWith(100);

      await (claims.search as any)._handler(mockCtx, { query: "CO-50", limit: -5 });
      expect(queryInstance.take).toHaveBeenCalledWith(1);
    });
  });

  describe("Command palette result merging & fallback normalization", () => {
    it("merges server BM25 results with local in-memory records and deduplicates by _id", () => {
      const localClaims: any[] = [
        {
          _id: "claim_local_1",
          claimNumber: "CLM-101",
          patientName: "Sarah Connor",
          insurancePayer: "UnitedHealthcare",
          cptCodes: ["29881"],
          deniedAmount: 4500,
          denialReasonCode: "CO-50",
          denialReasonDescription: "Knee arthroscopy medical necessity",
        },
        {
          _id: "claim_local_2",
          claimNumber: "CLM-102",
          patientName: "Kyle Reese",
          insurancePayer: "Aetna",
          cptCodes: ["73721"],
          deniedAmount: 1800,
          denialReasonCode: "CO-16",
          denialReasonDescription: "Missing clinical notes",
        },
      ];

      const serverBM25Results: any[] = [
        {
          _id: "claim_local_1",
          claimNumber: "CLM-101",
          patientName: "Sarah Connor",
          insurancePayer: "UnitedHealthcare",
          denialReasonCode: "CO-50",
          denialReasonDescription: "Knee arthroscopy medical necessity subchondral",
        },
        {
          _id: "claim_server_new",
          claimNumber: "CLM-303",
          patientName: "John Connor",
          insurancePayer: "Blue Cross",
          cptCodes: ["27447"],
          deniedAmount: 32000,
          denialReasonCode: "CO-50",
          denialReasonDescription: "Total knee arthroplasty subchondral sclerosis",
        },
      ];

      const localMatches = localClaims.filter((c) =>
        c.denialReasonDescription.toLowerCase().includes("subchondral")
      );

      // Verify direct execution of production mergeSearchResults
      const merged = mergeSearchResults(serverBM25Results, localMatches, localClaims);

      expect(merged).toHaveLength(2);
      expect(merged.map((c) => c._id)).toEqual(["claim_local_1", "claim_server_new"]);
      expect(merged[0].cptCodes).toEqual(["29881"]);
      expect(merged[0].patient?.name).toBe("Sarah Connor");
      expect(merged[1].patient?.name).toBe("John Connor");

      // Boundary condition: undefined or invalid server results fall back immediately to local matches
      const fallbackResult = mergeSearchResults(undefined, localMatches, localClaims);
      expect(fallbackResult).toEqual(localMatches);

      // Boundary condition: empty raw server records receive safe defaults
      const unpopulatedServerMatch = [{ _id: "claim_unpopulated_99" }];
      const safeDefaults = mergeSearchResults(unpopulatedServerMatch, [], []);
      expect(safeDefaults).toHaveLength(1);
      expect(safeDefaults[0].patientName).toBe("Patient");
      expect(safeDefaults[0].insurancePayer).toBe("Health Insurer");
      expect(safeDefaults[0].cptCodes).toEqual([]);
      expect(safeDefaults[0].deniedAmount).toBe(0);
    });
  });
});
