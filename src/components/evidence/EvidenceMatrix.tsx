import React, { useState } from "react";
import {
  FileSearch,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  Sparkles,
  Loader2,
  RefreshCw,
  Shield,
  ArrowRight,
  Stethoscope,
  FileText,
  BookOpen,
  Award,
} from "lucide-react";
import { Claim, ClinicalEvidence, OverturnScoringResult } from "../../types";
import { PolicyViewer } from "./PolicyViewer";
import { PrecedentFeed } from "./PrecedentFeed";
import { formatCurrency, formatDate } from "../../lib/utils";
import { DENIAL_REASON_CODES } from "../../lib/constants";

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
  const [activeTab, setActiveTab] = useState<"policy" | "precedents">("policy");
  const [isCrawling, setIsCrawling] = useState(false);
  const [isScoring, setIsScoring] = useState(false);
  const [scoringResult, setScoringResult] = useState<OverturnScoringResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const denialReason = DENIAL_REASON_CODES[claim.denialReasonCode];

  const handleRunCrawl = async () => {
    setIsCrawling(true);
    setErrorMessage(null);
    try {
      await onCrawlPolicy(claim._id);
    } catch (err: any) {
      setErrorMessage(err?.message || "Failed to crawl insurer Clinical Policy Bulletin.");
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
      setErrorMessage(err?.message || "Failed to calculate Overturn Probability Score.");
    } finally {
      setIsScoring(false);
    }
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header & Main Control Bar */}
      <div className="rounded-2xl border border-cyan-500/30 bg-gradient-to-r from-slate-900/95 via-[#0b1526]/90 to-slate-900/95 p-5 shadow-glass-panel">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-cyan-950/60 border border-cyan-500/40 shadow-cyan-glow">
              <FileSearch className="h-6 w-6 text-cyan-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold text-white font-sans">
                  Clinical Evidence Matrix & CPB Cross-Examination
                </h2>
                <span className="rounded-full bg-cyan-950/60 border border-cyan-500/40 px-2 py-0.5 text-[10px] font-mono text-cyan-300 font-semibold">
                  FIRECRRAWL + GPT-5-NANO
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Cross-referencing denial codes against official insurer Clinical Policy Bulletins and overturned legal precedents
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Run Policy Crawl Trigger */}
            <button
              onClick={handleRunCrawl}
              disabled={isCrawling || isScoring}
              className="inline-flex items-center gap-2 rounded-xl border border-cyan-500/40 bg-cyan-950/40 hover:bg-cyan-900/60 px-4 py-2 text-xs font-semibold text-cyan-300 shadow-cyan-glow transition-all hover:scale-105 active:scale-95 disabled:opacity-50"
            >
              {isCrawling ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin text-cyan-400" />
                  <span>Crawling Policy with Firecrawl...</span>
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4 text-cyan-400" />
                  <span>Crawl Insurer CPB</span>
                </>
              )}
            </button>

            {/* Run Win Score Calculation Trigger */}
            <button
              onClick={handleRunScoring}
              disabled={isScoring || isCrawling}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 px-4 py-2 text-xs font-bold text-slate-950 shadow-emerald-glow transition-all hover:scale-105 active:scale-95 disabled:opacity-50"
            >
              {isScoring ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Evaluating with gpt-5-nano...</span>
                </>
              ) : (
                <>
                  <TrendingUp className="h-4 w-4" />
                  <span>Calculate Win Score</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Error Alert */}
      {errorMessage && (
        <div className="rounded-xl border border-rose-500/40 bg-rose-950/30 p-3.5 flex items-center gap-2.5 text-xs text-rose-300 animate-fadeIn">
          <AlertTriangle className="h-4 w-4 text-rose-400 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Overturn Probability Win Score Showcase Banner */}
      {(claim.overturnProbabilityScore !== undefined || scoringResult) && (
        <div className="rounded-2xl border border-emerald-500/40 bg-gradient-to-br from-emerald-950/30 via-slate-900/90 to-slate-900/90 p-5 shadow-emerald-glow animate-fadeIn">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-emerald-500/30 pb-4">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-950/80 border border-emerald-500/60 shadow-emerald-glow">
                <span className="text-2xl font-black font-mono text-emerald-300">
                  {scoringResult ? scoringResult.overturnProbabilityScore : claim.overturnProbabilityScore}%
                </span>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold text-white">Overturn Probability Score</h3>
                  <span className="rounded-md border border-emerald-500/40 bg-emerald-950/80 px-2 py-0.5 text-[10px] font-mono font-bold text-emerald-300 uppercase">
                    {scoringResult ? scoringResult.riskLevel.replace("_", " ") : claim.riskLevel?.replace("_", " ") || "HIGH CONFIDENCE"}
                  </span>
                </div>
                <p className="text-xs text-slate-300 mt-0.5">
                  Clinical reasoning engine identified decisive policy contradictions violating ERISA standards.
                </p>
              </div>
            </div>

            <button
              onClick={onNavigateToStudio}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 via-teal-500 to-emerald-500 px-5 py-2.5 text-xs font-bold text-slate-950 shadow-cyan-glow hover:scale-105 transition-transform shrink-0"
            >
              <FileText className="h-4 w-4" />
              <span>Draft Appeal Brief with Evidence</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Key Contradictions List */}
          {scoringResult?.keyPolicyContradictions && scoringResult.keyPolicyContradictions.length > 0 && (
            <div className="mt-4 space-y-2">
              <span className="text-xs font-mono font-bold text-emerald-300 uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5" />
                Key Insurer Contradictions Identified by AI:
              </span>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                {scoringResult.keyPolicyContradictions.map((contra, idx) => (
                  <div
                    key={idx}
                    className="flex items-start gap-2 rounded-lg bg-slate-950/80 border border-slate-800 p-2.5 text-xs text-slate-200"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0 mt-0.5" />
                    <span className="leading-snug">{contra}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Side-by-Side Dual Pane Inspector */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Denial Baseline & Patient Record (4 Cols) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <span className="text-xs font-mono font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                <AlertTriangle className="h-4 w-4 text-rose-400" />
                Original Denial Baseline
              </span>
              <span className="rounded bg-rose-950/60 border border-rose-500/40 px-2 py-0.5 text-xs font-mono font-bold text-rose-300">
                {claim.claimNumber}
              </span>
            </div>

            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="text-[10px] text-slate-500 font-mono block">Patient</span>
                  <span className="font-semibold text-slate-200">{claim.patient?.name || "Patient Record"}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 font-mono block">Member ID</span>
                  <span className="font-mono text-cyan-300">{claim.patient?.memberId || "N/A"}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 font-mono block">Insurance Payer</span>
                  <span className="font-semibold text-white">{claim.patient?.insurancePayer}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 font-mono block">Service Date</span>
                  <span className="font-mono text-slate-300">{formatDate(claim.serviceDate)}</span>
                </div>
              </div>

              <div className="rounded-lg bg-slate-950/80 border border-slate-800 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase font-mono text-slate-500">Disputed Financials</span>
                  <span className="text-sm font-mono font-bold text-rose-400">
                    {formatCurrency(claim.deniedAmount)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-[11px] text-slate-400">
                  <span>Patient Responsibility:</span>
                  <span className="font-mono text-rose-300 font-semibold">
                    {formatCurrency(claim.patientOwedAmount)}
                  </span>
                </div>
              </div>

              {/* Procedure & Denial Codes */}
              <div className="space-y-2 pt-1">
                <div>
                  <span className="text-[10px] text-slate-500 font-mono block mb-1">CPT Procedure Codes:</span>
                  <div className="flex flex-wrap gap-1.5">
                    {claim.cptCodes.map((cpt) => (
                      <span
                        key={cpt}
                        className="rounded-md border border-cyan-500/40 bg-cyan-950/30 px-2 py-0.5 text-xs font-mono font-bold text-cyan-300"
                      >
                        CPT {cpt}
                      </span>
                    ))}
                  </div>
                </div>

                <div>
                  <span className="text-[10px] text-slate-500 font-mono block mb-1">Denial Reason (CARC):</span>
                  <div className="rounded-lg border border-rose-500/40 bg-rose-950/30 p-2.5 text-xs">
                    <span className="font-mono font-bold text-rose-400 block">
                      {claim.denialReasonCode}
                    </span>
                    <p className="text-[11px] text-rose-200/90 mt-0.5 leading-relaxed">
                      {claim.denialReasonDescription || denialReason?.description}
                    </p>
                  </div>
                </div>
              </div>

              <div className="pt-2">
                <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                  <Stethoscope className="h-3.5 w-3.5 text-slate-500" />
                  <span>Treating Provider: {claim.providerName}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-cyan-500/30 bg-cyan-950/20 p-4 space-y-2 text-xs">
            <div className="flex items-center gap-2 font-bold text-cyan-300 font-mono">
              <Shield className="h-4 w-4 text-cyan-400" />
              <span>ERISA Regulatory Protection</span>
            </div>
            <p className="text-[11px] text-slate-300 leading-relaxed">
              Under 29 CFR § 2560.503-1, the insurer is legally required to disclose all internal Clinical Policy Bulletins and guidelines used in issuing this adverse determination.
            </p>
          </div>
        </div>

        {/* Right Column: Interactive Policy & Precedent Inspector (7 Cols) */}
        <div className="lg:col-span-7 space-y-4">
          {/* Sub-tab Switcher */}
          <div className="flex border-b border-slate-800">
            <button
              onClick={() => setActiveTab("policy")}
              className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition-all ${
                activeTab === "policy"
                  ? "border-cyan-400 text-cyan-300 bg-cyan-950/20"
                  : "border-transparent text-slate-400 hover:text-slate-200"
              }`}
            >
              <BookOpen className="h-4 w-4" />
              <span>Clinical Policy Bulletins ({evidences.length})</span>
            </button>
            <button
              onClick={() => setActiveTab("precedents")}
              className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition-all ${
                activeTab === "precedents"
                  ? "border-emerald-400 text-emerald-300 bg-emerald-950/20"
                  : "border-transparent text-slate-400 hover:text-slate-200"
              }`}
            >
              <Award className="h-4 w-4" />
              <span>Overturned Case Precedents</span>
            </button>
          </div>

          {activeTab === "policy" ? (
            <PolicyViewer evidences={evidences} isLoading={isLoadingEvidences || isCrawling} />
          ) : (
            <PrecedentFeed claim={claim} />
          )}
        </div>
      </div>
    </div>
  );
};
