import { internalMutation, internalQuery, query } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { precedentMatchValidator } from "./lib/precedentValidators";
import { getClaimIfAuthorized } from "./lib/auth";
import { fitDimensions, EMBEDDING_DIMENSIONS } from "./lib/embeddings";

export { precedentMatchValidator };

const sourceKindValidator = v.union(
  v.literal("winning_brief"),
  v.literal("commissioner_ruling"),
  v.literal("court_overturn"),
  v.literal("statutory_authority")
);

export type HydratedPrecedent = Omit<Doc<"precedents">, "embedding">;

/**
 * Hydrate vector-search hits in parallel and strip 12KB raw embedding vectors.
 */
export const hydrateByIds = internalQuery({
  args: {
    ids: v.array(v.id("precedents")),
  },
  handler: async (ctx, args): Promise<HydratedPrecedent[]> => {
    const rawDocs = await Promise.all(args.ids.map((id) => ctx.db.get(id)));
    const docs: HydratedPrecedent[] = [];
    for (const doc of rawDocs) {
      if (doc) {
        const { embedding: _, ...rest } = doc;
        docs.push(rest);
      }
    }
    return docs;
  },
});

export const getByCorpusKey = internalQuery({
  args: {
    corpusKey: v.string(),
  },
  returns: v.union(v.id("precedents"), v.null()),
  handler: async (ctx, args): Promise<Id<"precedents"> | null> => {
    const existing = await ctx.db
      .query("precedents")
      .withIndex("by_corpus_key", (q) => q.eq("corpusKey", args.corpusKey))
      .unique();
    return existing?._id ?? null;
  },
});

export const getBySourceClaim = internalQuery({
  args: {
    sourceClaimId: v.id("claims"),
  },
  returns: v.union(v.id("precedents"), v.null()),
  handler: async (ctx, args): Promise<Id<"precedents"> | null> => {
    const existing = await ctx.db
      .query("precedents")
      .withIndex("by_source_claim", (q) => q.eq("sourceClaimId", args.sourceClaimId))
      .take(1);
    return existing[0]?._id ?? null;
  },
});

/**
 * Read a bounded, paginated batch of precedents for embedding reindexing.
 * Strips the heavy 1536-dim embedding vectors (~12-18 KB per row) to prevent
 * query read transaction byte limit exhaustion (TransactionTooLarge).
 */
export const listForReindex = internalQuery({
  args: {
    cursor: v.optional(v.union(v.string(), v.null())),
    batchSize: v.optional(v.number()),
  },
  handler: async (
    ctx,
    args
  ): Promise<{
    page: HydratedPrecedent[];
    isDone: boolean;
    continueCursor: string | null;
  }> => {
    const batchSize = Math.min(Math.max(1, args.batchSize ?? 50), 100);
    const queryBuilder = ctx.db.query("precedents");

    if (typeof queryBuilder.paginate === "function") {
      const pageResult = await queryBuilder.paginate({
        cursor: args.cursor ?? null,
        numItems: batchSize,
      });

      const page: HydratedPrecedent[] = pageResult.page.map((doc) => {
        const { embedding: _, ...rest } = doc;
        return rest;
      });

      return {
        page,
        isDone: pageResult.isDone,
        continueCursor: pageResult.continueCursor,
      };
    }

    // Fallback for mock environments / unit tests without paginate
    const docs = await queryBuilder.take(batchSize);
    return {
      page: docs.map((doc) => {
        const { embedding: _, ...rest } = doc;
        return rest;
      }),
      isDone: true,
      continueCursor: null,
    };
  },
});

export const updateEmbedding = internalMutation({
  args: {
    precedentId: v.id("precedents"),
    embedding: v.array(v.float64()),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const normalized = fitDimensions(args.embedding, EMBEDDING_DIMENSIONS);
    if (normalized.length !== EMBEDDING_DIMENSIONS) {
      throw new Error(`Invalid embedding vector dimension: expected ${EMBEDDING_DIMENSIONS}, got ${normalized.length}`);
    }
    await ctx.db.patch(args.precedentId, { embedding: normalized });
    return null;
  },
});

