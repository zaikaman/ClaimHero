import { describe, it, expect, vi, beforeEach } from "vitest";
import * as clinicalEvidences from "../convex/clinicalEvidences";
import { getAuthUserId } from "@convex-dev/auth/server";

vi.mock("@convex-dev/auth/server", () => ({
  getAuthUserId: vi.fn(),
}));

describe("Convex Clinical Evidences Database & Retrieval Functions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("sanitizeCitationClause", () => {
    it("handles undefined or empty string", () => {
      expect(clinicalEvidences.sanitizeCitationClause(undefined)).toBe("Clinical Citation");
      expect(clinicalEvidences.sanitizeCitationClause("")).toBe("Clinical Citation");
    });

    it("sanitizes clauses with ' | ' delimiter and recognizable medical prefixes", () => {
      expect(clinicalEvidences.sanitizeCitationClause("PMID: 12345 | Short Note")).toBe("PMID: 12345 • Short Note");
      expect(clinicalEvidences.sanitizeCitationClause("CPB 0016 | A Very Long Detailed Description Paragraph That Exceeds Limit")).toBe("CPB 0016");
    });

    it("clamps very long single-string clauses", () => {
      const longClause = "PMID: 9988776655 This is an extremely long continuous clause that should be matched by regex";
      expect(clinicalEvidences.sanitizeCitationClause(longClause)).toBe("PMID: 9988776655");

      const randomLong = "Non Standard Citation That Has No Recognizable Regex Pattern But Is Very Long";
      expect(clinicalEvidences.sanitizeCitationClause(randomLong)).toBe("Non Standard Citation That Has N...");
    });
  });

  describe("listByClaim, listByClaimInternal & listByClaimAndSource", () => {
    it("listByClaim: returns empty array if unauthorized", async () => {
      vi.mocked(getAuthUserId).mockResolvedValue(null);
      const mockCtx: any = { db: { get: vi.fn().mockResolvedValue(null) } };
      const res = await (clinicalEvidences.listByClaim as any)._handler(mockCtx, { claimId: "claim_1" });
      expect(res).toEqual([]);
    });

    it("listByClaim: returns sorted and sanitized evidences when authorized", async () => {
      vi.mocked(getAuthUserId).mockResolvedValue("user_123" as any);
      const mockClaim = { _id: "claim_1", userId: "user_123" };
      const evs = [
        { _id: "ev1", title: "**Evidence 1**", citationClause: "PMID: 123", extractedEvidenceMarkdown: "**Fact**", relevanceScore: 80 },
        { _id: "ev2", title: "Evidence 2", citationClause: "CPB", extractedEvidenceMarkdown: "Fact 2", relevanceScore: 95 },
      ];
      const mockCtx: any = {
        db: {
          get: vi.fn().mockResolvedValue(mockClaim),
          query: vi.fn().mockReturnValue({
            withIndex: vi.fn().mockReturnValue({
              take: vi.fn().mockResolvedValue(evs),
            }),
          }),
        },
      };

      const res = await (clinicalEvidences.listByClaim as any)._handler(mockCtx, { claimId: "claim_1" });
      expect(res[0]._id).toBe("ev2");
      expect(res[1].title).toBe("Evidence 1");
      expect(res[1].extractedEvidenceMarkdown).toBe("Fact");
    });

    it("listByClaimInternal: returns sorted evidences without auth check", async () => {
      const evs = [
        { _id: "ev1", relevanceScore: 70 },
        { _id: "ev2", relevanceScore: 90 },
      ];
      const mockCtx: any = {
        db: {
          query: vi.fn().mockReturnValue({
            withIndex: vi.fn().mockReturnValue({
              take: vi.fn().mockResolvedValue(evs),
            }),
          }),
        },
      };
      const res = await (clinicalEvidences.listByClaimInternal as any)._handler(mockCtx, { claimId: "claim_1" });
      expect(res[0]._id).toBe("ev2");
    });

    it("listByClaimAndSource: filters by source type", async () => {
      vi.mocked(getAuthUserId).mockResolvedValue("user_123" as any);
      const mockClaim = { _id: "claim_1", userId: "user_123" };
      const evs = [{ _id: "ev1", sourceType: "payer_cpb", relevanceScore: 90 }];
      const mockCtx: any = {
        db: {
          get: vi.fn().mockResolvedValue(mockClaim),
          query: vi.fn().mockReturnValue({
            withIndex: vi.fn().mockReturnValue({
              take: vi.fn().mockResolvedValue(evs),
            }),
          }),
        },
      };

      const res = await (clinicalEvidences.listByClaimAndSource as any)._handler(mockCtx, { claimId: "claim_1", sourceType: "payer_cpb" });
      expect(res).toHaveLength(1);
    });
  });

  describe("insertBatch, insertBatchInternal, clearByClaim, deleteEvidence & insertSingle", () => {
    it("insertBatch: skips and returns empty array if claim is missing", async () => {
      vi.mocked(getAuthUserId).mockResolvedValue("user_123" as any);
      const mockCtx: any = { db: { get: vi.fn().mockResolvedValue(null) } };
      const res = await (clinicalEvidences.insertBatchInternal as any)._handler(mockCtx, {
        claimId: "claim_missing",
        evidences: [],
      });
      expect(res).toEqual([]);
    });

    it("insertBatch: inserts batch and logs audit event", async () => {
      vi.mocked(getAuthUserId).mockResolvedValue("user_123" as any);
      const mockClaim = { _id: "claim_1", userId: "user_123" };
      const mockCtx: any = {
        db: {
          get: vi.fn().mockResolvedValue(mockClaim),
          insert: vi.fn().mockResolvedValue("ev_id_1"),
        },
      };

      const res = await (clinicalEvidences.insertBatch as any)._handler(mockCtx, {
        claimId: "claim_1",
        evidences: [
          {
            sourceType: "payer_cpb",
            title: "**CPB Title**",
            citationClause: "Section 2",
            extractedEvidenceMarkdown: "**Criteria Met**",
            relevanceScore: 90,
          },
        ],
      });

      expect(res).toEqual(["ev_id_1"]);
      expect(mockCtx.db.insert).toHaveBeenCalledWith("clinicalEvidences", expect.objectContaining({
        claimId: "claim_1",
        title: "CPB Title",
        extractedEvidenceMarkdown: "Criteria Met",
      }));
      expect(mockCtx.db.insert).toHaveBeenCalledWith("appealAuditLogs", expect.objectContaining({
        eventType: "policy_crawled",
      }));
    });

    it("clearByClaim: deletes all clinical evidences for a claim", async () => {
      vi.mocked(getAuthUserId).mockResolvedValue("user_123" as any);
      const mockClaim = { _id: "claim_1", userId: "user_123" };
      const existing = [{ _id: "ev1" }, { _id: "ev2" }];
      const mockCtx: any = {
        db: {
          get: vi.fn().mockResolvedValue(mockClaim),
          query: vi.fn().mockReturnValue({
            withIndex: vi.fn().mockReturnValue({
              collect: vi.fn().mockResolvedValue(existing),
            }),
          }),
          delete: vi.fn().mockResolvedValue(undefined),
        },
      };

      await (clinicalEvidences.clearByClaim as any)._handler(mockCtx, { claimId: "claim_1" });
      expect(mockCtx.db.delete).toHaveBeenCalledTimes(2);

      await (clinicalEvidences.clearByClaimInternal as any)._handler(mockCtx, { claimId: "claim_1" });
      expect(mockCtx.db.delete).toHaveBeenCalledTimes(4);
    });

    it("deleteEvidence: returns null if not found, else deletes and logs audit", async () => {
      vi.mocked(getAuthUserId).mockResolvedValue("user_123" as any);
      const mockCtxNotFound: any = { db: { get: vi.fn().mockResolvedValue(null) } };
      const resNull = await (clinicalEvidences.deleteEvidence as any)._handler(mockCtxNotFound, { evidenceId: "ev_999" });
      expect(resNull).toBeNull();

      const mockEv = { _id: "ev_1", claimId: "claim_1", title: "CPB 1", citationClause: "Sec 1" };
      const mockClaim = { _id: "claim_1", userId: "user_123" };
      const mockCtx: any = {
        db: {
          get: vi.fn().mockImplementation((id) => (id === "ev_1" ? Promise.resolve(mockEv) : Promise.resolve(mockClaim))),
          delete: vi.fn().mockResolvedValue(undefined),
          insert: vi.fn().mockResolvedValue("log_1"),
        },
      };

      const res = await (clinicalEvidences.deleteEvidence as any)._handler(mockCtx, { evidenceId: "ev_1" });
      expect(res).toBe("ev_1");
      expect(mockCtx.db.delete).toHaveBeenCalledWith("ev_1");
      expect(mockCtx.db.insert).toHaveBeenCalledWith("appealAuditLogs", expect.objectContaining({ eventType: "evidence_removed" }));
    });

    it("insertSingle & insertSingleInternal: inserts one item and logs audit", async () => {
      vi.mocked(getAuthUserId).mockResolvedValue("user_123" as any);
      const mockClaim = { _id: "claim_1", userId: "user_123" };
      const mockCtx: any = {
        db: {
          get: vi.fn().mockResolvedValue(mockClaim),
          insert: vi.fn().mockResolvedValue("ev_single_1"),
        },
      };

      const res = await (clinicalEvidences.insertSingle as any)._handler(mockCtx, {
        claimId: "claim_1",
        sourceType: "pubmed_study",
        title: "Study Title",
        citationClause: "PMID: 9988",
        extractedEvidenceMarkdown: "Clinical Study Findings",
        relevanceScore: 92,
      });

      expect(res).toBe("ev_single_1");
      expect(mockCtx.db.insert).toHaveBeenCalledWith("appealAuditLogs", expect.objectContaining({ eventType: "evidence_added" }));

      const resInternal = await (clinicalEvidences.insertSingleInternal as any)._handler(mockCtx, {
        claimId: "claim_1",
        sourceType: "pubmed_study",
        title: "Study Title 2",
        citationClause: "PMID: 9989",
        extractedEvidenceMarkdown: "Clinical Study Findings 2",
        relevanceScore: 93,
      });
      expect(resInternal).toBe("ev_single_1");
    });
  });

  describe("listSourcesSummary & searchEvidence", () => {
    it("listSourcesSummary: returns zeros if unauthorized", async () => {
      vi.mocked(getAuthUserId).mockResolvedValue(null);
      const mockCtx: any = { db: { get: vi.fn().mockResolvedValue(null) } };
      const res = await (clinicalEvidences.listSourcesSummary as any)._handler(mockCtx, { claimId: "claim_1" });
      expect(res.total).toBe(0);
      expect(res.bySource.payer_cpb).toBe(0);
    });

    it("listSourcesSummary: counts occurrences of source types", async () => {
      vi.mocked(getAuthUserId).mockResolvedValue("user_123" as any);
      const mockClaim = { _id: "claim_1", userId: "user_123" };
      const evs = [
        { sourceType: "payer_cpb" },
        { sourceType: "payer_cpb" },
        { sourceType: "pubmed_study" },
      ];
      const mockCtx: any = {
        db: {
          get: vi.fn().mockResolvedValue(mockClaim),
          query: vi.fn().mockReturnValue({
            withIndex: vi.fn().mockReturnValue({
              take: vi.fn().mockResolvedValue(evs),
            }),
          }),
        },
      };

      const res = await (clinicalEvidences.listSourcesSummary as any)._handler(mockCtx, { claimId: "claim_1" });
      expect(res.total).toBe(3);
      expect(res.bySource.payer_cpb).toBe(2);
      expect(res.bySource.pubmed_study).toBe(1);
    });

    it("searchEvidence: returns empty array if query or claimId is missing, or unauthorized", async () => {
      const mockCtx: any = { db: {} };
      expect(await (clinicalEvidences.searchEvidence as any)._handler(mockCtx, { query: "" })).toEqual([]);
      expect(await (clinicalEvidences.searchEvidence as any)._handler(mockCtx, { query: "lumbar" })).toEqual([]);

      vi.mocked(getAuthUserId).mockResolvedValue(null);
      mockCtx.db.get = vi.fn().mockResolvedValue(null);
      expect(await (clinicalEvidences.searchEvidence as any)._handler(mockCtx, { query: "lumbar", claimId: "c1" })).toEqual([]);
    });

    it("searchEvidence: executes search index query with optional sourceType filter", async () => {
      vi.mocked(getAuthUserId).mockResolvedValue("user_123" as any);
      const mockClaim = { _id: "c1", userId: "user_123" };
      const searchHits = [{ _id: "ev1", title: "Spine Surgery", citationClause: "Sec 3" }];
      const mockCtx: any = {
        db: {
          get: vi.fn().mockResolvedValue(mockClaim),
          query: vi.fn().mockReturnValue({
            withSearchIndex: vi.fn().mockImplementation((_name, fn) => {
              const qObj: any = {};
              qObj.search = vi.fn().mockReturnValue(qObj);
              qObj.eq = vi.fn().mockReturnValue(qObj);
              fn(qObj);
              return {
                take: vi.fn().mockResolvedValue(searchHits),
              };
            }),
          }),
        },
      };

      const res = await (clinicalEvidences.searchEvidence as any)._handler(mockCtx, {
        claimId: "c1",
        query: "spinal stenosis",
        sourceType: "payer_cpb",
      });

      expect(res).toHaveLength(1);
      expect(res[0]._id).toBe("ev1");
    });
  });
});
