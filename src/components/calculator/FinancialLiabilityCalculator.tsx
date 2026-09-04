import React, { useState } from "react";
import { Claim, StatutoryComplianceStatus } from "../../types";
import { useLiabilityCalculator } from "../../hooks/useLiabilityCalculator";
import { NavigationView } from "../layout/Sidebar";
import { SentinelFlowStepper } from "../common/SentinelFlowStepper";
import { FinancialStatementModal } from "./FinancialStatementModal";
import { Card } from "../ui/card";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Input } from "../ui/input";
import { Progress } from "../ui/progress";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "../ui/table";
import { formatCurrency, cn } from "../../lib/utils";
import { getSeverityTierMeta, STATUTORY_DISCLOSURE_GRACE_DAYS } from "../../lib/liabilityCalculator";
import {
  Calculator,
  Scales,
  ShieldCheck,
  ShieldWarning,
  Copy,
  Check,
  FloppyDisk,
  Coins,
  Receipt,
  FileText,
  TrendUp,
  WarningCircle,
  CurrencyDollar,
  CheckCircle,
  Printer,
  CircleNotch,
  ArrowRight,
} from "@phosphor-icons/react";


interface FinancialLiabilityCalculatorProps {
  claim: Claim;
  onNavigateView?: (view: NavigationView) => void;
}

