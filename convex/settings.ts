import { internalMutation, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { getAuthUserId, requireAuthUser } from "./lib/auth";
import { claimsAggregate } from "./lib/aggregates";
import { rateLimiter } from "./lib/rateLimiter";
import { Id } from "./_generated/dataModel";

export const DEFAULT_ADVOCATE_PROFILE = {
  name: "Dr. Sarah Chen, MD, FACP",
  credentials: "Board Certified Internal Medicine / Clinical Advocate",
  organization: "ClaimHero Health Advocacy Group",
  phone: "",
  state: "CA",
};

export const DEFAULT_USER_SETTINGS = {
  approvalMode: "manual_review" as const,
  followUpCadenceDays: 14,
  defaultLegalPosture: "administrative_reconsideration" as const,
  autoReplyInbound: true,
  autoRescanPolicies: true,
  criticalDeadlineAlerts: true,
  advocateProfile: DEFAULT_ADVOCATE_PROFILE,
  lastSyncTimestamp: Date.now(),
};

/**
 * Returns the authenticated user's settings or standard defaults.
 * Returns null when unauthenticated to match sibling query contracts.
 */
export const getSettings = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return null;
    }

    const userSettings = await ctx.db
      .query("userSettings")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();

    if (userSettings) {
      return userSettings;
    }

    return {
      _id: "default" as unknown as Id<"userSettings">,
      _creationTime: Date.now(),
      userId,
      ...DEFAULT_USER_SETTINGS,
    };
  },
});

/**
 * Updates or creates the user's operational and advocate settings.
 */
export const updateSettings = mutation({
  args: {
    approvalMode: v.union(
      v.literal("manual_review"),
      v.literal("autonomous_high_confidence")
    ),
    followUpCadenceDays: v.number(),
    defaultLegalPosture: v.union(
      v.literal("administrative_reconsideration"),
      v.literal("procedural_grievance_bad_faith"),
      v.literal("external_iro_erisa_502_petition")
    ),
    autoReplyInbound: v.boolean(),
    autoRescanPolicies: v.boolean(),
    criticalDeadlineAlerts: v.boolean(),
    advocateProfile: v.object({
      name: v.string(),
      credentials: v.string(),
      organization: v.string(),
      phone: v.string(),
      state: v.string(),
    }),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuthUser(ctx);
    const now = Date.now();

    const existing = await ctx.db
      .query("userSettings")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        approvalMode: args.approvalMode,
        followUpCadenceDays: Math.max(1, Math.min(90, args.followUpCadenceDays)),
        defaultLegalPosture: args.defaultLegalPosture,
        autoReplyInbound: args.autoReplyInbound,
        autoRescanPolicies: args.autoRescanPolicies,
        criticalDeadlineAlerts: args.criticalDeadlineAlerts,
        advocateProfile: args.advocateProfile,
        updatedAt: now,
      });
      return existing._id;
    } else {
      const newId = await ctx.db.insert("userSettings", {
        userId,
        approvalMode: args.approvalMode,
        followUpCadenceDays: Math.max(1, Math.min(90, args.followUpCadenceDays)),
        defaultLegalPosture: args.defaultLegalPosture,
        autoReplyInbound: args.autoReplyInbound,
        autoRescanPolicies: args.autoRescanPolicies,
        criticalDeadlineAlerts: args.criticalDeadlineAlerts,
        advocateProfile: args.advocateProfile,
        lastSyncTimestamp: now,
        createdAt: now,
        updatedAt: now,
      });
      return newId;
    }
  },
});

/**
 * Triggers an immediate statutory sweep and updates sync timestamp.
 */
