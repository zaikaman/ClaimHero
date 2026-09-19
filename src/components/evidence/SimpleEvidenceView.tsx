import React, { useState, useMemo } from "react";
import {
  Shield,
  BookOpen,
  Stethoscope,
  Scales,
  ArrowRight,
  ArrowsClockwise,
  CircleNotch,
  CheckCircle,
  FileText,
  CaretDown,
  CaretUp,
  Eye,
} from "@phosphor-icons/react";
import { Claim, ClinicalEvidence, OverturnScoringResult, ScoringCriterion } from "../../types";
import { Card } from "../ui/card";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { stripMarkdownFormatting, cn } from "../../lib/utils";
import { ClauseInspectorDrawer } from "./ClauseInspectorDrawer";
import { resolveProviderDisplayName } from "../../lib/displaySafety";

interface SimpleEvidenceViewProps {
  claim: Claim;
  evidences: ClinicalEvidence[];
  scoringResult: OverturnScoringResult | null;
  onNavigateToStudio: () => void;
  onRunCompleteAnalysis: () => Promise<void>;
  isAnalyzing?: boolean;
  isPipelineRunning?: boolean;
}

/**
 * Normalize a treating-provider display name without inventing titles.
 * Shared implementation lives in `src/lib/displaySafety.ts` so every trusted
 * view collapses LLM-redaction placeholders identically; kept re-exported
 * here for existing imports.
 */
export const formatProviderDisplayName = resolveProviderDisplayName;

