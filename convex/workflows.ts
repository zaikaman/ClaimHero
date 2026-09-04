import { WorkflowManager, type WorkflowStatus, type WorkflowCtx, type WorkflowId } from "@convex-dev/workflow";
import { components, api, internal } from "./_generated/api";
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Id, Doc } from "./_generated/dataModel";
import { requireClaimOwner } from "./lib/auth";
import { rateLimiter } from "./lib/rateLimiter";
import { ERISA_STATUTORY_EVIDENCE } from "./actions/policyCrawler";

export const workflow = new WorkflowManager(components.workflow, {
  workpoolOptions: {
    defaultRetryBehavior: {
      maxAttempts: 3,
      initialBackoffMs: 1000,
      base: 2,
    },
    retryActionsByDefault: true,
  },
});

export interface DurablePipelineResult {
  success: boolean;
  claimId: string;
  policyTitle?: string;
  clausesExtracted?: number;
  overturnProbabilityScore?: number;
  riskLevel?: string;
  appealId?: string;
  dispatched?: boolean;
  error?: string;
}

/**
 * Stage 1-5 Autonomous Medical Appeal Pipeline defined as a Durable Convex Workflow.
 * Survives function timeouts, API rate limits, and network dropouts with automatic
 * exponential backoff retries, checkpointed state transitions, and durable execution.
 */
export interface DurableClaimPipelineArgs {
  claimId: Id<"claims">;
  customPolicyUrl?: string;
  physicianNotes?: string;
  appealLevel?: string;
  sender?: {
    name: string;
    credentials?: string;
    email?: string;
    phone?: string;
  };
  clinicalFacts?: {
    symptomsAndFunctionalImpact?: string;
    examinationFindings?: string;
    imagingAndDiagnostics?: string;
    treatmentHistoryAndResponse?: string;
    otherDocumentedFacts?: string;
    recordsAreIncomplete: boolean;
  };
  autoDispatch?: boolean;
  followUpCadenceDays?: number;
}

/**
 * Core workflow execution logic for the 5-stage medical appeal pipeline.
 * Exported directly for unit testing and modular orchestration.
 */
