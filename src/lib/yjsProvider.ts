import * as Y from "yjs";
import {
  YJS_LOCAL_ORIGIN,
  YJS_REMOTE_ORIGIN,
  YJS_SEED_ORIGIN,
  fromArrayBuffer,
  hashContent,
  splitByteBatch,
  toArrayBuffer,
} from "./yjsBrief";

/**
 * Transport between one appeal's shared Y.Doc and the Convex op log.
 *
 * Design notes:
 * - Only origin "local" updates are queued for upload. Seed encodings are
 *   built on throwaway docs so a lost seed race never pollutes the live doc.
 * - Convergent by construction: concurrent pushes may share clocks and late
 *   joiners may replay rows the merger already holds; Yjs absorbs both.
 * - Snapshots are taken only by clients that actually pushed edits, so a
 *   crowd of fresh joiners cannot trigger a snapshot stampede.
 * - Editing readiness is separate from connection status: once bootstrapped
 *   the doc is local-first, so offline typing keeps working and flushes later.
 */

export type BriefSyncStatus = "bootstrapping" | "live" | "offline";

export interface SyncRow {
  clock: number;
  update: ArrayBuffer;
}

export interface SyncPayload {
  snapshot: { clock: number; update: ArrayBuffer } | null;
  updates: SyncRow[];
  truncated: boolean;
}

export interface BriefSyncCallbacks {
  pushUpdates: (updates: ArrayBuffer[]) => Promise<unknown>;
  seedDoc: (update: ArrayBuffer, contentHash: string) => Promise<{ seeded: boolean }>;
  pushSnapshot: (baseClock: number, snapshot: ArrayBuffer) => Promise<unknown>;
  onRemoteBatch: (applied: number) => void;
  onClock: (maxClock: number) => void;
  onNeedRefetch: () => void;
  onStatus: (status: BriefSyncStatus) => void;
  onReady: () => void;
}

const FLUSH_MS = 300;
const RETRY_MS = 3000;
const PUSH_MAX_COUNT = 100;
const PUSH_MAX_BYTES = 700_000;
const SNAPSHOT_EVERY_OPS = 400;
const SNAPSHOT_MIN_INTERVAL_MS = 60_000;

export class BriefSyncProvider {
  readonly doc = new Y.Doc();
  readonly ytext: Y.Text = this.doc.getText("brief");
  readonly appealId: string;
  readonly isEditor: boolean;

  private cbs: BriefSyncCallbacks;
  private baseline: string;
  private queue: Uint8Array[] = [];
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private seedRetryTimer: ReturnType<typeof setTimeout> | null = null;
  private destroyed = false;
  private bootstrapped = false;
  private ready = false;
  private seedAttempted = false;
  private appliedClock = -1;
  private opsSinceSnapshot = 0;
  private pushedSinceSnapshot = 0;
  private snapshotInFlight = false;
  private lastSnapshotAt = 0;
  private pumping = false;
  private latestPayload: SyncPayload | null = null;
  private status: BriefSyncStatus = "bootstrapping";

  private updateListener = (update: Uint8Array, origin: unknown) => {
    if (this.destroyed || origin !== YJS_LOCAL_ORIGIN) return;
    this.queue.push(update);
    this.scheduleFlush();
  };

  constructor(appealId: string, opts: { baseline: string; isEditor: boolean; cbs: BriefSyncCallbacks }) {
    this.appealId = appealId;
    this.baseline = opts.baseline;
    this.isEditor = opts.isEditor;
    this.cbs = opts.cbs;
    this.doc.on("update", this.updateListener);
  }

  get clock(): number {
    return this.appliedClock;
  }

  get pendingCount(): number {
    return this.queue.length;
  }

  get isReady(): boolean {
    return this.ready;
  }

  destroy() {
    this.destroyed = true;
    if (this.flushTimer) clearTimeout(this.flushTimer);
    if (this.retryTimer) clearTimeout(this.retryTimer);
    if (this.seedRetryTimer) clearTimeout(this.seedRetryTimer);
    this.flushTimer = this.retryTimer = this.seedRetryTimer = null;
    this.queue = [];
    this.latestPayload = null;
    try {
      this.doc.off("update", this.updateListener);
    } catch {
      // Listener may already be detached.
    }
    this.doc.destroy();
  }

  /** Queue a sync payload; processed serially so seed races cannot interleave. */
  enqueueSync(payload: SyncPayload) {
    if (this.destroyed) return;
    this.latestPayload = payload;
    void this.pump();
  }

  /** Force-flush queued ops (e.g. before unmount). Best effort. */
  flushNow() {
    if (this.destroyed || !this.isEditor || this.queue.length === 0) return;
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    void this.flush();
  }

  private setStatus(status: BriefSyncStatus) {
    if (this.destroyed || this.status === status) return;
    this.status = status;
    try {
      this.cbs.onStatus(status);
    } catch {
      // Status listeners must never break sync.
    }
  }

  private markReady() {
    if (this.destroyed || this.ready) return;
    this.ready = true;
    if (this.status === "bootstrapping") this.setStatus("live");
    try {
      this.cbs.onReady();
    } catch {
      // Ignore listener faults.
    }
  }

  private async pump() {
    if (this.pumping || this.destroyed) return;
    this.pumping = true;
    try {
      while (this.latestPayload && !this.destroyed) {
        const job = this.latestPayload;
        this.latestPayload = null;
        await this.applyOne(job);
      }
    } finally {
      this.pumping = false;
    }
  }

