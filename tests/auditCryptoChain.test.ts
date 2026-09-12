import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  computeAuditHash,
  computeSha256,
  verifyAuditChainClient,
  truncateHash,
  formatDurationMs,
  GENESIS_HASH,
} from "../src/lib/auditCrypto";
import { AuditLog } from "../src/types";
import * as auditLogsModule from "../convex/auditLogs";
import { getAuthUserId } from "@convex-dev/auth/server";

vi.mock("@convex-dev/auth/server", () => ({
  getAuthUserId: vi.fn().mockResolvedValue("user_owner"),
}));

describe("Tamper-Evident Cryptographic Merkle/Audit Chain (ERISA 29 CFR § 2560.503-1)", () => {
  const claimId = "claim_erisa_9001";

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getAuthUserId).mockResolvedValue("user_owner" as any);
  });

  describe("NIST FIPS 180-4 Standard SHA-256 & Deterministic Hashing", () => {
    it("computes exact known SHA-256 test vectors", async () => {
      // Known NIST SHA-256 test vectors
      const emptyHash = await computeSha256("");
      expect(emptyHash).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");

      const abcHash = await computeSha256("abc");
      expect(abcHash).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");

      const testPayload = "ClaimHero ERISA 29 CFR § 2560.503-1 Tamper-Evident Merkle Sentinel";
      const hash1 = await computeSha256(testPayload);
      const hash2 = await computeSha256(testPayload);
      expect(hash1).toBe(hash2);
      expect(hash1.length).toBe(64);
    });

    it("computes deterministic rolling audit hashes from previousHash + eventType + claimId + timestamp + details", async () => {
      const timestamp = 1726140000000;
      const details = "Ingested denial letter from Cigna Healthcare for CPT 29881 ($6,400.00)";
      const eventType = "denial_ingested";

      const currentHash = await computeAuditHash(
        GENESIS_HASH,
        eventType,
        claimId,
        timestamp,
        details
      );

      expect(currentHash).toHaveLength(64);
      expect(currentHash).toMatch(/^[0-9a-f]{64}$/);

      // Same inputs produce identical hash
      const duplicateHash = await computeAuditHash(
        GENESIS_HASH,
        eventType,
        claimId,
        timestamp,
        details
      );
      expect(duplicateHash).toBe(currentHash);
    });

    it("ensures different fields produce completely distinct rolling hashes", async () => {
      const timestamp = 1726140000000;
      const baseHash = await computeAuditHash(
        GENESIS_HASH,
        "denial_ingested",
        claimId,
        timestamp,
        "Original details"
      );

      // Modified details
      const alteredDetailsHash = await computeAuditHash(
        GENESIS_HASH,
        "denial_ingested",
        claimId,
        timestamp,
        "Altered details"
      );
      expect(alteredDetailsHash).not.toBe(baseHash);

      // Modified timestamp (backdating attempt)
      const alteredTimestampHash = await computeAuditHash(
        GENESIS_HASH,
        "denial_ingested",
        claimId,
        timestamp - 86400000,
        "Original details"
      );
      expect(alteredTimestampHash).not.toBe(baseHash);

      // Modified eventType
      const alteredEventHash = await computeAuditHash(
        GENESIS_HASH,
        "appeal_draft_updated",
        claimId,
        timestamp,
        "Original details"
      );
      expect(alteredEventHash).not.toBe(baseHash);

      // Modified claimId
      const alteredClaimHash = await computeAuditHash(
        GENESIS_HASH,
        "denial_ingested",
        "claim_other",
        timestamp,
        "Original details"
      );
      expect(alteredClaimHash).not.toBe(baseHash);
    });
  });

  describe("Multi-Block Rolling Hash Chain Construction & Verification", () => {
    async function createMockChain(): Promise<AuditLog[]> {
      const logs: AuditLog[] = [];
      const events = [
        { type: "denial_ingested", details: "Ingested EOB for CPT 29881 ($6,400.00)", time: 1726140000000 },
        { type: "policy_crawled", details: "Crawled Cigna CPB 0512 criteria", time: 1726140060000 },
        { type: "overturn_score_computed", details: "Computed Overturn Probability: 84%", time: 1726140120000 },
        { type: "brief_synthesized", details: "Synthesized ERISA § 503 legal brief", time: 1726140180000 },
        { type: "appeal_dispatched", details: "Dispatched appellate dossier to payer gateway", time: 1726140240000 },
      ];

      let prevHash = GENESIS_HASH;
      for (let i = 0; i < events.length; i++) {
        const ev = events[i];
        const hash = await computeAuditHash(prevHash, ev.type, claimId, ev.time, ev.details);
        logs.push({
          _id: `log_${i + 1}`,
          claimId,
          eventType: ev.type,
          actor: "ClaimHero Sentinel",
          details: ev.details,
          timestamp: ev.time,
          previousHash: prevHash,
          hash,
          sequenceNumber: i + 1,
        });
        prevHash = hash;
      }
      return logs;
    }

    it("verifies an authentic, untampered 5-block cryptographic audit chain", async () => {
      const chain = await createMockChain();
      expect(chain).toHaveLength(5);

      const result = await verifyAuditChainClient(claimId, chain);
      expect(result.isValid).toBe(true);
      expect(result.tamperDetected).toBe(false);
      expect(result.totalRecords).toBe(5);
      expect(result.verifiedRecords).toBe(5);
      expect(result.genesisHash).toBe(GENESIS_HASH);
      expect(result.terminalHash).toBe(chain[4].hash);
      expect(result.durationMs).toBeLessThan(10); // Under 10ms SLA requirement
    });

    it("detects fraudulent detail alteration (tampering detected)", async () => {
      const chain = await createMockChain();
      // Tamper with record #3 details
      chain[2].details = "Tampered detail: changed win rate";

      const result = await verifyAuditChainClient(claimId, chain);
      expect(result.isValid).toBe(false);
      expect(result.tamperDetected).toBe(true);
      expect(result.brokenIndex).toBe(2);
      expect(result.failureReason).toContain("Hash mismatch at block #3");
    });

    it("detects backdating tampering (timestamp alteration)", async () => {
      const chain = await createMockChain();
      // Backdate record #2 by 1 day
      chain[1].timestamp = chain[1].timestamp - 86400000;

      const result = await verifyAuditChainClient(claimId, chain);
      expect(result.isValid).toBe(false);
      expect(result.tamperDetected).toBe(true);
    });

    it("detects broken chain linkage if a record is deleted or replaced", async () => {
      const chain = await createMockChain();
      // Remove record #3, leaving record #4 with invalid previousHash
      const brokenChain = [chain[0], chain[1], chain[3], chain[4]];

      const result = await verifyAuditChainClient(claimId, brokenChain);
      expect(result.isValid).toBe(false);
      expect(result.tamperDetected).toBe(true);
      expect(result.failureReason).toContain("Chain link broken");
    });

    it("handles empty logs array cleanly", async () => {
      const result = await verifyAuditChainClient(claimId, []);
      expect(result.isValid).toBe(true);
      expect(result.totalRecords).toBe(0);
      expect(result.verifiedRecords).toBe(0);
      expect(result.genesisHash).toBe(GENESIS_HASH);
      expect(result.durationMs).toBeLessThan(10);
    });
  });

  describe("Execution Performance Benchmark (< 10ms SLA)", () => {
    it("computes and verifies 50 sequential blocks in under 10ms", async () => {
      const logs: AuditLog[] = [];
      let prevHash = GENESIS_HASH;
      const baseTime = 1726140000000;

      for (let i = 1; i <= 50; i++) {
        const time = baseTime + i * 1000;
        const details = `Automated telemetry event #${i} for claim ${claimId}`;
        const hash = await computeAuditHash(prevHash, "telemetry_logged", claimId, time, details);
        logs.push({
          _id: `bench_log_${i}`,
          claimId,
          eventType: "telemetry_logged",
          actor: "Benchmark Worker",
          details,
          timestamp: time,
          previousHash: prevHash,
          hash,
          sequenceNumber: i,
        });
        prevHash = hash;
      }

      const result = await verifyAuditChainClient(claimId, logs);
      expect(result.isValid).toBe(true);
      expect(result.totalRecords).toBe(50);
      expect(result.verifiedRecords).toBe(50);
      // Hard requirement: must verify in under 10ms
      expect(result.durationMs).toBeLessThan(10);
    });
  });

  describe("Formatting & Display Helpers", () => {
    it("truncates hashes cleanly for UI badges", () => {
      const fullHash = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
      const truncated = truncateHash(fullHash, 6, 6);
      expect(truncated).toBe("ba7816...0015ad");

      expect(truncateHash(null)).toBe("Unsealed");
      expect(truncateHash("short")).toBe("short");
    });

    it("formats duration with sub-millisecond precision", () => {
      expect(formatDurationMs(0.005)).toBe("< 0.01 ms");
      expect(formatDurationMs(0.421)).toBe("0.42 ms");
      expect(formatDurationMs(4.18)).toBe("4.2 ms");
    });
  });

  describe("Convex auditLogs Backend Mutations & Query", () => {
    it("logEvent: computes and stores rolling hash, previousHash, and sequenceNumber", async () => {
      const mockClaim = { _id: "claim_100", userId: "user_owner" };
      const mockCtx: any = {
        db: {
          get: vi.fn().mockResolvedValue(mockClaim),
          query: vi.fn().mockReturnValue({
            withIndex: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                first: vi.fn().mockResolvedValue(null), // first record
              }),
            }),
          }),
          insert: vi.fn().mockResolvedValue("log_genesis"),
          patch: vi.fn().mockResolvedValue(undefined),
        },
      };

      const logId = await (auditLogsModule.logEvent as any)._handler(mockCtx, {
        claimId: "claim_100",
        eventType: "denial_ingested",
        actor: "Optical OCR Intake",
        details: "Ingested denial letter",
      });

      expect(logId).toBe("log_genesis");
      expect(mockCtx.db.insert).toHaveBeenCalledWith(
        "appealAuditLogs",
        expect.objectContaining({
          claimId: "claim_100",
          eventType: "denial_ingested",
          previousHash: GENESIS_HASH,
          sequenceNumber: 1,
          hash: expect.stringMatching(/^[0-9a-f]{64}$/),
        })
      );
    });

    it("logEventInternal: links to previous record hash in transaction", async () => {
      const priorLog = {
        _id: "log_prev",
        claimId: "claim_100",
        hash: "1111111111111111111111111111111111111111111111111111111111111111",
        sequenceNumber: 1,
        timestamp: 1726140000000,
        eventType: "denial_ingested",
        details: "Prior record",
      };

      const mockCtx: any = {
        db: {
          get: vi.fn().mockResolvedValue({ _id: "claim_100", userId: "user_1" }),
          query: vi.fn().mockReturnValue({
            withIndex: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                first: vi.fn().mockResolvedValue(priorLog),
              }),
            }),
          }),
          insert: vi.fn().mockResolvedValue("log_next"),
        },
      };

      const logId = await (auditLogsModule.logEventInternal as any)._handler(mockCtx, {
        claimId: "claim_100",
        eventType: "policy_crawled",
        actor: "Firecrawl Crawler",
        details: "Crawled medical necessity criteria",
      });

      expect(logId).toBe("log_next");
      expect(mockCtx.db.insert).toHaveBeenCalledWith(
        "appealAuditLogs",
        expect.objectContaining({
          claimId: "claim_100",
          eventType: "policy_crawled",
          previousHash: priorLog.hash,
          sequenceNumber: 2,
          hash: expect.stringMatching(/^[0-9a-f]{64}$/),
        })
      );
    });

    it("verifyAuditChain query: verifies unbroken chain across claim logs", async () => {
      const timestamp = 1726140000000;
      const expectedHash = await computeAuditHash(
        GENESIS_HASH,
        "denial_ingested",
        "claim_100",
        timestamp,
        "Initial intake"
      );

      const logs = [
        {
          _id: "log_1",
          claimId: "claim_100",
          eventType: "denial_ingested",
          timestamp,
          details: "Initial intake",
          previousHash: GENESIS_HASH,
          hash: expectedHash,
          sequenceNumber: 1,
        },
      ];

      const mockCtx: any = {
        db: {
          get: vi.fn().mockResolvedValue({ _id: "claim_100", userId: "user_owner" }),
          query: vi.fn().mockReturnValue({
            withIndex: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                take: vi.fn().mockResolvedValue(logs),
              }),
            }),
          }),
        },
      };

      // Mock authorized user
      const res = await (auditLogsModule.verifyAuditChain as any)._handler(mockCtx, {
        claimId: "claim_100",
      });

      expect(res.isValid).toBe(true);
      expect(res.tamperDetected).toBe(false);
      expect(res.totalRecords).toBe(1);
      expect(res.terminalHash).toBe(expectedHash);
    });

    it("detects unsealed legacy boundaries without raising false tamper detection", async () => {
      const claimId = "claim_boundary";
      const t1 = 1726140000000;
      const t2 = 1726140005000;
      const t3 = 1726140010000;

      // Log 1: unsealed legacy log
      const log1: any = {
        _id: "log_1",
        claimId,
        eventType: "denial_ingested",
        timestamp: t1,
        details: "Extracted denial document",
      };

      // Log 2: unsealed legacy log
      const log2: any = {
        _id: "log_2",
        claimId,
        eventType: "appeal_context_completed",
        timestamp: t2,
        details: "Confirmed sender identity",
      };

      // Log 3: created at unsealed boundary (hashed from log2, but log1 and log2 lacked hashes)
      const prevHashLog2 = await computeAuditHash(
        GENESIS_HASH,
        log2.eventType,
        claimId,
        log2.timestamp,
        log2.details
      );
      const hashLog3 = await computeAuditHash(
        prevHashLog2,
        "policy_crawled",
        claimId,
        t3,
        "Resolved appeals gateway"
      );

      const log3: any = {
        _id: "log_3",
        claimId,
        eventType: "policy_crawled",
        timestamp: t3,
        details: "Resolved appeals gateway",
        previousHash: prevHashLog2,
        hash: hashLog3,
        sequenceNumber: 1,
      };

      const result = await verifyAuditChainClient(claimId, [log1, log2, log3]);

      expect(result.isValid).toBe(false);
      // Key invariant: this is an unsealed boundary, NOT fraudulent tampering!
      expect(result.tamperDetected).toBe(false);
      expect(result.needsReseal).toBe(true);
      expect(result.failureReason).toContain("Unsealed chain boundary");
    });

    it("sealAuditChainForClaimHelper: seals legacy unsealed logs into a contiguous unbroken chain", async () => {
      const claimId = "claim_seal_test";
      const patchedDocs: Record<string, any> = {};

      const mockDbLogs = [
        {
          _id: "log_a",
          claimId,
          eventType: "denial_ingested",
          timestamp: 1000,
          details: "Denial ingested",
        },
        {
          _id: "log_b",
          claimId,
          eventType: "policy_crawled",
          timestamp: 2000,
          details: "Policy crawled",
        },
      ];

      const mockCtx: any = {
        db: {
          query: vi.fn().mockReturnValue({
            withIndex: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                take: vi.fn().mockResolvedValue(mockDbLogs),
              }),
            }),
          }),
          patch: vi.fn().mockImplementation((id, patch) => {
            patchedDocs[id] = patch;
          }),
        },
      };

      const sealRes = await (auditLogsModule as any).sealAuditChainForClaimHelper(mockCtx, claimId);
      expect(sealRes.totalSealed).toBe(2);
      expect(patchedDocs["log_a"].sequenceNumber).toBe(1);
      expect(patchedDocs["log_a"].previousHash).toBe(GENESIS_HASH);
      expect(patchedDocs["log_b"].sequenceNumber).toBe(2);
      expect(patchedDocs["log_b"].previousHash).toBe(patchedDocs["log_a"].hash);
      expect(sealRes.terminalHash).toBe(patchedDocs["log_b"].hash);
    });

    it("deterministically orders logs that share the exact same millisecond timestamp", async () => {
      const claimId = "claim_same_ms";
      const sameTimestamp = 1726140000000;

      const logA: any = {
        _id: "log_aaa",
        _creationTime: 100,
        claimId,
        eventType: "denial_ingested",
        timestamp: sameTimestamp,
        sequenceNumber: 1,
        details: "Event A",
      };

      const logB: any = {
        _id: "log_bbb",
        _creationTime: 200,
        claimId,
        eventType: "policy_crawled",
        timestamp: sameTimestamp,
        sequenceNumber: 2,
        details: "Event B",
      };

      const hashA = await computeAuditHash(GENESIS_HASH, logA.eventType, claimId, sameTimestamp, logA.details);
      logA.hash = hashA;
      logA.previousHash = GENESIS_HASH;

      const hashB = await computeAuditHash(hashA, logB.eventType, claimId, sameTimestamp, logB.details);
      logB.hash = hashB;
      logB.previousHash = hashA;

      // Pass in reverse order to verify stable tiebreaking
      const result = await verifyAuditChainClient(claimId, [logB, logA]);
      expect(result.isValid).toBe(true);
      expect(result.tamperDetected).toBe(false);
      expect(result.terminalHash).toBe(hashB);
      expect(result.sealedRecords).toBe(2);
      expect(result.unsealedRecords).toBe(0);
    });

    it("accurately reports sealedRecords, unsealedRecords, and needsReseal when unsealed blocks exist in database", async () => {
      const claimId = "claim_mixed_seal";
      const t1 = 1726140000000;
      const t2 = 1726140060000;

      const hash1 = await computeAuditHash(GENESIS_HASH, "denial_ingested", claimId, t1, "Ingested denial");

      const mixedLogs: AuditLog[] = [
        {
          _id: "log_1",
          claimId,
          eventType: "denial_ingested",
          timestamp: t1,
          details: "Ingested denial",
          previousHash: GENESIS_HASH,
          hash: hash1,
          sequenceNumber: 1,
        },
        {
          _id: "log_2",
          claimId,
          eventType: "policy_crawled",
          timestamp: t2,
          details: "Unsealed crawler record",
        },
      ];

      const result = await verifyAuditChainClient(claimId, mixedLogs);
      expect(result.totalRecords).toBe(2);
      expect(result.sealedRecords).toBe(1);
      expect(result.unsealedRecords).toBe(1);
      expect(result.needsReseal).toBe(true);
      expect(result.isValid).toBe(true);
      expect(result.tamperDetected).toBe(false);
      expect(result.failureReason).toContain("1 unsealed block(s) detected in database");
    });

    it("appendAuditLog: calculates deterministic rolling hash and sets block sequence", async () => {
      const claimId = "claim_append_test";
      const mockCtx: any = {
        db: {
          get: vi.fn().mockResolvedValue({ _id: claimId, userId: "user_owner" }),
          query: vi.fn().mockReturnValue({
            withIndex: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                first: vi.fn().mockResolvedValue(null),
              }),
            }),
          }),
          insert: vi.fn().mockResolvedValue("log_appended_1"),
          patch: vi.fn().mockResolvedValue(undefined),
        },
      };

      const logId = await auditLogsModule.appendAuditLog(mockCtx, {
        claimId: claimId as any,
        eventType: "denial_ingested",
        actor: "Optical OCR Parser",
        details: "Ingested document",
      });

      expect(logId).toBe("log_appended_1");
      expect(mockCtx.db.insert).toHaveBeenCalledWith(
        "appealAuditLogs",
        expect.objectContaining({
          claimId,
          sequenceNumber: 1,
          previousHash: GENESIS_HASH,
          hash: expect.stringMatching(/^[0-9a-f]{64}$/),
        })
      );
    });
  });
});
