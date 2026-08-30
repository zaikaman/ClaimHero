import { describe, it, expect } from "vitest";
import {
  calculateFinancialLiability,
  calculateErisaPenalties,
  getDefaultFinancialLiability,
  getDefaultErisaPenalties,
  getSeverityTierMeta,
  STATUTORY_DAILY_PENALTY_RATE,
  STATUTORY_DISCLOSURE_GRACE_DAYS,
} from "../src/lib/liabilityCalculator";
import { Claim } from "../src/types";

describe("Feature H: Financial Liability & Statutory ERISA Penalty Calculator", () => {
  const mockClaim: Claim = {
    _id: "claim-calc-001",
    patientId: "patient-calc-001",
    claimNumber: "CLM-8942-MOL",
    serviceDate: "2026-06-12",
    providerName: "Dr. Robert Langston, MD",
    deniedAmount: 24500,
    patientOwedAmount: 24500,
    cptCodes: ["27447"],
    icd10Codes: ["M17.11"],
    denialReasonCode: "CO-50",
    denialReasonDescription: "These are non-covered services because this is not deemed a medical necessity by the payer.",
    status: "ready_for_review",
    statutoryDeadline: 1781222400000,
    daysRemaining: 120,
    assignedAgentEmail: "advocate@claimhero.io",
    patient: {
      _id: "patient-calc-001",
      name: "Eleanor Vance",
      email: "eleanor.vance@example.com",
      memberId: "MOL-982341-01",
      groupNumber: "GRP-44120",
      insurancePayer: "Molina Healthcare",
      state: "FL",
      createdAt: 1770000000000,
    },
    createdAt: 1770000000000,
    updatedAt: 1770000000000,
  };

  describe("1. Patient Financial Liability & Cost-Sharing Engine", () => {
    it("calculates standard in-network cost-sharing with deductible and coinsurance", () => {
      const result = calculateFinancialLiability({
        billedAmount: 24500,
        contractualDiscount: 4500, // Allowed = 20,000
        allowedAmount: 20000,
        deductibleTotal: 2000,
        deductibleMet: 1000, // Remaining deductible = 1,000
        coinsuranceRate: 20, // 20%
        copayAmount: 50,
        outOfPocketMax: 8000,
        outOfPocketSpent: 2000, // Remaining OOP Capacity = 6,000
        networkStatus: "in_network",
        noSurprisesActProtected: true,
      });

      // 1. Deductible applied should be remaining deductible ($1,000)
      expect(result.deductibleApplied).toBe(1000);

      // 2. Amount subject to coinsurance = 20,000 - 1,000 = 19,000. 20% of 19,000 = $3,800
      expect(result.coinsuranceOwed).toBe(3800);

      // 3. Copay = $50
      expect(result.copayOwed).toBe(50);

      // 4. Covered Patient Cost Share = 1000 + 3800 + 50 = $4,850 (under 6,000 OOP capacity)
      expect(result.coveredPatientShare).toBe(4850);
      expect(result.isOopMaxReached).toBe(false);

      // 5. Total Patient Exposure if Denied = Billed (24,500) - Discount (4,500) = $20,000
      expect(result.totalPatientExposureDenied).toBe(20000);

      // 6. Total Patient Liability if Overturned = Covered Patient Share ($4,850)
      expect(result.totalPatientLiabilityOverturned).toBe(4850);

      // 7. Net Patient Savings from Overturn = 20,000 - 4,850 = $15,150
      expect(result.netPatientSavings).toBe(15150);

      // 8. Payer Expected Benefit Payment = 20,000 - 4,850 = $15,150
      expect(result.payerExpectedObligation).toBe(15150);
    });

    it("enforces Out-of-Pocket Maximum capping when cost-sharing exceeds annual ceiling", () => {
      const result = calculateFinancialLiability({
        billedAmount: 50000,
        contractualDiscount: 0,
        allowedAmount: 50000,
        deductibleTotal: 3000,
        deductibleMet: 0, // Remaining deductible = 3,000
        coinsuranceRate: 30, // 30% of 47,000 = $14,100
        copayAmount: 100,
        outOfPocketMax: 5000,
        outOfPocketSpent: 3500, // Only $1,500 remaining OOP capacity!
        networkStatus: "in_network",
        noSurprisesActProtected: true,
      });

      // Uncapped cost share = 3000 + 14100 + 100 = $17,200
      // But remaining capacity is only $1,500
      expect(result.remainingOopCapacity).toBe(1500);
      expect(result.coveredPatientShare).toBe(1500);
      expect(result.isOopMaxReached).toBe(true);
      expect(result.totalPatientLiabilityOverturned).toBe(1500);

      // Payer obligation covers remainder of allowed amount: 50,000 - 1,500 = $48,500
      expect(result.payerExpectedObligation).toBe(48500);
    });

    it("evaluates out-of-network balance billing exposure when No Surprises Act does not apply", () => {
      const result = calculateFinancialLiability({
        billedAmount: 30000,
        contractualDiscount: 0,
        allowedAmount: 12000, // Non-participating payer only allows $12,000
        deductibleTotal: 1000,
        deductibleMet: 1000,
        coinsuranceRate: 20, // 20% of 12,000 = $2,400
        copayAmount: 0,
        outOfPocketMax: 10000,
        outOfPocketSpent: 0,
        networkStatus: "out_of_network",
        noSurprisesActProtected: false, // Balance billing permitted
      });

      // Covered cost-share = $2,400
      expect(result.coveredPatientShare).toBe(2400);

      // Balance billing exposure = Billed (30,000) - Allowed (12,000) = $18,000
      expect(result.balanceBillingExposure).toBe(18000);

      // Total patient liability upon overturn = Covered ($2,400) + Balance Billing ($18,000) = $20,400
      expect(result.totalPatientLiabilityOverturned).toBe(20400);
      expect(result.netPatientSavings).toBe(9600); // 30,000 - 20,400
    });

    it("prohibits balance billing when No Surprises Act (NSA 45 CFR § 149.410) protection is active", () => {
      const result = calculateFinancialLiability({
        billedAmount: 30000,
        contractualDiscount: 0,
        allowedAmount: 12000,
        deductibleTotal: 1000,
        deductibleMet: 1000,
        coinsuranceRate: 20,
        copayAmount: 0,
        outOfPocketMax: 10000,
        outOfPocketSpent: 0,
        networkStatus: "out_of_network",
        noSurprisesActProtected: true, // NSA protected!
      });

      expect(result.balanceBillingExposure).toBe(0);
      expect(result.totalPatientLiabilityOverturned).toBe(2400);
      expect(result.netPatientSavings).toBe(27600);
    });

    it("generates a complete 10-item line-by-line itemized reconciliation schedule", () => {
      const result = calculateFinancialLiability({
        billedAmount: 24500,
        contractualDiscount: 3675,
        allowedAmount: 20825,
      });

      expect(result.schedule.length).toBe(10);
      expect(result.schedule[0].id).toBe("billed_charges");
      expect(result.schedule[1].id).toBe("contractual_discount");
      expect(result.schedule[2].id).toBe("allowed_amount");
      expect(result.schedule[9].id).toBe("net_patient_liability");
    });
  });

  describe("2. Statutory ERISA § 502(c) Failure-to-Disclose Penalty Engine", () => {
    it("recognizes $110.00/day statutory daily penalty rate and 30-day disclosure grace period", () => {
      expect(STATUTORY_DAILY_PENALTY_RATE).toBe(110.0);
      expect(STATUTORY_DISCLOSURE_GRACE_DAYS).toBe(30);
    });

    it("computes zero penalties when within the 30-day statutory disclosure window", () => {
      const result = calculateErisaPenalties({
        documentRequestDate: "2026-08-10",
        calculationDate: "2026-08-25", // 15 days elapsed
        complianceStatus: "defaulted",
        dailyPenaltyRate: 110.0,
      });

      expect(result.daysElapsedSinceRequest).toBe(15);
      expect(result.graceDaysRemaining).toBe(15);
      expect(result.isPastDeadline).toBe(false);
      expect(result.data.daysInDefault).toBe(0);
      expect(result.data.accruedPenaltyAmount).toBe(0);
      expect(result.data.severityTier).toBe("grace_period");
      expect(result.noticeOfDefaultText).toContain("Statutory Compliance Deadline");
      expect(result.noticeOfDefaultText).toContain("thirty (30) calendar days of receipt");
    });

    it("calculates exact $110/day accrued statutory penalties for days in default past the 30-day deadline", () => {
      // 55 days elapsed -> 30 grace days + 25 days in default
      const result = calculateErisaPenalties(
        {
          documentRequestDate: "2026-07-01",
          calculationDate: "2026-08-25", // 55 days elapsed
          complianceStatus: "defaulted",
          dailyPenaltyRate: 110.0,
          statutoryInterestRate: 18,
          estimatedAttorneysFees: 11250,
        },
        {
          deniedAmount: 24500,
          patientName: "Eleanor Vance",
          payerName: "Molina Healthcare",
          claimNumber: "CLM-8942-MOL",
        }
      );

      expect(result.daysElapsedSinceRequest).toBe(55);
      expect(result.isPastDeadline).toBe(true);
      expect(result.data.daysInDefault).toBe(25);

      // 25 days * $110.00/day = $2,750.00
      expect(result.data.accruedPenaltyAmount).toBe(2750);
      expect(result.data.severityTier).toBe("actionable_default");

      // Total Statutory Damages = $2,750 (penalties) + interest + $11,250 (fees)
      expect(result.data.totalStatutoryDamages).toBeGreaterThan(14000);

      // Total Plan Administrator Exposure = $24,500 + statutory damages
      expect(result.data.totalPlanAdministratorExposure).toBeGreaterThan(38500);

      // Formal Notice of Default mentions exact statutes
      expect(result.noticeOfDefaultText).toContain("29 U.S.C. § 1132(c)(1)(B)");
      expect(result.noticeOfDefaultText).toContain("29 C.F.R. § 2560.503-1(h)(2)(iii)");
      expect(result.noticeOfDefaultText).toContain("25 consecutive calendar days past the statutory deadline");
      expect(result.noticeOfDefaultText).toContain("$2,750.00");
    });

    it("escalates severity tiers from actionable default to egregious non-compliance and bad-faith enforcement", () => {
      // 1. Actionable Default (1-30 days default -> 45 days elapsed)
      const res1 = calculateErisaPenalties({
        documentRequestDate: "2026-07-15",
        calculationDate: "2026-08-29", // 45 days elapsed -> 15 days default
        complianceStatus: "defaulted",
      });
      expect(res1.data.severityTier).toBe("actionable_default");
      expect(getSeverityTierMeta(res1.data.severityTier).badgeVariant).toBe("warning");

      // 2. Egregious Non-Compliance (31-60 days default -> 75 days elapsed)
      const res2 = calculateErisaPenalties({
        documentRequestDate: "2026-06-15",
        calculationDate: "2026-08-29", // 75 days elapsed -> 45 days default
        complianceStatus: "defaulted",
      });
      expect(res2.data.severityTier).toBe("egregious_noncompliance");
      expect(getSeverityTierMeta(res2.data.severityTier).badgeVariant).toBe("destructive");

      // 3. Bad-Faith Enforcement (60+ days default -> 100 days elapsed)
      const res3 = calculateErisaPenalties({
        documentRequestDate: "2026-05-15",
        calculationDate: "2026-08-29", // 106 days elapsed -> 76 days default
        complianceStatus: "defaulted",
      });
      expect(res3.data.severityTier).toBe("bad_faith_enforcement");
      expect(res3.data.accruedPenaltyAmount).toBe(76 * 110);
    });

    it("computes future 30/60/90/120-day penalty trajectory projections", () => {
      const result = calculateErisaPenalties({
        documentRequestDate: "2026-07-01",
        calculationDate: "2026-08-25", // 25 days default
        complianceStatus: "defaulted",
        dailyPenaltyRate: 110.0,
      });

      expect(result.trajectories.length).toBe(4);
      expect(result.trajectories[0].horizonDays).toBe(30);
      expect(result.trajectories[0].projectedDaysInDefault).toBe(55);
      expect(result.trajectories[0].projectedPenalties).toBe(55 * 110); // $6,050

      expect(result.trajectories[1].horizonDays).toBe(60);
      expect(result.trajectories[1].projectedDaysInDefault).toBe(85);
      expect(result.trajectories[1].projectedPenalties).toBe(85 * 110); // $9,350
    });

    it("returns zero penalty when compliance status is marked compliant", () => {
      const result = calculateErisaPenalties({
        documentRequestDate: "2026-05-01",
        calculationDate: "2026-08-25",
        complianceStatus: "compliant", // Insurer produced all records
      });

      expect(result.data.daysInDefault).toBe(0);
      expect(result.data.accruedPenaltyAmount).toBe(0);
    });
  });

  describe("3. Claim Integration & Default Pre-population", () => {
    it("derives sensible default financial liability data from claim parameters", () => {
      const defaultLiab = getDefaultFinancialLiability(mockClaim);
      expect(defaultLiab.billedAmount).toBe(24500);
      expect(defaultLiab.contractualDiscount).toBeGreaterThan(0);
      expect(defaultLiab.allowedAmount).toBeLessThan(24500);
      expect(defaultLiab.networkStatus).toBe("in_network");
      expect(defaultLiab.netPatientSavings).toBeGreaterThan(0);
    });

    it("derives sensible default ERISA penalty data with actionable default days", () => {
      const defaultErisa = getDefaultErisaPenalties(mockClaim);
      expect(defaultErisa.dailyPenaltyRate).toBe(110.0);
      expect(defaultErisa.daysInDefault).toBeGreaterThan(0);
      expect(defaultErisa.accruedPenaltyAmount).toBeGreaterThan(0);
      expect(defaultErisa.statutoryDemandLanguage).toContain("29 U.S.C. § 1132(c)(1)(B)");
    });
  });
});
