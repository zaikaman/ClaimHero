import { describe, it, expect } from "vitest";
import * as Y from "yjs";
import {
  fromArrayBuffer,
  hashContent,
  splitByteBatch,
  toArrayBuffer,
  transactTextDiff,
  transformCursor,
  transformSelection,
  restoreSelectionIn,
} from "../src/lib/yjsBrief";

function makeText(initial = ""): { doc: Y.Doc; ytext: Y.Text } {
  const doc = new Y.Doc();
  const ytext = doc.getText("brief");
  if (initial) {
    doc.transact(() => {
      ytext.insert(0, initial);
    }, "seed");
  }
  return { doc, ytext };
}

describe("yjsBrief collaborative editing primitives", () => {
  describe("transactTextDiff", () => {
    it("inserts into an empty doc and reports a change", () => {
      const { ytext } = makeText();
      expect(transactTextDiff(ytext, "", "hello", "local")).toBe(true);
      expect(ytext.toString()).toBe("hello");
    });

    it("returns false without transacting when strings match", () => {
      const { doc, ytext } = makeText("same");
      let events = 0;
      ytext.observe(() => {
        events += 1;
      });
      expect(transactTextDiff(ytext, "same", "same", "local")).toBe(false);
      expect(events).toBe(0);
      doc.destroy();
    });

    it("deletes a middle range (simulated backspace run)", () => {
      const { ytext } = makeText("hello world");
      transactTextDiff(ytext, "hello world", "hello", "local");
      expect(ytext.toString()).toBe("hello");
    });

    it("replaces a middle span and records the local origin", () => {
      const { ytext } = makeText("The quick brown fox");
      const origins: unknown[] = [];
      ytext.observe((_event, txn) => {
        origins.push(txn.origin);
      });
      transactTextDiff(ytext, "The quick brown fox", "The slow brown fox", "local");
      expect(ytext.toString()).toBe("The slow brown fox");
      expect(origins).toEqual(["local"]);
    });

    it("merges concurrent inserts from two docs without loss", () => {
      const a = makeText("ABC");
      const b = new Y.Doc();
      const yb = b.getText("brief");
      // Sync B up with A's state, then diverge concurrently.
      Y.applyUpdate(b, Y.encodeStateAsUpdate(a.doc), "remote");
      a.ytext.doc?.transact(() => {
        a.ytext.insert(0, "1");
      }, "local");
      b.transact(() => {
        yb.insert(3, "2");
      }, "local");
      // Exchange updates both ways.
      const updateA = Y.encodeStateAsUpdate(a.doc);
      const updateB = Y.encodeStateAsUpdate(b);
      Y.applyUpdate(b, updateA, "remote");
      Y.applyUpdate(a.doc, updateB, "remote");
      expect(a.ytext.toString()).toContain("1");
      expect(a.ytext.toString()).toContain("2");
      expect(a.ytext.toString()).toBe(yb.toString());
      a.doc.destroy();
      b.destroy();
    });
  });

  describe("transformCursor", () => {
    it("leaves positions after pure retains untouched", () => {
      expect(transformCursor(4, [{ retain: 10 }])).toBe(4);
    });

    it("shifts right for inserts before the cursor", () => {
      expect(transformCursor(5, [{ retain: 2 }, { insert: "XYZ" }, { retain: 8 }])).toBe(8);
    });

    it("ignores inserts after the cursor", () => {
      expect(transformCursor(2, [{ retain: 5 }, { insert: "XYZ" }])).toBe(2);
    });

    it("applies right bias for inserts exactly at the cursor by default", () => {
      expect(transformCursor(3, [{ retain: 3 }, { insert: "AB" }])).toBe(5);
    });

    it("applies left bias for inserts exactly at the cursor when asked", () => {
      expect(transformCursor(3, [{ retain: 3 }, { insert: "AB" }], "left")).toBe(3);
    });

    it("pulls the cursor left over deletions before it", () => {
      expect(transformCursor(8, [{ retain: 2 }, { delete: 4 }, { retain: 4 }])).toBe(4);
    });

    it("clamps the cursor when the deletion covers it", () => {
      expect(transformCursor(4, [{ retain: 2 }, { delete: 10 }])).toBe(2);
    });

    it("ignores deletions after the cursor", () => {
      expect(transformCursor(2, [{ retain: 5 }, { delete: 3 }])).toBe(2);
    });
  });

  describe("transformSelection", () => {
    it("maps collapsed selections like cursors", () => {
      expect(transformSelection(5, 5, [{ retain: 2 }, { insert: "XYZ" }])).toEqual([8, 8]);
    });

    it("keeps selections hugging their original text on boundary inserts", () => {
      // Insert at the range start pushes the start right (right bias) and the
      // insert still precedes the range end, so [2,6) over "xxxx" becomes [4,8).
      expect(transformSelection(2, 6, [{ retain: 2 }, { insert: "AB" }, { retain: 4 }])).toEqual([
        4, 8,
      ]);
      // Insert exactly at the range end stays outside under left bias.
      expect(transformSelection(2, 6, [{ retain: 6 }, { insert: "AB" }])).toEqual([2, 6]);
    });

    it("collapses when a deletion swallows the range", () => {
      expect(transformSelection(3, 5, [{ retain: 1 }, { delete: 10 }])).toEqual([1, 1]);
    });
  });

  describe("byte helpers and hashing", () => {
    it("round-trips Yjs updates through ArrayBuffer copies", () => {
      const { ytext } = makeText("round trip");
      const doc = ytext.doc as Y.Doc;
      const update = Y.encodeStateAsUpdate(doc);
      const copy = toArrayBuffer(update);
      expect(copy.byteLength).toBe(update.byteLength);
      // Mutating the source must not affect the copy.
      update[0] = 255;
      const fresh = new Y.Doc();
      Y.applyUpdate(fresh, fromArrayBuffer(copy), "remote");
      expect(fresh.getText("brief").toString()).toBe("round trip");
      doc.destroy();
      fresh.destroy();
    });

    it("hashes content deterministically", () => {
      expect(hashContent("brief")).toBe(hashContent("brief"));
      expect(hashContent("brief")).not.toBe(hashContent("brief!"));
      expect(hashContent("")).toMatch(/^[0-9a-f]{8}$/);
    });

    it("splits batches by count and byte budget", () => {
      const items = [new Uint8Array(100), new Uint8Array(100), new Uint8Array(650)];
      expect(splitByteBatch(items, 100, 700)).toHaveLength(2);
      expect(splitByteBatch(items, 2, 10_000)).toHaveLength(2);
      expect(splitByteBatch(items, 100, 10_000)).toHaveLength(1);
      expect(splitByteBatch([], 10, 10)).toEqual([]);
    });

    it("restoreSelectionIn never throws without a DOM", () => {
      expect(() =>
        restoreSelectionIn({ value: "abc", setSelectionRange: () => {} } as never, [1, 2])
      ).not.toThrow();
    });
  });
});
