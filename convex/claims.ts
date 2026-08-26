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
