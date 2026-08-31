import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { getClaimIfAuthorized, requireClaimOwner } from "./lib/auth";

/**
 * Get a P2P defense script by its ID, checking claim ownership
 */
export const getById = query({
  args: {
    scriptId: v.id("p2pScripts"),
  },
  handler: async (ctx, args): Promise<Doc<"p2pScripts"> | null> => {
    const script = await ctx.db.get(args.scriptId);
    if (!script) return null;

    const authorized = await getClaimIfAuthorized(ctx, script.claimId);
    if (!authorized) return null;

    return script;
  },
});

/**
 * Get the latest active P2P defense script for a given claim
 */
export const getLatestByClaim = query({
  args: {
    claimId: v.id("claims"),
  },
  handler: async (ctx, args): Promise<Doc<"p2pScripts"> | null> => {
    const authorized = await getClaimIfAuthorized(ctx, args.claimId);
    if (!authorized) return null;

    const list = await ctx.db
      .query("p2pScripts")
      .withIndex("by_claim", (q) => q.eq("claimId", args.claimId))
      .collect();

    if (list.length === 0) return null;

    const latest = list.sort((a, b) => b.version - a.version)[0] || null;
    return latest;
  },
});

/**
 * Internal query for background actions to retrieve latest P2P script
 */
export const getLatestByClaimInternal = internalQuery({
  args: {
    claimId: v.id("claims"),
  },
  handler: async (ctx, args): Promise<Doc<"p2pScripts"> | null> => {
    const list = await ctx.db
      .query("p2pScripts")
      .withIndex("by_claim", (q) => q.eq("claimId", args.claimId))
      .collect();

    if (list.length === 0) return null;

    return list.sort((a, b) => b.version - a.version)[0] || null;
  },
});

/**
 * List all historical versions of P2P defense scripts for a claim
 */
export const listVersions = query({
  args: {
    claimId: v.id("claims"),
  },
  handler: async (ctx, args): Promise<Doc<"p2pScripts">[]> => {
    const authorized = await getClaimIfAuthorized(ctx, args.claimId);
    if (!authorized) return [];

    const list = await ctx.db
      .query("p2pScripts")
      .withIndex("by_claim", (q) => q.eq("claimId", args.claimId))
      .collect();

    return list.sort((a, b) => b.version - a.version);
  },
});

async function applyCreateOrUpdateScript(ctx: any, args: any): Promise<Id<"p2pScripts"> | null> {
  const claim = await ctx.db.get(args.claimId);
  if (!claim) {
    console.warn(`Claim ${args.claimId} not found during createOrUpdateScript`);
    return null;
  }

  const now = Date.now();
  const existing = await ctx.db
    .query("p2pScripts")
    .withIndex("by_claim", (q: any) => q.eq("claimId", args.claimId))
    .collect();

  const latest = existing.sort((a: any, b: any) => b.version - a.version)[0];
  const nextVersion = latest ? latest.version + 1 : 1;

  let scriptId: Id<"p2pScripts">;

  if (latest) {
    await ctx.db.patch(latest._id, {
      version: nextVersion,
      physicianName: args.physicianName,
      physicianSpecialty: args.physicianSpecialty,
      medicalDirectorRole: args.medicalDirectorRole,
      estimatedCallDuration: args.estimatedCallDuration,
      openingStatutoryStatement: args.openingStatutoryStatement,
      clinicalPolicyCitations: args.clinicalPolicyCitations,
      disqualificationCounters: args.disqualificationCounters,
      statutoryDemands: args.statutoryDemands,
      condensedCheatSheet: args.condensedCheatSheet,
      fullScriptMarkdown: args.fullScriptMarkdown,
      lastEditedBy: args.lastEditedBy || "P2P Tele-Script Generator",
      updatedAt: now,
    });
    scriptId = latest._id;
  } else {
    scriptId = await ctx.db.insert("p2pScripts", {
      claimId: args.claimId,
      version: 1,
      physicianName: args.physicianName,
      physicianSpecialty: args.physicianSpecialty,
      medicalDirectorRole: args.medicalDirectorRole,
      estimatedCallDuration: args.estimatedCallDuration,
      openingStatutoryStatement: args.openingStatutoryStatement,
      clinicalPolicyCitations: args.clinicalPolicyCitations,
      disqualificationCounters: args.disqualificationCounters,
      statutoryDemands: args.statutoryDemands,
      condensedCheatSheet: args.condensedCheatSheet,
      fullScriptMarkdown: args.fullScriptMarkdown,
      lastEditedBy: args.lastEditedBy || "P2P Tele-Script Generator",
      createdAt: now,
      updatedAt: now,
    });
  }

  // Record immutable audit event
  await ctx.db.insert("appealAuditLogs", {
    claimId: args.claimId,
    eventType: "p2p_script_generated",
    actor: args.lastEditedBy || "P2P Defense Generator",
    details: `Generated version ${nextVersion} of 3-Minute Physician P2P Defense Tele-Script (${args.disqualificationCounters.length} disqualification counters, ${args.clinicalPolicyCitations.length} policy citations).`,
    timestamp: now,
  });

  return scriptId;
}

