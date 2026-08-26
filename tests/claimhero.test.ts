import { describe, it, expect } from "vitest";
import {
  formatCurrency,
  formatDeadlineRemaining,
  getScoreColor,
} from "../src/lib/utils";
import {
  CPT_CODES,
  DENIAL_REASON_CODES,
  STATUTORY_REGULATIONS,
} from "../src/lib/constants";

describe("ClaimHero Domain Utilities & Formatting", () => {
  it("formats numerical dollar amounts into standard US healthcare currency", () => {
    expect(formatCurrency(24500)).toBe("$24,500");
    expect(formatCurrency(18200)).toBe("$18,200");
    expect(formatCurrency(0)).toBe("$0");
  });

  it("evaluates statutory deadline countdown alarm states correctly", () => {
    // Critical (< 14 days)
    const critical = formatDeadlineRemaining(9);
    expect(critical.isUrgent).toBe(true);
    expect(critical.isCritical).toBe(true);
    expect(critical.text).toContain("9d Remaining (Urgent)");

    // Standard (> 45 days)
    const normal = formatDeadlineRemaining(142);
    expect(normal.isUrgent).toBe(false);
    expect(normal.isCritical).toBe(false);
    expect(normal.text).toContain("142d Statutory Clock");

    // Expired (0 days)
    const expired = formatDeadlineRemaining(0);
    expect(expired.isCritical).toBe(true);
    expect(expired.text).toBe("Deadline Expired");
  });

  it("calculates win probability color gradients across risk bands", () => {
    const highWin = getScoreColor(91);
    expect(highWin.text).toBe("text-emerald-400");

    const moderateWin = getScoreColor(65);
    expect(moderateWin.text).toBe("text-amber-400");

    const lowWin = getScoreColor(35);
    expect(lowWin.text).toBe("text-rose-400");
  });
});

describe("ClaimHero Regulatory & Clinical Dictionary", () => {
  it("contains standard ERISA 29 CFR § 2560.503-1 statutory rules", () => {
    expect(STATUTORY_REGULATIONS.ERISA_CITATION).toBe("29 CFR § 2560.503-1");
    expect(STATUTORY_REGULATIONS.DEADLINE_DAYS_INTERNAL_APPEAL).toBe(180);
    expect(STATUTORY_REGULATIONS.PAYER_RESPONSE_STANDARD_DAYS).toBe(30);
  });

  it("maps core medical CPT procedure codes accurately", () => {
    expect(CPT_CODES["27447"]).toBeDefined();
    expect(CPT_CODES["27447"]?.name).toBe("Total Knee Arthroplasty (TKA)");
    expect(CPT_CODES["27447"]?.averageBilled).toBe(24500);

    expect(CPT_CODES["63047"]).toBeDefined();
    expect(CPT_CODES["63047"]?.category).toBe("Neurosurgery / Spine");
  });

  it("maps common CARC denial reason codes with overturn categories", () => {
    expect(DENIAL_REASON_CODES["CO-50"]).toBeDefined();
    expect(DENIAL_REASON_CODES["CO-50"]?.code).toBe("CO-50");
    expect(DENIAL_REASON_CODES["CO-50"]?.title).toContain("Not Medically Necessary");

    expect(DENIAL_REASON_CODES["CO-197"]).toBeDefined();
    expect(DENIAL_REASON_CODES["CO-197"]?.title).toContain("Precertification");
  });
});
