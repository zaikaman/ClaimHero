import { MutationCtx, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { claimsAggregate } from "./lib/aggregates";
import { getClaimIfAuthorized, requireAuthUser, requireClaimOwner } from "./lib/auth";

/**
 * Full-text search across claims using Convex native searchIndex
 */
export const search = query({
  args: {
    query: v.string(),
    status: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId || !args.query.trim()) {
      return [];
    }

    const results = await ctx.db
      .query("claims")
      .withSearchIndex("search_claims", (q) => {
        let builder = q.search("denialReasonDescription", args.query).eq("userId", userId);
        if (args.status && args.status !== "all") {
          builder = builder.eq("status", args.status);
        }
        return builder;
      })
      .take(args.limit || 20);

    return results.filter((r) => r.userId === userId);
  },
});

/**
 * List all claims for the authenticated user with optional status and payer filtering
 */
export const list = query({
  args: {
    status: v.optional(v.string()),
    payer: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return [];
    }

    let claims: Doc<"claims">[];

    if (args.status && args.status !== "all") {
      claims = await ctx.db
        .query("claims")
        .withIndex("by_user_status", (q) =>
          q.eq("userId", userId).eq("status", args.status!)
        )
        .collect();
    } else {
      claims = await ctx.db
        .query("claims")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect();
    }

    // Join with patient details, latest appeal draft, and evidence count
    const joinedClaims = await Promise.all(
      claims.map(async (claim) => {
        const patient = (await ctx.db.get(claim.patientId)) as Doc<"patients"> | null;
        const appeals = await ctx.db
          .query("appeals")
          .withIndex("by_claim", (q) => q.eq("claimId", claim._id))
          .collect();
        const latestAppeal = appeals.sort((a, b) => b.version - a.version)[0] || null;

        const evidences = await ctx.db
          .query("clinicalEvidences")
          .withIndex("by_claim", (q) => q.eq("claimId", claim._id))
          .collect();

        return {
          ...claim,
          patient: patient || undefined,
          latestAppeal,
          evidenceCount: evidences.length,
        };
      })
    );

    // Apply payer filter if specified
    let filtered = joinedClaims;
    if (args.payer && args.payer !== "all") {
      filtered = filtered.filter(
        (c) =>
          c.patient?.insurancePayer.toLowerCase() === args.payer?.toLowerCase()
      );
    }

    // Sort by createdAt descending
    filtered.sort((a, b) => b.createdAt - a.createdAt);

    if (args.limit) {
      return filtered.slice(0, args.limit);
    }

    return filtered;
  },
});

/**
 * Retrieve a complete claim record with patient, active appeal draft, and evidence count
 */
export const getById = query({
  args: {
    claimId: v.id("claims"),
  },
  handler: async (ctx, args) => {
    const authorized = await getClaimIfAuthorized(ctx, args.claimId);
    if (!authorized) return null;
    const claim = authorized.claim;

    const patient = (await ctx.db.get(claim.patientId)) as Doc<"patients"> | null;

    const evidences = await ctx.db
      .query("clinicalEvidences")
      .withIndex("by_claim", (q) => q.eq("claimId", args.claimId))
      .collect();

    const appeals = await ctx.db
      .query("appeals")
      .withIndex("by_claim", (q) => q.eq("claimId", args.claimId))
      .collect();

    const latestAppeal = appeals.sort((a, b) => b.version - a.version)[0] || null;

    return {
      ...claim,
      patient: patient || undefined,
      evidenceCount: evidences.length,
      latestAppeal,
    };
  },
});

/**
 * Internal query for background actions to retrieve a complete claim record
 */
export const getByIdInternal = internalQuery({
  args: {
    claimId: v.id("claims"),
  },
  handler: async (ctx, args) => {
    const claim = await ctx.db.get(args.claimId);
    if (!claim) return null;

    const patient = await ctx.db.get(claim.patientId);

    const evidences = await ctx.db
      .query("clinicalEvidences")
      .withIndex("by_claim", (q) => q.eq("claimId", args.claimId))
      .collect();

    const appeals = await ctx.db
      .query("appeals")
      .withIndex("by_claim", (q) => q.eq("claimId", args.claimId))
      .collect();

    const latestAppeal = appeals.sort((a, b) => b.version - a.version)[0] || null;

    return {
      ...claim,
      patient: patient || undefined,
      evidenceCount: evidences.length,
      latestAppeal,
    };
  },
});

/**
 * Internal query for webhook processors and background actions to list claims
 */
export const listAllInternal = internalQuery({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.query("claims").take(args.limit || 500);
  },
});

/**
 * Internal query to lookup a claim directly by claim number using the by_claim_number index
 */
export const getByClaimNumberInternal = internalQuery({
  args: {
    claimNumber: v.string(),
  },
  handler: async (ctx, args) => {
    const trimmed = args.claimNumber.trim();
    if (!trimmed) return null;
    return await ctx.db
      .query("claims")
      .withIndex("by_claim_number", (q) => q.eq("claimNumber", trimmed))
      .first();
  },
});

/**
 * Internal query to lookup a claim by any of its associated AgentMail inbox / routing emails using dedicated indexes
 */
export const getByInboxEmailInternal = internalQuery({
  args: {
    email: v.string(),
  },
  handler: async (ctx, args) => {
    const normalizedEmail = args.email.trim().toLowerCase();
    if (!normalizedEmail) return null;

    const byInbox = await ctx.db
      .query("claims")
      .withIndex("by_inbox_email", (q) => q.eq("agentMailInboxEmail", normalizedEmail))
      .first();
    if (byInbox) return byInbox;

    const byAdjudicator = await ctx.db
      .query("claims")
      .withIndex("by_adjudicator_email", (q) => q.eq("agentMailAdjudicatorEmail", normalizedEmail))
      .first();
    if (byAdjudicator) return byAdjudicator;

    const byAssigned = await ctx.db
      .query("claims")
      .withIndex("by_assigned_agent_email", (q) => q.eq("assignedAgentEmail", normalizedEmail))
      .first();
    if (byAssigned) return byAssigned;

    return null;
  },
});

