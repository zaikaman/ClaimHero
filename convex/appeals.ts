import { MutationCtx, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { getClaimIfAuthorized, requireClaimOwner } from "./lib/auth";

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

interface MockableAppealQuery {
  order?: (dir: "asc" | "desc") => {
    first: () => Promise<Doc<"appeals"> | null>;
    take: (count: number) => Promise<Doc<"appeals">[]>;
  };
  collect: () => Promise<Doc<"appeals">[]>;
}

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

    const q = ctx.db
      .query("appeals")
      .withIndex("by_claimId_and_version", (q) => q.eq("claimId", args.claimId));

    const mockableQ = q as unknown as MockableAppealQuery;
    if (typeof mockableQ.order === "function") {
      return await mockableQ.order("desc").first();
    }
    const list = await mockableQ.collect();
    if (!list || list.length === 0) return null;
    return list.sort((a: Doc<"appeals">, b: Doc<"appeals">) => b.version - a.version)[0] || null;
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
    const q = ctx.db
      .query("appeals")
      .withIndex("by_claimId_and_version", (q) => q.eq("claimId", args.claimId));

    const mockableQ = q as unknown as MockableAppealQuery;
    if (typeof mockableQ.order === "function") {
      return await mockableQ.order("desc").first();
    }
    const list = await mockableQ.collect();
    if (!list || list.length === 0) return null;
    return list.sort((a: Doc<"appeals">, b: Doc<"appeals">) => b.version - a.version)[0] || null;
  },
});

/**
 * Get the latest appeal brief revision for a specific statutory tier
 */
export const getByClaimAndLevel = query({
  args: {
    claimId: v.id("claims"),
    appealLevel: v.string(),
  },
  handler: async (ctx, args): Promise<Doc<"appeals"> | null> => {
    const authorized = await getClaimIfAuthorized(ctx, args.claimId);
    if (!authorized) return null;

    const q = ctx.db
      .query("appeals")
      .withIndex("by_claimId_and_appealLevel", (q) =>
        q.eq("claimId", args.claimId).eq("appealLevel", args.appealLevel)
      );

    const mockableQ = q as unknown as MockableAppealQuery;
    if (typeof mockableQ.order === "function") {
      const items = await mockableQ.order("desc").take(10);
      return items[0] || null;
    }
    const list = await mockableQ.collect();
    if (!list || list.length === 0) return null;
    return list.sort((a: Doc<"appeals">, b: Doc<"appeals">) => b.version - a.version)[0] || null;
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

    const q = ctx.db
      .query("appeals")
      .withIndex("by_claimId_and_version", (q) => q.eq("claimId", args.claimId));

    const mockableQ = q as unknown as MockableAppealQuery;
    if (typeof mockableQ.order === "function") {
      return await mockableQ.order("desc").take(50);
    }
    const list = await mockableQ.collect();
    return list.sort((a: Doc<"appeals">, b: Doc<"appeals">) => b.version - a.version);
  },
});

/**
 * Helper to resolve statutory metadata for a given appeal level
 */
export function getStatutoryTierMetadata(appealLevel: string) {
  switch (appealLevel) {
    case "level_2_grievance":
      return {
        statutoryPosture: "procedural_grievance_bad_faith",
        targetAuthority: "Multi-Disciplinary Peer Review Panel & Appeals Committee",
        legalAggressiveness: "elevated_grievance",
        statutoryAuthorities: [
          "ERISA Section 503 (29 U.S.C. § 1133)",
          "29 C.F.R. § 2560.503-1(h)(3)(iii) (Mandatory Same-Specialty Peer Review)",
          "Department of Labor Claims Procedure Regulations",
        ],
      };
    case "level_3_external_state_review":
      return {
        statutoryPosture: "external_iro_erisa_502_petition",
        targetAuthority: "External Independent Review Organization (IRO) & State Insurance Commissioner",
        legalAggressiveness: "maximum_statutory_enforcement",
        statutoryAuthorities: [
          "ERISA Section 502(a)(1)(B) [29 U.S.C. § 1132(a)(1)(B)] (Civil Enforcement & Benefit Recovery)",
          "ERISA Section 502(g)(1) (Mandatory Attorney's Fees & Cost Shifting)",
          "45 C.F.R. § 147.136 (ACA Federal External Review Mandate)",
          "State Insurance Code Unfair Claims Settlement Practices Act",
          "Statutory Bad-Faith Claims Handling & Prompt-Pay Interest Penalties",
        ],
      };
    case "level_1_internal":
    default:
      return {
        statutoryPosture: "administrative_reconsideration",
        targetAuthority: "Payer Medical Director Review",
        legalAggressiveness: "standard",
        statutoryAuthorities: [
          "ERISA 29 C.F.R. § 2560.503-1 (Full and Fair Review)",
          "Patient Protection and Affordable Care Act § 2719",
          "Published Clinical Policy Bulletins (CPB)",
        ],
      };
  }
}

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
  const claim = await ctx.db.get(args.claimId);
  if (!claim) {
    console.warn(`Claim ${args.claimId} not found during createOrUpdateDraft; skipping.`);
    return null;
  }

  const now = Date.now();
  const existing = await ctx.db
    .query("appeals")
    .withIndex("by_claim", (q) => q.eq("claimId", args.claimId))
    .collect();

  const sorted = existing.sort((a, b) => b.version - a.version);
  const latest = sorted[0];
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

  // Add immutable audit log entry
  await ctx.db.insert("appealAuditLogs", {
    claimId: args.claimId,
    eventType: "appeal_draft_updated",
    actor: args.lastEditedBy || "Appeal Studio",
    details: `Saved revision v${shouldInsertNew ? nextVersion : latest.version} for ${args.appealLevel.replace(/_/g, " ").toUpperCase()} (${targetAuthority}). Statutory Posture: ${statutoryPosture}.`,
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
    appealLevel: v.string(),
    executiveSummary: v.string(),
    medicalNecessityArguments: v.string(),
    legalCitations: v.string(),
    fullAppealMarkdown: v.string(),
    lastEditedBy: v.optional(v.string()),
    statutoryPosture: v.optional(v.string()),
    targetAuthority: v.optional(v.string()),
    legalAggressiveness: v.optional(v.string()),
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
    appealLevel: v.string(),
    executiveSummary: v.string(),
    medicalNecessityArguments: v.string(),
    legalCitations: v.string(),
    fullAppealMarkdown: v.string(),
    lastEditedBy: v.optional(v.string()),
    statutoryPosture: v.optional(v.string()),
    targetAuthority: v.optional(v.string()),
    legalAggressiveness: v.optional(v.string()),
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
    targetLevel: v.string(),
    escalationReason: v.optional(v.string()),
    actor: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
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