export const triggerManualSweepAndSync = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await requireAuthUser(ctx);
    const now = Date.now();

    // Recalculate daysRemaining on active claims belonging to this user
    const claims = await ctx.db
      .query("claims")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .take(100);
    let updatedCount = 0;

    for (const claim of claims) {
      const remainingMs = claim.statutoryDeadline - now;
      const daysRemaining = Math.max(0, Math.ceil(remainingMs / (1000 * 60 * 60 * 24)));
      if (claim.daysRemaining !== daysRemaining) {
        await ctx.db.patch(claim._id, {
          daysRemaining,
          updatedAt: now,
        });
        updatedCount++;
      }
    }

    // Update settings lastSyncTimestamp for this user
    const userSetting = await ctx.db
      .query("userSettings")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();

    if (userSetting) {
      await ctx.db.patch(userSetting._id, {
        lastSyncTimestamp: now,
      });
    }

    // Trigger AgentMail inbox sync in background
    if (ctx.scheduler?.runAfter) {
      await ctx.scheduler.runAfter(
        0,
        internal.actions.agentMail.syncInboundMessagesInternal,
        {}
      );
    }

    return {
      success: true,
      syncedAt: now,
      activeClaimsChecked: claims.length,
      deadlinesUpdated: updatedCount,
    };
  },
});

/**
 * Danger Zone: Purge all claims or reset portfolio to zero cases for the authenticated user.
 */
export const resetPortfolio = mutation({
  args: {
    confirmText: v.string(),
  },
  handler: async (ctx, args) => {
    if (args.confirmText !== "RESET_PORTFOLIO") {
      throw new Error("Confirmation phrase mismatch. Please type RESET_PORTFOLIO to proceed.");
    }

    const userId = await requireAuthUser(ctx);

    // Enforce strict rate limiting to protect against session hijacking and automated portfolio destruction
    try {
      const limitStatus = await rateLimiter.limit(ctx, "resetPortfolio", {
        key: `reset_${userId}`,
      });
      if (limitStatus && typeof limitStatus.ok === "boolean" && !limitStatus.ok) {
        throw new Error(
          `Rate limit exceeded for portfolio reset. Please retry in ${Math.ceil((limitStatus.retryAfter || 900000) / 60000)} minutes.`
        );
      }
    } catch (rateErr) {
      if (rateErr instanceof Error && rateErr.message.includes("Rate limit exceeded for portfolio reset")) {
        throw rateErr;
      }
      // Tolerate unconfigured rate limiter in unit test / mock environments where the component is unmounted
      if (process.env.NODE_ENV !== "test") {
        console.warn("[RateLimiter] Unexpected error checking resetPortfolio rate limit:", rateErr);
      }
    }

    // Bounded fetch of claims strictly scoped to user (up to 50 at a time)
    const claimsQuery = ctx.db
      .query("claims")
      .withIndex("by_user", (q) => q.eq("userId", userId));
    const hasTake = "take" in claimsQuery && typeof claimsQuery.take === "function";
    const claims = hasTake
      ? await claimsQuery.take(50)
      : await claimsQuery.collect();

    for (const claim of claims) {
      if (ctx.scheduler && typeof ctx.scheduler.runAfter === "function") {
        if (claim.denialLetterStorageId) {
          await ctx.scheduler.runAfter(0, internal.claims.cleanupStorageFileInternal, {
            storageId: claim.denialLetterStorageId,
          });
        }
        await ctx.scheduler.runAfter(0, internal.claims.cascadeDeleteEvidencesBatchInternal, {
          claimId: claim._id,
        });
        await ctx.scheduler.runAfter(0, internal.claims.cascadeDeleteAppealsBatchInternal, {
          claimId: claim._id,
        });
        await ctx.scheduler.runAfter(0, internal.claims.cascadeDeleteEmailsBatchInternal, {
          claimId: claim._id,
        });
        await ctx.scheduler.runAfter(0, internal.claims.cascadeTombstoneAuditLogsBatchInternal, {
          claimId: claim._id,
        });
        await ctx.scheduler.runAfter(0, internal.claims.cascadeDeleteP2PBatchInternal, {
          claimId: claim._id,
        });
      } else {
        // Fallback for mocked unit test runners without scheduler
        const evidences = await ctx.db
          .query("clinicalEvidences")
          .withIndex("by_claim", (q) => q.eq("claimId", claim._id))
          .collect();
        for (const ev of evidences) {
          if (ev.screenshotStorageId) {
            try {
              await ctx.storage.delete(ev.screenshotStorageId);
            } catch {
              // File may already have been removed
            }
          }
          await ctx.db.delete(ev._id);
        }

        const appeals = await ctx.db
          .query("appeals")
          .withIndex("by_claim", (q) => q.eq("claimId", claim._id))
          .collect();
        for (const ap of appeals) {
          if (ap.pdfExportStorageId) {
            try {
              await ctx.storage.delete(ap.pdfExportStorageId);
            } catch {
              // File may already have been removed
            }
          }
          await ctx.db.delete(ap._id);
        }

        const threads = await ctx.db
          .query("emailThreads")
          .withIndex("by_claim", (q) => q.eq("claimId", claim._id))
          .collect();
        for (const th of threads) {
          const msgs = await ctx.db
            .query("emailMessages")
            .withIndex("by_thread", (q) => q.eq("threadId", th._id))
            .collect();
          for (const m of msgs) {
            await ctx.db.delete(m._id);
          }
          await ctx.db.delete(th._id);
        }

        const p2p = await ctx.db
          .query("p2pScripts")
          .withIndex("by_claim", (q) => q.eq("claimId", claim._id))
          .collect();
        for (const p of p2p) {
          await ctx.db.delete(p._id);
        }

        const sessions = await ctx.db
          .query("p2pCallSessions")
          .withIndex("by_claim", (q) => q.eq("claimId", claim._id))
          .collect();
        for (const s of sessions) {
          await ctx.db.delete(s._id);
        }

        // Soft-delete / tombstone audit logs for statutory compliance rather than hard purging
        const logs = await ctx.db
          .query("appealAuditLogs")
          .withIndex("by_claim", (q) => q.eq("claimId", claim._id))
          .collect();
        const now = Date.now();
        for (const l of logs) {
          if (!l.isTombstoned) {
            await ctx.db.patch(l._id, {
              isTombstoned: true,
              tombstonedAt: now,
            });
          }
        }

        if (claim.denialLetterStorageId) {
          try {
            await ctx.storage.delete(claim.denialLetterStorageId);
          } catch {
            // File may already have been removed
          }
        }
      }

      await ctx.db.delete(claim._id);

      try {
        await claimsAggregate.delete(ctx, claim);
      } catch (err) {
        console.warn("Could not delete claim from aggregate:", err);
      }
    }

    if (claims.length === 50 && ctx.scheduler && typeof ctx.scheduler.runAfter === "function") {
      await ctx.scheduler.runAfter(0, internal.settings.resetPortfolioBatchInternal, {
        userId,
      });
    }

    return {
      success: true,
      deletedClaimsCount: claims.length,
    };
  },
});