/**
 * Robust, production-grade internal query for matching inbound AgentMail webhook messages to claims.
 * Uses canonical indexed lookups first (claimNumber and dedicated recipient email indexes),
 * falling back to bounded content scanning without relying on undefined index equality.
 */
export const findMatchingClaimInternal = internalQuery({
  args: {
    subject: v.optional(v.string()),
    bodySnippet: v.optional(v.string()),
    recipients: v.array(v.string()),
    claimNumber: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // 1. Direct match by explicit claim number if provided
    if (args.claimNumber?.trim()) {
      const direct = await ctx.db
        .query("claims")
        .withIndex("by_claim_number", (q) => q.eq("claimNumber", args.claimNumber!.trim()))
        .first();
      if (direct) return direct;
    }

    // 2. Extract potential claim numbers from subject and body using standard regex patterns
    const textToScan = `${args.subject || ""} ${args.bodySnippet || ""}`;
    const claimPatterns = [
      /(?:claim|case|ref|file|tracking)[\s#:.-]*([A-Z0-9_-]{4,30})/gi,
      /\b(CLM-[A-Z0-9-]{3,20})\b/gi,
    ];
    for (const pattern of claimPatterns) {
      const matches = textToScan.matchAll(pattern);
      for (const match of matches) {
        const candidate = match[1]?.trim();
        if (candidate) {
          const found = await ctx.db
            .query("claims")
            .withIndex("by_claim_number", (q) => q.eq("claimNumber", candidate))
            .first();
          if (found) return found;
        }
      }
    }

    // 3. Match across recipient email addresses using dedicated email indexes
    for (const rawRecipient of args.recipients) {
      const normalized = rawRecipient.trim().toLowerCase();
      if (!normalized) continue;

      const byInbox = await ctx.db
        .query("claims")
        .withIndex("by_inbox_email", (q) => q.eq("agentMailInboxEmail", normalized))
        .first();
      if (byInbox) return byInbox;

      const byAdjudicator = await ctx.db
        .query("claims")
        .withIndex("by_adjudicator_email", (q) => q.eq("agentMailAdjudicatorEmail", normalized))
        .first();
      if (byAdjudicator) return byAdjudicator;

      const byAssigned = await ctx.db
        .query("claims")
        .withIndex("by_assigned_agent_email", (q) => q.eq("assignedAgentEmail", normalized))
        .first();
      if (byAssigned) return byAssigned;
    }

    // 4. Fallback: Scan recent claims and check if any claim's claimNumber appears in subject/body
    const recentClaims = await ctx.db
      .query("claims")
      .withIndex("by_created")
      .order("desc")
      .take(500);
    const subjectAndBody = textToScan.toLowerCase();

    const contentMatch = recentClaims.find(
      (c) => c.claimNumber && subjectAndBody.includes(c.claimNumber.toLowerCase())
    );
    if (contentMatch) return contentMatch;

    // Resilient recipient fallback match in memory
    const recipientMatch = recentClaims.find((c) =>
      args.recipients.some((r) => {
        const nr = r.trim().toLowerCase();
        return (
          c.agentMailInboxEmail?.toLowerCase() === nr ||
          c.agentMailAdjudicatorEmail?.toLowerCase() === nr ||
          c.assignedAgentEmail?.toLowerCase() === nr
        );
      })
    );
    if (recipientMatch) return recipientMatch;

    return null;
  },
});

/**
 * Create a new claim for an existing patient
 */
export const create = mutation({
  args: {
    patientId: v.id("patients"),
    claimNumber: v.string(),
    serviceDate: v.string(),
    providerName: v.string(),
    deniedAmount: v.number(),
    patientOwedAmount: v.number(),
    cptCodes: v.array(v.string()),
    icd10Codes: v.array(v.string()),
    denialReasonCode: v.string(),
    denialReasonDescription: v.string(),
    appealFilingDeadlineDays: v.optional(v.number()),
    denialLetterStorageId: v.optional(v.id("_storage")),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuthUser(ctx);
    const now = Date.now();
    const deadlineDays = args.appealFilingDeadlineDays || 180;
    const statutoryDeadline = now + deadlineDays * 86400000;

    const claimId = await ctx.db.insert("claims", {
      userId,
      patientId: args.patientId,
      claimNumber: args.claimNumber,
      serviceDate: args.serviceDate,
      providerName: args.providerName,
      deniedAmount: args.deniedAmount,
      patientOwedAmount: args.patientOwedAmount,
      cptCodes: args.cptCodes,
      icd10Codes: args.icd10Codes,
      denialReasonCode: args.denialReasonCode,
      denialReasonDescription: args.denialReasonDescription,
      status: "ingested",
      statutoryDeadline,
      daysRemaining: deadlineDays,
      assignedAgentEmail: "",
      agentMailProvisioningStatus: "pending",
      denialLetterStorageId: args.denialLetterStorageId,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.scheduler.runAfter(
      0,
      internal.actions.agentMail.provisionClaimInboxes,
      { claimId }
    );

    // Log initial audit event
    await ctx.db.insert("appealAuditLogs", {
      claimId,
      eventType: "denial_ingested",
      actor: "ClaimHero Intake Engine",
      details: `Ingested denial claim ${args.claimNumber} for ${args.providerName} ($${args.deniedAmount.toLocaleString()} denied, Code ${args.denialReasonCode})`,
      timestamp: now,
    });

    const createdClaimDoc = await ctx.db.get(claimId);
    if (createdClaimDoc) {
      try {
        await claimsAggregate.insert(ctx, createdClaimDoc);
      } catch (err) {
        console.warn("Could not insert claim into aggregate:", err);
      }
    }

    return claimId;
  },
});

interface CreateWithPatientArgs {
  claimNumber: string;
  patientName: string;
  patientEmail?: string;
  memberId?: string;
  groupNumber?: string;
  insurancePayer: string;
  state?: string;
  serviceDate: string;
  providerName: string;
  deniedAmount: number;
  patientOwedAmount?: number;
  cptCodes: string[];
  icd10Codes?: string[];
  denialReasonCode: string;
  denialReasonDescription: string;
  appealFilingDeadlineDays?: number;
  denialLetterStorageId?: Id<"_storage">;
  redactionMetadata?: {
    isRedacted: boolean;
    mode: string;
    redactedEntityCount: number;
    maskedCategories: string[];
    appliedAt: number;
  };
}

async function applyCreateWithPatient(
  ctx: MutationCtx,
  args: CreateWithPatientArgs,
  explicitUserId?: Id<"users">
): Promise<Id<"claims">> {
  const authUserId = await getAuthUserId(ctx);
  let userId: Id<"users"> | undefined = explicitUserId || authUserId || undefined;
  const now = Date.now();

  // Check if patient already exists by email
  const cleanEmail = args.patientEmail?.trim() || "";
  let matchingPatient: Doc<"patients"> | undefined;

  if (cleanEmail) {
    const existingPatients = await ctx.db
      .query("patients")
      .withIndex("by_email", (q) => q.eq("email", cleanEmail))
      .collect();
    matchingPatient = existingPatients.find((p) => (userId ? p.userId === userId : true) || !p.userId);
    if (!userId && matchingPatient?.userId) {
      userId = matchingPatient.userId;
    }
  } else if (args.patientName.trim() && userId) {
    // If no email, check if user has an existing patient record matching name and memberId/payer
    const userPatients = await ctx.db
      .query("patients")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    matchingPatient = userPatients.find(
      (p) =>
        p.name.toLowerCase() === args.patientName.toLowerCase() &&
        (!args.memberId || p.memberId === args.memberId)
    );
  }

  let patientId: Id<"patients">;

  if (matchingPatient) {
    patientId = matchingPatient._id;
    await ctx.db.patch(patientId, {
      ...(userId ? { userId } : {}),
      name: args.patientName,
      email: cleanEmail || matchingPatient.email || "",
      memberId: args.memberId || matchingPatient.memberId || "PENDING",
      groupNumber: args.groupNumber || matchingPatient.groupNumber,
      insurancePayer: args.insurancePayer || matchingPatient.insurancePayer || "Molina Healthcare",
      state: args.state || matchingPatient.state || "FL",
    });
  } else {
    patientId = await ctx.db.insert("patients", {
      userId,
      name: args.patientName,
      email: cleanEmail,
      memberId: args.memberId || "PENDING",
      groupNumber: args.groupNumber,
      insurancePayer: args.insurancePayer || "Molina Healthcare",
      state: args.state || "FL",
      createdAt: now,
    });
  }

  const deadlineDays = args.appealFilingDeadlineDays || 180;
  const statutoryDeadline = now + deadlineDays * 86400000;

  const claimId = await ctx.db.insert("claims", {
    userId,
    patientId,
    claimNumber: args.claimNumber,
    serviceDate: args.serviceDate,
    providerName: args.providerName,
    deniedAmount: args.deniedAmount,
    patientOwedAmount: args.patientOwedAmount !== undefined ? args.patientOwedAmount : args.deniedAmount,
    cptCodes: args.cptCodes,
    icd10Codes: args.icd10Codes || [],
    denialReasonCode: args.denialReasonCode,
    denialReasonDescription: args.denialReasonDescription,
    status: "ingested",
    statutoryDeadline,
    daysRemaining: deadlineDays,
    assignedAgentEmail: "",
    agentMailProvisioningStatus: "pending",
    denialLetterStorageId: args.denialLetterStorageId,
    redactionMetadata: args.redactionMetadata,
    createdAt: now,
    updatedAt: now,
  });

  await ctx.scheduler.runAfter(
    0,
    internal.actions.agentMail.provisionClaimInboxes,
    { claimId }
  );

  // Log audit event
  await ctx.db.insert("appealAuditLogs", {
    claimId,
    eventType: "denial_ingested",
    actor: "Optical OCR Parser",
    details: `Extracted denial document for ${args.patientName} (${args.insurancePayer} - ${args.claimNumber})`,
    timestamp: now,
  });

  const createdClaimDoc = await ctx.db.get(claimId);
  if (createdClaimDoc) {
    try {
      await claimsAggregate.insert(ctx, createdClaimDoc);
    } catch (err) {
      console.warn("Could not insert claim into aggregate:", err);
    }
  }

  return claimId;
}

/**
 * Atomic creation of patient and claim from OCR extraction
 */
export const createWithPatient = mutation({
  args: {
    patientName: v.string(),
    patientEmail: v.string(),
    memberId: v.string(),
    insurancePayer: v.string(),
    state: v.string(),
    groupNumber: v.optional(v.string()),
    claimNumber: v.string(),
    serviceDate: v.string(),
    providerName: v.string(),
    deniedAmount: v.number(),
    patientOwedAmount: v.number(),
    cptCodes: v.array(v.string()),
    icd10Codes: v.array(v.string()),
    denialReasonCode: v.string(),
    denialReasonDescription: v.string(),
    appealFilingDeadlineDays: v.optional(v.number()),
    denialLetterStorageId: v.optional(v.id("_storage")),
    redactionMetadata: v.optional(
      v.object({
        isRedacted: v.boolean(),
        mode: v.string(),
        redactedEntityCount: v.number(),
        maskedCategories: v.array(v.string()),
        appliedAt: v.number(),
      })
    ),
  },
  handler: async (ctx, args) => {
    return await applyCreateWithPatient(ctx, args);
  },
});

/**
 * Internal mutation for background actions (such as opticalParser and AgentMail intake) to create a claim
 */
export const createWithPatientInternal = internalMutation({
  args: {
    patientName: v.string(),
    patientEmail: v.string(),
    memberId: v.string(),
    insurancePayer: v.string(),
    state: v.string(),
    groupNumber: v.optional(v.string()),
    claimNumber: v.string(),
    serviceDate: v.string(),
    providerName: v.string(),
    deniedAmount: v.number(),
    patientOwedAmount: v.number(),
    cptCodes: v.array(v.string()),
    icd10Codes: v.array(v.string()),
    denialReasonCode: v.string(),
    denialReasonDescription: v.string(),
    appealFilingDeadlineDays: v.optional(v.number()),
    denialLetterStorageId: v.optional(v.id("_storage")),
    userId: v.optional(v.id("users")),
    redactionMetadata: v.optional(
      v.object({
        isRedacted: v.boolean(),
        mode: v.string(),
        redactedEntityCount: v.number(),
        maskedCategories: v.array(v.string()),
        appliedAt: v.number(),
      })
    ),
  },
  handler: async (ctx, args) => {
    return await applyCreateWithPatient(ctx, args, args.userId);
  },
});

/**
 * Persist the provider-backed AgentMail inboxes created for a claim.
 * This is internal because only the provisioning action may update provider IDs.
 */
export const setAgentMailInboxes = internalMutation({
  args: {
    claimId: v.id("claims"),
    claimInboxId: v.optional(v.string()),
    claimInboxEmail: v.optional(v.string()),
    adjudicatorInboxId: v.optional(v.string()),
    adjudicatorEmail: v.optional(v.string()),
    status: v.string(),
    error: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const patchData: Record<string, string> = {
      agentMailProvisioningStatus: args.status,
    };

    if (args.error !== undefined) {
      patchData.agentMailProvisioningError = args.error;
    }

    if (args.claimInboxId !== undefined) {
      patchData.agentMailInboxId = args.claimInboxId;
    }
    if (args.claimInboxEmail !== undefined) {
      patchData.agentMailInboxEmail = args.claimInboxEmail;
      patchData.assignedAgentEmail = args.claimInboxEmail;
    }
    if (args.adjudicatorInboxId !== undefined) {
      patchData.agentMailAdjudicatorInboxId = args.adjudicatorInboxId;
    }
    if (args.adjudicatorEmail !== undefined) {
      patchData.agentMailAdjudicatorEmail = args.adjudicatorEmail;
    }
    await ctx.db.patch(args.claimId, patchData);
    return null;
  },
});

interface ScoringBreakdownItem {
  category: string;
  criterion: string;
  score: number;
  maxScore: number;
  status: string;
  rationale: string;
}

interface StatusUpdateArgs {
  claimId: Id<"claims">;
  status: string;
  details?: string;
  actor?: string;
  overturnProbabilityScore?: number;
  riskLevel?: string;
  scoringBreakdown?: ScoringBreakdownItem[];
}

async function applyStatusUpdate(ctx: MutationCtx, args: StatusUpdateArgs) {
  const now = Date.now();
  const claim = await ctx.db.get(args.claimId);
  if (!claim) {
    console.warn(`Claim ${args.claimId} not found during updateStatus; skipping.`);
    return null;
  }

  const patchData: Partial<Doc<"claims">> = {
    status: args.status,
    updatedAt: now,
  };

  if (args.overturnProbabilityScore !== undefined) {
    patchData.overturnProbabilityScore = args.overturnProbabilityScore;
  }
  if (args.riskLevel !== undefined) {
    patchData.riskLevel = args.riskLevel;
  }
  if (args.scoringBreakdown !== undefined) {
    patchData.scoringBreakdown = args.scoringBreakdown;
  }

  await ctx.db.patch(args.claimId, patchData);

  await ctx.db.insert("appealAuditLogs", {
    claimId: args.claimId,
    eventType: `status_changed_to_${args.status}`,
    actor: args.actor || "ClaimHero Sentinel",
    details: args.details || `Case status updated to ${args.status}`,
    timestamp: now,
  });

  if (args.status === "won") {
    await ctx.scheduler.runAfter(
      0,
      internal.actions.precedentArchive.indexWonAppeal,
      { claimId: args.claimId }
    );
  }

  return null;
}

/**
 * Update claim status and record an audit log event
 */
export const updateStatus = mutation({
  args: {
    claimId: v.id("claims"),
    status: v.string(),
    details: v.optional(v.string()),
    actor: v.optional(v.string()),
    overturnProbabilityScore: v.optional(v.number()),
    riskLevel: v.optional(v.string()),
    scoringBreakdown: v.optional(
      v.array(
        v.object({
          category: v.string(),
          criterion: v.string(),
          score: v.number(),
          maxScore: v.number(),
          status: v.string(),
          rationale: v.string(),
        })
      )
    ),
  },
  handler: async (ctx, args) => {
    await requireClaimOwner(ctx, args.claimId);
    return await applyStatusUpdate(ctx, args);
  },
});

/**
 * Internal mutation for background actions to update claim status
 */
export const updateStatusInternal = internalMutation({
  args: {
    claimId: v.id("claims"),
    status: v.string(),
    details: v.optional(v.string()),
    actor: v.optional(v.string()),
    overturnProbabilityScore: v.optional(v.number()),
    riskLevel: v.optional(v.string()),
    scoringBreakdown: v.optional(
      v.array(
        v.object({
          category: v.string(),
          criterion: v.string(),
          score: v.number(),
          maxScore: v.number(),
          status: v.string(),
          rationale: v.string(),
        })
      )
    ),
  },
  handler: async (ctx, args) => {
    return await applyStatusUpdate(ctx, args);
  },
});

/**
 * Generate Convex File Storage upload URL for denial document attachments
 */
export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireAuthUser(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

/**
 * Helper to process a bounded page of claims during statutory deadline sweeps.
 * Cascades asynchronously via ctx.scheduler.runAfter to prevent TransactionTooLarge
 * and stay well within Convex documentsRead/bytesRead limits.
 */
async function executeSweepDeadlinesBatch(
  ctx: MutationCtx,
  args: {
    cursor: string | null;
    batchSize?: number;
    totalUpdated?: number;
    totalCritical?: number;
  }
) {
  const now = Date.now();
  const batchSize = Math.min(Math.max(1, args.batchSize ?? 100), 250);

  const pageResult = await ctx.db
    .query("claims")
    .paginate({ cursor: args.cursor, numItems: batchSize });

  let batchUpdated = 0;
  let batchCritical = 0;

  for (const claim of pageResult.page) {
    if (claim.status === "won" || claim.status === "lost") continue;

    const exactRemaining = Math.max(
      0,
      Math.ceil((claim.statutoryDeadline - now) / 86400000)
    );

    if (exactRemaining !== claim.daysRemaining) {
      await ctx.db.patch(claim._id, {
        daysRemaining: exactRemaining,
        updatedAt: now,
      });
      batchUpdated++;

      if (exactRemaining <= 14 && claim.daysRemaining > 14) {
        batchCritical++;
        await ctx.db.insert("appealAuditLogs", {
          claimId: claim._id,
          eventType: "statutory_alarm_critical",
          actor: "Statutory Deadline Sentinel",
          details: `CRITICAL ALARM: Only ${exactRemaining} days remaining before statutory ERISA appeal clock expires for claim ${claim.claimNumber}.`,
          timestamp: now,
        });
      }
    }
  }

  const totalUpdated = (args.totalUpdated ?? 0) + batchUpdated;
  const totalCritical = (args.totalCritical ?? 0) + batchCritical;

  if (!pageResult.isDone) {
    await ctx.scheduler.runAfter(
      0,
      internal.claims.sweepDeadlinesBatch,
      {
        cursor: pageResult.continueCursor,
        batchSize,
        totalUpdated,
        totalCritical,
      }
    );
  }

  return {
    isDone: pageResult.isDone,
    continueCursor: pageResult.continueCursor,
    batchProcessed: pageResult.page.length,
    batchUpdated,
    batchCritical,
    totalUpdated,
    totalCritical,
  };
}

/**
 * Sweep and recalculate statutory deadlines across all open claims (Invoked by cron).
 * Initiates bounded pagination batching to safely process any volume of claims without TransactionTooLarge.
 */
export const sweepDeadlines = internalMutation({
  args: {
    cursor: v.optional(v.union(v.string(), v.null())),
    batchSize: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await executeSweepDeadlinesBatch(ctx, {
      cursor: args.cursor ?? null,
      batchSize: args.batchSize ?? 100,
      totalUpdated: 0,
      totalCritical: 0,
    });
  },
});

/**
 * Internal mutation for scheduled continuation batches during statutory deadline sweep
 */
export const sweepDeadlinesBatch = internalMutation({
  args: {
    cursor: v.union(v.string(), v.null()),
    batchSize: v.optional(v.number()),
    totalUpdated: v.optional(v.number()),
    totalCritical: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await executeSweepDeadlinesBatch(ctx, args);
  },
});

/**
 * Retrieve comprehensive portfolio analytics and financial metrics strictly computed across the authenticated user's claims
 */
export const getPortfolioStats = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return {
        totalClaims: 0,
        totalDisputedAmount: 0,
        activeDisputedAmount: 0,
        overturnedWonAmount: 0,
        averageWinScore: 0,
        recoveryRatePercent: 0,
        criticalDeadlinesCount: 0,
        urgentDeadlinesCount: 0,
        claimsByStatus: {
          ingested: 0,
          parsing: 0,
          analyzing: 0,
          precedent_matched: 0,
          drafting: 0,
          ready_for_review: 0,
          dispatched: 0,
          won: 0,
          lost: 0,
        },
        claimsByRisk: {
          high_confidence: 0,
          moderate: 0,
          complex_litigation: 0,
        },
        payerBreakdown: [],
      };
    }

    const claims = (await ctx.db
      .query("claims")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect()) as Doc<"claims">[];

    // Fetch only the authenticated user's patients to prevent cross-tenant leakage
    const patients = await ctx.db
      .query("patients")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const patientMap = new Map(patients.map((p) => [p._id, p]));

    // Query O(log N) claimsAggregate for portfolio-level validation where available
    let aggregateCount: number | null = null;
    let aggregateSum: number | null = null;
    try {
      [aggregateCount, aggregateSum] = await Promise.all([
        claimsAggregate.count(ctx, { namespace: userId as string }),
        claimsAggregate.sum(ctx, { namespace: userId as string }),
      ]);
    } catch {
      // Graceful fallback to in-memory reduction if aggregate tree is synchronizing
    }

    let totalDisputedAmount = 0;
    let activeDisputedAmount = 0;
    let overturnedWonAmount = 0;
    let totalScoreSum = 0;
    let scoredCount = 0;
    let criticalDeadlinesCount = 0;
    let urgentDeadlinesCount = 0;

    const claimsByStatus: Record<string, number> = {
      ingested: 0,
      parsing: 0,
      analyzing: 0,
      precedent_matched: 0,
      drafting: 0,
      ready_for_review: 0,
      dispatched: 0,
      won: 0,
      lost: 0,
    };

    const claimsByRisk: Record<string, number> = {
      high_confidence: 0,
      moderate: 0,
      complex_litigation: 0,
    };

    const payerStatsMap: Record<
      string,
      { payer: string; totalClaims: number; totalDisputed: number; wonCount: number; wonAmount: number; scoreSum: number; scoredCount: number }
    > = {};

    for (const claim of claims) {
      const patient = patientMap.get(claim.patientId);
      const payer = patient?.insurancePayer || "Health Insurer";

      totalDisputedAmount += claim.deniedAmount;

      if (claim.status === "won") {
        overturnedWonAmount += claim.deniedAmount;
      } else if (claim.status !== "lost") {
        activeDisputedAmount += claim.deniedAmount;
      }

      if (claim.overturnProbabilityScore !== undefined) {
        totalScoreSum += claim.overturnProbabilityScore;
        scoredCount++;
      }

      if (claim.daysRemaining <= 14 && claim.status !== "won" && claim.status !== "lost") {
        criticalDeadlinesCount++;
      } else if (claim.daysRemaining <= 45 && claim.status !== "won" && claim.status !== "lost") {
        urgentDeadlinesCount++;
      }

      if (claimsByStatus[claim.status] !== undefined) {
        claimsByStatus[claim.status]++;
      }

      if (claim.riskLevel && claimsByRisk[claim.riskLevel] !== undefined) {
        claimsByRisk[claim.riskLevel]++;
      }

      if (!payerStatsMap[payer]) {
        payerStatsMap[payer] = {
          payer,
          totalClaims: 0,
          totalDisputed: 0,
          wonCount: 0,
          wonAmount: 0,
          scoreSum: 0,
          scoredCount: 0,
        };
      }

      const pStat = payerStatsMap[payer];
      pStat.totalClaims++;
      pStat.totalDisputed += claim.deniedAmount;
      if (claim.status === "won") {
        pStat.wonCount++;
        pStat.wonAmount += claim.deniedAmount;
      }
      if (claim.overturnProbabilityScore !== undefined) {
        pStat.scoreSum += claim.overturnProbabilityScore;
        pStat.scoredCount++;
      }
    }

    const averageWinScore = scoredCount > 0 ? Math.round(totalScoreSum / scoredCount) : 0;
    const recoveryRatePercent = totalDisputedAmount > 0 ? Math.round((overturnedWonAmount / totalDisputedAmount) * 100) : 0;

    const payerBreakdown = Object.values(payerStatsMap).map((p) => ({
      payer: p.payer,
      totalClaims: p.totalClaims,
      totalDisputed: p.totalDisputed,
      wonCount: p.wonCount,
      wonAmount: p.wonAmount,
      averageScore: p.scoredCount > 0 ? Math.round(p.scoreSum / p.scoredCount) : 0,
    }));

    return {
      totalClaims: aggregateCount !== null && aggregateCount >= claims.length ? aggregateCount : claims.length,
      totalDisputedAmount: aggregateSum !== null && aggregateSum > 0 ? aggregateSum : totalDisputedAmount,
      activeDisputedAmount,
      overturnedWonAmount,
      averageWinScore,
      recoveryRatePercent,
      criticalDeadlinesCount,
      urgentDeadlinesCount,
      claimsByStatus,
      claimsByRisk,
      payerBreakdown,
    };
  },
});

