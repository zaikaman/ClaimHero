import { describe, it, expect, vi, beforeEach } from "vitest";
import * as workflows from "../convex/workflows";
import * as actionSentinelPipeline from "../convex/actions/sentinelPipeline";
import { rateLimiter } from "../convex/lib/rateLimiter";
// @ts-ignore getAuthUserId is injected by vi.mock("@convex-dev/auth/server")
import { getAuthUserId } from "@convex-dev/auth/server";

vi.mock("@convex-dev/auth/server", () => ({
  getAuthUserId: vi.fn(),
}));

describe("Convex Workflows: Durable Claim Orchestration (@convex-dev/workflow)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getAuthUserId).mockResolvedValue("user_123" as any);
  });

  describe("durableClaimPipeline workflow handler", () => {
    it("aborts and throws error if claim is not found", async () => {
      const mockStep: any = {
        runQuery: vi.fn().mockResolvedValue(null),
        runAction: vi.fn(),
        runMutation: vi.fn(),
        sleep: vi.fn(),
      };

      const handler = workflows.executeDurableClaimPipeline;

      await expect(
        handler(mockStep, { claimId: "c_missing" as any })
      ).rejects.toThrow("Durable pipeline aborted: Claim c_missing not found");
    });

    it("throws error if sender details are missing", async () => {
      const mockClaim = {
        _id: "c1",
        userId: "user_123",
        claimNumber: "CLM-DUR-1",
        patient: { name: "Jane Doe", insurancePayer: "Aetna", state: "CA" },
      };

      const mockStep: any = {
        runQuery: vi.fn().mockResolvedValue(mockClaim),
        runAction: vi.fn(),
        runMutation: vi.fn(),
        sleep: vi.fn(),
      };

      const handler = workflows.executeDurableClaimPipeline;

      await expect(
        handler(mockStep, { claimId: "c1" as any })
      ).rejects.toThrow("Complete sender details before drafting");
    });

    it("executes multi-stage pipeline with checkpoints, retries and synthesizes brief", async () => {
      const mockClaim = {
        _id: "c1",
        userId: "user_123",
        claimNumber: "CLM-DUR-1",
        patient: { name: "Jane Doe", insurancePayer: "Aetna", state: "CA" },
        cptCodes: ["27447"],
        icd10Codes: ["M17.11"],
        denialReasonCode: "CO-50",
        denialReasonDescription: "Not medically necessary",
        appealContext: {
          sender: {
            name: "Dr. Sarah Chen, MD",
            credentials: "MD, Board Certified Orthopedics",
            email: "schen@ortho.example.com",
            phone: "555-0199",
          },
          clinicalFacts: {
            symptomsAndFunctionalImpact: "Severe knee pain and immobility",
            examinationFindings: "Grade IV osteophytes",
            imagingAndDiagnostics: "X-ray confirmed end-stage osteoarthritis",
            treatmentHistoryAndResponse: "Failed physical therapy and cortisone",
            recordsAreIncomplete: false,
          },
        },
      };

      const mockStep: any = {
        runQuery: vi.fn().mockImplementation((fn) => {
          return Promise.resolve(mockClaim);
        }),
        runAction: vi.fn().mockImplementation((fn, args, opts) => {
          if (opts?.name === "crawlInsurerPolicy") {
            return Promise.resolve({ policyTitle: "Aetna CPB 0244", clausesExtracted: 5 });
          }
          if (opts?.name === "computeOverturnScore") {
            return Promise.resolve({
              overturnProbabilityScore: 88,
              riskLevel: "high_confidence",
              scoringBreakdown: [],
            });
          }
          if (opts?.name === "retrieveTopPrecedents") {
            return Promise.resolve([{ title: "Winning Knee Precedent", citation: "IMR 2024-09" }]);
          }
          if (opts?.name === "generateAppealBrief") {
            return Promise.resolve({ appealId: "appeal_123" });
          }
          return Promise.resolve({});
        }),
        runMutation: vi.fn().mockResolvedValue(undefined),
        sleep: vi.fn(),
      };

      const handler = workflows.executeDurableClaimPipeline;
      const result = await handler(mockStep, { claimId: "c1" as any });

      expect(result.success).toBe(true);
      expect(result.claimId).toBe("c1");
      expect(result.policyTitle).toBe("Aetna CPB 0244");
      expect(result.clausesExtracted).toBe(5);
      expect(result.overturnProbabilityScore).toBe(88);
      expect(result.riskLevel).toBe("high_confidence");
      expect(result.appealId).toBe("appeal_123");

      // Verify checkpoints were recorded
      expect(mockStep.runMutation).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          claimId: "c1",
          status: "ready_for_review",
        })
      );
    });

    it("resiliently handles crawler error by inserting statutory ERISA fallback evidence", async () => {
      const mockClaim = {
        _id: "c1",
        userId: "user_123",
        claimNumber: "CLM-FALLBACK-1",
        patient: { name: "Bob Smith", insurancePayer: "UnitedHealthcare", state: "CA" },
        cptCodes: ["63047"],
        icd10Codes: ["M51.16"],
        denialReasonCode: "CO-50",
        appealContext: {
          sender: {
            name: "Dr. Gregory House, MD",
            email: "ghouse@princeton.edu",
          },
        },
      };

      let queryCallCount = 0;
      const mockStep: any = {
        runQuery: vi.fn().mockImplementation((fn, args) => {
          queryCallCount++;
          if (queryCallCount === 1) {
            return Promise.resolve(mockClaim);
          }
          return Promise.resolve([]); // existingEvidences empty
        }),
        runAction: vi.fn().mockImplementation((fn, args, opts) => {
          if (opts?.name === "crawlInsurerPolicy") {
            throw new Error("Firecrawl rate limit 429: Too Many Requests");
          }
          if (opts?.name === "computeOverturnScore") {
            return Promise.resolve({
              overturnProbabilityScore: 75,
              riskLevel: "moderate",
            });
          }
          if (opts?.name === "generateAppealBrief") {
            return Promise.resolve({ appealId: "appeal_fallback_1" });
          }
          return Promise.resolve([]);
        }),
        runMutation: vi.fn().mockResolvedValue(undefined),
        sleep: vi.fn(),
      };

      const handler = workflows.executeDurableClaimPipeline;
      const result = await handler(mockStep, { claimId: "c1" as any });

      expect(result.success).toBe(true);
      expect(result.clausesExtracted).toBeGreaterThanOrEqual(1);
      // Verify statutory fallback evidence insertion was called
      expect(mockStep.runMutation).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          claimId: "c1",
          evidences: expect.any(Array),
        })
      );
    });

    it("supports auto-pilot dispatch and durable step.sleep() cadence countdown", async () => {
      const mockClaim = {
        _id: "c1",
        userId: "user_123",
        claimNumber: "CLM-AUTOPILOT-1",
        autoPilotEnabled: true,
        patient: { name: "Alice Blue", insurancePayer: "Cigna", state: "NY" },
        appealContext: {
          sender: {
            name: "Dr. Sarah Chen, MD",
            email: "schen@clinic.org",
          },
        },
      };

      const mockStep: any = {
        runQuery: vi.fn().mockResolvedValue(mockClaim),
        runAction: vi.fn().mockImplementation((fn, args, opts) => {
          if (opts?.name === "crawlInsurerPolicy") return Promise.resolve({ clausesExtracted: 3 });
          if (opts?.name === "computeOverturnScore") return Promise.resolve({ overturnProbabilityScore: 90 });
          if (opts?.name === "generateAppealBrief") return Promise.resolve({ appealId: "app_cadence" });
          if (opts?.name === "autoDispatchAppealPacket") return Promise.resolve({ transmissionId: "tx_1" });
          return Promise.resolve([]);
        }),
        runMutation: vi.fn().mockResolvedValue(undefined),
        sleep: vi.fn().mockResolvedValue(undefined),
      };

      const handler = workflows.executeDurableClaimPipeline;
      const result = await handler(mockStep, {
        claimId: "c1" as any,
        autoDispatch: true,
        followUpCadenceDays: 14,
      });

      expect(result.success).toBe(true);
      expect(result.dispatched).toBe(true);

      // Verify sleep duration was calculated: 14 days * 86400 * 1000 ms = 1,209,600,000 ms
      expect(mockStep.sleep).toHaveBeenCalledWith(
        14 * 24 * 60 * 60 * 1000,
        expect.objectContaining({ name: "erisaStatutoryFollowUpCadence" })
      );
    });
  });

  describe("erisaStatutoryCountdownWorkflow", () => {
    it("durably sleeps for specified cadence and escalates delinquent claim on wake-up", async () => {
      const mockClaim = {
        _id: "c_countdown",
        status: "dispatched",
        daysRemaining: 14,
      };

      const mockStep: any = {
        runQuery: vi.fn().mockResolvedValue(mockClaim),
        runMutation: vi.fn().mockResolvedValue(undefined),
        sleep: vi.fn().mockResolvedValue(undefined),
      };

      const handler = workflows.executeErisaStatutoryCountdown;
      const result = await handler(mockStep, {
        claimId: "c_countdown" as any,
        cadenceDays: 14,
      });

      expect(result.claimId).toBe("c_countdown");
      expect(result.statutoryEscalated).toBe(true);
      expect(mockStep.sleep).toHaveBeenCalledWith(
        14 * 24 * 60 * 60 * 1000,
        expect.objectContaining({ name: "erisaCadenceCountdown" })
      );
      expect(mockStep.runMutation).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          claimId: "c_countdown",
          status: "escalated",
        })
      );
    });
  });

  describe("startDurablePipeline mutation", () => {
    it("enforces claim ownership and rate limits before starting workflow", async () => {
      vi.mocked(getAuthUserId).mockResolvedValue("user_123" as any);
      vi.spyOn(rateLimiter, "limit").mockResolvedValue({ ok: true } as any);
      vi.spyOn(workflows.workflow, "start").mockResolvedValue("wf_test_123" as any);

      const mockClaim = {
        _id: "c1",
        userId: "user_123",
        claimNumber: "CLM-TEST-1",
      };

      const mockCtx: any = {
        db: {
          get: vi.fn().mockResolvedValue(mockClaim),
          patch: vi.fn().mockResolvedValue(undefined),
          insert: vi.fn().mockResolvedValue("audit_1"),
        },
      };

      const res = await (workflows.startDurablePipeline as any)._handler(mockCtx, {
        claimId: "c1",
      });

      expect(res.workflowId).toBe("wf_test_123");
      expect(res.claimId).toBe("c1");
      expect(mockCtx.db.patch).toHaveBeenCalledWith(
        "c1",
        expect.objectContaining({
          workflowId: "wf_test_123",
          workflowStatus: "inProgress",
        })
      );
      expect(mockCtx.db.insert).toHaveBeenCalledWith(
        "appealAuditLogs",
        expect.objectContaining({
          claimId: "c1",
          eventType: "durable_workflow_started",
        })
      );
    });

    it("throws rate limit error when limit is exceeded", async () => {
      vi.mocked(getAuthUserId).mockResolvedValue("user_123" as any);
      vi.spyOn(rateLimiter, "limit").mockResolvedValue({
        ok: false,
        retryAfter: 5000,
      } as any);

      const mockClaim = {
        _id: "c1",
        userId: "user_123",
      };

      const mockCtx: any = {
        db: {
          get: vi.fn().mockResolvedValue(mockClaim),
        },
      };

      await expect(
        (workflows.startDurablePipeline as any)._handler(mockCtx, {
          claimId: "c1",
        })
      ).rejects.toThrow("Rate limit reached for pipeline execution");
    });
  });

  describe("getWorkflowExecutionStatus query", () => {
    it("returns hasWorkflow: false when no workflow exists", async () => {
      const mockCtx: any = {
        db: {
          get: vi.fn().mockResolvedValue({ _id: "c1" }),
        },
      };

      const res = await (workflows.getWorkflowExecutionStatus as any)._handler(mockCtx, {
        claimId: "c1",
      });

      expect(res.hasWorkflow).toBe(false);
      expect(res.workflowId).toBe(null);
    });

    it("queries status and returns live workflow state when attached to claim", async () => {
      const mockClaim = {
        _id: "c1",
        workflowId: "wf_live_999",
      };

      vi.spyOn(workflows.workflow, "status").mockResolvedValue({
        type: "inProgress",
        running: [{ stepNumber: 1, name: "crawlInsurerPolicy" } as any],
      });

      const mockCtx: any = {
        db: {
          get: vi.fn().mockResolvedValue(mockClaim),
        },
      };

      const res = await (workflows.getWorkflowExecutionStatus as any)._handler(mockCtx, {
        claimId: "c1",
      });

      expect(res.hasWorkflow).toBe(true);
      expect(res.workflowId).toBe("wf_live_999");
      expect(res.status.type).toBe("inProgress");
    });
  });

  describe("cancelDurableWorkflow mutation", () => {
    it("cancels running workflow and updates claim status", async () => {
      vi.mocked(getAuthUserId).mockResolvedValue("user_123" as any);
      vi.spyOn(workflows.workflow, "cancel").mockResolvedValue(undefined);

      const mockClaim = {
        _id: "c1",
        userId: "user_123",
        workflowId: "wf_to_cancel",
      };

      const mockCtx: any = {
        db: {
          get: vi.fn().mockResolvedValue(mockClaim),
          patch: vi.fn().mockResolvedValue(undefined),
          insert: vi.fn().mockResolvedValue("audit_cancel"),
        },
      };

      const res = await (workflows.cancelDurableWorkflow as any)._handler(mockCtx, {
        claimId: "c1",
      });

      expect(res.success).toBe(true);
      expect(res.workflowId).toBe("wf_to_cancel");
      expect(workflows.workflow.cancel).toHaveBeenCalledWith(mockCtx, "wf_to_cancel");
      expect(mockCtx.db.patch).toHaveBeenCalledWith(
        "c1",
        expect.objectContaining({ workflowStatus: "canceled" })
      );
    });
  });

  describe("sentinelPipeline integration with workflows", () => {
    it("runAutonomousPipeline delegates to durable workflow when useDurableWorkflow is true", async () => {
      const mockCtx: any = {
        runMutation: vi.fn().mockResolvedValue({ workflowId: "wf_delegated_1" }),
      };

      const res = await (actionSentinelPipeline.runAutonomousPipeline as any)._handler(mockCtx, {
        claimId: "c1",
        useDurableWorkflow: true,
      });

      expect(res.success).toBe(true);
      expect(res.workflowId).toBe("wf_delegated_1");
      expect(mockCtx.runMutation).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ claimId: "c1" })
      );
    });

    it("startDurablePipelineAction triggers the durable workflow mutation", async () => {
      const mockCtx: any = {
        runMutation: vi.fn().mockResolvedValue({ workflowId: "wf_from_action", claimId: "c1" }),
      };

      const res = await (actionSentinelPipeline.startDurablePipelineAction as any)._handler(mockCtx, {
        claimId: "c1",
      });

      expect(res.workflowId).toBe("wf_from_action");
      expect(mockCtx.runMutation).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ claimId: "c1" })
      );
    });
  });
});
