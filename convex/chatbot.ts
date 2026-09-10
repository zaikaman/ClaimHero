import { query, mutation, internalQuery, internalMutation, MutationCtx } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import type { Id, Doc } from "./_generated/dataModel";
import { rateLimiter } from "./lib/rateLimiter";
import {
  getChatbotSessionIfAuthorized,
  requireAuthUser,
  requireChatbotSessionOwner,
  requireClaimOwner,
  getAuthUserId,
} from "./lib/auth";

/**
 * List all chatbot sessions for the authenticated user
 */
export const listSessions = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return [];
    }

    return await ctx.db
      .query("chatbotSessions")
      .withIndex("by_user_updated", (q) => q.eq("userId", userId))
      .order("desc")
      .take(20);
  },
});

/**
 * Get or create the active chatbot session
 */
export const getOrCreateSession = mutation({
  args: {
    activeClaimId: v.optional(v.id("claims")),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuthUser(ctx);
    const now = Date.now();

    if (args.activeClaimId) {
      await requireClaimOwner(ctx, args.activeClaimId);
    }

    // Check if there is an existing recent session
    const existingSession = await ctx.db
      .query("chatbotSessions")
      .withIndex("by_user_updated", (q) => q.eq("userId", userId))
      .order("desc")
      .first();

    if (existingSession) {
      // If claimId changed and was provided, patch the session
      if (args.activeClaimId && existingSession.activeClaimId !== args.activeClaimId) {
        await ctx.db.patch(existingSession._id, {
          activeClaimId: args.activeClaimId,
          updatedAt: now,
        });
      }
      return existingSession._id;
    }

    // Create a new session
    const sessionId = await ctx.db.insert("chatbotSessions", {
      userId,
      title: "Clinical & Appellate Inquiry",
      activeClaimId: args.activeClaimId,
      messageCount: 0,
      createdAt: now,
      updatedAt: now,
    });

    return sessionId;
  },
});

/**
 * Get a specific chatbot session, strictly verifying ownership
 */
export const getSession = query({
  args: {
    sessionId: v.id("chatbotSessions"),
  },
  handler: async (ctx, args) => {
    return await getChatbotSessionIfAuthorized(ctx, args.sessionId);
  },
});

/**
 * Internal query for background actions to retrieve a chatbot session
 */
export const getSessionInternal = internalQuery({
  args: {
    sessionId: v.id("chatbotSessions"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.sessionId);
  },
});

/**
 * List all messages in a session, verifying session ownership
 */
export const listMessages = query({
  args: {
    sessionId: v.id("chatbotSessions"),
  },
  handler: async (ctx, args) => {
    const session = await getChatbotSessionIfAuthorized(ctx, args.sessionId);
    if (!session) return [];

    return await ctx.db
      .query("chatbotMessages")
      .withIndex("by_session_and_time", (q) => q.eq("sessionId", args.sessionId))
      .order("asc")
      .take(100);
  },
});

/**
 * Internal query for chatbot actions to list messages
 */
export const listMessagesInternal = internalQuery({
  args: {
    sessionId: v.id("chatbotSessions"),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("chatbotMessages")
      .withIndex("by_session_and_time", (q) => q.eq("sessionId", args.sessionId))
      .order("asc")
      .take(100);
  },
});

interface AddMessageArgs {
  sessionId: Id<"chatbotSessions">;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  toolCalls?: Array<{
    id: string;
    name: string;
    arguments: string;
    output?: string;
  }>;
}

async function applyAddMessage(ctx: MutationCtx, args: AddMessageArgs) {
  const session = await ctx.db.get(args.sessionId);
  if (!session) throw new Error("Chatbot session not found");

  const now = Date.now();
  const messageId = await ctx.db.insert("chatbotMessages", {
    sessionId: args.sessionId,
    role: args.role,
    content: args.content,
    toolCalls: args.toolCalls,
    createdAt: now,
  });

  // Auto update title if this is the first user message
  let title = session.title;
  if (session.messageCount === 0 && args.role === "user") {
    title = args.content.slice(0, 45).trim();
    if (args.content.length > 45) title += "...";
  }

  await ctx.db.patch(args.sessionId, {
    title,
    messageCount: (session.messageCount || 0) + 1,
    updatedAt: now,
  });

  return messageId;
}

/**
 * Add a message to a session
 */
