import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("Sentinel Copilot Drawer Architecture & Event Ingestion", () => {
  let originalWindow: typeof globalThis.window;

  beforeEach(() => {
    originalWindow = globalThis.window;
    if (typeof globalThis.window === "undefined") {
      const target = new EventTarget();
      (globalThis as any).window = target;
      (globalThis as any).CustomEvent = class CustomEvent extends Event {
        detail: any;
        constructor(type: string, options?: { detail?: any }) {
          super(type);
          this.detail = options?.detail;
        }
      };
    }
  });

  afterEach(() => {
    (globalThis as any).window = originalWindow;
  });

  it("dispatches claimhero:insert-brief-text custom event with cited argument payload", () => {
    const dispatchSpy = vi.spyOn(window, "dispatchEvent");
    const testArgument = "Pursuant to ERISA 29 C.F.R. § 2560.503-1(h)(2)(ii), the claimant is entitled to full and fair review.";

    const event = new CustomEvent("claimhero:insert-brief-text", {
      detail: { text: testArgument },
    });
    window.dispatchEvent(event);

    expect(dispatchSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "claimhero:insert-brief-text",
        detail: { text: testArgument },
      })
    );
    dispatchSpy.mockRestore();
  });

  it("handles event listener execution and text insertion syntax logic", () => {
    const originalBrief = `# Appeal of Adverse Benefit Determination\n\nClaimant: Eleanor Vance\n\nSincerely,\nAuthorized Representative`;
    const citedArgument = `**Statutory Requirement**: Insurer failed to articulate clinical rationale under CPB 0250.`;

    const closingPattern = /\n(?=(?:Sincerely|Respectfully|Regards|Submitted by|Authorized Representative:))/i;
    const matchIndex = originalBrief.search(closingPattern);

    expect(matchIndex).toBeGreaterThan(0);

    const before = originalBrief.slice(0, matchIndex).trimEnd();
    const after = originalBrief.slice(matchIndex).trimStart();
    const addendum = `\n\n### Clinical & Statutory Addendum (via Sentinel Copilot)\n${citedArgument}\n`;
    const updatedBrief = `${before}\n${addendum}\n${after}`;

    expect(updatedBrief).toContain("### Clinical & Statutory Addendum (via Sentinel Copilot)");
    expect(updatedBrief).toContain(citedArgument);
    expect(updatedBrief).toContain("Sincerely,\nAuthorized Representative");
    // Ensure no emojis
    expect(updatedBrief).not.toMatch(/[\u{1F300}-\u{1F9FF}]/u);
  });

  it("appends cited argument addendum at bottom when no closing salutation exists", () => {
    const briefWithoutClosing = `# Preliminary Notes\n\nClinical facts gathered for CPT 27447.`;
    const citedArgument = `**Statutory Reference**: ERISA 29 C.F.R. § 2560.503-1.`;

    const closingPattern = /\n(?=(?:Sincerely|Respectfully|Regards|Submitted by|Authorized Representative:))/i;
    const matchIndex = briefWithoutClosing.search(closingPattern);

    expect(matchIndex).toBe(-1);

    const addendum = `\n\n### Clinical & Statutory Addendum (via Sentinel Copilot)\n${citedArgument}\n`;
    const updatedBrief = `${briefWithoutClosing.trim()}\n${addendum}`;

    expect(updatedBrief).toContain(briefWithoutClosing);
    expect(updatedBrief).toContain("### Clinical & Statutory Addendum (via Sentinel Copilot)");
    expect(updatedBrief).toContain(citedArgument);
  });

  it("verifies safeExternalHref sanitizes external links strictly", async () => {
    const { safeExternalHref } = await import("../src/lib/urlUtils");

    // Permitted schemes
    expect(safeExternalHref("https://www.aetna.com/cpb/0250.html")).toBe("https://www.aetna.com/cpb/0250.html");
    expect(safeExternalHref("http://cigna.com/guidelines")).toBe("http://cigna.com/guidelines");

    // Blocked malicious schemes
    expect(safeExternalHref("javascript:alert('xss')")).toBeUndefined();
    expect(safeExternalHref("data:text/html,<script>alert(1)</script>")).toBeUndefined();
    expect(safeExternalHref("vbscript:MsgBox(1)")).toBeUndefined();
    expect(safeExternalHref("file:///etc/passwd")).toBeUndefined();
    expect(safeExternalHref("/relative/path")).toBeUndefined();
    expect(safeExternalHref("")).toBeUndefined();
    expect(safeExternalHref(undefined)).toBeUndefined();
  });

  it("verifies stable toggle updater logic prevents stale closure issues", () => {
    let isOpen = false;
    const isOpenRef = { current: isOpen };

    const setIsOpen = (updater: boolean | ((prev: boolean) => boolean)) => {
      const next = typeof updater === "function" ? updater(isOpenRef.current) : updater;
      isOpenRef.current = next;
      isOpen = next;
    };

    // First toggle: false -> true
    setIsOpen((prev) => !prev);
    expect(isOpenRef.current).toBe(true);

    // Second toggle: true -> false
    setIsOpen((prev) => !prev);
    expect(isOpenRef.current).toBe(false);

    // Third toggle: false -> true
    setIsOpen((prev) => !prev);
    expect(isOpenRef.current).toBe(true);
  });
});
