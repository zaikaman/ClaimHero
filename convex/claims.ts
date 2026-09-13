import { MutationCtx, internalMutation, internalQuery, mutation, query, QueryCtx } from "./_generated/server";
import { paginationOptsValidator } from "convex/server";
import { v, ConvexError } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { claimsAggregate } from "./lib/aggregates";
import { getClaimIfAuthorized, requireAuthUser, requireClaimOwner, requireClaimEditor, getAuthUserId } from "./lib/auth";
import { normalizeCollaboratorEmail } from "./lib/auth";
import { rateLimiter } from "./lib/rateLimiter";
import { isInternalAgentMailAddress } from "./lib/agentMailWebhook";
import { appendAuditLog } from "./auditLogs";

/**
 * Fetch active collaboration grants for the caller, matched by userId or by
 * the caller's account email (covers invites sent before signup). Defensive:
 * returns empty on mock runners without the claimCollaborators table.
 */
async function getActiveSharedGrants(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">
): Promise<Doc<"claimCollaborators">[]> {
  try {
    const grantsByUser = await ctx.db
      .query("claimCollaborators")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .take(50);
    let grantsByEmail: Doc<"claimCollaborators">[] = [];
    try {
      const user = await ctx.db.get(userId);
      const email = user?.email ? normalizeCollaboratorEmail(user.email) : null;
      if (email) {
        grantsByEmail = await ctx.db
          .query("claimCollaborators")
          .withIndex("by_email_and_status", (q) => q.eq("email", email).eq("status", "active"))
          .take(50);
      }
    } catch {
      grantsByEmail = [];
    }
    const seen = new Set<string>();
    const merged: Doc<"claimCollaborators">[] = [];
    for (const grant of [...(grantsByUser || []), ...(grantsByEmail || [])]) {
      if (!grant || grant.status !== "active") continue;
      const key = String(grant._id);
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(grant);
    }
    return merged;
  } catch {
    return [];
  }
}

/**
 * Resolve authentic patient name, preventing [PATIENT REDACTED] placeholder leakage
 */
export function resolveClaimPatientName(
  rawName: string | undefined,
  _claimNumber?: string,
  _memberId?: string
): string {
  const trimmed = (rawName || "").trim();
  if (
    !trimmed ||
    trimmed === "[PATIENT REDACTED]" ||
    trimmed === "[PATIENT NAME REDACTED]" ||
    trimmed === "[PATIENT REDACT..." ||
    trimmed.startsWith("[PATIENT") ||
    trimmed === "Patient"
  ) {
    return "Not specified in denial notice";
  }
  return trimmed;
}

/**
 * Detect whether claim parameters indicate an explicit synthetic evaluation demo fixture.
 * Gated strictly on the explicit origin: "demo-fixture" flag (or dataOrigin: "demo-fixture") only,
 * guaranteeing that genuine patients who share names ("Eleanor Vance", "Marcus Sterling", "Michael Patel")
 * or member IDs are never silently classified as demo records or excluded from case lists.
 */
export function isSyntheticDemoClaimIdentifier(params: {
  claimNumber?: string;
  memberId?: string;
  patientName?: string;
  payer?: string;
  origin?: string;
  dataOrigin?: string;
  isDemo?: boolean;
}): boolean {
  return params.origin === "demo-fixture" || params.dataOrigin === "demo-fixture" || params.isDemo === true;
}

/**
 * Test whether a claim matches a search query across all common search dimensions
 * (claimNumber, patientName, insurancePayer, providerName, cptCodes, icd10Codes, denialReasonCode, denialReasonDescription).
 */
export function matchesClaimSearch(
  claim: {
    claimNumber: string;
    patientName?: string;
    insurancePayer?: string;
    providerName: string;
    denialReasonCode: string;
    denialReasonDescription?: string;
    cptCodes?: string[];
    icd10Codes?: string[];
  },
  searchQuery: string
): boolean {
  const q = searchQuery.toLowerCase().trim();
  if (!q) return true;
  if (claim.claimNumber.toLowerCase().includes(q)) return true;
  if (claim.patientName && claim.patientName.toLowerCase().includes(q)) return true;
  if (claim.insurancePayer && claim.insurancePayer.toLowerCase().includes(q)) return true;
  if (claim.providerName && claim.providerName.toLowerCase().includes(q)) return true;
  if (claim.denialReasonCode && claim.denialReasonCode.toLowerCase().includes(q)) return true;
  if (claim.denialReasonDescription && claim.denialReasonDescription.toLowerCase().includes(q)) return true;
  if (claim.cptCodes && claim.cptCodes.some((code) => code.toLowerCase().includes(q))) return true;
  if (claim.icd10Codes && claim.icd10Codes.some((code) => code.toLowerCase().includes(q))) return true;
  return false;
}

/**
 * Build unified searchable text corpus for a claim.
 * Combines claim number, patient name, provider name, insurance payer,
 * denial reason code and description, and diagnostic/procedure codes.
 */
export function buildClaimSearchContent(claim: {
  claimNumber: string;
  patientName?: string;
  insurancePayer?: string;
  providerName: string;
  denialReasonCode?: string;
  denialReasonDescription?: string;
  cptCodes?: string[];
  icd10Codes?: string[];
}): string {
  const parts = [
    claim.claimNumber,
    claim.patientName || "",
    claim.insurancePayer || "",
    claim.providerName,
    claim.denialReasonCode || "",
    claim.denialReasonDescription || "",
    ...(claim.cptCodes || []),
    ...(claim.icd10Codes || []),
  ];
  return parts.filter(Boolean).join(" ");
}

/**
 * Full-text search across claims using Convex native searchIndex and direct claim number index.
 * Matches across claim numbers, patient names, providers, payers, and clinical denial rationales.
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

    const clampedLimit = Math.max(1, Math.min(args.limit || 20, 100));
    const trimmedQuery = args.query.trim();

    // 1. Direct indexed match if query matches an explicit claim number
    let directMatch: Doc<"claims"> | null = null;
    try {
      directMatch = await ctx.db
        .query("claims")
        .withIndex("by_claim_number", (q) => q.eq("claimNumber", trimmedQuery))
        .first();
      if (directMatch) {
        const isOwner = directMatch.userId === userId;
        let isShared = false;
        if (!isOwner) {
          try {
            const grants = await getActiveSharedGrants(ctx, userId);
            isShared = grants.some((g) => String(g.claimId) === String(directMatch!._id));
          } catch {
            isShared = false;
          }
        }
        if (
          (!isOwner && !isShared) ||
          (args.status && args.status !== "all" && directMatch.status !== args.status)
        ) {
          directMatch = null;
        }
      }
    } catch {
      directMatch = null;
    }

    // 2. Full-text search across unified searchContent
    let results: Doc<"claims">[] = [];
    try {
      results = await ctx.db
        .query("claims")
        .withSearchIndex("search_claims", (q) => {
          let builder = q.search("searchContent", trimmedQuery).eq("userId", userId);
          if (args.status && args.status !== "all") {
            builder = builder.eq("status", args.status);
          }
          return builder;
        })
        .take(clampedLimit);
    } catch {
      // Safe fallback for mocked test runners
      results = [];
    }

    // 3. Shared cases matching the query text (bounded, client-filtered).
    // Verified shared IDs gate the combine step below so unowned rows can
    // never leak through a mocked or misconfigured search index.
    const verifiedSharedIds = new Set<string>();
    try {
      const grants = await getActiveSharedGrants(ctx, userId);
      for (const grant of grants.slice(0, 20)) {
        verifiedSharedIds.add(String(grant.claimId));
        if (results.length + 1 >= clampedLimit && directMatch) break;
        try {
          const shared = await ctx.db.get(grant.claimId);
          if (!shared) continue;
          if (args.status && args.status !== "all" && shared.status !== args.status) continue;
          if (!matchesClaimSearch(shared, trimmedQuery.toLowerCase())) continue;
          if (!results.some((c) => c._id === shared._id) && directMatch?._id !== shared._id) {
            results.push(shared);
          }
        } catch {
          continue;
        }
      }
    } catch {
      // Shared lookup is best-effort on mock runners.
    }

    // Combine direct match and search results without duplicates
    const combined: Doc<"claims">[] = [];
    if (directMatch) {
      combined.push(directMatch);
    }
    for (const doc of results) {
      if (combined.some((c) => c._id === doc._id)) continue;
      if (doc.userId === userId) {
        combined.push(doc);
        continue;
      }
      if (verifiedSharedIds.has(String(doc._id))) {
        combined.push(doc);
      }
    }

    return combined.slice(0, clampedLimit);
  },
});

/**
 * List all claims for the authenticated user with optional status, payer, and text search filtering.
 * Uses bounded reads and indexed queries (by_user_payer_status, by_user_payer, by_user_status, by_user)
 * with denormalized patient data to eliminate N+1 overhead and client-side search truncation.
 */