export const addMessage = mutation({
  args: {
    sessionId: v.id("chatbotSessions"),
    role: v.literal("user"),
    content: v.string(),
    toolCalls: v.optional(
      v.array(
        v.object({
          id: v.string(),
          name: v.string(),
          arguments: v.string(),
          output: v.optional(v.string()),
        })
      )
    ),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireChatbotSessionOwner(ctx, args.sessionId);

    // Enforce chatMessage rate limiting per user/session
    try {
      const limitStatus = await rateLimiter.limit(ctx, "chatMessage", {
        key: userId || args.sessionId,
      });
      if (!limitStatus.ok) {
        throw new ConvexError({
          code: "RATE_LIMITED",
          status: 429,
          message: `Chat message rate limit exceeded. Please wait ${Math.ceil((limitStatus.retryAfter || 1000) / 1000)}s before sending another message.`,
        });
      }
    } catch (rateErr) {
      if (rateErr instanceof ConvexError) throw rateErr;
      if (process.env.NODE_ENV !== "test") {
        console.warn("[RateLimiter] Unexpected error checking chatMessage rate limit:", rateErr);
      }
    }

    return await applyAddMessage(ctx, args);
  },
});

/**
 * Internal mutation for background actions to add messages
 */
export const addMessageInternal = internalMutation({
  args: {
    sessionId: v.id("chatbotSessions"),
    role: v.union(v.literal("user"), v.literal("assistant"), v.literal("system"), v.literal("tool")),
    content: v.string(),
    toolCalls: v.optional(
      v.array(
        v.object({
          id: v.string(),
          name: v.string(),
          arguments: v.string(),
          output: v.optional(v.string()),
        })
      )
    ),
  },
  handler: async (ctx, args) => {
    return await applyAddMessage(ctx, args);
  },
});

/**
 * Clear all messages in a session
 */
export const clearSession = mutation({
  args: {
    sessionId: v.id("chatbotSessions"),
  },
  handler: async (ctx, args) => {
    await requireChatbotSessionOwner(ctx, args.sessionId);

    const messages = await ctx.db
      .query("chatbotMessages")
      .withIndex("by_session_and_time", (q) => q.eq("sessionId", args.sessionId))
      .take(200);

    for (const msg of messages) {
      await ctx.db.delete(msg._id);
    }

    await ctx.db.patch(args.sessionId, {
      messageCount: 0,
      summary: undefined,
      agentThreadId: undefined,
      title: "Clinical & Appellate Inquiry",
      updatedAt: Date.now(),
    });

    return { success: true };
  },
});

/**
 * Increment message count for a session
 */
export const incrementSessionMessageCount = internalMutation({
  args: {
    sessionId: v.id("chatbotSessions"),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) return;
    await ctx.db.patch(args.sessionId, {
      messageCount: (session.messageCount || 0) + 1,
      updatedAt: Date.now(),
    });
  },
});

/**
 * Update session summary
 */
export const updateSessionSummary = internalMutation({
  args: {
    sessionId: v.id("chatbotSessions"),
    summary: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.sessionId, {
      summary: args.summary,
      updatedAt: Date.now(),
    });
  },
});

/**
 * Internal mutation to update session summary and trim older messages
 * to enforce bounded history and prevent unbounded table growth.
 */
export const summarizeAndTrimSessionInternal = internalMutation({
  args: {
    sessionId: v.id("chatbotSessions"),
    summary: v.string(),
    keepRecentCount: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const keepCount = Math.max(4, args.keepRecentCount ?? 10);
    const now = Date.now();

    // Fetch all messages in the session ordered oldest first
    const messages = await ctx.db
      .query("chatbotMessages")
      .withIndex("by_session_and_time", (q) => q.eq("sessionId", args.sessionId))
      .order("asc")
      .take(100);

    // If more messages than the keep threshold, delete the older ones
    if (messages.length > keepCount) {
      const messagesToDelete = messages.slice(0, messages.length - keepCount);
      for (const msg of messagesToDelete) {
        await ctx.db.delete(msg._id);
      }
    }

    const remainingCount = Math.min(messages.length, keepCount);

    await ctx.db.patch(args.sessionId, {
      summary: args.summary,
      messageCount: remainingCount,
      updatedAt: now,
    });

    return { trimmedCount: Math.max(0, messages.length - keepCount), remainingCount };
  },
});

/* ========================================================================= */
/* Internal Tool Call Data Access Queries                                    */
/* ========================================================================= */

/**
 * Tool: Fetch full claim data
 */
