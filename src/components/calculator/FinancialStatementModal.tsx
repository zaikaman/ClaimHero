import React, { useState } from "react";
import { Claim, FinancialLiabilityResult, ErisaPenaltyResult } from "../../types";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "../ui/dialog";
import { Button } from "../ui/button";
import { formatCurrency } from "../../lib/utils";
import { getSeverityTierMeta } from "../../lib/liabilityCalculator";
import { resolvePayerEdiId, formatDossierDate } from "../../lib/dossierBuilder";
import {
  Printer,
  Copy,
  Check,
  DownloadSimple,
  Receipt,
  Scales,
  Coins,
  X,
} from "@phosphor-icons/react";

interface FinancialStatementModalProps {
  isOpen: boolean;
  onClose: () => void;
  claim: Claim;
  liabilityResult: FinancialLiabilityResult;
  erisaResult: ErisaPenaltyResult;
}

export const FinancialStatementModal: React.FC<FinancialStatementModalProps> = ({
  isOpen,
  onClose,
  claim,
  liabilityResult,
  erisaResult,
}) => {
  const [copied, setCopied] = useState<boolean>(false);
  const severityMeta = getSeverityTierMeta(erisaResult.data.severityTier);
  const payerEdiId = resolvePayerEdiId(claim.patient?.insurancePayer, claim.payerContact?.ediPayerId);

  const generateStatementPlainText = (): string => {
    const hr = "================================================================================";
    const subHr = "--------------------------------------------------------------------------------";

    return `${hr}
STATUTORY FINANCIAL LIABILITY & ERISA § 502(c) AUDIT STATEMENT
CLAIM REFERENCE: ${claim.claimNumber}
DATE OF SERVICE: ${formatDossierDate(claim.serviceDate)}
STATEMENT DATE:  ${erisaResult.data.calculationDate}
${hr}

I. ADMINISTRATIVE DOCKET & PARTIES
${subHr}
INSURED BENEFICIARY: ${claim.patient?.name || "Insured Claimant"}
MEMBER IDENTIFIER:   ${claim.patient?.memberId || "N/A"}
GROUP NUMBER:        ${claim.patient?.groupNumber || "N/A"}
STATE JURISDICTION:  ${claim.patient?.state || "US"}

PLAN ADMINISTRATOR:  ${claim.patient?.insurancePayer || "Health Insurer"}
PAYER EDI GATEWAY:   ${payerEdiId}
APPEALS OFFICE:      ${claim.payerContact?.statutoryPoBox || "Grievance & Appeals Department"}
APPEALS FAX:         ${claim.payerContact?.appealsFax || "N/A"}

TREATING PROVIDER:   ${claim.providerName || "Treating Physician, MD"}
PROCEDURE CODES:     CPT ${claim.cptCodes?.join(", ") || "27447"} | ICD-10 ${claim.icd10Codes?.join(", ") || "M17.11"}
DENIAL REASON:       Code ${claim.denialReasonCode || "CO-50"}: ${claim.denialReasonDescription}

II. PATIENT OUT-OF-POCKET FINANCIAL LIABILITY SCHEDULE
${subHr}
1. Total Billed Charges:                ${formatCurrency(liabilityResult.data.billedAmount)}
2. Contractual PPO Network Discount:   -${formatCurrency(liabilityResult.data.contractualDiscount)}
3. Plan Allowed Base Reimbursement:     ${formatCurrency(liabilityResult.data.allowedAmount)}
4. Annual Deductible Applied:           ${formatCurrency(liabilityResult.deductibleApplied)} ($${liabilityResult.data.deductibleMet.toLocaleString()} met prior)
5. Patient Co-Insurance (${liabilityResult.data.coinsuranceRate}%):        ${formatCurrency(liabilityResult.coinsuranceOwed)}
6. Specialist Co-Payment:               ${formatCurrency(liabilityResult.copayOwed)}
7. Out-of-Pocket Maximum Cap Adjustment: ${liabilityResult.isOopMaxReached ? "ANNUAL OOP CAP REACHED ($" + liabilityResult.data.outOfPocketMax.toLocaleString() + ")" : "UNDER OOP CAP ($" + (liabilityResult.data.outOfPocketSpent + liabilityResult.coveredPatientShare).toLocaleString() + " / $" + liabilityResult.data.outOfPocketMax.toLocaleString() + ")"}
8. Out-of-Network Balance Billing:      ${formatCurrency(liabilityResult.balanceBillingExposure)} (${liabilityResult.data.noSurprisesActProtected ? "Protected by No Surprises Act 45 CFR § 149.410" : "Exposed"})
--------------------------------------------------------------------------------
TOTAL PATIENT RESPONSIBILITY (DENIED):     ${formatCurrency(liabilityResult.totalPatientExposureDenied)}
TOTAL PATIENT RESPONSIBILITY (OVERTURNED): ${formatCurrency(liabilityResult.totalPatientLiabilityOverturned)}
NET PATIENT RECOVERY SAVINGS:              ${formatCurrency(liabilityResult.netPatientSavings)}
PAYER EXPECTED BENEFIT REIMBURSEMENT:      ${formatCurrency(liabilityResult.payerExpectedObligation)}

III. STATUTORY ERISA § 502(c) FAILURE-TO-DISCLOSE PENALTIES
${subHr}
Controlling Law: 29 U.S.C. § 1132(c)(1)(B); 29 C.F.R. § 2560.503-1(h)(2)(iii); 29 C.F.R. § 2575.502c-1
- Written Request Served:       ${erisaResult.data.documentRequestDate}
- 30-Day Compliance Deadline:   ${erisaResult.data.disclosureDeadlineDate}
- Days in Statutory Default:    ${erisaResult.data.daysInDefault} calendar days
- Daily Statutory Penalty Rate: $${erisaResult.data.dailyPenaltyRate.toFixed(2)} / calendar day
- Total Accrued Penalties:      ${formatCurrency(erisaResult.data.accruedPenaltyAmount)}
- Accrued Prompt-Pay Interest:  ${formatCurrency(erisaResult.data.accruedInterestAmount)} (${erisaResult.data.statutoryInterestRate}% p.a.)
- Estimated Lodestar Legal Fees:${formatCurrency(erisaResult.data.estimatedAttorneysFees)} (ERISA § 502(g)(1))
--------------------------------------------------------------------------------
TOTAL PLAN ADMINISTRATOR STATUTORY EXPOSURE: ${formatCurrency(erisaResult.data.totalPlanAdministratorExposure)}
SEVERITY CLASSIFICATION: ${severityMeta.label.toUpperCase()}

IV. FORMAL NOTICE OF STATUTORY DEFAULT & DEMAND
${subHr}
${erisaResult.noticeOfDefaultText}

V. CERTIFICATION & ATTESTATION
${subHr}
I hereby certify under penalty of law that the financial calculations and statutory disclosure timelines set forth above reflect true and accurate administrative records submitted in connection with Claim #${claim.claimNumber}.

Authorized Representative / Claimant: ___________________________   Date: ${erisaResult.data.calculationDate}
`;
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(generateStatementPlainText());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadTxt = () => {
    const text = generateStatementPlainText();
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Financial_ERISA_Statement_${claim.claimNumber}_${erisaResult.data.calculationDate}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        showCloseButton={false}
        className="max-w-4xl max-h-[92vh] flex flex-col p-0 gap-0 border-border/80 bg-background/95 backdrop-blur-2xl shadow-2xl overflow-hidden"
      >
        {/* Modal Toolbar Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border/60 bg-card/60 shrink-0 no-print">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-lg bg-primary/15 text-primary border border-primary/30">
              <Receipt className="size-5" />
            </div>
            <div>
              <DialogTitle className="text-sm font-bold text-foreground font-sans">
                Statutory Financial Liability & ERISA Audit Statement
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground font-mono">
                Court-ready print & legal exhibit packet for Claim #{claim.claimNumber}
              </DialogDescription>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopy}
              className="gap-1.5 text-xs font-mono h-8"
              title="Copy plain text statement"
            >
              {copied ? <Check className="size-3.5 text-emerald-400" /> : <Copy className="size-3.5" />}
              <span>{copied ? "Copied" : "Copy Text"}</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleDownloadTxt}
              className="gap-1.5 text-xs font-mono h-8"
              title="Download text file"
            >
              <DownloadSimple className="size-3.5" />
              <span>Download .txt</span>
            </Button>
            <Button
              size="sm"
              onClick={handlePrint}
              className="gap-1.5 text-xs font-medium h-8 bg-primary text-primary-foreground hover:bg-primary/90"
              title="Print formal paper statement"
            >
              <Printer className="size-3.5" />
              <span>Print Statement</span>
            </Button>
            <button
              onClick={onClose}
              className="size-8 flex items-center justify-center rounded-md hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors cursor-pointer ml-1"
              title="Close modal"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>

        {/* Scrollable Printable Document Area */}
        <div className="printable-dossier-scroll-area flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-900/40">
          <div className="printable-dossier max-w-3xl mx-auto bg-white text-slate-900 border border-slate-300 rounded-lg p-6 sm:p-10 shadow-lg font-sans space-y-6">
            {/* Document Letterhead */}
            <div className="border-b-2 border-slate-900 pb-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-[10px] font-mono uppercase tracking-widest text-slate-500 font-bold">
                    United States Healthcare Administrative Record & Financial Audit
                  </div>
                  <h1 className="text-xl font-bold uppercase tracking-tight text-slate-950 mt-1 font-serif">
                    Statutory Financial Liability & ERISA § 502(c) Audit Statement
                  </h1>
                  <p className="text-xs text-slate-600 mt-1">
                    Itemized Patient Out-of-Pocket Reconciliation vs Statutory Plan Administrator Penalties
                  </p>
                </div>
                <div className="text-right shrink-0 border border-slate-300 p-2.5 rounded bg-slate-50 font-mono text-[11px]">
                  <div className="text-slate-500 text-[10px] uppercase font-bold">Claim Docket</div>
                  <div className="font-bold text-slate-950">{claim.claimNumber}</div>
                  <div className="text-[10px] text-slate-600">DOS: {formatDossierDate(claim.serviceDate)}</div>
                </div>
              </div>
            </div>

            {/* Parties & Identification Grid */}
            <div className="grid grid-cols-2 gap-4 text-xs font-mono p-3.5 bg-slate-50 border border-slate-200 rounded">
              <div className="space-y-1">
                <div className="text-[10px] uppercase font-bold text-slate-500">Insured Beneficiary</div>
                <div className="font-bold text-slate-950 text-sm">{claim.patient?.name || "Insured Claimant"}</div>
                <div className="text-slate-700">Member ID: {claim.patient?.memberId || "N/A"}</div>
                <div className="text-slate-700">Group #: {claim.patient?.groupNumber || "N/A"} | State: {claim.patient?.state || "US"}</div>
              </div>

              <div className="space-y-1">
                <div className="text-[10px] uppercase font-bold text-slate-500">Plan Administrator / Payer</div>
                <div className="font-bold text-slate-950 text-sm">{claim.patient?.insurancePayer || "Health Insurer"}</div>
                <div className="text-slate-700">Payer EDI ID: {payerEdiId}</div>
                <div className="text-slate-700 truncate">Appeals Office: {claim.payerContact?.statutoryPoBox || "Grievance Dept"}</div>
              </div>
            </div>

            {/* High-Level Financial Summary Banner */}
            <div className="grid grid-cols-3 gap-3 p-3.5 bg-slate-100 border border-slate-300 rounded font-mono text-center">
              <div>
                <div className="text-[10px] uppercase text-slate-500 font-bold">Patient Billed Liability</div>
                <div className="text-base font-bold text-red-700 mt-0.5">
                  {formatCurrency(liabilityResult.totalPatientExposureDenied)}
                </div>
                <div className="text-[10px] text-slate-500">If Denial Upheld</div>
              </div>
              <div className="border-x border-slate-300">
                <div className="text-[10px] uppercase text-emerald-800 font-bold">Net Overturn Savings</div>
                <div className="text-base font-bold text-emerald-700 mt-0.5">
                  {formatCurrency(liabilityResult.netPatientSavings)}
                </div>
                <div className="text-[10px] text-emerald-800 font-semibold">Cost-Share Cap Relief</div>
              </div>
              <div>
                <div className="text-[10px] uppercase text-amber-800 font-bold">Plan Statutory Exposure</div>
                <div className="text-base font-bold text-amber-800 mt-0.5">
                  {formatCurrency(erisaResult.data.totalPlanAdministratorExposure)}
                </div>
                <div className="text-[10px] text-slate-500">{erisaResult.data.daysInDefault}d @ $110/day + Fees</div>
              </div>
            </div>

            {/* Section I: Patient Financial Schedule */}
            <div className="space-y-3">
              <div className="border-b border-slate-300 pb-1.5 flex items-center justify-between">
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-950 font-mono flex items-center gap-1.5">
                  <Coins className="size-4 text-slate-900" />
                  <span>Section I: Patient Out-of-Pocket Financial Responsibility Schedule</span>
                </h2>
                <span className="text-[10px] font-mono text-slate-500">CMS-1500 / UB-04 Reconciliation</span>
              </div>

              <table className="w-full text-xs font-mono border-collapse border border-slate-300">
                <thead>
                  <tr className="bg-slate-100 text-slate-700 border-b border-slate-300 text-left">
                    <th className="p-2 border-r border-slate-300 font-semibold">Accounting Line Item</th>
                    <th className="p-2 border-r border-slate-300 text-right font-semibold">Denied State</th>
                    <th className="p-2 border-r border-slate-300 text-right font-semibold">Overturned State</th>
                    <th className="p-2 text-right font-semibold">Variance / Relief</th>
                  </tr>
                </thead>
                <tbody>
                  {liabilityResult.schedule.map((item) => (
                    <tr
                      key={item.id}
                      className={item.type === "total" ? "bg-slate-100 font-bold border-t-2 border-slate-900" : "border-b border-slate-200"}
                    >
                      <td className="p-2 border-r border-slate-200">
                        <div className="font-semibold text-slate-950">{item.label}</div>
                        <div className="text-[10px] text-slate-500 font-sans">{item.description}</div>
                      </td>
                      <td className="p-2 border-r border-slate-200 text-right text-red-700">
                        {formatCurrency(item.deniedAmount)}
                      </td>
                      <td className="p-2 border-r border-slate-200 text-right text-slate-900">
                        {formatCurrency(item.overturnedAmount)}
                      </td>
                      <td className="p-2 text-right font-bold">
                        {item.variance < 0 ? (
                          <span className="text-emerald-700">-{formatCurrency(Math.abs(item.variance))}</span>
                        ) : item.variance > 0 ? (
                          <span className="text-blue-700">+{formatCurrency(item.variance)}</span>
                        ) : (
                          <span className="text-slate-400">$0.00</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Section II: Statutory ERISA Penalties */}
            <div className="space-y-3 pt-2">
              <div className="border-b border-slate-300 pb-1.5 flex items-center justify-between">
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-950 font-mono flex items-center gap-1.5">
                  <Scales className="size-4 text-slate-900" />
                  <span>Section II: Statutory ERISA § 502(c) Failure-to-Disclose Penalties</span>
                </h2>
                <span className="text-[10px] font-mono text-slate-500">29 U.S.C. § 1132(c)(1)(B) | 29 CFR § 2575</span>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs font-mono">
                <div className="p-3 border border-slate-300 rounded space-y-1.5">
                  <div className="text-[10px] uppercase font-bold text-slate-500">Statutory Timeline Audit</div>
                  <div className="flex justify-between"><span>Written Demand Served:</span><strong>{erisaResult.data.documentRequestDate}</strong></div>
                  <div className="flex justify-between"><span>30-Day Statutory Deadline:</span><strong>{erisaResult.data.disclosureDeadlineDate}</strong></div>
                  <div className="flex justify-between"><span>Audit Calculation Date:</span><strong>{erisaResult.data.calculationDate}</strong></div>
                  <div className="flex justify-between text-red-700"><span>Days in Statutory Default:</span><strong>{erisaResult.data.daysInDefault} calendar days</strong></div>
                </div>

                <div className="p-3 border border-slate-300 rounded space-y-1.5">
                  <div className="text-[10px] uppercase font-bold text-slate-500">Itemized Plan Administrator Exposure</div>
                  <div className="flex justify-between"><span>Principal Disputed Claim:</span><span>{formatCurrency(liabilityResult.data.billedAmount)}</span></div>
                  <div className="flex justify-between text-amber-800"><span>Accrued Penalties ($110/d):</span><strong>{formatCurrency(erisaResult.data.accruedPenaltyAmount)}</strong></div>
                  <div className="flex justify-between"><span>Statutory Interest ({erisaResult.data.statutoryInterestRate}%):</span><span>{formatCurrency(erisaResult.data.accruedInterestAmount)}</span></div>
                  <div className="flex justify-between"><span>Attorney Fees (§ 502(g)(1)):</span><span>{formatCurrency(erisaResult.data.estimatedAttorneysFees)}</span></div>
                  <div className="flex justify-between pt-1 border-t border-slate-300 font-bold text-slate-950">
                    <span>Total Plan Exposure:</span><span>{formatCurrency(erisaResult.data.totalPlanAdministratorExposure)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Section III: Formal Notice of Default Text */}
            <div className="space-y-2 pt-2">
              <div className="border-b border-slate-300 pb-1">
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-950 font-mono">
                  Section III: Formal Notice of Default & Statutory Demand
                </h2>
              </div>
              <div className="p-3 bg-slate-50 border border-slate-300 rounded font-mono text-[10px] text-slate-800 whitespace-pre-wrap leading-relaxed">
                {erisaResult.noticeOfDefaultText}
              </div>
            </div>

            {/* Section IV: Certification & Signature Block */}
            <div className="space-y-4 pt-4 border-t-2 border-slate-900 text-xs font-mono">
              <p className="text-[11px] text-slate-700 leading-normal">
                I hereby declare under penalty of perjury under the laws of the United States of America that the foregoing financial liability schedule and statutory ERISA compliance dates are true and correct to the best of my knowledge and belief.
              </p>

              <div className="grid grid-cols-2 gap-8 pt-4">
                <div>
                  <div className="border-b border-slate-900 pb-1">
                    <span className="font-serif italic text-slate-800 text-sm">
                      {claim.appealContext?.sender?.name || claim.providerName || "Authorized Clinical Advocate"}
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-500 uppercase mt-1">Authorized Representative / Claimant Signature</div>
                </div>

                <div>
                  <div className="border-b border-slate-900 pb-1">
                    <span className="font-mono text-slate-900 text-sm">{erisaResult.data.calculationDate}</span>
                  </div>
                  <div className="text-[10px] text-slate-500 uppercase mt-1">Date of Certification</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
