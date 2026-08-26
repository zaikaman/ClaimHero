import React, { useState } from "react";
import {
  FileMagnifyingGlass,
  TrendUp,
  Warning,
  CheckCircle,
  Sparkle,
  CircleNotch,
  ArrowsClockwise,
  Shield,
  ArrowRight,
  Stethoscope,
  FileText,
  BookOpen,
  Medal,
} from "@phosphor-icons/react";
import { Claim, ClinicalEvidence, OverturnScoringResult } from "../../types";
import { PolicyViewer } from "./PolicyViewer";
import { PrecedentFeed } from "./PrecedentFeed";
import { formatCurrency, formatDate } from "../../lib/utils";
import { DENIAL_REASON_CODES } from "../../lib/constants";
import { Card } from "../ui/card";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Alert, AlertDescription } from "../ui/alert";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../ui/tabs";

interface EvidenceMatrixProps {
  claim: Claim;
  evidences: ClinicalEvidence[];
  isLoadingEvidences?: boolean;
  onCrawlPolicy: (claimId: string) => Promise<any>;
  onComputeScore: (claimId: string) => Promise<OverturnScoringResult>;
  onNavigateToStudio: () => void;
}

export const EvidenceMatrix: React.FC<EvidenceMatrixProps> = ({
  claim,
  evidences,
  isLoadingEvidences,
  onCrawlPolicy,
  onComputeScore,
  onNavigateToStudio,
}) => {
  const [activeTab, setActiveTab] = useState<string>("policy");
  const [isCrawling, setIsCrawling] = useState(false);
  const [isScoring, setIsScoring] = useState(false);
  const [scoringResult, setScoringResult] = useState<OverturnScoringResult | null>(
    null
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const denialReason = DENIAL_REASON_CODES[claim.denialReasonCode];

  const handleRunCrawl = async () => {
    setIsCrawling(true);
    setErrorMessage(null);
    try {
      await onCrawlPolicy(claim._id);
    } catch (err: any) {
      setErrorMessage(
        err?.message || "Failed to crawl insurer Clinical Policy Bulletin."
      );
    } finally {
      setIsCrawling(false);
    }
  };

  const handleRunScoring = async () => {
    setIsScoring(true);
    setErrorMessage(null);
    try {
      const result = await onComputeScore(claim._id);
      setScoringResult(result);
    } catch (err: any) {
      setErrorMessage(
        err?.message || "Failed to calculate Overturn Probability Score."
      );
    } finally {
      setIsScoring(false);
    }
  };

  return (
    <div className="space-y-4 animate-fadeIn">
      {/* Header & Main Control Toolbar */}
      <Card className="p-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-xs">
              <FileMagnifyingGlass className="size-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold text-foreground font-sans">
                  Clinical Evidence Matrix & Policy Inspector
                </h2>
                <Badge variant="outline" className="font-mono text-[10px]">
                  Firecrawl + gpt-5-nano
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                Cross-referencing denial codes against official Clinical Policy Bulletins and legal precedents
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Run Policy Crawl Trigger */}
            <Button
              variant="outline"
              size="sm"
              onClick={handleRunCrawl}
              disabled={isCrawling || isScoring}
              className="gap-1.5"
            >
              {isCrawling ? (
                <>
                  <CircleNotch className="size-3.5 animate-spin" />
                  <span>Crawling Policy...</span>
                </>
              ) : (
                <>
                  <ArrowsClockwise className="size-3.5" />
                  <span>Crawl Insurer CPB</span>
                </>
              )}
            </Button>

            {/* Run Win Score Calculation Trigger */}
            <Button
              size="sm"
              onClick={handleRunScoring}
              disabled={isScoring || isCrawling}
              className="gap-1.5"
            >
              {isScoring ? (
                <>
                  <CircleNotch className="size-3.5 animate-spin" />
                  <span>Evaluating...</span>
                </>
              ) : (
                <>
                  <TrendUp className="size-3.5" />
                  <span>Calculate Win Score</span>
                </>
              )}
            </Button>
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

      {/* Overturn Probability Win Score Showcase Banner */}
      {(claim.overturnProbabilityScore !== undefined || scoringResult) && (
        <Card className="p-4 border-emerald-500/30 bg-emerald-500/5 space-y-3">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-border/60 pb-3">
            <div className="flex items-center gap-3.5">
              <div className="flex size-12 items-center justify-center rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 font-mono font-bold text-xl">
                {scoringResult
                  ? scoringResult.overturnProbabilityScore
                  : claim.overturnProbabilityScore}
                %
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-foreground">
                    Overturn Probability Score
                  </h3>
                  <Badge variant="secondary" className="font-mono text-[10px] text-emerald-600 dark:text-emerald-400">
                    {scoringResult
                      ? scoringResult.riskLevel.replace(/_/g, " ")
                      : claim.riskLevel?.replace(/_/g, " ") || "HIGH CONFIDENCE"}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Clinical reasoning engine identified decisive policy contradictions violating ERISA standards.
                </p>
              </div>
            </div>

            <Button
              size="sm"
              onClick={onNavigateToStudio}
              className="gap-1.5 shrink-0"
            >
              <FileText className="size-3.5" />
              <span>Draft Appeal Brief</span>
              <ArrowRight className="size-3" />
            </Button>
          </div>

          {/* Key Contradictions List */}
          {scoringResult?.keyPolicyContradictions &&
            scoringResult.keyPolicyContradictions.length > 0 && (
              <div className="space-y-2 pt-1">
                <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <Sparkle className="size-3.5 text-primary" />
                  Key Insurer Contradictions Identified:
                </span>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {scoringResult.keyPolicyContradictions.map((contra, idx) => (
                    <div
                      key={idx}
                      className="flex items-start gap-2 rounded-lg bg-card border border-border p-2.5 text-xs text-foreground/90"
                    >
                      <CheckCircle className="size-3.5 text-emerald-500 shrink-0 mt-0.5" />
                      <span className="leading-snug">{contra}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
        </Card>
      )}

      {/* Dual Pane Layout: Baseline (5 cols) & Evidence Feed (7 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Left Column: Denial Baseline & Patient Record */}
        <div className="lg:col-span-5 space-y-3">
          <Card className="p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-border/60 pb-2.5">
              <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <Warning className="size-3.5 text-destructive" />
                Original Denial Baseline
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
                  <span className="text-[10px] text-muted-foreground font-mono block">Insurance Payer</span>
                  <span className="font-semibold text-foreground">{claim.patient?.insurancePayer}</span>
                </div>
                <div>
                  <span className="text-[10px] text-muted-foreground font-mono block">Service Date</span>
                  <span className="font-mono text-muted-foreground">{formatDate(claim.serviceDate)}</span>
                </div>
              </div>

              <div className="rounded-lg bg-muted/40 border border-border p-3 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase font-mono text-muted-foreground">Disputed Charge</span>
                  <span className="text-sm font-mono font-bold text-destructive">
                    {formatCurrency(claim.deniedAmount)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>Patient Responsibility:</span>
                  <span className="font-mono font-semibold text-foreground">
                    {formatCurrency(claim.patientOwedAmount)}
                  </span>
                </div>
              </div>

              {/* Procedure & Denial Codes */}
              <div className="space-y-2 pt-1">
                <div>
                  <span className="text-[10px] text-muted-foreground font-mono block mb-1">
                    CPT Procedure Codes:
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
                    Denial Reason (CARC):
                  </span>
                  <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-2.5 text-xs text-destructive">
                    <span className="font-mono font-bold block">{claim.denialReasonCode}</span>
                    <p className="text-[11px] mt-0.5 leading-relaxed opacity-90">
                      {claim.denialReasonDescription || denialReason?.description}
                    </p>
                  </div>
                </div>
              </div>

              <div className="pt-1">
                <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <Stethoscope className="size-3.5" />
                  <span>Treating Provider: {claim.providerName}</span>
                </div>
              </div>
            </div>
          </Card>

          <Card className="p-3.5 space-y-1.5 bg-muted/30">
            <div className="flex items-center gap-1.5 font-semibold text-xs text-foreground">
              <Shield className="size-3.5" />
              <span>ERISA Regulatory Protection</span>
            </div>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Under 29 CFR § 2560.503-1, the insurer is legally required to disclose all internal Clinical Policy Bulletins and guidelines used in issuing this adverse determination.
            </p>
          </Card>
        </div>

        {/* Right Column: Interactive Policy & Precedent Tabs */}
        <div className="lg:col-span-7 space-y-3">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList variant="line" className="w-full">
              <TabsTrigger value="policy" className="gap-1.5">
                <BookOpen className="size-3.5" />
                <span>Clinical Policy Bulletins ({evidences.length})</span>
              </TabsTrigger>
              <TabsTrigger value="precedents" className="gap-1.5">
                <Medal className="size-3.5" />
                <span>Overturned Precedents</span>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="policy" className="pt-1">
              <PolicyViewer
                evidences={evidences}
                isLoading={isLoadingEvidences || isCrawling}
              />
            </TabsContent>

            <TabsContent value="precedents" className="pt-1">
              <PrecedentFeed
                claim={claim}
                onApplyPrecedent={() => onNavigateToStudio()}
              />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
};