export const getClaimDataForChatbot = internalQuery({
  args: {
    claimId: v.optional(v.id("claims")),
    claimNumber: v.optional(v.string()),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    let claim = null;
    if (args.claimId) {
      claim = await ctx.db.get(args.claimId);
    } else if (args.claimNumber) {
      const candidateClaims = await ctx.db
        .query("claims")
        .withIndex("by_claim_number", (q) => q.eq("claimNumber", args.claimNumber!))
        .take(5);
      claim = candidateClaims.find((c) => c.userId === args.userId) || null;
    }

    if (!claim) return null;

    if (!claim.userId || claim.userId !== args.userId) {
      return null;
    }

    const patient = await ctx.db.get(claim.patientId);

    return {
      claimId: claim._id,
      claimNumber: claim.claimNumber,
      patientName: patient?.name ?? "Unknown Patient",
      patientEmail: patient?.email ?? "",
      patientMemberId: patient?.memberId ?? "",
      patientState: patient?.state ?? "",
      insurancePayer: patient?.insurancePayer ?? "",
      serviceDate: claim.serviceDate,
      providerName: claim.providerName,
      deniedAmount: claim.deniedAmount,
      patientOwedAmount: claim.patientOwedAmount,
      cptCodes: claim.cptCodes,
      icd10Codes: claim.icd10Codes,
      denialReasonCode: claim.denialReasonCode,
      denialReasonDescription: claim.denialReasonDescription,
      status: claim.status,
      statutoryDeadline: claim.statutoryDeadline,
      daysRemaining: claim.daysRemaining,
      overturnProbabilityScore: claim.overturnProbabilityScore,
      riskLevel: claim.riskLevel,
      scoringBreakdown: claim.scoringBreakdown,
      appealContext: claim.appealContext,
      financialLiability: claim.financialLiability,
      erisaPenalties: claim.erisaPenalties,
      payerContact: claim.payerContact,
      assignedAgentEmail: claim.assignedAgentEmail,
    };
  },
});

/**
 * Tool: Search claims
 */
export const searchClaimsForChatbot = internalQuery({
  args: {
    searchTerm: v.optional(v.string()),
    status: v.optional(v.string()),
    limit: v.optional(v.number()),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const limit = Math.max(1, Math.min(args.limit ?? 5, 100));
    const term = args.searchTerm?.trim();
    let claims: Doc<"claims">[] = [];
    let usedSearchIndex = false;

    if (term) {
      try {
        const searchResults = await ctx.db
          .query("claims")
          .withSearchIndex("search_claims", (q) => {
            let builder = q
              .search("searchContent", term)
              .eq("userId", args.userId);
            if (args.status && args.status !== "all") {
              builder = builder.eq("status", args.status);
            }
            return builder;
          })
          .take(limit);

        // Augment with direct claimNumber match if search results have capacity
        if (searchResults.length < limit) {
          const directMatch = await ctx.db
            .query("claims")
            .withIndex("by_claim_number", (q) => q.eq("claimNumber", term))
            .first();
          if (
            directMatch &&
            directMatch.userId === args.userId &&
            (!args.status || args.status === "all" || directMatch.status === args.status)
          ) {
            if (!searchResults.some((r) => r._id === directMatch._id)) {
              searchResults.push(directMatch);
            }
          }
        }

        claims = searchResults.slice(0, limit);
        usedSearchIndex = true;
      } catch {
        usedSearchIndex = false;
      }
    }

    if (!usedSearchIndex) {
      claims = args.status && args.status !== "all"
        ? await ctx.db
            .query("claims")
            .withIndex("by_user_status", (q) =>
              q.eq("userId", args.userId).eq("status", args.status!)
            )
            .order("desc")
            .take(limit)
        : await ctx.db
            .query("claims")
            .withIndex("by_user", (q) => q.eq("userId", args.userId))
            .order("desc")
            .take(limit);
    }

    // Populate patient names
    const populated = await Promise.all(
      claims.map(async (c: Doc<"claims">) => {
        const patient = (await ctx.db.get(c.patientId)) as Doc<"patients"> | null;
        return {
          claimId: c._id,
          claimNumber: c.claimNumber,
          patientName: patient?.name ?? c.patientName ?? "Patient",
          payer: patient?.insurancePayer ?? c.insurancePayer ?? "Unknown Payer",
          deniedAmount: c.deniedAmount,
          patientOwed: c.patientOwedAmount,
          cptCodes: c.cptCodes,
          icd10Codes: c.icd10Codes,
          denialReasonCode: c.denialReasonCode,
          denialReasonDescription: c.denialReasonDescription,
          status: c.status,
          daysRemaining: c.daysRemaining,
          overturnProbabilityScore: c.overturnProbabilityScore,
        };
      })
    );

    // If search index was unavailable (e.g. unit test runner mocks), apply fallback filter
    if (!usedSearchIndex && term) {
      const lower = term.toLowerCase();
      return populated.filter(
        (c) =>
          c.claimNumber.toLowerCase().includes(lower) ||
          c.patientName.toLowerCase().includes(lower) ||
          c.payer.toLowerCase().includes(lower) ||
          c.denialReasonCode.toLowerCase().includes(lower) ||
          c.denialReasonDescription.toLowerCase().includes(lower) ||
          c.cptCodes.some((code: string) => code.toLowerCase().includes(lower))
      );
    }

    return populated;
  },
});

