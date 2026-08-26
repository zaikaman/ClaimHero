import React, { useState } from "react";
import {
  Clock,
  Shield,
  FileSearch,
  Sparkles,
  Send,
  Mail,
  AlertTriangle,
  Award,
  Filter,
} from "lucide-react";
import { AuditLog, Claim } from "../../types";
import { formatDate } from "../../lib/utils";

interface AuditTimelineProps {
  claim?: Claim | null;
  logs: AuditLog[];
  isLoading?: boolean;
}

const EVENT_CONFIGS: Record<string, { label: string; color: string; border: string; bg: string; icon: any }> = {
  denial_ingested: {
    label: "Denial Ingested",
    color: "text-cyan-400",
    border: "border-cyan-500/40",
    bg: "bg-cyan-950/40",
    icon: FileSearch,
  },
  policy_crawled: {
    label: "Policy Crawled",
    color: "text-purple-400",
    border: "border-purple-500/40",
    bg: "bg-purple-950/40",
    icon: Sparkles,
  },
  status_changed_to_precedent_matched: {
    label: "Win Score Evaluated",
    color: "text-emerald-400",
    border: "border-emerald-500/40",
    bg: "bg-emerald-950/40",
    icon: Award,
  },
  appeal_draft_updated: {
    label: "Appeal Brief Drafted",
    color: "text-blue-400",
    border: "border-blue-500/40",
    bg: "bg-blue-950/40",
    icon: Shield,
  },
  appeal_dispatched: {
    label: "Appeal Dispatched",
    color: "text-amber-400",
    border: "border-amber-500/40",
    bg: "bg-amber-950/40",
    icon: Send,
  },
  payer_response_received: {
    label: "Payer Reply Received",
    color: "text-teal-400",
    border: "border-teal-500/40",
    bg: "bg-teal-950/40",
    icon: Mail,
  },
  statutory_alarm_critical: {
    label: "Statutory Alarm",
    color: "text-rose-400",
    border: "border-rose-500/40",
    bg: "bg-rose-950/40",
    icon: AlertTriangle,
  },
};

export const AuditTimeline: React.FC<AuditTimelineProps> = ({ claim, logs, isLoading }) => {
  const [filterType, setFilterType] = useState<string>("all");

  const filteredLogs = logs.filter((log) => {
    if (filterType !== "all" && log.eventType !== filterType) return false;
    return true;
  });

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header Banner */}
      <div className="rounded-2xl border border-cyan-500/30 bg-slate-950/95 p-5 shadow-glass-panel flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-cyan-950/60 border border-cyan-500/40 shadow-cyan-glow">
            <Clock className="h-6 w-6 text-cyan-400" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white font-sans">
              Immutable Case Audit Timeline
            </h2>
            <p className="text-xs text-slate-400">
              {claim
                ? `Cryptographic event trail for Claim #${claim.claimNumber} (${claim.patient?.name})`
                : "Live portfolio audit trail across all medical appeal claims"}
            </p>
          </div>
        </div>

        {/* Filter Dropdown */}
        <div className="flex items-center gap-2">
          <Filter className="h-3.5 w-3.5 text-slate-500" />
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="rounded-xl border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs text-slate-300 focus:border-cyan-400 focus:outline-none font-mono"
          >
            <option value="all">All Events ({logs.length})</option>
            <option value="denial_ingested">Denial Ingested</option>
            <option value="policy_crawled">Policy Crawled</option>
            <option value="appeal_dispatched">Appeal Dispatched</option>
            <option value="payer_response_received">Payer Replies</option>
            <option value="statutory_alarm_critical">Statutory Alarms</option>
          </select>
        </div>
      </div>

      {/* Timeline Stream */}
      <div className="rounded-2xl border border-slate-800 bg-slate-950/80 p-6 shadow-glass-panel">
        {isLoading ? (
          <div className="p-8 text-center text-xs font-mono text-slate-400 animate-pulse">
            Loading immutable audit logs from Convex...
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500 font-mono">
            No audit log events found for this filter.
          </div>
        ) : (
          <div className="relative pl-6 space-y-6 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-800">
            {filteredLogs.map((log) => {
              const config = EVENT_CONFIGS[log.eventType] || {
                label: log.eventType.replace(/_/g, " ").toUpperCase(),
                color: "text-slate-300",
                border: "border-slate-700",
                bg: "bg-slate-900",
                icon: Clock,
              };

              const IconComponent = config.icon;

              return (
                <div key={log._id} className="relative group">
                  {/* Timeline Dot */}
                  <div
                    className={`absolute -left-6 top-1 flex h-5 w-5 items-center justify-center rounded-full border ${config.border} ${config.bg} shadow-cyan-glow`}
                  >
                    <IconComponent className={`h-2.5 w-2.5 ${config.color}`} />
                  </div>

                  <div className="rounded-xl border border-slate-800/80 bg-slate-900/60 p-4 space-y-2 group-hover:border-slate-700 transition-colors">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span
                          className={`rounded px-2 py-0.5 text-[10px] font-mono font-bold uppercase border ${config.bg} ${config.border} ${config.color}`}
                        >
                          {config.label}
                        </span>
                        <span className="font-mono text-xs font-semibold text-slate-300">
                          Actor: {log.actor}
                        </span>
                      </div>

                      <span className="text-[10px] font-mono text-slate-500">
                        {formatDate(log.timestamp)}
                      </span>
                    </div>

                    <p className="text-xs text-slate-200 leading-relaxed font-sans">
                      {log.details}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
