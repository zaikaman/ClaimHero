import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect, vi } from "vitest";
import { ClinicalResearchConsole } from "../src/components/evidence/ClinicalResearchConsole";
import { CasePickerEmptyState } from "../src/components/common/CasePickerEmptyState";
import { Claim } from "../src/types";

// Mock Convex useQuery used by nested PipelineActivityFeed inside EvidenceMatrix
vi.mock("convex/react", () => ({
  useQuery: vi.fn().mockReturnValue([]),
  useMutation: vi.fn().mockReturnValue(vi.fn().mockResolvedValue({})),
}));

const store = new Map<string, string>();
const mockLocalStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => store.set(k, String(v)),
  removeItem: (k: string) => store.delete(k),
  clear: () => store.clear(),
};

Object.defineProperty(globalThis, "localStorage", {
  value: mockLocalStorage,
  writable: true,
  configurable: true,
});

if (typeof (globalThis as any).window === "undefined") {
  (globalThis as any).window = globalThis;
}

describe("Codeless Claims & CPT Resiliency", () => {
  const baseCodelessClaim: Claim = {
    _id: "claim_codeless_1",
    patientId: "patient_1",
    claimNumber: "CLM-CODELESS-99",
    serviceDate: "2026-06-15",
    providerName: "Dr. Gregory House, MD",
    deniedAmount: 14500,
    patientOwedAmount: 14500,
    denialReasonCode: "CO-50",
    denialReasonDescription: "Not medically necessary",
    status: "ready_for_review",
    statutoryDeadline: Date.now() + 86400000 * 60,
    daysRemaining: 60,
    assignedAgentEmail: "advocate@claimhero.io",
    patient: {
      name: "Arthur Pendelton",
      insurancePayer: "Aetna",
      memberId: "AET-00123",
    },
    // Intentionally no cptCodes
  } as unknown as Claim;

  it("renders ClinicalResearchConsole without throwing when claim.cptCodes is undefined", () => {
    const claimWithUndefinedCpt: Claim = {
      ...baseCodelessClaim,
      cptCodes: undefined as any,
    };

    expect(() => {
      const markup = renderToStaticMarkup(
        React.createElement(ClinicalResearchConsole, {
          claim: claimWithUndefinedCpt,
          evidences: [],
          onCrawlCPB: async () => {},
          onCrawlPubMed: async () => {},
          onCrawlFDA: async () => {},
          onCrawlCustomUrl: async () => {},
          onCrawlMultiSource: async () => {},
        })
      );
      expect(markup).toContain("CLM-CODELESS-99");
    }).not.toThrow();
  });

  it("renders ClinicalResearchConsole without throwing when claim.cptCodes is empty array", () => {
    const claimWithEmptyCpt: Claim = {
      ...baseCodelessClaim,
      cptCodes: [],
    };

    expect(() => {
      const markup = renderToStaticMarkup(
        React.createElement(ClinicalResearchConsole, {
          claim: claimWithEmptyCpt,
          evidences: [],
          onCrawlCPB: async () => {},
          onCrawlPubMed: async () => {},
          onCrawlFDA: async () => {},
          onCrawlCustomUrl: async () => {},
          onCrawlMultiSource: async () => {},
        })
      );
      expect(markup).toContain("CLM-CODELESS-99");
    }).not.toThrow();
  });

  it("renders CasePickerEmptyState without throwing when claim.cptCodes is undefined", () => {
    const claimWithUndefinedCpt: Claim = {
      ...baseCodelessClaim,
      cptCodes: undefined as any,
    };

    const markup = renderToStaticMarkup(
      React.createElement(CasePickerEmptyState, {
        viewType: "evidence",
        claims: [claimWithUndefinedCpt],
        onSelectClaim: () => {},
      })
    );
    expect(markup).toContain("CLM-CODELESS-99");
    expect(markup).toMatch(/No CPT|Not listed/);
  });

  it("renders EvidenceMatrix in detailed mode without throwing when claim.cptCodes is undefined", async () => {
    // Set localStorage detail mode to detailed to render the Expert Evidence Matrix
    localStorage.setItem("claimhero_detail_mode", "detailed");
    const { EvidenceMatrix } = await import("../src/components/evidence/EvidenceMatrix");
    const claimWithUndefinedCpt: Claim = {
      ...baseCodelessClaim,
      cptCodes: undefined as any,
    };

    const markup = renderToStaticMarkup(
      React.createElement(EvidenceMatrix, {
        claim: claimWithUndefinedCpt,
        evidences: [],
        onCrawlPolicy: async () => {},
      })
    );
    expect(markup).toContain("CLM-CODELESS-99");
    expect(markup).toContain("No CPT codes specified");
  });

  it("demands statutory penalties at $164.00 per calendar day in AppealStudio", async () => {
    const fs = await import("fs");
    const studioSrc = fs.readFileSync("src/components/studio/AppealStudio.tsx", "utf-8");
    expect(studioSrc).toContain("$164.00 per calendar day");
    expect(studioSrc).not.toContain("$110.00 per calendar day");
  });

  it("safely optional chains cptCodes.map in EvidenceMatrix", async () => {
    const fs = await import("fs");
    const evidenceMatrixSrc = fs.readFileSync("src/components/evidence/EvidenceMatrix.tsx", "utf-8");
    expect(evidenceMatrixSrc).toContain("claim.cptCodes?.map");
  });

  it("displays $164/day ERISA exposure in SentinelFlowStepper and CommandDialog", async () => {
    const fs = await import("fs");
    const stepperSrc = fs.readFileSync("src/components/common/SentinelFlowStepper.tsx", "utf-8");
    expect(stepperSrc).toContain("$164/day ERISA exposure");
    expect(stepperSrc).not.toContain("$110/day ERISA exposure");

    const commandDialogSrc = fs.readFileSync("src/components/common/CommandDialog.tsx", "utf-8");
    expect(commandDialogSrc).toContain("$164/day statutory non-disclosure penalty audit");
    expect(commandDialogSrc).not.toContain("$110/day statutory non-disclosure penalty audit");
    expect(commandDialogSrc).toContain('"$164"');
  });
});

