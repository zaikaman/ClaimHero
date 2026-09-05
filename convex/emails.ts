import { internalMutation, internalQuery, mutation, query, MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import { OutboundId } from "@agentmail/convex";
import type { Doc, Id } from "./_generated/dataModel";
import { components, internal } from "./_generated/api";
import { getClaimIfAuthorized, requireClaimOwner } from "./lib/auth";

/**
 * List all email threads for a given claim, scoped to authorized owner
 */
export const listThreadsByClaim = query({
  args: {
    claimId: v.id("claims"),
  },
  handler: async (ctx, args) => {
    await getClaimIfAuthorized(ctx, args.claimId);

    const q = ctx.db
      .query("emailThreads")
      .withIndex("by_claim", (q) => q.eq("claimId", args.claimId))
      .order("desc");

    const qWithTake = q as unknown as {
      take?: (count: number) => Promise<Doc<"emailThreads">[]>;
      collect: () => Promise<Doc<"emailThreads">[]>;
    };

    const threads = typeof qWithTake.take === "function"
      ? await qWithTake.take(50)
      : await qWithTake.collect();

    return threads;
  },
});

/**
 * Get a specific thread along with all its chronological messages
 */
export const getThreadWithMessages = query({
  args: {
    threadId: v.id("emailThreads"),
  },
  handler: async (ctx, args) => {
    const thread = await ctx.db.get(args.threadId);
    if (!thread) return null;

    await getClaimIfAuthorized(ctx, thread.claimId);

    const msgQuery = ctx.db
      .query("emailMessages")
      .withIndex("by_thread", (q) => q.eq("threadId", args.threadId))
      .order("asc");

    const msgQueryWithTake = msgQuery as unknown as {
      take?: (count: number) => Promise<Doc<"emailMessages">[]>;
      collect: () => Promise<Doc<"emailMessages">[]>;
    };

    const messages = typeof msgQueryWithTake.take === "function"
      ? await msgQueryWithTake.take(50)
      : await msgQueryWithTake.collect();

    const messagesWithUrls = await Promise.all(
      messages.map(async (msg) => {
        if (!msg.attachments || msg.attachments.length === 0) {
          return msg;
        }
        const attachmentsWithUrls = await Promise.all(
          msg.attachments.map(async (att) => ({
            ...att,
            url: await ctx.storage.getUrl(att.storageId),
          }))
        );
        return {
          ...msg,
          attachments: attachmentsWithUrls,
        };
      })
    );

    return {
      thread,
      messages: messagesWithUrls,
    };
  },
});

interface GetOrCreateThreadArgs {
  claimId: Id<"claims">;
  agentEmail: string;
  payerEmail: string;
  subject: string;
}

async function applyGetOrCreateThread(ctx: MutationCtx, args: GetOrCreateThreadArgs): Promise<Id<"emailThreads">> {
  const existing = await ctx.db
    .query("emailThreads")
    .withIndex("by_claim", (q) => q.eq("claimId", args.claimId))
    .first();

  if (existing) {
    await ctx.db.patch(existing._id, {
      agentEmail: args.agentEmail,
      payerEmail: args.payerEmail,
      ...(existing.subject ? {} : { subject: args.subject }),
    });
    return existing._id;
  }

  const threadId = await ctx.db.insert("emailThreads", {
    claimId: args.claimId,
    agentEmail: args.agentEmail,
    payerEmail: args.payerEmail,
    subject: args.subject,
    lastMessageAt: Date.now(),
    status: "active",
  });

  return threadId;
}

/**
 * Get or create an email thread for a claim
 */
export const getOrCreateThread = mutation({
  args: {
    claimId: v.id("claims"),
    agentEmail: v.string(),
    payerEmail: v.string(),
    subject: v.string(),
  },
  handler: async (ctx, args) => {
    await requireClaimOwner(ctx, args.claimId);
    return await applyGetOrCreateThread(ctx, args);
  },
});

/**
 * Internal mutation for AgentMail actions to get or create threads
 */
export const getOrCreateThreadInternal = internalMutation({
  args: {
    claimId: v.id("claims"),
    agentEmail: v.string(),
    payerEmail: v.string(),
    subject: v.string(),
  },
  handler: async (ctx, args) => {
    return await applyGetOrCreateThread(ctx, args);
  },
});

interface InsertMessageArgs {
  threadId: Id<"emailThreads">;
  claimId: Id<"claims">;
  direction: "inbound" | "outbound";
  sender: string;
  recipient: string;
  subject: string;
  bodyHtml: string;
  bodyText: string;
  hasAttachments: boolean;
  attachments?: Array<{
    storageId: Id<"_storage">;
    filename: string;
    contentType: string;
    size: number;
  }>;
  agentMailMessageId?: string;
  outboundId?: string;
  detectedDetermination?: string;
  clinicalRationale?: string;
  missingRecordsRequested?: string[];
  settlementAmount?: number;
  autoReplyDraft?: string;
  autoReplyStatus?: string;
}

async function applyInsertMessage(ctx: MutationCtx, args: InsertMessageArgs): Promise<Id<"emailMessages">> {
  const now = Date.now();

  const messageId = await ctx.db.insert("emailMessages", {
    threadId: args.threadId,
    claimId: args.claimId,
    direction: args.direction,
    sender: args.sender,
    recipient: args.recipient,
    subject: args.subject,
    bodyHtml: args.bodyHtml,
    bodyText: args.bodyText,
    hasAttachments: args.hasAttachments,
    attachments: args.attachments,
    agentMailMessageId: args.agentMailMessageId,
    outboundId: args.outboundId,
    detectedDetermination: args.detectedDetermination,
    clinicalRationale: args.clinicalRationale,
    missingRecordsRequested: args.missingRecordsRequested,
    settlementAmount: args.settlementAmount,
    autoReplyDraft: args.autoReplyDraft,
    autoReplyStatus: args.autoReplyStatus,
    receivedAt: now,
  });

  // Update thread's lastMessageAt
  await ctx.db.patch(args.threadId, {
    lastMessageAt: now,
    status: args.direction === "inbound" ? "response_received" : "dispatched",
  });

  // If outbound message, resolve any pending auto-replies on this thread to prevent duplicate/late auto-pilot dispatches
  if (args.direction === "outbound" && typeof ctx.db.query === "function") {
    const pendingMessages = await ctx.db
      .query("emailMessages")
      .withIndex("by_thread", (q) => q.eq("threadId", args.threadId))
      .collect();
    for (const msg of pendingMessages) {
      if (msg.autoReplyStatus === "pending") {
        await ctx.db.patch(msg._id, { autoReplyStatus: "dispatched" });
      }
    }
  }

  // Update claim's status
  const claim = typeof ctx.db.get === "function" ? await ctx.db.get(args.claimId) : null;
  await ctx.db.patch(args.claimId, {
    status: args.direction === "inbound" ? "under_review" : "dispatched",
    updatedAt: now,
  });

  // Track AgentMail message ID in compact index table for fast, lightweight existence checks
  if (args.agentMailMessageId && typeof ctx.db.query === "function") {
    const trimmedId = args.agentMailMessageId.trim();
    if (trimmedId) {
      const existingRecorded = await ctx.db
        .query("recordedAgentMailMessageIds")
        .withIndex("by_agent_mail_message_id", (q) => q.eq("agentMailMessageId", trimmedId))
        .first();
      if (!existingRecorded) {
        await ctx.db.insert("recordedAgentMailMessageIds", {
          agentMailMessageId: trimmedId,
          claimId: args.claimId,
          status: "processed",
          recordedAt: now,
        });
      }
    }
  }

  // Insert audit log (omitting raw subject to prevent storing unredacted PHI in immutable audit trail)
  const auditClaimTag = claim?.claimNumber ? `regarding claim #${claim.claimNumber}` : `regarding claim`;
  await ctx.db.insert("appealAuditLogs", {
    claimId: args.claimId,
    ...(claim?.userId ? { userId: claim.userId } : {}),
    eventType: args.direction === "inbound" ? "payer_response_received" : "appeal_dispatched",
    actor: args.direction === "inbound" ? `Payer (${args.sender})` : `AgentMail (${args.sender})`,
    details: `${args.direction === "inbound" ? "Received reply from" : "Transmitted appeal document to"} ${args.recipient} ${auditClaimTag}`,
    timestamp: now,
  });

  return messageId;
}

/**
 * Insert an inbound or outbound email message into a thread
 */
export const insertMessage = mutation({
  args: {
    threadId: v.id("emailThreads"),
    claimId: v.id("claims"),
    direction: v.union(v.literal("inbound"), v.literal("outbound")),
    sender: v.string(),
    recipient: v.string(),
    subject: v.string(),
    bodyHtml: v.string(),
    bodyText: v.string(),
    hasAttachments: v.boolean(),
    attachments: v.optional(
      v.array(
        v.object({
          storageId: v.id("_storage"),
          filename: v.string(),
          contentType: v.string(),
          size: v.number(),
        })
      )
    ),
    agentMailMessageId: v.optional(v.string()),
    outboundId: v.optional(v.string()),
    detectedDetermination: v.optional(v.string()),
    clinicalRationale: v.optional(v.string()),
    missingRecordsRequested: v.optional(v.array(v.string())),
    settlementAmount: v.optional(v.number()),
    autoReplyDraft: v.optional(v.string()),
    autoReplyStatus: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireClaimOwner(ctx, args.claimId);
    return await applyInsertMessage(ctx, args);
  },
});

/**
 * Internal mutation for AgentMail actions and webhook processors to insert email messages
 */
export const insertMessageInternal = internalMutation({
  args: {
    threadId: v.id("emailThreads"),
    claimId: v.id("claims"),
    direction: v.union(v.literal("inbound"), v.literal("outbound")),
    sender: v.string(),
    recipient: v.string(),
    subject: v.string(),
    bodyHtml: v.string(),
    bodyText: v.string(),
    hasAttachments: v.boolean(),
    attachments: v.optional(
      v.array(
        v.object({
          storageId: v.id("_storage"),
          filename: v.string(),
          contentType: v.string(),
          size: v.number(),
        })
      )
    ),
    agentMailMessageId: v.optional(v.string()),
    outboundId: v.optional(v.string()),
    detectedDetermination: v.optional(v.string()),
    clinicalRationale: v.optional(v.string()),
    missingRecordsRequested: v.optional(v.array(v.string())),
    settlementAmount: v.optional(v.number()),
    autoReplyDraft: v.optional(v.string()),
    autoReplyStatus: v.optional(v.string()),
  },
  returns: v.id("emailMessages"),
  handler: async (ctx, args): Promise<Id<"emailMessages">> => {
    return await applyInsertMessage(ctx, args);
  },
});

/**
 * Update analysis details on an existing email message
 */
export const updateMessageAnalysisInternal = internalMutation({
  args: {
    messageId: v.id("emailMessages"),
    detectedDetermination: v.optional(v.string()),
    clinicalRationale: v.optional(v.string()),
    missingRecordsRequested: v.optional(v.array(v.string())),
    settlementAmount: v.optional(v.number()),
    autoReplyDraft: v.optional(v.string()),
    autoReplyStatus: v.optional(v.string()),
    attachments: v.optional(
      v.array(
        v.object({
          storageId: v.id("_storage"),
          filename: v.string(),
          contentType: v.string(),
          size: v.number(),
        })
      )
    ),
  },
  handler: async (ctx, args) => {
    const { messageId, ...fields } = args;
    await ctx.db.patch(messageId, fields);
  },
});

/**
 * Atomically insert an inbound message, returning isNew: false if this agentMailMessageId was already recorded
 */
export const insertInboundMessageInternal = internalMutation({
  args: {
    threadId: v.id("emailThreads"),
    claimId: v.id("claims"),
    sender: v.string(),
    recipient: v.string(),
    subject: v.string(),
    bodyHtml: v.string(),
    bodyText: v.string(),
    hasAttachments: v.boolean(),
    attachments: v.optional(
      v.array(
        v.object({
          storageId: v.id("_storage"),
          filename: v.string(),
          contentType: v.string(),
          size: v.number(),
        })
      )
    ),
    agentMailMessageId: v.string(),
    detectedDetermination: v.optional(v.string()),
    clinicalRationale: v.optional(v.string()),
    autoReplyStatus: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const trimmedId = args.agentMailMessageId.trim();
    if (trimmedId) {
      const recorded = await ctx.db
        .query("recordedAgentMailMessageIds")
        .withIndex("by_agent_mail_message_id", (q) => q.eq("agentMailMessageId", trimmedId))
        .first();
      if (recorded) {
        const existing = await ctx.db
          .query("emailMessages")
          .withIndex("by_agent_mail_message_id", (q) => q.eq("agentMailMessageId", trimmedId))
          .first();
        if (existing) {
          return { messageId: existing._id, isNew: false };
        }
      } else {
        const existing = await ctx.db
          .query("emailMessages")
          .withIndex("by_agent_mail_message_id", (q) => q.eq("agentMailMessageId", trimmedId))
          .first();
        if (existing) {
          await ctx.db.insert("recordedAgentMailMessageIds", {
            agentMailMessageId: trimmedId,
            claimId: args.claimId,
            status: "processed",
            recordedAt: Date.now(),
          });
          return { messageId: existing._id, isNew: false };
        }
      }
    }
    const messageId = await ctx.db.insert("emailMessages", {
      threadId: args.threadId,
      claimId: args.claimId,
      direction: "inbound",
      sender: args.sender,
      recipient: args.recipient,
      subject: args.subject,
      bodyHtml: args.bodyHtml,
      bodyText: args.bodyText,
      hasAttachments: args.hasAttachments,
      attachments: args.attachments,
      agentMailMessageId: trimmedId,
      detectedDetermination: args.detectedDetermination,
      clinicalRationale: args.clinicalRationale,
      autoReplyStatus: args.autoReplyStatus,
      receivedAt: Date.now(),
    });

    if (trimmedId) {
      await ctx.db.insert("recordedAgentMailMessageIds", {
        agentMailMessageId: trimmedId,
        claimId: args.claimId,
        status: "processed",
        recordedAt: Date.now(),
      });
    }

    return { messageId, isNew: true };
  },
});

/**
 * Internal query to retrieve an email message by its ID
 */
export const getMessageByIdInternal = internalQuery({
  args: {
    messageId: v.id("emailMessages"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.messageId);
  },
});

/**
 * Check if a message with the given agentMailMessageId has already been recorded
 */
export const hasMessageByAgentMailId = internalQuery({
  args: {
    agentMailMessageId: v.string(),
  },
  handler: async (ctx, args) => {
    const trimmed = args.agentMailMessageId.trim();
    if (!trimmed) return false;

    // Check lightweight index table first (~50 bytes read vs full emailMessages doc)
    const recorded = await ctx.db
      .query("recordedAgentMailMessageIds")
      .withIndex("by_agent_mail_message_id", (q) => q.eq("agentMailMessageId", trimmed))
      .first();
    if (recorded !== null) return true;

    const existing = await ctx.db
      .query("emailMessages")
      .withIndex("by_agent_mail_message_id", (q) => q.eq("agentMailMessageId", trimmed))
      .first();
    return existing !== null;
  },
});

/**
 * Atomic check-and-reserve mutation to prevent TOCTOU race conditions between webhook and cron sync
 */
export const reserveAgentMailMessageProcessing = internalMutation({
  args: {
    agentMailMessageId: v.string(),
    claimId: v.optional(v.id("claims")),
  },
  handler: async (ctx, args) => {
    const trimmedId = args.agentMailMessageId.trim();
    if (!trimmedId) return { shouldProcess: false };

    const recorded = await ctx.db
      .query("recordedAgentMailMessageIds")
      .withIndex("by_agent_mail_message_id", (q) => q.eq("agentMailMessageId", trimmedId))
      .first();

    if (recorded) {
      return { shouldProcess: false };
    }

    const existingMsg = await ctx.db
      .query("emailMessages")
      .withIndex("by_agent_mail_message_id", (q) => q.eq("agentMailMessageId", trimmedId))
      .first();

    if (existingMsg) {
      await ctx.db.insert("recordedAgentMailMessageIds", {
        agentMailMessageId: trimmedId,
        claimId: existingMsg.claimId,
        status: "processed",
        recordedAt: Date.now(),
      });
      return { shouldProcess: false };
    }

    // Atomically reserve this message slot in recordedAgentMailMessageIds
    await ctx.db.insert("recordedAgentMailMessageIds", {
      agentMailMessageId: trimmedId,
      claimId: args.claimId,
      status: "processing",
      recordedAt: Date.now(),
    });

    return { shouldProcess: true };
  },
});

/**
 * Internal query to look up a claim by prior AgentMail / SES message ID referenced in In-Reply-To or References
 */
export const getClaimByAgentMailMessageIdInternal = internalQuery({
  args: {
    agentMailMessageId: v.string(),
  },
  handler: async (ctx, args) => {
    const trimmed = args.agentMailMessageId.trim();
    if (!trimmed) return null;
    const msg = await ctx.db
      .query("emailMessages")
      .withIndex("by_agent_mail_message_id", (q) => q.eq("agentMailMessageId", trimmed))
      .first();
    if (!msg) return null;
    return await ctx.db.get(msg.claimId);
  },
});

/**
 * Batch check which AgentMail message IDs are already recorded in emailMessages.
 * Eliminates loading heavy MIME bodies (bodyHtml, bodyText) from emailMessages,
 * reducing Database I/O by >99% by querying the compact recordedAgentMailMessageIds index table first.
 */
export const getExistingAgentMailMessageIds = internalQuery({
  args: {
    agentMailMessageIds: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const existingIds: string[] = [];
    for (const rawId of args.agentMailMessageIds) {
      const trimmed = rawId.trim();
      if (!trimmed) continue;

      // 1. Ultra-lightweight check against compact index table (~50 bytes read)
      const recorded = await ctx.db
        .query("recordedAgentMailMessageIds")
        .withIndex("by_agent_mail_message_id", (q) => q.eq("agentMailMessageId", trimmed))
        .first();
      if (recorded !== null) {
        existingIds.push(trimmed);
        continue;
      }

      // 2. Check ignored / unmatched messages (~50 bytes read)
      const ignored = await ctx.db
        .query("ignoredAgentMailMessages")
        .withIndex("by_agent_mail_message_id", (q) => q.eq("agentMailMessageId", trimmed))
        .first();
      if (ignored !== null) {
        existingIds.push(trimmed);
        continue;
      }

      // 3. Fallback check for messages ingested prior to compact index introduction
      const existing = await ctx.db
        .query("emailMessages")
        .withIndex("by_agent_mail_message_id", (q) => q.eq("agentMailMessageId", trimmed))
        .first();
      if (existing !== null) {
        existingIds.push(trimmed);
      }
    }
    return existingIds;
  },
});

/**
 * One-time / background backfill to ensure all existing emailMessages with an agentMailMessageId
 * are indexed in recordedAgentMailMessageIds, preventing legacy document full-scans in getExistingAgentMailMessageIds.
 */
export const backfillRecordedMessageIdsInternal = internalMutation({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = Math.min(args.limit ?? 100, 200);
    const messages = await ctx.db
      .query("emailMessages")
      .order("desc")
      .take(limit);

    let backfilledCount = 0;
    for (const msg of messages) {
      if (msg.agentMailMessageId) {
        const trimmed = msg.agentMailMessageId.trim();
        if (trimmed) {
          const recorded = await ctx.db
            .query("recordedAgentMailMessageIds")
            .withIndex("by_agent_mail_message_id", (q) => q.eq("agentMailMessageId", trimmed))
            .first();
          if (!recorded) {
            await ctx.db.insert("recordedAgentMailMessageIds", {
              agentMailMessageId: trimmed,
              claimId: msg.claimId,
              status: "processed",
              recordedAt: msg.receivedAt || msg._creationTime || Date.now(),
            });
            backfilledCount++;
          }
        }
      }
    }
    return { backfilledCount };
  },
});

