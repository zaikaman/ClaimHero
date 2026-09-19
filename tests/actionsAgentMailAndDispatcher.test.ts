/// <reference path="./auth-mock.d.ts" />
import { describe, it, expect, vi, beforeEach } from "vitest";
import { internal } from "../convex/_generated/api";
import * as actionAgentMail from "../convex/actions/agentMail";
import * as actionMailDispatcher from "../convex/actions/mailDispatcher";
import * as libAgentMail from "../convex/lib/agentMail";
import * as libAgentMailWebhook from "../convex/lib/agentMailWebhook";
import * as libOpenAI from "../convex/lib/openai";
import * as libPdfGenerator from "../convex/lib/pdfGenerator";
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
    vi.spyOn(libOpenAI, "createStructuredCompletion").mockRejectedValue(new Error("LLM Rate Limit"));
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

    it("processInboundClaimReply: processes approval and updates claim to won only when LLM confirms OVERTURNED_APPROVED", async () => {
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

      vi.spyOn(libOpenAI, "createStructuredCompletion").mockResolvedValue({
        determination: "OVERTURNED_APPROVED",
        clinicalRationale: "The adverse determination has been overturned and approved for reimbursement.",
        missingRecordsRequested: [],
        authorizedSettlementAmount: 1500,
        reviewerName: "Aetna Appellate Reviewer",
        shouldAutoReply: false,
        suggestedAutoReplyAddendum: "",
      } as any);

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
      // Verify initial message insertion used PENDING_LLM (not premature OVERTURNED_APPROVED)
      expect(mockCtx.runMutation).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          detectedDetermination: "PENDING_LLM",
        })
      );
      // Verify claim status transitions to won only after LLM confirmation
      expect(mockCtx.runMutation).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          status: "won",
        })
      );
    });

    it("processInboundClaimReply: keyword match on 'approved' sets PENDING_LLM and does NOT transition to won if LLM determines DENIAL_UPHELD", async () => {
      vi.spyOn(libAgentMail, "getAgentMailMessage").mockResolvedValue({
        message_id: "msg_reply_denial_with_keyword",
        inbox_id: "inbox_case_1",
        from: "reviewer@aetna.com",
        recipients: ["appeal-100@claimhero.com"],
        to: ["appeal-100@claimhero.com"],
        subject: "RE: Claim CLM-100 Review",
        text: "We reviewed your approved prior authorizations from last year, but the current service remains denied.",
        attachments: [],
      } as any);

      vi.spyOn(libAgentMailWebhook, "normalizeAgentMailWebhook").mockReturnValue({
        eventType: "message.received",
        eventId: "evt_reply_denial_with_keyword",
        messageId: "msg_reply_denial_with_keyword",
        inboxId: "inbox_case_1",
        from: "reviewer@aetna.com",
        recipients: ["appeal-100@claimhero.com"],
        subject: "RE: Claim CLM-100 Review",
        text: "We reviewed your approved prior authorizations from last year, but the current service remains denied.",
        attachments: [],
      });

      vi.spyOn(libOpenAI, "createStructuredCompletion").mockResolvedValue({
        determination: "DENIAL_UPHELD",
        clinicalRationale: "Current service remains not covered despite historical approved authorizations.",
        missingRecordsRequested: [],
        authorizedSettlementAmount: 0,
        reviewerName: "Aetna Reviewer",
        shouldAutoReply: true,
        suggestedAutoReplyAddendum: "Demand IRO review.",
      } as any);

      const mockCtx: any = {
        runQuery: vi.fn().mockResolvedValue({ _id: "claim_1", claimNumber: "CLM-100", status: "dispatched" }),
        runMutation: vi.fn().mockResolvedValue("id_1"),
      };

      await (actionAgentMail.processInboundClaimReply as any)._handler(mockCtx, {
        eventId: "evt_reply_denial_with_keyword",
        messageId: "msg_reply_denial_with_keyword",
        inboxId: "inbox_case_1",
      });

      // Assert that status: 'won' was NEVER set
      const mutationCalls = mockCtx.runMutation.mock.calls;
      const wonCalls = mutationCalls.filter((call: any[]) => call[1]?.status === "won");
      expect(wonCalls).toHaveLength(0);

      // Assert that claim transitioned to escalated per LLM DENIAL_UPHELD determination
      expect(mockCtx.runMutation).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          status: "escalated",
        })
      );
    });

    it("processInboundClaimReply: if LLM fails on 'approved' keyword match, claim does NOT transition to won", async () => {
      vi.spyOn(libAgentMail, "getAgentMailMessage").mockResolvedValue({
        message_id: "msg_reply_llm_fail",
        inbox_id: "inbox_case_1",
        from: "reviewer@aetna.com",
        recipients: ["appeal-100@claimhero.com"],
        to: ["appeal-100@claimhero.com"],
        subject: "RE: Claim CLM-100 Approved status update",
        text: "Your appeal referencing approved guidelines was received.",
        attachments: [],
      } as any);

      vi.spyOn(libAgentMailWebhook, "normalizeAgentMailWebhook").mockReturnValue({
        eventType: "message.received",
        eventId: "evt_reply_llm_fail",
        messageId: "msg_reply_llm_fail",
        inboxId: "inbox_case_1",
        from: "reviewer@aetna.com",
        recipients: ["appeal-100@claimhero.com"],
        subject: "RE: Claim CLM-100 Approved status update",
        text: "Your appeal referencing approved guidelines was received.",
        attachments: [],
      });

      vi.spyOn(libOpenAI, "createStructuredCompletion").mockRejectedValue(new Error("LLM Rate Limit"));

      const mockCtx: any = {
        runQuery: vi.fn().mockResolvedValue({ _id: "claim_1", claimNumber: "CLM-100", status: "dispatched" }),
        runMutation: vi.fn().mockResolvedValue("id_1"),
      };

      await (actionAgentMail.processInboundClaimReply as any)._handler(mockCtx, {
        eventId: "evt_reply_llm_fail",
        messageId: "msg_reply_llm_fail",
        inboxId: "inbox_case_1",
      });

      // Assert that status: 'won' was NEVER set
      const mutationCalls = mockCtx.runMutation.mock.calls;
      const wonCalls = mutationCalls.filter((call: any[]) => call[1]?.status === "won");
      expect(wonCalls).toHaveLength(0);
    });

    it("processInboundClaimReply: routine phrases 'approved provider list' and 'charge reversed' do NOT set PENDING_LLM or transition claim to under_review", async () => {
      vi.spyOn(libAgentMail, "getAgentMailMessage").mockResolvedValue({
        message_id: "msg_reply_provider_list",
        inbox_id: "inbox_case_1",
        from: "payer@aetna.com",
        recipients: ["appeal-100@claimhero.com"],
        to: ["appeal-100@claimhero.com"],
        subject: "RE: Claim CLM-100 In-Network Guidelines",
        text: "Please select an in-network provider from our approved provider list. Also note previous charge reversed per adjustment.",
        attachments: [],
      } as any);

      vi.spyOn(libAgentMailWebhook, "normalizeAgentMailWebhook").mockReturnValue({
        eventType: "message.received",
        eventId: "evt_reply_prov",
        messageId: "msg_reply_provider_list",
        inboxId: "inbox_case_1",
        from: "payer@aetna.com",
        recipients: ["appeal-100@claimhero.com"],
        subject: "RE: Claim CLM-100 In-Network Guidelines",
        text: "Please select an in-network provider from our approved provider list. Also note previous charge reversed per adjustment.",
        attachments: [],
      });

      const mockCtx: any = {
        runQuery: vi.fn().mockResolvedValue({ _id: "claim_prov", claimNumber: "CLM-100", status: "dispatched" }),
        runMutation: vi.fn().mockResolvedValue("id_prov"),
        runAction: vi.fn().mockResolvedValue(undefined),
      };

      await (actionAgentMail.processInboundClaimReply as any)._handler(mockCtx, {
        eventId: "evt_reply_prov",
        messageId: "msg_reply_provider_list",
        inboxId: "inbox_case_1",
      });

      console.log("MUTATION CALL ARGS:", mockCtx.runMutation.mock.calls.map((c: any[]) => c[1]));
      const allArgs = mockCtx.runMutation.mock.calls.map((c: any[]) => c[1]).filter(Boolean);
      expect(allArgs.some((arg: any) => arg.detectedDetermination === "GENERAL_INQUIRY")).toBe(true);
      expect(allArgs.some((arg: any) => arg.status === "under_review")).toBe(false);
    });

    it("processInboundClaimReply: EOB containing 'denied amount' does NOT set DENIAL_UPHELD or transition claim to escalated", async () => {
      vi.spyOn(libAgentMail, "getAgentMailMessage").mockResolvedValue({
        message_id: "msg_reply_eob",
        inbox_id: "inbox_case_1",
        from: "payer@aetna.com",
        recipients: ["appeal-100@claimhero.com"],
        to: ["appeal-100@claimhero.com"],
        subject: "RE: Claim CLM-100 Explanation of Benefits",
        text: "EOB Summary: Billed $5,000.00, Allowed $0.00, Denied Amount: $5,000.00.",
        attachments: [],
      } as any);

      vi.spyOn(libAgentMailWebhook, "normalizeAgentMailWebhook").mockReturnValue({
        eventType: "message.received",
        eventId: "evt_reply_eob",
        messageId: "msg_reply_eob",
        inboxId: "inbox_case_1",
        from: "payer@aetna.com",
        recipients: ["appeal-100@claimhero.com"],
        subject: "RE: Claim CLM-100 Explanation of Benefits",
        text: "EOB Summary: Billed $5,000.00, Allowed $0.00, Denied Amount: $5,000.00.",
        attachments: [],
      });

      const mockCtx: any = {
        runQuery: vi.fn().mockResolvedValue({ _id: "claim_eob", claimNumber: "CLM-100", status: "dispatched" }),
        runMutation: vi.fn().mockResolvedValue("id_eob"),
        runAction: vi.fn().mockResolvedValue(undefined),
      };

      await (actionAgentMail.processInboundClaimReply as any)._handler(mockCtx, {
        eventId: "evt_reply_eob",
        messageId: "msg_reply_eob",
        inboxId: "inbox_case_1",
      });

      // Initial fast insertion should be GENERAL_INQUIRY, NOT DENIAL_UPHELD
      const allArgs = mockCtx.runMutation.mock.calls.map((c: any[]) => c[1]).filter(Boolean);
      expect(allArgs.some((arg: any) => arg.detectedDetermination === "GENERAL_INQUIRY")).toBe(true);

      // Claim status should NOT transition to escalated
      expect(allArgs.some((arg: any) => arg.status === "escalated")).toBe(false);
    });

    it("processInboundClaimReply: extracts dollar-only settlement offers and assigns settlementProvenance 'payer_stated'", async () => {
      vi.spyOn(libAgentMail, "getAgentMailMessage").mockResolvedValue({
        message_id: "msg_reply_dollar_offer",
        inbox_id: "inbox_case_1",
        from: "payer@aetna.com",
        recipients: ["appeal-100@claimhero.com"],
        to: ["appeal-100@claimhero.com"],
        subject: "RE: Claim CLM-100 Settlement",
        text: "The health plan is willing to offer $3,500 to settle this claim dispute.",
        attachments: [],
      } as any);

      vi.spyOn(libAgentMailWebhook, "normalizeAgentMailWebhook").mockReturnValue({
        eventType: "message.received",
        eventId: "evt_reply_dollar",
        messageId: "msg_reply_dollar_offer",
        inboxId: "inbox_case_1",
        from: "payer@aetna.com",
        recipients: ["appeal-100@claimhero.com"],
        subject: "RE: Claim CLM-100 Settlement",
        text: "The health plan is willing to offer $3,500 to settle this claim dispute.",
        attachments: [],
      });

      vi.spyOn(libOpenAI, "createStructuredCompletion").mockResolvedValue({
        determination: "PARTIAL_SETTLEMENT_OFFER",
        clinicalRationale: "Payer offered $3,500 compromise.",
        missingRecordsRequested: [],
        authorizedSettlementAmount: 3500,
        settlementProvenance: "payer_stated",
        reviewerName: "Aetna Reviewer",
        shouldAutoReply: true,
        suggestedAutoReplyAddendum: "We decline the $3,500 settlement.",
      } as any);

      const mockCtx: any = {
        runQuery: vi.fn().mockResolvedValue({ _id: "claim_dollar", claimNumber: "CLM-100", deniedAmount: 8000, status: "dispatched" }),
        runMutation: vi.fn().mockResolvedValue("id_dollar"),
        runAction: vi.fn().mockResolvedValue(undefined),
      };

      await (actionAgentMail.processInboundClaimReply as any)._handler(mockCtx, {
        eventId: "evt_reply_dollar",
        messageId: "msg_reply_dollar_offer",
        inboxId: "inbox_case_1",
      });

      const allArgs = mockCtx.runMutation.mock.calls.map((c: any[]) => c[1]).filter(Boolean);
      const analysisArg = allArgs.find((a: any) => a.messageId === "id_dollar" && a.detectedDetermination === "PARTIAL_SETTLEMENT_OFFER");
      expect(analysisArg).toEqual(expect.objectContaining({
        detectedDetermination: "PARTIAL_SETTLEMENT_OFFER",
        settlementAmount: 3500,
        settlementProvenance: "payer_stated",
      }));

      // Check claim status details explicitly mention offered by payer
      const underReviewArgs = allArgs.filter((a: any) => a.status === "under_review");
      const finalUnderReview = underReviewArgs[underReviewArgs.length - 1];
      expect(finalUnderReview.details).toContain("$3,500 offered by payer");
    });

    it("processInboundClaimReply: unspecified partial offer assigns settlementProvenance 'estimated_benchmark' and does not claim payer offered amount", async () => {
      vi.spyOn(libAgentMail, "getAgentMailMessage").mockResolvedValue({
        message_id: "msg_reply_unspec_offer",
        inbox_id: "inbox_case_1",
        from: "payer@aetna.com",
        recipients: ["appeal-100@claimhero.com"],
        to: ["appeal-100@claimhero.com"],
        subject: "RE: Claim CLM-100 Settlement Consideration",
        text: "We are open to a partial settlement of this appeal. Please contact our resolution unit.",
        attachments: [],
      } as any);

      vi.spyOn(libAgentMailWebhook, "normalizeAgentMailWebhook").mockReturnValue({
        eventType: "message.received",
        eventId: "evt_reply_unspec",
        messageId: "msg_reply_unspec_offer",
        inboxId: "inbox_case_1",
        from: "payer@aetna.com",
        recipients: ["appeal-100@claimhero.com"],
        subject: "RE: Claim CLM-100 Settlement Consideration",
        text: "We are open to a partial settlement of this appeal. Please contact our resolution unit.",
        attachments: [],
      });

      vi.spyOn(libOpenAI, "createStructuredCompletion").mockResolvedValue({
        determination: "PARTIAL_SETTLEMENT_OFFER",
        clinicalRationale: "Payer opened settlement negotiation without stating a number.",
        missingRecordsRequested: [],
        authorizedSettlementAmount: 0,
        settlementProvenance: "unspecified",
        reviewerName: "Aetna Reviewer",
        shouldAutoReply: true,
        suggestedAutoReplyAddendum: "We decline an unspecified settlement.",
      } as any);

      const mockCtx: any = {
        runQuery: vi.fn().mockResolvedValue({ _id: "claim_unspec", claimNumber: "CLM-100", deniedAmount: 10000, status: "dispatched" }),
        runMutation: vi.fn().mockResolvedValue("id_unspec"),
        runAction: vi.fn().mockResolvedValue(undefined),
      };

      await (actionAgentMail.processInboundClaimReply as any)._handler(mockCtx, {
        eventId: "evt_reply_unspec",
        messageId: "msg_reply_unspec_offer",
        inboxId: "inbox_case_1",
      });

      const allArgs = mockCtx.runMutation.mock.calls.map((c: any[]) => c[1]).filter(Boolean);
      const analysisArg = allArgs.find((a: any) => a.messageId === "id_unspec" && a.detectedDetermination === "PARTIAL_SETTLEMENT_OFFER");
      expect(analysisArg).toEqual(expect.objectContaining({
        detectedDetermination: "PARTIAL_SETTLEMENT_OFFER",
        settlementProvenance: "estimated_benchmark",
      }));

      // Check claim status details clearly flags benchmark baseline and does NOT state "Partial settlement of $X offered"
      const underReviewArgsUnspec = allArgs.filter((a: any) => a.status === "under_review");
      const finalUnderReviewUnspec = underReviewArgsUnspec[underReviewArgsUnspec.length - 1];
      expect(finalUnderReviewUnspec.details).toContain("unspecified amount (industry benchmark baseline: ~$4,000)");
      expect(finalUnderReviewUnspec.details).not.toContain("Partial settlement of $4,000 offered on");
    });

    it("processInboundClaimReply: LLM failure or general inquiry does NOT reset escalated or under_review claims to dispatched", async () => {
      vi.spyOn(libAgentMail, "getAgentMailMessage").mockResolvedValue({
        message_id: "msg_reply_inquiry",
        inbox_id: "inbox_case_1",
        from: "payer@aetna.com",
        recipients: ["appeal-100@claimhero.com"],
        to: ["appeal-100@claimhero.com"],
        subject: "RE: Claim CLM-100 General Update",
        text: "We acknowledge receipt of your documentation.",
        attachments: [],
      } as any);

      vi.spyOn(libAgentMailWebhook, "normalizeAgentMailWebhook").mockReturnValue({
        eventType: "message.received",
        eventId: "evt_reply_inq",
        messageId: "msg_reply_inquiry",
        inboxId: "inbox_case_1",
        from: "payer@aetna.com",
        recipients: ["appeal-100@claimhero.com"],
        subject: "RE: Claim CLM-100 General Update",
        text: "We acknowledge receipt of your documentation.",
        attachments: [],
      });

      vi.spyOn(libOpenAI, "createStructuredCompletion").mockRejectedValue(new Error("LLM timeout"));

      const mockCtx: any = {
        runQuery: vi.fn().mockResolvedValue({ _id: "claim_esc", claimNumber: "CLM-100", status: "escalated" }),
        runMutation: vi.fn().mockResolvedValue("id_esc"),
        runAction: vi.fn().mockResolvedValue(undefined),
      };

      await (actionAgentMail.processInboundClaimReply as any)._handler(mockCtx, {
        eventId: "evt_reply_inq",
        messageId: "msg_reply_inquiry",
        inboxId: "inbox_case_1",
      });

      // Claim status must NOT be reset to 'dispatched'
      const allArgs = mockCtx.runMutation.mock.calls.map((c: any[]) => c[1]).filter(Boolean);
      expect(allArgs.some((arg: any) => arg.status === "dispatched")).toBe(false);
    });

    it("processInboundClaimReply: adverse determination on won claim unlatches isOverturned, stages autoReply draft, and logs appeal_review_requested", async () => {
      vi.spyOn(libAgentMail, "getAgentMailMessage").mockResolvedValue({
        message_id: "msg_reply_reopen",
        inbox_id: "inbox_case_1",
        from: "payer@aetna.com",
        recipients: ["appeal-100@claimhero.com"],
        to: ["appeal-100@claimhero.com"],
        subject: "RE: Claim CLM-100 Post-Payment Audit Determination",
        text: "Upon post-payment audit review, we are upholding the initial denial and requesting recoupment.",
        attachments: [],
      } as any);

      vi.spyOn(libAgentMailWebhook, "normalizeAgentMailWebhook").mockReturnValue({
        eventType: "message.received",
        eventId: "evt_reply_reopen",
        messageId: "msg_reply_reopen",
        inboxId: "inbox_case_1",
        from: "payer@aetna.com",
        recipients: ["appeal-100@claimhero.com"],
        subject: "RE: Claim CLM-100 Post-Payment Audit Determination",
        text: "Upon post-payment audit review, we are upholding the initial denial and requesting recoupment.",
        attachments: [],
      });

      vi.spyOn(libOpenAI, "createStructuredCompletion").mockResolvedValue({
        determination: "DENIAL_UPHELD",
        clinicalRationale: "Post-payment audit upheld denial.",
        missingRecordsRequested: [],
        authorizedSettlementAmount: 0,
        reviewerName: "Aetna Audit Director",
        shouldAutoReply: true,
        suggestedAutoReplyAddendum: "We dispute the recoupment demand under ERISA statutory protections.",
      } as any);

      const mockCtx: any = {
        runQuery: vi.fn().mockResolvedValue({ _id: "claim_won_reopened", claimNumber: "CLM-100", status: "won", deniedAmount: 5000 }),
        runMutation: vi.fn().mockResolvedValue("id_reopen"),
        runAction: vi.fn().mockResolvedValue(undefined),
      };

      await (actionAgentMail.processInboundClaimReply as any)._handler(mockCtx, {
        eventId: "evt_reply_reopen",
        messageId: "msg_reply_reopen",
        inboxId: "inbox_case_1",
      });

      const allArgs = mockCtx.runMutation.mock.calls.map((c: any[]) => c[1]).filter(Boolean);

      // Rebuttal draft must NOT be suppressed; autoReplyStatus must be 'pending'
      const analysisArg = allArgs.find((a: any) => a.messageId === "id_reopen" && a.detectedDetermination === "DENIAL_UPHELD");
      expect(analysisArg).toEqual(expect.objectContaining({
        detectedDetermination: "DENIAL_UPHELD",
        autoReplyStatus: "pending",
      }));
      expect(analysisArg.autoReplyDraft).toBeTruthy();

      // Claim status must transition from won to escalated with REOPENED prefix
      const escalatedArg = allArgs.find((a: any) => a.status === "escalated");
      expect(escalatedArg).toBeDefined();
      expect(escalatedArg.details).toContain("REOPENED:");

      // Audit review event must be triggered
      const auditArg = allArgs.find((a: any) => a.eventType === "appeal_review_requested");
      expect(auditArg).toBeDefined();
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

    it("processInboundClaimReply: sanitizes and escapes malicious HTML and phishing payloads in outbound alert emails", async () => {
      process.env.AGENTMAIL_API_KEY = "test_key";
      process.env.AGENTMAIL_SENDER_INBOX_ID = "in_send";
      process.env.AGENTMAIL_SENDER_EMAIL = "send@claimhero.com";

      vi.spyOn(libAgentMail, "getAgentMailMessage").mockResolvedValue({
        message_id: "msg_inbound_phish_1",
        inbox_id: "in_send",
        from: "adversary@badpayer.com",
        recipients: ["send@claimhero.com"],
        to: ["send@claimhero.com"],
        subject: "Re: Claim #CLM-SECURITY-999 Review",
        text: "Please visit phishing portal.",
        attachments: [],
      } as any);

      vi.spyOn(libAgentMailWebhook, "normalizeAgentMailWebhook").mockReturnValue({
        eventType: "message.received",
        eventId: "evt_phish_1",
        messageId: "msg_inbound_phish_1",
        inboxId: "in_send",
        from: "adversary@badpayer.com",
        recipients: ["send@claimhero.com"],
        subject: "Re: Claim #CLM-SECURITY-999 Review",
        text: "Please visit phishing portal.",
        attachments: [],
      });

      vi.spyOn(libOpenAI, "createStructuredCompletion").mockResolvedValue({
        determination: "DENIAL_UPHELD",
        clinicalRationale: 'Denial affirmed. Verify account at <a href="https://evil-phish.com/harvest">Payer Identity Portal</a> immediately. <script>stealToken()</script>',
        missingRecordsRequested: [],
        authorizedSettlementAmount: 0,
        reviewerName: "Adversary Reviewer",
        shouldAutoReply: true,
        suggestedAutoReplyAddendum: "Appeal contested.",
      } as any);

      const sendMailSpy = vi.spyOn(libAgentMail, "sendAgentMailMessage").mockResolvedValue({
        messageId: "msg_alert_sent_phish",
      } as any);

      const mockCtx: any = {
        runQuery: vi.fn().mockImplementation((fn, args) => {
          if (args?.claimNumber === "CLM-SECURITY-999") {
            return Promise.resolve({
              _id: "claim_sec_999",
              claimNumber: "CLM-SECURITY-999",
              userId: "user_sec_999",
              insurancePayer: 'Evil Insurance <script>alert("payer")</script>',
              patientName: 'John Patient <img src=x onerror="alert(2)">',
              autoPilotEnabled: true,
            });
          }
          if (args?.userId === "user_sec_999") {
            return Promise.resolve({
              _id: "user_sec_999",
              email: "victim_user@clinic.org",
            });
          }
          return Promise.resolve(null);
        }),
        runMutation: vi.fn().mockResolvedValue("id_mut_sec"),
      };

      const res = await (actionAgentMail.processInboundClaimReply as any)._handler(mockCtx, {
        eventId: "evt_phish_1",
        messageId: "msg_inbound_phish_1",
        inboxId: "in_send",
      });

      expect(res).toBeNull();
      expect(sendMailSpy).toHaveBeenCalledWith(expect.objectContaining({
        to: "victim_user@clinic.org",
        subject: expect.stringContaining("[ClaimHero Alert]"),
        html: expect.not.stringContaining("<script>"),
      }));

      const alertCall = sendMailSpy.mock.calls.find(call => (call[0] as any)?.to === "victim_user@clinic.org");
      expect(alertCall).toBeDefined();
      const sentHtml = (alertCall![0] as any).html;
      const sentText = (alertCall![0] as any).text;

      expect(sentHtml).not.toContain("<script>");
      expect(sentHtml).not.toContain("stealToken()");
      expect(sentHtml).not.toContain("<a href=\"https://evil-phish.com");
      expect(sentHtml).not.toContain("onerror");
      expect(sentHtml).toContain("Payer Identity Portal immediately.");
      expect(sentText).not.toContain("https://evil-phish.com");
      expect(sentText).toContain("Payer Identity Portal immediately.");
    });

    it("processInboundClaimReply: digests repeat non-victory alerts within the cooldown window", async () => {
      process.env.AGENTMAIL_API_KEY = "test_key";
      process.env.AGENTMAIL_SENDER_INBOX_ID = "in_send";
      process.env.AGENTMAIL_SENDER_EMAIL = "send@claimhero.com";

      vi.spyOn(libAgentMail, "getAgentMailMessage").mockResolvedValue({
        message_id: "msg_cooldown_1",
        inbox_id: "in_send",
        from: "reviewer@aetna.com",
        recipients: ["send@claimhero.com"],
        to: ["send@claimhero.com"],
        subject: "Re: [ClaimHero #CLM-COOL-1] Denial Maintained",
        text: "The denial is upheld after review.",
        attachments: [],
      } as any);

      vi.spyOn(libAgentMailWebhook, "normalizeAgentMailWebhook").mockReturnValue({
        eventType: "message.received",
        eventId: "evt_cooldown_1",
        messageId: "msg_cooldown_1",
        inboxId: "in_send",
        from: "reviewer@aetna.com",
        recipients: ["send@claimhero.com"],
        subject: "Re: [ClaimHero #CLM-COOL-1] Denial Maintained",
        text: "The denial is upheld after review.",
        attachments: [],
      });

      const sendMailSpy = vi.spyOn(libAgentMail, "sendAgentMailMessage").mockResolvedValue({
        messageId: "msg_alert_cooldown",
      } as any);

      const mockCtx: any = {
        runQuery: vi.fn().mockImplementation((fn, args) => {
          if (args?.claimNumber === "CLM-COOL-1") {
            return Promise.resolve({
              _id: "claim_cool_1",
              claimNumber: "CLM-COOL-1",
              userId: "user_cool_1",
              insurancePayer: "Aetna",
              lastPayerAlertAt: Date.now(),
            });
          }
          if (args?.userId === "user_cool_1") {
            return Promise.resolve({
              _id: "user_cool_1",
              email: "owner@clinic.com",
            });
          }
          return Promise.resolve(null);
        }),
        runMutation: vi.fn().mockResolvedValue("id_mut_cool"),
      };

      const res = await (actionAgentMail.processInboundClaimReply as any)._handler(mockCtx, {
        eventId: "evt_cooldown_1",
        messageId: "msg_cooldown_1",
        inboxId: "in_send",
      });

      expect(res).toBeNull();
      expect(sendMailSpy).not.toHaveBeenCalled();
    });

    it("processInboundClaimReply: victory alerts bypass the cooldown window", async () => {
      process.env.AGENTMAIL_API_KEY = "test_key";
      process.env.AGENTMAIL_SENDER_INBOX_ID = "in_send";
      process.env.AGENTMAIL_SENDER_EMAIL = "send@claimhero.com";

      vi.spyOn(libAgentMail, "getAgentMailMessage").mockResolvedValue({
        message_id: "msg_cooldown_win",
        inbox_id: "in_send",
        from: "reviewer@aetna.com",
        recipients: ["send@claimhero.com"],
        to: ["send@claimhero.com"],
        subject: "Re: [ClaimHero #CLM-COOL-2] Approved",
        text: "The adverse determination has been overturned and approved for full reimbursement.",
        attachments: [],
      } as any);

      vi.spyOn(libAgentMailWebhook, "normalizeAgentMailWebhook").mockReturnValue({
        eventType: "message.received",
        eventId: "evt_cooldown_win",
        messageId: "msg_cooldown_win",
        inboxId: "in_send",
        from: "reviewer@aetna.com",
        recipients: ["send@claimhero.com"],
        subject: "Re: [ClaimHero #CLM-COOL-2] Approved",
        text: "The adverse determination has been overturned and approved for full reimbursement.",
        attachments: [],
      });

      vi.spyOn(libOpenAI, "createStructuredCompletion").mockResolvedValue({
        determination: "OVERTURNED_APPROVED",
        clinicalRationale: "The adverse determination has been overturned and approved for full reimbursement.",
        missingRecordsRequested: [],
        authorizedSettlementAmount: 2500,
        reviewerName: "Aetna Appellate Reviewer",
        shouldAutoReply: false,
        suggestedAutoReplyAddendum: "",
      } as any);

      const sendMailSpy = vi.spyOn(libAgentMail, "sendAgentMailMessage").mockResolvedValue({
        messageId: "msg_alert_win",
      } as any);

      const mockCtx: any = {
        runQuery: vi.fn().mockImplementation((fn, args) => {
          if (args?.claimNumber === "CLM-COOL-2") {
            return Promise.resolve({
              _id: "claim_cool_2",
              claimNumber: "CLM-COOL-2",
              userId: "user_cool_2",
              insurancePayer: "Aetna",
              lastPayerAlertAt: Date.now(),
            });
          }
          if (args?.userId === "user_cool_2") {
            return Promise.resolve({
              _id: "user_cool_2",
              email: "owner@clinic.com",
            });
          }
          return Promise.resolve(null);
        }),
        runMutation: vi.fn().mockResolvedValue("id_mut_cool_win"),
      };

      const res = await (actionAgentMail.processInboundClaimReply as any)._handler(mockCtx, {
        eventId: "evt_cooldown_win",
        messageId: "msg_cooldown_win",
        inboxId: "in_send",
      });

      expect(res).toBeNull();
      expect(sendMailSpy).toHaveBeenCalledWith(expect.objectContaining({
        to: "owner@clinic.com",
        subject: expect.stringContaining("Overturned"),
      }));
    });

    it("processInboundClaimReply: drops internal @agentmail.to mail even when mailboxes are unconfigured", async () => {
      delete process.env.AGENTMAIL_SENDER_INBOX_ID;
      delete process.env.AGENTMAIL_SENDER_EMAIL;

      vi.spyOn(libAgentMail, "getAgentMailMessage").mockResolvedValue({
        message_id: "msg_self_domain_1",
        inbox_id: "in_send",
        from: "Internal <claimhero-internal@agentmail.to>",
        recipients: ["send@claimhero.com"],
        to: ["send@claimhero.com"],
        subject: "Re: [ClaimHero #CLM-SELF-1] Appeal overturned",
        text: "We overturned the denial and approved the claim.",
        attachments: [],
      } as any);

      vi.spyOn(libAgentMailWebhook, "normalizeAgentMailWebhook").mockReturnValue({
        eventType: "message.received",
        eventId: "evt_self_domain_1",
        messageId: "msg_self_domain_1",
        inboxId: "in_send",
        from: "Internal <claimhero-internal@agentmail.to>",
        recipients: ["send@claimhero.com"],
        subject: "Re: [ClaimHero #CLM-SELF-1] Appeal overturned",
        text: "We overturned the denial and approved the claim.",
        attachments: [],
      });

      const sendMailSpy = vi.spyOn(libAgentMail, "sendAgentMailMessage").mockResolvedValue({
        messageId: "msg_alert_self",
      } as any);

      const mockCtx: any = {
        runQuery: vi.fn().mockImplementation((fn, args) => {
          if (args?.claimNumber === "CLM-SELF-1") {
            return Promise.resolve({
              _id: "claim_self_1",
              claimNumber: "CLM-SELF-1",
              userId: "user_self_1",
              insurancePayer: "GeoBlue",
            });
          }
          return Promise.resolve(null);
        }),
        runMutation: vi.fn(),
      };

      const res = await (actionAgentMail.processInboundClaimReply as any)._handler(mockCtx, {
        eventId: "evt_self_domain_1",
        messageId: "msg_self_domain_1",
        inboxId: "in_send",
      });

      expect(res).toBeNull();
      expect(sendMailSpy).not.toHaveBeenCalled();
      expect(mockCtx.runMutation).not.toHaveBeenCalled();
    });

    it("processInboundClaimReply: resolves claim via in_reply_to referencing earlier outbound message", async () => {
      process.env.AGENTMAIL_API_KEY = "test_key";
      process.env.AGENTMAIL_SENDER_INBOX_ID = "in_send";
      process.env.AGENTMAIL_SENDER_EMAIL = "send@claimhero.com";

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
    it("dispatchAppealPacket: transmits appeal packet in custom_email mode", async () => {
      process.env.AGENTMAIL_API_KEY = "test_key";
      process.env.AGENTMAIL_SENDER_INBOX_ID = "in_send";
      process.env.AGENTMAIL_SENDER_EMAIL = "send@claimhero.com";

      const mockClaim = {
        _id: "c1",
        claimNumber: "CLM-100",
        userId: "user_123",
        deniedAmount: 18450,
        status: "ready_for_review",
        patient: { name: "Marcus Holloway", insurancePayer: "UnitedHealthcare" },
      };
      const mockAppeal = {
        _id: "a1",
        claimId: "c1",
        version: 1,
        isHumanApproved: true,
        fullAppealMarkdown: "# Appeal Brief",
        medicalNecessityArguments: "Medical necessity argument",
      };

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
        dispatchMode: "custom_email",
        recipientEmail: "advocate@test.com",
      });

      expect(receipt.status).toBe("delivered");
      expect(receipt.recipient).toBe("advocate@test.com");
      const callArgs = (libAgentMail.sendAgentMailMessage as any).mock.calls[0][0];
      expect(callArgs.to).toBe("advocate@test.com");
      expect(callArgs.subject).toContain("[ClaimHero #CLM-100]");
      expect(callArgs.text).toContain("[ClaimHero #CLM-100]");
      expect(mockCtx.runMutation).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
        claimId: "c1",
        status: "dispatched",
      }));
    });

    it("dispatchAppealPacket: rejects dispatch when claim has unacknowledged provisional_capped degradation even in ready_for_review status", async () => {
      process.env.AGENTMAIL_API_KEY = "test_key";
      process.env.AGENTMAIL_SENDER_INBOX_ID = "in_send";
      process.env.AGENTMAIL_SENDER_EMAIL = "send@claimhero.com";

      const mockClaim = {
        _id: "c_prov_gate",
        claimNumber: "CLM-PROV-GATE",
        userId: "user_123",
        status: "ready_for_review",
        isHumanApproved: true,
        patient: { name: "Marcus Holloway", insurancePayer: "UnitedHealthcare" },
        evidenceIntegrity: {
          scoreStatus: "provisional_capped",
          requiresEvidentiaryAcknowledgement: true,
        },
      };

      const mockCtx: any = {
        runQuery: vi.fn().mockResolvedValue(mockClaim),
        runMutation: vi.fn().mockResolvedValue(undefined),
      };

      await expect(
        (actionMailDispatcher.dispatchAppealPacket as any)._handler(mockCtx, {
          claimId: "c_prov_gate",
          recipientEmail: "advocate@test.com",
        })
      ).rejects.toThrow(/unacknowledged provisional evidentiary degradation/i);
    });

    it("sendOutboundMessage: transmits outbound message to custom recipient", async () => {
      process.env.AGENTMAIL_API_KEY = "test_key";
      process.env.AGENTMAIL_SENDER_INBOX_ID = "in_send";
      process.env.AGENTMAIL_SENDER_EMAIL = "send@claimhero.com";

      const mockClaim = {
        _id: "c1",
        claimNumber: "CLM-100",
        userId: "user_123",
        status: "ready_for_review",
        isHumanApproved: true,
        deniedAmount: 5000,
        patient: { name: "John Doe", insurancePayer: "Aetna" },
      };
      const mockThread = {
        thread: { _id: "t1" },
        messages: [{ sender: "Doctor", recipient: "Payer", subject: "Addendum", bodyText: "Here is EMG" }],
      };

      vi.spyOn(libAgentMail, "sendAgentMailMessage").mockResolvedValue({
        messageId: "live_msg_2",
      } as any);

      const mockCtx: any = {
        runQuery: vi.fn().mockImplementation((_query, args) => {
          if (args?.userId) return Promise.resolve({ _id: args.userId, isAnonymous: false });
          if (args?.claimId) return Promise.resolve(mockClaim);
          return Promise.resolve(mockThread);
        }),
        runMutation: vi.fn().mockResolvedValue("t1"),
      };

      const res = await (actionMailDispatcher.sendOutboundMessage as any)._handler(mockCtx, {
        claimId: "c1",
        threadId: "t1",
        text: "Here is the EMG addendum",
        customRecipient: "reviewer@aetna.com",
      });

      expect(res.success).toBe(true);
      expect(libAgentMail.sendAgentMailMessage).toHaveBeenCalledWith(expect.objectContaining({
        to: "reviewer@aetna.com",
        subject: expect.stringContaining("[ClaimHero #CLM-100]"),
        text: expect.stringContaining("Here is the EMG addendum"),
      }));
    });

    it("sendOutboundMessageInternal: refuses to address payer correspondence to the own sender inbox", async () => {
      process.env.AGENTMAIL_API_KEY = "test_key";
      process.env.AGENTMAIL_SENDER_INBOX_ID = "in_send";
      process.env.AGENTMAIL_SENDER_EMAIL = "send@claimhero.com";

      const mockClaim = {
        _id: "c_self_route",
        claimNumber: "CLM-SELF-ROUTE",
        userId: "user_123",
        status: "ready_for_review",
        isHumanApproved: true,
        deniedAmount: 5000,
        patient: { name: "John Doe", insurancePayer: "Aetna" },
      };
      const mockThread = {
        thread: { _id: "t_self", payerEmail: "send@claimhero.com", subject: "Appeal" },
        messages: [],
      };

      const sendMailSpy = vi.spyOn(libAgentMail, "sendAgentMailMessage");

      let queryCalls = 0;
      const mockCtx: any = {
        runQuery: vi.fn().mockImplementation(() => {
          queryCalls++;
          if (queryCalls === 1) return Promise.resolve(mockClaim);
          return Promise.resolve(mockThread);
        }),
        runMutation: vi.fn().mockResolvedValue("t_self"),
      };

      await expect(
        (actionMailDispatcher.sendOutboundMessageInternal as any)._handler(mockCtx, {
          claimId: "c_self_route",
          threadId: "t_self",
          text: "Addendum body",
        })
      ).rejects.toThrow(/own sender inbox/);
      expect(sendMailSpy).not.toHaveBeenCalled();
    });

    it("sendOutboundMessage: preserves canonical thread subject and attaches In-Reply-To/References headers", async () => {
      process.env.AGENTMAIL_API_KEY = "test_key";
      process.env.AGENTMAIL_SENDER_INBOX_ID = "in_send";
      process.env.AGENTMAIL_SENDER_EMAIL = "send@claimhero.com";

      const mockClaim = {
        _id: "c1",
        claimNumber: "CLM-100",
        userId: "user_123",
        status: "ready_for_review",
        isHumanApproved: true,
        deniedAmount: 5000,
        patient: { name: "John Doe", insurancePayer: "GeoBlue" },
      };
      const mockThread = {
        thread: {
          _id: "t1",
          subject: "[ClaimHero #CLM-100] Appeal request | Claim #CLM-100 | GeoBlue",
          payerEmail: "payer@geoblue.com",
        },
        messages: [
          {
            direction: "outbound",
            sender: "send@claimhero.com",
            recipient: "payer@geoblue.com",
            subject: "[ClaimHero #CLM-100] Appeal request | Claim #CLM-100 | GeoBlue",
            bodyText: "Initial appeal brief",
            agentMailMessageId: "msg_initial_123",
          },
          {
            direction: "inbound",
            sender: "payer@geoblue.com",
            recipient: "send@claimhero.com",
            subject: "Re: [ClaimHero #CLM-100] Appeal request | Claim #CLM-100 | GeoBlue",
            bodyText: "Need more info",
            agentMailMessageId: "msg_inbound_456",
          },
        ],
      };

      const replySpy = vi.spyOn(libAgentMail, "replyAgentMailMessage").mockResolvedValue({
        messageId: "msg_outbound_789",
        threadId: "thr_conv_1",
      });

      const mockCtx: any = {
        runQuery: vi.fn().mockImplementation((_query, args) => {
          if (args?.userId) return Promise.resolve({ _id: args.userId, isAnonymous: false });
          if (args?.claimId) return Promise.resolve(mockClaim);
          return Promise.resolve(mockThread);
        }),
        runMutation: vi.fn().mockResolvedValue("t1"),
      };

      const res = await (actionMailDispatcher.sendOutboundMessage as any)._handler(mockCtx, {
        claimId: "c1",
        threadId: "t1",
        text: "Here is the requested addendum and operative note.",
      });

      expect(res.success).toBe(true);
      // Verify that replyAgentMailMessage was called with the last inbound messageId
      expect(replySpy).toHaveBeenCalledWith(expect.objectContaining({
        inboxId: "in_send",
        messageId: "msg_inbound_456",
        to: "payer@geoblue.com",
        headers: {
          "In-Reply-To": "<msg_inbound_456@agentmail.to>",
          "References": "<msg_initial_123@agentmail.to> <msg_inbound_456@agentmail.to>",
        },
      }));
    });

    it("sendOutboundMessage: falls back to sendAgentMailMessage with in-thread subject and headers when reply fails", async () => {
      process.env.AGENTMAIL_API_KEY = "test_key";
      process.env.AGENTMAIL_SENDER_INBOX_ID = "in_send";
      process.env.AGENTMAIL_SENDER_EMAIL = "send@claimhero.com";

      const mockClaim = {
        _id: "c1",
        claimNumber: "CLM-100",
        userId: "user_123",
        status: "ready_for_review",
        isHumanApproved: true,
        deniedAmount: 5000,
        patient: { name: "John Doe", insurancePayer: "GeoBlue" },
      };
      const mockThread = {
        thread: {
          _id: "t1",
          subject: "[ClaimHero #CLM-100] Appeal request | Claim #CLM-100 | GeoBlue",
          payerEmail: "payer@geoblue.com",
        },
        messages: [
          {
            direction: "outbound",
            sender: "send@claimhero.com",
            recipient: "payer@geoblue.com",
            subject: "[ClaimHero #CLM-100] Appeal request | Claim #CLM-100 | GeoBlue",
            bodyText: "Initial appeal brief",
            agentMailMessageId: "msg_initial_123",
          },
        ],
      };

      vi.spyOn(libAgentMail, "replyAgentMailMessage").mockRejectedValue(new Error("Cannot reply to outbound"));
      const sendSpy = vi.spyOn(libAgentMail, "sendAgentMailMessage").mockResolvedValue({
        messageId: "msg_outbound_999",
        threadId: "thr_conv_1",
      });

      const mockCtx: any = {
        runQuery: vi.fn().mockImplementation((_query, args) => {
          if (args?.userId) return Promise.resolve({ _id: args.userId, isAnonymous: false });
          if (args?.claimId) return Promise.resolve(mockClaim);
          return Promise.resolve(mockThread);
        }),
        runMutation: vi.fn().mockResolvedValue("t1"),
      };

      const res = await (actionMailDispatcher.sendOutboundMessage as any)._handler(mockCtx, {
        claimId: "c1",
        threadId: "t1",
        text: "Follow-up addendum sent before payer replied.",
      });

      expect(res.success).toBe(true);
      expect(sendSpy).toHaveBeenCalledWith(expect.objectContaining({
        inboxId: "in_send",
        to: "payer@geoblue.com",
        subject: "Re: [ClaimHero #CLM-100] Appeal request | Claim #CLM-100 | GeoBlue",
        headers: {
          "In-Reply-To": "<msg_initial_123@agentmail.to>",
          "References": "<msg_initial_123@agentmail.to>",
        },
      }));
    });

    describe("Second Path Security & Mandatory Review Gates (sendOutboundMessage)", () => {
      it("rejects transmission when claim is in review_provisional status", async () => {
        const mockClaim = {
          _id: "claim_prov_second",
          claimNumber: "CLM-PROV-2",
          userId: "user_123",
          status: "review_provisional",
          evidenceIntegrity: {
            scoreStatus: "provisional_capped",
            requiresEvidentiaryAcknowledgement: true,
          },
        };
        const mockCtx: any = {
          runQuery: vi.fn().mockResolvedValue(mockClaim),
          runMutation: vi.fn().mockResolvedValue(undefined),
        };

        await expect(
          (actionMailDispatcher.sendOutboundMessage as any)._handler(mockCtx, {
            claimId: "claim_prov_second",
            text: "Exfiltrating provisional dossier",
          })
        ).rejects.toThrow(/provisional evidentiary degradation/i);
      });

      it("rejects transmission when claim has unacknowledged provisional_capped degradation", async () => {
        const mockClaim = {
          _id: "claim_prov_capped",
          claimNumber: "CLM-PROV-CAPPED",
          userId: "user_123",
          status: "ready_for_review",
          evidenceIntegrity: {
            scoreStatus: "provisional_capped",
            requiresEvidentiaryAcknowledgement: true,
          },
        };
        const mockCtx: any = {
          runQuery: vi.fn().mockResolvedValue(mockClaim),
          runMutation: vi.fn().mockResolvedValue(undefined),
        };

        await expect(
          (actionMailDispatcher.sendOutboundMessage as any)._handler(mockCtx, {
            claimId: "claim_prov_capped",
            text: "Exfiltrating provisional dossier",
          })
        ).rejects.toThrow(/provisional evidentiary degradation/i);
      });

      it("rejects transmission when claim status is in an unready drafting state", async () => {
        const mockClaim = {
          _id: "claim_drafting",
          claimNumber: "CLM-DRAFT-1",
          userId: "user_123",
          status: "drafting",
        };
        const mockCtx: any = {
          runQuery: vi.fn().mockResolvedValue(mockClaim),
          runMutation: vi.fn().mockResolvedValue(undefined),
        };

        await expect(
          (actionMailDispatcher.sendOutboundMessage as any)._handler(mockCtx, {
            claimId: "claim_drafting",
            text: "Addendum on incomplete draft",
          })
        ).rejects.toThrow(/Claim must be "ready_for_review" or an active post-dispatch status/i);
      });

      it("rejects transmission when explicit human approval is absent", async () => {
        const mockClaim = {
          _id: "claim_unapproved",
          claimNumber: "CLM-UNAPPROVED",
          userId: "user_123",
          status: "ready_for_review",
          isHumanApproved: false,
          patient: { name: "Jane Doe", insurancePayer: "Aetna" },
          payerContact: { officialAppealsEmail: "appeals@aetna.com", isVerified: true },
        };
        const mockCtx: any = {
          runQuery: vi.fn().mockImplementation((_, args) => {
            if (args.claimId) return Promise.resolve(mockClaim);
            return Promise.resolve(null);
          }),
          runMutation: vi.fn().mockResolvedValue(undefined),
        };

        await expect(
          (actionMailDispatcher.sendOutboundMessage as any)._handler(mockCtx, {
            claimId: "claim_unapproved",
            text: "Unreviewed transmission",
          })
        ).rejects.toThrow(/explicit human approval is required/i);
      });

      it("allows transmission and records approval when args.humanApproved is provided", async () => {
        process.env.AGENTMAIL_API_KEY = "test_key";
        process.env.AGENTMAIL_SENDER_INBOX_ID = "in_send";
        process.env.AGENTMAIL_SENDER_EMAIL = "send@claimhero.com";

        const mockClaim = {
          _id: "claim_to_approve",
          claimNumber: "CLM-APPROVE-1",
          userId: "user_123",
          status: "ready_for_review",
          isHumanApproved: false,
          patient: { name: "Jane Doe", insurancePayer: "Aetna" },
          payerContact: { officialAppealsEmail: "appeals@aetna.com", isVerified: true },
        };
        const mockAppeal = {
          _id: "appeal_1",
          claimId: "claim_to_approve",
          version: 1,
        };

        vi.spyOn(libAgentMail, "sendAgentMailMessage").mockResolvedValue({
          messageId: "live_approved_msg",
        } as any);

        let claimQueryCalls = 0;
        const mockCtx: any = {
          runQuery: vi.fn().mockImplementation((_query, args) => {
            if (args?.userId) return Promise.resolve({ _id: args.userId, isAnonymous: false });
            if (args?.claimId) {
              claimQueryCalls++;
              if (claimQueryCalls === 1) return Promise.resolve(mockClaim);
              return Promise.resolve(mockAppeal);
            }
            return Promise.resolve(null);
          }),
          runMutation: vi.fn().mockResolvedValue("thread_new"),
        };

        const res = await (actionMailDispatcher.sendOutboundMessage as any)._handler(mockCtx, {
          claimId: "claim_to_approve",
          text: "Authorized clinical addendum",
          humanApproved: true,
          approvedBy: "Dr. Gregory House",
        });

        expect(res.success).toBe(true);
        expect(res.humanApproved).toBe(true);
        expect(res.approvedBy).toBe("Dr. Gregory House");
        const approvalCall = mockCtx.runMutation.mock.calls.find(
          (call: any[]) => call[1]?.approvedBy === "Dr. Gregory House"
        );
        expect(approvalCall).toBeDefined();
        expect(approvalCall[1].appealId).toBe("appeal_1");
      });

      it("attaches compiled PDF brief when attachPdf is requested", async () => {
        process.env.AGENTMAIL_API_KEY = "test_key";
        process.env.AGENTMAIL_SENDER_INBOX_ID = "in_send";
        process.env.AGENTMAIL_SENDER_EMAIL = "send@claimhero.com";

        const mockClaim = {
          _id: "claim_pdf_attach",
          claimNumber: "CLM-PDF-1",
          userId: "user_123",
          status: "dispatched",
          isHumanApproved: true,
          patient: { name: "Jane Doe", insurancePayer: "Aetna" },
          payerContact: { officialAppealsEmail: "appeals@aetna.com", isVerified: true },
        };
        const mockAppeal = {
          _id: "appeal_pdf",
          claimId: "claim_pdf_attach",
          version: 1,
          fullAppealMarkdown: "# Legal Appeal",
        };

        const mockStoredPdf = {
          storageId: "storage_pdf_123",
          buffer: Buffer.from("%PDF-1.4 Mock Brief"),
          filename: "Appeal_Brief_CLM-PDF-1.pdf",
        };
        vi.spyOn(libPdfGenerator, "ensureAppealPdfStored").mockResolvedValue(mockStoredPdf as any);

        const sendSpy = vi.spyOn(libAgentMail, "sendAgentMailMessage").mockResolvedValue({
          messageId: "live_pdf_msg",
        } as any);

        const mockCtx: any = {
          runQuery: vi.fn().mockImplementation((_, args) => {
            if (args.claimId) return Promise.resolve(mockClaim);
            return Promise.resolve(mockAppeal);
          }),
          runMutation: vi.fn().mockResolvedValue("thread_pdf"),
        };

        const res = await (actionMailDispatcher.sendOutboundMessage as any)._handler(mockCtx, {
          claimId: "claim_pdf_attach",
          text: "Transmitting full exhibit packet",
          attachPdf: true,
          humanApproved: true,
        });

        expect(res.success).toBe(true);
        expect(res.pdfAttached).toBe(true);
        expect(sendSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            attachments: [
              expect.objectContaining({
                filename: "Appeal_Brief_CLM-PDF-1.pdf",
                contentType: "application/pdf",
              }),
            ],
          })
        );
      });

      it("rejects transmission when rate limit is exceeded for sendOutboundMessage", async () => {
        const mockClaim = {
          _id: "claim_ratelimit",
          claimNumber: "CLM-RL-1",
          userId: "user_123",
          status: "ready_for_review",
          isHumanApproved: true,
        };

        vi.spyOn(rateLimiter, "limit").mockResolvedValue({
          ok: false,
          retryAfter: 5000,
        } as any);

        const mockCtx: any = {
          runQuery: vi.fn().mockResolvedValue(mockClaim),
          runMutation: vi.fn().mockResolvedValue(undefined),
        };

        await expect(
          (actionMailDispatcher.sendOutboundMessage as any)._handler(mockCtx, {
            claimId: "claim_ratelimit",
            text: "Testing rate limit",
          })
        ).rejects.toThrow(/Rate limit reached for outbound payer transmission/i);
      });

      it("rejects transmission when claim status is missing or undefined", async () => {
        const mockClaim = {
          _id: "claim_no_status",
          claimNumber: "CLM-NO-STATUS",
          userId: "user_123",
          status: undefined,
          isHumanApproved: true,
        };

        const mockCtx: any = {
          runQuery: vi.fn().mockResolvedValue(mockClaim),
          runMutation: vi.fn().mockResolvedValue(undefined),
        };

        await expect(
          (actionMailDispatcher.sendOutboundMessage as any)._handler(mockCtx, {
            claimId: "claim_no_status",
            text: "Testing invalid status",
          })
        ).rejects.toThrow(/claim status is "unknown"/i);
      });

      it("sendOutboundMessageInternal enforces rate limiting via claim.userId", async () => {
        const mockClaim = {
          _id: "claim_internal_rl",
          claimNumber: "CLM-INT-1",
          userId: "user_internal_rl",
          status: "ready_for_review",
          isHumanApproved: true,
        };

        const rateSpy = vi.spyOn(rateLimiter, "limit").mockResolvedValue({
          ok: false,
          retryAfter: 3000,
        } as any);

        const mockCtx: any = {
          runQuery: vi.fn().mockResolvedValue(mockClaim),
          runMutation: vi.fn().mockResolvedValue(undefined),
        };

        await expect(
          (actionMailDispatcher.sendOutboundMessageInternal as any)._handler(mockCtx, {
            claimId: "claim_internal_rl",
            text: "Internal message test",
          })
        ).rejects.toThrow(/Rate limit reached for outbound payer transmission/i);

        expect(rateSpy).toHaveBeenCalledWith(
          mockCtx,
          "mailDispatcher",
          { key: "user_internal_rl" }
        );
      });
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