/**
 * Assign all unassigned legacy claims created prior to auth to the specified user (internal only)
 */
export const claimLegacyCasesInternal = internalMutation({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const allClaims = await ctx.db.query("claims").collect();
    const unassigned = allClaims.filter((c) => !c.userId);

    for (const c of unassigned) {
      await ctx.db.patch(c._id, { userId: args.userId });
    }

    return unassigned.length;
  },
});

/**
 * Delete any unassigned demo claims created prior to auth (internal only)
 */
export const clearUnassignedDemoCases = internalMutation({
  args: {},
  handler: async (ctx) => {
    const allClaims = await ctx.db.query("claims").collect();
    const unassigned = allClaims.filter((c) => !c.userId);

    for (const c of unassigned) {
      await ctx.db.delete(c._id);
      try {
        await claimsAggregate.delete(ctx, c);
      } catch {
        // Ignore if not present in aggregate
      }
    }

    return unassigned.length;
  },
});

/**
 * Permanently delete a claim case and all associated artifacts (clinical evidences,
 * synthesized appeals, AgentMail threads/messages, audit logs, and stored PDF attachments)
 */
export const deleteCase = mutation({
  args: {
    claimId: v.id("claims"),
  },
  handler: async (ctx, args) => {
    const { claim } = await requireClaimOwner(ctx, args.claimId);

    // 1. Cascade delete associated clinical evidences
    const evidences = await ctx.db
      .query("clinicalEvidences")
      .withIndex("by_claim", (q) => q.eq("claimId", args.claimId))
      .collect();
    for (const ev of evidences) {
      await ctx.db.delete(ev._id);
    }

    // 2. Cascade delete associated appeal drafts & clean up exported PDFs from storage
    const appeals = await ctx.db
      .query("appeals")
      .withIndex("by_claim", (q) => q.eq("claimId", args.claimId))
      .collect();
    for (const ap of appeals) {
      if (ap.pdfExportStorageId) {
        try {
          await ctx.storage.delete(ap.pdfExportStorageId);
        } catch {
          // File may already have been removed
        }
      }
      await ctx.db.delete(ap._id);
    }

    // 3. Cascade delete associated AgentMail messages & communication threads
    const messages = await ctx.db
      .query("emailMessages")
      .withIndex("by_claim", (q) => q.eq("claimId", args.claimId))
      .collect();
    for (const msg of messages) {
      await ctx.db.delete(msg._id);
    }

    const threads = await ctx.db
      .query("emailThreads")
      .withIndex("by_claim", (q) => q.eq("claimId", args.claimId))
      .collect();
    for (const thr of threads) {
      await ctx.db.delete(thr._id);
    }

    // 4. Cascade delete associated audit trail logs
    const auditLogs = await ctx.db
      .query("appealAuditLogs")
      .withIndex("by_claim", (q) => q.eq("claimId", args.claimId))
      .collect();
    for (const log of auditLogs) {
      await ctx.db.delete(log._id);
    }

    // 5. Delete denial letter file attachment from Convex Storage
    if (claim.denialLetterStorageId) {
      try {
        await ctx.storage.delete(claim.denialLetterStorageId);
      } catch {
        // File may already have been removed
      }
    }

    // 6. Delete the core claim record and update aggregates
    await ctx.db.delete(args.claimId);
    try {
      await claimsAggregate.delete(ctx, claim);
    } catch (err) {
      console.warn("Could not delete claim from aggregate:", err);
    }

    return {
      success: true,
      deletedClaimId: args.claimId,
      claimNumber: claim.claimNumber,
      deletedEvidenceCount: evidences.length,
      deletedAppealsCount: appeals.length,
      deletedMessagesCount: messages.length,
      deletedThreadsCount: threads.length,
      deletedAuditLogsCount: auditLogs.length,
    };
  },
});

