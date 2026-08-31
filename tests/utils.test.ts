import { describe, it, expect } from "vitest";
import {
  cn,
  formatCurrency,
  formatDate,
  formatDateTime,
  formatDeadlineRemaining,
  getStatusConfig,
  getRiskBadgeConfig,
  getScoreColor,
  stripMarkdownFormatting,
} from "../src/lib/utils";
import {
  getPayerAppellateContact,
  VERIFIED_PAYER_DIRECTORY,
  DENIAL_REASON_CODES,
  CPT_CODES,
  STATUTORY_REGULATIONS,
  CLAIM_STATUS_CONFIG,
  SIMULATION_STAGES,
  SAMPLE_CASE_PRESETS,
} from "../src/lib/constants";

describe("src/lib/utils Unit Tests", () => {
  it("cn merges class names properly and resolves Tailwind conflicts", () => {
    expect(cn("bg-red-500", "bg-blue-500")).toBe("bg-blue-500");
    expect(cn("p-4", undefined, null, false, "text-white")).toBe("p-4 text-white");
    expect(cn(["flex", "items-center"], { "justify-center": true, "hidden": false })).toBe("flex items-center justify-center");
  });

  it("formatCurrency formats US healthcare monetary numbers with full cents precision", () => {
    expect(formatCurrency(24500)).toBe("$24,500.00");
    expect(formatCurrency(0)).toBe("$0.00");
    expect(formatCurrency(1234.56)).toBe("$1,234.56");
  });

  it("formatDate formats timestamps and date strings accurately", () => {
    const timestamp = new Date("2026-06-12T12:00:00Z").getTime();
    expect(formatDate(timestamp)).toContain("2026");
    expect(formatDate("2026-06-12")).toContain("2026");
  });

  it("formatDateTime formats timestamp with time", () => {
    const timestamp = new Date("2026-06-12T15:30:00Z").getTime();
    const formatted = formatDateTime(timestamp);
    expect(formatted).toContain("2026");
    expect(formatted).toMatch(/\d+:\d{2}/);
  });

  it("formatDeadlineRemaining calculates critical, urgent, and standard statuses", () => {
    const expired = formatDeadlineRemaining(0);
    expect(expired.isUrgent).toBe(true);
    expect(expired.isCritical).toBe(true);
    expect(expired.text).toBe("Deadline Expired");

    const negative = formatDeadlineRemaining(-5);
    expect(negative.isUrgent).toBe(true);
    expect(negative.text).toBe("Deadline Expired");

    const urgent = formatDeadlineRemaining(10);
    expect(urgent.isUrgent).toBe(true);
    expect(urgent.isCritical).toBe(true);
    expect(urgent.text).toBe("10d Remaining (Urgent)");

    const moderate = formatDeadlineRemaining(30);
    expect(moderate.isUrgent).toBe(false);
    expect(moderate.isCritical).toBe(false);
    expect(moderate.text).toBe("30d Remaining");

    const standard = formatDeadlineRemaining(90);
    expect(standard.isUrgent).toBe(false);
    expect(standard.isCritical).toBe(false);
    expect(standard.text).toBe("90d Statutory Clock");
  });

  it("getStatusConfig returns correct configuration or fallback", () => {
    const known = getStatusConfig("ready_for_review");
    expect(known.label).toBe("Ready for Review");
    expect(known.color).toBe("text-cyan-300");

    const unknown = getStatusConfig("custom_unknown_status");
    expect(unknown.label).toBe("custom_unknown_status");
    expect(unknown.color).toBe("text-slate-400");
  });

  it("getRiskBadgeConfig returns appropriate badge styles", () => {
    const high = getRiskBadgeConfig("high_confidence");
    expect(high.label).toBe("High Win Probability");
    expect(high.color).toBe("text-emerald-300");

    const mod = getRiskBadgeConfig("moderate");
    expect(mod.label).toBe("Moderate Contestation");
    expect(mod.color).toBe("text-amber-300");

    const complex = getRiskBadgeConfig("complex_litigation");
    expect(complex.label).toBe("Complex ERISA Litigation");
    expect(complex.color).toBe("text-rose-300");

    const fallback = getRiskBadgeConfig("unknown_level" as any);
    expect(fallback.label).toBe("Evaluating...");
  });

  it("getScoreColor categorizes win scores properly", () => {
    const high = getScoreColor(92);
    expect(high.text).toBe("text-emerald-400");

    const mid = getScoreColor(65);
    expect(mid.text).toBe("text-amber-400");

    const low = getScoreColor(30);
    expect(low.text).toBe("text-rose-400");
  });

  it("stripMarkdownFormatting removes bold, italic, and backticks cleanly", () => {
    expect(stripMarkdownFormatting("**Important Notice**")).toBe("Important Notice");
    expect(stripMarkdownFormatting("*Note:* `CPT 27447`")).toBe("Note: CPT 27447");
    expect(stripMarkdownFormatting("__Underlined__ _italic_ text")).toBe("Underlined italic text");
    expect(stripMarkdownFormatting("")).toBe("");
    expect(stripMarkdownFormatting(undefined)).toBe("");
  });
});

describe("src/lib/constants Unit Tests", () => {
  it("resolves all verified and unverified payers through getPayerAppellateContact", () => {
    expect(getPayerAppellateContact(undefined).id).toBe("unknown");
    expect(getPayerAppellateContact("").id).toBe("unknown");

    expect(getPayerAppellateContact("Molina Healthcare").id).toBe("molina");
    expect(getPayerAppellateContact("GeoBlue Global").id).toBe("geoblue");
    expect(getPayerAppellateContact("BCBS Global Core").id).toBe("bcbsglobal");
    expect(getPayerAppellateContact("UnitedHealthcare Optum").id).toBe("uhc");
    expect(getPayerAppellateContact("Aetna CVS Health").id).toBe("aetna");
    expect(getPayerAppellateContact("Cigna Global").id).toBe("cignaglobal");
    expect(getPayerAppellateContact("Cigna Evernorth").id).toBe("cigna");
    expect(getPayerAppellateContact("Anthem Blue Cross").id).toBe("bcbs");
    expect(getPayerAppellateContact("Humana Health").id).toBe("humana");
    expect(getPayerAppellateContact("Kaiser Permanente").id).toBe("kaiser");

    const customPayer = getPayerAppellateContact("Custom Regional Mutual");
    expect(customPayer.isVerified).toBe(false);
    expect(customPayer.name).toBe("Custom Regional Mutual");
    expect(customPayer.intakePortalUrl).toBeUndefined();
    expect(customPayer.appealsFax).toBeUndefined();
    expect(customPayer.ediPayerId).toBeUndefined();
  });

  it("exports valid CARC denial codes, CPT dictionary, statutory constants, and presets", () => {
    expect(DENIAL_REASON_CODES["CO-50"].overturnCategory).toContain("Clinical Necessity");
    expect(CPT_CODES["27447"].name).toContain("Total Knee Arthroplasty");
    expect(STATUTORY_REGULATIONS.DEADLINE_DAYS_INTERNAL_APPEAL).toBe(180);
    expect(CLAIM_STATUS_CONFIG.won.label).toBe("Overturned / Won");
    expect(SIMULATION_STAGES).toHaveLength(5);
    expect(SAMPLE_CASE_PRESETS).toHaveLength(3);
  });
});
