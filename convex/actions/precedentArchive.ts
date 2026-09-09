"use node";

import { action, internalAction } from "../_generated/server";
import type { ActionCtx } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { createEmbedding } from "../lib/openai";
import { PRECEDENT_CORPUS } from "../lib/precedentCorpus";
import type { HydratedPrecedent } from "../precedents";
import {
  buildClaimLexicalTerms,
  buildClaimQueryText,
  buildPrecedentEmbedText,
  reciprocalRankFusion,
  weightedTokensForCodes,
} from "../lib/embeddings";
import type { PrecedentSourceKind } from "../lib/embeddings";
import { precedentMatchValidator } from "../lib/precedentValidators";
import { requireClaimOwnerAction, requireAuthUser } from "../lib/auth";
import { rateLimiter } from "../lib/rateLimiter";

const matchListValidator = v.array(precedentMatchValidator);

function primaryOrUnspecified(values: string[]): string {
  const first = values.find((value) => value && value.trim().length > 0);
  return first ? first.trim() : "UNSPECIFIED";
}

async function seedArchiveBody(ctx: ActionCtx): Promise<{ upserted: number }> {
  let upserted = 0;

  for (const entry of PRECEDENT_CORPUS) {
    const existing: Id<"precedents"> | null = await ctx.runQuery(
      internal.precedents.getByCorpusKey,
      { corpusKey: entry.corpusKey }
    );
    if (existing) {
      continue;
    }

    const embedText = buildPrecedentEmbedText(entry);
    const extraTokens = weightedTokensForCodes(entry.icd10Codes, entry.cptCodes, entry.carcCodes);
    extraTokens.push(`kind:${entry.sourceKind}`);
    const embedding = await createEmbedding(embedText, extraTokens);

    await ctx.runMutation(internal.precedents.insertPrecedent, {
      sourceKind: entry.sourceKind,
      title: entry.title,
      citation: entry.citation,
      jurisdiction: entry.jurisdiction,
      sourceUrl: entry.sourceUrl,
      icd10Codes: entry.icd10Codes,
      cptCodes: entry.cptCodes,
      carcCodes: entry.carcCodes,
      primaryIcd10: primaryOrUnspecified(entry.icd10Codes),
      primaryCpt: primaryOrUnspecified(entry.cptCodes),
      carcCode: primaryOrUnspecified(entry.carcCodes),
      winningArgument: entry.winningArgument,
      statutoryLanguage: entry.statutoryLanguage,
      outcome: entry.outcome,
      embedding,
      corpusKey: entry.corpusKey,
    });
    upserted += 1;
  }

  return { upserted };
}

/**
 * Embed and upsert the public legal corpus. Idempotent via corpusKey.
 */
export const seedArchive = internalAction({
  args: {},
  returns: v.object({
    upserted: v.number(),
  }),
  handler: async (ctx): Promise<{ upserted: number }> => {
    return await seedArchiveBody(ctx);
  },
});

/**
 * Helper to process a bounded page of precedents during embedding reindex.
 * Cascades asynchronously via ctx.scheduler.runAfter to prevent TransactionTooLarge
 * and stay well within Convex bytesRead / transaction limits.
 */
async function executeReindexArchiveBatch(
  ctx: ActionCtx,
  args: {
    cursor: string | null;
    batchSize?: number;
    totalReindexed?: number;
  }
): Promise<{
  isDone: boolean;
  continueCursor: string | null;
  batchProcessed: number;
  reindexed: number;
  totalReindexed: number;
  total: number;
}> {
  const batchSize = Math.min(Math.max(1, args.batchSize ?? 50), 100);

  const pageResult: {
    page: HydratedPrecedent[];
    isDone: boolean;
    continueCursor: string | null;
  } = await ctx.runQuery(internal.precedents.listForReindex, {
    cursor: args.cursor,
    batchSize,
  });

  let batchReindexed = 0;

  for (const doc of pageResult.page) {
    const extraTokens = weightedTokensForCodes(
      doc.icd10Codes,
      doc.cptCodes,
      doc.carcCodes
    );
    extraTokens.push(`kind:${doc.sourceKind}`);
    const embedding = await createEmbedding(
      buildPrecedentEmbedText(doc),
      extraTokens
    );
    await ctx.runMutation(internal.precedents.updateEmbedding, {
      precedentId: doc._id,
      embedding,
    });
    batchReindexed++;
  }

  const totalReindexed = (args.totalReindexed ?? 0) + batchReindexed;

  if (!pageResult.isDone && pageResult.continueCursor) {
    if (ctx.scheduler && typeof ctx.scheduler.runAfter === "function") {
      await ctx.scheduler.runAfter(
        0,
        internal.actions.precedentArchive.reindexArchiveBatch,
        {
          cursor: pageResult.continueCursor,
          batchSize,
          totalReindexed,
        }
      );
    }
  }

  return {
    isDone: pageResult.isDone,
    continueCursor: pageResult.continueCursor,
    batchProcessed: pageResult.page.length,
    reindexed: batchReindexed,
    totalReindexed,
    total: totalReindexed,
  };
}

