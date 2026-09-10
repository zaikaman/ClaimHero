import { describe, it, expect, vi, beforeEach } from "vitest";
import * as Y from "yjs";
import { getAuthUserId } from "@convex-dev/auth/server";
import * as appealYjs from "../convex/appealYjs";
import { toArrayBuffer } from "../src/lib/yjsBrief";

vi.mock("@convex-dev/auth/server", () => ({
  getAuthUserId: vi.fn(),
}));

interface YRow {
  _id: string;
  appealId: string;
  clock: number;
  isSnapshot: boolean;
  update: ArrayBuffer;
  authorId?: string;
  contentHash?: string;
  createdAt: number;
}

interface Condition {
  field: string;
  op: "eq" | "gt" | "gte" | "lt" | "lte";
  value: unknown;
}

function testRow(row: YRow, conds: Condition[]): boolean {
  return conds.every((cond) => {
    const actual = (row as unknown as Record<string, unknown>)[cond.field];
    switch (cond.op) {
      case "eq":
        return actual === cond.value;
      case "gt":
        return (actual as number) > (cond.value as number);
      case "gte":
        return (actual as number) >= (cond.value as number);
      case "lt":
        return (actual as number) < (cond.value as number);
      case "lte":
        return (actual as number) <= (cond.value as number);
    }
  });
}