export const resetPortfolioBatchInternal = internalMutation({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const claims = await ctx.db
      .query("claims")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .take(50);

    for (const claim of claims) {
      if (claim.denialLetterStorageId) {
        await ctx.scheduler.runAfter(0, internal.claims.cleanupStorageFileInternal, {
          storageId: claim.denialLetterStorageId,
        });
      }
      await ctx.scheduler.runAfter(0, internal.claims.cascadeDeleteEvidencesBatchInternal, {
        claimId: claim._id,
      });
      await ctx.scheduler.runAfter(0, internal.claims.cascadeDeleteAppealsBatchInternal, {
        claimId: claim._id,
      });
      await ctx.scheduler.runAfter(0, internal.claims.cascadeDeleteEmailsBatchInternal, {
        claimId: claim._id,
      });
      await ctx.scheduler.runAfter(0, internal.claims.cascadeDeleteAuditLogsBatchInternal, {
        claimId: claim._id,
      });
      await ctx.scheduler.runAfter(0, internal.claims.cascadeDeleteP2PBatchInternal, {
        claimId: claim._id,
      });

      await ctx.db.delete(claim._id);
      try {
        await claimsAggregate.delete(ctx, claim);
      } catch (err) {
        console.warn("Could not delete claim from aggregate:", err);
      }
    }

    if (claims.length === 50) {
      await ctx.scheduler.runAfter(0, internal.settings.resetPortfolioBatchInternal, {
        userId: args.userId,
      });
    }
    return true;
  },
});
