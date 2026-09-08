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
} from "@phosphor-icons/react";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
import { Claim } from "../../types";
import { formatCurrency, matchesClaimSearch } from "../../lib/utils";
import { CPT_CODES, DENIAL_REASON_CODES } from "../../lib/constants";
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
  onOpenIngestion: () => void;
  onNavigateView: (
    view: "radar" | "evidence" | "studio" | "p2p" | "communications" | "audit"
  ) => void;
  onDeleteCase?: (claimId: string) => Promise<unknown>;
  onRunAutonomousPipeline?: (claimId: string) => Promise<unknown>;
  includeDemo?: boolean;
  onToggleIncludeDemo?: () => void;
}

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
  includeDemo = true,
  onToggleIncludeDemo,
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [payerFilter, setPayerFilter] = useState("all");
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
  const searchArg = searchQuery.trim() ? searchQuery.trim() : undefined;
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
          activeClaims.reduce((acc, c) => acc + (c.overturnProbabilityScore || 0), 0) /
            activeClaims.length
        )
      : 0;
    const highRiskCount = activeClaims.filter(
      (c) =>
        c.overturnProbabilityScore !== undefined &&
        c.overturnProbabilityScore >= 80
    ).length;
    const criticalCount = activeClaims.filter(
      (c) => c.daysRemaining <= 14 && c.status !== "won"
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
      if (c.daysRemaining <= 14 && c.status !== "won") {
        counts.critical_deadline++;
      }
    }

    return counts;
  }, [payerArg, searchArg, filteredStats, portfolioStats, activeClaims]);

  const filtered = useMemo(() => {
    return activeClaims.filter((c) => {
      // 1. Status / Alarm filter
      if (statusFilter === "critical_deadline") {
        if (c.daysRemaining > 14 || c.status === "won") return false;
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
      if (searchQuery) {
        return matchesClaimSearch(c, searchQuery);
      }

      return true;
    });
  }, [activeClaims, statusFilter, payerFilter, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));

  // Reset page when filters change
  React.useEffect(() => {
    setCurrentPage(1);
  }, [statusFilter, payerFilter, searchQuery]);

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
  };

  const statusTabs = [
    { id: "all", label: "All Cases", count: statusCounts.all },
    {
      id: "critical_deadline",
      label: "Urgent Alarms (<14d)",
      count: statusCounts.critical_deadline,
      isUrgent: true,
    },
    { id: "ingested", label: "Intake / OCR", count: statusCounts.ingested },
    { id: "analyzing", label: "Evidence Crawl", count: statusCounts.analyzing },
    {
      id: "ready_for_review",
      label: "Ready for Dispatch",
      count: statusCounts.ready_for_review,
    },
    { id: "dispatched", label: "Transmitted", count: statusCounts.dispatched },
    { id: "won", label: "Won / Overturned", count: statusCounts.won, isWon: true },
  ];

  const handleExportCsv = (redactMode: boolean) => {
    const escapeCsv = (val: unknown) => {
      if (val === undefined || val === null) return '""';
      const str = String(val).replace(/"/g, '""');
      return `"${str}"`;
    };

    const headers = [
      "Claim Number",
      "Patient Name",
      "Member ID",
      "Insurer / Payer",
      "CPT Codes",
      "CARC Denial Code",
      "Denial Reason Description",
      "Denied Amount ($)",
      "Patient Share ($)",
      "Service Date",
      "Statutory Deadline",
      "Days Remaining",
      "Overturn Probability (%)",
      "Status",
      "Redaction Applied",
    ];

    const rows = filtered.map((c) => {
      const isClaimRedacted = redactMode || Boolean(c.redactionMetadata?.isRedacted);

      // Redaction gate: mask Patient Name and Member ID per HIPAA Safe Harbor standard
      const name = isClaimRedacted
        ? (c.patient?.name ? `[REDACTED - ${c.patient.name.charAt(0)}***]` : "[REDACTED]")
        : (c.patient?.name || "");

      const memberId = isClaimRedacted
        ? (c.patient?.memberId ? c.patient.memberId.replace(/^([A-Za-z0-9]{3}).*/, "$1*****") : "[REDACTED]")
        : (c.patient?.memberId || "");

      // Redaction gate: mask CPT codes and CARC codes if custom category masked or public exhibit mode
      const maskCpt = isClaimRedacted && (
        c.redactionMetadata?.maskedCategories?.includes("cpt") ||
        c.redactionMetadata?.mode === "PUBLIC_EXHIBIT"
      );
      const cptStr = maskCpt ? "[REDACTED-CPT]" : (c.cptCodes?.join("; ") || "");

      const maskCarc = isClaimRedacted && (
        c.redactionMetadata?.maskedCategories?.includes("carc") ||
        c.redactionMetadata?.mode === "PUBLIC_EXHIBIT"
      );
      const carcStr = maskCarc ? "[REDACTED-CARC]" : (c.denialReasonCode || "");

      return [
        escapeCsv(c.claimNumber),
        escapeCsv(name),
        escapeCsv(memberId),
        escapeCsv(c.patient?.insurancePayer || ""),
        escapeCsv(cptStr),
        escapeCsv(carcStr),
        escapeCsv(c.denialReasonDescription || ""),
        escapeCsv(c.deniedAmount || 0),
        escapeCsv(c.patientOwedAmount || 0),
        escapeCsv(c.serviceDate || ""),
        escapeCsv(c.statutoryDeadline ? new Date(c.statutoryDeadline).toISOString().split("T")[0] : ""),
        escapeCsv(c.daysRemaining),
        escapeCsv(c.overturnProbabilityScore ?? "N/A"),
        escapeCsv(c.status),
        escapeCsv(isClaimRedacted ? "YES (HIPAA Safe Harbor)" : "NO (Full Audit)"),
      ];
    });

    const csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\r\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const prefix = redactMode ? "claimhero-cases-redacted" : "claimhero-cases-audit";
    a.download = `${prefix}-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(redactMode ? "Exported HIPAA-redacted CSV" : "Exported advocate audit CSV");
  };

  const handleExportJson = (redactMode: boolean) => {
    const exportData = filtered.map((c) => {
      const isClaimRedacted = redactMode || Boolean(c.redactionMetadata?.isRedacted);
      if (!isClaimRedacted) return c;

      return {
        ...c,
        patientName: c.patientName ? `[REDACTED - ${c.patientName.charAt(0)}***]` : "[REDACTED]",
        patient: c.patient
          ? {
              ...c.patient,
              name: `[REDACTED - ${c.patient.name.charAt(0)}***]`,
              memberId: c.patient.memberId.replace(/^([A-Za-z0-9]{3}).*/, "$1*****"),
              email: "[REDACTED]",
            }
          : undefined,
        cptCodes: c.redactionMetadata?.maskedCategories?.includes("cpt") || c.redactionMetadata?.mode === "PUBLIC_EXHIBIT"
          ? ["[REDACTED-CPT]"]
          : c.cptCodes,
        denialReasonCode: c.redactionMetadata?.maskedCategories?.includes("carc") || c.redactionMetadata?.mode === "PUBLIC_EXHIBIT"
          ? "[REDACTED-CARC]"
          : c.denialReasonCode,
        redactionApplied: "HIPAA Safe Harbor 45 CFR § 164.514",
      };
    });

    const jsonContent = JSON.stringify(exportData, null, 2);
    const blob = new Blob([jsonContent], { type: "application/json;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const prefix = redactMode ? "claimhero-cases-redacted" : "claimhero-cases-audit";
    a.download = `${prefix}-${new Date().toISOString().split("T")[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(redactMode ? "Exported HIPAA-redacted JSON" : "Exported advocate audit JSON");
  };

  return (
    <div className="space-y-4 animate-fadeIn font-sans">
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
            <CardDescription className="text-xs">Total Disputed Pipeline</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <div className="font-medium text-2xl sm:text-3xl tabular-nums leading-none tracking-tight text-foreground font-mono">
                {formatCurrency(totalDisputed)}
              </div>
              <Badge variant="outline" className="text-[11px] font-mono">
                {claims.length} Cases
              </Badge>
            </div>
            <p className="text-muted-foreground text-xs">
              Under active ERISA statutory review
            </p>
          </CardContent>
        </Card>

        {/* Card 2: High Win-Probability */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle>
              <div className="flex size-7 items-center justify-center rounded-lg border border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                <TrendUp className="size-4" />
              </div>
            </CardTitle>
            <CardDescription className="text-xs">High Overturn Probability</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <div className="font-medium text-2xl sm:text-3xl tabular-nums leading-none tracking-tight text-emerald-600 dark:text-emerald-400 font-mono">
                {highRiskCount} Cases
              </div>
              <Badge variant="outline" className="text-[10px] font-mono text-emerald-600 border-emerald-500/30">
                &ge; 80% Win Score
              </Badge>
            </div>
            <p className="text-muted-foreground text-xs">
              Strong precedent alignment detected
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
            <CardDescription className="text-xs">Recovered Viable Funds</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <div className="font-medium text-2xl sm:text-3xl tabular-nums leading-none tracking-tight text-emerald-600 dark:text-emerald-400 font-mono">
                {formatCurrency(totalWon)}
              </div>
              <Badge variant="secondary" className="text-[11px] font-mono">
                {avgScore}% Avg Score
              </Badge>
            </div>
            <p className="text-muted-foreground text-xs">
              Across {claims.length} cross-examined CPBs
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
            <CardDescription className="text-xs">Statutory Alarms (&lt;14d)</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <div
                className={`font-medium text-2xl sm:text-3xl tabular-nums leading-none tracking-tight ${
                  criticalCount > 0 ? "text-destructive font-mono" : "text-foreground font-mono"
                }`}
              >
                {criticalCount} Urgent
              </div>
              <Badge variant="outline" className="text-[10px] font-mono">
                29 CFR § 2560.503-1
              </Badge>
            </div>
            <p className="text-muted-foreground text-xs">
              Deadlines expiring within statutory window
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
                  Case Ingestion & Adjudication Radar
                </CardTitle>
                <Badge variant="outline" className="font-mono text-[10px]">
                  {filtered.length} of {claims.length} Cases
                </Badge>
              </div>
              <CardDescription className="text-xs mt-0.5">
                Active medical denial records with plan coverage, CPT codes, CARC reason, and statutory ERISA clock.
              </CardDescription>
            </div>

            <div className="flex items-center gap-2">
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
                onClick={onOpenIngestion}
                className="h-8 gap-1.5 text-xs bg-primary text-primary-foreground font-semibold shadow-xs shrink-0 cursor-pointer"
              >
                <PlusCircle className="size-3.5" />
                <span>Ingest Denial</span>
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
                  aria-label="Search claims by patient, CPT code, or insurer"
                  className="h-8 pl-8 text-xs bg-background"
                  placeholder="Search claim, patient, CPT, insurer..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              {/* Insurer Payer Filter */}
              <div className="flex items-center gap-1.5">
                <Buildings className="size-3.5 text-muted-foreground hidden sm:inline" />
                <Select
                  aria-label="Filter by insurance payer"
                  value={payerFilter}
                  onChange={(e) => setPayerFilter(e.target.value)}
                  className="h-8 text-xs font-sans"
                >
                  <option value="all">All Insurers</option>
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
              Showing {filtered.length} claims
            </div>
          </div>
        </CardHeader>

        {/* Data Table */}
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-muted/30">
              <TableRow>
                <TableHead>Claim & Patient</TableHead>
                <TableHead>Payer</TableHead>
                <TableHead>CPT Code</TableHead>
                <TableHead>Denial Reason</TableHead>
                <TableHead>Disputed</TableHead>
                <TableHead>Win Likelihood</TableHead>
                <TableHead>Statutory Clock</TableHead>
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
                        No claims match your current filter
                      </div>
                      <p className="text-[11px] text-muted-foreground max-w-xs">
                        Try resetting your search query or switching to &quot;All Cases&quot;.
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
                  const primaryCpt = claim.cptCodes[0] || "";
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
                              <span className="font-semibold text-foreground text-xs truncate max-w-[110px]" title={claim.patient?.name}>
                                {claim.patient?.name || "Patient Record"}
                              </span>
                              {isWon && (
                                <Badge
                                  variant="default"
                                  className="bg-emerald-500/20 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/40 text-[9px] px-1 py-0 font-bold shrink-0 leading-none h-4"
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
                                claim.origin === "demo-fixture") && (
                                <Badge variant="secondary" className="font-mono text-[8px] px-1 py-0 text-amber-500 bg-amber-500/10 border-amber-500/20">
                                  Synthetic Demo
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

                      {/* 3. CPT Procedure */}
                      <TableCell className="py-2.5">
                        <div className="flex flex-col min-w-0">
                          <Badge variant="secondary" className="font-mono text-[11px] w-fit px-1.5 py-0">
                            {primaryCpt ? `CPT ${primaryCpt}` : "No CPT"}
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

                      {/* 6. Win Likelihood */}
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
                        ) : claim.overturnProbabilityScore !== undefined ? (
                          <div className="flex items-center gap-1 font-mono">
                            <span className="font-bold text-xs text-foreground">
                              {claim.overturnProbabilityScore}%
                            </span>
                            <Badge
                              variant="secondary"
                              className={`text-[9px] px-1 py-0 ${
                                claim.overturnProbabilityScore >= 80
                                  ? "text-emerald-600 dark:text-emerald-400"
                                  : "text-amber-500"
                              }`}
                            >
                              {claim.riskLevel === "high_confidence" ? "High" : "Mod"}
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
                              title="Open Insurer Reversal Notice & Communications"
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
                              title="Open Payer Communications Inbox"
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
                              title="Review Drafted Appeal Brief"
                              className="h-7 px-2.5 text-xs gap-1 bg-primary text-primary-foreground font-semibold shadow-2xs"
                            >
                              <FileText className="size-3" />
                              <span>Review & Send</span>
                              <ArrowUpRight className="size-2.5 opacity-70" />
                            </Button>
                          ) : claim.status === "analyzing" || (claim.evidenceCount && claim.evidenceCount > 0) ? (
                            <Button
                              variant="default"
                              size="xs"
                              onClick={() => {
                                onSelectClaim(claim._id);
                                onNavigateView("studio");
                              }}
                              title="Synthesize Appeal Brief"
                              className="h-7 px-2.5 text-xs gap-1"
                            >
                              <FileText className="size-3" />
                              <span>Draft Brief</span>
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
                                  const toastId = toast.loading(`Running Autonomous Sentinel Pipeline for Case #${claim.claimNumber}...`);
                                  try {
                                    await onRunAutonomousPipeline(claim._id);
                                    toast.success(`Pipeline resolved Case #${claim.claimNumber}: Evidence indexed & brief compiled`, { id: toastId });
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
                              title="Run Full Autonomous Sentinel Pipeline (Analyze + Score + Synthesize)"
                              className="h-7 px-2.5 text-xs gap-1 bg-primary text-primary-foreground font-semibold shadow-2xs"
                            >
                              {runningPipelineClaimId === claim._id ? (
                                <>
                                  <CircleNotch className="size-3 animate-spin" />
                                  <span>Solving...</span>
                                </>
                              ) : (
                                <>
                                  <Lightning className="size-3" weight="fill" />
                                  <span>Auto-Solve</span>
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
                                    <span>View Reversal Notice</span>
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={() => {
                                      onSelectClaim(claim._id);
                                      onNavigateView("studio");
                                    }}
                                    className="gap-2 text-xs cursor-pointer"
                                  >
                                    <FileText className="size-3.5 text-primary" />
                                    <span>View Victorious Brief</span>
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
                                    <span>Open Appeal Studio</span>
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={() => {
                                      onSelectClaim(claim._id);
                                      onNavigateView("p2p");
                                    }}
                                    className="gap-2 text-xs cursor-pointer text-primary font-medium"
                                  >
                                    <PhoneCall className="size-3.5" />
                                    <span>P2P Defense Tele-Script</span>
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
                                <span>Evidence Matrix</span>
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => {
                                  onSelectClaim(claim._id);
                                  onNavigateView("communications");
                                }}
                                className="gap-2 text-xs cursor-pointer"
                              >
                                <Envelope className="size-3.5" />
                                <span>Payer Communications</span>
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => {
                                  onSelectClaim(claim._id);
                                  onNavigateView("audit");
                                }}
                                className="gap-2 text-xs cursor-pointer"
                              >
                                <Clock className="size-3.5" />
                                <span>Audit Timeline</span>
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => setCaseToDelete(claim)}
                                className="gap-2 text-xs text-destructive focus:text-destructive cursor-pointer font-medium"
                              >
                                <Trash className="size-3.5" />
                                <span>Delete Case</span>
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
              {Math.min(filtered.length, currentPage * pageSize)} of {filtered.length} claims
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