interface PayerContactUpdateArgs {
  claimId: Id<"claims">;
  payerContact: {
    officialAppealsEmail?: string;
    intakePortalUrl?: string;
    portalName?: string;
    appealsFax?: string;
    statutoryPoBox?: string;
    ediPayerId?: string;
    tollFreeHelpline?: string;
    isVerified: boolean;
    submissionPolicyNote?: string;
    source?: string;
  };
}

async function applyPayerContactUpdate(ctx: MutationCtx, args: PayerContactUpdateArgs) {
  await ctx.db.patch(args.claimId, {
    payerContact: args.payerContact,
    updatedAt: Date.now(),
  });

  const thread = await ctx.db
    .query("emailThreads")
    .withIndex("by_claim", (q) => q.eq("claimId", args.claimId))
    .first();

  if (thread && args.payerContact.officialAppealsEmail) {
    await ctx.db.patch(thread._id, {
      payerEmail: args.payerContact.officialAppealsEmail,
    });
  }

  return { success: true };
}

/**
 * Update claim with dynamically discovered payer contact information (e.g. via Firecrawl or OCR)
 */
export const updatePayerContact = mutation({
  args: {
    claimId: v.id("claims"),
    payerContact: v.object({
      officialAppealsEmail: v.optional(v.string()),
      intakePortalUrl: v.optional(v.string()),
      portalName: v.optional(v.string()),
      appealsFax: v.optional(v.string()),
      statutoryPoBox: v.optional(v.string()),
      ediPayerId: v.optional(v.string()),
      tollFreeHelpline: v.optional(v.string()),
      isVerified: v.boolean(),
      submissionPolicyNote: v.optional(v.string()),
      source: v.optional(v.string()),
    }),
  },
  handler: async (ctx, args) => {
    await requireClaimOwner(ctx, args.claimId);
    return await applyPayerContactUpdate(ctx, args);
  },
});

