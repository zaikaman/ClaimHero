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
  ArrowRight,
  TrendUp,
  Clock,
  Scales,
  HourglassHigh,
} from "@phosphor-icons/react";
import { Claim } from "../../types";
import { formatCurrency, cn } from "../../lib/utils";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { useDetailMode } from "../../hooks/useDetailMode";
import { DetailModeToggle } from "./DetailModeToggle";
import { formatWhatHappenedSentence, formatDeadlineSentence } from "../../lib/plainCopy";

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
  const isDispatched =
    claim.status === "dispatched" ||
    claim.status === "under_review" ||
    claim.status === "escalated" ||
    isWon;
  const daysRemaining = claim.daysRemaining ?? 180;
  const isUrgent = daysRemaining <= 14 && !isWon && !isDispatched;



  const hasEvidence =
    evidencesCount > 0 ||
    claim.appealReadinessScore !== undefined ||
    claim.evidenceCoverageScore !== undefined ||
    claim.overturnProbabilityScore !== undefined ||
    (claim.evidenceCount !== undefined && claim.evidenceCount > 0);
  const hasBrief =
    hasDraftedBrief ||
    Boolean(claim.latestAppeal) ||
    claim.status === "ready_for_review" ||
    claim.status === "review_provisional" ||
    isDispatched;
  const { isDetailed } = useDetailMode();
  const hasAppealContext = Boolean(
    claim.appealContext?.confirmedAt &&
      claim.appealContext.sender?.name?.trim() &&
      (claim.appealContext.sender?.email?.trim() || claim.appealContext.sender?.phone?.trim())
  );

  const steps = [
    {
      id: "evidence",
      number: 1,
      title: isDetailed ? "1. Evidence & CPB" : "1. Your proof",
      subtitle: hasEvidence
        ? `${(claim.appealReadinessScore ?? claim.evidenceCoverageScore ?? claim.overturnProbabilityScore) !== undefined ? `${claim.appealReadinessScore ?? claim.evidenceCoverageScore ?? claim.overturnProbabilityScore}/100 ${isDetailed ? "Readiness" : "Strength"}` : `${evidencesCount} ${isDetailed ? "Clauses" : "documents"}`}`
        : isDetailed ? "Pending analysis" : "Not checked yet",
      view: "evidence" as FlowView,
      icon: FileMagnifyingGlass,
      isCompleted: hasEvidence,
      isActive: currentView === "evidence",
    },
    {
      id: "studio",
      number: 2,
      title: isDetailed ? "2. Appeal Brief" : "2. Your letter",
      subtitle: hasBrief
        ? `Letter v${claim.latestAppeal?.version || 1} ready`
        : isDetailed ? "AI synthesis ready" : "Ready to write",
      view: "studio" as FlowView,
      icon: FileText,
      isCompleted: hasBrief,
      isActive: currentView === "studio",
    },
    {
      id: "communications",
      number: 3,
      title: isWon
        ? "3. Case Won"
        : claim.status === "under_review"
        ? isDetailed ? "3. Payer Review" : "3. Waiting for reply"
        : claim.status === "escalated"
        ? isDetailed ? "3. Payer Escalation" : "3. Needs next step"
        : isDetailed ? "3. Payer Dispatch" : "3. Send & track",
      subtitle: isWon
        ? isDetailed ? "100% Payer Reversal" : "Insurer agreed to pay"
        : claim.status === "under_review"
        ? isDetailed ? "Payer Review Active" : "Insurer is reviewing"
        : claim.status === "escalated"
        ? isDetailed ? "Adverse Escalation" : "Denied again — next step ready"
        : isDispatched
        ? isDetailed ? "Transmitted to Payer" : "Sent to insurer"
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

  if (!isDetailed) {
    const whatHappened = formatWhatHappenedSentence(claim);
    const deadline = formatDeadlineSentence(claim.statutoryDeadline, daysRemaining);

    const isStep1 = currentView === "evidence";
    const isStep2 = currentView === "studio";
    const isStep3 = currentView === "communications";

    let primaryButtonLabel = "Review & Approve";
    let primaryButtonAction = () => onNavigateView("studio");
    let primaryButtonTarget: FlowView | null = "studio";

    if (isWon) {
      primaryButtonLabel = "View Outcome";
      primaryButtonAction = () => onNavigateView("communications");
      primaryButtonTarget = "communications";
    } else if (isDispatched) {
      primaryButtonLabel = isStep3 ? "Track Sent Appeal" : "Track Appeal";
      primaryButtonAction = () => onNavigateView("communications");
      primaryButtonTarget = "communications";
    } else if (isStep1) {
      primaryButtonLabel = "Review & Approve";
      primaryButtonAction = () => onNavigateView("studio");
      primaryButtonTarget = "studio";
    } else if (isStep2) {
      primaryButtonLabel = "Continue to Send";
      primaryButtonAction = () => onNavigateView("communications");
      primaryButtonTarget = "communications";
    } else if (isStep3) {
      // No primary action on Step 3 pre-dispatch: the inbox card already owns
      // the send CTA, so a "Review Letter" primary would duplicate the
      // "Back to Letter" secondary (both navigate to studio).
      primaryButtonTarget = null;
    } else {
      // Auxiliary views (p2p, calculator, audit) pre-dispatch already render a
      // generic "Back" secondary to studio, so hide the primary to avoid the
      // same studio duplication.
      primaryButtonTarget = null;
    }

    return (
      <div className="rounded-xl border border-border bg-card/80 backdrop-blur-sm p-3.5 sm:p-4 shadow-xs space-y-3">
        {/* Top bar: All Cases back link + 3-Step Guided Navigation Strip */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/50 pb-2.5">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="xs"
              onClick={() => onNavigateView("radar")}
              className="gap-1 text-xs text-muted-foreground hover:text-foreground h-6 px-1.5 -ml-1 cursor-pointer"
              title="Back to all cases"
            >
              <ArrowLeft className="size-3" />
              <span>All Cases</span>
            </Button>
            {isWon ? (
              <Badge variant="secondary" className="font-sans text-[10px] text-emerald-600 dark:text-emerald-400 bg-emerald-500/15 border border-emerald-500/30">
                Won • Full payment
              </Badge>
            ) : isDispatched ? (
              <Badge variant="outline" className="font-sans text-[10px] text-sky-400 border-sky-500/30 bg-sky-500/10">
                Sent to insurer
              </Badge>
            ) : null}
          </div>

          {/* 3-Step Guided Navigation Strip (Bidirectional traversal) */}
          <nav aria-label="Appeal steps" className="flex items-center gap-1 overflow-x-auto">
            {steps.map((s, idx) => {
              const StepIcon = s.icon;
              return (
                <React.Fragment key={s.id}>
                  {idx > 0 && <span className="text-muted-foreground/30 text-xs select-none">/</span>}
                  <button
                    type="button"
                    onClick={() => onNavigateView(s.view)}
                    aria-current={s.isActive ? "step" : undefined}
                    className={cn(
                      "px-2.5 py-1 rounded-md text-xs transition-all cursor-pointer inline-flex items-center gap-1.5 shrink-0",
                      s.isActive
                        ? "bg-primary text-primary-foreground font-semibold shadow-2xs"
                        : s.isCompleted
                        ? "bg-muted/40 text-foreground hover:bg-muted/70 font-medium"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted/30"
                    )}
                    title={`Go to ${s.title}`}
                  >
                    <StepIcon className={cn("size-3.5 shrink-0", s.isActive ? "text-primary-foreground" : "text-muted-foreground")} />
                    <span>{s.title}</span>
                  </button>
                </React.Fragment>
              );
            })}
          </nav>
        </div>

        {/* Main Header Content: 1 sentence + 1 date + Navigation buttons */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1 min-w-0 flex-1">
            {/* 1 Sentence: What happened */}
            <p className="text-sm font-semibold text-foreground leading-snug">
              {whatHappened}
            </p>

            {/* 1 Date: What to do by when */}
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground pt-0.5">
              <Clock className={cn("size-3.5 shrink-0", isUrgent ? "text-destructive" : "text-primary")} />
              <span className={cn("font-medium", isUrgent ? "text-destructive font-bold" : "text-foreground/80")}>
                {deadline}
              </span>
            </div>
          </div>

          {/* Action Buttons: Back / Next Step + Details Toggle */}
          <div className="flex items-center gap-2 shrink-0 self-start sm:self-center">
            {/* Contextual Back button when beyond step 1 */}
            {isStep2 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onNavigateView("evidence")}
                className="h-9 px-3 text-xs font-medium gap-1 text-muted-foreground hover:text-foreground cursor-pointer"
                title="Go back to Step 1: Your proof"
              >
                <ArrowLeft className="size-3.5" />
                <span>Back to Proof</span>
              </Button>
            )}

            {isStep3 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onNavigateView("studio")}
                className="h-9 px-3 text-xs font-medium gap-1 text-muted-foreground hover:text-foreground cursor-pointer"
                title="Go back to Step 2: Your letter"
              >
                <ArrowLeft className="size-3.5" />
                <span>Back to Letter</span>
              </Button>
            )}

            {(!isStep1 && !isStep2 && !isStep3) && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onNavigateView("studio")}
                className="h-9 px-3 text-xs font-medium gap-1 text-muted-foreground hover:text-foreground cursor-pointer"
                title="Back to Appeal Letter"
              >
                <ArrowLeft className="size-3.5" />
                <span>Back</span>
              </Button>
            )}

            {/* Primary Action Button (forward navigation: Step 1 -> Letter, Step 2 -> Send/Track).
                Hidden only when it would navigate to the current view. */}
            {primaryButtonTarget && primaryButtonTarget !== currentView && (
              <Button
                size="sm"
                onClick={primaryButtonAction}
                className="h-9 px-4 text-xs font-semibold shadow-xs gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90 cursor-pointer"
                title={isStep1 ? "Go to Step 2: Your letter" : isStep2 ? "Go to Step 3: Send & track" : primaryButtonLabel}
              >
                <span>{primaryButtonLabel}</span>
                {(isStep1 || isStep2) && <ArrowRight className="size-3.5" />}
              </Button>
            )}

            <DetailModeToggle compact className="inline-flex" />
          </div>
        </div>
      </div>
    );
  }

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
            title={isDetailed ? "Click to view statutory ERISA 29 U.S.C. § 1132(c) penalty exposure and liability breakdown" : "Click to see time left and possible late fees"}
          >
            {isUrgent ? (
              <HourglassHigh className="size-3.5 shrink-0 text-destructive" />
            ) : (
              <Scales className="size-3.5 shrink-0 text-primary" />
            )}
            <span className="font-semibold">
              {isDetailed ? "$164/day ERISA exposure" : "Fees they may owe"}
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
            title={isDetailed ? "Open real-time 29 CFR case audit trail drawer" : "Open full history of this case"}
          >
            <Clock className="size-3 text-cyan-400" />
            <span>{isDetailed ? "Audit Trail" : "History"}</span>
          </Button>

          {isWon ? (
            <div className="flex items-center gap-1 text-xs font-mono px-2 py-1 rounded bg-emerald-500/10 border border-emerald-500/20">
              <CheckCircle className="size-3.5 text-emerald-500" />
              <span className="font-bold text-emerald-600 dark:text-emerald-400 text-xs">
                {isDetailed ? "Overturned & Won" : "Won"}
              </span>
            </div>
          ) : (claim.appealReadinessScore ?? claim.evidenceCoverageScore ?? claim.overturnProbabilityScore) !== undefined ? (
            <div className="flex items-center gap-1 text-xs font-mono px-2 py-1 rounded bg-secondary/80 border border-border/60">
              <TrendUp className="size-3 text-emerald-500" />
              <span className="font-bold text-emerald-600 dark:text-emerald-400 text-xs">
                {claim.appealReadinessScore ?? claim.evidenceCoverageScore ?? claim.overturnProbabilityScore}/100 {isDetailed ? "Readiness" : "Strength"}
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
                  <span>{processingLabel && processingLabel !== "Processing..." ? processingLabel : isDetailed ? "Pipeline Running..." : "Working on it..."}</span>
                </>
              ) : (
                <>
                  <Lightning className="size-3" weight="fill" />
                  <span>{hasAppealContext ? (isDetailed ? "Prepare Appeal" : "Build my appeal") : (isDetailed ? "Complete Context" : "Add your details")}</span>
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
              aria-current={step.isActive ? "step" : undefined}
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