/**
 * Tool: Fetch clinical evidence for a claim
 */
export const getEvidencesForChatbot = internalQuery({
  args: {
    claimId: v.id("claims"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const claim = await ctx.db.get(args.claimId);
    if (!claim || !claim.userId || claim.userId !== args.userId) {
      return [];
    }

    const evidences = await ctx.db
      .query("clinicalEvidences")
      .withIndex("by_claim", (q) => q.eq("claimId", args.claimId))
      .take(10);

    return evidences.map((ev) => ({
      evidenceId: ev._id,
      sourceType: ev.sourceType,
      title: ev.title,
      sourceUrl: ev.sourceUrl,
      citationClause: ev.citationClause,
      extractedEvidenceMarkdown: ev.extractedEvidenceMarkdown.slice(0, 300),
      relevanceScore: ev.relevanceScore,
    }));
  },
});

/**
 * Tool: Fetch synthesized appeal brief
 */
export const getAppealBriefForChatbot = internalQuery({
  args: {
    claimId: v.id("claims"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const claim = await ctx.db.get(args.claimId);
    if (!claim || !claim.userId || claim.userId !== args.userId) {
      return null;
    }

    const appeal = await ctx.db
      .query("appeals")
      .withIndex("by_claim", (q) => q.eq("claimId", args.claimId))
      .order("desc")
      .first();

    if (!appeal) return null;

    return {
      appealId: appeal._id,
      version: appeal.version,
      appealLevel: appeal.appealLevel,
      statutoryPosture: appeal.statutoryPosture,
      targetAuthority: appeal.targetAuthority,
      legalAggressiveness: appeal.legalAggressiveness,
      statutoryAuthorities: appeal.statutoryAuthorities,
      executiveSummary: appeal.executiveSummary,
      medicalNecessityArguments: appeal.medicalNecessityArguments.slice(0, 600),
      legalCitations: appeal.legalCitations.slice(0, 400),
      fullAppealExcerpt: appeal.fullAppealMarkdown.slice(0, 800),
    };
  },
});

/**
 * Tool: Fetch P2P Defense Script
 */
export const getP2PScriptForChatbot = internalQuery({
  args: {
    claimId: v.id("claims"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const claim = await ctx.db.get(args.claimId);
    if (!claim || !claim.userId || claim.userId !== args.userId) {
      return null;
    }

    const script = await ctx.db
      .query("p2pScripts")
      .withIndex("by_claim", (q) => q.eq("claimId", args.claimId))
      .order("desc")
      .first();

    if (!script) return null;

    return {
      physicianName: script.physicianName,
      physicianSpecialty: script.physicianSpecialty,
      estimatedCallDuration: script.estimatedCallDuration,
      openingStatutoryStatement: script.openingStatutoryStatement,
      disqualificationCountersCount: script.disqualificationCounters.length,
      sampleCounters: script.disqualificationCounters.slice(0, 2),
      cheatSheet: script.condensedCheatSheet,
    };
  },
});

/**
 * Tool: Fetch Audit Trail
 */
export const getAuditLogsForChatbot = internalQuery({
  args: {
    claimId: v.id("claims"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const claim = await ctx.db.get(args.claimId);
    if (!claim || !claim.userId || claim.userId !== args.userId) {
      return [];
    }

    const logs = await ctx.db
      .query("appealAuditLogs")
      .withIndex("by_claim_and_timestamp", (q) => q.eq("claimId", args.claimId))
      .order("desc")
      .take(8);

    return logs.map((log) => ({
      eventType: log.eventType,
      actor: log.actor,
      details: log.details,
      timestamp: log.timestamp,
    }));
  },
});
