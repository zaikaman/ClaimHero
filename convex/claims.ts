import { internalMutation, mutation, query } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";

/**
 * List all claims with optional status and payer filters, scoped to the authenticated user
 */
export const list = query({
  args: {
    status: v.optional(v.string()),
    payer: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    let claims: Doc<"claims">[];

    if (userId) {
      if (args.status && args.status !== "all") {
        const ownedClaims = (await ctx.db
          .query("claims")
          .withIndex("by_user_status", (q: any) =>
            q.eq("userId", userId).eq("status", args.status)
          )
          .collect()) as Doc<"claims">[];
        const sharedIntakeClaims = (await ctx.db
          .query("claims")
          .withIndex("by_user_status", (q: any) =>
            q.eq("userId", undefined).eq("status", args.status)
          )
          .collect()) as Doc<"claims">[];
        claims = [...ownedClaims, ...sharedIntakeClaims];
      } else {
        const ownedClaims = (await ctx.db
          .query("claims")
          .withIndex("by_user", (q: any) => q.eq("userId", userId))
          .collect()) as Doc<"claims">[];
        const sharedIntakeClaims = (await ctx.db
          .query("claims")
          .withIndex("by_user", (q: any) => q.eq("userId", undefined))
          .collect()) as Doc<"claims">[];
        claims = [...ownedClaims, ...sharedIntakeClaims];
      }
    } else {
      if (args.status && args.status !== "all") {
        claims = (await ctx.db
          .query("claims")
          .withIndex("by_status", (q: any) => q.eq("status", args.status))
          .collect()) as Doc<"claims">[];
      } else {
        claims = (await ctx.db.query("claims").collect()) as Doc<"claims">[];
      }
    }

    // Join with patient details, latest appeal draft, and evidence count
    const joinedClaims = await Promise.all(
      claims.map(async (claim) => {
        const patient = (await ctx.db.get(claim.patientId)) as Doc<"patients"> | null;
        const appeals = await ctx.db
          .query("appeals")
          .withIndex("by_claim", (q: any) => q.eq("claimId", claim._id))
          .collect();
        const latestAppeal = appeals.sort((a, b) => b.version - a.version)[0] || null;

        const evidences = await ctx.db
          .query("clinicalEvidences")
          .withIndex("by_claim", (q: any) => q.eq("claimId", claim._id))
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
    const claim = (await ctx.db.get(args.claimId)) as Doc<"claims"> | null;
    if (!claim) return null;

    const patient = (await ctx.db.get(claim.patientId)) as Doc<"patients"> | null;

    const evidences = await ctx.db
      .query("clinicalEvidences")
      .withIndex("by_claim", (q: any) => q.eq("claimId", args.claimId))
      .collect();

    const appeals = await ctx.db
      .query("appeals")
      .withIndex("by_claim", (q: any) => q.eq("claimId", args.claimId))
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
    const userId = await getAuthUserId(ctx);
    const now = Date.now();
    const deadlineDays = args.appealFilingDeadlineDays || 180;
    const statutoryDeadline = now + deadlineDays * 86400000;
    const assignedAgentEmail = `appeal-claim-${args.claimNumber.toLowerCase().replace(/[^a-z0-9]/g, "")}@claimhero.agentmail.com`;

    const claimId = await ctx.db.insert("claims", {
      userId: userId ?? undefined,
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
      assignedAgentEmail,
      agentMailProvisioningStatus: "pending",
      denialLetterStorageId: args.denialLetterStorageId,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.scheduler.runAfter(
      0,
      (internal as any)["actions/agentMail"].provisionClaimInboxes,
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

    return claimId;
  },
});

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
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    const now = Date.now();

    // Check if patient already exists by memberId or email
    const existingPatients = (await ctx.db
      .query("patients")
      .withIndex("by_email", (q: any) => q.eq("email", args.patientEmail))
      .collect()) as Doc<"patients">[];

    let patientId: Id<"patients">;

    if (existingPatients.length > 0 && existingPatients[0]) {
      patientId = existingPatients[0]._id;
      await ctx.db.patch(patientId, {
        name: args.patientName,
        memberId: args.memberId,
        groupNumber: args.groupNumber,
        insurancePayer: args.insurancePayer,
        state: args.state,
      });
    } else {
      patientId = await ctx.db.insert("patients", {
        userId: userId ?? undefined,
        name: args.patientName,
        email: args.patientEmail,
        memberId: args.memberId,
        groupNumber: args.groupNumber,
        insurancePayer: args.insurancePayer,
        state: args.state,
        createdAt: now,
      });
    }

    const deadlineDays = args.appealFilingDeadlineDays || 180;
    const statutoryDeadline = now + deadlineDays * 86400000;
    const assignedAgentEmail = `appeal-claim-${args.claimNumber.toLowerCase().replace(/[^a-z0-9]/g, "")}@claimhero.agentmail.com`;

    const claimId = await ctx.db.insert("claims", {
      userId: userId ?? undefined,
      patientId,
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
      assignedAgentEmail,
      agentMailProvisioningStatus: "pending",
      denialLetterStorageId: args.denialLetterStorageId,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.scheduler.runAfter(
      0,
      (internal as any)["actions/agentMail"].provisionClaimInboxes,
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

    return claimId;
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
      // Keep the existing UI and webhook contract pointed at the real inbox.
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
    const now = Date.now();

    const patchData: Record<string, any> = {
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
        (internal as any)["actions/precedentArchive"].indexWonAppeal,
        { claimId: args.claimId }
      );
    }

    return null;
  },
});

/**
 * Generate Convex File Storage upload URL for denial document attachments
 */
export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl();
  },
});

/**
 * Sweep and recalculate statutory deadlines across all open claims
 */
export const sweepDeadlines = mutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const openClaims = await ctx.db.query("claims").collect();
    let updatedCount = 0;
    let criticalCount = 0;

    for (const claim of openClaims) {
      if (claim.status === "won" || claim.status === "lost") continue;

      const exactRemaining = Math.max(0, Math.ceil((claim.statutoryDeadline - now) / 86400000));

      if (exactRemaining !== claim.daysRemaining) {
        await ctx.db.patch(claim._id, {
          daysRemaining: exactRemaining,
          updatedAt: now,
        });
        updatedCount++;

        if (exactRemaining <= 14 && claim.daysRemaining > 14) {
          criticalCount++;
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

    return { updatedCount, criticalCount };
  },
});

/**
 * Retrieve comprehensive portfolio analytics and financial metrics computed across all claims
 */
export const getPortfolioStats = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    let claims: Doc<"claims">[];

    if (userId) {
      claims = (await ctx.db
        .query("claims")
        .withIndex("by_user", (q: any) => q.eq("userId", userId))
        .collect()) as Doc<"claims">[];
    } else {
      claims = (await ctx.db.query("claims").collect()) as Doc<"claims">[];
    }

    const patients = await ctx.db.query("patients").collect();
    const patientMap = new Map(patients.map((p) => [p._id, p]));

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
      totalClaims: claims.length,
      totalDisputedAmount,
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
 * Assign all unassigned legacy claims created prior to auth to the currently logged in user
 */
export const claimLegacyCases = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Must be authenticated to claim legacy records");

    const allClaims = await ctx.db.query("claims").collect();
    const unassigned = allClaims.filter((c) => !c.userId);

    for (const c of unassigned) {
      await ctx.db.patch(c._id, { userId });
    }

    return unassigned.length;
  },
});

