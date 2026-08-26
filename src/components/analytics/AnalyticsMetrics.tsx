import React from "react";
import {
  TrendingUp,
  DollarSign,
  Building2,
  PieChart,
  Activity,
  CheckCircle2,
  Clock,
  ArrowUpRight,
  ShieldAlert,
} from "lucide-react";
import { formatCurrency } from "../../lib/utils";

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
      <div className="p-12 text-center text-xs font-mono text-slate-400 animate-pulse">
        Computing portfolio financial recovery metrics across Convex Cloud Database...
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fadeIn font-sans">
      {/* Analytics Header */}
      <div className="rounded-2xl border border-cyan-500/30 bg-slate-950/95 p-5 shadow-glass-panel">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-cyan-950/60 border border-cyan-500/40 shadow-cyan-glow">
              <PieChart className="h-6 w-6 text-cyan-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold text-white">
                  Portfolio Financial & Overturn Analytics
                </h2>
                <span className="rounded-full bg-cyan-950/60 border border-cyan-500/40 px-2 py-0.5 text-[10px] font-mono text-cyan-300 font-semibold uppercase">
                  Live DB Aggregation
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Real-time financial recovery tracking, insurer overturn benchmarks, and statutory ERISA health dials
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onNavigateToRadar}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-900 px-3.5 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-800 transition-colors"
            >
              <span>View Case Radar</span>
              <ArrowUpRight className="h-3.5 w-3.5 text-cyan-400" />
            </button>
          </div>
        </div>
      </div>

      {/* Top 4 KPI Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Disputed Pipeline */}
        <div className="rounded-2xl border border-slate-800 bg-slate-950/80 p-5 space-y-2 relative overflow-hidden group hover:border-slate-700 transition-colors">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[11px] font-mono uppercase tracking-wider">Total Disputed Pipeline</span>
            <DollarSign className="h-4 w-4 text-rose-400" />
          </div>
          <div className="text-2xl font-black font-mono text-white">
            {formatCurrency(stats.totalDisputedAmount)}
          </div>
          <div className="text-[11px] text-slate-400 font-mono flex items-center justify-between">
            <span>{stats.totalClaims} Total Cases</span>
            <span className="text-rose-400 font-semibold">{formatCurrency(stats.activeDisputedAmount)} Active</span>
          </div>
        </div>

        {/* Recovered & Won Funds */}
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-950/20 p-5 space-y-2 relative overflow-hidden group hover:border-emerald-500/50 transition-colors shadow-emerald-glow">
          <div className="flex items-center justify-between text-emerald-400">
            <span className="text-[11px] font-mono uppercase tracking-wider font-bold">Recovered Viable Funds</span>
            <CheckCircle2 className="h-4 w-4" />
          </div>
          <div className="text-2xl font-black font-mono text-emerald-300">
            {formatCurrency(stats.overturnedWonAmount)}
          </div>
          <div className="text-[11px] text-emerald-400/90 font-mono flex items-center justify-between">
            <span>{stats.claimsByStatus.won || 0} Settled Cases</span>
            <span className="font-bold">{stats.recoveryRatePercent}% Overturn Rate</span>
          </div>
        </div>

        {/* Average Overturn Probability */}
        <div className="rounded-2xl border border-cyan-500/30 bg-cyan-950/20 p-5 space-y-2 relative overflow-hidden group hover:border-cyan-500/50 transition-colors shadow-cyan-glow">
          <div className="flex items-center justify-between text-cyan-400">
            <span className="text-[11px] font-mono uppercase tracking-wider font-bold">Avg Win Probability</span>
            <TrendingUp className="h-4 w-4" />
          </div>
          <div className="text-2xl font-black font-mono text-cyan-300">
            {stats.averageWinScore}%
          </div>
          <div className="text-[11px] text-cyan-400/90 font-mono">
            Based on {stats.totalClaims} cross-examined CPBs
          </div>
        </div>

        {/* Critical ERISA Alarms */}
        <div
          className={`rounded-2xl border p-5 space-y-2 relative overflow-hidden group transition-colors ${
            stats.criticalDeadlinesCount > 0
              ? "border-rose-500/50 bg-rose-950/30 shadow-rose-glow animate-pulse"
              : "border-slate-800 bg-slate-950/80"
          }`}
        >
          <div className="flex items-center justify-between text-rose-400">
            <span className="text-[11px] font-mono uppercase tracking-wider font-bold">Urgent ERISA Alarms</span>
            {stats.criticalDeadlinesCount > 0 ? (
              <ShieldAlert className="h-4 w-4 text-rose-400" />
            ) : (
              <Clock className="h-4 w-4 text-slate-500" />
            )}
          </div>
          <div className="text-2xl font-black font-mono text-white">
            {stats.criticalDeadlinesCount}
          </div>
          <div className="text-[11px] text-slate-400 font-mono">
            {stats.urgentDeadlinesCount} cases in 14-45d window
          </div>
        </div>
      </div>

      {/* Two-Column Middle Section: Insurer Performance Table & Risk Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Insurer Performance Breakdown Table (8 Cols) */}
        <div className="lg:col-span-8 rounded-2xl border border-slate-800 bg-slate-950/80 p-5 space-y-4 shadow-glass-panel">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-cyan-400" />
              <h3 className="text-sm font-bold text-white font-sans">
                Insurer Denial & Recovery Accountability Matrix
              </h3>
            </div>
            <span className="text-[11px] font-mono text-slate-500">
              {stats.payerBreakdown.length} Major Payers
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-sans">
              <thead>
                <tr className="border-b border-slate-800/80 text-[10px] font-mono uppercase text-slate-400">
                  <th className="py-2.5 px-3">Insurance Payer</th>
                  <th className="py-2.5 px-3">Cases</th>
                  <th className="py-2.5 px-3">Disputed Amount</th>
                  <th className="py-2.5 px-3">Won / Overturned</th>
                  <th className="py-2.5 px-3 text-right">Avg Win Score</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {stats.payerBreakdown.map((payer) => (
                  <tr
                    key={payer.payer}
                    onClick={() => onSelectPayerFilter && onSelectPayerFilter(payer.payer)}
                    className="hover:bg-slate-900/60 transition-colors cursor-pointer group"
                  >
                    <td className="py-3 px-3 font-semibold text-white group-hover:text-cyan-300 transition-colors">
                      {payer.payer}
                    </td>
                    <td className="py-3 px-3 font-mono text-slate-300">
                      {payer.totalClaims}
                    </td>
                    <td className="py-3 px-3 font-mono font-semibold text-rose-400">
                      {formatCurrency(payer.totalDisputed)}
                    </td>
                    <td className="py-3 px-3 font-mono text-emerald-400">
                      {formatCurrency(payer.wonAmount)} ({payer.wonCount})
                    </td>
                    <td className="py-3 px-3 font-mono font-bold text-right text-cyan-300">
                      {payer.averageScore}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Risk & Precedent Confidence Breakdown (4 Cols) */}
        <div className="lg:col-span-4 rounded-2xl border border-slate-800 bg-slate-950/80 p-5 space-y-4 shadow-glass-panel">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-emerald-400" />
              <h3 className="text-sm font-bold text-white font-sans">
                Precedent Confidence Bands
              </h3>
            </div>
          </div>

          <div className="space-y-4 pt-1">
            {/* High Confidence */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-emerald-400 font-semibold font-mono">High Confidence (85–100%)</span>
                <span className="font-mono text-white font-bold">{stats.claimsByRisk.high_confidence || 0} Cases</span>
              </div>
              <div className="h-2 w-full rounded-full bg-slate-900 overflow-hidden border border-slate-800">
                <div
                  className="h-full bg-emerald-400 rounded-full"
                  style={{
                    width: `${stats.totalClaims > 0 ? ((stats.claimsByRisk.high_confidence || 0) / stats.totalClaims) * 100 : 0}%`,
                  }}
                />
              </div>
              <p className="text-[10px] text-slate-400">Clear insurer CPB contradictions and established precedent</p>
            </div>

            {/* Moderate Precedent */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-amber-400 font-semibold font-mono">Moderate Precedent (60–84%)</span>
                <span className="font-mono text-white font-bold">{stats.claimsByRisk.moderate || 0} Cases</span>
              </div>
              <div className="h-2 w-full rounded-full bg-slate-900 overflow-hidden border border-slate-800">
                <div
                  className="h-full bg-amber-400 rounded-full"
                  style={{
                    width: `${stats.totalClaims > 0 ? ((stats.claimsByRisk.moderate || 0) / stats.totalClaims) * 100 : 0}%`,
                  }}
                />
              </div>
              <p className="text-[10px] text-slate-400">Administrative exceptions or secondary conservative therapy evidence</p>
            </div>

            {/* Complex Litigation */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-rose-400 font-semibold font-mono">Complex Review (&lt;60%)</span>
                <span className="font-mono text-white font-bold">{stats.claimsByRisk.complex_litigation || 0} Cases</span>
              </div>
              <div className="h-2 w-full rounded-full bg-slate-900 overflow-hidden border border-slate-800">
                <div
                  className="h-full bg-rose-400 rounded-full"
                  style={{
                    width: `${stats.totalClaims > 0 ? ((stats.claimsByRisk.complex_litigation || 0) / stats.totalClaims) * 100 : 0}%`,
                  }}
                />
              </div>
              <p className="text-[10px] text-slate-400">Requires independent state external review or litigation tolling</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
