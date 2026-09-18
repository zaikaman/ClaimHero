import { describe, it, expect } from "vitest";
import {
  ACA_EXTERNAL_REVIEW_WINDOW_DAYS,
  FEDERAL_FILING_WINDOW_DAYS,
  FEDERAL_INTERNAL_APPEAL_WINDOW_DAYS,
  STATE_EXTERNAL_REVIEW_30_DAY_WINDOW,
  getAppealDeadlineDays,
  getExternalReviewDeadlineDays,
  getStateExternalReviewCitation,
  getStateRegulator,
  normalizeStateCode,
} from "../convex/lib/stateRegulators";

describe("State regulator DOI reference map & statutory review clocks", () => {
  it("normalizes codes, names, and legacy federal values", () => {
    expect(normalizeStateCode("CA")).toBe("CA");
    expect(normalizeStateCode("ca")).toBe("CA");
    expect(normalizeStateCode("California")).toBe("CA");
    expect(normalizeStateCode("Texas")).toBe("TX");
    expect(normalizeStateCode("NY")).toBe("NY");
    expect(normalizeStateCode("FED")).toBe("US");
    expect(normalizeStateCode("Federal")).toBe("US");
    expect(normalizeStateCode(undefined)).toBe("US");
    expect(normalizeStateCode("the State")).toBe("US");
    expect(normalizeStateCode("ZZ")).toBe("US");
  });

  it("resolves DOI references per state", () => {
    expect(getStateRegulator("California").doiShort).toBe("CA DMHC/CDI");
    expect(getStateRegulator("CA").doiName).toContain("Managed Health Care");
    expect(getStateRegulator("Texas").doiName).toBe("Texas Department of Insurance (TDI)");
    expect(getStateRegulator("New York").doiShort).toBe("NY DFS");
    expect(getStateRegulator("Florida").doiShort).toBe("FL AHCA/OIR");
    expect(getStateRegulator("Illinois").doiShort).toBe("IL IDOI");
    expect(getStateRegulator("Pennsylvania").doiShort).toBe("PA PID");
  });

  it("falls back to the generic State Insurance Commissioner with ERISA 180-day and ACA 120-day clocks", () => {
    const federal = getStateRegulator(undefined);
    expect(federal.code).toBe("US");
    expect(federal.doiName).toBe("State Insurance Commissioner");
    expect(federal.internalAppealDays).toBe(180);
    expect(federal.standardExternalReviewDays).toBe(120);
    expect(federal.stateExternalReviewDays).toBe(30);
    expect(FEDERAL_FILING_WINDOW_DAYS).toBe(180);
    expect(FEDERAL_INTERNAL_APPEAL_WINDOW_DAYS).toBe(180);
    expect(ACA_EXTERNAL_REVIEW_WINDOW_DAYS).toBe(120);
    expect(STATE_EXTERNAL_REVIEW_30_DAY_WINDOW).toBe(30);
  });

  it("enforces California statutory clocks (ERISA 180d internal, DMHC 180d / 6-mo external, 30d expedited)", () => {
    const ca = getStateRegulator("CA");
    expect(ca.internalAppealDays).toBe(180);
    expect(ca.standardExternalReviewDays).toBe(180);
    expect(ca.stateExternalReviewDays).toBe(30);
    expect(ca.externalReviewCitation).toContain("Cal. Health & Safety Code § 1374.30(j)");

    expect(getExternalReviewDeadlineDays("CA")).toBe(180);
    expect(getExternalReviewDeadlineDays("CA", { expedited: true })).toBe(30);
    expect(getAppealDeadlineDays("level_1_internal", "CA")).toBe(180);
    expect(getAppealDeadlineDays("level_3_external_state_review", "CA")).toBe(180);
    expect(getAppealDeadlineDays("level_3_external_state_review", "CA", { isExpedited: true })).toBe(30);
  });

  it("enforces Texas statutory clocks (ERISA 180d internal, TDI 120d / 4-mo external, 30d expedited)", () => {
    const tx = getStateRegulator("TX");
    expect(tx.internalAppealDays).toBe(180);
    expect(tx.standardExternalReviewDays).toBe(120);
    expect(tx.stateExternalReviewDays).toBe(30);
    expect(tx.externalReviewCitation).toContain("Tex. Ins. Code § 4201.359");

    expect(getExternalReviewDeadlineDays("TX")).toBe(120);
    expect(getExternalReviewDeadlineDays("TX", { expedited: true })).toBe(30);
    expect(getAppealDeadlineDays("level_1_internal", "TX")).toBe(180);
    expect(getAppealDeadlineDays("level_3_external_state_review", "TX")).toBe(120);
    expect(getAppealDeadlineDays("level_3_external_state_review", "TX", { isExpedited: true })).toBe(30);
  });

  it("enforces New York statutory clocks (ERISA 180d internal, DFS 120d / 4-mo external, 30d expedited)", () => {
    const ny = getStateRegulator("NY");
    expect(ny.internalAppealDays).toBe(180);
    expect(ny.standardExternalReviewDays).toBe(120);
    expect(ny.stateExternalReviewDays).toBe(30);
    expect(ny.externalReviewCitation).toContain("N.Y. Ins. Law § 4914(b)(1)");

    expect(getExternalReviewDeadlineDays("NY")).toBe(120);
    expect(getExternalReviewDeadlineDays("NY", { expedited: true })).toBe(30);
    expect(getAppealDeadlineDays("level_1_internal", "NY")).toBe(180);
    expect(getAppealDeadlineDays("level_3_external_state_review", "NY")).toBe(120);
    expect(getAppealDeadlineDays("level_3_external_state_review", "NY", { isExpedited: true })).toBe(30);
  });

  it("resolves external review legal citations accurately", () => {
    expect(getStateExternalReviewCitation("CA")).toContain("Cal. Health & Safety Code");
    expect(getStateExternalReviewCitation("Texas")).toContain("Tex. Ins. Code");
    expect(getStateExternalReviewCitation("New York")).toContain("N.Y. Ins. Law");
    expect(getStateExternalReviewCitation(undefined)).toContain("ACA 45 CFR § 147.136");
  });
});