export async function executeDurableClaimPipeline(
  step: WorkflowCtx,
  args: DurableClaimPipelineArgs
): Promise<DurablePipelineResult> {
  // Step 0: Checkpoint execution start and fetch claim details
  const claim = (await step.runQuery(internal.claims.getByIdInternal, {
    claimId: args.claimId,
  })) as (Doc<"claims"> & { patient?: Doc<"patients"> }) | null;

    if (!claim) {
      throw new Error(`Durable pipeline aborted: Claim ${args.claimId} not found`);
    }

    const payer = claim.patient?.insurancePayer || claim.insurancePayer || "Health Insurer";
    const context = claim.appealContext;
    const sender = args.sender || context?.sender;
    const clinicalFacts = args.clinicalFacts || context?.clinicalFacts;
    const physicianNotes = args.physicianNotes || context?.physicianNotes;

    if (!sender?.name?.trim() || (!sender.email?.trim() && !sender.phone?.trim())) {
      throw new Error("Complete sender details before drafting");
    }

    // Step 1: Payer Intake Gateway Resolution (Durable with retries)
    if (!claim.payerContact) {
      try {
        await step.runAction(
          api.actions.payerContactResolver.resolvePayerGateway,
          {
            claimId: args.claimId,
            payerName: payer,
          },
          {
            retry: { maxAttempts: 3, initialBackoffMs: 1000, base: 2 },
            name: "resolvePayerGateway",
          }
        );
      } catch (gatewayErr) {
        console.warn("Durable workflow note: Payer gateway auto-resolution notice:", gatewayErr);
      }
    }

    // Step 2: Policy Crawling & Clinical Evidence Extraction (Firecrawl)
    await step.runMutation(internal.claims.updateStatusInternal, {
      claimId: args.claimId,
      status: "analyzing",
      actor: "Durable Sentinel Workflow",
      details: "Step 1/4: Crawling clinical policy bulletins & medical guidelines with durable retry...",
    });

    let crawlResult: { policyTitle?: string; clausesExtracted?: number } | null = null;
    try {
      crawlResult = await step.runAction(
        api.actions.policyCrawler.crawlInsurerPolicy,
        {
          claimId: args.claimId,
          payer,
          cptCodes: claim.cptCodes || [],
          icd10Codes: claim.icd10Codes || [],
          denialReasonCode: claim.denialReasonCode || "CO-50",
          denialReasonDescription: claim.denialReasonDescription || "",
          customPolicyUrl: args.customPolicyUrl,
        },
        {
          retry: { maxAttempts: 3, initialBackoffMs: 2000, base: 2 },
          name: "crawlInsurerPolicy",
        }
      );
    } catch (crawlErr) {
      const crawlMessage = crawlErr instanceof Error ? crawlErr.message : String(crawlErr);
      const existingEvidences = (await step.runQuery(
        internal.clinicalEvidences.listByClaimInternal,
        { claimId: args.claimId }
      )) as Array<{ _id: Id<"clinicalEvidences"> }>;

      if (!existingEvidences || existingEvidences.length === 0) {
        try {
          await step.runMutation(internal.clinicalEvidences.insertBatchInternal, {
            claimId: args.claimId,
            evidences: [{ ...ERISA_STATUTORY_EVIDENCE }],
          });
        } catch (insertErr) {
          console.warn("Durable workflow fallback evidence insertion note:", insertErr);
        }
      }

      await step.runMutation(internal.claims.updateStatusInternal, {
        claimId: args.claimId,
        status: "analyzing",
        actor: "Durable Sentinel Workflow",
        details: `Policy crawl fallback applied: ${crawlMessage}. Proceeding with statutory evidence.`,
      });

      const count = Array.isArray(existingEvidences) ? existingEvidences.length : 0;
      crawlResult = {
        policyTitle: count > 0
          ? "Retained existing clinical evidence (live crawler fallback applied)"
          : "No publicly accessible policy source (ERISA statutory protocol applied)",
        clausesExtracted: Math.max(count, 1),
      };
    }

    // Step 3: Precedent Matching & Overturn Probability Scoring
    await step.runMutation(internal.claims.updateStatusInternal, {
      claimId: args.claimId,
      status: "analyzing",
      actor: "Durable Sentinel Workflow",
      details: "Step 2/4: Matching precedent vectors & evaluating 4-pillar overturn score...",
    });

    const scoreResult = await step.runAction(
      api.actions.precedentMatcher.computeOverturnScore,
      { claimId: args.claimId },
      {
        retry: { maxAttempts: 2, initialBackoffMs: 1000, base: 2 },
        name: "computeOverturnScore",
      }
    );

    await step.runMutation(internal.claims.updateStatusInternal, {
      claimId: args.claimId,
      status: "precedent_matched",
      actor: "Durable Sentinel Workflow",
      details: "Step 2b/4: Running Convex native vector search against the Precedent Vector Archive...",
    });

    let vectorPrecedents: Array<{
      _id: Id<"precedents">;
      sourceKind: string;
      title: string;
      citation: string;
      jurisdiction: string;
      sourceUrl?: string;
      icd10Codes: string[];
      cptCodes: string[];
      carcCodes: string[];
      winningArgument: string;
      statutoryLanguage: string;
      outcome: string;
      vectorScore: number;
      combinedScore: number;
      codeOverlap: number;
    }> = [];
    try {
      vectorPrecedents = await step.runAction(
        api.actions.precedentArchive.retrieveTopPrecedents,
        { claimId: args.claimId },
        { name: "retrieveTopPrecedents" }
      );
    } catch (precErr) {
      console.warn("Durable workflow vector precedent retrieval note:", precErr);
    }

    // Step 4: Formal ERISA Appeal Brief Synthesis
    await step.runMutation(internal.claims.updateStatusInternal, {
      claimId: args.claimId,
      status: "drafting",
      actor: "Durable Sentinel Workflow",
      details: "Step 3/4: Synthesizing cited ERISA & clinical appeal brief...",
    });

    const synthesisResult = await step.runAction(
      api.actions.appealSynthesizer.generateAppealBrief,
      {
        claimId: args.claimId,
        appealLevel: args.appealLevel || "level_1_internal",
        physicianNotes,
        senderName: sender.name,
        senderCredentials: sender.credentials,
        senderEmail: sender.email,
        senderPhone: sender.phone,
        clinicalFacts,
        vectorPrecedents,
      },
      {
        retry: { maxAttempts: 3, initialBackoffMs: 2000, base: 2 },
        name: "generateAppealBrief",
      }
    );

    // Step 5: Checkpoint final status to ready_for_review
    await step.runMutation(internal.claims.updateStatusInternal, {
      claimId: args.claimId,
      status: "ready_for_review",
      actor: "Durable Sentinel Workflow",
      details: `Durable pipeline completed: ${crawlResult?.clausesExtracted || 0} evidence clauses indexed, ${scoreResult?.overturnProbabilityScore || 0}% win score computed, and formal brief synthesized.`,
      overturnProbabilityScore: scoreResult?.overturnProbabilityScore,
      riskLevel: scoreResult?.riskLevel,
      scoringBreakdown: scoreResult?.scoringBreakdown,
    });

    let wasDispatched = false;

    // Step 6: Optional Auto-Pilot Dispatch & Statutory Cadence Delay
    if (args.autoDispatch && claim.autoPilotEnabled && synthesisResult?.appealId) {
      try {
        await step.runMutation(internal.claims.updateStatusInternal, {
          claimId: args.claimId,
          status: "ready_for_review",
          actor: "Durable Sentinel Workflow",
          details: "Step 4/4: Auto-Pilot dispatch initiated for formal appeal packet...",
        });

        await step.runAction(
          api.actions.mailDispatcher.dispatchAppealPacket,
          {
            claimId: args.claimId,
            appealId: synthesisResult.appealId as Id<"appeals">,
            dispatchMode: "official_payer",
          },
          {
            retry: { maxAttempts: 2, initialBackoffMs: 1500, base: 2 },
            name: "autoDispatchAppealPacket",
          }
        );
        wasDispatched = true;

        // Durable ERISA statutory follow-up cadence countdown
        const cadenceDays = args.followUpCadenceDays ?? 14;
        if (cadenceDays > 0) {
          const sleepDurationMs = cadenceDays * 24 * 60 * 60 * 1000;
          await step.runMutation(internal.claims.updateStatusInternal, {
            claimId: args.claimId,
            status: "dispatched",
            actor: "Durable Sentinel Workflow",
            details: `Appeal transmitted. Commencing ${cadenceDays}-day durable statutory cadence countdown via step.sleep().`,
          });

          await step.sleep(sleepDurationMs, { name: "erisaStatutoryFollowUpCadence" });

          // Wake up after statutory sleep without keeping active threads or VMs alive
          await step.runMutation(internal.claims.updateStatusInternal, {
            claimId: args.claimId,
            status: "dispatched",
            actor: "Durable Sentinel Workflow",
            details: `Statutory ${cadenceDays}-day follow-up window elapsed. Checking communication thread for payer determination.`,
          });
        }
      } catch (dispatchErr) {
        console.warn("Durable workflow auto-dispatch note:", dispatchErr);
      }
    }

    await step.runMutation(internal.claims.updateClaimWorkflowStatusInternal, {
      claimId: args.claimId,
      workflowStatus: "completed",
    });

    return {
      success: true,
      claimId: args.claimId,
      policyTitle: crawlResult?.policyTitle,
      clausesExtracted: crawlResult?.clausesExtracted,
      overturnProbabilityScore: scoreResult?.overturnProbabilityScore,
      riskLevel: scoreResult?.riskLevel,
      appealId: synthesisResult?.appealId,
      dispatched: wasDispatched,
    };
}

