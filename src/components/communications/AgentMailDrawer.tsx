import React, { useState } from "react";
import {
  Mail,
  Send,
  Inbox,
  ArrowUpRight,
  ArrowDownLeft,
  CheckCircle2,
  Clock,
  Copy,
  Check,
  Building2,
  Paperclip,
  Loader2,
} from "lucide-react";
import { Claim, EmailMessage, EmailThread } from "../../types";
import { formatDate } from "../../lib/utils";

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
    <div className="space-y-6 animate-fadeIn">
      {/* Inbox Header Card */}
      <div className="rounded-2xl border border-cyan-500/30 bg-slate-950/95 p-5 shadow-glass-panel">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-cyan-950/60 border border-cyan-500/40 shadow-cyan-glow">
              <Mail className="h-6 w-6 text-cyan-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold text-white font-sans">
                  Autonomous AgentMail Claim Inbox
                </h2>
                <span className="rounded-full bg-cyan-950/60 border border-cyan-500/40 px-2 py-0.5 text-[10px] font-mono text-cyan-300 font-semibold uppercase">
                  Active Thread
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Autonomous two-way dedicated transmission channel for Claim #{claim.claimNumber}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {claim.status !== "dispatched" && claim.status !== "won" && onDispatchAppeal && (
              <button
                onClick={handleRunDispatch}
                disabled={isDispatching}
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 via-teal-500 to-emerald-500 px-4 py-2 text-xs font-bold text-slate-950 shadow-cyan-glow hover:scale-105 active:scale-95 transition-all disabled:opacity-50"
              >
                {isDispatching ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin text-slate-950" />
                    <span>Dispatching via AgentMail...</span>
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4 fill-slate-950" />
                    <span>Dispatch Appeal Packet Now</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>

        {/* Assigned Email Address Banner */}
        <div className="mt-4 flex flex-col sm:flex-row items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-900/80 p-3 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-mono text-slate-400">Assigned Case Inbox:</span>
            <span className="font-mono font-bold text-cyan-300">{assignedEmail}</span>
          </div>

          <button
            onClick={handleCopyEmail}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-850 bg-slate-950 px-2.5 py-1 text-xs text-slate-300 hover:text-white transition-colors"
          >
            {copiedEmail ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
            <span>{copiedEmail ? "Copied" : "Copy Address"}</span>
          </button>
        </div>
      </div>

      {/* Two-Column Communication Feed */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Payer Information & Thread Summary (4 Cols) */}
        <div className="lg:col-span-4 space-y-4">
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 space-y-3">
            <span className="text-xs font-mono font-bold text-white uppercase tracking-wider flex items-center gap-1.5 border-b border-slate-800 pb-2">
              <Building2 className="h-4 w-4 text-cyan-400" />
              Recipient Insurer Contact
            </span>

            <div className="space-y-2 text-xs">
              <div>
                <span className="text-[10px] font-mono text-slate-500 block">Payer</span>
                <span className="font-semibold text-white">{payer} (Grievance & Appeals)</span>
              </div>

              <div>
                <span className="text-[10px] font-mono text-slate-500 block">Payer Intake Gateway</span>
                <span className="font-mono text-cyan-300">
                  {threads[0]?.payerEmail || `appeals-department@${payer.toLowerCase().replace(/[^a-z]/g, "")}.com`}
                </span>
              </div>

              <div>
                <span className="text-[10px] font-mono text-slate-500 block">Transmission Status</span>
                <span className="inline-flex items-center gap-1 text-emerald-400 font-semibold">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  {claim.status === "dispatched" || claim.status === "won" ? "Dispatched & Logged" : "Drafting in Progress"}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Live Message Feed & Reply Composer (8 Cols) */}
        <div className="lg:col-span-8 flex flex-col rounded-2xl border border-slate-800 bg-slate-950 overflow-hidden shadow-glass-panel">
          <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3 bg-slate-900/60 shrink-0">
            <span className="text-xs font-mono font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
              <Inbox className="h-4 w-4 text-cyan-400" />
              Two-Way Transmission History ({messages.length})
            </span>
            <span className="text-[11px] font-mono text-slate-400">
              Webhook: Active
            </span>
          </div>

          {/* Messages Container */}
          <div className="flex-1 p-4 space-y-4 overflow-y-auto max-h-[480px]">
            {isLoading ? (
              <div className="p-8 text-center text-xs font-mono text-slate-400 animate-pulse">
                Loading communication history...
              </div>
            ) : messages.length === 0 ? (
              <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-8 text-center space-y-2">
                <Mail className="mx-auto h-8 w-8 text-slate-600" />
                <div className="text-xs font-semibold text-slate-300">No transmissions sent or received yet</div>
                <p className="text-[11px] text-slate-500 max-w-sm mx-auto">
                  Click &quot;Dispatch Appeal Packet Now&quot; to send the complete synthesized ERISA brief directly to the insurer via AgentMail.
                </p>
              </div>
            ) : (
              messages.map((msg) => {
                const isOutbound = msg.direction === "outbound";

                return (
                  <div
                    key={msg._id}
                    className={`rounded-xl border p-4 space-y-2.5 transition-all ${
                      isOutbound
                        ? "border-cyan-500/30 bg-cyan-950/20 ml-6"
                        : "border-emerald-500/40 bg-emerald-950/20 mr-6"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span
                          className={`rounded px-2 py-0.5 text-[10px] font-mono font-bold uppercase flex items-center gap-1 border ${
                            isOutbound
                              ? "bg-cyan-950 text-cyan-300 border-cyan-500/40"
                              : "bg-emerald-950 text-emerald-300 border-emerald-500/40"
                          }`}
                        >
                          {isOutbound ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownLeft className="h-3 w-3" />}
                          {isOutbound ? "Outbound Dispatch" : "Inbound Response"}
                        </span>
                        <span className="font-mono text-xs font-bold text-white">
                          {isOutbound ? msg.recipient : msg.sender}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 text-[10px] font-mono text-slate-400">
                        <Clock className="h-3 w-3" />
                        <span>{formatDate(msg.receivedAt)}</span>
                      </div>
                    </div>

                    <div className="text-xs font-semibold text-slate-200">
                      Subject: {msg.subject}
                    </div>

                    <div className="rounded-lg bg-slate-950/80 border border-slate-800 p-3 text-xs text-slate-300 font-mono whitespace-pre-line leading-relaxed">
                      {msg.bodyText}
                    </div>

                    {msg.hasAttachments && (
                      <div className="flex items-center gap-1 text-[11px] font-mono text-cyan-300 pt-1">
                        <Paperclip className="h-3.5 w-3.5" />
                        <span>Attached: Formal ERISA Appeal Brief & Clinical Policy Exhibits (PDF/Markdown)</span>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Quick Message Composer */}
          <form onSubmit={handleSendReply} className="p-3 bg-slate-900/80 border-t border-slate-800 flex items-center gap-2">
            <input
              type="text"
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              placeholder="Type addendum or reply to payer grievance department..."
              className="flex-1 rounded-xl border border-slate-800 bg-slate-950 px-3.5 py-2 text-xs text-slate-200 placeholder-slate-600 focus:border-cyan-400 focus:outline-none font-sans"
            />
            <button
              type="submit"
              disabled={isSending || !replyText.trim()}
              className="inline-flex items-center gap-1.5 rounded-xl bg-cyan-500 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-cyan-400 transition-colors disabled:opacity-50"
            >
              {isSending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              <span>Send</span>
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
