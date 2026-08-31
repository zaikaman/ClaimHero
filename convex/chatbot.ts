import { query, mutation, internalQuery, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import {
  getChatbotSessionIfAuthorized,
  requireAuthUser,
  requireChatbotSessionOwner,
  requireClaimOwner,
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
      .withIndex("by_user", (q) => q.eq("userId", userId))
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
      .withIndex("by_user", (q) => q.eq("userId", userId))
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
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
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
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .order("asc")
      .take(100);
  },
});

async function applyAddMessage(ctx: any, args: any) {
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
    await requireChatbotSessionOwner(ctx, args.sessionId);
    return await applyAddMessage(ctx, args);
  },
});

/**
 * Internal mutation for background chatbot action to add assistant and tool responses
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
      .withIndex("by_session", (q: any) => q.eq("sessionId", args.sessionId))
      .take(200);

    for (const msg of messages) {
      await ctx.db.delete(msg._id);
    }

    await ctx.db.patch(args.sessionId, {
      messageCount: 0,
      summary: undefined,
      title: "Clinical & Appellate Inquiry",
      updatedAt: Date.now(),
    });

    return { success: true };
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
  },
  handler: async (ctx, args) => {
    let claim = null;
    if (args.claimId) {
      claim = await ctx.db.get(args.claimId);
    } else if (args.claimNumber) {
      claim = await ctx.db
        .query("claims")
        .withIndex("by_claim_number", (q) => q.eq("claimNumber", args.claimNumber!))
        .first();
    }

    if (!claim) return null;

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
  },
  handler: async (ctx, args) => {
    const limit = args.limit || 5;
    const claims = args.status
      ? await ctx.db
          .query("claims")
          .withIndex("by_status", (q) => q.eq("status", args.status!))
          .order("desc")
          .take(limit)
      : await ctx.db
          .query("claims")
          .order("desc")
          .take(limit);

    // Populate patient names
    const populated = await Promise.all(
      claims.map(async (c) => {
        const patient = await ctx.db.get(c.patientId);
        return {
          claimId: c._id,
          claimNumber: c.claimNumber,
          patientName: patient?.name ?? "Patient",
          payer: patient?.insurancePayer ?? "Unknown Payer",
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

    if (args.searchTerm && args.searchTerm.trim() !== "") {
      const term = args.searchTerm.toLowerCase();
      return populated.filter(
        (c) =>
          c.claimNumber.toLowerCase().includes(term) ||
          c.patientName.toLowerCase().includes(term) ||
          c.payer.toLowerCase().includes(term) ||
          c.denialReasonCode.toLowerCase().includes(term) ||
          c.denialReasonDescription.toLowerCase().includes(term) ||
          c.cptCodes.some((code) => code.toLowerCase().includes(term))
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
  },
  handler: async (ctx, args) => {
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
  },
  handler: async (ctx, args) => {
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
  },
  handler: async (ctx, args) => {
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
  },
  handler: async (ctx, args) => {
    const logs = await ctx.db
      .query("appealAuditLogs")
      .withIndex("by_claim", (q) => q.eq("claimId", args.claimId))
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
