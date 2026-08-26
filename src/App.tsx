import { useState } from "react";
import { Shell } from "./components/layout/Shell";
import { NavigationView } from "./components/layout/Sidebar";
import {
  ShieldAlert,
  Sparkles,
  Search,
  ArrowRight,
  TrendingUp,
  Award,
} from "lucide-react";
import { formatCurrency } from "./lib/utils";

export default function App() {
  const [currentView, setCurrentView] = useState<NavigationView>("radar");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [payerFilter, setPayerFilter] = useState<string>("all");
  const [isSimulating, setIsSimulating] = useState<boolean>(false);

  const handleRunSimulation = () => {
    setIsSimulating(true);
    setTimeout(() => {
      setIsSimulating(false);
      setCurrentView("studio");
    }, 2000);
  };

  const handleOpenIngestion = () => {
    setCurrentView("radar");
  };

  return (
    <Shell
      currentView={currentView}
      onSelectView={setCurrentView}
      selectedStatusFilter={statusFilter}
      onSelectStatusFilter={setStatusFilter}
      selectedPayerFilter={payerFilter}
      onSelectPayerFilter={setPayerFilter}
      onRunSimulation={handleRunSimulation}
      onOpenIngestion={handleOpenIngestion}
      isSimulating={isSimulating}
      totalDisputedAmount={184500}
      totalWonAmount={126000}
      winRate={89.2}
      criticalDeadlinesCount={2}
    >
      {/* Dynamic Content View Container */}
      <div className="space-y-6">
        {/* Banner Card */}
        <div className="relative overflow-hidden rounded-2xl border border-cyan-500/30 bg-gradient-to-br from-slate-900/90 via-[#0f172a]/80 to-cyan-950/30 p-6 shadow-glass-panel">
          <div className="absolute top-0 right-0 -mr-16 -mt-16 h-64 w-64 rounded-full bg-cyan-500/10 blur-3xl pointer-events-none"></div>
          <div className="absolute bottom-0 left-1/3 -mb-16 h-48 w-48 rounded-full bg-emerald-500/10 blur-3xl pointer-events-none"></div>

          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="space-y-2 max-w-2xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-cyan-500/30 bg-cyan-950/40 px-3 py-1 text-xs font-semibold text-cyan-300 font-mono">
                <Sparkles className="h-3.5 w-3.5 text-cyan-400" />
                <span>Autonomous ERISA & Medical Sentinel Active</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white font-sans">
                Leveling the Healthcare Reimbursement Playing Field
              </h1>
              <p className="text-sm text-slate-300 leading-relaxed">
                Autonomous AI Sentinel that parses insurer denial letters, crawls Clinical Policy Bulletins (CPBs) via Firecrawl, evaluates medical necessity precedent, and synthesizes cited ERISA appeals.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              <button
                onClick={handleRunSimulation}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-emerald-500 px-5 py-3 text-sm font-bold text-slate-950 shadow-cyan-glow transition-all hover:scale-[1.02] active:scale-[0.98]"
              >
                <Sparkles className="h-4 w-4 fill-slate-950" />
                <span>Run 1-Click Live Demo</span>
              </button>
            </div>
          </div>
        </div>

        {/* Highlight Metrics Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 space-y-1.5">
            <div className="flex items-center justify-between text-xs text-slate-400 font-mono">
              <span>Active Denial Volume</span>
              <ShieldAlert className="h-4 w-4 text-cyan-400" />
            </div>
            <div className="text-2xl font-bold text-white font-mono">
              {formatCurrency(184500)}
            </div>
            <div className="text-[11px] text-slate-400 flex items-center gap-1">
              <span className="text-cyan-400 font-medium">5 active cases</span> undergoing appeal
            </div>
          </div>

          <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-4 space-y-1.5">
            <div className="flex items-center justify-between text-xs text-emerald-400/80 font-mono">
              <span>Overturned & Recovered</span>
              <Award className="h-4 w-4 text-emerald-400" />
            </div>
            <div className="text-2xl font-bold text-emerald-300 font-mono">
              {formatCurrency(126000)}
            </div>
            <div className="text-[11px] text-emerald-400/80 flex items-center gap-1">
              <TrendingUp className="h-3 w-3" />
              <span>89.2% average win rate</span>
            </div>
          </div>

          <div className="rounded-xl border border-rose-500/30 bg-rose-950/20 p-4 space-y-1.5">
            <div className="flex items-center justify-between text-xs text-rose-400/80 font-mono">
              <span>Statutory ERISA Alarm</span>
              <span className="h-2 w-2 rounded-full bg-rose-400 animate-ping"></span>
            </div>
            <div className="text-2xl font-bold text-rose-300 font-mono">2 Cases</div>
            <div className="text-[11px] text-rose-400/80">
              &lt; 14 days before 180-day deadline
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 space-y-1.5">
            <div className="flex items-center justify-between text-xs text-slate-400 font-mono">
              <span>Clinical Precedent Engine</span>
              <Search className="h-4 w-4 text-cyan-400" />
            </div>
            <div className="text-2xl font-bold text-cyan-300 font-mono">gpt-5-nano</div>
            <div className="text-[11px] text-slate-400">
              Firecrawl CPB + ERISA 29 CFR citations
            </div>
          </div>
        </div>

        {/* View Indicator Details */}
        <div className="rounded-xl border border-slate-800/80 bg-slate-900/40 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-200">
              <span className="font-mono text-cyan-400 uppercase text-xs">
                Active View:
              </span>
              <span className="capitalize">{currentView}</span>
            </div>
            <span className="text-xs font-mono text-slate-400">
              Phase 2: Foundational Infrastructure Ready
            </span>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            Foundational database schema, OpenAI gpt-5-nano client, domain types, formatters, and reactive UI shell are fully initialized. Proceeding to User Story 1 (Denial Document Ingestion & Optical OCR Extraction) will enable real-time PDF drag-and-drop upload and automated code extraction.
          </p>
          <div className="flex items-center gap-2 pt-2">
            <button
              onClick={() => setCurrentView("radar")}
              className="inline-flex items-center gap-1.5 text-xs text-cyan-400 hover:text-cyan-300 font-mono"
            >
              <span>View Case Radar feed</span>
              <ArrowRight className="h-3 w-3" />
            </button>
          </div>
        </div>
      </div>
    </Shell>
  );
}
