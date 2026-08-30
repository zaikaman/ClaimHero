import { describe, it, expect } from "vitest";
import {
  detectPiiEntities,
  applyRedaction,
  fastSanitizeText,
  maskSsn,
  maskMemberId,
  maskDob,
  maskPatientName,
} from "../src/lib/redactionEngine";

describe("HIPAA-Compliant Automated Redaction Engine", () => {
  describe("Unit Masking Functions", () => {
    it("masks SSN correctly across compliance standards", () => {
      const ssn = "123-45-6789";
      expect(maskSsn(ssn, "HIPAA_SAFE_HARBOR")).toBe("***-**-****");
      expect(maskSsn(ssn, "BALANCED_APPELLATE")).toBe("***-**-6789");
      expect(maskSsn(ssn, "PUBLIC_EXHIBIT")).toBe("[REDACTED SSN]");
    });

    it("masks Member ID suffixes correctly across compliance standards", () => {
      const memberWithSuffix = "MBN9823412-01";
      expect(maskMemberId(memberWithSuffix, "BALANCED_APPELLATE")).toBe("MBN9823412-**");
      expect(maskMemberId(memberWithSuffix, "PUBLIC_EXHIBIT")).toBe("[REDACTED MEMBER ID]");
      expect(maskMemberId(memberWithSuffix, "HIPAA_SAFE_HARBOR")).toBe("MBN***-**");
    });

    it("masks Date of Birth correctly across compliance standards", () => {
      const dob = "05/14/1978";
      expect(maskDob(dob, "BALANCED_APPELLATE")).toBe("**/**/1978");
      expect(maskDob(dob, "HIPAA_SAFE_HARBOR")).toBe("**/**/****");
      expect(maskDob(dob, "PUBLIC_EXHIBIT")).toBe("[REDACTED DOB]");
    });

    it("masks Patient Name correctly across compliance standards", () => {
      const name = "Jordan Lee Taylor";
      expect(maskPatientName(name, "BALANCED_APPELLATE")).toBe("J. T.");
      expect(maskPatientName(name, "PUBLIC_EXHIBIT")).toBe("[PATIENT NAME REDACTED]");
      expect(maskPatientName(name, "HIPAA_SAFE_HARBOR")).toBe("[PATIENT REDACTED]");
    });
  });

  describe("PII Detection Engine", () => {
    it("detects standard hyphenated SSN and labeled SSNs", () => {
      const sample = "Patient SSN is 123-45-6789 and secondary record notes SSN: 987654321.";
      const entities = detectPiiEntities(sample);

      const ssnEntities = entities.filter((e) => e.category === "ssn");
      expect(ssnEntities.length).toBeGreaterThanOrEqual(2);
      expect(ssnEntities[0]?.originalText).toBe("123-45-6789");
      expect(ssnEntities[0]?.hipaaCategory).toContain("45 CFR § 164.514");
    });

    it("detects Member ID and dependent suffixes (-01, -02)", () => {
      const sample = "Insured Member ID: MBN9823412-01 under Group Policy # GRP-99214.";
      const entities = detectPiiEntities(sample);

      const memberEntities = entities.filter((e) => e.category === "member_id");
      expect(memberEntities.length).toBeGreaterThanOrEqual(1);
      expect(memberEntities[0]?.originalText).toContain("MBN9823412-01");
    });

    it("detects Dates of Birth in multiple formats", () => {
      const sample = "Patient DOB: 05/14/1978 was admitted on 01/10/2026. Alternate record: Birth Date: Oct 24, 1965.";
      const entities = detectPiiEntities(sample);

      const dobEntities = entities.filter((e) => e.category === "dob");
      expect(dobEntities.length).toBe(2);
      expect(dobEntities[0]?.originalText).toBe("05/14/1978");
      expect(dobEntities[1]?.originalText).toContain("Oct 24, 1965");
    });

    it("detects Medical Record Numbers (MRN)", () => {
      const sample = "Patient chart MRN: MRN-9847291 was transferred from clinic.";
      const entities = detectPiiEntities(sample);

      const mrnEntities = entities.filter((e) => e.category === "mrn");
      expect(mrnEntities.length).toBe(1);
      expect(mrnEntities[0]?.originalText).toBe("MRN-9847291");
    });

    it("detects phone numbers and personal emails while preserving official intake routing", () => {
      const sample = "Contact patient at (555) 019-2834 or jordan.taylor@example.com. Forward disputes to claimhero-intake@agentmail.to.";
      const entities = detectPiiEntities(sample);

      const contactEntities = entities.filter((e) => e.category === "contact");
      expect(contactEntities.some((e) => e.originalText === "(555) 019-2834")).toBe(true);
      expect(contactEntities.some((e) => e.originalText === "jordan.taylor@example.com")).toBe(true);
      // Official intake email should NOT be redacted
      expect(contactEntities.some((e) => e.originalText.includes("claimhero-intake"))).toBe(false);
    });

    it("detects explicit patient name when patientName option is provided", () => {
      const sample = "Clinical summary for Eleanor Vance indicates severe degenerative joint disease.";
      const entities = detectPiiEntities(sample, { patientName: "Eleanor Vance" });

      const nameEntities = entities.filter((e) => e.category === "name");
      expect(nameEntities.length).toBe(1);
      expect(nameEntities[0]?.originalText).toBe("Eleanor Vance");
    });

    it("detects user-supplied custom sensitive terms", () => {
      const sample = "Procedure performed at Valley Memorial Surgical Center by Dr. Aris.";
      const entities = detectPiiEntities(sample, {
        customTerms: ["Valley Memorial Surgical Center"],
      });

      const customEntities = entities.filter((e) => e.category === "custom");
      expect(customEntities.length).toBe(1);
      expect(customEntities[0]?.originalText).toBe("Valley Memorial Surgical Center");
    });
  });

  describe("Redaction Application & Compliance Modes", () => {
    const complexDocument = `EXPLANATION OF BENEFITS / DENIAL NOTICE
Patient Name: Eleanor Vance
Member ID: MBN9823412-01
DOB: 05/14/1978
SSN: 123-45-6789
Phone: (555) 019-2834
Email: eleanor.vance@mymail.com
Street Address: 742 Evergreen Terrace, Springfield
Diagnosis: M17.11 (Osteoarthritis)
CPT: 27447 (Total Knee Arthroplasty) - Denied $24,500.00`;

    it("executes HIPAA Safe Harbor standard with 100% de-identification", () => {
      const result = fastSanitizeText(complexDocument, {
        standard: "HIPAA_SAFE_HARBOR",
        patientName: "Eleanor Vance",
      });

      expect(result.isCertifiedSafe).toBe(true);
      expect(result.sanitizedText).not.toContain("123-45-6789");
      expect(result.sanitizedText).not.toContain("05/14/1978");
      expect(result.sanitizedText).not.toContain("(555) 019-2834");
      expect(result.sanitizedText).not.toContain("eleanor.vance@mymail.com");
      expect(result.sanitizedText).not.toContain("Eleanor Vance");
      // Clinical CPT and CARC should remain completely untouched
      expect(result.sanitizedText).toContain("CPT: 27447");
      expect(result.sanitizedText).toContain("M17.11");
      expect(result.stats.redactedCount).toBeGreaterThanOrEqual(5);
    });

    it("executes Balanced Appellate Mode preserving last 4 SSN and Member root ID", () => {
      const result = fastSanitizeText(complexDocument, {
        standard: "BALANCED_APPELLATE",
        patientName: "Eleanor Vance",
      });

      expect(result.sanitizedText).toContain("***-**-6789");
      expect(result.sanitizedText).toContain("MBN9823412-**");
      expect(result.sanitizedText).toContain("**/**/1978");
      expect(result.sanitizedText).toContain("E. V.");
    });

    it("executes Public Legal Exhibit Mode with total anonymization tags", () => {
      const result = fastSanitizeText(complexDocument, {
        standard: "PUBLIC_EXHIBIT",
        patientName: "Eleanor Vance",
      });

      expect(result.sanitizedText).toContain("[REDACTED SSN]");
      expect(result.sanitizedText).toContain("[REDACTED MEMBER ID]");
      expect(result.sanitizedText).toContain("[REDACTED DOB]");
      expect(result.sanitizedText).toContain("[PATIENT NAME REDACTED]");
    });

    it("respects selective entity overrides when individual entities are disabled", () => {
      const entities = detectPiiEntities(complexDocument, {
        standard: "HIPAA_SAFE_HARBOR",
        patientName: "Eleanor Vance",
      });

      // Disable the phone number entity
      const phoneEntity = entities.find((e) => e.category === "contact" && e.originalText.includes("555"));
      const disabledIds = phoneEntity ? [phoneEntity.id] : [];

      const filteredEntities = detectPiiEntities(complexDocument, {
        standard: "HIPAA_SAFE_HARBOR",
        patientName: "Eleanor Vance",
        disabledEntityIds: disabledIds,
      });

      const res = applyRedaction(complexDocument, filteredEntities, "CUSTOM");
      expect(res.sanitizedText).toContain("(555) 019-2834"); // Phone preserved
      expect(res.sanitizedText).not.toContain("123-45-6789"); // SSN still redacted
      expect(res.isCertifiedSafe).toBe(false); // Because custom override was applied
    });

    it("handles edge cases: empty strings, clean clinical notes, and special characters", () => {
      const emptyRes = fastSanitizeText("");
      expect(emptyRes.sanitizedText).toBe("");
      expect(emptyRes.stats.redactedCount).toBe(0);

      const cleanClinicalNote = "Patient presents with Kellgren-Lawrence Grade IV joint space narrowing. No prior surgical contraindications.";
      const cleanRes = fastSanitizeText(cleanClinicalNote);
      expect(cleanRes.stats.totalEntities).toBe(0);
      expect(cleanRes.sanitizedText).toBe(cleanClinicalNote);
    });
  });
});
