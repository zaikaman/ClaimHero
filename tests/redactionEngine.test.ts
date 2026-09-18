import { describe, it, expect } from "vitest";
import {
  detectPiiEntities,
  applyRedaction,
  fastSanitizeText,
  maskSsn,
  maskMemberId,
  maskDob,
  maskPatientName,
  maskMrn,
  maskPhone,
  maskEmail,
  maskAddress,
  isPlausibleSsnDigits,
  redactBeforeLLM,
} from "../src/lib/redactionEngine";

describe("HIPAA-Compliant Automated Redaction Engine", () => {
  describe("Unit Masking Functions", () => {
    it("masks SSN correctly across compliance standards", () => {
      const ssn = "123-45-6789";
      expect(maskSsn(ssn, "HIPAA_SAFE_HARBOR")).toBe("***-**-****");
      // BALANCED no longer preserves the last-4: it is a HIPAA identifier and
      // a quasi-identifier in combination with birth year / initials.
      expect(maskSsn(ssn, "BALANCED_APPELLATE")).toBe("***-**-****");
      expect(maskSsn(ssn, "PUBLIC_EXHIBIT")).toBe("[REDACTED SSN]");
      expect(maskSsn("12345", "BALANCED_APPELLATE")).toBe("[REDACTED SSN]");
    });

    it("masks MRN and address across compliance standards", () => {
      // BALANCED no longer preserves trailing MRN digits.
      expect(maskMrn("MRN-984210", "BALANCED_APPELLATE")).toBe("[REDACTED MRN]");
      expect(maskMrn("123", "BALANCED_APPELLATE")).toBe("[REDACTED MRN]");
      expect(maskMrn("MRN-984210", "PUBLIC_EXHIBIT")).toBe("[REDACTED MRN]");
      expect(maskAddress("123 Main St", "HIPAA_SAFE_HARBOR")).toBe("[REDACTED ADDRESS]");
    });

    it("masks contact identifiers fully in every standard", () => {
      expect(maskPhone("(555) 019-2834", "BALANCED_APPELLATE")).toBe("[REDACTED PHONE]");
      expect(maskPhone("(555) 019-2834", "HIPAA_SAFE_HARBOR")).toBe("[REDACTED PHONE]");
      expect(maskEmail("jordan.taylor@example.com", "BALANCED_APPELLATE")).toBe("[REDACTED EMAIL]");
      expect(maskEmail("jordan.taylor@example.com", "HIPAA_SAFE_HARBOR")).toBe("[REDACTED EMAIL]");
    });

    it("masks Member ID suffixes correctly across compliance standards", () => {
      const memberWithSuffix = "MBN9823412-01";
      // Every standard fully redacts beneficiary numbers: no root or suffix
      // fragment is preserved in any mode.
      expect(maskMemberId(memberWithSuffix, "BALANCED_APPELLATE")).toBe("[REDACTED MEMBER ID]");
      expect(maskMemberId(memberWithSuffix, "PUBLIC_EXHIBIT")).toBe("[REDACTED MEMBER ID]");
      expect(maskMemberId(memberWithSuffix, "HIPAA_SAFE_HARBOR")).toBe("[REDACTED MEMBER ID]");
      expect(maskMemberId(memberWithSuffix, "CUSTOM")).toBe("[REDACTED MEMBER ID]");

      // Member IDs without suffix
      expect(maskMemberId("MBN9823412", "HIPAA_SAFE_HARBOR")).toBe("[REDACTED MEMBER ID]");
      expect(maskMemberId("MBN9823412", "BALANCED_APPELLATE")).toBe("[REDACTED MEMBER ID]");
      expect(maskMemberId("MBN", "BALANCED_APPELLATE")).toBe("[REDACTED MEMBER ID]");
    });

    it("masks Date of Birth correctly across compliance standards", () => {
      const dob = "05/14/1978";
      // Safe Harbor permits the year; month/day are always removed.
      expect(maskDob(dob, "BALANCED_APPELLATE")).toBe("**/**/1978");
      expect(maskDob(dob, "HIPAA_SAFE_HARBOR")).toBe("**/**/1978");
      expect(maskDob("May 14", "HIPAA_SAFE_HARBOR")).toBe("**/**/****");
      expect(maskDob(dob, "PUBLIC_EXHIBIT")).toBe("[REDACTED DOB]");
    });

    it("masks Patient Name correctly across compliance standards", () => {
      const name = "Jordan Lee Taylor";
      // BALANCED no longer returns initials: they re-identify in combination.
      expect(maskPatientName(name, "BALANCED_APPELLATE")).toBe("[PATIENT REDACTED]");
      expect(maskPatientName("Cher", "BALANCED_APPELLATE")).toBe("[PATIENT REDACTED]");
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
      // Safe Harbor redacts every calendar date, not just DOB-labeled ones:
      // the admission date is caught by bare-date detection too.
      expect(dobEntities.length).toBe(3);
      expect(dobEntities[0]?.originalText).toBe("05/14/1978");
      expect(dobEntities.some((e) => e.originalText === "01/10/2026")).toBe(true);
      expect(dobEntities.some((e) => e.originalText.includes("Oct 24, 1965"))).toBe(true);
    });

    it("detects Medical Record Numbers (MRN)", () => {
      const sample = "Patient chart MRN: MRN-9847291 was transferred from clinic.";
      const entities = detectPiiEntities(sample);

      const mrnEntities = entities.filter((e) => e.category === "mrn");
      expect(mrnEntities.length).toBe(1);
      expect(mrnEntities[0]?.originalText).toBe("MRN-9847291");
    });

    it("detects phone numbers and personal emails while preserving official sender routing", () => {
      const sample = "Contact patient at (555) 019-2834 or jordan.taylor@example.com. Forward disputes to claimhero-sender@agentmail.to.";
      const entities = detectPiiEntities(sample);

      const contactEntities = entities.filter((e) => e.category === "contact");
      expect(contactEntities.some((e) => e.originalText === "(555) 019-2834")).toBe(true);
      expect(contactEntities.some((e) => e.originalText === "jordan.taylor@example.com")).toBe(true);
      // Official sender email should NOT be redacted
      expect(contactEntities.some((e) => e.originalText.includes("claimhero-sender"))).toBe(false);
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
MRN: MRN-984210
DOB: 05/14/1978
SSN: 123-45-6789
Phone: (555) 019-2834
Email: eleanor.vance@mymail.com
Street Address: 742 Evergreen Blvd, Springfield
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
      expect(result.sanitizedText).toContain("[REDACTED ADDRESS]");
      // Clinical CPT and CARC should remain completely untouched
      expect(result.sanitizedText).toContain("CPT: 27447");
      expect(result.sanitizedText).toContain("M17.11");
      expect(result.stats.redactedCount).toBeGreaterThanOrEqual(6);
    });

    it("executes Balanced Appellate Mode with full Safe Harbor masking", () => {
      const result = fastSanitizeText(complexDocument, {
        standard: "BALANCED_APPELLATE",
        patientName: "Eleanor Vance",
      });

      // No quasi-identifier preservation in any mode: no last-4, no birth
      // year disclosure beyond the Safe Harbor year, no initials, no email
      // prefix, no phone/MRN fragments.
      expect(result.sanitizedText).toContain("***-**-****");
      expect(result.sanitizedText).not.toContain("123-45-6789");
      expect(result.sanitizedText).toContain("[REDACTED MEMBER ID]");
      expect(result.sanitizedText).not.toContain("MBN9823412-01");
      expect(result.sanitizedText).toContain("[REDACTED MRN]");
      expect(result.sanitizedText).toContain("**/**/1978");
      expect(result.sanitizedText).toContain("[PATIENT REDACTED]");
      expect(result.sanitizedText).not.toContain("Eleanor Vance");
      expect(result.sanitizedText).not.toContain("E. V.");
      expect(result.sanitizedText).toContain("[REDACTED ADDRESS]");
      expect(result.sanitizedText).toContain("[REDACTED EMAIL]");
      expect(result.sanitizedText).toContain("[REDACTED PHONE]");
    });

    it("executes Public Legal Exhibit Mode with total anonymization tags", () => {
      const result = fastSanitizeText(complexDocument, {
        standard: "PUBLIC_EXHIBIT",
        patientName: "Eleanor Vance",
      });

      expect(result.sanitizedText).toContain("[REDACTED SSN]");
      expect(result.sanitizedText).toContain("[REDACTED MEMBER ID]");
      expect(result.sanitizedText).toContain("[REDACTED MRN]");
      expect(result.sanitizedText).toContain("[REDACTED DOB]");
      expect(result.sanitizedText).toContain("[PATIENT NAME REDACTED]");
      expect(result.sanitizedText).toContain("[REDACTED ADDRESS]");
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

      const textWithAddress = "Patient resides at 1234 Medical Center Blvd Suite 500 and visited Confidential Clinic at 789 Health Park Ave.";
      const addressEntities = detectPiiEntities(textWithAddress, {
        customTerms: ["Confidential Clinic"],
      });
      expect(addressEntities.some((e) => e.category === "address")).toBe(true);
      expect(addressEntities.some((e) => e.category === "custom")).toBe(true);

      const sanitizedAddress = fastSanitizeText(textWithAddress);
      expect(sanitizedAddress.sanitizedText).toContain("[REDACTED ADDRESS]");
    });

    it("preserves Date of Service (DOS) by default during normal intake and LLM prompts", () => {
      const claimText = "Claim #CLM-6104-GEO | Patient: Marcus Sterling | DOB: 11/22/1974 | Date of Service: 07/04/2026 | Procedure: 63047";
      const sanitized = fastSanitizeText(claimText);

      // DOB must be redacted under HIPAA Safe Harbor (year retained per Safe Harbor)
      expect(sanitized.sanitizedText).toContain("**/**/1974");
      expect(sanitized.sanitizedText).not.toContain("11/22/1974");
      // Date of Service must be PRESERVED so that claims and appeals have the authentic date
      expect(sanitized.sanitizedText).toContain("Date of Service: 07/04/2026");
      expect(sanitized.sanitizedText).not.toContain("Date of Service: **/**/");
      // Preservation is disclosed, so callers know the output is not de-identified
      expect(sanitized.warnings.some((w) => /Date\(s\) of Service preserved/i.test(w))).toBe(true);
    });

    it("redacts both the phone and the address when a phone number precedes an address", () => {
      // Regression: the address anchor used to start inside the phone fragment
      // ("2834 or 1234 Medical Center Blvd Suite"), overlap with the phone
      // entity, get suppressed, and silently swallow the true address.
      const text = "Contact patient at (555) 019-2834 or 1234 Medical Center Blvd Suite 500.";
      const entities = detectPiiEntities(text);
      expect(entities.some((e) => e.category === "contact")).toBe(true);
      const addresses = entities.filter((e) => e.category === "address");
      expect(addresses.length).toBe(1);
      expect(addresses[0]?.originalText).toBe("1234 Medical Center Blvd Suite");

      const sanitized = fastSanitizeText(text).sanitizedText;
      expect(sanitized).toContain("[REDACTED PHONE]");
      expect(sanitized).toContain("[REDACTED ADDRESS]");
      expect(sanitized).not.toContain("1234 Medical Center Blvd Suite");
    });

    it("still finds addresses adjacent to SSN, member-ID, and decimal-measure runs", () => {
      const ssnText = "SSN: 123-45-6789, 742 Evergreen Blvd, Springfield";
      const ssnEntities = detectPiiEntities(ssnText);
      expect(ssnEntities.some((e) => e.category === "ssn")).toBe(true);
      expect(ssnEntities.some((e) => e.category === "address")).toBe(true);

      const memberText = "Member ID: MBN9823412-01, 742 Evergreen Blvd, Springfield";
      const memberEntities = detectPiiEntities(memberText, { patientName: "Test Patient" });
      expect(memberEntities.some((e) => e.category === "member_id")).toBe(true);
      expect(memberEntities.some((e) => e.category === "address")).toBe(true);

      // A decimal clinical measure must not become a house number that spans
      // forward into a later address ("5 mg daily, 123 Main St" is not an address).
      const decimalText = "Takes 12.5 mg daily. Lives at 123 Main St, Springfield.";
      const decimalEntities = detectPiiEntities(decimalText);
      const decimalAddresses = decimalEntities.filter((e) => e.category === "address");
      expect(decimalAddresses.length).toBe(1);
      expect(decimalAddresses[0]?.originalText).toBe("123 Main St");
    });

    it("masks Date of Service (DOS) only when explicitly configured or in PUBLIC_EXHIBIT mode", () => {
      const claimText = "DOS: 07/04/2026 and Service Date: 06/12/2026";

      // 1. Explicit maskDateOfService (e.g. for de-identified exports) retains year under Safe Harbor
      const exportSanitized = fastSanitizeText(claimText, {
        standard: "HIPAA_SAFE_HARBOR",
        maskDateOfService: true,
      });
      expect(exportSanitized.sanitizedText).toBe("DOS: **/**/2026 and Service Date: **/**/2026");

      // 2. PUBLIC_EXHIBIT mode masks to exhibit placeholder
      const exhibitSanitized = fastSanitizeText(claimText, {
        standard: "PUBLIC_EXHIBIT",
      });
      expect(exhibitSanitized.sanitizedText).toBe("DOS: [REDACTED DOS] and Service Date: [REDACTED DOS]");
    });
  });

  describe("Production Hardening: Bare Identifiers, Names & Safety Semantics", () => {
    it("detects bare 9-digit SSNs without dashes or prefixes", () => {
      expect(isPlausibleSsnDigits("123456789")).toBe(true);
      expect(isPlausibleSsnDigits("000123456")).toBe(false);
      expect(isPlausibleSsnDigits("666123456")).toBe(false);
      expect(isPlausibleSsnDigits("900123456")).toBe(false);
      expect(isPlausibleSsnDigits("123009999")).toBe(false);

      const entities = detectPiiEntities("Secondary record notes SSN 987654321 on file.");
      const ssn = entities.filter((e) => e.category === "ssn");
      expect(ssn.length).toBeGreaterThanOrEqual(1);
      expect(ssn.some((e) => e.originalText === "987654321")).toBe(true);

      const sanitized = fastSanitizeText("Secondary record notes SSN 987654321 on file.");
      expect(sanitized.sanitizedText).not.toContain("987654321");
      expect(sanitized.sanitizedText).toContain("***-**-****");
    });

    it("does not mistake phone fragments or member IDs for bare SSNs", () => {
      const phoneEntities = detectPiiEntities("Call (555) 019-2834 today.");
      expect(phoneEntities.some((e) => e.category === "ssn")).toBe(false);
      expect(phoneEntities.some((e) => e.category === "contact")).toBe(true);

      const memberEntities = detectPiiEntities("Member ID: MBN9823412-01 confirmed.");
      expect(memberEntities.some((e) => e.category === "member_id")).toBe(true);
    });

    it("redacts bare calendar dates even without a DOB label", () => {
      const entities = detectPiiEntities("Chart notes birth 04/14/1968 and follow-up 2026-07-04.");
      const dates = entities.filter((e) => e.category === "dob");
      expect(dates.some((e) => e.originalText === "04/14/1968")).toBe(true);
      expect(dates.some((e) => e.originalText === "2026-07-04")).toBe(true);

      const sanitized = fastSanitizeText("Chart notes birth 04/14/1968.", {
        patientName: "Test Patient",
      });
      expect(sanitized.sanitizedText).not.toContain("04/14/1968");
      expect(sanitized.sanitizedText).toContain("**/**/1968");
    });

    it("detects standalone member IDs without a dependent suffix", () => {
      const entities = detectPiiEntities("Verify coverage for MBN9823412 before submission.");
      const member = entities.filter((e) => e.category === "member_id");
      expect(member.length).toBeGreaterThanOrEqual(1);
      expect(member[0]?.originalText).toBe("MBN9823412");

      const sanitized = fastSanitizeText("Verify coverage for MBN9823412 before submission.");
      expect(sanitized.sanitizedText).not.toContain("MBN9823412");
      expect(sanitized.sanitizedText).toContain("[REDACTED MEMBER ID]");
    });

    it("detects group numbers via the Group label", () => {
      const entities = detectPiiEntities("Group Number: GRP-99420-CUSTOM on file.");
      expect(entities.some((e) => e.category === "member_id")).toBe(true);
      const sanitized = fastSanitizeText("Group Number: GRP-99420-CUSTOM on file.");
      expect(sanitized.sanitizedText).not.toContain("GRP-99420-CUSTOM");
    });

    it("catches surname-only mentions when patientName is supplied", () => {
      const text = "Eleanor Vance was admitted. Vance tolerated the procedure well.";
      const entities = detectPiiEntities(text, { patientName: "Eleanor Vance" });
      const names = entities.filter((e) => e.category === "name");
      expect(names.length).toBeGreaterThanOrEqual(2);

      const sanitized = fastSanitizeText(text, { patientName: "Eleanor Vance" });
      expect(sanitized.sanitizedText).not.toContain("Vance");
      expect(sanitized.sanitizedText).not.toContain("Eleanor");
    });

    it("flags free-floating person names even without patientName context", () => {
      const entities = detectPiiEntities("Clinical summary for Eleanor Vance indicates improvement.");
      const names = entities.filter((e) => e.category === "name");
      expect(names.some((e) => e.originalText === "Eleanor Vance")).toBe(true);

      const result = fastSanitizeText("Clinical summary for Eleanor Vance indicates improvement.");
      expect(result.sanitizedText).not.toContain("Eleanor Vance");
      expect(result.warnings.some((w) => /Heuristic person-name/i.test(w))).toBe(true);
    });

    it("does not redact clinical procedure phrases as person names", () => {
      const entities = detectPiiEntities(
        "Patient presents with Kellgren-Lawrence Grade IV joint space narrowing. Total Knee Arthroplasty discussed."
      );
      const names = entities.filter((e) => e.category === "name");
      expect(names.length).toBe(0);
    });

    it("never certifies preserved names or reviewer overrides as safe", () => {
      const preserved = fastSanitizeText("Patient: Marcus Sterling | DOB: 11/22/1974", {
        preservePatientName: true,
      });
      expect(preserved.isCertifiedSafe).toBe(false);
      expect(preserved.warnings.some((w) => /intentionally preserved/i.test(w))).toBe(true);
      expect(preserved.sanitizedText).toContain("Marcus Sterling");

      const entities = detectPiiEntities("SSN: 123-45-6789", { standard: "HIPAA_SAFE_HARBOR" });
      const disabled = entities.map((e) => e.id);
      const overridden = applyRedaction(
        "SSN: 123-45-6789",
        detectPiiEntities("SSN: 123-45-6789", {
          standard: "HIPAA_SAFE_HARBOR",
          disabledEntityIds: disabled,
        }),
        "CUSTOM",
        { standard: "CUSTOM", disabledEntityIds: disabled }
      );
      expect(overridden.isCertifiedSafe).toBe(false);
      expect(overridden.sanitizedText).toContain("123-45-6789");
    });

    it("warns instead of certifying undetected text as safe", () => {
      const clean = fastSanitizeText("No identifiers here, just a routine note.");
      expect(clean.warnings.some((w) => /cannot guarantee absence of PHI/i.test(w))).toBe(true);
    });

    it("redactBeforeLLM forces HIPAA with DOS masking even when callers ask otherwise", () => {
      const out = redactBeforeLLM("DOS: 07/04/2026 and DOB: 05/14/1978", {
        standard: "BALANCED_APPELLATE",
        maskDateOfService: false,
      } as never);
      expect(out).not.toContain("07/04/2026");
      expect(out).not.toContain("05/14/1978");
    });

    it("keeps clinical codes and amounts intact while redacting bare identifiers", () => {
      const out = fastSanitizeText("CPT: 27447 M17.11 denied $24,500.00 for MBN9823412 born 04/14/1968.");
      expect(out.sanitizedText).toContain("27447");
      expect(out.sanitizedText).toContain("M17.11");
      expect(out.sanitizedText).not.toContain("MBN9823412");
      expect(out.sanitizedText).not.toContain("04/14/1968");
    });

    it("redacts ZIP+4 and state-anchored ZIPs while keeping states and CPT codes", () => {
      const zip4 = detectPiiEntities("Mail to Springfield, IL 62701-1234 today.");
      expect(zip4.some((e) => e.category === "address" && e.originalText === "62701-1234")).toBe(true);

      const out = fastSanitizeText("Mail records to Springfield, IL 62701 for CPT 27447.");
      expect(out.sanitizedText).toContain("IL");
      expect(out.sanitizedText).not.toContain("62701");
      expect(out.sanitizedText).toContain("27447");

      const poBox = fastSanitizeText("Send to P.O. Box 1000 for review.");
      expect(poBox.sanitizedText).not.toContain("P.O. Box 1000");
      expect(poBox.sanitizedText).toContain("[REDACTED ADDRESS]");
    });

    it("does not certify output with preserved DOS dates as safe", () => {
      const preserved = fastSanitizeText("DOS: 07/04/2026 confirmed.");
      expect(preserved.isCertifiedSafe).toBe(false);
      expect(preserved.sanitizedText).toContain("07/04/2026");
      expect(preserved.warnings.some((w) => /Date\(s\) of Service preserved/i.test(w))).toBe(true);

      const masked = fastSanitizeText("DOS: 07/04/2026 confirmed.", { maskDateOfService: true });
      expect(masked.isCertifiedSafe).toBe(true);
      expect(masked.sanitizedText).not.toContain("07/04/2026");
    });

    it("redacts ISO datetimes including the time component", () => {
      const out = fastSanitizeText("Recorded at 2026-07-04T10:30:00 in the chart.");
      expect(out.sanitizedText).not.toContain("2026-07-04");
      expect(out.sanitizedText).not.toContain("10:30:00");
      expect(out.sanitizedText).toContain("**/**/2026");
    });

    it("detects hyphenated and lowercase standalone member IDs without touching CARC codes", () => {
      for (const id of ["PEN-610492", "GRP-99214", "mbn9823412"]) {
        const entities = detectPiiEntities(`Coverage under ${id} is active.`);
        expect(entities.some((e) => e.category === "member_id")).toBe(true);
        expect(fastSanitizeText(`Coverage under ${id} is active.`).sanitizedText).not.toContain(id);
      }
      const carc = fastSanitizeText("Denial CO-50 issued for CLM-6104.");
      expect(carc.sanitizedText).toContain("CO-50");
      expect(carc.sanitizedText).toContain("CLM-6104");
    });

    it("redacts ordinal dates with and without DOB labels", () => {
      const prefixed = fastSanitizeText("DOB: Oct 24th, 1965 on file.", { patientName: "Test Patient" });
      expect(prefixed.sanitizedText).not.toContain("Oct 24th, 1965");

      const bare = fastSanitizeText("Born May 14th 1978 at home.", { patientName: "Test Patient" });
      expect(bare.sanitizedText).not.toContain("May 14th 1978");
      expect(bare.sanitizedText).toContain("**/**/1978");
    });

    it("catches apostrophized names and single surnames after labels", () => {
      const apostrophe = fastSanitizeText("Sean O'Brien tolerated the procedure.", {
        patientName: "Sean O'Brien",
      });
      expect(apostrophe.sanitizedText).not.toContain("O'Brien");

      const lone = detectPiiEntities("Patient: Vance presented with pain.");
      expect(lone.some((e) => e.category === "name" && e.originalText === "Vance")).toBe(true);
    });

    it("redacts unformatted phones and fax fragments without touching timestamps", () => {
      const ten = fastSanitizeText("Call 5550192834 today.");
      expect(ten.sanitizedText).not.toContain("5550192834");

      const fax = fastSanitizeText("Fax 019-2834 for records.");
      expect(fax.sanitizedText).not.toContain("019-2834");

      const stamp = fastSanitizeText("Event 1789144706899 logged for CPT 27447.");
      expect(stamp.sanitizedText).toContain("1789144706899");
      expect(stamp.sanitizedText).toContain("27447");
    });

    it("redacts spaced 3-3-3 SSN-shaped runs only when issuance-plausible", () => {
      const plausible = fastSanitizeText("Record shows 123 456 789 on the card.");
      expect(plausible.sanitizedText).not.toContain("123 456 789");

      const invalid = fastSanitizeText("Batch 000 123 456 counted.");
      expect(invalid.sanitizedText).toContain("000 123 456");
    });
  });
});
