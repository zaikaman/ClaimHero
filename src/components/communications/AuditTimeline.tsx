import React, { useState, useMemo, useEffect } from "react";
import {
  Clock,
  Shield,
  FileMagnifyingGlass,
  Globe,
  PaperPlaneTilt,
  Envelope,
  Warning,
  Medal,
  Funnel,
  CircleNotch,
} from "@phosphor-icons/react";
import { AuditLog, Claim } from "../../types";
import { formatDateTime } from "../../lib/utils";
import { Card } from "../ui/card";
import { Badge } from "../ui/badge";
import { Select } from "../ui/select";

export interface AuditTimelineProps {
  claim?: Claim | null;
  logs: AuditLog[];
  isLoading?: boolean;
  isDrawer?: boolean;
}

const EVENT_CONFIGS: Record<
  string,
  { label: string; badgeVariant: "default" | "secondary" | "destructive" | "outline"; icon: React.ComponentType<{ className?: string }> }
> = {
  denial_ingested: {
    label: "Denial Ingested",
    badgeVariant: "default",
    icon: FileMagnifyingGlass,
  },
  policy_crawled: {
    label: "Policy Crawled",
    badgeVariant: "secondary",
    icon: Globe,
  },
  multi_source_crawl_started: {
    label: "Clinical Research Started",
    badgeVariant: "secondary",
    icon: Globe,
  },
  precedent_vectors_retrieved: {
    label: "Precedents Matched",
    badgeVariant: "default",
    icon: Medal,
  },
  precedents_retrieval_warning: {
    label: "Precedent Warning",
    badgeVariant: "destructive",
    icon: Warning,
  },
  status_changed_to_precedent_matched: {
    label: "Win Score Computed",
    badgeVariant: "default",
    icon: Medal,
  },
  overturn_score_computed: {
    label: "Win Score Computed",
    badgeVariant: "default",
    icon: Medal,
  },
  appeal_draft_updated: {
    label: "Appeal Drafted",
    badgeVariant: "secondary",
    icon: Shield,
  },
  brief_synthesized: {
    label: "Brief Synthesized",
    badgeVariant: "default",
    icon: Shield,
  },
  appeal_context_completed: {
    label: "Appeal Context Ready",
    badgeVariant: "secondary",
    icon: Shield,
  },
  appeal_dispatched: {
    label: "Appeal Dispatched",
    badgeVariant: "default",
    icon: PaperPlaneTilt,
  },
  appeal_packet_dispatched: {
    label: "Appeal Dispatched",
    badgeVariant: "default",
    icon: PaperPlaneTilt,
  },
  payer_response_received: {
    label: "Payer Reply Received",
    badgeVariant: "secondary",
    icon: Envelope,
  },
  inbound_reply_adjudicated: {
    label: "Inbound Reply Adjudicated",
    badgeVariant: "default",
    icon: Envelope,
  },
  inbound_attachment_processed: {
    label: "Attachment Processed",
    badgeVariant: "secondary",
    icon: Envelope,
  },
  outbound_delivery_failed: {
    label: "Delivery Failed",
    badgeVariant: "destructive",
    icon: Warning,
  },
  appeal_review_requested: {
    label: "Appeal Review Requested",
    badgeVariant: "secondary",
    icon: Shield,
  },
  appeal_dispatch_pdf_missing_warning: {
    label: "PDF Missing Warning",
    badgeVariant: "destructive",
    icon: Warning,
  },
  payer_contact_resolved: {
    label: "Payer Gateway Discovered",
    badgeVariant: "secondary",
    icon: Globe,
  },
  payer_contact_reverified_for_dispatch: {
    label: "Payer Gateway Verified",
    badgeVariant: "secondary",
    icon: Globe,
  },
  peer_to_peer_defense_generated: {
    label: "P2P Script Generated",
    badgeVariant: "secondary",
    icon: Shield,
  },
  p2p_script_generated: {
    label: "P2P Script Generated",
    badgeVariant: "secondary",
    icon: Shield,
  },
  p2p_live_call_completed: {
    label: "P2P Call Completed",
    badgeVariant: "default",
    icon: Shield,
  },
  statutory_deadline_sweep: {
    label: "Deadline Sweep",
    badgeVariant: "secondary",
    icon: Clock,
  },
  statutory_countdown_started: {
    label: "Statutory Clock Started",
    badgeVariant: "secondary",
    icon: Clock,
  },
  statutory_tier_escalated: {
    label: "Statutory Tier Escalated",
    badgeVariant: "destructive",
    icon: Warning,
  },
  statutory_alarm_critical: {
    label: "Statutory Alarm",
    badgeVariant: "destructive",
    icon: Warning,
  },
  financial_liability_calculated: {
    label: "Liability Calculated",
    badgeVariant: "secondary",
    icon: Medal,
  },
  erisa_penalties_assessed: {
    label: "ERISA Penalty Assessed",
    badgeVariant: "destructive",
    icon: Warning,
  },
  hipaa_redaction_applied: {
    label: "HIPAA Redaction Applied",
    badgeVariant: "secondary",
    icon: Shield,
  },
  hipaa_redaction_waived: {
    label: "HIPAA Redaction Waived",
    badgeVariant: "outline",
    icon: Shield,
  },
  phi_placeholder_healed: {
    label: "PHI Placeholder Healed",
    badgeVariant: "secondary",
    icon: Shield,
  },
  collaborator_invited: {
    label: "Collaborator Invited",
    badgeVariant: "secondary",
    icon: Shield,
  },
  collaborator_accepted: {
    label: "Collaborator Joined",
    badgeVariant: "default",
    icon: Shield,
  },
  collaborator_declined: {
    label: "Collaborator Declined",
    badgeVariant: "outline",
    icon: Shield,
  },
  collaborator_invite_canceled: {
    label: "Invite Canceled",
    badgeVariant: "outline",
    icon: Shield,
  },
  collaborator_role_changed: {
    label: "Role Changed",
    badgeVariant: "secondary",
    icon: Shield,
  },
  collaborator_removed: {
    label: "Collaborator Removed",
    badgeVariant: "destructive",
    icon: Warning,
  },
  collaborator_left: {
    label: "Collaborator Left",
    badgeVariant: "outline",
    icon: Shield,
  },
  case_tombstoned: {
    label: "Case Tombstoned",
    badgeVariant: "destructive",
    icon: Warning,
  },
  case_deleted: {
    label: "Case Purged",
    badgeVariant: "destructive",
    icon: Warning,
  },
  durable_workflow_started: {
    label: "Durable Workflow Started",
    badgeVariant: "secondary",
    icon: Clock,
  },
  durable_workflow_canceled: {
    label: "Workflow Canceled",
    badgeVariant: "destructive",
    icon: Warning,
  },
};

