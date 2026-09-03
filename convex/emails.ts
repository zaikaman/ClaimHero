import { internalMutation, internalQuery, mutation, query, MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
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

    const threads = await ctx.db
      .query("emailThreads")
      .withIndex("by_claim", (q) => q.eq("claimId", args.claimId))
      .order("desc")
      .collect();

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

    const messages = await ctx.db
      .query("emailMessages")
      .withIndex("by_thread", (q) => q.eq("threadId", args.threadId))
      .order("asc")
      .collect();

    return {
      thread,
      messages,
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
      subject: args.subject,
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
  agentMailMessageId?: string;
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
    agentMailMessageId: args.agentMailMessageId,
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

  // Update claim's status
  await ctx.db.patch(args.claimId, {
    status: args.direction === "inbound" ? "under_review" : "dispatched",
    updatedAt: now,
  });

  // Insert audit log
  await ctx.db.insert("appealAuditLogs", {
    claimId: args.claimId,
    eventType: args.direction === "inbound" ? "payer_response_received" : "appeal_dispatched",
    actor: args.direction === "inbound" ? `Payer (${args.sender})` : `AgentMail (${args.sender})`,
    details: `${args.direction === "inbound" ? "Received reply from" : "Transmitted appeal document to"} ${args.recipient}: "${args.subject}"`,
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
    agentMailMessageId: v.optional(v.string()),
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
    agentMailMessageId: v.optional(v.string()),
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
    agentMailMessageId: v.string(),
    detectedDetermination: v.optional(v.string()),
    clinicalRationale: v.optional(v.string()),
    autoReplyStatus: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const trimmedId = args.agentMailMessageId.trim();
    if (trimmedId) {
      const existing = await ctx.db
        .query("emailMessages")
        .withIndex("by_agent_mail_message_id", (q) => q.eq("agentMailMessageId", trimmedId))
        .first();
      if (existing) {
        return { messageId: existing._id, isNew: false };
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
      agentMailMessageId: trimmedId,
      detectedDetermination: args.detectedDetermination,
      clinicalRationale: args.clinicalRationale,
      autoReplyStatus: args.autoReplyStatus,
      receivedAt: Date.now(),
    });
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
    const existing = await ctx.db
      .query("emailMessages")
      .withIndex("by_agent_mail_message_id", (q) => q.eq("agentMailMessageId", trimmed))
      .first();
    return existing !== null;
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
 * Eliminates running dozens of single queries across the network.
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
 * Clean up existing bounce / delivery failure messages so they don't trigger auto-replies or alerts
 */
export const markBounceMessagesSkippedInternal = internalMutation({
  args: {},
  handler: async (ctx) => {
    const messages = await ctx.db.query("emailMessages").collect();
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
