/// <reference path="./auth-mock.d.ts" />
import { describe, it, expect, vi, beforeEach } from "vitest";
import * as emails from "../convex/emails";
import { getAuthUserId } from "@convex-dev/auth/server";

vi.mock("@convex-dev/auth/server", () => ({
  getAuthUserId: vi.fn(),
}));

describe("Convex Emails & Communications API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("listThreadsByClaim & getThreadWithMessages", () => {
    it("listThreadsByClaim: fetches threads by claimId", async () => {
      vi.mocked(getAuthUserId).mockResolvedValue("user_123" as any);
      const mockClaim = { _id: "c1", userId: "user_123" };
      const threads = [{ _id: "t1", claimId: "c1", subject: "Appeal" }];
      const mockCtx: any = {
        db: {
          get: vi.fn().mockResolvedValue(mockClaim),
          query: vi.fn().mockReturnValue({
            withIndex: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                collect: vi.fn().mockResolvedValue(threads),
              }),
            }),
          }),
        },
      };

      const res = await (emails.listThreadsByClaim as any)._handler(mockCtx, { claimId: "c1" });
      expect(res).toEqual(threads);
    });

    it("getThreadWithMessages: returns null if thread not found, else thread with messages", async () => {
      const mockCtxNotFound: any = { db: { get: vi.fn().mockResolvedValue(null) } };
      expect(await (emails.getThreadWithMessages as any)._handler(mockCtxNotFound, { threadId: "t_none" })).toBeNull();

      vi.mocked(getAuthUserId).mockResolvedValue("user_123" as any);
      const mockThread = { _id: "t1", claimId: "c1", subject: "Thread" };
      const mockClaim = { _id: "c1", userId: "user_123" };
      const mockMsgs = [{ _id: "m1", threadId: "t1" }];
      const mockCtx: any = {
        db: {
          get: vi.fn().mockImplementation((id) => (id === "t1" ? Promise.resolve(mockThread) : Promise.resolve(mockClaim))),
          query: vi.fn().mockReturnValue({
            withIndex: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                collect: vi.fn().mockResolvedValue(mockMsgs),
              }),
            }),
          }),
        },
      };

      const res = await (emails.getThreadWithMessages as any)._handler(mockCtx, { threadId: "t1" });
      expect(res?.thread._id).toBe("t1");
      expect(res?.messages).toHaveLength(1);
    });
  });

  describe("getOrCreateThread & getOrCreateThreadInternal", () => {
    it("patches existing thread if already exists", async () => {
      vi.mocked(getAuthUserId).mockResolvedValue("user_123" as any);
      const mockClaim = { _id: "c1", userId: "user_123" };
      const existingThread = { _id: "t_existing", claimId: "c1" };
      const mockCtx: any = {
        db: {
          get: vi.fn().mockResolvedValue(mockClaim),
          query: vi.fn().mockReturnValue({
            withIndex: vi.fn().mockReturnValue({
              first: vi.fn().mockResolvedValue(existingThread),
            }),
          }),
          patch: vi.fn().mockResolvedValue(undefined),
        },
      };

      const res = await (emails.getOrCreateThread as any)._handler(mockCtx, {
        claimId: "c1",
        agentEmail: "agent@hero.com",
        payerEmail: "payer@ins.com",
        subject: "Updated Subject",
      });

      expect(res).toBe("t_existing");
      expect(mockCtx.db.patch).toHaveBeenCalledWith("t_existing", expect.objectContaining({ subject: "Updated Subject" }));
    });

    it("inserts new thread if none exists", async () => {
      const mockCtx: any = {
        db: {
          query: vi.fn().mockReturnValue({
            withIndex: vi.fn().mockReturnValue({
              first: vi.fn().mockResolvedValue(null),
            }),
          }),
          insert: vi.fn().mockResolvedValue("t_new_1"),
        },
      };

      const res = await (emails.getOrCreateThreadInternal as any)._handler(mockCtx, {
        claimId: "c1",
        agentEmail: "agent@hero.com",
        payerEmail: "payer@ins.com",
        subject: "New Subject",
      });

      expect(res).toBe("t_new_1");
      expect(mockCtx.db.insert).toHaveBeenCalledWith("emailThreads", expect.objectContaining({
        claimId: "c1",
        status: "active",
      }));
    });
  });

  describe("insertMessage & insertMessageInternal", () => {
    it("inserts outbound message, patches thread, patches claim to dispatched, and logs audit", async () => {
      vi.mocked(getAuthUserId).mockResolvedValue("user_123" as any);
      const mockClaim = { _id: "c1", userId: "user_123" };
      const mockCtx: any = {
        db: {
          get: vi.fn().mockResolvedValue(mockClaim),
          insert: vi.fn().mockImplementation((table) => (table === "emailMessages" ? Promise.resolve("msg_out_1") : Promise.resolve("log_1"))),
          patch: vi.fn().mockResolvedValue(undefined),
        },
      };

      const res = await (emails.insertMessage as any)._handler(mockCtx, {
        threadId: "t1",
        claimId: "c1",
        direction: "outbound",
        sender: "agent@claimhero.com",
        recipient: "payer@uhc.com",
        subject: "Formal Appeal",
        bodyHtml: "<p>Brief</p>",
        bodyText: "Brief",
        hasAttachments: true,
        agentMailMessageId: "am_123",
      });

      expect(res).toBe("msg_out_1");
      expect(mockCtx.db.patch).toHaveBeenCalledWith("t1", expect.objectContaining({ status: "dispatched" }));
      expect(mockCtx.db.patch).toHaveBeenCalledWith("c1", expect.objectContaining({ status: "dispatched" }));
      expect(mockCtx.db.insert).toHaveBeenCalledWith("appealAuditLogs", expect.objectContaining({ eventType: "appeal_dispatched" }));
    });

    it("inserts inbound message, patches thread, patches claim to under_review, and logs audit", async () => {
      const mockCtx: any = {
        db: {
          insert: vi.fn().mockImplementation((table) => (table === "emailMessages" ? Promise.resolve("msg_in_1") : Promise.resolve("log_1"))),
          patch: vi.fn().mockResolvedValue(undefined),
        },
      };

      const res = await (emails.insertMessageInternal as any)._handler(mockCtx, {
        threadId: "t1",
        claimId: "c1",
        direction: "inbound",
        sender: "payer@uhc.com",
        recipient: "agent@claimhero.com",
        subject: "Re: Appeal Determination",
        bodyHtml: "<p>Under review</p>",
        bodyText: "Under review",
        hasAttachments: false,
      });

      expect(res).toBe("msg_in_1");
      expect(mockCtx.db.patch).toHaveBeenCalledWith("t1", expect.objectContaining({ status: "response_received" }));
      expect(mockCtx.db.patch).toHaveBeenCalledWith("c1", expect.objectContaining({ status: "under_review" }));
      expect(mockCtx.db.insert).toHaveBeenCalledWith("appealAuditLogs", expect.objectContaining({ eventType: "payer_response_received" }));
    });
  });

  describe("getExistingAgentMailMessageIds & hasMessageByAgentMailId", () => {
    it("getExistingAgentMailMessageIds: returns IDs found in compact index without reading emailMessages", async () => {
      const mockCtx: any = {
        db: {
          query: vi.fn().mockImplementation((table: string) => {
            if (table === "recordedAgentMailMessageIds") {
              return {
                withIndex: vi.fn().mockImplementation((_name, fn) => {
                  const queryObj: any = {
                    eq: vi.fn().mockImplementation((_field, val) => {
                      if (val === "msg_compact_1") return { first: vi.fn().mockResolvedValue({ _id: "rec_1" }) };
                      return { first: vi.fn().mockResolvedValue(null) };
                    }),
                  };
                  return fn(queryObj);
                }),
              };
            }
            if (table === "emailMessages") {
              return {
                withIndex: vi.fn().mockImplementation((_name, fn) => {
                  const queryObj: any = {
                    eq: vi.fn().mockImplementation((_field, val) => {
                      if (val === "msg_legacy_2") return { first: vi.fn().mockResolvedValue({ _id: "m_leg" }) };
                      return { first: vi.fn().mockResolvedValue(null) };
                    }),
                  };
                  return fn(queryObj);
                }),
              };
            }
            return {
              withIndex: vi.fn().mockReturnValue({ first: vi.fn().mockResolvedValue(null) }),
            };
          }),
        },
      };

      const res = await (emails.getExistingAgentMailMessageIds as any)._handler(mockCtx, {
        agentMailMessageIds: ["msg_compact_1", "msg_legacy_2", "msg_unknown_3"],
      });

      expect(res).toEqual(["msg_compact_1", "msg_legacy_2"]);
    });

    it("hasMessageByAgentMailId: returns true when found in compact index table", async () => {
      const mockCtx: any = {
        db: {
          query: vi.fn().mockImplementation((table: string) => {
            if (table === "recordedAgentMailMessageIds") {
              return {
                withIndex: vi.fn().mockReturnValue({
                  first: vi.fn().mockResolvedValue({ agentMailMessageId: "msg_exist_1" }),
                }),
              };
            }
            return {
              withIndex: vi.fn().mockReturnValue({
                first: vi.fn().mockResolvedValue(null),
              }),
            };
          }),
        },
      };

      const res = await (emails.hasMessageByAgentMailId as any)._handler(mockCtx, {
        agentMailMessageId: "msg_exist_1",
      });

      expect(res).toBe(true);
    });
  });

  describe("getPendingAutoPilotMessagesInternal & getAutoPilotMessageStateInternal", () => {
    it("getPendingAutoPilotMessagesInternal: queries by_auto_reply_status_and_received_at index and returns ready messages", async () => {
      const mockMessages = [
        {
          _id: "m_ready_1",
          claimId: "c1",
          threadId: "t1",
          direction: "inbound",
          receivedAt: 1000,
          autoReplyDraft: "Clinical rebuttal text",
          detectedDetermination: "DENIAL_UPHELD",
        },
      ];

      const mockCtx: any = {
        db: {
          query: vi.fn().mockReturnValue({
            withIndex: vi.fn().mockImplementation((idxName, fn) => {
              expect(idxName).toBe("by_auto_reply_status_and_received_at");
              const qObj: any = {
                eq: vi.fn().mockReturnValue({
                  lte: vi.fn().mockReturnValue({}),
                }),
              };
              fn(qObj);
              return {
                take: vi.fn().mockResolvedValue(mockMessages),
              };
            }),
          }),
        },
      };

      const res = await (emails.getPendingAutoPilotMessagesInternal as any)._handler(mockCtx, {
        maxReceivedAt: 2000,
      });

      expect(res).toHaveLength(1);
      expect(res[0].messageId).toBe("m_ready_1");
      expect(res[0].autoReplyDraft).toBe("Clinical rebuttal text");
    });

    it("getAutoPilotMessageStateInternal: returns state and checks subsequent outbound", async () => {
      const targetMessage = {
        _id: "m_target",
        autoReplyStatus: "pending",
        autoReplyDraft: "Draft",
        receivedAt: 1000,
      };

      const mockRecent = [
        {
          _id: "m_subsequent",
          direction: "outbound",
          receivedAt: 1500,
        },
        targetMessage,
      ];

      const mockCtx: any = {
        db: {
          get: vi.fn().mockResolvedValue(targetMessage),
          query: vi.fn().mockReturnValue({
            withIndex: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                take: vi.fn().mockResolvedValue(mockRecent),
              }),
            }),
          }),
        },
      };

      const res = await (emails.getAutoPilotMessageStateInternal as any)._handler(mockCtx, {
        messageId: "m_target",
        threadId: "t1",
      });

      expect(res?.messageId).toBe("m_target");
      expect(res?.autoReplyStatus).toBe("pending");
      expect(res?.hasSubsequentOutbound).toBe(true);
    });

    it("backfillRecordedMessageIdsInternal: indexes unrecorded emailMessages into recordedAgentMailMessageIds", async () => {
      const mockEmailMsgs = [
        { _id: "em1", agentMailMessageId: "am_new_1", claimId: "c1", receivedAt: 1000 },
        { _id: "em2", agentMailMessageId: "am_already_recorded", claimId: "c1", receivedAt: 1000 },
      ];

      const mockCtx: any = {
        db: {
          query: vi.fn().mockImplementation((table) => {
            if (table === "emailMessages") {
              return {
                order: vi.fn().mockReturnValue({
                  take: vi.fn().mockResolvedValue(mockEmailMsgs),
                }),
              };
            }
            if (table === "recordedAgentMailMessageIds") {
              return {
                withIndex: vi.fn().mockImplementation((_name, fn) => {
                  const q: any = {
                    eq: vi.fn().mockImplementation((_field, val) => {
                      if (val === "am_already_recorded") {
                        return { first: vi.fn().mockResolvedValue({ _id: "r1" }) };
                      }
                      return { first: vi.fn().mockResolvedValue(null) };
                    }),
                  };
                  return fn(q);
                }),
              };
            }
            return {};
          }),
          insert: vi.fn().mockResolvedValue("new_rec_id"),
        },
      };

      const res = await (emails.backfillRecordedMessageIdsInternal as any)._handler(mockCtx, {
        limit: 10,
      });

      expect(res.backfilledCount).toBe(1);
      expect(mockCtx.db.insert).toHaveBeenCalledWith("recordedAgentMailMessageIds", expect.objectContaining({
        agentMailMessageId: "am_new_1",
      }));
    });
  });
});
