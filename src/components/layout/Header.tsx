import React from "react";
import {
  Shield,
  UploadCloud,
  Activity,
  AlertTriangle,
  CheckCircle2,
  DollarSign,
} from "lucide-react";
import { formatCurrency } from "../../lib/utils";

interface HeaderProps {
  onOpenIngestion: () => void;
  totalDisputedAmount: number;
  totalWonAmount: number;
  winRate: number;
  criticalDeadlinesCount: number;
}

export const Header: React.FC<HeaderProps> = ({
  onOpenIngestion,
  totalDisputedAmount = 0,
  totalWonAmount = 0,
  winRate = 0,
  criticalDeadlinesCount = 0,
}) => {
  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-800/80 bg-[#0b0f17]/90 backdrop-blur-xl">
      <div className="flex h-16 items-center justify-between px-4 sm:px-6">
        {/* Left: Brand Identity */}
        <div className="flex items-center gap-3">
          <div className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500/20 via-slate-900 to-emerald-500/20 p-0.5 border border-cyan-500/40 shadow-cyan-glow">
            <Shield className="h-5 w-5 text-cyan-400" />
            <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
            </span>
          </div>

          <div>
            <div className="flex items-center gap-2">
              <span className="text-lg font-bold tracking-tight text-white font-sans">
                Claim<span className="text-cyan-400">Hero</span>
              </span>
              <span className="rounded-md border border-cyan-500/30 bg-cyan-950/40 px-1.5 py-0.5 text-[10px] font-semibold text-cyan-300 uppercase tracking-wider font-mono">
                Sentinel v1.0
              </span>
            </div>
            <p className="text-[11px] text-slate-400 hidden md:block">
              Autonomous Medical & Health Insurance Appeal Engine
            </p>
          </div>
        </div>

        {/* Center: Live Real Sentinel Metrics from Convex */}
        <div className="hidden lg:flex items-center gap-4 text-xs font-mono">
          {/* Disputed Volume */}
          <div className="flex items-center gap-2 rounded-lg bg-slate-900/80 border border-slate-800 px-3 py-1.5">
            <DollarSign className="h-3.5 w-3.5 text-cyan-400" />
            <div>
              <span className="text-slate-400 text-[10px] block leading-none">Disputed Pipeline</span>
              <span className="font-semibold text-slate-100">{formatCurrency(totalDisputedAmount)}</span>
            </div>
          </div>

          {/* Overturn Recovered */}
          <div className="flex items-center gap-2 rounded-lg bg-emerald-950/30 border border-emerald-500/30 px-3 py-1.5">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
            <div>
              <span className="text-emerald-400/80 text-[10px] block leading-none">Recovered / Won</span>
              <span className="font-semibold text-emerald-300">
                {formatCurrency(totalWonAmount)} {winRate > 0 ? `(${winRate}%)` : ""}
              </span>
            </div>
          </div>

          {/* Critical Statutory Alarms */}
          <div className="flex items-center gap-2 rounded-lg bg-rose-950/30 border border-rose-500/30 px-3 py-1.5">
            <AlertTriangle className={`h-3.5 w-3.5 text-rose-400 ${criticalDeadlinesCount > 0 ? "animate-pulse" : ""}`} />
            <div>
              <span className="text-rose-400/80 text-[10px] block leading-none">Statutory Alarms</span>
              <span className="font-semibold text-rose-300">
                {criticalDeadlinesCount > 0 ? `${criticalDeadlinesCount} Critical (<14d)` : "0 Pending"}
              </span>
            </div>
          </div>

          {/* AI Reasoning Sentinel Status */}
          <div className="flex items-center gap-1.5 rounded-lg bg-slate-900/60 border border-slate-800 px-2.5 py-1.5 text-slate-400">
            <Activity className="h-3 w-3 text-cyan-400" />
            <span className="text-[11px] text-slate-300">gpt-5-nano</span>
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400"></span>
          </div>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-2.5">
          {/* Primary Ingestion CTA */}
          <button
            onClick={onOpenIngestion}
            className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-cyan-500 via-teal-500 to-emerald-500 px-4 py-2 text-xs font-bold text-slate-950 shadow-cyan-glow hover:scale-105 active:scale-95 transition-all"
          >
            <UploadCloud className="h-4 w-4 fill-slate-950" />
            <span>+ Ingest Denial Document</span>
          </button>
        </div>
      </div>
    </header>
  );
};
