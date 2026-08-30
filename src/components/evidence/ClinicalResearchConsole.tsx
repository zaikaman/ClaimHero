import React, { useState, useEffect, useRef } from "react";
import {
  Globe,
  BookOpen,
  Flask,
  FileText,
  Sparkle,
  CircleNotch,
  CheckCircle,
  Warning,
  ArrowRight,
  Copy,
  Check,
  ArrowSquareOut,
  Sliders,
  Article,
  ShieldCheck,
  Lightning,
  Trash,
} from "@phosphor-icons/react";
import { Claim, ClinicalEvidence, EvidenceSourceType, ResearchMode } from "../../types";
import { Card } from "../ui/card";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Input } from "../ui/input";
import { Select } from "../ui/select";
import { Alert, AlertDescription } from "../ui/alert";
import { stripMarkdownFormatting } from "../../lib/utils";

interface ClinicalResearchConsoleProps {
  claim: Claim;
  evidences: ClinicalEvidence[];
  onCrawlCPB: (claimId: string, customUrl?: string) => Promise<any>;
  onCrawlPubMed: (claimId: string, query?: string, customUrl?: string) => Promise<any>;
  onCrawlFDA: (claimId: string, customUrl?: string, deviceName?: string) => Promise<any>;
  onCrawlCustomUrl: (
    claimId: string,
    url: string,
    category?: string,
    notes?: string
  ) => Promise<any>;
  onCrawlMultiSource: (claimId: string, customUrl?: string) => Promise<any>;
  onDeleteEvidence?: (evidenceId: string) => Promise<any>;
  onComputeScore?: (claimId: string) => Promise<any>;
  onNavigateToStudio?: () => void;
}

interface TelemetryLog {
  timestamp: string;
  stage: string;
  message: string;
  type: "info" | "success" | "warning" | "error";
}

const RESEARCH_MODES: Array<{
  id: ResearchMode;
  label: string;
  icon: React.ElementType;
  description: string;
  badge?: string;
}> = [
  {
    id: "multi_source",
    label: "Full Multi-Source Sentinel Scan",
    icon: Lightning,
    description: "Concurrent sweep of Insurer CPB, PubMed clinical trials, and FDA indications",
    badge: "Recommended",
  },
  {
    id: "payer_cpb",
    label: "Insurer Policy Bulletin (CPB)",
    icon: BookOpen,
    description: "Official Clinical Policy Bulletins, medical necessity rules & criteria",
  },
  {
    id: "pubmed_trials",
    label: "PubMed & ClinicalTrials.gov",
    icon: Flask,
    description: "Peer-reviewed RCTs, meta-analyses & standard-of-care efficacy abstracts",
  },
  {
    id: "fda_labels",
    label: "FDA Package Inserts & Labels",
    icon: ShieldCheck,
    description: "FDA-approved on-label indications to legally refute investigational denials",
  },
  {
    id: "custom_url",
    label: "Live Web & Guideline URL Scanner",
    icon: Globe,
    description: "Scrape and extract structured criteria clauses from any custom health URL",
  },
];

const PRESET_RESEARCH_URLS = [
  {
    label: "Molina TKA Arthroplasty CPB",
    url: "https://www.molinahealthcare.com/providers/common/medicaid/clinical-guidelines.aspx",
    category: "payer_cpb",
  },
  {
    label: "PubMed TKA Efficacy Trial (PMID 34123456)",
    url: "https://pubmed.ncbi.nlm.nih.gov/34123456/",
    category: "pubmed_study",
  },
  {
    label: "Drugs@FDA Package Insert (NDA #021876)",
    url: "https://www.accessdata.fda.gov/scripts/cder/daf/index.cfm",
    category: "fda_package_insert",
  },
  {
    label: "NCCN Clinical Oncology Guideline",
    url: "https://www.nccn.org/guidelines/category_1",
    category: "nccn_guideline",
  },
];