/**
 * Stage 1-5 Autonomous Medical Appeal Pipeline defined as a Durable Convex Workflow.
 * Survives function timeouts, API rate limits, and network dropouts with automatic
 * exponential backoff retries, checkpointed state transitions, and durable execution.
 */
export const durableClaimPipeline = workflow
  .define({
    args: {
      claimId: v.id("claims"),
      customPolicyUrl: v.optional(v.string()),
      physicianNotes: v.optional(v.string()),
      appealLevel: v.optional(v.string()),
      sender: v.optional(
        v.object({
          name: v.string(),
          credentials: v.optional(v.string()),
          email: v.optional(v.string()),
          phone: v.optional(v.string()),
        })
      ),
      clinicalFacts: v.optional(
        v.object({
          symptomsAndFunctionalImpact: v.optional(v.string()),
          examinationFindings: v.optional(v.string()),
          imagingAndDiagnostics: v.optional(v.string()),
          treatmentHistoryAndResponse: v.optional(v.string()),
          otherDocumentedFacts: v.optional(v.string()),
          recordsAreIncomplete: v.boolean(),
        })
      ),
      autoDispatch: v.optional(v.boolean()),
      followUpCadenceDays: v.optional(v.number()),
    },
    returns: v.object({
      success: v.boolean(),
      claimId: v.string(),
      policyTitle: v.optional(v.string()),
      clausesExtracted: v.optional(v.number()),
      overturnProbabilityScore: v.optional(v.number()),
      riskLevel: v.optional(v.string()),
      appealId: v.optional(v.string()),
      dispatched: v.optional(v.boolean()),
      error: v.optional(v.string()),
    }),
  })
  .handler(executeDurableClaimPipeline);

