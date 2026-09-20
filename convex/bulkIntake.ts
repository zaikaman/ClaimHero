import { mutation, query, internalMutation, internalQuery } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { internal } from "./_generated/api";
import { requireAuthUser } from "./lib/auth";
import { intakeWorkpool } from "./lib/intakeWorkpool";
import { vOnComplete } from "@convex-dev/workpool";
import type { Id } from "./_generated/dataModel";

const MAX_BULK_BATCH_SIZE = 50;

/**
 * Enqueue a high-volume batch of medical denial documents for background processing.
 * Designed for RCM clinic billing coordinators ingesting Monday-morning batches (e.g. 40 denials at once).
 * Throttled to maxParallelism: 3 by intakeWorkpool to prevent OpenAI TPM exhaustion.
 */
export const enqueueBulkIntake = mutation({
  args: {
    batchName: v.string(),
    items: v.array(
      v.object({
        fileName: v.string(),
        storageId: v.optional(v.id("_storage")),
        rawDocumentText: v.optional(v.string()),
        patientState: v.optional(v.string()),
        origin: v.optional(v.string()),
      })
    ),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuthUser(ctx);

    if (!args.items || args.items.length === 0) {
      throw new ConvexError("Bulk denial intake requires at least one document item.");
    }
    if (args.items.length > MAX_BULK_BATCH_SIZE) {
      throw new ConvexError(
        `Bulk intake batch exceeds maximum size of ${MAX_BULK_BATCH_SIZE} documents. Please split into smaller clinic batches.`
      );
    }

    const now = Date.now();
    const batchId = await ctx.db.insert("bulkIntakeBatches", {
      userId,
      name: args.batchName.trim() || `RCM Ingestion Batch ${new Date(now).toISOString().slice(0, 10)}`,
      status: "queued",
      totalCount: args.items.length,
      processedCount: 0,
      successCount: 0,
      failureCount: 0,
      createdAt: now,
    });

    for (const item of args.items) {
      const itemId = await ctx.db.insert("bulkIntakeItems", {
        batchId,
        userId,
        fileName: item.fileName,
        storageId: item.storageId,
        rawDocumentText: item.rawDocumentText,
        patientState: item.patientState,
        origin: item.origin,
        status: "queued",
        createdAt: now,
        updatedAt: now,
      });

      // Enqueue to Workpool throttled to concurrency: 3
      await intakeWorkpool.enqueueAction(
        ctx,
        internal.actions.bulkIntakeWorker.processBulkIntakeItemAction,
        {
          itemId,
          batchId,
          userId,
        },
        {
          context: {
            batchId: batchId as string,
            itemId: itemId as string,
          },
          onComplete: internal.bulkIntake.onBulkIntakeItemComplete,
        }
      );
    }

    return {
      batchId,
      totalCount: args.items.length,
      status: "queued",
    };
  },
});

/**
 * Internal mutation to update an item's status to processing.
 */
export const markItemProcessingInternal = internalMutation({
  args: {
    itemId: v.id("bulkIntakeItems"),
  },
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.itemId);
    if (!item) return;

    await ctx.db.patch(args.itemId, {
      status: "processing",
      updatedAt: Date.now(),
    });

    const batch = await ctx.db.get(item.batchId);
    if (batch && batch.status === "queued") {
      await ctx.db.patch(item.batchId, {
        status: "processing",
      });
    }
  },
});

/**
 * Internal query to fetch a bulk intake item.
 */
export const getItemInternal = internalQuery({
  args: {
    itemId: v.id("bulkIntakeItems"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.itemId);
  },
});

/**
 * Internal mutation to update an item's status to completed with created claimId.
 */
export const markItemCompletedInternal = internalMutation({
  args: {
    itemId: v.id("bulkIntakeItems"),
    claimId: v.id("claims"),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.itemId, {
      status: "completed",
      claimId: args.claimId,
      updatedAt: Date.now(),
    });
  },
});

/**
 * Internal mutation to update an item's status to failed with error message.
 */
export const markItemFailedInternal = internalMutation({
  args: {
    itemId: v.id("bulkIntakeItems"),
    error: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.itemId, {
      status: "failed",
      error: args.error,
      updatedAt: Date.now(),
    });
  },
});

/**
 * Workpool onComplete callback for each enqueued bulk intake item.
 * Increments batch progress and checks whether the entire batch has finished.
 */
export const onBulkIntakeItemComplete = internalMutation({
  args: vOnComplete,
  handler: async (ctx, args) => {
    const context = args.context as { batchId: Id<"bulkIntakeBatches">; itemId: Id<"bulkIntakeItems"> };
    if (!context || !context.batchId || !context.itemId) return;

    const batch = await ctx.db.get(context.batchId);
    if (!batch) return;

    const item = await ctx.db.get(context.itemId);
    const isSuccess = args.result.kind === "success";
    const errorMsg = args.result.kind === "failed" ? args.result.error : args.result.kind === "canceled" ? "Canceled" : undefined;

    if (item && item.status !== "completed" && item.status !== "failed") {
      await ctx.db.patch(context.itemId, {
        status: isSuccess ? "completed" : "failed",
        error: errorMsg,
        updatedAt: Date.now(),
      });
    }

    const processedCount = batch.processedCount + 1;
    const successCount = batch.successCount + (isSuccess ? 1 : 0);
    const failureCount = batch.failureCount + (isSuccess ? 0 : 1);

    const isAllDone = processedCount >= batch.totalCount;
    let finalStatus = batch.status;
    if (isAllDone) {
      finalStatus = failureCount === 0 ? "completed" : successCount === 0 ? "failed" : "partial_failed";
    } else {
      finalStatus = "processing";
    }

    await ctx.db.patch(batch._id, {
      processedCount,
      successCount,
      failureCount,
      status: finalStatus,
      ...(isAllDone ? { completedAt: Date.now() } : {}),
    });
  },
});

/**
 * Query recent bulk intake batches for the authenticated user/clinic.
 */
export const getBulkIntakeBatches = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireAuthUser(ctx);
    return await ctx.db
      .query("bulkIntakeBatches")
      .withIndex("by_user_created", (q) => q.eq("userId", userId))
      .order("desc")
      .take(20);
  },
});

/**
 * Query details and individual items for a specific bulk intake batch.
 */
export const getBulkIntakeBatchDetail = query({
  args: {
    batchId: v.id("bulkIntakeBatches"),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuthUser(ctx);
    const batch = await ctx.db.get(args.batchId);
    if (!batch || batch.userId !== userId) {
      throw new ConvexError("Batch not found or unauthorized access.");
    }

    const items = await ctx.db
      .query("bulkIntakeItems")
      .withIndex("by_batch", (q) => q.eq("batchId", args.batchId))
      .collect();

    return {
      batch,
      items,
    };
  },
});
