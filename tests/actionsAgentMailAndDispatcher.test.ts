/// <reference path="./auth-mock.d.ts" />
import { describe, it, expect, vi, beforeEach } from "vitest";
import * as actionAgentMail from "../convex/actions/agentMail";
import * as actionMailDispatcher from "../convex/actions/mailDispatcher";
import * as libAgentMail from "../convex/lib/agentMail";
import * as libAgentMailWebhook from "../convex/lib/agentMailWebhook";
import * as libOpenAI from "../convex/lib/openai";
import { rateLimiter } from "../convex/lib/rateLimiter";
// @ts-ignore getAuthUserId is injected by vi.mock("@convex-dev/auth/server")
import { getAuthUserId } from "@convex-dev/auth/server";

vi.mock("@convex-dev/auth/server", () => ({
  getAuthUserId: vi.fn(),
}));

describe("Convex Actions: AgentMail & Mail Dispatcher", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    vi.clearAllMocks();
    vi.mocked(getAuthUserId).mockResolvedValue("user_123" as any);
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

    it("processInboundClaimReply: notifies registered user account and ignores fake appealContext sender email", async () => {
      process.env.AGENTMAIL_API_KEY = "test_key";
      process.env.AGENTMAIL_SENDER_INBOX_ID = "in_send";
      process.env.AGENTMAIL_SENDER_EMAIL = "send@claimhero.com";
      process.env.AGENTMAIL_ADJUDICATOR_INBOX_ID = "in_adj";
      process.env.AGENTMAIL_ADJUDICATOR_EMAIL = "adj@payer.com";

      vi.spyOn(libAgentMail, "getAgentMailMessage").mockResolvedValue({
        message_id: "msg_user_notify_1",
        inbox_id: "in_send",
        from: "payer_adjudicator@aetna.com",
        recipients: ["send@claimhero.com"],
        to: ["send@claimhero.com"],
        subject: "Re: [ClaimHero #CLM-ALERT-1] Denial Maintained",
        text: "The denial is upheld.",
        attachments: [],
      } as any);

      vi.spyOn(libAgentMailWebhook, "normalizeAgentMailWebhook").mockReturnValue({
        eventType: "message.received",
        eventId: "evt_notify_1",
        messageId: "msg_user_notify_1",
        inboxId: "in_send",
        from: "payer_adjudicator@aetna.com",
        recipients: ["send@claimhero.com"],
        subject: "Re: [ClaimHero #CLM-ALERT-1] Denial Maintained",
        text: "The denial is upheld.",
        attachments: [],
      });

      const sendMailSpy = vi.spyOn(libAgentMail, "sendAgentMailMessage").mockResolvedValue({
        messageId: "msg_alert_sent_1",
      } as any);

      const mockCtx: any = {
        runQuery: vi.fn().mockImplementation((fn, args) => {
          if (args?.claimNumber === "CLM-ALERT-1") {
            return Promise.resolve({
              _id: "claim_alert_1",
              claimNumber: "CLM-ALERT-1",
              userId: "user_real_99",
              insurancePayer: "Aetna",
              appealContext: {
                sender: {
                  name: "Alex Morgan",
                  email: "alex.morgan@spineinstitute.org", // dummy clinical preset email
                },
              },
            });
          }
          if (args?.userId === "user_real_99") {
            return Promise.resolve({
              _id: "user_real_99",
              email: "real_user@myclinic.com",
            });
          }
          return Promise.resolve(null);
        }),
        runMutation: vi.fn().mockResolvedValue("id_mut_1"),
      };

      const res = await (actionAgentMail.processInboundClaimReply as any)._handler(mockCtx, {
        eventId: "evt_notify_1",
        messageId: "msg_user_notify_1",
        inboxId: "in_send",
      });

      expect(res).toBeNull();
      expect(sendMailSpy).toHaveBeenCalledWith(expect.objectContaining({
        to: "real_user@myclinic.com",
        subject: expect.stringContaining("[ClaimHero Alert]"),
      }));
      expect(sendMailSpy).not.toHaveBeenCalledWith(expect.objectContaining({
        to: "alex.morgan@spineinstitute.org",
      }));
    });

    it("processInboundClaimReply: notifies registered user account even when user sent reply from their own email during testing", async () => {
      process.env.AGENTMAIL_API_KEY = "test_key";
      process.env.AGENTMAIL_SENDER_INBOX_ID = "in_send";
      process.env.AGENTMAIL_SENDER_EMAIL = "send@claimhero.com";
      process.env.AGENTMAIL_ADJUDICATOR_INBOX_ID = "in_adj";
      process.env.AGENTMAIL_ADJUDICATOR_EMAIL = "adj@payer.com";

      vi.spyOn(libAgentMail, "getAgentMailMessage").mockResolvedValue({
        message_id: "msg_user_self_test_1",
        inbox_id: "in_send",
        from: "zaikaman123@gmail.com",
        recipients: ["send@claimhero.com"],
        to: ["send@claimhero.com"],
        subject: "Re: [ClaimHero #CLM-6104-GEO-4092] Appeal request | GeoBlue",
        text: "I am not paying this claim.",
        attachments: [],
      } as any);

      vi.spyOn(libAgentMailWebhook, "normalizeAgentMailWebhook").mockReturnValue({
        eventType: "message.received",
        eventId: "evt_self_test_1",
        messageId: "msg_user_self_test_1",
        inboxId: "in_send",
        from: "zaikaman123@gmail.com",
        recipients: ["send@claimhero.com"],
        subject: "Re: [ClaimHero #CLM-6104-GEO-4092] Appeal request | GeoBlue",
        text: "I am not paying this claim.",
        attachments: [],
      });

      const sendMailSpy = vi.spyOn(libAgentMail, "sendAgentMailMessage").mockResolvedValue({
        messageId: "msg_alert_sent_user_1",
      } as any);

      const mockCtx: any = {
        runQuery: vi.fn().mockImplementation((fn, args) => {
          if (args?.claimNumber === "CLM-6104-GEO-4092") {
            return Promise.resolve({
              _id: "claim_self_test_1",
              claimNumber: "CLM-6104-GEO-4092",
              userId: "user_zaikaman",
              insurancePayer: "GeoBlue",
            });
          }
          if (args?.userId === "user_zaikaman") {
            return Promise.resolve({
              _id: "user_zaikaman",
              email: "zaikaman123@gmail.com",
            });
          }
          return Promise.resolve(null);
        }),
        runMutation: vi.fn().mockResolvedValue("id_mut_self"),
      };

      const res = await (actionAgentMail.processInboundClaimReply as any)._handler(mockCtx, {
        eventId: "evt_self_test_1",
        messageId: "msg_user_self_test_1",
        inboxId: "in_send",
      });

      expect(res).toBeNull();
      expect(sendMailSpy).toHaveBeenCalledWith(expect.objectContaining({
        to: "zaikaman123@gmail.com",
        subject: expect.stringContaining("[ClaimHero Alert]"),
      }));
    });

    it("processInboundClaimReply: resolves claim via in_reply_to referencing earlier outbound message", async () => {
      process.env.AGENTMAIL_API_KEY = "test_key";
      process.env.AGENTMAIL_SENDER_INBOX_ID = "in_send";
      process.env.AGENTMAIL_SENDER_EMAIL = "send@claimhero.com";
      process.env.AGENTMAIL_ADJUDICATOR_INBOX_ID = "in_adj";
      process.env.AGENTMAIL_ADJUDICATOR_EMAIL = "adj@payer.com";

      vi.spyOn(libAgentMail, "getAgentMailMessage").mockResolvedValue({
        message_id: "msg_reply_header_1",
        inbox_id: "in_send",
        from: "payer@insurance.com",
        recipients: ["send@claimhero.com"],
        to: ["send@claimhero.com"],
        subject: "Re: Your appeal", // No claim number in subject
        text: "Please provide clinical notes.",
        in_reply_to: "<010001a0-prior-ses-msg-id@email.amazonses.com>",
        attachments: [],
      } as any);

      vi.spyOn(libAgentMailWebhook, "normalizeAgentMailWebhook").mockReturnValue({
        eventType: "message.received",
        eventId: "evt_reply_header_1",
        messageId: "msg_reply_header_1",
        inboxId: "in_send",
        from: "payer@insurance.com",
        recipients: ["send@claimhero.com"],
        subject: "Re: Your appeal",
        text: "Please provide clinical notes.",
        attachments: [],
      });

      const sendMailSpy = vi.spyOn(libAgentMail, "sendAgentMailMessage").mockResolvedValue({
        messageId: "msg_alert_reply_to",
      } as any);

      const mockCtx: any = {
        runQuery: vi.fn().mockImplementation((fn, args) => {
          if (args?.agentMailMessageId === "<010001a0-prior-ses-msg-id@email.amazonses.com>") {
            return Promise.resolve({
              _id: "claim_from_in_reply_to",
              claimNumber: "CLM-IN-REPLY-1",
              userId: "user_in_reply",
              insurancePayer: "Aetna",
            });
          }
          if (args?.userId === "user_in_reply") {
            return Promise.resolve({
              _id: "user_in_reply",
              email: "doctor@hospital.org",
            });
          }
          return Promise.resolve(null);
        }),
        runMutation: vi.fn().mockResolvedValue("id_mut_reply_to"),
      };

      const res = await (actionAgentMail.processInboundClaimReply as any)._handler(mockCtx, {
        eventId: "evt_reply_header_1",
        messageId: "msg_reply_header_1",
        inboxId: "in_send",
      });

      expect(res).toBeNull();
      expect(sendMailSpy).toHaveBeenCalledWith(expect.objectContaining({
        to: "doctor@hospital.org",
        subject: expect.stringContaining("[ClaimHero Alert]"),
      }));
    });

    it("processInboundClaimReply: suppresses bounce / delivery status notifications without emailing user or updating claim status", async () => {
      const sendMailSpy = vi.spyOn(libAgentMail, "sendAgentMailMessage").mockResolvedValue({
        messageId: "msg_sent_out",
        threadId: "thread_sent_out",
      });

      vi.spyOn(libAgentMail, "getAgentMailMessage").mockResolvedValue({
        message_id: "msg_bounce_1",
        inbox_id: "in_send",
        from: "mailer-daemon@amazonses.com",
        to: ["send@claimhero.com"],
        subject: "Delivery Status Notification (Failure)",
        text: "An error occurred while trying to deliver mail: 550 5.1.1 Email address not found. Reference #CLM-BOUNCE-99",
        attachments: [],
      } as any);

      vi.spyOn(libAgentMailWebhook, "normalizeAgentMailWebhook").mockReturnValue({
        eventType: "message.received",
        eventId: "evt_bounce_1",
        messageId: "msg_bounce_1",
        inboxId: "in_send",
        from: "mailer-daemon@amazonses.com",
        recipients: ["send@claimhero.com"],
        subject: "Delivery Status Notification (Failure)",
        text: "An error occurred while trying to deliver mail: 550 5.1.1 Email address not found. Reference #CLM-BOUNCE-99",
        attachments: [],
      });

      const mockCtx: any = {
        runQuery: vi.fn().mockImplementation((fn: any, args: any) => {
          if (args?.claimNumber === "CLM-BOUNCE-99") {
            return Promise.resolve({
              _id: "claim_bounce_99",
              claimNumber: "CLM-BOUNCE-99",
              userId: "user_real_99",
            });
          }
          if (args?.userId === "user_real_99") {
            return Promise.resolve({
              _id: "user_real_99",
              email: "real_user@myclinic.com",
            });
          }
          return Promise.resolve(null);
        }),
        runMutation: vi.fn().mockResolvedValue("id_mut_bounce"),
      };

      const res = await (actionAgentMail.processInboundClaimReply as any)._handler(mockCtx, {
        eventId: "evt_bounce_1",
        messageId: "msg_bounce_1",
        inboxId: "in_send",
      });

      expect(res).toBeNull();
      // Must NOT send any alert email to user
      expect(sendMailSpy).not.toHaveBeenCalled();
      // Must record as DELIVERY_FAILURE and autoReplyStatus skipped
      expect(mockCtx.runMutation).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          detectedDetermination: "DELIVERY_FAILURE",
          autoReplyStatus: "skipped",
        })
      );
      // Must NOT update claim status to won or under_review
      expect(mockCtx.runMutation).not.toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          status: "won",
        })
      );
    });

    it("processInboundClaimReply: drops loopback alert emails and self-sent messages without re-alerting", async () => {
      process.env.AGENTMAIL_API_KEY = "test_key";
      process.env.AGENTMAIL_SENDER_INBOX_ID = "in_send";
      process.env.AGENTMAIL_SENDER_EMAIL = "send@claimhero.com";
      process.env.AGENTMAIL_ADJUDICATOR_INBOX_ID = "in_adj";
      process.env.AGENTMAIL_ADJUDICATOR_EMAIL = "adj@payer.com";

      const sendMailSpy = vi.spyOn(libAgentMail, "sendAgentMailMessage").mockResolvedValue({
        messageId: "msg_sent_out",
        threadId: "thread_sent_out",
      });

      vi.spyOn(libAgentMail, "getAgentMailMessage").mockResolvedValue({
        message_id: "msg_loopback_1",
        inbox_id: "in_send",
        from: "send@claimhero.com",
        to: ["user@myclinic.com"],
        subject: "[ClaimHero Alert] Payer Response: Claim #CLM-LOOP-1 (Payer Upheld Initial Denial)",
        text: "Summary of response",
        attachments: [],
      } as any);

      vi.spyOn(libAgentMailWebhook, "normalizeAgentMailWebhook").mockReturnValue({
        eventType: "message.received",
        eventId: "evt_loopback_1",
        messageId: "msg_loopback_1",
        inboxId: "in_send",
        from: "send@claimhero.com",
        recipients: ["user@myclinic.com"],
        subject: "[ClaimHero Alert] Payer Response: Claim #CLM-LOOP-1 (Payer Upheld Initial Denial)",
        text: "Summary of response",
        attachments: [],
      });

      const mockCtx: any = {
        runQuery: vi.fn().mockImplementation((fn: any, args: any) => {
          if (args?.claimNumber === "CLM-LOOP-1") {
            return Promise.resolve({
              _id: "claim_loop_1",
              claimNumber: "CLM-LOOP-1",
              userId: "user_real_99",
            });
          }
          return Promise.resolve(null);
        }),
        runMutation: vi.fn().mockResolvedValue("id_mut_loop"),
      };

      const res = await (actionAgentMail.processInboundClaimReply as any)._handler(mockCtx, {
        eventId: "evt_loopback_1",
        messageId: "msg_loopback_1",
        inboxId: "in_send",
      });

      expect(res).toBeNull();
      // Must NOT dispatch another alert email for loopback messages
      expect(sendMailSpy).not.toHaveBeenCalled();
      // Must NOT insert message or update claim status
      expect(mockCtx.runMutation).not.toHaveBeenCalled();
    });

    it("performInboxSync: batch checks candidate IDs and skips already recorded messages", async () => {
      process.env.AGENTMAIL_API_KEY = "test_key";
      process.env.AGENTMAIL_SENDER_INBOX_ID = "in_send";
      process.env.AGENTMAIL_SENDER_EMAIL = "send@claimhero.com";
      process.env.AGENTMAIL_ADJUDICATOR_INBOX_ID = "in_adj";
      process.env.AGENTMAIL_ADJUDICATOR_EMAIL = "adj@payer.com";

      vi.spyOn(libAgentMail, "listAgentMailMessages").mockResolvedValue([
        { id: "msg_existing_1", from: "payer@bcbs.com", to: ["send@claimhero.com"] },
        { id: "msg_new_2", from: "payer@bcbs.com", to: ["send@claimhero.com"] },
      ] as any);

      vi.spyOn(libAgentMail, "getAgentMailMessage").mockResolvedValue({
        message_id: "msg_new_2",
        inbox_id: "in_send",
        from: "payer@bcbs.com",
        to: ["send@claimhero.com"],
        subject: "Claim #CLM-100 Approved",
        text: "Approved",
        attachments: [],
      } as any);

      vi.spyOn(libAgentMailWebhook, "normalizeAgentMailWebhook").mockReturnValue({
        eventType: "message.received",
        eventId: "evt_2",
        messageId: "msg_new_2",
        inboxId: "in_send",
        from: "payer@bcbs.com",
        recipients: ["send@claimhero.com"],
        subject: "Claim #CLM-100 Approved",
        text: "Approved",
        attachments: [],
      });

      const mockCtx: any = {
        runQuery: vi.fn().mockImplementation((fn: any, args: any) => {
          if (args?.agentMailMessageIds) {
            // Batch query returns msg_existing_1 as already existing
            return Promise.resolve(["msg_existing_1"]);
          }
          if (args?.claimNumber === "CLM-100") {
            return Promise.resolve({ _id: "c_1", claimNumber: "CLM-100" });
          }
          return Promise.resolve(null);
        }),
        runMutation: vi.fn().mockResolvedValue("id_mut"),
      };

      const result = await (actionAgentMail.syncInboxes as any)._handler(mockCtx, { limit: 10 });
      expect(result.success).toBe(true);
      // Only 1 batch query for agentMailMessageIds should be executed across inboxes
      expect(mockCtx.runQuery).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          agentMailMessageIds: expect.arrayContaining(["msg_existing_1", "msg_new_2"]),
        })
      );
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
        userId: "user_123",
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

    it("generateAutoReplyDraft: deduplicates and returns existing draft without re-synthesizing", async () => {
      const mockClaim = {
        _id: "c1",
        claimNumber: "CLM-100",
        userId: "user_123",
        status: "under_review",
        deniedAmount: 5000,
        patientName: "John Doe",
        insurancePayer: "Aetna",
      };
      const mockExistingMessage = {
        _id: "m1",
        autoReplyDraft: "Existing cached clinical addendum draft text",
      };

      const chatSpy = vi.spyOn(libOpenAI, "createChatCompletion").mockResolvedValue("Newly synthesized draft");

      const mockCtx: any = {
        runQuery: vi.fn().mockImplementation((fn, args) => {
          if (args.claimId) return Promise.resolve(mockClaim);
          if (args.messageId) return Promise.resolve(mockExistingMessage);
          return Promise.resolve(null);
        }),
        runMutation: vi.fn().mockResolvedValue(null),
      };

      const res = await (actionMailDispatcher.generateAutoReplyDraft as any)._handler(mockCtx, {
        claimId: "c1",
        inboundMessageId: "m1",
      });

      expect(res.success).toBe(true);
      expect(res.draftText).toBe("Existing cached clinical addendum draft text");
      // Must NOT invoke createChatCompletion when existing draft is present
      expect(chatSpy).not.toHaveBeenCalled();
      chatSpy.mockRestore();
    });

    it("generateAutoReplyDraft: synthesizes new draft when forceRegenerate is true", async () => {
      const mockClaim = {
        _id: "c1",
        claimNumber: "CLM-100",
        userId: "user_123",
        status: "under_review",
        deniedAmount: 5000,
        patientName: "John Doe",
        insurancePayer: "Aetna",
      };
      const mockExistingMessage = {
        _id: "m1",
        autoReplyDraft: "Old draft text",
      };

      const chatSpy = vi.spyOn(libOpenAI, "createChatCompletion").mockResolvedValue("Newly regenerated draft text");

        let queryCount = 0;
        const mockCtx: any = {
          runQuery: vi.fn().mockImplementation((fn, args) => {
            if (args.messageId) return Promise.resolve(mockExistingMessage);
            queryCount++;
            if (queryCount === 1) return Promise.resolve(mockClaim);
            if (queryCount === 2) return Promise.resolve(null);
            return Promise.resolve([]);
          }),
          runMutation: vi.fn().mockResolvedValue(null),
        };

      const res = await (actionMailDispatcher.generateAutoReplyDraft as any)._handler(mockCtx, {
        claimId: "c1",
        inboundMessageId: "m1",
        forceRegenerate: true,
      });

      expect(res.success).toBe(true);
      expect(res.draftText).toBe("Newly regenerated draft text");
      expect(chatSpy).toHaveBeenCalled();
      chatSpy.mockRestore();
    });
  });
});
