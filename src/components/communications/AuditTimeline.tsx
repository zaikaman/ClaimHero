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
  ShieldCheck,
  ShieldWarning,
  LockKey,
  Lightning,
  Copy,
  Check,
  CaretDown,
  CaretUp,
  LinkSimple,
} from "@phosphor-icons/react";
import { AuditLog, Claim, AuditChainVerificationResult } from "../../types";
import { formatDateTime } from "../../lib/utils";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import {
  verifyAuditChainClient,
  truncateHash,
  formatDurationMs,
  GENESIS_HASH,
} from "../../lib/auditCrypto";
import { toast } from "sonner";
import { useSoundEffects } from "../../hooks/useSoundEffects";
import { Card } from "../ui/card";
import { Badge } from "../ui/badge";
import { Select } from "../ui/select";
import { Button } from "../ui/button";

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
  const [verificationResult, setVerificationResult] = useState<AuditChainVerificationResult | null>(null);
  const [isVerifying, setIsVerifying] = useState<boolean>(false);
  const [isSealing, setIsSealing] = useState<boolean>(false);
  const [justVerified, setJustVerified] = useState<boolean>(false);
  const [justResealed, setJustResealed] = useState<boolean>(false);
  const [copiedHash, setCopiedHash] = useState<string | null>(null);
  const [isInspectorOpen, setIsInspectorOpen] = useState<boolean>(false);

  const sealClaimMutation = useMutation(api.auditLogs.sealClaimAuditChain);
  const { playSound } = useSoundEffects();

  // Auto-verify on logs change or claim switch
  useEffect(() => {
    if (!logs || logs.length === 0) {
      setVerificationResult(null);
      return;
    }
    let isMounted = true;
    verifyAuditChainClient(claim?._id || "portfolio", logs).then((res) => {
      if (isMounted) setVerificationResult(res);
    });
    return () => {
      isMounted = false;
    };
  }, [claim?._id, logs]);

  const handleVerifyClick = async () => {
    setIsVerifying(true);
    playSound("tactile_click");
    // Ensure minimum 350ms duration so the user visibly perceives the verification scan
    const minDelay = new Promise((resolve) => setTimeout(resolve, 350));
    try {
      const [res] = await Promise.all([
        verifyAuditChainClient(claim?._id || "portfolio", logs),
        minDelay,
      ]);
      setVerificationResult(res);
      setJustVerified(true);
      setTimeout(() => setJustVerified(false), 2400);

      if (res.isValid && !res.needsReseal) {
        playSound("extraction_complete");
        toast.success(
          `Cryptographic Merkle chain verified: ${res.verifiedRecords}/${res.totalRecords} blocks mathematically intact (${formatDurationMs(res.durationMs)})`
        );
      } else if (res.needsReseal || (res.unsealedRecords ?? 0) > 0) {
        toast.warning(
          res.failureReason || `${res.unsealedRecords} unsealed block(s) detected. Click 'Seal Complete Chain' to seal all blocks.`
        );
      } else {
        playSound("deadline_alert");
        toast.error(
          `Integrity alert at Block #${res.brokenBlockNumber ?? 1}: ${res.failureReason || "Hash mismatch"}`
        );
      }
    } catch {
      toast.error("Failed to verify cryptographic chain");
    } finally {
      setIsVerifying(false);
    }
  };

  const handleResealClick = async () => {
    if (!claim?._id) return;
    setIsSealing(true);
    playSound("tactile_click");
    const toastId = toast.loading("Computing deterministic rolling SHA-256 hashes across all blocks...");
    try {
      const res = await sealClaimMutation({ claimId: claim._id as Id<"claims"> });
      setJustResealed(true);
      setTimeout(() => setJustResealed(false), 2400);
      playSound("copilot_citation");
      toast.success(
        `Successfully sealed ${res.totalSealed} blocks into continuous ERISA 29 CFR § 2560.503-1 audit chain`,
        { id: toastId }
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to seal audit chain", { id: toastId });
    } finally {
      setIsSealing(false);
    }
  };

  const handleCopy = (text: string) => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setCopiedHash(text);
      setTimeout(() => setCopiedHash(null), 2000);
    }
  };

  // Reset filter when switching cases
  useEffect(() => {
    setFilterType("all");
  }, [claim?._id]);

  // Compute deterministic sequential chronological block numbers
  const blockNumberMap = useMemo(() => {
    const sorted = [...logs].sort((a, b) => {
      if (a.timestamp !== b.timestamp) return a.timestamp - b.timestamp;
      if (a.sequenceNumber != null && b.sequenceNumber != null && a.sequenceNumber !== b.sequenceNumber) {
        return a.sequenceNumber - b.sequenceNumber;
      }
      const aTime = (a as { _creationTime?: number })._creationTime ?? 0;
      const bTime = (b as { _creationTime?: number })._creationTime ?? 0;
      if (aTime !== bTime) return aTime - bTime;
      return (a._id || "").localeCompare(b._id || "");
    });
    const map = new Map<string, number>();
    sorted.forEach((l, idx) => {
      map.set(l._id, l.sequenceNumber ?? idx + 1);
    });
    return map;
  }, [logs]);

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

      {/* Cryptographic Proof of Case Integrity HUD Card */}
      <Card className={`p-4 transition-all duration-300 shadow-sm space-y-3 ${
        justVerified
          ? "border-emerald-500/60 bg-gradient-to-br from-card via-card to-emerald-950/30 ring-1 ring-emerald-500/30"
          : justResealed
          ? "border-amber-500/60 bg-gradient-to-br from-card via-card to-amber-950/30 ring-1 ring-amber-500/30"
          : "border-cyan-500/30 bg-gradient-to-br from-card via-card to-cyan-950/20"
      }`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start sm:items-center gap-2.5 min-w-0">
            <div
              className={`flex size-8 shrink-0 items-center justify-center rounded-lg border ${
                verificationResult?.isValid && !verificationResult?.needsReseal
                  ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                  : verificationResult?.needsReseal || (verificationResult?.unsealedRecords ?? 0) > 0
                  ? "bg-amber-500/10 border-amber-500/30 text-amber-400"
                  : verificationResult?.tamperDetected
                  ? "bg-rose-500/10 border-rose-500/30 text-rose-400"
                  : "bg-cyan-500/10 border-cyan-500/30 text-cyan-400"
              }`}
            >
              {verificationResult?.isValid && !verificationResult?.needsReseal ? (
                <ShieldCheck className="size-4.5" weight="fill" />
              ) : verificationResult?.needsReseal || (verificationResult?.unsealedRecords ?? 0) > 0 ? (
                <ShieldWarning className="size-4.5" weight="fill" />
              ) : verificationResult?.tamperDetected ? (
                <ShieldWarning className="size-4.5" weight="fill" />
              ) : (
                <LockKey className="size-4.5" weight="bold" />
              )}
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-xs font-bold text-foreground font-sans tracking-wide">
                  Cryptographic Proof of Case Integrity
                </h3>
                {verificationResult?.isValid && !verificationResult?.needsReseal ? (
                  <Badge
                    variant="outline"
                    className="font-mono text-[10px] border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                  >
                    ERISA 29 CFR § 2560.503-1 Verified
                  </Badge>
                ) : verificationResult?.needsReseal || (verificationResult?.unsealedRecords ?? 0) > 0 ? (
                  <Badge
                    variant="outline"
                    className="font-mono text-[10px] border-amber-500/40 bg-amber-500/10 text-amber-300"
                  >
                    Chain Seal Pending ({verificationResult?.sealedRecords ?? 0}/{verificationResult?.totalRecords ?? logs.length} Sealed)
                  </Badge>
                ) : verificationResult?.tamperDetected ? (
                  <Badge variant="destructive" className="font-mono text-[10px]">
                    Tamper Detected
                  </Badge>
                ) : (
                  <Badge
                    variant="outline"
                    className="font-mono text-[10px] border-cyan-500/40 bg-cyan-500/10 text-cyan-300"
                  >
                    ACID Merkle Chain
                  </Badge>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground font-mono truncate">
                {verificationResult?.isValid && !verificationResult?.needsReseal
                  ? `${verificationResult.verifiedRecords} / ${verificationResult.totalRecords} blocks mathematically sealed • Verified in ${formatDurationMs(verificationResult.durationMs)} (< 10ms)`
                  : verificationResult?.needsReseal || (verificationResult?.unsealedRecords ?? 0) > 0
                  ? `${verificationResult?.sealedRecords ?? 0} / ${verificationResult?.totalRecords ?? logs.length} blocks sealed in database (${verificationResult?.unsealedRecords ?? 0} unsealed) • Click 'Seal Complete Chain'`
                  : verificationResult?.tamperDetected
                  ? `Integrity check failed at Block #${verificationResult.brokenBlockNumber ?? 1}`
                  : "Deterministic rolling SHA-256 state seal across all claim mutations"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
            {claim?._id && (verificationResult?.needsReseal || verificationResult?.tamperDetected || (verificationResult?.unsealedRecords ?? 0) > 0 || justResealed) && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleResealClick}
                disabled={isSealing || isVerifying || logs.length === 0}
                className={`h-7.5 px-2.5 text-xs font-sans gap-1.5 transition-all duration-200 cursor-pointer ${
                  justResealed
                    ? "border-emerald-500/60 bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30"
                    : "border-amber-500/30 hover:border-amber-500/60 hover:bg-amber-500/10 text-amber-300"
                }`}
                title="Repair and re-anchor historical records into an unbroken sequential SHA-256 Merkle chain"
              >
                {isSealing ? (
                  <CircleNotch className="size-3.5 animate-spin text-amber-400" />
                ) : justResealed ? (
                  <Check className="size-3.5 text-emerald-400" />
                ) : (
                  <ShieldCheck className="size-3.5 text-amber-400" />
                )}
                <span>{isSealing ? "Sealing Chain..." : justResealed ? "Resealed!" : "Seal Complete Chain"}</span>
              </Button>
            )}

            <Button
              variant="outline"
              size="sm"
              onClick={handleVerifyClick}
              disabled={isVerifying || isSealing || logs.length === 0}
              className={`h-7.5 px-2.5 text-xs font-sans gap-1.5 transition-all duration-200 cursor-pointer ${
                justVerified
                  ? "border-emerald-500/60 bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30"
                  : "border-cyan-500/30 hover:border-cyan-500/60 hover:bg-cyan-500/10 text-cyan-300"
              }`}
              title="Recompute rolling SHA-256 hashes across all blocks to certify case timeline immutability"
            >
              {isVerifying ? (
                <CircleNotch className="size-3.5 animate-spin text-cyan-400" />
              ) : justVerified ? (
                <Check className="size-3.5 text-emerald-400 animate-in zoom-in-50 duration-200" />
              ) : (
                <Lightning className="size-3.5 text-amber-400" weight="fill" />
              )}
              <span>
                {isVerifying ? "Verifying..." : justVerified ? "Chain Verified!" : "Verify Hash Chain"}
              </span>
            </Button>

            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsInspectorOpen(!isInspectorOpen)}
              className="size-7.5 rounded-lg text-muted-foreground hover:text-foreground cursor-pointer"
              title={isInspectorOpen ? "Hide Chain Details" : "Inspect Merkle Chain"}
              aria-label="Inspect Merkle Chain"
            >
              {isInspectorOpen ? (
                <CaretUp className="size-3.5" />
              ) : (
                <CaretDown className="size-3.5" />
              )}
            </Button>
          </div>
        </div>

        {/* Informative Diagnostic Alert Banners */}
        {verificationResult?.tamperDetected && (
          <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs font-mono space-y-1">
            <div className="font-bold flex items-center gap-1.5">
              <ShieldWarning className="size-4 text-rose-400 shrink-0" />
              <span>Cryptographic Verification Alert (ERISA 29 CFR § 2560.503-1)</span>
            </div>
            <p className="text-[11px] text-rose-200/90 font-sans leading-relaxed">
              {verificationResult.failureReason || "A record in the audit trail does not match its cryptographic hash seal, indicating historical modification or backdating."}
            </p>
          </div>
        )}

        {verificationResult?.needsReseal && (
          <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-mono space-y-1">
            <div className="font-bold flex items-center gap-1.5">
              <ShieldWarning className="size-4 text-amber-400 shrink-0" />
              <span>Chain Continuity Notice</span>
            </div>
            <p className="text-[11px] text-amber-200/90 font-sans leading-relaxed">
              {verificationResult.failureReason || "Unsealed legacy records were found prior to this block. Click 'Reseal Chain' to bind all historical blocks into an unbroken rolling SHA-256 Merkle chain."}
            </p>
          </div>
        )}

        {/* Expandable Inspector Tray */}
        {isInspectorOpen && (
          <div className="pt-2.5 mt-1 border-t border-border/50 text-xs font-mono space-y-2.5 animate-in fade-in-50 duration-150">
            <div className="p-2.5 rounded-lg bg-muted/30 border border-border/60 text-[11px] font-sans text-muted-foreground leading-relaxed">
              <strong className="text-foreground">Statutory Immutability Guarantee:</strong> Under ERISA 29 CFR § 2560.503-1, courts reject appeal logs if an insurer or advocate could have backdated or altered them. In Convex ACID mutations, each event computes <code className="text-cyan-300 font-mono text-[10px] bg-cyan-950/40 px-1 py-0.5 rounded">currentHash = sha256(previousHash + eventType + claimId + timestamp + details)</code>. Convex serializability guarantees that every transaction links to the preceding record, delivering indisputable proof of case timeline integrity.
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
              <div className="p-2 rounded-md bg-muted/20 border border-border/40 space-y-1">
                <span className="text-muted-foreground">Genesis Root Hash:</span>
                <p className="text-foreground truncate font-mono text-[10px]">
                  {truncateHash(GENESIS_HASH, 8, 8)}
                </p>
              </div>

              <div className="p-2 rounded-md bg-muted/20 border border-border/40 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Terminal Merkle Hash:</span>
                  {verificationResult?.terminalHash && (
                    <button
                      type="button"
                      onClick={() => handleCopy(verificationResult.terminalHash)}
                      className="text-cyan-400 hover:text-cyan-300 flex items-center gap-1 cursor-pointer"
                      title="Copy full 64-char SHA-256 hash"
                    >
                      {copiedHash === verificationResult.terminalHash ? (
                        <Check className="size-3 text-emerald-400" />
                      ) : (
                        <Copy className="size-3" />
                      )}
                      <span className="text-[10px]">
                        {copiedHash === verificationResult.terminalHash ? "Copied" : "Copy"}
                      </span>
                    </button>
                  )}
                </div>
                <p className="text-cyan-300 truncate font-mono text-[10px]">
                  {verificationResult?.terminalHash
                    ? truncateHash(verificationResult.terminalHash, 8, 8)
                    : "No records sealed yet"}
                </p>
              </div>
            </div>
          </div>
        )}
      </Card>

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
              const blockNumber = log.sequenceNumber ?? blockNumberMap.get(log._id) ?? 1;
              const isBrokenBlock =
                Boolean(verificationResult?.tamperDetected || verificationResult?.needsReseal) &&
                (verificationResult?.brokenLogId === log._id ||
                  verificationResult?.brokenBlockNumber === blockNumber);

              return (
                <div key={log._id} className="relative group">
                  {/* Timeline Dot */}
                  <div className="absolute -left-6 top-1 flex size-5 items-center justify-center rounded-full border border-border bg-card shadow-xs">
                    <IconComponent className="size-2.5 text-foreground" />
                  </div>

                  <Card
                    className={`p-3.5 space-y-2 transition-colors ${
                      isBrokenBlock
                        ? verificationResult?.tamperDetected
                          ? "border-rose-500/60 bg-rose-950/20 shadow-xs ring-1 ring-rose-500/30"
                          : "border-amber-500/60 bg-amber-950/20 shadow-xs ring-1 ring-amber-500/30"
                        : "bg-card hover:bg-muted/30 border-border/60"
                    }`}
                  >
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

                    {/* Cryptographic Hash Seal Footer */}
                    <div className="pt-1.5 flex items-center justify-between gap-2 border-t border-border/40 text-[10px] font-mono text-muted-foreground">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <LinkSimple
                          className={`size-3 shrink-0 ${
                            isBrokenBlock
                              ? verificationResult?.tamperDetected
                                ? "text-rose-400"
                                : "text-amber-400"
                              : !log.hash
                              ? "text-amber-400/80"
                              : "text-cyan-400"
                          }`}
                        />
                        <span
                          className={`font-semibold shrink-0 ${
                            isBrokenBlock
                              ? verificationResult?.tamperDetected
                                ? "text-rose-400"
                                : "text-amber-400"
                              : !log.hash
                              ? "text-amber-400/90"
                              : "text-cyan-400"
                          }`}
                        >
                          Block #{blockNumber}
                        </span>
                        {log.hash ? (
                          <span className="truncate text-foreground/80 font-mono">
                            SHA: {truncateHash(log.hash, 4, 4)}
                          </span>
                        ) : (
                          <span className="text-amber-400/80 italic font-mono text-[10px]">
                            Unsealed Block
                          </span>
                        )}
                      </div>

                      {log.hash && (
                        <button
                          type="button"
                          onClick={() => handleCopy(log.hash!)}
                          className="hover:text-cyan-300 transition-colors shrink-0 flex items-center gap-0.5 cursor-pointer"
                          title={`Copy full hash: ${log.hash}`}
                          aria-label="Copy block hash"
                        >
                          {copiedHash === log.hash ? (
                            <Check className="size-2.5 text-emerald-400" />
                          ) : (
                            <Copy className="size-2.5" />
                          )}
                        </button>
                      )}
                    </div>
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
