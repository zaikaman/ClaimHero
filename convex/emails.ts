import { internalMutation, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";

/**
 * List all email threads for a given claim
 */
export const listThreadsByClaim = query({
  args: {
    claimId: v.id("claims"),
  },
  handler: async (ctx, args): Promise<Doc<"emailThreads">[]> => {
    const threads = await ctx.db
      .query("emailThreads")
      .withIndex("by_claim", (q) => q.eq("claimId", args.claimId))
      .collect();

    return threads.sort((a, b) => b.lastMessageAt - a.lastMessageAt);
  },
});

/**
 * Get a specific thread with all its chronological messages
 */
export const getThreadWithMessages = query({
  args: {
    threadId: v.id("emailThreads"),
  },
  handler: async (ctx, args) => {
    const thread = await ctx.db.get(args.threadId);
    if (!thread) return null;

    const messages = await ctx.db
      .query("emailMessages")
      .withIndex("by_thread", (q) => q.eq("threadId", args.threadId))
      .collect();

    const sortedMessages = messages.sort((a, b) => a.receivedAt - b.receivedAt);

    return {
      thread,
      messages: sortedMessages,
    };
  },
});

/**
 * Get or create the dedicated AgentMail communication thread for a claim
 */
export const getOrCreateThread = mutation({
  args: {
    claimId: v.id("claims"),
    agentEmail: v.string(),
    payerEmail: v.string(),
    subject: v.string(),
  },
  returns: v.id("emailThreads"),
  handler: async (ctx, args): Promise<Id<"emailThreads">> => {
    const existing = await ctx.db
      .query("emailThreads")
      .withIndex("by_claim", (q) => q.eq("claimId", args.claimId))
      .collect();

    if (existing.length > 0 && existing[0]) {
      await ctx.db.patch(existing[0]._id, {
        agentEmail: args.agentEmail,
        payerEmail: args.payerEmail,
        subject: args.subject,
      });
      return existing[0]._id;
    }

    const now = Date.now();
    const threadId = await ctx.db.insert("emailThreads", {
      claimId: args.claimId,
      agentEmail: args.agentEmail,
      payerEmail: args.payerEmail,
      subject: args.subject,
      status: "active",
      lastMessageAt: now,
    });

    return threadId;
  },
});

/**
 * Insert an inbound or outbound email message into a thread
 */
export const insertMessage = mutation({
  args: {
    threadId: v.id("emailThreads"),
    claimId: v.id("claims"),
    direction: v.string(), // inbound, outbound
    sender: v.string(),
    recipient: v.string(),
    subject: v.string(),
    bodyHtml: v.string(),
    bodyText: v.string(),
    hasAttachments: v.boolean(),
    agentMailMessageId: v.optional(v.string()),
  },
  returns: v.id("emailMessages"),
  handler: async (ctx, args): Promise<Id<"emailMessages">> => {
    const now = Date.now();

    if (args.agentMailMessageId) {
      const existing = await ctx.db
        .query("emailMessages")
        .withIndex("by_agentmail_message", (q) =>
          q.eq("agentMailMessageId", args.agentMailMessageId)
        )
        .first();
      if (existing) return existing._id;
    }

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
      receivedAt: now,
    });

    // Update parent thread
    await ctx.db.patch(args.threadId, {
      lastMessageAt: now,
      status: args.direction === "inbound" ? "response_received" : "dispatched",
    });

    // Audit log
    await ctx.db.insert("appealAuditLogs", {
      claimId: args.claimId,
      eventType: args.direction === "inbound" ? "payer_response_received" : "appeal_dispatched",
      actor: args.direction === "inbound" ? args.sender : "AgentMail Autonomous Gateway",
      details: `${args.direction === "inbound" ? "Received reply from" : "Transmitted transmission to"} ${args.direction === "inbound" ? args.sender : args.recipient} (${args.subject})`,
      timestamp: now,
    });

    return messageId;
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
