/**
 * Financial Liability & Statutory ERISA Penalty Calculator Engine
 * 
 * Implements:
 * 1. Patient out-of-pocket exposure vs insurance plan maximums (deductibles, coinsurance, OOP max, No Surprises Act).
 * 2. Statutory ERISA failure-to-disclose penalties ($110/day under 29 U.S.C. § 1132(c)(1) and 29 C.F.R. § 2575.502c-1).
 */

import {
  Claim,
  FinancialLiabilityData,
  FinancialLiabilityResult,
  FinancialScheduleItem,
  ErisaPenaltyData,
  ErisaPenaltyResult,
  ErisaPenaltyTrajectoryItem,
  StatutorySeverityTier,
  StatutoryComplianceStatus,
} from "../types";

export const STATUTORY_DAILY_PENALTY_RATE = 110.0; // 29 U.S.C. § 1132(c)(1) & 29 C.F.R. § 2575.502c-1
export const STATUTORY_DISCLOSURE_GRACE_DAYS = 30; // 30 calendar days from written request

export const DEFAULT_REQUESTED_DOCUMENTS = [
  "Complete Administrative Claim File & Internal Adjudication Notes (29 CFR § 2560.503-1(h)(2)(iii))",
  "Specific Internal Clinical Coverage Guidelines & Bulletins Relied Upon (e.g. CPB / Medical Policy)",
  "Medical Reviewer Identity, Specialty Board Certifications & Licensure Records",
  "Summary Plan Description (SPD), Benefit Schedule & Administrative Services Agreement (ASA)",
  "Third-Party Vendor Utilization Review Contracts (e.g. Carelon, eviCore, MCG Guidelines)",
];

/**
 * Calculates patient financial liability under denied vs overturned scenarios.
 */
