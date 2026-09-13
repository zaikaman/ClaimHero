import React from "react";
import {
  CheckCircle,
  CircleNotch,
  Lightning,
  FileMagnifyingGlass,
  FileText,
  Envelope,
  PaperPlaneTilt,
  ArrowLeft,
  TrendUp,
  Clock,
  Scales,
  HourglassHigh,
} from "@phosphor-icons/react";
import { Claim } from "../../types";
import { formatCurrency, cn } from "../../lib/utils";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";

export type FlowView = "radar" | "evidence" | "studio" | "p2p" | "calculator" | "communications" | "audit";

interface SentinelFlowStepperProps {
  claim: Claim;
  currentView: FlowView;
  onNavigateView: (view: FlowView) => void;
  evidencesCount?: number;
  hasDraftedBrief?: boolean;
  isProcessing?: boolean;
  processingLabel?: string;
  onRunAutonomousPipeline?: () => Promise<unknown>;
  onOpenAuditDrawer?: () => void;
  onOpenIngestion?: (claim?: Claim) => void;
}

export const SentinelFlowStepper: React.FC<SentinelFlowStepperProps> = ({
  claim,
  currentView,
  onNavigateView,
  evidencesCount = 0,
  hasDraftedBrief = false,
  isProcessing = false,
  processingLabel = "Processing...",
  onRunAutonomousPipeline,
  onOpenAuditDrawer,
  onOpenIngestion,
}) => {
  const isWon = claim.status === "won";
  const isDispatched = claim.status === "dispatched" || isWon;
  const daysRemaining = claim.daysRemaining ?? 180;
  const isUrgent = daysRemaining <= 14 && !isWon && !isDispatched;



  const hasEvidence =
    evidencesCount > 0 ||
    claim.overturnProbabilityScore !== undefined ||
    (claim.evidenceCount !== undefined && claim.evidenceCount > 0);
  const hasBrief =
    hasDraftedBrief ||
    Boolean(claim.latestAppeal) ||
    claim.status === "ready_for_review" ||
    isDispatched;
  const hasAppealContext = Boolean(
    claim.appealContext?.confirmedAt &&
      claim.appealContext.sender?.name?.trim() &&
      (claim.appealContext.sender?.email?.trim() || claim.appealContext.sender?.phone?.trim())
  );

  const steps = [
    {
      id: "evidence",
      number: 1,
      title: "1. Evidence & CPB",
      subtitle: hasEvidence
        ? `${claim.overturnProbabilityScore !== undefined ? `${claim.overturnProbabilityScore}% Win Score` : `${evidencesCount} Clauses`}`
        : "Pending analysis",
      view: "evidence" as FlowView,
      icon: FileMagnifyingGlass,
      isCompleted: hasEvidence,
      isActive: currentView === "evidence",
    },
    {
      id: "studio",
      number: 2,
      title: "2. Appeal Brief",
      subtitle: hasBrief
        ? `Brief v${claim.latestAppeal?.version || 1} Ready`
        : "AI synthesis ready",
      view: "studio" as FlowView,
      icon: FileText,
      isCompleted: hasBrief,
      isActive: currentView === "studio",
    },
    {
      id: "communications",
      number: 3,
      title: isWon ? "3. Case Won" : "3. Payer Dispatch",
      subtitle: isWon
        ? "100% Payer Reversal"
        : isDispatched
        ? "Transmitted to Payer"
        : "Ready to send",
      view: "communications" as FlowView,
      icon: isWon ? CheckCircle : isDispatched ? PaperPlaneTilt : Envelope,
      isCompleted: isDispatched,
      isActive: currentView === "communications",
    },
  ];

  const isPipelineActive =
    isProcessing ||
    claim.workflowStatus === "inProgress" ||
    claim.status === "parsing" ||
    claim.status === "analyzing" ||
    claim.status === "precedent_matched" ||
    claim.status === "drafting";

  return (
    <div className="rounded-xl border border-border bg-card/70 backdrop-blur-sm p-3 shadow-xs space-y-2.5">
      {/* Case Header & Quick Context Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2.5 pb-2.5 border-b border-border/60">
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          <Button
            variant="ghost"
            size="xs"
            onClick={() => onNavigateView("radar")}
            className="gap-1 text-xs text-muted-foreground hover:text-foreground h-7 px-2"
          >
            <ArrowLeft className="size-3" />
            <span className="font-medium">All Cases</span>
          </Button>

          <div className="h-4 w-px bg-border shrink-0" />

          <div className="flex items-center gap-2 min-w-0">
            <span className="font-bold text-xs text-foreground truncate max-w-[180px]">
              {claim.patient?.name || "Patient Record"}
            </span>
            <Badge variant="outline" className="font-mono text-[10px] shrink-0">
              #{claim.claimNumber} • {claim.patient?.insurancePayer || "Insurer"}
            </Badge>
            {isWon ? (
              <Badge variant="secondary" className="font-mono font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/15 border border-emerald-500/30 text-[10px] shrink-0">
                {formatCurrency(claim.deniedAmount)} Won
              </Badge>
            ) : (
              <Badge variant="secondary" className="font-mono font-bold text-destructive text-[10px] shrink-0">
                {formatCurrency(claim.deniedAmount)}
              </Badge>
            )}
          </div>
        </div>

        {/* Status Indicators, ERISA Statutory Clock, & Actions */}
        <div className="flex flex-wrap items-center gap-2 self-end lg:self-auto">
          {/* ERISA §502(c) Statutory Liability Exposure & Countdown */}
          <button
            onClick={() => onNavigateView("calculator")}
            className={cn(
              "flex items-center gap-1.5 px-2 py-1 rounded-md border text-[11px] font-mono transition-colors text-left cursor-pointer",
              isUrgent
                ? "bg-destructive/15 border-destructive/40 text-destructive hover:bg-destructive/20 animate-pulse"
                : "bg-muted/40 border-border/70 text-muted-foreground hover:text-foreground hover:bg-muted/60"
            )}
            title="Click to view statutory ERISA 29 U.S.C. § 1132(c) penalty exposure and liability breakdown"
          >
            {isUrgent ? (
              <HourglassHigh className="size-3.5 shrink-0 text-destructive" />
            ) : (
              <Scales className="size-3.5 shrink-0 text-primary" />
            )}
            <span className="font-semibold">
              $110/day ERISA exposure
            </span>
            <span className="text-[10px] text-muted-foreground">•</span>
            <span className={cn("font-medium", isUrgent ? "text-destructive font-bold" : "text-foreground/80")}>
              {daysRemaining}d left
            </span>
          </button>

          {/* Audit Trail Drawer Trigger */}
          <Button
            variant="outline"
            size="xs"
            onClick={() => onOpenAuditDrawer ? onOpenAuditDrawer() : onNavigateView("audit")}
            className="h-7 px-2 gap-1.5 text-xs text-muted-foreground hover:text-foreground border-border/70 cursor-pointer"
            title="Open real-time 29 CFR case audit trail drawer"
          >
            <Clock className="size-3 text-cyan-400" />
            <span>Audit Trail</span>
          </Button>

          {isWon ? (
            <div className="flex items-center gap-1 text-xs font-mono px-2 py-1 rounded bg-emerald-500/10 border border-emerald-500/20">
              <CheckCircle className="size-3.5 text-emerald-500" />
              <span className="font-bold text-emerald-600 dark:text-emerald-400 text-xs">
                Overturned & Won
              </span>
            </div>
          ) : claim.overturnProbabilityScore !== undefined ? (
            <div className="flex items-center gap-1 text-xs font-mono px-2 py-1 rounded bg-secondary/80 border border-border/60">
              <TrendUp className="size-3 text-emerald-500" />
              <span className="font-bold text-emerald-600 dark:text-emerald-400 text-xs">
                {claim.overturnProbabilityScore}% Overturn Prob.
              </span>
            </div>
          ) : null}

          {(!hasEvidence || !hasBrief) && onRunAutonomousPipeline && (
            <Button
              size="xs"
              onClick={() => {
                if (isPipelineActive) return;
                if (hasAppealContext) {
                  onRunAutonomousPipeline().catch((err) => {
                    console.warn("Autonomous pipeline execution notice:", err);
                  });
                } else if (onOpenIngestion) {
                  onOpenIngestion(claim);
                } else {
                  onNavigateView("studio");
                }
              }}
              disabled={isPipelineActive}
              className={cn(
                "gap-1.5 h-7 px-2.5 text-xs shadow-2xs font-medium transition-all",
                isPipelineActive
                  ? "bg-muted/70 text-muted-foreground border border-border/80 cursor-not-allowed shadow-none"
                  : "bg-primary text-primary-foreground cursor-pointer hover:bg-primary/90"
              )}
            >
              {isPipelineActive ? (
                <>
                  <CircleNotch className="size-3 animate-spin text-primary" />
                  <span>{processingLabel && processingLabel !== "Processing..." ? processingLabel : "Auto-Pilot Running..."}</span>
                </>
              ) : (
                <>
                  <Lightning className="size-3" weight="fill" />
                  <span>{hasAppealContext ? "Auto-Pilot Appeal" : "Complete Context"}</span>
                </>
              )}
            </Button>
          )}
        </div>
      </div>

      {/* 3-Step Master Workflow Stepper */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {steps.map((step) => {
          const StepIcon = step.icon;
          const isClickable = true;

          return (
            <button
              key={step.id}
              onClick={() => isClickable && onNavigateView(step.view)}
              disabled={isProcessing}
              className={cn(
                "flex items-center gap-2.5 p-2 rounded-lg text-left transition-all border cursor-pointer group",
                step.isActive
                  ? "bg-primary/10 border-primary/40 text-foreground ring-1 ring-primary/20 shadow-2xs"
                  : step.isCompleted
                  ? "bg-muted/30 border-border/70 hover:bg-muted/60 text-muted-foreground hover:text-foreground"
                  : "bg-muted/10 border-border/40 hover:bg-muted/30 text-muted-foreground/80 opacity-80"
              )}
            >
              <div
                className={cn(
                  "flex size-7 items-center justify-center rounded-md font-mono text-xs font-bold shrink-0 transition-colors",
                  step.isActive
                    ? "bg-primary text-primary-foreground"
                    : step.isCompleted
                    ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30"
                    : "bg-muted text-muted-foreground border border-border"
                )}
              >
                {step.isCompleted ? (
                  <CheckCircle
                    className={cn(
                      "size-4",
                      step.isActive ? "text-primary-foreground" : "text-emerald-500"
                    )}
                  />
                ) : (
                  <StepIcon className="size-3.5" />
                )}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1">
                  <span className="text-xs font-semibold truncate group-hover:text-foreground">
                    {step.title}
                  </span>
                </div>
                <span className="text-[10px] text-muted-foreground truncate block font-mono">
                  {step.subtitle}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
