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
  ArrowsClockwise,
  ShieldCheck,
  FileText,
  WarningCircle,
  X,
  PhoneCall,
  SealCheck,
  ArrowLeft,
  Lightning,
} from "@phosphor-icons/react";
import { Claim, EmailMessage, EmailThread, Appeal } from "../../types";
import { formatDate, cn } from "../../lib/utils";
import { getPayerAppellateContact } from "../../lib/constants";
import { useDetailMode } from "../../hooks/useDetailMode";
import { SentinelFlowStepper, FlowView } from "../common/SentinelFlowStepper";
import { Card } from "../ui/card";
import { Badge } from "../ui/badge";
import { Button, buttonVariants } from "../ui/button";
import { Input } from "../ui/input";
import { ExportDrawer } from "../studio/ExportDrawer";
import { ServiceCertificateModal } from "./ServiceCertificateModal";
import { SimpleInboxView } from "./SimpleInboxView";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../ui/tooltip";
import { soundEffects } from "../../lib/soundEffects";
import { copyToClipboard } from "../../lib/clipboard";
import { toast } from "sonner";
import { sanitizeRebuttalDraftDisplay } from "../../lib/displaySafety";

type DispatchMode = "custom_email" | "official_payer";

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
  onOpenAuditDrawer?: () => void;
}

