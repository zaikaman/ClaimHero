import * as Y from "yjs";

/**
 * Pure Yjs building blocks for the collaborative brief editor.
 *
 * The Studio keeps its plain textarea UI. These helpers bridge it to a shared
 * Y.Text type: local keystrokes become minimal delete/insert transactions,
 * remote deltas map the local cursor so it tracks concurrent edits, and large
 * op batches split into Convex-safe chunks. All functions are pure (except
 * the explicit Yjs transactions) and unit-tested.
 */

export const YJS_LOCAL_ORIGIN = "local";
export const YJS_REMOTE_ORIGIN = "remote";
export const YJS_SEED_ORIGIN = "seed";

/** Minimal prefix/suffix diff applied as one Y.Text transaction. */
export function transactTextDiff(
  ytext: Y.Text,
  oldStr: string,
  newStr: string,
  origin: unknown
): boolean {
  if (oldStr === newStr) return false;
  let start = 0;
  const maxStart = Math.min(oldStr.length, newStr.length);
  while (start < maxStart && oldStr.charCodeAt(start) === newStr.charCodeAt(start)) {
    start += 1;
  }
  let oldEnd = oldStr.length;
  let newEnd = newStr.length;
  while (
    oldEnd > start &&
    newEnd > start &&
    oldStr.charCodeAt(oldEnd - 1) === newStr.charCodeAt(newEnd - 1)
  ) {
    oldEnd -= 1;
    newEnd -= 1;
  }
  const doc = ytext.doc;
  if (!doc) return false;
  doc.transact(() => {
    if (oldEnd > start) {
      ytext.delete(start, oldEnd - start);
    }
    if (newEnd > start) {
      ytext.insert(start, newStr.slice(start, newEnd));
    }
  }, origin);
  return true;
}

export interface TextDeltaOp {
  retain?: number;
  delete?: number;
  insert?: unknown;
}

function insertLength(insert: unknown): number {
  if (typeof insert === "string") return insert.length;
  if (Array.isArray(insert)) return insert.length;
  return 1;
}

/**
 * Map a pre-image cursor through a Yjs text delta. Remote inserts at the
 * cursor use right bias (cursor rides after the new text); selection ends
 * use left bias so selections keep hugging their original text.
 */
export function transformCursor(
  pos: number,
  delta: TextDeltaOp[],
  bias: "left" | "right" = "right"
): number {
  let oldIndex = 0;
  let next = pos;
  for (const op of delta) {
    if (typeof op.retain === "number") {
      oldIndex += op.retain;
      continue;
    }
    if (typeof op.delete === "number") {
      if (pos > oldIndex) {
        next -= Math.min(op.delete, pos - oldIndex);
      }
      oldIndex += op.delete;
      continue;
    }
    if (op.insert !== undefined) {
      const len = insertLength(op.insert);
      if (pos > oldIndex || (pos === oldIndex && bias === "right")) {
        next += len;
      }
    }
  }
  return Math.max(0, next);
}

export function transformSelection(
  start: number,
  end: number,
  delta: TextDeltaOp[]
): [number, number] {
  if (end <= start) {
    const at = transformCursor(start, delta, "right");
    return [at, at];
  }
  const nextStart = transformCursor(start, delta, "right");
  const nextEnd = transformCursor(end, delta, "left");
  if (nextEnd < nextStart) return [nextStart, nextStart];
  return [nextStart, nextEnd];
}

/** Restore a transformed selection after a controlled re-render (best effort). */
export function restoreSelectionIn(
  el: HTMLTextAreaElement,
  sel: [number, number]
): void {
  const apply = () => {
    try {
      if (typeof document !== "undefined" && document.activeElement !== el) return;
      const max = el.value.length;
      el.setSelectionRange(Math.min(sel[0], max), Math.min(sel[1], max));
    } catch {
      // Selection restore must never break editing.
    }
  };
  if (typeof requestAnimationFrame === "function") {
    requestAnimationFrame(apply);
  } else {
    apply();
  }
}

/** Copy a Yjs update into a standalone ArrayBuffer for Convex v.bytes(). */
export function toArrayBuffer(update: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(update.byteLength);
  copy.set(update);
  return copy.buffer;
}

export function fromArrayBuffer(buffer: ArrayBuffer): Uint8Array {
  return new Uint8Array(buffer);
}

/** Non-cryptographic content fingerprint for seed diagnostics. */
export function hashContent(content: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < content.length; i++) {
    hash ^= content.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/** Split op batches into Convex-safe chunks by count and byte size. */
export function splitByteBatch(
  items: Uint8Array[],
  maxCount: number,
  maxBytes: number
): Uint8Array[][] {
  const batches: Uint8Array[][] = [];
  let current: Uint8Array[] = [];
  let currentBytes = 0;
  for (const item of items) {
    if (
      current.length > 0 &&
      (current.length >= maxCount || currentBytes + item.byteLength > maxBytes)
    ) {
      batches.push(current);
      current = [];
      currentBytes = 0;
    }
    current.push(item);
    currentBytes += item.byteLength;
  }
  if (current.length > 0) batches.push(current);
  return batches;
}
