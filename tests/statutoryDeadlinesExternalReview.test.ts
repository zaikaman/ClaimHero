import { describe, it, expect } from "vitest";
import {
  DEFAULT_STATUTORY_APPEAL_WINDOW_DAYS,
  ACA_EXTERNAL_REVIEW_WINDOW_DAYS,
  STATE_EXTERNAL_REVIEW_WINDOW_DAYS,
  resolveStatutoryDeadline,
  resolveExternalReviewDeadline,
  calculateDaysRemaining,
  ONE_DAY_MS,
} from "../convex/lib/dateUtils";
import {
  getExternalReviewDeadlineDays,
  getAppealDeadlineDays,
  getStateExternalReviewCitation,
  getStateRegulator,
} from "../convex/lib/stateRegulators";

describe("Statutory External Review Clocks & Deadlines Architecture", () => {
  const FIXED_NOW = Date.UTC(2026, 8, 18, 12, 0, 0); // Sep 18, 2026 12:00 UTC
  const DENIAL_DATE = "2026-09-01"; // Sep 1, 2026 UTC midnight

  describe("Regulatory Constants", () => {
    it("exports precise statutory windows for ERISA, ACA, and State expedited review", () => {
      expect(DEFAULT_STATUTORY_APPEAL_WINDOW_DAYS).toBe(180);
      expect(ACA_EXTERNAL_REVIEW_WINDOW_DAYS).toBe(120); // 4 months under 45 CFR § 147.136
      expect(STATE_EXTERNAL_REVIEW_WINDOW_DAYS).toBe(30); // 30-day state expedited clock
    });
  });

  describe("Tier 1 & Tier 2: Federal ERISA Internal Appeal Window (180 Days)", () => {
    it("defaults to 180-day ERISA clock when appealLevel is unspecified or Level 1 / Level 2", () => {
      const defaultRes = resolveStatutoryDeadline({
        denialDate: DENIAL_DATE,
        now: FIXED_NOW,
      });
      expect(defaultRes.effectiveDeadlineDays).toBe(180);
      expect(defaultRes.clockType).toBe("erisa_internal_180");
      expect(defaultRes.regulatoryCitation).toContain("29 C.F.R. § 2560.503-1");

      const level1Res = resolveStatutoryDeadline({
        denialDate: DENIAL_DATE,
        appealLevel: "level_1_internal",
        now: FIXED_NOW,
      });
      expect(level1Res.effectiveDeadlineDays).toBe(180);
      expect(level1Res.clockType).toBe("erisa_internal_180");

      const level2Res = resolveStatutoryDeadline({
        denialDate: DENIAL_DATE,
        appealLevel: "level_2_grievance",
        now: FIXED_NOW,
      });
      expect(level2Res.effectiveDeadlineDays).toBe(180);
      expect(level2Res.clockType).toBe("erisa_internal_180");
    });
  });

  describe("Tier 3: ACA 45 CFR § 147.136 4-Month (120-Day) External Review Clock", () => {
    it("computes ACA 4-month (120-day) external review clock for federal default and standard states", () => {
      const externalRes = resolveStatutoryDeadline({
        denialDate: DENIAL_DATE,
        appealLevel: "level_3_external_state_review",
        state: "US",
        now: FIXED_NOW,
      });

      expect(externalRes.effectiveDeadlineDays).toBe(120);
      expect(externalRes.clockType).toBe("aca_external_120");
      expect(externalRes.regulatoryCitation).toContain("45 CFR § 147.136");

      const expectedDeadline = Date.UTC(2026, 8, 1) + 120 * ONE_DAY_MS;
      expect(externalRes.statutoryDeadline).toBe(expectedDeadline);
      expect(externalRes.daysRemaining).toBe(calculateDaysRemaining(expectedDeadline, FIXED_NOW));
    });

    it("resolves via resolveExternalReviewDeadline helper", () => {
      const res = resolveExternalReviewDeadline({
        denialDate: DENIAL_DATE,
        state: "Federal",
        now: FIXED_NOW,
      });

      expect(res.effectiveDeadlineDays).toBe(120);
      expect(res.clockType).toBe("aca_external_120");
    });
  });

  describe("Tier 3: State 30-Day External Review Clock", () => {
    it("computes 30-day external review clock when expedited or state prompt review is active", () => {
      const expeditedRes = resolveStatutoryDeadline({
        denialDate: DENIAL_DATE,
        appealLevel: "level_3_external_state_review",
        state: "US",
        isExpedited: true,
        now: FIXED_NOW,
      });

      expect(expeditedRes.effectiveDeadlineDays).toBe(30);
      expect(expeditedRes.clockType).toBe("state_external_30");
      expect(expeditedRes.regulatoryCitation).toContain("30-day statutory clock");

      const expectedDeadline = Date.UTC(2026, 8, 1) + 30 * ONE_DAY_MS;
      expect(expeditedRes.statutoryDeadline).toBe(expectedDeadline);
    });

    it("resolves 30-day clock via resolveExternalReviewDeadline with isExpedited: true", () => {
      const res = resolveExternalReviewDeadline({
        denialDate: DENIAL_DATE,
        state: "CA",
        isExpedited: true,
        now: FIXED_NOW,
      });

      expect(res.effectiveDeadlineDays).toBe(30);
      expect(res.clockType).toBe("state_external_30");
    });
  });

  describe("State-Specific External Review Timelines (CA, TX, NY)", () => {
    it("computes California 6-month (180-day) DMHC IMR clock for standard Level 3 review", () => {
      const caRes = resolveStatutoryDeadline({
        denialDate: DENIAL_DATE,
        appealLevel: "level_3_external_state_review",
        state: "California",
        now: FIXED_NOW,
      });

      expect(caRes.effectiveDeadlineDays).toBe(180);
      expect(caRes.clockType).toBe("state_external_specific");
      expect(caRes.regulatoryCitation).toContain("Cal. Health & Safety Code § 1374.30(j)");
      expect(getStateRegulator("CA").doiShort).toBe("CA DMHC/CDI");
    });

    it("computes California 30-day expedited clock when expedited", () => {
      const caExpedited = resolveStatutoryDeadline({
        denialDate: DENIAL_DATE,
        appealLevel: "level_3_external_state_review",
        state: "CA",
        isExpedited: true,
        now: FIXED_NOW,
      });

      expect(caExpedited.effectiveDeadlineDays).toBe(30);
      expect(caExpedited.clockType).toBe("state_external_30");
    });

    it("computes Texas 4-month (120-day) TDI IRO clock for standard Level 3 review", () => {
      const txRes = resolveStatutoryDeadline({
        denialDate: DENIAL_DATE,
        appealLevel: "level_3_external_state_review",
        state: "Texas",
        now: FIXED_NOW,
      });

      expect(txRes.effectiveDeadlineDays).toBe(120);
      expect(txRes.clockType).toBe("aca_external_120");
      expect(txRes.regulatoryCitation).toContain("Tex. Ins. Code § 4201.359");
      expect(getStateRegulator("TX").doiName).toBe("Texas Department of Insurance (TDI)");
    });

    it("computes Texas 30-day expedited state clock when expedited", () => {
      const txExpedited = resolveStatutoryDeadline({
        denialDate: DENIAL_DATE,
        appealLevel: "level_3_external_state_review",
        state: "TX",
        isExpedited: true,
        now: FIXED_NOW,
      });

      expect(txExpedited.effectiveDeadlineDays).toBe(30);
      expect(txExpedited.clockType).toBe("state_external_30");
    });

    it("computes New York 4-month (120-day) DFS external appeal clock for standard Level 3 review", () => {
      const nyRes = resolveStatutoryDeadline({
        denialDate: DENIAL_DATE,
        appealLevel: "level_3_external_state_review",
        state: "NY",
        now: FIXED_NOW,
      });

      expect(nyRes.effectiveDeadlineDays).toBe(120);
      expect(nyRes.clockType).toBe("aca_external_120");
      expect(nyRes.regulatoryCitation).toContain("N.Y. Ins. Law § 4914(b)(1)");
      expect(getStateRegulator("NY").doiShort).toBe("NY DFS");
    });

    it("computes New York 30-day expedited clock when expedited", () => {
      const nyExpedited = resolveStatutoryDeadline({
        denialDate: DENIAL_DATE,
        appealLevel: "level_3_external_state_review",
        state: "NY",
        isExpedited: true,
        now: FIXED_NOW,
      });

      expect(nyExpedited.effectiveDeadlineDays).toBe(30);
      expect(nyExpedited.clockType).toBe("state_external_30");
    });
  });

  describe("Custom Plan Deadlines & Overdue Preservation", () => {
    it("preserves explicit plan appeal filing deadline days when specified", () => {
      const customRes = resolveStatutoryDeadline({
        denialDate: DENIAL_DATE,
        appealFilingDeadlineDays: 60,
        appealLevel: "level_3_external_state_review",
        state: "CA",
        now: FIXED_NOW,
      });

      expect(customRes.effectiveDeadlineDays).toBe(60);
      expect(customRes.clockType).toBe("custom");
      expect(customRes.regulatoryCitation).toContain("60 days");
    });

    it("preserves negative daysRemaining for overdue claims without clamping to zero", () => {
      const pastDenial = "2025-01-01";
      const overdueRes = resolveStatutoryDeadline({
        denialDate: pastDenial,
        appealLevel: "level_3_external_state_review",
        state: "NY",
        now: FIXED_NOW,
      });

      expect(overdueRes.daysRemaining).toBeLessThan(0);
      expect(overdueRes.statutoryDeadline).toBeLessThan(FIXED_NOW);
    });
  });
});
