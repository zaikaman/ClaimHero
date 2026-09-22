import React, { useState, useMemo } from "react";
import {
  CurrencyDollar,
  TrendUp,
  UserCheck,
  ShieldWarning,
  MagnifyingGlass,
  Buildings,
  DownloadSimple,
  Pulse,
  FileText,
  Clock,
  ArrowUpRight,
  Lightning,
  PlusCircle,
  Funnel,

  ArrowCounterClockwise,
  Trash,
  DotsThreeVertical,
  Envelope,
  CircleNotch,
  CheckCircle,
  PhoneCall,
  FileCode,
  CaretDown,
  CaretLeft,
  CaretRight,
  Flask,
  ShieldCheck,
  ClipboardText,
  Eye,
  EyeSlash,
} from "@phosphor-icons/react";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
import { Claim } from "../../types";
import { formatCurrency, matchesClaimSearch } from "../../lib/utils";
import { maskPatientName } from "../../lib/redactionEngine";
import {
  exportClaimsToCsv,
  exportClaimsToJson,
  triggerFileDownload,
} from "../../lib/exportUtils";
import { CPT_CODES, DENIAL_REASON_CODES } from "../../lib/constants";
import { useDetailMode } from "../../hooks/useDetailMode";
import {
  formatWhatHappenedSentence,
  formatDeadlineSentence,
  PLAIN_FIRST_RUN,
} from "../../lib/plainCopy";
import { DetailModeToggle } from "../common/DetailModeToggle";
import { DeadlineCountdown } from "./DeadlineCountdown";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Input } from "../ui/input";
import { Select } from "../ui/select";
import { Avatar, AvatarFallback } from "../ui/avatar";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "../ui/table";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "../ui/dropdown-menu";
import { DeleteCaseModal } from "../common/DeleteCaseModal";
import { cn } from "../../lib/utils";

interface CaseRadarProps {
  claims: Claim[];
  selectedClaimId: string;
  onSelectClaim: (claimId: string) => void;
  onOpenIngestion: (claim?: Claim) => void;
  onNavigateView: (
    view: "radar" | "evidence" | "studio" | "p2p" | "communications" | "audit"
  ) => void;
  onDeleteCase?: (claimId: string) => Promise<unknown>;
  onRunAutonomousPipeline?: (claimId: string) => Promise<unknown>;
  includeDemo?: boolean;
  onToggleIncludeDemo?: () => void;
  initialPayerFilter?: string;
  onClearPayerFilter?: () => void;
}

const hasCompletedIntakeContext = (claim: Claim): boolean => Boolean(
  claim.appealContext?.confirmedAt &&
    claim.appealContext.sender?.name?.trim() &&
    (claim.appealContext.sender?.email?.trim() || claim.appealContext.sender?.phone?.trim())
);

const formatPayerName = (payer: string | undefined): string => {
  if (!payer) return "Insurer";
  const p = payer.trim();
  if (/molina/i.test(p)) return "Molina Healthcare";
  if (/geoblue|geo-blue/i.test(p)) return "GeoBlue";
  if (/aetna international|aetna intl/i.test(p)) return "Aetna International";
  if (/aetna/i.test(p)) return "Aetna";
  if (/bcbsglobal|globalcore|bcbs global/i.test(p)) return "BCBS Global Core";
  if (/cigna global|cignaglobal/i.test(p)) return "Cigna Global";
  if (/cigna/i.test(p)) return "Cigna";
  if (/unitedhealthcare|uhc/i.test(p)) return "UnitedHealthcare";
  if (/elevance|anthem/i.test(p)) return "Elevance";
  if (/humana/i.test(p)) return "Humana";
  if (/blue cross|bcbs/i.test(p)) return "BCBS";
  if (/kaiser/i.test(p)) return "Kaiser";
  return p;
};

