import { AuditLog, AuditChainVerificationResult } from "../types";

/**
 * Standard 64-hex-zero Genesis Hash for the root of any case audit chain.
 */
export const GENESIS_HASH = "0".repeat(64);

const textEncoder = typeof TextEncoder !== "undefined" ? new TextEncoder() : null;

const HEX_TABLE: string[] = [];
for (let i = 0; i < 256; i++) {
  HEX_TABLE[i] = i.toString(16).padStart(2, "0");
}

function bufferToHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += HEX_TABLE[bytes[i]];
  }
  return hex;
}

let cachedNodeCrypto: {
  createHash: (algo: string) => {
    update: (data: string, enc?: string) => {
      digest: (enc: string) => string;
    };
  };
} | null = null;

/**
 * Computes deterministic SHA-256 hash using native browser WebCrypto (crypto.subtle).
 * Falls back to Node crypto if run in test environments.
 */
export async function computeSha256(content: string): Promise<string> {
  // Fast path for Node.js / test environments to avoid libuv threadpool queue latency under test load
  if (typeof process !== "undefined" && process.versions?.node) {
    if (!cachedNodeCrypto) {
      try {
        const moduleName = "node:crypto";
        const imported = await import(/* @vite-ignore */ moduleName);
        cachedNodeCrypto = imported.default || imported;
      } catch {
        // Fall back to WebCrypto
      }
    }
    if (cachedNodeCrypto) {
      return cachedNodeCrypto.createHash("sha256").update(content, "utf8").digest("hex");
    }
  }

  if (typeof crypto !== "undefined" && crypto?.subtle?.digest) {
    const encoder = textEncoder || new TextEncoder();
    const data = encoder.encode(content);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    return bufferToHex(hashBuffer);
  }

  try {
    const moduleName = "node:crypto";
    const nodeCrypto = await import(/* @vite-ignore */ moduleName);
    return nodeCrypto.createHash("sha256").update(content, "utf8").digest("hex");
  } catch {
    throw new Error("SHA-256 cryptographic engine not available in this runtime");
  }
}

/**
 * Computes deterministic rolling SHA-256 hash under ERISA 29 CFR § 2560.503-1:
 * currentHash = sha256(previousHash + eventType + claimId + timestamp + details).
 */
export async function computeAuditHash(
  previousHash: string,
  eventType: string,
  claimId: string,
  timestamp: number,
  details: string
): Promise<string> {
  const payload = `${previousHash}${eventType}${claimId}${timestamp}${details}`;
  return await computeSha256(payload);
}

/**
 * Truncate a 64-char hex hash for compact, clean UI display (e.g. 4a8f12...9b2c34).
 */
export function truncateHash(hash?: string | null, left = 6, right = 6): string {
  if (!hash) return "Unsealed";
  if (hash.length <= left + right) return hash;
  return `${hash.slice(0, left)}...${hash.slice(-right)}`;
}

/**
 * Formats duration in milliseconds with microsecond precision.
 */
export function formatDurationMs(durationMs: number): string {
  if (durationMs < 0.01) return "< 0.01 ms";
  if (durationMs < 1) return `${durationMs.toFixed(2)} ms`;
  return `${durationMs.toFixed(1)} ms`;
}

/**
 * Verifies the complete chronological cryptographic Merkle/audit chain for a case.
 * Benchmarks execution time using performance.now() to prove sub-10ms performance.
 */
