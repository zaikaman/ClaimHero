import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";

/**
 * List all clinical evidence items for a given claim, ordered by relevance
 */
export const listByClaim = query({
  args: {
    claimId: v.id("claims"),
  },
  handler: async (ctx, args): Promise<Doc<"clinicalEvidences">[]> => {
    const evidences = await ctx.db
      .query("clinicalEvidences")
      .withIndex("by_claim", (q) => q.eq("claimId", args.claimId))
      .collect();

    // Sort by relevance score descending and sanitize raw formatting
    return evidences
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .map((item) => ({
        ...item,
        title: item.title?.replace(/\*\*/g, "") || "",
        citationClause: item.citationClause?.replace(/\*\*/g, "") || "",
        extractedEvidenceMarkdown:
          item.extractedEvidenceMarkdown?.replace(/\*\*/g, "").trim() || "",
      }));
  },
});

/**
 * List clinical evidences by claim and source type (e.g. payer_cpb, pubmed_study)
 */
export const listByClaimAndSource = query({
  args: {
    claimId: v.id("claims"),
    sourceType: v.string(),
  },
  handler: async (ctx, args): Promise<Doc<"clinicalEvidences">[]> => {
    const evidences = await ctx.db
      .query("clinicalEvidences")
      .withIndex("by_claim", (q) => q.eq("claimId", args.claimId))
      .collect();

    return evidences
      .filter((item) => item.sourceType === args.sourceType)
      .map((item) => ({
        ...item,
        title: item.title?.replace(/\*\*/g, "") || "",
        citationClause: item.citationClause?.replace(/\*\*/g, "") || "",
        extractedEvidenceMarkdown:
          item.extractedEvidenceMarkdown?.replace(/\*\*/g, "").trim() || "",
      }));
  },
});

/**
 * Insert a batch of extracted clinical evidence items for a claim
 */
export const insertBatch = mutation({
  args: {
    claimId: v.id("claims"),
    evidences: v.array(
      v.object({
        sourceType: v.string(),
        title: v.string(),
        sourceUrl: v.optional(v.string()),
        citationClause: v.string(),
        extractedEvidenceMarkdown: v.string(),
        relevanceScore: v.number(),
      })
    ),
  },
  handler: async (ctx, args): Promise<Id<"clinicalEvidences">[]> => {
    const claim = await ctx.db.get(args.claimId);
    if (!claim) {
      console.warn(`Claim ${args.claimId} not found during insertBatch; skipping.`);
      return [];
    }

    const now = Date.now();
    const insertedIds: Id<"clinicalEvidences">[] = [];

    for (const item of args.evidences) {
      const id = await ctx.db.insert("clinicalEvidences", {
        claimId: args.claimId,
        sourceType: item.sourceType,
        title: item.title.replace(/\*\*/g, ""),
        sourceUrl: item.sourceUrl,
        citationClause: item.citationClause.replace(/\*\*/g, ""),
        extractedEvidenceMarkdown: item.extractedEvidenceMarkdown.replace(/\*\*/g, "").trim(),
        relevanceScore: item.relevanceScore,
        createdAt: now,
      });
      insertedIds.push(id);
    }

    // Append audit log event
    await ctx.db.insert("appealAuditLogs", {
      claimId: args.claimId,
      eventType: "policy_crawled",
      actor: "Firecrawl & Policy Engine",
      details: `Indexed ${args.evidences.length} clinical policy clauses and medical precedents.`,
      timestamp: now,
    });

    return insertedIds;
  },
});

/**
 * Remove all clinical evidences for a claim (used before re-analyzing)
 */
export const clearByClaim = mutation({
  args: {
    claimId: v.id("claims"),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("clinicalEvidences")
      .withIndex("by_claim", (q) => q.eq("claimId", args.claimId))
      .collect();

    for (const item of existing) {
      await ctx.db.delete(item._id);
    }
  },
});