/**
 * Record an AgentMail message ID that does not match any claim to avoid re-processing loops
 */
export const recordIgnoredAgentMailMessageInternal = internalMutation({
  args: {
    agentMailMessageId: v.string(),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const trimmed = args.agentMailMessageId.trim();
    if (!trimmed) return null;
    const now = Date.now();
    const existing = await ctx.db
      .query("ignoredAgentMailMessages")
      .withIndex("by_agent_mail_message_id", (q) => q.eq("agentMailMessageId", trimmed))
      .first();
    if (!existing) {
      await ctx.db.insert("ignoredAgentMailMessages", {
        agentMailMessageId: trimmed,
        reason: args.reason,
        ignoredAt: now,
      });
    }

    const recorded = await ctx.db
      .query("recordedAgentMailMessageIds")
      .withIndex("by_agent_mail_message_id", (q) => q.eq("agentMailMessageId", trimmed))
      .first();
    if (!recorded) {
      await ctx.db.insert("recordedAgentMailMessageIds", {
        agentMailMessageId: trimmed,
        status: "ignored",
        recordedAt: now,
      });
    }

    return null;
  },
});

/**
 * Clean up messages that were falsely associated with a claim due to partial prefix matching
 */
export const cleanupMismatchedMessagesForClaim = mutation({
  args: {
    claimId: v.id("claims"),
  },
  handler: async (ctx, args) => {
    const claim = await ctx.db.get(args.claimId);
    if (!claim) return { deletedCount: 0 };

    const cNum = (claim.claimNumber || "").toLowerCase();
    const messages = await ctx.db
      .query("emailMessages")
      .withIndex("by_claim", (q) => q.eq("claimId", args.claimId))
      .collect();

    let deletedCount = 0;
    for (const msg of messages) {
      const text = `${msg.subject || ""} ${msg.bodyText || ""}`.toLowerCase();
      // If the message does not contain the exact claim number of this claim, it was falsely matched
      if (!text.includes(cNum)) {
        await ctx.db.delete(msg._id);
        deletedCount++;
      }
    }

    const remaining = await ctx.db
      .query("emailMessages")
      .withIndex("by_claim", (q) => q.eq("claimId", args.claimId))
      .collect();

    if (remaining.length === 0) {
      const threads = await ctx.db
        .query("emailThreads")
        .withIndex("by_claim", (q) => q.eq("claimId", args.claimId))
        .collect();
      for (const th of threads) {
        await ctx.db.delete(th._id);
      }
      if (claim.status === "escalated" || claim.status === "dispatched" || claim.status === "under_review") {
        await ctx.db.patch(args.claimId, { status: "ready_for_review" });
      }
    }

    return { deletedCount };
  },
});