export const AuditTimeline: React.FC<AuditTimelineProps> = ({
  claim,
  logs,
  isLoading = false,
  isDrawer = false,
}) => {
  const [filterType, setFilterType] = useState<string>("all");

  // Reset filter when switching cases
  useEffect(() => {
    setFilterType("all");
  }, [claim?._id]);

  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      if (filterType !== "all" && log.eventType !== filterType) return false;
      return true;
    });
  }, [logs, filterType]);

  // Distinct event types present in the current logs with their counts and labels
  const availableEventOptions = useMemo(() => {
    const counts = new Map<string, number>();
    logs.forEach((log) => {
      if (log.eventType) {
        counts.set(log.eventType, (counts.get(log.eventType) || 0) + 1);
      }
    });

    return Array.from(counts.entries())
      .map(([eventType, count]) => {
        const config = EVENT_CONFIGS[eventType];
        const label = config
          ? config.label
          : eventType.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
        return { eventType, count, label };
      })
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [logs]);

  return (
    <div className="space-y-4 animate-fadeIn">
      {/* Full Page Header Banner (Only shown in standalone page mode, omitted in drawer mode) */}
      {!isDrawer ? (
        <Card className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-xs">
              <Clock className="size-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-foreground font-sans">
                Case Audit Timeline
              </h2>
              <p className="text-xs text-muted-foreground font-mono">
                {claim
                  ? `Statutory event trail for Claim #${claim.claimNumber} (${claim.patient?.name})`
                  : "Live portfolio audit trail across medical appeal claims"}
              </p>
            </div>
          </div>

          {/* Filter Selector */}
          <div className="flex items-center gap-2">
            <Funnel className="size-3.5 text-muted-foreground" />
            <Select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              disabled={logs.length === 0}
              className="h-8 text-xs font-sans"
              aria-label="Filter events by type"
            >
              <option value="all">All Events ({logs.length})</option>
              {availableEventOptions.map(({ eventType, count, label }) => (
                <option key={eventType} value={eventType}>
                  {label} ({count})
                </option>
              ))}
            </Select>
          </div>
        </Card>
      ) : (
        /* Sleek Filter Bar in Drawer Mode */
        <div className="flex items-center justify-between gap-2 pb-1 border-b border-border/50">
          <span className="text-xs font-mono text-muted-foreground">
            {filteredLogs.length} {filteredLogs.length === 1 ? "event" : "events"}
            {filterType !== "all" && " (filtered)"}
          </span>
          <div className="flex items-center gap-2">
            <Funnel className="size-3 text-muted-foreground shrink-0" />
            <Select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              disabled={logs.length === 0}
              className="h-7 text-xs font-sans"
              aria-label="Filter events by type"
            >
              <option value="all">All Events ({logs.length})</option>
              {availableEventOptions.map(({ eventType, count, label }) => (
                <option key={eventType} value={eventType}>
                  {label} ({count})
                </option>
              ))}
            </Select>
          </div>
        </div>
      )}

      {/* Timeline Stream Container */}
      <Card className={isDrawer ? "p-4 border-border/60 bg-card/60" : "p-6"}>
        {isLoading ? (
          <div className="space-y-4 py-3 animate-pulse" aria-busy="true">
            <div className="flex items-center justify-center gap-2 text-xs font-mono text-muted-foreground pb-2">
              <CircleNotch className="size-4 animate-spin text-cyan-400" />
              <span>Loading case audit trail events...</span>
            </div>
            {[1, 2, 3].map((idx) => (
              <div key={idx} className="relative pl-6 space-y-2">
                <div className="absolute left-1.5 top-2 size-2.5 rounded-full bg-border" />
                <div className="rounded-lg border border-border/50 bg-muted/20 p-3 space-y-2">
                  <div className="flex justify-between items-center">
                    <div className="h-4 w-24 bg-muted/60 rounded" />
                    <div className="h-3 w-16 bg-muted/40 rounded" />
                  </div>
                  <div className="h-3.5 w-5/6 bg-muted/50 rounded" />
                  <div className="h-3 w-1/3 bg-muted/30 rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="p-8 text-center space-y-2.5">
            <div className="mx-auto flex size-10 items-center justify-center rounded-full bg-muted/30 border border-border/60 text-muted-foreground">
              <Clock className="size-5" />
            </div>
            <div>
              <p className="text-xs font-semibold text-foreground font-sans">
                {filterType !== "all"
                  ? "No events match this filter"
                  : "No audit events recorded yet"}
              </p>
              <p className="text-[11px] text-muted-foreground font-mono max-w-xs mx-auto pt-1 leading-relaxed">
                {filterType !== "all"
                  ? "Switch to 'All Events' to view the complete case timeline."
                  : claim
                  ? `Statutory audit trail events will appear as actions occur on Claim #${claim.claimNumber}.`
                  : "Audit events will appear as actions occur across claims."}
              </p>
            </div>
          </div>
        ) : (
          <div className="relative pl-6 space-y-4 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-px before:bg-border">
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

                  <Card className="p-3.5 space-y-1.5 bg-card hover:bg-muted/30 transition-colors border-border/60">
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
                        {formatDateTime(log.timestamp)}
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