/**
 * Delete any unassigned demo claims created prior to auth
 */
export const clearUnassignedDemoCases = mutation({
  args: {},
  handler: async (ctx) => {
    const allClaims = await ctx.db.query("claims").collect();
    const unassigned = allClaims.filter((c) => !c.userId);

    for (const c of unassigned) {
      await ctx.db.delete(c._id);
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
    const userId = await getAuthUserId(ctx);
    const claim = (await ctx.db.get(args.claimId)) as Doc<"claims"> | null;
    if (!claim) {
      throw new Error("Case not found or already deleted");
    }

    // Ownership verification: user can only delete their own cases (or unassigned demo cases)
    if (claim.userId && userId && claim.userId !== userId) {
      throw new Error("Unauthorized: You do not have permission to delete this case");
    }

    // 1. Cascade delete associated clinical evidences
    const evidences = await ctx.db
      .query("clinicalEvidences")
      .withIndex("by_claim", (q: any) => q.eq("claimId", args.claimId))
      .collect();
    for (const ev of evidences) {
      await ctx.db.delete(ev._id);
    }

    // 2. Cascade delete associated appeal drafts & clean up exported PDFs from storage
    const appeals = await ctx.db
      .query("appeals")
      .withIndex("by_claim", (q: any) => q.eq("claimId", args.claimId))
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
      .withIndex("by_claim", (q: any) => q.eq("claimId", args.claimId))
      .collect();
    for (const msg of messages) {
      await ctx.db.delete(msg._id);
    }

    const threads = await ctx.db
      .query("emailThreads")
      .withIndex("by_claim", (q: any) => q.eq("claimId", args.claimId))
      .collect();
    for (const thr of threads) {
      await ctx.db.delete(thr._id);
    }

    // 4. Cascade delete associated audit trail logs
    const auditLogs = await ctx.db
      .query("appealAuditLogs")
      .withIndex("by_claim", (q: any) => q.eq("claimId", args.claimId))
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

    // 6. Delete the core claim record
    await ctx.db.delete(args.claimId);

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
    await ctx.db.patch(args.claimId, {
      payerContact: args.payerContact,
      updatedAt: Date.now(),
    });

    const thread = await ctx.db
      .query("emailThreads")
      .withIndex("by_claim", (q: any) => q.eq("claimId", args.claimId))
      .first();

    if (thread && args.payerContact.officialAppealsEmail) {
      await ctx.db.patch(thread._id, {
        payerEmail: args.payerContact.officialAppealsEmail,
      });
    }

    return { success: true };
  },
});

/**
 * Persist the human-confirmed sender identity and clinical record context used
 * to prepare an appeal. The clinical fields are evidence supplied for review;
 * they are never treated as proof merely because a user entered them.
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
  },
  handler: async (ctx, args) => {
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
    await ctx.db.patch(args.claimId, {
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
        confirmedAt: now,
      },
      updatedAt: now,
    });

    await ctx.db.insert("appealAuditLogs", {
      claimId: args.claimId,
      eventType: "appeal_context_completed",
      actor: name,
      details: "Confirmed sender identity and documented clinical context before appeal drafting.",
      timestamp: now,
    });

    return { confirmedAt: now };
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
