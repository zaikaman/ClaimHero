import { internalMutation, mutation, query, MutationCtx } from "./_generated/server";
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

export const startInboundIntake = internalMutation({
  args: {
    eventId: v.string(),
    messageId: v.string(),
    inboxId: v.string(),
    sender: v.string(),
    recipient: v.string(),
    subject: v.string(),
  },
  returns: v.boolean(),
  handler: async (ctx, args): Promise<boolean> => {
    const existingByEvent = await ctx.db
      .query("agentMailIntakeEvents")
      .withIndex("by_event_id", (q) => q.eq("eventId", args.eventId))
      .first();
    const existingByMessage = await ctx.db
      .query("agentMailIntakeEvents")
      .withIndex("by_message_id", (q) => q.eq("messageId", args.messageId))
      .first();
    const existing = existingByEvent || existingByMessage;

    if (existing?.status === "processing" || existing?.status === "completed") return false;

    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, {
        eventId: args.eventId,
        inboxId: args.inboxId,
        sender: args.sender,
        recipient: args.recipient,
        subject: args.subject,
        status: "processing",
        error: undefined,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("agentMailIntakeEvents", {
        ...args,
        status: "processing",
        receivedAt: now,
        updatedAt: now,
      });
    }

    return true;
  },
});

export const completeInboundIntake = internalMutation({
  args: { eventId: v.string(), claimId: v.id("claims") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const event = await ctx.db
      .query("agentMailIntakeEvents")
      .withIndex("by_event_id", (q) => q.eq("eventId", args.eventId))
      .first();
    if (event) {
      await ctx.db.patch(event._id, {
        status: "completed",
        claimId: args.claimId,
        updatedAt: Date.now(),
      });
    }
    return null;
  },
});

export const failInboundIntake = internalMutation({
  args: { eventId: v.string(), error: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const event = await ctx.db
      .query("agentMailIntakeEvents")
      .withIndex("by_event_id", (q) => q.eq("eventId", args.eventId))
      .first();
    if (event) {
      await ctx.db.patch(event._id, {
        status: "failed",
        error: args.error.slice(0, 1000),
        updatedAt: Date.now(),
      });
    }
    return null;
  },
});
