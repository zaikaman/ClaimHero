import React, { useState } from "react";
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
} from "@phosphor-icons/react";
import { Claim, EmailMessage, EmailThread } from "../../types";
import { formatDate, cn } from "../../lib/utils";
import { getPayerAppellateContact } from "../../lib/constants";
import { isAiAdjudicatorAddress } from "../../../convex/lib/aiAdjudicator";
import { SentinelFlowStepper, FlowView } from "../common/SentinelFlowStepper";
import { Card } from "../ui/card";
import { Badge } from "../ui/badge";
import { Button, buttonVariants } from "../ui/button";
import { Input } from "../ui/input";
import { ExportDrawer } from "../studio/ExportDrawer";

type DispatchMode = "ai_adjudicator" | "custom_email" | "official_payer";

interface AgentMailDrawerProps {
  claim: Claim;
  threads: EmailThread[];
  messages: EmailMessage[];
  isLoading?: boolean;
  onSendMessage: (text: string) => Promise<any>;
  onDispatchAppeal?: (recipientEmail?: string, dispatchMode?: string) => Promise<any>;
  onNavigateView?: (view: FlowView) => void;
  onRunAutonomousPipeline?: (claimId?: string) => Promise<any>;
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

  const assignedEmail =
    claim.agentMailInboxEmail ||
    claim.assignedAgentEmail ||
    "claimhero-sender@agentmail.to";

  const payerName = claim.patient?.insurancePayer || "Health Insurer";
  const defaultPayerContact = getPayerAppellateContact(payerName);
  const payerContact = claim.payerContact || defaultPayerContact;
  const officialEmail = claim.payerContact?.officialAppealsEmail || payerContact.officialAppealsEmail;
  const aiAdjudicatorEmail =
    claim.agentMailAdjudicatorEmail ||
    "claimhero-adjudicator@agentmail.to";

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
      ? true
      : dispatchMode === "custom_email"
      ? Boolean(customEmail.trim() && customEmail.includes("@"))
      : Boolean(officialEmail);

  const handleCopyEmail = () => {
    navigator.clipboard.writeText(assignedEmail);
    setCopiedEmail(true);
    setTimeout(() => setCopiedEmail(false), 2000);
  };

  const handleCopyBrief = () => {
    const briefText = claim.latestAppeal?.fullAppealMarkdown;
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
                disabled={!claim.latestAppeal}
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
                disabled={!claim.latestAppeal}
                title={claim.latestAppeal ? "Open formal court-ready appeal dossier & print docket" : "Synthesize appeal brief in studio first"}
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
                  {aiAdjudicatorEmail}
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
              disabled={isDispatching || !canDispatch || !claim.latestAppeal}
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

          <div className="flex items-center gap-2">
            {claim.status === "dispatched" || claim.status === "won" ? (
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
            <span className="font-mono font-semibold text-foreground">{assignedEmail}</span>
            {claim.agentMailProvisioningStatus !== "shared" && claim.agentMailProvisioningStatus !== "provisioned" ? (
              <Badge variant="outline" className="text-[9px] text-amber-600 dark:text-amber-400 border-amber-500/30">
                {claim.agentMailProvisioningStatus === "failed" ? "Provisioning failed" : "Provisioning"}
              </Badge>
            ) : null}
          </div>

          <Button
            variant="ghost"
            size="xs"
            onClick={handleCopyEmail}
            className="gap-1"
          >
            {copiedEmail ? <Check className="size-3 text-emerald-500" /> : <Copy className="size-3" />}
            <span>{copiedEmail ? "Copied" : "Copy Address"}</span>
          </Button>
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
                  {claim.status === "dispatched" || claim.status === "won"
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
            <Badge variant="outline" size="sm" className="text-[10px]">
              Intake Active
            </Badge>
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

                return (
                  <div
                    key={msg._id}
                    className={cn(
                      "rounded-xl border p-3.5 space-y-2 transition-all",
                      isOutbound
                        ? "border-border bg-muted/30 ml-4"
                        : "border-emerald-500/20 bg-emerald-500/5 mr-4"
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
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

                      <div className="flex items-center gap-1 text-[10px] font-mono text-muted-foreground">
                        <Clock className="size-3" />
                        <span>{formatDate(msg.receivedAt)}</span>
                      </div>
                    </div>

                    <div className="text-xs font-semibold text-foreground">
                      Subject: {msg.subject}
                    </div>

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
        appeal={claim.latestAppeal || null}
        markdownContent={claim.latestAppeal?.fullAppealMarkdown || ""}
        onProceedToDispatch={() => {
          setIsExportDrawerOpen(false);
        }}
      />
    </div>
  );
};
