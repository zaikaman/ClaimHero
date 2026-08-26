import React from "react";
import {
  Radar,
  FileSearch,
  FileText,
  Mail,
  Clock,
  CheckCircle,
  AlertCircle,
  FolderGit2,
  Building2,
} from "lucide-react";
import { INSURERS } from "../../lib/constants";

export type NavigationView = "radar" | "evidence" | "studio" | "communications" | "audit";

interface SidebarProps {
  currentView: NavigationView;
  onSelectView: (view: NavigationView) => void;
  selectedStatusFilter?: string;
  onSelectStatusFilter?: (status: string) => void;
  selectedPayerFilter?: string;
  onSelectPayerFilter?: (payer: string) => void;
  claimCountsByStatus?: Record<string, number>;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentView,
  onSelectView,
  selectedStatusFilter = "all",
  onSelectStatusFilter,
  selectedPayerFilter = "all",
  onSelectPayerFilter,
  claimCountsByStatus = {},
}) => {
  const navItems = [
    {
      id: "radar" as NavigationView,
      label: "Case Radar Feed",
      icon: Radar,
      description: "Live intake & optical OCR",
    },
    {
      id: "evidence" as NavigationView,
      label: "Evidence Matrix",
      icon: FileSearch,
      description: "CPB criteria & win score",
    },
    {
      id: "studio" as NavigationView,
      label: "Appeal Studio",
      icon: FileText,
      description: "Live ERISA brief editor",
    },
    {
      id: "communications" as NavigationView,
      label: "AgentMail Inbox",
      icon: Mail,
      description: "Payer grievance threads",
    },
    {
      id: "audit" as NavigationView,
      label: "Case Audit Log",
      icon: Clock,
      description: "Immutable event history",
    },
  ];

  const statusFilters = [
    { id: "all", label: "All Active Cases", icon: FolderGit2 },
    { id: "ingested", label: "Intake / OCR Parsing", icon: Radar },
    { id: "analyzing", label: "CPB Evidence Crawl", icon: FileSearch },
    { id: "ready_for_review", label: "Ready for Dispatch", icon: FileText },
    { id: "dispatched", label: "Transmitted to Payer", icon: Mail },
    { id: "won", label: "Overturned & Won", icon: CheckCircle },
    { id: "critical_deadline", label: "Statutory Alarms (<14d)", icon: AlertCircle },
  ];

  return (
    <aside className="w-64 shrink-0 border-r border-slate-800/80 bg-[#0b0f17]/95 flex flex-col justify-between p-3 font-sans select-none overflow-y-auto">
      <div className="space-y-6">
        {/* Primary Sentinel Navigation */}
        <div>
          <div className="px-2 pb-2 text-[10px] font-bold uppercase tracking-wider text-slate-500 font-mono">
            Sentinel Workspace
          </div>
          <nav className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = currentView === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => onSelectView(item.id)}
                  className={`w-full flex items-center gap-3 rounded-lg px-2.5 py-2 text-xs font-medium transition-all ${
                    isActive
                      ? "bg-cyan-950/60 text-cyan-300 border border-cyan-500/40 shadow-sm shadow-cyan-500/10 font-semibold"
                      : "text-slate-400 hover:bg-slate-900 hover:text-slate-200"
                  }`}
                >
                  <Icon
                    className={`h-4 w-4 shrink-0 ${
                      isActive ? "text-cyan-400" : "text-slate-400"
                    }`}
                  />
                  <div className="text-left leading-tight">
                    <div>{item.label}</div>
                    <div className="text-[10px] text-slate-400 font-normal">
                      {item.description}
                    </div>
                  </div>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Claim Lifecycle Filters */}
        <div>
          <div className="px-2 pb-2 text-[10px] font-bold uppercase tracking-wider text-slate-500 font-mono flex items-center justify-between">
            <span>Lifecycle Filters</span>
            <span className="text-[9px] text-slate-400 font-normal">Status</span>
          </div>
          <div className="space-y-0.5">
            {statusFilters.map((filter) => {
              const Icon = filter.icon;
              const isSelected = selectedStatusFilter === filter.id;
              const count = claimCountsByStatus[filter.id] ?? (filter.id === "all" ? 5 : filter.id === "won" ? 2 : 1);

              return (
                <button
                  key={filter.id}
                  onClick={() => onSelectStatusFilter?.(filter.id)}
                  className={`w-full flex items-center justify-between rounded-md px-2 py-1.5 text-[11px] transition-all ${
                    isSelected
                      ? "bg-slate-800 text-slate-100 font-medium"
                      : "text-slate-400 hover:bg-slate-900/60 hover:text-slate-300"
                  }`}
                >
                  <div className="flex items-center gap-2 truncate">
                    <Icon className={`h-3.5 w-3.5 ${isSelected ? "text-cyan-400" : "text-slate-400"}`} />
                    <span className="truncate">{filter.label}</span>
                  </div>
                  {count > 0 && (
                    <span
                      className={`text-[10px] font-mono px-1.5 py-0.2 rounded ${
                        filter.id === "critical_deadline"
                          ? "bg-rose-950/60 text-rose-400 border border-rose-500/30"
                          : filter.id === "won"
                          ? "bg-emerald-950/60 text-emerald-400 border border-emerald-500/30"
                          : "bg-slate-800 text-slate-400"
                      }`}
                    >
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Payer Filter Matrix */}
        <div>
          <div className="px-2 pb-2 text-[10px] font-bold uppercase tracking-wider text-slate-500 font-mono flex items-center gap-1">
            <Building2 className="h-3 w-3 text-slate-400" />
            <span>Target Payers</span>
          </div>
          <div className="flex flex-wrap gap-1 px-1">
            <button
              onClick={() => onSelectPayerFilter?.("all")}
              className={`rounded px-2 py-0.5 text-[10px] font-mono transition-all ${
                selectedPayerFilter === "all"
                  ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40"
                  : "bg-slate-900 text-slate-400 hover:text-slate-300"
              }`}
            >
              All Payers
            </button>
            {INSURERS.slice(0, 4).map((ins: (typeof INSURERS)[number]) => (
              <button
                key={ins.id}
                onClick={() => onSelectPayerFilter?.(ins.name)}
                className={`rounded px-2 py-0.5 text-[10px] font-mono transition-all ${
                  selectedPayerFilter === ins.name
                    ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40"
                    : "bg-slate-900 text-slate-400 hover:text-slate-300"
                }`}
              >
                {ins.name.split(" ")[0]}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Footer / System Status */}
      <div className="pt-4 border-t border-slate-800/80">
        <div className="rounded-lg bg-slate-950/70 border border-slate-800/80 p-2.5 space-y-1.5 text-[10px] font-mono text-slate-400">
          <div className="flex items-center justify-between text-slate-300">
            <span className="font-semibold">ERISA Sentinel</span>
            <span className="flex items-center gap-1 text-emerald-400 text-[9px]">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-ping"></span>
              LIVE
            </span>
          </div>
          <div className="text-[9px] text-slate-400 leading-tight">
            Autonomous 29 CFR § 2560.503-1 Statutory Monitor Active
          </div>
        </div>
      </div>
    </aside>
  );
};
