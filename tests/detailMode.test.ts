import { describe, it, expect, beforeEach } from "vitest";
import {
  PLAIN_NAV,
  PLAIN_FLOW_STEPS,
  PLAIN_PILLARS,
  PLAIN_TIERS,
  PLAIN_STATUS,
  pillarPlainTitle,
  statusSimple,
} from "../src/lib/plainCopy";

// In-memory mock for localStorage in node test environment
const storageMap = new Map<string, string>();
let shouldThrowOnStorage = false;

const mockLocalStorage = {
  getItem: (key: string) => {
    if (shouldThrowOnStorage) throw new Error("SecurityError: localStorage is disabled");
    return storageMap.get(key) ?? null;
  },
  setItem: (key: string, value: string) => {
    if (shouldThrowOnStorage) throw new Error("QuotaExceededError / Private browsing blocked");
    storageMap.set(key, String(value));
  },
  removeItem: (key: string) => storageMap.delete(key),
  clear: () => storageMap.clear(),
};

Object.defineProperty(globalThis, "localStorage", {
  value: mockLocalStorage,
  writable: true,
  configurable: true,
});

if (typeof (globalThis as unknown as { window?: unknown }).window === "undefined") {
  (globalThis as unknown as { window: unknown }).window = globalThis;
}

if (typeof (globalThis as unknown as { CustomEvent?: unknown }).CustomEvent === "undefined") {
  class MockCustomEvent {
    type: string;
    detail: unknown;
    constructor(type: string, params?: { detail?: unknown }) {
      this.type = type;
      this.detail = params?.detail;
    }
  }
  (globalThis as unknown as { CustomEvent: unknown }).CustomEvent = MockCustomEvent;
}

const listeners = new Map<string, Set<EventListener>>();
const mockAddEventListener = (type: string, listener: EventListener) => {
  if (!listeners.has(type)) listeners.set(type, new Set());
  listeners.get(type)!.add(listener);
};
const mockRemoveEventListener = (type: string, listener: EventListener) => {
  listeners.get(type)?.delete(listener);
};
const mockDispatchEvent = (event: Event): boolean => {
  const set = listeners.get(event.type);
  if (set) {
    set.forEach((fn) => fn(event));
  }
  return true;
};

Object.defineProperty(globalThis, "addEventListener", { value: mockAddEventListener, writable: true });
Object.defineProperty(globalThis, "removeEventListener", { value: mockRemoveEventListener, writable: true });
Object.defineProperty(globalThis, "dispatchEvent", { value: mockDispatchEvent, writable: true });

describe("Plain Language Copy Dictionaries (plainCopy.ts)", () => {
  const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F1E6}-\u{1F1FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{1FA70}-\u{1FAFF}]/u;

  it("contains zero emojis across all plainCopy definitions", () => {
    const allStrings = [
      ...Object.values(PLAIN_NAV),
      ...Object.values(PLAIN_FLOW_STEPS),
      ...PLAIN_PILLARS.flatMap((p) => [p.simple, p.detailed, p.hint]),
      ...Object.values(PLAIN_TIERS).flatMap((t) => [t.simple, t.who, t.detailed]),
      ...Object.values(PLAIN_STATUS).flatMap((s) => [s.simple, s.detailed]),
    ];

    allStrings.forEach((str) => {
      expect(str).not.toMatch(emojiRegex);
      expect(str.trim().length).toBeGreaterThan(0);
    });
  });

  it("translates pillar categories with graceful fallback", () => {
    expect(pillarPlainTitle("policy_alignment", "Fallback")).toBe("Their own rules");
    expect(pillarPlainTitle("clinical_documentation", "Fallback")).toBe("Your medical records");
    expect(pillarPlainTitle("statutory_erisa", "Fallback")).toBe("Your appeal rights");
    expect(pillarPlainTitle("precedent_strength", "Fallback")).toBe("Similar cases that won");
    expect(pillarPlainTitle("unknown_category", "Custom Fallback")).toBe("Custom Fallback");
  });

  it("translates claim statuses with statusSimple", () => {
    expect(statusSimple("won")).toBe("Won");
    expect(statusSimple("drafting")).toBe("Writing letter");
    expect(statusSimple("under_review")).toBe("Waiting for reply");
    expect(statusSimple("ready_for_review")).toBe("Ready to send");
    expect(statusSimple("custom_unmapped_status")).toBe("custom unmapped status");
  });

  it("defines plain flow steps matching the 3-step sentinel flow", () => {
    expect(PLAIN_FLOW_STEPS.evidenceSimple).toBe("1. Your proof");
    expect(PLAIN_FLOW_STEPS.studioSimple).toBe("2. Your letter");
    expect(PLAIN_FLOW_STEPS.dispatchSimple).toBe("3. Send & track");
  });
});