export function calculateFinancialLiability(
  input: Partial<FinancialLiabilityData>,
  claimContext?: { deniedAmount?: number; patientOwedAmount?: number }
): FinancialLiabilityResult {
  const billedAmount = Math.max(0, Number(input.billedAmount ?? claimContext?.deniedAmount ?? 24500));
  const contractualDiscount = Math.max(0, Number(input.contractualDiscount ?? 0));
  const allowedAmount = Math.max(
    0,
    Number(input.allowedAmount ?? (billedAmount > contractualDiscount ? billedAmount - contractualDiscount : billedAmount))
  );

  const deductibleTotal = Math.max(0, Number(input.deductibleTotal ?? 1500));
  const deductibleMet = Math.max(0, Number(input.deductibleMet ?? 500));
  const remainingDeductible = Math.max(0, deductibleTotal - deductibleMet);

  const coinsuranceRate = Math.min(100, Math.max(0, Number(input.coinsuranceRate ?? 20))); // % (e.g. 20)
  const copayAmount = Math.max(0, Number(input.copayAmount ?? 50));

  const outOfPocketMax = Math.max(0, Number(input.outOfPocketMax ?? 6000));
  const outOfPocketSpent = Math.max(0, Number(input.outOfPocketSpent ?? 1800));
  const remainingOopCapacity = Math.max(0, outOfPocketMax - outOfPocketSpent);

  const networkStatus = input.networkStatus ?? "in_network";
  const noSurprisesActProtected = input.noSurprisesActProtected ?? (networkStatus === "in_network");

  // Step 1: Deductible applied to this claim
  const deductibleApplied = Math.min(allowedAmount, remainingDeductible);

  // Step 2: Amount subject to coinsurance
  const amountSubjectToCoinsurance = Math.max(0, allowedAmount - deductibleApplied);

  // Step 3: Raw Coinsurance
  const rawCoinsurance = Math.round((amountSubjectToCoinsurance * (coinsuranceRate / 100)) * 100) / 100;

  // Step 4: Uncapped Covered Patient Cost-Sharing
  const uncappedPatientCostShare = deductibleApplied + rawCoinsurance + copayAmount;

  // Step 5: Capped Covered Patient Cost-Sharing (cannot exceed remaining OOP Max capacity)
  const coveredPatientShare = Math.min(uncappedPatientCostShare, remainingOopCapacity);
  const isOopMaxReached = uncappedPatientCostShare >= remainingOopCapacity && remainingOopCapacity > 0;

  // Step 6: Coinsurance owed after OOP cap adjustment
  const coinsuranceOwed = Math.max(0, coveredPatientShare - deductibleApplied - copayAmount);
  const copayOwed = Math.min(copayAmount, coveredPatientShare);

  // Step 7: Payer Expected Obligation when Overturned
  const payerExpectedObligation = Math.max(0, allowedAmount - coveredPatientShare);

  // Step 8: Balance Billing Exposure (if Out-of-Network and NOT protected by No Surprises Act)
  let balanceBillingExposure = 0;
  if (networkStatus === "out_of_network" && !noSurprisesActProtected) {
    balanceBillingExposure = Math.max(0, billedAmount - allowedAmount - contractualDiscount);
  }

  // Step 9: Denied vs Overturned Total Patient Exposure
  const totalPatientExposureDenied = Math.max(0, billedAmount - contractualDiscount);
  const totalPatientLiabilityOverturned = coveredPatientShare + balanceBillingExposure;
  const netPatientSavings = Math.max(0, totalPatientExposureDenied - totalPatientLiabilityOverturned);

  // Percentage breakdown for visualization
  const totalCost = allowedAmount > 0 ? allowedAmount : billedAmount;
  const costSharingBreakdownPercent = {
    deductible: totalCost > 0 ? Math.round((deductibleApplied / totalCost) * 100) : 0,
    coinsurance: totalCost > 0 ? Math.round((coinsuranceOwed / totalCost) * 100) : 0,
    copay: totalCost > 0 ? Math.round((copayOwed / totalCost) * 100) : 0,
    payer: totalCost > 0 ? Math.round((payerExpectedObligation / totalCost) * 100) : 100,
  };

  // Structured Schedule Items
  const schedule: FinancialScheduleItem[] = [
    {
      id: "billed_charges",
      label: "Total Billed / Disputed Charges",
      description: "Gross provider charge submitted on CMS-1500 / UB-04 claim form",
      deniedAmount: billedAmount,
      overturnedAmount: billedAmount,
      variance: 0,
      type: "charge",
    },
    {
      id: "contractual_discount",
      label: "Contractual PPO / In-Network Discount",
      description: "Mandatory write-off under participating provider network agreement",
      deniedAmount: contractualDiscount,
      overturnedAmount: contractualDiscount,
      variance: 0,
      type: "adjustment",
    },
    {
      id: "allowed_amount",
      label: "Plan Allowed Amount",
      description: "Allowable reimbursement baseline after network discount",
      deniedAmount: 0,
      overturnedAmount: allowedAmount,
      variance: allowedAmount,
      type: "adjustment",
    },
    {
      id: "deductible_applied",
      label: `Plan Deductible (${formatPercent((deductibleMet / (deductibleTotal || 1)) * 100)} Met)`,
      description: `Remaining deductible applied ($${deductibleTotal.toLocaleString()} total, $${deductibleMet.toLocaleString()} met prior)`,
      deniedAmount: 0,
      overturnedAmount: deductibleApplied,
      variance: deductibleApplied,
      type: "cost_share",
    },
    {
      id: "coinsurance_owed",
      label: `Patient Co-Insurance (${coinsuranceRate}%)`,
      description: `${coinsuranceRate}% cost-sharing on post-deductible allowable amount ($${amountSubjectToCoinsurance.toLocaleString()})`,
      deniedAmount: 0,
      overturnedAmount: coinsuranceOwed,
      variance: coinsuranceOwed,
      type: "cost_share",
    },
    {
      id: "copay_owed",
      label: "Outpatient / Specialist Co-Pay",
      description: "Fixed statutory co-payment per encounter schedule",
      deniedAmount: 0,
      overturnedAmount: copayOwed,
      variance: copayOwed,
      type: "cost_share",
    },
    {
      id: "oop_max_cap",
      label: "Out-of-Pocket Maximum Cap Protection",
      description: isOopMaxReached
        ? `Annual OOP Cap of $${outOfPocketMax.toLocaleString()} reached. Cost-sharing halted.`
        : `Accumulated $${(outOfPocketSpent + coveredPatientShare).toLocaleString()} towards $${outOfPocketMax.toLocaleString()} annual cap`,
      deniedAmount: 0,
      overturnedAmount: isOopMaxReached ? uncappedPatientCostShare - coveredPatientShare : 0,
      variance: 0,
      type: "adjustment",
    },
    {
      id: "balance_billing",
      label: "Out-of-Network Balance Billing Exposure",
      description: noSurprisesActProtected
        ? "Protected by Federal No Surprises Act (NSA 45 CFR § 149.410) — Balance billing prohibited"
        : networkStatus === "out_of_network"
        ? "Non-participating provider balance billing liability above plan allowance"
        : "In-network provider agreement prohibits balance billing",
      deniedAmount: balanceBillingExposure,
      overturnedAmount: balanceBillingExposure,
      variance: 0,
      type: "cost_share",
    },
    {
      id: "payer_obligation",
      label: "Payer Expected Benefit Payment",
      description: "Total health insurance reimbursement remitted to provider upon overturn",
      deniedAmount: 0,
      overturnedAmount: payerExpectedObligation,
      variance: payerExpectedObligation,
      type: "adjustment",
    },
    {
      id: "net_patient_liability",
      label: "Net Patient Financial Liability",
      description: "Final legally enforceable out-of-pocket amount payable by patient",
      deniedAmount: totalPatientExposureDenied,
      overturnedAmount: totalPatientLiabilityOverturned,
      variance: -netPatientSavings,
      type: "total",
    },
  ];

  const data: FinancialLiabilityData = {
    billedAmount,
    allowedAmount,
    contractualDiscount,
    deductibleTotal,
    deductibleMet,
    coinsuranceRate,
    copayAmount,
    outOfPocketMax,
    outOfPocketSpent,
    networkStatus,
    noSurprisesActProtected,
    calculatedPatientShare: coveredPatientShare,
    balanceBillingAmount: balanceBillingExposure,
    totalPatientExposureDenied,
    totalPatientLiabilityOverturned,
    netPatientSavings,
    payerExpectedObligation,
    updatedAt: Date.now(),
  };

  return {
    data,
    deductibleApplied,
    coinsuranceOwed,
    copayOwed,
    remainingOopCapacity,
    coveredPatientShare,
    balanceBillingExposure,
    totalPatientExposureDenied,
    totalPatientLiabilityOverturned,
    netPatientSavings,
    payerExpectedObligation,
    schedule,
    isOopMaxReached,
    costSharingBreakdownPercent,
  };
}