/**
 * Create or update a P2P defense script draft
 */
export const createOrUpdateScript = mutation({
  args: {
    claimId: v.id("claims"),
    physicianName: v.string(),
    physicianSpecialty: v.optional(v.string()),
    medicalDirectorRole: v.optional(v.string()),
    estimatedCallDuration: v.string(),
    openingStatutoryStatement: v.string(),
    clinicalPolicyCitations: v.array(
      v.object({
        cpbTitle: v.string(),
        section: v.string(),
        criteriaMetText: v.string(),
        rebuttalBullet: v.string(),
        sourceUrl: v.optional(v.string()),
      })
    ),
    disqualificationCounters: v.array(
      v.object({
        insurerTrapQuestion: v.string(),
        physicianDirectRebuttal: v.string(),
        clinicalRationale: v.string(),
        regulatoryLeverage: v.optional(v.string()),
      })
    ),
    statutoryDemands: v.string(),
    condensedCheatSheet: v.object({
      rapidChecklist: v.array(v.string()),
      keyDiagnosisCodes: v.array(v.string()),
      keyProcedureCodes: v.array(v.string()),
      mustSayPoints: v.array(v.string()),
      doNotConcedePoints: v.array(v.string()),
      closingDemandStatement: v.string(),
    }),
    fullScriptMarkdown: v.string(),
    lastEditedBy: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<Id<"p2pScripts"> | null> => {
    await requireClaimOwner(ctx, args.claimId);
    return await applyCreateOrUpdateScript(ctx, args);
  },
});

/**
 * Internal mutation for background actions to generate P2P scripts
 */
export const createOrUpdateScriptInternal = internalMutation({
  args: {
    claimId: v.id("claims"),
    physicianName: v.string(),
    physicianSpecialty: v.optional(v.string()),
    medicalDirectorRole: v.optional(v.string()),
    estimatedCallDuration: v.string(),
    openingStatutoryStatement: v.string(),
    clinicalPolicyCitations: v.array(
      v.object({
        cpbTitle: v.string(),
        section: v.string(),
        criteriaMetText: v.string(),
        rebuttalBullet: v.string(),
        sourceUrl: v.optional(v.string()),
      })
    ),
    disqualificationCounters: v.array(
      v.object({
        insurerTrapQuestion: v.string(),
        physicianDirectRebuttal: v.string(),
        clinicalRationale: v.string(),
        regulatoryLeverage: v.optional(v.string()),
      })
    ),
    statutoryDemands: v.string(),
    condensedCheatSheet: v.object({
      rapidChecklist: v.array(v.string()),
      keyDiagnosisCodes: v.array(v.string()),
      keyProcedureCodes: v.array(v.string()),
      mustSayPoints: v.array(v.string()),
      doNotConcedePoints: v.array(v.string()),
      closingDemandStatement: v.string(),
    }),
    fullScriptMarkdown: v.string(),
    lastEditedBy: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<Id<"p2pScripts"> | null> => {
    return await applyCreateOrUpdateScript(ctx, args);
  },
});

/**
 * Save manual edits to the full script markdown or specific fields
 */
export const saveScriptEdits = mutation({
  args: {
    scriptId: v.id("p2pScripts"),
    fullScriptMarkdown: v.string(),
    lastEditedBy: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const script = await ctx.db.get(args.scriptId);
    if (!script) {
      throw new Error(`P2P script ${args.scriptId} not found`);
    }

    await requireClaimOwner(ctx, script.claimId);

    const now = Date.now();
    await ctx.db.patch(args.scriptId, {
      fullScriptMarkdown: args.fullScriptMarkdown,
      lastEditedBy: args.lastEditedBy || "Physician Advocate Editor",
      updatedAt: now,
    });

    return null;
  },
});
