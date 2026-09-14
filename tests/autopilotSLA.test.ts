/// <reference path="./auth-mock.d.ts" />
import { describe, it, expect, vi, beforeEach } from "vitest";
import * as actionMailDispatcher from "../convex/actions/mailDispatcher";
import * as actionAgentMail from "../convex/actions/agentMail";
import * as emailsModule from "../convex/emails";
import * as libAgentMail from "../convex/lib/agentMail";
import * as libAgentMailWebhook from "../convex/lib/agentMailWebhook";
import * as libOpenAI from "../convex/lib/openai";
// @ts-ignore getAuthUserId is injected by vi.mock("@convex-dev/auth/server")
import { getAuthUserId } from "@convex-dev/auth/server";

vi.mock("@convex-dev/auth/server", () => ({
  getAuthUserId: vi.fn(),
}));

describe("Sentinel Auto-Pilot 1-Hour SLA Engine", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.AGENTMAIL_API_KEY = "test_key";
    process.env.AGENTMAIL_SENDER_INBOX_ID = "in_sender";
    process.env.AGENTMAIL_SENDER_EMAIL = "sender@claimhero.com";
    vi.clearAllMocks();
    vi.mocked(getAuthUserId).mockResolvedValue("user_123" as any);
  });

  describe("convex/emails: Auto-Pilot State Management", () => {
    it("getPendingAutoPilotMessagesInternal returns only inbound pending messages older than maxReceivedAt", async () => {
      const now = Date.now();
      const oneHourAgo = now - 60 * 60 * 1000;

      const mockMessages = [
        {
          _id: "msg_old_pending",
          claimId: "claim_1",
          threadId: "th_1",
          direction: "inbound",
          autoReplyStatus: "pending",
          autoReplyDraft: "Cited clinical rebuttal draft...",
          receivedAt: oneHourAgo - 5000,
          detectedDetermination: "DENIAL_UPHELD",
        },
        {
          _id: "msg_recent_pending",
          claimId: "claim_1",
          threadId: "th_1",
          direction: "inbound",
          autoReplyStatus: "pending",
          autoReplyDraft: "Draft for recent message",
          receivedAt: now - 10000, // only 10s old, should NOT be returned
          detectedDetermination: "DENIAL_UPHELD",
        },
        {
          _id: "msg_dispatched",
          claimId: "claim_1",
          threadId: "th_1",
          direction: "inbound",
          autoReplyStatus: "dispatched",
          autoReplyDraft: "Already sent draft",
          receivedAt: oneHourAgo - 10000,
          detectedDetermination: "DENIAL_UPHELD",
        },
      ];

      const mockCtx: any = {
        db: {
          query: vi.fn().mockReturnValue({
            withIndex: vi.fn().mockReturnValue({
              take: vi.fn().mockResolvedValue(mockMessages.filter((m) => m.autoReplyStatus === "pending")),
            }),
          }),
        },
      };

      const res = await (emailsModule.getPendingAutoPilotMessagesInternal as any)._handler(mockCtx, {
        maxReceivedAt: oneHourAgo,
      });

      expect(res).toHaveLength(1);
      expect(res[0].messageId).toBe("msg_old_pending");
      expect(res[0].autoReplyDraft).toBe("Cited clinical rebuttal draft...");
    });

    it("dismissAutoReplyDraft sets autoReplyStatus to dismissed", async () => {
      const mockMsg = {
        _id: "msg_to_dismiss",
        claimId: "claim_1",
        autoReplyStatus: "pending",
      };

      const mockClaim = {
        _id: "claim_1",
        userId: "user_123",
      };

      const mockCtx: any = {
        db: {
          get: vi.fn().mockImplementation(async (id: string) => {
            if (id === "claim_1") return mockClaim;
            if (id === "msg_to_dismiss") return mockMsg;
            return null;
          }),
          patch: vi.fn().mockResolvedValue(undefined),
        },
      };

      const res = await (emailsModule.dismissAutoReplyDraft as any)._handler(mockCtx, {
        claimId: "claim_1",
        messageId: "msg_to_dismiss",
      });

      expect(res).toEqual({ success: true });
      expect(mockCtx.db.patch).toHaveBeenCalledWith("msg_to_dismiss", {
        autoReplyStatus: "dismissed",
      });
    });

    it("markAutoReplyDispatchedInternal sets autoReplyStatus to dispatched", async () => {
      const mockCtx: any = {
        db: {
          patch: vi.fn().mockResolvedValue(undefined),
        },
      };

      await (emailsModule.markAutoReplyDispatchedInternal as any)._handler(mockCtx, {
        messageId: "msg_123",
      });

      expect(mockCtx.db.patch).toHaveBeenCalledWith("msg_123", {
        autoReplyStatus: "dispatched",
      });
    });
  });

  describe("convex/actions/mailDispatcher: Mandatory Human Review Gate", () => {
    it("blocks autonomous dispatch and enforces mandatory human review", async () => {
      const mockCtx: any = {
        runQuery: vi.fn().mockImplementation(async (fn: any, args: any) => {
          if (args?.claimId) {
            return {
              _id: "c_1",
              claimNumber: "CLM-100",
              userId: "user_123",
              status: "under_review",
            };
          }
          return null;
        }),
        runMutation: vi.fn().mockResolvedValue(undefined),
      };

      const res = await (actionMailDispatcher.dispatchScheduledAutoPilotReply as any)._handler(mockCtx, {
        messageId: "msg_1",
        claimId: "c_1",
        threadId: "th_1",
      });

      expect(res.executed).toBe(false);
      expect(res.reason).toBe("mandatory_human_review_required");
      expect(mockCtx.runMutation).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          claimId: "c_1",
          eventType: "appeal_review_requested",
          actor: "Sentinel Safety Guard",
        })
      );
    });

    it("sweepPendingAutoPilotReplies returns 0 dispatches since unapproved automated sweeps are disabled", async () => {
      const mockCtx: any = {};
      const sweepRes = await (actionMailDispatcher.sweepPendingAutoPilotReplies as any)._handler(mockCtx, {});

      expect(sweepRes.totalFound).toBe(0);
      expect(sweepRes.dispatchedCount).toBe(0);
      expect(sweepRes.skippedCount).toBe(0);
    });
  });

  describe("convex/actions/agentMail: Inbound Mandatory Human Review Gate", () => {
    it("does NOT schedule 1-hour SLA autonomous dispatch for DENIAL_UPHELD and stages draft for human review", async () => {
      vi.spyOn(libAgentMail, "getAgentMailMessage").mockResolvedValue({
        message_id: "msg_denial_1",
        inbox_id: "inbox_1",
        from: "appeals@aetna.com",
        recipients: ["case@claimhero.com"],
        to: ["case@claimhero.com"],
        subject: "RE: Claim CLM-200 Adverse Determination Maintained",
        text: "The adverse determination is maintained. You have exhausted internal review.",
        attachments: [],
      } as any);

      vi.spyOn(libAgentMailWebhook, "normalizeAgentMailWebhook").mockReturnValue({
        eventType: "message.received",
        eventId: "evt_1",
        messageId: "msg_denial_1",
        inboxId: "inbox_1",
        from: "appeals@aetna.com",
        recipients: ["case@claimhero.com"],
        subject: "RE: Claim CLM-200 Adverse Determination Maintained",
        text: "The adverse determination is maintained. You have exhausted internal review.",
        attachments: [],
      });

      vi.spyOn(libOpenAI, "createStructuredCompletion").mockResolvedValue({
        determination: "DENIAL_UPHELD",
        clinicalRationale: "Adverse determination upheld upon secondary appellate review.",
        missingRecordsRequested: [],
        authorizedSettlementAmount: undefined,
        reviewerName: "Aetna Appellate Reviewer",
        shouldAutoReply: true,
        suggestedAutoReplyAddendum: "We formally contest this determination and request Independent External Review.",
      } as any);

      const mockScheduler = {
        runAfter: vi.fn().mockResolvedValue("sched_ok"),
      };

      const mockCtx: any = {
        scheduler: mockScheduler,
        runQuery: vi.fn().mockResolvedValue({
          _id: "claim_denial",
          claimNumber: "CLM-200",
          userId: "user_123",
          status: "dispatched",
        }),
        runMutation: vi.fn().mockResolvedValue("msg_db_id"),
      };

      const res = await (actionAgentMail.processInboundClaimReply as any)._handler(mockCtx, {
        eventId: "evt_1",
        messageId: "msg_denial_1",
        inboxId: "inbox_1",
      });

      expect(res).toBeNull();
      // Verify that autonomous 1-hour dispatch was NOT scheduled
      expect(mockScheduler.runAfter).not.toHaveBeenCalledWith(
        3600000,
        expect.anything(),
        expect.anything()
      );
      // Verify that draft staging audit event was logged for human review
      expect(mockCtx.runMutation).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          claimId: "claim_denial",
          eventType: "appeal_review_requested",
          actor: "Sentinel AI Preparer",
        })
      );
    });

    it("does NOT schedule auto-pilot when claim determination is OVERTURNED_APPROVED", async () => {
      vi.spyOn(libAgentMail, "getAgentMailMessage").mockResolvedValue({
        message_id: "msg_won_1",
        inbox_id: "inbox_1",
        from: "appeals@aetna.com",
        recipients: ["case@claimhero.com"],
        to: ["case@claimhero.com"],
        subject: "RE: Claim CLM-WON Overturned and Approved",
        text: "The prior denial has been reversed and approved for reimbursement in full.",
        attachments: [],
      } as any);

      vi.spyOn(libAgentMailWebhook, "normalizeAgentMailWebhook").mockReturnValue({
        eventType: "message.received",
        eventId: "evt_won_1",
        messageId: "msg_won_1",
        inboxId: "inbox_1",
        from: "appeals@aetna.com",
        recipients: ["case@claimhero.com"],
        subject: "RE: Claim CLM-WON Overturned and Approved",
        text: "The prior denial has been reversed and approved for reimbursement in full.",
        attachments: [],
      });

      vi.spyOn(libOpenAI, "createStructuredCompletion").mockResolvedValue({
        determination: "OVERTURNED_APPROVED",
        clinicalRationale: "Overturned and approved in full.",
        missingRecordsRequested: [],
        authorizedSettlementAmount: 5000,
        reviewerName: "Aetna Appellate Reviewer",
        shouldAutoReply: false,
        suggestedAutoReplyAddendum: "",
      } as any);

      const mockScheduler = {
        runAfter: vi.fn(),
      };

      const mockCtx: any = {
        scheduler: mockScheduler,
        runQuery: vi.fn().mockResolvedValue({
          _id: "claim_won",
          claimNumber: "CLM-WON",
          status: "dispatched",
        }),
        runMutation: vi.fn().mockResolvedValue("msg_won_db"),
      };

      await (actionAgentMail.processInboundClaimReply as any)._handler(mockCtx, {
        eventId: "evt_won_1",
        messageId: "msg_won_1",
        inboxId: "inbox_1",
      });

      // Scheduler should NOT be called for auto-pilot dispatch on won claims
      expect(mockScheduler.runAfter).not.toHaveBeenCalledWith(
        3600000,
        expect.anything(),
        expect.anything()
      );
    });
  });
});