/**
 * Calculates statutory ERISA § 502(c)(1) failure-to-disclose penalties ($110/day).
 */
export function calculateErisaPenalties(
  input: Partial<ErisaPenaltyData>,
  claimContext?: {
    deniedAmount?: number;
    patientName?: string;
    payerName?: string;
    claimNumber?: string;
    serviceDate?: string;
  }
): ErisaPenaltyResult {
  const calculationDateStr = input.calculationDate || formatDateISO(new Date());
  const calcDate = parseDateSafe(calculationDateStr);

  // Document Request Date defaults to ~45 days ago or input
  const defaultRequestDate = new Date(calcDate.getTime() - 45 * 24 * 60 * 60 * 1000);
  const documentRequestDateStr = input.documentRequestDate || formatDateISO(defaultRequestDate);
  const requestDate = parseDateSafe(documentRequestDateStr);

  // 30-Day Disclosure Deadline
  const deadlineDate = new Date(requestDate.getTime() + STATUTORY_DISCLOSURE_GRACE_DAYS * 24 * 60 * 60 * 1000);
  const disclosureDeadlineDateStr = formatDateISO(deadlineDate);

  const dailyPenaltyRate = input.dailyPenaltyRate ?? STATUTORY_DAILY_PENALTY_RATE;
  const complianceStatus: StatutoryComplianceStatus = input.complianceStatus ?? "defaulted";
  const requestedDocuments = input.requestedDocuments && input.requestedDocuments.length > 0
    ? input.requestedDocuments
    : DEFAULT_REQUESTED_DOCUMENTS;

  // Elapsed calendar days
  const msElapsed = calcDate.getTime() - requestDate.getTime();
  const daysElapsedSinceRequest = Math.max(0, Math.floor(msElapsed / (1000 * 60 * 60 * 24)));

  const graceDaysRemaining = Math.max(0, STATUTORY_DISCLOSURE_GRACE_DAYS - daysElapsedSinceRequest);
  const isPastDeadline = daysElapsedSinceRequest > STATUTORY_DISCLOSURE_GRACE_DAYS;

  // Days in default
  let daysInDefault = 0;
  if (complianceStatus !== "compliant" && isPastDeadline) {
    daysInDefault = daysElapsedSinceRequest - STATUTORY_DISCLOSURE_GRACE_DAYS;
  }

  // Accrued statutory penalty
  const accruedPenaltyAmount = daysInDefault * dailyPenaltyRate;

  // Statutory Prompt-Pay / Prejudgment Interest (e.g. 18% p.a. under Texas Ins Code § 542.060 or Florida 10%)
  const statutoryInterestRate = input.statutoryInterestRate ?? 18; // % per year
  const disputedAmount = claimContext?.deniedAmount ?? 24500;
  const accruedInterestAmount = Math.round(
    (disputedAmount * (statutoryInterestRate / 100) * (daysElapsedSinceRequest / 365)) * 100
  ) / 100;

  // Estimated ERISA § 502(g)(1) Mandatory Attorney's Fees (Lodestar method)
  // Baseline: 20-30 hours @ $450/hour
  const estimatedAttorneysFees = input.estimatedAttorneysFees ?? (daysInDefault > 0 ? 11250 : 0);

  const totalStatutoryDamages = accruedPenaltyAmount + accruedInterestAmount + estimatedAttorneysFees;
  const totalPlanAdministratorExposure = disputedAmount + totalStatutoryDamages;

  // Severity Tier
  let severityTier: StatutorySeverityTier = "grace_period";
  if (daysInDefault === 0) {
    severityTier = "grace_period";
  } else if (daysInDefault <= 30) {
    severityTier = "actionable_default";
  } else if (daysInDefault <= 60) {
    severityTier = "egregious_noncompliance";
  } else {
    severityTier = "bad_faith_enforcement";
  }

  // Statutory Authority Citation
  const statutoryAuthorityCitation =
    "29 U.S.C. § 1132(c)(1)(B); 29 C.F.R. § 2560.503-1(h)(2)(iii); 29 C.F.R. § 2575.502c-1; 29 U.S.C. § 1132(g)(1)";

  // Future 30/60/90/120-Day Trajectories
  const horizons = [30, 60, 90, 120];
  const trajectories: ErisaPenaltyTrajectoryItem[] = horizons.map((h) => {
    const futureDateObj = new Date(calcDate.getTime() + h * 24 * 60 * 60 * 1000);
    const projectedDaysInDefault = daysInDefault + h;
    const projectedPenalties = projectedDaysInDefault * dailyPenaltyRate;
    const projectedInterest = Math.round(
      (disputedAmount * (statutoryInterestRate / 100) * ((daysElapsedSinceRequest + h) / 365)) * 100
    ) / 100;
    const projectedTotalExposure = disputedAmount + projectedPenalties + projectedInterest + estimatedAttorneysFees;

    return {
      horizonDays: h,
      futureDate: formatDateISO(futureDateObj),
      projectedDaysInDefault,
      projectedPenalties,
      projectedInterest,
      projectedTotalExposure,
    };
  });

  // Formal Notice of Default & Statutory Demand Statement
  const payerName = claimContext?.payerName || "Plan Administrator / Insurer";
  const patientName = claimContext?.patientName || "Insured Claimant";
  const claimNum = claimContext?.claimNumber || "REFERENCED-CLAIM";

  const noticeOfDefaultText = generateNoticeOfDefaultStatement({
    payerName,
    patientName,
    claimNumber: claimNum,
    documentRequestDate: documentRequestDateStr,
    disclosureDeadlineDate: disclosureDeadlineDateStr,
    calculationDate: calculationDateStr,
    daysInDefault,
    dailyPenaltyRate,
    accruedPenaltyAmount,
    disputedAmount,
    statutoryInterestRate,
    accruedInterestAmount,
    estimatedAttorneysFees,
    totalPlanAdministratorExposure,
    requestedDocuments,
    severityTier,
  });

  const data: ErisaPenaltyData = {
    documentRequestDate: documentRequestDateStr,
    disclosureDeadlineDate: disclosureDeadlineDateStr,
    calculationDate: calculationDateStr,
    requestedDocuments,
    complianceStatus,
    dailyPenaltyRate,
    daysInDefault,
    accruedPenaltyAmount,
    statutoryInterestRate,
    accruedInterestAmount,
    estimatedAttorneysFees,
    totalStatutoryDamages,
    totalPlanAdministratorExposure,
    severityTier,
    statutoryDemandLanguage: noticeOfDefaultText,
    updatedAt: Date.now(),
  };

  return {
    data,
    daysElapsedSinceRequest,
    graceDaysRemaining,
    isPastDeadline,
    statutoryAuthorityCitation,
    trajectories,
    noticeOfDefaultText,
  };
}

