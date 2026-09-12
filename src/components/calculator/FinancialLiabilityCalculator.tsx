import React, { useState, useRef, useEffect } from "react";
import { Claim, StatutoryComplianceStatus } from "../../types";
import { useLiabilityCalculator } from "../../hooks/useLiabilityCalculator";
import { NavigationView } from "../layout/Sidebar";
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
  ArrowLeft,
  Envelope,
  PhoneCall,
  Sliders,
  CaretDown,
  CaretUp,
  Clock,
  Info,
  Lightning,
} from "@phosphor-icons/react";

interface FinancialLiabilityCalculatorProps {
  claim?: Claim | null;
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

  // 2-Mode Architecture: "savings" (Patient Bill & Savings) vs "penalties" (ERISA $110/Day Sentinel)
  const [activeMode, setActiveMode] = useState<"savings" | "penalties">("savings");
  const [isPlanAdjustOpen, setIsPlanAdjustOpen] = useState<boolean>(false);
  const [isErisaAdjustOpen, setIsErisaAdjustOpen] = useState<boolean>(false);
  const [copiedDemand, setCopiedDemand] = useState<boolean>(false);
  const [copiedSummary, setCopiedSummary] = useState<boolean>(false);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState<boolean>(false);
  const [copyError, setCopyError] = useState<string | null>(null);
  const copyTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current !== null) {
        window.clearTimeout(copyTimeoutRef.current);
      }
    };
  }, []);

  const scheduleCopiedReset = (reset: () => void) => {
    if (copyTimeoutRef.current !== null) {
      window.clearTimeout(copyTimeoutRef.current);
    }
    copyTimeoutRef.current = window.setTimeout(reset, 2500);
  };

  const copyTextToClipboard = async (text: string): Promise<boolean> => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
      // Fallback for insecure contexts / older browsers
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "absolute";
      textarea.style.left = "-9999px";
      document.body.appendChild(textarea);
      textarea.select();
      const succeeded = document.execCommand("copy");
      document.body.removeChild(textarea);
      return succeeded;
    } catch {
      return false;
    }
  };

  if (!claim) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] p-8 text-center border border-dashed border-border/70 rounded-xl bg-card/30">
        <Scales className="size-10 text-muted-foreground mb-3" />
        <h3 className="text-base font-semibold text-foreground">No Case Dossier Selected</h3>
        <p className="text-xs text-muted-foreground mt-1 max-w-sm leading-relaxed">
          Select an active denial case from the Case Radar or sidebar to audit financial liability and compute statutory ERISA penalties.
        </p>
        {onNavigateView && (
          <Button
            onClick={() => onNavigateView("radar")}
            variant="outline"
            size="sm"
            className="mt-4 text-xs cursor-pointer"
          >
            Open Case Radar
          </Button>
        )}
      </div>
    );
  }

  const severityMeta = getSeverityTierMeta(erisaResult.data.severityTier);
  const dailyPenaltyRate = erisaResult.data.dailyPenaltyRate ?? 110;

  const handleCopyDemand = async () => {
    const ok = await copyTextToClipboard(erisaResult.noticeOfDefaultText);
    if (ok) {
      setCopyError(null);
      setCopiedDemand(true);
      scheduleCopiedReset(() => setCopiedDemand(false));
    } else {
      setCopyError("Clipboard copy failed. Select the demand text manually to copy.");
    }
  };

  const handleCopySummary = async () => {
    const summaryText = `# FINANCIAL RECOVERY & STATUTORY ERISA PENALTY AUDIT REPORT
Claim Reference: ${claim.claimNumber}
Patient: ${claim.patient?.name || "Insured Claimant"} (Member ID: ${claim.patient?.memberId || "N/A"})
Insurer / Health Plan: ${claim.patient?.insurancePayer || "Health Plan"}
Date of Service: ${claim.serviceDate}

---
## 1. PATIENT OUT-OF-POCKET FINANCIAL RECOVERY
- Total Billed Medical Charges: ${formatCurrency(liabilityResult.data.billedAmount)}
- In-Network Contractual Discount: -${formatCurrency(liabilityResult.data.contractualDiscount)}
- Plan Allowed Base Reimbursement: ${formatCurrency(liabilityResult.data.allowedAmount)}
- Patient Deductible Applied: ${formatCurrency(liabilityResult.deductibleApplied)}
- Patient Co-Insurance (${liabilityResult.data.coinsuranceRate}%): ${formatCurrency(liabilityResult.coinsuranceOwed)}
- Office / Specialist Co-Pay: ${formatCurrency(liabilityResult.copayOwed)}
- Surprise Out-of-Network Balance: ${formatCurrency(liabilityResult.balanceBillingExposure)} (${liabilityResult.data.noSurprisesActProtected ? "Protected by No Surprises Act" : "Exposed"})
-------------------------------------------------------------
* Total Patient Responsibility (If Denied): ${formatCurrency(liabilityResult.totalPatientExposureDenied)}
* Total Patient Responsibility (If Overturned): ${formatCurrency(liabilityResult.totalPatientLiabilityOverturned)}
* NET PATIENT RECOVERY SAVINGS: ${formatCurrency(liabilityResult.netPatientSavings)}
* Insurer Reimbursement Obligation: ${formatCurrency(liabilityResult.payerExpectedObligation)}

---
## 2. STATUTORY ERISA § 502(c) FAILURE-TO-DISCLOSE PENALTIES
Statutory Authority: 29 U.S.C. § 1132(c)(1)(B) | 29 C.F.R. § 2560.503-1(h)(2)(iii) | 29 C.F.R. § 2575.502c-1
- Written Records Request Date: ${erisaResult.data.documentRequestDate}
- 30-Day Mandatory Deadline: ${erisaResult.data.disclosureDeadlineDate}
- Days in Statutory Default: ${erisaResult.data.daysInDefault} calendar days
- Daily Statutory Penalty Rate: $${erisaResult.data.dailyPenaltyRate.toFixed(2)} / calendar day
- Total Accrued Statutory Penalties: ${formatCurrency(erisaResult.data.accruedPenaltyAmount)}
- Accrued Prompt-Pay Interest (${erisaResult.data.statutoryInterestRate}% p.a.): ${formatCurrency(erisaResult.data.accruedInterestAmount)}
- Lodestar Mandatory Legal Fees: ${formatCurrency(erisaResult.data.estimatedAttorneysFees)}
-------------------------------------------------------------
* TOTAL PLAN ADMINISTRATOR STATUTORY EXPOSURE: ${formatCurrency(erisaResult.data.totalPlanAdministratorExposure)}
* Compliance Status: ${severityMeta.label}
* Total Settlement Leverage: ${formatCurrency(liabilityResult.netPatientSavings + erisaResult.data.totalStatutoryDamages)}`;

    const ok = await copyTextToClipboard(summaryText);
    if (ok) {
      setCopyError(null);
      setCopiedSummary(true);
      scheduleCopiedReset(() => setCopiedSummary(false));
    } else {
      setCopyError("Clipboard copy failed. Select the summary text manually to copy.");
    }
  };

  const handleEmbedInBrief = async () => {
    const saved = await saveToClaim();
    if (saved) {
      onNavigateView?.("studio");
    }
  };

  return (
    <div className="space-y-4 animate-fadeIn font-sans pb-12">
      {/* 1. Case Context Header Bar */}
      <div className="rounded-xl border border-border bg-card/70 backdrop-blur-sm p-3 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 no-print">
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          <Button
            variant="ghost"
            size="xs"
            onClick={() => onNavigateView?.("studio")}
            className="gap-1.5 text-xs text-muted-foreground hover:text-foreground h-7 px-2.5 cursor-pointer"
            title="Return to Appeal Brief (Step 2)"
          >
            <ArrowLeft className="size-3" />
            <span>Appeal Brief</span>
          </Button>

          <div className="h-4 w-px bg-border shrink-0" />

          <div className="flex items-center gap-2 min-w-0">
            <span className="font-semibold text-xs text-foreground truncate">
              {claim.patient?.name || "Patient Record"}
            </span>
            <Badge variant="outline" className="font-mono text-[10px] shrink-0">
              {claim.patient?.insurancePayer || "Insurer"}
            </Badge>
            <span className="text-[11px] font-mono text-muted-foreground hidden md:inline">
              #{claim.claimNumber}
            </span>
            <span className="text-[11px] font-mono text-primary font-medium">
              {formatCurrency(claim.deniedAmount ?? 0)}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          <Badge
            variant="outline"
            className="text-[10px] font-mono border-amber-500/30 text-amber-400 bg-amber-500/10 gap-1 h-6 px-2"
          >
            <Scales className="size-3" />
            <span>ERISA § 502(c) Sentinel</span>
          </Badge>

          <Button
            variant="ghost"
            size="xs"
            onClick={() => onNavigateView?.("p2p")}
            className="text-xs text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 h-7 px-2 gap-1 cursor-pointer"
            title="Switch to Doctor P2P Copilot"
          >
            <PhoneCall className="size-3" />
            <span className="hidden sm:inline">P2P Copilot</span>
          </Button>

          <Button
            variant="ghost"
            size="xs"
            onClick={() => onNavigateView?.("communications")}
            className="text-xs text-muted-foreground hover:text-foreground h-7 px-2 gap-1 cursor-pointer"
            title="Jump to Payer Dispatch"
          >
            <Envelope className="size-3" />
            <span className="hidden sm:inline">Dispatch</span>
          </Button>
        </div>
      </div>

      {/* 2. Top Executive Action Card */}
      <Card className="p-4 shrink-0 overflow-visible no-print bg-card/85 border-border/80 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3.5">
          {/* Left: Summary Title & Subtitle */}
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground shrink-0 shadow-xs">
              <Calculator className="size-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base font-bold text-foreground tracking-tight">
                  Financial Recovery & Statutory Leverage Audit
                </h2>
                {isSaving && (
                  <span className="flex items-center gap-1 text-[11px] font-mono text-muted-foreground animate-pulse">
                    <CircleNotch className="size-3 animate-spin" />
                    <span>Saving...</span>
                  </span>
                )}
                {saveSuccess && (
                  <span className="flex items-center gap-1 text-[11px] font-mono text-emerald-400">
                    <Check className="size-3" />
                    <span>Saved to Case</span>
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                Audit how much you will save when this denial is overturned, and track statutory ERISA penalties (${dailyPenaltyRate.toFixed(0)}/day) against the insurer.
              </p>
            </div>
          </div>

          {/* Right: Actions Toolbar */}
          <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopySummary}
              className="h-8 rounded-md px-2.5 text-xs gap-1.5 shrink-0 border-border/70 cursor-pointer"
              title="Copy audit summary to clipboard"
            >
              {copiedSummary ? (
                <Check className="size-3.5 text-emerald-400" />
              ) : (
                <Copy className="size-3.5" />
              )}
              <span>{copiedSummary ? "Copied Summary" : "Copy Summary"}</span>
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsPrintModalOpen(true)}
              className="h-8 rounded-md px-2.5 text-xs gap-1.5 shrink-0 border-border/70 text-foreground cursor-pointer"
              title="Inspect and print full legal exhibit statement"
            >
              <Printer className="size-3.5" />
              <span>Print Exhibit</span>
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={saveToClaim}
              disabled={isSaving}
              className="h-8 rounded-md px-2.5 text-xs gap-1.5 shrink-0 border-border/70 cursor-pointer"
            >
              {isSaving ? (
                <CircleNotch className="size-3.5 animate-spin" />
              ) : saveSuccess ? (
                <Check className="size-3.5 text-emerald-400" />
              ) : (
                <FloppyDisk className="size-3.5" />
              )}
              <span>{saveSuccess ? "Saved" : "Save Changes"}</span>
            </Button>

            <Button
              size="sm"
              onClick={handleEmbedInBrief}
              disabled={isSaving}
              className="h-8 rounded-md text-xs px-3.5 gap-1.5 shrink-0 bg-primary text-primary-foreground font-semibold shadow-xs cursor-pointer hover:bg-primary/90"
              title="Save calculations and return to Appeal Studio to embed statutory citations in your brief"
            >
              <FileText className="size-3.5" />
              <span>Embed in Brief</span>
              <ArrowRight className="size-3" />
            </Button>
          </div>
        </div>

        {/* Executive 4-Stat Metric Ribbon */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4 pt-3.5 border-t border-border/50">
          <div className="p-3 rounded-lg bg-background/50 border border-border/40">
            <div className="text-[10px] uppercase font-mono text-muted-foreground flex items-center gap-1">
              <CurrencyDollar className="size-3 text-cyan-400" />
              <span>Total Medical Bill</span>
            </div>
            <div className="text-base font-mono font-bold text-foreground mt-1">
              {formatCurrency(liabilityResult.data.billedAmount)}
            </div>
            <div className="text-[10px] text-muted-foreground truncate">
              {claim.patient?.insurancePayer || "Payer"}{claim.cptCodes?.[0] ? ` • CPT ${claim.cptCodes[0]}` : ""}
            </div>
          </div>

          <div className="p-3 rounded-lg bg-background/50 border border-border/40">
            <div className="text-[10px] uppercase font-mono text-rose-400/90 flex items-center gap-1">
              <Receipt className="size-3 text-rose-400" />
              <span>You Owe If Denied</span>
            </div>
            <div className="text-base font-mono font-bold text-rose-400 mt-1">
              {formatCurrency(liabilityResult.totalPatientExposureDenied)}
            </div>
            <div className="text-[10px] text-muted-foreground truncate">
              Without overturning denial
            </div>
          </div>

          <div className="p-3 rounded-lg bg-emerald-950/20 border border-emerald-500/30">
            <div className="text-[10px] uppercase font-mono text-emerald-400 flex items-center gap-1 font-semibold">
              <TrendUp className="size-3" />
              <span>You Save If Won</span>
            </div>
            <div className="text-base font-mono font-black text-emerald-400 mt-1">
              {formatCurrency(liabilityResult.netPatientSavings)}
            </div>
            <div className="text-[10px] text-emerald-400/80 truncate">
              Relief from overturned claim
            </div>
          </div>

          <div className="p-3 rounded-lg bg-amber-950/20 border border-amber-500/30">
            <div className="text-[10px] uppercase font-mono text-amber-400 flex items-center gap-1">
              <Scales className="size-3" />
              <span>Insurer Penalty</span>
            </div>
            <div className="text-base font-mono font-bold text-amber-400 mt-1">
              {formatCurrency(erisaResult.data.accruedPenaltyAmount)}
            </div>
            <div className="text-[10px] text-muted-foreground truncate">
              {erisaResult.data.daysInDefault} days @ ${dailyPenaltyRate.toFixed(0)}/day
            </div>
          </div>
        </div>

        {(errorMessage || copyError) && (
          <div className="mt-3 p-2.5 rounded-lg bg-destructive/15 border border-destructive/30 text-destructive text-xs font-mono flex items-center gap-2">
            <WarningCircle className="size-4 shrink-0" />
            <span>{errorMessage ?? copyError}</span>
          </div>
        )}
      </Card>

      {/* 3. Focused 2-Mode Selector */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between border-b border-border/50 pb-2 gap-2">
        <div className="flex items-center gap-2 flex-wrap" role="tablist" aria-label="Financial audit modes">
          <button
            type="button"
            role="tab"
            aria-selected={activeMode === "savings"}
            aria-pressed={activeMode === "savings"}
            onClick={() => setActiveMode("savings")}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer",
              activeMode === "savings"
                ? "bg-primary text-primary-foreground shadow-xs"
                : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
            )}
          >
            <Coins className="size-4" />
            <span>1. Patient Savings & Bill Breakdown</span>
            <Badge variant="outline" className="text-[10px] font-mono border-emerald-500/30 text-emerald-400 ml-1">
              Save {formatCurrency(liabilityResult.netPatientSavings)}
            </Badge>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeMode === "penalties"}
            aria-pressed={activeMode === "penalties"}
            onClick={() => setActiveMode("penalties")}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer",
              activeMode === "penalties"
                ? "bg-primary text-primary-foreground shadow-xs"
                : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
            )}
          >
            <Scales className="size-4" />
            <span>2. Insurer Penalty Sentinel</span>
            {erisaResult.data.daysInDefault > 0 ? (
              <Badge variant="destructive" className="h-5 px-1.5 text-[9px] font-mono">
                {erisaResult.data.daysInDefault}d in Default (${dailyPenaltyRate.toFixed(0)}/d)
              </Badge>
            ) : (
              <Badge variant="outline" className="text-[10px] font-mono text-muted-foreground">
                {STATUTORY_DISCLOSURE_GRACE_DAYS}-Day Window Active
              </Badge>
            )}
          </button>
        </div>

        <div className="hidden sm:flex items-center gap-2 text-xs text-muted-foreground">
          <Info className="size-3.5 text-primary" />
          <span>Need full legal statement?</span>
          <button
            type="button"
            onClick={() => setIsPrintModalOpen(true)}
            className="text-primary hover:underline font-medium cursor-pointer"
          >
            Preview Exhibit
          </button>
        </div>
      </div>

      {/* MODE 1: PATIENT SAVINGS & BILL BREAKDOWN */}
      {activeMode === "savings" && (
        <div className="space-y-4">
          {/* Side-by-Side Comparison: Current Denied vs Overturned */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
            {/* Card 1: If Denial Stands */}
            <Card className="p-4 rounded-xl bg-rose-950/20 border border-rose-500/30 flex flex-col justify-between space-y-3">
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono uppercase text-rose-400 font-semibold tracking-wider">
                    If Denial Stands
                  </span>
                  <Badge variant="outline" className="text-[10px] border-rose-500/30 text-rose-400 font-mono">
                    Worst Case
                  </Badge>
                </div>
                <div className="text-2xl font-mono font-bold text-rose-400 pt-1">
                  {formatCurrency(liabilityResult.totalPatientExposureDenied)}
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Your total out-of-pocket responsibility if the insurer refuses to cover this claim.
                </p>
              </div>

              <div className="pt-2.5 border-t border-rose-500/20 space-y-1 text-xs font-mono">
                <div className="flex justify-between text-muted-foreground">
                  <span>Insurance Pays:</span>
                  <span className="text-rose-400 font-semibold">$0.00 (0%)</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Patient Responsibility:</span>
                  <span className="text-rose-400 font-semibold">100% of Allowed</span>
                </div>
              </div>
            </Card>

            {/* Card 2: If Appeal Succeeds */}
            <Card className="p-4 rounded-xl bg-cyan-950/20 border border-cyan-500/30 flex flex-col justify-between space-y-3">
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono uppercase text-cyan-400 font-semibold tracking-wider">
                    If Appeal Overturned
                  </span>
                  <Badge variant="outline" className="text-[10px] border-cyan-500/30 text-cyan-300 font-mono">
                    Target Goal
                  </Badge>
                </div>
                <div className="text-2xl font-mono font-bold text-cyan-300 pt-1">
                  {formatCurrency(liabilityResult.totalPatientLiabilityOverturned)}
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Your out-of-pocket obligation is reduced strictly to standard in-network cost-sharing.
                </p>
              </div>

              <div className="pt-2.5 border-t border-cyan-500/20 space-y-1 text-xs font-mono">
                <div className="flex justify-between text-muted-foreground">
                  <span>Insurance Obligation:</span>
                  <span className="text-cyan-300 font-semibold">{formatCurrency(liabilityResult.payerExpectedObligation)}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Your Cost Share:</span>
                  <span className="text-foreground font-semibold">{formatCurrency(liabilityResult.coveredPatientShare)}</span>
                </div>
              </div>
            </Card>

            {/* Card 3: Your Net Recovery */}
            <Card className="p-4 rounded-xl bg-emerald-950/30 border border-emerald-500/40 flex flex-col justify-between space-y-3 shadow-xs">
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono uppercase text-emerald-400 font-bold tracking-wider flex items-center gap-1">
                    <TrendUp className="size-3.5" />
                    <span>Your Net Relief</span>
                  </span>
                  <Badge variant="outline" className="text-[10px] border-emerald-500/40 text-emerald-400 font-mono font-bold">
                    Direct Savings
                  </Badge>
                </div>
                <div className="text-2xl font-mono font-black text-emerald-400 pt-1">
                  {formatCurrency(liabilityResult.netPatientSavings)}
                </div>
                <p className="text-xs text-emerald-400/90 leading-relaxed font-medium">
                  Actual money retained in your bank account when ClaimHero overturns this denial.
                </p>
              </div>

              <div className="pt-2.5 border-t border-emerald-500/20 space-y-1 text-xs font-mono">
                <div className="flex justify-between text-muted-foreground">
                  <span>No Surprises Act:</span>
                  <span className="text-emerald-400 font-semibold">
                    {liabilityResult.data.noSurprisesActProtected ? "Protected (45 CFR § 149)" : "Standard"}
                  </span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>OOP Cap Protection:</span>
                  <span className="text-foreground font-semibold">
                    {liabilityResult.isOopMaxReached ? "Active (100% Covered)" : "Accumulating"}
                  </span>
                </div>
              </div>
            </Card>
          </div>

          {/* Annual Out-of-Pocket Cap Accumulation Bar */}
          <Card className="p-4 bg-card/75 border-border/60">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 pb-2">
              <div className="flex items-center gap-2">
                <ShieldCheck className="size-4 text-primary" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-foreground font-mono">
                  Annual Out-of-Pocket Maximum Protection
                </h3>
              </div>
              <span className="text-xs font-mono text-muted-foreground">
                Accumulated:{" "}
                <strong className="text-foreground">
                  {formatCurrency((financialInputs.outOfPocketSpent ?? 0) + liabilityResult.coveredPatientShare)}
                </strong>{" "}
                of {formatCurrency(financialInputs.outOfPocketMax ?? 0)} cap
              </span>
            </div>

            <Progress
              value={Math.min(
                100,
                Math.round(
                  (((financialInputs.outOfPocketSpent ?? 0) + liabilityResult.coveredPatientShare) /
                    ((financialInputs.outOfPocketMax ?? 0) || 1)) *
                    100
                )
              )}
              className="h-2.5 bg-muted/60 my-2"
            />

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-[11px] text-muted-foreground">
              <span>
                Prior out-of-pocket spent this year:{" "}
                <strong className="text-foreground font-mono">{formatCurrency(financialInputs.outOfPocketSpent ?? 0)}</strong>
              </span>
              <span>
                Remaining capacity before 100% insurer coverage:{" "}
                <strong className="text-primary font-mono">{formatCurrency(liabilityResult.remainingOopCapacity)}</strong>
              </span>
            </div>
          </Card>

          {/* Plain-English Bill Schedule Table */}
          <Card className="p-4 bg-card/75 border-border/60">
            <div className="flex items-center justify-between pb-3 border-b border-border/40">
              <div className="flex items-center gap-2">
                <Receipt className="size-4 text-primary" />
                <h3 className="text-xs font-semibold uppercase tracking-wider text-foreground font-mono">
                  Itemized Cost Breakdown & Overturn Impact
                </h3>
              </div>
              <Badge variant="outline" className="text-[10px] font-mono">
                {financialInputs.networkStatus === "in_network" ? "In-Network (PPO)" : "Out-of-Network"}
              </Badge>
            </div>

            <div className="rounded-lg border border-border/50 overflow-hidden mt-3">
              <Table>
                <TableHeader className="bg-muted/40">
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="text-[11px] font-mono py-2">Item</TableHead>
                    <TableHead className="text-[11px] font-mono py-2 text-right">If Denied</TableHead>
                    <TableHead className="text-[11px] font-mono py-2 text-right">If Overturned</TableHead>
                    <TableHead className="text-[11px] font-mono py-2 text-right">Difference</TableHead>
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
                      <TableCell className="py-2.5">
                        <div className="font-medium text-foreground">{item.label}</div>
                        <div className="text-[11px] text-muted-foreground font-sans truncate max-w-sm">
                          {item.description}
                        </div>
                      </TableCell>
                      <TableCell className="py-2.5 text-right text-rose-400">
                        {formatCurrency(item.deniedAmount)}
                      </TableCell>
                      <TableCell className="py-2.5 text-right text-cyan-300">
                        {formatCurrency(item.overturnedAmount)}
                      </TableCell>
                      <TableCell
                        className={cn(
                          "py-2.5 text-right font-semibold",
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

          {/* Progressive Disclosure: Collapsible Fine-Tune Plan Parameters */}
          <Card className="border border-border/70 bg-card/60 overflow-hidden">
            <button
              type="button"
              aria-expanded={isPlanAdjustOpen}
              aria-controls="plan-adjust-panel"
              onClick={() => setIsPlanAdjustOpen(!isPlanAdjustOpen)}
              className="w-full p-3.5 flex items-center justify-between text-left hover:bg-muted/30 transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-2">
                <Sliders className="size-4 text-primary" />
                <div>
                  <span className="text-xs font-semibold text-foreground">
                    Fine-Tune Insurance Plan Numbers
                  </span>
                  <p className="text-[11px] text-muted-foreground">
                    Auto-extracted from your denial. Expand to adjust deductible, copay, or coinsurance if your EOB differs.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span>{isPlanAdjustOpen ? "Hide Options" : "Adjust"}</span>
                {isPlanAdjustOpen ? <CaretUp className="size-3.5" /> : <CaretDown className="size-3.5" />}
              </div>
            </button>

            {isPlanAdjustOpen && (
              <div id="plan-adjust-panel" className="p-4 border-t border-border/50 bg-background/40 space-y-4 animate-fadeIn">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <label htmlFor="plan-billed" className="text-[11px] font-medium text-muted-foreground">Total Billed Charges ($)</label>
                    <Input
                      id="plan-billed"
                      type="number"
                      min={0}
                      value={financialInputs.billedAmount ?? ""}
                      onChange={(e) => updateFinancialField("billedAmount", parseFloat(e.target.value) || 0)}
                      className="h-8 font-mono text-xs"
                    />
                  </div>

                  <div className="space-y-1">
                    <label htmlFor="plan-discount" className="text-[11px] font-medium text-muted-foreground">Contractual Discount ($)</label>
                    <Input
                      id="plan-discount"
                      type="number"
                      min={0}
                      value={financialInputs.contractualDiscount ?? ""}
                      onChange={(e) => updateFinancialField("contractualDiscount", parseFloat(e.target.value) || 0)}
                      className="h-8 font-mono text-xs"
                    />
                  </div>

                  <div className="space-y-1">
                    <label htmlFor="plan-allowed" className="text-[11px] font-medium text-muted-foreground">Plan Allowed Amount ($)</label>
                    <Input
                      id="plan-allowed"
                      type="number"
                      min={0}
                      value={financialInputs.allowedAmount ?? ""}
                      onChange={(e) => updateFinancialField("allowedAmount", parseFloat(e.target.value) || 0)}
                      className="h-8 font-mono text-xs"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  <div className="space-y-1">
                    <label htmlFor="plan-deductible-total" className="text-[11px] font-medium text-muted-foreground">Annual Deductible ($)</label>
                    <Input
                      id="plan-deductible-total"
                      type="number"
                      min={0}
                      value={financialInputs.deductibleTotal ?? ""}
                      onChange={(e) => updateFinancialField("deductibleTotal", parseFloat(e.target.value) || 0)}
                      className="h-8 font-mono text-xs"
                    />
                  </div>

                  <div className="space-y-1">
                    <label htmlFor="plan-deductible-met" className="text-[11px] font-medium text-muted-foreground">Prior Deductible Met ($)</label>
                    <Input
                      id="plan-deductible-met"
                      type="number"
                      min={0}
                      value={financialInputs.deductibleMet ?? ""}
                      onChange={(e) => updateFinancialField("deductibleMet", parseFloat(e.target.value) || 0)}
                      className="h-8 font-mono text-xs"
                    />
                  </div>

                  <div className="space-y-1">
                    <label htmlFor="plan-coinsurance" className="text-[11px] font-medium text-muted-foreground">Co-Insurance Rate (%)</label>
                    <Input
                      id="plan-coinsurance"
                      type="number"
                      min={0}
                      max={100}
                      value={financialInputs.coinsuranceRate ?? ""}
                      onChange={(e) => updateFinancialField("coinsuranceRate", parseFloat(e.target.value) || 0)}
                      className="h-8 font-mono text-xs"
                    />
                  </div>

                  <div className="space-y-1">
                    <label htmlFor="plan-copay" className="text-[11px] font-medium text-muted-foreground">Specialist Co-Pay ($)</label>
                    <Input
                      id="plan-copay"
                      type="number"
                      min={0}
                      value={financialInputs.copayAmount ?? ""}
                      onChange={(e) => updateFinancialField("copayAmount", parseFloat(e.target.value) || 0)}
                      className="h-8 font-mono text-xs"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label htmlFor="plan-oop-max" className="text-[11px] font-medium text-muted-foreground">Annual Out-of-Pocket Max ($)</label>
                    <Input
                      id="plan-oop-max"
                      type="number"
                      min={0}
                      value={financialInputs.outOfPocketMax ?? ""}
                      onChange={(e) => updateFinancialField("outOfPocketMax", parseFloat(e.target.value) || 0)}
                      className="h-8 font-mono text-xs"
                    />
                  </div>

                  <div className="space-y-1">
                    <label htmlFor="plan-oop-spent" className="text-[11px] font-medium text-muted-foreground">Prior Out-of-Pocket Spent ($)</label>
                    <Input
                      id="plan-oop-spent"
                      type="number"
                      min={0}
                      value={financialInputs.outOfPocketSpent ?? ""}
                      onChange={(e) => updateFinancialField("outOfPocketSpent", parseFloat(e.target.value) || 0)}
                      className="h-8 font-mono text-xs"
                    />
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-border/40">
                  <div className="flex items-center gap-2 flex-wrap" role="group" aria-label="Network participation">
                    <span className="text-xs text-muted-foreground font-medium">Network Participation:</span>
                    <button
                      type="button"
                      aria-pressed={financialInputs.networkStatus === "in_network"}
                      onClick={() => updateFinancialField("networkStatus", "in_network")}
                      className={cn(
                        "h-7 px-2.5 rounded text-xs font-medium border transition-all cursor-pointer",
                        financialInputs.networkStatus === "in_network"
                          ? "bg-primary/20 border-primary text-primary font-bold"
                          : "border-border/60 text-muted-foreground"
                      )}
                    >
                      In-Network PPO
                    </button>
                    <button
                      type="button"
                      aria-pressed={financialInputs.networkStatus === "out_of_network"}
                      onClick={() => updateFinancialField("networkStatus", "out_of_network")}
                      className={cn(
                        "h-7 px-2.5 rounded text-xs font-medium border transition-all cursor-pointer",
                        financialInputs.networkStatus === "out_of_network"
                          ? "bg-amber-500/20 border-amber-500 text-amber-400 font-bold"
                          : "border-border/60 text-muted-foreground"
                      )}
                    >
                      Out-of-Network
                    </button>
                  </div>

                  <label htmlFor="plan-nsa-protected" className="flex items-center gap-2 cursor-pointer">
                    <input
                      id="plan-nsa-protected"
                      type="checkbox"
                      checked={financialInputs.noSurprisesActProtected ?? true}
                      onChange={(e) => updateFinancialField("noSurprisesActProtected", e.target.checked)}
                      className="size-4 accent-primary rounded cursor-pointer"
                    />
                    <span className="text-xs text-foreground font-medium">
                      No Surprises Act Protected (prohibits surprise balance billing)
                    </span>
                  </label>
                </div>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* MODE 2: INSURER PENALTY SENTINEL (ERISA § 502(c) $110/DAY ENFORCEMENT) */}
      {activeMode === "penalties" && (
        <div className="space-y-4">
          {/* Plain-English Federal Law Explainer Banner */}
          <Card className="p-4 rounded-xl bg-gradient-to-r from-amber-950/30 via-background to-cyan-950/30 border border-amber-500/30 space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <Scales className="size-5 text-amber-400 shrink-0" />
              <h3 className="text-sm font-bold text-foreground font-sans">
                The ERISA {STATUTORY_DISCLOSURE_GRACE_DAYS}-Day Disclosure Rule & Your Legal Leverage
              </h3>
              <Badge variant={severityMeta.badgeVariant} className="text-[10px] font-mono">
                {severityMeta.label}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Under federal law (ERISA 29 U.S.C. § 1132(c)), when you request your medical policy bulletins, clinical guidelines, and claim reviewer credentials, your health plan administrator has exactly <strong className="text-foreground">{STATUTORY_DISCLOSURE_GRACE_DAYS} calendar days</strong> to furnish them. When they fail to disclose these records, federal law assesses statutory penalties of up to <strong className="text-amber-400 font-mono">${dailyPenaltyRate.toFixed(0)} per calendar day</strong> payable directly to you, plus mandatory attorney fee shifting.
            </p>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              {severityMeta.description} Compliance state: <strong className="text-foreground capitalize">{erisaInputs.complianceStatus ?? "defaulted"}</strong>.
            </p>
          </Card>

          {/* 4-Stat Metric Box & Total Exposure Hero Pill */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3.5 rounded-xl bg-card/75 border border-border/60">
              <div className="text-[10px] font-mono uppercase text-muted-foreground">Days in Default</div>
              <div className="text-xl font-mono font-bold text-rose-400 mt-1">
                {erisaResult.data.daysInDefault} calendar days
              </div>
              <div className="text-[10px] text-muted-foreground mt-0.5">
                Past {STATUTORY_DISCLOSURE_GRACE_DAYS}-day statutory grace
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-card/75 border border-border/60">
              <div className="text-[10px] font-mono uppercase text-muted-foreground">Accrued § 502(c) Penalties</div>
              <div className="text-xl font-mono font-bold text-amber-400 mt-1">
                {formatCurrency(erisaResult.data.accruedPenaltyAmount)}
              </div>
              <div className="text-[10px] text-muted-foreground mt-0.5">
                ${dailyPenaltyRate.toFixed(0)} / day statutory rate
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-card/75 border border-border/60">
              <div className="text-[10px] font-mono uppercase text-muted-foreground">Prompt-Pay Interest</div>
              <div className="text-xl font-mono font-bold text-cyan-400 mt-1">
                {formatCurrency(erisaResult.data.accruedInterestAmount)}
              </div>
              <div className="text-[10px] text-muted-foreground mt-0.5">
                {erisaResult.data.statutoryInterestRate}% annual interest
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-card/75 border border-border/60">
              <div className="text-[10px] font-mono uppercase text-muted-foreground">Lodestar Legal Fees</div>
              <div className="text-xl font-mono font-bold text-emerald-400 mt-1">
                {formatCurrency(erisaResult.data.estimatedAttorneysFees)}
              </div>
              <div className="text-[10px] text-muted-foreground mt-0.5">
                Fee shifting (ERISA § 502(g)(1))
              </div>
            </div>
          </div>

          {/* Total Plan Administrator Exposure Hero Banner */}
          <Card className="p-4 rounded-xl bg-gradient-to-r from-amber-950/40 via-card to-rose-950/40 border border-amber-500/40 flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-xs">
            <div className="space-y-1">
              <div className="text-xs font-mono uppercase tracking-wider text-amber-400 font-bold flex items-center gap-1.5">
                <Lightning className="size-4" />
                <span>Total Insurer Statutory Exposure</span>
              </div>
              <p className="text-xs text-muted-foreground max-w-xl">
                Total financial exposure facing the plan administrator: disputed claim principal + accrued daily statutory fines + prompt-pay interest + mandatory attorney fees.
              </p>
            </div>
            <div className="text-right shrink-0">
              <div className="text-[10px] font-mono uppercase text-muted-foreground">Compounded Exposure</div>
              <div className="text-2xl font-mono font-black text-amber-300">
                {formatCurrency(erisaResult.data.totalPlanAdministratorExposure)}
              </div>
            </div>
          </Card>

          {/* Statutory Notice of Default & Ready Demand Box */}
          <Card className="p-4 bg-card/75 border-border/60 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="size-4 text-cyan-400" />
                <h3 className="text-xs font-semibold uppercase tracking-wider text-foreground font-mono">
                  Formal Statutory Notice of Default & Demand
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCopyDemand}
                  className="gap-1.5 text-xs font-mono h-7 cursor-pointer"
                >
                  {copiedDemand ? <Check className="size-3 text-emerald-400" /> : <Copy className="size-3" />}
                  <span>{copiedDemand ? "Copied Demand" : "Copy Demand"}</span>
                </Button>
                <Button
                  size="sm"
                  onClick={handleEmbedInBrief}
                  disabled={isSaving}
                  className="gap-1.5 text-xs font-semibold h-7 bg-primary text-primary-foreground cursor-pointer"
                >
                  <FileText className="size-3" />
                  <span>Embed in Brief</span>
                </Button>
              </div>
            </div>

            <p className="text-xs text-muted-foreground leading-relaxed">
              Include this formal demand paragraph in your appeal brief or send it as a certified letter to compel immediate document production and prompt settlement:
            </p>

            <div className="p-3.5 rounded-lg bg-background/80 border border-border/60 font-mono text-[11px] text-foreground/90 whitespace-pre-wrap leading-relaxed max-h-56 overflow-y-auto select-text">
              {erisaResult.noticeOfDefaultText}
            </div>
          </Card>

          {/* Compounding Delay Trajectory Table */}
          <Card className="p-4 bg-card/75 border-border/60 space-y-2.5">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-foreground font-mono">
                  Projected Penalty Compounding Trajectory
                </h4>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  How the insurer's liability compounds at ${dailyPenaltyRate.toFixed(0)}/day for each additional month of non-compliance.
                </p>
              </div>
              <Badge variant="outline" className="text-[10px] font-mono text-amber-400 border-amber-500/30">
                ${dailyPenaltyRate.toFixed(0)} / Day Escalation
              </Badge>
            </div>

            <div className="rounded-lg border border-border/50 overflow-hidden mt-2">
              <Table>
                <TableHeader className="bg-muted/40">
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="text-[10px] font-mono py-1.5">Horizon</TableHead>
                    <TableHead className="text-[10px] font-mono py-1.5">Future Date</TableHead>
                    <TableHead className="text-[10px] font-mono py-1.5 text-right">Default Days</TableHead>
                    <TableHead className="text-[10px] font-mono py-1.5 text-right">Penalties Accrued</TableHead>
                    <TableHead className="text-[10px] font-mono py-1.5 text-right">Total Insurer Exposure</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {erisaResult.trajectories.map((traj) => (
                    <TableRow key={traj.horizonDays} className="hover:bg-muted/30 text-[11px] font-mono">
                      <TableCell className="py-2 font-semibold text-foreground">+{traj.horizonDays} Days</TableCell>
                      <TableCell className="py-2 text-muted-foreground">{traj.futureDate}</TableCell>
                      <TableCell className="py-2 text-right text-rose-400">{traj.projectedDaysInDefault}d</TableCell>
                      <TableCell className="py-2 text-right text-amber-400">{formatCurrency(traj.projectedPenalties)}</TableCell>
                      <TableCell className="py-2 text-right font-bold text-foreground">
                        {formatCurrency(traj.projectedTotalExposure)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Card>

          {/* Progressive Disclosure: Collapsible Fine-Tune ERISA Dates */}
          <Card className="border border-border/70 bg-card/60 overflow-hidden">
            <button
              type="button"
              aria-expanded={isErisaAdjustOpen}
              aria-controls="erisa-adjust-panel"
              onClick={() => setIsErisaAdjustOpen(!isErisaAdjustOpen)}
              className="w-full p-3.5 flex items-center justify-between text-left hover:bg-muted/30 transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-2">
                <Clock className="size-4 text-primary" />
                <div>
                  <span className="text-xs font-semibold text-foreground">
                    Fine-Tune Statutory Request Dates & Penalty Rate
                  </span>
                  <p className="text-[11px] text-muted-foreground">
                    Customize document request date, audit calculation date, and statutory daily fine rate (${dailyPenaltyRate.toFixed(0)}).
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span>{isErisaAdjustOpen ? "Hide Options" : "Adjust"}</span>
                {isErisaAdjustOpen ? <CaretUp className="size-3.5" /> : <CaretDown className="size-3.5" />}
              </div>
            </button>

            {isErisaAdjustOpen && (
              <div id="erisa-adjust-panel" className="p-4 border-t border-border/50 bg-background/40 space-y-4 animate-fadeIn">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label htmlFor="erisa-request-date" className="text-[11px] font-medium text-muted-foreground">Document Request Date</label>
                    <Input
                      id="erisa-request-date"
                      type="date"
                      value={erisaInputs.documentRequestDate ?? ""}
                      onChange={(e) => updateErisaField("documentRequestDate", e.target.value)}
                      className="h-8 font-mono text-xs"
                    />
                  </div>

                  <div className="space-y-1">
                    <label htmlFor="erisa-calc-date" className="text-[11px] font-medium text-muted-foreground">Audit / Calculation Date</label>
                    <Input
                      id="erisa-calc-date"
                      type="date"
                      value={erisaInputs.calculationDate ?? ""}
                      onChange={(e) => updateErisaField("calculationDate", e.target.value)}
                      className="h-8 font-mono text-xs"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label htmlFor="erisa-daily-rate" className="text-[11px] font-medium text-muted-foreground">Daily Statutory Penalty Rate ($/day)</label>
                    <Input
                      id="erisa-daily-rate"
                      type="number"
                      min={0}
                      max={1000}
                      value={erisaInputs.dailyPenaltyRate ?? 110}
                      onChange={(e) => {
                        const parsed = parseFloat(e.target.value);
                        updateErisaField("dailyPenaltyRate", Number.isNaN(parsed) ? 110 : Math.max(0, parsed));
                      }}
                      className="h-8 font-mono text-xs"
                    />
                  </div>

                  <div className="space-y-1">
                    <label htmlFor="erisa-interest" className="text-[11px] font-medium text-muted-foreground">Prompt-Pay Annual Interest (%)</label>
                    <Input
                      id="erisa-interest"
                      type="number"
                      min={0}
                      max={100}
                      value={erisaInputs.statutoryInterestRate ?? 18}
                      onChange={(e) => {
                        const parsed = parseFloat(e.target.value);
                        updateErisaField("statutoryInterestRate", Number.isNaN(parsed) ? 0 : Math.max(0, parsed));
                      }}
                      className="h-8 font-mono text-xs"
                    />
                  </div>
                </div>

                <div className="space-y-1.5 pt-1">
                  <span id="erisa-compliance-label" className="text-[11px] font-medium text-muted-foreground">Insurer Compliance State</span>
                  <div className="grid grid-cols-3 gap-2" role="group" aria-labelledby="erisa-compliance-label">
                    {(["defaulted", "partial", "compliant"] as StatutoryComplianceStatus[]).map((status) => (
                      <button
                        key={status}
                        type="button"
                        aria-pressed={erisaInputs.complianceStatus === status}
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

                <div className="space-y-1.5 pt-2 border-t border-border/40">
                  <div className="text-[11px] font-medium text-muted-foreground">
                    Required Statutory Documents Requested (29 CFR § 2560.503-1(h)(2)(iii))
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-40 overflow-y-auto pr-1">
                    {erisaResult.data.requestedDocuments.map((doc) => (
                      <div key={doc} className="flex items-start gap-1.5 p-1.5 rounded bg-background/40 border border-border/30 text-[11px]">
                        <CheckCircle className="size-3.5 text-cyan-400 shrink-0 mt-0.5" />
                        <span className="text-foreground/90 font-mono leading-tight">{doc}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* 4. Shared Strategic Settlement Leverage Callout */}
      <Card className="p-4 rounded-xl bg-gradient-to-r from-cyan-950/30 via-background to-emerald-950/30 border border-primary/30 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <ShieldCheck className="size-4 text-emerald-400" />
            <h4 className="text-sm font-bold text-foreground">
              Total Appellate Settlement Leverage
            </h4>
          </div>
          <p className="text-xs text-muted-foreground max-w-xl leading-relaxed">
            By citing your net out-of-pocket recovery ({formatCurrency(liabilityResult.netPatientSavings)}) alongside accrued statutory ERISA penalties ({formatCurrency(erisaResult.data.accruedPenaltyAmount)}), you establish maximum legal pressure to compel the insurer to overturn this denial immediately.
          </p>
        </div>

        <div className="flex items-center gap-4 shrink-0">
          <div className="text-right">
            <div className="text-[10px] font-mono uppercase text-muted-foreground">Combined Leverage</div>
            <div className="text-xl font-mono font-black text-emerald-400">
              {formatCurrency(liabilityResult.netPatientSavings + erisaResult.data.totalStatutoryDamages)}
            </div>
          </div>

          <Button
            size="sm"
            onClick={handleEmbedInBrief}
            disabled={isSaving}
            className="h-9 px-3 text-xs bg-primary text-primary-foreground font-semibold cursor-pointer shadow-xs gap-1.5"
          >
            <span>Embed in Brief</span>
            <ArrowRight className="size-3.5" />
          </Button>
        </div>
      </Card>

      {/* 5. Formal Legal Statement Print & Exhibit Export Modal */}
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