/**
 * Clean up existing bounce / delivery failure messages so they don't trigger auto-replies or alerts
 */
export const markBounceMessagesSkippedInternal = internalMutation({
  args: {},
  handler: async (ctx) => {
    const messages = await ctx.db.query("emailMessages").take(100);
    let patched = 0;
    for (const msg of messages) {
      const subj = (msg.subject || "").toLowerCase();
      const sender = (msg.sender || "").toLowerCase();
      const body = (msg.bodyText || "").toLowerCase();
      const isBounce =
        subj.includes("delivery status notification") ||
        subj.includes("undelivered mail") ||
        subj.includes("mail delivery failed") ||
        sender.includes("mailer-daemon") ||
        sender.includes("postmaster") ||
        sender.includes("amazonses.com") ||
        body.includes("550 5.1.1") ||
        body.includes("diagnostic-code: smtp");

      if (isBounce && (msg.autoReplyStatus === "pending" || msg.detectedDetermination !== "DELIVERY_FAILURE")) {
        await ctx.db.patch(msg._id, {
          detectedDetermination: "DELIVERY_FAILURE",
          autoReplyStatus: "skipped",
          clinicalRationale: "Outbound delivery bounced or rejected by mail server.",
        });
        patched++;
      }
    }
    return { patched };
  },
});

