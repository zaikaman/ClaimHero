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
});