export interface ErisaStatutoryCountdownArgs {
  claimId: Id<"claims">;
  cadenceDays: number;
}

export interface ErisaStatutoryCountdownResult {
  claimId: string;
  wakeTimestamp: number;
  statutoryEscalated: boolean;
}

/**
 * Core workflow execution logic for statutory ERISA countdown.
 * Exported directly for unit testing and modular orchestration.
 */
export async function executeErisaStatutoryCountdown(
  step: WorkflowCtx,
  args: ErisaStatutoryCountdownArgs
): Promise<ErisaStatutoryCountdownResult> {
  const sleepDurationMs = Math.max(1, args.cadenceDays) * 24 * 60 * 60 * 1000;

  await step.runMutation(internal.claims.updateStatusInternal, {
    claimId: args.claimId,
    status: "dispatched",
    actor: "ERISA Statutory Sentinel",
    details: `Initialized ${args.cadenceDays}-day statutory follow-up cadence via durable workflow suspension.`,
  });

  // Durable sleep without serverless resource consumption
  await step.sleep(sleepDurationMs, { name: "erisaCadenceCountdown" });

  // Inspect claim upon waking
  const claim = (await step.runQuery(internal.claims.getByIdInternal, {
    claimId: args.claimId,
  })) as Doc<"claims"> | null;

  let statutoryEscalated = false;
  if (claim && claim.status === "dispatched") {
    statutoryEscalated = true;
    await step.runMutation(internal.claims.updateStatusInternal, {
      claimId: args.claimId,
      status: "escalated",
      actor: "ERISA Statutory Sentinel",
      details: `Statutory ${args.cadenceDays}-day deadline elapsed without payer resolution. Escalated to procedural bad-faith review under 29 CFR § 2560.503-1(l).`,
    });
  }

  return {
    claimId: args.claimId,
    wakeTimestamp: Date.now(),
    statutoryEscalated,
  };
}

/**
 * Dedicated Durable Statutory Countdown Workflow using step.sleep().
 * Durably suspends execution for statutory ERISA windows (e.g. 14, 30, or 45 days)
 * without consuming compute units. On resume, verifies payer responses and escalates if delinquent.
 */
export const erisaStatutoryCountdownWorkflow = workflow
  .define({
    args: {
      claimId: v.id("claims"),
      cadenceDays: v.number(),
    },
    returns: v.object({
      claimId: v.string(),
      wakeTimestamp: v.number(),
      statutoryEscalated: v.boolean(),
    }),
  })
  .handler(executeErisaStatutoryCountdown);

/**
 * Start a durable claim orchestration pipeline.
 * Authorizes the user, limits rate, starts the workflow, and attaches the workflowId to the claim.
 */
