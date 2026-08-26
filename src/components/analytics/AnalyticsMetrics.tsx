import React from "react";
import {
  TrendUp,
  CurrencyDollar,
  Buildings,
  ChartPieSlice,
  Pulse,
  CheckCircle,
  Clock,
  ArrowUpRight,
  ShieldWarning,
} from "@phosphor-icons/react";
import { formatCurrency } from "../../lib/utils";
import { Card } from "../ui/card";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Progress } from "../ui/progress";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "../ui/table";

interface PayerStatItem {
  payer: string;
  totalClaims: number;
  totalDisputed: number;
  wonCount: number;
  wonAmount: number;
  averageScore: number;
}

interface PortfolioStats {
  totalClaims: number;
  totalDisputedAmount: number;
  activeDisputedAmount: number;
  overturnedWonAmount: number;
  averageWinScore: number;
  recoveryRatePercent: number;
  criticalDeadlinesCount: number;
  urgentDeadlinesCount: number;
  claimsByStatus: Record<string, number>;
  claimsByRisk: Record<string, number>;
  payerBreakdown: PayerStatItem[];
}

interface AnalyticsMetricsProps {
  stats: PortfolioStats;
  isLoading?: boolean;
  onSelectPayerFilter?: (payer: string) => void;
  onNavigateToRadar?: () => void;
}

