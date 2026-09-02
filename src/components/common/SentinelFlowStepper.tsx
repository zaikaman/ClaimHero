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
  PhoneCall,
  Shield,
  Scales,
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
  const hasAppealContext = Boolean(
    claim.appealContext?.confirmedAt &&
      claim.appealContext.sender.name &&
      (claim.appealContext.sender.email || claim.appealContext.sender.phone)
  );

  const isDefenseSuiteActive =
    currentView === "studio" || currentView === "p2p" || currentView === "calculator";

  const defenseVectors = [
    {
      id: "studio" as FlowView,
      label: "Written Legal Brief",
      shortLabel: "Legal Brief",
      badge: hasBrief ? `v${claim.latestAppeal?.version || 1}` : "Ready",
      icon: FileText,
      isActive: currentView === "studio",
      description: "Tier 1/2/3 Legal Brief & Citations",
    },
    {
      id: "p2p" as FlowView,
      label: "Doctor P2P Copilot",
      shortLabel: "P2P Copilot",
      badge: "3-Min Script",
      icon: PhoneCall,
      isActive: currentView === "p2p",
      description: "Physician Verbal Rebuttal & Cheat Sheet",
    },
    {
      id: "calculator" as FlowView,
      label: "ERISA & Liability Audit",
      shortLabel: "ERISA Penalties",
      badge: "$110/Day",
      icon: Scales,
      isActive: currentView === "calculator",
      description: "Statutory Default & OOP Exposure",
    },
  ];

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
      title: "Defense Suite",
      subtitle: hasBrief
        ? `Brief v${claim.latestAppeal?.version || 1} • P2P • ERISA`
        : "3 Defense Vectors Ready",
      view: "studio" as FlowView,
      icon: Shield,
      isCompleted: hasBrief,
      isActive: isDefenseSuiteActive,
    },
    {
      id: "communications",
      number: 3,
      title: isWon ? "Case Won" : "Payer Dispatch",
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

        {/* Status Indicators & Fast Pipeline Action */}
        <div className="flex items-center gap-2 self-end sm:self-auto">
          {isWon ? (
            <div className="flex items-center gap-1 text-xs font-mono">
              <CheckCircle className="size-3.5 text-emerald-500" />
              <span className="font-bold text-emerald-600 dark:text-emerald-400">
                Overturned & Won
              </span>
            </div>
          ) : claim.overturnProbabilityScore !== undefined ? (
            <div className="flex items-center gap-1 text-xs font-mono">
              <TrendUp className="size-3 text-emerald-500" />
              <span className="font-bold text-emerald-600 dark:text-emerald-400">
                {claim.overturnProbabilityScore}% Win Likelihood
              </span>
            </div>
          ) : null}

          {(!hasEvidence || !hasBrief) && onRunAutonomousPipeline && (
            <Button
              size="xs"
              onClick={() => hasAppealContext ? onRunAutonomousPipeline() : onNavigateView("studio")}
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
                  <Lightning className="size-3" weight="fill" />
                  <span>{hasAppealContext ? "1-Click Auto-Pilot" : "Complete case context"}</span>
                </>
              )}
            </Button>

          )}
        </div>
      </div>

      {/* 3-Step Macro Workflow Stepper */}
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

      {/* Embedded Defense Vector Sub-Bar (Active when on Step 2 / Defense Suite) */}
      {isDefenseSuiteActive && (
        <div className="pt-2 border-t border-border/50">
          <div className="flex items-center justify-between gap-2 mb-1.5 px-0.5">
            <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground flex items-center gap-1">
              <Shield className="size-3 text-primary" />
              Strategic Defense Vectors
            </span>
            <span className="text-[10px] text-muted-foreground font-mono">
              3 Active Armaments
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5">
            {defenseVectors.map((vec) => {
              const VecIcon = vec.icon;
              return (
                <button
                  key={vec.id}
                  onClick={() => onNavigateView(vec.id)}
                  className={cn(
                    "flex items-center justify-between p-2 rounded-md border text-xs text-left transition-all cursor-pointer",
                    vec.isActive
                      ? "bg-primary/15 border-primary/50 text-foreground font-semibold ring-1 ring-primary/30 shadow-xs"
                      : "bg-muted/20 border-border/60 hover:bg-muted/50 text-muted-foreground hover:text-foreground"
                  )}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <VecIcon
                      className={cn(
                        "size-3.5 shrink-0",
                        vec.isActive ? "text-primary" : "text-muted-foreground"
                      )}
                    />
                    <div className="min-w-0">
                      <span className="truncate block font-medium">
                        {vec.label}
                      </span>
                    </div>
                  </div>
                  <Badge
                    variant={vec.isActive ? "default" : "outline"}
                    className="text-[9px] font-mono px-1.5 py-0 h-4 shrink-0"
                  >
                    {vec.badge}
                  </Badge>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
