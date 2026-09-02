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

    it("processInboundIntake: processes incoming intake email and runs optical extraction", async () => {
      process.env.AGENTMAIL_INTAKE_INBOX_ID = "inbox_intake";
      process.env.AGENTMAIL_INTAKE_EMAIL = "intake@claimhero.com";

      vi.spyOn(libAgentMail, "getAgentMailMessage").mockResolvedValue({
        message_id: "msg_intake_1",
        inbox_id: "inbox_intake",
        from: "patient@example.com",
        recipients: ["intake@claimhero.com"],
        to: ["intake@claimhero.com"],
        subject: "Medical Claim Denial",
        text: "Denial text content",
        attachments: [
          {
            attachment_id: "att_1",
            filename: "denial.pdf",
            content_type: "application/pdf",
            size: 1024,
          },
        ],
      } as any);

      vi.spyOn(libAgentMailWebhook, "normalizeAgentMailWebhook").mockReturnValue({
        eventType: "message.received",
        eventId: "evt_1",
        messageId: "msg_intake_1",
        inboxId: "inbox_intake",
        from: "patient@example.com",
        recipients: ["intake@claimhero.com"],
        subject: "Medical Claim Denial",
        text: "Denial text content",
        attachments: [
          {
            attachmentId: "att_1",
            filename: "denial.pdf",
            contentType: "application/pdf",
            size: 1024,
          },
        ],
      });

      vi.spyOn(libAgentMail, "downloadAgentMailAttachment").mockResolvedValue({
        bytes: new ArrayBuffer(8),
        contentType: "application/pdf",
      });

      const mockCtx: any = {
        runMutation: vi.fn().mockImplementation((fn, args) => {
          return Promise.resolve("thread_1");
        }),
        storage: { store: vi.fn().mockResolvedValue("storage_doc_1") },
        runAction: vi.fn().mockResolvedValue({ claimId: "claim_new_1" }),
      };

      const res = await (actionAgentMail.processInboundIntake as any)._handler(mockCtx, {
        eventId: "evt_1",
        messageId: "msg_intake_1",
        inboxId: "inbox_intake",
      });

      expect(res).toBeNull();
      expect(mockCtx.runAction).toHaveBeenCalled();
    });

    it("processInboundClaimReply: processes approval and updates claim to won", async () => {
      process.env.AGENTMAIL_INTAKE_INBOX_ID = "inbox_intake";
      process.env.AGENTMAIL_INTAKE_EMAIL = "intake@claimhero.com";

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
    });
  });
});