  private async applyOne(payload: SyncPayload) {
    const wasBootstrapped = this.bootstrapped;
    let maxClock = this.appliedClock;
    let appliedRemote = 0;

    if (payload.snapshot) {
      Y.applyUpdate(this.doc, fromArrayBuffer(payload.snapshot.update), YJS_REMOTE_ORIGIN);
      maxClock = Math.max(maxClock, payload.snapshot.clock);
      appliedRemote += 1;
    }
    for (const row of payload.updates) {
      Y.applyUpdate(this.doc, fromArrayBuffer(row.update), YJS_REMOTE_ORIGIN);
      maxClock = Math.max(maxClock, row.clock);
      appliedRemote += 1;
    }
    this.appliedClock = maxClock;
    this.opsSinceSnapshot += payload.updates.length;
    this.emitClock();

    if (!wasBootstrapped) {
      this.bootstrapped = true;
      await this.bootstrap(payload);
      return;
    }

    if (appliedRemote > 0) {
      try {
        this.cbs.onRemoteBatch(appliedRemote);
      } catch {
        // Ignore listener faults.
      }
    }
    this.maybeSnapshot();
  }

  private emitClock() {
    try {
      this.cbs.onClock(this.appliedClock);
    } catch {
      // Ignore listener faults.
    }
  }

  private async bootstrap(payload: SyncPayload) {
    const logEmpty = !payload.snapshot && payload.updates.length === 0;
    if (logEmpty && this.baseline && this.isEditor && !this.seedAttempted) {
      this.seedAttempted = true;
      await this.attemptSeed(this.baseline);
      return;
    }
    if (logEmpty && this.baseline && this.ytext.length === 0 && !this.isEditor) {
      // Viewers mirror legacy content read-only; origin "seed" is never queued.
      this.doc.transact(() => {
        this.ytext.insert(0, this.baseline);
      }, YJS_SEED_ORIGIN);
    }
    this.markReady();
  }

  /** Seed encoding built on a throwaway doc: losing the race discards the
   * encoding without touching the live document. */
  static encodeSeed(content: string): Uint8Array {
    const tmp = new Y.Doc();
    try {
      tmp.getText("brief").insert(0, content);
      return Y.encodeStateAsUpdate(tmp);
    } finally {
      tmp.destroy();
    }
  }

  private async attemptSeed(baseline: string) {
    if (this.destroyed) return;
    const seedUpdate = BriefSyncProvider.encodeSeed(baseline);
    try {
      const res = await this.cbs.seedDoc(toArrayBuffer(seedUpdate), hashContent(baseline));
      if (this.destroyed) return;
      if (res.seeded) {
        Y.applyUpdate(this.doc, seedUpdate, YJS_REMOTE_ORIGIN);
        this.appliedClock = Math.max(this.appliedClock, 0);
        this.emitClock();
      } else {
        // Lost the race: the winner's rows are waiting, refetch them.
        this.cbs.onNeedRefetch();
      }
      this.markReady();
    } catch {
      // Likely offline: retry shortly instead of stranding the baseline.
      this.seedAttempted = false;
      if (this.seedRetryTimer) clearTimeout(this.seedRetryTimer);
      this.seedRetryTimer = setTimeout(() => {
        this.seedRetryTimer = null;
        if (!this.destroyed) this.cbs.onNeedRefetch();
      }, RETRY_MS);
    }
  }

  private maybeSnapshot() {
    if (
      !this.isEditor ||
      this.destroyed ||
      this.snapshotInFlight ||
      this.opsSinceSnapshot < SNAPSHOT_EVERY_OPS ||
      this.pushedSinceSnapshot === 0 ||
      Date.now() - this.lastSnapshotAt < SNAPSHOT_MIN_INTERVAL_MS
    ) {
      return;
    }
    this.snapshotInFlight = true;
    const baseClock = this.appliedClock;
    let snapshot: Uint8Array;
    try {
      snapshot = Y.encodeStateAsUpdate(this.doc);
    } catch {
      this.snapshotInFlight = false;
      return;
    }
    void (async () => {
      try {
        await this.cbs.pushSnapshot(baseClock, toArrayBuffer(snapshot));
        if (!this.destroyed) {
          this.opsSinceSnapshot = 0;
          this.pushedSinceSnapshot = 0;
          this.lastSnapshotAt = Date.now();
        }
      } catch {
        // Compaction is best effort; the next batch re-triggers it.
      } finally {
        this.snapshotInFlight = false;
      }
    })();
  }

  private scheduleFlush() {
    if (this.destroyed || !this.isEditor || this.queue.length === 0) return;
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      void this.flush();
    }, FLUSH_MS);
  }

  private scheduleRetry() {
    if (this.destroyed || this.retryTimer) return;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      void this.flush();
    }, RETRY_MS);
  }

  private async flush() {
    if (this.destroyed || !this.isEditor || this.queue.length === 0) return;
    const batches = splitByteBatch(this.queue, PUSH_MAX_COUNT, PUSH_MAX_BYTES);
    const batch = batches[0];
    try {
      await this.cbs.pushUpdates(batch.map(toArrayBuffer));
      if (this.destroyed) return;
      this.queue.splice(0, batch.length);
      this.pushedSinceSnapshot += batch.length;
      if (this.status === "offline") this.setStatus("live");
      if (this.queue.length > 0) {
        this.scheduleFlush();
      }
    } catch {
      this.setStatus("offline");
      this.scheduleRetry();
    }
  }
}
