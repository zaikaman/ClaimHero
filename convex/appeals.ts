import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";

/**
 * Get an appeal brief by its ID
 */
export const getById = query({
  args: {
    appealId: v.id("appeals"),
  },
  handler: async (ctx, args): Promise<Doc<"appeals"> | null> => {
    return await ctx.db.get(args.appealId);
  },
});

/**
 * Get the latest active appeal brief for a given claim
 */
export const getLatestByClaim = query({
  args: {
    claimId: v.id("claims"),
  },
  handler: async (ctx, args): Promise<Doc<"appeals"> | null> => {
    const list = await ctx.db
      .query("appeals")
      .withIndex("by_claim", (q) => q.eq("claimId", args.claimId))
      .collect();

    if (list.length === 0) return null;
    return list.sort((a, b) => b.version - a.version)[0] || null;
  },
});

/**
 * List all historical versions of appeal briefs for a claim
 */
export const listVersions = query({
  args: {
    claimId: v.id("claims"),
  },
  handler: async (ctx, args): Promise<Doc<"appeals">[]> => {
    const list = await ctx.db
      .query("appeals")
      .withIndex("by_claim", (q) => q.eq("claimId", args.claimId))
      .collect();

    return list.sort((a, b) => b.version - a.version);
  },
});

/**
 * Create an initial appeal brief draft or overwrite current draft
 */
export const createOrUpdateDraft = mutation({
  args: {
    claimId: v.id("claims"),
    appealLevel: v.string(),
    executiveSummary: v.string(),
    medicalNecessityArguments: v.string(),
    legalCitations: v.string(),
    fullAppealMarkdown: v.string(),
    lastEditedBy: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<Id<"appeals">> => {
    const now = Date.now();
    const existing = await ctx.db
      .query("appeals")
      .withIndex("by_claim", (q) => q.eq("claimId", args.claimId))
      .collect();

    const latest = existing.sort((a, b) => b.version - a.version)[0];
    const nextVersion = latest ? latest.version + 1 : 1;

    let appealId: Id<"appeals">;

    if (latest) {
      // Update latest draft and increment version
      await ctx.db.patch(latest._id, {
        version: nextVersion,
        appealLevel: args.appealLevel,
        executiveSummary: args.executiveSummary,
        medicalNecessityArguments: args.medicalNecessityArguments,
        legalCitations: args.legalCitations,
        fullAppealMarkdown: args.fullAppealMarkdown,
        lastEditedBy: args.lastEditedBy || "Clinical Appeal Studio",
        updatedAt: now,
      });
      appealId = latest._id;
    } else {
      // Insert new initial draft
      appealId = await ctx.db.insert("appeals", {
        claimId: args.claimId,
        version: 1,
        appealLevel: args.appealLevel,
        executiveSummary: args.executiveSummary,
        medicalNecessityArguments: args.medicalNecessityArguments,
        legalCitations: args.legalCitations,
        fullAppealMarkdown: args.fullAppealMarkdown,
        lastEditedBy: args.lastEditedBy || "AI Appeal Synthesizer",
        updatedAt: now,
      });
    }

    // Update claim status to ready_for_review
    await ctx.db.patch(args.claimId, {
      status: "ready_for_review",
      updatedAt: now,
    });

    // Add immutable audit log entry
    await ctx.db.insert("appealAuditLogs", {
      claimId: args.claimId,
      eventType: "appeal_draft_updated",
      actor: args.lastEditedBy || "Appeal Studio",
      details: `Saved version ${nextVersion} of ${args.appealLevel.replace(/_/g, " ").toUpperCase()} appeal brief (${args.fullAppealMarkdown.length} characters).`,
      timestamp: now,
    });

    return appealId;
  },
});

/**
 * Save quick inline edits to the full appeal markdown
 */
export const saveDraft = mutation({
  args: {
    appealId: v.id("appeals"),
    fullAppealMarkdown: v.string(),
    lastEditedBy: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const appeal = await ctx.db.get(args.appealId);
    if (!appeal) {
      throw new Error(`Appeal ${args.appealId} not found`);
    }

    await ctx.db.patch(args.appealId, {
      fullAppealMarkdown: args.fullAppealMarkdown,
      lastEditedBy: args.lastEditedBy || "Advocate Editor",
      updatedAt: now,
    });

    return null;
  },
});

/**
 * Update PDF Export storage ID
 */
export const updatePdfStorageId = mutation({
  args: {
    appealId: v.id("appeals"),
    pdfExportStorageId: v.id("_storage"),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.appealId, {
      pdfExportStorageId: args.pdfExportStorageId,
      updatedAt: Date.now(),
    });
  },
});
