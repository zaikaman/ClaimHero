/// <reference path="./auth-mock.d.ts" />
import { describe, it, expect, vi, beforeEach } from "vitest";
import * as actionMailDispatcher from "../convex/actions/mailDispatcher";
import * as actionAgentMail from "../convex/actions/agentMail";
import * as emailsModule from "../convex/emails";
import * as libAgentMail from "../convex/lib/agentMail";
import * as libAgentMailWebhook from "../convex/lib/agentMailWebhook";
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
    process.env.AGENTMAIL_ADJUDICATOR_INBOX_ID = "in_adjudicator";
    process.env.AGENTMAIL_ADJUDICATOR_EMAIL = "adjudicator@claimhero.com";
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

  describe("convex/actions/mailDispatcher: Scheduled Auto-Pilot Rebuttal Worker", () => {
    it("skips dispatch if message is no longer pending", async () => {
      const mockCtx: any = {
        runQuery: vi.fn().mockImplementation(async (fn: any, args: any) => {
          if (args?.messageId && args?.threadId) {
            return {
              messageId: args.messageId,
              autoReplyStatus: "dispatched",
              autoReplyDraft: "Draft",
              hasSubsequentOutbound: false,
            };
          }
          if (args?.threadId) {
            return {
              thread: { _id: "th_1" },
              messages: [{ _id: "msg_1", autoReplyStatus: "dispatched" }],
            };
          }
          return null;
        }),
      };

      const res = await (actionMailDispatcher.dispatchScheduledAutoPilotReply as any)._handler(mockCtx, {
        messageId: "msg_1",
        claimId: "c_1",
        threadId: "th_1",
      });

      expect(res.executed).toBe(false);
      expect(res.reason).toContain("status_not_pending");
    });

    it("skips dispatch if autoPilotEnabled is false on the claim", async () => {
      const mockCtx: any = {
        runQuery: vi.fn().mockImplementation(async (fn: any, args: any) => {
          if (args?.messageId && args?.threadId) {
            return {
              messageId: args.messageId,
              autoReplyStatus: "pending",
              autoReplyDraft: "Draft",
              hasSubsequentOutbound: false,
            };
          }
          if (args?.threadId) {
            return {
              thread: { _id: "th_1" },
              messages: [{ _id: "msg_1", autoReplyStatus: "pending", receivedAt: 1000 }],
            };
          }
          if (args?.claimId) {
            return {
              _id: "c_1",
              claimNumber: "CLM-100",
              autoPilotEnabled: false,
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
      expect(res.reason).toBe("autopilot_disabled");
      expect(mockCtx.runMutation).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          messageId: "msg_1",
          autoReplyStatus: "disabled",
        })
      );
    });

    it("skips and marks dispatched if manual outbound reply was already sent after inbound message", async () => {
      const mockCtx: any = {
        runQuery: vi.fn().mockImplementation(async (fn: any, args: any) => {
          if (args?.messageId && args?.threadId) {
            return {
              messageId: args.messageId,
              autoReplyStatus: "pending",
              autoReplyDraft: "Draft",
              hasSubsequentOutbound: true,
            };
          }
          if (args?.threadId) {
            return {
              thread: { _id: "th_1" },
              messages: [
                { _id: "msg_1", direction: "inbound", autoReplyStatus: "pending", receivedAt: 1000 },
                { _id: "msg_2", direction: "outbound", receivedAt: 2000 }, // manual reply sent!
              ],
            };
          }
          if (args?.claimId) {
            return {
              _id: "c_1",
              claimNumber: "CLM-100",
              autoPilotEnabled: true,
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
      expect(res.reason).toBe("already_replied");
      expect(mockCtx.runMutation).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ messageId: "msg_1" })
      );
    });

    it("executes autonomous transmission and updates audit log when SLA window elapses unreviewed", async () => {
      process.env.AGENTMAIL_API_KEY = "test_key";
      process.env.AGENTMAIL_SENDER_INBOX_ID = "in_sender";
      process.env.AGENTMAIL_SENDER_EMAIL = "sender@claimhero.com";

      vi.spyOn(libAgentMail, "sendAgentMailMessage").mockResolvedValue({
        messageId: "out_sent_1",
        threadId: "th_live_1",
      });

      const mockClaim = {
        _id: "c_1",
        claimNumber: "CLM-100",
        autoPilotEnabled: true,
        status: "under_review",
        deniedAmount: 5000,
        patientName: "John Doe",
        payerContact: { officialAppealsEmail: "appeals@payer.com" },
      };

      const mockCtx: any = {
        runQuery: vi.fn().mockImplementation(async (fn: any, args: any) => {
          if (args?.messageId && args?.threadId) {
            return {
              messageId: args.messageId,
              autoReplyStatus: "pending",
              autoReplyDraft: "We formally maintain that CPT 29881 is medically necessary under ERISA.",
              hasSubsequentOutbound: false,
            };
          }
          if (args?.threadId) {
            return {
              thread: { _id: "th_1", payerEmail: "appeals@payer.com" },
              messages: [
                {
                  _id: "msg_1",
                  direction: "inbound",
                  autoReplyStatus: "pending",
                  autoReplyDraft: "We formally maintain that CPT 29881 is medically necessary under ERISA.",
                  receivedAt: 1000,
                },
              ],
            };
          }
          if (args?.claimId) {
            return mockClaim;
          }
          return null;
        }),
        runMutation: vi.fn().mockResolvedValue("mutation_ok"),
      };

      const res = await (actionMailDispatcher.dispatchScheduledAutoPilotReply as any)._handler(mockCtx, {
        messageId: "msg_1",
        claimId: "c_1",
        threadId: "th_1",
      });

      expect(res.executed).toBe(true);
      expect(res.claimNumber).toBe("CLM-100");
      expect(mockCtx.runMutation).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          eventType: "appeal_dispatched",
          actor: "Sentinel Auto-Pilot (1-Hour SLA)",
        })
      );
    });

    it("sweepPendingAutoPilotReplies sweeps unreviewed pending messages older than 1 hour", async () => {
      process.env.AGENTMAIL_API_KEY = "test_key";
      process.env.AGENTMAIL_SENDER_INBOX_ID = "in_sender";
      process.env.AGENTMAIL_SENDER_EMAIL = "sender@claimhero.com";

      vi.spyOn(libAgentMail, "sendAgentMailMessage").mockResolvedValue({
        messageId: "out_sent_sweep",
        threadId: "th_sweep",
      });

      const mockCtx: any = {
        runQuery: vi.fn().mockImplementation(async (fn: any, args: any) => {
          // getPendingAutoPilotMessagesInternal
          if (args?.maxReceivedAt) {
            return [
              {
                messageId: "msg_sweep_1",
                claimId: "claim_sweep_1",
                threadId: "thread_sweep_1",
                autoReplyDraft: "Rebuttal draft 1",
                receivedAt: 500,
              },
            ];
          }
          if (args?.messageId && args?.threadId) {
            return {
              messageId: args.messageId,
              autoReplyStatus: "pending",
              autoReplyDraft: "Rebuttal draft 1",
              hasSubsequentOutbound: false,
            };
          }
          if (args?.threadId === "thread_sweep_1") {
            return {
              thread: { _id: "thread_sweep_1", payerEmail: "appeals@payer.com" },
              messages: [
                {
                  _id: "msg_sweep_1",
                  direction: "inbound",
                  autoReplyStatus: "pending",
                  autoReplyDraft: "Rebuttal draft 1",
                  receivedAt: 500,
                },
              ],
            };
          }
          if (args?.claimId === "claim_sweep_1") {
            return {
              _id: "claim_sweep_1",
              claimNumber: "CLM-SWEEP",
              autoPilotEnabled: true,
              status: "under_review",
              deniedAmount: 4200,
              payerContact: { officialAppealsEmail: "appeals@payer.com" },
            };
          }
          return null;
        }),
        runMutation: vi.fn().mockResolvedValue("mut_ok"),
      };

      const sweepRes = await (actionMailDispatcher.sweepPendingAutoPilotReplies as any)._handler(mockCtx, {});

      expect(sweepRes.totalFound).toBe(1);
      expect(sweepRes.dispatchedCount).toBe(1);
      expect(sweepRes.skippedCount).toBe(0);
    });
  });

  describe("convex/actions/agentMail: Inbound 1-Hour SLA Scheduling", () => {
    it("schedules 1-hour SLA auto-pilot dispatch for DENIAL_UPHELD determination", async () => {
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

      const mockScheduler = {
        runAfter: vi.fn().mockResolvedValue("sched_ok"),
      };

      const mockCtx: any = {
        scheduler: mockScheduler,
        runQuery: vi.fn().mockResolvedValue({
          _id: "claim_denial",
          claimNumber: "CLM-200",
          autoPilotEnabled: true,
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
      // Verify that 1 hour (3,600,000 ms) SLA dispatch was scheduled
      expect(mockScheduler.runAfter).toHaveBeenCalledWith(
        3600000,
        expect.anything(),
        expect.objectContaining({
          claimId: "claim_denial",
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

      const mockScheduler = {
        runAfter: vi.fn(),
      };

      const mockCtx: any = {
        scheduler: mockScheduler,
        runQuery: vi.fn().mockResolvedValue({
          _id: "claim_won",
          claimNumber: "CLM-WON",
          autoPilotEnabled: true,
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
