import { describe, it, expect, vi, beforeEach } from "vitest";
import * as precedents from "../convex/precedents";
import { getAuthUserId, getClaimIfAuthorized } from "../convex/lib/auth";

vi.mock("../convex/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../convex/lib/auth")>();
  return {
    ...actual,
    getAuthUserId: vi.fn(),
    getClaimIfAuthorized: vi.fn(),
  };
});



describe("Convex Precedents & Controlling Authorities Engine", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("hydrateByIds, getByCorpusKey, getBySourceClaim, listForReindex & updateEmbedding", () => {
    it("hydrateByIds: fetches and preserves order of precedent documents", async () => {
      const doc1 = { _id: "p1", title: "Precedent 1" };
      const doc2 = { _id: "p2", title: "Precedent 2" };
      const mockCtx: any = {
        db: {
          get: vi.fn().mockImplementation((id) => (id === "p1" ? Promise.resolve(doc1) : id === "p2" ? Promise.resolve(doc2) : Promise.resolve(null))),
        },
      };

      const res = await (precedents.hydrateByIds as any)._handler(mockCtx, { ids: ["p2", "p1", "p3"] });
      expect(res).toEqual([doc2, doc1]);
    });

    it("getByCorpusKey & getBySourceClaim", async () => {
      const mockCtx: any = {
        db: {
          query: vi.fn().mockReturnValue({
            withIndex: vi.fn().mockReturnValue({
              unique: vi.fn().mockResolvedValue({ _id: "prec_key_1" }),
              take: vi.fn().mockResolvedValue([{ _id: "prec_claim_1" }]),
            }),
          }),
        },
      };

      expect(await (precedents.getByCorpusKey as any)._handler(mockCtx, { corpusKey: "key_1" })).toBe("prec_key_1");
      expect(await (precedents.getBySourceClaim as any)._handler(mockCtx, { sourceClaimId: "c1" })).toBe("prec_claim_1");
    });

    it("listForReindex & updateEmbedding", async () => {
      const docs = [{ _id: "p1" }, { _id: "p2" }];
      const mockCtx: any = {
        db: {
          query: vi.fn().mockReturnValue({
            take: vi.fn().mockResolvedValue(docs),
          }),
          patch: vi.fn().mockResolvedValue(undefined),
        },
      };

      expect(await (precedents.listForReindex as any)._handler(mockCtx, {})).toEqual(docs);

      const res = await (precedents.updateEmbedding as any)._handler(mockCtx, {
        precedentId: "p1",
        embedding: [0.1, 0.2, 0.3],
      });
      expect(res).toBeNull();
      expect(mockCtx.db.patch).toHaveBeenCalledWith("p1", { embedding: [0.1, 0.2, 0.3] });
    });
  });

  describe("insertPrecedent", () => {
    it("patches existing precedent if matching corpusKey found", async () => {
      const existing = { _id: "prec_exist_1" };
      const mockCtx: any = {
        db: {
          query: vi.fn().mockReturnValue({
            withIndex: vi.fn().mockReturnValue({
              unique: vi.fn().mockResolvedValue(existing),
            }),
          }),
          patch: vi.fn().mockResolvedValue(undefined),
        },
      };

      const res = await (precedents.insertPrecedent as any)._handler(mockCtx, {
        sourceKind: "winning_brief",
        title: "Updated Title",
        citation: "Citation",
        jurisdiction: "CA",
        icd10Codes: ["M51.1"],
        cptCodes: ["63047"],
        carcCodes: ["CO-50"],
        primaryIcd10: "M51.1",
        primaryCpt: "63047",
        carcCode: "CO-50",
        winningArgument: "Argument",
        statutoryLanguage: "Language",
        outcome: "Overturned",
        embedding: [0.1, 0.2],
        corpusKey: "key_1",
      });

      expect(res).toBe("prec_exist_1");
      expect(mockCtx.db.patch).toHaveBeenCalledWith("prec_exist_1", expect.objectContaining({ title: "Updated Title" }));
    });

    it("inserts new precedent if no existing corpusKey", async () => {
      const mockCtx: any = {
        db: {
          query: vi.fn().mockReturnValue({
            withIndex: vi.fn().mockReturnValue({
              unique: vi.fn().mockResolvedValue(null),
            }),
          }),
          insert: vi.fn().mockResolvedValue("prec_new_1"),
        },
      };

      const res = await (precedents.insertPrecedent as any)._handler(mockCtx, {
        sourceKind: "commissioner_ruling",
        title: "Ruling Title",
        citation: "Citation",
        jurisdiction: "CA",
        icd10Codes: ["M51.1"],
        cptCodes: ["63047"],
        carcCodes: ["CO-50"],
        primaryIcd10: "M51.1",
        primaryCpt: "63047",
        carcCode: "CO-50",
        winningArgument: "Argument",
        statutoryLanguage: "Language",
        outcome: "Overturned",
        embedding: [0.1, 0.2],
        corpusKey: "key_unique_2",
      });

      expect(res).toBe("prec_new_1");
      expect(mockCtx.db.insert).toHaveBeenCalledWith("precedents", expect.objectContaining({
        title: "Ruling Title",
        corpusKey: "key_unique_2",
      }));
    });
  });

  describe("attachMatchesToClaim, listAttachedForClaim & searchTextPrecedents", () => {
    it("attachMatchesToClaim: throws if claim missing or unauthorized user mismatch", async () => {
      const mockCtxMissing: any = { db: { get: vi.fn().mockResolvedValue(null) } };
      await expect((precedents.attachMatchesToClaim as any)._handler(mockCtxMissing, {
        claimId: "c_missing",
        matches: [],
      })).rejects.toThrow("Claim c_missing not found");

      vi.mocked(getAuthUserId).mockResolvedValue("attacker_1" as any);
      const mockClaim = { _id: "c1", userId: "victim_owner" };
      const mockCtxForbidden: any = { db: { get: vi.fn().mockResolvedValue(mockClaim) } };
      await expect((precedents.attachMatchesToClaim as any)._handler(mockCtxForbidden, {
        claimId: "c1",
        matches: [],
      })).rejects.toThrow("Forbidden");
    });

    it("attachMatchesToClaim: attaches vector matches and inserts audit log", async () => {
      vi.mocked(getAuthUserId).mockResolvedValue("user_123" as any);
      const mockClaim = { _id: "c1", userId: "user_123" };
      const mockMatch = {
        _id: "p1",
        sourceKind: "court_overturn",
        title: "Landmark Case",
        citation: "29 U.S.C. § 1133",
        jurisdiction: "9th Circuit",
        sourceUrl: "https://court.gov",
        icd10Codes: ["M51.1"],
        cptCodes: ["63047"],
        carcCodes: ["CO-50"],
        winningArgument: "Treating physician rule",
        statutoryLanguage: "Statute",
        outcome: "Overturned",
        vectorScore: 0.95,
        combinedScore: 0.92,
        codeOverlap: 1.0,
      };

      const mockCtx: any = {
        db: {
          get: vi.fn().mockResolvedValue(mockClaim),
          query: vi.fn().mockImplementation((table: string) => {
            if (table === "clinicalEvidences") {
              return { withIndex: vi.fn().mockReturnValue({ take: vi.fn().mockResolvedValue([]) }) };
            }
            if (table === "appealAuditLogs") {
              return {
                withIndex: vi.fn().mockReturnValue({
                  filter: vi.fn().mockReturnValue({
                    first: vi.fn().mockResolvedValue(null),
                  }),
                }),
              };
            }
            return {};
          }),
          insert: vi.fn().mockImplementation((table) => (table === "clinicalEvidences" ? Promise.resolve("ev_prec_1") : Promise.resolve("log_prec"))),
        },
      };

      const res = await (precedents.attachMatchesToClaim as any)._handler(mockCtx, {
        claimId: "c1",
        matches: [mockMatch],
      });

      expect(res).toEqual(["ev_prec_1"]);
      expect(mockCtx.db.insert).toHaveBeenCalledWith("clinicalEvidences", expect.objectContaining({
        sourceType: "legal_precedent",
        title: "Landmark Case",
      }));
      expect(mockCtx.db.insert).toHaveBeenCalledWith("appealAuditLogs", expect.objectContaining({
        eventType: "precedent_vectors_retrieved",
      }));
    });

    it("listAttachedForClaim: returns top 3 legal precedent rows", async () => {
      const mockClaim = { _id: "c1", userId: "user_123" };
      vi.mocked(getAuthUserId).mockResolvedValue("user_123" as any);
      vi.mocked(getClaimIfAuthorized).mockResolvedValue({ claim: mockClaim as any, userId: "user_123" as any });

      const rows = [
        { _id: "ev1", title: "T1", citationClause: "C1", sourceUrl: "u1", extractedEvidenceMarkdown: "arg1", relevanceScore: 0.95 },
        { _id: "ev2", title: "T2", citationClause: "C2", sourceUrl: "u2", extractedEvidenceMarkdown: "arg2", relevanceScore: 0.85 },
      ];
      const mockCtx: any = {
        db: {
          get: vi.fn().mockResolvedValue(mockClaim),
          query: vi.fn().mockReturnValue({
            withIndex: vi.fn().mockReturnValue({
              take: vi.fn().mockResolvedValue(rows),
            }),
          }),
        },
      };

      const res = await (precedents.listAttachedForClaim as any)._handler(mockCtx, { claimId: "c1" });
      expect(res).toHaveLength(2);
      expect(res[0].title).toBe("T1");
      expect(res[0].citation).toBe("C1");
    });

    it("searchTextPrecedents: returns empty on empty query, else search index results", async () => {
      const mockCtx: any = { db: {} };
      expect(await (precedents.searchTextPrecedents as any)._handler(mockCtx, { query: "" })).toEqual([]);

      const mockResults = [
        { _id: "p1", sourceKind: "winning_brief", title: "Brief 1", citation: "Cit 1", primaryCpt: "63047", carcCode: "CO-50", winningArgument: "Arg", statutoryLanguage: "Stat", sourceUrl: "url" },
      ];

      const mockCtxSearch: any = {
        db: {
          query: vi.fn().mockReturnValue({
            withSearchIndex: vi.fn().mockImplementation((_name, fn) => {
              const qObj: any = {};
              qObj.search = vi.fn().mockReturnValue(qObj);
              qObj.eq = vi.fn().mockReturnValue(qObj);
              fn(qObj);
              return {
                take: vi.fn().mockResolvedValue(mockResults),
              };
            }),
          }),
        },
      };

      const res = await (precedents.searchTextPrecedents as any)._handler(mockCtxSearch, {
        query: "laminectomy",
        sourceKind: "winning_brief",
        primaryCpt: "63047",
      });

      expect(res).toHaveLength(1);
      expect(res[0].primaryCpt).toBe("63047");
    });

    it("searchLexicalPrecedentsInternal: returns empty on empty query, else stripped precedent results", async () => {
      const mockCtx: any = { db: {} };
      expect(await (precedents.searchLexicalPrecedentsInternal as any)._handler(mockCtx, { query: "" })).toEqual([]);

      const mockRawResults = [
        {
          _id: "p1",
          sourceKind: "winning_brief",
          title: "Brief 1",
          citation: "Cit 1",
          primaryCpt: "63047",
          carcCode: "CO-50",
          winningArgument: "Arg",
          statutoryLanguage: "Stat",
          outcome: "Overturned",
          sourceUrl: "url",
          embedding: [0.1, 0.2, 0.3], // should be stripped
        },
      ];

      const mockCtxSearch: any = {
        db: {
          query: vi.fn().mockReturnValue({
            withSearchIndex: vi.fn().mockImplementation((_name, fn) => {
              const qObj: any = {};
              qObj.search = vi.fn().mockReturnValue(qObj);
              qObj.eq = vi.fn().mockReturnValue(qObj);
              fn(qObj);
              return {
                take: vi.fn().mockResolvedValue(mockRawResults),
              };
            }),
          }),
        },
      };

      const res = await (precedents.searchLexicalPrecedentsInternal as any)._handler(mockCtxSearch, {
        query: "arthroplasty criteria",
        primaryCpt: "63047",
        carcCode: "CO-50",
        limit: 5,
      });

      expect(res).toHaveLength(1);
      expect(res[0]._id).toBe("p1");
      expect((res[0] as any).embedding).toBeUndefined();
    });
  });
});