export const insertPrecedent = internalMutation({
  args: {
    sourceKind: sourceKindValidator,
    title: v.string(),
    citation: v.string(),
    jurisdiction: v.string(),
    sourceUrl: v.optional(v.string()),
    icd10Codes: v.array(v.string()),
    cptCodes: v.array(v.string()),
    carcCodes: v.array(v.string()),
    primaryIcd10: v.string(),
    primaryCpt: v.string(),
    carcCode: v.string(),
    winningArgument: v.string(),
    statutoryLanguage: v.string(),
    outcome: v.string(),
    embedding: v.array(v.float64()),
    sourceClaimId: v.optional(v.id("claims")),
    corpusKey: v.string(),
  },
  returns: v.id("precedents"),
  handler: async (ctx, args): Promise<Id<"precedents">> => {
    const normalized = fitDimensions(args.embedding, EMBEDDING_DIMENSIONS);
    if (normalized.length !== EMBEDDING_DIMENSIONS) {
      throw new Error(`Invalid embedding vector dimension: expected ${EMBEDDING_DIMENSIONS}, got ${normalized.length}`);
    }

    const existing = await ctx.db
      .query("precedents")
      .withIndex("by_corpus_key", (q) => q.eq("corpusKey", args.corpusKey))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        title: args.title,
        citation: args.citation,
        winningArgument: args.winningArgument,
        statutoryLanguage: args.statutoryLanguage,
        outcome: args.outcome,
        sourceUrl: args.sourceUrl,
        icd10Codes: args.icd10Codes,
        cptCodes: args.cptCodes,
        carcCodes: args.carcCodes,
        primaryIcd10: args.primaryIcd10,
        primaryCpt: args.primaryCpt,
        carcCode: args.carcCode,
        sourceKind: args.sourceKind,
        embedding: normalized,
      });
      return existing._id;
    }

    return await ctx.db.insert("precedents", {
      sourceKind: args.sourceKind,
      title: args.title,
      citation: args.citation,
      jurisdiction: args.jurisdiction,
      sourceUrl: args.sourceUrl,
      icd10Codes: args.icd10Codes,
      cptCodes: args.cptCodes,
      carcCodes: args.carcCodes,
      primaryIcd10: args.primaryIcd10,
      primaryCpt: args.primaryCpt,
      carcCode: args.carcCode,
      winningArgument: args.winningArgument,
      statutoryLanguage: args.statutoryLanguage,
      outcome: args.outcome,
      embedding: normalized,
      sourceClaimId: args.sourceClaimId,
      corpusKey: args.corpusKey,
      createdAt: Date.now(),
    });
  },
});

/**
 * Persist the top vector matches onto the claim as legal_precedent evidence
 * so Appeal Studio and the synthesizer consume them through the existing
 * evidence subscription.
 *
 * Internal-only mutation: not callable by clients. Caller actions (such as
 * retrieveTopPrecedents via requireClaimOwnerAction) strictly enforce user
 * authentication and claim ownership at the boundary before calling this mutation.
 */
export const attachMatchesToClaim = internalMutation({
  args: {
    claimId: v.id("claims"),
    matches: v.array(precedentMatchValidator),
  },
  returns: v.array(v.id("clinicalEvidences")),
  handler: async (ctx, args): Promise<Id<"clinicalEvidences">[]> => {
    const claim = await ctx.db.get(args.claimId);
    if (!claim) {
      throw new Error(`Claim ${args.claimId} not found`);
    }

    const now = Date.now();
    const existing = await ctx.db
      .query("clinicalEvidences")
      .withIndex("by_claim_source", (q) =>
        q.eq("claimId", args.claimId).eq("sourceType", "legal_precedent")
      )
      .take(32);

    const existingByTitle = new Map(existing.map((row) => [row.title, row]));
    const inserted: Id<"clinicalEvidences">[] = [];

    for (const match of args.matches) {
      const rrfInfo = match.rrfScore ? ` | RRF score: ${match.rrfScore.toFixed(4)}` : "";
      const sourceBadge = match.retrievalSource === "hybrid_fusion"
        ? " [HYBRID FUSION: Vector + BM25]"
        : match.retrievalSource === "bm25_only"
          ? " [BM25 LEXICAL]"
          : " [DENSE VECTOR]";
      const markdown = [
        match.statutoryLanguage,
        "",
        match.winningArgument,
        "",
        `Outcome: ${match.outcome}`,
        `Retrieval: ${sourceBadge.trim()} | Vector similarity: ${match.vectorScore.toFixed(4)} | Combined score: ${match.combinedScore.toFixed(4)}${rrfInfo}`,
      ].join("\n");
      const relevanceScore = Math.max(0, Math.min(1, (match.combinedScore + 1) / 2));
      const prior = existingByTitle.get(match.title);

      if (prior) {
        await ctx.db.patch(prior._id, {
          citationClause: match.citation,
          extractedEvidenceMarkdown: markdown,
          relevanceScore,
          sourceUrl: match.sourceUrl,
        });
        inserted.push(prior._id);
      } else {
        const id = await ctx.db.insert("clinicalEvidences", {
          claimId: args.claimId,
          sourceType: "legal_precedent",
          title: match.title,
          sourceUrl: match.sourceUrl,
          citationClause: match.citation,
          extractedEvidenceMarkdown: markdown,
          relevanceScore,
          createdAt: now,
        });
        inserted.push(id);
      }
    }

    const existingLog = await ctx.db
      .query("appealAuditLogs")
      .withIndex("by_claim", (q) => q.eq("claimId", args.claimId))
      .filter((q) => q.eq(q.field("eventType"), "precedent_vectors_retrieved"))
      .first();

    if (!existingLog && args.matches.length > 0) {
      const uniqueCitations = Array.from(
        new Set(args.matches.map((m) => m.citation.trim()).filter(Boolean))
      );
      const hybridCount = args.matches.filter((m) => m.retrievalSource === "hybrid_fusion").length;
      const details = hybridCount > 0
        ? `Hybrid Precedent Search (Vector + Full-Text RRF Fusion) retrieved ${args.matches.length} controlling authorities (${hybridCount} dual-matched): ${uniqueCitations.join("; ")}.`
        : `Convex vector search returned ${args.matches.length} controlling authorities: ${uniqueCitations.join("; ")}.`;

      await ctx.db.insert("appealAuditLogs", {
        claimId: args.claimId,
        eventType: "precedent_vectors_retrieved",
        actor: "Precedent Vector Archive",
        details,
        timestamp: now,
      });
    }

    return inserted;
  },
});

