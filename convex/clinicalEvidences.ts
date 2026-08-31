import { internalMutation, internalQuery, mutation, query, MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { getClaimIfAuthorized, requireClaimOwner } from "./lib/auth";

/**
 * Format and sanitize citation clauses into clean, concise identifiers
 * Prevents long sentences or descriptive text from bloating badge UI.
 */
export function sanitizeCitationClause(raw: string | undefined): string {
  if (!raw) return "Clinical Citation";
  const str = raw.replace(/\*\*/g, "").trim();

  // If formatted as "IDENTIFIER | Long Description Sentence...", extract clean ID
  if (str.includes(" | ")) {
    const parts = str.split(" | ");
    const prefix = parts[0]?.trim();
    const rest = parts.slice(1).join(" | ").trim();

    if (prefix && /^(PMID|NCT|NDA|PMA|510\(k\)|Section|CPB|MCP|LCD|29 CFR|IMR)/i.test(prefix)) {
      if (rest && rest.length <= 25 && rest.split(/\s+/).length <= 3) {
        return `${prefix} • ${rest}`;
      }
      return prefix;
    }
  }

  // If long sentence text was placed in citationClause, clamp to concise reference
  if (str.length > 35) {
    // If it starts with an identifier like "PMID: 123456", extract up to first break
    const match = str.match(/^(PMID:?\s*\d+|NCT\d+|NDA\s*\d+|PMA\s*\d+|Section\s*[\d.]+|29 CFR\s*[\d.-]+)/i);
    if (match) {
      return match[0].trim();
    }
    return str.slice(0, 32) + "...";
  }

  return str;
}

/**
 * List all clinical evidence items for a given claim, ordered by relevance, strictly scoped to authorized claim owner
 */
export const listByClaim = query({
  args: {
    claimId: v.id("claims"),
  },
  handler: async (ctx, args): Promise<Doc<"clinicalEvidences">[]> => {
    const authorized = await getClaimIfAuthorized(ctx, args.claimId);
    if (!authorized) return [];

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
        citationClause: sanitizeCitationClause(item.citationClause),
        extractedEvidenceMarkdown:
          item.extractedEvidenceMarkdown?.replace(/\*\*/g, "").trim() || "",
      }));
  },
});

/**
 * Internal query for background actions to retrieve clinical evidence items
 */
export const listByClaimInternal = internalQuery({
  args: {
    claimId: v.id("claims"),
  },
  handler: async (ctx, args): Promise<Doc<"clinicalEvidences">[]> => {
    const evidences = await ctx.db
      .query("clinicalEvidences")
      .withIndex("by_claim", (q) => q.eq("claimId", args.claimId))
      .collect();

    return evidences
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .map((item) => ({
        ...item,
        title: item.title?.replace(/\*\*/g, "") || "",
        citationClause: sanitizeCitationClause(item.citationClause),
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
    const authorized = await getClaimIfAuthorized(ctx, args.claimId);
    if (!authorized) return [];

    const evidences = await ctx.db
      .query("clinicalEvidences")
      .withIndex("by_claim", (q) => q.eq("claimId", args.claimId))
      .collect();

    return evidences
      .filter((item) => item.sourceType === args.sourceType)
      .map((item) => ({
        ...item,
        title: item.title?.replace(/\*\*/g, "") || "",
        citationClause: sanitizeCitationClause(item.citationClause),
        extractedEvidenceMarkdown:
          item.extractedEvidenceMarkdown?.replace(/\*\*/g, "").trim() || "",
      }));
  },
});

interface ClinicalEvidenceItem {
  sourceType: string;
  title: string;
  sourceUrl?: string;
  citationClause: string;
  extractedEvidenceMarkdown: string;
  relevanceScore: number;
}

interface BatchInsertEvidenceArgs {
  claimId: Id<"claims">;
  evidences: ClinicalEvidenceItem[];
}

async function applyBatchInsert(ctx: MutationCtx, args: BatchInsertEvidenceArgs): Promise<Id<"clinicalEvidences">[]> {
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
      citationClause: sanitizeCitationClause(item.citationClause),
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
}

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
    await requireClaimOwner(ctx, args.claimId);
    return await applyBatchInsert(ctx, args);
  },
});

/**
 * Internal mutation for background actions to insert batches of extracted clinical evidence
 */
export const insertBatchInternal = internalMutation({
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
    return await applyBatchInsert(ctx, args);
  },
});

async function applyClearByClaim(ctx: MutationCtx, claimId: Id<"claims">) {
  const existing = await ctx.db
    .query("clinicalEvidences")
    .withIndex("by_claim", (q) => q.eq("claimId", claimId))
    .collect();

  for (const item of existing) {
    await ctx.db.delete(item._id);
  }
}

/**
 * Remove all clinical evidences for a claim (used before re-analyzing)
 */
export const clearByClaim = mutation({
  args: {
    claimId: v.id("claims"),
  },
  handler: async (ctx, args) => {
    await requireClaimOwner(ctx, args.claimId);
    await applyClearByClaim(ctx, args.claimId);
  },
});

/**
 * Internal mutation for background actions to clear clinical evidences
 */