/**
 * Generates formal ERISA § 502(c) statutory default legal language.
 */
function generateNoticeOfDefaultStatement(ctx: {
  payerName: string;
  patientName: string;
  claimNumber: string;
  documentRequestDate: string;
  disclosureDeadlineDate: string;
  calculationDate: string;
  daysInDefault: number;
  dailyPenaltyRate: number;
  accruedPenaltyAmount: number;
  disputedAmount: number;
  statutoryInterestRate: number;
  accruedInterestAmount: number;
  estimatedAttorneysFees: number;
  totalPlanAdministratorExposure: number;
  requestedDocuments: string[];
  severityTier: StatutorySeverityTier;
}): string {
  const docBulletList = ctx.requestedDocuments.map((d) => `  - ${d}`).join("\n");

  if (ctx.daysInDefault === 0) {
    return `FORMAL ERISA 29 CFR § 2560.503-1 DISCLOSURE DEMAND NOTICE:
To: Plan Administrator / Designated Claims Fiduciary (${ctx.payerName})
Re: Claim #${ctx.claimNumber} | Beneficiary: ${ctx.patientName}
Request Served: ${ctx.documentRequestDate} | Statutory Compliance Deadline: ${ctx.disclosureDeadlineDate}

Pursuant to ERISA Section 503 [29 U.S.C. § 1133] and federal claims procedure regulations at 29 C.F.R. § 2560.503-1(h)(2)(iii), claimant hereby formalizes the demand for production of the complete administrative claim file without charge, including:
${docBulletList}

STATUTORY DISCLOSURE NOTICE:
Under 29 U.S.C. § 1132(c)(1)(B), the Plan Administrator is required by federal law to furnish these requested records within thirty (30) calendar days of receipt. Failure to timely provide these documents exposes the Plan Administrator to personal statutory penalties of up to $110.00 per day under 29 C.F.R. § 2575.502c-1 starting from ${ctx.disclosureDeadlineDate}, in addition to mandatory attorney's fees under 29 U.S.C. § 1132(g)(1).`;
  }

  return `FORMAL NOTICE OF STATUTORY ERISA § 502(c) DEFAULT & PENALTY DEMAND
To: Plan Administrator / Designated Claims Fiduciary (${ctx.payerName})
Re: Claim #${ctx.claimNumber} | Beneficiary: ${ctx.patientName}
Initial Written Demand Served: ${ctx.documentRequestDate}
Statutory 30-Day Deadline: ${ctx.disclosureDeadlineDate}
Audit & Calculation Date: ${ctx.calculationDate}

I. STATUTORY DEFAULT DETERMINATION & ACCRUED PENALTY ASSESSMENT:
Under 29 U.S.C. § 1132(c)(1)(B) [ERISA Section 502(c)(1)(B)] and 29 C.F.R. § 2560.503-1(h)(2)(iii), the Plan Administrator was legally mandated to furnish the claimant's complete claim file, internal clinical coverage bulletins, and reviewer credential records within 30 calendar days of written demand. 

As of ${ctx.calculationDate}, the Plan Administrator has remained in persistent default for ${ctx.daysInDefault} consecutive calendar days past the statutory deadline (${ctx.disclosureDeadlineDate}).

Pursuant to the Federal Civil Penalties Inflation Adjustment Act and 29 C.F.R. § 2575.502c-1, statutory penalties of $110.00 per day have accrued and continue to accrue daily:
  - Days in Statutory Non-Compliance: ${ctx.daysInDefault} days
  - Daily Statutory Penalty Rate: $${ctx.dailyPenaltyRate.toFixed(2)} / day
  - Total Accrued ERISA § 502(c) Penalties: $${ctx.accruedPenaltyAmount.toLocaleString("en-US", { minimumFractionDigits: 2 })}

II. ITEMIZED PLAN ADMINISTRATOR LIABILITY & STATUTORY EXPOSURE:
  1. Principal Disputed Clinical Claim: $${ctx.disputedAmount.toLocaleString("en-US", { minimumFractionDigits: 2 })}
  2. Accrued ERISA § 502(c) Failure-to-Disclose Penalties: $${ctx.accruedPenaltyAmount.toLocaleString("en-US", { minimumFractionDigits: 2 })} (${ctx.daysInDefault} days @ $${ctx.dailyPenaltyRate}/day)
  3. Accrued Statutory Interest (${ctx.statutoryInterestRate}% p.a.): $${ctx.accruedInterestAmount.toLocaleString("en-US", { minimumFractionDigits: 2 })}
  4. Estimated Lodestar Attorney's Fees (ERISA § 502(g)(1)): $${ctx.estimatedAttorneysFees.toLocaleString("en-US", { minimumFractionDigits: 2 })}
  =====================================================================
  TOTAL PLAN ADMINISTRATOR EXPOSURE: $${ctx.totalPlanAdministratorExposure.toLocaleString("en-US", { minimumFractionDigits: 2 })}

III. FORMAL DEMAND & RESERVATION OF LITIGATION REMEDIES:
Demand is hereby made for immediate disclosure of all outstanding records within five (5) business days and full reimbursement of the principal medical claim. Claimant expressly reserves all civil enforcement remedies under ERISA Section 502(a)(1)(B) [29 U.S.C. § 1132(a)(1)(B)], individual fiduciary assessment under Section 502(c)(1), mandatory attorney's fee shifting under Section 502(g)(1), and immediate referral to the U.S. Department of Labor Employee Benefits Security Administration (EBSA).`;
}

