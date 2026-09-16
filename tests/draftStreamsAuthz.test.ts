import { describe, it, expect, vi } from "vitest";
import * as draftStreams from "../convex/draftStreams";

const EMPTY_PAGE = {
  page: [],
  isDone: true,
  continueCursor: "",
  streams: undefined,
};

describe("convex/draftStreams: drafting thread ownership", () => {
  it("getDraftStream: returns an empty stream page when unauthenticated", async () => {
    const mockCtx: any = {
      auth: { getUserIdentity: vi.fn().mockResolvedValue(null) },
    };

    const res = await (draftStreams.getDraftStream as any)._handler(mockCtx, {
      threadId: "thread_1",
      paginationOpts: { cursor: null, numItems: 10 },
      streamArgs: {},
    });

    expect(res).toEqual(EMPTY_PAGE);
  });

  it("getDraftStream: returns an empty stream page for another user's thread", async () => {
    const mockCtx: any = {
      auth: { getUserIdentity: vi.fn().mockResolvedValue({ subject: "user_attacker" }) },
      db: { normalizeId: (_table: string, id: string) => id },
      runQuery: vi.fn().mockResolvedValue({ userId: "user_victim" }),
    };

    const res = await (draftStreams.getDraftStream as any)._handler(mockCtx, {
      threadId: "thread_victim",
      paginationOpts: { cursor: null, numItems: 10 },
      streamArgs: {},
    });

    expect(res).toEqual(EMPTY_PAGE);
  });

  it("getDraftStream: returns an empty stream page for an unknown thread", async () => {
    const mockCtx: any = {
      auth: { getUserIdentity: vi.fn().mockResolvedValue({ subject: "user_1" }) },
      db: { normalizeId: (_table: string, id: string) => id },
      runQuery: vi.fn().mockResolvedValue(null),
    };

    const res = await (draftStreams.getDraftStream as any)._handler(mockCtx, {
      threadId: "thread_missing",
      paginationOpts: { cursor: null, numItems: 10 },
      streamArgs: {},
    });

    expect(res).toEqual(EMPTY_PAGE);
  });

  it("startDraftThread: creates and records a thread owned by the claim owner", async () => {
    const insert = vi.fn().mockResolvedValue("draft_row_1");
    const mockCtx: any = {
      auth: { getUserIdentity: vi.fn().mockResolvedValue({ subject: "user_1" }) },
      db: {
        normalizeId: (_table: string, id: string) => id,
        get: vi.fn().mockResolvedValue({ _id: "claim_1", userId: "user_1" }),
        query: vi.fn().mockReturnValue({
          withIndex: vi.fn().mockReturnValue({ first: vi.fn().mockResolvedValue(null) }),
        }),
        insert,
        delete: vi.fn(),
      },
      runMutation: vi.fn().mockResolvedValue({ _id: "thread_created" }),
    };

    const res = await (draftStreams.startDraftThread as any)._handler(mockCtx, {
      claimId: "claim_1",
      kind: "appeal_brief",
    });

    expect(res).toEqual({ threadId: "thread_created" });
    expect(mockCtx.runMutation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ userId: "user_1", title: "Appeal brief drafting" })
    );
    expect(insert).toHaveBeenCalledWith(
      "draftThreads",
      expect.objectContaining({
        userId: "user_1",
        claimId: "claim_1",
        kind: "appeal_brief",
        threadId: "thread_created",
      })
    );
  });

  it("startDraftThread: retires the previous drafting thread instead of accumulating it", async () => {
    const remove = vi.fn().mockResolvedValue(undefined);
    const mockCtx: any = {
      auth: { getUserIdentity: vi.fn().mockResolvedValue({ subject: "user_1" }) },
      db: {
        normalizeId: (_table: string, id: string) => id,
        get: vi.fn().mockResolvedValue({ _id: "claim_1", userId: "user_1" }),
        query: vi.fn().mockReturnValue({
          withIndex: vi.fn().mockReturnValue({
            first: vi.fn().mockResolvedValue({
              _id: "draft_row_old",
              threadId: "thread_previous",
              claimId: "claim_1",
              kind: "p2p_script",
            }),
          }),
        }),
        insert: vi.fn().mockResolvedValue("draft_row_2"),
        delete: remove,
      },
      runMutation: vi.fn().mockImplementation((_ref, payload) => {
        if (payload?.threadId === "thread_previous") return Promise.resolve(undefined);
        return Promise.resolve({ _id: "thread_created_2" });
      }),
    };

    const res = await (draftStreams.startDraftThread as any)._handler(mockCtx, {
      claimId: "claim_1",
      kind: "p2p_script",
    });

    expect(res).toEqual({ threadId: "thread_created_2" });
    expect(remove).toHaveBeenCalledWith("draft_row_old");
  });

  it("getDraftThread: returns the bound thread and rejects non-owners", async () => {
    const mockCtx: any = {
      auth: { getUserIdentity: vi.fn().mockResolvedValue({ subject: "user_1" }) },
      db: {
        normalizeId: (_table: string, id: string) => id,
        get: vi.fn().mockResolvedValue({ _id: "claim_1", userId: "user_1" }),
        query: vi.fn().mockReturnValue({
          withIndex: vi.fn().mockReturnValue({
            first: vi.fn().mockResolvedValue({ threadId: "thread_bound" }),
          }),
        }),
      },
    };

    const res = await (draftStreams.getDraftThread as any)._handler(mockCtx, {
      claimId: "claim_1",
      kind: "appeal_brief",
    });

    expect(res).toEqual({ threadId: "thread_bound" });

    mockCtx.db.get = vi.fn().mockResolvedValue({ _id: "claim_victim", userId: "user_victim" });
    await expect(
      (draftStreams.getDraftThread as any)._handler(mockCtx, {
        claimId: "claim_victim",
        kind: "appeal_brief",
      })
    ).rejects.toThrow(/Forbidden/);
  });

  it("startDraftThread: rejects a caller that does not own the claim", async () => {
    const mockCtx: any = {
      auth: { getUserIdentity: vi.fn().mockResolvedValue({ subject: "user_attacker" }) },
      db: {
        normalizeId: (_table: string, id: string) => id,
        get: vi.fn().mockResolvedValue({ _id: "claim_victim", userId: "user_victim" }),
        query: vi.fn(),
      },
      runMutation: vi.fn().mockResolvedValue({ _id: "thread_should_not_exist" }),
    };

    await expect(
      (draftStreams.startDraftThread as any)._handler(mockCtx, {
        claimId: "claim_victim",
        kind: "p2p_script",
      })
    ).rejects.toThrow(/Forbidden/);

    expect(mockCtx.runMutation).not.toHaveBeenCalled();
  });

  it("startDraftThread: rejects an unauthenticated caller", async () => {
    const mockCtx: any = {
      auth: { getUserIdentity: vi.fn().mockResolvedValue(null) },
      db: { normalizeId: (_table: string, id: string) => id, get: vi.fn(), query: vi.fn() },
      runMutation: vi.fn(),
    };

    await expect(
      (draftStreams.startDraftThread as any)._handler(mockCtx, {
        claimId: "claim_1",
        kind: "p2p_script",
      })
    ).rejects.toThrow(/Unauthorized/);
  });
});