export const SimpleEvidenceView: React.FC<SimpleEvidenceViewProps> = ({
  claim,
  evidences,
  scoringResult,
  onNavigateToStudio,
  onRunCompleteAnalysis,
  isAnalyzing = false,
  isPipelineRunning = false,
}) => {
  const [showFullRubric, setShowFullRubric] = useState(false);
  const [inspectedEvidence, setInspectedEvidence] = useState<ClinicalEvidence | null>(null);

  const activeScore =
    scoringResult?.appealReadinessScore ??
    scoringResult?.evidenceCoverageScore ??
    scoringResult?.overturnProbabilityScore ??
    claim.appealReadinessScore ??
    claim.evidenceCoverageScore ??
    claim.overturnProbabilityScore ??
    0;
  const breakdown: ScoringCriterion[] = scoringResult?.scoringBreakdown || claim.scoringBreakdown || [];
  const keyContradictions = scoringResult?.keyPolicyContradictions || [];

  const scoreBadgeText =
    activeScore >= 80 ? "Well documented" : activeScore >= 55 ? "Missing some proof" : "Needs more proof";

  const scoreBadgeColor =
    activeScore >= 80
      ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/30"
      : activeScore >= 55
      ? "text-amber-400 bg-amber-500/10 border-amber-500/30"
      : "text-rose-400 bg-rose-500/10 border-rose-500/30";

  // Work is in flight (manual analysis or the background pipeline). Until a
  // finding is backed by retrieved evidence or computed scoring, the view
  // must show honest gathering/empty states — never fabricated specifics.
  const isWorking = isAnalyzing || isPipelineRunning;
  const providerDisplayName = formatProviderDisplayName(claim.providerName);
  const hasScoreSignal = scoringResult !== null || breakdown.length > 0;
  const showAnalyzingScore = isWorking && !hasScoreSignal;

  // Top 3 Curated Decisive Proof Points ("Smoking Guns")
  const smokingGuns = useMemo(() => {
    // 1. Insurer Rule finding
    const cpbEvidence = evidences.find((e) => e.sourceType === "payer_cpb");
    const topContradiction = keyContradictions[0];
    const ruleFinding = {
      title: "Their Own Published Rules",
      icon: BookOpen,
      iconColor: "text-cyan-400",
      accentBorder: "border-cyan-500/30 hover:border-cyan-500/50",
      accentBg: "bg-cyan-500/5",
      badge: "Insurer Policy",
      summary: topContradiction
        ? stripMarkdownFormatting(topContradiction)
        : cpbEvidence
        ? cpbEvidence.title
        : isWorking
        ? "Checking the insurer's published rules for exceptions that apply to this denial."
        : "No insurer policy exception verified yet. Run a check to review their published rules.",
      quote: cpbEvidence?.citationClause
        ? `Clause: ${cpbEvidence.citationClause}`
        : cpbEvidence?.extractedEvidenceMarkdown
        ? stripMarkdownFormatting(cpbEvidence.extractedEvidenceMarkdown).slice(0, 160) + "..."
        : "Policy findings will appear here once the insurer's published rules are checked.",
      evidenceItem: cpbEvidence || null,
      verified: Boolean(topContradiction || cpbEvidence),
    };

    // 2. Doctor Documentation finding
    const docCrit = breakdown.find((b) => b.category === "clinical_documentation");
    const guidelineEvidence = evidences.find((e) => e.sourceType === "nccn_guideline" || e.sourceType === "pubmed_study");
    const doctorFinding = {
      title: "Your Medical Records",
      icon: Stethoscope,
      iconColor: "text-emerald-400",
      accentBorder: "border-emerald-500/30 hover:border-emerald-500/50",
      accentBg: "bg-emerald-500/5",
      badge: "Doctor Records",
      summary: docCrit?.rationale
        ? stripMarkdownFormatting(docCrit.rationale)
        : guidelineEvidence
        ? guidelineEvidence.title
        : providerDisplayName
        ? isWorking
          ? `Reviewing clinical documentation from ${providerDisplayName}...`
          : `No documentation from ${providerDisplayName} verified yet. Run a check to review the clinical records.`
        : isWorking
        ? "Reviewing the clinical documentation..."
        : "No doctor documentation verified yet. Run a check to review the clinical records.",
      quote: guidelineEvidence?.citationClause
        ? `Clinical Guideline: ${guidelineEvidence.citationClause}`
        : guidelineEvidence?.extractedEvidenceMarkdown
        ? stripMarkdownFormatting(guidelineEvidence.extractedEvidenceMarkdown).slice(0, 160) + "..."
        : "Clinical findings will appear here once the records review completes.",
      evidenceItem: guidelineEvidence || null,
      verified: Boolean(docCrit?.rationale || guidelineEvidence),
    };

    // 3. Federal Rights & Winning Precedent finding
    const legalEvidence = evidences.find((e) => e.sourceType === "legal_precedent");
    const erisaCrit = breakdown.find((b) => b.category === "statutory_erisa");
    const precedentCrit = breakdown.find((b) => b.category === "precedent_strength");
    const rightsFinding = {
      title: "Your Legal Rights & Similar Wins",
      icon: Scales,
      iconColor: "text-purple-400",
      accentBorder: "border-purple-500/30 hover:border-purple-500/50",
      accentBg: "bg-purple-500/5",
      badge: "Federal Rights",
      summary: erisaCrit?.rationale
        ? stripMarkdownFormatting(erisaCrit.rationale)
        : legalEvidence
        ? legalEvidence.title
        : isWorking
        ? "Checking your appeal rights and similar winning cases..."
        : "No legal rights finding verified yet. Run a check to review appeal rights and similar wins.",
      quote: scoringResult?.winningPrecedentSummary
        ? stripMarkdownFormatting(scoringResult.winningPrecedentSummary)
        : precedentCrit?.rationale
        ? stripMarkdownFormatting(precedentCrit.rationale)
        : legalEvidence?.extractedEvidenceMarkdown
        ? stripMarkdownFormatting(legalEvidence.extractedEvidenceMarkdown).slice(0, 160) + "..."
        : "Rights and precedent findings will appear here once the review completes.",
      evidenceItem: legalEvidence || null,
      verified: Boolean(
        erisaCrit?.rationale ||
          scoringResult?.winningPrecedentSummary ||
          precedentCrit?.rationale ||
          legalEvidence
      ),
    };

    return [ruleFinding, doctorFinding, rightsFinding];
  }, [evidences, keyContradictions, breakdown, providerDisplayName, isWorking, scoringResult]);

  const verifiedCount = smokingGuns.filter((g) => g.verified).length;
  const hasVerifiedFindings = verifiedCount > 0;

  return (
    <div className="flex flex-col gap-4 font-sans animate-fadeIn">
      {/* 1. Hero Verdict Card (Clean, Unnested, High Confidence) */}
      <Card className="p-5 border-border/80 bg-card/80 backdrop-blur-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start sm:items-center gap-4">
            {/* Prominent Score Pill (honest while scoring is still running) */}
            <div className="flex h-14 min-w-[5.5rem] shrink-0 items-center justify-center rounded-xl border border-emerald-500/30 bg-emerald-500/15 px-3 font-mono text-2xl font-bold tracking-tight text-emerald-400">
              {showAnalyzingScore ? (
                <CircleNotch className="size-6 animate-spin" aria-label="Scoring in progress" />
              ) : (
                <>
                  {activeScore}
                  <span className="text-xs font-normal text-emerald-400/70 ml-1">/100</span>
                </>
              )}
            </div>

            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base sm:text-lg font-semibold text-foreground">
                  Your case strength
                </h2>
                <Badge variant="outline" className={cn("text-xs font-medium border px-2 py-0.5", showAnalyzingScore ? "text-muted-foreground bg-muted/40 border-border/70" : scoreBadgeColor)}>
                  {showAnalyzingScore ? "Analyzing" : scoreBadgeText}
                </Badge>
                <Badge variant="secondary" className="font-mono text-[11px] text-muted-foreground">
                  {evidences.length} proof document{evidences.length === 1 ? "" : "s"} indexed
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Why this denial can be challenged — based on their own rules, your medical records, and your rights.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={onRunCompleteAnalysis}
              disabled={isAnalyzing}
              className="h-8 text-xs gap-1.5 border-border/80 text-muted-foreground hover:text-foreground cursor-pointer"
              title="Refresh check for new proof"
            >
              {isAnalyzing ? (
                <>
                  <CircleNotch className="size-3.5 animate-spin" />
                  <span>Checking...</span>
                </>
              ) : (
                <>
                  <ArrowsClockwise className="size-3.5" />
                  <span>Refresh check</span>
                </>
              )}
            </Button>
          </div>
        </div>

        {/* 1 Plain-Language Summary Box */}
        <div className="rounded-xl border border-border/70 bg-muted/30 p-3.5 flex items-start gap-3">
          <CheckCircle className="size-5 text-emerald-400 shrink-0 mt-0.5" weight="fill" />
          <div className="space-y-0.5 text-xs">
            <span className="font-semibold text-foreground">
              Key evidence supporting this appeal:
            </span>
            <p className="text-muted-foreground leading-relaxed">
              {keyContradictions.length > 0
                ? stripMarkdownFormatting(keyContradictions[0])
                : isWorking
                ? "Analysis in progress. Verified findings will appear here as the insurer's rules and your records are checked."
                : hasVerifiedFindings
                ? "Verified proof points are listed below. Only cited, verified findings go into your appeal letter."
                : "No verified findings yet. Run a check to analyze this denial against the insurer's published rules and your records."}
            </p>
          </div>
        </div>
      </Card>

      {/* 2. Top 3 Decisive Findings ("Smoking Guns") */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between px-1">
          <span className="text-xs font-semibold text-foreground uppercase tracking-wider">
            {hasVerifiedFindings
              ? `${verifiedCount} Key Proof Point${verifiedCount === 1 ? "" : "s"} Found`
              : isWorking
              ? "Gathering Key Proof Points"
              : "No Proof Points Yet"}
          </span>
          <span className="text-[11px] text-muted-foreground">
            {hasVerifiedFindings
              ? verifiedCount === smokingGuns.length
                ? "Included in your appeal letter"
                : isWorking
                ? "More still being verified..."
                : "Run a check to verify the rest"
              : isWorking
              ? "Checking live..."
              : "Run a check to verify findings"}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-stretch">
          {smokingGuns.map((gun, idx) => {
            const Icon = gun.icon;
            return (
              <Card
                key={idx}
                className={cn(
                  "p-4 transition-all duration-200 border gap-3 flex flex-col",
                  gun.accentBorder,
                  gun.accentBg
                )}
              >
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Icon className={cn("size-4 shrink-0", gun.iconColor)} />
                      <span className="text-xs font-semibold text-foreground">
                        {gun.title}
                      </span>
                    </div>
                    <Badge variant="outline" className="text-[10px] font-mono border-border/60 text-muted-foreground">
                      {gun.badge}
                    </Badge>
                  </div>

                  <p className="text-xs text-foreground/90 font-medium leading-snug">
                    {gun.summary}
                  </p>

                  <div className="rounded-md bg-background/60 border border-border/50 p-2.5 text-[11px] text-muted-foreground leading-relaxed italic">
                    {gun.quote}
                  </div>
                </div>

                {gun.evidenceItem && (
                  <div className="mt-auto pt-1">
                    <button
                      type="button"
                      onClick={() => setInspectedEvidence(gun.evidenceItem)}
                      className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline cursor-pointer"
                    >
                      <Eye className="size-3" />
                      <span>View original source clause</span>
                    </button>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      </div>

      {/* 3. Collapsible Legal Scoring Breakdown & Full Evidence List */}
      <Card className="border-border/70 bg-card/60 overflow-hidden">
        <button
          type="button"
          onClick={() => setShowFullRubric((prev) => !prev)}
          className="w-full p-3.5 flex items-center justify-between text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          aria-expanded={showFullRubric}
          aria-controls="full-rubric-details"
        >
          <span className="font-medium flex items-center gap-2">
            <Shield className="size-4 text-primary" />
            <span>
              {showFullRubric
                ? "Hide detailed scoring rubric & all proof documents"
                : `Show detailed scoring rubric & all ${evidences.length} proof documents`}
            </span>
          </span>
          {showFullRubric ? <CaretUp className="size-4" /> : <CaretDown className="size-4" />}
        </button>

        {showFullRubric && (
          <div id="full-rubric-details" className="p-4 pt-0 border-t border-border/50 space-y-4 animate-fadeIn">
            {/* 4 Pillars in a clean 2x2 grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-3">
              {breakdown.map((crit, idx) => (
                <div
                  key={idx}
                  className="rounded-lg border border-border/70 bg-muted/20 p-3 space-y-1.5 text-xs"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-foreground">
                      {crit.criterion}
                    </span>
                    <Badge variant="secondary" className="font-mono text-[10px]">
                      {crit.score}/{crit.maxScore} pts
                    </Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    {stripMarkdownFormatting(crit.rationale)}
                  </p>
                </div>
              ))}
            </div>

            {/* List of all indexed evidence documents */}
            <div className="space-y-2 pt-2 border-t border-border/50">
              <span className="text-xs font-semibold text-foreground block">
                All Indexed Proof Documents ({evidences.length})
              </span>
              <div className="space-y-1.5">
                {evidences.map((e) => (
                  <div
                    key={e._id}
                    className="flex items-center justify-between gap-3 p-2 rounded-lg border border-border/60 bg-muted/10 hover:bg-muted/30 transition-colors text-xs"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText className="size-3.5 text-muted-foreground shrink-0" />
                      <span className="font-medium text-foreground truncate">
                        {e.title}
                      </span>
                      <span className="text-[10px] font-mono text-muted-foreground hidden sm:inline truncate">
                        — {e.citationClause}
                      </span>
                    </div>
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={() => setInspectedEvidence(e)}
                      aria-label={`Inspect ${e.title}`}
                      className="h-6 text-[11px] gap-1 text-primary shrink-0"
                    >
                      <Eye className="size-3" />
                      <span>Inspect</span>
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </Card>

      {/* 4. Single Canonical Next Step Card */}
      <Card className="p-4 border-primary/30 bg-primary/5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="space-y-0.5">
          <span className="text-xs font-semibold text-foreground">
            {hasVerifiedFindings
              ? "Ready to review your appeal letter?"
              : isWorking
              ? "Your appeal letter is being prepared..."
              : "Run a check to build your appeal letter"}
          </span>
          <p className="text-[11px] text-muted-foreground">
            {hasVerifiedFindings
              ? "We have integrated all these proof points directly into your cited brief."
              : isWorking
              ? "Each proof point streams into your cited brief as it is verified."
              : "Only verified, cited proof points go into your letter. Run a check to verify them first."}
          </p>
        </div>

        <Button
          onClick={onNavigateToStudio}
          className="gap-2 h-9 px-4 text-xs bg-primary text-primary-foreground font-semibold shadow-xs hover:bg-primary/90 cursor-pointer shrink-0"
        >
          <span>Continue to Your Letter</span>
          <ArrowRight className="size-3.5" />
        </Button>
      </Card>

      {/* Slide-over Clause Inspector Drawer */}
      <ClauseInspectorDrawer
        isOpen={Boolean(inspectedEvidence)}
        onClose={() => setInspectedEvidence(null)}
        evidence={inspectedEvidence}
        allEvidences={evidences}
        onSelectEvidence={(e) => setInspectedEvidence(e)}
      />
    </div>
  );
};
