import React, { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import {
  Envelope,
  PaperPlaneTilt,
  Tray,
  ArrowUpRight,
  ArrowDownLeft,
  CheckCircle,
  Clock,
  Copy,
  Check,
  Buildings,
  Paperclip,
  CircleNotch,
  ArrowSquareOut,
  Printer,
  Info,
  Robot,
  ArrowsClockwise,
  ShieldCheck,
  FileText,
  WarningCircle,
} from "@phosphor-icons/react";
import { Claim, EmailMessage, EmailThread, Appeal } from "../../types";
import { formatDate, cn } from "../../lib/utils";
import { getPayerAppellateContact } from "../../lib/constants";
import { isAiAdjudicatorAddress } from "../../../convex/lib/aiAdjudicator";
import { SentinelFlowStepper, FlowView } from "../common/SentinelFlowStepper";
import { Card } from "../ui/card";
import { Badge } from "../ui/badge";
import { Button, buttonVariants } from "../ui/button";
import { Input } from "../ui/input";
import { ExportDrawer } from "../studio/ExportDrawer";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../ui/tooltip";

type DispatchMode = "ai_adjudicator" | "custom_email" | "official_payer";

interface AgentMailDrawerProps {
  claim: Claim;
  threads: EmailThread[];
  messages: EmailMessage[];
  isLoading?: boolean;
  onSendMessage: (text: string) => Promise<unknown>;
  onDispatchAppeal?: (recipientEmail?: string, dispatchMode?: string) => Promise<unknown>;
  onNavigateView?: (view: FlowView) => void;
  onRunAutonomousPipeline?: (claimId?: string) => Promise<unknown>;
  onSyncInboxes?: () => Promise<unknown>;
  isSyncingInboxes?: boolean;
}

export const AgentMailDrawer: React.FC<AgentMailDrawerProps> = ({
  claim,
  threads,
  messages,
  isLoading,
  onSendMessage,
  onDispatchAppeal,
  onNavigateView,
  onRunAutonomousPipeline,
  onSyncInboxes,
  isSyncingInboxes,
}) => {
  const [copiedEmail, setCopiedEmail] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isDispatching, setIsDispatching] = useState(false);
  const [dispatchMode, setDispatchMode] = useState<DispatchMode>("ai_adjudicator");
  const [customEmail, setCustomEmail] = useState<string>("");

  const [copiedRecipientEmail, setCopiedRecipientEmail] = useState(false);
  const [copiedBrief, setCopiedBrief] = useState(false);
  const [copiedFax, setCopiedFax] = useState(false);
  const [copiedPoBox, setCopiedPoBox] = useState(false);
  const [isExportDrawerOpen, setIsExportDrawerOpen] = useState(false);

  // Auto-Pilot & Smart Rebuttal State
  const setAutoPilotMutation = useMutation(api.emails.setClaimAutoPilot);
  const generateDraftAction = useAction(api.actions.mailDispatcher.generateAutoReplyDraft);
  const [autoPilotEnabled, setAutoPilotEnabled] = useState<boolean>(
    claim.autoPilotEnabled !== false
  );
  const [isTogglingAutoPilot, setIsTogglingAutoPilot] = useState(false);
  const [isGeneratingDraft, setIsGeneratingDraft] = useState(false);
  const [activeAutoDraft, setActiveAutoDraft] = useState<string>("");
  const [trackedInboundId, setTrackedInboundId] = useState<string | null>(null);
  const evaluatingMessageIdRef = useRef<string | null>(null);

  // Identify latest message in thread and latest inbound message
  const lastMessage = messages.length > 0 ? messages[messages.length - 1] : null;
  const isAwaitingPayer = lastMessage?.direction === "outbound";
  const latestInbound = [...messages].reverse().find((m) => m.direction === "inbound");

  // Reset state when switching between claims
  useEffect(() => {
    setActiveAutoDraft("");
    setTrackedInboundId(null);
    evaluatingMessageIdRef.current = null;
  }, [claim._id]);

  // Synchronize and auto-evaluate autonomous draft whenever messages update or new reply arrives
  useEffect(() => {
    // If case is won or last message in thread was outbound (already replied to payer), do not show active draft
    if (claim.status === "won" || isAwaitingPayer) {
      if (activeAutoDraft) {
        setActiveAutoDraft("");
      }
      return;
    }

    if (!latestInbound) {
      if (activeAutoDraft) {
        setActiveAutoDraft("");
      }
      return;
    }

    const currentInboundId = latestInbound._id;

    // A new inbound reply arrived or initial load of message
    if (currentInboundId !== trackedInboundId) {
      setTrackedInboundId(currentInboundId);

      if (latestInbound.autoReplyDraft) {
        setActiveAutoDraft(latestInbound.autoReplyDraft);
      } else if (
        latestInbound.detectedDetermination !== "OVERTURNED_APPROVED" &&
        evaluatingMessageIdRef.current !== currentInboundId
      ) {
        // Auto-evaluate / synthesize smart rebuttal addendum for this newly arrived inbound reply
        evaluatingMessageIdRef.current = currentInboundId;
        setIsGeneratingDraft(true);
        generateDraftAction({
          claimId: claim._id as Id<"claims">,
          inboundMessageId: currentInboundId as Id<"emailMessages">,
          customPayerInquiry: latestInbound.bodyText,
        })
          .then((res) => {
            if (res?.draftText) {
              setActiveAutoDraft(res.draftText);
            }
          })
          .catch((err) => {
            console.warn("Failed to auto-evaluate inbound message draft:", err);
          })
          .finally(() => {
            setIsGeneratingDraft(false);
          });
      } else {
        setActiveAutoDraft("");
      }
    } else {
      // Same inbound message, but autoReplyDraft was updated reactively by backend
      if (latestInbound.autoReplyDraft && latestInbound.autoReplyDraft !== activeAutoDraft) {
        setActiveAutoDraft(latestInbound.autoReplyDraft);
      }
    }
  }, [
    latestInbound?._id,
    latestInbound?.autoReplyDraft,
    latestInbound?.detectedDetermination,
    latestInbound?.bodyText,
    claim.status,
    claim._id,
    isAwaitingPayer,
    trackedInboundId,
    activeAutoDraft,
    generateDraftAction,
  ]);

  const handleToggleAutoPilot = async () => {
    if (isTogglingAutoPilot || !claim._id) return;
    setIsTogglingAutoPilot(true);
    try {
      const nextState = !autoPilotEnabled;
      await setAutoPilotMutation({
        claimId: claim._id as Id<"claims">,
        enabled: nextState,
      });
      setAutoPilotEnabled(nextState);
    } finally {
      setIsTogglingAutoPilot(false);
    }
  };

  const handleGenerateSmartDraft = async (customPrompt?: string) => {
    if (isGeneratingDraft || !claim._id || !latestInbound) return;
    setIsGeneratingDraft(true);
    try {
      const res = await generateDraftAction({
        claimId: claim._id as Id<"claims">,
        inboundMessageId: latestInbound._id as Id<"emailMessages">,
        customPayerInquiry: customPrompt || latestInbound.bodyText,
      });
      if (res?.draftText) {
        setActiveAutoDraft(res.draftText);
      }
    } finally {
      setIsGeneratingDraft(false);
    }
  };

  const handleApproveAndSendDraft = async () => {
    if (!activeAutoDraft.trim() || isSending) return;
    setIsSending(true);
    try {
      await onSendMessage(activeAutoDraft);
      setActiveAutoDraft("");
      setReplyText("");
    } finally {
      setIsSending(false);
    }
  };

  const assignedEmail =
    claim.agentMailInboxEmail ||
    claim.assignedAgentEmail ||
    import.meta.env.VITE_AGENTMAIL_SENDER_EMAIL ||
    "";

  const appealFromDb = useQuery(
    api.appeals.getLatestByClaim,
    claim?._id ? { claimId: claim._id as Id<"claims"> } : "skip"
  ) as Appeal | null | undefined;
  const effectiveAppeal: Appeal | null = (claim.latestAppeal || appealFromDb || null) as Appeal | null;

  const payerName = claim.patient?.insurancePayer || "Health Insurer";
  const defaultPayerContact = getPayerAppellateContact(payerName);
  const payerContact = claim.payerContact || defaultPayerContact;
  const officialEmail = claim.payerContact?.officialAppealsEmail || payerContact.officialAppealsEmail;
  const aiAdjudicatorEmail =
    claim.agentMailAdjudicatorEmail ||
    import.meta.env.VITE_AGENTMAIL_ADJUDICATOR_EMAIL ||
    "";

  const effectiveRecipient =
    dispatchMode === "ai_adjudicator"
      ? aiAdjudicatorEmail
      : dispatchMode === "custom_email"
      ? customEmail.trim()
      : officialEmail;

  const recipientEmail =
    threads[0]?.payerEmail ||
    effectiveRecipient;
  const isAiAdjudicatorThread = isAiAdjudicatorAddress(recipientEmail);

  const canDispatch =
    dispatchMode === "ai_adjudicator"
      ? Boolean(aiAdjudicatorEmail)
      : dispatchMode === "custom_email"
      ? Boolean(customEmail.trim() && customEmail.includes("@"))
      : Boolean(officialEmail);

  const handleCopyEmail = () => {
    if (!assignedEmail) return;
    navigator.clipboard.writeText(assignedEmail);
    setCopiedEmail(true);
    setTimeout(() => setCopiedEmail(false), 2000);
  };

  const handleCopyBrief = () => {
    const briefText = effectiveAppeal?.fullAppealMarkdown;
    if (!briefText) return;
    navigator.clipboard.writeText(briefText);
    setCopiedBrief(true);
    setTimeout(() => setCopiedBrief(false), 2000);
  };

  const handleCopyFax = () => {
    const fax = payerContact.appealsFax;
    if (!fax) return;
    navigator.clipboard.writeText(fax);
    setCopiedFax(true);
    setTimeout(() => setCopiedFax(false), 2000);
  };

  const handleCopyPoBox = () => {
    const pobox = payerContact.statutoryPoBox;
    if (!pobox) return;
    navigator.clipboard.writeText(pobox);
    setCopiedPoBox(true);
    setTimeout(() => setCopiedPoBox(false), 2000);
  };

  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyText.trim() || isSending) return;

    setIsSending(true);
    try {
      await onSendMessage(replyText);
      setReplyText("");
      setActiveAutoDraft("");
    } finally {
      setIsSending(false);
    }
  };

  const handleRunDispatch = async () => {
    if (!onDispatchAppeal || isDispatching || !canDispatch) return;
    setIsDispatching(true);
    try {
      await onDispatchAppeal(effectiveRecipient, dispatchMode);
    } finally {
      setIsDispatching(false);
    }
  };

  return (
    <div className="space-y-4 animate-fadeIn pb-12">
      {/* 3-Step Guided Sentinel Stepper */}
      <SentinelFlowStepper
        claim={claim}
        currentView="communications"
        onNavigateView={(v) => {
          if (onNavigateView) onNavigateView(v);
        }}
        evidencesCount={claim.evidenceCount || 0}
        hasDraftedBrief={
          Boolean(claim.latestAppeal) ||
          claim.status === "ready_for_review" ||
          claim.status === "dispatched" ||
          claim.status === "won"
        }
        isProcessing={isDispatching}
        processingLabel="Dispatching Appeal Packet..."
        onRunAutonomousPipeline={
          onRunAutonomousPipeline ? () => onRunAutonomousPipeline(claim._id) : undefined
        }
      />

      {/* Prominent Multi-Channel Transmission Gateway Banner if not yet sent */}
      {claim.status !== "dispatched" && claim.status !== "won" && onDispatchAppeal && (
        <Card className="p-4 border-primary/40 bg-primary/5 space-y-4">
          {/* Card Header: Title & Description on Left, Companion Utility Tools on Right */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/60 pb-3">
            <div className="flex items-center gap-3">
              <div className="size-9 rounded-xl bg-primary text-primary-foreground flex items-center justify-center shrink-0 shadow-xs">
                <PaperPlaneTilt className="size-4.5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-foreground">
                    Multi-Channel Appellate Transmission
                  </h3>
                  <Badge variant="secondary" className="text-[10px] font-mono">
                    Final Step
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  Transmit court-ready ERISA memorandum & clinical evidence packet directly to {payerName}.
                </p>
              </div>
            </div>

            {/* Companion Utility Tools - Single line group of rectangular buttons */}
            <div className="flex items-center gap-2 shrink-0">
              {payerContact.intakePortalUrl && (
                <a
                  href={payerContact.intakePortalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn(
                    buttonVariants({ variant: "outline", size: "sm" }),
                    "h-8 rounded-md text-xs px-2.5 gap-1.5 shrink-0"
                  )}
                >
                  <ArrowSquareOut className="size-3.5 text-primary shrink-0" />
                  <span>Open Portal</span>
                </a>
              )}

              <Button
                size="sm"
                variant="outline"
                onClick={handleCopyBrief}
                disabled={!effectiveAppeal}
                className="h-8 rounded-md text-xs px-2.5 gap-1.5 shrink-0"
              >
                {copiedBrief ? (
                  <Check className="size-3.5 text-emerald-500" />
                ) : (
                  <Copy className="size-3.5" />
                )}
                <span>{copiedBrief ? "Brief Copied!" : "Copy Brief for Portal"}</span>
              </Button>

              <Button
                size="sm"
                variant="outline"
                onClick={() => setIsExportDrawerOpen(true)}
                disabled={!effectiveAppeal}
                title={effectiveAppeal ? "Open formal court-ready appeal dossier & print docket" : "Synthesize appeal brief in studio first"}
                className="h-8 rounded-md text-xs px-2.5 gap-1.5 shrink-0"
              >
                <Printer className="size-3.5" />
                <span>Print Docket</span>
              </Button>
            </div>
          </div>

          {/* Interactive Appellate Recipient Destination Mode Selector */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-foreground block font-mono uppercase tracking-wider">
                Select Appellate Recipient Destination:
              </span>
              <span className="text-[10px] text-muted-foreground">
                Choose how you want to test and verify transmission
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
              {/* Mode 1: AI Adjudicator */}
              <div
                onClick={() => setDispatchMode("ai_adjudicator")}
                className={cn(
                  "cursor-pointer p-3 rounded-lg border text-left transition-all relative flex flex-col justify-between",
                  dispatchMode === "ai_adjudicator"
                    ? "border-primary bg-primary/10 shadow-xs ring-1 ring-primary/40"
                    : "border-border bg-background/50 hover:bg-muted/40"
                )}
              >
                <div>
                  <div className="flex items-center justify-between gap-1.5 mb-1.5">
                    <div className="flex items-center gap-1.5">
                      <Robot className={cn("size-4", dispatchMode === "ai_adjudicator" ? "text-primary" : "text-muted-foreground")} />
                      <span className="text-xs font-semibold text-foreground">AI Payer Adjudicator</span>
                    </div>
                    <Badge variant="outline" className="text-[9px] font-mono text-emerald-600 dark:text-emerald-400 border-emerald-500/30">
                      2-Way Review
                    </Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-snug">
                    Autonomous medical review agent reviews CPB criteria and responds with formal determination letter.
                  </p>
                </div>
                <div className="mt-2.5 pt-2 border-t border-border/50 text-[10px] font-mono text-primary/90 truncate">
                  {aiAdjudicatorEmail || "AI Adjudicator mailbox"}
                </div>
              </div>

              {/* Mode 2: Custom Judge Email */}
              <div
                onClick={() => setDispatchMode("custom_email")}
                className={cn(
                  "cursor-pointer p-3 rounded-lg border text-left transition-all relative flex flex-col justify-between",
                  dispatchMode === "custom_email"
                    ? "border-primary bg-primary/10 shadow-xs ring-1 ring-primary/40"
                    : "border-border bg-background/50 hover:bg-muted/40"
                )}
              >
                <div>
                  <div className="flex items-center justify-between gap-1.5 mb-1.5">
                    <div className="flex items-center gap-1.5">
                      <Envelope className={cn("size-4", dispatchMode === "custom_email" ? "text-primary" : "text-muted-foreground")} />
                      <span className="text-xs font-semibold text-foreground">Interactive Test (My Email)</span>
                    </div>
                    <Badge variant="outline" className="text-[9px] font-mono text-cyan-600 dark:text-cyan-400 border-cyan-500/30">
                      Personal Inbox
                    </Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-snug">
                    Delivers complete brief to your mail client. Reply to trigger the live webhook.
                  </p>
                </div>
                {dispatchMode === "custom_email" ? (
                  <div className="mt-2.5 pt-2 border-t border-border/50" onClick={(e) => e.stopPropagation()}>
                    <Input
                      type="email"
                      placeholder="Enter your email (e.g. judge@gmail.com)"
                      value={customEmail}
                      onChange={(e) => setCustomEmail(e.target.value)}
                      className="h-7 text-[11px] px-2 bg-background font-mono"
                    />
                  </div>
                ) : (
                  <div className="mt-2.5 pt-2 border-t border-border/50 text-[10px] font-mono text-muted-foreground truncate">
                    {customEmail || "Enter custom email address..."}
                  </div>
                )}
              </div>

              {/* Mode 3: Official Insurer */}
              <div
                onClick={() => setDispatchMode("official_payer")}
                className={cn(
                  "cursor-pointer p-3 rounded-lg border text-left transition-all relative flex flex-col justify-between",
                  dispatchMode === "official_payer"
                    ? "border-primary bg-primary/10 shadow-xs ring-1 ring-primary/40"
                    : "border-border bg-background/50 hover:bg-muted/40"
                )}
              >
                <div>
                  <div className="flex items-center justify-between gap-1.5 mb-1.5">
                    <div className="flex items-center gap-1.5">
                      <Buildings className={cn("size-4", dispatchMode === "official_payer" ? "text-primary" : "text-muted-foreground")} />
                      <span className="text-xs font-semibold text-foreground">Official Insurer Gateway</span>
                    </div>
                    <Badge variant="outline" className="text-[9px] font-mono text-slate-400 border-slate-700">
                      Production
                    </Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-snug">
                    Dispatches directly to {payerName}'s verified public grievance and appeals intake address.
                  </p>
                </div>
                <div className="mt-2.5 pt-2 border-t border-border/50 text-[10px] font-mono text-foreground/80 truncate">
                  {officialEmail || "Appellate Fax / Portal required"}
                </div>
              </div>
            </div>
          </div>

          {/* Dedicated Transmission Launchpad Action Bar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-3 rounded-xl border border-primary/30 bg-primary/10">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="size-8 rounded-lg bg-primary/20 flex items-center justify-center shrink-0 text-primary">
                <PaperPlaneTilt className="size-4" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-foreground">
                    Ready for Appellate Dispatch
                  </span>
                  <Badge variant="outline" className="text-[10px] font-mono border-primary/30 text-primary">
                    {dispatchMode === "ai_adjudicator"
                      ? "AI Simulation Mode"
                      : dispatchMode === "custom_email"
                      ? "Test Delivery Mode"
                      : "Official Insurer Mode"}
                  </Badge>
                </div>
                <p className="text-[11px] text-muted-foreground truncate">
                  Recipient: <span className="font-mono text-foreground font-medium">{effectiveRecipient || "No recipient specified"}</span>
                </p>
              </div>
            </div>

            <Button
              size="sm"
              onClick={handleRunDispatch}
              disabled={isDispatching || !canDispatch || !effectiveAppeal}
              className="gap-2 text-xs bg-primary text-primary-foreground font-semibold shadow-md shrink-0 h-9 px-4"
            >
              {isDispatching ? (
                <>
                  <CircleNotch className="size-4 animate-spin" />
                  <span>Transmitting Appeal Packet...</span>
                </>
              ) : (
                <>
                  <PaperPlaneTilt className="size-4" />
                  <span>
                    {dispatchMode === "ai_adjudicator"
                      ? "Transmit to AI Payer Reviewer"
                      : dispatchMode === "custom_email"
                      ? "Transmit to My Email Address"
                      : "Transmit to Official Gateway"}
                  </span>
                </>
              )}
            </Button>
          </div>

          {/* Submission Instructions & Insurer Gateway Notice */}
          <div className="flex items-start gap-2.5 bg-background/70 border border-border/80 rounded-lg p-2.5 text-xs text-muted-foreground">
            <Info className="size-4 text-primary shrink-0 mt-0.5" />
            <div className="space-y-1">
              <span className="font-semibold text-foreground text-[11px] block">
                Appellate Submission Guidelines for {payerName}:
              </span>
              <p className="text-[11px] leading-relaxed text-foreground/80">
                {payerContact.submissionPolicyNote ||
                  "Most health insurers require appeals via Online Provider Portal, Certified Appellate Fax, or Certified USPS Mail. Use your dedicated Case Inbox as your Authorized Representative electronic contact on the portal to receive electronic determinations."}
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* Inbox Header Card */}
      <Card className="p-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-muted text-foreground">
              <Envelope className="size-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold text-foreground font-sans">
                  Payer Communications Inbox
                </h2>
                <Badge variant="outline" className="font-mono text-[10px]">
                  Claim #{claim.claimNumber}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                Autonomous two-way dedicated transmission channel
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Auto-Pilot Sentinel Interactive Badge Button with 1-Hour SLA Tooltip */}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={handleToggleAutoPilot}
                    disabled={isTogglingAutoPilot}
                    className={cn(
                      "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border transition-all cursor-pointer select-none",
                      autoPilotEnabled
                        ? "bg-primary/15 text-primary border-primary/30 hover:bg-primary/25"
                        : "bg-muted/40 text-muted-foreground border-border hover:bg-muted/70 hover:text-foreground"
                    )}
                  >
                    <span
                      className={cn(
                        "size-1.5 rounded-full shrink-0",
                        autoPilotEnabled
                          ? "bg-primary shadow-[0_0_6px_rgba(14,165,233,0.8)] animate-pulse"
                          : "bg-muted-foreground/40"
                      )}
                    />
                    <span>Auto-Pilot: {autoPilotEnabled ? "ON" : "OFF"}</span>
                    <Info className="size-3 opacity-60 hover:opacity-100 transition-opacity ml-0.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" align="end" className="max-w-xs space-y-1">
                  <div className="font-semibold text-foreground">Sentinel Auto-Pilot (1-Hour SLA)</div>
                  <div className="text-[11px] text-muted-foreground leading-relaxed">
                    Monitors inbound payer replies. If you don't manually review or reply within 1 hour, Auto-Pilot autonomously synthesizes and transmits the cited clinical rebuttal.
                  </div>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            {/* Manual Sync Inboxes Button */}
            {onSyncInboxes && (
              <button
                type="button"
                onClick={() => onSyncInboxes()}
                disabled={isSyncingInboxes}
                className={cn(
                  "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border transition-all cursor-pointer select-none",
                  isSyncingInboxes
                    ? "bg-primary/20 text-primary border-primary/40 animate-pulse"
                    : "bg-muted/40 text-muted-foreground border-border hover:bg-muted/70 hover:text-foreground"
                )}
                title="Force refresh inbound replies from AgentMail inboxes"
              >
                <ArrowsClockwise className={cn("size-3", isSyncingInboxes && "animate-spin")} />
                <span>{isSyncingInboxes ? "Syncing..." : "Sync Inbox"}</span>
              </button>
            )}

            {claim.status === "won" ? (
              <Badge variant="secondary" className="gap-1 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1">
                <CheckCircle className="size-3.5 text-emerald-500" />
                <span>Overturned & Won — Reversal Confirmed by Insurer</span>
              </Badge>
            ) : claim.status === "dispatched" ? (
              <Badge variant="secondary" className="gap-1 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 px-2.5 py-1">
                <CheckCircle className="size-3.5" />
                <span>Packet Transmitted to Insurer</span>
              </Badge>
            ) : null}
          </div>
        </div>

        {/* Assigned Email Address Banner */}
        <div className="mt-3 flex flex-col sm:flex-row items-center justify-between gap-2.5 rounded-lg border border-border bg-muted/40 p-2.5 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-muted-foreground">Shared Case Inbox:</span>
            <span className="font-mono font-semibold text-foreground">
              {assignedEmail || "Shared Sender Inbox"}
            </span>
          </div>

          {assignedEmail ? (
            <Button
              variant="ghost"
              size="xs"
              onClick={handleCopyEmail}
              className="gap-1"
            >
              {copiedEmail ? <Check className="size-3 text-emerald-500" /> : <Copy className="size-3" />}
              <span>{copiedEmail ? "Copied" : "Copy Address"}</span>
            </Button>
          ) : null}
        </div>
      </Card>

      {/* Two-Column Communication Feed */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Left Column: Payer Information & Thread Summary (4 Cols) */}
        <div className="lg:col-span-4 space-y-3">
          <Card className="p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-border pb-2.5">
              <div className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <Buildings className="size-4 text-muted-foreground" />
                <span>Recipient Insurer Gateway</span>
              </div>
              <Badge
                variant="outline"
                className={cn(
                  "text-[9px] font-mono",
                  payerContact.isVerified
                    ? "text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
                    : claim.payerContact?.source === "document_ocr"
                    ? "text-cyan-600 dark:text-cyan-400 border-cyan-500/30"
                    : claim.payerContact?.source === "firecrawl_live"
                    ? "text-indigo-600 dark:text-indigo-400 border-indigo-500/30"
                    : "text-amber-600 dark:text-amber-400 border-amber-500/30"
                )}
              >
                {payerContact.isVerified
                  ? "Verified Gateway"
                  : claim.payerContact?.source === "document_ocr"
                  ? "Extracted from Document"
                  : claim.payerContact?.source === "firecrawl_live"
                  ? "Firecrawl Discovered"
                  : "Unresolved Gateway"}
              </Badge>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <span className="text-[10px] font-mono text-muted-foreground block">Payer</span>
                <span className="font-semibold text-foreground">{payerName}</span>
              </div>

              {/* Official Submission Portal */}
              {payerContact.intakePortalUrl ? (
                <div>
                  <span className="text-[10px] font-mono text-muted-foreground block">Appeals & Dispute Portal</span>
                  <a
                    href={payerContact.intakePortalUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 mt-0.5 text-[11px] font-medium text-primary hover:underline"
                  >
                    <span>{payerContact.portalName || "Launch Official Payer Portal"}</span>
                    <ArrowSquareOut className="size-3 shrink-0" />
                  </a>
                </div>
              ) : (
                <div>
                  <span className="text-[10px] font-mono text-muted-foreground block">Online Portal Status</span>
                  <span className="text-[11px] text-muted-foreground italic block mt-0.5">
                    {payerContact.isVerified
                      ? "Not supported by payer (Appellate Fax or Mail required)"
                      : "No public submission portal verified"}
                  </span>
                </div>
              )}

              {/* Official Appellate Fax Line */}
              {payerContact.appealsFax ? (
                <div>
                  <span className="text-[10px] font-mono text-muted-foreground block">Appellate Fax Line</span>
                  <div className="flex items-center justify-between gap-1 mt-0.5">
                    <span className="font-mono text-[11px] text-foreground font-medium">
                      {payerContact.appealsFax}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      onClick={handleCopyFax}
                      title="Copy appellate fax number"
                      className="shrink-0 text-muted-foreground hover:text-foreground"
                    >
                      {copiedFax ? (
                        <Check className="size-3 text-emerald-500" />
                      ) : (
                        <Copy className="size-3" />
                      )}
                    </Button>
                  </div>
                </div>
              ) : (
                <div>
                  <span className="text-[10px] font-mono text-muted-foreground block">Appellate Fax Line</span>
                  <span className="text-[11px] text-muted-foreground italic block mt-0.5">
                    Not specified on record
                  </span>
                </div>
              )}

              {officialEmail ? (
                <div>
                  <span className="text-[10px] font-mono text-muted-foreground block">Electronic Appeals Email</span>
                  <div className="flex items-center justify-between gap-1 mt-0.5">
                    <span className="font-mono text-[11px] text-foreground font-medium break-all">
                      {officialEmail}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      onClick={() => {
                        navigator.clipboard.writeText(officialEmail);
                        setCopiedRecipientEmail(true);
                        setTimeout(() => setCopiedRecipientEmail(false), 2000);
                      }}
                      title="Copy official appeals email"
                      className="shrink-0 text-muted-foreground hover:text-foreground"
                    >
                      {copiedRecipientEmail ? (
                        <Check className="size-3 text-emerald-500" />
                      ) : (
                        <Copy className="size-3" />
                      )}
                    </Button>
                  </div>
                </div>
              ) : (
                <div>
                  <span className="text-[10px] font-mono text-muted-foreground block">Appeals Intake Channel</span>
                  <span className="text-[11px] text-foreground font-medium block mt-0.5">
                    {payerContact.intakePortalUrl
                      ? "Official Online Portal & Appellate Fax"
                      : payerContact.appealsFax
                      ? "Appellate Fax & Certified Mail"
                      : "Certified Mail / Check Denial Notice"}
                  </span>
                  <span className="text-[10px] text-muted-foreground block mt-0.5">
                    Direct email submission not supported or HIPAA restricted by insurer
                  </span>
                </div>
              )}

              {payerContact.statutoryPoBox ? (
                <div>
                  <span className="text-[10px] font-mono text-muted-foreground block">Statutory Appeals P.O. Box</span>
                  <div className="flex items-start justify-between gap-1 mt-0.5">
                    <span className="text-foreground text-[11px] font-mono leading-tight">
                      {payerContact.statutoryPoBox}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      onClick={handleCopyPoBox}
                      title="Copy P.O. Box address"
                      className="shrink-0 text-muted-foreground hover:text-foreground"
                    >
                      {copiedPoBox ? (
                        <Check className="size-3 text-emerald-500" />
                      ) : (
                        <Copy className="size-3" />
                      )}
                    </Button>
                  </div>
                </div>
              ) : (
                <div>
                  <span className="text-[10px] font-mono text-muted-foreground block">Statutory Appeals P.O. Box</span>
                  <span className="text-[11px] text-muted-foreground italic block mt-0.5">
                    Address not specified on record
                  </span>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2 pt-1 border-t border-border/50">
                <div>
                  <span className="text-[10px] font-mono text-muted-foreground block">Electronic Payer ID</span>
                  <span className="font-mono text-[11px] text-foreground font-semibold">
                    {payerContact.ediPayerId || "Not Registered"}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] font-mono text-muted-foreground block">Appeals Helpline</span>
                  <span className="font-mono text-[11px] text-foreground">
                    {payerContact.tollFreeHelpline || "Not Available"}
                  </span>
                </div>
              </div>

              <div className="pt-1 border-t border-border/50">
                <span className="text-[10px] font-mono text-muted-foreground block">Delivery Channel</span>
                <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium text-[11px]">
                  <CheckCircle className="size-3.5" />
                  {claim.status === "won"
                    ? "Overturned / Settlement Authorized"
                    : claim.status === "dispatched"
                    ? "Packet Transmitted & Logged"
                    : recipientEmail
                    ? "Ready for Electronic Dispatch"
                    : payerContact.intakePortalUrl
                    ? "Ready for Portal Submission"
                    : "Ready for Certified Fax / Mail"}
                </span>
              </div>

              {payerContact.submissionPolicyNote && (
                <div className="pt-2 border-t border-border/50">
                  <div className="p-2 rounded bg-muted/40 border border-border/60 text-[10px] text-muted-foreground leading-relaxed">
                    <span className="font-semibold text-foreground block mb-0.5">Payer Policy Notice:</span>
                    {payerContact.submissionPolicyNote}
                  </div>
                </div>
              )}

              <div className="pt-2 border-t border-border/50 space-y-2">
                <div className="flex items-center justify-between text-[10px] font-mono text-muted-foreground">
                  <span>Gateway Source:</span>
                  <span className="text-foreground font-medium">
                    {claim.payerContact?.source === "firecrawl_live"
                      ? "Firecrawl Web Discovery"
                      : claim.payerContact?.source === "document_ocr"
                      ? "Extracted from Document"
                      : payerContact.isVerified
                      ? "Verified Statutory Directory"
                      : "Unresolved / Manual Verification"}
                  </span>
                </div>
              </div>
            </div>
          </Card>
        </div>

        {/* Right Column: Live Message Feed & Reply Composer (8 Cols) */}
        <Card className="lg:col-span-8 flex flex-col p-0 overflow-hidden">
          <div className="flex items-center justify-between border-b border-border px-4 py-2.5 bg-muted/30 shrink-0">
            <div className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <Tray className="size-4 text-muted-foreground" />
              <span>Transmission History ({messages.length})</span>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" size="sm" className="text-[10px] font-mono">
                {autoPilotEnabled ? "Auto-Pilot Active" : "Manual Review Mode"}
              </Badge>
            </div>
          </div>

          {/* Messages Container */}
          <div className="flex-1 p-4 space-y-3 overflow-y-auto max-h-[440px]">
            {isLoading ? (
              <div className="p-8 text-center text-xs font-mono text-muted-foreground animate-pulse">
                Loading communication history...
              </div>
            ) : messages.length === 0 ? (
              <div className="p-8 text-center items-center justify-center space-y-2 text-muted-foreground">
                <Envelope className="size-8 mx-auto text-muted-foreground/60" />
                <div className="text-xs font-medium text-foreground">No transmissions yet</div>
                <p className="text-[11px] max-w-sm mx-auto">
                  {recipientEmail
                    ? "Click 'Transmit Appeal Packet' above to deliver the synthesized ERISA brief to the insurer."
                    : "Payer mandates portal or fax submission. Copy the brief above to paste into their official portal, or print the certified docket."}
                </p>
              </div>
            ) : (
              messages.map((msg) => {
                const isOutbound = msg.direction === "outbound";
                const isOverturned = msg.detectedDetermination === "OVERTURNED_APPROVED";
                const isRecordsReq = msg.detectedDetermination === "ADDITIONAL_RECORDS_REQUIRED";
                const isDenialUpheld = msg.detectedDetermination === "DENIAL_UPHELD";

                return (
                  <div
                    key={msg._id}
                    className={cn(
                      "rounded-xl border p-3.5 space-y-2 transition-all",
                      isOutbound
                        ? "border-border bg-muted/30 ml-4"
                        : isOverturned
                        ? "border-emerald-500/40 bg-emerald-500/10 mr-4 shadow-xs"
                        : isRecordsReq
                        ? "border-amber-500/40 bg-amber-500/5 mr-4"
                        : isDenialUpheld
                        ? "border-rose-500/40 bg-rose-500/5 mr-4"
                        : "border-primary/20 bg-primary/5 mr-4"
                    )}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Badge
                          variant={isOutbound ? "secondary" : "default"}
                          className="font-mono text-[10px] gap-1"
                        >
                          {isOutbound ? (
                            <ArrowUpRight className="size-3" />
                          ) : (
                            <ArrowDownLeft className="size-3" />
                          )}
                          <span>{isOutbound ? "Outbound" : "Inbound"}</span>
                        </Badge>
                        <span className="font-mono text-xs font-semibold text-foreground">
                          {isOutbound ? msg.recipient : msg.sender}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        {/* LLM Determination Badge */}
                        {!isOutbound && msg.detectedDetermination && (
                          <Badge
                            variant="outline"
                            className={cn(
                              "text-[10px] font-mono gap-1",
                              isOverturned
                                ? "text-emerald-600 dark:text-emerald-400 border-emerald-500/40 bg-emerald-500/10"
                                : isRecordsReq
                                ? "text-amber-600 dark:text-amber-400 border-amber-500/40 bg-amber-500/10"
                                : isDenialUpheld
                                ? "text-rose-600 dark:text-rose-400 border-rose-500/40 bg-rose-500/10"
                                : "text-muted-foreground border-border"
                            )}
                          >
                            {isOverturned ? (
                              <CheckCircle className="size-3" />
                            ) : isRecordsReq ? (
                              <WarningCircle className="size-3" />
                            ) : (
                              <ShieldCheck className="size-3" />
                            )}
                            <span>
                              {isOverturned
                                ? "Determination: Overturned / Approved"
                                : isRecordsReq
                                ? "Additional Records Requested"
                                : isDenialUpheld
                                ? "Level 1 Denial Upheld"
                                : "General Response"}
                            </span>
                          </Badge>
                        )}

                        <div className="flex items-center gap-1 text-[10px] font-mono text-muted-foreground">
                          <Clock className="size-3" />
                          <span>{formatDate(msg.receivedAt)}</span>
                        </div>
                      </div>
                    </div>

                    <div className="text-xs font-semibold text-foreground">
                      Subject: {msg.subject}
                    </div>

                    {/* LLM Clinical Rationale Insight */}
                    {!isOutbound && msg.clinicalRationale && (
                      <div className="p-2 rounded bg-background/80 border border-border/60 text-[11px] text-muted-foreground flex items-start gap-2">
                        <Info className="size-3.5 text-primary shrink-0 mt-0.5" />
                        <div className="space-y-1">
                          <span className="font-semibold text-foreground text-[10px] font-mono block uppercase tracking-wider">
                            LLM Clinical Analysis:
                          </span>
                          <p className="leading-snug text-foreground/80">{msg.clinicalRationale}</p>
                        </div>
                      </div>
                    )}

                    {/* Demanded Records Pills */}
                    {!isOutbound && msg.missingRecordsRequested && msg.missingRecordsRequested.length > 0 && (
                      <div className="space-y-1 pt-1">
                        <span className="text-[10px] font-mono text-muted-foreground block">
                          Demanded Clinical Records:
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          {msg.missingRecordsRequested.map((rec, i) => (
                            <Badge
                              key={i}
                              variant="secondary"
                              className="text-[10px] font-mono border border-amber-500/30 text-amber-600 dark:text-amber-400 bg-amber-500/10"
                            >
                              {rec}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="rounded-lg bg-background border border-border p-3 text-xs text-foreground/90 font-mono whitespace-pre-line leading-relaxed">
                      {msg.bodyText}
                    </div>

                    {msg.hasAttachments && (
                      <div className="flex items-center gap-1 text-[11px] font-mono text-muted-foreground pt-0.5">
                        <Paperclip className="size-3" />
                        <span>Attached: ERISA Appeal Packet & Clinical Policy Exhibits (PDF/MD)</span>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Autonomous Clinical Addendum Draft Card */}
          {(activeAutoDraft || isGeneratingDraft) && claim.status !== "won" && !isAwaitingPayer && (
            <div className="p-3 bg-muted/20 border-t border-border space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                  <ShieldCheck className="size-4 text-primary shrink-0" />
                  <span>Autonomous Clinical Addendum</span>
                </div>
                <div className="flex items-center gap-2">
                  {autoPilotEnabled && (
                    <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground font-mono">
                      <Clock className="size-3 text-primary animate-pulse" />
                      <span>Auto-dispatch in 1h if unreviewed</span>
                    </span>
                  )}
                  <Badge variant="outline" className="text-[10px] font-mono border-primary/30 text-primary">
                    Cited Evidence
                  </Badge>
                </div>
              </div>

              {isGeneratingDraft && !activeAutoDraft ? (
                <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground p-3 bg-background/80 rounded-md border border-border">
                  <CircleNotch className="size-3.5 animate-spin text-primary shrink-0" />
                  <span>Synthesizing autonomous clinical rebuttal from latest payer reply...</span>
                </div>
              ) : (
                <div className="max-h-28 overflow-y-auto rounded-md bg-background/90 p-2.5 border border-border text-[11px] font-mono text-foreground/90 leading-relaxed whitespace-pre-wrap select-text">
                  {activeAutoDraft}
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="xs"
                  onClick={handleApproveAndSendDraft}
                  disabled={isSending || !activeAutoDraft.trim() || isGeneratingDraft}
                  className="gap-1.5 h-7 px-3 text-xs font-medium"
                >
                  {isSending ? (
                    <CircleNotch className="size-3.5 animate-spin" />
                  ) : (
                    <PaperPlaneTilt className="size-3.5" />
                  )}
                  <span>Transmit Addendum</span>
                </Button>

                <Button
                  size="xs"
                  variant="outline"
                  onClick={() => setReplyText(activeAutoDraft)}
                  disabled={!activeAutoDraft.trim() || isGeneratingDraft}
                  className="gap-1.5 h-7 px-2.5 text-xs font-medium"
                >
                  <FileText className="size-3.5" />
                  <span>Open in Composer</span>
                </Button>

                <Button
                  size="xs"
                  variant="ghost"
                  onClick={() => handleGenerateSmartDraft()}
                  disabled={isGeneratingDraft}
                  className="gap-1 text-muted-foreground hover:text-foreground h-7 px-2 text-xs"
                >
                  <ArrowsClockwise className={cn("size-3.5", isGeneratingDraft && "animate-spin")} />
                  <span>Regenerate</span>
                </Button>
              </div>
            </div>
          )}

          {/* Reply Composer */}
          <form
            onSubmit={handleSendReply}
            className="p-3 bg-muted/20 border-t border-border space-y-2"
          >
            {isSending && isAiAdjudicatorThread ? (
              <p className="text-[11px] text-muted-foreground font-mono">
                Payer medical director is reviewing your addendum...
              </p>
            ) : null}
            <div className="flex items-center gap-2">
              <Input
                type="text"
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                placeholder={
                  isAiAdjudicatorThread
                    ? "Reply to the AI payer reviewer with addenda or additional records..."
                    : recipientEmail
                    ? "Type addendum or reply to payer..."
                    : "Log addendum note to case docket..."
                }
                className="flex-1 bg-background"
                disabled={isSending}
              />
              <Button
                type="submit"
                size="sm"
                disabled={isSending || !replyText.trim()}
                className="gap-1"
              >
                {isSending ? (
                  <CircleNotch className="size-3.5 animate-spin" />
                ) : (
                  <PaperPlaneTilt className="size-3.5" />
                )}
                <span>{isSending && isAiAdjudicatorThread ? "Reviewing" : "Send"}</span>
              </Button>
            </div>
          </form>
        </Card>
      </div>

      {/* Formal Appeal Dossier Export & Print Modal */}
      <ExportDrawer
        isOpen={isExportDrawerOpen}
        onClose={() => setIsExportDrawerOpen(false)}
        claim={claim}
        appeal={effectiveAppeal}
        markdownContent={effectiveAppeal?.fullAppealMarkdown || ""}
        onProceedToDispatch={() => {
          setIsExportDrawerOpen(false);
        }}
      />
    </div>
  );
};
