import { mutation, query } from "./_generated/server";
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
  handler: async (ctx, args): Promise<Id<"emailThreads">> => {
    const existing = await ctx.db
      .query("emailThreads")
      .withIndex("by_claim", (q) => q.eq("claimId", args.claimId))
      .collect();

    if (existing.length > 0 && existing[0]) {
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
  },
  handler: async (ctx, args): Promise<Id<"emailMessages">> => {
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
