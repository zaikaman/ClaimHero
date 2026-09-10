import { MutationCtx, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { getClaimIfAuthorized, requireClaimOwner } from "./lib/auth";
import {
  STATUTORY_APPEAL_LEVELS,
  STATUTORY_POSTURES,
  STATUTORY_TARGET_AUTHORITIES,
  LEGAL_AGGRESSIVENESS_TIERS,
  appealLevelValidator,
  statutoryPostureValidator,
  targetAuthorityValidator,
  legalAggressivenessValidator,
  assertValidAppealLevel,
  assertValidStatutoryPosture,
  assertValidTargetAuthority,
  assertValidLegalAggressiveness,
  getStatutoryTierMetadata,
  type StatutoryAppealLevel,
  type StatutoryPosture,
  type StatutoryTargetAuthority,
  type LegalAggressivenessTier,
  type StatutoryTierMetadata,
} from "./lib/statutoryTierValidators";

export {
  STATUTORY_APPEAL_LEVELS,
  STATUTORY_POSTURES,
  STATUTORY_TARGET_AUTHORITIES,
  LEGAL_AGGRESSIVENESS_TIERS,
  appealLevelValidator,
  statutoryPostureValidator,
  targetAuthorityValidator,
  legalAggressivenessValidator,
  assertValidAppealLevel,
  assertValidStatutoryPosture,
  assertValidTargetAuthority,
  assertValidLegalAggressiveness,
  getStatutoryTierMetadata,
  type StatutoryAppealLevel,
  type StatutoryPosture,
  type StatutoryTargetAuthority,
  type LegalAggressivenessTier,
  type StatutoryTierMetadata,
};

/**
 * Get an appeal brief by its ID, checking claim ownership
 */
export const getById = query({
  args: {
    appealId: v.id("appeals"),
  },
  handler: async (ctx, args): Promise<Doc<"appeals"> | null> => {
    const appeal = await ctx.db.get(args.appealId);
    if (!appeal) return null;

    const authorized = await getClaimIfAuthorized(ctx, appeal.claimId);
    if (!authorized) return null;

    return appeal;
  },
});

/**
 * Internal query for background actions to retrieve an appeal by ID without auth session checks
 */
export const getByIdInternal = internalQuery({
  args: {
    appealId: v.id("appeals"),
  },
  handler: async (ctx, args): Promise<Doc<"appeals"> | null> => {
    return await ctx.db.get(args.appealId);
  },
});

/**
 * Get the latest active appeal brief for a given claim across all tiers
 */
export const getLatestByClaim = query({
  args: {
    claimId: v.id("claims"),
  },
  handler: async (ctx, args): Promise<Doc<"appeals"> | null> => {
    const authorized = await getClaimIfAuthorized(ctx, args.claimId);
    if (!authorized) return null;

    return await ctx.db
      .query("appeals")
      .withIndex("by_claimId_and_version", (q) => q.eq("claimId", args.claimId))
      .order("desc")
      .first();
  },
});

/**
 * Internal query for background actions to retrieve latest appeal draft
 */
export const getLatestByClaimInternal = internalQuery({
  args: {
    claimId: v.id("claims"),
  },
  handler: async (ctx, args): Promise<Doc<"appeals"> | null> => {
    return await ctx.db
      .query("appeals")
      .withIndex("by_claimId_and_version", (q) => q.eq("claimId", args.claimId))
      .order("desc")
      .first();
  },
});

/**
 * Get the latest appeal brief revision for a specific statutory tier
 */
export const getByClaimAndLevel = query({
  args: {
    claimId: v.id("claims"),
    appealLevel: appealLevelValidator,
  },
  handler: async (ctx, args): Promise<Doc<"appeals"> | null> => {
    assertValidAppealLevel(args.appealLevel);
    const authorized = await getClaimIfAuthorized(ctx, args.claimId);
    if (!authorized) return null;

    return await ctx.db
      .query("appeals")
      .withIndex("by_claimId_and_appealLevel", (q) =>
        q.eq("claimId", args.claimId).eq("appealLevel", args.appealLevel)
      )
      .order("desc")
      .first();
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
    const authorized = await getClaimIfAuthorized(ctx, args.claimId);
    if (!authorized) return [];

    return await ctx.db
      .query("appeals")
      .withIndex("by_claimId_and_version", (q) => q.eq("claimId", args.claimId))
      .order("desc")
      .take(50);
  },
});

interface CreateOrUpdateDraftArgs {
  claimId: Id<"claims">;
  appealLevel: string;
  executiveSummary: string;
  medicalNecessityArguments: string;
  legalCitations: string;
  fullAppealMarkdown: string;
  lastEditedBy?: string;
  statutoryPosture?: string;
  targetAuthority?: string;
  legalAggressiveness?: string;
  statutoryAuthorities?: string[];
  escalationNotes?: string;
  forceNewRevision?: boolean;
}

async function applyCreateOrUpdateDraft(
  ctx: MutationCtx,
  args: CreateOrUpdateDraftArgs
): Promise<Id<"appeals"> | null> {
  assertValidAppealLevel(args.appealLevel);
  assertValidStatutoryPosture(args.statutoryPosture);
  assertValidTargetAuthority(args.targetAuthority);
  assertValidLegalAggressiveness(args.legalAggressiveness);

  const claim = await ctx.db.get(args.claimId);
  if (!claim) {
    console.warn(`Claim ${args.claimId} not found during createOrUpdateDraft; skipping.`);
    return null;
  }

  if (args.fullAppealMarkdown && args.fullAppealMarkdown.length > 500000) {
    throw new Error("fullAppealMarkdown exceeds 500,000 character limit");
  }
  if (args.executiveSummary && args.executiveSummary.length > 50000) {
    throw new Error("executiveSummary exceeds 50,000 character limit");
  }
  if (args.medicalNecessityArguments && args.medicalNecessityArguments.length > 100000) {
    throw new Error("medicalNecessityArguments exceeds 100,000 character limit");
  }
  if (args.legalCitations && args.legalCitations.length > 50000) {
    throw new Error("legalCitations exceeds 50,000 character limit");
  }

  const now = Date.now();
  const latest = await ctx.db
    .query("appeals")
    .withIndex("by_claimId_and_version", (q) => q.eq("claimId", args.claimId))
    .order("desc")
    .first();
  const nextVersion = latest ? latest.version + 1 : 1;

  const tierMeta = getStatutoryTierMetadata(args.appealLevel);
  const statutoryPosture = args.statutoryPosture || tierMeta.statutoryPosture;
  const targetAuthority = args.targetAuthority || tierMeta.targetAuthority;
  const legalAggressiveness = args.legalAggressiveness || tierMeta.legalAggressiveness;
  const statutoryAuthorities = args.statutoryAuthorities || tierMeta.statutoryAuthorities;

  let appealId: Id<"appeals">;

  // Check if we should create a new revision record or update the existing latest record.
  const isDifferentTier = latest && latest.appealLevel !== args.appealLevel;
  const shouldInsertNew = !latest || isDifferentTier || args.forceNewRevision === true;

  if (!shouldInsertNew && latest) {
    // Update existing latest draft for this tier
    await ctx.db.patch(latest._id, {
      appealLevel: args.appealLevel,
      statutoryPosture,
      targetAuthority,
      legalAggressiveness,
      statutoryAuthorities,
      escalationNotes: args.escalationNotes,
      executiveSummary: args.executiveSummary,
      medicalNecessityArguments: args.medicalNecessityArguments,
      legalCitations: args.legalCitations,
      fullAppealMarkdown: args.fullAppealMarkdown,
      lastEditedBy: args.lastEditedBy || "Clinical Appeal Studio",
      updatedAt: now,
    });
    appealId = latest._id;
  } else {
    // Insert new revision record preserving full historical revisions per tier
    appealId = await ctx.db.insert("appeals", {
      claimId: args.claimId,
      version: nextVersion,
      appealLevel: args.appealLevel,
      statutoryPosture,
      targetAuthority,
      legalAggressiveness,
      statutoryAuthorities,
      escalationNotes: args.escalationNotes,
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

  // Add case audit log entry
  await ctx.db.insert("appealAuditLogs", {
    claimId: args.claimId,
    eventType: "appeal_draft_updated",
    actor: args.lastEditedBy || "Appeal Studio",
    details: `Saved revision v${shouldInsertNew ? nextVersion : (latest?.version ?? 1)} for ${args.appealLevel.replace(/_/g, " ").toUpperCase()} (${targetAuthority}). Statutory Posture: ${statutoryPosture}.`,
    timestamp: now,
  });

  return appealId;
}

/**
 * Create a new appeal brief revision or update an existing draft
 */
export const createOrUpdateDraft = mutation({
  args: {
    claimId: v.id("claims"),
    appealLevel: appealLevelValidator,
    executiveSummary: v.string(),
    medicalNecessityArguments: v.string(),
    legalCitations: v.string(),
    fullAppealMarkdown: v.string(),
    lastEditedBy: v.optional(v.string()),
    statutoryPosture: v.optional(statutoryPostureValidator),
    targetAuthority: v.optional(targetAuthorityValidator),
    legalAggressiveness: v.optional(legalAggressivenessValidator),
    statutoryAuthorities: v.optional(v.array(v.string())),
    escalationNotes: v.optional(v.string()),
    forceNewRevision: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<Id<"appeals"> | null> => {
    await requireClaimOwner(ctx, args.claimId);
    return await applyCreateOrUpdateDraft(ctx, args);
  },
});

/**
 * Internal mutation for background actions to create or update an appeal draft
 */
export const createOrUpdateDraftInternal = internalMutation({
  args: {
    claimId: v.id("claims"),
    appealLevel: appealLevelValidator,
    executiveSummary: v.string(),
    medicalNecessityArguments: v.string(),
    legalCitations: v.string(),
    fullAppealMarkdown: v.string(),
    lastEditedBy: v.optional(v.string()),
    statutoryPosture: v.optional(statutoryPostureValidator),
    targetAuthority: v.optional(targetAuthorityValidator),
    legalAggressiveness: v.optional(legalAggressivenessValidator),
    statutoryAuthorities: v.optional(v.array(v.string())),
    escalationNotes: v.optional(v.string()),
    forceNewRevision: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<Id<"appeals"> | null> => {
    return await applyCreateOrUpdateDraft(ctx, args);
  },
});

/**
 * Escalate a claim's statutory appeal tier (e.g. Level 1 -> Level 2 -> Level 3)
 */
export const escalateTier = mutation({
  args: {
    claimId: v.id("claims"),
    targetLevel: appealLevelValidator,
    escalationReason: v.optional(v.string()),
    actor: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    assertValidAppealLevel(args.targetLevel);
    await requireClaimOwner(ctx, args.claimId);

    const now = Date.now();
    const tierMeta = getStatutoryTierMetadata(args.targetLevel);

    // Update claim status to escalated
    await ctx.db.patch(args.claimId, {
      status: "escalated",
      updatedAt: now,
    });

    // Add audit log entry
    const details = args.escalationReason
      ? `Statutory dispute escalated to ${args.targetLevel.replace(/_/g, " ").toUpperCase()} (${tierMeta.targetAuthority}). Reason: ${args.escalationReason}`
      : `Statutory dispute escalated to ${args.targetLevel.replace(/_/g, " ").toUpperCase()} (${tierMeta.targetAuthority}). Increased legal posture to ${tierMeta.legalAggressiveness}.`;

    await ctx.db.insert("appealAuditLogs", {
      claimId: args.claimId,
      eventType: "statutory_tier_escalated",
      actor: args.actor || "Advocate Legal Officer",
      details,
      timestamp: now,
    });

    return {
      success: true,
      targetLevel: args.targetLevel,
      tierMeta,
      claimId: args.claimId,
      escalatedAt: now,
    };
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
    const appeal = await ctx.db.get(args.appealId);
    if (!appeal) {
      throw new Error(`Appeal ${args.appealId} not found`);
    }

    await requireClaimOwner(ctx, appeal.claimId);

    const now = Date.now();
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
    const appeal = await ctx.db.get(args.appealId);
    if (!appeal) {
      throw new Error(`Appeal ${args.appealId} not found`);
    }

    await requireClaimOwner(ctx, appeal.claimId);

    await ctx.db.patch(args.appealId, {
      pdfExportStorageId: args.pdfExportStorageId,
      updatedAt: Date.now(),
    });
  },
});

/**
 * Internal mutation for background actions to update PDF export storage ID without user session auth
 */
export const updatePdfStorageIdInternal = internalMutation({
  args: {
    appealId: v.id("appeals"),
    pdfExportStorageId: v.id("_storage"),
  },
  handler: async (ctx, args) => {
    const appeal = await ctx.db.get(args.appealId);
    if (!appeal) {
      throw new Error(`Appeal ${args.appealId} not found`);
    }

    await ctx.db.patch(args.appealId, {
      pdfExportStorageId: args.pdfExportStorageId,
      updatedAt: Date.now(),
    });
  },
});
