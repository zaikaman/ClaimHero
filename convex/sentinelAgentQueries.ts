import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { vStreamArgs, listUIMessages, syncStreams, createThread } from "@convex-dev/agent";
import { components } from "./_generated/api";
import { getAuthUserId, requireChatbotSessionOwner } from "./lib/auth";

/**
 * Expose reactive streaming messages & token deltas for a thread
 */
export const listThreadMessages = query({
  args: {
    threadId: v.string(),
    paginationOpts: paginationOptsValidator,
    streamArgs: vStreamArgs,
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return {
        page: [],
        isDone: true,
        continueCursor: "",
        streams: undefined,
      };
    }

    const paginated = await listUIMessages(ctx, components.agent, args);
    const streams = await syncStreams(ctx, components.agent, args);
    return { ...paginated, streams };
  },
});

/**
 * Get or create an Agent component thread linked to the user's chatbot session
 */
export const getOrCreateAgentThread = mutation({
  args: {
    sessionId: v.id("chatbotSessions"),
  },
  handler: async (ctx, args) => {
    const { session, userId } = await requireChatbotSessionOwner(ctx, args.sessionId);

    if (session.agentThreadId) {
      return { threadId: session.agentThreadId };
    }

    const threadId = await createThread(ctx, components.agent, {
      userId,
      title: session.title || "Sentinel Copilot Session",
    });

    await ctx.db.patch(session._id, {
      agentThreadId: threadId,
      updatedAt: Date.now(),
    });

    return { threadId };
  },
});
