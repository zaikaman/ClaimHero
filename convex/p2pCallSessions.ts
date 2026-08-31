import { v } from "convex/values";
import { internalMutation, mutation, query, MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { getClaimIfAuthorized, requireClaimOwner } from "./lib/auth";

export const getLatestByClaim = query({
  args: {
    claimId: v.id("claims"),
  },
  handler: async (ctx, args) => {
    const authorized = await getClaimIfAuthorized(ctx, args.claimId);
    if (!authorized) return null;

    return await ctx.db
      .query("p2pCallSessions")
      .withIndex("by_claim", (q) => q.eq("claimId", args.claimId))
      .order("desc")
      .first();
  },
});

export const getById = query({
  args: {
    sessionId: v.id("p2pCallSessions"),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) return null;

    const authorized = await getClaimIfAuthorized(ctx, session.claimId);
    if (!authorized) return null;

    return session;
  },
});

export const startSession = mutation({
  args: {
    claimId: v.id("claims"),
  },
  handler: async (ctx, args) => {
    await requireClaimOwner(ctx, args.claimId);

    const defaultChecklist = [
      {
        id: "reviewer_credentials",
        label: "Confirm Medical Director name, board specialty & state license #",
        category: "statutory",
        isCompleted: false,
      },
      {
        id: "erisa_notice",
        label: "State ERISA 29 CFR § 2560.503-1 recording & grievance notice",
        category: "statutory",
        isCompleted: false,
      },
      {
        id: "patient_identifiers",
        label: "Verify Patient Name, Member ID & Claim Reference Number",
        category: "clinical",
        isCompleted: false,
      },
      {
        id: "cpb_criteria_citation",
        label: "Cite exact Payer Clinical Policy Bulletin (CPB) section",
        category: "evidence",
        isCompleted: false,
      },
      {
        id: "failed_conservative_proof",
        label: "Prove failed conservative management / acute neurological deficit",
        category: "clinical",
        isCompleted: false,
      },
      {
        id: "bad_faith_demand",
        label: "Demand 24-hr written clinical justification if upheld",
        category: "regulatory",
        isCompleted: false,
      },
    ];

    const now = Date.now();
    const sessionId = await ctx.db.insert("p2pCallSessions", {
      claimId: args.claimId,
      sessionStatus: "live",
      startedAt: now,
      durationSeconds: 0,
      transcripts: [],
      fastAnswers: [],
      checklistProgress: defaultChecklist,
      winScore: 50,
      createdAt: now,
      updatedAt: now,
    });

    return sessionId;
  },
});

export const appendTranscript = mutation({
  args: {
    sessionId: v.id("p2pCallSessions"),
    transcriptItem: v.object({
      id: v.string(),
      speaker: v.string(),
      text: v.string(),
      timestamp: v.number(),
      detectedIntent: v.optional(v.string()),
      isFinal: v.boolean(),
    }),
    durationSeconds: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) return;

    await requireClaimOwner(ctx, session.claimId);

    const existingIndex = session.transcripts.findIndex((t) => t.id === args.transcriptItem.id);
    let updatedTranscripts = [...session.transcripts];

    if (existingIndex >= 0) {
      updatedTranscripts[existingIndex] = args.transcriptItem;
    } else {
      updatedTranscripts.push(args.transcriptItem);
    }

    // Keep transcripts bounded for performance
    if (updatedTranscripts.length > 200) {
      updatedTranscripts = updatedTranscripts.slice(-200);
    }

    await ctx.db.patch(args.sessionId, {
      transcripts: updatedTranscripts,
      durationSeconds: args.durationSeconds !== undefined ? args.durationSeconds : session.durationSeconds,
      updatedAt: Date.now(),
    });
  },
});

interface AddFastAnswerArgs {
  sessionId: Id<"p2pCallSessions">;
  fastAnswer: {
    id: string;
    trapQuestion: string;
    suggestedQuote: string;
    chartProof: string;
    cpbCitation: string;
    regulatoryLeverage?: string;
    confidenceScore: number;
    timestamp: number;
  };
}

