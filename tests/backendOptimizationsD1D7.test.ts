import { describe, it, expect, vi } from "vitest";
import * as schemaModule from "../convex/schema";
import * as precedentsModule from "../convex/precedents";
import * as chatbotModule from "../convex/chatbot";
import * as auditLogsModule from "../convex/auditLogs";
import * as clinicalEvidencesModule from "../convex/clinicalEvidences";

describe("Backend Architectural Optimizations D-1 through D-7", () => {
  describe("D-1: Bounded Indexed Reads & Pagination Cursors", () => {
    it("schema defines by_user_updated on claims and by_claim_time on clinicalEvidences and emailMessages", () => {
      const tables = (schemaModule.default as any).tables;
      expect(tables.claims).toBeDefined();
      expect(tables.clinicalEvidences).toBeDefined();
      expect(tables.emailMessages).toBeDefined();

      const claimsIndexes = tables.claims.indexes.map((idx: any) => idx.indexDescriptor);
      expect(claimsIndexes).toContain("by_user_updated");

      const evidenceIndexes = tables.clinicalEvidences.indexes.map((idx: any) => idx.indexDescriptor);
      expect(evidenceIndexes).toContain("by_claim_time");
      expect(evidenceIndexes).toContain("by_claim_relevance");

      const emailIndexes = tables.emailMessages.indexes.map((idx: any) => idx.indexDescriptor);
      expect(emailIndexes).toContain("by_claim_time");
    });
  });

  describe("D-2: Strip Embedding Vectors & Retention Policy", () => {
    it("strips 12KB embedding vectors from action payloads and sets embedding_redacted: true", async () => {
      const mockDoc = {
        _id: "prec_1",
        title: "ERISA Precedent",
        embedding: new Array(1536).fill(0.05),
        retentionPolicy: "active_statutory",
      };

      const mockCtx: any = {
        db: {
          get: vi.fn().mockResolvedValue(mockDoc),
        },
      };

      const hydrated = await (precedentsModule.hydrateByIds as any)._handler(mockCtx, {
        ids: ["prec_1"],
      });

      expect(hydrated).toHaveLength(1);
      expect(hydrated[0]._id).toBe("prec_1");
      expect(hydrated[0].embedding_redacted).toBe(true);
      expect((hydrated[0] as any).embedding).toBeUndefined();
    });

    it("precedents schema supports retentionPolicy and retentionExpiresAt", () => {
      const tables = (schemaModule.default as any).tables;
      const precedentFields = tables.precedents.validator.fields;
      expect(precedentFields.embedding_redacted).toBeDefined();
      expect(precedentFields.retentionPolicy).toBeDefined();
      expect(precedentFields.retentionExpiresAt).toBeDefined();
    });
  });

  describe("D-4: Chatbot Session Summarization & Trimming", () => {
    it("summarizeAndTrimSessionInternal trims older messages and updates session summary", async () => {
      const mockSession = {
        _id: "sess_1",
        claimId: "claim_1",
        messageCount: 20,
        summary: undefined,
      };

      const messages = Array.from({ length: 15 }, (_, i) => ({
        _id: `msg_${i + 1}`,
        sessionId: "sess_1",
        createdAt: 1000 + i * 10,
      }));

      const deletedIds: string[] = [];
      const mockCtx: any = {
        db: {
          get: vi.fn().mockResolvedValue(mockSession),
          query: vi.fn().mockReturnValue({
            withIndex: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                take: vi.fn().mockResolvedValue(messages),
                collect: vi.fn().mockResolvedValue(messages),
              }),
            }),
          }),
          delete: vi.fn().mockImplementation((id: string) => {
            deletedIds.push(id);
            return Promise.resolve();
          }),
          patch: vi.fn().mockResolvedValue(undefined),
        },
      };

      const res = await (chatbotModule.summarizeAndTrimSessionInternal as any)._handler(mockCtx, {
        sessionId: "sess_1",
        summary: "Claimant is appealing denial of Knee MRI based on conservative therapy failure.",
        keepRecentCount: 5,
      });

      expect(res.trimmedCount).toBe(10);
      expect(res.remainingCount).toBe(5);
      expect(deletedIds).toHaveLength(10);
      expect(deletedIds[0]).toBe("msg_1");
      expect(deletedIds[9]).toBe("msg_10");

      expect(mockCtx.db.patch).toHaveBeenCalledWith("sess_1", {
        summary: "Claimant is appealing denial of Knee MRI based on conservative therapy failure.",
        messageCount: 5,
        updatedAt: expect.any(Number),
      });
    });
  });

  describe("D-5: Audit Log & Alarm Idempotency Key Deduplication", () => {
    it("computes standard idempotency keys in claimId:eventType:day format", () => {
      const timestamp = 1789051083634;
      const key = auditLogsModule.computeAuditIdempotencyKey("claim_xyz", "statutory_alarm_critical", timestamp);
      expect(key).toBe("claim_xyz:statutory_alarm_critical:2026-09-10");
    });

    it("deduplicates audit log insertion when existing log with idempotencyKey exists", async () => {
      const existingLog = {
        _id: "log_existing_123",
        idempotencyKey: "claim_xyz:statutory_alarm_critical:2026-09-10",
      };

      const mockCtx: any = {
        db: {
          query: vi.fn().mockReturnValue({
            withIndex: vi.fn().mockReturnValue({
              first: vi.fn().mockResolvedValue(existingLog),
            }),
          }),
          insert: vi.fn(),
        },
      };

      const logId = await (auditLogsModule.logEventInternal as any)._handler(mockCtx, {
        claimId: "claim_xyz",
        eventType: "statutory_alarm_critical",
        actor: "Statutory Sentinel",
        details: "Critical deadline approaching",
        idempotencyKey: "claim_xyz:statutory_alarm_critical:2026-09-10",
      });

      expect(logId).toBe("log_existing_123");
      expect(mockCtx.db.insert).not.toHaveBeenCalled();
    });
  });

  describe("D-6: Policy Snapshots Cache by URL Hash", () => {
    it("schema defines policySnapshots table with by_url_hash index", () => {
      const tables = (schemaModule.default as any).tables;
      expect(tables.policySnapshots).toBeDefined();

      const snapshotIndexes = tables.policySnapshots.indexes.map((idx: any) => idx.indexDescriptor);
      expect(snapshotIndexes).toContain("by_url_hash");
      expect(snapshotIndexes).toContain("by_captured_at");
    });

    it("saves and retrieves policy snapshots via internal queries", async () => {
      const mockSnapshot = {
        _id: "snap_1",
        urlHash: "abc123hash",
        url: "https://payer.example.com/cpb/knee-mri",
        markdown: "# Knee MRI Clinical Policy",
        capturedAt: Date.now(),
      };

      const mockCtx: any = {
        db: {
          query: vi.fn().mockReturnValue({
            withIndex: vi.fn().mockReturnValue({
              first: vi.fn().mockResolvedValue(mockSnapshot),
            }),
          }),
        },
      };

      const retrieved = await (clinicalEvidencesModule.getPolicySnapshotInternal as any)._handler(mockCtx, {
        urlHash: "abc123hash",
      });

      expect(retrieved).toEqual(mockSnapshot);
    });
  });

  describe("D-7: Visual Proof Screenshot Storage URL Resolution & Base64 Rejection", () => {
    it("sanitizes screenshotUrl in clinicalEvidences to reject raw base64 data URIs", async () => {
      const insertedDocs: any[] = [];
      const mockCtx: any = {
        db: {
          insert: vi.fn().mockImplementation((table: string, doc: any) => {
            insertedDocs.push({ table, ...doc });
            return Promise.resolve(`id_${insertedDocs.length}`);
          }),
        },
      };

      await (clinicalEvidencesModule.insertSingleInternal as any)._handler(mockCtx, {
        claimId: "claim_1",
        sourceType: "payer_cpb",
        title: "Evidence with Data URI Screenshot",
        citationClause: "Section 4.1",
        extractedEvidenceMarkdown: "Clinical proof",
        relevanceScore: 92,
        screenshotUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      });

      const evidence = insertedDocs.find((d) => d.table === "clinicalEvidences");
      expect(evidence).toBeDefined();
      expect(evidence.screenshotUrl).toBeUndefined();
    });

    it("preserves authentic HTTPS storage URLs for visual proof screenshots", async () => {
      const insertedDocs: any[] = [];
      const mockCtx: any = {
        db: {
          insert: vi.fn().mockImplementation((table: string, doc: any) => {
            insertedDocs.push({ table, ...doc });
            return Promise.resolve(`id_${insertedDocs.length}`);
          }),
        },
      };

      await (clinicalEvidencesModule.insertSingleInternal as any)._handler(mockCtx, {
        claimId: "claim_1",
        sourceType: "payer_cpb",
        title: "Evidence with Storage URL",
        citationClause: "Section 4.2",
        extractedEvidenceMarkdown: "Clinical proof",
        relevanceScore: 95,
        screenshotUrl: "https://my-app.convex.site/api/storage/screenshot-uuid.png",
      });

      const evidence = insertedDocs.find((d) => d.table === "clinicalEvidences");
      expect(evidence).toBeDefined();
      expect(evidence.screenshotUrl).toBe("https://my-app.convex.site/api/storage/screenshot-uuid.png");
    });
  });
});