/**
 * Returns sensible default financial liability data derived from an existing claim.
 */
export function getDefaultFinancialLiability(claim: Claim): FinancialLiabilityData {
  const billedAmount = claim.deniedAmount || 24500;
  const contractualDiscount = Math.round(billedAmount * 0.15); // ~15% discount
  const allowedAmount = billedAmount - contractualDiscount;
  const deductibleTotal = 1500;
  const deductibleMet = 500;
  const coinsuranceRate = 20; // 20%
  const copayAmount = 50;
  const outOfPocketMax = 6000;
  const outOfPocketSpent = 1800;

  const result = calculateFinancialLiability({
    billedAmount,
    contractualDiscount,
    allowedAmount,
    deductibleTotal,
    deductibleMet,
    coinsuranceRate,
    copayAmount,
    outOfPocketMax,
    outOfPocketSpent,
    networkStatus: "in_network",
    noSurprisesActProtected: true,
  });

  return result.data;
}

/**
 * Returns sensible default ERISA penalty data derived from an existing claim.
 */
export function getDefaultErisaPenalties(claim: Claim): ErisaPenaltyData {
  const now = new Date();
  const requestDate = new Date(now.getTime() - 48 * 24 * 60 * 60 * 1000); // 48 days ago -> 18 days default

  const result = calculateErisaPenalties(
    {
      documentRequestDate: formatDateISO(requestDate),
      calculationDate: formatDateISO(now),
      complianceStatus: "defaulted",
      dailyPenaltyRate: 110.0,
      statutoryInterestRate: 18,
      requestedDocuments: DEFAULT_REQUESTED_DOCUMENTS,
    },
    {
      deniedAmount: claim.deniedAmount || 24500,
      patientName: claim.patient?.name || "Eleanor Vance",
      payerName: claim.patient?.insurancePayer || "Health Insurer",
      claimNumber: claim.claimNumber || "CLM-8942-MOL",
      serviceDate: claim.serviceDate,
    }
  );

  return result.data;
}

