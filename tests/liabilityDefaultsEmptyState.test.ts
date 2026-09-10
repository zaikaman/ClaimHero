import { describe, it, expect } from "vitest";
import {
  calculateFinancialLiability,
  getDefaultFinancialLiability,
  getDefaultErisaPenalties,
} from "../src/lib/liabilityCalculator";
import { Claim } from "../src/types";

describe("P1-15: Liability Calculator Zero Defaults & Honest Empty State", () => {
  it("never defaults to $24,500 when calculating financial liability with empty input and no claim context", () => {
    const result = calculateFinancialLiability({});
    expect(result.data.billedAmount).toBe(0);
    expect(result.data.contractualDiscount).toBe(0);
    expect(result.data.allowedAmount).toBe(0);
    expect(result.data.totalPatientExposureDenied).toBe(0);
    expect(result.data.totalPatientLiabilityOverturned).toBe(0);
    expect(result.data.netPatientSavings).toBe(0);
    expect(result.data.payerExpectedObligation).toBe(0);
  });

  it("getDefaultFinancialLiability does not fabricate money when claim has no deniedAmount", () => {
    const claimWithoutMoney: Claim = {
      _id: "claim-zero-1",
      patientId: "pat-zero-1",
      claimNumber: "CLM-EMPTY-001",
      serviceDate: "2026-09-01",
      providerName: "General Hospital",
      cptCodes: [],
      icd10Codes: [],
      denialReasonCode: "CO-16",
      denialReasonDescription: "Claim lacked information",
      status: "draft",
      statutoryDeadline: 1781222400000,
      daysRemaining: 90,
      assignedAgentEmail: "agent@claimhero.io",
      createdAt: 1770000000000,
      updatedAt: 1770000000000,
    };

    const defaultLiab = getDefaultFinancialLiability(claimWithoutMoney);
    expect(defaultLiab.billedAmount).toBe(0);
    expect(defaultLiab.contractualDiscount).toBe(0);
    expect(defaultLiab.allowedAmount).toBe(0);
    expect(defaultLiab.totalPatientExposureDenied).toBe(0);
    expect(defaultLiab.netPatientSavings).toBe(0);
  });

  it("getDefaultErisaPenalties does not fabricate $24,500 disputed amount when claim has no deniedAmount", () => {
    const claimWithoutMoney: Claim = {
      _id: "claim-zero-2",
      patientId: "pat-zero-2",
      claimNumber: "CLM-EMPTY-002",
      serviceDate: "2026-09-01",
      providerName: "General Hospital",
      cptCodes: [],
      icd10Codes: [],
      denialReasonCode: "CO-16",
      denialReasonDescription: "Claim lacked information",
      status: "draft",
      statutoryDeadline: 1781222400000,
      daysRemaining: 90,
      assignedAgentEmail: "agent@claimhero.io",
      createdAt: 1770000000000,
      updatedAt: 1770000000000,
    };

    const defaultErisa = getDefaultErisaPenalties(claimWithoutMoney);
    expect(defaultErisa.accruedInterestAmount).toBe(0);
    expect(defaultErisa.totalPlanAdministratorExposure).toBe(defaultErisa.totalStatutoryDamages);
    expect(defaultErisa.statutoryDemandLanguage).toContain("$0.00");
    expect(defaultErisa.statutoryDemandLanguage).not.toContain("$24,500");
  });
});