/**
 * Public read of archive rows already attached to a claim (reactive).
 * Scores live on clinicalEvidences.relevanceScore after retrieval.
 */
export const listAttachedForClaim = query({
  args: {
    claimId: v.id("claims"),
  },
  handler: async (ctx, args) => {
    const authorized = await getClaimIfAuthorized(ctx, args.claimId);
    if (!authorized) return [];

    const rows = await ctx.db
      .query("clinicalEvidences")
      .withIndex("by_claim_source", (q) =>
        q.eq("claimId", args.claimId).eq("sourceType", "legal_precedent")
      )
      .take(8);

    return rows
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .slice(0, 3)
      .map((row) => ({
        _id: row._id,
        title: row.title,
        citation: row.citationClause,
        sourceUrl: row.sourceUrl,
        winningArgument: row.extractedEvidenceMarkdown,
        relevanceScore: row.relevanceScore,
      }));
  },
});

/**
 * Internal full-text search across precedent winning arguments using Convex searchIndex
 * Strips 12KB raw embeddings for fast action payload transport.
 */
export const searchLexicalPrecedentsInternal = internalQuery({
  args: {
    query: v.string(),
    sourceKind: v.optional(sourceKindValidator),
    primaryCpt: v.optional(v.string()),
    carcCode: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<HydratedPrecedent[]> => {
    const trimmed = args.query.trim();
    if (!trimmed) {
      return [];
    }

    const results = await ctx.db
      .query("precedents")
      .withSearchIndex("search_precedents", (q) => {
        let builder = q.search("winningArgument", trimmed);
        if (args.sourceKind) {
          builder = builder.eq("sourceKind", args.sourceKind);
        }
        if (args.primaryCpt) {
          builder = builder.eq("primaryCpt", args.primaryCpt);
        }
        if (args.carcCode) {
          builder = builder.eq("carcCode", args.carcCode);
        }
        return builder;
      })
      .take(args.limit || 16);

    return results.map((row) => {
      const { embedding: _, ...rest } = row;
      return rest;
    });
  },
});

/**
 * Full-text search across precedent winning arguments and statutory citations using Convex searchIndex
 */
export const searchTextPrecedents = query({
  args: {
    query: v.string(),
    sourceKind: v.optional(sourceKindValidator),
    primaryCpt: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    if (!args.query.trim()) {
      return [];
    }

    const results = await ctx.db
      .query("precedents")
      .withSearchIndex("search_precedents", (q) => {
        let builder = q.search("winningArgument", args.query);
        if (args.sourceKind) {
          builder = builder.eq("sourceKind", args.sourceKind);
        }
        if (args.primaryCpt) {
          builder = builder.eq("primaryCpt", args.primaryCpt);
        }
        return builder;
      })
      .take(Math.max(1, Math.min(args.limit ?? 10, 100)));

    return results.map((row) => ({
      _id: row._id,
      sourceKind: row.sourceKind,
      title: row.title,
      citation: row.citation,
      primaryCpt: row.primaryCpt,
      carcCode: row.carcCode,
      winningArgument: row.winningArgument,
      statutoryLanguage: row.statutoryLanguage,
      sourceUrl: row.sourceUrl,
    }));
  },
});


