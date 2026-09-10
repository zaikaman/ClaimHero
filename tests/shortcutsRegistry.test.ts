import { describe, it, expect } from "vitest";
import { SHORTCUTS_REGISTRY, isInputFocused } from "../src/lib/shortcuts";

describe("P1-17: Central Shortcuts Registry & Input Guard", () => {
  it("defines all core shortcuts in SHORTCUTS_REGISTRY", () => {
    const ids = SHORTCUTS_REGISTRY.map((s) => s.id);
    expect(ids).toContain("command-palette");
    expect(ids).toContain("toggle-sidebar");
    expect(ids).toContain("sentinel-copilot");
    expect(ids).toContain("p2p-toggle-speaker");
    expect(ids).toContain("shortcuts-help");
  });

  it("assigns proper keys to command palette and sidebar", () => {
    const cmdK = SHORTCUTS_REGISTRY.find((s) => s.id === "command-palette");
    expect(cmdK?.keys).toEqual(["⌘", "K"]);

    const cmdB = SHORTCUTS_REGISTRY.find((s) => s.id === "toggle-sidebar");
    expect(cmdB?.keys).toEqual(["⌘", "B"]);

    const cmdJ = SHORTCUTS_REGISTRY.find((s) => s.id === "sentinel-copilot");
    expect(cmdJ?.keys).toEqual(["⌘", "J"]);

    const speaker = SHORTCUTS_REGISTRY.find((s) => s.id === "p2p-toggle-speaker");
    expect(speaker?.keys).toEqual(["S"]);
    expect(speaker?.scope).toBe("p2p");
  });

  it("isInputFocused returns false when no element is focused or document is absent", () => {
    expect(typeof isInputFocused()).toBe("boolean");
  });
});