export async function verifyAuditChainClient(
  claimId: string,
  logs: AuditLog[]
): Promise<AuditChainVerificationResult> {
  const startTime = typeof performance !== "undefined" ? performance.now() : Date.now();

  const sealedRecords = (logs || []).filter((l) => Boolean(l.hash)).length;
  const unsealedRecords = (logs || []).length - sealedRecords;

  if (!logs || logs.length === 0) {
    const durationMs =
      (typeof performance !== "undefined" ? performance.now() : Date.now()) - startTime;
    return {
      isValid: true,
      totalRecords: 0,
      verifiedRecords: 0,
      sealedRecords: 0,
      unsealedRecords: 0,
      genesisHash: GENESIS_HASH,
      terminalHash: GENESIS_HASH,
      durationMs: Number(durationMs.toFixed(3)),
      tamperDetected: false,
      needsReseal: false,
      verifiedAt: Date.now(),
    };
  }

  // Ensure logs are in chronological order (oldest first)
  // Stable multi-tier sort: timestamp ASC, sequenceNumber ASC, _creationTime ASC, _id ASC
  const chronologicalLogs = [...logs].sort((a, b) => {
    if (a.timestamp !== b.timestamp) return a.timestamp - b.timestamp;
    if (a.sequenceNumber != null && b.sequenceNumber != null && a.sequenceNumber !== b.sequenceNumber) {
      return a.sequenceNumber - b.sequenceNumber;
    }
    const aTime = (a as { _creationTime?: number })._creationTime ?? 0;
    const bTime = (b as { _creationTime?: number })._creationTime ?? 0;
    if (aTime !== bTime) return aTime - bTime;
    return (a._id || "").localeCompare(b._id || "");
  });

  let expectedPrevHash = GENESIS_HASH;
  let verifiedCount = 0;

  for (let i = 0; i < chronologicalLogs.length; i++) {
    const log = chronologicalLogs[i];
    const logClaimId = log.claimId || claimId;
    const blockNum = log.sequenceNumber ?? i + 1;

    const expectedHash = await computeAuditHash(
      expectedPrevHash,
      log.eventType,
      logClaimId,
      log.timestamp,
      log.details
    );

    // 1. Verify linkage to parent block
    if (log.previousHash && log.previousHash !== expectedPrevHash) {
      const durationMs =
        (typeof performance !== "undefined" ? performance.now() : Date.now()) - startTime;

      // Unsealed legacy boundary: only when the preceding block had no stored hash in database
      const prevBlockUnsealed = i > 0 && !chronologicalLogs[i - 1].hash;
      const matchesOwnPrev =
        prevBlockUnsealed &&
        Boolean(log.hash) &&
        (await computeAuditHash(
          log.previousHash,
          log.eventType,
          logClaimId,
          log.timestamp,
          log.details
        )) === log.hash;

      const isTamper = !matchesOwnPrev;

      return {
        isValid: false,
        totalRecords: chronologicalLogs.length,
        verifiedRecords: verifiedCount,
        sealedRecords,
        unsealedRecords,
        genesisHash: GENESIS_HASH,
        terminalHash: log.hash || expectedHash,
        durationMs: Number(durationMs.toFixed(3)),
        tamperDetected: isTamper,
        needsReseal: !isTamper,
        brokenIndex: i,
        brokenBlockNumber: blockNum,
        brokenLogId: log._id,
        failureReason: !isTamper
          ? `Unsealed chain boundary at block #${blockNum}: links to parent ${truncateHash(log.previousHash, 4, 4)} instead of rolling chain ${truncateHash(expectedPrevHash, 4, 4)}. Reseal required to bind legacy blocks.`
          : `Chain link broken at block #${blockNum}: expected parent hash ${truncateHash(expectedPrevHash, 4, 4)} but found ${truncateHash(log.previousHash, 4, 4)}.`,
        verifiedAt: Date.now(),
      };
    }

    // 2. If record has a stored hash, verify exact content hash match
    if (log.hash && log.hash !== expectedHash) {
      const durationMs =
        (typeof performance !== "undefined" ? performance.now() : Date.now()) - startTime;
      return {
        isValid: false,
        totalRecords: chronologicalLogs.length,
        verifiedRecords: verifiedCount,
        sealedRecords,
        unsealedRecords,
        genesisHash: GENESIS_HASH,
        terminalHash: log.hash,
        durationMs: Number(durationMs.toFixed(3)),
        tamperDetected: true,
        needsReseal: false,
        brokenIndex: i,
        brokenBlockNumber: blockNum,
        brokenLogId: log._id,
        failureReason: `Hash mismatch at block #${blockNum}: expected ${truncateHash(expectedHash, 4, 4)} but found ${truncateHash(log.hash, 4, 4)}. Content modified after sealing.`,
        verifiedAt: Date.now(),
      };
    }

    expectedPrevHash = log.hash || expectedHash;
    verifiedCount++;
  }

  const durationMs =
    (typeof performance !== "undefined" ? performance.now() : Date.now()) - startTime;

  const needsReseal = unsealedRecords > 0;

  return {
    isValid: true,
    totalRecords: chronologicalLogs.length,
    verifiedRecords: verifiedCount,
    sealedRecords,
    unsealedRecords,
    genesisHash: GENESIS_HASH,
    terminalHash: expectedPrevHash,
    durationMs: Number(durationMs.toFixed(3)),
    tamperDetected: false,
    needsReseal,
    failureReason: needsReseal
      ? `${unsealedRecords} unsealed block(s) detected in database. Reseal required to bind all historical blocks into an unbroken rolling SHA-256 Merkle chain.`
      : undefined,
    verifiedAt: Date.now(),
  };
}
