import React, { useState } from "react";
import {
  FileMagnifyingGlass,
  Warning,
  CheckCircle,
  Check,
  Lightning,
  CircleNotch,
  ArrowsClockwise,
  Shield,
  ArrowRight,
  Stethoscope,
  BookOpen,
  Medal,
  Scales,
  Globe,
  Info,
  Calculator,
} from "@phosphor-icons/react";
import { Claim, ClinicalEvidence, OverturnScoringResult, ScoringCriterion, DiscoveredPolicy } from "../../types";
import { PolicyViewer } from "./PolicyViewer";
import { PrecedentFeed } from "./PrecedentFeed";
import { ClinicalResearchConsole } from "./ClinicalResearchConsole";
import { PolicyDriftSentinel } from "./PolicyDriftSentinel";
import { SimpleEvidenceView } from "./SimpleEvidenceView";
import { formatCurrency, formatDate, stripMarkdownFormatting } from "../../lib/utils";
import { DENIAL_REASON_CODES } from "../../lib/constants";
import { useDetailMode } from "../../hooks/useDetailMode";
import { pillarPlainTitle, PLAIN_FIRST_RUN } from "../../lib/plainCopy";
import { SentinelFlowStepper, FlowView } from "../common/SentinelFlowStepper";
import { PipelineActivityFeed } from "../common/PipelineActivityFeed";
import { Card } from "../ui/card";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Alert, AlertDescription } from "../ui/alert";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../ui/tooltip";
import { toast } from "sonner";

interface EvidenceMatrixProps {
  claim: Claim;
  evidences: ClinicalEvidence[];
  discoveredPolicies?: DiscoveredPolicy[];
  isLoadingEvidences?: boolean;
  onCrawlPolicy: (claimId: string, customUrl?: string) => Promise<unknown>;
  onCrawlPubMed?: (claimId: string, query?: string, customUrl?: string) => Promise<unknown>;
  onCrawlFDA?: (claimId: string, customUrl?: string, deviceName?: string) => Promise<unknown>;
  onCrawlCustomUrl?: (claimId: string, url: string, category?: string, notes?: string) => Promise<unknown>;
  onCrawlMultiSource?: (claimId: string, customUrl?: string) => Promise<unknown>;
  onDiscoverPolicyDirectory?: (
    claimId: string,
    options?: {
      payer?: string;
      specialty?: string;
      customDomain?: string;
      limit?: number;
      saveToEvidenceMatrix?: boolean;
    }
  ) => Promise<unknown>;
  onDeleteEvidence?: (evidenceId: string) => Promise<unknown>;
  onComputeScore: (claimId: string) => Promise<OverturnScoringResult>;
  onNavigateToStudio: () => void;
  onNavigateView?: (view: FlowView) => void;
  onRunAutonomousPipeline?: (claimId?: string) => Promise<unknown>;
  onOpenAuditDrawer?: (tab?: "audit" | "pipeline") => void;
  onOpenIngestion?: (claim?: Claim) => void;
}