/**
 * Toggle or update Auto-Pilot status on a claim
 */
export const setClaimAutoPilot = mutation({
  args: {
    claimId: v.id("claims"),
    enabled: v.boolean(),
  },
  handler: async (ctx, args) => {
    await requireClaimOwner(ctx, args.claimId);
    await ctx.db.patch(args.claimId, {
      autoPilotEnabled: args.enabled,
      updatedAt: Date.now(),
    });
    return { success: true, enabled: args.enabled };
  },
});

/**
 * Query inbound messages with pending auto-reply drafts whose SLA delay has elapsed.
 * Uses compound index `by_auto_reply_status_and_received_at` to perform a bounded range scan
 * strictly on messages that have reached maxReceivedAt. Scans 0 documents when no messages qualify.
 */
export const getPendingAutoPilotMessagesInternal = internalQuery({
  args: {
    maxReceivedAt: v.number(),
  },
  handler: async (ctx, args) => {
    const pendingMessages = await ctx.db
      .query("emailMessages")
      .withIndex("by_auto_reply_status_and_received_at", (q) =>
        q.eq("autoReplyStatus", "pending").lte("receivedAt", args.maxReceivedAt)
      )
      .take(20);

    const readyMessages = [];
    for (const msg of pendingMessages) {
      if (
        msg.direction === "inbound" &&
        msg.receivedAt <= args.maxReceivedAt &&
        msg.autoReplyDraft &&
        msg.autoReplyDraft.trim()
      ) {
        readyMessages.push({
          messageId: msg._id,
          claimId: msg.claimId,
          threadId: msg.threadId,
          autoReplyDraft: msg.autoReplyDraft,
          receivedAt: msg.receivedAt,
          detectedDetermination: msg.detectedDetermination,
        });
      }
    }
    return readyMessages;
  },
});