/**
 * Re-embed every existing archive row after changing embedding providers.
 * Initiates bounded pagination batching (default 50 rows per batch) to safely
 * reindex any volume of precedent vectors without blowing transaction or memory limits.
 * Cascades asynchronously via scheduler like the statutory deadline sweep.
 */
export const reindexArchive = internalAction({
  args: {
    cursor: v.optional(v.union(v.string(), v.null())),
    batchSize: v.optional(v.number()),
  },
  returns: v.object({
    isDone: v.boolean(),
    continueCursor: v.union(v.string(), v.null()),
    batchProcessed: v.number(),
    reindexed: v.number(),
    totalReindexed: v.number(),
    total: v.number(),
  }),
  handler: async (ctx, args) => {
    return await executeReindexArchiveBatch(ctx, {
      cursor: args.cursor ?? null,
      batchSize: args.batchSize ?? 50,
      totalReindexed: 0,
    });
  },
});

/**
 * Internal action for scheduled continuation batches during precedent vector reindex.
 */
export const reindexArchiveBatch = internalAction({
  args: {
    cursor: v.union(v.string(), v.null()),
    batchSize: v.optional(v.number()),
    totalReindexed: v.optional(v.number()),
  },
  returns: v.object({
    isDone: v.boolean(),
    continueCursor: v.union(v.string(), v.null()),
    batchProcessed: v.number(),
    reindexed: v.number(),
    totalReindexed: v.number(),
    total: v.number(),
  }),
  handler: async (ctx, args) => {
    return await executeReindexArchiveBatch(ctx, args);
  },
});

/**
 * Real-time Hybrid Precedent Search (Vector Search + Full-Text RRF Fusion):
 * 1. Semantic vector search (1536-d OpenAI embedding)
 * 2. Convex BM25 full-text search (.searchIndex on winning arguments)
 * 3. Reciprocal Rank Fusion (RRF, k=60) + clinical code overlap
 * 4. Persist top matches as legal_precedent evidence on the claim
 */
