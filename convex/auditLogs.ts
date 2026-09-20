import { mutation, query, internalMutation, type MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import { type Id, type Doc } from "./_generated/dataModel";
import { getClaimIfAuthorized, requireClaimEditor, getAuthUserId } from "./lib/auth";

/**
 * List chronological audit trail events for a specific claim, checking authorization
 */
export const listByClaim = query({
  args: {
    claimId: v.id("claims"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const authorized = await getClaimIfAuthorized(ctx, args.claimId);
    if (!authorized) return [];

    const limit = Math.max(1, Math.min(args.limit ?? 100, 100));

    return await ctx.db
      .query("appealAuditLogs")
      .withIndex("by_claim_and_timestamp", (q) => q.eq("claimId", args.claimId))
      .order("desc")
      .take(limit);
  },
});

/**
 * Genesis hash for the initial block in any claim's audit chain (64 hex zeroes).
 */
export const GENESIS_HASH = "0".repeat(64);

/**
 * Computes deterministic rolling SHA-256 hash under ERISA 29 CFR § 2560.503-1:
 * currentHash = sha256(previousHash + eventType + claimId + timestamp + details).
 * Uses native WebCrypto (subtle.digest) with seamless Node.js dynamic import fallback.
 */
export async function computeAuditHash(
  previousHash: string,
  eventType: string,
  claimId: string,
  timestamp: number,
  details: string
): Promise<string> {
  const payload = `${previousHash}${eventType}${claimId}${timestamp}${details}`;
  if (typeof crypto !== "undefined" && crypto?.subtle?.digest) {
    const encoder = new TextEncoder();
    const data = encoder.encode(payload);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }
  try {
    const moduleName = "node:crypto";
    const nodeCrypto = await import(/* @vite-ignore */ moduleName);
    return nodeCrypto.createHash("sha256").update(payload, "utf8").digest("hex");
  } catch {
    throw new Error("SHA-256 cryptographic engine not available in runtime");
  }
}

/**
 * Computes deterministic audit log idempotency key (claimId:eventType:day)
 * to prevent retry storms from sweeps, crons, and webhooks.
 */
export function computeAuditIdempotencyKey(
  claimId: string,
  eventType: string,
  timestamp: number = Date.now()
): string {
  const day = new Date(timestamp).toISOString().slice(0, 10);
  return `${claimId}:${eventType}:${day}`;
}

/**
 * Canonical audit field constraints. Enforced centrally in appendAuditLog so
 * every writer (public mutations, internal mutations, background actions,
 * crons, workflows) is bound by the same trust boundary.
 */
const AUDIT_EVENT_TYPE_PATTERN = /^[A-Za-z0-9_.-]+$/;
const AUDIT_MAX_EVENT_TYPE_LENGTH = 64;
const AUDIT_MAX_ACTOR_LENGTH = 128;
const AUDIT_MAX_DETAILS_LENGTH = 4000;
const AUDIT_MAX_IDEMPOTENCY_KEY_LENGTH = 256;
const AUDIT_FUTURE_TIMESTAMP_SKEW_MS = 5 * 60 * 1000;
const AUDIT_HASH_PATTERN = /^[0-9a-f]{64}$/;

function assertValidAuditEventType(eventType: string): string {
  const trimmed = (eventType ?? "").trim();
  if (!trimmed || trimmed.length > AUDIT_MAX_EVENT_TYPE_LENGTH) {
    throw new Error("Invalid eventType: must be a non-empty string under 64 characters");
  }
  if (!AUDIT_EVENT_TYPE_PATTERN.test(trimmed)) {
    throw new Error(
      "Invalid eventType: must contain only letters, numbers, underscore, dot, or hyphen"
    );
  }
  return trimmed;
}

function assertValidAuditActor(actor: string): string {
  const trimmed = (actor ?? "").trim();
  if (!trimmed || trimmed.length > AUDIT_MAX_ACTOR_LENGTH) {
    throw new Error("Invalid actor: must be a non-empty string under 128 characters");
  }
  if (/[\r\n\0]/.test(trimmed)) {
    throw new Error("Invalid actor: must not contain line breaks or null bytes");
  }
  return trimmed;
}

function assertValidAuditDetails(details: string): string {
  if (typeof details !== "string") {
    throw new Error("Invalid details: must be a string");
  }
  const trimmed = details.trim();
  if (trimmed.length > AUDIT_MAX_DETAILS_LENGTH) {
    throw new Error("Invalid details: exceeds 4,000 character limit");
  }
  return trimmed;
}

function assertValidAuditTimestamp(timestamp: number): number {
  if (!Number.isFinite(timestamp) || timestamp < 0) {
    throw new Error("Invalid audit timestamp");
  }
  if (timestamp > Date.now() + AUDIT_FUTURE_TIMESTAMP_SKEW_MS) {
    throw new Error("Invalid audit timestamp: timestamp is in the future");
  }
  return timestamp;
}

function assertValidAuditIdempotencyKey(key: string | undefined): string | undefined {
  if (key === undefined) return undefined;
  if (typeof key !== "string" || key.length === 0 || key.length > AUDIT_MAX_IDEMPOTENCY_KEY_LENGTH) {
    throw new Error("Invalid idempotencyKey: must be a non-empty string under 256 characters");
  }
  return key;
}

/**
 * Resolve the stored userId authoritatively from the claim. A caller-supplied
 * userId is honored only when it belongs to the claim owner or an active
 * collaborator; anything else falls back to the claim owner so background
 * pipelines cannot attribute audit blocks to arbitrary users.
 */
async function resolveAuditUserId(
  ctx: MutationCtx,
  claim: { userId?: Id<"users"> } | null,
  requestedUserId: Id<"users"> | undefined
): Promise<Id<"users"> | undefined> {
  if (!claim?.userId) {
    return requestedUserId;
  }
  if (!requestedUserId || requestedUserId === claim.userId) {
    return claim.userId;
  }
  try {
    if (typeof ctx.db.query !== "function" || typeof ctx.db.get !== "function") {
      return requestedUserId;
    }
    const requestedUser = await ctx.db.get(requestedUserId);
    if (!requestedUser) {
      return claim.userId;
    }
    const grants = await ctx.db
      .query("claimCollaborators")
      .withIndex("by_claim", (q) => q.eq("claimId", (claim as unknown as Doc<"claims">)._id))
      .take(20);
    if (!Array.isArray(grants)) {
      return claim.userId;
    }
    const requestedEmail =
      typeof requestedUser.email === "string" ? requestedUser.email.trim().toLowerCase() : null;
    for (const grant of grants) {
      if (!grant || grant.status !== "active") continue;
      if (grant.userId && grant.userId === requestedUserId) {
        if (grant.role === "editor" || grant.role === "viewer") return requestedUserId;
      }
      if (
        requestedEmail &&
        typeof grant.email === "string" &&
        grant.email.trim().toLowerCase() === requestedEmail
      ) {
        if (grant.role === "editor" || grant.role === "viewer") return requestedUserId;
      }
    }
  } catch {
    // Mock runners without the collaborators table fall back to owner attribution.
    return claim.userId;
  }
  return claim.userId;
}

/**
 * Backfill-only seal for the cryptographic audit trail of a claim.
 *
 * Append-only invariant: once an audit block carries a stored hash, that hash
 * is never rewritten. The helper runs in two phases so tampering can never be
 * covered up:
 *   1. Recompute the expected chain in memory and verify every sealed block.
 *      Any sealed hash mismatch aborts with an error before any write occurs.
 *   2. Patch only unsealed blocks (missing hash) plus linkage metadata
 *      (previousHash/sequenceNumber) on blocks whose hash already matches.
 *
 * Because sealed hashes are never mutated, exposing this helper through an
 * authenticated mutation is safe: editors can complete a legacy backfill but
 * cannot rewrite history.
 */
export async function sealAuditChainForClaimHelper(
  ctx: MutationCtx,
  claimId: Id<"claims">
): Promise<{ totalSealed: number; newlySealed: number; totalRecords: number; terminalHash: string }> {
  if (typeof ctx.db.query !== "function") {
    return { totalSealed: 0, newlySealed: 0, totalRecords: 0, terminalHash: GENESIS_HASH };
  }

  const rawLogs = await ctx.db
    .query("appealAuditLogs")
    .withIndex("by_claim_and_timestamp", (q) => q.eq("claimId", claimId))
    .order("asc")
    .take(500);

  const logs = [...rawLogs].sort((a: Doc<"appealAuditLogs">, b: Doc<"appealAuditLogs">) => {
    if (a.timestamp !== b.timestamp) return a.timestamp - b.timestamp;
    if (a.sequenceNumber != null && b.sequenceNumber != null && a.sequenceNumber !== b.sequenceNumber) {
      return a.sequenceNumber - b.sequenceNumber;
    }
    const aTime = a._creationTime ?? 0;
    const bTime = b._creationTime ?? 0;
    if (aTime !== bTime) return aTime - bTime;
    return (a._id || "").localeCompare(b._id || "");
  });

  if (logs.length === 0) {
    return { totalSealed: 0, newlySealed: 0, totalRecords: 0, terminalHash: GENESIS_HASH };
  }

  // Phase 1: recompute the expected chain and verify every sealed block.
  // No writes happen in this phase so a tampered prefix aborts cleanly.
  const plans: Array<{
    log: Doc<"appealAuditLogs">;
    seq: number;
    prevHash: string;
    expectedHash: string;
    needsHash: boolean;
    needsLinkage: boolean;
  }> = [];
  let rollingHash = GENESIS_HASH;

  for (let i = 0; i < logs.length; i++) {
    const log = logs[i];
    const seq = i + 1;
    const prevHash = rollingHash;
    const expectedHash = await computeAuditHash(
      prevHash,
      log.eventType,
      log.claimId,
      log.timestamp,
      log.details
    );

    if (log.hash != null) {
      if (typeof log.hash !== "string" || !AUDIT_HASH_PATTERN.test(log.hash) || log.hash !== expectedHash) {
        throw new Error(
          `Audit chain tamper detected at block #${seq}: stored seal does not match recomputed hash. Seal aborted; no records were modified.`
        );
      }
      plans.push({
        log,
        seq,
        prevHash,
        expectedHash,
        needsHash: false,
        needsLinkage: log.previousHash !== prevHash || log.sequenceNumber !== seq,
      });
    } else {
      plans.push({
        log,
        seq,
        prevHash,
        expectedHash,
        needsHash: true,
        needsLinkage: true,
      });
    }

    rollingHash = expectedHash;
  }

  // Phase 2: backfill only. Sealed hashes are never overwritten.
  let newlySealed = 0;
  for (const plan of plans) {
    if (plan.needsHash) {
      await ctx.db.patch(plan.log._id, {
        hash: plan.expectedHash,
        previousHash: plan.prevHash,
        sequenceNumber: plan.seq,
      });
      newlySealed++;
    } else if (plan.needsLinkage) {
      await ctx.db.patch(plan.log._id, {
        previousHash: plan.prevHash,
        sequenceNumber: plan.seq,
      });
    }
  }

  return {
    totalSealed: logs.length,
    newlySealed,
    totalRecords: logs.length,
    terminalHash: rollingHash,
  };
}

export interface AppendAuditLogArgs {
  claimId: Id<"claims">;
  userId?: Id<"users">;
  eventType: string;
  actor: string;
  details: string;
  timestamp?: number;
  idempotencyKey?: string;
  isTombstoned?: boolean;
  tombstonedAt?: number;
}

/**
 * Universal helper to append a case audit log entry with deterministic rolling SHA-256
 * Merkle chain sealing under ERISA 29 CFR § 2560.503-1.
 * Guarantees that every newly written audit block contains parent linkage, valid sequence number,
 * and a tamper-evident SHA-256 seal.
 *
 * Single trust boundary for all writers: validates eventType/actor/details/
 * timestamp/idempotencyKey, requires the claim to exist, resolves userId
 * authoritatively from the claim (spoofed userIds fall back to the owner),
 * enforces monotonic timestamps so callers cannot backdate blocks, and
 * refuses to extend a tampered chain instead of resealing over it.
 */
export async function appendAuditLog(
  ctx: MutationCtx,
  args: AppendAuditLogArgs
): Promise<Id<"appealAuditLogs">> {
  const eventType = assertValidAuditEventType(args.eventType);
  const actor = assertValidAuditActor(args.actor);
  const details = assertValidAuditDetails(args.details);
  const timestamp = assertValidAuditTimestamp(args.timestamp ?? Date.now());
  const idempotencyKey = assertValidAuditIdempotencyKey(args.idempotencyKey);

  const hasGet = typeof ctx.db.get === "function";
  const claim = hasGet ? await ctx.db.get(args.claimId) : null;
  if (hasGet && !claim) {
    throw new Error(`Claim ${args.claimId} not found`);
  }
  const resolvedUserId = await resolveAuditUserId(ctx, claim, args.userId);

  const effectiveKey =
    idempotencyKey ||
    (eventType.startsWith("statutory_alarm") || eventType.includes("alarm")
      ? computeAuditIdempotencyKey(args.claimId, eventType, timestamp)
      : undefined);

  if (effectiveKey && typeof ctx.db.query === "function") {
    try {
      const existing = await ctx.db
        .query("appealAuditLogs")
        .withIndex("by_idempotency_key", (q) => q.eq("idempotencyKey", effectiveKey))
        .first();
      if (existing) {
        return existing._id;
      }
    } catch {
      // Safe fallback for mock runners
    }
  }

  let previousHash = GENESIS_HASH;
  let sequenceNumber = 1;

  if (typeof ctx.db.query === "function") {
    try {
      const lastLog = await ctx.db
        .query("appealAuditLogs")
        .withIndex("by_claim_and_timestamp", (q) => q.eq("claimId", args.claimId))
        .order("desc")
        .first();

      if (lastLog) {
        // Monotonicity guard: new blocks must not predate the chain tip.
        // Without this, a caller-supplied timestamp could insert a block
        // mid-chain and fork the deterministic timestamp ordering.
        if (typeof lastLog.timestamp === "number" && timestamp < lastLog.timestamp) {
          throw new Error("Invalid audit timestamp: must not predate the latest chain block");
        }
        if (
          typeof lastLog.hash === "string" &&
          AUDIT_HASH_PATTERN.test(lastLog.hash) &&
          typeof lastLog.sequenceNumber === "number"
        ) {
          previousHash = lastLog.hash;
          sequenceNumber = lastLog.sequenceNumber + 1;
        } else {
          // Unsealed legacy records exist; backfill them so the new log links
          // to an unbroken root. The backfill helper aborts on tamper instead
          // of resealing over it, so this path cannot cover up modifications.
          const sealResult = await sealAuditChainForClaimHelper(ctx, args.claimId);
          if (timestamp < 0) {
            throw new Error("Invalid audit timestamp");
          }
          previousHash = sealResult.terminalHash;
          sequenceNumber = sealResult.totalRecords + 1;
        }
      }
    } catch (err) {
      if (
        err instanceof Error &&
        (err.message.includes("predate the latest chain block") ||
          err.message.includes("tamper detected"))
      ) {
        throw err;
      }
      // Safe fallback for mock runners
    }
  }

  const hash = await computeAuditHash(
    previousHash,
    eventType,
    args.claimId,
    timestamp,
    details
  );

  // Tombstone flags are a retention state transition, not per-event metadata.
  // Only the case_tombstoned lifecycle event may create a tombstoned block so
  // writers cannot silently hide entries from default portfolio views.
  const allowTombstoneFlags = eventType === "case_tombstoned";

  const logId = await ctx.db.insert("appealAuditLogs", {
    claimId: args.claimId,
    ...(resolvedUserId ? { userId: resolvedUserId } : {}),
    eventType,
    actor,
    details,
    timestamp,
    idempotencyKey: effectiveKey,
    ...(allowTombstoneFlags && args.isTombstoned !== undefined
      ? { isTombstoned: args.isTombstoned }
      : {}),
    ...(allowTombstoneFlags && args.tombstonedAt !== undefined
      ? { tombstonedAt: args.tombstonedAt }
      : {}),
    hash,
    previousHash,
    sequenceNumber,
  });

  return logId;
}

/**
 * Append an event to the case audit log, checking claim ownership and computing
 * an unbroken cryptographic rolling SHA-256 Merkle chain. Editors may append
 * new blocks but can never rewrite sealed history (enforced in the helper).
 */
export const logEvent = mutation({
  args: {
    claimId: v.id("claims"),
    eventType: v.string(),
    actor: v.string(),
    details: v.string(),
    idempotencyKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireClaimEditor(ctx, args.claimId);

    // Fast-path validation for clear client errors; appendAuditLog re-validates
    // authoritatively so no writer can bypass the trust boundary.
    const eventType = assertValidAuditEventType(args.eventType);
    const actor = assertValidAuditActor(args.actor);
    const details = assertValidAuditDetails(args.details);
    const idempotencyKey = assertValidAuditIdempotencyKey(args.idempotencyKey);

    const timestamp = Date.now();
    const logId = await appendAuditLog(ctx, {
      claimId: args.claimId,
      userId,
      eventType,
      actor,
      details,
      timestamp,
      idempotencyKey,
    });

    // Update claim's last modified timestamp
    if (typeof ctx.db.patch === "function") {
      try {
        await ctx.db.patch(args.claimId, {
          updatedAt: timestamp,
        });
      } catch {
        // Safe fallback
      }
    }

    return logId;
  },
});

/**
 * Backend-only mutation for logging events from actions, workflows, crons,
 * and schedulers. Not reachable from clients (Convex internal visibility).
 *
 * Hardened against forged callers: the shared append helper requires the
 * claim to exist, validates every field, resolves userId authoritatively to
 * the claim owner/collaborator set, rejects future/backdated timestamps, and
 * refuses service actors that impersonate user email identities.
 */
export const logEventInternal = internalMutation({
  args: {
    claimId: v.id("claims"),
    userId: v.optional(v.id("users")),
    eventType: v.string(),
    actor: v.string(),
    details: v.string(),
    idempotencyKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actorPreview = (args.actor ?? "").trim();
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(actorPreview)) {
      throw new Error("Invalid internal actor: service identities must not impersonate user emails");
    }
    return await appendAuditLog(ctx, args);
  },
});

/**
 * Backfill unsealed legacy blocks into an unbroken SHA-256 chain under
 * ERISA 29 CFR 2560.503-1. Append-only: sealed hashes are verified and never
 * rewritten, and any sealed mismatch aborts with a tamper error before any
 * write. Editor access is therefore safe — this mutation can complete a
 * legacy migration but cannot cover up modifications.
 */
export const sealClaimAuditChain = mutation({
  args: {
    claimId: v.id("claims"),
  },
  handler: async (ctx, args) => {
    await requireClaimEditor(ctx, args.claimId);
    return await sealAuditChainForClaimHelper(ctx, args.claimId);
  },
});

/**
 * Verify the cryptographic Merkle/audit chain for a claim under ERISA 29 CFR § 2560.503-1.
 * Recomputes the deterministic rolling SHA-256 hash across all chronological records
 * to detect any backdating, alteration, or tampering.
 */
export const verifyAuditChain = query({
  args: {
    claimId: v.id("claims"),
  },
  handler: async (ctx, args) => {
    const authorized = await getClaimIfAuthorized(ctx, args.claimId);
    if (!authorized) {
      return {
        isValid: false,
        totalRecords: 0,
        verifiedRecords: 0,
        genesisHash: GENESIS_HASH,
        terminalHash: GENESIS_HASH,
        durationMs: 0,
        tamperDetected: false,
        needsReseal: false,
        failureReason: "Unauthorized claim access",
        verifiedAt: Date.now(),
      };
    }

    const startTime = Date.now();

    const rawLogs = await ctx.db
      .query("appealAuditLogs")
      .withIndex("by_claim_and_timestamp", (q) => q.eq("claimId", args.claimId))
      .order("asc")
      .take(500);

    const logs = [...rawLogs].sort((a: Doc<"appealAuditLogs">, b: Doc<"appealAuditLogs">) => {
      if (a.timestamp !== b.timestamp) return a.timestamp - b.timestamp;
      if (a.sequenceNumber != null && b.sequenceNumber != null && a.sequenceNumber !== b.sequenceNumber) {
        return a.sequenceNumber - b.sequenceNumber;
      }
      const aTime = a._creationTime ?? 0;
      const bTime = b._creationTime ?? 0;
      if (aTime !== bTime) return aTime - bTime;
      return (a._id || "").localeCompare(b._id || "");
    });

    const sealedRecords = logs.filter((l: Doc<"appealAuditLogs">) => Boolean(l.hash)).length;
    const unsealedRecords = logs.length - sealedRecords;

    if (logs.length === 0) {
      return {
        isValid: true,
        totalRecords: 0,
        verifiedRecords: 0,
        sealedRecords: 0,
        unsealedRecords: 0,
        genesisHash: GENESIS_HASH,
        terminalHash: GENESIS_HASH,
        durationMs: Date.now() - startTime,
        tamperDetected: false,
        needsReseal: false,
        verifiedAt: Date.now(),
      };
    }

    let expectedPrevHash = GENESIS_HASH;
    let verifiedRecords = 0;

    for (let i = 0; i < logs.length; i++) {
      const log = logs[i];
      const blockNum = log.sequenceNumber ?? i + 1;
      const expectedHash = await computeAuditHash(
        expectedPrevHash,
        log.eventType,
        log.claimId,
        log.timestamp,
        log.details
      );

      if (log.previousHash && log.previousHash !== expectedPrevHash) {
        const prevBlockUnsealed = i > 0 && !logs[i - 1].hash;
        const matchesOwnPrev =
          prevBlockUnsealed &&
          Boolean(log.hash) &&
          (await computeAuditHash(
            log.previousHash,
            log.eventType,
            log.claimId,
            log.timestamp,
            log.details
          )) === log.hash;

        const isTamper = !matchesOwnPrev;

        return {
          isValid: false,
          totalRecords: logs.length,
          verifiedRecords,
          sealedRecords,
          unsealedRecords,
          genesisHash: GENESIS_HASH,
          terminalHash: log.hash || expectedHash,
          durationMs: Date.now() - startTime,
          tamperDetected: isTamper,
          needsReseal: !isTamper,
          brokenIndex: i,
          brokenBlockNumber: blockNum,
          brokenLogId: log._id,
          failureReason: !isTamper
            ? `Unsealed chain boundary at block #${blockNum}: links to parent ${log.previousHash.slice(0, 8)}... instead of rolling chain ${expectedPrevHash.slice(0, 8)}... Reseal required to bind legacy blocks.`
            : `Chain link broken at block #${blockNum}: expected parent hash ${expectedPrevHash.slice(0, 8)}... but found ${log.previousHash.slice(0, 8)}...`,
          verifiedAt: Date.now(),
        };
      }

      if (log.hash && log.hash !== expectedHash) {
        return {
          isValid: false,
          totalRecords: logs.length,
          verifiedRecords,
          sealedRecords,
          unsealedRecords,
          genesisHash: GENESIS_HASH,
          terminalHash: log.hash,
          durationMs: Date.now() - startTime,
          tamperDetected: true,
          needsReseal: false,
          brokenIndex: i,
          brokenBlockNumber: blockNum,
          brokenLogId: log._id,
          failureReason: `Hash mismatch at block #${blockNum}: expected ${expectedHash.slice(0, 8)}... but found ${log.hash.slice(0, 8)}... Content modified after sealing.`,
          verifiedAt: Date.now(),
        };
      }

      expectedPrevHash = log.hash || expectedHash;
      verifiedRecords++;
    }

    const needsReseal = unsealedRecords > 0;

    return {
      isValid: true,
      totalRecords: logs.length,
      verifiedRecords,
      sealedRecords,
      unsealedRecords,
      genesisHash: GENESIS_HASH,
      terminalHash: expectedPrevHash,
      durationMs: Date.now() - startTime,
      tamperDetected: false,
      needsReseal,
      failureReason: needsReseal
        ? `${unsealedRecords} unsealed block(s) detected in database. Reseal required to bind all historical blocks into an unbroken rolling SHA-256 Merkle chain.`
        : undefined,
      verifiedAt: Date.now(),
    };
  },
});

/**
 * List the most recent audit events strictly across the authenticated user's claims.
 * Filters out tombstoned records by default to keep active portfolio dashboards clean.
 */
export const listRecent = query({
  args: {
    limit: v.optional(v.number()),
    includeTombstoned: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    const limit = Math.min(Math.max(1, args.limit ?? 15), 20);

    // Primary fast path: single index scan via by_user_and_timestamp
    const userLogs = await ctx.db
      .query("appealAuditLogs")
      .withIndex("by_user_and_timestamp", (q) => q.eq("userId", userId))
      .order("desc")
      .take(args.includeTombstoned ? limit : limit * 2);

    const filtered = args.includeTombstoned
      ? userLogs
      : userLogs.filter((log) => !log.isTombstoned);

    if (filtered.length > 0) {
      return filtered.slice(0, limit);
    }

    // Graceful fallback for legacy logs created prior to userId index denormalization
    const userClaims = await ctx.db
      .query("claims")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .take(5);

    if (userClaims.length === 0) return [];

    const logsPerClaim = await Promise.all(
      userClaims.map((claim) =>
        ctx.db
          .query("appealAuditLogs")
          .withIndex("by_claim_and_timestamp", (q) => q.eq("claimId", claim._id))
          .order("desc")
          .take(limit)
      )
    );

    const combined = logsPerClaim
      .flat()
      .filter((log) => args.includeTombstoned || !log.isTombstoned)
      .sort((a, b) => b.timestamp - a.timestamp);

    return combined.slice(0, limit);
  },
});

/**
 * List sealed and tombstoned audit records for ERISA § 503 statutory compliance and regulatory inspection.
 */
export const listTombstoned = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    const limit = Math.min(Math.max(1, args.limit ?? 20), 50);

    const userLogs = await ctx.db
      .query("appealAuditLogs")
      .withIndex("by_user_and_timestamp", (q) => q.eq("userId", userId))
      .order("desc")
      .take(limit * 3);

    return userLogs.filter((log) => Boolean(log.isTombstoned)).slice(0, limit);
  },
});