/**
 * Lightweight internal query to check an individual message's eligibility for autonomous dispatch.
 * Replaces loading the entire 50-message thread with heavy MIME HTML bodies via getThreadWithMessages.
 */
export const getAutoPilotMessageStateInternal = internalQuery({
  args: {
    messageId: v.id("emailMessages"),
    threadId: v.id("emailThreads"),
  },
  handler: async (ctx, args) => {
    const message = await ctx.db.get(args.messageId);
    if (!message) return null;

    // Check if any subsequent outbound message was already sent on this thread
    const msgReceivedAt = message.receivedAt || message._creationTime || 0;
    const recentMessages = await ctx.db
      .query("emailMessages")
      .withIndex("by_thread", (q) => q.eq("threadId", args.threadId))
      .order("desc")
      .take(10);

    const hasSubsequentOutbound = recentMessages.some(
      (m) => m.direction === "outbound" && (m.receivedAt || m._creationTime || 0) > msgReceivedAt
    );

    return {
      messageId: message._id,
      autoReplyStatus: message.autoReplyStatus,
      autoReplyDraft: message.autoReplyDraft,
      hasSubsequentOutbound,
    };
  },
});

/**
 * Mark a message's auto-reply status as dispatched
 */
export const markAutoReplyDispatchedInternal = internalMutation({
  args: {
    messageId: v.id("emailMessages"),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.messageId, {
      autoReplyStatus: "dispatched",
    });
  },
});

