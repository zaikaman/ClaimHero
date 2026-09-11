import { describe, it, expect, vi, beforeEach } from "vitest";
import * as pipelineActivities from "../convex/pipelineActivities";
import * as actionSentinelPipeline from "../convex/actions/sentinelPipeline";
import { rateLimiter } from "../convex/lib/rateLimiter";
// @ts-ignore getAuthUserId is injected by vi.mock("@convex-dev/auth/server")
import { getAuthUserId } from "@convex-dev/auth/server";

vi.mock("@convex-dev/auth/server", () => ({
  getAuthUserId: vi.fn(),
}));

function chainableQuery(result: unknown) {
  return {
    withIndex: vi.fn().mockReturnValue({
      order: vi.fn().mockReturnValue({
        take: vi.fn().mockResolvedValue(result),
      }),
    }),
  };
}

describe("Convex Pipeline Activity Stream", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getAuthUserId).mockResolvedValue("user_123" as any);
  });

  describe("convex/pipelineActivities", () => {
    it("logPipelineActivityInternal: inserts a trimmed human-language event", async () => {
      const mockCtx: any = {
        db: {
          insert: vi.fn().mockResolvedValue("activity_1"),
          query: vi.fn().mockReturnValue(chainableQuery([])),
        },
      };
      const res = await (pipelineActivities.logPipelineActivityInternal as any)._handler(mockCtx, {
        claimId: "c1",
        runId: "run_1",
        stage: "crawl",
        status: "running",
        message: `Searching payer bulletins. ${"x".repeat(600)}`,
      });
      expect(res).toBe("activity_1");
      const inserted = mockCtx.db.insert.mock.calls[0][1];
      expect(inserted.message.length).toBeLessThanOrEqual(500);
      expect(inserted.runId).toBe("run_1");
    });

    it("logPipelineActivityInternal: ignores blank messages", async () => {
      const mockCtx: any = {
        db: {
          insert: vi.fn(),
          query: vi.fn().mockReturnValue(chainableQuery([])),
        },
      };
      const res = await (pipelineActivities.logPipelineActivityInternal as any)._handler(mockCtx, {
        claimId: "c1",
        runId: "run_1",
        stage: "run",
        status: "running",
        message: "   ",
      });
      expect(res).toBeNull();
      expect(mockCtx.db.insert).not.toHaveBeenCalled();
    });

    it("listByClaim: returns empty array when unauthorized", async () => {
      vi.mocked(getAuthUserId).mockResolvedValue(null);
      const mockCtx: any = { db: { get: vi.fn().mockResolvedValue(null) } };
      const res = await (pipelineActivities.listByClaim as any)._handler(mockCtx, { claimId: "c1" });
      expect(res).toEqual([]);
    });

    it("listByClaim: returns events in chronological order when authorized", async () => {
      const mockClaim = { _id: "c1", userId: "user_123" };
      const storedDesc = [
        { _id: "a2", createdAt: 200 },
        { _id: "a1", createdAt: 100 },
      ];
      const mockCtx: any = {
        db: {
          get: vi.fn().mockResolvedValue(mockClaim),
          query: vi.fn().mockReturnValue(chainableQuery(storedDesc)),
        },
      };
      const res = await (pipelineActivities.listByClaim as any)._handler(mockCtx, { claimId: "c1" });
      expect(res.map((e: { _id: string }) => e._id)).toEqual(["a1", "a2"]);
    });
  });

  describe("convex/actions/sentinelPipeline run scoping", () => {
    it("runAutonomousPipeline: propagates a shared run id to every stage action", async () => {
      vi.spyOn(rateLimiter, "limit").mockResolvedValue({ ok: true } as any);
      const mockClaim = {
        _id: "c1",
        userId: "user_123",
        claimNumber: "CLM-AUTO-9",
        patient: { name: "Case Patient", insurancePayer: "TestPayer", state: "CA" },
        cptCodes: ["63047"],
        icd10Codes: ["M51.16"],
        denialReasonCode: "CO-50",
        denialReasonDescription: "Medical necessity criteria not satisfied",
        payerContact: { isVerified: true },
        appealContext: {
          sender: { name: "Appeals Coordinator", email: "coord@clinic.org" },
        },
      };
      const runActionCalls: Array<{ fn: unknown; args: Record<string, unknown> }> = [];
      let actionCallIndex = 0;
      const mockCtx: any = {
        // Ownership check resolves the claim; no evidence lookups run on the success path.
        runQuery: vi.fn().mockResolvedValue(mockClaim),
        runAction: vi.fn().mockImplementation((fn: unknown, args: Record<string, unknown>) => {
          runActionCalls.push({ fn, args });
          actionCallIndex += 1;
          // Calls happen in pipeline order: crawl, score, precedents, synthesis.
          if (actionCallIndex === 1) {
            return Promise.resolve({ policyTitle: "Test CPB", clausesExtracted: 4 });
          }
          if (actionCallIndex === 2) {
            return Promise.resolve({ overturnProbabilityScore: 90, riskLevel: "high_confidence" });
          }
          if (actionCallIndex === 3) {
            return Promise.resolve([]);
          }
          return Promise.resolve({ appealId: "app_9" });
        }),
        runMutation: vi.fn().mockResolvedValue(undefined),
      };

      const res = await (actionSentinelPipeline.runAutonomousPipeline as any)._handler(mockCtx, {
        claimId: "c1",
      });

      expect(res.success).toBe(true);
      const runScoped = runActionCalls.filter(
        (call) => typeof call.args?.pipelineRunId === "string" && call.args.pipelineRunId.startsWith("run_")
      );
      // crawl + score + precedents + synthesis all receive the shared run id
      expect(runScoped.length).toBeGreaterThanOrEqual(4);
      const runIds = new Set(runScoped.map((call) => call.args.pipelineRunId));
      expect(runIds.size).toBe(1);
    });
  });
});
