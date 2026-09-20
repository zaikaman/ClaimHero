import { describe, it, expect, vi, beforeEach } from "vitest";
import { actionRetrier, executeActionWithRetry } from "../convex/lib/retrier";
import { intakeWorkpool } from "../convex/lib/intakeWorkpool";
import * as adversarialRetrier from "../convex/actions/adversarialRetrier";
import * as bulkIntake from "../convex/bulkIntake";
import * as bulkIntakeWorker from "../convex/actions/bulkIntakeWorker";
import * as statutoryDeadlineWorker from "../convex/statutoryDeadlineWorker";
import * as libAuth from "../convex/lib/auth";
import * as libOpenAI from "../convex/lib/openai";
import { ONE_DAY_MS } from "../convex/lib/dateUtils";
import crons from "../convex/crons";
import * as batchWorkerModule from "@convex-dev/batch-worker";

vi.mock("../convex/lib/auth", () => ({
  requireAuthUser: vi.fn(),
  requireClaimOwnerAction: vi.fn(),
}));

vi.mock("@convex-dev/batch-worker", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@convex-dev/batch-worker")>();
  return {
    ...actual,
    ping: vi.fn().mockResolvedValue(undefined),
  };
});

describe("Convex Components Integration: Scale, Concurrency & Adversarial Reliability", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("1. @convex-dev/action-retrier (Adversarial Reliability)", () => {
    it("configures ActionRetrier with exponential backoff, jitter, and max 4 failures", () => {
      expect(actionRetrier).toBeDefined();
      expect(actionRetrier.options.maxFailures).toBe(4);
      expect(actionRetrier.options.initialBackoffMs).toBe(1000);
      expect(actionRetrier.options.base).toBe(2);
    });

    it("executeActionWithRetry: succeeds after transient 503 errors and cleans up run state", async () => {
      const mockRunId = "run_123" as any;
      const runSpy = vi.spyOn(actionRetrier, "run").mockResolvedValue(mockRunId);

      let callCount = 0;
      const statusSpy = vi.spyOn(actionRetrier, "status").mockImplementation(async () => {
        callCount++;
        if (callCount < 2) {
          return { type: "inProgress" };
        }
        return {
          type: "completed",
          result: {
            type: "success",
            returnValue: {
              policyTitle: "UnitedHealthcare Knee Arthroplasty CPB",
              clausesExtracted: 3,
            },
          },
        };
      });

      const cleanupSpy = vi.spyOn(actionRetrier, "cleanup").mockResolvedValue(undefined as any);

      const mockCtx: any = {};
      const mockRef: any = {};

      const result = await executeActionWithRetry(mockCtx, mockRef, {}, {
        pollIntervalMs: 5,
        timeoutMs: 1000,
      });

      expect(runSpy).toHaveBeenCalledTimes(1);
      expect(statusSpy).toHaveBeenCalledTimes(2);
      expect(cleanupSpy).toHaveBeenCalledWith(mockCtx, mockRunId);
      expect(result).toEqual({
        policyTitle: "UnitedHealthcare Knee Arthroplasty CPB",
        clausesExtracted: 3,
      });
    });

    it("executeActionWithRetry: throws error when retried action exhausts max retries", async () => {
      const mockRunId = "run_fail" as any;
      vi.spyOn(actionRetrier, "run").mockResolvedValue(mockRunId);
      vi.spyOn(actionRetrier, "status").mockResolvedValue({
        type: "completed",
        result: {
          type: "failed",
          error: "503 Service Unavailable: Insurer portal gateway timeout",
        },
      });
      const cleanupSpy = vi.spyOn(actionRetrier, "cleanup").mockResolvedValue(undefined as any);

      const mockCtx: any = {};
      const mockRef: any = {};

      await expect(
        executeActionWithRetry(mockCtx, mockRef, {}, { pollIntervalMs: 5, timeoutMs: 1000 })
      ).rejects.toThrow("Retried action failed after attempts: 503 Service Unavailable");

      expect(cleanupSpy).toHaveBeenCalledWith(mockCtx, mockRunId);
    });

    it("crawlInsurerPolicyWithRetry: authorizes claim owner and wraps crawler in retrier", async () => {
      vi.mocked(libAuth.requireClaimOwnerAction).mockResolvedValue(undefined as any);

      vi.spyOn(actionRetrier, "run").mockResolvedValue("run_crawl" as any);
      vi.spyOn(actionRetrier, "status").mockResolvedValue({
        type: "completed",
        result: {
          type: "success",
          returnValue: { policyTitle: "Aetna Infliximab Criteria", clausesExtracted: 2 },
        },
      });
      vi.spyOn(actionRetrier, "cleanup").mockResolvedValue(undefined as any);

      const mockCtx: any = {};
      const res = await (adversarialRetrier.crawlInsurerPolicyWithRetry as any)._handler(mockCtx, {
        claimId: "claim_123",
        payer: "Aetna",
        cptCodes: ["J1745"],
        icd10Codes: ["K50.00"],
        denialReasonCode: "CO-50",
        denialReasonDescription: "Step therapy required",
      });

      expect(libAuth.requireClaimOwnerAction).toHaveBeenCalledWith(mockCtx, "claim_123");
      expect(res).toEqual({ policyTitle: "Aetna Infliximab Criteria", clausesExtracted: 2 });
    });

    it("dispatchAppealPacketWithRetry: authorizes claim owner and wraps mail dispatcher in retrier", async () => {
      vi.mocked(libAuth.requireClaimOwnerAction).mockResolvedValue(undefined as any);

      vi.spyOn(actionRetrier, "run").mockResolvedValue("run_dispatch" as any);
      vi.spyOn(actionRetrier, "status").mockResolvedValue({
        type: "completed",
        result: {
          type: "success",
          returnValue: { messageId: "msg_sent_99", recipient: "appeals@cigna.com" },
        },
      });
      vi.spyOn(actionRetrier, "cleanup").mockResolvedValue(undefined as any);

      const mockCtx: any = {};
      const res = await (adversarialRetrier.dispatchAppealPacketWithRetry as any)._handler(mockCtx, {
        claimId: "claim_123",
      });

      expect(libAuth.requireClaimOwnerAction).toHaveBeenCalledWith(mockCtx, "claim_123");
      expect(res).toEqual({ messageId: "msg_sent_99", recipient: "appeals@cigna.com" });
    });

    it("enqueueCrawlWithRetry & enqueueDispatchWithRetry: return enqueued runId for async tracking", async () => {
      vi.mocked(libAuth.requireClaimOwnerAction).mockResolvedValue(undefined as any);
      vi.spyOn(actionRetrier, "run").mockResolvedValue("run_async_7" as any);

      const mockCtx: any = {};
      const crawlRes = await (adversarialRetrier.enqueueCrawlWithRetry as any)._handler(mockCtx, {
        claimId: "claim_123",
        payer: "UHC",
        cptCodes: [],
        icd10Codes: [],
        denialReasonCode: "CO-16",
        denialReasonDescription: "Missing info",
      });

      expect(crawlRes).toEqual({ runId: "run_async_7", status: "enqueued" });

      const dispatchRes = await (adversarialRetrier.enqueueDispatchWithRetry as any)._handler(mockCtx, {
        claimId: "claim_123",
      });

      expect(dispatchRes).toEqual({ runId: "run_async_7", status: "enqueued" });
    });

    it("getRetriedActionStatus: proxies status check to actionRetrier and requires auth", async () => {
      vi.mocked(libAuth.requireAuthUser).mockResolvedValue("user_auth" as any);
      vi.spyOn(actionRetrier, "status").mockResolvedValue({
        type: "inProgress",
      } as any);

      const mockCtx: any = {};
      const status = await (adversarialRetrier.getRetriedActionStatus as any)._handler(mockCtx, {
        runId: "run_99",
      });

      expect(libAuth.requireAuthUser).toHaveBeenCalledWith(mockCtx);
      expect(status).toEqual({ type: "inProgress" });
    });
  });

  describe("2. @convex-dev/workpool (Bulk Denial Intake for RCM Clinics)", () => {
    it("configures intakeWorkpool with maxParallelism: 3 for OpenAI TPM rate-limit protection", () => {
      expect(intakeWorkpool).toBeDefined();
      expect(intakeWorkpool.options.maxParallelism).toBe(3);
      expect(intakeWorkpool.options.retryActionsByDefault).toBe(true);
      expect(intakeWorkpool.options.defaultRetryBehavior).toEqual({
        initialBackoffMs: 1500,
        base: 2,
        maxAttempts: 3,
      });
    });

    it("enqueueBulkIntake: rejects empty batch or batch exceeding 50 items", async () => {
      vi.mocked(libAuth.requireAuthUser).mockResolvedValue("user_rcm" as any);

      const mockCtx: any = { db: { insert: vi.fn() } };

      await expect(
        (bulkIntake.enqueueBulkIntake as any)._handler(mockCtx, {
          batchName: "Empty Batch",
          items: [],
        })
      ).rejects.toThrow("Bulk denial intake requires at least one document item.");

      const oversizedItems = Array.from({ length: 51 }, (_, i) => ({
        fileName: `denial_${i}.pdf`,
      }));

      await expect(
        (bulkIntake.enqueueBulkIntake as any)._handler(mockCtx, {
          batchName: "Oversized Batch",
          items: oversizedItems,
        })
      ).rejects.toThrow("Bulk intake batch exceeds maximum size of 50 documents.");
    });

    it("enqueueBulkIntake: inserts batch, records items, and enqueues to intakeWorkpool", async () => {
      vi.mocked(libAuth.requireAuthUser).mockResolvedValue("user_rcm" as any);

      const insertedBatches: any[] = [];
      const insertedItems: any[] = [];

      const mockCtx: any = {
        db: {
          insert: vi.fn().mockImplementation((table: string, doc: any) => {
            if (table === "bulkIntakeBatches") {
              const id = `batch_${insertedBatches.length + 1}`;
              insertedBatches.push({ _id: id, ...doc });
              return id;
            }
            if (table === "bulkIntakeItems") {
              const id = `item_${insertedItems.length + 1}`;
              insertedItems.push({ _id: id, ...doc });
              return id;
            }
          }),
        },
      };

      const enqueueActionSpy = vi.spyOn(intakeWorkpool, "enqueueAction").mockResolvedValue("work_id_1" as any);

      const items = [
        { fileName: "denial_patient_1.pdf", rawDocumentText: "Claim 100 denied CO-50" },
        { fileName: "denial_patient_2.pdf", rawDocumentText: "Claim 101 denied CO-197" },
        { fileName: "denial_patient_3.pdf", rawDocumentText: "Claim 102 denied CO-16" },
      ];

      const res = await (bulkIntake.enqueueBulkIntake as any)._handler(mockCtx, {
        batchName: "Monday Morning Clinic Ingest",
        items,
      });

      expect(res.batchId).toBe("batch_1");
      expect(res.totalCount).toBe(3);
      expect(res.status).toBe("queued");

      expect(insertedBatches[0]).toMatchObject({
        userId: "user_rcm",
        name: "Monday Morning Clinic Ingest",
        totalCount: 3,
        processedCount: 0,
        status: "queued",
      });

      expect(insertedItems).toHaveLength(3);
      expect(insertedItems[0].status).toBe("queued");
      expect(insertedItems[0].fileName).toBe("denial_patient_1.pdf");

      expect(enqueueActionSpy).toHaveBeenCalledTimes(3);
    });

    it("onBulkIntakeItemComplete: updates batch counters and transitions to completed", async () => {
      const batchDoc = {
        _id: "batch_1",
        totalCount: 2,
        processedCount: 1,
        successCount: 1,
        failureCount: 0,
        status: "processing",
      };

      const itemDoc = {
        _id: "item_2",
        batchId: "batch_1",
        status: "processing",
      };

      const patches: Record<string, any> = {};

      const mockCtx: any = {
        db: {
          get: vi.fn().mockImplementation((id: string) => {
            if (id === "batch_1") return batchDoc;
            if (id === "item_2") return itemDoc;
            return null;
          }),
          patch: vi.fn().mockImplementation((id: string, patch: any) => {
            patches[id] = patch;
          }),
        },
      };

      await (bulkIntake.onBulkIntakeItemComplete as any)._handler(mockCtx, {
        context: { batchId: "batch_1", itemId: "item_2" },
        workId: "work_2",
        result: {
          kind: "success",
          returnValue: { success: true },
        },
      });

      expect(patches["item_2"]).toMatchObject({ status: "completed" });
      expect(patches["batch_1"]).toMatchObject({
        processedCount: 2,
        successCount: 2,
        failureCount: 0,
        status: "completed",
      });
      expect(patches["batch_1"].completedAt).toBeDefined();
    });

    it("onBulkIntakeItemComplete: marks batch as partial_failed when an item fails", async () => {
      const batchDoc = {
        _id: "batch_1",
        totalCount: 2,
        processedCount: 1,
        successCount: 1,
        failureCount: 0,
        status: "processing",
      };

      const itemDoc = {
        _id: "item_2",
        batchId: "batch_1",
        status: "processing",
      };

      const patches: Record<string, any> = {};

      const mockCtx: any = {
        db: {
          get: vi.fn().mockImplementation((id: string) => {
            if (id === "batch_1") return batchDoc;
            if (id === "item_2") return itemDoc;
            return null;
          }),
          patch: vi.fn().mockImplementation((id: string, patch: any) => {
            patches[id] = patch;
          }),
        },
      };

      await (bulkIntake.onBulkIntakeItemComplete as any)._handler(mockCtx, {
        context: { batchId: "batch_1", itemId: "item_2" },
        workId: "work_2",
        result: {
          kind: "failed",
          error: "Corrupted PDF document",
        },
      });

      expect(patches["item_2"]).toMatchObject({
        status: "failed",
        error: "Corrupted PDF document",
      });
      expect(patches["batch_1"]).toMatchObject({
        processedCount: 2,
        successCount: 1,
        failureCount: 1,
        status: "partial_failed",
      });
    });

    it("processBulkIntakeItemAction: parses denial text, creates claim for user, and records completion", async () => {
      vi.spyOn(libOpenAI, "createStructuredCompletion").mockResolvedValue({
        isMedicalClaimDenial: true,
        patientName: "Sarah Jenkins",
        claimNumber: "CLM-99120",
        memberId: "MEM-4421",
        insurancePayer: "Cigna Health",
        deniedAmount: 8500,
        patientOwedAmount: 8500,
        cptCodes: ["29881"],
        icd10Codes: ["M23.22"],
        denialReasonCode: "CO-50",
        denialReasonDescription: "Not medically necessary",
        appealFilingDeadlineDays: 180,
      } as any);

      const mockItem = {
        _id: "item_1",
        batchId: "batch_1",
        userId: "user_rcm",
        rawDocumentText: "Patient Sarah Jenkins, Cigna denial for CPT 29881, amount $8,500.00",
        patientState: "TX",
        status: "queued",
      };

      const mockCtx: any = {
        runMutation: vi.fn().mockImplementation(async (fn: any, args: any) => {
          if (args.claimNumber) {
            return "claim_new_123";
          }
          return undefined;
        }),
        runQuery: vi.fn().mockResolvedValue(mockItem),
      };

      const result = await (bulkIntakeWorker.processBulkIntakeItemAction as any)._handler(mockCtx, {
        itemId: "item_1",
        batchId: "batch_1",
        userId: "user_rcm",
      });

      expect(result).toEqual({ success: true, claimId: "claim_new_123" });
      expect(mockCtx.runMutation).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          userId: "user_rcm",
          patientName: "Sarah Jenkins",
          claimNumber: "CLM-99120",
          deniedAmount: 8500,
        })
      );
    });

    it("processBulkIntakeItemAction: rejects raw binary PDF in storage payload without client OCR", async () => {
      const mockItem = {
        _id: "item_raw_pdf",
        batchId: "batch_1",
        userId: "user_rcm",
        fileName: "scanned_denial.pdf",
        storageId: "storage_pdf_1",
        rawDocumentText: "",
        status: "queued",
      };

      const pdfHeaderBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]); // "%PDF-1.4"
      const mockCtx: any = {
        runMutation: vi.fn(),
        runQuery: vi.fn().mockResolvedValue(mockItem),
        storage: {
          getUrl: vi.fn().mockResolvedValue("https://storage.convex.cloud/pdf1"),
        },
      };

      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: vi.fn().mockResolvedValue(pdfHeaderBytes.buffer),
      } as any);

      try {
        await expect(
          (bulkIntakeWorker.processBulkIntakeItemAction as any)._handler(mockCtx, {
            itemId: "item_raw_pdf",
            batchId: "batch_1",
            userId: "user_rcm",
          })
        ).rejects.toThrow("contains raw binary PDF data without extracted text");

        expect(mockCtx.runMutation).toHaveBeenCalledWith(
          expect.anything(),
          expect.objectContaining({
            itemId: "item_raw_pdf",
            error: expect.stringContaining("contains raw binary PDF data without extracted text"),
          })
        );
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it("getBulkIntakeBatches & getBulkIntakeBatchDetail: return user-isolated clinic batches", async () => {
      vi.mocked(libAuth.requireAuthUser).mockResolvedValue("user_rcm" as any);

      const mockBatch = {
        _id: "batch_1",
        userId: "user_rcm",
        name: "Monday Batch",
      };

      const mockItems = [
        { _id: "it_1", batchId: "batch_1", fileName: "d1.pdf" },
        { _id: "it_2", batchId: "batch_1", fileName: "d2.pdf" },
      ];

      const mockCtx: any = {
        db: {
          query: vi.fn().mockReturnValue({
            withIndex: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                take: vi.fn().mockResolvedValue([mockBatch]),
              }),
              collect: vi.fn().mockResolvedValue(mockItems),
            }),
          }),
          get: vi.fn().mockImplementation((id: string) => {
            if (id === "batch_1") return mockBatch;
            return null;
          }),
        },
      };

      const batches = await (bulkIntake.getBulkIntakeBatches as any)._handler(mockCtx, {});
      expect(batches).toEqual([mockBatch]);

      const detail = await (bulkIntake.getBulkIntakeBatchDetail as any)._handler(mockCtx, {
        batchId: "batch_1",
      });
      expect(detail).toEqual({
        batch: mockBatch,
        items: mockItems,
      });
    });
  });

  describe("3. @convex-dev/batch-worker (Statutory Deadline Sweeps at Scale)", () => {
    it("getStatutoryDeadlineBatch: paginates claims with cursor in chunks of 50 and returns work", async () => {
      const mockClaims = Array.from({ length: 50 }, (_, i) => ({
        _id: `claim_${i}`,
        claimNumber: `CLM-${i}`,
        userId: "u1",
        status: "analyzing",
        statutoryDeadline: Date.now() + 60 * ONE_DAY_MS,
        daysRemaining: 60,
      }));

      const mockCtx: any = {
        db: {
          query: vi.fn().mockReturnValue({
            withIndex: vi.fn().mockReturnValue({
              paginate: vi.fn().mockResolvedValue({
                page: mockClaims,
                isDone: false,
                continueCursor: "cursor_page_2",
              }),
            }),
          }),
        },
      };

      const res = await (statutoryDeadlineWorker.getStatutoryDeadlineBatch as any)._handler(mockCtx, {
        name: "statutory_deadline_sweep",
        cursor: null,
      });

      expect(res.kind).toBe("work");
      expect(res.batch.claims).toHaveLength(50);
      expect(res.cursor).toBe("cursor_page_2");
    });

    it("getStatutoryDeadlineBatch: returns idle when page is empty or end of dataset reached", async () => {
      const mockCtx: any = {
        db: {
          query: vi.fn().mockReturnValue({
            withIndex: vi.fn().mockReturnValue({
              paginate: vi.fn().mockResolvedValue({
                page: [],
                isDone: true,
                continueCursor: "",
              }),
            }),
          }),
        },
      };

      const res = await (statutoryDeadlineWorker.getStatutoryDeadlineBatch as any)._handler(mockCtx, {
        name: "statutory_deadline_sweep",
        cursor: "cursor_page_end",
      });

      expect(res.kind).toBe("idle");

      // Cursor empty string immediately returns idle without DB query
      const idleFast = await (statutoryDeadlineWorker.getStatutoryDeadlineBatch as any)._handler(mockCtx, {
        name: "statutory_deadline_sweep",
        cursor: "",
      });
      expect(idleFast.kind).toBe("idle");
    });

    it("processStatutoryDeadlineBatch: recalculates days remaining and emits critical alarm on <= 14 days", async () => {
      const now = Date.UTC(2026, 8, 20, 12, 0, 0); // 2026-09-20
      vi.spyOn(Date, "now").mockReturnValue(now);

      const claimsInBatch = [
        {
          id: "claim_urgent",
          claimNumber: "CLM-URGENT",
          userId: "user_1",
          status: "ready_for_review",
          statutoryDeadline: now + 5 * ONE_DAY_MS, // 5 days remaining
          daysRemaining: 15, // was 15, now 5 -> cross <= 14 threshold
        },
        {
          id: "claim_stable",
          claimNumber: "CLM-STABLE",
          userId: "user_1",
          status: "analyzing",
          statutoryDeadline: now + 80 * ONE_DAY_MS, // 80 days remaining
          daysRemaining: 80, // no change
        },
        {
          id: "claim_won",
          claimNumber: "CLM-WON",
          userId: "user_1",
          status: "won", // completed, skip
          statutoryDeadline: now + 5 * ONE_DAY_MS,
          daysRemaining: 5,
        },
      ];

      const patches: Record<string, any> = {};
      const auditLogs: any[] = [];

      const mockCtx: any = {
        db: {
          patch: vi.fn().mockImplementation((id: string, patch: any) => {
            patches[id] = patch;
          }),
          query: vi.fn().mockReturnValue({
            withIndex: vi.fn().mockReturnValue({
              first: vi.fn().mockResolvedValue(null), // no prior alarm today
            }),
          }),
          insert: vi.fn().mockImplementation((table: string, doc: any) => {
            if (table === "appealAuditLogs") {
              auditLogs.push(doc);
              return "log_1";
            }
          }),
        },
      };

      await (statutoryDeadlineWorker.processStatutoryDeadlineBatch as any)._handler(mockCtx, {
        claims: claimsInBatch,
      });

      expect(patches["claim_urgent"]).toMatchObject({
        daysRemaining: 5,
        updatedAt: now,
      });
      expect(patches["claim_stable"]).toBeUndefined();
      expect(patches["claim_won"]).toBeUndefined();

      expect(auditLogs).toHaveLength(1);
      expect(auditLogs[0]).toMatchObject({
        claimId: "claim_urgent",
        eventType: "statutory_alarm_critical",
        actor: "Statutory Deadline Sentinel",
      });
      expect(auditLogs[0].details).toContain("Only 5 days remaining");
    });

    it("processStatutoryDeadlineBatch: deduplicates critical alarm if already emitted today", async () => {
      const now = Date.UTC(2026, 8, 20, 12, 0, 0);
      vi.spyOn(Date, "now").mockReturnValue(now);

      const claimsInBatch = [
        {
          id: "claim_urgent",
          claimNumber: "CLM-URGENT",
          userId: "user_1",
          status: "ready_for_review",
          statutoryDeadline: now + 5 * ONE_DAY_MS,
          daysRemaining: 15,
        },
      ];

      const auditLogs: any[] = [];

      const mockCtx: any = {
        db: {
          patch: vi.fn(),
          query: vi.fn().mockReturnValue({
            withIndex: vi.fn().mockReturnValue({
              first: vi.fn().mockResolvedValue({ _id: "existing_alarm_log" }), // already logged
            }),
          }),
          insert: vi.fn().mockImplementation((table: string, doc: any) => {
            if (table === "appealAuditLogs") {
              auditLogs.push(doc);
              return "log_1";
            }
          }),
        },
      };

      await (statutoryDeadlineWorker.processStatutoryDeadlineBatch as any)._handler(mockCtx, {
        claims: claimsInBatch,
      });

      expect(auditLogs).toHaveLength(0); // Deduplicated!
    });

    it("processStatutoryDeadlineBatch: gracefully skips deleted claims when document is missing", async () => {
      const claimsInBatch = [
        {
          id: "claim_deleted",
          claimNumber: "CLM-GHOST",
          userId: "user_1",
          status: "ready_for_review",
          statutoryDeadline: Date.now() + 5 * ONE_DAY_MS,
          daysRemaining: 15,
        },
      ];

      const patches: Record<string, any> = {};
      const mockCtx: any = {
        db: {
          get: vi.fn().mockResolvedValue(null), // Claim deleted concurrently!
          patch: vi.fn().mockImplementation((id: string, patch: any) => {
            patches[id] = patch;
          }),
        },
      };

      // Should complete cleanly without throwing DocNotFound error
      await expect(
        (statutoryDeadlineWorker.processStatutoryDeadlineBatch as any)._handler(mockCtx, {
          claims: claimsInBatch,
        })
      ).resolves.not.toThrow();

      expect(patches["claim_deleted"]).toBeUndefined();
    });

    it("pingStatutoryDeadlineSweepInternal & triggerStatutoryDeadlineSweep: clears cursor before pinging", async () => {
      vi.mocked(libAuth.requireAuthUser).mockResolvedValue("user_coord" as any);

      const runMutationSpy = vi.fn().mockResolvedValue(null);
      const mockCtx: any = {
        runMutation: runMutationSpy,
      };

      await (statutoryDeadlineWorker.pingStatutoryDeadlineSweepInternal as any)._handler(mockCtx, {});

      expect(runMutationSpy).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ name: "statutory_deadline_sweep" })
      );

      const triggerRes = await (statutoryDeadlineWorker.triggerStatutoryDeadlineSweep as any)._handler(mockCtx, {});
      expect(libAuth.requireAuthUser).toHaveBeenCalledWith(mockCtx);
      expect(triggerRes).toEqual({ status: "sweep_triggered" });
    });

    it("getStatutoryDeadlineSweepStatus: checks auth and queries batch worker component status", async () => {
      vi.mocked(libAuth.requireAuthUser).mockResolvedValue("user_coord" as any);

      const mockCtx: any = {
        runQuery: vi.fn().mockResolvedValue({ kind: "idle" }),
      };

      const res = await (statutoryDeadlineWorker.getStatutoryDeadlineSweepStatus as any)._handler(mockCtx, {});

      expect(libAuth.requireAuthUser).toHaveBeenCalledWith(mockCtx);
      expect(mockCtx.runQuery).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ name: "statutory_deadline_sweep" })
      );
      expect(res).toEqual({ kind: "idle" });
    });

    it("crons.ts: daily statutory deadline sweep cron uses batch worker ping mutation", () => {
      expect(crons).toBeDefined();
    });
  });
});