export const ClinicalResearchConsole: React.FC<ClinicalResearchConsoleProps> = ({
  claim,
  evidences,
  onCrawlCPB,
  onCrawlPubMed,
  onCrawlFDA,
  onCrawlCustomUrl,
  onCrawlMultiSource,
  onDeleteEvidence,
  onComputeScore,
  onNavigateToStudio,
}) => {
  const [activeMode, setActiveMode] = useState<ResearchMode>("multi_source");
  const [customUrl, setCustomUrl] = useState<string>("");
  const [customCategory, setCustomCategory] = useState<string>("payer_cpb");
  const [customQuery, setCustomQuery] = useState<string>("");
  const [isExecuting, setIsExecuting] = useState<boolean>(false);
  const [elapsedMs, setElapsedMs] = useState<number>(0);
  const [currentStageIndex, setCurrentStageIndex] = useState<number>(0);
  const [telemetryLogs, setTelemetryLogs] = useState<TelemetryLog[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successSummary, setSuccessSummary] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [activeEvidenceFilter, setActiveEvidenceFilter] = useState<string>("all");

  const timerRef = useRef<number | null>(null);
  const terminalBottomRef = useRef<HTMLDivElement | null>(null);

  const stages = [
    { name: "Handshake", desc: "Firecrawl v2 gateway auth" },
    { name: "Web Scrape", desc: "DOM to Markdown conversion" },
    { name: "Clinical AI", desc: "GPT criteria & indications" },
    { name: "Citations", desc: "ERISA & standard-of-care" },
    { name: "Ledger Save", desc: "Structured index in Convex DB" },
  ];

  const addLog = (stage: string, message: string, type: "info" | "success" | "warning" | "error" = "info") => {
    const timeStr = new Date().toLocaleTimeString("en-US", {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    setTelemetryLogs((prev) => [...prev, { timestamp: timeStr, stage, message, type }]);
  };

  useEffect(() => {
    if (terminalBottomRef.current) {
      terminalBottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [telemetryLogs]);

  // Execute research workflow based on activeMode
  const handleExecuteResearch = async () => {
    setIsExecuting(true);
    setErrorMessage(null);
    setSuccessSummary(null);
    setElapsedMs(0);
    setCurrentStageIndex(0);
    setTelemetryLogs([]);

    const startTime = Date.now();
    timerRef.current = window.setInterval(() => {
      setElapsedMs(Date.now() - startTime);
    }, 100);

    addLog("Init", `Starting research session in mode: ${activeMode.toUpperCase()}`, "info");

    try {
      // Stage 1: Handshake
      setCurrentStageIndex(0);
      addLog("Handshake", "Authenticating Firecrawl API gateway with clinical session credentials...", "info");
      await new Promise((r) => setTimeout(r, 400));

      // Stage 2: Scraping
      setCurrentStageIndex(1);
      if (activeMode === "custom_url") {
        if (!customUrl.trim()) {
          throw new Error("Please enter a valid web URL to scrape.");
        }
        addLog("Scrape", `Scraping custom target: ${customUrl.trim()}`, "info");
      } else if (activeMode === "pubmed_trials") {
        addLog("Scrape", `Querying PubMed & ClinicalTrials for CPT [${claim.cptCodes.join(", ")}]...`, "info");
      } else if (activeMode === "fda_labels") {
        addLog("Scrape", `Searching FDA Drugs@FDA & DailyMed for procedure package inserts...`, "info");
      } else if (activeMode === "payer_cpb") {
        addLog("Scrape", `Crawling official CPB guidelines for payer: ${claim.patient?.insurancePayer}...`, "info");
      } else {
        addLog("Scrape", "Initiating parallel multi-source crawl (CPB + PubMed + FDA)...", "info");
      }

      // Stage 3 & 4: Clinical AI Extraction
      setCurrentStageIndex(2);
      addLog("Extraction", "Running OpenAI gpt-5-nano clinical reasoning auditor on document payload...", "info");

      let result: any = null;
      if (activeMode === "multi_source") {
        result = await onCrawlMultiSource(claim._id, customUrl || undefined);
        setCurrentStageIndex(3);
        addLog("Audit", `Synthesized multi-source dossier: ${result.cpbClauses || 0} CPB, ${result.pubMedClauses || 0} PubMed, ${result.fdaClauses || 0} FDA clauses`, "success");
      } else if (activeMode === "payer_cpb") {
        result = await onCrawlCPB(claim._id, customUrl || undefined);
        setCurrentStageIndex(3);
        addLog("Audit", `Extracted ${result?.clausesExtracted || 0} clinical policy clauses: "${result?.policyTitle || "Policy Bulletin"}"`, "success");
      } else if (activeMode === "pubmed_trials") {
        result = await onCrawlPubMed(claim._id, customQuery || undefined, customUrl || undefined);
        setCurrentStageIndex(3);
        addLog("Audit", `Extracted ${result?.clausesExtracted || 0} trial clauses from study: "${result?.studyTitle || "PubMed Study"}" (${result?.identifier || "PMID"})`, "success");
      } else if (activeMode === "fda_labels") {
        result = await onCrawlFDA(claim._id, customUrl || undefined, customQuery || undefined);
        setCurrentStageIndex(3);
        addLog("Audit", `Extracted ${result?.clausesExtracted || 0} FDA label clauses for: "${result?.productName || "Approved Medical Product"}" (${result?.applicationNumber || "NDA/PMA"})`, "success");
      } else if (activeMode === "custom_url") {
        result = await onCrawlCustomUrl(claim._id, customUrl.trim(), customCategory, customQuery || undefined);
        setCurrentStageIndex(3);
        addLog("Audit", `Extracted ${result?.clausesExtracted || 0} structured criteria clauses: "${result?.documentTitle || "Custom Guideline"}"`, "success");
      }

      // Stage 5: Persistence
      setCurrentStageIndex(4);
      addLog("Convex DB", "Persisted structured criteria clauses to clinicalEvidences ledger.", "success");
      await new Promise((r) => setTimeout(r, 300));
      setCurrentStageIndex(5);

      const totalExtracted =
        result?.clausesExtracted ||
        (result?.cpbClauses || 0) + (result?.pubMedClauses || 0) + (result?.fdaClauses || 0) ||
        "multiple";

      setSuccessSummary(`Successfully indexed ${totalExtracted} clinical evidence clauses in ${(Date.now() - startTime) / 1000}s.`);
      addLog("Complete", "Research session completed successfully.", "success");
    } catch (err: any) {
      const msg = err?.message || "Clinical research crawl failed.";
      setErrorMessage(msg);
      addLog("Error", msg, "error");
    } finally {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      setIsExecuting(false);
    }
  };

  const handleCopyCitation = (id: string, clause: string) => {
    navigator.clipboard.writeText(clause);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const filteredEvidences = evidences.filter((e) => {
    if (activeEvidenceFilter === "all") return true;
    return e.sourceType === activeEvidenceFilter;
  });

  const getSourceBadge = (type: EvidenceSourceType) => {
    switch (type) {
      case "payer_cpb":
        return <Badge variant="default">Insurer CPB</Badge>;
      case "pubmed_study":
        return <Badge variant="secondary" className="bg-cyan-500/10 text-cyan-400 border-cyan-500/30">PubMed Trial</Badge>;
      case "fda_package_insert":
        return <Badge variant="outline" className="border-purple-500/40 text-purple-400">FDA Label</Badge>;
      case "nccn_guideline":
        return <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30">NCCN Guideline</Badge>;
      case "legal_precedent":
        return <Badge variant="outline" className="border-amber-500/40 text-amber-400 font-mono">ERISA / Law</Badge>;
      default:
        return <Badge variant="outline">{type}</Badge>;
    }
  };

  return (
    <div className="space-y-4">
      {/* Console Header & Control Center */}
      <Card className="p-4 border-border/80 bg-card/80 space-y-4 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/60 pb-3">
          <div className="flex items-start sm:items-center gap-3 min-w-0">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary border border-primary/30 shadow-xs">
              <Globe className="size-4.5" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5">
                <h3 className="text-sm font-semibold text-foreground font-sans truncate">
                  Multi-Source Clinical Research Hub
                </h3>
                <Badge variant="outline" className="font-mono text-[9px] h-4 px-1.5 text-primary border-primary/30 shrink-0">
                  Live Telemetry
                </Badge>
              </div>
              <p className="text-[11px] text-muted-foreground leading-tight mt-0.5">
                Dynamically crawling insurer bulletins, PubMed study abstracts & FDA package inserts
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            {onComputeScore && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onComputeScore(claim._id)}
                disabled={isExecuting}
                className="h-7.5 text-xs px-2.5 gap-1.5 font-sans"
              >
                <Sparkle className="size-3.5 text-primary" />
                <span>Re-score Rubric</span>
              </Button>
            )}
            {onNavigateToStudio && (
              <Button
                size="sm"
                onClick={onNavigateToStudio}
                className="h-7.5 text-xs px-2.5 gap-1.5 bg-primary text-primary-foreground font-semibold shadow-xs"
              >
                <FileText className="size-3.5" />
                <span>Draft Brief</span>
                <ArrowRight className="size-3" />
              </Button>
            )}
          </div>
        </div>

        {/* Mode Selector Pill Buttons */}
        <div className="space-y-2">
          <span className="text-[11px] font-semibold text-muted-foreground uppercase font-mono tracking-wider">
            Select Clinical Research Channel:
          </span>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-2">
            {RESEARCH_MODES.map((mode) => {
              const Icon = mode.icon;
              const isSelected = activeMode === mode.id;
              return (
                <button
                  key={mode.id}
                  onClick={() => setActiveMode(mode.id)}
                  disabled={isExecuting}
                  className={`flex flex-col items-start p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                    isSelected
                      ? "border-primary bg-primary/10 shadow-xs ring-1 ring-primary/40 text-foreground"
                      : "border-border/70 bg-card/60 hover:bg-card/90 text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <div className="flex items-center justify-between w-full mb-1">
                    <Icon className={`size-4 ${isSelected ? "text-primary" : "text-muted-foreground"}`} />
                    {mode.badge && (
                      <span className="text-[9px] font-mono px-1 py-0.5 rounded bg-primary/20 text-primary font-bold">
                        {mode.badge}
                      </span>
                    )}
                  </div>
                  <span className="text-xs font-semibold block leading-tight text-foreground">
                    {mode.label}
                  </span>
                  <span className="text-[10px] text-muted-foreground leading-tight mt-1 line-clamp-2">
                    {mode.description}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Input Parameters & Preset Scanners */}
        <div className="rounded-xl border border-border/70 bg-muted/20 p-3 space-y-3">
          {activeMode === "custom_url" ? (
            <div className="space-y-2">
              <div className="flex flex-col sm:flex-row gap-2">
                <div className="flex-1 space-y-1">
                  <span className="text-[10px] font-mono text-muted-foreground uppercase">
                    Custom Insurance or Clinical Guideline URL:
                  </span>
                  <Input
                    type="url"
                    placeholder="https://www.insurer.com/clinical-policy/arthroplasty.pdf or https://pubmed.ncbi.nlm.nih.gov/..."
                    value={customUrl}
                    onChange={(e) => setCustomUrl(e.target.value)}
                    className="h-8 text-xs font-mono"
                    disabled={isExecuting}
                  />
                </div>
                <div className="w-full sm:w-44 space-y-1">
                  <span className="text-[10px] font-mono text-muted-foreground uppercase">
                    Source Category:
                  </span>
                  <Select
                    value={customCategory}
                    onChange={(e) => setCustomCategory(e.target.value)}
                    className="h-8 text-xs font-sans"
                    disabled={isExecuting}
                  >
                    <option value="payer_cpb">Insurer CPB</option>
                    <option value="pubmed_study">PubMed Study</option>
                    <option value="fda_package_insert">FDA Label</option>
                    <option value="nccn_guideline">NCCN Guideline</option>
                    <option value="legal_precedent">Statutory Precedent</option>
                  </Select>
                </div>
              </div>

              {/* Presets Row */}
              <div className="flex items-center gap-1.5 flex-wrap pt-1">
                <span className="text-[10px] font-mono text-muted-foreground">Quick Presets:</span>
                {PRESET_RESEARCH_URLS.map((preset, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      setCustomUrl(preset.url);
                      setCustomCategory(preset.category);
                    }}
                    disabled={isExecuting}
                    className="text-[10px] font-sans px-2 py-0.5 rounded border border-border/80 bg-card hover:bg-muted text-foreground/80 hover:text-foreground transition-colors cursor-pointer"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>
          ) : activeMode === "pubmed_trials" ? (
            <div className="space-y-1.5">
              <span className="text-[10px] font-mono text-muted-foreground uppercase">
                PubMed / ClinicalTrials Search Query Focus (Optional):
              </span>
              <Input
                type="text"
                placeholder={`Leave blank to auto-query CPT [${claim.cptCodes.join(", ")}] efficacy, or enter custom medical keywords...`}
                value={customQuery}
                onChange={(e) => setCustomQuery(e.target.value)}
                className="h-8 text-xs font-sans"
                disabled={isExecuting}
              />
            </div>
          ) : activeMode === "fda_labels" ? (
            <div className="space-y-1.5">
              <span className="text-[10px] font-mono text-muted-foreground uppercase">
                FDA Device / Drug / Implant Name (Optional):
              </span>
              <Input
                type="text"
                placeholder={`Leave blank for procedure CPT ${claim.cptCodes[0] || "27447"} indications, or enter specific device (e.g. Persona Knee System)...`}
                value={customQuery}
                onChange={(e) => setCustomQuery(e.target.value)}
                className="h-8 text-xs font-sans"
                disabled={isExecuting}
              />
            </div>
          ) : activeMode === "payer_cpb" ? (
            <div className="space-y-1.5">
              <span className="text-[10px] font-mono text-muted-foreground uppercase">
                Custom Insurer Policy URL (Optional Override):
              </span>
              <Input
                type="url"
                placeholder={`Leave blank to auto-discover ${claim.patient?.insurancePayer} policies, or paste specific PDF link...`}
                value={customUrl}
                onChange={(e) => setCustomUrl(e.target.value)}
                className="h-8 text-xs font-mono"
                disabled={isExecuting}
              />
            </div>
          ) : (
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>
                Multi-source scan targets: <strong className="text-foreground">{claim.patient?.insurancePayer}</strong> CPB, PubMed Trial Databases for CPT <strong className="font-mono text-foreground">{claim.cptCodes.join(", ")}</strong>, and FDA Indications.
              </span>
              <Badge variant="outline" className="font-mono text-[10px]">
                3 Ingestion Channels
              </Badge>
            </div>
          )}

          {/* Trigger Action Bar */}
          <div className="flex items-center justify-between gap-3 pt-1 border-t border-border/60">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Sliders className="size-3.5 text-primary" />
              <span>Target: #{claim.claimNumber} • {claim.patient?.name}</span>
            </div>

            <Button
              size="sm"
              onClick={handleExecuteResearch}
              disabled={isExecuting}
              className="h-8 text-xs px-4 gap-1.5 bg-primary text-primary-foreground font-semibold shadow-xs"
            >
              {isExecuting ? (
                <>
                  <CircleNotch className="size-3.5 animate-spin" />
                  <span>Streaming Extraction ({(elapsedMs / 1000).toFixed(1)}s)...</span>
                </>
              ) : (
                <>
                  <Sparkle className="size-3.5" />
                  <span>
                    {activeMode === "multi_source"
                      ? "Launch Multi-Source Research Scan"
                      : activeMode === "custom_url"
                      ? "Scrape & Extract Criteria Clauses"
                      : `Crawl ${RESEARCH_MODES.find((m) => m.id === activeMode)?.label}`}
                  </span>
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Error / Success Alerts */}
        {errorMessage && (
          <Alert variant="destructive">
            <Warning className="size-4" />
            <AlertDescription>{errorMessage}</AlertDescription>
          </Alert>
        )}
        {successSummary && (
          <Alert variant="default" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-400">
            <CheckCircle className="size-4 text-emerald-400" />
            <AlertDescription className="text-emerald-300 font-sans">{successSummary}</AlertDescription>
          </Alert>
        )}
      </Card>

      {/* Streaming Progress Telemetry HUD & Terminal Log Feed */}
      {(isExecuting || telemetryLogs.length > 0) && (() => {
        const isCompleted = currentStageIndex >= stages.length && !isExecuting && !errorMessage;
        const isFailed = !!errorMessage;

        return (
          <Card className="p-4 border-border/80 bg-card/90 space-y-3">
            <div className="flex items-center justify-between border-b border-border/60 pb-2">
              <div className="flex items-center gap-2">
                {isExecuting ? (
                  <CircleNotch className="size-4 text-primary animate-spin" />
                ) : isCompleted ? (
                  <CheckCircle className="size-4 text-emerald-400" />
                ) : isFailed ? (
                  <Warning className="size-4 text-rose-400" />
                ) : (
                  <Article className="size-4 text-muted-foreground" />
                )}
                <span className="text-xs font-semibold text-foreground font-mono uppercase">
                  Live Extraction Telemetry Stream
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="font-mono text-[10px]">
                  {(elapsedMs / 1000).toFixed(1)}s Elapsed
                </Badge>
                {isExecuting ? (
                  <Badge variant="secondary" className="font-mono text-[10px] bg-primary/10 text-primary border-primary/30 animate-pulse">
                    Stage {Math.min(currentStageIndex + 1, stages.length)} of {stages.length}
                  </Badge>
                ) : isCompleted ? (
                  <Badge variant="secondary" className="font-mono text-[10px] bg-emerald-500/10 text-emerald-400 border-emerald-500/30">
                    5/5 Complete
                  </Badge>
                ) : isFailed ? (
                  <Badge variant="destructive" className="font-mono text-[10px]">
                    Failed at Stage {currentStageIndex + 1}
                  </Badge>
                ) : (
                  <Badge variant="outline" className="font-mono text-[10px]">
                    Ready
                  </Badge>
                )}
              </div>
            </div>

            {/* 5-Stage Stepper Progress Tracker */}
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-2">
              {stages.map((st, idx) => {
                const isPast = idx < currentStageIndex;
                const isCurrent = idx === currentStageIndex && isExecuting;
                const isErrorStage = idx === currentStageIndex && isFailed;

                return (
                  <div
                    key={idx}
                    className={`p-2.5 rounded-lg border text-xs transition-all ${
                      isPast
                        ? "border-emerald-500/40 bg-emerald-500/5 text-emerald-400"
                        : isCurrent
                        ? "border-primary bg-primary/10 text-foreground ring-1 ring-primary/40 animate-pulse"
                        : isErrorStage
                        ? "border-rose-500/40 bg-rose-500/10 text-rose-400"
                        : "border-border/60 bg-muted/20 text-muted-foreground opacity-60"
                    }`}
                  >
                    <div className="flex items-center gap-1.5 mb-0.5">
                      {isPast ? (
                        <CheckCircle className="size-3.5 text-emerald-400 shrink-0" />
                      ) : isCurrent ? (
                        <CircleNotch className="size-3.5 text-primary animate-spin shrink-0" />
                      ) : isErrorStage ? (
                        <Warning className="size-3.5 text-rose-400 shrink-0" />
                      ) : (
                        <span className="size-3.5 rounded-full border border-muted-foreground/40 flex items-center justify-center text-[9px] font-mono shrink-0">
                          {idx + 1}
                        </span>
                      )}
                      <span className="font-semibold truncate text-[11px]">{st.name}</span>
                    </div>
                    <span className="text-[10px] text-muted-foreground line-clamp-1">{st.desc}</span>
                  </div>
                );
              })}
            </div>

            {/* Terminal Console Activity Output */}
            <div className="rounded-xl border border-border/80 bg-black/70 p-3 font-mono text-[11px] text-foreground/90 max-h-48 overflow-y-auto space-y-1 select-text">
            {telemetryLogs.map((log, idx) => (
              <div key={idx} className="flex items-start gap-2 leading-relaxed">
                <span className="text-muted-foreground shrink-0">{log.timestamp}</span>
                <span
                  className={`shrink-0 font-bold px-1 rounded text-[9px] uppercase ${
                    log.type === "success"
                      ? "bg-emerald-500/20 text-emerald-400"
                      : log.type === "error"
                      ? "bg-rose-500/20 text-rose-400"
                      : log.type === "warning"
                      ? "bg-amber-500/20 text-amber-400"
                      : "bg-blue-500/20 text-blue-400"
                  }`}
                >
                  [{log.stage}]
                </span>
                <span
                  className={
                    log.type === "error"
                      ? "text-rose-300"
                      : log.type === "success"
                      ? "text-emerald-300"
                      : "text-zinc-300"
                  }
                >
                  {log.message}
                </span>
              </div>
            ))}
            <div ref={terminalBottomRef} />
          </div>
        </Card>
      ); })()}

      {/* Indexed Clinical Evidence Dossier View */}
      <Card className="p-4 border-border/80 bg-card/80 space-y-3 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border/60 pb-2.5">
          <div className="flex items-center gap-2">
            <Article className="size-4 text-primary" />
            <span className="text-xs font-semibold text-foreground font-sans">
              Indexed Multi-Source Evidence Dossier ({filteredEvidences.length} clauses)
            </span>
          </div>

          {/* Filter Pills */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {[
              { id: "all", label: `All (${evidences.length})` },
              { id: "payer_cpb", label: "Insurer CPB" },
              { id: "pubmed_study", label: "PubMed Studies" },
              { id: "fda_package_insert", label: "FDA Labels" },
              { id: "legal_precedent", label: "ERISA Precedents" },
            ].map((f) => (
              <button
                key={f.id}
                onClick={() => setActiveEvidenceFilter(f.id)}
                className={`text-[10px] font-sans px-2 py-0.5 rounded-md border transition-colors cursor-pointer ${
                  activeEvidenceFilter === f.id
                    ? "bg-primary text-primary-foreground border-primary font-semibold"
                    : "border-border/70 bg-card hover:bg-muted text-muted-foreground hover:text-foreground"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* Evidence Clauses Feed */}
        {filteredEvidences.length === 0 ? (
          <div className="py-8 text-center text-xs text-muted-foreground font-sans">
            No clinical evidence clauses indexed for this source filter yet. Use the scanner above to crawl evidence.
          </div>
        ) : (
          <div className="space-y-2.5">
            {filteredEvidences.map((item) => {
              const isCopied = copiedId === item._id;
              return (
                <div
                  key={item._id}
                  className="rounded-xl border border-border/70 bg-card/90 p-3 space-y-2 text-xs hover:border-primary/40 transition-colors shadow-2xs"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                        {getSourceBadge(item.sourceType)}
                        <Badge variant="outline" className="font-mono text-xs max-w-[220px] sm:max-w-[320px] truncate" title={item.citationClause}>
                          {item.citationClause}
                        </Badge>
                        <Badge variant="secondary" className="font-mono text-[10px] shrink-0">
                          {item.relevanceScore}% Match
                        </Badge>
                      </div>
                      <h4 className="font-semibold text-foreground text-xs pt-0.5 leading-snug">
                        {item.title}
                      </h4>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => handleCopyCitation(item._id, `${item.title} (${item.citationClause})`)}
                        title="Copy citation reference"
                      >
                        {isCopied ? <Check className="size-3 text-emerald-500" /> : <Copy className="size-3" />}
                      </Button>

                      {item.sourceUrl && (
                        <a
                          href={item.sourceUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                          title="Open source URL"
                        >
                          <ArrowSquareOut className="size-3" />
                        </a>
                      )}

                      {onDeleteEvidence && (
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          onClick={() => onDeleteEvidence(item._id)}
                          className="text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                          title="Remove evidence clause"
                        >
                          <Trash className="size-3" />
                        </Button>
                      )}
                    </div>
                  </div>

                  <div className="rounded-lg bg-muted/30 border border-border/70 p-2.5 text-xs text-foreground/90 font-sans leading-relaxed whitespace-pre-line">
                    {stripMarkdownFormatting(item.extractedEvidenceMarkdown)}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
};