/**
 * Internal mutation for background actions to update payer contact info
 */
export const updatePayerContactInternal = internalMutation({
  args: {
    claimId: v.id("claims"),
    payerContact: v.object({
      officialAppealsEmail: v.optional(v.string()),
      intakePortalUrl: v.optional(v.string()),
      portalName: v.optional(v.string()),
      appealsFax: v.optional(v.string()),
      statutoryPoBox: v.optional(v.string()),
      ediPayerId: v.optional(v.string()),
      tollFreeHelpline: v.optional(v.string()),
      isVerified: v.boolean(),
      submissionPolicyNote: v.optional(v.string()),
      source: v.optional(v.string()),
    }),
  },
  handler: async (ctx, args) => {
    return await applyPayerContactUpdate(ctx, args);
  },
});

interface AppealContextUpdateArgs {
  claimId: Id<"claims">;
  sender: {
    name: string;
    credentials?: string;
    email?: string;
    phone?: string;
  };
  clinicalFacts: {
    symptomsAndFunctionalImpact?: string;
    examinationFindings?: string;
    imagingAndDiagnostics?: string;
    treatmentHistoryAndResponse?: string;
    otherDocumentedFacts?: string;
    recordsAreIncomplete: boolean;
  };
  physicianNotes?: string;
  redactionMetadata?: {
    isRedacted: boolean;
    mode: string;
    redactedEntityCount: number;
    maskedCategories: string[];
    appliedAt: number;
  };
}