export const CaseRadar: React.FC<CaseRadarProps> = ({
  claims,
  selectedClaimId,
  onSelectClaim,
  onOpenIngestion,
  onNavigateView,
  onDeleteCase,
  onRunAutonomousPipeline,
  includeDemo = false,
  onToggleIncludeDemo,
  initialPayerFilter,
  onClearPayerFilter,
}) => {
  const { isDetailed } = useDetailMode();
  const [radarTab, setRadarTab] = useState<"family" | "teams">(() => isDetailed ? "teams" : "family");

  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");

  React.useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 250);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const [statusFilter, setStatusFilter] = useState("all");
  const [payerFilter, setPayerFilter] = useState(() => initialPayerFilter || "all");
  const [isPiiMasked, setIsPiiMasked] = useState(true);

  React.useEffect(() => {
    if (initialPayerFilter) {
      setPayerFilter(initialPayerFilter);
    }
  }, [initialPayerFilter]);
  const [caseToDelete, setCaseToDelete] = useState<Claim | null>(null);
  const [runningPipelineClaimId, setRunningPipelineClaimId] = useState<string | null>(null);
  const [isClearingDemo, setIsClearingDemo] = useState(false);

  const clearDemoDataMutation = useMutation(api.claims.clearDemoData);

  const handleClearDemoData = async () => {
    const toastId = toast.loading("Purging seeded demo records...");
    try {
      setIsClearingDemo(true);
      await clearDemoDataMutation({});
      toast.success("Demo cases successfully purged", { id: toastId });
    } catch (err) {
      console.error("Failed to clear demo cases:", err);
      toast.error("Failed to clear demo cases", { id: toastId });
    } finally {
      setIsClearingDemo(false);
    }
  };

  const statusArg = statusFilter !== "all" ? statusFilter : undefined;
  const payerArg = payerFilter !== "all" ? payerFilter : undefined;
  const searchArg = debouncedSearchQuery.trim() ? debouncedSearchQuery.trim() : undefined;
  const isFiltered = Boolean(statusArg || payerArg || searchArg);

  // Server-side filtered query for active cases
  const serverClaims = useQuery(api.claims.list, {
    status: statusArg,
    payer: payerArg,
    search: searchArg,
    limit: 100,
    includeDemo,
  }) as Claim[] | undefined;

  // Authoritative global portfolio stats backed by O(log N) TableAggregate
  const portfolioStats = useQuery(api.claims.getPortfolioStats, { includeDemo });

  // Filtered aggregate stats matching the active filters
  const filteredStats = useQuery(
    api.claims.getPortfolioStats,
    isFiltered
      ? {
          status: statusArg,
          payer: payerArg,
          search: searchArg,
          includeDemo,
        }
      : "skip"
  );

  const activeClaims = serverClaims ?? claims;
  const activeStats = isFiltered ? (filteredStats ?? portfolioStats) : portfolioStats;

  const { totalDisputed, totalWon, avgScore, highRiskCount, criticalCount } = useMemo(() => {
    if (activeStats) {
      return {
        totalDisputed: activeStats.totalDisputedAmount,
        totalWon: activeStats.overturnedWonAmount,
        avgScore: activeStats.averageWinScore,
        highRiskCount: activeStats.claimsByRisk?.high_confidence ?? 0,
        criticalCount: activeStats.criticalDeadlinesCount,
      };
    }

    const totalDisputed = activeClaims.reduce((acc, c) => acc + c.deniedAmount, 0);
    const wonClaims = activeClaims.filter((c) => c.status === "won");
    const totalWon = wonClaims.reduce((acc, c) => acc + c.deniedAmount, 0);
    const avgScore = activeClaims.length
      ? Math.round(
          activeClaims.reduce(
            (acc, c) =>
              acc +
              (c.appealReadinessScore ??
                c.evidenceCoverageScore ??
                c.overturnProbabilityScore ??
                0),
            0
          ) / activeClaims.length
        )
      : 0;
    const highRiskCount = activeClaims.filter((c) => {
      const score =
        c.appealReadinessScore ??
        c.evidenceCoverageScore ??
        c.overturnProbabilityScore;
      return score !== undefined && score >= 80;
    }).length;
    const criticalCount = activeClaims.filter(
      (c) => c.daysRemaining !== undefined && c.daysRemaining <= 14 && c.status !== "won"
    ).length;

    return { totalDisputed, totalWon, avgScore, highRiskCount, criticalCount };
  }, [activeStats, activeClaims]);

  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  // Compute status breakdown counts for filter tabs using portfolio aggregates
  const statusCounts = useMemo(() => {
    const source = (payerArg || searchArg)
      ? (filteredStats?.claimsByStatus ? filteredStats : portfolioStats)
      : portfolioStats;

    if (source) {
      return {
        all: source.totalClaims,
        critical_deadline: source.criticalDeadlinesCount,
        ingested: source.claimsByStatus?.ingested ?? 0,
        parsing: source.claimsByStatus?.parsing ?? 0,
        analyzing: source.claimsByStatus?.analyzing ?? 0,
        ready_for_review: source.claimsByStatus?.ready_for_review ?? 0,
        dispatched: source.claimsByStatus?.dispatched ?? 0,
        won: source.claimsByStatus?.won ?? 0,
      };
    }

    const counts: Record<string, number> = {
      all: activeClaims.length,
      critical_deadline: 0,
      ingested: 0,
      analyzing: 0,
      ready_for_review: 0,
      dispatched: 0,
      won: 0,
    };

    for (const c of activeClaims) {
      if (counts[c.status] !== undefined) {
        counts[c.status]++;
      }
      if (c.daysRemaining !== undefined && c.daysRemaining <= 14 && c.status !== "won") {
        counts.critical_deadline++;
      }
    }

    return counts;
  }, [payerArg, searchArg, filteredStats, portfolioStats, activeClaims]);

  const filtered = useMemo(() => {
    return activeClaims.filter((c) => {
      // 1. Status / Alarm filter
      if (statusFilter === "critical_deadline") {
        if (c.daysRemaining === undefined || c.daysRemaining > 14 || c.status === "won") return false;
      } else if (statusFilter !== "all" && c.status !== statusFilter) {
        return false;
      }

      // 2. Payer filter (in-memory safeguard while query synchronizes)
      if (payerFilter !== "all") {
        const p = c.patient?.insurancePayer || "";
        if (!p.toLowerCase().includes(payerFilter.toLowerCase())) {
          return false;
        }
      }

      // 3. Search query filter
      if (debouncedSearchQuery) {
        return matchesClaimSearch(c, debouncedSearchQuery);
      }

      return true;
    });
  }, [activeClaims, statusFilter, payerFilter, debouncedSearchQuery]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));

  // Reset page when filters change
  React.useEffect(() => {
    setCurrentPage(1);
  }, [statusFilter, payerFilter, debouncedSearchQuery]);

  const paginatedClaims = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, currentPage, pageSize]);

  const availablePayers = useMemo(() => {
    const payers = new Set<string>();
    for (const c of activeClaims) {
      const payer = c.patient?.insurancePayer?.trim();
      if (payer) payers.add(payer);
    }
    return Array.from(payers).sort((a, b) => a.localeCompare(b));
  }, [activeClaims]);

  const hasActiveFilters =
    statusFilter !== "all" || payerFilter !== "all" || Boolean(searchQuery);

  const handleResetFilters = () => {
    setStatusFilter("all");
    setPayerFilter("all");
    setSearchQuery("");
    onClearPayerFilter?.();
  };

  const statusTabs = [
    { id: "all", label: isDetailed ? "All Cases" : "All", count: statusCounts.all },
    {
      id: "critical_deadline",
      label: isDetailed ? "Urgent Alarms (<14d)" : "Needs attention",
      count: statusCounts.critical_deadline,
      isUrgent: true,
    },
    { id: "ingested", label: isDetailed ? "Intake / OCR" : "New", count: statusCounts.ingested },
    { id: "analyzing", label: isDetailed ? "Evidence Crawl" : "Gathering proof", count: statusCounts.analyzing },
    {
      id: "ready_for_review",
      label: isDetailed ? "Ready for Dispatch" : "Ready to send",
      count: statusCounts.ready_for_review,
    },
    { id: "dispatched", label: isDetailed ? "Transmitted" : "Sent", count: statusCounts.dispatched },
    { id: "won", label: isDetailed ? "Won / Overturned" : "Won", count: statusCounts.won, isWon: true },
  ];

  const handleExportCsv = (redactMode: boolean) => {
    if (filtered.length === 0) {
      toast.warning("No cases match the active filters to export.");
      return;
    }
    const csvContent = exportClaimsToCsv(filtered, redactMode);
    const prefix = redactMode ? "claimhero-cases-redacted" : "claimhero-cases-audit";
    const filename = `${prefix}-${new Date().toISOString().split("T")[0]}.csv`;
    triggerFileDownload(csvContent, filename, "text/csv;charset=utf-8;");
    toast.success(redactMode ? "Exported HIPAA-redacted CSV" : "Exported advocate audit CSV");
  };

  const handleExportJson = (redactMode: boolean) => {
    if (filtered.length === 0) {
      toast.warning("No cases match the active filters to export.");
      return;
    }
    const jsonContent = exportClaimsToJson(filtered, redactMode);
    const prefix = redactMode ? "claimhero-cases-redacted" : "claimhero-cases-audit";
    const filename = `${prefix}-${new Date().toISOString().split("T")[0]}.json`;
    triggerFileDownload(jsonContent, filename, "application/json;charset=utf-8;");
    toast.success(redactMode ? "Exported HIPAA-redacted JSON" : "Exported advocate audit JSON");
  };

  return (
    <div className="space-y-4 animate-fadeIn font-sans">
      {/* Primary View Mode Switcher: My Cases (Everyday / Families) vs For Teams & Advocates */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-border/60">
        <div className="flex items-center gap-1.5 p-1 rounded-lg bg-muted/40 border border-border/60 w-fit">
          <button
            onClick={() => setRadarTab("family")}
            className={cn(
              "px-3 py-1.5 rounded-md text-xs font-medium transition-all cursor-pointer",
              radarTab === "family"
                ? "bg-card text-foreground font-semibold shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            My Cases
          </button>
          <button
            onClick={() => setRadarTab("teams")}
            className={cn(
              "px-3 py-1.5 rounded-md text-xs font-medium transition-all cursor-pointer",
              radarTab === "teams"
                ? "bg-card text-foreground font-semibold shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            For Teams & Advocates
          </button>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={() => onOpenIngestion()}
            className="gap-1.5 text-xs h-8 shadow-xs cursor-pointer"
          >
            <PlusCircle className="size-3.5" weight="bold" />
            <span>{isDetailed ? "Ingest Denial" : "Add denial letter"}</span>
          </Button>
          <DetailModeToggle compact className="inline-flex" />
        </div>
      </div>

      {radarTab === "family" ? (
        <div className="space-y-4">
          <div className="space-y-1">
            <h2 className="text-base sm:text-lg font-bold text-foreground tracking-tight">Your Cases</h2>
            <p className="text-xs text-muted-foreground">
              Bills the insurer refused to pay — what happened, your deadline, and your appeal letter.
            </p>
          </div>

          {activeClaims.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border/80 bg-card/40 p-8 text-center space-y-3">
              <div className="mx-auto flex size-12 items-center justify-center rounded-xl bg-muted border border-border/60 text-muted-foreground">
                <FileText className="size-6" />
              </div>
              <div className="space-y-1 max-w-sm mx-auto">
                <p className="text-sm font-semibold text-foreground">No medical bills added yet</p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Upload a photo or PDF of your denial letter. ClaimHero explains what happened in plain English, checks the insurer rules, and prepares an appeal letter for you to review and approve.
                </p>
              </div>
              <Button
                size="sm"
                onClick={() => onOpenIngestion()}
                className="gap-1.5 text-xs h-9 px-4 cursor-pointer"
              >
                <PlusCircle className="size-4" weight="bold" />
                <span>Add denial letter</span>
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3">
              {activeClaims.map((c) => {
                const whatHappened = formatWhatHappenedSentence(c);
                const deadline = formatDeadlineSentence(c.statutoryDeadline, c.daysRemaining ?? 180);
                const isWon = c.status === "won";
                const isDispatched = c.status === "dispatched" || c.status === "under_review";
                const isUrgent = (c.daysRemaining ?? 180) <= 14 && !isWon && !isDispatched;
                const isReady = c.status === "ready_for_review" || Boolean(c.latestAppeal);
                const needsIntake = !isWon && !isDispatched && !isReady && !hasCompletedIntakeContext(c);

                return (
                  <div
                    key={c._id}
                    onClick={() => {
                      onSelectClaim(c._id);
                      if (needsIntake) {
                        onOpenIngestion(c);
                      } else {
                        onNavigateView(isWon || isDispatched ? "communications" : "studio");
                      }
                    }}
                    className={cn(
                      "group rounded-xl border bg-card/80 backdrop-blur-sm p-4 transition-all hover:bg-card hover:border-primary/40 cursor-pointer shadow-xs",
                      selectedClaimId === c._id ? "border-primary/60 ring-1 ring-primary/20" : "border-border/70"
                    )}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="space-y-1.5 min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          {isWon ? (
                            <Badge variant="secondary" className="font-sans text-[10px] text-emerald-600 dark:text-emerald-400 bg-emerald-500/15 border border-emerald-500/30">
                              Won • Full payment
                            </Badge>
                          ) : isDispatched ? (
                            <Badge variant="outline" className="font-sans text-[10px] text-sky-400 border-sky-500/30 bg-sky-500/10">
                              Sent to insurer
                            </Badge>
                          ) : needsIntake ? (
                            <Badge variant="outline" className="font-sans text-[10px] text-amber-500 border-amber-500/40 bg-amber-500/10">
                              Needs your details
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="font-sans text-[10px] text-amber-500 bg-amber-500/10 border border-amber-500/20">
                              Ready to review
                            </Badge>
                          )}
                          <span className="text-[11px] font-mono text-muted-foreground">
                            Case #{c.claimNumber}
                          </span>
                          {(c.isDemo ||
                            c.dataOrigin === "demo-fixture" ||
                            c.origin === "demo-fixture" ||
                            c.isSyntheticPII) && (
                            <Badge variant="outline" className="font-mono text-[10px] text-muted-foreground border-border/80">
                              Synthetic Demo
                            </Badge>
                          )}
                        </div>

                        {/* 1 Sentence: What happened */}
                        <p className="text-sm font-semibold text-foreground leading-snug">
                          {whatHappened}
                        </p>

                        {/* 1 Date: What to do by when */}
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Clock className={cn("size-3.5 shrink-0", isUrgent ? "text-destructive" : "text-primary")} />
                          <span className={cn("font-medium", isUrgent ? "text-destructive font-bold" : "text-foreground/80")}>
                            {deadline}
                          </span>
                        </div>
                      </div>

                      {/* 1 Button: contextual primary action (mirrors expert table) */}
                      <div className="flex items-center gap-2 shrink-0 self-start sm:self-center">
                        {needsIntake ? (
                          <Button
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              onSelectClaim(c._id);
                              onOpenIngestion(c);
                            }}
                            title="Add your contact details to continue"
                            className="h-9 px-4 text-xs font-semibold shadow-2xs gap-1.5 bg-amber-600 hover:bg-amber-500 text-white border border-amber-500/30 cursor-pointer"
                          >
                            <ClipboardText className="size-4" weight="bold" />
                            <span>Add your details</span>
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              onSelectClaim(c._id);
                              onNavigateView(isWon || isDispatched ? "communications" : "studio");
                            }}
                            className="h-9 px-4 text-xs font-semibold shadow-xs gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90 cursor-pointer"
                          >
                            <FileText className="size-4" />
                            <span>{isWon ? "View Outcome" : isDispatched ? "Track Status" : "Review & Approve"}</span>
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <>
          {/* 1. Top 4 Macro Financial & Risk Metrics */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {/* Card 1: Disputed Portfolio */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle>
                  <div className="flex size-7 items-center justify-center rounded-lg border border-border bg-muted text-muted-foreground">
                    <CurrencyDollar className="size-4" />
                  </div>
                </CardTitle>
                <CardDescription className="text-xs">{isDetailed ? "Total Disputed Pipeline" : "Total you're challenging"}</CardDescription>
              </CardHeader>
          <CardContent className="flex flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <div className="font-medium text-2xl sm:text-3xl tabular-nums leading-none tracking-tight text-foreground font-mono">
                {formatCurrency(totalDisputed)}
              </div>
              <Badge variant="outline" className="text-[11px] font-mono">
                {filtered.length} {filtered.length === 1 ? "Case" : "Cases"}
              </Badge>
              {includeDemo && (
                <span className="text-[11px] font-mono text-muted-foreground/80 tracking-tight">
                  *includes demo
                </span>
              )}
            </div>
            <p className="text-muted-foreground text-xs">
              {isDetailed ? "Under active ERISA statutory review" : "Across all your bills"}
            </p>
          </CardContent>
        </Card>

        {/* Card 2: High Dossier Readiness & Coverage */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle>
              <div className="flex size-7 items-center justify-center rounded-lg border border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                <TrendUp className="size-4" />
              </div>
            </CardTitle>
            <CardDescription className="text-xs">{isDetailed ? "High Dossier Readiness" : "Strong cases"}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <div className="font-medium text-2xl sm:text-3xl tabular-nums leading-none tracking-tight text-emerald-600 dark:text-emerald-400 font-mono">
                {highRiskCount} {highRiskCount === 1 ? "Case" : "Cases"}
              </div>
              <Badge variant="outline" className="text-[10px] font-mono text-emerald-600 border-emerald-500/30">
                {isDetailed ? "≥ 80 Readiness" : "Ready for review"}
              </Badge>
            </div>
            <p className="text-muted-foreground text-xs">
              {isDetailed ? "Strong precedent alignment detected" : "Good proof found so far"}
            </p>
          </CardContent>
        </Card>

        {/* Card 3: Recovered Funds */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle>
              <div className="flex size-7 items-center justify-center rounded-lg border border-border bg-muted text-muted-foreground">
                <UserCheck className="size-4" />
              </div>
            </CardTitle>
            <CardDescription className="text-xs">{isDetailed ? "Recovered Viable Funds" : "Money saved"}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <div className="font-medium text-2xl sm:text-3xl tabular-nums leading-none tracking-tight text-emerald-600 dark:text-emerald-400 font-mono">
                {formatCurrency(totalWon)}
              </div>
              <Badge variant="secondary" className="text-[11px] font-mono">
                {avgScore}/100 {isDetailed ? "Avg Readiness" : "Avg strength"}
              </Badge>
              {includeDemo && (
                <span className="text-[11px] font-mono text-muted-foreground/80 tracking-tight">
                  *includes demo
                </span>
              )}
            </div>
            <p className="text-muted-foreground text-xs">
              {isDetailed ? `Across ${filtered.length} cross-examined CPBs` : "Won back from insurers"}
            </p>
          </CardContent>
        </Card>

        {/* Card 4: Urgent Alarms */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle>
              <div className="flex size-7 items-center justify-center rounded-lg border border-border bg-muted text-muted-foreground">
                {criticalCount > 0 ? (
                  <ShieldWarning className="size-4 text-destructive" />
                ) : (
                  <Clock className="size-4" />
                )}
              </div>
            </CardTitle>
            <CardDescription className="text-xs">{isDetailed ? "Statutory Alarms (<14d)" : "Need attention soon"}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <div
                className={`font-medium text-2xl sm:text-3xl tabular-nums leading-none tracking-tight ${
                  criticalCount > 0 ? "text-destructive font-mono" : "text-foreground font-mono"
                }`}
              >
                {criticalCount} {isDetailed ? "Urgent" : criticalCount === 1 ? "Case" : "Cases"}
              </div>
              {isDetailed && (
                <Badge variant="outline" className="text-[10px] font-mono">
                  29 CFR § 2560.503-1
                </Badge>
              )}
            </div>
            <p className="text-muted-foreground text-xs">
              {isDetailed ? "Deadlines expiring within statutory window" : "Less than 14 days left to act"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* 2. Main Claims Table & Integrated Radar Control Hub */}
      <Card>
        <CardHeader className="pb-3 space-y-3 border-b border-border/60">
          {/* Header Action Row */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <CardTitle className="text-base font-semibold text-foreground">
                  {isDetailed ? "Case Ingestion & Adjudication Radar" : "Your denied bills"}
                </CardTitle>
                <Badge variant="outline" className="font-mono text-[10px]">
                  {filtered.length} of {claims.length} {claims.length === 1 ? "Case" : "Cases"}
                </Badge>
              </div>
              <CardDescription className="text-xs mt-0.5">
                {isDetailed
                  ? "Active medical denial records with plan coverage, CPT codes, CARC reason, and statutory ERISA clock."
                  : "What the insurer refused to pay, why, and how much time you have left."}
              </CardDescription>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 text-xs h-8"
                  >
                    <DownloadSimple className="size-3.5" />
                    <span>Export</span>
                    <CaretDown className="size-3 text-muted-foreground" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground px-2 py-1">
                    HIPAA Redacted Exports
                  </DropdownMenuLabel>
                    <DropdownMenuItem
                      onClick={() => handleExportCsv(true)}
                      className="gap-2 text-xs cursor-pointer"
                    >
                      <ShieldCheck className="size-3.5 text-emerald-500" />
                      <div className="flex flex-col">
                        <span className="font-medium">Export Redacted CSV (Safe Harbor)</span>
                        <span className="text-[10px] text-muted-foreground">Masks PHI, Member ID & Sensitive Codes</span>
                      </div>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => handleExportJson(true)}
                      className="gap-2 text-xs cursor-pointer"
                    >
                      <FileCode className="size-3.5 text-emerald-500" />
                      <div className="flex flex-col">
                        <span className="font-medium">Export Redacted JSON</span>
                        <span className="text-[10px] text-muted-foreground">De-identified schema dataset</span>
                      </div>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground px-2 py-1">
                      Full Advocate Exports
                    </DropdownMenuLabel>
                    <DropdownMenuItem
                      onClick={() => handleExportCsv(false)}
                      className="gap-2 text-xs cursor-pointer"
                    >
                      <FileText className="size-3.5 text-primary" />
                      <div className="flex flex-col">
                        <span>Export Unredacted CSV (.csv)</span>
                        <span className="text-[10px] text-muted-foreground">Audit copy (Redacted cases stay masked)</span>
                      </div>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => handleExportJson(false)}
                      className="gap-2 text-xs cursor-pointer"
                    >
                      <FileCode className="size-3.5 text-cyan-400" />
                      <div className="flex flex-col">
                        <span>Export Unredacted JSON (.json)</span>
                        <span className="text-[10px] text-muted-foreground">Full technical audit payload</span>
                      </div>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
              </DropdownMenu>

              <Button
                variant="outline"
                size="sm"
                onClick={handleClearDemoData}
                disabled={isClearingDemo}
                className="h-8 gap-1.5 text-xs text-destructive hover:bg-destructive/10 border-destructive/30 shrink-0 cursor-pointer"
                title="Clear all synthetic demo fixtures from this portfolio"
              >
                <Trash className="size-3.5" />
                <span>{isClearingDemo ? "Clearing..." : "Clear Demo Data"}</span>
              </Button>

              <Button
                size="sm"
                onClick={() => onOpenIngestion()}
                className="h-8 gap-1.5 text-xs bg-primary text-primary-foreground font-semibold shadow-xs shrink-0 cursor-pointer"
              >
                <PlusCircle className="size-3.5" />
                <span>{isDetailed ? "Ingest Denial" : "Add denial"}</span>
              </Button>
            </div>
          </div>

          {/* Integrated Status Tabs Filter Strip */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none pt-1" role="group" aria-label="Filter claims by status">
            {statusTabs.map((tab) => {
              const isSelected = statusFilter === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  aria-pressed={isSelected}
                  aria-label={`Filter by ${tab.label}, ${tab.count} cases`}
                  onClick={() => setStatusFilter(tab.id)}
                  className={cn(
                    "flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium whitespace-nowrap transition-all cursor-pointer border",
                    isSelected
                      ? "bg-primary text-primary-foreground border-transparent font-semibold shadow-2xs"
                      : "bg-muted/30 hover:bg-muted/70 text-muted-foreground hover:text-foreground border-border/70"
                  )}
                >
                  <span>{tab.label}</span>
                  {tab.count > 0 && (
                    <span
                      className={cn(
                        "text-[10px] font-mono px-1.5 py-0.2 rounded-md font-semibold",
                        isSelected
                          ? "bg-primary-foreground/20 text-primary-foreground"
                          : tab.isUrgent
                          ? "bg-destructive/15 text-destructive"
                          : tab.isWon
                          ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                          : "bg-muted text-muted-foreground"
                      )}
                    >
                      {tab.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Table Search & Payer Filter Toolbar */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-2.5 pt-1">
            <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
              {/* Search Bar */}
              <div className="relative w-full sm:w-64">
                <MagnifyingGlass className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="claim-search-input"
                  aria-label={isDetailed ? "Search claims by patient, CPT code, or insurer" : "Search by name, insurer, or treatment"}
                  className="h-8 pl-8 text-xs bg-background"
                  placeholder={isDetailed ? "Search claim, patient, CPT, insurer..." : "Search name, insurer, treatment..."}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              {/* Insurer Payer Filter */}
              <div className="flex items-center gap-1.5">
                <Buildings className="size-3.5 text-muted-foreground hidden sm:inline" />
                <Select
                  aria-label={isDetailed ? "Filter by insurance payer" : "Filter by insurer"}
                  value={payerFilter}
                  onChange={(e) => setPayerFilter(e.target.value)}
                  className="h-8 text-xs font-sans"
                >
                  <option value="all">{isDetailed ? "All Insurers" : "All insurers"}</option>
                  {availablePayers.map((payerName) => (
                    <option key={payerName} value={payerName}>
                      {payerName}
                    </option>
                  ))}
                </Select>
              </div>

              {/* Include Demo Cases Toggle */}
              <button
                type="button"
                onClick={onToggleIncludeDemo}
                aria-pressed={includeDemo}
                aria-label="Toggle visibility of synthetic evaluation demo cases in portfolio"
                className={cn(
                  "flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border transition-colors cursor-pointer",
                  includeDemo
                    ? "bg-amber-500/15 border-amber-500/40 text-amber-600 dark:text-amber-400 font-semibold"
                    : "bg-muted/30 hover:bg-muted/60 text-muted-foreground border-border/70"
                )}
                title="Toggle visibility of synthetic evaluation demo cases in portfolio"
              >
                <Flask className="size-3.5" />
                <span>{includeDemo ? "Demo cases included" : "Include demo cases"}</span>
              </button>

              {/* PII Privacy Shield Toggle */}
              <button
                type="button"
                onClick={() => setIsPiiMasked((prev) => !prev)}
                aria-pressed={isPiiMasked}
                aria-label="Toggle patient PII masking in table display"
                className={cn(
                  "flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border transition-colors cursor-pointer",
                  isPiiMasked
                    ? "bg-cyan-500/15 border-cyan-500/40 text-cyan-700 dark:text-cyan-300 font-semibold"
                    : "bg-muted/30 hover:bg-muted/60 text-muted-foreground border-border/70"
                )}
                title="Toggle patient PII masking for advocate privacy"
              >
                {isPiiMasked ? <EyeSlash className="size-3.5 text-cyan-600 dark:text-cyan-400" /> : <Eye className="size-3.5" />}
                <span>{isPiiMasked ? "PII Masked" : "Reveal PII"}</span>
              </button>

              {/* Reset Filters CTA if active */}
              {hasActiveFilters && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleResetFilters}
                  className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground gap-1"
                >
                  <ArrowCounterClockwise className="size-3" />
                  <span>Reset</span>
                </Button>
              )}
            </div>

            <div className="text-[11px] font-mono text-muted-foreground self-end sm:self-auto">
              Showing {filtered.length} {filtered.length === 1 ? "case" : "cases"}
            </div>
          </div>
        </CardHeader>

        {/* Data Table */}
        <div className="overflow-x-auto">
          <Table className="min-w-[850px]">
            <TableHeader className="bg-muted/30">
              <TableRow>
                <TableHead>{isDetailed ? "Claim & Patient" : "Case"}</TableHead>
                <TableHead>{isDetailed ? "Payer" : "Insurer"}</TableHead>
                <TableHead>{isDetailed ? "CPT Code" : "Care received"}</TableHead>
                <TableHead>{isDetailed ? "Denial Reason" : PLAIN_FIRST_RUN.whyDenied}</TableHead>
                <TableHead>{isDetailed ? "Disputed" : "Bill amount"}</TableHead>
                <TableHead>{isDetailed ? "Readiness" : "Strength"}</TableHead>
                <TableHead>{isDetailed ? "Statutory Clock" : "Time left"}</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="h-36 text-center text-muted-foreground">
                    <div className="flex flex-col items-center justify-center space-y-2 py-4">
                      <Funnel className="size-6 text-muted-foreground/60" />
                      <div className="text-xs font-semibold text-foreground">
                        {isDetailed ? "No claims match your current filter" : "No cases match your filters"}
                      </div>
                      <p className="text-[11px] text-muted-foreground max-w-xs">
                        Try resetting your search query or switching to &quot;{isDetailed ? "All Cases" : "All"}&quot;.
                      </p>
                      {hasActiveFilters && (
                        <Button
                          variant="outline"
                          size="xs"
                          onClick={handleResetFilters}
                          className="mt-1"
                        >
                          Clear Filters
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                paginatedClaims.map((claim) => {
                  const isSelected = claim._id === selectedClaimId;
                  const isWon = claim.status === "won";
                  const denialReason = DENIAL_REASON_CODES[claim.denialReasonCode];
                  const primaryCpt = claim?.cptCodes?.[0] || "";
                  const cptInfo = primaryCpt ? CPT_CODES[primaryCpt] : undefined;
                  const payerLabel = formatPayerName(claim.patient?.insurancePayer);

                  return (
                    <TableRow
                      key={claim._id}
                      onClick={() => onSelectClaim(claim._id)}
                      data-state={isSelected ? "selected" : undefined}
                      className={cn(
                        "cursor-pointer hover:bg-muted/40 transition-colors",
                        isWon && "bg-emerald-500/[0.02]"
                      )}
                    >
                      {/* 1. Claim & Patient (Avatar + Name + Claim Number) */}
                      <TableCell className="py-2.5">
                        <div className="flex items-center gap-2 min-w-0">
                          <Avatar
                            size="sm"
                            className={cn(
                              "font-semibold shrink-0",
                              isWon
                                ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30"
                                : "bg-muted text-foreground"
                            )}
                          >
                            <AvatarFallback className="text-[10px]">
                              {claim.patient?.name ? claim.patient.name.slice(0, 2).toUpperCase() : "PT"}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex flex-col min-w-0">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span
                                className="font-semibold text-foreground text-xs truncate max-w-[110px]"
                                title={isPiiMasked ? undefined : (claim.patient?.name || undefined)}
                              >
                                {claim.patient?.name
                                  ? (isPiiMasked ? maskPatientName(claim.patient.name, "HIPAA_SAFE_HARBOR") : claim.patient.name)
                                  : "Patient Record"}
                              </span>
                              {isWon && (
                                <Badge
                                  variant="default"
                                  className="bg-emerald-500/20 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/40 text-[10px] px-1 py-0 font-bold shrink-0 leading-none h-4"
                                >
                                  WON
                                </Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-mono text-[10px] text-muted-foreground truncate max-w-[120px]">
                                {claim.claimNumber}
                              </span>
                              {(claim.isDemo ||
                                claim.dataOrigin === "demo-fixture" ||
                                claim.origin === "demo-fixture" ||
                                claim.isSyntheticPII) && (
                                <Badge variant="secondary" className="font-mono text-[10px] px-1 py-0 text-amber-500 bg-amber-500/10 border-amber-500/20">
                                  Synthetic Demo
                                </Badge>
                              )}
                              {claim.isShared && (
                                <Badge variant="outline" className="font-mono text-[10px] px-1 py-0 text-violet-300 bg-violet-500/10 border-violet-500/30">
                                  Shared{claim.accessRole && claim.accessRole !== "owner" ? ` • ${claim.accessRole}` : ""}
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>
                      </TableCell>

                      {/* 2. Payer */}
                      <TableCell className="py-2.5">
                        <Badge
                          variant="outline"
                          className={cn(
                            "font-medium max-w-[100px] truncate block text-center",
                            isWon && "border-emerald-500/30 text-emerald-600 dark:text-emerald-400 bg-emerald-500/5"
                          )}
                          title={claim.patient?.insurancePayer || "Insurer"}
                        >
                          {payerLabel}
                        </Badge>
                      </TableCell>

                      {/* 3. Care received (CPT code preserved for search) */}
                      <TableCell className="py-2.5">
                        <div className="flex flex-col min-w-0">
                          <Badge variant="secondary" className="font-mono text-[11px] w-fit px-1.5 py-0" title={primaryCpt ? `CPT ${primaryCpt}` : undefined}>
                            {primaryCpt ? `CPT ${primaryCpt}` : (isDetailed ? "No CPT" : "Not listed")}
                          </Badge>
                          {cptInfo && (
                            <span className="text-[10px] text-muted-foreground truncate max-w-[110px] mt-0.5" title={cptInfo.name}>
                              {cptInfo.name}
                            </span>
                          )}
                        </div>
                      </TableCell>

                      {/* 4. Denial Code */}
                      <TableCell className="py-2.5">
                        <div className="flex flex-col min-w-0">
                          {isWon ? (
                            <Badge
                              variant="outline"
                              className="font-mono text-[9px] w-fit px-1.5 py-0 border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 line-through decoration-emerald-500/60 font-semibold"
                              title="Original Denial Reason Code (Overturned)"
                            >
                              {claim.denialReasonCode}
                            </Badge>
                          ) : (
                            <Badge variant="destructive" className="font-mono text-[9px] w-fit px-1.5 py-0">
                              {claim.denialReasonCode}
                            </Badge>
                          )}
                          {denialReason && (
                            <span
                              className="text-[10px] text-muted-foreground truncate max-w-[110px] mt-0.5"
                              title={isWon ? "Overturned Adverse Determination" : denialReason.title}
                            >
                              {isWon ? "Overturned" : denialReason.title}
                            </span>
                          )}
                        </div>
                      </TableCell>

                      {/* 5. Disputed Amount */}
                      <TableCell className="py-2.5">
                        <div className="flex flex-col">
                          {isWon ? (
                            <>
                              <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400 text-xs">
                                {formatCurrency(claim.deniedAmount)}
                              </span>
                              <span className="font-mono text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
                                Saved 100% (Owes $0)
                              </span>
                            </>
                          ) : (
                            <>
                              <span className="font-mono font-bold text-destructive text-xs">
                                {formatCurrency(claim.deniedAmount)}
                              </span>
                              <span className="font-mono text-[10px] text-muted-foreground">
                                Owes: {formatCurrency(claim.patientOwedAmount)}
                              </span>
                            </>
                          )}
                        </div>
                      </TableCell>

                      {/* 6. Case strength */}
                      <TableCell className="py-2.5">
                        {isWon ? (
                          <div className="flex items-center gap-1 font-mono">
                            <Badge
                              variant="secondary"
                              className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 text-[10px] font-semibold gap-1 px-1.5 py-0.5"
                            >
                              <CheckCircle className="size-3 text-emerald-500" />
                              <span>100% Won</span>
                            </Badge>
                          </div>
                        ) : (claim.appealReadinessScore ?? claim.evidenceCoverageScore ?? claim.overturnProbabilityScore) !== undefined ? (
                          <div className="flex items-center gap-1 font-mono" title={isDetailed ? "Statutory Appeal Readiness Score: 4-pillar evidentiary completeness audit" : "Case strength: how complete your proof is"}>
                            <span className="font-bold text-xs text-foreground">
                              {claim.appealReadinessScore ?? claim.evidenceCoverageScore ?? claim.overturnProbabilityScore}/100
                            </span>
                            <Badge
                              variant="secondary"
                              className={`text-[9px] px-1 py-0 ${
                                (claim.appealReadinessScore ?? claim.evidenceCoverageScore ?? claim.overturnProbabilityScore)! >= 80
                                  ? "text-emerald-600 dark:text-emerald-400"
                                  : "text-amber-500"
                              }`}
                            >
                              {claim.evidenceIntegrity?.scoreStatus === "provisional_capped"
                                ? isDetailed
                                  ? "Capped"
                                  : "Limited"
                                : claim.riskLevel === "high_confidence"
                                ? "Ready"
                                : "Gaps"}
                            </Badge>
                          </div>
                        ) : (
                          <span className="text-[11px] text-muted-foreground font-mono">
                            Pending
                          </span>
                        )}
                      </TableCell>

                      {/* 7. Statutory Clock */}
                      <TableCell className="py-2.5">
                        <DeadlineCountdown
                          daysRemaining={claim.daysRemaining}
                          statutoryDeadline={claim.statutoryDeadline}
                          appealFilingDeadlineDays={claim.appealFilingDeadlineDays}
                          isWon={isWon}
                          size="sm"
                        />
                      </TableCell>

                      {/* 8. Actions */}
                      <TableCell className="py-2.5 text-right">
                        <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                          {/* Smart Contextual Primary Action */}
                          {claim.status === "won" ? (
                            <Button
                              variant="secondary"
                              size="xs"
                              onClick={() => {
                                onSelectClaim(claim._id);
                                onNavigateView("communications");
                              }}
                              title={isDetailed ? "Open Insurer Reversal Notice & Communications" : "See insurer's reply"}
                              className="h-7 px-2.5 text-xs gap-1 border-emerald-500/30 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20"
                            >
                              <CheckCircle className="size-3 text-emerald-500" />
                              <span>Reversal</span>
                            </Button>
                          ) : claim.status === "dispatched" ? (
                            <Button
                              variant="secondary"
                              size="xs"
                              onClick={() => {
                                onSelectClaim(claim._id);
                                onNavigateView("communications");
                              }}
                              title={isDetailed ? "Open Payer Communications Inbox" : "Open messages"}
                              className="h-7 px-2.5 text-xs gap-1"
                            >
                              <Envelope className="size-3" />
                              <span>Inbox</span>
                            </Button>
                          ) : claim.status === "ready_for_review" || Boolean(claim.latestAppeal) ? (
                            <Button
                              variant="default"
                              size="xs"
                              onClick={() => {
                                onSelectClaim(claim._id);
                                onNavigateView("studio");
                              }}
                              title={isDetailed ? "Review Drafted Appeal Brief" : "Review your letter and send it"}
                              className="h-7 px-2.5 text-xs gap-1 bg-primary text-primary-foreground font-semibold shadow-2xs"
                            >
                              <FileText className="size-3" />
                              <span>Review & Send</span>
                              <ArrowUpRight className="size-2.5 opacity-70" />
                            </Button>
                          ) : !hasCompletedIntakeContext(claim) ? (
                            <Button
                              variant="default"
                              size="xs"
                              onClick={(e) => {
                                e.stopPropagation();
                                onSelectClaim(claim._id);
                                onOpenIngestion(claim);
                              }}
                              title={isDetailed ? "Complete compulsory clinical intake and submitter form" : "Add your contact details to continue"}
                              className="h-7 px-2.5 text-xs gap-1 bg-amber-600 hover:bg-amber-500 text-white font-semibold shadow-2xs border border-amber-500/30"
                            >
                              <ClipboardText className="size-3" weight="bold" />
                              <span>{isDetailed ? "Complete Form" : "Add your details"}</span>
                            </Button>
                          ) : claim.status === "analyzing" || (claim.evidenceCount && claim.evidenceCount > 0) ? (
                            <Button
                              variant="default"
                              size="xs"
                              onClick={() => {
                                onSelectClaim(claim._id);
                                onNavigateView("studio");
                              }}
                              title={isDetailed ? "Synthesize Appeal Brief" : "Write your appeal letter"}
                              className="h-7 px-2.5 text-xs gap-1"
                            >
                              <FileText className="size-3" />
                              <span>{isDetailed ? "Draft Brief" : "Write letter"}</span>
                            </Button>
                          ) : (
                            <Button
                              variant="default"
                              size="xs"
                              disabled={runningPipelineClaimId === claim._id}
                              onClick={async (e) => {
                                e.stopPropagation();
                                onSelectClaim(claim._id);
                                if (onRunAutonomousPipeline) {
                                  setRunningPipelineClaimId(claim._id);
                                  const toastId = toast.loading(isDetailed ? `Running Autonomous Sentinel Pipeline for Case #${claim.claimNumber}...` : `Building your appeal for case #${claim.claimNumber}...`);
                                  try {
                                    await onRunAutonomousPipeline(claim._id);
                                    toast.success(isDetailed ? `Pipeline resolved Case #${claim.claimNumber}: Evidence indexed & brief compiled` : `Your appeal for case #${claim.claimNumber} is ready to review`, { id: toastId });
                                    onNavigateView("studio");
                                  } catch (err) {
                                    toast.error(err instanceof Error ? err.message : "Pipeline execution failed", { id: toastId });
                                  } finally {
                                    setRunningPipelineClaimId(null);
                                  }
                                } else {
                                  onNavigateView("evidence");
                                }
                              }}
                              title={isDetailed ? "Run Full Autonomous Sentinel Pipeline (Analyze + Score + Synthesize)" : "Check your case, gather proof, and write your letter"}
                              className="h-7 px-2.5 text-xs gap-1 bg-primary text-primary-foreground font-semibold shadow-2xs"
                            >
                              {runningPipelineClaimId === claim._id ? (
                                <>
                                  <CircleNotch className="size-3 animate-spin" />
                                  <span>{isDetailed ? "Solving..." : "Working..."}</span>
                                </>
                              ) : (
                                <>
                                  <Lightning className="size-3" weight="fill" />
                                  <span>{isDetailed ? "Auto-Solve" : "Build my appeal"}</span>
                                </>
                              )}
                            </Button>
                          )}


                          {/* Row Context Menu */}
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon-xs"
                                className="size-7 text-muted-foreground hover:text-foreground"
                                title="Case actions"
                                aria-label={`Case actions for #${claim.claimNumber}`}
                              >
                                <DotsThreeVertical className="size-3.5" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48">
                              <DropdownMenuLabel className="text-[10px] font-mono text-muted-foreground uppercase">
                                Case #{claim.claimNumber} {isWon && "• WON"}
                              </DropdownMenuLabel>
                              {!hasCompletedIntakeContext(claim) && (
                                <DropdownMenuItem
                                  onClick={() => {
                                    onSelectClaim(claim._id);
                                    onOpenIngestion(claim);
                                  }}
                                  className="gap-2 text-xs cursor-pointer text-amber-500 font-medium"
                                >
                                  <ClipboardText className="size-3.5" />
                                  <span>{isDetailed ? "Complete Intake Form" : "Add your details"}</span>
                                </DropdownMenuItem>
                              )}
                              {isWon ? (
                                <>
                                  <DropdownMenuItem
                                    onClick={() => {
                                      onSelectClaim(claim._id);
                                      onNavigateView("communications");
                                    }}
                                    className="gap-2 text-xs cursor-pointer text-emerald-600 dark:text-emerald-400 font-medium"
                                  >
                                    <CheckCircle className="size-3.5 text-emerald-500" />
                                    <span>{isDetailed ? "View Reversal Notice" : "See insurer's reply"}</span>
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={() => {
                                      onSelectClaim(claim._id);
                                      onNavigateView("studio");
                                    }}
                                    className="gap-2 text-xs cursor-pointer"
                                  >
                                    <FileText className="size-3.5 text-primary" />
                                    <span>{isDetailed ? "View Victorious Brief" : "See winning letter"}</span>
                                  </DropdownMenuItem>
                                </>
                              ) : (
                                <>
                                  <DropdownMenuItem
                                    onClick={() => {
                                      onSelectClaim(claim._id);
                                      onNavigateView("studio");
                                    }}
                                    className="gap-2 text-xs cursor-pointer"
                                  >
                                    <FileText className="size-3.5" />
                                    <span>{isDetailed ? "Open Appeal Studio" : "Open your letter"}</span>
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={() => {
                                      onSelectClaim(claim._id);
                                      onNavigateView("p2p");
                                    }}
                                    className="gap-2 text-xs cursor-pointer text-primary font-medium"
                                  >
                                    <PhoneCall className="size-3.5" />
                                    <span>{isDetailed ? "P2P Defense Tele-Script" : "Doctor call prep"}</span>
                                  </DropdownMenuItem>
                                </>
                              )}
                              <DropdownMenuItem
                                onClick={() => {
                                  onSelectClaim(claim._id);
                                  onNavigateView("evidence");
                                }}
                                className="gap-2 text-xs cursor-pointer"
                              >
                                <Pulse className="size-3.5" />
                                <span>{isDetailed ? "Evidence Matrix" : "Your proof"}</span>
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => {
                                  onSelectClaim(claim._id);
                                  onNavigateView("communications");
                                }}
                                className="gap-2 text-xs cursor-pointer"
                              >
                                <Envelope className="size-3.5" />
                                <span>{isDetailed ? "Payer Communications" : "Messages"}</span>
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => {
                                  onSelectClaim(claim._id);
                                  onNavigateView("audit");
                                }}
                                className="gap-2 text-xs cursor-pointer"
                              >
                                <Clock className="size-3.5" />
                                <span>{isDetailed ? "Audit Timeline" : "History"}</span>
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => setCaseToDelete(claim)}
                                className="gap-2 text-xs text-destructive focus:text-destructive cursor-pointer font-medium"
                              >
                                <Trash className="size-3.5" />
                                <span>{isDetailed ? "Delete Case" : "Delete"}</span>
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>

        {/* Pagination Bar */}
        {filtered.length > pageSize && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-2 px-4 py-3 border-t border-border bg-muted/10 text-xs">
            <div className="text-muted-foreground font-mono text-[11px]">
              Showing {filtered.length === 0 ? 0 : (currentPage - 1) * pageSize + 1}–
              {Math.min(filtered.length, currentPage * pageSize)} of {filtered.length} {isDetailed ? "claims" : "cases"}
              {filtered.length >= 100 && " (top 100)"}
            </div>
            <div className="flex items-center gap-1.5">
              <Button
                variant="outline"
                size="xs"
                disabled={currentPage <= 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                className="h-7 px-2.5 gap-1 text-xs"
                aria-label="Previous page"
              >
                <CaretLeft className="size-3.5" />
                <span>Previous</span>
              </Button>
              <span className="px-2 font-mono text-[11px] text-muted-foreground">
                Page {currentPage} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="xs"
                disabled={currentPage >= totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                className="h-7 px-2.5 gap-1 text-xs"
                aria-label="Next page"
              >
                <span>Next</span>
                <CaretRight className="size-3.5" />
              </Button>
            </div>
          </div>
        )}
      </Card>
      </>
      )}

      {/* Delete Case Confirmation Modal */}
      <DeleteCaseModal
        isOpen={Boolean(caseToDelete)}
        claim={caseToDelete}
        onClose={() => setCaseToDelete(null)}
        onConfirmDelete={onDeleteCase || (async () => {})}
      />
    </div>
  );
};

