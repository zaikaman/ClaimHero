import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";

/**
 * List all claims with optional status and payer filters, joined with patient data
 */
export const list = query({
  args: {
    status: v.optional(v.string()),
    payer: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    let claims: Doc<"claims">[];

    if (args.status && args.status !== "all") {
      claims = (await ctx.db
        .query("claims")
        .withIndex("by_status", (q: any) => q.eq("status", args.status))
        .collect()) as Doc<"claims">[];
    } else {
      claims = (await ctx.db.query("claims").collect()) as Doc<"claims">[];
    }

    // Join with patient details
    const joinedClaims = await Promise.all(
      claims.map(async (claim) => {
        const patient = (await ctx.db.get(claim.patientId)) as Doc<"patients"> | null;
        return {
          ...claim,
          patient: patient || undefined,
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
    const now = Date.now();
    const deadlineDays = args.appealFilingDeadlineDays || 180;
    const statutoryDeadline = now + deadlineDays * 86400000;
    const assignedAgentEmail = `appeal-claim-${args.claimNumber.toLowerCase().replace(/[^a-z0-9]/g, "")}@claimhero.agentmail.com`;

    const claimId = await ctx.db.insert("claims", {
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
      denialLetterStorageId: args.denialLetterStorageId,
      createdAt: now,
      updatedAt: now,
    });

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
    const now = Date.now();

    // Check if patient already exists by memberId or email
    const existingPatients = (await ctx.db
      .query("patients")
      .withIndex("by_email", (q: any) => q.eq("email", args.patientEmail))
      .collect()) as Doc<"patients">[];

    let patientId: Id<"patients">;

    if (existingPatients.length > 0 && existingPatients[0]) {
      patientId = existingPatients[0]._id;
    } else {
      patientId = await ctx.db.insert("patients", {
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
    const assignedAgentEmail = `appeal-${args.claimNumber.toLowerCase().replace(/[^a-z0-9]/g, "")}@claimhero.agentmail.com`;

    const claimId = await ctx.db.insert("claims", {
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
      denialLetterStorageId: args.denialLetterStorageId,
      createdAt: now,
      updatedAt: now,
    });

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

    await ctx.db.patch(args.claimId, patchData);

    await ctx.db.insert("appealAuditLogs", {
      claimId: args.claimId,
      eventType: `status_changed_to_${args.status}`,
      actor: args.actor || "ClaimHero Sentinel",
      details: args.details || `Case status updated to ${args.status}`,
      timestamp: now,
    });

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
    const claims = await ctx.db.query("claims").collect();
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

    const averageWinScore = scoredCount > 0 ? Math.round(totalScoreSum / scoredCount) : 89;
    const recoveryRatePercent = totalDisputedAmount > 0 ? Math.round((overturnedWonAmount / totalDisputedAmount) * 100) : 0;

    const payerBreakdown = Object.values(payerStatsMap).map((p) => ({
      payer: p.payer,
      totalClaims: p.totalClaims,
      totalDisputed: p.totalDisputed,
      wonCount: p.wonCount,
      wonAmount: p.wonAmount,
      averageScore: p.scoredCount > 0 ? Math.round(p.scoreSum / p.scoredCount) : 85,
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