export const FinancialLiabilityCalculator: React.FC<FinancialLiabilityCalculatorProps> = ({
  claim,
  onNavigateView,
}) => {
  const {
    financialInputs,
    updateFinancialField,
    liabilityResult,
    erisaInputs,
    updateErisaField,
    erisaResult,
    isSaving,
    saveSuccess,
    errorMessage,
    saveToClaim,
  } = useLiabilityCalculator(claim);

  const [activeTab, setActiveTab] = useState<"patient_liability" | "erisa_penalties" | "balance_sheet">(
    "patient_liability"
  );
  const [copiedDemand, setCopiedDemand] = useState<boolean>(false);
  const [copiedSummary, setCopiedSummary] = useState<boolean>(false);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState<boolean>(false);

  const severityMeta = getSeverityTierMeta(erisaResult.data.severityTier);

  const handleCopyDemand = () => {
    navigator.clipboard.writeText(erisaResult.noticeOfDefaultText);
    setCopiedDemand(true);
    setTimeout(() => setCopiedDemand(false), 2500);
  };

  const handleCopySummary = () => {
    const summaryText = `# FINANCIAL LIABILITY & STATUTORY ERISA PENALTY AUDIT REPORT
Claim Reference: ${claim.claimNumber}
Patient: ${claim.patient?.name || "Insured Claimant"} (Member ID: ${claim.patient?.memberId || "N/A"})
Insurer / Plan Administrator: ${claim.patient?.insurancePayer || "Health Plan"}
Date of Service: ${claim.serviceDate}

---
## 1. PATIENT FINANCIAL LIABILITY BREAKDOWN
- Total Billed Charges: ${formatCurrency(liabilityResult.data.billedAmount)}
- Contractual Discount: ${formatCurrency(liabilityResult.data.contractualDiscount)}
- Plan Allowed Base: ${formatCurrency(liabilityResult.data.allowedAmount)}
- Deductible Applied: ${formatCurrency(liabilityResult.deductibleApplied)}
- Co-Insurance Owed (${liabilityResult.data.coinsuranceRate}%): ${formatCurrency(liabilityResult.coinsuranceOwed)}
- Outpatient Co-Pay: ${formatCurrency(liabilityResult.copayOwed)}
- Out-of-Pocket Max: ${formatCurrency(liabilityResult.data.outOfPocketMax)} (Accumulated: ${formatCurrency(liabilityResult.data.outOfPocketSpent + liabilityResult.coveredPatientShare)})
- Balance Billing Exposure: ${formatCurrency(liabilityResult.balanceBillingExposure)} (${liabilityResult.data.noSurprisesActProtected ? "Protected by NSA" : "Exposed"})
-------------------------------------------------------------
* Total Patient Responsibility (Denied): ${formatCurrency(liabilityResult.totalPatientExposureDenied)}
* Total Patient Responsibility (Overturned): ${formatCurrency(liabilityResult.totalPatientLiabilityOverturned)}
* NET PATIENT RECOVERY SAVINGS: ${formatCurrency(liabilityResult.netPatientSavings)}
* Payer Expected Benefit Reimbursement: ${formatCurrency(liabilityResult.payerExpectedObligation)}

---
## 2. STATUTORY ERISA § 502(c) FAILURE-TO-DISCLOSE PENALTIES
Statutory Authority: 29 U.S.C. § 1132(c)(1)(B) | 29 C.F.R. § 2560.503-1(h)(2)(iii) | 29 C.F.R. § 2575.502c-1
- Written Request Date: ${erisaResult.data.documentRequestDate}
- 30-Day Statutory Deadline: ${erisaResult.data.disclosureDeadlineDate}
- Audit & Calculation Date: ${erisaResult.data.calculationDate}
- Days in Statutory Default: ${erisaResult.data.daysInDefault} calendar days
- Daily Statutory Penalty Rate: $${erisaResult.data.dailyPenaltyRate.toFixed(2)} / day
- Total Accrued ERISA Penalties: ${formatCurrency(erisaResult.data.accruedPenaltyAmount)}
- Accrued Prompt-Pay Interest (${erisaResult.data.statutoryInterestRate}% p.a.): ${formatCurrency(erisaResult.data.accruedInterestAmount)}
- Estimated Lodestar Attorney's Fees (ERISA § 502(g)(1)): ${formatCurrency(erisaResult.data.estimatedAttorneysFees)}
-------------------------------------------------------------
* TOTAL PLAN ADMINISTRATOR STATUTORY EXPOSURE: ${formatCurrency(erisaResult.data.totalPlanAdministratorExposure)}
* Statutory Severity Tier: ${severityMeta.label}`;

    navigator.clipboard.writeText(summaryText);
    setCopiedSummary(true);
    setTimeout(() => setCopiedSummary(false), 2500);
  };

  return (
    <div className="space-y-4 animate-fadeIn font-sans pb-12">
      {/* Sentinel Flow Stepper Navigation */}
      <SentinelFlowStepper
        currentView="calculator"
        claim={claim}
        onNavigateView={(view) => onNavigateView?.(view as NavigationView)}
      />

      {/* Top Header Card */}
      <Card className="p-3.5 shrink-0 overflow-visible no-print">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          {/* Left: Case & Engine Info */}
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex size-9 items-center justify-center rounded-md bg-primary text-primary-foreground shrink-0 shadow-xs">
              <Calculator className="size-4.5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-sm font-semibold text-foreground font-sans">
                  ERISA & Liability Audit
                </h2>
                <Badge variant="outline" className="font-mono text-[10px] text-cyan-400 border-cyan-500/30">
                  29 U.S.C. § 1132(c)
                </Badge>
                <Badge variant="outline" className="font-mono text-[10px]">
                  Claim #{claim.claimNumber}
                </Badge>
                {isSaving && (
                  <span className="flex items-center gap-1 text-[11px] font-mono text-muted-foreground animate-pulse">
                    <CircleNotch className="size-3 animate-spin" />
                    <span>Saving...</span>
                  </span>
                )}
                {saveSuccess && (
                  <span className="flex items-center gap-1 text-[11px] font-mono text-emerald-600 dark:text-emerald-400">
                    <Check className="size-3" />
                    <span>Synced</span>
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground truncate">
                Patient: <span className="text-foreground font-medium">{claim.patient?.name || "Insured Patient"}</span> • Payer:{" "}
                <span className="text-foreground font-medium">{claim.patient?.insurancePayer || "Health Insurer"}</span> • Disputed:{" "}
                <span className="text-foreground font-medium">{formatCurrency(claim.deniedAmount)}</span>
              </p>
            </div>
          </div>

          {/* Right: Actions Toolbar */}
          <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopySummary}
              className="h-8 rounded-md px-2.5 text-xs gap-1.5 shrink-0 border-border/70"
              title="Copy audit summary to clipboard"
            >
              {copiedSummary ? (
                <Check className="size-3.5 text-emerald-400" />
              ) : (
                <Copy className="size-3.5" />
              )}
              <span>{copiedSummary ? "Copied" : "Copy Audit"}</span>
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsPrintModalOpen(true)}
              className="h-8 rounded-md px-2.5 text-xs gap-1.5 shrink-0 border-border/70 text-foreground"
              title="Inspect and print formal statement"
            >
              <Printer className="size-3.5" />
              <span>Print Statement</span>
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={saveToClaim}
              disabled={isSaving}
              className="h-8 rounded-md px-2.5 text-xs gap-1.5 shrink-0 border-border/70"
            >
              {isSaving ? (
                <CircleNotch className="size-3.5 animate-spin" />
              ) : saveSuccess ? (
                <Check className="size-3.5 text-emerald-400" />
              ) : (
                <FloppyDisk className="size-3.5" />
              )}
              <span>{saveSuccess ? "Saved" : "Save & Sync"}</span>
            </Button>

            <Button
              size="sm"
              onClick={async () => {
                await saveToClaim();
                onNavigateView?.("studio");
              }}
              disabled={isSaving}
              className="h-8 rounded-md text-xs px-3 gap-1.5 shrink-0 bg-primary text-primary-foreground font-semibold shadow-xs"
              title="Save calculations and open Appeal Studio to embed statutory penalties in the brief"
            >
              <FileText className="size-3.5" />
              <span>Embed in Brief</span>
              <ArrowRight className="size-3" />
            </Button>
          </div>
        </div>

        {/* Global Metric Ribbon */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4 pt-3.5 border-t border-border/50">
          <div className="p-2.5 rounded-lg bg-background/50 border border-border/40">
            <div className="text-[10px] uppercase font-mono text-muted-foreground flex items-center gap-1">
              <CurrencyDollar className="size-3 text-cyan-400" />
              <span>Billed / Disputed</span>
            </div>
            <div className="text-sm font-mono font-bold text-foreground mt-0.5">
              {formatCurrency(liabilityResult.data.billedAmount)}
            </div>
            <div className="text-[10px] text-muted-foreground font-mono truncate">
              {claim.patient?.insurancePayer || "Payer"} (CPT {claim.cptCodes?.[0] || "27447"})
            </div>
          </div>

          <div className="p-2.5 rounded-lg bg-background/50 border border-border/40">
            <div className="text-[10px] uppercase font-mono text-muted-foreground flex items-center gap-1">
              <Receipt className="size-3 text-rose-400" />
              <span>Patient Liability (Denied)</span>
            </div>
            <div className="text-sm font-mono font-bold text-rose-400 mt-0.5">
              {formatCurrency(liabilityResult.totalPatientExposureDenied)}
            </div>
            <div className="text-[10px] text-muted-foreground font-mono truncate">
              Out-of-pocket exposure
            </div>
          </div>

          <div className="p-2.5 rounded-lg bg-background/50 border border-border/40">
            <div className="text-[10px] uppercase font-mono text-emerald-400 flex items-center gap-1">
              <TrendUp className="size-3" />
              <span>Net Overturn Savings</span>
            </div>
            <div className="text-sm font-mono font-bold text-emerald-400 mt-0.5">
              {formatCurrency(liabilityResult.netPatientSavings)}
            </div>
            <div className="text-[10px] text-emerald-400/80 font-mono truncate">
              Patient financial recovery
            </div>
          </div>

          <div className="p-2.5 rounded-lg bg-background/50 border border-border/40">
            <div className="text-[10px] uppercase font-mono text-amber-400 flex items-center gap-1">
              <Scales className="size-3" />
              <span>Accrued ERISA Penalty</span>
            </div>
            <div className="text-sm font-mono font-bold text-amber-400 mt-0.5">
              {formatCurrency(erisaResult.data.accruedPenaltyAmount)}
            </div>
            <div className="text-[10px] text-muted-foreground font-mono truncate">
              {erisaResult.data.daysInDefault} days @ $110/day
            </div>
          </div>
        </div>

        {errorMessage && (
          <div className="mt-3 p-2.5 rounded-lg bg-destructive/15 border border-destructive/30 text-destructive text-xs font-mono flex items-center gap-2">
            <WarningCircle className="size-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}
      </Card>

      {/* Main Tab Navigation */}
      <div className="flex items-center gap-1.5 border-b border-border/50 pb-1">
        <button
          onClick={() => setActiveTab("patient_liability")}
          className={cn(
            "flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-medium transition-all cursor-pointer",
            activeTab === "patient_liability"
              ? "bg-primary text-primary-foreground shadow-xs font-semibold"
              : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
          )}
        >
          <Coins className="size-4" />
          <span>Patient Liability & Plan Maximums</span>
        </button>

        <button
          onClick={() => setActiveTab("erisa_penalties")}
          className={cn(
            "flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-medium transition-all cursor-pointer",
            activeTab === "erisa_penalties"
              ? "bg-primary text-primary-foreground shadow-xs font-semibold"
              : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
          )}
        >
          <Scales className="size-4" />
          <span>Statutory ERISA § 502(c) Penalties</span>
          {erisaResult.data.daysInDefault > 0 && (
            <Badge variant="destructive" className="h-4 px-1 text-[9px] font-mono">
              {erisaResult.data.daysInDefault}d Default
            </Badge>
          )}
        </button>

        <button
          onClick={() => setActiveTab("balance_sheet")}
          className={cn(
            "flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-medium transition-all cursor-pointer",
            activeTab === "balance_sheet"
              ? "bg-primary text-primary-foreground shadow-xs font-semibold"
              : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
          )}
        >
          <Receipt className="size-4" />
          <span>Legal-Financial Balance Sheet</span>
        </button>
      </div>

      {/* TAB 1: PATIENT FINANCIAL LIABILITY & PLAN MAXIMUMS */}
      {activeTab === "patient_liability" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Left Parameter Panel (5 cols) */}
          <div className="lg:col-span-5 space-y-4">
            <Card className="p-4 space-y-3.5 bg-card/70 border-border/60 backdrop-blur-md">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Coins className="size-4 text-cyan-400" />
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-foreground font-mono">
                    Insurance Plan Parameters
                  </h3>
                </div>
                <Badge variant="outline" className="text-[10px] font-mono">
                  Customizable
                </Badge>
              </div>

              {/* Billed Amount & Contractual Discount */}
              <div className="grid grid-cols-2 gap-2.5">
                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-muted-foreground">Billed Charges ($)</label>
                  <Input
                    type="number"
                    value={financialInputs.billedAmount ?? ""}
                    onChange={(e) => updateFinancialField("billedAmount", parseFloat(e.target.value) || 0)}
                    className="h-8 font-mono text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-muted-foreground">Contractual Discount ($)</label>
                  <Input
                    type="number"
                    value={financialInputs.contractualDiscount ?? ""}
                    onChange={(e) => updateFinancialField("contractualDiscount", parseFloat(e.target.value) || 0)}
                    className="h-8 font-mono text-xs"
                  />
                </div>
              </div>

              {/* Plan Allowed Amount */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-medium text-muted-foreground">Plan Allowed Amount ($)</span>
                  <span className="text-[10px] font-mono text-cyan-400">Baseline for cost-sharing</span>
                </div>
                <Input
                  type="number"
                  value={financialInputs.allowedAmount ?? ""}
                  onChange={(e) => updateFinancialField("allowedAmount", parseFloat(e.target.value) || 0)}
                  className="h-8 font-mono text-xs"
                />
              </div>

              {/* Deductible (Total vs Met) */}
              <div className="grid grid-cols-2 gap-2.5">
                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-muted-foreground">Annual Deductible ($)</label>
                  <Input
                    type="number"
                    value={financialInputs.deductibleTotal ?? ""}
                    onChange={(e) => updateFinancialField("deductibleTotal", parseFloat(e.target.value) || 0)}
                    className="h-8 font-mono text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-muted-foreground">Prior Deductible Met ($)</label>
                  <Input
                    type="number"
                    value={financialInputs.deductibleMet ?? ""}
                    onChange={(e) => updateFinancialField("deductibleMet", parseFloat(e.target.value) || 0)}
                    className="h-8 font-mono text-xs"
                  />
                </div>
              </div>

              {/* Co-insurance Rate & Copay */}
              <div className="grid grid-cols-2 gap-2.5">
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-medium text-muted-foreground">Co-insurance (%)</span>
                    <span className="font-mono text-cyan-400">{financialInputs.coinsuranceRate}%</span>
                  </div>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={financialInputs.coinsuranceRate ?? ""}
                    onChange={(e) => updateFinancialField("coinsuranceRate", parseFloat(e.target.value) || 0)}
                    className="h-8 font-mono text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-muted-foreground">Specialist Co-pay ($)</label>
                  <Input
                    type="number"
                    value={financialInputs.copayAmount ?? ""}
                    onChange={(e) => updateFinancialField("copayAmount", parseFloat(e.target.value) || 0)}
                    className="h-8 font-mono text-xs"
                  />
                </div>
              </div>

              {/* Out-Of-Pocket Max (Total vs Spent) */}
              <div className="grid grid-cols-2 gap-2.5">
                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-muted-foreground">Annual OOP Max ($)</label>
                  <Input
                    type="number"
                    value={financialInputs.outOfPocketMax ?? ""}
                    onChange={(e) => updateFinancialField("outOfPocketMax", parseFloat(e.target.value) || 0)}
                    className="h-8 font-mono text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-muted-foreground">Prior OOP Spent ($)</label>
                  <Input
                    type="number"
                    value={financialInputs.outOfPocketSpent ?? ""}
                    onChange={(e) => updateFinancialField("outOfPocketSpent", parseFloat(e.target.value) || 0)}
                    className="h-8 font-mono text-xs"
                  />
                </div>
              </div>

              {/* Network Status & Balance Billing Protections */}
              <div className="space-y-2.5 pt-2 border-t border-border/40">
                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-muted-foreground">Network Participation Status</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => updateFinancialField("networkStatus", "in_network")}
                      className={cn(
                        "h-8 px-2.5 rounded-md text-xs font-medium border flex items-center justify-center gap-1.5 transition-all cursor-pointer",
                        financialInputs.networkStatus === "in_network"
                          ? "bg-primary/15 border-primary text-primary font-semibold"
                          : "border-border/60 hover:bg-muted/40 text-muted-foreground"
                      )}
                    >
                      <ShieldCheck className="size-3.5" />
                      <span>In-Network (PPO)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => updateFinancialField("networkStatus", "out_of_network")}
                      className={cn(
                        "h-8 px-2.5 rounded-md text-xs font-medium border flex items-center justify-center gap-1.5 transition-all cursor-pointer",
                        financialInputs.networkStatus === "out_of_network"
                          ? "bg-amber-500/15 border-amber-500 text-amber-400 font-semibold"
                          : "border-border/60 hover:bg-muted/40 text-muted-foreground"
                      )}
                    >
                      <ShieldWarning className="size-3.5" />
                      <span>Out-of-Network</span>
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between p-2.5 rounded-lg bg-background/50 border border-border/40">
                  <div className="space-y-0.5">
                    <div className="text-xs font-medium text-foreground flex items-center gap-1.5">
                      <ShieldCheck className="size-3.5 text-emerald-400" />
                      <span>No Surprises Act (NSA) Protection</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      Prohibits surprise out-of-network balance billing (45 CFR § 149.410)
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={financialInputs.noSurprisesActProtected ?? true}
                    onChange={(e) => updateFinancialField("noSurprisesActProtected", e.target.checked)}
                    className="size-4 accent-primary rounded cursor-pointer"
                  />
                </div>
              </div>
            </Card>
          </div>

          {/* Right Live Results & Itemized Schedule (7 cols) */}
          <div className="lg:col-span-7 space-y-4">
            {/* Net Comparison Hero Card */}
            <Card className="p-4 bg-card/75 border-border/60 backdrop-blur-md">
              <div className="flex items-center justify-between pb-3 border-b border-border/40">
                <div className="flex items-center gap-2">
                  <TrendUp className="size-4 text-emerald-400" />
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-foreground font-mono">
                    Patient Liability & Recovery Analysis
                  </h3>
                </div>
                <Badge variant={liabilityResult.isOopMaxReached ? "success" : "outline"} className="text-[10px] font-mono">
                  {liabilityResult.isOopMaxReached ? "OOP Cap Protection Active" : "Under Annual OOP Cap"}
                </Badge>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 my-4">
                {/* Denied Liability */}
                <div className="p-3 rounded-xl bg-rose-950/20 border border-rose-500/30 flex flex-col justify-between">
                  <span className="text-[10px] font-mono uppercase text-rose-400/80">If Denial Upheld</span>
                  <div className="my-1.5">
                    <span className="text-lg font-mono font-bold text-rose-400">
                      {formatCurrency(liabilityResult.totalPatientExposureDenied)}
                    </span>
                  </div>
                  <span className="text-[10px] text-muted-foreground font-mono">100% Patient Exposure</span>
                </div>

                {/* Overturned Liability */}
                <div className="p-3 rounded-xl bg-cyan-950/20 border border-cyan-500/30 flex flex-col justify-between">
                  <span className="text-[10px] font-mono uppercase text-cyan-400/80">If Appeal Won</span>
                  <div className="my-1.5">
                    <span className="text-lg font-mono font-bold text-cyan-300">
                      {formatCurrency(liabilityResult.totalPatientLiabilityOverturned)}
                    </span>
                  </div>
                  <span className="text-[10px] text-muted-foreground font-mono">Cost-Sharing Only</span>
                </div>

                {/* Net Patient Recovery */}
                <div className="p-3 rounded-xl bg-emerald-950/30 border border-emerald-500/40 flex flex-col justify-between shadow-xs">
                  <span className="text-[10px] font-mono uppercase text-emerald-400 font-semibold">Net Patient Recovery</span>
                  <div className="my-1.5">
                    <span className="text-xl font-mono font-black text-emerald-400">
                      {formatCurrency(liabilityResult.netPatientSavings)}
                    </span>
                  </div>
                  <span className="text-[10px] text-emerald-400/90 font-mono font-medium">Relief from Claim Overturn</span>
                </div>
              </div>

              {/* Annual OOP Max Accumulation Gauge */}
              <div className="space-y-1.5 pt-2 border-t border-border/40">
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="text-muted-foreground">Annual Out-of-Pocket Max Accumulation:</span>
                  <span className="text-foreground font-semibold">
                    {formatCurrency(financialInputs.outOfPocketSpent! + liabilityResult.coveredPatientShare)} /{" "}
                    {formatCurrency(financialInputs.outOfPocketMax!)}
                  </span>
                </div>
                <Progress
                  value={Math.min(
                    100,
                    Math.round(
                      ((financialInputs.outOfPocketSpent! + liabilityResult.coveredPatientShare) /
                        (financialInputs.outOfPocketMax! || 1)) *
                        100
                    )
                  )}
                  className="h-2 bg-muted/60"
                />
                <div className="flex items-center justify-between text-[10px] text-muted-foreground font-mono">
                  <span>Prior Spent: {formatCurrency(financialInputs.outOfPocketSpent!)}</span>
                  <span>
                    Remaining Capacity: {formatCurrency(liabilityResult.remainingOopCapacity)}
                  </span>
                </div>
              </div>
            </Card>

            {/* Line-by-Line Itemized Schedule Table */}
            <Card className="p-4 bg-card/75 border-border/60 backdrop-blur-md">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Receipt className="size-4 text-cyan-400" />
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-foreground font-mono">
                    Itemized Cost-Sharing & Adjudication Schedule
                  </h3>
                </div>
                <Badge variant="outline" className="font-mono text-[10px]">
                  CMS-1500 Reconciliation
                </Badge>
              </div>

              <div className="rounded-lg border border-border/50 overflow-hidden">
                <Table>
                  <TableHeader className="bg-muted/40">
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="text-[11px] font-mono py-2">Line Item</TableHead>
                      <TableHead className="text-[11px] font-mono py-2 text-right">Denied State</TableHead>
                      <TableHead className="text-[11px] font-mono py-2 text-right">Overturned State</TableHead>
                      <TableHead className="text-[11px] font-mono py-2 text-right">Variance</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {liabilityResult.schedule.map((item) => (
                      <TableRow
                        key={item.id}
                        className={cn(
                          "hover:bg-muted/30 text-xs font-mono",
                          item.type === "total" && "bg-muted/50 font-bold border-t-2 border-border"
                        )}
                      >
                        <TableCell className="py-2">
                          <div className="font-medium text-foreground">{item.label}</div>
                          <div className="text-[10px] text-muted-foreground font-sans truncate max-w-xs">
                            {item.description}
                          </div>
                        </TableCell>
                        <TableCell className="py-2 text-right text-rose-400">
                          {formatCurrency(item.deniedAmount)}
                        </TableCell>
                        <TableCell className="py-2 text-right text-cyan-300">
                          {formatCurrency(item.overturnedAmount)}
                        </TableCell>
                        <TableCell
                          className={cn(
                            "py-2 text-right font-semibold",
                            item.variance < 0
                              ? "text-emerald-400"
                              : item.variance > 0
                              ? "text-cyan-400"
                              : "text-muted-foreground"
                          )}
                        >
                          {item.variance < 0
                            ? `-${formatCurrency(Math.abs(item.variance))}`
                            : item.variance > 0
                            ? `+${formatCurrency(item.variance)}`
                            : "$0.00"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* TAB 2: STATUTORY ERISA § 502(c) FAILURE-TO-DISCLOSE PENALTIES */}
      {activeTab === "erisa_penalties" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Left Parameter Panel (5 cols) */}
          <div className="lg:col-span-5 space-y-4">
            <Card className="p-4 space-y-3.5 bg-card/70 border-border/60 backdrop-blur-md">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Scales className="size-4 text-amber-400" />
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-foreground font-mono">
                    Statutory ERISA Parameters
                  </h3>
                </div>
                <Badge variant={severityMeta.badgeVariant} className="text-[10px] font-mono">
                  {severityMeta.label}
                </Badge>
              </div>

              {/* Document Request Date & Calculation Date */}
              <div className="grid grid-cols-2 gap-2.5">
                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-muted-foreground">Document Request Date</label>
                  <Input
                    type="date"
                    value={erisaInputs.documentRequestDate ?? ""}
                    onChange={(e) => updateErisaField("documentRequestDate", e.target.value)}
                    className="h-8 font-mono text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-muted-foreground">Audit / Calc Date</label>
                  <Input
                    type="date"
                    value={erisaInputs.calculationDate ?? ""}
                    onChange={(e) => updateErisaField("calculationDate", e.target.value)}
                    className="h-8 font-mono text-xs"
                  />
                </div>
              </div>

              {/* Statutory Daily Rate & Interest Rate */}
              <div className="grid grid-cols-2 gap-2.5">
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-medium text-muted-foreground">Daily Statutory Rate</span>
                    <span className="font-mono text-amber-400">29 CFR § 2575</span>
                  </div>
                  <Input
                    type="number"
                    value={erisaInputs.dailyPenaltyRate ?? 110}
                    onChange={(e) => updateErisaField("dailyPenaltyRate", parseFloat(e.target.value) || 110)}
                    className="h-8 font-mono text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-medium text-muted-foreground">Prompt-Pay Interest (%)</span>
                    <span className="font-mono text-cyan-400">Annual</span>
                  </div>
                  <Input
                    type="number"
                    value={erisaInputs.statutoryInterestRate ?? 18}
                    onChange={(e) => updateErisaField("statutoryInterestRate", parseFloat(e.target.value) || 0)}
                    className="h-8 font-mono text-xs"
                  />
                </div>
              </div>

              {/* Compliance Status */}
              <div className="space-y-1">
                <label className="text-[11px] font-medium text-muted-foreground">Plan Administrator Compliance State</label>
                <div className="grid grid-cols-3 gap-1.5">
                  {(["defaulted", "partial", "compliant"] as StatutoryComplianceStatus[]).map((status) => (
                    <button
                      key={status}
                      type="button"
                      onClick={() => updateErisaField("complianceStatus", status)}
                      className={cn(
                        "h-8 px-2 rounded-md text-xs font-mono capitalize border transition-all cursor-pointer",
                        erisaInputs.complianceStatus === status
                          ? status === "defaulted"
                            ? "bg-rose-950/40 border-rose-500 text-rose-400 font-bold"
                            : status === "partial"
                            ? "bg-amber-950/40 border-amber-500 text-amber-400 font-bold"
                            : "bg-emerald-950/40 border-emerald-500 text-emerald-400 font-bold"
                          : "border-border/60 hover:bg-muted/40 text-muted-foreground"
                      )}
                    >
                      {status}
                    </button>
                  ))}
                </div>
              </div>

              {/* Statutory Disclosure Timeline Breakdown */}
              <div className="p-3 rounded-lg bg-background/50 border border-border/40 space-y-2 text-xs font-mono">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">30-Day Disclosure Deadline:</span>
                  <span className="text-foreground font-semibold">{erisaResult.data.disclosureDeadlineDate}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Days Elapsed Since Request:</span>
                  <span className="text-foreground">{erisaResult.daysElapsedSinceRequest} days</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Days in Statutory Default:</span>
                  <span className={cn("font-bold", erisaResult.data.daysInDefault > 0 ? "text-rose-400" : "text-emerald-400")}>
                    {erisaResult.data.daysInDefault} calendar days
                  </span>
                </div>
              </div>

              {/* Requested Documents Checkbox List */}
              <div className="space-y-1.5 pt-2 border-t border-border/40">
                <label className="text-[11px] font-medium text-muted-foreground">
                  Statutory Records Requested (29 CFR § 2560.503-1(h)(2)(iii))
                </label>
                <div className="space-y-1 max-h-44 overflow-y-auto pr-1">
                  {erisaResult.data.requestedDocuments.map((doc, idx) => (
                    <div key={idx} className="flex items-start gap-2 p-1.5 rounded bg-background/40 border border-border/30 text-[11px]">
                      <CheckCircle className="size-3.5 text-cyan-400 shrink-0 mt-0.5" />
                      <span className="text-foreground/90 font-mono leading-tight">{doc}</span>
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          </div>

          {/* Right Exposure Panel & Formal Statutory Demand (7 cols) */}
          <div className="lg:col-span-7 space-y-4">
            {/* Statutory Exposure Summary Card */}
            <Card className="p-4 bg-card/75 border-border/60 backdrop-blur-md space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-border/40">
                <div className="flex items-center gap-2">
                  <Scales className="size-4 text-amber-400" />
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-foreground font-mono">
                    Plan Administrator Statutory Penalty Assessment
                  </h3>
                </div>
                <Badge variant="outline" className="font-mono text-[10px] text-amber-400 border-amber-500/30">
                  29 U.S.C. § 1132(c)(1)
                </Badge>
              </div>

              {/* 4-Stat Metric Box */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div className="p-3 rounded-lg bg-background/50 border border-border/40">
                  <div className="text-[10px] font-mono uppercase text-muted-foreground">Days in Default</div>
                  <div className="text-base font-mono font-bold text-rose-400 mt-1">
                    {erisaResult.data.daysInDefault} days
                  </div>
                  <div className="text-[9px] text-muted-foreground font-mono">
                    Past 30-day grace
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-background/50 border border-border/40">
                  <div className="text-[10px] font-mono uppercase text-muted-foreground">Accrued Penalties</div>
                  <div className="text-base font-mono font-bold text-amber-400 mt-1">
                    {formatCurrency(erisaResult.data.accruedPenaltyAmount)}
                  </div>
                  <div className="text-[9px] text-muted-foreground font-mono">
                    $110.00 / day rate
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-background/50 border border-border/40">
                  <div className="text-[10px] font-mono uppercase text-muted-foreground">Prompt-Pay Interest</div>
                  <div className="text-base font-mono font-bold text-cyan-400 mt-1">
                    {formatCurrency(erisaResult.data.accruedInterestAmount)}
                  </div>
                  <div className="text-[9px] text-muted-foreground font-mono">
                    {erisaResult.data.statutoryInterestRate}% p.a.
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-background/50 border border-border/40">
                  <div className="text-[10px] font-mono uppercase text-muted-foreground">Lodestar Legal Fees</div>
                  <div className="text-base font-mono font-bold text-emerald-400 mt-1">
                    {formatCurrency(erisaResult.data.estimatedAttorneysFees)}
                  </div>
                  <div className="text-[9px] text-muted-foreground font-mono">
                    ERISA § 502(g)(1)
                  </div>
                </div>
              </div>

              {/* Total Plan Administrator Exposure Hero Pill */}
              <div className="p-3.5 rounded-xl bg-gradient-to-r from-amber-950/40 via-background to-rose-950/40 border border-amber-500/40 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <div className="text-[11px] font-mono uppercase tracking-wider text-amber-400 font-bold">
                    Total Plan Administrator Statutory Exposure
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Principal claim + accrued § 502(c) daily penalties + interest + attorney fee shifting
                  </div>
                </div>
                <div className="text-2xl font-mono font-black text-amber-300">
                  {formatCurrency(erisaResult.data.totalPlanAdministratorExposure)}
                </div>
              </div>

              {/* 30/60/90/120 Day Trajectory Projections */}
              <div className="space-y-2 pt-2 border-t border-border/40">
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="font-semibold text-foreground">Projected Statutory Liability Trajectory</span>
                  <span className="text-[10px] text-muted-foreground">Compounding daily default</span>
                </div>
                <div className="rounded-lg border border-border/50 overflow-hidden">
                  <Table>
                    <TableHeader className="bg-muted/40">
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="text-[10px] font-mono py-1.5">Horizon</TableHead>
                        <TableHead className="text-[10px] font-mono py-1.5">Future Date</TableHead>
                        <TableHead className="text-[10px] font-mono py-1.5 text-right">Default Days</TableHead>
                        <TableHead className="text-[10px] font-mono py-1.5 text-right">Penalties</TableHead>
                        <TableHead className="text-[10px] font-mono py-1.5 text-right">Total Exposure</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {erisaResult.trajectories.map((traj) => (
                        <TableRow key={traj.horizonDays} className="hover:bg-muted/30 text-[11px] font-mono">
                          <TableCell className="py-1.5 font-semibold text-foreground">+{traj.horizonDays} Days</TableCell>
                          <TableCell className="py-1.5 text-muted-foreground">{traj.futureDate}</TableCell>
                          <TableCell className="py-1.5 text-right text-rose-400">{traj.projectedDaysInDefault}d</TableCell>
                          <TableCell className="py-1.5 text-right text-amber-400">{formatCurrency(traj.projectedPenalties)}</TableCell>
                          <TableCell className="py-1.5 text-right font-bold text-foreground">
                            {formatCurrency(traj.projectedTotalExposure)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </Card>

            {/* Formal Notice of Default & Statutory Demand Statement */}
            <Card className="p-4 bg-card/75 border-border/60 backdrop-blur-md space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileText className="size-4 text-cyan-400" />
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-foreground font-mono">
                    Statutory Notice of Default & Demand Language
                  </h3>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCopyDemand}
                  className="gap-1.5 text-xs font-mono h-7"
                >
                  {copiedDemand ? <Check className="size-3 text-emerald-400" /> : <Copy className="size-3" />}
                  <span>{copiedDemand ? "Copied Demand" : "Copy Demand"}</span>
                </Button>
              </div>

              <div className="p-3 rounded-lg bg-background/80 border border-border/60 font-mono text-[11px] text-foreground/90 whitespace-pre-wrap leading-relaxed max-h-60 overflow-y-auto select-text">
                {erisaResult.noticeOfDefaultText}
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* TAB 3: LEGAL-FINANCIAL BALANCE SHEET & EXECUTIVE SUMMARY */}
      {activeTab === "balance_sheet" && (
        <Card className="p-6 bg-card/75 border-border/60 backdrop-blur-md space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between pb-4 border-b border-border/50 gap-3">
            <div>
              <div className="flex items-center gap-2">
                <Receipt className="size-5 text-primary" />
                <h2 className="text-base font-bold text-foreground">
                  Comprehensive Legal-Financial Recovery Balance Sheet
                </h2>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Executive settlement cross-walk combining patient cost-sharing relief and insurer statutory default exposure
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleCopySummary}
                className="gap-1.5 text-xs font-mono"
              >
                {copiedSummary ? <Check className="size-3.5 text-emerald-400" /> : <Copy className="size-3.5" />}
                <span>{copiedSummary ? "Copied Balance Sheet" : "Copy Balance Sheet"}</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsPrintModalOpen(true)}
                className="gap-1.5 text-xs font-mono"
              >
                <Printer className="size-3.5" />
                <span>Print Statement</span>
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Column 1: Patient Financial Exposure */}
            <div className="p-4 rounded-xl bg-background/50 border border-border/60 space-y-3.5">
              <div className="flex items-center justify-between pb-2 border-b border-border/40">
                <span className="text-xs font-mono font-bold uppercase text-cyan-400 flex items-center gap-1.5">
                  <Coins className="size-4" />
                  <span>Patient Financial Recovery Matrix</span>
                </span>
                <Badge variant="outline" className="text-[10px] font-mono">
                  {liabilityResult.data.networkStatus === "in_network" ? "In-Network" : "Out-of-Network"}
                </Badge>
              </div>

              <div className="space-y-2 text-xs font-mono">
                <div className="flex items-center justify-between py-1 border-b border-border/30">
                  <span className="text-muted-foreground">1. Total Billed Medical Charges:</span>
                  <span className="text-foreground font-semibold">{formatCurrency(liabilityResult.data.billedAmount)}</span>
                </div>
                <div className="flex items-center justify-between py-1 border-b border-border/30">
                  <span className="text-muted-foreground">2. Contractual PPO Network Discount:</span>
                  <span className="text-muted-foreground">-{formatCurrency(liabilityResult.data.contractualDiscount)}</span>
                </div>
                <div className="flex items-center justify-between py-1 border-b border-border/30">
                  <span className="text-muted-foreground">3. Allowable Base Reimbursement:</span>
                  <span className="text-foreground font-semibold">{formatCurrency(liabilityResult.data.allowedAmount)}</span>
                </div>
                <div className="flex items-center justify-between py-1 border-b border-border/30">
                  <span className="text-muted-foreground">4. Deductible Applied:</span>
                  <span className="text-cyan-300">{formatCurrency(liabilityResult.deductibleApplied)}</span>
                </div>
                <div className="flex items-center justify-between py-1 border-b border-border/30">
                  <span className="text-muted-foreground">5. Patient Co-Insurance ({liabilityResult.data.coinsuranceRate}%):</span>
                  <span className="text-cyan-300">{formatCurrency(liabilityResult.coinsuranceOwed)}</span>
                </div>
                <div className="flex items-center justify-between py-1 border-b border-border/30">
                  <span className="text-muted-foreground">6. Specialist Co-Pay:</span>
                  <span className="text-cyan-300">{formatCurrency(liabilityResult.copayOwed)}</span>
                </div>
                <div className="flex items-center justify-between py-1 border-b border-border/30">
                  <span className="text-muted-foreground">7. Balance Billing (NSA Protected):</span>
                  <span className="text-muted-foreground">{formatCurrency(liabilityResult.balanceBillingExposure)}</span>
                </div>
                <div className="flex items-center justify-between pt-2 text-sm font-bold border-t-2 border-border">
                  <span className="text-emerald-400">NET PATIENT RECOVERY SAVINGS:</span>
                  <span className="text-emerald-400">{formatCurrency(liabilityResult.netPatientSavings)}</span>
                </div>
              </div>
            </div>

            {/* Column 2: Plan Administrator Exposure & ERISA Statutory Damages */}
            <div className="p-4 rounded-xl bg-background/50 border border-border/60 space-y-3.5">
              <div className="flex items-center justify-between pb-2 border-b border-border/40">
                <span className="text-xs font-mono font-bold uppercase text-amber-400 flex items-center gap-1.5">
                  <Scales className="size-4" />
                  <span>Plan Administrator Statutory Liability</span>
                </span>
                <Badge variant={severityMeta.badgeVariant} className="text-[10px] font-mono">
                  {severityMeta.label}
                </Badge>
              </div>

              <div className="space-y-2 text-xs font-mono">
                <div className="flex items-center justify-between py-1 border-b border-border/30">
                  <span className="text-muted-foreground">1. Principal Disputed Medical Claim:</span>
                  <span className="text-foreground font-semibold">{formatCurrency(liabilityResult.data.billedAmount)}</span>
                </div>
                <div className="flex items-center justify-between py-1 border-b border-border/30">
                  <span className="text-muted-foreground">2. Days in Statutory Non-Compliance:</span>
                  <span className="text-rose-400 font-bold">{erisaResult.data.daysInDefault} calendar days</span>
                </div>
                <div className="flex items-center justify-between py-1 border-b border-border/30">
                  <span className="text-muted-foreground">3. ERISA § 502(c) Daily Penalty ($110/d):</span>
                  <span className="text-amber-400 font-bold">{formatCurrency(erisaResult.data.accruedPenaltyAmount)}</span>
                </div>
                <div className="flex items-center justify-between py-1 border-b border-border/30">
                  <span className="text-muted-foreground">4. Statutory Prompt-Pay Interest ({erisaResult.data.statutoryInterestRate}% p.a.):</span>
                  <span className="text-cyan-400">{formatCurrency(erisaResult.data.accruedInterestAmount)}</span>
                </div>
                <div className="flex items-center justify-between py-1 border-b border-border/30">
                  <span className="text-muted-foreground">5. Mandatory Fee Shifting (ERISA § 502(g)(1)):</span>
                  <span className="text-emerald-400">{formatCurrency(erisaResult.data.estimatedAttorneysFees)}</span>
                </div>
                <div className="flex items-center justify-between py-1 border-b border-border/30">
                  <span className="text-muted-foreground">6. Statutory 30-Day Disclosure Grace:</span>
                  <span className="text-muted-foreground">{STATUTORY_DISCLOSURE_GRACE_DAYS} days</span>
                </div>
                <div className="flex items-center justify-between pt-2 text-sm font-bold border-t-2 border-border">
                  <span className="text-amber-300">TOTAL STATUTORY PLAN EXPOSURE:</span>
                  <span className="text-amber-300">{formatCurrency(erisaResult.data.totalPlanAdministratorExposure)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Strategic Settlement Leverage Banner */}
          <div className="p-4 rounded-xl bg-gradient-to-r from-cyan-950/40 via-background to-emerald-950/40 border border-primary/40 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <ShieldCheck className="size-4 text-emerald-400" />
                <h4 className="text-sm font-bold text-foreground font-mono">
                  Total Adjudication & Appellate Settlement Leverage
                </h4>
              </div>
              <p className="text-xs text-muted-foreground max-w-xl">
                By combining clinical necessity proofs with accrued ERISA failure-to-disclose penalties ($110/day), the claimant exerts maximum legal leverage to compel immediate overturn and full benefit payout.
              </p>
            </div>
            <div className="text-right shrink-0">
              <div className="text-[10px] font-mono uppercase text-muted-foreground">Total Financial & Statutory Leverage</div>
              <div className="text-2xl font-mono font-black text-emerald-400">
                {formatCurrency(liabilityResult.netPatientSavings + erisaResult.data.totalStatutoryDamages)}
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Dedicated Formal Statement Print & Legal Exhibit Export Modal */}
      <FinancialStatementModal
        isOpen={isPrintModalOpen}
        onClose={() => setIsPrintModalOpen(false)}
        claim={claim}
        liabilityResult={liabilityResult}
        erisaResult={erisaResult}
      />
    </div>
  );
};
