import { internalMutation, internalQuery, query } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { precedentMatchValidator } from "./lib/precedentValidators";

export { precedentMatchValidator };

const sourceKindValidator = v.union(
  v.literal("winning_brief"),
  v.literal("commissioner_ruling"),
  v.literal("court_overturn"),
  v.literal("statutory_authority")
);

/**
 * Hydrate vector-search hits and preserve caller order.
 */
export const hydrateByIds = internalQuery({
  args: {
    ids: v.array(v.id("precedents")),
  },
  returns: v.array(v.any()),
  handler: async (ctx, args): Promise<Doc<"precedents">[]> => {
    const docs: Doc<"precedents">[] = [];
    for (const id of args.ids) {
      const doc = await ctx.db.get(id);
      if (doc) {
        docs.push(doc);
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

    await ctx.db.insert("appealAuditLogs", {
      claimId: args.claimId,
      eventType: "precedent_vectors_retrieved",
      actor: "Precedent Vector Archive",
      details: `Convex vector search returned ${args.matches.length} controlling authorities: ${args.matches.map((m) => m.citation).join("; ")}.`,
      timestamp: now,
    });

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