/**
 * User mutation to dismiss a pending auto-reply draft from the UI
 */
export const dismissAutoReplyDraft = mutation({
  args: {
    claimId: v.id("claims"),
    messageId: v.id("emailMessages"),
  },
  handler: async (ctx, args) => {
    await requireClaimOwner(ctx, args.claimId);
    const msg = await ctx.db.get(args.messageId);
    if (!msg || msg.claimId !== args.claimId) {
      throw new Error("Message not found or mismatch with claim");
    }
    await ctx.db.patch(args.messageId, {
      autoReplyStatus: "dismissed",
    });
    return { success: true };
  },
});

/**
 * Hook invoked by the AgentMail component when an inbound message lands.
 * Automatically delegates to processInboundClaimReply for clinical extraction,
 * auto-pilot scheduling, and proactive notifications.
 */
export const onMessageReceived = internalMutation({
  args: {
    message: v.any(),
    thread: v.any(),
    eventId: v.string(),
  },
  handler: async (ctx, args) => {
    const msg = args.message as { inbox_id?: string; message_id?: string } | undefined;
    const inboxId = msg?.inbox_id;
    const messageId = msg?.message_id;
    if (inboxId && messageId) {
      await ctx.scheduler.runAfter(0, internal.actions.agentMail.processInboundClaimReply, {
        inboxId,
        messageId,
        eventId: args.eventId,
      });
    }
  },
});

/**
 * Reactive query over inbound messages persisted directly in the AgentMail component database
 */
export const listComponentInboundMessages = query({
  args: {
    threadId: v.optional(v.string()),
    inboxId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await ctx.runQuery(components.agentmail.lib.listInboundMessages, {
      threadId: args.threadId,
      inboxId: args.inboxId,
    });
  },
});

/**
 * Reactive query for live delivery status of an outbound email from the AgentMail component
 */
export const getOutboundDeliveryStatus = query({
  args: {
    outboundId: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.runQuery(components.agentmail.lib.getOutboundStatus, {
      outboundId: args.outboundId as unknown as OutboundId,
    });
  },
});

