import React, { useState } from "react";
import {
  CurrencyDollar,
  TrendUp,
  UserCheck,
  ShieldWarning,
  MagnifyingGlass,
  Users,
  Buildings,
  DownloadSimple,
  Pulse,
  FileText,
  Clock,
  ArrowUpRight,
} from "@phosphor-icons/react";
import { Claim } from "../../types";
import { formatCurrency } from "../../lib/utils";
import { CPT_CODES, DENIAL_REASON_CODES } from "../../lib/constants";
import { DeadlineCountdown } from "./DeadlineCountdown";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Input } from "../ui/input";
import { Avatar, AvatarFallback } from "../ui/avatar";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "../ui/table";

interface CaseRadarProps {
  claims: Claim[];
  selectedClaimId: string;
  onSelectClaim: (claimId: string) => void;
  onOpenIngestion: () => void;
  onNavigateView: (
    view: "radar" | "evidence" | "studio" | "communications" | "audit"
  ) => void;
}

const formatPayerName = (payer: string | undefined): string => {
  if (!payer) return "Insurer";
  const p = payer.trim();
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
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [payerFilter, setPayerFilter] = useState("all");

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
  const criticalCount = claims.filter((c) => c.daysRemaining <= 14).length;

  const filtered = claims.filter((c) => {
    if (statusFilter !== "all" && c.status !== statusFilter) return false;
    if (payerFilter !== "all" && c.patient?.insurancePayer !== payerFilter) return false;
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      c.claimNumber.toLowerCase().includes(q) ||
      (c.patient?.name && c.patient.name.toLowerCase().includes(q)) ||
      c.cptCodes.some((code) => code.toLowerCase().includes(q)) ||
      c.denialReasonCode.toLowerCase().includes(q) ||
      (c.patient?.insurancePayer && c.patient.insurancePayer.toLowerCase().includes(q))
    );
  });

  return (
    <div className="space-y-4 animate-fadeIn font-sans">
      {/* 1. Top 4 Metric Cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {/* Card 1: Disputed Portfolio */}
        <Card className="shadow-xs bg-card">
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
        <Card className="shadow-xs bg-card">
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
              <div className="font-medium text-2xl sm:text-3xl tabular-nums leading-none tracking-tight text-emerald-600 dark:text-emerald-400">
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
        <Card className="shadow-xs bg-card">
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
        <Card className="shadow-xs bg-card">
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
                  criticalCount > 0 ? "text-destructive" : "text-foreground"
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

      {/* 2. Main Claims Table & Toolbar Section */}
      <Card className="bg-card shadow-xs">
        <CardHeader className="pb-3 border-b border-border/60">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base font-semibold text-foreground">
                {claims.length} Active Medical Denial Claims
              </CardTitle>
              <CardDescription>
                Recent medical denial records with plan, CPT codes, CARC reason, and statutory countdown.
              </CardDescription>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const csv = claims
                    .map(
                      (c) =>
                        `${c.claimNumber},${c.patient?.name},${c.patient?.insurancePayer},${c.deniedAmount},${c.denialReasonCode},${c.daysRemaining}`
                    )
                    .join("\n");
                  const blob = new Blob([csv], { type: "text/csv" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = "claims-export.csv";
                  a.click();
                }}
                className="gap-1.5"
              >
                <DownloadSimple className="size-3.5" />
                <span>Export</span>
              </Button>
            </div>
          </div>

          {/* Table Toolbar */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-2.5 pt-2">
            <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
              <div className="relative w-full sm:w-64">
                <MagnifyingGlass className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="h-8 pl-8 text-xs"
                  placeholder="Search claims, patient, CPT..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              {/* Status Filter */}
              <div className="flex items-center gap-1">
                <Users className="size-3.5 text-muted-foreground hidden sm:inline" />
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="rounded-lg border border-input bg-background px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring font-sans h-8"
                >
                  <option value="all">All Statuses</option>
                  <option value="ingested">Ingested / OCR</option>
                  <option value="analyzing">Evidence Crawl</option>
                  <option value="ready_for_review">Ready for Review</option>
                  <option value="dispatched">Dispatched</option>
                  <option value="won">Won / Overturned</option>
                </select>
              </div>

              {/* Payer Filter */}
              <div className="flex items-center gap-1">
                <Buildings className="size-3.5 text-muted-foreground hidden sm:inline" />
                <select
                  value={payerFilter}
                  onChange={(e) => setPayerFilter(e.target.value)}
                  className="rounded-lg border border-input bg-background px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring font-sans h-8"
                >
                  <option value="all">All Payers</option>
                  <option value="UnitedHealthcare">UnitedHealthcare</option>
                  <option value="Aetna">Aetna</option>
                  <option value="Cigna">Cigna</option>
                  <option value="Elevance Health">Elevance Health</option>
                </select>
              </div>
            </div>

            <div className="flex items-center gap-2 self-end sm:self-auto">
              <Button
                variant="outline"
                size="sm"
                onClick={onOpenIngestion}
                className="gap-1.5"
              >
                <span>+ Ingest Denial</span>
              </Button>
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
                  <TableCell colSpan={8} className="h-32 text-center text-muted-foreground">
                    No matching claims found.
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
                          <Button
                            variant="outline"
                            size="xs"
                            onClick={() => {
                              onSelectClaim(claim._id);
                              onNavigateView("evidence");
                            }}
                            title="Inspect Clinical Evidence Matrix"
                            className="h-7 px-2 text-xs"
                          >
                            <Pulse className="size-3 text-muted-foreground" />
                            <span className="hidden xl:inline">Evidence</span>
                          </Button>
                          <Button
                            variant="default"
                            size="xs"
                            onClick={() => {
                              onSelectClaim(claim._id);
                              onNavigateView("studio");
                            }}
                            title="Open Appeal Studio"
                            className="h-7 px-2.5 text-xs gap-1"
                          >
                            <FileText className="size-3" />
                            <span>Studio</span>
                            <ArrowUpRight className="size-2.5 opacity-60" />
                          </Button>
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
    </div>
  );
};
