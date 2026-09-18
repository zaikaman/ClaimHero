import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";
import { fastSanitizeText, detectPiiEntities } from "../src/lib/redactionEngine";
import {
  formatProviderDisplayName,
  SimpleEvidenceView,
} from "../src/components/evidence/SimpleEvidenceView";
import {
  resolveProviderDisplayName,
  resolvePatientDisplayName,
  resolveMemberIdDisplay,
  resolveGroupNumberDisplay,
} from "../src/lib/displaySafety";
import {
  resolveClaimProviderName,
  resolveClaimMemberId,
  resolveClaimGroupNumber,
} from "../convex/claims";
import { buildDossierData } from "../src/lib/dossierBuilder";
import { rehydrateForDisplay, PHI_TOKENS } from "../convex/lib/phiSafe";

/**
 * Regression: pipeline running rendered
 * "Reviewing clinical documentation from Dr. [PATIENT REDACTED], MD..."
 * because the free-floating person-name heuristic redacted treating-provider
 * names as patient identifiers, the LLM copied the placeholder into
 * providerName, and the trusted UI rendered it verbatim.
 *
 * Trusted UI must never show redaction placeholders; redaction applies only
 * to untrusted LLM egress, exports, and public exhibits.
 */
describe("provider redaction regression (Dr. [PATIENT REDACTED], MD)", () => {
  it("preserves treating-provider names anchored by title or credential", () => {
    const cases: Array<[string, string]> = [
      ["Treating Provider: Dr. Sarah Chen, MD. Patient: Eleanor Vance.", "Sarah Chen"],
      ["Attending: Dr. Ronald Sterling performed Total Knee Arthroplasty.", "Ronald Sterling"],
      ["Sarah Chen, MD documented acute foot drop.", "Sarah Chen"],
    ];
    for (const [doc, provider] of cases) {
      const out = fastSanitizeText(doc, {
        standard: "HIPAA_SAFE_HARBOR",
        maskDateOfService: true,
        patientName: "Eleanor Vance",
      }).sanitizedText;
      expect(out).toContain(provider);
      expect(out).not.toContain("Dr. [PATIENT REDACTED]");
    }
  });

  it("still redacts genuine patient names without provider anchors", () => {
    const out = fastSanitizeText(
      "Clinical summary for Eleanor Vance indicates improvement.",
      { standard: "HIPAA_SAFE_HARBOR", maskDateOfService: true }
    ).sanitizedText;
    expect(out).not.toContain("Eleanor Vance");
    expect(out).toContain("[PATIENT REDACTED]");
  });

  it("never surfaces placeholders via formatProviderDisplayName", () => {
    expect(formatProviderDisplayName("Dr. [PATIENT REDACTED], MD")).toBe("");
    expect(formatProviderDisplayName("[PATIENT REDACTED]")).toBe("");
    expect(formatProviderDisplayName("[PATIENT]")).toBe("");
    expect(formatProviderDisplayName("Dr. Sarah Chen, MD")).toBe("Dr. Sarah Chen, MD");
    expect(formatProviderDisplayName("General Hospital")).toBe("General Hospital");
  });

  it("resolveClaimProviderName collapses placeholders to honest empty", () => {
    expect(resolveClaimProviderName("Dr. [PATIENT REDACTED], MD")).toBe("");
    expect(resolveClaimProviderName("[PATIENT REDACTED]")).toBe("");
    expect(resolveClaimProviderName(undefined)).toBe("");
    expect(resolveClaimProviderName("Dr. Sarah Chen, MD")).toBe("Dr. Sarah Chen, MD");
  });

  it("does not emit provider-anchored heuristic entities", () => {
    const entities = detectPiiEntities("Treating Provider: Dr. Sarah Chen, MD", {
      patientName: "Eleanor Vance",
    });
    const providerHits = entities.filter((e) => e.originalText.includes("Sarah Chen"));
    expect(providerHits.length).toBe(0);
  });

  it("trusted UI never renders redaction placeholders for corrupted legacy rows", () => {
    expect(resolveProviderDisplayName("Dr. [PATIENT REDACTED], MD")).toBe("");
    expect(resolvePatientDisplayName("[PATIENT REDACTED]")).toBe(
      "Not specified in denial notice"
    );
    const corruptedClaim = {
      _id: "claim_corrupted",
      patientId: "patient_1",
      claimNumber: "CLM-CORRUPT-001",
      serviceDate: "2026-07-04",
      providerName: "Dr. [PATIENT REDACTED], MD",
      deniedAmount: 1000,
      patientOwedAmount: 1000,
      cptCodes: [],
      icd10Codes: [],
      denialReasonCode: "CO-50",
      denialReasonDescription: "Not medically necessary",
      status: "analyzing",
      statutoryDeadline: Date.now() + 86400000,
      daysRemaining: 10,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    } as never;
    const markup = renderToStaticMarkup(
      React.createElement(SimpleEvidenceView, {
        claim: corruptedClaim,
        evidences: [],
        scoringResult: null,
        onNavigateToStudio: () => {},
        onRunCompleteAnalysis: async () => {},
        isPipelineRunning: true,
      })
    );
    expect(markup).not.toContain("[PATIENT REDACTED]");
    expect(markup).not.toContain("Dr. [PATIENT");
    expect(markup).toContain("Reviewing the clinical documentation...");
  });
});

