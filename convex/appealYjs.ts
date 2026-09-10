import { internalMutation, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import {
  getAuthUserId,
  getClaimIfAuthorized,
  requireAuthUser,
  requireClaimEditor,
} from "./lib/auth";

/**
 * Yjs CRDT transport for realtime co-editing of appeal briefs.
 *
 * The backend is intentionally a dumb, access-checked operation log. Yjs
 * updates are idempotent and commutative, so all merging happens on clients:
 * pushes append rows with monotonically assigned clocks, sync reads rows
 * newer than the caller's clock, and periodic full-state snapshots bound
 * history growth. No Yjs code runs server-side.
 */

const MAX_UPDATES_PER_PUSH = 100;
const MAX_UPDATE_BYTES = 900_000;
const MAX_PUSH_BYTES = 800_000;
const SYNC_TAKE = 500;
const COMPACT_DELETE_CAP = 300;
const SNAPSHOT_KEEP = 10;

function isValidClock(value: number): boolean {
  return Number.isInteger(value) && value >= -1 && value <= Number.MAX_SAFE_INTEGER;
}

/**
 * Incremental sync for one appeal brief. Returns the newest snapshot newer
 * than the caller's clock (if any) plus subsequent operation rows. Fails
 * closed with empty results for unauthenticated or unauthorized callers.
 * Viewers may read; only editors may write (see push/seed/snapshot below).
 */
export const getSync = query({
  args: {
    appealId: v.id("appeals"),
    sinceClock: v.number(),
    epoch: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return { snapshot: null, updates: [], truncated: false };
    const appeal = await ctx.db.get(args.appealId);
    if (!appeal) return { snapshot: null, updates: [], truncated: false };
    const authorized = await getClaimIfAuthorized(ctx, appeal.claimId);
    if (!authorized) return { snapshot: null, updates: [], truncated: false };
    void args.epoch;

    const since = isValidClock(args.sinceClock) ? Math.floor(args.sinceClock) : -1;

    const snapshotDoc = await ctx.db
      .query("appealYjsUpdates")
      .withIndex("by_appeal_and_snapshot", (q) =>
        q.eq("appealId", args.appealId).eq("isSnapshot", true)
      )
      .order("desc")
      .first();

    const base = snapshotDoc ? Math.max(since, snapshotDoc.clock) : since;
    const rows = await ctx.db
      .query("appealYjsUpdates")
      .withIndex("by_appeal_and_clock", (q) => q.eq("appealId", args.appealId).gt("clock", base))
      .order("asc")
      .take(SYNC_TAKE);

    return {
      snapshot:
        snapshotDoc && snapshotDoc.clock > since
          ? { clock: snapshotDoc.clock, update: snapshotDoc.update }
          : null,
      updates: rows
        .filter((row) => !row.isSnapshot)
        .map((row) => ({ clock: row.clock, update: row.update })),
      truncated: rows.length === SYNC_TAKE,
    };
  },
});

function assertPushableUpdates(updates: ArrayBuffer[]) {
  if (updates.length === 0 || updates.length > MAX_UPDATES_PER_PUSH) {
    throw new Error(
      `Invalid Yjs push: expected 1-${MAX_UPDATES_PER_PUSH} updates, got ${updates.length}`
    );
  }
  let total = 0;
  for (const update of updates) {
    const size = update.byteLength;
    if (size === 0 || size > MAX_UPDATE_BYTES) {
      throw new Error(`Invalid Yjs update: size ${size} bytes is outside 1-${MAX_UPDATE_BYTES}`);
    }
    total += size;
  }
  if (total > MAX_PUSH_BYTES) {
    throw new Error(
      `Yjs push batch too large (${total} bytes); split it into smaller batches`
    );
  }
}

/**
 * Append locally generated Yjs updates to the shared log with server-assigned
 * clocks. Editors and owners only; viewers are read-only. Concurrent pushes
 * may share clocks, which is harmless because Yjs merges idempotently.
 */
export const pushUpdates = mutation({
  args: {
    appealId: v.id("appeals"),
    updates: v.array(v.bytes()),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuthUser(ctx);
    assertPushableUpdates(args.updates);
    const appeal = await ctx.db.get(args.appealId);
    if (!appeal) {
      throw new Error(`Appeal ${args.appealId} not found`);
    }
    await requireClaimEditor(ctx, appeal.claimId);

    const last = await ctx.db
      .query("appealYjsUpdates")
      .withIndex("by_appeal_and_clock", (q) => q.eq("appealId", args.appealId))
      .order("desc")
      .first();

    let clock = last ? last.clock : -1;
    const now = Date.now();
    for (const update of args.updates) {
      clock += 1;
      await ctx.db.insert("appealYjsUpdates", {
        appealId: args.appealId,
        clock,
        isSnapshot: false,
        update,
        authorId: userId,
        createdAt: now,
      });
    }
    return { baseClock: clock, count: args.updates.length };
  },
});

/**
 * Seed a legacy brief (created before CRDT sync existed) into the op log.
 * Only the first committer wins: concurrent seeds race through OCC, the loser
 * retries, observes the winner's row, and reports seeded:false so the client
 * discards its provisional encoding and syncs the winner instead.
 */
export const seedAppealDoc = mutation({
  args: {
    appealId: v.id("appeals"),
    update: v.bytes(),
    contentHash: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuthUser(ctx);
    if (args.update.byteLength === 0 || args.update.byteLength > MAX_UPDATE_BYTES) {
      throw new Error("Invalid Yjs seed update size");
    }
    if (!args.contentHash || args.contentHash.length > 128) {
      throw new Error("Invalid seed content hash");
    }
    const appeal = await ctx.db.get(args.appealId);
    if (!appeal) {
      throw new Error(`Appeal ${args.appealId} not found`);
    }
    await requireClaimEditor(ctx, appeal.claimId);

    const existing = await ctx.db
      .query("appealYjsUpdates")
      .withIndex("by_appeal_and_clock", (q) => q.eq("appealId", args.appealId))
      .order("asc")
      .first();
    if (existing) {
      return { seeded: false as const, clock: existing.clock };
    }

    await ctx.db.insert("appealYjsUpdates", {
      appealId: args.appealId,
      clock: 0,
      isSnapshot: false,
      update: args.update,
      authorId: userId,
      contentHash: args.contentHash,
      createdAt: Date.now(),
    });
    return { seeded: true as const, clock: 0 };
  },
});

/**
 * Store a full-state snapshot covering all rows up to baseClock, then delete
 * covered operation rows (bounded) and prune older snapshots. Editors only.
 * Deletion is safe because the snapshot encodes the same merged state.
 */
export const pushSnapshot = mutation({
  args: {
    appealId: v.id("appeals"),
    baseClock: v.number(),
    snapshot: v.bytes(),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuthUser(ctx);
    if (!Number.isInteger(args.baseClock) || args.baseClock < 0) {
      throw new Error("Invalid snapshot base clock");
    }
    if (args.snapshot.byteLength === 0 || args.snapshot.byteLength > MAX_UPDATE_BYTES) {
      throw new Error("Invalid Yjs snapshot size");
    }
    const appeal = await ctx.db.get(args.appealId);
    if (!appeal) {
      throw new Error(`Appeal ${args.appealId} not found`);
    }
    await requireClaimEditor(ctx, appeal.claimId);

    const now = Date.now();
    await ctx.db.insert("appealYjsUpdates", {
      appealId: args.appealId,
      clock: args.baseClock,
      isSnapshot: true,
      update: args.snapshot,
      authorId: userId,
      createdAt: now,
    });

    let deleted = 0;
    const covered = await ctx.db
      .query("appealYjsUpdates")
      .withIndex("by_appeal_and_clock", (q) =>
        q.eq("appealId", args.appealId).lte("clock", args.baseClock)
      )
      .order("asc")
      .take(COMPACT_DELETE_CAP + 1);
    for (const row of covered) {
      if (row.isSnapshot) continue;
      if (deleted >= COMPACT_DELETE_CAP) break;
      await ctx.db.delete(row._id);
      deleted += 1;
    }

    const snapshots = await ctx.db
      .query("appealYjsUpdates")
      .withIndex("by_appeal_and_snapshot", (q) =>
        q.eq("appealId", args.appealId).eq("isSnapshot", true)
      )
      .order("desc")
      .take(SNAPSHOT_KEEP + 1);
    let prunedSnapshots = 0;
    for (const snap of snapshots.slice(1)) {
      await ctx.db.delete(snap._id);
      prunedSnapshots += 1;
    }

    return { snapshotClock: args.baseClock, deleted, prunedSnapshots };
  },
});

/**
 * Bounded purge of one appeal's Yjs rows for the deleteCase cascade.
 */
export const purgeAppealInternal = internalMutation({
  args: {
    appealId: v.id("appeals"),
  },
  handler: async (ctx, args) => {
    const batch = await ctx.db
      .query("appealYjsUpdates")
      .withIndex("by_appeal_and_clock", (q) => q.eq("appealId", args.appealId))
      .order("asc")
      .take(200);
    for (const row of batch) {
      await ctx.db.delete(row._id);
    }
    if (batch.length === 200) {
      await ctx.scheduler.runAfter(0, internal.appealYjs.purgeAppealInternal, {
        appealId: args.appealId,
      });
    }
  },
});
