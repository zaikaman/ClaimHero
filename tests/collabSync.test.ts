import { describe, it, expect } from "vitest";
import { decideRemoteSync, type RemoteSyncInput } from "../src/lib/collabSync";

const base: RemoteSyncInput = {
  incomingContent: "remote brief",
  incomingUpdatedAt: 2000,
  lastSyncedContent: "synced brief",
  lastSyncedAt: 1000,
  localContent: "synced brief",
  saveInFlight: false,
  recentOwnSaves: [],
};

describe("decideRemoteSync live brief collaboration matrix", () => {
  it("adopts server content on first load with no baseline", () => {
    expect(decideRemoteSync({ ...base, lastSyncedContent: null })).toBe("apply-remote");
  });

  it("refreshes markers only when incoming matches the baseline (echo)", () => {
    expect(decideRemoteSync({ ...base, incomingContent: "synced brief" })).toBe("sync-markers");
  });

  it("treats a reordered own-save echo as ours, not remote work", () => {
    expect(
      decideRemoteSync({ ...base, incomingContent: "my older save", recentOwnSaves: ["my older save"] })
    ).toBe("sync-markers");
  });

  it("ignores stale incoming older than the last sync", () => {
    expect(
      decideRemoteSync({ ...base, incomingUpdatedAt: 500, lastSyncedAt: 1000 })
    ).toBe("none");
  });

  it("applies remote edits live when the local editor is clean", () => {
    expect(decideRemoteSync(base)).toBe("apply-remote");
  });

  it("stashes a conflict when local edits are unsaved", () => {
    expect(decideRemoteSync({ ...base, localContent: "synced brief plus my typing" })).toBe(
      "conflict"
    );
  });

  it("stashes a conflict while a save is in flight even if content matches baseline", () => {
    expect(decideRemoteSync({ ...base, saveInFlight: true })).toBe("conflict");
  });

  it("applies when timestamps are missing but content genuinely differs and local is clean", () => {
    expect(
      decideRemoteSync({ ...base, incomingUpdatedAt: 0, lastSyncedAt: 0 })
    ).toBe("apply-remote");
  });
});