export const retrieveTopPrecedents = action({
  args: {
    claimId: v.id("claims"),
  },
  returns: matchListValidator,
  handler: async (ctx, args) => {
    const { claim } = await requireClaimOwnerAction(ctx, args.claimId);

    const icd10Codes: string[] = claim.icd10Codes || [];
    const cptCodes: string[] = claim.cptCodes || [];
    const denialReasonCode: string = claim.denialReasonCode || "CO-50";
    const denialReasonDescription: string = claim.denialReasonDescription || "";

    const queryFields = {
      icd10Codes,
      cptCodes,
      denialReasonCode,
      denialReasonDescription,
    };

    // 1. Dense Vector Search Path (Semantic matching)
    const queryText = buildClaimQueryText(queryFields);
    const extraTokens = weightedTokensForCodes(icd10Codes, cptCodes, [denialReasonCode]);
    const embedding = await createEmbedding(queryText, extraTokens);

    const primaryCpt = cptCodes[0]?.trim();
    const cleanCarc = denialReasonCode?.trim();

    let hits: Array<{ _id: Id<"precedents">; _score: number }> = [];
    try {
      hits = await ctx.vectorSearch("precedents", "by_embedding", {
        vector: embedding,
        limit: 16,
        ...(cleanCarc && primaryCpt
          ? { filter: (q) => q.or(q.eq("carcCode", cleanCarc), q.eq("primaryCpt", primaryCpt)) }
          : cleanCarc
          ? { filter: (q) => q.eq("carcCode", cleanCarc) }
          : primaryCpt
          ? { filter: (q) => q.eq("primaryCpt", primaryCpt) }
          : {}),
      });
    } catch (filterErr) {
      console.warn("Vector search with filter expression failed, falling back to unfiltered vector search:", filterErr);
      hits = await ctx.vectorSearch("precedents", "by_embedding", {
        vector: embedding,
        limit: 16,
      });
    }

    if (hits.length === 0 && (cleanCarc || primaryCpt)) {
      hits = await ctx.vectorSearch("precedents", "by_embedding", {
        vector: embedding,
        limit: 16,
      });
    }

    // 2. Full-Text BM25 Lexical Search Path (Exact keyword matching)
    const lexicalQuery = buildClaimLexicalTerms(queryFields);
    let lexicalDocs: HydratedPrecedent[] = [];
    try {
      lexicalDocs = await ctx.runQuery(internal.precedents.searchLexicalPrecedentsInternal, {
        query: lexicalQuery,
        primaryCpt: primaryCpt || undefined,
        carcCode: cleanCarc || undefined,
        limit: 16,
      });

      if (lexicalDocs.length < 3) {
        const broadLexical = await ctx.runQuery(internal.precedents.searchLexicalPrecedentsInternal, {
          query: lexicalQuery,
          limit: 16,
        });
        const existingIds = new Set(lexicalDocs.map((d) => d._id));
        for (const doc of broadLexical) {
          if (!existingIds.has(doc._id)) {
            lexicalDocs.push(doc);
            existingIds.add(doc._id);
          }
        }
      }
    } catch (err) {
      console.warn("Lexical BM25 search failed in hybrid retrieval, falling back to pure vector path:", err);
    }

    // 3. Hydrate vector hits
    const lexicalIds = new Set(lexicalDocs.map((d) => d._id));
    const missingVectorIds = hits
      .map((h) => h._id)
      .filter((id) => !lexicalIds.has(id));

    const hydratedVectorDocs: HydratedPrecedent[] = missingVectorIds.length > 0
      ? (await ctx.runQuery(internal.precedents.hydrateByIds, { ids: missingVectorIds })) || []
      : [];

    const allDocsById = new Map<Id<"precedents">, HydratedPrecedent>();
    for (const doc of lexicalDocs) {
      allDocsById.set(doc._id, doc);
    }
    for (const doc of hydratedVectorDocs) {
      allDocsById.set(doc._id, doc);
    }

    // 4. Build rankable candidate inputs
    const vectorCandidates = hits
      .map((hit) => {
        const doc = allDocsById.get(hit._id);
        if (!doc) return null;
        return {
          ...doc,
          vectorScore: hit._score,
        };
      })
      .filter((row): row is NonNullable<typeof row> => row !== null);

    const lexicalCandidates = lexicalDocs.map((doc, idx) => ({
      ...doc,
      textScore: Math.max(0.1, 1 / (idx + 1)),
    }));

    // 5. Reciprocal Rank Fusion (RRF, k=60) + Domain Code Overlap
    const fusedMatches = reciprocalRankFusion(
      vectorCandidates,
      lexicalCandidates,
      queryFields,
      { limit: 3, k: 60 }
    );

    const matches = fusedMatches.map((row) => ({
      _id: row._id,
      sourceKind: row.sourceKind,
      title: row.title,
      citation: row.citation,
      jurisdiction: row.jurisdiction,
      sourceUrl: row.sourceUrl,
      icd10Codes: row.icd10Codes,
      cptCodes: row.cptCodes,
      carcCodes: row.carcCodes,
      winningArgument: row.winningArgument,
      statutoryLanguage: row.statutoryLanguage,
      outcome: row.outcome,
      vectorScore: row.vectorScore,
      combinedScore: row.combinedScore,
      codeOverlap: row.codeOverlap,
      vectorRank: row.vectorRank,
      textRank: row.textRank,
      rrfScore: row.rrfScore,
      textScore: row.textScore,
      retrievalSource: row.retrievalSource,
    }));

    if (matches.length > 0) {
      await ctx.runMutation(internal.precedents.attachMatchesToClaim, {
        claimId: args.claimId,
        matches,
      });
    }

    return matches;
  },
});