/** In-memory stand-in for the appealYjsUpdates table plus auth lookups. */
function createFakeDb(opts: {
  appeal?: { _id: string; claimId: string };
  claim?: { _id: string; userId: string };
  user?: { _id: string; email?: string };
  grants?: Array<{ status: string; role: string; userId?: string; email?: string }>;
  rows?: YRow[];
}) {
  const rows: YRow[] = [...(opts.rows ?? [])];
  let seq = 1000;
  const scheduled: Array<{ fn: unknown; args: unknown }> = [];
  const db: {
    get: ReturnType<typeof vi.fn>;
    query: ReturnType<typeof vi.fn>;
    insert: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
    rows: YRow[];
    scheduled: typeof scheduled;
  } = {
    rows,
    scheduled,
    get: vi.fn(async (id: string) => {
      if (opts.appeal && id === opts.appeal._id) return opts.appeal;
      if (opts.claim && id === opts.claim._id) return opts.claim;
      if (opts.user && id === opts.user._id) return opts.user;
      return null;
    }),
    query: vi.fn((table: string) => {
      if (table === "claimCollaborators") {
        const active = (opts.grants ?? []).filter((grant) => grant.status === "active");
        return {
          withIndex: vi.fn().mockReturnValue({
            first: vi.fn().mockResolvedValue(active[0] ?? null),
            take: vi.fn().mockResolvedValue(active),
          }),
        };
      }
      if (table === "appealYjsUpdates") {
        return {
          withIndex: vi.fn((_name: string, range: (q: unknown) => unknown) => {
            const conds: Condition[] = [];
            const collector: Record<string, (...args: never[]) => unknown> = {};
            for (const op of ["eq", "gt", "gte", "lt", "lte"] as const) {
              collector[op] = ((field: string, value: unknown) => {
                conds.push({ field, op, value });
                return collector;
              }) as never;
            }
            range(collector);
            const filtered = rows.filter((row) => testRow(row, conds));
            return {
              order: vi.fn((dir: "asc" | "desc") => {
                const sorted = [...filtered].sort((a, b) =>
                  dir === "asc" ? a.clock - b.clock : b.clock - a.clock
                );
                return {
                  first: vi.fn().mockResolvedValue(sorted[0] ?? null),
                  take: vi.fn().mockResolvedValue(sorted.slice(0, 500)),
                };
              }),
              first: vi.fn().mockResolvedValue(filtered[0] ?? null),
              take: vi.fn().mockResolvedValue(filtered.slice(0, 500)),
            };
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    }),
    insert: vi.fn(async (_table: string, doc: Omit<YRow, "_id">) => {
      const _id = `y_${seq++}`;
      rows.push({ ...doc, _id });
      return _id as never;
    }),
    delete: vi.fn(async (id: string) => {
      const index = rows.findIndex((row) => row._id === id);
      if (index >= 0) rows.splice(index, 1);
    }),
  };
  const ctx = {
    db,
    scheduler: { runAfter: vi.fn(async (_delay: number, fn: unknown, args: unknown) => {
      scheduled.push({ fn, args });
    }) },
  };
  return { ctx: ctx as never, db, rows };
}

function opUpdate(text: string): ArrayBuffer {
  const doc = new Y.Doc();
  doc.getText("brief").insert(0, text);
  const update = Y.encodeStateAsUpdate(doc);
  doc.destroy();
  return toArrayBuffer(update);
}

const appeal = { _id: "appeal_1", claimId: "claim_1" };
const claim = { _id: "claim_1", userId: "user_owner" };
const owner = { _id: "user_owner", email: "owner@clinic.org" };

describe("appealYjs CRDT transport", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getSync", () => {
    it("fails closed for unauthenticated and unauthorized callers", async () => {
      vi.mocked(getAuthUserId).mockResolvedValue(null);
      const { ctx } = createFakeDb({ appeal, claim, user: owner });
      await expect(
        (appealYjs.getSync as { _handler: (ctx: never, args: never) => Promise<unknown> })._handler(
          ctx,
          { appealId: "appeal_1", sinceClock: -1 } as never
        )
      ).resolves.toEqual({ snapshot: null, updates: [], truncated: false });

      vi.mocked(getAuthUserId).mockResolvedValue("user_stranger" as never);
      const stranger = createFakeDb({
        appeal,
        claim,
        user: { _id: "user_stranger", email: "s@clinic.org" },
      });
      await expect(
        (appealYjs.getSync as { _handler: (ctx: never, args: never) => Promise<unknown> })._handler(
          stranger.ctx,
          { appealId: "appeal_1", sinceClock: -1 } as never
        )
      ).resolves.toEqual({ snapshot: null, updates: [], truncated: false });
    });

    it("returns snapshot plus newer ops for viewers and owners", async () => {
      vi.mocked(getAuthUserId).mockResolvedValue("user_owner" as never);
      const snap = opUpdate("base");
      const op1 = opUpdate("base plus one");
      const { ctx } = createFakeDb({
        appeal,
        claim,
        user: owner,
        rows: [
          { _id: "y_1", appealId: "appeal_1", clock: 0, isSnapshot: false, update: snap, createdAt: 1 },
          { _id: "y_2", appealId: "appeal_1", clock: 5, isSnapshot: true, update: snap, createdAt: 2 },
          { _id: "y_3", appealId: "appeal_1", clock: 6, isSnapshot: false, update: op1, createdAt: 3 },
        ],
      });
      const res = (await (
        appealYjs.getSync as { _handler: (ctx: never, args: never) => Promise<{ snapshot: { clock: number } | null; updates: { clock: number }[]; truncated: boolean }> }
      )._handler(ctx, { appealId: "appeal_1", sinceClock: -1 } as never));
      expect(res.snapshot?.clock).toBe(5);
      expect(res.updates.map((row) => row.clock)).toEqual([6]);
      expect(res.truncated).toBe(false);

      const caughtUp = (await (
        appealYjs.getSync as { _handler: (ctx: never, args: never) => Promise<{ snapshot: unknown; updates: unknown[] }> }
      )._handler(ctx, { appealId: "appeal_1", sinceClock: 6 } as never));
      expect(caughtUp.snapshot).toBeNull();
      expect(caughtUp.updates).toEqual([]);
    });
  });

  describe("pushUpdates", () => {
    it("assigns sequential clocks and records the author", async () => {
      vi.mocked(getAuthUserId).mockResolvedValue("user_owner" as never);
      const { ctx, rows } = createFakeDb({ appeal, claim, user: owner });
      const handler = appealYjs.pushUpdates as {
        _handler: (ctx: never, args: never) => Promise<{ baseClock: number; count: number }>;
      };
      const first = await handler._handler(ctx, {
        appealId: "appeal_1",
        updates: [opUpdate("a"), opUpdate("b")],
      } as never);
      expect(first).toEqual({ baseClock: 1, count: 2 });
      const second = await handler._handler(ctx, { appealId: "appeal_1", updates: [opUpdate("c")] } as never);
      expect(second).toEqual({ baseClock: 2, count: 1 });
      expect(rows.map((row) => row.clock)).toEqual([0, 1, 2]);
      expect(rows.every((row) => row.authorId === "user_owner")).toBe(true);
    });

    it("rejects viewers, strangers, and malformed batches", async () => {
      const handler = appealYjs.pushUpdates as {
        _handler: (ctx: never, args: never) => Promise<unknown>;
      };
      vi.mocked(getAuthUserId).mockResolvedValue("user_view" as never);
      const viewerCtx = createFakeDb({
        appeal,
        claim,
        user: { _id: "user_view", email: "v@clinic.org" },
        grants: [{ status: "active", role: "viewer", userId: "user_view", email: "v@clinic.org" }],
      });
      await expect(
        handler._handler(viewerCtx.ctx, { appealId: "appeal_1", updates: [opUpdate("x")] } as never)
      ).rejects.toThrow(/read-only/i);

      vi.mocked(getAuthUserId).mockResolvedValue(null);
      const anonCtx = createFakeDb({ appeal, claim, user: owner });
      await expect(
        handler._handler(anonCtx.ctx, { appealId: "appeal_1", updates: [opUpdate("x")] } as never)
      ).rejects.toThrow(/Unauthorized/i);

      vi.mocked(getAuthUserId).mockResolvedValue("user_owner" as never);
      const ownerCtx = createFakeDb({ appeal, claim, user: owner });
      await expect(handler._handler(ownerCtx.ctx, { appealId: "appeal_1", updates: [] } as never)).rejects.toThrow(
        /1-100/
      );
      await expect(
        handler._handler(ownerCtx.ctx, { appealId: "appeal_1", updates: [new ArrayBuffer(0)] } as never)
      ).rejects.toThrow(/size/i);
    });

    it("round-trips pushed bytes back through getSync into a converging doc", async () => {
      vi.mocked(getAuthUserId).mockResolvedValue("user_owner" as never);
      const { ctx } = createFakeDb({ appeal, claim, user: owner });
      const writer = new Y.Doc();
      writer.getText("brief").insert(0, "co-authored brief");
      const update = Y.encodeStateAsUpdate(writer);
      await (
        appealYjs.pushUpdates as { _handler: (ctx: never, args: never) => Promise<unknown> }
      )._handler(ctx, { appealId: "appeal_1", updates: [toArrayBuffer(update)] } as never);

      const sync = (await (
        appealYjs.getSync as { _handler: (ctx: never, args: never) => Promise<{ updates: { update: ArrayBuffer }[] }> }
      )._handler(ctx, { appealId: "appeal_1", sinceClock: -1 } as never));
      const reader = new Y.Doc();
      for (const row of sync.updates) {
        Y.applyUpdate(reader, new Uint8Array(row.update), "remote");
      }
      expect(reader.getText("brief").toString()).toBe("co-authored brief");
      writer.destroy();
      reader.destroy();
    });
  });

  describe("seedAppealDoc", () => {
    it("lets the first seeder win and reports losers", async () => {
      vi.mocked(getAuthUserId).mockResolvedValue("user_owner" as never);
      const { ctx, rows } = createFakeDb({ appeal, claim, user: owner });
      const handler = appealYjs.seedAppealDoc as {
        _handler: (ctx: never, args: never) => Promise<{ seeded: boolean; clock: number }>;
      };
      const first = await handler._handler(ctx, {
        appealId: "appeal_1",
        update: opUpdate("legacy brief"),
        contentHash: "abc123",
      } as never);
      expect(first).toEqual({ seeded: true, clock: 0 });
      const second = await handler._handler(ctx, {
        appealId: "appeal_1",
        update: opUpdate("legacy brief"),
        contentHash: "abc123",
      } as never);
      expect(second).toEqual({ seeded: false, clock: 0 });
      expect(rows).toHaveLength(1);
    });
  });

  describe("pushSnapshot", () => {
    it("stores the snapshot, deletes covered ops, and keeps only the newest snapshot", async () => {
      vi.mocked(getAuthUserId).mockResolvedValue("user_owner" as never);
      const op = opUpdate("op");
      const snapOld = opUpdate("old snap");
      const snapNew = opUpdate("new snap");
      const { ctx, rows } = createFakeDb({
        appeal,
        claim,
        user: owner,
        rows: [
          { _id: "y_1", appealId: "appeal_1", clock: 0, isSnapshot: false, update: op, createdAt: 1 },
          { _id: "y_2", appealId: "appeal_1", clock: 1, isSnapshot: true, update: snapOld, createdAt: 2 },
          { _id: "y_3", appealId: "appeal_1", clock: 2, isSnapshot: false, update: op, createdAt: 3 },
        ],
      });
      const res = (await (
        appealYjs.pushSnapshot as { _handler: (ctx: never, args: never) => Promise<{ snapshotClock: number; deleted: number; prunedSnapshots: number }> }
      )._handler(ctx, { appealId: "appeal_1", baseClock: 2, snapshot: snapNew } as never));
      expect(res.snapshotClock).toBe(2);
      expect(res.deleted).toBe(2);
      expect(res.prunedSnapshots).toBe(1);
      expect(rows.filter((row) => !row.isSnapshot)).toHaveLength(0);
      const remainingSnapshots = rows.filter((row) => row.isSnapshot);
      expect(remainingSnapshots).toHaveLength(1);
      expect(remainingSnapshots[0].clock).toBe(2);
    });

    it("rejects viewers", async () => {
      vi.mocked(getAuthUserId).mockResolvedValue("user_view" as never);
      const viewerCtx = createFakeDb({
        appeal,
        claim,
        user: { _id: "user_view", email: "v@clinic.org" },
        grants: [{ status: "active", role: "viewer", userId: "user_view", email: "v@clinic.org" }],
      });
      await expect(
        (
          appealYjs.pushSnapshot as { _handler: (ctx: never, args: never) => Promise<unknown> }
        )._handler(viewerCtx.ctx, { appealId: "appeal_1", baseClock: 0, snapshot: opUpdate("s") } as never)
      ).rejects.toThrow(/read-only/i);
    });
  });

  describe("purgeAppealInternal", () => {
    it("deletes all rows and continues when the batch is full", async () => {
      const many: YRow[] = Array.from({ length: 200 }, (_, index) => ({
        _id: `y_${index}`,
        appealId: "appeal_1",
        clock: index,
        isSnapshot: false,
        update: opUpdate("x"),
        createdAt: index,
      }));
      const { ctx, rows, db } = createFakeDb({ appeal, claim, user: owner, rows: many });
      await (
        appealYjs.purgeAppealInternal as { _handler: (ctx: never, args: never) => Promise<unknown> }
      )._handler(ctx, { appealId: "appeal_1" } as never);
      expect(rows).toHaveLength(0);
      expect(db.scheduled).toHaveLength(1);
    });

    it("stops scheduling once drained", async () => {
      const { ctx, rows, db } = createFakeDb({
        appeal,
        claim,
        user: owner,
        rows: [
          { _id: "y_1", appealId: "appeal_1", clock: 0, isSnapshot: false, update: opUpdate("x"), createdAt: 1 },
        ],
      });
      await (
        appealYjs.purgeAppealInternal as { _handler: (ctx: never, args: never) => Promise<unknown> }
      )._handler(ctx, { appealId: "appeal_1" } as never);
      expect(rows).toHaveLength(0);
      expect(db.scheduled).toHaveLength(0);
    });
  });
});