export const startDurablePipeline = mutation({
  args: {
    claimId: v.id("claims"),
    customPolicyUrl: v.optional(v.string()),
    physicianNotes: v.optional(v.string()),
    appealLevel: v.optional(v.string()),
    sender: v.optional(
      v.object({
        name: v.string(),
        credentials: v.optional(v.string()),
        email: v.optional(v.string()),
        phone: v.optional(v.string()),
      })
    ),
    clinicalFacts: v.optional(
      v.object({
        symptomsAndFunctionalImpact: v.optional(v.string()),
        examinationFindings: v.optional(v.string()),
        imagingAndDiagnostics: v.optional(v.string()),
        treatmentHistoryAndResponse: v.optional(v.string()),
        otherDocumentedFacts: v.optional(v.string()),
        recordsAreIncomplete: v.boolean(),
      })
    ),
    autoDispatch: v.optional(v.boolean()),
    followUpCadenceDays: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<{ workflowId: string; claimId: string }> => {
    const { userId } = await requireClaimOwner(ctx, args.claimId);

    const limitStatus = await rateLimiter.limit(ctx, "sentinelPipeline", {
      key: userId || "global",
    });
    if (!limitStatus.ok) {
      throw new Error(
        `Rate limit reached for pipeline execution. Please retry in ${Math.ceil((limitStatus.retryAfter || 1000) / 1000)} seconds.`
      );
    }

    const workflowId = await workflow.start(
      ctx,
      internal.workflows.durableClaimPipeline,
      {
        claimId: args.claimId,
        customPolicyUrl: args.customPolicyUrl,
        physicianNotes: args.physicianNotes,
        appealLevel: args.appealLevel,
        sender: args.sender,
        clinicalFacts: args.clinicalFacts,
        autoDispatch: args.autoDispatch,
        followUpCadenceDays: args.followUpCadenceDays,
      }
    );

    await ctx.db.patch(args.claimId, {
      workflowId,
      workflowStatus: "inProgress",
      updatedAt: Date.now(),
    });

    await ctx.db.insert("appealAuditLogs", {
      claimId: args.claimId,
      userId,
      eventType: "durable_workflow_started",
      actor: "Autonomous Sentinel Workflow",
      details: `Started durable execution pipeline [Workflow ID: ${workflowId}] with automatic exponential backoff retries and checkpointing.`,
      timestamp: Date.now(),
    });

    return {
      workflowId,
      claimId: args.claimId,
    };
  },
});

/**
 * Real-time reactive query to inspect workflow execution status,
 * running steps, and terminal states (completed, failed, canceled).
 */
export const getWorkflowExecutionStatus = query({
  args: {
    claimId: v.optional(v.id("claims")),
    workflowId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    let workflowId = args.workflowId;

    if (!workflowId && args.claimId) {
      const claim = await ctx.db.get(args.claimId);
      if (claim?.workflowId) {
        workflowId = claim.workflowId;
      }
    }

    if (!workflowId) {
      return {
        hasWorkflow: false,
        workflowId: null,
        status: null,
      };
    }

    try {
      const status: WorkflowStatus = await workflow.status(ctx, workflowId as WorkflowId);
      return {
        hasWorkflow: true,
        workflowId,
        status,
      };
    } catch (statusErr) {
      return {
        hasWorkflow: true,
        workflowId,
        status: {
          type: "unknown",
          error: statusErr instanceof Error ? statusErr.message : String(statusErr),
        },
      };
    }
  },
});

/**
 * Cancel an active durable workflow.
 */
export const cancelDurableWorkflow = mutation({
  args: {
    claimId: v.id("claims"),
    workflowId: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{ success: boolean; workflowId: string }> => {
    const { claim, userId } = await requireClaimOwner(ctx, args.claimId);

    const targetWorkflowId = args.workflowId || claim.workflowId;
    if (!targetWorkflowId) {
      throw new Error(`No active workflow found for claim ${args.claimId}`);
    }

    await workflow.cancel(ctx, targetWorkflowId as WorkflowId);

    await ctx.db.patch(args.claimId, {
      workflowStatus: "canceled",
      updatedAt: Date.now(),
    });

    await ctx.db.insert("appealAuditLogs", {
      claimId: args.claimId,
      userId,
      eventType: "durable_workflow_canceled",
      actor: "Autonomous Sentinel Workflow",
      details: `Canceled durable workflow execution [Workflow ID: ${targetWorkflowId}].`,
      timestamp: Date.now(),
    });

    return {
      success: true,
      workflowId: targetWorkflowId,
    };
  },
});

/**
 * Launch an independent ERISA statutory countdown workflow.
 */
export const startStatutoryCountdown = mutation({
  args: {
    claimId: v.id("claims"),
    cadenceDays: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<{ workflowId: string }> => {
    const { claim, userId } = await requireClaimOwner(ctx, args.claimId);
    const cadenceDays = args.cadenceDays ?? Math.max(claim.daysRemaining || 14, 1);

    const workflowId = await workflow.start(
      ctx,
      internal.workflows.erisaStatutoryCountdownWorkflow,
      {
        claimId: args.claimId,
        cadenceDays,
      }
    );

    await ctx.db.insert("appealAuditLogs", {
      claimId: args.claimId,
      userId,
      eventType: "statutory_countdown_started",
      actor: "ERISA Statutory Sentinel",
      details: `Scheduled ${cadenceDays}-day durable statutory countdown [Workflow ID: ${workflowId}].`,
      timestamp: Date.now(),
    });

    return { workflowId };
  },
});