async function applyAppealContextUpdate(ctx: MutationCtx, args: AppealContextUpdateArgs) {
  const claim = await ctx.db.get(args.claimId);
  if (!claim) throw new Error("Claim not found");

  const clean = (value: string | undefined, maxLength: number) => {
    const normalized = value?.trim() || undefined;
    if (normalized && normalized.length > maxLength) {
      throw new Error(`Appeal context fields must be ${maxLength} characters or fewer`);
    }
    return normalized;
  };

  const name = args.sender.name.trim();
  if (!name) throw new Error("Enter the name of the person submitting the appeal");
  if (name.length > 200) throw new Error("Sender name must be 200 characters or fewer");

  const email = clean(args.sender.email, 320);
  const phone = clean(args.sender.phone, 80);
  if (!email && !phone) {
    throw new Error("Add an email address or phone number so the payer can contact the sender");
  }

  const now = Date.now();
  const patchPayload: Partial<Doc<"claims">> = {
    appealContext: {
      sender: {
        name,
        credentials: clean(args.sender.credentials, 200),
        email,
        phone,
      },
      clinicalFacts: {
        symptomsAndFunctionalImpact: clean(args.clinicalFacts.symptomsAndFunctionalImpact, 10000),
        examinationFindings: clean(args.clinicalFacts.examinationFindings, 10000),
        imagingAndDiagnostics: clean(args.clinicalFacts.imagingAndDiagnostics, 10000),
        treatmentHistoryAndResponse: clean(args.clinicalFacts.treatmentHistoryAndResponse, 10000),
        otherDocumentedFacts: clean(args.clinicalFacts.otherDocumentedFacts, 10000),
        recordsAreIncomplete: args.clinicalFacts.recordsAreIncomplete,
      },
      physicianNotes: clean(args.physicianNotes, 15000),
      confirmedAt: now,
    },
    updatedAt: now,
  };

  if (args.redactionMetadata) {
    patchPayload.redactionMetadata = args.redactionMetadata;
  }

  await ctx.db.patch(args.claimId, patchPayload);

  await ctx.db.insert("appealAuditLogs", {
    claimId: args.claimId,
    eventType: "appeal_context_completed",
    actor: name,
    details: "Confirmed sender identity and documented clinical context before appeal drafting.",
    timestamp: now,
  });

  if (args.redactionMetadata?.isRedacted) {
    await ctx.db.insert("appealAuditLogs", {
      claimId: args.claimId,
      eventType: "hipaa_redaction_applied",
      actor: "HIPAA Privacy Filter",
      details: `Enforced ${args.redactionMetadata.mode} redaction (${args.redactionMetadata.redactedEntityCount} entities masked: ${args.redactionMetadata.maskedCategories.join(", ")})`,
      timestamp: now,
    });
  }

  return { confirmedAt: now };
}