// Module-level in-flight deduplication set across all component mounts and StrictMode double-renders
const inFlightDraftEvaluations = new Set<string>();

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
  onOpenAuditDrawer,
}) => {
  const { isDetailed } = useDetailMode();
  const [copiedEmail, setCopiedEmail] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isDispatching, setIsDispatching] = useState(false);
  const [dispatchMode, setDispatchMode] = useState<DispatchMode>("official_payer");
  const [customEmail, setCustomEmail] = useState<string>("");

  const [copiedRecipientEmail, setCopiedRecipientEmail] = useState(false);
  const [copiedBrief, setCopiedBrief] = useState(false);
  const [copiedFax, setCopiedFax] = useState(false);
  const [copiedPoBox, setCopiedPoBox] = useState(false);
  const [isExportDrawerOpen, setIsExportDrawerOpen] = useState(false);
  const [isCertificateModalOpen, setIsCertificateModalOpen] = useState(false);
  const [certificateMessageId, setCertificateMessageId] = useState<string | undefined>(undefined);
  const [isRedispatchOpen, setIsRedispatchOpen] = useState(false);

  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const seenMessageIdsRef = useRef<Set<string>>(new Set(messages.map((m) => m._id)));
  const isInitialMountRef = useRef<boolean>(true);

  // Smart Rebuttal State
  const dismissDraftMutation = useMutation(api.emails.dismissAutoReplyDraft);
  const updateAttachmentClientOcrMutation = useMutation(api.emails.updateAttachmentClientOcr);
  const generateDraftAction = useAction(api.actions.mailDispatcher.generateAutoReplyDraft);
  const [isGeneratingDraft, setIsGeneratingDraft] = useState(false);
  const [isDismissingDraft, setIsDismissingDraft] = useState(false);
  const [activeAutoDraft, setActiveAutoDraft] = useState<string>("");
  const [extractingStorageIds, setExtractingStorageIds] = useState<Set<string>>(new Set());
  const trackedInboundIdRef = useRef<string | null>(null);
  const evaluatingMessageIdRef = useRef<string | null>(null);

  const handleExtractLocally = async (
    messageId: string,
    att: { storageId: string; filename: string; contentType: string; size: number; url?: string | null }
  ) => {
    if (!att.url) {
      toast.error("Attachment download URL not available");
      return;
    }
    setExtractingStorageIds((prev) => new Set(prev).add(att.storageId));
    toast.info(`Extracting ${att.filename} locally in browser...`);
    try {
      const res = await fetch(att.url);
      if (!res.ok) throw new Error("Failed to download attachment for local extraction");
      const blob = await res.blob();
      const { extractDocumentInBrowser } = await import("../../lib/clientOcr");
      const result = await extractDocumentInBrowser(blob, att.filename);

      await updateAttachmentClientOcrMutation({
        claimId: claim._id as Id<"claims">,
        messageId: messageId as Id<"emailMessages">,
        storageId: att.storageId as Id<"_storage">,
        extractedText: result.sanitizedText,
      });

      soundEffects.play("extraction_complete");
      toast.success(`Extracted ${att.filename} locally in browser (zero PHI egress)!`);
    } catch (err) {
      console.error("Local OCR extraction failed:", err);
      toast.error(`Local extraction failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setExtractingStorageIds((prev) => {
        const next = new Set(prev);
        next.delete(att.storageId);
        return next;
      });
    }
  };

  // Identify latest message in thread and latest inbound message
  const lastMessage = messages.length > 0 ? messages[messages.length - 1] : null;
  const isAwaitingPayer = lastMessage?.direction === "outbound";
  const latestInbound = [...messages].reverse().find((m) => m.direction === "inbound");

  // Reset state when switching between claims
  useEffect(() => {
    setActiveAutoDraft("");
    trackedInboundIdRef.current = null;
    evaluatingMessageIdRef.current = null;
    seenMessageIdsRef.current = new Set(messages.map((m) => m._id));
    setIsRedispatchOpen(false);
    setCustomEmail("");
  }, [claim._id]);

  // Real-time message arrival detector (audio chime, toast notification, and container-anchored smooth scroll)
  useEffect(() => {
    if (isInitialMountRef.current) {
      if (messages.length > 0) {
        seenMessageIdsRef.current = new Set(messages.map((m) => m._id));
        isInitialMountRef.current = false;
      }
      return;
    }

    const newMessages = messages.filter((m) => !seenMessageIdsRef.current.has(m._id));
    if (newMessages.length === 0) return;

    for (const msg of newMessages) {
      seenMessageIdsRef.current.add(msg._id);
    }

    const latestNew = newMessages[newMessages.length - 1];

    // Smoothly scroll the messages container strictly inside its own scrollable element
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTo({
        top: messagesContainerRef.current.scrollHeight,
        behavior: "smooth",
      });
    }

    if (latestNew.direction === "inbound") {
      const determination = latestNew.detectedDetermination;
      const isVictory = determination === "OVERTURNED_APPROVED";

      if (isVictory) {
        soundEffects.play("p2p_overturned_victory");
        toast.success("Payer Determination Overturned & Approved", {
          description: `From ${latestNew.sender || "Payer"}: ${latestNew.subject || "Full Reversal Authorized"}`,
        });
      } else {
        soundEffects.play("inbound_reply_received");

        const label =
          determination === "PARTIAL_SETTLEMENT_OFFER"
            ? "Partial Settlement Offer Extended"
            : determination === "ADDITIONAL_RECORDS_REQUIRED"
            ? "Additional Clinical Records Demanded"
            : determination === "POLICY_CONFLICT_CITATION"
            ? "Conflicting Clinical Policy Cited"
            : determination === "DENIAL_UPHELD"
            ? "Level 1 Adverse Decision Upheld"
            : "Inbound Correspondence Received";

        toast.info("Inbound Payer Response Received", {
          description: `${label} — from ${latestNew.sender || "Payer"}`,
        });
      }
    }
  }, [messages]);

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

    // 1. If this message already has an autoReplyDraft from DB, immediately use it and avoid any synthesis
    if (latestInbound.autoReplyDraft) {
      trackedInboundIdRef.current = currentInboundId;
      const cleanDraft = sanitizeRebuttalDraftDisplay(latestInbound.autoReplyDraft, claim.claimNumber, claim.serviceDate);
      if (activeAutoDraft !== cleanDraft) {
        setActiveAutoDraft(cleanDraft);
      }
      return;
    }

    // 2. If the backend is actively generating the draft, let backend finish and do not trigger duplicate client call
    if (latestInbound.autoReplyStatus === "generating") {
      trackedInboundIdRef.current = currentInboundId;
      return;
    }

    // 3. If determination is overturned/approved, no addendum rebuttal is needed
    if (latestInbound.detectedDetermination === "OVERTURNED_APPROVED") {
      trackedInboundIdRef.current = currentInboundId;
      if (activeAutoDraft) {
        setActiveAutoDraft("");
      }
      return;
    }

    // 4. Strict Deduplication: if already tracked, locally evaluating, or in-flight in module Set, skip
    if (
      trackedInboundIdRef.current === currentInboundId ||
      evaluatingMessageIdRef.current === currentInboundId ||
      inFlightDraftEvaluations.has(currentInboundId)
    ) {
      return;
    }

    // Mark in-flight across all guards immediately
    trackedInboundIdRef.current = currentInboundId;
    evaluatingMessageIdRef.current = currentInboundId;
    inFlightDraftEvaluations.add(currentInboundId);
    setIsGeneratingDraft(true);

    generateDraftAction({
      claimId: claim._id as Id<"claims">,
      inboundMessageId: currentInboundId as Id<"emailMessages">,
      customPayerInquiry: latestInbound.bodyText,
    })
      .then((res) => {
        if (trackedInboundIdRef.current === currentInboundId && res?.draftText) {
          setActiveAutoDraft(sanitizeRebuttalDraftDisplay(res.draftText, claim.claimNumber, claim.serviceDate));
        }
      })
      .catch((err) => {
        console.warn("Failed to auto-evaluate inbound message draft:", err);
      })
      .finally(() => {
        inFlightDraftEvaluations.delete(currentInboundId);
        setIsGeneratingDraft(false);
      });
  }, [
    latestInbound?._id,
    latestInbound?.autoReplyDraft,
    latestInbound?.autoReplyStatus,
    latestInbound?.detectedDetermination,
    latestInbound?.bodyText,
    claim.status,
    claim._id,
    isAwaitingPayer,
    generateDraftAction,
  ]);

  const isSynthesizing =
    isGeneratingDraft ||
    Boolean(latestInbound && latestInbound.autoReplyStatus === "generating" && !latestInbound.autoReplyDraft);


  const handleGenerateSmartDraft = async (customPrompt?: string) => {
    if (isSynthesizing || !claim._id || !latestInbound) return;
    setIsGeneratingDraft(true);
    try {
      const res = await generateDraftAction({
        claimId: claim._id as Id<"claims">,
        inboundMessageId: latestInbound._id as Id<"emailMessages">,
        customPayerInquiry: customPrompt || latestInbound.bodyText,
        forceRegenerate: true,
      });
      if (res?.draftText) {
        setActiveAutoDraft(sanitizeRebuttalDraftDisplay(res.draftText, claim.claimNumber, claim.serviceDate));
      }
    } finally {
      setIsGeneratingDraft(false);
    }
  };

  const handleApproveAndSendDraft = async () => {
    if (!activeAutoDraft.trim() || isSending || isProvisionalDegraded) return;
    setIsSending(true);
    try {
      await onSendMessage(activeAutoDraft);
      soundEffects.play("transmission_dispatched");
      setActiveAutoDraft("");
      setReplyText("");
    } finally {
      setIsSending(false);
    }
  };

  const handleDismissDraft = async () => {
    if (!latestInbound?._id || !claim._id || isDismissingDraft) return;
    setIsDismissingDraft(true);
    try {
      await dismissDraftMutation({
        claimId: claim._id as Id<"claims">,
        messageId: latestInbound._id as Id<"emailMessages">,
      });
      setActiveAutoDraft("");
    } catch (err) {
      console.warn("Failed to dismiss draft:", err);
    } finally {
      setIsDismissingDraft(false);
    }
  };

  const assignedEmail =
    claim.agentMailInboxEmail ||
    claim.assignedAgentEmail ||
    import.meta.env.VITE_AGENTMAIL_SENDER_EMAIL ||
    "";

  const acknowledgeDegradation = useMutation(api.claims.acknowledgeEvidentiaryDegradation);
  const [isAcknowledging, setIsAcknowledging] = useState(false);

  const handleAcknowledgeDegradation = async () => {
    if (!claim._id || isAcknowledging) return;
    setIsAcknowledging(true);
    try {
      await acknowledgeDegradation({ claimId: claim._id as Id<"claims"> });
      toast.success(
        isDetailed
          ? "Statutory procedural posture acknowledged. Claim marked ready for review."
          : "Proof reviewed and confirmed. Your letter is ready to send."
      );
      soundEffects.play("tactile_click");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to acknowledge evidentiary gap.");
    } finally {
      setIsAcknowledging(false);
    }
  };

  const appealFromDb = useQuery(
    api.appeals.getLatestByClaim,
    claim?._id ? { claimId: claim._id as Id<"claims"> } : "skip"
  ) as Appeal | null | undefined;
  const effectiveAppeal: Appeal | null = (claim.latestAppeal || appealFromDb || null) as Appeal | null;

  const payerName = claim.patient?.insurancePayer || "Health Insurer";
  const defaultPayerContact = getPayerAppellateContact(payerName);
  const payerContact = claim.payerContact || defaultPayerContact;
  const officialEmail = claim.payerContact?.officialAppealsEmail || payerContact.officialAppealsEmail;
  const effectiveRecipient =
    dispatchMode === "custom_email"
      ? customEmail.trim()
      : officialEmail;

  const latestOutboundMessage = [...messages].reverse().find((m) => m.direction === "outbound");
  const latestInboundMessage = [...messages].reverse().find((m) => m.direction === "inbound");

  const recipientEmail =
    threads[0]?.payerEmail ||
    latestOutboundMessage?.recipient ||
    latestInboundMessage?.sender ||
    effectiveRecipient;

  // Pre-populate custom email if prior transmissions were sent to a custom address
  useEffect(() => {
    if (!customEmail) {
      const priorRecipient =
        (threads[0]?.payerEmail && threads[0].payerEmail !== officialEmail ? threads[0].payerEmail : "") ||
        (latestOutboundMessage?.recipient && latestOutboundMessage.recipient !== officialEmail ? latestOutboundMessage.recipient : "");
      if (priorRecipient) {
        setCustomEmail(priorRecipient);
      }
    }
  }, [claim._id, threads, messages, officialEmail, latestOutboundMessage?.recipient, customEmail]);

  const rawPatientName = claim.patient?.name || claim.patientName;
  const isPatientUnspecified =
    !rawPatientName ||
    rawPatientName === "Not specified in denial notice" ||
    rawPatientName.startsWith("[PATIENT") ||
    rawPatientName === "Patient" ||
    rawPatientName === "Patient Record";

  const hasSender = Boolean(
    claim.appealContext?.sender?.name?.trim() &&
    (claim.appealContext?.sender?.email?.trim() || claim.appealContext?.sender?.phone?.trim())
  );

  const isSenderGatewayConfigured = Boolean(
    claim.agentMailInboxEmail ||
    claim.assignedAgentEmail ||
    import.meta.env.VITE_AGENTMAIL_SENDER_EMAIL
  );

  const isReadyForReview = claim.status === "ready_for_review";

  const isCustomEmailLoopback = Boolean(
    dispatchMode === "custom_email" &&
    customEmail.trim() &&
    assignedEmail &&
    customEmail.trim().toLowerCase() === assignedEmail.toLowerCase()
  );

  const isProvisionalDegraded = Boolean(
    claim.status === "review_provisional" ||
    claim.evidenceIntegrity?.requiresEvidentiaryAcknowledgement ||
    (claim.evidenceIntegrity?.scoreStatus === "provisional_capped" &&
      !claim.evidenceIntegrity?.acknowledgedAt)
  );

  const canDispatch =
    isReadyForReview &&
    !isProvisionalDegraded &&
    isSenderGatewayConfigured &&
    (!isPatientUnspecified || hasSender) &&
    (dispatchMode === "custom_email"
      ? Boolean(customEmail.trim() && customEmail.includes("@") && !isCustomEmailLoopback)
      : Boolean(officialEmail));

  const hasPriorTransmissions = Boolean(
    messages.length > 0 ||
    threads.length > 0 ||
    claim.status === "dispatched" ||
    claim.status === "under_review" ||
    claim.status === "escalated" ||
    claim.status === "won"
  );

  const shouldShowTransmissionBanner = Boolean(
    onDispatchAppeal &&
    (!hasPriorTransmissions || isRedispatchOpen)
  );

  const handleCopyEmail = async () => {
    if (!assignedEmail) return;
    await copyToClipboard(assignedEmail);
    setCopiedEmail(true);
    setTimeout(() => setCopiedEmail(false), 2000);
  };

  const handleCopyBrief = async () => {
    const briefText = effectiveAppeal?.fullAppealMarkdown;
    if (!briefText) return;
    await copyToClipboard(briefText);
    setCopiedBrief(true);
    setTimeout(() => setCopiedBrief(false), 2000);
  };

  const handleCopyFax = async () => {
    const fax = payerContact.appealsFax;
    if (!fax) return;
    await copyToClipboard(fax);
    setCopiedFax(true);
    setTimeout(() => setCopiedFax(false), 2000);
  };

  const handleCopyPoBox = async () => {
    const pobox = payerContact.statutoryPoBox;
    if (!pobox) return;
    await copyToClipboard(pobox);
    setCopiedPoBox(true);
    setTimeout(() => setCopiedPoBox(false), 2000);
  };

  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyText.trim() || isSending || isProvisionalDegraded) return;

    setIsSending(true);
    try {
      await onSendMessage(replyText);
      soundEffects.play("transmission_dispatched");
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
      soundEffects.play("transmission_dispatched");
    } finally {
      setIsDispatching(false);
    }
  };

  if (!isDetailed) {
    return (
      <>
        <SimpleInboxView
          claim={claim}
          messages={messages}
          isLoading={isLoading}
          payerName={payerName}
          officialEmail={officialEmail}
          customEmail={customEmail}
          setCustomEmail={setCustomEmail}
          dispatchMode={dispatchMode}
          setDispatchMode={setDispatchMode}
          effectiveRecipient={effectiveRecipient}
          activeRecipient={recipientEmail}
          threads={threads}
          canDispatch={canDispatch}
          isDispatching={isDispatching}
          onRunDispatch={handleRunDispatch}
          hasPriorTransmissions={hasPriorTransmissions}
          isReadyForReview={isReadyForReview}
          isPatientUnspecified={isPatientUnspecified}
          hasSender={hasSender}
          isSenderGatewayConfigured={isSenderGatewayConfigured}
          isCustomEmailLoopback={isCustomEmailLoopback}
          activeAutoDraft={activeAutoDraft}
          isSynthesizing={isSynthesizing}
          isSending={isSending}
          onApproveAndSendDraft={handleApproveAndSendDraft}
          onDismissDraft={handleDismissDraft}
          replyText={replyText}
          setReplyText={setReplyText}
          onSendReply={handleSendReply}
          onOpenExportDrawer={() => setIsExportDrawerOpen(true)}
          onOpenCertificateModal={(msgId) => {
            setCertificateMessageId(msgId);
            setIsCertificateModalOpen(true);
          }}
          onNavigateView={onNavigateView}
          onSyncInboxes={onSyncInboxes}
          isSyncingInboxes={isSyncingInboxes}
          onRunAutonomousPipeline={
            onRunAutonomousPipeline ? () => onRunAutonomousPipeline(claim._id) : undefined
          }
          onOpenAuditDrawer={onOpenAuditDrawer}
          onAcknowledgeDegradation={handleAcknowledgeDegradation}
          isAcknowledging={isAcknowledging}
          isProvisionalDegraded={isProvisionalDegraded}
          effectiveAppeal={effectiveAppeal}
        />

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

        {/* Printable ERISA Certificate of Electronic Service Modal */}
        <ServiceCertificateModal
          isOpen={isCertificateModalOpen}
          onClose={() => setIsCertificateModalOpen(false)}
          claim={claim}
          messageId={certificateMessageId}
        />
      </>
    );
  }

  return (
    <div className="space-y-4 animate-fadeIn">
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
        onOpenAuditDrawer={onOpenAuditDrawer}
      />

      {/* Contextual P2P Defense Prompt for Medical Necessity Denials */}
      {(claim.denialReasonCode === "CO-50" ||
        claim.denialReasonDescription?.toLowerCase().includes("medical necessity") ||
        claim.denialReasonDescription?.toLowerCase().includes("investigational")) && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
          <div className="flex items-center gap-3 min-w-0">
            <div className="size-8 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-500 flex items-center justify-center shrink-0">
              <PhoneCall className="size-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-xs text-foreground">
                  Insurer Peer-to-Peer Challenge Detected
                </span>
                <Badge variant="outline" className="text-[9px] font-mono border-emerald-500/30 text-emerald-500">
                  {claim.denialReasonCode || "CO-50"}
                </Badge>
              </div>
              <p className="text-[11px] text-muted-foreground leading-tight">
                {claim.patient?.insurancePayer || "Insurer"} routinely requires a physician Peer-to-Peer conference before overturn. Prepare the rebuttal tele-script.
              </p>
            </div>
          </div>
          <Button
            size="xs"
            variant="outline"
            onClick={() => onNavigateView?.("p2p")}
            className="shrink-0 h-8 px-3 border-emerald-500/40 text-emerald-500 hover:bg-emerald-500/10 gap-1.5 text-xs font-semibold cursor-pointer"
          >
            <PhoneCall className="size-3.5" />
            <span>Prep Tele-Script</span>
          </Button>
        </div>
      )}

      {/* Evidentiary Degradation & Provisional Review Gating Banner */}
      {(claim.status === "review_provisional" || claim.evidenceIntegrity?.requiresEvidentiaryAcknowledgement) && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 space-y-3 shadow-2xs">
          <div className="flex items-start gap-3">
            <div className="size-8 rounded-lg bg-amber-500/20 border border-amber-500/40 text-amber-400 flex items-center justify-center shrink-0 mt-0.5">
              <WarningCircle className="size-4" />
            </div>
            <div className="space-y-1 min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-amber-900 dark:text-amber-300 uppercase tracking-wider">
                  {isDetailed ? "Evidentiary Integrity Alert: Provisional Review Gate" : "Review Required: Missing Policy Proof"}
                </span>
                <Badge variant="outline" className="text-[10px] font-mono border-amber-500/40 text-amber-800 dark:text-amber-300">
                  {claim.evidenceIntegrity?.scoreStatus === "provisional_capped" ? "Score Capped" : "Provisional Draft"}
                </Badge>
              </div>
              <p className="text-xs text-amber-950 dark:text-amber-200 leading-relaxed">
                {claim.evidenceIntegrity?.degradationWarnings?.[0] ||
                  (isDetailed
                    ? "Live insurer clinical policy bulletins (CPB) or judicial precedents could not be verified. This appeal operates as an ERISA § 503 Statutory Procedural Disclosure Demand rather than a substantive clinical medical necessity rebuttal."
                    : "The insurer's policy rules could not be verified online. This appeal relies on your legal right to request the documents they used to deny your claim.")}
              </p>
              <p className="text-[11px] text-amber-800/80 dark:text-amber-300/70">
                {isDetailed
                  ? `Readiness score is capped (${claim.appealReadinessScore ?? claim.evidenceCoverageScore ?? claim.overturnProbabilityScore ?? 0}/100) and 1-click dispatch is held in provisional review until you acknowledge this statutory posture.`
                  : `Your score is capped (${claim.appealReadinessScore ?? claim.evidenceCoverageScore ?? claim.overturnProbabilityScore ?? 0}/100) and sending is paused until you review and confirm.`}
              </p>
            </div>
          </div>
          <div className="flex items-center justify-end pt-1">
            <Button
              size="sm"
              variant="outline"
              onClick={handleAcknowledgeDegradation}
              disabled={isAcknowledging}
              className="text-xs border-amber-500/50 bg-amber-500/20 text-amber-950 dark:text-amber-200 hover:bg-amber-500/30 hover:text-amber-950 dark:hover:text-amber-100 cursor-pointer gap-2"
            >
              {isAcknowledging ? (
                <>
                  <CircleNotch className="size-3.5 animate-spin" />
                  <span>{isDetailed ? "Acknowledging..." : "Confirming..."}</span>
                </>
              ) : (
                <>
                  <CheckCircle className="size-3.5 text-amber-400" />
                  <span>{isDetailed ? "Acknowledge Statutory Posture & Enable Dispatch" : "Confirm & Enable Sending"}</span>
                </>
              )}
            </Button>
          </div>
        </div>
      )}

      {/* Persistent Active Transmission Status Bar when already sent */}
      {hasPriorTransmissions && !isRedispatchOpen && (
        <Card className="p-4 border-primary/30 bg-primary/5 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="size-9 rounded-xl bg-primary text-primary-foreground flex items-center justify-center shrink-0 shadow-xs">
                <PaperPlaneTilt className="size-4.5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-foreground">
                    {isDetailed ? "Active Appellate Transmission" : "Appeal Sent to Insurer"}
                  </h3>
                  <Badge variant="outline" className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400 border-emerald-500/30">
                    {claim.status === "won" ? "Won / Overturned" : claim.status === "under_review" ? "Under Review" : "Dispatched"}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {isDetailed
                    ? `Appeal transmitted. Dedicated inbox ${assignedEmail || "active"} is listening for payer responses and auto-drafting rebuttals.`
                    : `Your appeal has been sent. We are watching for replies from ${payerName}.`}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsExportDrawerOpen(true)}
                className="h-8 text-xs gap-1.5 cursor-pointer"
              >
                <FileText className="size-3.5" />
                <span>{isDetailed ? "View Dossier" : "View Packet"}</span>
              </Button>
              <Button
                size="sm"
                onClick={() => setIsRedispatchOpen(true)}
                className="h-8 text-xs gap-1.5 cursor-pointer bg-primary text-primary-foreground font-semibold"
              >
                <PaperPlaneTilt className="size-3.5" />
                <span>{isDetailed ? "Transmit Addendum / Re-dispatch" : "Send Again / Addendum"}</span>
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Prominent Multi-Channel Transmission Gateway Banner if not yet sent or explicitly opened */}
      {shouldShowTransmissionBanner && (
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
                    {isDetailed ? "Multi-Channel Appellate Transmission" : "Send your appeal"}
                  </h3>
                  <Badge variant="secondary" className="text-[10px] font-mono">
                    {hasPriorTransmissions ? (isDetailed ? "Re-transmission" : "Send again") : (isDetailed ? "Final Step" : "Last step")}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {isDetailed
                    ? `Transmit evidence-grounded ERISA memorandum & clinical evidence packet directly to ${payerName}.`
                    : `Send your letter and proof to ${payerName}. You approve everything first.`}
                </p>
              </div>
            </div>

            {/* Companion Utility Tools */}
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
              {isRedispatchOpen && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setIsRedispatchOpen(false)}
                  className="h-8 rounded-md text-xs px-2.5 gap-1 shrink-0 cursor-pointer text-muted-foreground hover:text-foreground"
                >
                  <X className="size-3.5" />
                  <span>Collapse</span>
                </Button>
              )}
              {onNavigateView && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onNavigateView("studio")}
                  className="h-8 rounded-md text-xs px-2.5 gap-1.5 shrink-0 cursor-pointer"
                  title={isDetailed ? "Back to Collaborative Appeal Studio" : "Back to your letter"}
                >
                  <ArrowLeft className="size-3.5" />
                  <span>{isDetailed ? "Back to Studio" : "Back to Letter"}</span>
                </Button>
              )}
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
                <span>{copiedBrief ? "Brief Copied!" : "Copy Brief"}</span>
              </Button>

              <Button
                size="sm"
                variant="outline"
                onClick={() => setIsExportDrawerOpen(true)}
                disabled={!effectiveAppeal}
                title={
                  effectiveAppeal
                    ? isDetailed
                      ? "Open formal appeal dossier & print docket"
                      : "Open and print your letter"
                    : isDetailed
                      ? "Synthesize appeal brief in studio first"
                      : "Write your letter first"
                }
                className="h-8 rounded-md text-xs px-2.5 gap-1.5 shrink-0"
              >
                <Printer className="size-3.5" />
                <span>Print Docket</span>
              </Button>

              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setCertificateMessageId(undefined);
                  setIsCertificateModalOpen(true);
                }}
                title="Generate ERISA Delivery Evidence Report & transmission audit record"
                className="h-8 rounded-md text-xs px-2.5 gap-1.5 shrink-0 border-emerald-500/30 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10"
              >
                <SealCheck className="size-3.5" />
                <span>Delivery Evidence</span>
              </Button>

              {hasPriorTransmissions && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setIsRedispatchOpen(false)}
                  className="h-8 rounded-md text-xs px-2.5 gap-1.5 shrink-0 text-muted-foreground hover:text-foreground"
                  title="Close transmission options"
                >
                  <X className="size-3.5" />
                  <span>Hide Gateway</span>
                </Button>
              )}
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

            <div
              role="radiogroup"
              aria-label="Appellate recipient destination"
              className="grid grid-cols-1 md:grid-cols-2 gap-2.5"
            >
              {/* Mode 1: Custom Typed-In Email */}
              <div
                role="radio"
                tabIndex={0}
                aria-checked={dispatchMode === "custom_email"}
                onClick={() => setDispatchMode("custom_email")}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setDispatchMode("custom_email");
                  }
                }}
                className={cn(
                  "cursor-pointer p-3 rounded-lg border text-left transition-all relative flex flex-col justify-between focus:outline-hidden focus-visible:ring-2 focus-visible:ring-primary",
                  dispatchMode === "custom_email"
                    ? "border-primary bg-primary/10 shadow-xs ring-1 ring-primary/40"
                    : "border-border bg-background/50 hover:bg-muted/40"
                )}
              >
                <div>
                  <div className="flex items-center justify-between gap-1.5 mb-1.5">
                    <div className="flex items-center gap-1.5">
                      <Envelope className={cn("size-4", dispatchMode === "custom_email" ? "text-primary" : "text-muted-foreground")} />
                      <span className="text-xs font-semibold text-foreground">{isDetailed ? "Typed-In Email (Interactive Test)" : "Send to my email to test"}</span>
                    </div>
                    <Badge variant="outline" className="text-[9px] font-mono text-cyan-600 dark:text-cyan-400 border-cyan-500/30">
                      Personal Inbox
                    </Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-snug">
                    {isDetailed
                      ? "Delivers complete brief to your typed email address. Reply from your inbox to test real inbound webhook ingestion."
                      : "Sends your letter to your own email. Reply from there to see how replies appear here."}
                  </p>
                </div>
                {dispatchMode === "custom_email" ? (
                  <div className="mt-2.5 pt-2 border-t border-border/50" onClick={(e) => e.stopPropagation()}>
                    <Input
                      type="email"
                      aria-label="Custom recipient email address"
                      placeholder="Enter your email (e.g. advocate@gmail.com)"
                      value={customEmail}
                      onChange={(e) => setCustomEmail(e.target.value)}
                      className="h-7 text-[11px] px-2 bg-background font-mono"
                    />
                    {isCustomEmailLoopback && (
                      <p className="mt-1 text-[10px] text-amber-500 font-medium">
                        Cannot dispatch to ClaimHero's own sender inbox. Please enter a different recipient address.
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="mt-2.5 pt-2 border-t border-border/50 text-[10px] font-mono text-muted-foreground truncate">
                    {customEmail || "Enter custom email address..."}
                  </div>
                )}
              </div>

              {/* Mode 2: Official Insurer Reviewer */}
              <div
                role="radio"
                tabIndex={0}
                aria-checked={dispatchMode === "official_payer"}
                onClick={() => setDispatchMode("official_payer")}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setDispatchMode("official_payer");
                  }
                }}
                className={cn(
                  "cursor-pointer p-3 rounded-lg border text-left transition-all relative flex flex-col justify-between focus:outline-hidden focus-visible:ring-2 focus-visible:ring-primary",
                  dispatchMode === "official_payer"
                    ? "border-primary bg-primary/10 shadow-xs ring-1 ring-primary/40"
                    : "border-border bg-background/50 hover:bg-muted/40"
                )}
              >
                <div>
                  <div className="flex items-center justify-between gap-1.5 mb-1.5">
                    <div className="flex items-center gap-1.5">
                      <Buildings className={cn("size-4", dispatchMode === "official_payer" ? "text-primary" : "text-muted-foreground")} />
                      <span className="text-xs font-semibold text-foreground">{isDetailed ? "Official Payer Reviewer Gateway" : "Send to insurer directly"}</span>
                    </div>
                    <Badge variant="outline" className="text-[9px] font-mono text-slate-400 border-slate-700">
                      Production
                    </Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-snug">
                    {isDetailed
                      ? `Dispatches directly to ${payerName}'s verified public grievance and appeals intake address.`
                      : `Sends directly to ${payerName}. Use this when your letter is final.`}
                  </p>
                </div>
                <div className="mt-2.5 pt-2 border-t border-border/50 text-[10px] font-mono text-foreground/80 truncate">
                  {officialEmail || "Verified intake route on file"}
                </div>
              </div>
            </div>
          </div>

          {isPatientUnspecified && !hasSender && (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-500 flex items-start gap-2.5">
              <Info className="size-4 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Sender Details Required Before Dispatch</p>
                <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-0.5">
                  The original denial notice did not specify the patient name. Under healthcare appeal standards, you must provide sender information in Appeal Studio before this packet can be dispatched.
                </p>
              </div>
            </div>
          )}

          {!isReadyForReview && (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-500 flex items-start gap-2.5">
              <Info className="size-4 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Mandatory Review Gate: Claim Status is {claim.status.replace(/_/g, " ").toUpperCase()}</p>
                <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-0.5">
                  Mandatory human review gate requires the case to be in &quot;Ready for Review&quot; status with a synthesized brief before appellate dispatch can be authorized.
                </p>
              </div>
            </div>
          )}

          {/* Dedicated Transmission Launchpad Action Bar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-3 rounded-xl border border-primary/30 bg-primary/10">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="size-8 rounded-lg bg-primary/20 flex items-center justify-center shrink-0 text-primary">
                <PaperPlaneTilt className="size-4" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-foreground">
                    {isDetailed ? "Ready for Appellate Dispatch" : "Ready to send"}
                  </span>
                  <Badge variant="outline" className="text-[10px] font-mono border-primary/30 text-primary">
                    {dispatchMode === "custom_email"
                      ? (isDetailed ? "Interactive Test Mode" : "Test mode")
                      : (isDetailed ? "Official Insurer Mode" : "To insurer")}
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
              title={
                !isReadyForReview
                  ? claim.status === "review_provisional"
                    ? isDetailed
                      ? "Dispatch paused: Claim is held in provisional review due to unverified policy/precedents. Acknowledge statutory posture above to enable dispatch."
                      : "Sending paused: Missing insurer proof. Review and confirm above to enable sending."
                    : `Dispatch disabled: Claim status is "${claim.status}". Mandatory human review requires claim status to be "ready_for_review".`
                  : !isSenderGatewayConfigured
                  ? "Dispatch disabled: AgentMail sender address is not configured. Set VITE_AGENTMAIL_SENDER_EMAIL in environment."
                  : isPatientUnspecified && !hasSender
                  ? "Patient name not specified in denial notice. Please supply sender details in Appeal Studio before dispatching."
                  : dispatchMode === "custom_email" && !customEmail.trim()
                  ? "Enter a valid recipient email address to enable dispatch."
                  : dispatchMode === "custom_email" && isCustomEmailLoopback
                  ? "Cannot dispatch to ClaimHero's own sender inbox. Please enter a different recipient address."
                  : dispatchMode === "official_payer" && !officialEmail
                  ? "Official payer email not yet verified. Enter a recipient or use the verified intake route below."
                  : undefined
              }
              className="gap-2 text-xs bg-primary text-primary-foreground font-semibold shadow-md shrink-0 h-9 px-4 cursor-pointer"
            >
              {isDispatching ? (
                <>
                  <CircleNotch className="size-4 animate-spin" />
                  <span>{isDetailed ? "Transmitting Appeal Packet..." : "Sending..."}</span>
                </>
              ) : (
                <>
                  <PaperPlaneTilt className="size-4" />
                  <span>
                    {dispatchMode === "custom_email"
                      ? (isDetailed ? "Approve & Transmit to Typed-In Email" : "Send to my email")
                      : (isDetailed ? "Approve & Transmit to Official Gateway" : "Send to insurer")}
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
                {isDetailed ? `Appellate Submission Guidelines for ${payerName}:` : `How to send to ${payerName}:`}
              </span>
              <p className="text-[11px] leading-relaxed text-foreground/80">
                {payerContact.submissionPolicyNote ||
                  "Use your dedicated Case Inbox as your Authorized Representative contact to receive electronic determinations."}
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
                    {isDetailed ? "Payer Communications Inbox" : "Messages"}
                  </h2>
                  <Badge variant="outline" className="font-mono text-[10px]">
                    {isDetailed ? `Claim #${claim.claimNumber}` : `Case #${claim.claimNumber}`}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {isDetailed
                    ? "Review-gated two-way dedicated transmission channel"
                    : "Letters you sent and replies from your insurer"}
                </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Mandatory Human Review Gate Interactive Badge */}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border bg-primary/10 text-primary border-primary/30 select-none cursor-default">
                    <ShieldCheck className="size-3.5 text-primary shrink-0" />
                    <span>{isDetailed ? "Human Review Mandatory" : "You approve before anything sends"}</span>
                    <Info className="size-3 opacity-60 hover:opacity-100 transition-opacity ml-0.5" />
                  </div>
                </TooltipTrigger>
                <TooltipContent side="bottom" align="end" className="max-w-xs space-y-1">
                  <div className="font-semibold text-foreground">Mandatory Human Approval Gate</div>
                  <div className="text-[11px] text-muted-foreground leading-relaxed">
                    AI may prepare, classify, cite, and recommend. A human must approve every clinical assertion, legal assertion, recipient, and outbound message before dispatch.
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

            {hasPriorTransmissions && onDispatchAppeal && (
              <Button
                variant="outline"
                size="xs"
                onClick={() => setIsRedispatchOpen((prev) => !prev)}
                className={cn(
                  "gap-1 h-7 text-xs font-mono transition-colors cursor-pointer select-none",
                  isRedispatchOpen
                    ? "border-primary/50 text-primary bg-primary/10"
                    : "border-border text-muted-foreground hover:text-foreground"
                )}
                title={isRedispatchOpen ? "Hide transmission gateway" : "Open transmission options & guidelines"}
              >
                <PaperPlaneTilt className="size-3 text-primary" />
                <span>{isRedispatchOpen ? "Hide Gateway" : "Re-dispatch Appeal"}</span>
              </Button>
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
            ) : claim.status === "under_review" ? (
              <Badge variant="secondary" className="gap-1 text-amber-600 dark:text-amber-400 border-amber-500/30 bg-amber-500/10 px-2.5 py-1">
                <Clock className="size-3.5 text-amber-500" />
                <span>Payer Determination Under Review</span>
              </Badge>
            ) : claim.status === "escalated" ? (
              <Badge variant="secondary" className="gap-1 text-rose-600 dark:text-rose-400 border-rose-500/30 bg-rose-500/10 px-2.5 py-1">
                <WarningCircle className="size-3.5 text-rose-500" />
                <span>Level 1 Upheld — Escalation Required</span>
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
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
        {/* Left Column: Payer Information & Thread Summary (4 Cols) */}
        <div className="lg:col-span-4 flex flex-col">
          <Card className="p-4 flex-1 flex flex-col justify-between">
            <div className="space-y-3">
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
                      : claim.payerContact?.source === "registry_fallback"
                      ? "text-amber-600 dark:text-amber-400 border-amber-500/30"
                      : "text-rose-600 dark:text-rose-400 border-rose-500/30"
                  )}
                >
                  {payerContact.isVerified
                    ? "Live-Verified Gateway"
                    : claim.payerContact?.source === "document_ocr"
                    ? "Extracted from Document"
                    : claim.payerContact?.source === "firecrawl_live"
                    ? "Firecrawl Discovered"
                    : claim.payerContact?.source === "registry_fallback"
                    ? `Registry Baseline (${claim.payerContact.registryDate || "Unverified"})`
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
                        ? "No portal on file"
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
                        title="Copy appeals fax line"
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

                {/* Direct Electronic Appeals Inbox */}
                {officialEmail ? (
                  <div>
                    <span className="text-[10px] font-mono text-muted-foreground block">Electronic Appeals Email</span>
                    <div className="flex items-center justify-between gap-1 mt-0.5">
                      <span className="text-foreground font-medium text-[11px] font-mono truncate">
                        {officialEmail}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={async () => {
                          await copyToClipboard(officialEmail);
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
                    <span className="text-[10px] font-mono text-muted-foreground block">Appeals Intake Route</span>
                    <span className="text-[11px] text-foreground font-medium block mt-0.5">
                      {payerContact.intakePortalUrl
                        ? "Verified Intake Route on File"
                        : payerContact.appealsFax
                        ? "Verified Intake Route on File"
                        : "See Denial Notice for Filing Details"}
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
                      : "Intake Route Ready"}
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
              </div>
            </div>

            <div className="pt-3 mt-3 border-t border-border/50 space-y-2">
              <div className="flex items-center justify-between text-[10px] font-mono text-muted-foreground">
                <span>Gateway Source:</span>
                <span className="text-foreground font-medium">
                  {claim.payerContact?.source === "firecrawl_live"
                    ? "Firecrawl Live Discovery"
                    : claim.payerContact?.source === "document_ocr"
                    ? "Extracted from Document"
                    : claim.payerContact?.source === "registry_fallback"
                    ? `Statutory Registry Baseline (${claim.payerContact.registryDate || "Offline"})`
                    : payerContact.isVerified
                    ? "Live-Verified Gateway"
                    : "Unresolved / Manual Verification"}
                </span>
              </div>
            </div>
          </Card>
        </div>

        {/* Right Column: Live Message Feed & Reply Composer (8 Cols) */}
        <div className="lg:col-span-8 relative flex flex-col min-h-[520px] h-[620px] lg:h-auto">
          <Card className="lg:absolute lg:inset-0 flex flex-col gap-0 p-0 overflow-hidden h-full border border-border bg-card/60 backdrop-blur-xl">
            <div className="flex items-center justify-between border-b border-border px-4 py-2.5 bg-muted/30 shrink-0">
              <div className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <Tray className="size-4 text-primary" />
                <span>Transmission History ({messages.length})</span>
              </div>
              <div className="flex items-center gap-2">
                {onSyncInboxes && (
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => onSyncInboxes()}
                    disabled={isSyncingInboxes}
                    className="h-6 px-2 text-[10px] font-mono gap-1 text-muted-foreground hover:text-foreground"
                    title="Force refresh inbound replies from AgentMail inboxes"
                  >
                    <ArrowsClockwise className={cn("size-3", isSyncingInboxes && "animate-spin text-primary")} />
                    <span>{isSyncingInboxes ? "Syncing..." : "Sync Inbox"}</span>
                  </Button>
                )}
                <Badge variant="outline" size="sm" className="text-[10px] font-mono text-primary border-primary/30">
                  Human Review Gate Enforced
                </Badge>
              </div>
            </div>

            {/* Messages Container */}
            <div ref={messagesContainerRef} className="flex-1 min-h-0 p-4 space-y-3 overflow-y-auto scroll-smooth">
            {isLoading ? (
              <div className="p-8 text-center text-xs font-mono text-muted-foreground animate-pulse">
                Loading communication history...
              </div>
            ) : messages.length === 0 ? (
              <div className="p-8 text-center flex flex-col items-center justify-center h-full min-h-[260px] space-y-2 text-muted-foreground">
                <Envelope className="size-8 mx-auto text-muted-foreground/60" />
                <div className="text-xs font-medium text-foreground">No transmissions yet</div>
                <p className="text-[11px] max-w-sm mx-auto">
                  {isDetailed
                    ? "Click 'Transmit Appeal Packet' above to deliver the synthesized brief. You can also copy or print the dossier for your records."
                    : "Use the send button above to deliver your letter. You can also copy or print it for your records."}
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

                return (
                  <div
                    key={msg._id}
                    className={cn(
                      "rounded-xl border p-3.5 space-y-2 transition-all",
                      isOutbound
                        ? "border-border bg-muted/30 ml-4"
                        : isOverturned
                        ? "border-emerald-500/40 bg-emerald-500/10 mr-4 shadow-xs"
                        : isRecordsReq || isPartialOffer
                        ? "border-amber-500/40 bg-amber-500/5 mr-4"
                        : isDenialUpheld || isPolicyConflict
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
                                : isRecordsReq || isPartialOffer
                                ? "text-amber-600 dark:text-amber-400 border-amber-500/40 bg-amber-500/10"
                                : isDenialUpheld || isPolicyConflict
                                ? "text-rose-600 dark:text-rose-400 border-rose-500/40 bg-rose-500/10"
                                : "text-muted-foreground border-border"
                            )}
                          >
                            {isOverturned ? (
                              <CheckCircle className="size-3" />
                            ) : isRecordsReq || isPartialOffer ? (
                              <WarningCircle className="size-3" />
                            ) : (
                              <ShieldCheck className="size-3" />
                            )}
                            <span>
                              {isOverturned
                                ? "Determination: Overturned / Approved"
                                : isPartialOffer
                                ? "Partial Settlement Offered"
                                : isRecordsReq
                                ? "Additional Records Requested"
                                : isPolicyConflict
                                ? "Conflicting Policy Cited"
                                : isDenialUpheld
                                ? "Level 1 Denial Upheld"
                                : "General Response"}
                            </span>
                          </Badge>
                        )}

                        {isOutbound && (
                          <Button
                            variant="outline"
                            size="xs"
                            onClick={() => {
                              setCertificateMessageId(msg._id);
                              setIsCertificateModalOpen(true);
                            }}
                            className="h-5 px-1.5 text-[9.5px] font-mono gap-1 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/10 rounded"
                            title="Generate Delivery Evidence Report for this transmission"
                          >
                            <SealCheck className="size-3 text-emerald-500" />
                            <span>Delivery Evidence</span>
                          </Button>
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

                    {/* Partial Settlement Offer */}
                    {!isOutbound && isPartialOffer && typeof msg.settlementAmount === "number" && (
                      <div className="p-2 rounded bg-amber-500/10 border border-amber-500/30 text-[11px] font-mono text-amber-700 dark:text-amber-300">
                        {msg.settlementProvenance === "estimated_benchmark"
                          ? `Settlement offer received (unspecified amount — estimated 40% benchmark: $${msg.settlementAmount.toLocaleString()}) — counter-rebuttal drafted demanding full payment or cure path.`
                          : msg.settlementProvenance === "unspecified" || msg.settlementAmount <= 0
                          ? "Settlement offer received (unspecified amount) — counter-rebuttal drafted demanding full payment or cure path."
                          : `Settlement offered by payer: $${msg.settlementAmount.toLocaleString()} — counter-rebuttal drafted demanding full payment or cure path.`}
                      </div>
                    )}

                    <div className="rounded-lg bg-background border border-border p-3 text-xs text-foreground/90 font-mono whitespace-pre-line leading-relaxed">
                      {msg.bodyText}
                    </div>

                    {msg.hasAttachments && (
                      <div className="space-y-1.5 pt-1">
                        {msg.attachments && msg.attachments.length > 0 ? (
                          <div className="flex flex-wrap gap-2">
                            {msg.attachments.map((att, idx) => {
                              const isPdf =
                                att.contentType?.toLowerCase().includes("pdf") ||
                                att.filename?.toLowerCase().endsWith(".pdf");
                              const formattedSize = att.size > 0
                                ? att.size < 1024
                                  ? `${att.size} B`
                                  : att.size < 1024 * 1024
                                  ? `${Math.round(att.size / 1024)} KB`
                                  : `${(att.size / (1024 * 1024)).toFixed(1)} MB`
                                : "";

                              return (
                                <div
                                  key={att.storageId || idx}
                                  className="flex items-center gap-2 rounded-md border border-border/80 bg-muted/40 px-2.5 py-1.5 text-xs text-foreground/90 transition-colors hover:border-primary/50"
                                >
                                  <FileText className="size-3.5 text-primary shrink-0" />
                                  <div className="flex flex-col min-w-0">
                                    <span className="font-medium truncate max-w-[200px]" title={att.filename}>
                                      {att.filename}
                                    </span>
                                    {formattedSize && (
                                      <span className="text-[10px] text-muted-foreground font-mono">
                                        {formattedSize} {isPdf ? "- Formal PDF" : ""}
                                      </span>
                                    )}
                                  </div>
                                  {att.ocrStatus === "needs_client_ocr" && (
                                    <button
                                      type="button"
                                      disabled={extractingStorageIds.has(att.storageId)}
                                      onClick={() => handleExtractLocally(msg._id, att)}
                                      className="ml-auto inline-flex items-center gap-1 rounded bg-primary/10 hover:bg-primary/20 text-primary border border-primary/30 px-2 py-0.5 text-[10px] font-medium transition-colors disabled:opacity-50"
                                      title="Extract text locally in browser (zero keys, zero PHI egress)"
                                    >
                                      {extractingStorageIds.has(att.storageId) ? (
                                        <>
                                          <CircleNotch className="size-3 animate-spin" />
                                          <span>Extracting...</span>
                                        </>
                                      ) : (
                                        <>
                                          <Lightning className="size-3 text-primary" />
                                          <span>Extract locally</span>
                                        </>
                                      )}
                                    </button>
                                  )}
                                  {att.ocrStatus === "extracted" && (
                                    <span className="ml-auto inline-flex items-center gap-1 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-1.5 py-0.5 text-[10px] font-mono">
                                      <Check className="size-3" />
                                      <span>Extracted</span>
                                    </span>
                                  )}
                                  {att.url && (
                                    <a
                                      href={att.url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="ml-1 inline-flex items-center gap-1 rounded p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                                      title="Open / Download Attachment"
                                    >
                                      <ArrowSquareOut className="size-3.5" />
                                    </a>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="flex items-center gap-1 text-[11px] font-mono text-muted-foreground pt-0.5">
                            <Paperclip className="size-3" />
                            <span>Attached: ERISA Appeal Packet & Clinical Policy Exhibits (PDF/MD)</span>
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

          {/* Prepared Clinical Rebuttal Draft Card (Pending Human Approval) */}
          {(activeAutoDraft || isSynthesizing) && claim.status !== "won" && !isAwaitingPayer && (
            <div className="p-3 bg-muted/20 border-t border-border space-y-2.5 shrink-0">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                  <ShieldCheck className="size-4 text-primary shrink-0" />
                  <span>AI-Prepared Clinical Rebuttal</span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[10px] font-mono border-primary/30 text-primary">
                    Human Review Mandatory
                  </Badge>
                </div>
              </div>

              <div className="rounded border border-primary/20 bg-primary/5 px-2.5 py-1.5 text-[11px] text-muted-foreground flex items-center gap-2">
                <Info className="size-3.5 text-primary shrink-0" />
                <span>
                  AI may prepare, classify, cite, and recommend. An authorized human must approve every clinical assertion, legal assertion, recipient, and outbound message.
                </span>
              </div>

              {isSynthesizing && !activeAutoDraft ? (
                <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground p-3 bg-background/80 rounded-md border border-border">
                  <CircleNotch className="size-3.5 animate-spin text-primary shrink-0" />
                  <span>Synthesizing clinical rebuttal draft from latest payer reply...</span>
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
                  disabled={isSending || !activeAutoDraft.trim() || isSynthesizing || isProvisionalDegraded}
                  className="gap-1.5 h-7 px-3 text-xs font-medium"
                >
                  {isSending ? (
                    <CircleNotch className="size-3.5 animate-spin" />
                  ) : (
                    <PaperPlaneTilt className="size-3.5" />
                  )}
                  <span>Approve &amp; Transmit Rebuttal</span>
                </Button>

                <Button
                  size="xs"
                  variant="outline"
                  onClick={() => setReplyText(activeAutoDraft)}
                  disabled={!activeAutoDraft.trim() || isSynthesizing}
                  className="gap-1.5 h-7 px-2.5 text-xs font-medium"
                >
                  <FileText className="size-3.5" />
                  <span>Open in Composer</span>
                </Button>

                <Button
                  size="xs"
                  variant="ghost"
                  onClick={() => handleGenerateSmartDraft()}
                  disabled={isSynthesizing}
                  className="gap-1 text-muted-foreground hover:text-foreground h-7 px-2 text-xs"
                >
                  <ArrowsClockwise className={cn("size-3.5", isSynthesizing && "animate-spin")} />
                  <span>Regenerate</span>
                </Button>

                <Button
                  size="xs"
                  variant="ghost"
                  onClick={handleDismissDraft}
                  disabled={isDismissingDraft || isSynthesizing}
                  className="gap-1 text-muted-foreground hover:text-rose-400 h-7 px-2 text-xs"
                  title="Dismiss clinical rebuttal draft"
                >
                  <X className="size-3.5" />
                  <span>Dismiss</span>
                </Button>
              </div>
            </div>
          )}

          {/* Dedicated Addendum & Transmission Console */}
          <div className="mt-auto shrink-0 border-t border-border/80 bg-muted/20 backdrop-blur-sm">
            {/* Evidentiary Degradation Gating Notice */}
            {isProvisionalDegraded && (
              <div className="mx-3 mt-3 p-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400 text-xs flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <WarningCircle className="size-4 shrink-0" />
                  <span className="truncate">Evidentiary degradation requires acknowledgment before outbound transmission.</span>
                </div>
                <Button
                  size="xs"
                  variant="outline"
                  onClick={handleAcknowledgeDegradation}
                  disabled={isAcknowledging}
                  className="shrink-0 border-amber-500/40 text-amber-700 dark:text-amber-300 hover:bg-amber-500/20 h-6 text-[11px] cursor-pointer"
                >
                  {isAcknowledging ? "Confirming..." : "Acknowledge"}
                </Button>
              </div>
            )}

            {/* Reply Composer Form */}
            <form onSubmit={handleSendReply} className="p-3 space-y-2">
              <div className="flex items-center justify-between text-[10px] font-mono text-muted-foreground">
                <span className="truncate max-w-[320px]">
                  {recipientEmail ? (
                    <span>
                      Target: <strong className="text-foreground">{recipientEmail}</strong>
                    </span>
                  ) : (
                    <span>
                      Target: <strong className="text-foreground">Case Docket Addendum</strong>
                    </span>
                  )}
                </span>
                <span className="text-[9.5px] text-muted-foreground/70 hidden sm:inline">
                  Press Enter to send
                </span>
              </div>

              <div className="flex items-center gap-2">
                <Input
                  type="text"
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  placeholder={
                    isProvisionalDegraded
                      ? "Evidentiary acknowledgment required before outbound transmission..."
                      : recipientEmail
                      ? `Type addendum or reply to ${recipientEmail}...`
                      : "Log addendum note to case docket..."
                  }
                  className="flex-1 bg-background text-xs h-8"
                  disabled={isSending || isProvisionalDegraded}
                />
                <Button
                  type="submit"
                  size="sm"
                  disabled={isSending || !replyText.trim() || isProvisionalDegraded}
                  className="gap-1.5 h-8 px-3 text-xs shrink-0 cursor-pointer"
                >
                  {isSending ? (
                    <CircleNotch className="size-3.5 animate-spin" />
                  ) : (
                    <PaperPlaneTilt className="size-3.5" />
                  )}
                  <span>{isSending ? "Sending..." : "Send"}</span>
                </Button>
              </div>
            </form>

            {/* Integrated Transmission Audit & Compliance Footer Dock */}
            <div className="px-3 py-2 bg-muted/40 border-t border-border/60 flex flex-wrap items-center justify-between gap-2 text-[10px] font-mono">
              <div className="flex items-center gap-2 text-muted-foreground">
                <span className="inline-flex items-center gap-1 text-emerald-500 font-medium">
                  <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Direct Carrier Relay
                </span>
                <span className="text-border">•</span>
                <span>ERISA § 503 Audited</span>
                <span className="text-border hidden sm:inline">•</span>
                <span className="hidden sm:inline">Review Gate Active</span>
              </div>

              <div className="flex items-center gap-1.5">
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  onClick={() => {
                    setCertificateMessageId(undefined);
                    setIsCertificateModalOpen(true);
                  }}
                  className="h-6 px-2 text-[10px] font-mono gap-1 text-muted-foreground hover:text-emerald-400 hover:bg-emerald-500/10 rounded cursor-pointer"
                  title="Generate ERISA Certificate of Electronic Service & transmission evidence report"
                >
                  <SealCheck className="size-3 text-emerald-500" />
                  <span>Delivery Evidence</span>
                </Button>

                {effectiveAppeal?.fullAppealMarkdown && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    onClick={() => setIsExportDrawerOpen(true)}
                    className="h-6 px-2 text-[10px] font-mono gap-1 text-muted-foreground hover:text-foreground hover:bg-muted rounded cursor-pointer"
                    title="Export appeal dossier and exhibits"
                  >
                    <FileText className="size-3 text-primary" />
                    <span>Export Dossier</span>
                  </Button>
                )}
              </div>
            </div>
          </div>
        </Card>
      </div>
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

      {/* Printable ERISA Certificate of Electronic Service Modal */}
      <ServiceCertificateModal
        isOpen={isCertificateModalOpen}
        onClose={() => setIsCertificateModalOpen(false)}
        claim={claim}
        messageId={certificateMessageId}
      />
    </div>
  );
};
