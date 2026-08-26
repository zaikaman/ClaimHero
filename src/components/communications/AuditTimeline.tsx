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
import { Card } from "../ui/card";
import { Badge } from "../ui/badge";

interface AuditTimelineProps {
  claim?: Claim | null;
  logs: AuditLog[];
  isLoading?: boolean;
}

const EVENT_CONFIGS: Record<
  string,
  { label: string; badgeVariant: "default" | "secondary" | "destructive" | "outline"; icon: any }
> = {
  denial_ingested: {
    label: "Denial Ingested",
    badgeVariant: "default",
    icon: FileSearch,
  },
  policy_crawled: {
    label: "Policy Crawled",
    badgeVariant: "secondary",
    icon: Sparkles,
  },
  status_changed_to_precedent_matched: {
    label: "Win Score Computed",
    badgeVariant: "default",
    icon: Award,
  },
  appeal_draft_updated: {
    label: "Appeal Drafted",
    badgeVariant: "secondary",
    icon: Shield,
  },
  appeal_dispatched: {
    label: "Appeal Dispatched",
    badgeVariant: "default",
    icon: Send,
  },
  payer_response_received: {
    label: "Payer Reply Received",
    badgeVariant: "secondary",
    icon: Mail,
  },
  statutory_alarm_critical: {
    label: "Statutory Alarm",
    badgeVariant: "destructive",
    icon: AlertTriangle,
  },
};

export const AuditTimeline: React.FC<AuditTimelineProps> = ({
  claim,
  logs,
  isLoading,
}) => {
  const [filterType, setFilterType] = useState<string>("all");

  const filteredLogs = logs.filter((log) => {
    if (filterType !== "all" && log.eventType !== filterType) return false;
    return true;
  });

  return (
    <div className="space-y-4 animate-fadeIn">
      {/* Header Banner */}
      <Card className="p-4 bg-card border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-xs">
            <Clock className="size-5" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-foreground font-sans">
              Case Audit Timeline
            </h2>
            <p className="text-xs text-muted-foreground">
              {claim
                ? `Cryptographic event trail for Claim #${claim.claimNumber} (${claim.patient?.name})`
                : "Live portfolio audit trail across medical appeal claims"}
            </p>
          </div>
        </div>

        {/* Filter Selector */}
        <div className="flex items-center gap-2">
          <Filter className="size-3.5 text-muted-foreground" />
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="rounded-lg border border-input bg-background px-2.5 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring font-sans h-8"
          >
            <option value="all">All Events ({logs.length})</option>
            <option value="denial_ingested">Denial Ingested</option>
            <option value="policy_crawled">Policy Crawled</option>
            <option value="appeal_dispatched">Appeal Dispatched</option>
            <option value="payer_response_received">Payer Replies</option>
            <option value="statutory_alarm_critical">Statutory Alarms</option>
          </select>
        </div>
      </Card>

      {/* Timeline Stream */}
      <Card className="p-6 bg-card border-border">
        {isLoading ? (
          <div className="p-8 text-center text-xs font-mono text-muted-foreground animate-pulse">
            Loading audit logs from Convex...
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="p-8 text-center text-xs text-muted-foreground">
            No audit log events found for this filter.
          </div>
        ) : (
          <div className="relative pl-6 space-y-5 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-px before:bg-border">
            {filteredLogs.map((log) => {
              const config = EVENT_CONFIGS[log.eventType] || {
                label: log.eventType.replace(/_/g, " ").toUpperCase(),
                badgeVariant: "outline" as const,
                icon: Clock,
              };

              const IconComponent = config.icon;

              return (
                <div key={log._id} className="relative group">
                  {/* Timeline Dot */}
                  <div className="absolute -left-6 top-1 flex size-5 items-center justify-center rounded-full border border-border bg-card shadow-xs">
                    <IconComponent className="size-2.5 text-foreground" />
                  </div>

                  <Card className="p-3.5 space-y-1.5 bg-card hover:bg-muted/30 transition-colors">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Badge
                          variant={config.badgeVariant}
                          size="sm"
                          className="font-mono text-[10px]"
                        >
                          {config.label}
                        </Badge>
                        <span className="font-mono text-xs text-muted-foreground">
                          Actor: <strong className="text-foreground">{log.actor}</strong>
                        </span>
                      </div>

                      <span className="text-[11px] font-mono text-muted-foreground">
                        {formatDate(log.timestamp)}
                      </span>
                    </div>

                    <p className="text-xs text-foreground/90 leading-relaxed font-sans">
                      {log.details}
                    </p>
                  </Card>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
};
