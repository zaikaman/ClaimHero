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
} from "@phosphor-icons/react";
import { Claim, EmailMessage, EmailThread } from "../../types";
import { formatDate, cn } from "../../lib/utils";
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
}

export const AgentMailDrawer: React.FC<AgentMailDrawerProps> = ({
  claim,
  threads,
  messages,
  isLoading,
  onSendMessage,
  onDispatchAppeal,
}) => {
  const [copiedEmail, setCopiedEmail] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isDispatching, setIsDispatching] = useState(false);

  const assignedEmail =
    claim.assignedAgentEmail ||
    `appeal-claim-${claim.claimNumber.toLowerCase().replace(/[^a-z0-9]/g, "")}@claimhero.agentmail.com`;

  const payer = claim.patient?.insurancePayer || "Health Insurer";

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
    <div className="space-y-4 animate-fadeIn">
      {/* Inbox Header Card */}
      <Card className="p-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-xs">
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
            {claim.status !== "dispatched" &&
              claim.status !== "won" &&
              onDispatchAppeal && (
                <Button
                  size="sm"
                  onClick={handleRunDispatch}
                  disabled={isDispatching}
                  className="gap-1.5"
                >
                  {isDispatching ? (
                    <>
                      <CircleNotch className="size-3.5 animate-spin" />
                      <span>Dispatching...</span>
                    </>
                  ) : (
                    <>
                      <PaperPlaneTilt className="size-3.5" />
                      <span>Dispatch Appeal Packet</span>
                    </>
                  )}
                </Button>
              )}
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
            <div className="text-xs font-semibold text-foreground flex items-center gap-1.5 border-b border-border pb-2.5">
              <Buildings className="size-4 text-muted-foreground" />
              <span>Recipient Insurer Contact</span>
            </div>

            <div className="space-y-2.5 text-xs">
              <div>
                <span className="text-[10px] font-mono text-muted-foreground block">Payer</span>
                <span className="font-semibold text-foreground">{payer} (Grievance & Appeals)</span>
              </div>

              <div>
                <span className="text-[10px] font-mono text-muted-foreground block">Intake Gateway</span>
                <span className="font-mono text-foreground">
                  {threads[0]?.payerEmail ||
                    `appeals-department@${payer.toLowerCase().replace(/[^a-z]/g, "")}.com`}
                </span>
              </div>

              <div>
                <span className="text-[10px] font-mono text-muted-foreground block">Status</span>
                <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
                  <CheckCircle className="size-3.5" />
                  {claim.status === "dispatched" || claim.status === "won"
                    ? "Dispatched & Logged"
                    : "Drafting in Progress"}
                </span>
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
