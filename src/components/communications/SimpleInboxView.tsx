import React, { useState, useRef, useEffect } from "react";
import {
  PaperPlaneTilt,
  Envelope,
  CheckCircle,
  Clock,
  ArrowLeft,
  Printer,
  SealCheck,
  Buildings,
  FileText,
  WarningCircle,
  ShieldCheck,
  ArrowsClockwise,
  PhoneCall,
  CircleNotch,
  Info,
  Paperclip,
  CaretDown,
  CaretUp,
} from "@phosphor-icons/react";
import { Claim, EmailMessage, Appeal } from "../../types";
import { formatDate, formatCurrency, cn } from "../../lib/utils";
import { SentinelFlowStepper, FlowView } from "../common/SentinelFlowStepper";
import { Card } from "../ui/card";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Input } from "../ui/input";

export type SimpleDispatchMode = "custom_email" | "official_payer";

export interface SimpleInboxViewProps {
  claim: Claim;
  messages: EmailMessage[];
  isLoading?: boolean;
  payerName: string;
  officialEmail?: string;
  customEmail: string;
  setCustomEmail: (email: string) => void;
  dispatchMode: SimpleDispatchMode;
  setDispatchMode: (mode: SimpleDispatchMode) => void;
  effectiveRecipient?: string;
  canDispatch: boolean;
  isDispatching: boolean;
  onRunDispatch: () => Promise<void>;
  hasPriorTransmissions: boolean;
  isReadyForReview: boolean;
  isPatientUnspecified: boolean;
  hasSender: boolean;
  isSenderGatewayConfigured: boolean;
  isCustomEmailLoopback: boolean;
  activeAutoDraft: string;
  isSynthesizing: boolean;
  isSending: boolean;
  onApproveAndSendDraft: () => Promise<void>;
  onDismissDraft: () => Promise<void>;
  replyText: string;
  setReplyText: (text: string) => void;
  onSendReply: (e: React.FormEvent) => void;
  onOpenExportDrawer: () => void;
  onOpenCertificateModal: (messageId?: string) => void;
  onNavigateView?: (view: FlowView) => void;
  onSyncInboxes?: () => Promise<unknown>;
  isSyncingInboxes?: boolean;
  onRunAutonomousPipeline?: () => Promise<unknown>;
  onOpenAuditDrawer?: () => void;
  onAcknowledgeDegradation?: () => Promise<void>;
  isAcknowledging?: boolean;
  isProvisionalDegraded?: boolean;
  effectiveAppeal?: Appeal | null;
}

