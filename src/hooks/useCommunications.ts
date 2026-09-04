import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Claim, EmailThread, EmailMessage, AuditLog } from "../types";
import { Id } from "../../convex/_generated/dataModel";

export interface UseCommunicationsOptions {
  activeView?: string;
  enableAudit?: boolean;
}

export function useCommunications(claim?: Claim | null, options?: UseCommunicationsOptions) {
  const claimId = claim?._id as Id<"claims"> | undefined;
  const [isSyncingInboxes, setIsSyncingInboxes] = useState(false);

  const isCommunicationsActive = !options?.activeView || options.activeView === "communications";
  const isAuditActive = !options?.activeView || options.activeView === "audit" || Boolean(options?.enableAudit);

  // Query threads for this claim only when communications view is active
  const threads = useQuery(
    api.emails.listThreadsByClaim,
    isCommunicationsActive && claimId ? { claimId } : "skip"
  ) as EmailThread[] | undefined;

  const activeThreadId = threads && threads.length > 0 ? (threads[0]?._id as Id<"emailThreads"> | undefined) : undefined;

  // Query thread details and messages only when communications view is active
  const threadDetails = useQuery(
    api.emails.getThreadWithMessages,
    isCommunicationsActive && activeThreadId ? { threadId: activeThreadId } : "skip"
  ) as { thread: EmailThread; messages: EmailMessage[] } | null | undefined;

  // Query audit logs strictly when audit view is active, and skip listRecent when a claim is selected
  const claimAuditLogs = useQuery(
    api.auditLogs.listByClaim,
    isAuditActive && claimId ? { claimId } : "skip"
  ) as AuditLog[] | undefined;

  const recentAuditLogs = useQuery(
    api.auditLogs.listRecent,
    isAuditActive && !claimId ? { limit: 15 } : "skip"
  ) as AuditLog[] | undefined;

  const insertMessageMutation = useMutation(api.emails.insertMessage);
  const getOrCreateThreadMutation = useMutation(api.emails.getOrCreateThread);
  const dispatchAction = useAction(api.actions.mailDispatcher.dispatchAppealPacket);
  const sendOutboundAction = useAction(api.actions.mailDispatcher.sendOutboundMessage);
  const resolvePayerGatewayAction = useAction(api.actions.payerContactResolver.resolvePayerGateway);
  const syncInboxesAction = useAction(api.actions.agentMail.syncInboxes);

  const isSyncingRef = useRef(false);
  const lastSyncTimeRef = useRef(0);

  const syncInboxes = useCallback(async () => {
    if (isSyncingRef.current || !syncInboxesAction) return;
    isSyncingRef.current = true;
    setIsSyncingInboxes(true);
    try {
      await syncInboxesAction({ limit: 30 });
      lastSyncTimeRef.current = Date.now();
    } catch (err) {
      console.warn("Failed to sync AgentMail inboxes:", err);
    } finally {
      isSyncingRef.current = false;
      setIsSyncingInboxes(false);
    }
  }, [syncInboxesAction]);

  // Synchronize on mount and when window regains focus only if communications view is active
  useEffect(() => {
    if (!isCommunicationsActive) return;

    // Initial check when opening communications view
    const now = Date.now();
    if (now - lastSyncTimeRef.current > 60_000) {
      syncInboxes();
    }

    const onFocus = () => {
      const focusNow = Date.now();
      if (focusNow - lastSyncTimeRef.current > 120_000) {
        syncInboxes();
      }
    };

    window.addEventListener("focus", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
    };
  }, [syncInboxes, isCommunicationsActive]);

  // Send an outbound reply/addendum message via live AgentMail
  const sendMessage = useCallback(
    async (text: string) => {
      if (!claim?._id) return;

      const recipient =
        threads?.[0]?.payerEmail ||
        claim.payerContact?.officialAppealsEmail;

      if (sendOutboundAction) {
        await sendOutboundAction({
          claimId: claim._id as Id<"claims">,
          threadId: activeThreadId,
          text,
          customRecipient: recipient,
        });
      } else {
        const sender = claim.assignedAgentEmail;
        let threadId = activeThreadId;
        if (!threadId) {
          threadId = await getOrCreateThreadMutation({
            claimId: claim._id as Id<"claims">,
            agentEmail: sender,
            payerEmail: recipient || "appeals@payer.com",
            subject: `Claim #${claim.claimNumber} Appeal Addendum`,
          });
        }

        await insertMessageMutation({
          threadId: threadId as Id<"emailThreads">,
          claimId: claim._id as Id<"claims">,
          direction: "outbound",
          sender,
          recipient: recipient || "appeals@payer.com",
          subject: `Addendum: Claim #${claim.claimNumber}`,
          bodyHtml: `<p>${text}</p>`,
          bodyText: text,
          hasAttachments: false,
        });
      }
    },
    [claim, threads, activeThreadId, sendOutboundAction, getOrCreateThreadMutation, insertMessageMutation]
  );

  // Dispatch full appeal packet
  const dispatchAppeal = useCallback(
    async (recipientEmail?: string, dispatchMode?: string, appealId?: string) => {
      if (!claim?._id) throw new Error("No claim selected for dispatch");

      return await dispatchAction({
        claimId: claim._id as Id<"claims">,
        appealId: appealId ? (appealId as Id<"appeals">) : undefined,
        recipientEmail,
        dispatchMode,
      });
    },
    [claim, dispatchAction]
  );

  // Autonomous Firecrawl live search for insurer intake email
  const resolvePayerGateway = useCallback(
    async (forceWebSearch?: boolean) => {
      if (!claim?._id) return null;

      return await resolvePayerGatewayAction({
        claimId: claim._id as Id<"claims">,
        forceWebSearch,
      });
    },
    [claim, resolvePayerGatewayAction]
  );

  return {
    threads: threads || [],
    messages: threadDetails?.messages || [],
    auditLogs: claimId ? claimAuditLogs || [] : recentAuditLogs || [],
    isLoadingCommunications: claimId ? threads === undefined : false,
    isLoadingAudit: claimId ? claimAuditLogs === undefined : recentAuditLogs === undefined,
    sendMessage,
    dispatchAppeal,
    resolvePayerGateway,
    syncInboxes,
    isSyncingInboxes,
  };
}
