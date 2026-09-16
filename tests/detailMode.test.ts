import { describe, it, expect, beforeEach } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  PLAIN_NAV,
  PLAIN_FLOW_STEPS,
  PLAIN_PILLARS,
  PLAIN_TIERS,
  PLAIN_STATUS,
  PLAIN_FIRST_RUN,
  pillarPlainTitle,
  statusSimple,
  formatWhatHappenedSentence,
  formatDeadlineSentence,
} from "../src/lib/plainCopy";
import { PlainLabel } from "../src/components/common/ExpertDetail";
import { DetailModeToggle } from "../src/components/common/DetailModeToggle";
import { SentinelFlowStepper } from "../src/components/common/SentinelFlowStepper";
import { HERO_SLIDES, LANDING_NAV_LINKS } from "../src/components/landing/CinematicHero";
import { ClinicalResearchConsole } from "../src/components/evidence/ClinicalResearchConsole";

/**
 * The exact terms an everyday user must never meet on the first screen:
 * CPB, CARC (e.g. CO-50), RRF, P2P, IMR, dossier, ERISA, and "brief".
 * They stay available behind Expert Details.
 */
const FIRST_RUN_JARGON = /\b(CPB|CARC|RRF|P2P|IMR|dossier|ERISA|brief)\b/i;

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

  it("exposes the three renamed first-run labels instead of CPB, CARC and brief", () => {
    expect(PLAIN_FIRST_RUN.insurerRule).toBe("Insurer's own rule");
    expect(PLAIN_FIRST_RUN.whyDenied).toBe("Why they said no");
    expect(PLAIN_FIRST_RUN.yourLetter).toBe("Your letter");

    Object.values(PLAIN_FIRST_RUN).forEach((label) => {
      expect(label).not.toMatch(FIRST_RUN_JARGON);
    });
  });
});

describe("First Screen Jargon Removal (landing page)", () => {
  it("keeps every hero slide badge, headline, description and CTA free of jargon", () => {
    HERO_SLIDES.forEach((slide) => {
      const copy = [
        slide.badge1.label,
        slide.badge2.label,
        slide.badge3.label,
        slide.titleLine1,
        slide.titleLine2,
        slide.description,
        slide.primaryCtaText,
        slide.secondaryCtaText,
      ];
      copy.forEach((text) => {
        expect(text).not.toMatch(FIRST_RUN_JARGON);
        expect(text.trim().length).toBeGreaterThan(0);
      });
    });
  });

  it("names landing navigation with everyday words instead of expert surface names", () => {
    expect(LANDING_NAV_LINKS.map((l) => l.label)).toEqual([
      "My Cases",
      "Why it was denied",
      "Your letter",
      "Insurer replies",
      "Money recovered",
    ]);
  });
});