export const AnalyticsMetrics: React.FC<AnalyticsMetricsProps> = ({
  stats,
  isLoading,
  onSelectPayerFilter,
  onNavigateToRadar,
}) => {
  if (isLoading) {
    return (
      <div className="p-12 text-center text-xs font-mono text-muted-foreground animate-pulse">
        Computing portfolio financial recovery metrics across Convex Cloud Database...
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-fadeIn font-sans">
      {/* Analytics Header */}
      <Card className="p-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-xs">
              <ChartPieSlice className="size-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold text-foreground">
                  Portfolio Financial & Overturn Analytics
                </h2>
                <Badge variant="outline" className="font-mono text-[10px]">
                  Live Aggregation
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                Financial recovery tracking, insurer overturn benchmarks, and statutory dials
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={onNavigateToRadar}
              className="gap-1.5"
            >
              <span>View Case Radar</span>
              <ArrowUpRight className="size-3.5 text-muted-foreground" />
            </Button>
          </div>
        </div>
      </Card>

      {/* Top 4 KPI Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Total Disputed Pipeline */}
        <Card className="p-4 space-y-2">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-[11px] font-medium uppercase tracking-wider">Total Disputed</span>
            <CurrencyDollar className="size-4" />
          </div>
          <div className="text-2xl font-bold font-mono text-foreground">
            {formatCurrency(stats.totalDisputedAmount)}
          </div>
          <div className="text-[11px] text-muted-foreground font-mono flex items-center justify-between">
            <span>{stats.totalClaims} Total Cases</span>
            <span className="text-destructive font-semibold">
              {formatCurrency(stats.activeDisputedAmount)} Active
            </span>
          </div>
        </Card>

        {/* Recovered & Won Funds */}
        <Card className="p-4 space-y-2">
          <div className="flex items-center justify-between text-emerald-600 dark:text-emerald-400">
            <span className="text-[11px] font-medium uppercase tracking-wider">Recovered Funds</span>
            <CheckCircle className="size-4" />
          </div>
          <div className="text-2xl font-bold font-mono text-emerald-600 dark:text-emerald-400">
            {formatCurrency(stats.overturnedWonAmount)}
          </div>
          <div className="text-[11px] text-muted-foreground font-mono flex items-center justify-between">
            <span>{stats.claimsByStatus.won || 0} Settled Cases</span>
            <span className="font-semibold text-foreground">
              {stats.recoveryRatePercent}% Overturn Rate
            </span>
          </div>
        </Card>

        {/* Average Overturn Probability */}
        <Card className="p-4 space-y-2">
          <div className="flex items-center justify-between text-foreground">
            <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Avg Win Probability
            </span>
            <TrendUp className="size-4 text-muted-foreground" />
          </div>
          <div className="text-2xl font-bold font-mono text-foreground">
            {stats.averageWinScore}%
          </div>
          <div className="text-[11px] text-muted-foreground font-mono">
            Across {stats.totalClaims} cross-examined cases
          </div>
        </Card>

        {/* Critical ERISA Alarms */}
        <Card className="p-4 space-y-2">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-[11px] font-medium uppercase tracking-wider">
              Urgent Alarms
            </span>
            {stats.criticalDeadlinesCount > 0 ? (
              <ShieldWarning className="size-4 text-destructive" />
            ) : (
              <Clock className="size-4" />
            )}
          </div>
          <div
            className={`text-2xl font-bold font-mono ${
              stats.criticalDeadlinesCount > 0
                ? "text-destructive"
                : "text-foreground"
            }`}
          >
            {stats.criticalDeadlinesCount}
          </div>
          <div className="text-[11px] text-muted-foreground font-mono">
            {stats.urgentDeadlinesCount} cases in 14-45d window
          </div>
        </Card>
      </div>

      {/* Two-Column Middle Section: Insurer Performance Table & Risk Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Insurer Performance Breakdown Table (8 Cols) */}
        <Card className="lg:col-span-8 p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-border pb-2.5">
            <div className="flex items-center gap-2">
              <Buildings className="size-4 text-muted-foreground" />
              <h3 className="text-xs font-semibold text-foreground">
                Insurer Denial & Recovery Accountability Matrix
              </h3>
            </div>
            <span className="text-[11px] font-mono text-muted-foreground">
              {stats.payerBreakdown.length} Major Payers
            </span>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Insurance Payer</TableHead>
                <TableHead>Cases</TableHead>
                <TableHead>Disputed</TableHead>
                <TableHead>Won / Overturned</TableHead>
                <TableHead className="text-right">Avg Score</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {stats.payerBreakdown.map((payer) => (
                <TableRow
                  key={payer.payer}
                  onClick={() =>
                    onSelectPayerFilter && onSelectPayerFilter(payer.payer)
                  }
                  className="cursor-pointer"
                >
                  <TableCell className="font-semibold text-foreground">
                    {payer.payer}
                  </TableCell>
                  <TableCell className="font-mono text-muted-foreground">
                    {payer.totalClaims}
                  </TableCell>
                  <TableCell className="font-mono font-semibold text-destructive">
                    {formatCurrency(payer.totalDisputed)}
                  </TableCell>
                  <TableCell className="font-mono text-emerald-600 dark:text-emerald-400 font-medium">
                    {formatCurrency(payer.wonAmount)} ({payer.wonCount})
                  </TableCell>
                  <TableCell className="font-mono font-bold text-right text-foreground">
                    {payer.averageScore}%
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>

        {/* Risk & Precedent Confidence Breakdown (4 Cols) */}
        <Card className="lg:col-span-4 p-4 space-y-4">
          <div className="flex items-center justify-between border-b border-border pb-2.5">
            <div className="flex items-center gap-2">
              <Pulse className="size-4 text-muted-foreground" />
              <h3 className="text-xs font-semibold text-foreground">
                Precedent Confidence Bands
              </h3>
            </div>
          </div>

          <div className="space-y-3.5 pt-0.5">
            {/* High Confidence */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-emerald-600 dark:text-emerald-400">
                  High Confidence (85–100%)
                </span>
                <span className="font-mono text-foreground font-semibold">
                  {stats.claimsByRisk.high_confidence || 0} Cases
                </span>
              </div>
              <Progress
                value={
                  stats.totalClaims > 0
                    ? ((stats.claimsByRisk.high_confidence || 0) /
                        stats.totalClaims) *
                      100
                    : 0
                }
                indicatorClassName="bg-emerald-500"
              />
              <p className="text-[10px] text-muted-foreground">
                Clear CPB contradictions and established precedent
              </p>
            </div>

            {/* Moderate Precedent */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-amber-500 dark:text-amber-400">
                  Moderate (60–84%)
                </span>
                <span className="font-mono text-foreground font-semibold">
                  {stats.claimsByRisk.moderate || 0} Cases
                </span>
              </div>
              <Progress
                value={
                  stats.totalClaims > 0
                    ? ((stats.claimsByRisk.moderate || 0) /
                        stats.totalClaims) *
                      100
                    : 0
                }
                indicatorClassName="bg-amber-500"
              />
              <p className="text-[10px] text-muted-foreground">
                Administrative exceptions or secondary conservative therapy
              </p>
            </div>

            {/* Complex Litigation */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-destructive">
                  Complex Review (&lt;60%)
                </span>
                <span className="font-mono text-foreground font-semibold">
                  {stats.claimsByRisk.complex_litigation || 0} Cases
                </span>
              </div>
              <Progress
                value={
                  stats.totalClaims > 0
                    ? ((stats.claimsByRisk.complex_litigation || 0) /
                        stats.totalClaims) *
                      100
                    : 0
                }
                indicatorClassName="bg-destructive"
              />
              <p className="text-[10px] text-muted-foreground">
                Requires state external review or legal tolling
              </p>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
};