export const clearByClaimInternal = internalMutation({
  args: {
    claimId: v.id("claims"),
  },
  handler: async (ctx, args) => {
    await applyClearByClaim(ctx, args.claimId);
  },
});

/**
 * Delete a single clinical evidence item
 */
export const deleteEvidence = mutation({
  args: {
    evidenceId: v.id("clinicalEvidences"),
  },
  handler: async (ctx, args) => {
    const evidence = await ctx.db.get(args.evidenceId);
    if (!evidence) return null;

    await requireClaimOwner(ctx, evidence.claimId);
    await ctx.db.delete(args.evidenceId);

    // Audit log
    await ctx.db.insert("appealAuditLogs", {
      claimId: evidence.claimId,
      eventType: "evidence_removed",
      actor: "Clinical Research Officer",
      details: `Removed clinical evidence clause: ${evidence.title} (${evidence.citationClause}).`,
      timestamp: Date.now(),
    });

    return args.evidenceId;
  },
});

interface InsertSingleEvidenceArgs extends ClinicalEvidenceItem {
  claimId: Id<"claims">;
}

async function applyInsertSingle(ctx: MutationCtx, args: InsertSingleEvidenceArgs): Promise<Id<"clinicalEvidences">> {
  const now = Date.now();
  const cleanClause = sanitizeCitationClause(args.citationClause);
  const id = await ctx.db.insert("clinicalEvidences", {
    claimId: args.claimId,
    sourceType: args.sourceType,
    title: args.title.replace(/\*\*/g, ""),
    sourceUrl: args.sourceUrl,
    citationClause: cleanClause,
    extractedEvidenceMarkdown: args.extractedEvidenceMarkdown.replace(/\*\*/g, "").trim(),
    relevanceScore: args.relevanceScore,
    createdAt: now,
  });

  await ctx.db.insert("appealAuditLogs", {
    claimId: args.claimId,
    eventType: "evidence_added",
    actor: "Clinical Research Hub",
    details: `Added ${args.sourceType} evidence clause: ${args.title} (${cleanClause}).`,
    timestamp: now,
  });

  return id;
}

/**
 * Insert a single clinical evidence item
 */
export const insertSingle = mutation({
  args: {
    claimId: v.id("claims"),
    sourceType: v.string(),
    title: v.string(),
    sourceUrl: v.optional(v.string()),
    citationClause: v.string(),
    extractedEvidenceMarkdown: v.string(),
    relevanceScore: v.number(),
  },
  handler: async (ctx, args): Promise<Id<"clinicalEvidences">> => {
    await requireClaimOwner(ctx, args.claimId);
    return await applyInsertSingle(ctx, args);
  },
});

/**
 * Internal mutation for background actions to insert a single clinical evidence item
 */
export const insertSingleInternal = internalMutation({
  args: {
    claimId: v.id("claims"),
    sourceType: v.string(),
    title: v.string(),
    sourceUrl: v.optional(v.string()),
    citationClause: v.string(),
    extractedEvidenceMarkdown: v.string(),
    relevanceScore: v.number(),
  },
  handler: async (ctx, args): Promise<Id<"clinicalEvidences">> => {
    return await applyInsertSingle(ctx, args);
  },
});

/**
 * Return a summary breakdown of evidence counts by source type for a claim
 */
export const listSourcesSummary = query({
  args: {
    claimId: v.id("claims"),
  },
  handler: async (ctx, args) => {
    const authorized = await getClaimIfAuthorized(ctx, args.claimId);
    if (!authorized) {
      return {
        total: 0,
        bySource: {
          payer_cpb: 0,
          pubmed_study: 0,
          fda_package_insert: 0,
          nccn_guideline: 0,
          legal_precedent: 0,
        },
      };
    }

    const evidences = await ctx.db
      .query("clinicalEvidences")
      .withIndex("by_claim", (q) => q.eq("claimId", args.claimId))
      .collect();

    const summary: Record<string, number> = {
      payer_cpb: 0,
      pubmed_study: 0,
      fda_package_insert: 0,
      nccn_guideline: 0,
      legal_precedent: 0,
    };

    for (const item of evidences) {
      summary[item.sourceType] = (summary[item.sourceType] || 0) + 1;
    }

    return {
      total: evidences.length,
      bySource: summary,
    };
  },
});

/**
 * Full-text search across clinical evidence clauses and guidelines using Convex searchIndex
 */
export const searchEvidence = query({
  args: {
    claimId: v.optional(v.id("claims")),
    sourceType: v.optional(v.string()),
    query: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    if (!args.query.trim() || !args.claimId) {
      return [];
    }

    const authorized = await getClaimIfAuthorized(ctx, args.claimId);
    if (!authorized) return [];

    const results = await ctx.db
      .query("clinicalEvidences")
      .withSearchIndex("search_evidence", (q) => {
        let builder = q.search("extractedEvidenceMarkdown", args.query).eq("claimId", args.claimId!);
        if (args.sourceType && args.sourceType !== "all") {
          builder = builder.eq("sourceType", args.sourceType);
        }
        return builder;
      })
      .take(args.limit || 15);

    return results.map((item) => ({
      ...item,
      title: item.title?.replace(/\*\*/g, "") || "",
      citationClause: sanitizeCitationClause(item.citationClause),
    }));
  },
});