export const EvidenceMatrix: React.FC<EvidenceMatrixProps> = ({
  claim,
  evidences,
  discoveredPolicies,
  isLoadingEvidences,
  onCrawlPolicy,
  onCrawlPubMed,
  onCrawlFDA,
  onCrawlCustomUrl,
  onCrawlMultiSource,
  onDiscoverPolicyDirectory,
  onDeleteEvidence,
  onComputeScore,
  onNavigateToStudio,
  onNavigateView,
  onRunAutonomousPipeline,
  onOpenAuditDrawer,
  onOpenIngestion,
}) => {
  const { isDetailed } = useDetailMode();
  const [activeTab, setActiveTab] = useState<string>("policy");
  const [isScoring, setIsScoring] = useState(false);
  const [isUnifiedAnalyzing, setIsUnifiedAnalyzing] = useState(false);
  const [scoringResult, setScoringResult] = useState<OverturnScoringResult | null>(
    null
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const denialReason = DENIAL_REASON_CODES[claim.denialReasonCode];

  const hasAnalyzedEvidence = Boolean(
    (evidences && evidences.length > 0) ||
    claim.overturnProbabilityScore !== undefined ||
    scoringResult !== null ||
    (claim.evidenceCount !== undefined && claim.evidenceCount > 0)
  );

  const hasDraftedBrief = Boolean(
    claim.latestAppeal ||
    claim.status === "review_provisional" ||
    claim.status === "ready_for_review" ||
    claim.status === "dispatched" ||
    claim.status === "won" ||
    claim.status === "lost" ||
    claim.status === "escalated"
  );

  // 1-Click Complete Analysis (Crawl CPB + Compute Score in a single fluid action)
  const handleRunCompleteAnalysis = async () => {
    setIsUnifiedAnalyzing(true);
    setErrorMessage(null);
    const toastId = toast.loading("Crawling payer Clinical Policy Bulletin & auditing Statutory Appeal Readiness...");
    try {
      await onCrawlPolicy(claim._id);
      const result = await onComputeScore(claim._id);
      setScoringResult(result);
      toast.success("Policy indexed & Statutory Appeal Readiness evaluated successfully", { id: toastId });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to execute complete clinical policy analysis.";
      setErrorMessage(msg);
      toast.error(msg, { id: toastId });
    } finally {
      setIsUnifiedAnalyzing(false);
    }
  };

  const handleRunScoring = async () => {
    setIsScoring(true);
    setErrorMessage(null);
    const toastId = toast.loading("Auditing 4-pillar Evidence Coverage & Precedent Match...");
    try {
      const result = await onComputeScore(claim._id);
      setScoringResult(result);
      toast.success(`Evidence Coverage: ${result.overturnProbabilityScore}/100 evaluated`, { id: toastId });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to calculate Evidence Coverage.";
      setErrorMessage(msg);
      toast.error(msg, { id: toastId });
    } finally {
      setIsScoring(false);
    }
  };

  // Derive active scoring breakdown strictly from real computation without fabricating math
  const breakdown: ScoringCriterion[] | undefined =
    scoringResult?.scoringBreakdown || claim.scoringBreakdown;

  const keyContradictions =
    scoringResult?.keyPolicyContradictions || [];

  const getCriteriaIcon = (category: string) => {
    switch (category) {
      case "policy_alignment":
        return <BookOpen className="size-3.5 text-blue-500 shrink-0 mt-0.5" />;
      case "clinical_documentation":
        return <Stethoscope className="size-3.5 text-emerald-500 shrink-0 mt-0.5" />;
      case "statutory_erisa":
        return <Shield className="size-3.5 text-purple-500 shrink-0 mt-0.5" />;
      case "precedent_strength":
        return <Medal className="size-3.5 text-amber-500 shrink-0 mt-0.5" />;
      default:
        return <Shield className="size-3.5 text-primary shrink-0 mt-0.5" />;
    }
  };

  const isBackgroundPipelineRunning =
    !hasDraftedBrief &&
    (claim.workflowStatus === "inProgress" ||
      claim.status === "parsing" ||
      claim.status === "analyzing" ||
      claim.status === "precedent_matched" ||
      claim.status === "drafting");

  const pipelineStepLabel =
    claim.status === "drafting"
      ? "Step 3/3: Synthesizing cited ERISA appeal brief"
      : claim.status === "precedent_matched"
      ? "Step 2/3: Evaluating clinical rubric & policy criteria"
      : claim.status === "analyzing"
      ? "Step 1/3: Resolving payer gateway & indexing Clinical Policy Bulletins"
      : "Step 1/3: Initializing Autonomous Sentinel review";

  return (
    <div className="space-y-4 animate-fadeIn pb-24">
      {/* 4-Step Guided Sentinel Stepper */}
      <SentinelFlowStepper
        claim={claim}
        currentView="evidence"
        onNavigateView={(v) => {
          if (onNavigateView) onNavigateView(v);
          else if (v === "studio") onNavigateToStudio();
        }}
        evidencesCount={evidences.length}
        hasDraftedBrief={hasDraftedBrief}
        isProcessing={isUnifiedAnalyzing || isScoring || isBackgroundPipelineRunning}
        processingLabel={
          isUnifiedAnalyzing
            ? "Running Complete Analysis..."
            : isScoring
            ? "Evaluating Rubric..."
            : isBackgroundPipelineRunning
            ? pipelineStepLabel
            : "Processing..."
        }
        onRunAutonomousPipeline={
          onRunAutonomousPipeline ? () => onRunAutonomousPipeline(claim._id) : undefined
        }
        onOpenAuditDrawer={onOpenAuditDrawer}
        onOpenIngestion={onOpenIngestion}
      />

      {/* Background pipeline progress: visible the moment ingestion hands off */}
      {isBackgroundPipelineRunning && (
        <Card className="p-3.5 border-primary/30 bg-primary/5" role="status">
          <div className="flex items-start gap-2.5">
            <CircleNotch className="size-4 animate-spin text-primary shrink-0 mt-0.5" />
            <div className="space-y-1.5 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold text-foreground">
                  Appeal preparation pipeline actively running
                </span>
                <Badge variant="outline" className="font-mono text-[10px] border-primary/40 text-primary">
                  {(claim.status || "analyzing").replace(/_/g, " ")}
                </Badge>
              </div>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                {pipelineStepLabel}. Evidence clauses, Evidence Coverage Score, and the cited appeal brief
                stream in live below. You can keep working; no manual click required.
              </p>
              <div className="flex items-center gap-1.5 text-[10px] font-mono text-muted-foreground" aria-hidden="true">
                <span className="text-emerald-500 inline-flex items-center gap-0.5">
                  <Check className="size-3 text-emerald-500 shrink-0" weight="bold" />
                  <span>Ingested</span>
                </span>
                <span>→</span>
                <span className={claim.status === "analyzing" || claim.status === "precedent_matched" || claim.status === "drafting" || claim.workflowStatus === "inProgress" ? "text-primary font-semibold" : ""}>
                  Crawl + Score
                </span>
                <span>→</span>
                <span className={claim.status === "drafting" ? "text-primary font-semibold" : ""}>
                  Synthesize brief
                </span>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Live agent thought stream (self-hides for older runs) */}
      <PipelineActivityFeed
        claimId={claim._id}
        onOpenTimeline={() => onOpenAuditDrawer?.("pipeline")}
      />

      {/* Branch: Simple Mode vs Expert Mode */}
      {!isDetailed ? (
        <SimpleEvidenceView
          claim={claim}
          evidences={evidences}
          scoringResult={scoringResult}
          onNavigateToStudio={onNavigateToStudio}
          onRunCompleteAnalysis={handleRunCompleteAnalysis}
          isAnalyzing={isUnifiedAnalyzing || isScoring}
        />
      ) : (
        <>
          {/* Header & Main Control Toolbar (Expert Mode) */}
          <Card className="p-4">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-xs">
                  <FileMagnifyingGlass className="size-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-base font-semibold text-foreground font-sans">
                      Clinical Evidence Matrix & Policy Inspector
                    </h2>
                    <Badge variant="outline" className="font-mono text-[10px]">
                      Deterministic 4-Pillar Rubric
                    </Badge>
                    {hasAnalyzedEvidence && (
                      <Badge variant="outline" className="font-mono text-[10px] text-emerald-600 dark:text-emerald-400 border-emerald-500/30">
                        Analysis Complete
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Cross-referencing denial codes against official Clinical Policy Bulletins and legal precedents
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 flex-wrap shrink-0">
                {hasAnalyzedEvidence ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleRunCompleteAnalysis}
                    disabled={isUnifiedAnalyzing || isScoring || isBackgroundPipelineRunning}
                    className="h-8 rounded-md text-xs px-3 gap-1.5 shrink-0"
                    title={isBackgroundPipelineRunning ? "Pipeline already running in background" : "Re-crawl policy bulletin and recalculate 4-pillar score"}
                  >
                    {isUnifiedAnalyzing ? (
                      <>
                        <CircleNotch className="size-3.5 animate-spin" />
                        <span>Re-analyzing...</span>
                      </>
                    ) : (
                      <>
                        <ArrowsClockwise className="size-3.5" />
                        <span>Re-run Analysis</span>
                      </>
                    )}
                  </Button>
                ) : isBackgroundPipelineRunning ? (
                  <Button
                    size="sm"
                    disabled
                    variant="outline"
                    className="h-8 rounded-md text-xs px-3.5 gap-1.5 shrink-0 border-primary/40 bg-primary/10 text-primary cursor-not-allowed font-medium shadow-none"
                    title="Autonomous pipeline is actively analyzing policies and synthesizing the appeal brief"
                  >
                    <CircleNotch className="size-3.5 animate-spin text-primary" />
                    <span>Autonomous Pipeline Active</span>
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    onClick={handleRunCompleteAnalysis}
                    disabled={isUnifiedAnalyzing || isScoring}
                    className="h-8 rounded-md text-xs px-3.5 gap-1.5 shrink-0 bg-primary text-primary-foreground font-semibold shadow-xs hover:bg-primary/90 transition-all cursor-pointer"
                    title="Automatically index Clinical Policy Bulletin and audit Statutory Appeal Readiness"
                  >
                    {isUnifiedAnalyzing ? (
                      <>
                        <CircleNotch className="size-3.5 animate-spin" />
                        <span>Analyzing Policy...</span>
                      </>
                    ) : (
                      <>
                        <Lightning className="size-3.5" weight="fill" />
                        <span>1-Click Complete Analysis</span>
                      </>
                    )}
                  </Button>
                )}
              </div>
            </div>
          </Card>

      {/* Error Alert */}
      {errorMessage && (
        <Alert variant="destructive">
          <Warning className="size-4" />
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      )}

      {/* Case strength showcase banner */}
      {(claim.overturnProbabilityScore !== undefined || scoringResult) && (
        <Card className="p-4 border-emerald-500/30 bg-emerald-500/5 space-y-3">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-border/60 pb-3">
            <div className="flex items-center gap-3.5">
              <div className="flex h-12 min-w-[5rem] shrink-0 items-center justify-center rounded-xl border border-emerald-500/30 bg-emerald-500/15 px-3 font-mono text-lg font-bold tracking-tight tabular-nums text-emerald-600 dark:text-emerald-400 sm:text-xl">
                {scoringResult
                  ? scoringResult.overturnProbabilityScore
                  : claim.overturnProbabilityScore}
                <span className="text-xs font-normal text-emerald-600/70 dark:text-emerald-400/70 ml-1">/100</span>
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-sm font-semibold text-foreground">
                    {isDetailed ? "Evidence Coverage & Precedent Match" : "Your case strength"}
                  </h3>
                  <Badge variant="secondary" className="font-mono text-[10px] text-emerald-600 dark:text-emerald-400">
                    {(scoringResult ? scoringResult.overturnProbabilityScore : (claim.overturnProbabilityScore ?? 0)) >= 80
                      ? (isDetailed ? "Comprehensive Coverage" : "Strong case")
                      : (scoringResult ? scoringResult.overturnProbabilityScore : (claim.overturnProbabilityScore ?? 0)) >= 55
                        ? (isDetailed ? "Evidence Gaps Identified" : "Missing some proof")
                        : (isDetailed ? "Incomplete Coverage" : "Needs more proof")}
                  </Badge>
                  {isDetailed && (
                    <Badge variant="outline" className="font-mono text-[10px] border-emerald-500/30 text-emerald-600 dark:text-emerald-400">
                      Evidence Coverage
                    </Badge>
                  )}
                  {(claim.evidenceIntegrity?.scoreStatus === "provisional_capped" || claim.status === "review_provisional") && (
                    <Badge variant="outline" className="font-mono text-[10px] border-amber-500/40 text-amber-500 bg-amber-500/10">
                      {isDetailed ? "Provisional (Capped)" : "Limited proof"}
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {isDetailed
                    ? "Evidentiary completeness audit evaluating 4 objective statutory pillars benchmarked against insurer CPBs and external review precedents."
                    : "How complete your proof is — based on insurer rules, your records, your rights, and similar wins."}
                </p>
              </div>
            </div>
          </div>
          {claim.evidenceIntegrity?.degradationWarnings && claim.evidenceIntegrity.degradationWarnings.length > 0 && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 text-xs text-amber-200/90 leading-relaxed">
              <span className="font-semibold text-amber-300">
                {isDetailed ? "Evidentiary Caveat:" : "Important note:"}
              </span>{" "}
              {claim.evidenceIntegrity.degradationWarnings.join(" ")}
            </div>
          )}
          <p className="text-[11px] text-muted-foreground/80 italic leading-relaxed">
            {isDetailed
              ? "Evidence Coverage Audit: Evaluates documentation completeness and ERISA 29 CFR § 2560.503-1 disclosure requirements against published clinical criteria. Does not constitute an actuarial legal prediction or guarantee of payer approval."
              : "This score shows how complete your proof is. It is not a guarantee the insurer will pay."}
          </p>

          {/* Case strength breakdown */}
          {(!breakdown || breakdown.length === 0) && (
            <div className="rounded-lg border border-dashed border-border/80 bg-muted/20 p-4 text-center space-y-2">
              <p className="text-xs text-muted-foreground">
                {isDetailed ? "Scoring breakdown unavailable — re-run scoring to evaluate 4-pillar criteria." : "Breakdown not ready yet — check again to score your proof."}
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={handleRunScoring}
                disabled={isScoring || isUnifiedAnalyzing}
                className="h-7 text-xs gap-1.5"
              >
                <Calculator className="size-3.5" />
                <span>{isScoring ? (isDetailed ? "Computing..." : "Checking...") : (isDetailed ? "Run 4-Pillar Scoring" : "Score my proof")}</span>
              </Button>
            </div>
          )}

          {breakdown && breakdown.length > 0 && (
            <div className="space-y-2.5">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <Scales className="size-3.5 text-primary" />
                  {isDetailed ? "Deterministic Scoring Criteria (100-Point Appeal Rubric):" : "What makes up your score:"}
                </span>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors border border-dashed border-border/80 hover:border-primary/50 cursor-help"
                      >
                        <Info className="size-3.5 text-primary shrink-0" />
                        <span>{isDetailed ? `How is this score calculated? (${breakdown.reduce((acc, c) => acc + c.score, 0)} / 100 pts)` : "How is this scored?"}</span>
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top" align="end" className="w-88 max-w-md space-y-3 p-3.5 font-sans shadow-xl border-border/80 bg-popover text-foreground">
                      <div className="flex items-center justify-between border-b border-border/60 pb-2">
                        <div>
                          <h4 className="text-xs font-semibold text-foreground">
                            {isDetailed ? "How We Calculate Your Statutory Appeal Readiness Score" : "How we score your case"}
                          </h4>
                          <p className="text-[11px] text-muted-foreground">
                            {isDetailed ? "Evidence-based evaluation across 4 legal & clinical pillars" : "4 checks that make an appeal strong"}
                          </p>
                        </div>
                        <Badge variant="outline" className="font-mono text-[10px] text-emerald-600 dark:text-emerald-400 border-emerald-500/30 shrink-0">
                          100 Pts Model
                        </Badge>
                      </div>

                      <div className="space-y-2 text-[11px] leading-snug">
                        <div className="rounded-md bg-muted/40 border border-border/50 p-2 space-y-1">
                          <div className="flex items-center justify-between font-semibold text-foreground text-[11px]">
                            <span className="flex items-center gap-1.5">
                              <BookOpen className="size-3 text-primary" />
                              {isDetailed ? "1. Insurer Policy Criteria" : "1. Their own rules"}
                            </span>
                            <span className="font-mono text-[10px] text-primary">Max 35 pts</span>
                          </div>
                          <p className="text-muted-foreground text-[10.5px]">
                            {isDetailed ? "Verified against published insurer Clinical Policy Bulletins (CPBs) and national coverage guidelines." : "Their published rules say when they should pay."}
                          </p>
                        </div>

                        <div className="rounded-md bg-muted/40 border border-border/50 p-2 space-y-1">
                          <div className="flex items-center justify-between font-semibold text-foreground text-[11px]">
                            <span className="flex items-center gap-1.5">
                              <Stethoscope className="size-3 text-primary" />
                              {isDetailed ? "2. Clinical Records & Step-Therapy" : "2. Your medical records"}
                            </span>
                            <span className="font-mono text-[10px] text-primary">Max 25 pts</span>
                          </div>
                          <p className="text-muted-foreground text-[10.5px]">
                            {isDetailed ? "Diagnostic imaging reports, conservative care history, and treating physician clinical necessity letters." : "Visits, tests, and treatments you already tried."}
                          </p>
                        </div>

                        <div className="rounded-md bg-muted/40 border border-border/50 p-2 space-y-1">
                          <div className="flex items-center justify-between font-semibold text-foreground text-[11px]">
                            <span className="flex items-center gap-1.5">
                              <Shield className="size-3 text-primary" />
                              {isDetailed ? "3. Federal ERISA Protections" : "3. Your appeal rights"}
                            </span>
                            <span className="font-mono text-[10px] text-primary">Max 20 pts</span>
                          </div>
                          <p className="text-muted-foreground text-[10.5px]">
                            {isDetailed ? "Procedural rights under 29 CFR § 2560.503-1 requiring insurers to disclose internal clinical review standards." : "The law that forces them to show the rules they used."}
                          </p>
                        </div>

                        <div className="rounded-md bg-muted/40 border border-border/50 p-2 space-y-1">
                          <div className="flex items-center justify-between font-semibold text-foreground text-[11px]">
                            <span className="flex items-center gap-1.5">
                              <Scales className="size-3 text-primary" />
                              {isDetailed ? "4. Independent Precedent Rulings" : "4. Similar cases that won"}
                            </span>
                            <span className="font-mono text-[10px] text-primary">Max 20 pts</span>
                          </div>
                          <p className="text-muted-foreground text-[10.5px]">
                            {isDetailed ? "Historical overturn benchmarks from state insurance commissions and Independent Medical Reviews (IMR)." : "Other people who won with the same issue."}
                          </p>
                        </div>
                      </div>

                      <div className="text-[10px] text-muted-foreground border-t border-border/50 pt-2 flex items-center justify-between">
                        <span>{isDetailed ? "Readiness Tiers: Comprehensive Dossier (80+) • Evidence Gaps Identified (55–79) • Incomplete Dossier (<55)" : "Strong (80+) • Missing some proof (55–79) • Needs more proof (<55)"}</span>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>

              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
                {breakdown.map((crit, idx) => {
                  const pct = Math.min(100, Math.round((crit.score / crit.maxScore) * 100));
                  return (
                    <div
                      key={idx}
                      className="rounded-lg bg-card/90 border border-border/80 p-2.5 space-y-1.5 text-xs shadow-xs hover:border-primary/40 transition-colors"
                      title={stripMarkdownFormatting(crit.rationale)}
                    >
                      <div className="flex items-start justify-between gap-1.5">
                        <div className="flex items-start gap-1.5 min-w-0">
                          {getCriteriaIcon(crit.category)}
                          <div className="min-w-0">
                            <span className="font-semibold text-foreground block leading-tight truncate">
                              {isDetailed ? crit.criterion : pillarPlainTitle(crit.category, crit.criterion)}
                            </span>
                            <span className="text-[10px] text-muted-foreground font-mono uppercase">
                              Max {crit.maxScore} pts
                            </span>
                          </div>
                        </div>
                        <Badge
                          variant="secondary"
                          className="font-mono font-bold shrink-0 text-[11px] bg-muted/60"
                        >
                          {crit.score}/{crit.maxScore}
                        </Badge>
                      </div>

                      {/* Progress bar */}
                      <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${
                            pct >= 85
                              ? "bg-emerald-500"
                              : pct >= 65
                              ? "bg-amber-500"
                              : "bg-rose-500"
                          }`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>

                      <p className="text-[10.5px] text-muted-foreground truncate leading-relaxed">
                        {stripMarkdownFormatting(crit.rationale)}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Key Contradictions List */}
          {keyContradictions.length > 0 && (
            <div className="space-y-2 pt-1">
              <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <FileMagnifyingGlass className="size-3.5 text-primary" />
                {isDetailed ? "Key Insurer Contradictions Identified:" : "Where their letter disagrees with their rules:"}
              </span>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {keyContradictions.map((contra, idx) => (
                  <div
                    key={idx}
                    className="flex items-start gap-2 rounded-lg bg-card border border-border p-2.5 text-xs text-foreground/90"
                  >
                    <CheckCircle className="size-3.5 text-emerald-500 shrink-0 mt-0.5" />
                    <span className="leading-snug">{stripMarkdownFormatting(contra)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Winning Precedent Summary if available */}
          {scoringResult?.winningPrecedentSummary && (
            <div className="rounded-lg bg-muted/40 border border-border p-2.5 text-xs flex items-start gap-2">
              <Medal className="size-4 text-amber-500 shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <span className="font-semibold text-foreground block">{isDetailed ? "Winning Precedent Summary:" : "Similar cases that won:"}</span>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  {stripMarkdownFormatting(scoringResult.winningPrecedentSummary)}
                </p>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* Dual Pane Layout: Baseline (5 cols) & Evidence Feed (7 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* Left Column: Denial Baseline & Patient Record */}
        <div className="lg:col-span-5 space-y-3 lg:sticky lg:top-4 self-start lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto lg:pr-1">
          <Card className="p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-border/60 pb-2.5">
              <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <Warning className="size-3.5 text-destructive" />
                {isDetailed ? "Original Denial Baseline" : "What the insurer said"}
              </span>
              <Badge variant="outline" className="font-mono">
                {claim.claimNumber}
              </Badge>
            </div>

            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="text-[10px] text-muted-foreground font-mono block">Patient</span>
                  <span className="font-semibold text-foreground">
                    {claim.patient?.name || "Patient Record"}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-muted-foreground font-mono block">Member ID</span>
                  <span className="font-mono text-foreground">{claim.patient?.memberId || "N/A"}</span>
                </div>
                <div>
                  <span className="text-[10px] text-muted-foreground font-mono block">{isDetailed ? "Insurance Payer" : "Insurer"}</span>
                  <span className="font-semibold text-foreground">{claim.patient?.insurancePayer}</span>
                </div>
                <div>
                  <span className="text-[10px] text-muted-foreground font-mono block">{isDetailed ? "Service Date" : "Date of care"}</span>
                  <span className="font-mono text-muted-foreground">{formatDate(claim.serviceDate)}</span>
                </div>
              </div>

              <div className="rounded-lg bg-muted/40 border border-border p-3 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase font-mono text-muted-foreground">{isDetailed ? "Disputed Charge" : "Bill amount"}</span>
                  <span className="text-sm font-mono font-bold text-destructive">
                    {formatCurrency(claim.deniedAmount)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>{isDetailed ? "Patient Responsibility:" : "They say you owe:"}</span>
                  <span className="font-mono font-semibold text-foreground">
                    {formatCurrency(claim.patientOwedAmount)}
                  </span>
                </div>
              </div>

              {/* Procedure & Denial Codes */}
              <div className="space-y-2 pt-1">
                <div>
                  <span className="text-[10px] text-muted-foreground font-mono block mb-1">
                    {isDetailed ? "CPT Procedure Codes:" : "Care received:"}
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {claim.cptCodes.map((cpt) => (
                      <Badge key={cpt} variant="secondary" className="font-mono">
                        CPT {cpt}
                      </Badge>
                    ))}
                  </div>
                </div>

                <div>
                  <span className="text-[10px] text-muted-foreground font-mono block mb-1">
                    {isDetailed ? "Denial Reason (CARC):" : `${PLAIN_FIRST_RUN.whyDenied}:`}
                  </span>
                  <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs space-y-1.5">
                    <div className="flex items-center gap-1.5 font-mono font-bold text-destructive text-xs">
                      <Warning className="size-3.5 shrink-0" />
                      <span>
                        {isDetailed
                          ? claim.denialReasonCode
                          : denialReason?.title || "Their stated reason"}
                      </span>
                      {isDetailed && denialReason?.title && (
                        <span className="font-normal text-muted-foreground font-sans truncate">
                          — {denialReason.title}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] leading-relaxed text-foreground/90 font-sans">
                      {claim.denialReasonDescription || denialReason?.description}
                    </p>
                  </div>
                </div>
              </div>

              <div className="pt-1">
                <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <Stethoscope className="size-3.5" />
                  <span>{isDetailed ? `Treating Provider: ${claim.providerName}` : `Your doctor: ${claim.providerName}`}</span>
                </div>
              </div>
            </div>
          </Card>

          <Card className="p-3.5 space-y-1.5 bg-muted/30">
            <div className="flex items-center gap-1.5 font-semibold text-xs text-foreground">
              <Shield className="size-3.5" />
              <span>{isDetailed ? "ERISA Regulatory Protection" : "You have a right to see their rules"}</span>
            </div>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              {isDetailed
                ? "Under 29 CFR § 2560.503-1, the insurer is legally required to disclose all internal Clinical Policy Bulletins and guidelines used in issuing this adverse determination."
                : "The law says the insurer must show the rules they used to deny you. We use those rules to challenge them."}
            </p>
          </Card>
        </div>

        {/* Right Column: Interactive Policy & Precedent Tabs */}
        <div className="lg:col-span-7 space-y-3">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList variant="line" className="w-full">
              <TabsTrigger value="policy" className="gap-1.5">
                <BookOpen className="size-3.5" />
                <span>{isDetailed ? `Evidence Dossier (${evidences.length})` : `Proof (${evidences.length})`}</span>
              </TabsTrigger>
              <TabsTrigger value="drift" className="gap-1.5">
                <Scales className="size-3.5 text-cyan-400" />
                <span>{isDetailed ? "Policy Drift Sentinel" : "Policy changes"}</span>
              </TabsTrigger>
              <TabsTrigger value="research" className="gap-1.5">
                <Globe className="size-3.5 text-primary" />
                <span>{isDetailed ? "Research Hub" : "Deeper research"}</span>
              </TabsTrigger>
              <TabsTrigger value="precedents" className="gap-1.5">
                <Medal className="size-3.5" />
                <span>{isDetailed ? "Precedent Matches" : "Similar wins"}</span>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="policy" className="pt-1">
              <PolicyViewer
                evidences={evidences}
                isLoading={isLoadingEvidences || isUnifiedAnalyzing || (isBackgroundPipelineRunning && evidences.length === 0)}
                onDeleteEvidence={onDeleteEvidence}
                onOpenResearchConsole={() => setActiveTab("research")}
                onOpenPolicyDrift={() => setActiveTab("drift")}
              />
            </TabsContent>

            <TabsContent value="drift" className="pt-1">
              <PolicyDriftSentinel
                claim={claim}
                evidences={evidences}
                onNavigateToStudio={onNavigateToStudio}
              />
            </TabsContent>

            <TabsContent value="research" className="pt-1">
              <ClinicalResearchConsole
                claim={claim}
                evidences={evidences}
                discoveredPolicies={discoveredPolicies}
                onCrawlCPB={onCrawlPolicy}
                onCrawlPubMed={onCrawlPubMed || (async () => {})}
                onCrawlFDA={onCrawlFDA || (async () => {})}
                onCrawlCustomUrl={onCrawlCustomUrl || (async () => {})}
                onCrawlMultiSource={onCrawlMultiSource || (async () => {})}
                onDiscoverDirectory={onDiscoverPolicyDirectory}
                onDeleteEvidence={onDeleteEvidence}
                onComputeScore={onComputeScore}
                onNavigateToStudio={onNavigateToStudio}
              />
            </TabsContent>

            <TabsContent value="precedents" className="pt-1">
              <PrecedentFeed claim={claim} />
            </TabsContent>
          </Tabs>
        </div>
      </div>
        </>
      )}

      {/* Sticky Bottom Next-Step Action Bar */}
      <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-border bg-background/95 backdrop-blur-md p-3 px-4 sm:px-8 flex items-center justify-between shadow-lg print:hidden">
        <div className="flex items-center gap-3">
          <Badge variant="outline" className="font-mono text-xs hidden sm:inline-flex">
            {isDetailed ? "Step 1 of 3: Evidence & CPB" : "Step 1 of 3: Your proof"}
          </Badge>
          <span className="text-xs text-muted-foreground">
            {evidences.length > 0
              ? `${evidences.length} ${isDetailed ? "Clinical Clauses Indexed" : "proof documents"} • Score: ${claim.overturnProbabilityScore !== undefined ? `${claim.overturnProbabilityScore}/100` : "Calculated"}`
              : (isDetailed ? "Review clinical evidence before proceeding to brief synthesis" : "Check your proof before writing your letter")}
          </span>
        </div>

        <Button
          onClick={onNavigateToStudio}
          className="gap-2 text-xs bg-primary text-primary-foreground font-semibold shadow-md hover:shadow-lg transition-all"
          title={isDetailed ? "Proceed to Collaborative Appeal Studio to review and synthesize appeal brief" : "Go to your appeal letter"}
        >
          <span>
            {hasDraftedBrief
              ? (isDetailed ? "Next: Review Synthesized Appeal Brief in Studio" : "Next: Review your letter")
              : (isDetailed ? "Next: Review & Synthesize Appeal Brief in Studio" : "Next: Write your letter")}
          </span>
          <ArrowRight className="size-3.5" />
        </Button>
      </div>
    </div>
  );
};
