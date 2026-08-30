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
  PlusCircle,
  Funnel,
  ArrowCounterClockwise,
  Trash,
  DotsThreeVertical,
  Envelope,
  Sparkle,
  CircleNotch,
  PhoneCall,
  FileCode,
  CaretDown,
} from "@phosphor-icons/react";
import { Claim } from "../../types";
import { formatCurrency } from "../../lib/utils";
import { CPT_CODES, DENIAL_REASON_CODES, INSURERS } from "../../lib/constants";
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
  onDeleteCase?: (claimId: string) => Promise<any>;
  onRunAutonomousPipeline?: (claimId: string) => Promise<any>;
}

const formatPayerName = (payer: string | undefined): string => {
  if (!payer) return "Insurer";
  const p = payer.trim();
  if (/molina/i.test(p)) return "Molina Healthcare";
  if (/geoblue|geo-blue/i.test(p)) return "GeoBlue";
  if (/bcbsglobal|globalcore|bcbs global/i.test(p)) return "BCBS Global Core";
  if (/cigna/i.test(p)) return "Cigna";
  if (/unitedhealthcare|uhc/i.test(p)) return "UnitedHealthcare";
  if (/aetna/i.test(p)) return "Aetna";
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
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [payerFilter, setPayerFilter] = useState("all");
  const [caseToDelete, setCaseToDelete] = useState<Claim | null>(null);
  const [runningPipelineClaimId, setRunningPipelineClaimId] = useState<string | null>(null);

  const totalDisputed = claims.reduce((acc, c) => acc + c.deniedAmount, 0);
  const wonClaims = claims.filter((c) => c.status === "won");
  const totalWon = wonClaims.reduce((acc, c) => acc + c.deniedAmount, 0);
  const avgScore = claims.length
    ? Math.round(
        claims.reduce((acc, c) => acc + (c.overturnProbabilityScore || 0), 0) /
          claims.length
      )
    : 0;
  const highRiskCount = claims.filter(
    (c) =>
      c.overturnProbabilityScore !== undefined &&
      c.overturnProbabilityScore >= 80
  ).length;
  const criticalCount = claims.filter(
    (c) => c.daysRemaining <= 14 && c.status !== "won"
  ).length;

  // Compute status breakdown counts for filter tabs
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {
      all: claims.length,
      critical_deadline: 0,
      ingested: 0,
      analyzing: 0,
      ready_for_review: 0,
      dispatched: 0,
      won: 0,
    };

    for (const c of claims) {
      if (counts[c.status] !== undefined) {
        counts[c.status]++;
      }
      if (c.daysRemaining <= 14 && c.status !== "won") {
        counts.critical_deadline++;
      }
    }

    return counts;
  }, [claims]);

  const filtered = useMemo(() => {
    return claims.filter((c) => {
      // 1. Status / Alarm filter
      if (statusFilter === "critical_deadline") {
        if (c.daysRemaining > 14 || c.status === "won") return false;
      } else if (statusFilter !== "all" && c.status !== statusFilter) {
        return false;
      }

      // 2. Payer filter
      if (payerFilter !== "all") {
        const p = c.patient?.insurancePayer || "";
        if (!p.toLowerCase().includes(payerFilter.toLowerCase())) {
          return false;
        }
      }

      // 3. Search query filter
      if (searchQuery) {
        const q = searchQuery.toLowerCase().trim();
        const matchClaim = c.claimNumber.toLowerCase().includes(q);
        const matchPatient = c.patient?.name?.toLowerCase().includes(q);
        const matchCpt = c.cptCodes.some((code) => code.toLowerCase().includes(q));
        const matchReason = c.denialReasonCode.toLowerCase().includes(q);
        const matchPayer = c.patient?.insurancePayer?.toLowerCase().includes(q);
        const matchProvider = c.providerName.toLowerCase().includes(q);

        if (
          !matchClaim &&
          !matchPatient &&
          !matchCpt &&
          !matchReason &&
          !matchPayer &&
          !matchProvider
        ) {
          return false;
        }
      }

      return true;
    });
  }, [claims, statusFilter, payerFilter, searchQuery]);

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
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuLabel className="text-[11px] text-muted-foreground">Portfolio Export ({filtered.length} cases)</DropdownMenuLabel>
                  <DropdownMenuItem
                    onClick={() => {
                      const escapeCsv = (val: any) => {
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
                      ];

                      const rows = filtered.map((c) => [
                        escapeCsv(c.claimNumber),
                        escapeCsv(c.patient?.name || ""),
                        escapeCsv(c.patient?.memberId || ""),
                        escapeCsv(c.patient?.insurancePayer || ""),
                        escapeCsv(c.cptCodes?.join("; ") || ""),
                        escapeCsv(c.denialReasonCode || ""),
                        escapeCsv(c.denialReasonDescription || ""),
                        escapeCsv(c.deniedAmount || 0),
                        escapeCsv(c.patientOwedAmount || 0),
                        escapeCsv(c.serviceDate || ""),
                        escapeCsv(c.statutoryDeadline ? new Date(c.statutoryDeadline).toISOString().split("T")[0] : ""),
                        escapeCsv(c.daysRemaining),
                        escapeCsv(c.overturnProbabilityScore ?? "N/A"),
                        escapeCsv(c.status),
                      ]);

                      const csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\r\n");
                      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = `claimhero-cases-${new Date().toISOString().split("T")[0]}.csv`;
                      a.click();
                      URL.revokeObjectURL(url);
                    }}
                    className="gap-2 text-xs cursor-pointer"
                  >
                    <FileText className="size-3.5 text-primary" />
                    <span>Export as CSV (.csv)</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => {
                      const jsonContent = JSON.stringify(filtered, null, 2);
                      const blob = new Blob([jsonContent], { type: "application/json;charset=utf-8;" });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = `claimhero-cases-${new Date().toISOString().split("T")[0]}.json`;
                      a.click();
                      URL.revokeObjectURL(url);
                    }}
                    className="gap-2 text-xs cursor-pointer"
                  >
                    <FileCode className="size-3.5 text-cyan-400" />
                    <span>Export as JSON (.json)</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <Button
                size="sm"
                onClick={onOpenIngestion}
                className="gap-1.5 text-xs h-8 shadow-xs"
              >
                <PlusCircle className="size-3.5" />
                <span>Ingest Denial</span>
              </Button>
            </div>
          </div>

          {/* Integrated Status Tabs Filter Strip */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none pt-1">
            {statusTabs.map((tab) => {
              const isSelected = statusFilter === tab.id;
              return (
                <button
                  key={tab.id}
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
                  value={payerFilter}
                  onChange={(e) => setPayerFilter(e.target.value)}
                  className="h-8 text-xs font-sans"
                >
                  <option value="all">All Insurers</option>
                  {INSURERS.map((ins) => (
                    <option key={ins.id} value={ins.name}>
                      {ins.name}
                    </option>
                  ))}
                </Select>
              </div>

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
        <div className="overflow-hidden">
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
                filtered.map((claim) => {
                  const isSelected = claim._id === selectedClaimId;
                  const denialReason = DENIAL_REASON_CODES[claim.denialReasonCode];
                  const primaryCpt = claim.cptCodes[0] || "27447";
                  const cptInfo = CPT_CODES[primaryCpt];
                  const payerLabel = formatPayerName(claim.patient?.insurancePayer);

                  return (
                    <TableRow
                      key={claim._id}
                      onClick={() => onSelectClaim(claim._id)}
                      data-state={isSelected ? "selected" : undefined}
                      className="cursor-pointer hover:bg-muted/40 transition-colors"
                    >
                      {/* 1. Claim & Patient (Avatar + Name + Claim Number) */}
                      <TableCell className="py-2.5">
                        <div className="flex items-center gap-2 min-w-0">
                          <Avatar size="sm" className="bg-muted text-foreground font-semibold shrink-0">
                            <AvatarFallback className="text-[10px]">
                              {claim.patient?.name ? claim.patient.name.slice(0, 2).toUpperCase() : "PT"}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex flex-col min-w-0">
                            <span className="font-semibold text-foreground text-xs truncate max-w-[120px]" title={claim.patient?.name}>
                              {claim.patient?.name || "Patient Record"}
                            </span>
                            <span className="font-mono text-[10px] text-muted-foreground truncate max-w-[120px]">
                              {claim.claimNumber}
                            </span>
                          </div>
                        </div>
                      </TableCell>

                      {/* 2. Payer */}
                      <TableCell className="py-2.5">
                        <Badge
                          variant="outline"
                          className="font-medium max-w-[100px] truncate block text-center"
                          title={claim.patient?.insurancePayer || "Insurer"}
                        >
                          {payerLabel}
                        </Badge>
                      </TableCell>

                      {/* 3. CPT Procedure */}
                      <TableCell className="py-2.5">
                        <div className="flex flex-col min-w-0">
                          <Badge variant="secondary" className="font-mono text-[11px] w-fit px-1.5 py-0">
                            CPT {primaryCpt}
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
                          <Badge variant="destructive" className="font-mono text-[9px] w-fit px-1.5 py-0">
                            {claim.denialReasonCode}
                          </Badge>
                          {denialReason && (
                            <span className="text-[10px] text-muted-foreground truncate max-w-[110px] mt-0.5" title={denialReason.title}>
                              {denialReason.title}
                            </span>
                          )}
                        </div>
                      </TableCell>

                      {/* 5. Disputed Amount */}
                      <TableCell className="py-2.5">
                        <div className="flex flex-col">
                          <span className="font-mono font-bold text-destructive text-xs">
                            {formatCurrency(claim.deniedAmount)}
                          </span>
                          <span className="font-mono text-[10px] text-muted-foreground">
                            Owes: {formatCurrency(claim.patientOwedAmount)}
                          </span>
                        </div>
                      </TableCell>

                      {/* 6. Win Likelihood */}
                      <TableCell className="py-2.5">
                        {claim.overturnProbabilityScore !== undefined ? (
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
                          size="sm"
                        />
                      </TableCell>

                      {/* 8. Actions */}
                      <TableCell className="py-2.5 text-right">
                        <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                          {/* Smart Contextual Primary Action */}
                          {claim.status === "dispatched" || claim.status === "won" ? (
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
                              <Sparkle className="size-3" />
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
                                  try {
                                    await onRunAutonomousPipeline(claim._id);
                                    onNavigateView("studio");
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
                                  <Sparkle className="size-3" />
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
                              >
                                <DotsThreeVertical className="size-3.5" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48">
                              <DropdownMenuLabel className="text-[10px] font-mono text-muted-foreground uppercase">
                                Case #{claim.claimNumber}
                              </DropdownMenuLabel>
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