/**
 * Persist the human-confirmed sender identity and clinical record context used
 * to prepare an appeal.
 */
export const updateAppealContext = mutation({
  args: {
    claimId: v.id("claims"),
    sender: v.object({
      name: v.string(),
      credentials: v.optional(v.string()),
      email: v.optional(v.string()),
      phone: v.optional(v.string()),
    }),
    clinicalFacts: v.object({
      symptomsAndFunctionalImpact: v.optional(v.string()),
      examinationFindings: v.optional(v.string()),
      imagingAndDiagnostics: v.optional(v.string()),
      treatmentHistoryAndResponse: v.optional(v.string()),
      otherDocumentedFacts: v.optional(v.string()),
      recordsAreIncomplete: v.boolean(),
    }),
    physicianNotes: v.optional(v.string()),
    redactionMetadata: v.optional(
      v.object({
        isRedacted: v.boolean(),
        mode: v.string(),
        redactedEntityCount: v.number(),
        maskedCategories: v.array(v.string()),
        appliedAt: v.number(),
      })
    ),
  },
  handler: async (ctx, args) => {
    await requireClaimOwner(ctx, args.claimId);
    return await applyAppealContextUpdate(ctx, args);
  },
});

/**
 * Internal mutation for background actions to update appeal context
 */
export const updateAppealContextInternal = internalMutation({
  args: {
    claimId: v.id("claims"),
    sender: v.object({
      name: v.string(),
      credentials: v.optional(v.string()),
      email: v.optional(v.string()),
      phone: v.optional(v.string()),
    }),
    clinicalFacts: v.object({
      symptomsAndFunctionalImpact: v.optional(v.string()),
      examinationFindings: v.optional(v.string()),
      imagingAndDiagnostics: v.optional(v.string()),
      treatmentHistoryAndResponse: v.optional(v.string()),
      otherDocumentedFacts: v.optional(v.string()),
      recordsAreIncomplete: v.boolean(),
    }),
    physicianNotes: v.optional(v.string()),
    redactionMetadata: v.optional(
      v.object({
        isRedacted: v.boolean(),
        mode: v.string(),
        redactedEntityCount: v.number(),
        maskedCategories: v.array(v.string()),
        appliedAt: v.number(),
      })
    ),
  },
  handler: async (ctx, args) => {
    return await applyAppealContextUpdate(ctx, args);
  },
});