export function getSeverityTierMeta(tier: StatutorySeverityTier): {
  label: string;
  badgeVariant: "default" | "secondary" | "destructive" | "outline" | "success" | "warning" | "info";
  description: string;
  colorClass: string;
} {
  switch (tier) {
    case "grace_period":
      return {
        label: "30-Day Statutory Grace Window",
        badgeVariant: "info",
        description: "Request active within standard statutory 30-day disclosure window",
        colorClass: "text-cyan-400 border-cyan-500/30 bg-cyan-950/40",
      };
    case "actionable_default":
      return {
        label: "Actionable ERISA § 502(c) Default",
        badgeVariant: "warning",
        description: "1-30 days overdue; statutory penalties actively accruing at $110/day",
        colorClass: "text-amber-400 border-amber-500/30 bg-amber-950/40",
      };
    case "egregious_noncompliance":
      return {
        label: "Egregious Fiduciary Non-Compliance",
        badgeVariant: "destructive",
        description: "31-60 days in default; grounds for immediate DOL grievance & bad-faith filing",
        colorClass: "text-rose-400 border-rose-500/30 bg-rose-950/40",
      };
    case "bad_faith_enforcement":
      return {
        label: "Federal Civil Enforcement Threshold",
        badgeVariant: "destructive",
        description: "60+ days in default; mandatory fee-shifting and personal fiduciary liability",
        colorClass: "text-rose-300 border-rose-400 bg-rose-900/60",
      };
  }
}

function formatDateISO(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDateSafe(dateStr: string): Date {
  const parts = dateStr.split("-");
  if (parts.length === 3) {
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10) - 1;
    const d = parseInt(parts[2], 10);
    return new Date(y, m, d);
  }
  const parsed = new Date(dateStr);
  return isNaN(parsed.getTime()) ? new Date() : parsed;
}

function formatPercent(num: number): string {
  return `${Math.min(100, Math.max(0, Math.round(num)))}%`;
}