async function applyAddFastAnswer(ctx: MutationCtx, args: AddFastAnswerArgs) {
  const session = await ctx.db.get(args.sessionId);
  if (!session) return;

  const fastAnswers = [args.fastAnswer, ...(session.fastAnswers || [])].slice(0, 30);

  // Dynamic boost to win score when high confidence fast answer is available
  const newWinScore = Math.min(100, Math.max(0, session.winScore + 5));

  await ctx.db.patch(args.sessionId, {
    fastAnswers,
    winScore: newWinScore,
    updatedAt: Date.now(),
  });
}

export const addFastAnswer = mutation({
  args: {
    sessionId: v.id("p2pCallSessions"),
    fastAnswer: v.object({
      id: v.string(),
      trapQuestion: v.string(),
      suggestedQuote: v.string(),
      chartProof: v.string(),
      cpbCitation: v.string(),
      regulatoryLeverage: v.optional(v.string()),
      confidenceScore: v.number(),
      timestamp: v.number(),
    }),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) return;

    await requireClaimOwner(ctx, session.claimId);
    await applyAddFastAnswer(ctx, args);
  },
});

export const addFastAnswerInternal = internalMutation({
  args: {
    sessionId: v.id("p2pCallSessions"),
    fastAnswer: v.object({
      id: v.string(),
      trapQuestion: v.string(),
      suggestedQuote: v.string(),
      chartProof: v.string(),
      cpbCitation: v.string(),
      regulatoryLeverage: v.optional(v.string()),
      confidenceScore: v.number(),
      timestamp: v.number(),
    }),
  },
  handler: async (ctx, args) => {
    await applyAddFastAnswer(ctx, args);
  },
});

export const updateChecklist = mutation({
  args: {
    sessionId: v.id("p2pCallSessions"),
    checklistId: v.string(),
    isCompleted: v.boolean(),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) return;

    await requireClaimOwner(ctx, session.claimId);

    const updatedChecklist = session.checklistProgress.map((item) => {
      if (item.id === args.checklistId) {
        return {
          ...item,
          isCompleted: args.isCompleted,
          completedAt: args.isCompleted ? Date.now() : undefined,
        };
      }
      return item;
    });

    const completedCount = updatedChecklist.filter((c) => c.isCompleted).length;
    const computedWinScore = Math.round(30 + (completedCount / updatedChecklist.length) * 65);

    await ctx.db.patch(args.sessionId, {
      checklistProgress: updatedChecklist,
      winScore: computedWinScore,
      updatedAt: Date.now(),
    });
  },
});

export const completeSession = mutation({
  args: {
    sessionId: v.id("p2pCallSessions"),
    durationSeconds: v.number(),
    summaryNotes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) return;

    await requireClaimOwner(ctx, session.claimId);

    const now = Date.now();
    await ctx.db.patch(args.sessionId, {
      sessionStatus: "completed",
      endedAt: now,
      durationSeconds: args.durationSeconds,
      summaryNotes: args.summaryNotes,
      updatedAt: now,
    });

    // Record immutable audit log
    await ctx.db.insert("appealAuditLogs", {
      claimId: session.claimId,
      eventType: "p2p_live_call_completed",
      actor: "P2P Live Call Copilot",
      details: `Live peer-to-peer defense call completed. Duration: ${Math.floor(args.durationSeconds / 60)}m ${args.durationSeconds % 60}s. Final momentum score: ${session.winScore}%. Fast answers generated: ${session.fastAnswers.length}. Transcripts recorded: ${session.transcripts.length}.`,
      timestamp: now,
    });
  },
});

export const updateTranscriptSpeaker = mutation({
  args: {
    sessionId: v.id("p2pCallSessions"),
    transcriptId: v.string(),
    newSpeaker: v.string(),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) return;

    await requireClaimOwner(ctx, session.claimId);

    const updatedTranscripts = session.transcripts.map((t) => {
      if (t.id === args.transcriptId) {
        return {
          ...t,
          speaker: args.newSpeaker,
        };
      }
      return t;
    });

    await ctx.db.patch(args.sessionId, {
      transcripts: updatedTranscripts,
      updatedAt: Date.now(),
    });
  },
});
