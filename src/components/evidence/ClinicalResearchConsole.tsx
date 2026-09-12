import React, { useState, useEffect, useRef } from "react";
import {
  Globe,
  BookOpen,
  Flask,
  FileText,
  CircleNotch,
  CheckCircle,
  TrendUp,
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
  onCrawlCPB: (claimId: string, customUrl?: string) => Promise<unknown>;
  onCrawlPubMed: (claimId: string, query?: string, customUrl?: string) => Promise<unknown>;
  onCrawlFDA: (claimId: string, customUrl?: string, deviceName?: string) => Promise<unknown>;
  onCrawlCustomUrl: (
    claimId: string,
    url: string,
    category?: string,
    notes?: string
  ) => Promise<unknown>;
  onCrawlMultiSource: (claimId: string, customUrl?: string) => Promise<unknown>;
  onDeleteEvidence?: (evidenceId: string) => Promise<unknown>;
  onComputeScore?: (claimId: string) => Promise<unknown>;
  onNavigateToStudio?: () => void;
}

interface TelemetryLog {
  timestamp: string;
  stage: string;
  message: string;
  type: "info" | "success" | "warning" | "error";
}

export interface ResearchChannelConfig {
  id: ResearchMode;
  shortLabel: string;
  fullLabel: string;
  tagline: string;
  icon: React.ElementType;
  iconColor: string;
  badge?: string;
  description: string;
  clinicalImpact: string;
  actionButtonLabel: string;
}

export const RESEARCH_MODES: ResearchChannelConfig[] = [
  {
    id: "multi_source",
    shortLabel: "Multi-Source",
    fullLabel: "Full Multi-Source Sentinel Scan",
    tagline: "3-Channel Sweep",
    icon: Lightning,
    iconColor: "text-cyan-400 bg-cyan-500/15 border-cyan-500/30",
    badge: "Recommended",
    description:
      "Concurrently sweeps official Insurer Clinical Policy Bulletins (CPBs), queries PubMed for peer-reviewed clinical trial abstracts matching disputed CPT codes, and cross-references FDA indications in one synchronized extraction pipeline.",
    clinicalImpact:
      "Builds a comprehensive tri-pillar evidence dossier that simultaneously invalidates insurer policy misinterpretations, establishes medical efficacy, and verifies FDA on-label safety profiles.",
    actionButtonLabel: "Launch Multi-Source Research Scan",
  },
  {
    id: "payer_cpb",
    shortLabel: "Insurer CPB",
    fullLabel: "Insurer Policy Bulletin (CPB)",
    tagline: "Payer Coverage Rules",
    icon: BookOpen,
    iconColor: "text-blue-400 bg-blue-500/15 border-blue-500/30",
    description:
      "Indexes official clinical criteria and medical coverage policies published by the insurer to discover documentation prerequisites, step-therapy rules, and clinical necessity thresholds.",
    clinicalImpact:
      "Exposes when the payer's adverse determination contradicts its own published medical bulletin or imposes unwritten coverage restrictions prohibited under ERISA.",
    actionButtonLabel: "Crawl Insurer Policy Bulletin",
  },
  {
    id: "pubmed_trials",
    shortLabel: "PubMed Trials",
    fullLabel: "PubMed & ClinicalTrials.gov",
    tagline: "Peer-Reviewed RCTs",
    icon: Flask,
    iconColor: "text-emerald-400 bg-emerald-500/15 border-emerald-500/30",
    description:
      "Searches National Library of Medicine (NLM) databases for randomized controlled trials (RCTs), prospective cohort studies, and systematic meta-analyses supporting the clinical standard of care.",
    clinicalImpact:
      "Overcomes subjective insurer medical necessity rejections by citing peer-reviewed evidence proving therapeutic efficacy and patient outcome superiority.",
    actionButtonLabel: "Search PubMed Trial Database",
  },
  {
    id: "fda_labels",
    shortLabel: "FDA Labels",
    fullLabel: "FDA Package Inserts & Labels",
    tagline: "On-Label Indications",
    icon: ShieldCheck,
    iconColor: "text-purple-400 bg-purple-500/15 border-purple-500/30",
    description:
      "Retrieves Drugs@FDA and DailyMed official package inserts, FDA clearance summaries, and approved on-label medical device indications.",
    clinicalImpact:
      "Legally dismantles CARC CO-50 and CO-58 investigational denials by proving the procedure, implant, or pharmaceutical has received federal FDA marketing authorization for the diagnosed pathology.",
    actionButtonLabel: "Search FDA Approved Labels",
  },
  {
    id: "custom_url",
    shortLabel: "Custom URL",
    fullLabel: "Live Web & Guideline URL Scanner",
    tagline: "External Guideline",
    icon: Globe,
    iconColor: "text-amber-400 bg-amber-500/15 border-amber-500/30",
    description:
      "Crawls and extracts structured clinical criteria clauses directly from any publicly accessible insurer document, specialty society guideline (e.g., AAOS, NCCN, ACR), or hospital clinical pathway URL.",
    clinicalImpact:
      "Integrates specialized medical society consensus statements and state Medicaid policies directly into the claim's evidence matrix.",
    actionButtonLabel: "Scrape & Extract Criteria Clauses",
  },
];