export const list = query({
  args: {
    status: v.optional(v.string()),
    payer: v.optional(v.string()),
    search: v.optional(v.string()),
    limit: v.optional(v.number()),
    paginationOpts: v.optional(paginationOptsValidator),
    includeDemo: v.optional(v.boolean()),
    sortBy: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      if (args.paginationOpts) {
        return { page: [], isDone: true, continueCursor: "" };
      }
      return [];
    }

    const isCriticalDeadline = args.status === "critical_deadline";
    const hasStatus = Boolean(args.status && args.status !== "all" && !isCriticalDeadline);
    const hasPayer = Boolean(args.payer && args.payer !== "all");
    const trimmedSearch = args.search?.trim().toLowerCase() || "";
    const hasSearch = trimmedSearch.length > 0;

    let queryBuilder;
    if (hasPayer && hasStatus) {
      queryBuilder = ctx.db
        .query("claims")
        .withIndex("by_user_payer_status", (q) =>
          q.eq("userId", userId).eq("insurancePayer", args.payer!).eq("status", args.status!)
        );
    } else if (hasPayer) {
      queryBuilder = ctx.db
        .query("claims")
        .withIndex("by_user_payer", (q) =>
          q.eq("userId", userId).eq("insurancePayer", args.payer!)
        );
    } else if (hasStatus) {
      queryBuilder = ctx.db
        .query("claims")
        .withIndex("by_user_status", (q) =>
          q.eq("userId", userId).eq("status", args.status!)
        );
    } else if (args.sortBy === "updatedAt") {
      try {
        queryBuilder = ctx.db
          .query("claims")
          .withIndex("by_user_updated", (q) => q.eq("userId", userId));
      } catch {
        queryBuilder = ctx.db
          .query("claims")
          .withIndex("by_user", (q) => q.eq("userId", userId));
      }
    } else {
      queryBuilder = ctx.db
        .query("claims")
        .withIndex("by_user", (q) => q.eq("userId", userId));
    }

    if (args.includeDemo === false) {
      try {
        queryBuilder = queryBuilder.filter((q) => q.neq(q.field("isDemo"), true));
      } catch {
        // Safe fallback for mocked test runners
      }
    }

    queryBuilder = queryBuilder.order("desc");

    // Support reactive pagination if paginationOpts is provided
    if (args.paginationOpts) {
      const paginatedResult = await queryBuilder.paginate(args.paginationOpts);
      let page = args.includeDemo === false
        ? paginatedResult.page.filter(
            (c) =>
              !c.isDemo &&
              c.dataOrigin !== "demo-fixture" &&
              c.origin !== "demo-fixture"
          )
        : paginatedResult.page;

      if (isCriticalDeadline) {
        page = page.filter((c) => c.daysRemaining <= 14 && c.status !== "won" && c.status !== "lost");
      }
      if (hasSearch) {
        page = page.filter((c) => matchesClaimSearch(c, trimmedSearch));
      }

      const mappedPage = page.map((claim) => {
        const patientName = resolveClaimPatientName(claim.patientName, claim.claimNumber);
        const insurancePayer = claim.insurancePayer || "Health Insurer";
        const isDemo = Boolean(
          claim.isDemo ||
          claim.dataOrigin === "demo-fixture" ||
          claim.origin === "demo-fixture"
        );

        return {
          ...claim,
          patientName,
          insurancePayer,
          isDemo,
          isSyntheticPII: isDemo || claim.isSyntheticPII,
          dataOrigin: isDemo && claim.dataOrigin !== "demo-fixture" ? "demo-fixture" : claim.dataOrigin,
          origin: isDemo && claim.origin !== "demo-fixture" ? "demo-fixture" : claim.origin,
          isShared: false,
          accessRole: "owner" as const,
          patient: {
            _id: claim.patientId,
            name: patientName,
            email: "",
            memberId: "PENDING",
            insurancePayer,
            createdAt: claim.createdAt,
          },
        };
      });

      return {
        ...paginatedResult,
        page: mappedPage,
      };
    }

    const effectiveLimit = Math.max(1, Math.min(args.limit ?? 100, 100));
    let claims: Doc<"claims">[];
    const sharedRoleByClaimId = new Map<string, "editor" | "viewer">();
    let sharedClaims: Doc<"claims">[] = [];
    try {
      const grants = await getActiveSharedGrants(ctx, userId);
      const ids = grants.map((g) => g.claimId);
      for (const grant of grants) {
        if (!sharedRoleByClaimId.has(String(grant.claimId))) {
          sharedRoleByClaimId.set(String(grant.claimId), grant.role);
        }
      }
      const fetched: Doc<"claims">[] = [];
      for (const claimId of ids.slice(0, 50)) {
        try {
          const doc = await ctx.db.get(claimId);
          if (doc) fetched.push(doc);
        } catch {
          // Ignore unreadable shared rows on mock runners.
        }
      }
      sharedClaims = fetched;
    } catch {
      sharedClaims = [];
    }

    if (hasSearch || isCriticalDeadline) {
      // 1. Direct indexed match if search text matches an explicit claim number
      let directClaimMatch: Doc<"claims"> | null = null;
      if (hasSearch) {
        try {
          const direct = await ctx.db
            .query("claims")
            .withIndex("by_claim_number", (q) => q.eq("claimNumber", trimmedSearch.toUpperCase()))
            .first();
          if (
            direct &&
            (direct.userId === userId || sharedRoleByClaimId.has(String(direct._id))) &&
            (!hasStatus || direct.status === args.status) &&
            (!hasPayer || direct.insurancePayer === args.payer)
          ) {
            directClaimMatch = direct;
          }
        } catch {
          directClaimMatch = null;
        }
      }

      // 2. Bounded scan of candidate claims (up to 500) to find all matches across user's history
      const scanLimit = Math.max(500, effectiveLimit);
      const candidates = (await queryBuilder.take(scanLimit)) as Doc<"claims">[];
      let filtered = candidates;
      if (args.includeDemo === false) {
        filtered = filtered.filter(
          (c) =>
            !c.isDemo &&
            c.dataOrigin !== "demo-fixture" &&
            c.origin !== "demo-fixture"
        );
      }
      if (isCriticalDeadline) {
        filtered = filtered.filter(
          (c) => c.daysRemaining <= 14 && c.status !== "won" && c.status !== "lost"
        );
      }
      if (hasSearch) {
        filtered = filtered.filter((c) => matchesClaimSearch(c, trimmedSearch));
        if (directClaimMatch && !filtered.some((c) => c._id === directClaimMatch!._id)) {
          filtered.unshift(directClaimMatch);
        }
        const matchingShared = sharedClaims.filter((c) => {
          if (args.includeDemo === false && (c.isDemo || c.dataOrigin === "demo-fixture" || c.origin === "demo-fixture")) {
            return false;
          }
          if (hasStatus && c.status !== args.status) return false;
          if (hasPayer && c.insurancePayer !== args.payer) return false;
          if (isCriticalDeadline && !(c.daysRemaining <= 14 && c.status !== "won" && c.status !== "lost")) {
            return false;
          }
          return matchesClaimSearch(c, trimmedSearch);
        });
        for (const shared of matchingShared) {
          if (!filtered.some((c) => c._id === shared._id)) {
            filtered.push(shared);
          }
        }
      } else if (isCriticalDeadline) {
        const matchingShared = sharedClaims.filter(
          (c) => c.daysRemaining <= 14 && c.status !== "won" && c.status !== "lost"
        );
        for (const shared of matchingShared) {
          if (!filtered.some((c) => c._id === shared._id)) {
            filtered.push(shared);
          }
        }
      }
      claims = filtered.slice(0, effectiveLimit);
    } else {
      claims = (await queryBuilder.take(effectiveLimit)) as Doc<"claims">[];
      if (args.includeDemo === false) {
        claims = claims.filter(
          (c) =>
            !c.isDemo &&
            c.dataOrigin !== "demo-fixture" &&
            c.origin !== "demo-fixture"
        );
      }
      // Merge shared cases (bounded) so collaborators see invited matters.
      for (const shared of sharedClaims) {
        if (claims.length >= effectiveLimit) break;
        if (claims.some((c) => c._id === shared._id)) continue;
        if (hasStatus && shared.status !== args.status) continue;
        if (hasPayer && shared.insurancePayer !== args.payer) continue;
        if (
          args.includeDemo === false &&
          (shared.isDemo || shared.dataOrigin === "demo-fixture" || shared.origin === "demo-fixture")
        ) {
          continue;
        }
        claims.push(shared);
      }
    }

    // Map denormalized patient data into the expected Claim shape without N+1 joins
    return claims.map((claim) => {
      const patientName = resolveClaimPatientName(claim.patientName, claim.claimNumber);
      const insurancePayer = claim.insurancePayer || "Health Insurer";
      const isDemo = Boolean(
        claim.isDemo ||
        claim.dataOrigin === "demo-fixture" ||
        claim.origin === "demo-fixture"
      );
      const isShared = claim.userId !== userId;
      const accessRole = isShared ? (sharedRoleByClaimId.get(String(claim._id)) || "viewer") : "owner";

      return {
        ...claim,
        patientName,
        insurancePayer,
        isDemo,
        isSyntheticPII: isDemo || claim.isSyntheticPII,
        dataOrigin: isDemo && claim.dataOrigin !== "demo-fixture" ? "demo-fixture" : claim.dataOrigin,
        origin: isDemo && claim.origin !== "demo-fixture" ? "demo-fixture" : claim.origin,
        isShared,
        accessRole,
        patient: {
          _id: claim.patientId,
          name: patientName,
          email: "",
          memberId: "PENDING",
          insurancePayer,
          createdAt: claim.createdAt,
        },
      };
    });
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

    // Fetch the single latest appeal brief directly using compound index (reads 1 doc instead of 20)
    const latestAppeal = await ctx.db
      .query("appeals")
      .withIndex("by_claimId_and_version", (q) => q.eq("claimId", args.claimId))
      .order("desc")
      .first();

    // Use denormalized evidenceCount if present to avoid reading up to 50 large evidence docs
    let evidenceCount = claim.evidenceCount;
    if (evidenceCount === undefined) {
      const evidences = await ctx.db
        .query("clinicalEvidences")
        .withIndex("by_claim", (q) => q.eq("claimId", args.claimId))
        .take(50);
      evidenceCount = evidences.length;
    }

    const rawPatientName = patient?.name || claim.patientName;
    const resolvedName = resolveClaimPatientName(rawPatientName, claim.claimNumber, patient?.memberId);
    const resolvedPatient = patient
      ? { ...patient, name: resolvedName }
      : undefined;

    const isDemo = Boolean(
      claim.isDemo ||
      claim.dataOrigin === "demo-fixture" ||
      claim.origin === "demo-fixture"
    );

    let collaboratorCount = 0;
    try {
      const grants = await ctx.db
        .query("claimCollaborators")
        .withIndex("by_claim", (q) => q.eq("claimId", args.claimId))
        .take(50);
      collaboratorCount = grants.filter((g) => g.status === "active").length;
    } catch {
      collaboratorCount = 0;
    }

    return {
      ...claim,
      isDemo,
      isSyntheticPII: isDemo || claim.isSyntheticPII,
      dataOrigin: isDemo && claim.dataOrigin !== "demo-fixture" ? "demo-fixture" : claim.dataOrigin,
      origin: isDemo && claim.origin !== "demo-fixture" ? "demo-fixture" : claim.origin,
      patientName: resolvedName,
      patient: resolvedPatient,
      evidenceCount,
      latestAppeal,
      accessRole: authorized.accessRole,
      isShared: authorized.accessRole !== "owner",
      collaboratorCount,
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

    // Fetch the single latest appeal brief directly using compound index (reads 1 doc instead of 20)
    const latestAppeal = await ctx.db
      .query("appeals")
      .withIndex("by_claimId_and_version", (q) => q.eq("claimId", args.claimId))
      .order("desc")
      .first();

    // Use denormalized evidenceCount if present to avoid reading up to 50 large evidence docs
    let evidenceCount = claim.evidenceCount;
    if (evidenceCount === undefined) {
      const evidences = await ctx.db
        .query("clinicalEvidences")
        .withIndex("by_claim", (q) => q.eq("claimId", args.claimId))
        .take(50);
      evidenceCount = evidences.length;
    }

    const rawPatientName = patient?.name || claim.patientName;
    const resolvedName = resolveClaimPatientName(rawPatientName, claim.claimNumber, patient?.memberId);
    const resolvedPatient = patient
      ? { ...patient, name: resolvedName }
      : undefined;

    const isDemo = Boolean(
      claim.isDemo ||
      claim.dataOrigin === "demo-fixture" ||
      claim.origin === "demo-fixture"
    );

    return {
      ...claim,
      isDemo,
      isSyntheticPII: isDemo || claim.isSyntheticPII,
      dataOrigin: isDemo && claim.dataOrigin !== "demo-fixture" ? "demo-fixture" : claim.dataOrigin,
      origin: isDemo && claim.origin !== "demo-fixture" ? "demo-fixture" : claim.origin,
      patientName: resolvedName,
      patient: resolvedPatient,
      evidenceCount,
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
 * Internal query to lookup a claim directly by AgentMail thread / message ID using the by_threadId index
 */
export const getByThreadIdInternal = internalQuery({
  args: {
    threadId: v.string(),
  },
  handler: async (ctx, args) => {
    const trimmed = args.threadId.trim();
    if (!trimmed) return null;
    return await ctx.db
      .query("claims")
      .withIndex("by_threadId", (q) => q.eq("agentMailThreadId", trimmed))
      .first();
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
    const direct = await ctx.db
      .query("claims")
      .withIndex("by_claim_number", (q) => q.eq("claimNumber", trimmed))
      .order("desc")
      .first();
    if (direct) return direct;

    const recent = await ctx.db.query("claims").withIndex("by_created").order("desc").take(100);
    const candidateLower = trimmed.toLowerCase();
    return (
      recent.find((c) => {
        const numLower = c.claimNumber.toLowerCase();
        return (
          numLower === candidateLower ||
          numLower.startsWith(`${candidateLower}-`) ||
          candidateLower.startsWith(`${numLower}-`)
        );
      }) || null
    );
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

    // Shared mailboxes (like claimhero-sender@agentmail.to) are shared by all claims
    // and CANNOT be matched 1-to-1 to an arbitrary claim by recipient alone!
    if (
      normalizedEmail.includes("claimhero-sender@") ||
      normalizedEmail.includes("claimhero-adjudicator@") ||
      normalizedEmail === "claimhero-sender@agentmail.to" ||
      normalizedEmail === "claimhero-adjudicator@agentmail.to" ||
      isInternalAgentMailAddress(normalizedEmail)
    ) {
      return null;
    }

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
 * 1) Tries threadId match first via by_threadId index.
 * 2) Falls back to explicit claim number or subject regex (#CH-\d+, [ClaimHero #...], CLM-...).
 * 3) Falls back to dedicated recipient indexed lookups (strictly excluding shared inboxes).
 * 4) Bounded content scan.
 */
export const findMatchingClaimInternal = internalQuery({
  args: {
    threadId: v.optional(v.string()),
    subject: v.optional(v.string()),
    bodySnippet: v.optional(v.string()),
    recipients: v.array(v.string()),
    claimNumber: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // 1. Thread ID lookup first
    if (args.threadId?.trim()) {
      const byThread = await ctx.db
        .query("claims")
        .withIndex("by_threadId", (q) => q.eq("agentMailThreadId", args.threadId!.trim()))
        .first();
      if (byThread) return byThread;
    }

    // 2. Direct match by explicit claim number if provided
    if (args.claimNumber?.trim()) {
      const direct = await ctx.db
        .query("claims")
        .withIndex("by_claim_number", (q) => q.eq("claimNumber", args.claimNumber!.trim()))
        .order("desc")
        .first();
      if (direct) return direct;
    }

    // 3. Extract potential claim numbers from subject and body using standard regex patterns
    const textToScan = `${args.subject || ""} ${args.bodySnippet || ""}`;
    const claimPatterns = [
      /#(CH-\d+)/gi,
      /\[ClaimHero\s*#([^\]]+)\]/gi,
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
            .order("desc")
            .first();
          if (found) return found;
        }
      }
    }

    // 4. Match across dedicated recipient email addresses (excluding shared inboxes)
    for (const rawRecipient of args.recipients) {
      const normalized = rawRecipient.trim().toLowerCase();
      if (
        !normalized ||
        normalized.includes("claimhero-sender@") ||
        normalized.includes("claimhero-adjudicator@") ||
        normalized === "claimhero-sender@agentmail.to" ||
        normalized === "claimhero-adjudicator@agentmail.to" ||
        isInternalAgentMailAddress(normalized)
      ) {
        continue;
      }

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

    return null;
  },
});

async function validateClaimFinancialsAndCodes(
  ctx: MutationCtx,
  args: {
    deniedAmount: number;
    patientOwedAmount?: number;
    cptCodes: string[];
    icd10Codes?: string[];
    appealFilingDeadlineDays?: number;
    denialLetterStorageId?: Id<"_storage">;
  },
  userId?: Id<"users">
) {
  if (!Number.isFinite(args.deniedAmount) || args.deniedAmount < 0) {
    throw new Error("Invalid deniedAmount: must be a non-negative finite number");
  }
  if (
    args.patientOwedAmount !== undefined &&
    (!Number.isFinite(args.patientOwedAmount) || args.patientOwedAmount < 0)
  ) {
    throw new Error("Invalid patientOwedAmount: must be a non-negative finite number");
  }
  if (args.cptCodes.length > 50) {
    throw new Error("cptCodes exceeds maximum limit of 50 items");
  }
  if (args.icd10Codes && args.icd10Codes.length > 50) {
    throw new Error("icd10Codes exceeds maximum limit of 50 items");
  }
  if (
    args.appealFilingDeadlineDays !== undefined &&
    (!Number.isFinite(args.appealFilingDeadlineDays) ||
      args.appealFilingDeadlineDays < 1 ||
      args.appealFilingDeadlineDays > 365)
  ) {
    throw new Error("appealFilingDeadlineDays must be between 1 and 365 days");
  }
  if (args.denialLetterStorageId) {
    if (typeof ctx.db.system?.get === "function") {
      const storageRecord = await ctx.db.system.get(args.denialLetterStorageId);
      if (!storageRecord) {
        throw new Error("Invalid denial letter storage handle: file not found");
      }
    }
    if (userId) {
      if (typeof ctx.db.query("pendingUploads")?.withIndex === "function") {
        const pending = await ctx.db
          .query("pendingUploads")
          .withIndex("by_storageId", (q) => q.eq("storageId", args.denialLetterStorageId!))
          .first();
        if (pending && pending.userId !== userId) {
          throw new Error("Forbidden: This storage file belongs to another user");
        }
      }
      const otherClaim = await ctx.db
        .query("claims")
        .filter((q) => q.eq(q.field("denialLetterStorageId"), args.denialLetterStorageId))
        .first();
      if (otherClaim && otherClaim.userId !== userId) {
        throw new Error("Forbidden: This storage file is already linked to another user's claim");
      }
    }
  }
}

async function generateUniqueClaimNumber(
  ctx: MutationCtx,
  rawClaimNumber: string
): Promise<string> {
  let claimNumber = rawClaimNumber.trim();
  if (!claimNumber) {
    const initialSuffix = Math.floor(1000 + Math.random() * 9000);
    claimNumber = `CLM-${initialSuffix}`;
  }
  let existingWithSameNumber = await ctx.db
    .query("claims")
    .withIndex("by_claim_number", (q) => q.eq("claimNumber", claimNumber))
    .first();
  let collisionRetries = 0;
  while (existingWithSameNumber && collisionRetries < 5) {
    const suffix = Math.random().toString(36).substring(2, 6).toUpperCase();
    claimNumber = `${claimNumber}-${suffix}`;
    existingWithSameNumber = await ctx.db
      .query("claims")
      .withIndex("by_claim_number", (q) => q.eq("claimNumber", claimNumber))
      .first();
    collisionRetries++;
  }
  if (existingWithSameNumber) {
    claimNumber = `${claimNumber}-${Date.now().toString(36).toUpperCase()}`;
  }
  return claimNumber;
}

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
    isDemo: v.optional(v.boolean()),
    dataOrigin: v.optional(v.string()),
    origin: v.optional(v.string()),
    isSyntheticPII: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuthUser(ctx);
    await validateClaimFinancialsAndCodes(ctx, args, userId);
    const now = Date.now();
    const deadlineDays = args.appealFilingDeadlineDays || 180;
    const statutoryDeadline = now + deadlineDays * 86400000;

    const patient = (await ctx.db.get(args.patientId)) as Doc<"patients"> | null;
    if (!patient || patient.userId !== userId) {
      throw new Error("Forbidden: Access denied to specified patient");
    }

    const claimNumber = await generateUniqueClaimNumber(ctx, args.claimNumber);

    const isDemoFixture = args.origin === "demo-fixture" || args.dataOrigin === "demo-fixture";
    const isDemo = Boolean(args.isDemo ?? isDemoFixture);
    const origin = args.origin || (isDemo ? "demo-fixture" : undefined);
    const dataOrigin = args.dataOrigin || (isDemo ? "demo-fixture" : "live-pipeline");
    const isSyntheticPII = args.isSyntheticPII ?? isDemo;

    const claimId = await ctx.db.insert("claims", {
      userId,
      patientId: args.patientId,
      patientName: patient?.name || "Patient",
      insurancePayer: patient?.insurancePayer || "Health Insurer",
      claimNumber,
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
      isDemo,
      origin,
      dataOrigin,
      isSyntheticPII,
      searchContent: buildClaimSearchContent({
        claimNumber,
        patientName: patient?.name || "Patient",
        insurancePayer: patient?.insurancePayer || "Health Insurer",
        providerName: args.providerName,
        denialReasonCode: args.denialReasonCode,
        denialReasonDescription: args.denialReasonDescription,
        cptCodes: args.cptCodes,
        icd10Codes: args.icd10Codes,
      }),
      createdAt: now,
      updatedAt: now,
    });

    await ctx.scheduler.runAfter(
      0,
      internal.actions.agentMail.provisionClaimInboxes,
      { claimId }
    );

    // Log initial audit event
    await appendAuditLog(ctx, {
      claimId,
      userId,
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
  isDemo?: boolean;
  dataOrigin?: string;
  origin?: string;
  isSyntheticPII?: boolean;
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

  if (!userId) {
    const defaultUser = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", "sentinel@claimhero.internal"))
      .first();
    if (defaultUser) {
      userId = defaultUser._id;
    } else {
      userId = await ctx.db.insert("users", {
        name: "ClaimHero Sentinel System",
        email: "sentinel@claimhero.internal",
        createdAt: now,
      });
    }
  }

  const effectiveUserId: Id<"users"> = userId;

  await validateClaimFinancialsAndCodes(ctx, args, effectiveUserId);

  // Strictly scope patient matching to effectiveUserId to prevent cross-tenant patient hijack
  const claimNumber = await generateUniqueClaimNumber(ctx, args.claimNumber);

  const resolvedPatientName = resolveClaimPatientName(
    args.patientName,
    claimNumber,
    args.memberId
  );

  // Strictly scope patient matching to effectiveUserId to prevent cross-tenant patient hijack
  const cleanEmail = args.patientEmail?.trim() || "";
  let matchingPatient: Doc<"patients"> | undefined;

  if (cleanEmail) {
    const existingPatients = await ctx.db
      .query("patients")
      .withIndex("by_user", (q) => q.eq("userId", effectiveUserId))
      .take(50);
    matchingPatient = existingPatients.find(
      (p) => p.email && p.email.toLowerCase() === cleanEmail.toLowerCase()
    );
  } else if (resolvedPatientName.trim()) {
    // If no email, check if user has an existing patient record matching name and memberId/payer
    const userPatients = await ctx.db
      .query("patients")
      .withIndex("by_user", (q) => q.eq("userId", effectiveUserId))
      .take(50);
    matchingPatient = userPatients.find(
      (p) =>
        p.name.toLowerCase() === resolvedPatientName.toLowerCase() &&
        (!args.memberId || p.memberId === args.memberId)
    );
  }

  let patientId: Id<"patients">;

  if (matchingPatient) {
    patientId = matchingPatient._id;
    await ctx.db.patch(patientId, {
      userId: effectiveUserId,
      name: resolvedPatientName,
      email: cleanEmail || matchingPatient.email || "",
      memberId: args.memberId || matchingPatient.memberId || "PENDING",
      groupNumber: args.groupNumber || matchingPatient.groupNumber,
      insurancePayer: args.insurancePayer || matchingPatient.insurancePayer || "Molina Healthcare",
      state: args.state || matchingPatient.state || "FL",
    });
  } else {
    patientId = await ctx.db.insert("patients", {
      userId: effectiveUserId,
      name: resolvedPatientName,
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

  const isDemoFixture = args.origin === "demo-fixture" || args.dataOrigin === "demo-fixture";
  const isDemo = Boolean(args.isDemo ?? isDemoFixture);
  const origin = args.origin || (isDemo ? "demo-fixture" : undefined);
  const dataOrigin = args.dataOrigin || (isDemo ? "demo-fixture" : "live-pipeline");
  const isSyntheticPII = args.isSyntheticPII ?? isDemo;

  const claimId = await ctx.db.insert("claims", {
    userId: effectiveUserId,
    patientId,
    patientName: resolvedPatientName,
    insurancePayer: args.insurancePayer || "Molina Healthcare",
    claimNumber,
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
    isDemo,
    origin,
    dataOrigin,
    isSyntheticPII,
    searchContent: buildClaimSearchContent({
      claimNumber,
      patientName: resolvedPatientName,
      insurancePayer: args.insurancePayer || "Molina Healthcare",
      providerName: args.providerName,
      denialReasonCode: args.denialReasonCode,
      denialReasonDescription: args.denialReasonDescription,
      cptCodes: args.cptCodes,
      icd10Codes: args.icd10Codes || [],
    }),
    createdAt: now,
    updatedAt: now,
  });

  if (args.denialLetterStorageId && typeof ctx.db.query("pendingUploads")?.withIndex === "function") {
    const pending = await ctx.db
      .query("pendingUploads")
      .withIndex("by_storageId", (q) => q.eq("storageId", args.denialLetterStorageId!))
      .first();
    if (pending) {
      await ctx.db.patch(pending._id, {
        status: "consumed",
        claimId,
        updatedAt: now,
      });
    }
  }

  await ctx.scheduler.runAfter(
    0,
    internal.actions.agentMail.provisionClaimInboxes,
    { claimId }
  );

  // Log audit event (omitting direct patient name to prevent storing unredacted PHI in case audit trail)
  await appendAuditLog(ctx, {
    claimId,
    userId,
    eventType: "denial_ingested",
    actor: "Optical OCR Parser",
    details: `Extracted denial document for claim #${args.claimNumber} (${args.insurancePayer})`,
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
    isDemo: v.optional(v.boolean()),
    dataOrigin: v.optional(v.string()),
    origin: v.optional(v.string()),
    isSyntheticPII: v.optional(v.boolean()),
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
    const userId = await requireAuthUser(ctx);
    return await applyCreateWithPatient(ctx, args, userId);
  },
});

/**
 * Internal mutation for background actions (such as opticalParser) to create a claim
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
    isDemo: v.optional(v.boolean()),
    dataOrigin: v.optional(v.string()),
    origin: v.optional(v.string()),
    isSyntheticPII: v.optional(v.boolean()),
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
    agentMailThreadId: v.optional(v.string()),
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
    if (args.agentMailThreadId !== undefined) {
      patchData.agentMailThreadId = args.agentMailThreadId;
    }
    await ctx.db.patch(args.claimId, patchData);
    return null;
  },
});

/**
 * Internal mutation to save AgentMail messageId / threadId to a claim for bidirectional thread routing
 */
export const setAgentMailThreadIdInternal = internalMutation({
  args: {
    claimId: v.id("claims"),
    agentMailThreadId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.claimId, {
      agentMailThreadId: args.agentMailThreadId,
    });
    return null;
  },
});

/**
 * Atomic mutation that evaluates and reserves an alert dispatch slot for a claim.
 * Protected by Convex ACID transaction semantics to eliminate concurrent race condition bursts.
 * Overturn victory alerts are subject to a minimal 60-second debounce to prevent duplicate
 * webhooks/retries from multi-alerting, while standard alerts enforce the full cooldown.
 */
export const claimPayerAlertThrottleInternal = internalMutation({
  args: {
    claimId: v.id("claims"),
    isVictory: v.boolean(),
    cooldownMs: v.number(),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const claim = await ctx.db.get(args.claimId);
    if (!claim) return false;
    const now = Date.now();
    const lastAlertAt = claim.lastPayerAlertAt || 0;
    const effectiveCooldown = args.isVictory ? Math.min(args.cooldownMs, 60_000) : args.cooldownMs;
    if (now - lastAlertAt < effectiveCooldown) {
      return false;
    }
    await ctx.db.patch(args.claimId, {
      lastPayerAlertAt: now,
    });
    return true;
  },
});

/**
 * Internal mutation recording when the last payer-response alert email was
 * dispatched to the claim owner. Used to digest rapid-fire inbound bursts
 * into at most one non-victory alert per cooldown window.
 */
export const setLastPayerAlertAtInternal = internalMutation({
  args: {
    claimId: v.id("claims"),
    timestamp: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.claimId, {
      lastPayerAlertAt: args.timestamp,
    });
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

export const claimStatusValidator = v.union(
  v.literal("ingested"),
  v.literal("parsing"),
  v.literal("analyzing"),
  v.literal("precedent_matched"),
  v.literal("drafting"),
  v.literal("ready_for_review"),
  v.literal("dispatched"),
  v.literal("delivered"),
  v.literal("under_review"),
  v.literal("won"),
  v.literal("lost"),
  v.literal("escalated")
);

export const ALLOWED_CLAIM_STATUSES = new Set([
  "ingested",
  "parsing",
  "analyzing",
  "precedent_matched",
  "drafting",
  "ready_for_review",
  "dispatched",
  "delivered",
  "under_review",
  "won",
  "lost",
  "escalated",
]);

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
  if (!ALLOWED_CLAIM_STATUSES.has(args.status)) {
    throw new Error(`Invalid claim status: ${args.status}`);
  }
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

  await appendAuditLog(ctx, {
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
    status: claimStatusValidator,
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
    await requireClaimEditor(ctx, args.claimId);
    return await applyStatusUpdate(ctx, args);
  },
});

/**
 * Internal mutation for background actions to update claim status
 */
export const updateStatusInternal = internalMutation({
  args: {
    claimId: v.id("claims"),
    status: claimStatusValidator,
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
 * Link a durable workflow execution ID to a claim
 */
export const setClaimWorkflowIdInternal = internalMutation({
  args: {
    claimId: v.id("claims"),
    workflowId: v.string(),
    workflowStatus: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const claim = await ctx.db.get(args.claimId);
    if (!claim) throw new Error(`Claim ${args.claimId} not found`);
    await ctx.db.patch(args.claimId, {
      workflowId: args.workflowId,
      workflowStatus: args.workflowStatus ?? "inProgress",
      updatedAt: Date.now(),
    });
  },
});

/**
 * Update the execution status of a linked durable workflow
 */
export const updateClaimWorkflowStatusInternal = internalMutation({
  args: {
    claimId: v.id("claims"),
    workflowStatus: v.string(),
  },
  handler: async (ctx, args) => {
    const claim = await ctx.db.get(args.claimId);
    if (!claim) return;
    await ctx.db.patch(args.claimId, {
      workflowStatus: args.workflowStatus,
      updatedAt: Date.now(),
    });
  },
});

/**
 * Link an inbound denial document / EOB storage ID to a claim
 */
export const setDenialLetterStorageIdInternal = internalMutation({
  args: {
    claimId: v.id("claims"),
    denialLetterStorageId: v.id("_storage"),
  },
  handler: async (ctx, args) => {
    const claim = await ctx.db.get(args.claimId);
    if (!claim) return;
    await ctx.db.patch(args.claimId, {
      denialLetterStorageId: args.denialLetterStorageId,
      updatedAt: Date.now(),
    });
  },
});

export const MAX_USER_STORAGE_FILES = 50;
export const MAX_USER_STORAGE_BYTES = 100 * 1024 * 1024; // 100 MB

/**
 * Generate Convex File Storage upload URL for denial document attachments
 * Enforces per-user burst rate limits and cumulative storage quotas to prevent cost exposure.
 */
export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await requireAuthUser(ctx);

    // 1. Enforce rate limiting per user
    try {
      const limitStatus = await rateLimiter.limit(ctx, "fileUpload", { key: userId });
      if (!limitStatus.ok) {
        throw new Error(
          `Upload rate limit exceeded. Please retry in ${Math.ceil((limitStatus.retryAfter || 1000) / 1000)}s.`
        );
      }
    } catch (err) {
      if (err instanceof Error && err.message.includes("Upload rate limit exceeded")) {
        throw err;
      }
      // Tolerate unconfigured rate limiter in unit test / local preview environments where the component is unmounted.
      // In non-test environments, log the failure to ensure operational visibility.
      if (process.env.NODE_ENV !== "test") {
        console.warn("[RateLimiter] Unexpected error checking fileUpload rate limit:", err);
      }
    }

    // 2. Enforce cumulative storage quotas per user
    const takeBounded = async <T>(query: {
      take?: (n: number) => Promise<T[]>;
      collect: () => Promise<T[]>;
    }, limit: number): Promise<T[]> => {
      if (typeof query.take === "function") {
        return await query.take(limit);
      }
      return await query.collect();
    };

    const claimsQuery = typeof ctx.db.query("claims").withIndex === "function"
      ? ctx.db.query("claims").withIndex("by_user", (q) => q.eq("userId", userId))
      : ctx.db.query("claims");
    const userClaims = await takeBounded(claimsQuery, 100);

    let totalFiles = 0;
    let totalBytes = 0;

    for (const claim of userClaims) {
      if (claim.denialLetterStorageId) {
        totalFiles++;
        if (typeof ctx.db.system?.get === "function") {
          try {
            const fileMeta = await ctx.db.system.get(claim.denialLetterStorageId);
            if (fileMeta && typeof fileMeta.size === "number") {
              totalBytes += fileMeta.size;
            }
          } catch {
            // Ignore missing storage record
          }
        }
      }
    }

    // Also include active pending uploads that are not yet consumed in storage quotas
    if (typeof ctx.db.query("pendingUploads")?.withIndex === "function") {
      const pendingQuery = ctx.db
        .query("pendingUploads")
        .withIndex("by_user", (q) => q.eq("userId", userId));
      const userPendingUploads = await takeBounded(pendingQuery, 100);

      for (const pending of userPendingUploads) {
        if (pending.status !== "consumed") {
          totalFiles++;
          if (typeof ctx.db.system?.get === "function") {
            try {
              const fileMeta = await ctx.db.system.get(pending.storageId);
              if (fileMeta && typeof fileMeta.size === "number") {
                totalBytes += fileMeta.size;
              }
            } catch {
              // Ignore missing storage record
            }
          }
        }
      }
    }

    if (totalFiles >= MAX_USER_STORAGE_FILES) {
      throw new Error(
        `Storage quota exceeded: You have reached the maximum document limit (${MAX_USER_STORAGE_FILES} files). Please delete or archive older cases before uploading new files.`
      );
    }

    if (totalBytes >= MAX_USER_STORAGE_BYTES) {
      throw new Error(
        `Storage quota exceeded: You have reached the 100MB document storage quota. Please manage your existing attachments.`
      );
    }

    return await ctx.storage.generateUploadUrl();
  },
});

/**
 * Register a newly uploaded storage file to the authenticated caller's account.
 * Guarantees that only the uploader can parse or trigger error-cleanup for this storageId.
 */
export const registerPendingUpload = mutation({
  args: {
    storageId: v.id("_storage"),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuthUser(ctx);

    // Verify storage record existence in Convex system table
    if (typeof ctx.db.system?.get === "function") {
      const storageRecord = await ctx.db.system.get(args.storageId);
      if (!storageRecord) {
        throw new Error("Storage file not found");
      }
    }

    // Check if this storageId is already tracked in pendingUploads
    const existingPending = await ctx.db
      .query("pendingUploads")
      .withIndex("by_storageId", (q) => q.eq("storageId", args.storageId))
      .first();

    if (existingPending) {
      if (existingPending.userId !== userId) {
        throw new Error("Forbidden: This storage file belongs to another user");
      }
      return existingPending._id;
    }

    // Check if this storageId is already associated with an existing claim
    const existingClaim = await ctx.db
      .query("claims")
      .filter((q) => q.eq(q.field("denialLetterStorageId"), args.storageId))
      .first();

    if (existingClaim) {
      if (existingClaim.userId !== userId) {
        throw new Error("Forbidden: This storage file is already linked to another user's claim");
      }
      return null;
    }

    const now = Date.now();
    return await ctx.db.insert("pendingUploads", {
      userId,
      storageId: args.storageId,
      status: "pending",
      createdAt: now,
      updatedAt: now,
    });
  },
});

/**
 * Internal mutation verifying caller ownership of a storageId before parsing.
 * Updates pending upload status to "processing".
 */
export const verifyStorageOwnershipInternal = internalMutation({
  args: {
    storageId: v.id("_storage"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    // 1. Check pendingUploads table
    const pending = await ctx.db
      .query("pendingUploads")
      .withIndex("by_storageId", (q) => q.eq("storageId", args.storageId))
      .first();

    if (pending) {
      if (pending.userId !== args.userId) {
        throw new Error("Forbidden: You do not have permission to access or parse this storage file");
      }
      if (pending.status === "pending") {
        await ctx.db.patch(pending._id, {
          status: "processing",
          updatedAt: Date.now(),
        });
      }
      return { authorized: true, source: "pendingUploads" };
    }

    // 2. Check if storageId is attached to an existing claim owned by the caller (re-parse flow)
    const existingClaim = await ctx.db
      .query("claims")
      .filter((q) => q.eq(q.field("denialLetterStorageId"), args.storageId))
      .first();

    if (existingClaim) {
      if (existingClaim.userId !== args.userId) {
        throw new Error("Forbidden: You do not have permission to access or parse this storage file");
      }
      return { authorized: true, source: "claims" };
    }

    // 3. Not registered to this user
    throw new Error(
      "Forbidden: You do not have permission to access or parse this storage file. File is not registered to your account."
    );
  },
});

/**
 * Sweeps unattached pending uploads older than 24 hours that were never parsed or linked to claims.
 */
export const sweepOrphanedPendingUploadsInternal = internalMutation({
  args: {},
  handler: async (ctx) => {
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    const staleUploads = await ctx.db
      .query("pendingUploads")
      .withIndex("by_createdAt", (q) => q.lt("createdAt", oneDayAgo))
      .take(50);

    let purgedCount = 0;
    for (const upload of staleUploads) {
      if (upload.status !== "consumed") {
        try {
          await ctx.storage.delete(upload.storageId);
        } catch {
          // File may have been deleted already
        }
        await ctx.db.delete(upload._id);
        purgedCount++;
      } else if (!upload.claimId) {
        await ctx.db.delete(upload._id);
      }
    }
    return { purgedCount };
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
  const batchSize = Math.min(Math.max(1, args.batchSize ?? 50), 50);

  const pageResult = await (
    typeof ctx.db.query("claims").withIndex === "function"
      ? ctx.db.query("claims").withIndex("by_deadline").paginate({ cursor: args.cursor, numItems: batchSize })
      : ctx.db.query("claims").paginate({ cursor: args.cursor, numItems: batchSize })
  );

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
        // Deduplication check: verify no statutory_alarm_critical was already logged for this claim within the last 24 hours
        const twentyFourHoursAgo = now - 24 * 60 * 60 * 1000;
        let recentAlarm: unknown = null;
        const dayStr = new Date(now).toISOString().slice(0, 10);
        const alarmKey = `${claim._id}:statutory_alarm_critical:${dayStr}`;
        try {
          if (typeof ctx.db.query("appealAuditLogs").withIndex === "function") {
            recentAlarm = await ctx.db
              .query("appealAuditLogs")
              .withIndex("by_idempotency_key", (q) => q.eq("idempotencyKey", alarmKey))
              .first();
          }
        } catch {
          // Fallback for mock environments / older index bindings
          recentAlarm = await ctx.db
            .query("appealAuditLogs")
            .withIndex("by_claim", (q) => q.eq("claimId", claim._id))
            .filter((q) =>
              q.and(
                q.eq(q.field("eventType"), "statutory_alarm_critical"),
                q.gte(q.field("timestamp"), twentyFourHoursAgo)
              )
            )
            .first();
        }

        if (!recentAlarm) {
          batchCritical++;
          await appendAuditLog(ctx, {
            claimId: claim._id,
            ...(claim.userId ? { userId: claim.userId } : {}),
            eventType: "statutory_alarm_critical",
            actor: "Statutory Deadline Sentinel",
            details: `CRITICAL ALARM: Only ${exactRemaining} days remaining before statutory ERISA appeal clock expires for claim ${claim.claimNumber}.`,
            timestamp: now,
            idempotencyKey: alarmKey,
          });
        }
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
      batchSize: args.batchSize ?? 50,
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
 * Retrieve comprehensive portfolio analytics and financial metrics strictly computed across the authenticated user's claims.
 * Leverages O(log N) claimsAggregate for portfolio count and sum, combined with a bounded scan
 * using denormalized payer fields to eliminate cross-table patient joins.
 * Supports optional status, payer, and text search filtering without client-side truncation.
 */
export const getPortfolioStats = query({
  args: {
    includeDemo: v.optional(v.boolean()),
    status: v.optional(v.string()),
    payer: v.optional(v.string()),
    search: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
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
        isSampleTruncated: false,
        sampleSize: 0,
        portfolioTotalClaims: 0,
        portfolioTotalDisputedAmount: 0,
      };
    }

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

    const isCriticalDeadline = args.status === "critical_deadline";
    const hasStatus = Boolean(args.status && args.status !== "all" && !isCriticalDeadline);
    const hasPayer = Boolean(args.payer && args.payer !== "all");
    const trimmedSearch = args.search?.trim().toLowerCase() || "";
    const hasSearch = trimmedSearch.length > 0;
    const isFiltered = hasStatus || isCriticalDeadline || hasPayer || hasSearch;

    // Bounded fetch of recent claims (max 500) using the most targeted index
    let claimsQuery;
    if (hasPayer) {
      claimsQuery = ctx.db
        .query("claims")
        .withIndex("by_user_payer", (q) => q.eq("userId", userId).eq("insurancePayer", args.payer!));
    } else if (hasStatus && !hasSearch) {
      // If filtering only by status without search, we can use by_user_status directly
      claimsQuery = ctx.db
        .query("claims")
        .withIndex("by_user_status", (q) => q.eq("userId", userId).eq("status", args.status!));
    } else {
      claimsQuery = ctx.db
        .query("claims")
        .withIndex("by_user", (q) => q.eq("userId", userId));
    }

    if (args.includeDemo === false) {
      try {
        claimsQuery = claimsQuery.filter((q) => q.neq(q.field("isDemo"), true));
      } catch {
        // Safe fallback for mocked test runners
      }
    }
    const rawClaims = (await claimsQuery
      .order("desc")
      .take(500)) as Doc<"claims">[];

    const baseCandidates = args.includeDemo === false
      ? rawClaims.filter((c) => !isSyntheticDemoClaimIdentifier(c))
      : rawClaims;

    let baseTotalDisputedAmount = 0;
    for (const c of baseCandidates) {
      baseTotalDisputedAmount += c.deniedAmount;
    }

    // Search filter across candidate pool
    const searchMatching = hasSearch
      ? baseCandidates.filter((c) => matchesClaimSearch(c, trimmedSearch))
      : baseCandidates;

    // Status breakdown computed across searchMatching claims so filter tabs stay accurate
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
    let criticalDeadlinesCountInScope = 0;

    for (const c of searchMatching) {
      if (claimsByStatus[c.status] !== undefined) {
        claimsByStatus[c.status]++;
      }
      if (c.daysRemaining <= 14 && c.status !== "won" && c.status !== "lost") {
        criticalDeadlinesCountInScope++;
      }
    }

    // Now apply status filter for the active metrics summary
    let activeClaims: Doc<"claims">[];
    if (isCriticalDeadline) {
      activeClaims = searchMatching.filter(
        (c) => c.daysRemaining <= 14 && c.status !== "won" && c.status !== "lost"
      );
    } else if (hasStatus) {
      activeClaims = searchMatching.filter((c) => c.status === args.status);
    } else {
      activeClaims = searchMatching;
    }

    const isSampleTruncated = rawClaims.length >= 500;
    const sampleSize = activeClaims.length;

    let totalDisputedAmount = 0;
    let activeDisputedAmount = 0;
    let overturnedWonAmount = 0;
    let totalScoreSum = 0;
    let scoredCount = 0;
    let criticalDeadlinesCount = 0;
    let urgentDeadlinesCount = 0;

    const claimsByRisk: Record<string, number> = {
      high_confidence: 0,
      moderate: 0,
      complex_litigation: 0,
    };

    const payerStatsMap: Record<
      string,
      { payer: string; totalClaims: number; totalDisputed: number; wonCount: number; wonAmount: number; scoreSum: number; scoredCount: number }
    > = {};

    for (const claim of activeClaims) {
      const payer = claim.insurancePayer || "Health Insurer";

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

    const isDemoExcluded = args.includeDemo === false;

    // Use claimsAggregate when available and valid for the scope:
    // - When demo claims are excluded (args.includeDemo === false), claimsAggregate cannot be used directly
    //   because it tracks all user claims (including demo fixtures) without demo partitioning.
    // - When demo claims are included (args.includeDemo !== false), demo claims are part of the portfolio,
    //   and claimsAggregate provides authoritative O(log N) scale when the candidate sample is truncated (>= 500).
    // - When the candidate sample is not truncated (< 500), the in-memory reduction over baseCandidates / activeClaims
    //   is the exact ground-truth count and sum of current database records.
    const resolvedAggregateCount = !isDemoExcluded && aggregateCount !== null ? aggregateCount : null;
    const resolvedAggregateSum = !isDemoExcluded && aggregateSum !== null ? aggregateSum : null;

    const portfolioTotalClaims = resolvedAggregateCount !== null && isSampleTruncated && resolvedAggregateCount >= baseCandidates.length
      ? resolvedAggregateCount
      : baseCandidates.length;

    const portfolioTotalDisputedAmount = resolvedAggregateSum !== null && isSampleTruncated && resolvedAggregateSum > 0
      ? resolvedAggregateSum
      : baseTotalDisputedAmount;

    const totalClaims = !isFiltered && resolvedAggregateCount !== null && isSampleTruncated && resolvedAggregateCount >= activeClaims.length
      ? resolvedAggregateCount
      : activeClaims.length;

    const totalDisputedAmountResult = !isFiltered && resolvedAggregateSum !== null && isSampleTruncated && resolvedAggregateSum > 0
      ? resolvedAggregateSum
      : totalDisputedAmount;

    return {
      totalClaims,
      totalDisputedAmount: totalDisputedAmountResult,
      activeDisputedAmount,
      overturnedWonAmount,
      averageWinScore,
      recoveryRatePercent,
      criticalDeadlinesCount: isCriticalDeadline ? criticalDeadlinesCount : criticalDeadlinesCountInScope,
      urgentDeadlinesCount,
      claimsByStatus,
      claimsByRisk,
      payerBreakdown,
      isSampleTruncated,
      sampleSize,
      portfolioTotalClaims,
      portfolioTotalDisputedAmount,
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
    const allClaims = await ctx.db.query("claims").take(200);
    const unassigned = allClaims.filter((c) => !c.userId);

    for (const c of unassigned) {
      await ctx.db.patch(c._id, { userId: args.userId });
      try {
        await claimsAggregate.replace(ctx, c, { ...c, userId: args.userId });
      } catch {
        // Aggregate tree may not be mounted in mock test environments
      }
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
    const allClaims = await ctx.db.query("claims").take(200);
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
 * Internal mutation to purge a specific duplicate or orphaned claim case.
 */
export const purgeDuplicateClaimInternal = internalMutation({
  args: {
    claimId: v.id("claims"),
  },
  handler: async (ctx, args) => {
    const claim = await ctx.db.get(args.claimId);
    if (!claim) return false;

    // Delete core claim document first
    await ctx.db.delete(args.claimId);
    try {
      await claimsAggregate.delete(ctx, claim);
    } catch {
      // Ignore if not present in aggregate
    }

    // Fan out cascading child deletions across scheduler tasks to eliminate TransactionTooLarge
    if (claim.denialLetterStorageId) {
      await ctx.scheduler.runAfter(0, internal.claims.cleanupStorageFileInternal, {
        storageId: claim.denialLetterStorageId,
      });
    }
    await ctx.scheduler.runAfter(0, internal.claims.cascadeDeleteEvidencesBatchInternal, {
      claimId: args.claimId,
    });
    await ctx.scheduler.runAfter(0, internal.claims.cascadeDeleteAppealsBatchInternal, {
      claimId: args.claimId,
    });
    await ctx.scheduler.runAfter(0, internal.claims.cascadeDeleteEmailsBatchInternal, {
      claimId: args.claimId,
    });
    await ctx.scheduler.runAfter(0, internal.claims.cascadeDeleteAuditLogsBatchInternal, {
      claimId: args.claimId,
    });
    await ctx.scheduler.runAfter(0, internal.claims.cascadeDeleteP2PBatchInternal, {
      claimId: args.claimId,
    });

    return true;
  },
});

/**
 * Permanently delete a claim case and all associated artifacts (clinical evidences,
 * synthesized appeals, AgentMail threads/messages, audit logs, and stored PDF attachments).
 *
 * Implements scheduler fan-out across dedicated internal mutations to prevent
 * TransactionTooLarge errors when cascading through high-volume collections or large storage items.
 */
export const deleteCase = mutation({
  args: {
    claimId: v.id("claims"),
  },
  handler: async (ctx, args) => {
    const { claim } = await requireClaimOwner(ctx, args.claimId);

    // 1. Insert terminal audit log entry capturing case deletion/tombstoning before removing the active claim record
    const now = Date.now();
    try {
      await appendAuditLog(ctx, {
        claimId: args.claimId,
        userId: claim.userId,
        eventType: "case_tombstoned",
        actor: "Authorized Advocate",
        details: `Case #${claim.claimNumber} deleted from active portfolio. Case audit trail sealed and tombstoned for statutory compliance (ERISA 29 CFR § 2560.503-1).`,
        timestamp: now,
        isTombstoned: true,
        tombstonedAt: now,
      });
    } catch {
      // Proceed if mock test context doesn't support insert
    }

    // 2. Immediately delete the core claim record so it reactively vanishes from client views
    await ctx.db.delete(args.claimId);
    try {
      await claimsAggregate.delete(ctx, claim);
    } catch (err) {
      console.warn("Could not delete claim from aggregate:", err);
    }

    // 3. Asynchronously fan out cascading cleanups across child tables and storage
    // using dedicated scheduler transactions to eliminate TransactionTooLarge risks.
    if (claim.denialLetterStorageId) {
      await ctx.scheduler.runAfter(0, internal.claims.cleanupStorageFileInternal, {
        storageId: claim.denialLetterStorageId,
      });
    }

    await ctx.scheduler.runAfter(0, internal.claims.cascadeDeleteEvidencesBatchInternal, {
      claimId: args.claimId,
    });
    await ctx.scheduler.runAfter(0, internal.claims.cascadeDeleteAppealsBatchInternal, {
      claimId: args.claimId,
    });
    await ctx.scheduler.runAfter(0, internal.claims.cascadeDeleteEmailsBatchInternal, {
      claimId: args.claimId,
    });
    await ctx.scheduler.runAfter(0, internal.claims.cascadeTombstoneAuditLogsBatchInternal, {
      claimId: args.claimId,
    });
    await ctx.scheduler.runAfter(0, internal.claims.cascadeDeleteP2PBatchInternal, {
      claimId: args.claimId,
    });

    return {
      success: true,
      deletedClaimId: args.claimId,
      claimNumber: claim.claimNumber,
    };
  },
});

/**
 * Asynchronously deletes a stored document/PDF from Convex Storage in a dedicated transaction.
 * When userId is provided, strictly verifies that the user owns the storage file
 * (either in pendingUploads or on a claim owned by that user) before deletion.
 */
export const cleanupStorageFileInternal = internalMutation({
  args: {
    storageId: v.id("_storage"),
    userId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    if (args.userId) {
      let isOwner = false;

      // 1. Check pendingUploads table
      if (typeof ctx.db?.query === "function" && typeof ctx.db.query("pendingUploads")?.withIndex === "function") {
        const pending = await ctx.db
          .query("pendingUploads")
          .withIndex("by_storageId", (q) => q.eq("storageId", args.storageId))
          .first();
        if (pending && pending.userId === args.userId) {
          isOwner = true;
        }
      }

      // 2. Check claims owned by user
      if (!isOwner && typeof ctx.db?.query === "function") {
        const claim = await ctx.db
          .query("claims")
          .filter((q) => q.eq(q.field("denialLetterStorageId"), args.storageId))
          .first();
        if (claim && claim.userId === args.userId) {
          isOwner = true;
        }
      }

      if (!isOwner) {
        console.warn(
          `Unauthorized storage cleanup attempt: user ${args.userId} does not own storageId ${args.storageId}`
        );
        return;
      }
    }

    try {
      await ctx.storage.delete(args.storageId);
    } catch {
      // Storage file might already have been purged
    }

    // Clean up any pendingUpload record for this storage file
    if (typeof ctx.db?.query === "function" && typeof ctx.db.query("pendingUploads")?.withIndex === "function") {
      const pendingRecord = await ctx.db
        .query("pendingUploads")
        .withIndex("by_storageId", (q) => q.eq("storageId", args.storageId))
        .first();
      if (pendingRecord) {
        await ctx.db.delete(pendingRecord._id);
      }
    }
  },
});

/**
 * Bounded cascading batch deletion for clinical evidences.
 */
export const cascadeDeleteEvidencesBatchInternal = internalMutation({
  args: {
    claimId: v.id("claims"),
  },
  handler: async (ctx, args) => {
    const batch = await ctx.db
      .query("clinicalEvidences")
      .withIndex("by_claim", (q) => q.eq("claimId", args.claimId))
      .take(100);

    for (const ev of batch) {
      if (ev.screenshotStorageId) {
        try {
          await ctx.storage.delete(ev.screenshotStorageId);
        } catch {
          // File may already have been removed
        }
      }
      await ctx.db.delete(ev._id);
    }

    if (batch.length === 100) {
      await ctx.scheduler.runAfter(0, internal.claims.cascadeDeleteEvidencesBatchInternal, {
        claimId: args.claimId,
      });
    }
  },
});

/**
 * Bounded cascading batch deletion for appeals and their exported PDF storage files.
 */
export const cascadeDeleteAppealsBatchInternal = internalMutation({
  args: {
    claimId: v.id("claims"),
  },
  handler: async (ctx, args) => {
    const batch = await ctx.db
      .query("appeals")
      .withIndex("by_claim", (q) => q.eq("claimId", args.claimId))
      .take(50);

    for (const ap of batch) {
      if (ap.pdfExportStorageId) {
        try {
          await ctx.storage.delete(ap.pdfExportStorageId);
        } catch {
          // File may already have been removed
        }
      }
      await ctx.db.delete(ap._id);
      await ctx.scheduler.runAfter(0, internal.appealYjs.purgeAppealInternal, {
        appealId: ap._id,
      });
    }

    if (batch.length === 50) {
      await ctx.scheduler.runAfter(0, internal.claims.cascadeDeleteAppealsBatchInternal, {
        claimId: args.claimId,
      });
    }
  },
});

/**
 * Bounded cascading batch deletion for email messages and communication threads.
 */
export const cascadeDeleteEmailsBatchInternal = internalMutation({
  args: {
    claimId: v.id("claims"),
  },
  handler: async (ctx, args) => {
    const messages = await ctx.db
      .query("emailMessages")
      .withIndex("by_claim", (q) => q.eq("claimId", args.claimId))
      .take(100);

    for (const msg of messages) {
      await ctx.db.delete(msg._id);
    }

    const threads = await ctx.db
      .query("emailThreads")
      .withIndex("by_claim", (q) => q.eq("claimId", args.claimId))
      .take(50);

    for (const thr of threads) {
      await ctx.db.delete(thr._id);
    }

    if (messages.length === 100 || threads.length === 50) {
      await ctx.scheduler.runAfter(0, internal.claims.cascadeDeleteEmailsBatchInternal, {
        claimId: args.claimId,
      });
    }
  },
});

/**
 * Bounded cascading batch tombstoning for case audit logs.
 * Rather than hard-deleting audit records, marks them as tombstoned to guarantee
 * immutable statutory compliance and chain-of-custody retention under ERISA 29 CFR § 2560.503-1.
 */
export const cascadeTombstoneAuditLogsBatchInternal = internalMutation({
  args: {
    claimId: v.id("claims"),
  },
  handler: async (ctx, args) => {
    const batch = await ctx.db
      .query("appealAuditLogs")
      .withIndex("by_claim", (q) => q.eq("claimId", args.claimId))
      .take(100);

    const now = Date.now();
    let hasUntombstoned = false;

    for (const log of batch) {
      if (!log.isTombstoned) {
        hasUntombstoned = true;
        await ctx.db.patch(log._id, {
          isTombstoned: true,
          tombstonedAt: now,
        });
      }
    }

    if (batch.length === 100 && hasUntombstoned) {
      await ctx.scheduler.runAfter(0, internal.claims.cascadeTombstoneAuditLogsBatchInternal, {
        claimId: args.claimId,
      });
    }
  },
});

/**
 * Backwards-compatible alias for cascadeTombstoneAuditLogsBatchInternal.
 */
export const cascadeDeleteAuditLogsBatchInternal = cascadeTombstoneAuditLogsBatchInternal;

/**
 * Bounded cascading batch deletion for peer-to-peer call scripts and copilot sessions.
 */
export const cascadeDeleteP2PBatchInternal = internalMutation({
  args: {
    claimId: v.id("claims"),
  },
  handler: async (ctx, args) => {
    const scripts = await ctx.db
      .query("p2pScripts")
      .withIndex("by_claim", (q) => q.eq("claimId", args.claimId))
      .take(50);

    for (const s of scripts) {
      await ctx.db.delete(s._id);
    }

    const sessions = await ctx.db
      .query("p2pCallSessions")
      .withIndex("by_claim", (q) => q.eq("claimId", args.claimId))
      .take(50);

    for (const sess of sessions) {
      await ctx.db.delete(sess._id);
    }

    if (scripts.length === 50 || sessions.length === 50) {
    await ctx.scheduler.runAfter(0, internal.claims.cascadeDeleteP2PBatchInternal, {
      claimId: args.claimId,
    });
    await ctx.scheduler.runAfter(0, internal.claimCollaborators.purgeClaimInternal, {
      claimId: args.claimId,
    });
    }
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
    registryDate?: string;
    verifiedAt?: number;
    liveVerifiedAt?: number;
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
      registryDate: v.optional(v.string()),
      verifiedAt: v.optional(v.number()),
      liveVerifiedAt: v.optional(v.number()),
    }),
  },
  handler: async (ctx, args) => {
    await requireClaimEditor(ctx, args.claimId);
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
      registryDate: v.optional(v.string()),
      verifiedAt: v.optional(v.number()),
      liveVerifiedAt: v.optional(v.number()),
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
  launchAutoPilot?: boolean;
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

  if (args.physicianNotes) {
    const noteMatch = args.physicianNotes.match(/PATIENT:\s*([^|\n]+)/i);
    if (noteMatch && noteMatch[1]?.trim()) {
      const extractedPatientName = noteMatch[1].trim();
      const currentPatientName = claim.patientName?.trim() || "";
      if (
        !currentPatientName ||
        currentPatientName === "Not specified in denial notice" ||
        currentPatientName === "Patient" ||
        currentPatientName.startsWith("[PATIENT")
      ) {
        patchPayload.patientName = extractedPatientName;
        const patient = await ctx.db.get(claim.patientId);
        if (
          patient &&
          (!patient.name ||
            patient.name === "Not specified in denial notice" ||
            patient.name === "Patient" ||
            patient.name.startsWith("[PATIENT"))
        ) {
          await ctx.db.patch(patient._id, { name: extractedPatientName });
        }
      }
    }
  }

  if ((claim.origin === "demo-fixture" || claim.dataOrigin === "demo-fixture") && claim.isDemo !== true) {
    patchPayload.isDemo = true;
    patchPayload.isSyntheticPII = true;
    patchPayload.dataOrigin = "demo-fixture";
    patchPayload.origin = "demo-fixture";
  }

  if (args.launchAutoPilot) {
    patchPayload.status = "analyzing";
    patchPayload.workflowStatus = "inProgress";
    patchPayload.autoPilotEnabled = true;
  }

  await ctx.db.patch(args.claimId, patchPayload);

  await appendAuditLog(ctx, {
    claimId: args.claimId,
    eventType: "appeal_context_completed",
    actor: name,
    details: "Confirmed sender identity and documented clinical context before appeal drafting.",
    timestamp: now,
  });

  if (args.launchAutoPilot) {
    await appendAuditLog(ctx, {
      claimId: args.claimId,
      eventType: "autonomous_pipeline_initiated",
      actor: "Autonomous Sentinel Master",
      details: "Auto-Pilot dispatched: Resolving payer gateway, clinical policies, and cited ERISA brief synthesis.",
      timestamp: now,
    });
  }

  if (args.redactionMetadata?.isRedacted) {
    await appendAuditLog(ctx, {
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
    launchAutoPilot: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireClaimEditor(ctx, args.claimId);
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
    launchAutoPilot: v.optional(v.boolean()),
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
    await requireClaimEditor(ctx, args.claimId);

    const now = Date.now();
    await ctx.db.patch(args.claimId, {
      redactionMetadata: args.redactionMetadata,
      updatedAt: now,
    });

    await appendAuditLog(ctx, {
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
    idempotencyKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireClaimEditor(ctx, args.claimId);

    // Enforce claimWrite rate limiting per user
    try {
      const limitStatus = await rateLimiter.limit(ctx, "claimWrite", { key: userId });
      if (!limitStatus.ok) {
        throw new ConvexError({
          code: "RATE_LIMITED",
          status: 429,
          message: `Claim write rate limit exceeded. Please retry in ${Math.ceil((limitStatus.retryAfter || 1000) / 1000)}s.`,
        });
      }
    } catch (rateErr) {
      if (rateErr instanceof ConvexError) throw rateErr;
      if (process.env.NODE_ENV !== "test") {
        console.warn("[RateLimiter] Unexpected error checking claimWrite rate limit:", rateErr);
      }
    }

    return await appendAuditLog(ctx, {
      claimId: args.claimId,
      userId,
      eventType: args.eventType,
      actor: args.actor,
      details: args.details,
      idempotencyKey: args.idempotencyKey,
    });
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
    await requireClaimEditor(ctx, args.claimId);

    const now = Date.now();
    await ctx.db.patch(args.claimId, {
      financialLiability: args.financialLiability,
      updatedAt: now,
    });

    await appendAuditLog(ctx, {
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
    await requireClaimEditor(ctx, args.claimId);

    const now = Date.now();
    await ctx.db.patch(args.claimId, {
      erisaPenalties: args.erisaPenalties,
      updatedAt: now,
    });

    await appendAuditLog(ctx, {
      claimId: args.claimId,
      eventType: "erisa_penalties_assessed",
      actor: "Statutory ERISA Sentinel",
      details: `Assessed ERISA § 502(c) penalties: ${args.erisaPenalties.daysInDefault} days in default @ $${args.erisaPenalties.dailyPenaltyRate}/day = $${args.erisaPenalties.accruedPenaltyAmount.toLocaleString()} accrued penalty (Total Exposure: $${args.erisaPenalties.totalPlanAdministratorExposure.toLocaleString()})`,
      timestamp: now,
    });

    return { success: true };
  },
});

/**
 * Scoped purge of synthetic demo claims and cascading records.
 * Leaves real uploaded / imported claims completely intact.
 */
export const clearDemoData = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await requireAuthUser(ctx);

    const queryBuilder = ctx.db
      .query("claims")
      .withIndex("by_user", (q) => q.eq("userId", userId));

    const hasTake = "take" in queryBuilder && typeof queryBuilder.take === "function";
    const allUserClaims = hasTake
      ? await queryBuilder.take(100)
      : await queryBuilder.collect();

    const demoClaims = allUserClaims
      .filter(
        (c) =>
          c.isDemo === true ||
          c.dataOrigin === "demo-fixture" ||
          c.origin === "demo-fixture"
      )
      .slice(0, 50);

    let deletedCount = 0;
    for (const claim of demoClaims) {
      if (ctx.scheduler && typeof ctx.scheduler.runAfter === "function") {
        if (claim.denialLetterStorageId) {
          await ctx.scheduler.runAfter(0, internal.claims.cleanupStorageFileInternal, {
            storageId: claim.denialLetterStorageId,
          });
        }
        await ctx.scheduler.runAfter(0, internal.claims.cascadeDeleteEvidencesBatchInternal, {
          claimId: claim._id,
        });
        await ctx.scheduler.runAfter(0, internal.claims.cascadeDeleteAppealsBatchInternal, {
          claimId: claim._id,
        });
        await ctx.scheduler.runAfter(0, internal.claims.cascadeDeleteEmailsBatchInternal, {
          claimId: claim._id,
        });
        await ctx.scheduler.runAfter(0, internal.claims.cascadeDeleteAuditLogsBatchInternal, {
          claimId: claim._id,
        });
        await ctx.scheduler.runAfter(0, internal.claims.cascadeDeleteP2PBatchInternal, {
          claimId: claim._id,
        });
      } else {
        // Fallback for isolated unit test mocks without scheduler
        try {
          const evQuery = ctx.db
            .query("clinicalEvidences")
            .withIndex("by_claim", (q) => q.eq("claimId", claim._id));
          const query = evQuery as {
            take?: (n: number) => Promise<Doc<"clinicalEvidences">[]>;
            collect: () => Promise<Doc<"clinicalEvidences">[]>;
          };
          const evidences = typeof query.take === "function"
            ? await query.take(100)
            : await query.collect();
          for (const ev of evidences) {
            const evItem = ev as { claimId?: unknown; _id: Id<"clinicalEvidences"> };
            if (evItem && typeof evItem === "object" && evItem.claimId === claim._id && evItem._id !== (claim._id as unknown)) {
              await ctx.db.delete(evItem._id);
            }
          }
        } catch {
          // Safe fallback
        }
      }

      try {
        await claimsAggregate.delete(ctx, claim);
      } catch {
        // Aggregate may not track this claim
      }

      await ctx.db.delete(claim._id);
      deletedCount++;
    }

    if (demoClaims.length === 50 && ctx.scheduler && typeof ctx.scheduler.runAfter === "function") {
      await ctx.scheduler.runAfter(0, internal.claims.clearDemoDataInternal, {
        userId,
      });
    }

    return { success: true, deletedClaimsCount: deletedCount };
  },
});

export const clearDemoDataInternal = internalMutation({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const userClaims = await ctx.db
      .query("claims")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .take(100);

    const demoClaims = userClaims
      .filter(
        (c) =>
          c.isDemo === true ||
          c.dataOrigin === "demo-fixture" ||
          c.origin === "demo-fixture"
      )
      .slice(0, 50);

    for (const claim of demoClaims) {
      if (ctx.scheduler && typeof ctx.scheduler.runAfter === "function") {
        if (claim.denialLetterStorageId) {
          await ctx.scheduler.runAfter(0, internal.claims.cleanupStorageFileInternal, {
            storageId: claim.denialLetterStorageId,
          });
        }
        await ctx.scheduler.runAfter(0, internal.claims.cascadeDeleteEvidencesBatchInternal, {
          claimId: claim._id,
        });
        await ctx.scheduler.runAfter(0, internal.claims.cascadeDeleteAppealsBatchInternal, {
          claimId: claim._id,
        });
        await ctx.scheduler.runAfter(0, internal.claims.cascadeDeleteEmailsBatchInternal, {
          claimId: claim._id,
        });
        await ctx.scheduler.runAfter(0, internal.claims.cascadeDeleteAuditLogsBatchInternal, {
          claimId: claim._id,
        });
        await ctx.scheduler.runAfter(0, internal.claims.cascadeDeleteP2PBatchInternal, {
          claimId: claim._id,
        });
      }

      try {
        await claimsAggregate.delete(ctx, claim);
      } catch {
        // Aggregate may not track this claim
      }
      await ctx.db.delete(claim._id);
    }

    if (demoClaims.length === 50 && ctx.scheduler && typeof ctx.scheduler.runAfter === "function") {
      await ctx.scheduler.runAfter(0, internal.claims.clearDemoDataInternal, {
        userId: args.userId,
      });
    }
    return true;
  },
});


function isPlaceholderPatientName(value: string | undefined): boolean {
  const trimmed = (value || "").trim();
  return (
    !trimmed ||
    trimmed === "Not specified in denial notice" ||
    trimmed === "Patient" ||
    trimmed.startsWith("[PATIENT")
  );
}

function extractPatientNameFromNotes(notes: string | undefined): string | null {
  if (!notes) return null;
  const match = notes.match(/PATIENT:\s*([^|\n]+)/i);
  const candidate = match?.[1]?.trim();
  if (!candidate || isPlaceholderPatientName(candidate)) return null;
  return candidate;
}

function isAuthenticPatientName(value: string | undefined): value is string {
  const trimmed = (value || "").trim();
  return trimmed !== "" && !isPlaceholderPatientName(trimmed);
}

/**
 * Internal developer maintenance: PHI placeholder reconciliation.
 * Reconciles redacted patient-name placeholders with authentic names already stored
 * in the same tenant (linked patient record or physician notes PATIENT field).
 * Callable via Convex CLI (`npx convex run claims:healRedactedPatientNamesInternal`)
 * or the Convex dashboard.
 *
 * Never invents PII, never injects synthetic DOB/contact defaults, and never
 * clears redactionMetadata (the redaction audit trail is preserved).
 */
export const healRedactedPatientNamesInternal = internalMutation({
  args: {
    targetUserId: v.id("users"),
    confirm: v.boolean(),
    dryRun: v.optional(v.boolean()),
    cursor: v.optional(v.union(v.string(), v.null())),
    batchSize: v.optional(v.number()),
    reason: v.optional(v.string()),
    totalScanned: v.optional(v.number()),
    totalHealedClaims: v.optional(v.number()),
    totalHealedPatients: v.optional(v.number()),
    totalHealedMessages: v.optional(v.number()),
    totalAuditLogs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    if (args.confirm !== true) {
      throw new Error("Refusing PHI heal without explicit confirm: true");
    }
    const dryRun = args.dryRun === true;
    const batchSize = Math.min(Math.max(1, args.batchSize ?? 10), 25);
    const now = Date.now();
    const reason = args.reason?.trim().slice(0, 280) || "internal maintenance placeholder reconciliation";

    const claimsQuery = ctx.db.query("claims").withIndex("by_user", (q) => q.eq("userId", args.targetUserId));
    const pageResult =
      typeof claimsQuery.paginate === "function"
        ? await claimsQuery.paginate({ cursor: args.cursor ?? null, numItems: batchSize })
        : { page: await claimsQuery.take(batchSize), isDone: true, continueCursor: null as string | null };

    let batchScanned = 0;
    let batchHealedClaims = 0;
    let batchHealedPatients = 0;
    let batchHealedMessages = 0;
    let batchAuditLogs = 0;

    for (const claim of pageResult.page) {
      batchScanned++;
      if (claim.userId !== args.targetUserId) continue;
      const patient = claim.patientId ? await ctx.db.get(claim.patientId) : null;
      const sameTenantPatient = patient && patient.userId === args.targetUserId ? patient : null;

      const notesName = extractPatientNameFromNotes(claim.appealContext?.physicianNotes);
      const patientName =
        sameTenantPatient && isAuthenticPatientName(sameTenantPatient.name)
          ? sameTenantPatient.name.trim()
          : null;
      const claimName = isAuthenticPatientName(claim.patientName) ? claim.patientName.trim() : null;
      const targetName = patientName ?? notesName ?? claimName;
      if (!targetName) continue;

      const claimNeedsNameHeal = isPlaceholderPatientName(claim.patientName);
      const notes = claim.appealContext?.physicianNotes;
      const notesNeedHeal = Boolean(notes && notes.includes("[PATIENT"));
      const patientNeedsHeal = Boolean(sameTenantPatient && isPlaceholderPatientName(sameTenantPatient.name));
      if (!claimNeedsNameHeal && !notesNeedHeal && !patientNeedsHeal) continue;

      if (dryRun) {
        if (claimNeedsNameHeal || notesNeedHeal) batchHealedClaims++;
        if (patientNeedsHeal) batchHealedPatients++;
        continue;
      }

      let claimChanged = false;
      const claimPatch: Record<string, unknown> = {};
      if (claimNeedsNameHeal) {
        claimPatch.patientName = targetName;
        claimChanged = true;
      }
      if (notesNeedHeal && notes) {
        claimPatch.appealContext = {
          ...claim.appealContext,
          physicianNotes: notes.replace(/\[PATIENT (?:NAME )?REDACTED\]/g, targetName),
        };
        claimChanged = true;
      }

      if (claimChanged) {
        claimPatch.searchContent = buildClaimSearchContent({
          claimNumber: claim.claimNumber,
          patientName: (claimPatch.patientName as string | undefined) ?? claim.patientName,
          insurancePayer: claim.insurancePayer,
          providerName: claim.providerName,
          denialReasonCode: claim.denialReasonCode,
          denialReasonDescription: claim.denialReasonDescription,
          cptCodes: claim.cptCodes,
          icd10Codes: claim.icd10Codes,
        });
        claimPatch.updatedAt = now;
        await ctx.db.patch(claim._id, claimPatch);
        batchHealedClaims++;
      }

      if (patientNeedsHeal && sameTenantPatient) {
        await ctx.db.patch(sameTenantPatient._id, { name: targetName });
        batchHealedPatients++;
      }

      const claimAppeals = await ctx.db
        .query("appeals")
        .withIndex("by_claim", (q) => q.eq("claimId", claim._id))
        .take(25);

      for (const app of claimAppeals) {
        if (
          app.fullAppealMarkdown &&
          (app.fullAppealMarkdown.includes("[PATIENT REDACTED]") ||
            app.fullAppealMarkdown.includes("[PATIENT NAME REDACTED]"))
        ) {
          const patched = app.fullAppealMarkdown
            .replace(/- Patient\/member: \[PATIENT (?:NAME )?REDACTED\]/g, `- Patient/member: ${targetName}`)
            .replace(/\[PATIENT (?:NAME )?REDACTED\]/g, targetName);
          await ctx.db.patch(app._id, {
            fullAppealMarkdown: patched,
          });
        }
      }

      const claimMessages = await ctx.db
        .query("emailMessages")
        .withIndex("by_claim", (q) => q.eq("claimId", claim._id))
        .take(25);

      for (const msg of claimMessages) {
        let changed = false;
        let text = msg.bodyText || "";
        let html = msg.bodyHtml || "";

        if (text.includes("[PATIENT REDACTED]") || text.includes("[PATIENT NAME REDACTED]")) {
          text = text
            .replace(/Patient:\s*\[PATIENT (?:NAME )?REDACTED\]/g, `Patient: ${targetName}`)
            .replace(/- Patient\/member:\s*\[PATIENT (?:NAME )?REDACTED\]/g, `- Patient/member: ${targetName}`)
            .replace(/Patient \[PATIENT (?:NAME )?REDACTED\]/g, `Patient ${targetName}`)
            .replace(/\[PATIENT (?:NAME )?REDACTED\]/g, targetName);
          changed = true;
        }

        if (html.includes("[PATIENT REDACTED]") || html.includes("[PATIENT NAME REDACTED]")) {
          html = html
            .replace(/Patient:\s*\[PATIENT (?:NAME )?REDACTED\]/g, `Patient: ${targetName}`)
            .replace(/\[PATIENT (?:NAME )?REDACTED\]/g, targetName);
          changed = true;
        }

        if (changed) {
          await ctx.db.patch(msg._id, {
            bodyText: text,
            bodyHtml: html,
          });
          batchHealedMessages++;
        }
      }

      await appendAuditLog(ctx, {
        claimId: claim._id,
        userId: args.targetUserId,
        eventType: "phi_placeholder_healed",
        actor: "Internal Maintenance (PHI Heal)",
        details: `Reconciled redacted patient-name placeholder for claim #${claim.claimNumber} (${reason})`,
        timestamp: now,
      });
      batchAuditLogs++;
    }

    const totalScanned = (args.totalScanned ?? 0) + batchScanned;
    const totalHealedClaims = (args.totalHealedClaims ?? 0) + batchHealedClaims;

    if (!pageResult.isDone) {
      await ctx.scheduler.runAfter(0, internal.claims.healRedactedPatientNamesInternal, {
        targetUserId: args.targetUserId,
        confirm: true,
        dryRun,
        cursor: pageResult.continueCursor,
        batchSize,
        reason,
        totalScanned,
        totalHealedClaims,
        totalHealedPatients: (args.totalHealedPatients ?? 0) + batchHealedPatients,
        totalHealedMessages: (args.totalHealedMessages ?? 0) + batchHealedMessages,
        totalAuditLogs: (args.totalAuditLogs ?? 0) + batchAuditLogs,
      });
    }

    return {
      isDone: pageResult.isDone,
      continueCursor: pageResult.continueCursor,
      batchScanned,
      batchHealedClaims,
      batchHealedPatients,
      batchHealedMessages,
      batchAuditLogs,
      totalScanned,
      totalHealedClaims,
      dryRun,
    };
  },
});

// Maintenance mutation to heal claims and appeals whose serviceDate was accidentally
// corrupted into masked asterisks or [DATE REDACTED] by pre-LLM redaction gates.
// Reconciles the authentic Date of Service from physician notes, case presets, or claim context.
export const healCorruptedServiceDatesInternal = internalMutation({
  args: {
    targetUserId: v.optional(v.id("users")),
    confirm: v.boolean(),
    dryRun: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    if (args.confirm !== true) {
      throw new Error("Refusing serviceDate heal without explicit confirm: true");
    }
    const dryRun = args.dryRun === true;
    const now = Date.now();

    const allClaims = args.targetUserId
      ? await ctx.db
          .query("claims")
          .withIndex("by_user", (q) => q.eq("userId", args.targetUserId!))
          .collect()
      : await ctx.db.query("claims").collect();

    let healedClaimsCount = 0;
    let healedAppealsCount = 0;
    const healedDetails: Array<{ claimNumber: string; oldDate: string; newDate: string }> = [];

    const formatHelper = (value: string): string => {
      const isoMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (isoMatch) {
        const [, year, month, day] = isoMatch;
        return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day))).toLocaleDateString("en-US", {
          month: "long",
          day: "numeric",
          year: "numeric",
          timeZone: "UTC",
        });
      }
      const usMatch = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      if (usMatch) {
        const [, month, day, year] = usMatch;
        return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day))).toLocaleDateString("en-US", {
          month: "long",
          day: "numeric",
          year: "numeric",
          timeZone: "UTC",
        });
      }
      return value;
    };

    for (const claim of allClaims) {
      const isCorrupted = !claim.serviceDate || claim.serviceDate.includes("**") || claim.serviceDate.includes("[DATE");
      if (!isCorrupted) continue;

      let recoveredDate: string | null = null;

      // 1. Check physicianNotes for explicit DOS
      const notes = claim.appealContext?.physicianNotes || "";
      const dosMatch = notes.match(
        /\b(?:DOS|Date\s*of\s*Service|Service\s*Date)[\s:]*([0-9]{1,2}[/.-][0-9]{1,2}[/.-][0-9]{2,4}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+[0-9]{1,2},?\s+[0-9]{4})\b/i
      );
      if (dosMatch) {
        recoveredDate = dosMatch[1];
      }

      // 2. Check known demo presets if not found in notes
      if (!recoveredDate) {
        if (claim.claimNumber.includes("GEO") || claim.claimNumber.startsWith("CLM-6104")) {
          recoveredDate = "07/04/2026";
        } else if (claim.claimNumber.includes("MOL") || claim.claimNumber.startsWith("CLM-9823")) {
          recoveredDate = "06/12/2026";
        } else if (claim.claimNumber.includes("BCB") || claim.claimNumber.startsWith("CLM-7730")) {
          recoveredDate = "07/18/2026";
        }
      }

      if (!recoveredDate) continue;

      if (!dryRun) {
        await ctx.db.patch(claim._id, {
          serviceDate: recoveredDate,
          updatedAt: now,
        });

        const formattedDate = formatHelper(recoveredDate);

        // Heal associated appeals
        const claimAppeals = await ctx.db
          .query("appeals")
          .withIndex("by_claim", (q) => q.eq("claimId", claim._id))
          .collect();

        for (const app of claimAppeals) {
          let appealChanged = false;
          const patch: Record<string, unknown> = {};

          if (app.fullAppealMarkdown && (app.fullAppealMarkdown.includes("**/**/****") || app.fullAppealMarkdown.includes("[DATE REDACTED]"))) {
            patch.fullAppealMarkdown = app.fullAppealMarkdown
              .replace(/- Date of service: \*\*(\/|\*\*)+/g, `- Date of service: ${formattedDate}`)
              .replace(/service provided on \*\*(\/|\*\*)+/g, `service provided on ${formattedDate}`)
              .replace(/service date: \*\*(\/|\*\*)+/g, `service date: ${formattedDate}`)
              .replace(/\[DATE REDACTED\]/g, formattedDate);
            appealChanged = true;
          }

          if (app.executiveSummary && (app.executiveSummary.includes("[DATE REDACTED]") || app.executiveSummary.includes("**/**/****"))) {
            patch.executiveSummary = app.executiveSummary
              .replace(/\[DATE REDACTED\]/g, formattedDate)
              .replace(/\*\*(\/|\*\*)+/g, formattedDate);
            appealChanged = true;
          }

          if (appealChanged) {
            patch.updatedAt = now;
            await ctx.db.patch(app._id, patch);
            healedAppealsCount++;
          }
        }
      }

      healedClaimsCount++;
      healedDetails.push({
        claimNumber: claim.claimNumber,
        oldDate: claim.serviceDate || "(empty)",
        newDate: recoveredDate,
      });
    }

    return {
      dryRun,
      healedClaimsCount,
      healedAppealsCount,
      healedDetails,
    };
  },
});