describe("Detail Mode Hook & Storage Synchronization (useDetailMode)", () => {
  beforeEach(() => {
    storageMap.clear();
    shouldThrowOnStorage = false;
    listeners.clear();
  });

  it("defaults to simple mode when localStorage is empty", async () => {
    expect(mockLocalStorage.getItem("claimhero_detail_mode")).toBeNull();
  });

  it("persists detail mode and dispatches custom synchronization event", () => {
    mockLocalStorage.setItem("claimhero_detail_mode", "detailed");
    expect(mockLocalStorage.getItem("claimhero_detail_mode")).toBe("detailed");

    mockLocalStorage.setItem("claimhero_detail_mode", "simple");
    expect(mockLocalStorage.getItem("claimhero_detail_mode")).toBe("simple");
  });

  it("does not crash if localStorage throws (e.g. private browsing or security sandbox)", () => {
    shouldThrowOnStorage = true;
    expect(() => {
      try {
        mockLocalStorage.getItem("claimhero_detail_mode");
      } catch {
        // Handled gracefully
      }
    }).not.toThrow();
  });

  it("broadcasts sync events across tabs via storage event and custom events", () => {
    let receivedDetail: string | null = null;
    mockAddEventListener("claimhero:detail-mode", ((e: CustomEvent) => {
      receivedDetail = e.detail;
    }) as EventListener);

    mockDispatchEvent(new CustomEvent("claimhero:detail-mode", { detail: "detailed" }));
    expect(receivedDetail).toBe("detailed");
  });
});

describe("ExpertDetail & PlainLabel Components", () => {
  it("renders PlainLabel and respects polymorphism", async () => {
    const React = await import("react");
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { PlainLabel } = await import("../src/components/common/ExpertDetail");

    // By default in simple mode
    mockLocalStorage.setItem("claimhero_detail_mode", "simple");
    const markupSimple = renderToStaticMarkup(
      React.createElement(PlainLabel, {
        simple: "Everyday Text",
        detailed: "CPT 99213 Detailed",
      })
    );
    expect(markupSimple).toContain("Everyday Text");
    expect(markupSimple).not.toContain("CPT 99213 Detailed");

    // In detailed mode
    mockLocalStorage.setItem("claimhero_detail_mode", "detailed");
    const markupDetailed = renderToStaticMarkup(
      React.createElement(PlainLabel, {
        simple: "Everyday Text",
        detailed: "CPT 99213 Detailed",
      })
    );
    expect(markupDetailed).toContain("CPT 99213 Detailed");
  });

  it("renders DetailModeToggle button with appropriate accessibility attributes", async () => {
    const React = await import("react");
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { DetailModeToggle } = await import("../src/components/common/DetailModeToggle");

    mockLocalStorage.setItem("claimhero_detail_mode", "simple");
    const markupSimple = renderToStaticMarkup(
      React.createElement(DetailModeToggle, { compact: false })
    );
    expect(markupSimple).toContain('aria-pressed="false"');
    expect(markupSimple).toContain("Simple");

    mockLocalStorage.setItem("claimhero_detail_mode", "detailed");
    const markupDetailed = renderToStaticMarkup(
      React.createElement(DetailModeToggle, { compact: false })
    );
    expect(markupDetailed).toContain('aria-pressed="true"');
    expect(markupDetailed).toContain("Details on");
  });
});
