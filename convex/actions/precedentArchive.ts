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
import { precedentMatchValidator } from "../lib/precedentValidators";
import { requireClaimOwnerAction } from "../lib/auth";

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
 * Re-embed every existing archive row after changing embedding providers.
 * This is intentionally separate from retrieval and should be run once per
 * vector-model migration.
 */
export const reindexArchive = internalAction({
  args: {},
  returns: v.object({
    reindexed: v.number(),
    total: v.number(),
  }),
  handler: async (ctx): Promise<{ reindexed: number; total: number }> => {
    const docs = await ctx.runQuery(
      internal.precedents.listForReindex,
      {}
    );
    if (docs.length > 1000) {
      throw new Error("Precedent archive exceeds the one-shot reindex limit of 1000 rows");
    }

    for (const doc of docs) {
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
    }

    return { reindexed: docs.length, total: docs.length };
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

    let hits = await ctx.vectorSearch("precedents", "by_embedding", {
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
    const cptCodes = args.cptCodes || [];
    const icd10Codes = args.icd10Codes || [];
    const carcCode = args.carcCode || "CO-50";
    const userQuery = args.query.trim();

    if (!userQuery && cptCodes.length === 0 && icd10Codes.length === 0) {
      return [];
    }

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
      const embedding = await createEmbedding(queryText, extraTokens);
      const hits = await ctx.vectorSearch("precedents", "by_embedding", {
        vector: embedding,
        limit: 16,
      });
      const ids = hits.map((h) => h._id);
      const docs: HydratedPrecedent[] = (await ctx.runQuery(internal.precedents.hydrateByIds, { ids })) || [];
      const docsById = new Map(docs.map((d) => [d._id, d]));
      vectorCandidates = hits
        .map((h) => {
          const doc = docsById.get(h._id);
          return doc ? { ...doc, vectorScore: h._score } : null;
        })
        .filter((r): r is NonNullable<typeof r> => r !== null);
    } catch (err) {
      console.warn("Hybrid search vector branch failed:", err);
    }

    // 2. Lexical search path
    let lexicalCandidates: Array<HydratedPrecedent & { textScore: number }> = [];
    try {
      const lexicalQuery = userQuery || buildClaimLexicalTerms(queryFields);
      const docs = await ctx.runQuery(internal.precedents.searchLexicalPrecedentsInternal, {
        query: lexicalQuery,
        limit: 16,
      });
      lexicalCandidates = docs.map((doc, idx) => ({
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
      { limit: args.limit || 5, k: 60 }
    );

    return fused.map((row) => ({
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
