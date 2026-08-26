import React, { useState } from "react";
import {
  Radar,
  Search,
  UploadCloud,
  FileText,
  User,
  Activity,
  ArrowUpRight,
  Stethoscope,
  DollarSign,
  TrendingUp,
} from "lucide-react";
import { Claim } from "../../types";
import {
  formatCurrency,
  formatDate,
  getStatusConfig,
  getScoreColor,
} from "../../lib/utils";
import { CPT_CODES, DENIAL_REASON_CODES } from "../../lib/constants";
import { DeadlineCountdown } from "./DeadlineCountdown";

interface CaseRadarProps {
  claims: Claim[];
  selectedClaimId: string;
  onSelectClaim: (claimId: string) => void;
  onOpenIngestion: () => void;
  onNavigateView: (view: "radar" | "evidence" | "studio" | "communications" | "audit") => void;
}

export const CaseRadar: React.FC<CaseRadarProps> = ({
  claims,
  selectedClaimId,
  onSelectClaim,
  onOpenIngestion,
  onNavigateView,
}) => {
  const [searchQuery, setSearchQuery] = useState("");

  const filtered = claims.filter((c) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      c.claimNumber.toLowerCase().includes(q) ||
      c.patient?.name.toLowerCase().includes(q) ||
      c.cptCodes.some((code) => code.includes(q)) ||
      c.denialReasonCode.toLowerCase().includes(q) ||
      c.patient?.insurancePayer.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Radar Control Header */}
      <div className="relative overflow-hidden rounded-2xl border border-cyan-500/30 bg-gradient-to-r from-slate-900/90 via-[#0b1526]/80 to-slate-900/90 p-5 shadow-glass-panel">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            {/* Animated Radar Pulse Icon */}
            <div className="relative flex h-12 w-12 items-center justify-center rounded-xl bg-cyan-950/60 border border-cyan-500/40 shadow-cyan-glow">
              <Radar className="h-6 w-6 text-cyan-400 animate-spin" style={{ animationDuration: "6s" }} />
              <span className="absolute -top-1 -right-1 flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-cyan-500"></span>
              </span>
            </div>

            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold tracking-tight text-white font-sans">
                  Live Case Ingestion Radar
                </h2>
                <span className="rounded-full bg-emerald-950/60 border border-emerald-500/40 px-2 py-0.5 text-[10px] font-mono text-emerald-300 font-semibold flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                  SCANNING
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Real-time optical parsing of EOBs, Clinical Policy Bulletin cross-examinations, and statutory countdown tracking
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            {/* Search Input */}
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search CPT, Denial Code, Patient..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-56 sm:w-64 rounded-xl border border-slate-800 bg-slate-950/80 pl-9 pr-3 py-2 text-xs text-slate-200 placeholder-slate-500 focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-400 font-sans"
              />
            </div>

            {/* Ingestion Trigger Button */}
            <button
              onClick={onOpenIngestion}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-teal-500 px-4 py-2 text-xs font-bold text-slate-950 shadow-cyan-glow transition-all hover:scale-105 active:scale-95"
            >
              <UploadCloud className="h-4 w-4 fill-slate-950" />
              <span>+ Ingest Denial PDF</span>
            </button>
          </div>
        </div>
      </div>

      {/* Case Radar Feed Grid */}
      <div className="grid grid-cols-1 gap-4">
        {filtered.length === 0 ? (
          <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-12 text-center space-y-3">
            <Radar className="mx-auto h-8 w-8 text-slate-600 animate-pulse" />
            <div className="text-sm font-semibold text-slate-300">No matching denial cases found</div>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              Upload a new denial letter or forward an Explanation of Benefits to your assigned claim inbox.
            </p>
            <button
              onClick={onOpenIngestion}
              className="inline-flex items-center gap-2 rounded-lg bg-slate-800 border border-slate-700 px-4 py-2 text-xs font-medium text-cyan-300 hover:bg-slate-700"
            >
              <UploadCloud className="h-3.5 w-3.5" />
              <span>+ Ingest Denial Document</span>
            </button>
          </div>
        ) : (
          filtered.map((claim) => {
            const isSelected = claim._id === selectedClaimId;
            const statusConfig = getStatusConfig(claim.status);
            const scoreMetrics = claim.overturnProbabilityScore
              ? getScoreColor(claim.overturnProbabilityScore)
              : null;
            const denialReason = DENIAL_REASON_CODES[claim.denialReasonCode];

            return (
              <div
                key={claim._id}
                onClick={() => onSelectClaim(claim._id)}
                className={`relative rounded-xl border transition-all duration-200 cursor-pointer overflow-hidden p-5 ${
                  isSelected
                    ? "border-cyan-500/60 bg-gradient-to-br from-slate-900/90 via-[#0d1c2e]/90 to-slate-900/90 shadow-cyan-glow"
                    : "border-slate-800/90 bg-slate-900/50 hover:border-slate-700 hover:bg-slate-900/80"
                }`}
              >
                {/* Accent top stripe */}
                {isSelected && (
                  <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-cyan-400 via-teal-400 to-emerald-400"></div>
                )}

                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  {/* Left Column: Patient & Payer Case Details */}
                  <div className="space-y-2.5 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-md border border-cyan-500/30 bg-cyan-950/40 px-2 py-0.5 text-xs font-mono font-bold text-cyan-300">
                        {claim.claimNumber}
                      </span>
                      <span className="rounded-md border border-slate-700 bg-slate-800/80 px-2 py-0.5 text-xs font-medium text-slate-300">
                        {claim.patient?.insurancePayer || "Health Insurer"}
                      </span>
                      <span
                        className={`rounded-md border px-2 py-0.5 text-[11px] font-semibold flex items-center gap-1.5 ${statusConfig.border} ${statusConfig.bg} ${statusConfig.color}`}
                      >
                        <span className="h-1.5 w-1.5 rounded-full bg-current"></span>
                        {statusConfig.label}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-4 text-xs text-slate-300">
                      <div className="flex items-center gap-1.5 font-medium">
                        <User className="h-3.5 w-3.5 text-cyan-400" />
                        <span>{claim.patient?.name || "Patient Record"}</span>
                        <span className="text-slate-500 font-mono text-[11px]">
                          ({claim.patient?.memberId})
                        </span>
                      </div>
                      <div className="flex items-center gap-1 text-slate-400 text-[11px]">
                        <Stethoscope className="h-3.5 w-3.5 text-slate-500" />
                        <span>{claim.providerName}</span>
                      </div>
                      <div className="text-slate-500 text-[11px] font-mono">
                        DOS: {formatDate(claim.serviceDate)}
                      </div>
                    </div>

                    {/* CPT & Denial Reason Badges */}
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      {claim.cptCodes.map((code) => {
                        const cptInfo = CPT_CODES[code];
                        return (
                          <div
                            key={code}
                            className="inline-flex items-center gap-1.5 rounded-md border border-slate-700/80 bg-slate-950/60 px-2 py-1 text-xs font-mono"
                          >
                            <span className="font-bold text-cyan-300">CPT {code}</span>
                            {cptInfo && (
                              <span className="text-[11px] text-slate-400 font-sans">
                                — {cptInfo.name}
                              </span>
                            )}
                          </div>
                        );
                      })}

                      <div className="inline-flex items-center gap-1.5 rounded-md border border-rose-500/40 bg-rose-950/30 px-2 py-1 text-xs font-mono">
                        <span className="font-bold text-rose-400">{claim.denialReasonCode}</span>
                        {denialReason && (
                          <span className="text-[11px] text-rose-300/80 font-sans truncate max-w-xs">
                            — {denialReason.title}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Middle Column: Financials & Win Score Matrix */}
                  <div className="flex flex-wrap lg:flex-nowrap items-center gap-4 lg:gap-6 border-t lg:border-t-0 lg:border-l border-slate-800/80 pt-3 lg:pt-0 lg:pl-6">
                    {/* Disputed Amount */}
                    <div className="text-left">
                      <div className="text-[10px] uppercase font-mono tracking-wider text-slate-400 flex items-center gap-1">
                        <DollarSign className="h-3 w-3 text-rose-400" />
                        <span>Denied Amount</span>
                      </div>
                      <div className="text-xl font-bold font-mono text-white">
                        {formatCurrency(claim.deniedAmount)}
                      </div>
                      <div className="text-[10px] text-rose-400">
                        Patient Owes: {formatCurrency(claim.patientOwedAmount)}
                      </div>
                    </div>

                    {/* Overturn Probability Win Score */}
                    {claim.overturnProbabilityScore !== undefined && scoreMetrics && (
                      <div className="text-left">
                        <div className="text-[10px] uppercase font-mono tracking-wider text-slate-400 flex items-center gap-1">
                          <TrendingUp className="h-3 w-3 text-emerald-400" />
                          <span>Win Likelihood</span>
                        </div>
                        <div className={`text-xl font-bold font-mono ${scoreMetrics.text}`}>
                          {claim.overturnProbabilityScore}%
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono">
                          {claim.riskLevel === "high_confidence"
                            ? "High Precedent"
                            : "Evaluating"}
                        </div>
                      </div>
                    )}

                    {/* Statutory Deadline Alarm */}
                    <div className="text-left min-w-[130px]">
                      <DeadlineCountdown
                        daysRemaining={claim.daysRemaining}
                        statutoryDeadline={claim.statutoryDeadline}
                        size="sm"
                      />
                    </div>
                  </div>

                  {/* Right Column: Quick Case Action Buttons */}
                  <div className="flex items-center gap-2 pt-2 lg:pt-0">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectClaim(claim._id);
                        onNavigateView("evidence");
                      }}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-1.5 text-xs font-medium text-slate-200 hover:border-cyan-500/50 hover:bg-slate-700 hover:text-cyan-300 transition-all"
                    >
                      <Activity className="h-3.5 w-3.5 text-cyan-400" />
                      <span>Evidence</span>
                    </button>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectClaim(claim._id);
                        onNavigateView("studio");
                      }}
                      className="inline-flex items-center gap-1 rounded-lg bg-cyan-500/20 border border-cyan-500/40 px-3 py-1.5 text-xs font-semibold text-cyan-300 hover:bg-cyan-500/30 hover:shadow-cyan-glow transition-all"
                    >
                      <FileText className="h-3.5 w-3.5" />
                      <span>Appeal Studio</span>
                      <ArrowUpRight className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