describe("member ID redaction regression (Member ID: [REDACTED MEMBER ID])", () => {
  it("resolveClaimMemberId/GroupNumber collapse placeholders to honest empty", () => {
    expect(resolveClaimMemberId("[REDACTED MEMBER ID]")).toBe("");
    expect(resolveClaimMemberId("[MEMBER_ID]")).toBe("");
    expect(resolveClaimMemberId("")).toBe("");
    expect(resolveClaimMemberId("GEO-554210-99")).toBe("GEO-554210-99");
    expect(resolveClaimGroupNumber("[REDACTED MEMBER ID]")).toBe("");
    expect(resolveClaimGroupNumber("GRP-88210")).toBe("GRP-88210");
  });

  it("display helpers never surface member placeholders", () => {
    expect(resolveMemberIdDisplay("[REDACTED MEMBER ID]")).toBe("N/A");
    expect(resolveMemberIdDisplay("[MEMBER_ID]")).toBe("N/A");
    expect(resolveMemberIdDisplay("PENDING")).toBe("N/A");
    expect(resolveMemberIdDisplay("GEO-554210-99")).toBe("GEO-554210-99");
    expect(resolveGroupNumberDisplay("[REDACTED MEMBER ID]")).toBe("");
    expect(resolveGroupNumberDisplay("GRP-88210")).toBe("GRP-88210");
  });

  it("dossier builder falls back honestly for masked member IDs", () => {
    const claim = {
      _id: "claim_corrupted_member",
      patientId: "patient_1",
      claimNumber: "CLM-6104-GEO-6006",
      serviceDate: "2026-07-04",
      providerName: "Dr. Sarah Chen, MD",
      deniedAmount: 18200,
      patientOwedAmount: 18200,
      cptCodes: ["63047"],
      icd10Codes: ["M51.16"],
      denialReasonCode: "CO-197",
      denialReasonDescription: "Precertification absent.",
      status: "drafting",
      statutoryDeadline: Date.now() + 86400000,
      daysRemaining: 180,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      patient: {
        _id: "patient_1",
        name: "Marcus Sterling",
        email: "",
        memberId: "[REDACTED MEMBER ID]",
        groupNumber: "[REDACTED MEMBER ID]",
        insurancePayer: "GeoBlue",
        createdAt: Date.now(),
      },
    } as never;
    const dossier = buildDossierData(claim, null, [], false);
    expect(dossier.memberId).toBe("MBN-UNASSIGNED");
    expect(dossier.memberId).not.toContain("REDACTED");
    expect(dossier.providerName).toBe("Dr. Sarah Chen, MD");
  });

  it("rehydrates vault tokens the model echoed into trusted text", () => {
    const tokenized = `Patient ${PHI_TOKENS.patientName} (Member ID: ${PHI_TOKENS.memberId})`;
    const restored = rehydrateForDisplay(tokenized, {
      patientName: "Marcus Sterling",
      memberId: "GEO-554210-99",
    });
    expect(restored).toContain("Marcus Sterling");
    expect(restored).toContain("GEO-554210-99");
    expect(restored).not.toContain("[PATIENT]");
    expect(restored).not.toContain("[MEMBER_ID]");
  });
});