/**
 * Explicitly update HIPAA redaction metadata on a claim
 */
export const updateRedactionMetadata = mutation({
  args: {
    claimId: v.id("claims"),
    redactionMetadata: v.object({
      isRedacted: v.boolean(),
      mode: v.string(),
      redactedEntityCount: v.number(),
      maskedCategories: v.array(v.string()),
      appliedAt: v.number(),
    }),
  },
  handler: async (ctx, args) => {
    await requireClaimOwner(ctx, args.claimId);

    const now = Date.now();
    await ctx.db.patch(args.claimId, {
      redactionMetadata: args.redactionMetadata,
      updatedAt: now,
    });

    await ctx.db.insert("appealAuditLogs", {
      claimId: args.claimId,
      eventType: "hipaa_redaction_applied",
      actor: "HIPAA Privacy Filter",
      details: `Updated ${args.redactionMetadata.mode} redaction (${args.redactionMetadata.redactedEntityCount} entities masked: ${args.redactionMetadata.maskedCategories.join(", ")})`,
      timestamp: now,
    });

    return { success: true };
  },
});

/**
 * Record an audit log entry for a claim
 */
export const recordAuditLog = mutation({
  args: {
    claimId: v.id("claims"),
    eventType: v.string(),
    actor: v.string(),
    details: v.string(),
  },
  handler: async (ctx, args) => {
    await requireClaimOwner(ctx, args.claimId);

    const timestamp = Date.now();
    const logId = await ctx.db.insert("appealAuditLogs", {
      claimId: args.claimId,
      eventType: args.eventType,
      actor: args.actor,
      details: args.details,
      timestamp,
    });

    await ctx.db.patch(args.claimId, {
      updatedAt: timestamp,
    });

    return logId;
  },
});

/**
 * Update financial liability calculation data on a claim
 */
export const updateFinancialLiability = mutation({
  args: {
    claimId: v.id("claims"),
    financialLiability: v.object({
      billedAmount: v.number(),
      allowedAmount: v.number(),
      contractualDiscount: v.number(),
      deductibleTotal: v.number(),
      deductibleMet: v.number(),
      coinsuranceRate: v.number(),
      copayAmount: v.number(),
      outOfPocketMax: v.number(),
      outOfPocketSpent: v.number(),
      networkStatus: v.string(),
      noSurprisesActProtected: v.boolean(),
      calculatedPatientShare: v.number(),
      balanceBillingAmount: v.number(),
      totalPatientExposureDenied: v.number(),
      totalPatientLiabilityOverturned: v.number(),
      netPatientSavings: v.number(),
      payerExpectedObligation: v.number(),
      updatedAt: v.number(),
    }),
  },
  handler: async (ctx, args) => {
    await requireClaimOwner(ctx, args.claimId);

    const now = Date.now();
    await ctx.db.patch(args.claimId, {
      financialLiability: args.financialLiability,
      updatedAt: now,
    });

    await ctx.db.insert("appealAuditLogs", {
      claimId: args.claimId,
      eventType: "financial_liability_calculated",
      actor: "Financial Liability Sentinel",
      details: `Calculated patient exposure: Denied $${args.financialLiability.totalPatientExposureDenied.toLocaleString()} vs Overturned $${args.financialLiability.totalPatientLiabilityOverturned.toLocaleString()} (Net Savings: $${args.financialLiability.netPatientSavings.toLocaleString()})`,
      timestamp: now,
    });

    return { success: true };
  },
});

/**
 * Update statutory ERISA § 502(c) failure-to-disclose penalty data on a claim
 */
export const updateErisaPenalties = mutation({
  args: {
    claimId: v.id("claims"),
    erisaPenalties: v.object({
      documentRequestDate: v.string(),
      disclosureDeadlineDate: v.string(),
      calculationDate: v.string(),
      requestedDocuments: v.array(v.string()),
      complianceStatus: v.string(),
      dailyPenaltyRate: v.number(),
      daysInDefault: v.number(),
      accruedPenaltyAmount: v.number(),
      statutoryInterestRate: v.number(),
      accruedInterestAmount: v.number(),
      estimatedAttorneysFees: v.number(),
      totalStatutoryDamages: v.number(),
      totalPlanAdministratorExposure: v.number(),
      severityTier: v.string(),
      statutoryDemandLanguage: v.string(),
      updatedAt: v.number(),
    }),
  },
  handler: async (ctx, args) => {
    await requireClaimOwner(ctx, args.claimId);

    const now = Date.now();
    await ctx.db.patch(args.claimId, {
      erisaPenalties: args.erisaPenalties,
      updatedAt: now,
    });

    await ctx.db.insert("appealAuditLogs", {
      claimId: args.claimId,
      eventType: "erisa_penalties_assessed",
      actor: "Statutory ERISA Sentinel",
      details: `Assessed ERISA § 502(c) penalties: ${args.erisaPenalties.daysInDefault} days in default @ $${args.erisaPenalties.dailyPenaltyRate}/day = $${args.erisaPenalties.accruedPenaltyAmount.toLocaleString()} accrued penalty (Total Exposure: $${args.erisaPenalties.totalPlanAdministratorExposure.toLocaleString()})`,
      timestamp: now,
    });

    return { success: true };
  },
});