export const SimpleInboxView: React.FC<SimpleInboxViewProps> = ({
  claim,
  messages,
  isLoading,
  payerName,
  officialEmail,
  customEmail,
  setCustomEmail,
  dispatchMode,
  setDispatchMode,
  effectiveRecipient,
  canDispatch,
  isDispatching,
  onRunDispatch,
  hasPriorTransmissions,
  isReadyForReview,
  isPatientUnspecified,
  hasSender,
  isSenderGatewayConfigured,
  isCustomEmailLoopback,
  activeAutoDraft,
  isSynthesizing,
  isSending,
  onApproveAndSendDraft,
  onDismissDraft,
  replyText,
  setReplyText,
  onSendReply,
  onOpenExportDrawer,
  onOpenCertificateModal,
  onNavigateView,
  onSyncInboxes,
  isSyncingInboxes,
  onRunAutonomousPipeline,
  onOpenAuditDrawer,
  onAcknowledgeDegradation,
  isAcknowledging,
  isProvisionalDegraded = false,
  effectiveAppeal,
}) => {
  const [expandedMessageIds, setExpandedMessageIds] = useState<Set<string>>(new Set());
  const [showOptionsWhenSent, setShowOptionsWhenSent] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const isInitialMountRef = useRef(true);

  useEffect(() => {
    if (isInitialMountRef.current) {
      isInitialMountRef.current = false;
      return;
    }
    if (messages.length > 0) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages.length]);

  const isWon = claim.status === "won";

  const toggleMessageExpand = (id: string) => {
    setExpandedMessageIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  return (
    <div className="space-y-4 animate-fadeIn">
      {/* 3-Step Guided Stepper */}
      <SentinelFlowStepper
        claim={claim}
        currentView="communications"
        onNavigateView={(v) => onNavigateView?.(v)}
        evidencesCount={claim.evidenceCount || 0}
        hasDraftedBrief={
          Boolean(claim.latestAppeal) ||
          claim.status === "ready_for_review" ||
          claim.status === "dispatched" ||
          claim.status === "won"
        }
        isProcessing={isDispatching}
        processingLabel="Dispatching Appeal Packet..."
        onRunAutonomousPipeline={onRunAutonomousPipeline}
        onOpenAuditDrawer={onOpenAuditDrawer}
      />

      {/* Medical Necessity Peer-to-Peer Prompt */}
      {(claim.denialReasonCode === "CO-50" ||
        claim.denialReasonDescription?.toLowerCase().includes("medical necessity") ||
        claim.denialReasonDescription?.toLowerCase().includes("investigational")) && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
          <div className="flex items-center gap-3 min-w-0">
            <div className="size-8 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-center shrink-0">
              <PhoneCall className="size-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-xs text-foreground">
                  Doctor Discussion Opportunity
                </span>
                <Badge variant="outline" className="text-[9px] font-mono border-emerald-500/30 text-emerald-400">
                  {claim.denialReasonCode || "CO-50"}
                </Badge>
              </div>
              <p className="text-[11px] text-muted-foreground leading-tight">
                {payerName} allows your treating physician to hold a brief discussion to overturn this decision.
              </p>
            </div>
          </div>
          <Button
            size="xs"
            variant="outline"
            onClick={() => onNavigateView?.("p2p")}
            className="shrink-0 h-8 px-3 border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10 gap-1.5 text-xs font-semibold cursor-pointer"
          >
            <PhoneCall className="size-3.5" />
            <span>Review Doctor Talking Points</span>
          </Button>
        </div>
      )}

      {/* Evidentiary Integrity Gate (Provisional Review) */}
      {(claim.status === "review_provisional" || claim.evidenceIntegrity?.requiresEvidentiaryAcknowledgement) && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 space-y-3 shadow-2xs">
          <div className="flex items-start gap-3">
            <div className="size-8 rounded-lg bg-amber-500/20 border border-amber-500/40 text-amber-400 flex items-center justify-center shrink-0 mt-0.5">
              <WarningCircle className="size-4" />
            </div>
            <div className="space-y-1 min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-amber-900 dark:text-amber-300 uppercase tracking-wider">
                  Review Required Before Sending
                </span>
                <Badge variant="outline" className="text-[10px] font-mono border-amber-500/40 text-amber-800 dark:text-amber-300">
                  Provisional Draft
                </Badge>
              </div>
              <p className="text-xs text-amber-950 dark:text-amber-200 leading-relaxed">
                {claim.evidenceIntegrity?.degradationWarnings?.[0] ||
                  "The insurer's policy rules could not be verified online. This appeal relies on your legal right to request the documents they used to deny your claim."}
              </p>
              <p className="text-[11px] text-amber-800/80 dark:text-amber-300/70">
                Sending is paused until you confirm this approach.
              </p>
            </div>
          </div>
          <div className="flex items-center justify-end pt-1">
            <Button
              size="sm"
              variant="outline"
              onClick={onAcknowledgeDegradation}
              disabled={isAcknowledging}
              className="text-xs border-amber-500/50 bg-amber-500/20 text-amber-950 dark:text-amber-200 hover:bg-amber-500/30 hover:text-amber-950 dark:hover:text-amber-100 cursor-pointer gap-2"
            >
              {isAcknowledging ? (
                <>
                  <CircleNotch className="size-3.5 animate-spin" />
                  <span>Confirming...</span>
                </>
              ) : (
                <>
                  <CheckCircle className="size-3.5 text-amber-400" />
                  <span>Confirm &amp; Enable Sending</span>
                </>
              )}
            </Button>
          </div>
        </div>
      )}

      {/* Hero Dispatch / Status Card */}
      {!hasPriorTransmissions || showOptionsWhenSent ? (
        <Card className="p-5 border-primary/40 bg-card/70 backdrop-blur-xl shadow-lg space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/60 pb-3">
            <div className="flex items-center gap-3">
              <div className="size-10 rounded-xl bg-primary/15 border border-primary/30 text-primary flex items-center justify-center shrink-0 shadow-xs">
                <PaperPlaneTilt className="size-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-foreground">
                    {hasPriorTransmissions ? "Send Another Copy of Appeal" : "Send Your Appeal"}
                  </h3>
                  <Badge variant="secondary" className="text-[10px] font-medium">
                    {hasPriorTransmissions ? "Follow-Up" : "Final Step"}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Your cited appeal letter and proof documents are ready to transmit to {payerName}.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {onNavigateView && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onNavigateView("studio")}
                  className="h-8 rounded-md text-xs px-2.5 gap-1.5 shrink-0 cursor-pointer"
                  title="Return to Appeal Letter"
                >
                  <ArrowLeft className="size-3.5" />
                  <span>Back to Letter</span>
                </Button>
              )}

              <Button
                size="sm"
                variant="outline"
                onClick={onOpenExportDrawer}
                disabled={!effectiveAppeal}
                className="h-8 rounded-md text-xs px-2.5 gap-1.5 shrink-0 cursor-pointer"
                title="Print or view formatted appeal letter"
              >
                <Printer className="size-3.5" />
                <span>Print Letter</span>
              </Button>

              {hasPriorTransmissions && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setShowOptionsWhenSent(false)}
                  className="h-8 rounded-md text-xs px-2.5 gap-1 text-muted-foreground hover:text-foreground cursor-pointer"
                >
                  <span>Close Options</span>
                </Button>
              )}
            </div>
          </div>

          {/* Recipient Choice Radios */}
          <div className="space-y-2.5">
            <span className="text-[11px] font-semibold text-foreground block">
              Where would you like to send this?
            </span>

            <div
              role="radiogroup"
              aria-label="Appeal delivery destination"
              className="grid grid-cols-1 md:grid-cols-2 gap-2.5"
            >
              {/* Option 1: Official Insurer Reviewer */}
              <div
                role="radio"
                tabIndex={dispatchMode === "official_payer" ? 0 : -1}
                aria-checked={dispatchMode === "official_payer"}
                onClick={() => setDispatchMode("official_payer")}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setDispatchMode("official_payer");
                  } else if (e.key === "ArrowDown" || e.key === "ArrowRight") {
                    e.preventDefault();
                    setDispatchMode("custom_email");
                  }
                }}
                className={cn(
                  "cursor-pointer p-3.5 rounded-xl border text-left transition-all relative flex flex-col justify-between focus:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                  dispatchMode === "official_payer"
                    ? "border-primary bg-primary/10 shadow-xs ring-1 ring-primary/40"
                    : "border-border bg-background/50 hover:bg-muted/40"
                )}
              >
                <div>
                  <div className="flex items-center justify-between gap-1.5 mb-1">
                    <div className="flex items-center gap-2">
                      <Buildings className={cn("size-4", dispatchMode === "official_payer" ? "text-primary" : "text-muted-foreground")} />
                      <span className="text-xs font-semibold text-foreground">Official Carrier Intake</span>
                    </div>
                    <Badge variant="outline" className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400 border-emerald-500/30">
                      Recommended
                    </Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-snug">
                    Transmits directly to {payerName}&apos;s verified appeals department.
                  </p>
                </div>
                <div className="mt-2 pt-2 border-t border-border/50 text-[10px] font-mono text-foreground/80 truncate">
                  {officialEmail || "Verified carrier gateway on file"}
                </div>
              </div>

              {/* Option 2: Test to Personal Email */}
              <div
                role="radio"
                tabIndex={dispatchMode === "custom_email" ? 0 : -1}
                aria-checked={dispatchMode === "custom_email"}
                onClick={() => setDispatchMode("custom_email")}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setDispatchMode("custom_email");
                  } else if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
                    e.preventDefault();
                    setDispatchMode("official_payer");
                  }
                }}
                className={cn(
                  "cursor-pointer p-3.5 rounded-xl border text-left transition-all relative flex flex-col justify-between focus:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                  dispatchMode === "custom_email"
                    ? "border-primary bg-primary/10 shadow-xs ring-1 ring-primary/40"
                    : "border-border bg-background/50 hover:bg-muted/40"
                )}
              >
                <div>
                  <div className="flex items-center justify-between gap-1.5 mb-1">
                    <div className="flex items-center gap-2">
                      <Envelope className={cn("size-4", dispatchMode === "custom_email" ? "text-primary" : "text-muted-foreground")} />
                      <span className="text-xs font-semibold text-foreground">Send Test to My Email</span>
                    </div>
                    <Badge variant="outline" className="text-[10px] font-mono text-cyan-700 dark:text-cyan-400 border-cyan-500/30">
                      Interactive Test
                    </Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-snug">
                    Sends a copy to your inbox first so you can inspect the email and test replying.
                  </p>
                </div>

                {dispatchMode === "custom_email" ? (
                  <div className="mt-2 pt-2 border-t border-border/50" onClick={(e) => e.stopPropagation()}>
                    <Input
                      type="email"
                      aria-label="Your email address"
                      placeholder="Enter your email address"
                      value={customEmail}
                      onChange={(e) => setCustomEmail(e.target.value)}
                      className="h-7 text-[11px] px-2 bg-background font-mono"
                    />
                    {isCustomEmailLoopback && (
                      <p className="mt-1 text-[10px] text-amber-400 font-medium">
                        Please enter your personal email address rather than ClaimHero&apos;s sender box.
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="mt-2 pt-2 border-t border-border/50 text-[10px] font-mono text-muted-foreground truncate">
                    {customEmail || "Enter your personal email address..."}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Review Guard Information */}
          <div className="flex items-start gap-2.5 rounded-lg border border-primary/25 bg-primary/5 p-3 text-xs text-muted-foreground">
            <ShieldCheck className="size-4 text-primary shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold text-foreground text-[11px] block">
                Human Review Gate: You are in full control
              </span>
              <p className="text-[11px] leading-relaxed text-foreground/80 mt-0.5">
                ClaimHero prepares the letters and legal citations, but nothing is ever sent without your explicit approval.
              </p>
            </div>
          </div>

          {isPatientUnspecified && !hasSender && (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-300 flex items-start gap-2.5">
              <Info className="size-4 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold block">Sender Name Required</span>
                <p className="text-[11px] text-amber-200/90 mt-0.5">
                  The original denial did not specify the patient name. Please provide sender information in Step 2 before dispatching.
                </p>
              </div>
            </div>
          )}

          {!isReadyForReview && (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-300 flex items-start gap-2.5">
              <Info className="size-4 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold block">Review Your Draft First</span>
                <p className="text-[11px] text-amber-200/90 mt-0.5">
                  Your case status is {claim.status.replace(/_/g, " ")}. Please review your appeal draft in Step 2 before authorizing dispatch.
                </p>
              </div>
            </div>
          )}

          {/* Send Action Bar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-3 rounded-xl border border-primary/30 bg-primary/10">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="size-8 rounded-lg bg-primary/20 flex items-center justify-center shrink-0 text-primary">
                <PaperPlaneTilt className="size-4" />
              </div>
              <div className="min-w-0">
                <span className="text-xs font-semibold text-foreground block">
                  {dispatchMode === "custom_email" ? "Send Test Copy" : "Send Official Appeal"}
                </span>
                <p className="text-[11px] text-muted-foreground truncate">
                  Recipient: <span className="font-mono text-foreground font-medium">{effectiveRecipient || "No recipient selected"}</span>
                </p>
              </div>
            </div>

            <Button
              size="sm"
              onClick={onRunDispatch}
              disabled={isDispatching || !canDispatch || !effectiveAppeal}
              title={
                !isReadyForReview
                  ? "Please review your appeal draft before sending."
                  : !isSenderGatewayConfigured
                  ? "AgentMail sender address is not configured."
                  : isPatientUnspecified && !hasSender
                  ? "Patient details required before sending."
                  : undefined
              }
              className="gap-2 text-xs bg-primary text-primary-foreground font-semibold shadow-md shrink-0 h-9 px-4 cursor-pointer"
            >
              {isDispatching ? (
                <>
                  <CircleNotch className="size-4 animate-spin" />
                  <span>Sending Appeal Packet...</span>
                </>
              ) : (
                <>
                  <PaperPlaneTilt className="size-4" />
                  <span>
                    {dispatchMode === "custom_email"
                      ? "Approve & Send Test to My Email"
                      : `Approve & Send to ${payerName}`}
                  </span>
                </>
              )}
            </Button>
          </div>
        </Card>
      ) : (
        /* Status Card When Already Dispatched */
        <Card className="p-4 border-border bg-card/70 backdrop-blur-xl space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className={cn(
                "size-10 rounded-xl flex items-center justify-center shrink-0 shadow-xs",
                isWon
                  ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40"
                  : "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
              )}>
                <CheckCircle className="size-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-foreground">
                    {isWon
                      ? `Appeal Overturned & Won — Reversal Confirmed!`
                      : `Appeal Packet Delivered to ${payerName}`}
                  </h3>
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-[10px] font-medium",
                      isWon
                        ? "border-emerald-500/40 text-emerald-400 bg-emerald-500/10"
                        : "border-primary/40 text-primary bg-primary/10"
                    )}
                  >
                    {isWon ? "Resolution Confirmed" : "Under Review"}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {isWon
                    ? `Total recovered: ${formatCurrency(claim.deniedAmount || 0)} with $0 patient balance remaining.`
                    : `Delivered to ${effectiveRecipient}. Most insurers reply within 30 to 60 days.`}
                </p>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="flex items-center gap-2 shrink-0">
              <Button
                size="sm"
                variant="outline"
                onClick={() => onOpenCertificateModal()}
                className="h-8 text-xs px-2.5 gap-1.5 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 cursor-pointer"
                title="View delivery timestamp and proof"
              >
                <SealCheck className="size-3.5" />
                <span>Delivery Proof</span>
              </Button>

              <Button
                size="sm"
                variant="outline"
                onClick={onOpenExportDrawer}
                className="h-8 text-xs px-2.5 gap-1.5 cursor-pointer"
                title="Print or view letter"
              >
                <Printer className="size-3.5" />
                <span>Print Letter</span>
              </Button>

              <Button
                size="sm"
                variant="ghost"
                onClick={() => setShowOptionsWhenSent(true)}
                className="h-8 text-xs px-2.5 text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <span>Send Another Copy</span>
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Suggested Response (Smart Rebuttal) Card */}
      {(activeAutoDraft || isSynthesizing) && !isWon && (
        <Card className="p-4 border-primary/40 bg-primary/5 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="size-7 rounded-lg bg-primary/15 text-primary flex items-center justify-center">
                <ShieldCheck className="size-4" />
              </div>
              <div>
                <span className="text-xs font-semibold text-foreground block">
                  Suggested Response to {payerName}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  Prepared from your clinical records and insurer rules. Requires your approval before sending.
                </span>
              </div>
            </div>
            <Badge variant="outline" className="text-[10px] font-medium border-primary/30 text-primary">
              Approval Required
            </Badge>
          </div>

          {isSynthesizing && !activeAutoDraft ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground p-3 bg-background/80 rounded-lg border border-border">
              <CircleNotch className="size-3.5 animate-spin text-primary shrink-0" />
              <span>Preparing recommended response from the insurer&apos;s latest reply...</span>
            </div>
          ) : (
            <div className="max-h-36 overflow-y-auto rounded-lg bg-background/90 p-3 border border-border text-xs text-foreground/90 leading-relaxed whitespace-pre-wrap select-text">
              {activeAutoDraft}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Button
              size="xs"
              onClick={onApproveAndSendDraft}
              disabled={isSending || !activeAutoDraft.trim() || isSynthesizing || isProvisionalDegraded}
              className="gap-1.5 h-8 px-3 text-xs font-medium cursor-pointer"
            >
              {isSending ? (
                <CircleNotch className="size-3.5 animate-spin" />
              ) : (
                <PaperPlaneTilt className="size-3.5" />
              )}
              <span>Approve &amp; Send Response</span>
            </Button>

            <Button
              size="xs"
              variant="outline"
              onClick={() => setReplyText(activeAutoDraft)}
              disabled={!activeAutoDraft.trim() || isSynthesizing}
              className="gap-1.5 h-8 px-2.5 text-xs font-medium cursor-pointer"
            >
              <FileText className="size-3.5" />
              <span>Edit in Composer</span>
            </Button>

            <Button
              size="xs"
              variant="ghost"
              onClick={onDismissDraft}
              disabled={isSynthesizing}
              className="h-8 px-2 text-xs text-muted-foreground hover:text-rose-400 cursor-pointer"
            >
              <span>Dismiss</span>
            </Button>
          </div>
        </Card>
      )}

      {/* Messages Timeline */}
      <Card className="p-0 overflow-hidden border border-border bg-card/70 backdrop-blur-xl shadow-md">
        {/* Timeline Header */}
        <div className="flex items-center justify-between border-b border-border/80 px-4 py-3 bg-muted/20">
          <div className="flex items-center gap-2">
            <Envelope className="size-4 text-primary" />
            <h3 className="text-xs font-semibold text-foreground">
              Letter &amp; Message History ({messages.length})
            </h3>
          </div>

          <div className="flex items-center gap-2">
            {onSyncInboxes && (
              <Button
                type="button"
                variant="ghost"
                size="xs"
                onClick={() => onSyncInboxes()}
                disabled={isSyncingInboxes}
                className="h-7 px-2 text-[11px] gap-1 text-muted-foreground hover:text-foreground cursor-pointer"
                title="Check for new replies from the insurer"
              >
                <ArrowsClockwise className={cn("size-3", isSyncingInboxes && "animate-spin text-primary")} />
                <span>{isSyncingInboxes ? "Checking..." : "Check for Replies"}</span>
              </Button>
            )}
          </div>
        </div>

        {/* Message Stream */}
        <div className="p-4 space-y-3 max-h-[500px] overflow-y-auto">
          {isLoading ? (
            <div className="p-8 text-center text-xs text-muted-foreground animate-pulse">
              Loading letters and messages...
            </div>
          ) : messages.length === 0 ? (
            <div className="p-8 text-center flex flex-col items-center justify-center space-y-2 text-muted-foreground">
              <Envelope className="size-8 mx-auto text-muted-foreground/60" />
              <div className="text-xs font-medium text-foreground">No messages sent or received yet</div>
              <p className="text-[11px] max-w-sm mx-auto">
                Once you click &quot;Send Appeal&quot; above, a permanent record of the letter, delivery timestamp, and insurer replies will appear here.
              </p>
            </div>
          ) : (
            messages.map((msg) => {
              const isOutbound = msg.direction === "outbound";
              const isOverturned = msg.detectedDetermination === "OVERTURNED_APPROVED";
              const isPartialOffer = msg.detectedDetermination === "PARTIAL_SETTLEMENT_OFFER";
              const isRecordsReq = msg.detectedDetermination === "ADDITIONAL_RECORDS_REQUIRED";
              const isPolicyConflict = msg.detectedDetermination === "POLICY_CONFLICT_CITATION";
              const isDenialUpheld = msg.detectedDetermination === "DENIAL_UPHELD";
              const isExpanded = expandedMessageIds.has(msg._id);

              return (
                <div
                  key={msg._id}
                  className={cn(
                    "rounded-xl border p-4 space-y-2.5 transition-all shadow-2xs",
                    isOutbound
                      ? "border-border/80 bg-muted/20 ml-2"
                      : isOverturned
                      ? "border-emerald-500/40 bg-emerald-500/10 mr-2"
                      : isRecordsReq || isPartialOffer
                      ? "border-amber-500/40 bg-amber-500/5 mr-2"
                      : isDenialUpheld || isPolicyConflict
                      ? "border-rose-500/40 bg-rose-500/5 mr-2"
                      : "border-primary/20 bg-primary/5 mr-2"
                  )}
                >
                  {/* Message Meta Header */}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Badge
                        variant={isOutbound ? "secondary" : "default"}
                        className="text-[10px] font-medium gap-1"
                      >
                        {isOutbound ? (
                          <>
                            <CheckCircle className="size-3 text-emerald-400" />
                            <span>You sent</span>
                          </>
                        ) : (
                          <>
                            <Envelope className="size-3" />
                            <span>{payerName} replied</span>
                          </>
                        )}
                      </Badge>
                      <span className="text-xs font-medium text-foreground">
                        {isOutbound ? `To: ${msg.recipient}` : `From: ${msg.sender}`}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      {/* Determination badge for inbound messages */}
                      {!isOutbound && msg.detectedDetermination && (
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[10px] font-medium gap-1",
                            isOverturned
                              ? "text-emerald-400 border-emerald-500/40 bg-emerald-500/10"
                              : isRecordsReq || isPartialOffer
                              ? "text-amber-400 border-amber-500/40 bg-amber-500/10"
                              : isDenialUpheld || isPolicyConflict
                              ? "text-rose-400 border-rose-500/40 bg-rose-500/10"
                              : "text-muted-foreground border-border"
                          )}
                        >
                          <span>
                            {isOverturned
                              ? "Full Reversal Authorized"
                              : isPartialOffer
                              ? "Settlement Offer Extended"
                              : isRecordsReq
                              ? "More Records Demanded"
                              : isPolicyConflict
                              ? "Policy Rule Cited"
                              : isDenialUpheld
                              ? "Level 1 Decision Upheld"
                              : "Insurer Reply"}
                          </span>
                        </Badge>
                      )}

                      {isOutbound && (
                        <Button
                          variant="outline"
                          size="xs"
                          onClick={() => onOpenCertificateModal(msg._id)}
                          className="h-6 px-2 text-[10px] gap-1 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/10 rounded cursor-pointer"
                          title="View Delivery Evidence"
                        >
                          <SealCheck className="size-3 text-emerald-400" />
                          <span>Delivery Proof</span>
                        </Button>
                      )}

                      <div className="flex items-center gap-1 text-[10px] text-muted-foreground font-mono">
                        <Clock className="size-3" />
                        <span>{formatDate(msg.receivedAt)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Subject */}
                  <div className="text-xs font-semibold text-foreground">
                    Subject: {msg.subject}
                  </div>

                  {/* Plain Language Clinical Interpretation */}
                  {!isOutbound && msg.clinicalRationale && (
                    <div className="p-2.5 rounded-lg bg-background/70 border border-border/70 text-xs text-muted-foreground flex items-start gap-2">
                      <Info className="size-3.5 text-primary shrink-0 mt-0.5" />
                      <div>
                        <span className="font-semibold text-foreground text-[11px] block">
                          What this means:
                        </span>
                        <p className="text-[11px] leading-relaxed text-foreground/85 mt-0.5">
                          {msg.clinicalRationale}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Demanded Records List */}
                  {!isOutbound && msg.missingRecordsRequested && msg.missingRecordsRequested.length > 0 && (
                    <div className="space-y-1">
                      <span className="text-[11px] font-semibold text-amber-300 block">
                        Records Demanded by Insurer:
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {msg.missingRecordsRequested.map((rec, i) => (
                          <Badge
                            key={i}
                            variant="secondary"
                            className="text-[10px] border border-amber-500/30 text-amber-300 bg-amber-500/10"
                          >
                            {rec}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Message Body (Collapsible if long) */}
                  <div className="space-y-1.5">
                    <div className={cn(
                      "rounded-lg bg-background/80 border border-border/80 p-3 text-xs text-foreground/90 leading-relaxed whitespace-pre-line transition-all",
                      !isExpanded && "max-h-24 overflow-hidden relative"
                    )}>
                      {msg.bodyText}
                      {!isExpanded && (msg.bodyText || "").length > 200 && (
                        <div className="absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-background to-transparent" />
                      )}
                    </div>

                    {(msg.bodyText || "").length > 200 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="xs"
                        onClick={() => toggleMessageExpand(msg._id)}
                        className="h-6 px-2 text-[11px] text-muted-foreground hover:text-foreground gap-1 cursor-pointer"
                      >
                        {isExpanded ? (
                          <>
                            <CaretUp className="size-3" />
                            <span>Show less</span>
                          </>
                        ) : (
                          <>
                            <CaretDown className="size-3" />
                            <span>Read full message</span>
                          </>
                        )}
                      </Button>
                    )}
                  </div>

                  {/* Attachments */}
                  {msg.hasAttachments && (
                    <div className="pt-1">
                      {msg.attachments && msg.attachments.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {msg.attachments.map((att, idx) => (
                            <div
                              key={att.storageId || idx}
                              className="flex items-center gap-2 rounded-md border border-border/80 bg-muted/40 px-2.5 py-1 text-xs text-foreground/90"
                            >
                              <FileText className="size-3.5 text-primary shrink-0" />
                              <span className="font-medium truncate max-w-[200px]" title={att.filename}>
                                {att.filename}
                              </span>
                              {att.url && (
                                <a
                                  href={att.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-primary hover:underline text-[11px] ml-1"
                                >
                                  View
                                </a>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                          <Paperclip className="size-3" />
                          <span>Attached: Cited Appeal Letter &amp; Clinical Evidence Exhibits</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Quick Message Composer */}
        <div className="border-t border-border/80 p-3 bg-muted/20">
          <form onSubmit={onSendReply} className="flex items-center gap-2">
            <Input
              type="text"
              aria-label={`Send a note or follow-up to ${effectiveRecipient || payerName}`}
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              placeholder={`Send a note or follow-up to ${effectiveRecipient || payerName}...`}
              className="flex-1 bg-background text-xs h-9"
              disabled={isSending}
            />
            <Button
              type="submit"
              size="sm"
              disabled={isSending || !replyText.trim()}
              className="gap-1.5 h-9 px-3.5 text-xs shrink-0 cursor-pointer"
            >
              {isSending ? (
                <CircleNotch className="size-3.5 animate-spin" />
              ) : (
                <PaperPlaneTilt className="size-3.5" />
              )}
              <span>Send</span>
            </Button>
          </form>
        </div>
      </Card>
    </div>
  );
};