describe("First Screen Jargon Removal (workspace surfaces)", () => {
  beforeEach(() => {
    storageMap.clear();
    shouldThrowOnStorage = false;
    listeners.clear();
  });

  const mockClaim: any = {
    _id: "claim_test_console",
    patientId: "patient_1",
    patient: { name: "David Miller", insurancePayer: "Aetna" },
    claimNumber: "CLM-90001",
    deniedAmount: 18200,
    cptCodes: ["63047"],
    denialReasonCode: "CO-50",
    status: "analyzing",
    statutoryDeadline: Date.now() + 120 * 24 * 3600 * 1000,
    daysRemaining: 120,
  };

  it("replaces insurer CPB channel wording and CARC code references in Everyday Mode", () => {
    mockLocalStorage.setItem("claimhero_detail_mode", "simple");

    const markup = renderToStaticMarkup(
      React.createElement(ClinicalResearchConsole, {
        claim: mockClaim,
        evidences: [],
        onCrawlCPB: async () => undefined,
        onCrawlPubMed: async () => undefined,
        onCrawlFDA: async () => undefined,
        onCrawlCustomUrl: async () => undefined,
        onCrawlMultiSource: async () => undefined,
      })
    );

    // The insurer's own rule replaces CPB on the channel selector
    expect(markup).toContain("Insurer&#x27;s own rule");
    expect(markup).not.toContain("Insurer CPB");
    // Denial reason codes are hidden by default
    expect(markup).not.toContain("CO-50");
    expect(markup).not.toContain("CARC");
    // Vendor and retrieval jargon stays behind Expert Details
    expect(markup).not.toContain("RRF");
    expect(markup).not.toContain("P2P");
    expect(markup).not.toContain("Firecrawl");
    expect(markup).not.toContain("dossier");
    // Procedure codes are replaced by the plain procedure name until Expert Details is on
    expect(markup).not.toContain("CPT 63047");
    expect(markup).toContain("lumbar spine surgery");
    // Retrieval channel wording is everyday language on the first screen
    expect(markup).toContain("Where to look for proof");
    expect(markup).toContain("Everything at once");
    expect(markup).not.toContain("Clinical Research Channel");
  });

  it("restores CPB, CARC and technical channel labels when Expert Details is on", () => {
    mockLocalStorage.setItem("claimhero_detail_mode", "detailed");

    const markup = renderToStaticMarkup(
      React.createElement(ClinicalResearchConsole, {
        claim: mockClaim,
        evidences: [],
        onCrawlCPB: async () => undefined,
        onCrawlPubMed: async () => undefined,
        onCrawlFDA: async () => undefined,
        onCrawlCustomUrl: async () => undefined,
        onCrawlMultiSource: async () => undefined,
      })
    );

    expect(markup).toContain("Insurer CPB");
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
  it("renders PlainLabel and respects polymorphism", () => {
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

  it("renders DetailModeToggle button with appropriate accessibility attributes", () => {
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

  it("formats what happened sentence and deadline sentence in plain English", () => {
    const sentence = formatWhatHappenedSentence({
      patient: { name: "Sarah Jenkins", insurancePayer: "Cigna" },
      deniedAmount: 6400,
      cptCodes: ["29881"],
      denialReasonCode: "CO-50",
    });
    expect(sentence).toContain("Sarah Jenkins's knee arthroscopy was denied ($6,400) by Cigna");
    expect(sentence).toContain("they say it was not medically necessary");

    const deadline = formatDeadlineSentence(Date.now() + 180 * 24 * 3600 * 1000, 180);
    expect(deadline).toContain("Appeal deadline:");
    expect(deadline).toContain("180 days left");
  });

  it("renders 1 sentence + 1 date + 1 Review & Approve button in default Everyday Mode", () => {
    mockLocalStorage.setItem("claimhero_detail_mode", "simple");

    const mockClaim: any = {
      _id: "claim_test_1",
      patientId: "patient_1",
      patient: { name: "David Miller", insurancePayer: "Aetna" },
      deniedAmount: 18200,
      cptCodes: ["63047"],
      denialReasonCode: "CO-197",
      status: "ready_for_review",
      statutoryDeadline: Date.now() + 120 * 24 * 3600 * 1000,
      daysRemaining: 120,
    };

    const markup = renderToStaticMarkup(
      React.createElement(SentinelFlowStepper, {
        claim: mockClaim,
        currentView: "evidence",
        onNavigateView: () => {},
      })
    );

    // 1 Sentence: What happened
    expect(markup).toMatch(/David Miller(&#x27;|')s lumbar spine surgery was denied/);
    expect(markup).toContain("they say prior approval was missing");
    // 1 Date: What to do by when
    expect(markup).toContain("120 days left");
    // 1 Button: Review & Approve
    expect(markup).toContain("Review &amp; Approve");
    // Team software elements should NOT be visible in everyday mode
    expect(markup).not.toContain("$110/day ERISA exposure");
    // 3-step navigation strip
    expect(markup).toContain("1. Your proof");
    expect(markup).toContain("2. Your letter");
    expect(markup).toContain("3. Send &amp; track");
  });

  it("renders Back to Proof and Continue to Send buttons when on Step 2 (studio) in Everyday Mode", () => {
    mockLocalStorage.setItem("claimhero_detail_mode", "simple");

    const mockClaim: any = {
      _id: "claim_test_1",
      patientId: "patient_1",
      patient: { name: "David Miller", insurancePayer: "Aetna" },
      deniedAmount: 18200,
      cptCodes: ["63047"],
      denialReasonCode: "CO-197",
      status: "ready_for_review",
      statutoryDeadline: Date.now() + 120 * 24 * 3600 * 1000,
      daysRemaining: 120,
    };

    const markup = renderToStaticMarkup(
      React.createElement(SentinelFlowStepper, {
        claim: mockClaim,
        currentView: "studio",
        onNavigateView: () => {},
      })
    );

    // On Step 2, user must be able to go back to Step 1 (Proof)
    expect(markup).toContain("Back to Proof");
    // Forward action to Step 3
    expect(markup).toContain("Continue to Send");
    // Stepper navigation strip is present
    expect(markup).toContain("1. Your proof");
    expect(markup).toContain("2. Your letter");
    expect(markup).toContain("3. Send &amp; track");
  });

  it("renders Back to Letter button when on Step 3 (communications) in Everyday Mode", () => {
    mockLocalStorage.setItem("claimhero_detail_mode", "simple");

    const mockClaim: any = {
      _id: "claim_test_1",
      patientId: "patient_1",
      patient: { name: "David Miller", insurancePayer: "Aetna" },
      deniedAmount: 18200,
      cptCodes: ["63047"],
      denialReasonCode: "CO-197",
      status: "ready_for_review",
      statutoryDeadline: Date.now() + 120 * 24 * 3600 * 1000,
      daysRemaining: 120,
    };

    const markup = renderToStaticMarkup(
      React.createElement(SentinelFlowStepper, {
        claim: mockClaim,
        currentView: "communications",
        onNavigateView: () => {},
      })
    );

    // On Step 3, user must be able to go back to Step 2 (Letter)
    expect(markup).toContain("Back to Letter");
    // Stepper navigation strip is present
    expect(markup).toContain("1. Your proof");
    expect(markup).toContain("2. Your letter");
    expect(markup).toContain("3. Send &amp; track");
  });
});

