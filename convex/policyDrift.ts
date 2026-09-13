import { query, mutation, internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { getClaimIfAuthorized, requireClaimEditor } from "./lib/auth";
import { appendAuditLog } from "./auditLogs";

export const detectedChangeValidator = v.object({
  category: v.string(), // added_step_therapy, added_exclusion, tightened_criteria, modified_criterion, removed_pathway
  title: v.string(),
  baselineText: v.optional(v.string()),
  liveText: v.string(),
  impact: v.string(),
  isAdverseToClaim: v.boolean(),
});

export const driftSeverityValidator = v.union(
  v.literal("none"),
  v.literal("minor"),
  v.literal("moderate"),
  v.literal("critical_bad_faith")
);

export const driftStatusValidator = v.union(
  v.literal("analyzing"),
  v.literal("completed"),
  v.literal("failed")
);

/**
 * Get the latest policy drift report for a claim, verifying authorization.
 */
export const getLatestDrift = query({
  args: {
    claimId: v.id("claims"),
  },
  handler: async (ctx, args): Promise<Doc<"policyDrifts"> | null> => {
    const claim = await getClaimIfAuthorized(ctx, args.claimId);
    if (!claim) return null;

    const drift = await ctx.db
      .query("policyDrifts")
      .withIndex("by_claim_and_created", (q) => q.eq("claimId", args.claimId))
      .order("desc")
      .first();

    return drift;
  },
});

/**
 * List all policy drift detection history for a claim.
 */
export const listDrifts = query({
  args: {
    claimId: v.id("claims"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<Doc<"policyDrifts">[]> => {
    const claim = await getClaimIfAuthorized(ctx, args.claimId);
    if (!claim) return [];

    const limit = Math.max(1, Math.min(args.limit ?? 20, 50));

    return await ctx.db
      .query("policyDrifts")
      .withIndex("by_claim_and_created", (q) => q.eq("claimId", args.claimId))
      .order("desc")
      .take(limit);
  },
});

/**
 * Internal query to fetch baseline snapshot for a policy URL or claim.
 */
export const getBaselineSnapshotInternal = internalQuery({
  args: {
    urlHash: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("policySnapshots")
      .withIndex("by_url_hash", (q) => q.eq("urlHash", args.urlHash))
      .first();
  },
});

/**
 * Internal mutation called by policyDriftSentinel action to persist the drift report.
 */
export const saveDriftInternal = internalMutation({
  args: {
    claimId: v.id("claims"),
    policyUrl: v.string(),
    policyTitle: v.string(),
    payer: v.optional(v.string()),
    baselineSnapshotId: v.optional(v.id("policySnapshots")),
    baselineCapturedAt: v.number(),
    baselineContentHash: v.string(),
    baselineEffectiveDate: v.optional(v.string()),
    baselineMarkdown: v.string(),
    liveCapturedAt: v.number(),
    liveContentHash: v.string(),
    liveEffectiveDate: v.optional(v.string()),
    liveMarkdown: v.string(),
    hasDrift: v.boolean(),
    isRetroactiveAlteration: v.boolean(),
    severity: driftSeverityValidator,
    summary: v.string(),
    denialDate: v.optional(v.string()),
    serviceDate: v.optional(v.string()),
    detectedChanges: v.array(detectedChangeValidator),
    erisaNoticeDraft: v.optional(v.string()),
    erisaNoticeGeneratedAt: v.optional(v.number()),
    status: driftStatusValidator,
    errorMessage: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<Id<"policyDrifts">> => {
    const now = Date.now();
    const driftId = await ctx.db.insert("policyDrifts", {
      claimId: args.claimId,
      policyUrl: args.policyUrl,
      policyTitle: args.policyTitle,
      payer: args.payer,
      baselineSnapshotId: args.baselineSnapshotId,
      baselineCapturedAt: args.baselineCapturedAt,
      baselineContentHash: args.baselineContentHash,
      baselineEffectiveDate: args.baselineEffectiveDate,
      baselineMarkdown: args.baselineMarkdown,
      liveCapturedAt: args.liveCapturedAt,
      liveContentHash: args.liveContentHash,
      liveEffectiveDate: args.liveEffectiveDate,
      liveMarkdown: args.liveMarkdown,
      hasDrift: args.hasDrift,
      isRetroactiveAlteration: args.isRetroactiveAlteration,
      severity: args.severity,
      summary: args.summary,
      denialDate: args.denialDate,
      serviceDate: args.serviceDate,
      detectedChanges: args.detectedChanges,
      erisaNoticeDraft: args.erisaNoticeDraft,
      erisaNoticeGeneratedAt: args.erisaNoticeGeneratedAt,
      status: args.status,
      errorMessage: args.errorMessage,
      createdAt: now,
      updatedAt: now,
    });

    // Record immutable statutory audit log entry in the Merkle audit chain
    const auditDetails = args.isRetroactiveAlteration
      ? `Retroactive policy alteration flagged for ${args.policyTitle}. ${args.detectedChanges.length} criteria changes detected since baseline snapshot (${args.baselineContentHash.slice(0, 8)} vs ${args.liveContentHash.slice(0, 8)}). ERISA Bad-Faith Notice of Violation drafted.`
      : args.hasDrift
      ? `Policy drift scan completed for ${args.policyTitle}. Minor non-retroactive criteria updates detected.`
      : `Policy drift scan verified for ${args.policyTitle}. Policy content matches baseline snapshot (0 drift detected).`;

    await appendAuditLog(ctx, {
      claimId: args.claimId,
      eventType: "policy_drift_detected",
      actor: "Policy Drift Sentinel",
      details: auditDetails,
      timestamp: now,
    });

    return driftId;
  },
});

/**
 * Update the ERISA Bad-Faith Notice of Violation draft.
 */
export const updateErisaNotice = mutation({
  args: {
    driftId: v.id("policyDrifts"),
    noticeText: v.string(),
  },
  handler: async (ctx, args) => {
    const drift = await ctx.db.get(args.driftId);
    if (!drift) throw new Error("Policy drift record not found");

    await requireClaimEditor(ctx, drift.claimId);

    await ctx.db.patch(args.driftId, {
      erisaNoticeDraft: args.noticeText,
      updatedAt: Date.now(),
    });

    return true;
  },
});

/**
 * Append the generated ERISA Bad-Faith Notice of Violation directly into the active appeal brief.
 */
export const appendErisaNoticeToAppeal = mutation({
  args: {
    claimId: v.id("claims"),
    driftId: v.id("policyDrifts"),
  },
  handler: async (ctx, args) => {
    const drift = await ctx.db.get(args.driftId);
    if (!drift || drift.claimId !== args.claimId) {
      throw new Error("Invalid drift report for this claim");
    }

    if (!drift.erisaNoticeDraft) {
      throw new Error("No ERISA notice draft exists on this drift record");
    }

    await requireClaimEditor(ctx, args.claimId);

    // Find the latest appeal for this claim
    const appeal = await ctx.db
      .query("appeals")
      .withIndex("by_claim", (q) => q.eq("claimId", args.claimId))
      .order("desc")
      .first();

    if (!appeal) {
      throw new Error("No active appeal brief found to append notice to");
    }

    const noticeHeader = "### Exhibit: ERISA Bad-Faith Notice of Violation (Retroactive Policy Alteration)";
    const appendMarker = `\n\n---\n\n${noticeHeader}\n\n`;
    let updatedAppealMarkdown = appeal.fullAppealMarkdown;

    if (updatedAppealMarkdown.includes(noticeHeader)) {
      // Replace existing notice block cleanly if already appended previously
      const delimiter = updatedAppealMarkdown.includes(appendMarker) ? appendMarker : noticeHeader;
      const parts = updatedAppealMarkdown.split(delimiter);
      updatedAppealMarkdown = `${parts[0].trimEnd()}${appendMarker}${drift.erisaNoticeDraft}`;
    } else {
      updatedAppealMarkdown = `${updatedAppealMarkdown.trimEnd()}${appendMarker}${drift.erisaNoticeDraft}`;
    }

    const now = Date.now();
    await ctx.db.patch(appeal._id, {
      fullAppealMarkdown: updatedAppealMarkdown,
      updatedAt: now,
    });

    await appendAuditLog(ctx, {
      claimId: args.claimId,
      eventType: "appeal_edited",
      actor: "Policy Drift Sentinel",
      details: `Appended ERISA Bad-Faith Notice of Violation to active appeal brief (Version ${appeal.version}).`,
      timestamp: now,
    });

    return appeal._id;
  },
});
