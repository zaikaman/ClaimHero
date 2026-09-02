import { describe, it, expect, vi, beforeEach } from "vitest";
import * as actionAgentMail from "../convex/actions/agentMail";
import * as actionMailDispatcher from "../convex/actions/mailDispatcher";
import * as libAgentMail from "../convex/lib/agentMail";
import * as libAgentMailWebhook from "../convex/lib/agentMailWebhook";
import * as libOpenAI from "../convex/lib/openai";
import { rateLimiter } from "../convex/lib/rateLimiter";

describe("Convex Actions: AgentMail & Mail Dispatcher", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    vi.clearAllMocks();
  });

  describe("convex/actions/agentMail", () => {
    it("provisionClaimInboxes: returns null if claim not found", async () => {
      const mockCtx: any = {
        runQuery: vi.fn().mockResolvedValue(null),
      };
      const res = await (actionAgentMail.provisionClaimInboxes as any)._handler(mockCtx, { claimId: "c1" });
      expect(res).toBeNull();
    });

    it("provisionClaimInboxes: sets not_configured if AGENTMAIL_API_KEY missing", async () => {
      delete process.env.AGENTMAIL_API_KEY;
      const mockCtx: any = {
        runQuery: vi.fn().mockResolvedValue({ _id: "c1" }),
        runMutation: vi.fn().mockResolvedValue(undefined),
      };
      const res = await (actionAgentMail.provisionClaimInboxes as any)._handler(mockCtx, { claimId: "c1" });
      expect(res).toBeNull();
      expect(mockCtx.runMutation).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ status: "not_configured" }));
    });

    it("provisionClaimInboxes: binds shared mailboxes successfully", async () => {
      process.env.AGENTMAIL_API_KEY = "test_key";
      process.env.AGENTMAIL_SENDER_INBOX_ID = "in_send";
      process.env.AGENTMAIL_SENDER_EMAIL = "send@claimhero.com";
      process.env.AGENTMAIL_ADJUDICATOR_INBOX_ID = "in_adj";
      process.env.AGENTMAIL_ADJUDICATOR_EMAIL = "adj@payer.com";

      const mockCtx: any = {
        runQuery: vi.fn().mockResolvedValue({ _id: "c1" }),
        runMutation: vi.fn().mockResolvedValue(undefined),
      };
      const res = await (actionAgentMail.provisionClaimInboxes as any)._handler(mockCtx, { claimId: "c1" });
      expect(res).toBeNull();
      expect(mockCtx.runMutation).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
        status: "shared",
        claimInboxId: "in_send",
      }));
    });

    it("processInboundClaimReply: processes approval and updates claim to won", async () => {
      vi.spyOn(libAgentMail, "getAgentMailMessage").mockResolvedValue({
        message_id: "msg_reply_1",
        inbox_id: "inbox_case_1",
        from: "reviewer@aetna.com",
        recipients: ["appeal-100@claimhero.com"],
        to: ["appeal-100@claimhero.com"],
        subject: "RE: Claim CLM-100 Overturned and Approved",
        text: "The adverse determination has been overturned and approved for reimbursement.",
        attachments: [],
      } as any);

      vi.spyOn(libAgentMailWebhook, "normalizeAgentMailWebhook").mockReturnValue({
        eventType: "message.received",
        eventId: "evt_reply_1",
        messageId: "msg_reply_1",
        inboxId: "inbox_case_1",
        from: "reviewer@aetna.com",
        recipients: ["appeal-100@claimhero.com"],
        subject: "RE: Claim CLM-100 Overturned and Approved",
        text: "The adverse determination has been overturned and approved for reimbursement.",
        attachments: [],
      });

      const mockCtx: any = {
        runQuery: vi.fn().mockResolvedValue({ _id: "claim_1", claimNumber: "CLM-100" }),
        runMutation: vi.fn().mockResolvedValue("id_1"),
      };

      const res = await (actionAgentMail.processInboundClaimReply as any)._handler(mockCtx, {
        eventId: "evt_reply_1",
        messageId: "msg_reply_1",
        inboxId: "inbox_case_1",
      });

      expect(res).toBeNull();
      expect(mockCtx.runMutation).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
        status: "won",
      }));
    });

    it("processInboundClaimReply: routes correctly via threadId match when claimNumber is missing from subject", async () => {
      vi.spyOn(libAgentMail, "getAgentMailMessage").mockResolvedValue({
        message_id: "msg_reply_2",
        thread_id: "thread_agentmail_99",
        inbox_id: "inbox_case_1",
        from: "payer_appeals@united.com",
        recipients: ["claims-desk@claimhero.com"],
        to: ["claims-desk@claimhero.com"],
        subject: "General Inquiry regarding medical documents",
        text: "Please find attached our update.",
        attachments: [],
      } as any);

      vi.spyOn(libAgentMailWebhook, "normalizeAgentMailWebhook").mockReturnValue({
        eventType: "message.received",
        eventId: "evt_reply_2",
        messageId: "msg_reply_2",
        threadId: "thread_agentmail_99",
        inboxId: "inbox_case_1",
        from: "payer_appeals@united.com",
        recipients: ["claims-desk@claimhero.com"],
        subject: "General Inquiry regarding medical documents",
        text: "Please find attached our update.",
        attachments: [],
      });

      const mockCtx: any = {
        runQuery: vi.fn().mockResolvedValue({ _id: "claim_thread_match", claimNumber: "CLM-THREAD-001" }),
        runMutation: vi.fn().mockResolvedValue("id_2"),
        runAction: vi.fn().mockResolvedValue(undefined),
      };

      const res = await (actionAgentMail.processInboundClaimReply as any)._handler(mockCtx, {
        eventId: "evt_reply_2",
        messageId: "msg_reply_2",
        inboxId: "inbox_case_1",
      });

      expect(res).toBeNull();
      expect(mockCtx.runQuery).toHaveBeenCalledWith(expect.anything(), { threadId: "thread_agentmail_99" });
      expect(mockCtx.runMutation).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
        claimId: "claim_thread_match",
        status: "dispatched",
      }));
    });

    it("processInboundClaimReply: routes correctly via recipient exact match fallback when claimNumber is missing and threadId unmatched", async () => {
      vi.spyOn(libAgentMail, "getAgentMailMessage").mockResolvedValue({
        message_id: "msg_reply_3",
        inbox_id: "inbox_case_1",
        from: "payer_appeals@united.com",
        recipients: ["special-assigned-case@claimhero.com"],
        to: ["special-assigned-case@claimhero.com"],
        subject: "Medical Record Follow-up with no claim id",
        text: "We received the documents.",
        attachments: [],
      } as any);

      vi.spyOn(libAgentMailWebhook, "normalizeAgentMailWebhook").mockReturnValue({
        eventType: "message.received",
        eventId: "evt_reply_3",
        messageId: "msg_reply_3",
        inboxId: "inbox_case_1",
        from: "payer_appeals@united.com",
        recipients: ["special-assigned-case@claimhero.com"],
        subject: "Medical Record Follow-up with no claim id",
        text: "We received the documents.",
        attachments: [],
      });

      const mockCtx: any = {
        runQuery: vi.fn().mockImplementation((fn, args) => {
          if (args.email === "special-assigned-case@claimhero.com") {
            return Promise.resolve({ _id: "claim_recipient_match", claimNumber: "CH-77766" });
          }
          return Promise.resolve(null);
        }),
        runMutation: vi.fn().mockResolvedValue("id_3"),
      };

      const res = await (actionAgentMail.processInboundClaimReply as any)._handler(mockCtx, {
        eventId: "evt_reply_3",
        messageId: "msg_reply_3",
        inboxId: "inbox_case_1",
      });

      expect(res).toBeNull();
      expect(mockCtx.runQuery).toHaveBeenCalledWith(expect.anything(), { email: "special-assigned-case@claimhero.com" });
      expect(mockCtx.runMutation).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
        claimId: "claim_recipient_match",
        status: "dispatched",
      }));
    });
  });

  describe("convex/actions/mailDispatcher", () => {
    it("dispatchAppealPacket: transmits appeal packet in ai_adjudicator mode", async () => {
      process.env.AGENTMAIL_API_KEY = "test_key";
      process.env.AGENTMAIL_SENDER_INBOX_ID = "in_send";
      process.env.AGENTMAIL_SENDER_EMAIL = "send@claimhero.com";
      process.env.AGENTMAIL_ADJUDICATOR_INBOX_ID = "in_adj";
      process.env.AGENTMAIL_ADJUDICATOR_EMAIL = "adj@payer.com";

      const mockClaim = {
        _id: "c1",
        claimNumber: "CLM-100",
        userId: "user_123",
        deniedAmount: 18450,
        patient: { name: "Marcus Holloway", insurancePayer: "UnitedHealthcare" },
      };
      const mockAppeal = {
        _id: "a1",
        claimId: "c1",
        version: 1,
        fullAppealMarkdown: "# Appeal Brief",
        medicalNecessityArguments: "Medical necessity argument",
      };

      vi.spyOn(libOpenAI, "createStructuredCompletion").mockResolvedValue({
        determination: "OVERTURNED_APPROVED",
        determinationSummary: "Approved under Section 3.B",
        clinicalRationale: "MRI confirms stenosis",
        formalDeterminationLetter: "We have overturned this claim.",
        authorizedSettlementAmount: 18450,
        reviewerName: "Dr. Arthur Vance, MD",
        reviewerTitle: "Senior Medical Director",
      } as any);

      vi.spyOn(libAgentMail, "sendAgentMailMessage").mockResolvedValue({
        messageId: "live_msg_1",
      } as any);

      vi.spyOn(rateLimiter, "limit").mockResolvedValue({ ok: true } as any);

      let queryCalls = 0;
      const mockCtx: any = {
        runQuery: vi.fn().mockImplementation((fn, args) => {
          queryCalls++;
          if (queryCalls === 1) return Promise.resolve(mockClaim);
          return Promise.resolve(mockAppeal);
        }),
        runMutation: vi.fn().mockResolvedValue("thread_1"),
      };

      const receipt = await (actionMailDispatcher.dispatchAppealPacket as any)._handler(mockCtx, {
        claimId: "c1",
        dispatchMode: "ai_adjudicator",
      });

      expect(receipt.status).toBe("delivered");
      expect(receipt.adjudicationDetermination).toBe("OVERTURNED_APPROVED");
      expect(receipt.subject).toContain("[ClaimHero #CLM-100]");
      expect(libAgentMail.sendAgentMailMessage).toHaveBeenCalledWith(expect.objectContaining({
        subject: expect.stringContaining("[ClaimHero #CLM-100]"),
        text: expect.stringContaining("[ClaimHero #CLM-100]"),
      }));
      expect(mockCtx.runMutation).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
        claimId: "c1",
        agentMailThreadId: "live_msg_1",
      }));
      expect(mockCtx.runMutation).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ status: "won" }));
    });

    it("sendOutboundMessage: delivers AI follow-up adjudication", async () => {
      process.env.AGENTMAIL_API_KEY = "test_key";
      process.env.AGENTMAIL_SENDER_INBOX_ID = "in_send";
      process.env.AGENTMAIL_SENDER_EMAIL = "send@claimhero.com";
      process.env.AGENTMAIL_ADJUDICATOR_INBOX_ID = "in_adj";
      process.env.AGENTMAIL_ADJUDICATOR_EMAIL = "adj@payer.com";

      const mockClaim = {
        _id: "c1",
        claimNumber: "CLM-100",
        deniedAmount: 5000,
        patient: { name: "John Doe", insurancePayer: "Aetna" },
      };
      const mockThread = {
        thread: { _id: "t1" },
        messages: [{ sender: "Doctor", recipient: "Payer", subject: "Addendum", bodyText: "Here is EMG" }],
      };

      vi.spyOn(libOpenAI, "createStructuredCompletion").mockResolvedValue({
        determination: "OVERTURNED_APPROVED",
        determinationSummary: "Approved",
        clinicalRationale: "EMG provided",
        formalDeterminationLetter: "Approved following addendum.",
        authorizedSettlementAmount: 5000,
        reviewerName: "Dr. Vance",
        reviewerTitle: "Medical Director",
      } as any);

      vi.spyOn(libAgentMail, "sendAgentMailMessage").mockResolvedValue({
        messageId: "live_msg_2",
      } as any);

      let queryCalls = 0;
      const mockCtx: any = {
        runQuery: vi.fn().mockImplementation(() => {
          queryCalls++;
          if (queryCalls === 1) return Promise.resolve(mockClaim);
          return Promise.resolve(mockThread);
        }),
        runMutation: vi.fn().mockResolvedValue("t1"),
      };

      process.env.AGENTMAIL_ADJUDICATOR_EMAIL = "adjudicator@claimhero.agentmail.com";

      const res = await (actionMailDispatcher.sendOutboundMessage as any)._handler(mockCtx, {
        claimId: "c1",
        threadId: "t1",
        text: "Here is the EMG addendum",
        customRecipient: "adjudicator@claimhero.agentmail.com",
      });

      expect(res.success).toBe(true);
      expect(res.adjudicationDetermination).toBe("OVERTURNED_APPROVED");
      expect(libAgentMail.sendAgentMailMessage).toHaveBeenCalledWith(expect.objectContaining({
        subject: expect.stringContaining("[ClaimHero #CLM-100]"),
        text: expect.stringContaining("[ClaimHero #CLM-100]"),
      }));
      expect(mockCtx.runMutation).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
        claimId: "c1",
        agentMailThreadId: "live_msg_2",
      }));
    });
  });
});