/**
 * Public Hybrid Search action for free-text queries, clinical codes, and filters using RRF
 */
export const hybridSearchPrecedents = action({
  args: {
    query: v.string(),
    cptCodes: v.optional(v.array(v.string())),
    icd10Codes: v.optional(v.array(v.string())),
    carcCode: v.optional(v.string()),
    sourceKind: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  returns: matchListValidator,
  handler: async (ctx, args) => {
    const userId = await requireAuthUser(ctx);

    // Enforce rate limiting per authenticated user
    try {
      const limitStatus = await rateLimiter.limit(ctx, "precedentSearch", {
        key: `precedent_search_${userId}`,
      });
      if (!limitStatus.ok) {
        throw new Error(
          `Rate limit reached for precedent search. Please retry in ${Math.ceil((limitStatus.retryAfter || 1000) / 1000)} seconds.`
        );
      }
    } catch (rateErr) {
      if (rateErr instanceof Error && rateErr.message.includes("Rate limit reached")) {
        throw rateErr;
      }
    }

    const cptCodes = args.cptCodes || [];
    const icd10Codes = args.icd10Codes || [];
    const carcCode = args.carcCode || "CO-50";
    const userQuery = args.query.trim();

    if (!userQuery && cptCodes.length === 0 && icd10Codes.length === 0) {
      return [];
    }

    const effectiveLimit = Math.max(1, Math.min(args.limit ?? 5, 100));

    const queryFields = {
      cptCodes,
      icd10Codes,
      denialReasonCode: carcCode,
      denialReasonDescription: userQuery,
    };

    // 1. Vector search path
    let vectorCandidates: Array<HydratedPrecedent & { vectorScore: number }> = [];
    try {
      const queryText = buildClaimQueryText(queryFields);
      const extraTokens = weightedTokensForCodes(icd10Codes, cptCodes, [carcCode]);
      if (args.sourceKind) {
        extraTokens.push(`kind:${args.sourceKind}`);
      }
      const embedding = await createEmbedding(queryText, extraTokens);
      let hits: Array<{ _id: Id<"precedents">; _score: number }> = [];
      try {
        hits = await ctx.vectorSearch("precedents", "by_embedding", {
          vector: embedding,
          limit: 16,
          ...(args.sourceKind ? { filter: (q) => q.eq("sourceKind", args.sourceKind as PrecedentSourceKind) } : {}),
        });
      } catch (vectorFilterErr) {
        console.warn("Hybrid search vector branch with filter failed, retrying unfiltered:", vectorFilterErr);
        hits = await ctx.vectorSearch("precedents", "by_embedding", {
          vector: embedding,
          limit: 16,
        });
      }
      const ids = hits.map((h) => h._id);
      const docs: HydratedPrecedent[] = (await ctx.runQuery(internal.precedents.hydrateByIds, { ids })) || [];
      const docsById = new Map(docs.map((d) => [d._id, d]));
      vectorCandidates = hits
        .map((h) => {
          const doc = docsById.get(h._id);
          return doc ? { ...doc, vectorScore: h._score } : null;
        })
        .filter((r): r is NonNullable<typeof r> => r !== null);
      if (args.sourceKind) {
        vectorCandidates = vectorCandidates.filter((r) => r.sourceKind === args.sourceKind);
      }
    } catch (err) {
      console.warn("Hybrid search vector branch failed:", err);
    }

    // 2. Lexical search path
    let lexicalCandidates: Array<HydratedPrecedent & { textScore: number }> = [];
    try {
      const lexicalQuery = userQuery || buildClaimLexicalTerms(queryFields);
      const docs: HydratedPrecedent[] = await ctx.runQuery(internal.precedents.searchLexicalPrecedentsInternal, {
        query: lexicalQuery,
        limit: 16,
        ...(args.sourceKind ? { sourceKind: args.sourceKind as PrecedentSourceKind } : {}),
      });
      const filteredDocs = args.sourceKind ? docs.filter((d) => d.sourceKind === args.sourceKind) : docs;
      lexicalCandidates = filteredDocs.map((doc: HydratedPrecedent, idx: number) => ({
        ...doc,
        textScore: Math.max(0.1, 1 / (idx + 1)),
      }));
    } catch (err) {
      console.warn("Hybrid search lexical branch failed:", err);
    }

    // 3. Reciprocal Rank Fusion
    const fused = reciprocalRankFusion(
      vectorCandidates,
      lexicalCandidates,
      queryFields,
      { limit: effectiveLimit, k: 60 }
    );

    const filteredFused = args.sourceKind ? fused.filter((r) => r.sourceKind === args.sourceKind) : fused;

    return filteredFused.map((row) => ({
      _id: row._id,
      sourceKind: row.sourceKind,
      title: row.title,
      citation: row.citation,
      jurisdiction: row.jurisdiction,
      sourceUrl: row.sourceUrl,
      icd10Codes: row.icd10Codes,
      cptCodes: row.cptCodes,
      carcCodes: row.carcCodes,
      winningArgument: row.winningArgument,
      statutoryLanguage: row.statutoryLanguage,
      outcome: row.outcome,
      vectorScore: row.vectorScore,
      combinedScore: row.combinedScore,
      codeOverlap: row.codeOverlap,
      vectorRank: row.vectorRank,
      textRank: row.textRank,
      rrfScore: row.rrfScore,
      textScore: row.textScore,
      retrievalSource: row.retrievalSource,
    }));
  },
});


/**
 * Index a de-identified winning appeal brief into the vector archive.
 */
export const indexWonAppeal = internalAction({
  args: {
    claimId: v.id("claims"),
  },
  returns: v.union(v.id("precedents"), v.null()),
  handler: async (ctx, args): Promise<Id<"precedents"> | null> => {
    const already: Id<"precedents"> | null = await ctx.runQuery(
      internal.precedents.getBySourceClaim,
      { sourceClaimId: args.claimId }
    );
    if (already) {
      return already;
    }

    const claim = await ctx.runQuery(internal.claims.getByIdInternal, {
      claimId: args.claimId,
    });
    if (!claim) {
      return null;
    }

    const appeal = await ctx.runQuery(internal.appeals.getLatestByClaimInternal, {
      claimId: args.claimId,
    });
    if (!appeal?.fullAppealMarkdown) {
      return null;
    }

    const icd10Codes: string[] = claim.icd10Codes || [];
    const cptCodes: string[] = claim.cptCodes || [];
    const carcCodes: string[] = claim.denialReasonCode ? [claim.denialReasonCode] : [];
    const title = `Winning brief — CPT ${(cptCodes[0] || "procedure")} / ${claim.denialReasonCode || "CARC"} overturn`;
    const citation = `ClaimHero overturned appeal ${claim.claimNumber}`;
    const winningArgument = (appeal.medicalNecessityArguments || appeal.fullAppealMarkdown)
      .replace(/\*\*/g, "")
      .slice(0, 2400);
    const statutoryLanguage = (appeal.legalCitations || "")
      .replace(/\*\*/g, "")
      .slice(0, 1800);

    const entry = {
      title,
      citation,
      winningArgument,
      statutoryLanguage:
        statutoryLanguage ||
        "This brief prevailed on internal appeal. Proven medical-necessity and ERISA 29 CFR § 2560.503-1 arguments are retained for future semantic retrieval.",
      outcome: `Overturned. Recovered $${Number(claim.deniedAmount || 0).toLocaleString()}.`,
      icd10Codes,
      cptCodes,
      carcCodes,
      sourceKind: "winning_brief" as const,
    };

    const embedding = await createEmbedding(
      buildPrecedentEmbedText(entry),
      weightedTokensForCodes(icd10Codes, cptCodes, carcCodes)
    );

    const insertedId = await ctx.runMutation(internal.precedents.insertPrecedent, {
      sourceKind: "winning_brief",
      title: entry.title,
      citation: entry.citation,
      jurisdiction: claim.patient?.state || "US-FED",
      icd10Codes,
      cptCodes,
      carcCodes,
      primaryIcd10: primaryOrUnspecified(icd10Codes),
      primaryCpt: primaryOrUnspecified(cptCodes),
      carcCode: primaryOrUnspecified(carcCodes),
      winningArgument: entry.winningArgument,
      statutoryLanguage: entry.statutoryLanguage,
      outcome: entry.outcome,
      embedding,
      sourceClaimId: args.claimId,
      corpusKey: `won-claim-${args.claimId}`,
    });
    return insertedId;
  },
});
