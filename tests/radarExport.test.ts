import { describe, it, expect } from "vitest";
import {
  sanitizeClaimForExport,
  buildClaimCsvHeaders,
  buildClaimCsvRow,
  exportClaimsToCsv,
  exportClaimsToJson,
} from "../src/lib/exportUtils";
import type { Claim } from "../src/types";

describe("Case Radar Export Utilities & HIPAA Safe Harbor Masking", () => {
  const mockClaim: Claim = {
    _id: "claim_123",
    patientId: "patient_abc",
    userId: "m979vmgr1z1ya8crj2w4q79q3s8df4v8",
    claimNumber: "CLM-6104-GEO-9621",
    serviceDate: "07/04/2026",
    providerName: "Dr. Sarah Chen, MD (Spine & Neurosurgery Associates)",
    deniedAmount: 18200,
    patientOwedAmount: 18200,
    cptCodes: ["63047"],
    icd10Codes: ["M51.26"],
    denialReasonCode: "CO-197",
    denialReasonDescription: "Precertification / prior authorization / notification absent or lacking.",
    status: "ready_for_review",
    statutoryDeadline: 1804696706899,
    daysRemaining: 180,
    overturnProbabilityScore: 90,
    assignedAgentEmail: "claimhero-sender@agentmail.to",
    patientName: "Marcus Sterling",
    patient: {
      _id: "patient_abc",
      name: "Marcus Sterling",
      email: "marcus.sterling@example.com",
      memberId: "PEN-610492",
      insurancePayer: "GeoBlue Worldwide Medical Insurance",
      createdAt: 1789144706899,
    },
    appealContext: {
      confirmedAt: 1789144709220,
      physicianNotes: "PATIENT: Marcus Sterling | DOB: 11/22/1974 | DOS: 07/04/2026\nATTENDING NEUROSURGEON EMERGENCY CLINICAL ATTESTATION:\nPatient Marcus Sterling presented on an emergency basis with acute intractable right lower extremity radiculopathy.",
      sender: {
        name: "Alex Morgan",
        credentials: "Surgical Case Coordinator",
        email: "alex.morgan@spineinstitute.org",
        phone: "(555) 456-7890",
      },
      clinicalFacts: {
        recordsAreIncomplete: false,
        symptomsAndFunctionalImpact: "Patient Marcus Sterling exhibits acute foot drop.",
        examinationFindings: "Objective right foot drop with extensor hallucis longus weakness (3/5).",
        imagingAndDiagnostics: "Emergency lumbar spine MRI (06/28/2026) demonstrated acute extruded L5-S1 disc herniation.",
        treatmentHistoryAndResponse: "Conservative outpatient physical therapy completed without resolution.",
        otherDocumentedFacts: "Emergency decompression required within 24 hours.",
      },
    },
    searchContent: "CLM-6104-GEO-9621 Marcus Sterling GeoBlue Worldwide Medical Insurance Dr. Sarah Chen CO-197 63047",
    redactionMetadata: {
      isRedacted: false,
      mode: "BALANCED_APPELLATE",
      redactedEntityCount: 0,
      maskedCategories: [],
      appliedAt: 1789144707612,
    },
    createdAt: 1789144706899,
    updatedAt: 1789144886290,
  };

  describe("Option 1: Export Redacted JSON (HIPAA Safe Harbor)", () => {
    it("scrubs direct patient identifiers, clinical narrative notes, and coordinator contact info", () => {
      const sanitized = sanitizeClaimForExport(mockClaim, true);

      // 1. Top-level and patient profile
      expect(sanitized.patientName).toBe("[REDACTED - M***]");
      expect(sanitized.patient?.name).toBe("[REDACTED - M***]");
      expect(sanitized.patient?.memberId).toBe("PEN*****");
      expect(sanitized.patient?.memberId).not.toContain("610492");
      expect(sanitized.patient?.email).toBe("[REDACTED]");

      // 2. Service date generalized to year-only per Safe Harbor
      expect(sanitized.serviceDate).toBe("**/**/2026");

      // 3. User account linkability scrubbed
      expect(sanitized.userId).toBe("[REDACTED]");

      // 4. Clinical notes deep sanitization
      const notes = sanitized.appealContext?.physicianNotes || "";
      expect(notes).not.toContain("Marcus Sterling");
      expect(notes).not.toContain("Marcus");
      expect(notes).not.toContain("Sterling");
      expect(notes).not.toContain("11/22/1974");
      expect(notes).not.toContain("07/04/2026");

      // 5. Coordinator direct contact scrubbed
      expect(sanitized.appealContext?.sender.email).toBe("[REDACTED EMAIL]");
      expect(sanitized.appealContext?.sender.phone).toBe("[REDACTED PHONE]");

      // 6. Clinical facts scrubbed of patient name
      expect(sanitized.appealContext?.clinicalFacts.symptomsAndFunctionalImpact).not.toContain("Marcus Sterling");

      // 7. Search content sanitized
      expect(sanitized.searchContent).not.toContain("Marcus Sterling");

      // 8. Redaction metadata synchronized
      expect(sanitized.redactionMetadata?.isRedacted).toBe(true);
      expect(sanitized.redactionMetadata?.mode).toBe("HIPAA_SAFE_HARBOR");
      expect(sanitized.redactionMetadata?.redactedEntityCount).toBeGreaterThan(0);
      expect(sanitized.redactionMetadata?.maskedCategories).toContain("name");
      expect(sanitized.redactionMetadata?.maskedCategories).toContain("member_id");
      expect(sanitized.redactionApplied).toBe("HIPAA Safe Harbor 45 CFR § 164.514");
    });

    it("generates valid JSON export string without any PHI leaks", () => {
      const jsonStr = exportClaimsToJson([mockClaim], true);
      const parsed = JSON.parse(jsonStr);

      expect(parsed).toHaveLength(1);
      expect(parsed[0].patientName).toBe("[REDACTED - M***]");
      expect(jsonStr).not.toContain("Marcus Sterling");
      expect(jsonStr).not.toContain("11/22/1974");
      expect(jsonStr).not.toContain("alex.morgan@spineinstitute.org");
      expect(jsonStr).not.toContain("456-7890");
    });
  });

  describe("Option 2: Export Redacted CSV (Safe Harbor)", () => {
    it("formats 15 standard columns with masked PHI, Member ID, and year-only Service Date", () => {
      const headers = buildClaimCsvHeaders();
      expect(headers).toHaveLength(15);
      expect(headers[0]).toBe("Claim Number");
      expect(headers[14]).toBe("Redaction Applied");

      const row = buildClaimCsvRow(mockClaim, true);
      expect(row).toHaveLength(15);
      expect(row[0]).toBe("CLM-6104-GEO-9621");
      expect(row[1]).toBe("[REDACTED - M***]");
      expect(row[2]).toBe("PEN*****");
      expect(row[9]).toBe("**/**/2026");
      expect(row[14]).toBe("YES (HIPAA Safe Harbor)");

      const csvContent = exportClaimsToCsv([mockClaim], true);
      expect(csvContent).not.toContain("Marcus Sterling");
      expect(csvContent).not.toContain("marcus.sterling@example.com");
      expect(csvContent).toContain("YES (HIPAA Safe Harbor)");
    });
  });

  describe("Option 3: Export Unredacted CSV (Advocate Audit)", () => {
    it("preserves unredacted fields when claim is not marked redacted in DB", () => {
      const row = buildClaimCsvRow(mockClaim, false);
      expect(row[1]).toBe("Marcus Sterling");
      expect(row[2]).toBe("PEN-610492");
      expect(row[9]).toBe("07/04/2026");
      expect(row[14]).toBe("NO (Full Audit)");
    });

    it("keeps already-redacted claims masked in audit copy", () => {
      const redactedClaim: Claim = {
        ...mockClaim,
        redactionMetadata: {
          isRedacted: true,
          mode: "HIPAA_SAFE_HARBOR",
          redactedEntityCount: 3,
          maskedCategories: ["name", "member_id"],
          appliedAt: Date.now(),
        },
      };

      const row = buildClaimCsvRow(redactedClaim, false);
      expect(row[1]).toBe("[REDACTED - M***]");
      expect(row[2]).toBe("PEN*****");
      expect(row[14]).toBe("YES (HIPAA Safe Harbor)");
    });
  });

  describe("Option 4: Export Unredacted JSON (Full Technical Audit Payload)", () => {
    it("returns raw unaltered technical claim payload when unredacted", () => {
      const result = sanitizeClaimForExport(mockClaim, false);
      expect(result.patientName).toBe("Marcus Sterling");
      expect(result.patient?.name).toBe("Marcus Sterling");
      expect(result.patient?.memberId).toBe("PEN-610492");
      expect(result.serviceDate).toBe("07/04/2026");
      expect(result.userId).toBe("m979vmgr1z1ya8crj2w4q79q3s8df4v8");
      expect(result.appealContext?.physicianNotes).toContain("Marcus Sterling");
      expect(result.appealContext?.sender.email).toBe("alex.morgan@spineinstitute.org");
    });

    it("safely sanitizes a claim if it was flagged as isRedacted in the database", () => {
      const redactedClaim: Claim = {
        ...mockClaim,
        redactionMetadata: {
          isRedacted: true,
          mode: "HIPAA_SAFE_HARBOR",
          redactedEntityCount: 3,
          maskedCategories: ["name", "member_id"],
          appliedAt: Date.now(),
        },
      };

      const result = sanitizeClaimForExport(redactedClaim, false);
      expect(result.patientName).toBe("[REDACTED - M***]");
      expect(result.appealContext?.physicianNotes).not.toContain("Marcus Sterling");
    });
  });

  describe("Edge Cases & Optional Fields", () => {
    it("gracefully handles claims without patient object or without appeal context", () => {
      const minimalClaim: Claim = {
        ...mockClaim,
        patient: undefined,
        patientName: undefined,
        appealContext: undefined,
        searchContent: undefined,
      };

      const sanitized = sanitizeClaimForExport(minimalClaim, true);
      expect(sanitized.patientName).toBe("[REDACTED]");
      expect(sanitized.patient).toBeUndefined();
      expect(sanitized.appealContext).toBeUndefined();

      const row = buildClaimCsvRow(minimalClaim, true);
      expect(row[1]).toBe("[REDACTED]");
      expect(row[2]).toBe("[REDACTED]");
    });

    it("masks CPT and CARC codes when configured in maskedCategories or PUBLIC_EXHIBIT mode", () => {
      const sensitiveClaim: Claim = {
        ...mockClaim,
        redactionMetadata: {
          isRedacted: true,
          mode: "PUBLIC_EXHIBIT",
          redactedEntityCount: 2,
          maskedCategories: ["cpt", "carc"],
          appliedAt: Date.now(),
        },
      };

      const sanitized = sanitizeClaimForExport(sensitiveClaim, true);
      expect(sanitized.cptCodes).toEqual(["[REDACTED-CPT]"]);
      expect(sanitized.denialReasonCode).toBe("[REDACTED-CARC]");

      const row = buildClaimCsvRow(sensitiveClaim, true);
      expect(row[4]).toBe("[REDACTED-CPT]");
      expect(row[5]).toBe("[REDACTED-CARC]");
    });

    it("deeply sanitizes nested latestAppeal brief when present on claim", () => {
      const claimWithAppeal: Claim = {
        ...mockClaim,
        latestAppeal: {
          _id: "appeal_1",
          claimId: "claim_123",
          version: 1,
          appealLevel: "level_1_internal",
          executiveSummary: "Appeal on behalf of Marcus Sterling regarding CPT 63047.",
          medicalNecessityArguments: "Patient Marcus Sterling suffered acute neurological deficits.",
          legalCitations: "ERISA 29 CFR § 2560.503-1 for Marcus Sterling",
          fullAppealMarkdown: "# Formal Appeal\nClaimant: Marcus Sterling\nDOB: 11/22/1974",
          lastEditedBy: "user_1",
          updatedAt: Date.now(),
        },
      };

      const sanitized = sanitizeClaimForExport(claimWithAppeal, true);
      expect(sanitized.latestAppeal).toBeDefined();
      expect(sanitized.latestAppeal?.executiveSummary).not.toContain("Marcus Sterling");
      expect(sanitized.latestAppeal?.medicalNecessityArguments).not.toContain("Marcus Sterling");
      expect(sanitized.latestAppeal?.fullAppealMarkdown).not.toContain("Marcus Sterling");
      expect(sanitized.latestAppeal?.fullAppealMarkdown).not.toContain("11/22/1974");
    });

    it("redacts patient groupNumber and handles self-advocate sender matching", () => {
      const selfAdvocateClaim: Claim = {
        ...mockClaim,
        patient: {
          ...mockClaim.patient!,
          groupNumber: "GRP-99420-CUSTOM",
        },
        appealContext: {
          ...mockClaim.appealContext!,
          sender: {
            name: "Marcus Sterling", // Self-advocate
            email: "marcus@personal.com",
            phone: "(555) 111-2222",
          },
        },
      };

      const sanitized = sanitizeClaimForExport(selfAdvocateClaim, true);
      expect(sanitized.patient?.groupNumber).toBe("[REDACTED]");
      expect(sanitized.appealContext?.sender.name).toBe("[REDACTED - M***]");
      expect(sanitized.appealContext?.sender.email).toBe("[REDACTED EMAIL]");
    });

    it("safely handles corrupted statutory deadlines and null probability scores in CSV", () => {
      const corruptedClaim: Claim = {
        ...mockClaim,
        statutoryDeadline: NaN as unknown as number,
        overturnProbabilityScore: null as unknown as number,
      };

      const row = buildClaimCsvRow(corruptedClaim, true);
      expect(row[10]).toBe(""); // Deadline is safely empty string without throwing RangeError
      expect(row[12]).toBe("N/A"); // Null score formatted as N/A
    });
  });
});