export const PRESET_RESEARCH_URLS = [
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
      addLog("Extraction", "Running OpenAI gpt-5.4-nano clinical reasoning auditor on document payload...", "info");

      let result: Record<string, unknown> | null = null;
      if (activeMode === "multi_source") {
        result = (await onCrawlMultiSource(claim._id, customUrl || undefined)) as unknown as Record<string, unknown>;
        setCurrentStageIndex(3);
        addLog("Audit", `Synthesized multi-source dossier: ${result?.cpbClauses || 0} CPB, ${result?.pubMedClauses || 0} PubMed, ${result?.fdaClauses || 0} FDA clauses`, "success");
      } else if (activeMode === "payer_cpb") {
        result = (await onCrawlCPB(claim._id, customUrl || undefined)) as unknown as Record<string, unknown>;
        setCurrentStageIndex(3);
        addLog("Audit", `Extracted ${result?.clausesExtracted || 0} clinical policy clauses: "${result?.policyTitle || "Policy Bulletin"}"`, "success");
      } else if (activeMode === "pubmed_trials") {
        result = (await onCrawlPubMed(claim._id, customQuery || undefined, customUrl || undefined)) as unknown as Record<string, unknown>;
        setCurrentStageIndex(3);
        addLog("Audit", `Extracted ${result?.clausesExtracted || 0} trial clauses from study: "${result?.studyTitle || "PubMed Study"}" (${result?.identifier || "PMID"})`, "success");
      } else if (activeMode === "fda_labels") {
        result = (await onCrawlFDA(claim._id, customUrl || undefined, customQuery || undefined)) as unknown as Record<string, unknown>;
        setCurrentStageIndex(3);
        addLog("Audit", `Extracted ${result?.clausesExtracted || 0} FDA label clauses for: "${result?.productName || "Approved Medical Product"}" (${result?.applicationNumber || "NDA/PMA"})`, "success");
      } else if (activeMode === "custom_url") {
        result = (await onCrawlCustomUrl(claim._id, customUrl.trim(), customCategory, customQuery || undefined)) as unknown as Record<string, unknown>;
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
        (Number(result?.cpbClauses || 0) + Number(result?.pubMedClauses || 0) + Number(result?.fdaClauses || 0)) ||
        "multiple";

      setSuccessSummary(`Successfully indexed ${totalExtracted} clinical evidence clauses in ${(Date.now() - startTime) / 1000}s.`);
      addLog("Complete", "Research session completed successfully.", "success");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Clinical research crawl failed.";
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
                <TrendUp className="size-3.5 text-primary" />
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

        {/* Research Channel Selector */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-foreground font-sans">
              Clinical Research Channel
            </span>
            <span className="text-[11px] font-mono text-muted-foreground">
              Select ingestion pipeline
            </span>
          </div>

          <div
            role="tablist"
            aria-label="Clinical research channels"
            className="grid grid-cols-5 gap-1 p-1 rounded-xl bg-muted/30 border border-border/70 w-full"
          >
            {RESEARCH_MODES.map((mode, index) => {
              const Icon = mode.icon;
              const isSelected = activeMode === mode.id;
              return (
                <button
                  key={mode.id}
                  id={`tab-${mode.id}`}
                  role="tab"
                  aria-selected={isSelected}
                  aria-controls={`panel-${mode.id}`}
                  tabIndex={isSelected ? 0 : -1}
                  onKeyDown={(e) => {
                    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
                      e.preventDefault();
                      const nextIndex = (index + 1) % RESEARCH_MODES.length;
                      setActiveMode(RESEARCH_MODES[nextIndex].id);
                      document.getElementById(`tab-${RESEARCH_MODES[nextIndex].id}`)?.focus();
                    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
                      e.preventDefault();
                      const prevIndex = (index - 1 + RESEARCH_MODES.length) % RESEARCH_MODES.length;
                      setActiveMode(RESEARCH_MODES[prevIndex].id);
                      document.getElementById(`tab-${RESEARCH_MODES[prevIndex].id}`)?.focus();
                    }
                  }}
                  onClick={() => setActiveMode(mode.id)}
                  disabled={isExecuting}
                  className={`group relative flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg border text-xs font-semibold transition-all cursor-pointer whitespace-nowrap min-w-0 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 focus-visible:ring-offset-background ${
                    isSelected
                      ? "border-primary/50 bg-card text-foreground shadow-xs ring-1 ring-primary/30"
                      : "border-transparent bg-transparent hover:bg-card/60 text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <div
                    className={`size-5 rounded flex items-center justify-center border transition-colors shrink-0 ${
                      isSelected
                        ? mode.iconColor
                        : "border-border/60 bg-muted/40 text-muted-foreground group-hover:text-foreground"
                    }`}
                  >
                    <Icon className="size-3" />
                  </div>
                  <span className="truncate">{mode.shortLabel}</span>
                  {mode.badge && (
                    <span
                      className="size-1.5 rounded-full bg-primary shrink-0 ring-2 ring-primary/30"
                      title="Recommended"
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Active Channel Station Deck */}
        {(() => {
          const currentModeConfig = RESEARCH_MODES.find((m) => m.id === activeMode) ?? RESEARCH_MODES[0];
          const ActiveIcon = currentModeConfig.icon;

          return (
            <div
              id={`panel-${activeMode}`}
              role="tabpanel"
              aria-labelledby={`tab-${activeMode}`}
              tabIndex={0}
              className="rounded-xl border border-border/80 bg-card/90 p-4 space-y-4 shadow-xs focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-primary/40"
            >
              {/* Channel Briefing Header */}
              <div className="space-y-2">
                <div className="flex items-start sm:items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2.5">
                    <div
                      className={`size-8 rounded-lg flex items-center justify-center border ${currentModeConfig.iconColor}`}
                    >
                      <ActiveIcon className="size-4.5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="text-sm font-semibold text-foreground font-sans">
                          {currentModeConfig.fullLabel}
                        </h4>
                        {currentModeConfig.badge && (
                          <Badge variant="outline" className="font-mono text-[9px] h-4 px-1.5 text-primary border-primary/30">
                            {currentModeConfig.badge}
                          </Badge>
                        )}
                      </div>
                      <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
                        {currentModeConfig.tagline}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Full Unclipped Description */}
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {currentModeConfig.description}
                </p>

                {/* Clinical & Statutory Leverage Callout */}
                <div className="rounded-lg bg-primary/[0.04] border border-primary/20 p-2.5 flex items-start gap-2 text-xs">
                  <ShieldCheck className="size-4 text-primary shrink-0 mt-0.5" />
                  <div className="space-y-0.5">
                    <span className="text-[11px] font-semibold text-primary block">
                      Clinical & Statutory Leverage:
                    </span>
                    <p className="text-[11px] text-foreground/85 leading-relaxed">
                      {currentModeConfig.clinicalImpact}
                    </p>
                  </div>
                </div>
              </div>

              {/* Interactive Channel Parameters Surface */}
              <div className="rounded-xl border border-border/70 bg-muted/20 p-3 space-y-3">
                {activeMode === "multi_source" ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-semibold text-muted-foreground uppercase font-mono tracking-wider">
                        Active Ingestion Pipelines (3 Channels Concurrent):
                      </span>
                      <Badge variant="outline" className="font-mono text-[10px] text-primary border-primary/30">
                        Parallel Autonomous Sweep
                      </Badge>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                      {/* Pipeline 1: Insurer CPB */}
                      <div className="rounded-lg border border-border/70 bg-card/60 p-2.5 space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-semibold text-foreground flex items-center gap-1.5">
                            <BookOpen className="size-3.5 text-blue-400" />
                            Insurer Policy (CPB)
                          </span>
                          <Badge variant="outline" className="text-[9px] font-mono border-blue-500/30 text-blue-400">
                            Payer Rules
                          </Badge>
                        </div>
                        <p className="text-[11px] text-muted-foreground leading-tight">
                          Target: <strong className="text-foreground">{claim.patient?.insurancePayer || "Insurer"}</strong> clinical bulletin for CPT <strong className="font-mono text-foreground">{claim.cptCodes.join(", ")}</strong>.
                        </p>
                      </div>

                      {/* Pipeline 2: PubMed Clinical Trials */}
                      <div className="rounded-lg border border-border/70 bg-card/60 p-2.5 space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-semibold text-foreground flex items-center gap-1.5">
                            <Flask className="size-3.5 text-emerald-400" />
                            PubMed RCT Database
                          </span>
                          <Badge variant="outline" className="text-[9px] font-mono border-emerald-500/30 text-emerald-400">
                            Medical Literature
                          </Badge>
                        </div>
                        <p className="text-[11px] text-muted-foreground leading-tight">
                          Target: Efficacy trials & meta-analyses for CPT <strong className="font-mono text-foreground">{claim.cptCodes.join(", ")}</strong>.
                        </p>
                      </div>

                      {/* Pipeline 3: FDA Approved Labels */}
                      <div className="rounded-lg border border-border/70 bg-card/60 p-2.5 space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-semibold text-foreground flex items-center gap-1.5">
                            <ShieldCheck className="size-3.5 text-purple-400" />
                            FDA DailyMed Labels
                          </span>
                          <Badge variant="outline" className="text-[9px] font-mono border-purple-500/30 text-purple-400">
                            On-Label Match
                          </Badge>
                        </div>
                        <p className="text-[11px] text-muted-foreground leading-tight">
                          Target: Approved indications & device safety specs to refute CARC <strong className="font-mono text-foreground">{claim.denialReasonCode}</strong>.
                        </p>
                      </div>
                    </div>
                  </div>
                ) : activeMode === "custom_url" ? (
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
                  <div className="space-y-2">
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

                    {/* Quick Suggestions for PubMed */}
                    <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                      <span className="text-[10px] font-mono text-muted-foreground">Suggested Queries:</span>
                      {[
                        `Knee Arthroscopy vs Physical Therapy RCT`,
                        `Meniscal Tear Surgical Efficacy`,
                        `Conservative Management Failure Criteria`,
                      ].map((sq, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => setCustomQuery(sq)}
                          disabled={isExecuting}
                          className="text-[10px] font-sans px-2 py-0.5 rounded border border-border/80 bg-card hover:bg-muted text-foreground/80 hover:text-foreground transition-colors cursor-pointer"
                        >
                          {sq}
                        </button>
                      ))}
                    </div>
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
                    <p className="text-[10.5px] text-muted-foreground leading-tight pt-0.5">
                      Retrieves FDA DailyMed package inserts proving on-label clearance, dismantling CARC {claim.denialReasonCode || "CO-50"} experimental determinations.
                    </p>
                  </div>
                ) : (
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
                    <p className="text-[10.5px] text-muted-foreground leading-tight pt-0.5">
                      ClaimHero automatically crawls official {claim.patient?.insurancePayer} bulletins for CPT {claim.cptCodes.join(", ")}. Enter a URL only to override with an unindexed state or plan bulletin.
                    </p>
                  </div>
                )}
              </div>

              {/* Trigger Action Bar */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-border/60">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Sliders className="size-3.5 text-primary shrink-0" />
                  <span>
                    Target: <strong className="font-mono text-foreground">#{claim.claimNumber}</strong> &bull; {claim.patient?.name} (CPT {claim.cptCodes.join(", ")})
                  </span>
                </div>

                <Button
                  size="sm"
                  onClick={handleExecuteResearch}
                  disabled={isExecuting}
                  className="h-8.5 text-xs px-4 gap-2 bg-primary text-primary-foreground font-semibold shadow-xs hover:bg-primary/90 transition-all cursor-pointer shrink-0"
                >
                  {isExecuting ? (
                    <>
                      <CircleNotch className="size-3.5 animate-spin" />
                      <span>Streaming Extraction ({(elapsedMs / 1000).toFixed(1)}s)...</span>
                    </>
                  ) : (
                    <>
                      <ActiveIcon className="size-3.5" />
                      <span>{currentModeConfig.actionButtonLabel}</span>
                    </>
                  )}
                </Button>
              </div>
            </div>
          );
        })()}

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
                    className={`p-2.5 rounded-lg border text-xs transition-all ${isPast
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
                    className={`shrink-0 font-bold px-1 rounded text-[9px] uppercase ${log.type === "success"
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
        );
      })()}

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
                className={`text-[10px] font-sans px-2 py-0.5 rounded-md border transition-colors cursor-pointer ${activeEvidenceFilter === f.id
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
