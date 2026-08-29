import React from "react";
import {
  CheckCircle,
  CircleNotch,
  Sparkle,
  FileMagnifyingGlass,
  FileText,
  Envelope,
  PaperPlaneTilt,
  ArrowLeft,
  TrendUp,
} from "@phosphor-icons/react";
import { Claim } from "../../types";
import { formatCurrency, cn } from "../../lib/utils";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";

export type FlowView = "radar" | "evidence" | "studio" | "communications" | "audit";

interface SentinelFlowStepperProps {
  claim: Claim;
  currentView: FlowView;
  onNavigateView: (view: FlowView) => void;
  evidencesCount?: number;
  hasDraftedBrief?: boolean;
  isProcessing?: boolean;
  processingLabel?: string;
  onRunAutonomousPipeline?: () => Promise<any>;
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
}) => {
  const isWon = claim.status === "won";
  const isDispatched = claim.status === "dispatched" || isWon;
  const hasEvidence =
    evidencesCount > 0 ||
    claim.overturnProbabilityScore !== undefined ||
    (claim.evidenceCount !== undefined && claim.evidenceCount > 0);
  const hasBrief =
    hasDraftedBrief ||
    Boolean(claim.latestAppeal) ||
    claim.status === "ready_for_review" ||
    isDispatched;

  const steps = [
    {
      id: "evidence",
      number: 1,
      title: "Evidence & CPB",
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
      title: "Appeal Brief",
      subtitle: hasBrief ? `v${claim.latestAppeal?.version || 1} Synthesized` : "Draft pending",
      view: "studio" as FlowView,
      icon: FileText,
      isCompleted: hasBrief,
      isActive: currentView === "studio",
    },
    {
      id: "communications",
      number: 3,
      title: "Payer Dispatch",
      subtitle: isDispatched ? "Transmitted to Payer" : "Ready to send",
      view: "communications" as FlowView,
      icon: isDispatched ? PaperPlaneTilt : Envelope,
      isCompleted: isDispatched,
      isActive: currentView === "communications",
    },
  ];

  return (
    <div className="rounded-xl border border-border bg-card/70 backdrop-blur-sm p-3 shadow-xs space-y-2.5">
      {/* Case Header & Quick Context Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2.5 border-b border-border/60">
        <div className="flex items-center gap-2 min-w-0">
          <Button
            variant="ghost"
            size="xs"
            onClick={() => onNavigateView("radar")}
            className="gap-1 text-xs text-muted-foreground hover:text-foreground h-7 px-2"
          >
            <ArrowLeft className="size-3" />
            <span className="hidden sm:inline">Radar</span>
          </Button>

          <div className="h-4 w-px bg-border shrink-0" />

          <div className="flex items-center gap-2 min-w-0">
            <span className="font-semibold text-xs text-foreground truncate">
              {claim.patient?.name || "Patient Record"}
            </span>
            <Badge variant="outline" className="font-mono text-[10px] shrink-0">
              {claim.patient?.insurancePayer || "Insurer"}
            </Badge>
            <Badge variant="secondary" className="font-mono font-bold text-destructive text-[10px] shrink-0">
              {formatCurrency(claim.deniedAmount)}
            </Badge>
          </div>
        </div>

        {/* Status Indicators & Fast Pipeline Action */}
        <div className="flex items-center gap-2 self-end sm:self-auto">
          {claim.overturnProbabilityScore !== undefined && (
            <div className="flex items-center gap-1 text-xs font-mono">
              <TrendUp className="size-3 text-emerald-500" />
              <span className="font-bold text-emerald-600 dark:text-emerald-400">
                {claim.overturnProbabilityScore}% Win Likelihood
              </span>
            </div>
          )}

          {(!hasEvidence || !hasBrief) && onRunAutonomousPipeline && (
            <Button
              size="xs"
              onClick={onRunAutonomousPipeline}
              disabled={isProcessing}
              className="gap-1.5 h-7 px-2.5 bg-primary text-primary-foreground text-xs shadow-2xs"
            >
              {isProcessing ? (
                <>
                  <CircleNotch className="size-3 animate-spin" />
                  <span>{processingLabel}</span>
                </>
              ) : (
                <>
                  <Sparkle className="size-3" />
                  <span>1-Click Auto-Pilot</span>
                </>
              )}
            </Button>
          )}
        </div>
      </div>

      {/* 3-Step Interactive Horizontal Stepper */}
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
