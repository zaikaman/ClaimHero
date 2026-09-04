import { internalMutation, internalQuery, query } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { precedentMatchValidator } from "./lib/precedentValidators";
import { getClaimIfAuthorized, getAuthUserId } from "./lib/auth";

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
 * Read the bounded archive set for the one-shot embedding migration.
 * Reindexing more than 1000 rows should be split into explicit batches.
 */
export const listForReindex = internalQuery({
  args: {},
  handler: async (ctx): Promise<Doc<"precedents">[]> => {
    return await ctx.db.query("precedents").take(1001);
  },
});

export const updateEmbedding = internalMutation({
  args: {
    precedentId: v.id("precedents"),
    embedding: v.array(v.float64()),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    await ctx.db.patch(args.precedentId, { embedding: args.embedding });
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
    const existing = await ctx.db
      .query("precedents")
      .withIndex("by_corpus_key", (q) => q.eq("corpusKey", args.corpusKey))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
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
        embedding: args.embedding,
        sourceClaimId: args.sourceClaimId,
      });
      return existing._id;
    }

    return await ctx.db.insert("precedents", {
      ...args,
      createdAt: Date.now(),
    });
  },
});

/**
 * Persist the top vector matches onto the claim as legal_precedent evidence
 * so Appeal Studio and the synthesizer consume them through the existing
 * evidence subscription.
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

    const userId = await getAuthUserId(ctx);
    if (userId && claim.userId && claim.userId !== userId) {
      throw new Error("Forbidden: You do not have permission to access this claim");
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
      const markdown = [
        match.statutoryLanguage,
        "",
        match.winningArgument,
        "",
        `Outcome: ${match.outcome}`,
        `Vector similarity: ${match.vectorScore.toFixed(4)} | Combined score: ${match.combinedScore.toFixed(4)}`,
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
      await ctx.db.insert("appealAuditLogs", {
        claimId: args.claimId,
        eventType: "precedent_vectors_retrieved",
        actor: "Precedent Vector Archive",
        details: `Convex vector search returned ${args.matches.length} controlling authorities: ${uniqueCitations.join("; ")}.`,
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
      .take(args.limit || 10);

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

