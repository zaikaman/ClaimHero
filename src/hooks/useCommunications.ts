import { useCallback } from "react";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Claim, EmailThread, EmailMessage, AuditLog } from "../types";

const convexApi = api as any;

export function useCommunications(claim?: Claim | null) {
  const claimId = claim?._id;

  // Query threads for this claim
  const threads = useQuery(
    convexApi.emails.listThreadsByClaim,
    claimId ? { claimId: claimId as any } : "skip"
  ) as EmailThread[] | undefined;

  const activeThreadId = threads && threads.length > 0 ? threads[0]?._id : undefined;

  // Query thread details and messages
  const threadDetails = useQuery(
    convexApi.emails.getThreadWithMessages,
    activeThreadId ? { threadId: activeThreadId as any } : "skip"
  ) as { thread: EmailThread; messages: EmailMessage[] } | null | undefined;

  // Query audit logs for this claim or recent portfolio-wide logs
  const claimAuditLogs = useQuery(
    convexApi.auditLogs.listByClaim,
    claimId ? { claimId: claimId as any } : "skip"
  ) as AuditLog[] | undefined;

  const recentAuditLogs = useQuery(
    convexApi.auditLogs.listRecent,
    { limit: 30 }
  ) as AuditLog[] | undefined;

  const insertMessageMutation = useMutation(convexApi.emails.insertMessage);
  const getOrCreateThreadMutation = useMutation(convexApi.emails.getOrCreateThread);
  const dispatchAction = useAction(
    convexApi["actions/mailDispatcher"]?.dispatchAppealPacket ||
    convexApi.actions?.mailDispatcher?.dispatchAppealPacket
  );

  // Send an outbound reply/addendum message
  const sendMessage = useCallback(
    async (text: string) => {
      if (!claim?._id) return;

      const sender = claim.assignedAgentEmail;
      const recipient =
        threads?.[0]?.payerEmail ||
        `appeals@${claim.patient?.insurancePayer?.toLowerCase().replace(/[^a-z]/g, "") || "payer"}.com`;

      let threadId = activeThreadId;
      if (!threadId) {
        threadId = await getOrCreateThreadMutation({
          claimId: claim._id as any,
          agentEmail: sender,
          payerEmail: recipient,
          subject: `Claim #${claim.claimNumber} Appeal Addendum`,
        });
      }

      await insertMessageMutation({
        threadId: threadId as any,
        claimId: claim._id as any,
        direction: "outbound",
        sender,
        recipient,
        subject: `Addendum: Claim #${claim.claimNumber}`,
        bodyHtml: `<p>${text}</p>`,
        bodyText: text,
        hasAttachments: false,
      });
    },
    [claim, threads, activeThreadId, getOrCreateThreadMutation, insertMessageMutation]
  );

  // Dispatch full appeal packet
  const dispatchAppeal = useCallback(
    async (appealId?: string) => {
      if (!claim?._id) throw new Error("No claim selected for dispatch");

      return await dispatchAction({
        claimId: claim._id as any,
        appealId: appealId ? (appealId as any) : undefined,
      });
    },
    [claim, dispatchAction]
  );

  return {
    threads: threads || [],
    messages: threadDetails?.messages || [],
    auditLogs: claimId ? claimAuditLogs || [] : recentAuditLogs || [],
    isLoadingCommunications: claimId ? threads === undefined : false,
    isLoadingAudit: claimId ? claimAuditLogs === undefined : recentAuditLogs === undefined,
    sendMessage,
    dispatchAppeal,
  };
}
