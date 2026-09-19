import { describe, it, expect, vi } from "vitest";
import { DEFAULT_POLICY_SNAPSHOT_TTL_MS } from "../convex/actions/policyCrawler";
import { validateOcrAppealsEmail } from "../convex/actions/opticalParser";
import { resolveStatutoryDeadline } from "../convex/lib/dateUtils";
import { calculateErisaPenalties, getDefaultErisaPenalties } from "../src/lib/liabilityCalculator";
import { formatWhatHappenedSentence, formatDeadlineSentence } from "../src/lib/plainCopy";
import { extractTextFromPdf, extractTextFromImage } from "../src/lib/clientOcr";
import type { Claim } from "../src/types";

describe("Production Reliability Hardening", () => {
  describe("Policy Crawler TTL & Cache Expiration", () => {
    it("defines a 7-day default snapshot TTL", () => {
      expect(DEFAULT_POLICY_SNAPSHOT_TTL_MS).toBe(7 * 24 * 60 * 60 * 1000);
      expect(DEFAULT_POLICY_SNAPSHOT_TTL_MS).toBe(604800000);
    });
  });

  describe("OCR Email Validation & Security Gates", () => {
    it("validates legitimate payer appeals email addresses", () => {
      expect(validateOcrAppealsEmail("appeals@molinahealthcare.com")).toBe("appeals@molinahealthcare.com");
      expect(validateOcrAppealsEmail(" grievance.appeals@anthem.com ")).toBe("grievance.appeals@anthem.com");
      expect(validateOcrAppealsEmail("claims_dispute+fl@uhc.com")).toBe("claims_dispute+fl@uhc.com");
    });

    it("rejects non-string or whitespace-only inputs", () => {
      expect(validateOcrAppealsEmail(null)).toBeNull();
      expect(validateOcrAppealsEmail(undefined)).toBeNull();
      expect(validateOcrAppealsEmail(12345)).toBeNull();
      expect(validateOcrAppealsEmail("   ")).toBeNull();
      expect(validateOcrAppealsEmail("invalid email with spaces@domain.com")).toBeNull();
    });

    it("rejects dummy and placeholder domains", () => {
      expect(validateOcrAppealsEmail("test@example.com")).toBeNull();
      expect(validateOcrAppealsEmail("admin@test.com")).toBeNull();
      expect(validateOcrAppealsEmail("nobody@placeholder.com")).toBeNull();
      expect(validateOcrAppealsEmail("user@domain.com")).toBeNull();
      expect(validateOcrAppealsEmail("foo@invalid.org")).toBeNull();
    });

    it("rejects asset and binary image file extensions", () => {
      expect(validateOcrAppealsEmail("logo@banner.png")).toBeNull();
      expect(validateOcrAppealsEmail("header@site.jpg")).toBeNull();
      expect(validateOcrAppealsEmail("doc@evidence.pdf")).toBeNull();
      expect(validateOcrAppealsEmail("icon@brand.svg")).toBeNull();
    });

    it("rejects collision with patient contact email to prevent dispatch loops", () => {
      const patientEmail = "patient.jane.doe@gmail.com";
      expect(validateOcrAppealsEmail("patient.jane.doe@gmail.com", patientEmail)).toBeNull();
      expect(validateOcrAppealsEmail("PATIENT.JANE.DOE@GMAIL.COM", patientEmail)).toBeNull();
      expect(validateOcrAppealsEmail("payer.appeals@uhc.com", patientEmail)).toBe("payer.appeals@uhc.com");
    });
  });

  describe("ERISA Statutory Deadline Integrity", () => {
    it("falls back to Unknown without fabricating 180-day deadline when dates are missing or invalid", () => {
      const result = resolveStatutoryDeadline({
        denialDate: undefined,
        serviceDate: undefined,
        appealFilingDeadlineDays: 180,
      });

      expect(result.anchorType).toBe("unknown");
      expect(result.statutoryDeadline).toBeUndefined();
      expect(result.daysRemaining).toBeUndefined();
      expect(result.anchorDate).toBe("Unknown");
    });

    it("falls back to Unknown when garbage strings are provided", () => {
      const result = resolveStatutoryDeadline({
        denialDate: "not-a-date",
        serviceDate: "N/A",
      });

      expect(result.anchorType).toBe("unknown");
      expect(result.statutoryDeadline).toBeUndefined();
      expect(result.daysRemaining).toBeUndefined();
    });

    it("calculates accurate deadlines when valid denial date is present", () => {
      const now = Date.UTC(2026, 7, 19, 12, 0, 0);
      const denialDate = "2026-08-19";
      const result = resolveStatutoryDeadline({
        denialDate,
        appealFilingDeadlineDays: 180,
        now,
      });

      expect(result.anchorType).toBe("denial");
      expect(result.statutoryDeadline).toBeDefined();
      expect(result.daysRemaining).toBe(180);
    });
  });

  describe("DOL Statutory Penalty Rate Alignment", () => {
    it("defaults to $164/day inflation-adjusted rate under 29 CFR 2575.502c-1", () => {
      const result = calculateErisaPenalties({
        documentRequestDate: "2026-07-01",
        calculationDate: "2026-08-15", // 45 days elapsed -> 15 days default
        complianceStatus: "defaulted",
      });

      expect(result.data.dailyPenaltyRate).toBe(164.0);
      expect(result.data.accruedPenaltyAmount).toBe(15 * 164.0);
    });

    it("getDefaultErisaPenalties uses $164/day for initial claim setup", () => {
      const claim = {
        _id: "claim_1" as any,
        _creationTime: 123456,
        claimNumber: "CLM-TEST-01",
        deniedAmount: 15000,
        patientState: "FL",
        status: "ingested",
        appealLevel: "level_1_internal",
        daysRemaining: 30,
        statutoryDeadline: Date.now() + 30 * 86400000,
      } as unknown as Claim;

      const defaults = getDefaultErisaPenalties(claim);
      expect(defaults.dailyPenaltyRate).toBe(164.0);
    });
  });

  describe("Plain Copy Format & Crash Guard Sanity", () => {
    it("guards formatWhatHappenedSentence against NaN deniedAmount", () => {
      const result = formatWhatHappenedSentence({
        patient: { name: "John Doe", insurancePayer: "Aetna" },
        deniedAmount: NaN,
        cptCodes: ["99213"],
        denialReasonCode: "CO-50",
      });

      expect(result).not.toContain("$NaN");
      expect(result).toContain("$0");
      expect(result).toContain("John Doe's");
    });

    it("guards formatDeadlineSentence against missing, zero, or invalid timestamps", () => {
      expect(formatDeadlineSentence(undefined, undefined)).toBe(
        "Appeal deadline: Unknown (pending denial notice date)"
      );
      expect(formatDeadlineSentence(NaN, NaN)).toBe(
        "Appeal deadline: Unknown (pending denial notice date)"
      );
      expect(formatDeadlineSentence(0, 0)).toBe(
        "Appeal deadline: Unknown (pending denial notice date)"
      );
      expect(formatDeadlineSentence(-100, -10)).toBe(
        "Appeal deadline: Unknown (pending denial notice date)"
      );

      const validTimestamp = new Date("2026-10-15T00:00:00Z").getTime();
      const validStr = formatDeadlineSentence(validTimestamp, 26);
      expect(validStr).toContain("Appeal deadline:");
      expect(validStr).toContain("26 days left");
      expect(validStr).not.toContain("Invalid Date");
    });
  });

  describe("Client OCR Intake Guardrails", () => {
    it("aborts extractTextFromPdf when buffer exceeds 10MB", async () => {
      const oversizedBuffer = new ArrayBuffer(11 * 1024 * 1024);
      await expect(extractTextFromPdf(oversizedBuffer)).rejects.toThrow(
        /exceeds the 10MB maximum size limit/
      );
    });

    it("aborts extractTextFromImage when file exceeds 10MB", async () => {
      const oversizedBlob = new Blob([new Uint8Array(11 * 1024 * 1024)], { type: "image/png" });
      const fakeFile = new File([oversizedBlob], "large_scan.png", { type: "image/png" });
      await expect(extractTextFromImage(fakeFile)).rejects.toThrow(
        /exceeds the 10MB maximum size limit/
      );
    });
  });
});
