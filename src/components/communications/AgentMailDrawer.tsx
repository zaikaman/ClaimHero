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
  MagnifyingGlass,
} from "@phosphor-icons/react";
import { Claim, EmailMessage, EmailThread } from "../../types";
import { formatDate, cn } from "../../lib/utils";
import { getPayerAppellateContact } from "../../lib/constants";
import { SentinelFlowStepper, FlowView } from "../common/SentinelFlowStepper";
import { Card } from "../ui/card";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Input } from "../ui/input";

interface AgentMailDrawerProps {
  claim: Claim;
  threads: EmailThread[];
  messages: EmailMessage[];
  isLoading?: boolean;
  onSendMessage: (text: string) => Promise<any>;
  onDispatchAppeal?: () => Promise<any>;
  onNavigateView?: (view: FlowView) => void;
  onRunAutonomousPipeline?: (claimId?: string) => Promise<any>;
  onResolvePayerGateway?: (forceWebSearch?: boolean) => Promise<any>;
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
  onResolvePayerGateway,
}) => {
  const [copiedEmail, setCopiedEmail] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isDispatching, setIsDispatching] = useState(false);
  const [isSearchingPayer, setIsSearchingPayer] = useState(false);

  const [copiedRecipientEmail, setCopiedRecipientEmail] = useState(false);

  const assignedEmail =
    claim.assignedAgentEmail ||
    `appeal-claim-${claim.claimNumber.toLowerCase().replace(/[^a-z0-9]/g, "")}@claimhero.agentmail.com`;

  const payerName = claim.patient?.insurancePayer || "Health Insurer";
  const defaultPayerContact = getPayerAppellateContact(payerName);
  const payerContact = claim.payerContact || defaultPayerContact;
  const recipientEmail =
    threads[0]?.payerEmail ||
    claim.payerContact?.officialAppealsEmail ||
    payerContact.officialAppealsEmail;

  const handleSearchPayer = async () => {
    if (!onResolvePayerGateway || isSearchingPayer) return;
    setIsSearchingPayer(true);
    try {
      await onResolvePayerGateway(true);
    } finally {
      setIsSearchingPayer(false);
    }
  };

  const handleCopyEmail = () => {
    navigator.clipboard.writeText(assignedEmail);
    setCopiedEmail(true);
    setTimeout(() => setCopiedEmail(false), 2000);
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
    if (!onDispatchAppeal || isDispatching) return;
    setIsDispatching(true);
    try {
      await onDispatchAppeal();
    } finally {
      setIsDispatching(false);
    }
  };

  return (
    <div className="space-y-4 animate-fadeIn pb-12">
      {/* 4-Step Guided Sentinel Stepper */}
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

      {/* Prominent Ready to Dispatch Action Banner if not yet sent */}
      {claim.status !== "dispatched" && claim.status !== "won" && onDispatchAppeal && (
        <Card className="p-4 border-primary/40 bg-primary/5 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-xl bg-primary text-primary-foreground flex items-center justify-center shrink-0 shadow-xs">
              <PaperPlaneTilt className="size-5" />
            </div>
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-foreground">
                  Ready to Transmit Formal Appeal Packet
                </h3>
                <Badge variant="secondary" className="text-[10px] font-mono">
                  Final Step
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                Dispatches the synthesized ERISA brief and clinical policy citations directly to {payerName} Grievance Department.
              </p>
            </div>
          </div>

          <Button
            size="sm"
            onClick={handleRunDispatch}
            disabled={isDispatching}
            className="gap-2 text-xs bg-primary text-primary-foreground font-semibold shadow-md shrink-0 w-full sm:w-auto h-9"
          >
            {isDispatching ? (
              <>
                <CircleNotch className="size-4 animate-spin" />
                <span>Transmitting via AgentMail...</span>
              </>
            ) : (
              <>
                <PaperPlaneTilt className="size-4" />
                <span>Dispatch Formal Appeal Packet Now</span>
              </>
            )}
          </Button>
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
                  AgentMail Claim Inbox
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
            <span className="text-[11px] text-muted-foreground">Case Inbox:</span>
            <span className="font-mono font-semibold text-foreground">{assignedEmail}</span>
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
                className="text-[9px] font-mono text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
              >
                {payerContact.isVerified ? "Verified Payer Gateway" : "Intake Gateway"}
              </Badge>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <span className="text-[10px] font-mono text-muted-foreground block">Payer</span>
                <span className="font-semibold text-foreground">{payerName}</span>
              </div>

              <div>
                <span className="text-[10px] font-mono text-muted-foreground block">Official Appellate Intake</span>
                <div className="flex items-center justify-between gap-1 mt-0.5">
                  <span className="font-mono text-[11px] text-foreground font-medium break-all">
                    {recipientEmail}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => {
                      navigator.clipboard.writeText(recipientEmail);
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

              <div>
                <span className="text-[10px] font-mono text-muted-foreground block">Statutory Appeals P.O. Box</span>
                <span className="text-foreground text-[11px] font-mono block">
                  {payerContact.statutoryPoBox}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-1 border-t border-border/50">
                <div>
                  <span className="text-[10px] font-mono text-muted-foreground block">Electronic Payer ID</span>
                  <span className="font-mono text-[11px] text-foreground font-semibold">
                    {payerContact.ediPayerId}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] font-mono text-muted-foreground block">Appeals Helpline</span>
                  <span className="font-mono text-[11px] text-foreground">
                    {payerContact.tollFreeHelpline}
                  </span>
                </div>
              </div>

              <div className="pt-1 border-t border-border/50">
                <span className="text-[10px] font-mono text-muted-foreground block">Delivery Channel</span>
                <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium text-[11px]">
                  <CheckCircle className="size-3.5" />
                  {claim.status === "dispatched" || claim.status === "won"
                    ? "Packet Transmitted & Logged"
                    : "Ready for Certified Dispatch"}
                </span>
              </div>

              <div className="pt-2 border-t border-border/50 space-y-2">
                <div className="flex items-center justify-between text-[10px] font-mono text-muted-foreground">
                  <span>Gateway Source:</span>
                  <span className="text-foreground font-medium">
                    {claim.payerContact?.source === "firecrawl_live"
                      ? "Firecrawl Web Search"
                      : claim.payerContact?.source === "document_ocr"
                      ? "Extracted from Document"
                      : payerContact.isVerified
                      ? "Verified Statutory Directory"
                      : "Inferred Gateway"}
                  </span>
                </div>

                {onResolvePayerGateway && (
                  <Button
                    variant="outline"
                    size="xs"
                    onClick={handleSearchPayer}
                    disabled={isSearchingPayer}
                    className="w-full gap-1.5 text-[11px] h-8"
                  >
                    {isSearchingPayer ? (
                      <>
                        <CircleNotch className="size-3 animate-spin text-primary" />
                        <span>Searching Web with Firecrawl...</span>
                      </>
                    ) : (
                      <>
                        <MagnifyingGlass className="size-3 text-muted-foreground" />
                        <span>Live Search Gateway (Firecrawl)</span>
                      </>
                    )}
                  </Button>
                )}
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
              Webhook Active
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
                  Click &quot;Dispatch Appeal Packet&quot; above to transmit the synthesized ERISA brief to the insurer via AgentMail.
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
            className="p-3 bg-muted/20 border-t border-border flex items-center gap-2"
          >
            <Input
              type="text"
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              placeholder="Type addendum or reply to payer..."
              className="flex-1 bg-background"
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
              <span>Send</span>
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
};
