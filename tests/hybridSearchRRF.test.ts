import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  RRF_K_CONSTANT,
  buildClaimLexicalTerms,
  calculateCodeOverlap,
  reciprocalRankFusion,
  formatPrecedentInsertion,
} from "../convex/lib/embeddings";
import * as precedentArchive from "../convex/actions/precedentArchive";
import * as auth from "../convex/lib/auth";
import * as openai from "../convex/lib/openai";
import { internal } from "../convex/_generated/api";

describe("Hybrid Precedent Search: Reciprocal Rank Fusion (RRF) Engine", () => {
  const mockClaimQuery = {
    cptCodes: ["27447"],
    icd10Codes: ["M17.11"],
    denialReasonCode: "CO-50",
    denialReasonDescription: "Procedure deemed not medically necessary without conservative therapy failure documentation",
  };

  describe("buildClaimLexicalTerms", () => {
    it("extracts CPT digits, ICD-10 codes, CARC codes, and non-stopword denial terms", () => {
      const terms = buildClaimLexicalTerms(mockClaimQuery);
      expect(terms).toContain("27447");
      expect(terms).toContain("M17.11");
      expect(terms).toContain("CO-50");
      expect(terms).toContain("Procedure");
      expect(terms).toContain("deemed");
      expect(terms).toContain("medically");
    });

    it("falls back to statutory keywords if claim fields are completely empty", () => {
      const emptyQuery = {
        cptCodes: [],
        icd10Codes: [],
        denialReasonCode: "",
        denialReasonDescription: "",
      };
      const terms = buildClaimLexicalTerms(emptyQuery);
      expect(terms).toBe("medical necessity criteria erisa");
    });
  });

  describe("calculateCodeOverlap", () => {
    it("computes 1.0 (100%) when ICD-10, CPT, and CARC all match", () => {
      const doc = {
        icd10Codes: ["M17.11"],
        cptCodes: ["27447"],
        carcCodes: ["CO-50"],
      };
      const overlap = calculateCodeOverlap(doc, mockClaimQuery);
      expect(overlap).toBe(1);
    });

    it("matches ICD-10 3-character disease category family (e.g. M17.9 matches M17 family)", () => {
      const doc = {
        icd10Codes: ["M17.9"],
        cptCodes: ["27447"],
        carcCodes: ["CO-50"],
      };
      const overlap = calculateCodeOverlap(doc, mockClaimQuery);
      expect(overlap).toBe(1);
    });

    it("computes partial overlap when only subset of codes match", () => {
      const doc = {
        icd10Codes: ["K50.0"],
        cptCodes: ["27447"],
        carcCodes: ["CO-197"],
      };
      const overlap = calculateCodeOverlap(doc, mockClaimQuery);
      // CPT matches (1), ICD-10 does not (0), CARC does not (0). Denominator = 3 -> 1/3 ~ 0.333
      expect(overlap).toBeCloseTo(0.333, 2);
    });

    it("returns 0 when no codes match", () => {
      const doc = {
        icd10Codes: ["I10"],
        cptCodes: ["99213"],
        carcCodes: ["CO-96"],
      };
      const overlap = calculateCodeOverlap(doc, mockClaimQuery);
      expect(overlap).toBe(0);
    });
  });

  describe("reciprocalRankFusion", () => {
    const docA = {
      _id: "doc_scotus_firestone",
      title: "Firestone Tire & Rubber Co. v. Bruch",
      citation: "489 U.S. 101 (1989)",
      icd10Codes: ["M17.11"],
      cptCodes: ["27447"],
      carcCodes: ["CO-50"],
      vectorScore: 0.92,
      winningArgument: "De novo review applies where plan does not grant discretionary authority.",
      statutoryLanguage: "Consistent with trust law principles...",
      outcome: "Supreme Court established de novo review.",
    };

    const docB = {
      _id: "doc_scotus_glenn",
      title: "Metropolitan Life Ins. Co. v. Glenn",
      citation: "554 U.S. 105 (2008)",
      icd10Codes: ["M17.11"],
      cptCodes: ["27447"],
      carcCodes: ["CO-197"],
      vectorScore: 0.85,
      winningArgument: "Conflict of interest factor required in abuse of discretion review.",
      statutoryLanguage: "Dual role of evaluation and payment creates conflict...",
      outcome: "Conflict factor required.",
    };

    const docC = {
      _id: "doc_erisa_reg",
      title: "ERISA 29 CFR 2560.503-1 Claims Procedure",
      citation: "29 CFR § 2560.503-1(h)(2)(iii)",
      icd10Codes: ["M17.11", "M51.16"],
      cptCodes: ["27447", "63047"],
      carcCodes: ["CO-50"],
      vectorScore: 0.78,
      winningArgument: "Plan must provide full access to all documents relevant to the claim.",
      statutoryLanguage: "Claimant shall be provided reasonable access...",
      outcome: "Procedural full and fair review mandate.",
    };

    it("calculates RRF scores with Cormack k=60 and identifies hybrid_fusion matches", () => {
      // Vector results: docA (rank 1), docB (rank 2)
      const vectorHits = [docA, docB];
      // Lexical BM25 results: docC (rank 1), docA (rank 2)
      const lexicalHits = [docC, docA];

      const fused = reciprocalRankFusion(vectorHits, lexicalHits, mockClaimQuery, {
        k: 60,
        limit: 3,
      });

      expect(fused.length).toBe(3);

      // docA appears in both: Vector rank 1, Lexical rank 2
      const matchedA = fused.find((d) => d._id === "doc_scotus_firestone");
      expect(matchedA).toBeDefined();
      expect(matchedA?.retrievalSource).toBe("hybrid_fusion");
      expect(matchedA?.vectorRank).toBe(1);
      expect(matchedA?.textRank).toBe(2);

      // Expected RRF formula: 1 / (60 + 1) + 1 / (60 + 2) = 1/61 + 1/62
      const expectedRrfA = 1 / 61 + 1 / 62;
      expect(matchedA?.rrfScore).toBeCloseTo(expectedRrfA, 4);

      // docB appears only in vector results
      const matchedB = fused.find((d) => d._id === "doc_scotus_glenn");
      expect(matchedB?.retrievalSource).toBe("vector_only");
      expect(matchedB?.vectorRank).toBe(2);
      expect(matchedB?.textRank).toBeUndefined();
      expect(matchedB?.rrfScore).toBeCloseTo(1 / (60 + 2), 4);

      // docC appears only in lexical results
      const matchedC = fused.find((d) => d._id === "doc_erisa_reg");
      expect(matchedC?.retrievalSource).toBe("bm25_only");
      expect(matchedC?.textRank).toBe(1);
      expect(matchedC?.vectorRank).toBeUndefined();
      expect(matchedC?.rrfScore).toBeCloseTo(1 / (60 + 1), 4);
    });

    it("ranks dual-matched candidate highest due to reciprocal rank reinforcement", () => {
      const vectorHits = [docA, docB];
      const lexicalHits = [docA, docC];

      const fused = reciprocalRankFusion(vectorHits, lexicalHits, mockClaimQuery, { limit: 3 });

      // docA is rank 1 in vector and rank 1 in lexical -> highest combined score
      expect(fused[0]._id).toBe("doc_scotus_firestone");
      expect(fused[0].retrievalSource).toBe("hybrid_fusion");
    });

    it("respects limit parameter and deduplicates by citation", () => {
      const duplicateDocA = { ...docA, _id: "doc_dup_1" };
      const vectorHits = [docA, duplicateDocA, docB];
      const lexicalHits = [docA, docC];

      const fused = reciprocalRankFusion(vectorHits, lexicalHits, mockClaimQuery, { limit: 2 });
      expect(fused.length).toBe(2);
    });
  });

  describe("formatPrecedentInsertion", () => {
    it("formats controlling precedent with Hybrid Vector+BM25 RRF badge", () => {
      const match = {
        title: "Firestone Tire & Rubber Co. v. Bruch",
        citation: "489 U.S. 101 (1989)",
        statutoryLanguage: "De novo standard applies.",
        winningArgument: "Undisclosed internal criteria cannot survive de novo review.",
        vectorScore: 0.95,
        retrievalSource: "hybrid_fusion",
        rrfScore: 0.0325,
      };

      const markdown = formatPrecedentInsertion(match);
      expect(markdown).toContain("### Controlling Precedent: Firestone Tire & Rubber Co. v. Bruch [Hybrid Vector+BM25 RRF]");
      expect(markdown).toContain("RRF score: 0.0325");
      expect(markdown).toContain("Citation: 489 U.S. 101 (1989)");
    });

    it("formats controlling precedent with BM25 Lexical badge when only lexical match occurred", () => {
      const match = {
        title: "ERISA 29 CFR § 2560.503-1",
        citation: "29 CFR 2560.503-1",
        statutoryLanguage: "Mandatory disclosure requirement.",
        winningArgument: "Failure to disclose guidelines constitutes procedural default.",
        vectorScore: 0.6,
        retrievalSource: "bm25_only",
      };

      const markdown = formatPrecedentInsertion(match);
      expect(markdown).toContain("### Controlling Precedent: ERISA 29 CFR § 2560.503-1 [BM25 Lexical]");
    });
  });

  describe("precedentArchive: hybridSearchPrecedents & retrieveTopPrecedents", () => {
    beforeEach(() => {
      vi.clearAllMocks();
      vi.spyOn(openai, "createEmbedding").mockResolvedValue(new Array(1536).fill(0.1));
    });


    it("hybridSearchPrecedents returns empty array when query and codes are empty", async () => {
      const mockCtx: any = {};
      const results = await (precedentArchive.hybridSearchPrecedents as any)._handler(mockCtx, {
        query: "",
        cptCodes: [],
        icd10Codes: [],
      });
      expect(results).toEqual([]);
    });

    it("hybridSearchPrecedents coordinates vector search and lexical search with RRF", async () => {
      const mockPrecedentDoc = {
        _id: "p1" as any,
        sourceKind: "court_overturn",
        title: "Firestone v. Bruch",
        citation: "489 U.S. 101",
        jurisdiction: "US-SCOTUS",
        sourceUrl: "https://cornell.edu",
        icd10Codes: ["M17.11"],
        cptCodes: ["27447"],
        carcCodes: ["CO-50"],
        winningArgument: "De novo review applies.",
        statutoryLanguage: "Standard of review under trust law.",
        outcome: "Overturned.",
      };

      const mockCtx: any = {
        vectorSearch: vi.fn().mockResolvedValue([
          { _id: "p1", _score: 0.91 },
        ]),
        runQuery: vi.fn().mockImplementation((_fn, args) => {
          if (args?.ids) {
            return Promise.resolve([mockPrecedentDoc]);
          }
          if (args?.query !== undefined) {
            return Promise.resolve([mockPrecedentDoc]);
          }
          return Promise.resolve([mockPrecedentDoc]);
        }),
      };

      const results = await (precedentArchive.hybridSearchPrecedents as any)._handler(mockCtx, {
        query: "de novo standard of review",
        cptCodes: ["27447"],
        icd10Codes: ["M17.11"],
        carcCode: "CO-50",
      });

      expect(results.length).toBeGreaterThan(0);
      expect(results[0]._id).toBe("p1");
      expect(results[0].retrievalSource).toBe("hybrid_fusion");
      expect(results[0].rrfScore).toBeGreaterThan(0);
      expect(results[0].codeOverlap).toBe(1);
    });

    it("retrieveTopPrecedents runs hybrid retrieval, attaches to claim, and returns matches", async () => {
      const mockClaim = {
        _id: "claim_123",
        userId: "user_123",
        cptCodes: ["27447"],
        icd10Codes: ["M17.11"],
        denialReasonCode: "CO-50",
        denialReasonDescription: "Not medically necessary",
      };

      vi.spyOn(auth, "requireClaimOwnerAction").mockResolvedValue({
        claim: mockClaim as any,
        userId: "user_123" as any,
      });

      const mockDoc = {
        _id: "prec_1" as any,
        sourceKind: "winning_brief",
        title: "Overturned Knee Arthroplasty",
        citation: "Case Brief 2024",
        jurisdiction: "CA",
        icd10Codes: ["M17.11"],
        cptCodes: ["27447"],
        carcCodes: ["CO-50"],
        winningArgument: "Criteria met with 6 months PT.",
        statutoryLanguage: "Coverage mandate.",
        outcome: "Paid 100%.",
      };

      const mockCtx: any = {
        auth: {
          getUserIdentity: vi.fn().mockResolvedValue({ subject: "user_123" }),
        },
        runQuery: vi.fn().mockImplementation((_fn, args) => {
          if (args?.claimId) {
            return Promise.resolve(mockClaim);
          }
          if (args?.query !== undefined) {
            return Promise.resolve([mockDoc]);
          }
          if (args?.ids) {
            return Promise.resolve([mockDoc]);
          }
          return Promise.resolve([mockDoc]);
        }),
        vectorSearch: vi.fn().mockResolvedValue([
          { _id: "prec_1", _score: 0.89 },
        ]),
        runMutation: vi.fn().mockResolvedValue(["evidence_1"]),
      };

      const results = await (precedentArchive.retrieveTopPrecedents as any)._handler(mockCtx, {
        claimId: "claim_123",
      });

      expect(results).toHaveLength(1);
      expect(results[0]._id).toBe("prec_1");
      expect(results[0].retrievalSource).toBe("hybrid_fusion");
      expect(mockCtx.runMutation).toHaveBeenCalledWith(
        internal.precedents.attachMatchesToClaim,
        expect.objectContaining({
          claimId: "claim_123",
          matches: expect.arrayContaining([
            expect.objectContaining({ _id: "prec_1" }),
          ]),
        })
      );
    });

  });
});
