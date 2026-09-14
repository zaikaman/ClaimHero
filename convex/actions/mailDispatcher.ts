"use node";

import { action, internalAction, type ActionCtx } from "../_generated/server";
import { v } from "convex/values";
import { api, internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { requireClaimOwnerAction } from "../lib/auth";
import { createChatCompletion } from "../lib/openai";
import {
  formatMessageIdHeader,
  getSharedAgentMailboxes,
  replyAgentMailMessage,
  sendAgentMailMessage,
  type AgentMailSendResult,
} from "../lib/agentMail";
import {
  formatAppealEmail,
  formatCorrespondenceEmail,
} from "../lib/appealEmail";
import { rateLimiter } from "../lib/rateLimiter";
import { resolveClaimPatientName } from "../claims";
import { ensureAppealPdfStored } from "../lib/pdfGenerator";
import type { ResolvedPayerContact } from "./payerContactResolver";

export interface DispatchReceipt {
  transmissionId: string;
  claimId: string;
  sender: string;
  recipient: string;
  subject: string;
  dispatchedAt: number;
  status: "delivered" | "queued";
  pdfMissing?: boolean;
  humanApproved?: boolean;
  approvedBy?: string;
  approvalNotes?: string;
}

interface ClaimMailboxes {
  claimInboxId: string;
  claimEmail: string;
}

function withAgentMailMessageId<T extends Record<string, unknown>>(
  payload: T,
  messageId: string | undefined,
  outboundId?: string | undefined
): T & { agentMailMessageId?: string; outboundId?: string } {
  const res: Record<string, unknown> = { ...payload };
  if (messageId) {
    res.agentMailMessageId = messageId;
  }
  if (outboundId) {
    res.outboundId = outboundId;
  }
  return res as T & { agentMailMessageId?: string; outboundId?: string };
}

async function ensureClaimMailboxes(
  ctx: ActionCtx,
  claim: { _id: Id<"claims"> }
): Promise<ClaimMailboxes> {
  if (!process.env.AGENTMAIL_API_KEY?.trim()) {
    throw new Error("AgentMail is not configured. Set AGENTMAIL_API_KEY before sending email.");
  }

  const mailboxes = getSharedAgentMailboxes();
  await ctx.runMutation(internal.claims.setAgentMailInboxes, {
    claimId: claim._id,
    claimInboxId: mailboxes.senderInboxId,
    claimInboxEmail: mailboxes.senderEmail,
    status: "shared",
  });

  return {
    claimInboxId: mailboxes.senderInboxId,
    claimEmail: mailboxes.senderEmail,
  };
}

/**
 * Appellate Dispatch Action: Transmits full appeal brief and exhibits via AgentMail
 * Supports 2 modes:
 * - "custom_email": Transmits to typed-in test email inbox
 * - "official_payer": Transmits to the insurer's official verified appellate gateway
 */
export const dispatchAppealPacketArgs = {
  claimId: v.id("claims"),
  appealId: v.optional(v.id("appeals")),
  recipientEmail: v.optional(v.string()),
  customRecipient: v.optional(v.string()),
  customSubject: v.optional(v.string()),
  dispatchMode: v.optional(v.string()), // "custom_email" | "official_payer"
  waiveRedaction: v.optional(v.boolean()),
  humanApproved: v.optional(v.boolean()),
  approvedBy: v.optional(v.string()),
  approvalNotes: v.optional(v.string()),
  sender: v.optional(
    v.object({
      name: v.string(),
      credentials: v.optional(v.string()),
      email: v.optional(v.string()),
      phone: v.optional(v.string()),
    })
  ),
};

/**
 * Appeal Packet Dispatch Core Logic:
 * Shared between public user-facing action and internal durable workflow execution.
 */
export async function performDispatchAppealPacket(
  ctx: ActionCtx,
  args: {
    claimId: Id<"claims">;
    appealId?: Id<"appeals">;
    recipientEmail?: string;
    customRecipient?: string;
    customSubject?: string;
    dispatchMode?: string;
    waiveRedaction?: boolean;
    humanApproved?: boolean;
    approvedBy?: string;
    approvalNotes?: string;
    sender?: {
      name: string;
      credentials?: string;
      email?: string;
      phone?: string;
    };
  },
  claim: Doc<"claims"> & { patient?: Doc<"patients"> | null },
  userId?: string
): Promise<DispatchReceipt> {
  // Mandatory Human Review Gate 1: Claim Status must be "ready_for_review"
  if (claim.status !== "ready_for_review") {
    throw new Error(
      `Cannot dispatch appeal: claim status is "${claim.status}". Mandatory human review requires claim status to be "ready_for_review" before appellate dispatch.`
    );
  }

  const rawPatientName = claim.patient?.name || claim.patientName;
  const patientName = resolveClaimPatientName(rawPatientName, claim.claimNumber, claim.patient?.memberId);
  const isPatientUnspecified =
    !patientName ||
    patientName === "Not specified in denial notice" ||
    patientName.startsWith("[PATIENT") ||
    patientName === "Patient" ||
    patientName === "Patient Record";

  const senderDetails = args.sender || claim.appealContext?.sender;
  const hasValidSender = Boolean(
    senderDetails?.name?.trim() && (senderDetails.email?.trim() || senderDetails.phone?.trim())
  );

  if (isPatientUnspecified && !hasValidSender) {
    throw new Error(
      "Cannot dispatch appeal: patient name was not specified in denial notice. Please supply sender details before dispatching."
    );
  }

  if (userId) {
    // Enforce rate limiting per user
    const limitStatus = await rateLimiter.limit(ctx, "mailDispatcher", {
      key: userId || "global",
    });
    if (!limitStatus.ok) {
      throw new Error(
        `Rate limit reached for outbound payer transmission. Please retry in ${Math.ceil((limitStatus.retryAfter || 1000) / 1000)} seconds.`
      );
    }
  }

    let appeal: Doc<"appeals"> | null = null;
    if (args.appealId) {
      appeal = await ctx.runQuery(internal.appeals.getByIdInternal, {
        appealId: args.appealId,
      });
    }
    if (!appeal) {
      appeal = await ctx.runQuery(internal.appeals.getLatestByClaimInternal, {
        claimId: args.claimId,
      });
    }

    if (!appeal) {
      throw new Error(`No appeal brief found for claim ${args.claimId}`);
    }

    // Mandatory Human Review Gate 2: Explicit Human Approval Record Required
    const hasExistingApproval = Boolean(appeal.isHumanApproved);
    const hasExplicitApprovalArg = Boolean(args.humanApproved);

    if (!hasExistingApproval && !hasExplicitApprovalArg) {
      throw new Error(
        "Cannot dispatch appeal: explicit human approval is required. In accordance with clinical safety protocols, an authorized human must approve every clinical assertion, legal assertion, recipient, and outbound message before dispatch."
      );
    }

    let effectiveApprover = appeal.approvedBy || args.approvedBy;

    // Persist human approval record if not already recorded on the appeal
    if (!hasExistingApproval) {
      effectiveApprover =
        args.approvedBy ||
        (hasValidSender && senderDetails?.name ? senderDetails.name : null) ||
        (patientName && !isPatientUnspecified ? `Authorized Representative for ${patientName}` : null) ||
        "Authorized Human Reviewer";

      await ctx.runMutation(internal.appeals.recordHumanApprovalInternal, {
        appealId: appeal._id,
        claimId: claim._id,
        approvedBy: effectiveApprover,
        notes: args.approvalNotes || "Human review and authorization confirmed at appellate dispatch gate.",
      });
    }

    const payer = claim.patient?.insurancePayer || "Health Insurer";
    const mode =
      args.dispatchMode === "custom_email" ||
      ((args.recipientEmail || args.customRecipient)?.includes("@") && args.dispatchMode !== "official_payer")
        ? "custom_email"
        : "official_payer";

    let recipient = (args.recipientEmail || args.customRecipient)?.trim();
    if (mode === "official_payer") {
      let reverifiedContact: ResolvedPayerContact | null = null;
      if (typeof ctx.runAction === "function") {
        try {
          reverifiedContact = await ctx.runAction(
            api.actions.payerContactResolver.reverifyPayerContactForDispatch,
            {
              claimId: args.claimId,
              intendedChannel: "email",
            }
          );
        } catch (reverifyErr) {
          console.warn("Live pre-dispatch re-verification warning:", reverifyErr);
        }
      }

      if (reverifiedContact?.isVerified && reverifiedContact.officialAppealsEmail) {
        recipient = reverifiedContact.officialAppealsEmail;
      } else if (
        claim.payerContact?.isVerified &&
        claim.payerContact.source === "document_ocr" &&
        claim.payerContact.officialAppealsEmail
      ) {
        recipient = claim.payerContact.officialAppealsEmail;
      } else if (args.recipientEmail || args.customRecipient) {
        recipient = (args.recipientEmail || args.customRecipient)?.trim();
      } else {
        const portal = (reverifiedContact?.intakePortalUrl || claim.payerContact?.intakePortalUrl)
          ? `Official Online Portal (${reverifiedContact?.portalName || claim.payerContact?.portalName || "Online Portal"})`
          : "";
        const fax = (reverifiedContact?.appealsFax || claim.payerContact?.appealsFax)
          ? `Appellate Fax (${reverifiedContact?.appealsFax || claim.payerContact?.appealsFax})`
          : "";
        const channels = [portal, fax].filter(Boolean).join(" or ") || "Certified Mail";
        throw new Error(
          `Verified appeals email for ${payer} could not be confirmed via live verification. Please continue via their verified intake route (${channels}) or provide a recipient email for dispatch.`
        );
      }
    }

    if (!recipient) {
      if (mode === "custom_email") {
        throw new Error(`A valid recipient email address is required for custom email dispatch.`);
      }
      const portal = claim.payerContact?.intakePortalUrl ? `Official Online Portal (${claim.payerContact.portalName || claim.payerContact.intakePortalUrl})` : "";
      const fax = claim.payerContact?.appealsFax ? `Appellate Fax (${claim.payerContact.appealsFax})` : "";
      const channels = [portal, fax].filter(Boolean).join(" or ") || "Certified Mail";
      throw new Error(`Verified appeals email for ${payer} could not be confirmed. Please continue via their verified intake route (${channels}) or provide a recipient email for dispatch.`);
    }

    const mailboxes = await ensureClaimMailboxes(ctx, claim);
    const sender = mailboxes.claimEmail;
    const finalRecipient = recipient;
    // Never address appeal transmissions to ClaimHero's own sender inbox:
    // self-mail re-enters the shared inbox and is re-ingested as a phantom
    // payer response, amplifying alert/auto-pilot loops.
    if (
      finalRecipient.toLowerCase() === sender.toLowerCase() ||
      finalRecipient.toLowerCase() === mailboxes.claimInboxId.toLowerCase()
    ) {
      throw new Error(
        `Refusing to address appeal transmission for claim ${claim.claimNumber} to ClaimHero's own sender inbox (${finalRecipient}); check dispatch routing before retrying.`
      );
    }
    const claimTag = `[ClaimHero #${claim.claimNumber}]`;
    const rawSubject =
      args.customSubject ||
      `Appeal request | Claim #${claim.claimNumber} | ${payer}`;
    const subject = rawSubject.includes(claimTag) ? rawSubject : `${claimTag} ${rawSubject}`;
    const transmissionId = `tx_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const isCustomEmail = mode === "custom_email";
    const waiveRedaction = Boolean(args.waiveRedaction);

    if (isCustomEmail && waiveRedaction) {
      await ctx.runMutation(internal.auditLogs.logEventInternal, {
        claimId: args.claimId,
        eventType: "hipaa_redaction_waived",
        actor: "User Consent Gate",
        details: `User explicitly waived PII de-identification for outbound transmission to ${finalRecipient}.`,
      });
    }

    const briefMarkdown = appeal.fullAppealMarkdown;

    const appealEmail = formatAppealEmail(briefMarkdown, {
      claimNumber: claim.claimNumber,
      payer,
      patientName,
      serviceDate: claim.serviceDate,
      deniedAmount: claim.deniedAmount,
      denialReason: [claim.denialReasonCode, claim.denialReasonDescription].filter(Boolean).join(" - "),
      cptCodes: claim.cptCodes,
      providerName: claim.providerName,
    });

    // Automatically pull compiled PDF brief from Convex Storage (or compile court-ready PDF if not yet stored)
    let storedPdf: { storageId: Id<"_storage">; buffer: Buffer; filename: string } | null = null;
    let pdfMissing = false;
    try {
      storedPdf = await ensureAppealPdfStored(ctx, claim, appeal);
    } catch (pdfErr) {
      console.warn("Failed to pull or compile PDF brief for outbound transmission:", pdfErr);
      pdfMissing = true;
    }
    if (!storedPdf) {
      pdfMissing = true;
    }

    if (pdfMissing) {
      await ctx.runMutation(internal.auditLogs.logEventInternal, {
        claimId: args.claimId,
        eventType: "appeal_dispatch_pdf_missing_warning",
        actor: "AgentMail Dispatcher",
        details: "Warning: Appeal email was transmitted without compiled PDF brief attachment because PDF compilation/storage could not be completed.",
      });
    }

    const outgoingAttachments = storedPdf
      ? [
          {
            filename: storedPdf.filename,
            content: storedPdf.buffer.toString("base64"),
            contentType: "application/pdf",
          },
        ]
      : undefined;

    const liveTransmission = await sendAgentMailMessage({
      inboxId: mailboxes.claimInboxId,
      to: finalRecipient,
      subject,
      text: appealEmail.text,
      html: appealEmail.html,
      attachments: outgoingAttachments,
      ctx,
    });

    const recordedThreadId = liveTransmission.threadId || liveTransmission.messageId;
    if (recordedThreadId) {
      await ctx.runMutation(internal.claims.setAgentMailThreadIdInternal, {
        claimId: args.claimId,
        agentMailThreadId: recordedThreadId,
      });
    }

    // 3. Ensure email thread exists
    const threadId = await ctx.runMutation(internal.emails.getOrCreateThreadInternal, {
      claimId: args.claimId,
      agentEmail: sender,
      payerEmail: finalRecipient,
      subject,
    });

    const messageAttachments = storedPdf
      ? [
          {
            storageId: storedPdf.storageId,
            filename: storedPdf.filename,
            contentType: "application/pdf",
            size: storedPdf.buffer.byteLength,
          },
        ]
      : undefined;

    // 4. Record outbound message in database with attachment metadata
    await ctx.runMutation(internal.emails.insertMessageInternal, withAgentMailMessageId({
      threadId,
      claimId: args.claimId,
      direction: "outbound",
      sender,
      recipient: finalRecipient,
      subject,
      bodyHtml: appealEmail.html,
      bodyText: appealEmail.text,
      hasAttachments: Boolean(storedPdf),
      attachments: messageAttachments,
    }, liveTransmission.messageId, liveTransmission.outboundId));

    // 5. Update claim status to dispatched
    await ctx.runMutation(internal.claims.updateStatusInternal, {
      claimId: args.claimId,
      status: "dispatched",
      actor: "AgentMail Outbound Dispatcher",
      details: `Transmitted legal appeal memorandum to ${payer} (${finalRecipient}) via dedicated inbox ${sender}.`,
    });

    return {
      transmissionId,
      claimId: args.claimId,
      sender,
      recipient: finalRecipient,
      subject,
      dispatchedAt: Date.now(),
      status: "delivered",
      pdfMissing,
      humanApproved: true,
      approvedBy: effectiveApprover,
    };
  }

/**
 * Outbound Appeal Packet Dispatch Action (User-facing)
 */
export const dispatchAppealPacket = action({
  args: dispatchAppealPacketArgs,
  handler: async (
    ctx,
    args
  ): Promise<DispatchReceipt> => {
    const { claim, userId } = await requireClaimOwnerAction(ctx, args.claimId);
    return await performDispatchAppealPacket(ctx, args, claim as Doc<"claims"> & { patient?: Doc<"patients"> | null }, userId);
  },
});

/**
 * Internal Outbound Appeal Packet Dispatch Action:
 * For durable workflows and scheduled tasks without active user session.
 */
export const dispatchAppealPacketInternal = internalAction({
  args: dispatchAppealPacketArgs,
  handler: async (
    ctx,
    args
  ): Promise<DispatchReceipt> => {
    const claim = (await ctx.runQuery(internal.claims.getByIdInternal, {
      claimId: args.claimId,
    })) as (Doc<"claims"> & { patient?: Doc<"patients"> | null }) | null;
    if (!claim) {
      throw new Error(`Claim ${args.claimId} not found`);
    }
    return await performDispatchAppealPacket(ctx, args, claim, claim.userId);
  },
});

const sendOutboundMessageArgs = {
  claimId: v.id("claims"),
  threadId: v.optional(v.id("emailThreads")),
  text: v.string(),
  customRecipient: v.optional(v.string()),
  customSubject: v.optional(v.string()),
  waiveRedaction: v.optional(v.boolean()),
};

async function performSendOutboundMessage(
  ctx: ActionCtx,
  args: {
    claimId: Id<"claims">;
    threadId?: Id<"emailThreads">;
    text: string;
    customRecipient?: string;
    customSubject?: string;
    waiveRedaction?: boolean;
  },
  claim: Doc<"claims"> & { patient?: Doc<"patients"> | null }
) {
  let threadData: {
    thread: Doc<"emailThreads"> | null;
    messages: Doc<"emailMessages">[];
  } | null = null;

  if (args.threadId) {
    threadData = await ctx.runQuery(internal.emails.getThreadWithMessagesInternal, {
      threadId: args.threadId,
    });
  }
  if (!threadData) {
    const threads = await ctx.runQuery(internal.emails.listThreadsByClaimInternal, {
      claimId: args.claimId,
    });
    if (threads && threads.length > 0 && threads[0]?._id) {
      threadData = await ctx.runQuery(internal.emails.getThreadWithMessagesInternal, {
        threadId: threads[0]._id,
      });
    }
  }

  const recipient =
    args.customRecipient ||
    threadData?.thread?.payerEmail ||
    claim.payerContact?.officialAppealsEmail;

  const payer = claim.patient?.insurancePayer || "Health Insurer";

  if (
    !args.customRecipient &&
    !threadData?.thread?.payerEmail &&
    claim.payerContact?.officialAppealsEmail
  ) {
    if (!claim.payerContact.isVerified || claim.payerContact.source === "registry_fallback") {
      throw new Error(
        `Verified contact for ${payer} could not be confirmed via live verification (${claim.payerContact.registryDate || "historical baseline"}). Please provide a recipient email or use the verified intake route on file.`
      );
    }
  }

  const claimTag = `[ClaimHero #${claim.claimNumber}]`;

  let subject: string;
  if (args.customSubject?.trim()) {
    const rawSubject = args.customSubject.trim();
    subject = rawSubject.includes(claimTag) ? rawSubject : `${claimTag} ${rawSubject}`;
  } else if (threadData?.thread?.subject?.trim()) {
    const baseSubject = threadData.thread.subject.trim();
    subject = baseSubject.match(/^re:\s*/i) ? baseSubject : `Re: ${baseSubject}`;
  } else {
    const rawSubject = `Re: Formal Medical Appeal | Claim #${claim.claimNumber} | Addendum`;
    subject = rawSubject.includes(claimTag) ? rawSubject : `${claimTag} ${rawSubject}`;
  }

  const priorMessages = threadData?.messages || [];
  const messageIds = priorMessages
    .map((m) => m.agentMailMessageId?.trim())
    .filter((id): id is string => Boolean(id));

  // Find the last inbound message received in this correspondence, if any
  const lastInbound = [...priorMessages].reverse().find(
    (m) => m.direction === "inbound" && m.agentMailMessageId?.trim()
  );
  const lastInboundMessageId = lastInbound?.agentMailMessageId?.trim();

  const lastMsgId = messageIds[messageIds.length - 1];
  const inReplyTo = lastMsgId ? formatMessageIdHeader(lastMsgId) : undefined;
  const references = messageIds.length > 0
    ? messageIds.map(formatMessageIdHeader).join(" ")
    : undefined;

  const headers: Record<string, string> = {};
  if (inReplyTo) headers["In-Reply-To"] = inReplyTo;
  if (references) headers["References"] = references;

  const waiveRedaction = Boolean(args.waiveRedaction);
  const isCustomEmail = Boolean(args.customRecipient);

  if (isCustomEmail && waiveRedaction) {
    await ctx.runMutation(internal.auditLogs.logEventInternal, {
      claimId: args.claimId,
      eventType: "hipaa_redaction_waived",
      actor: "User Consent Gate",
      details: `User explicitly waived PII de-identification for outbound transmission to ${recipient}.`,
    });
  }

  const outboundText = args.text;
  const rawPatientName = claim.patient?.name || claim.patientName;
  const patientName = resolveClaimPatientName(rawPatientName, claim.claimNumber, claim.patient?.memberId);

  const correspondenceEmail = formatCorrespondenceEmail(outboundText, {
    claimNumber: claim.claimNumber,
    payer,
    patientName,
    serviceDate: claim.serviceDate,
    deniedAmount: claim.deniedAmount,
    denialReason: claim.denialReasonCode,
    cptCodes: claim.cptCodes,
    providerName: claim.providerName,
  }, "Appeal Addendum");

  const mailboxes = await ensureClaimMailboxes(ctx, claim);
  const sender = mailboxes.claimEmail;
  const resolvedRecipient = recipient;
  if (!resolvedRecipient) {
    throw new Error(`No email recipient is configured for claim ${claim.claimNumber}.`);
  }
  // Never address payer correspondence to ClaimHero's own sender inbox: such
  // self-mail re-enters the shared inbox and is re-ingested as a phantom
  // payer response, amplifying alert/auto-pilot loops.
  if (
    resolvedRecipient.toLowerCase() === sender.toLowerCase() ||
    resolvedRecipient.toLowerCase() === mailboxes.claimInboxId.toLowerCase()
  ) {
    throw new Error(
      `Refusing to address payer correspondence for claim ${claim.claimNumber} to ClaimHero's own sender inbox (${resolvedRecipient}); check thread routing before retrying.`
    );
  }

  let liveTransmission: AgentMailSendResult | null = null;
  if (lastInboundMessageId) {
    try {
      liveTransmission = await replyAgentMailMessage({
        inboxId: mailboxes.claimInboxId,
        messageId: lastInboundMessageId,
        to: resolvedRecipient,
        text: correspondenceEmail.text,
        html: correspondenceEmail.html,
        ...(Object.keys(headers).length > 0 ? { headers } : {}),
        ctx,
      });
    } catch (replyErr) {
      console.warn("AgentMail reply endpoint failed, falling back to in-thread send:", replyErr);
    }
  }

  if (!liveTransmission) {
    liveTransmission = await sendAgentMailMessage({
      inboxId: mailboxes.claimInboxId,
      to: resolvedRecipient,
      subject,
      text: correspondenceEmail.text,
      html: correspondenceEmail.html,
      ...(Object.keys(headers).length > 0 ? { headers } : {}),
      ctx,
    });
  }

  const recordedThreadId = liveTransmission.threadId || liveTransmission.messageId;
  if (recordedThreadId) {
    await ctx.runMutation(internal.claims.setAgentMailThreadIdInternal, {
      claimId: args.claimId,
      agentMailThreadId: recordedThreadId,
    });
  }

  const threadId = await ctx.runMutation(internal.emails.getOrCreateThreadInternal, {
    claimId: args.claimId,
    agentEmail: sender,
    payerEmail: resolvedRecipient,
    subject,
  });

  await ctx.runMutation(internal.emails.insertMessageInternal, withAgentMailMessageId({
    threadId,
    claimId: args.claimId,
    direction: "outbound",
    sender,
    recipient: resolvedRecipient,
    subject,
    bodyHtml: correspondenceEmail.html,
    bodyText: correspondenceEmail.text,
    hasAttachments: false,
  }, liveTransmission.messageId, liveTransmission.outboundId));

  return { success: true };
}

/**
 * Send Outbound Communication Message via AgentMail (Public Action with Claim Ownership Guard)
 */
export const sendOutboundMessage = action({
  args: sendOutboundMessageArgs,
  handler: async (ctx, args) => {
    const { claim } = await requireClaimOwnerAction(ctx, args.claimId);
    return await performSendOutboundMessage(ctx, args, claim);
  },
});

/**
 * Send Outbound Communication Message via AgentMail (Internal Action for Server Automation)
 */
export const sendOutboundMessageInternal = internalAction({
  args: sendOutboundMessageArgs,
  handler: async (
    ctx,
    args
  ): Promise<{ success: boolean }> => {
    const claim = await ctx.runQuery(internal.claims.getByIdInternal, {
      claimId: args.claimId,
    });

    if (!claim) {
      throw new Error(`Claim ${args.claimId} not found`);
    }

    return await performSendOutboundMessage(ctx, args, claim);
  },
});

/**
 * Synthesizes an on-demand AI Smart Auto-Reply clinical rebuttal to an inbound message
 */
export const generateAutoReplyDraft = action({
  args: {
    claimId: v.id("claims"),
    inboundMessageId: v.optional(v.id("emailMessages")),
    customPayerInquiry: v.optional(v.string()),
    forceRegenerate: v.optional(v.boolean()),
  },
  handler: async (
    ctx,
    args
  ): Promise<{ success: boolean; draftText: string; suggestedSubject: string }> => {
    const { claim } = await requireClaimOwnerAction(ctx, args.claimId);

    if (claim.status === "won") {
      return {
        success: true,
        draftText: "",
        suggestedSubject: `Re: Claim #${claim.claimNumber} - Overturned and Approved (No Reply Required)`,
      };
    }

    // Backend Deduplication: If inbound message already contains a generated draft and caller didn't explicitly force regenerate, reuse existing draft
    if (args.inboundMessageId && !args.forceRegenerate) {
      const existingMsg = await ctx.runQuery(internal.emails.getMessageByIdInternal, {
        messageId: args.inboundMessageId,
      });
      if (existingMsg?.autoReplyDraft && existingMsg.autoReplyDraft.trim()) {
        return {
          success: true,
          draftText: existingMsg.autoReplyDraft.trim(),
          suggestedSubject: `Re: Claim #${claim.claimNumber} - Clinical Addendum Response`,
        };
      }
    }

    const appeal = await ctx.runQuery(internal.appeals.getLatestByClaimInternal, {
      claimId: args.claimId,
    });

    const evidences = await ctx.runQuery(internal.clinicalEvidences.listByClaimInternal, {
      claimId: args.claimId,
    });

    const payer = claim.insurancePayer || "Health Insurer";
    const patientName = claim.patientName || "Patient";

    const systemPrompt = `You are a Board-Certified Physician Appeal Specialist & ERISA Appellate Counsel for ClaimHero.
You are drafting an immediate Clinical Rebuttal Addendum in response to an insurance payer's (${payer}) request for additional documentation or clarifying review for Claim #${claim.claimNumber} (Patient: ${patientName}).
Prior Appeal Summary: ${appeal?.executiveSummary || "Initial Level 1 ERISA Appeal Brief on file."}
Clinical Context:
- CPT Codes: [${(claim.cptCodes || []).join(", ")}]
- ICD-10 Diagnoses: [${(claim.icd10Codes || []).join(", ")}]
- Denied Amount: $${claim.deniedAmount}
- Denial Reason: ${claim.denialReasonCode} - ${claim.denialReasonDescription}
- Provider: ${claim.providerName}
- Documented Clinical Facts: ${JSON.stringify(claim.appealContext?.clinicalFacts || {})}
- Clinical Evidence & CPB Quotes: ${(evidences || []).map((e: { title: string; citationClause: string }) => `${e.title}: ${e.citationClause}`).join("\n")}

Guidelines:
1. Provide a direct, authoritative, and respectful clinical response that directly supplies the demanded records/explanations.
2. Formally assert statutory ERISA compliance (29 C.F.R. § 2560.503-1) requiring full and fair review within mandated timelines.
3. Reiterate that the clinical record conclusively demonstrates medical necessity under published clinical criteria.
4. Keep the letter structured with a clear salutation, 2-3 focused clinical paragraphs, and a formal closing. Do not use Markdown headings or AI meta-language.`;

    const userPrompt = args.customPayerInquiry
      ? `The payer sent the following specific inquiry or request:\n"${args.customPayerInquiry}"\n\nGenerate the complete Clinical Addendum response.`
      : `Generate a formal Clinical Addendum response providing conservative therapy verification, radiographic diagnostics, and peer-reviewed necessity proof to secure immediate claim overturn.`;

    const draft = await createChatCompletion({
      systemPrompt,
      userPrompt,
      temperature: 0.2,
    });

    const trimmedDraft = draft.trim();

    if (args.inboundMessageId && trimmedDraft) {
      try {
        await ctx.runMutation(internal.emails.updateMessageAnalysisInternal, {
          messageId: args.inboundMessageId,
          autoReplyDraft: trimmedDraft,
          autoReplyStatus: "pending",
        });
      } catch (patchErr) {
        console.warn("Failed to persist generated auto-reply draft to message:", patchErr);
      }
    }

    return {
      success: true,
      draftText: trimmedDraft,
      suggestedSubject: `Re: Formal Medical Appeal | Claim #${claim.claimNumber} | Clinical Reconsideration Addendum`,
    };
  },
});

/**
 * Autonomous dispatch is disabled by clinical safety policy.
 * Safer product rule: AI may prepare, classify, cite, and recommend.
 * A human must approve every clinical assertion, legal assertion, recipient, and outbound message.
 */
async function performDispatchScheduledAutoPilotReply(
  ctx: ActionCtx,
  args: {
    messageId: Id<"emailMessages">;
    claimId: Id<"claims">;
    threadId: Id<"emailThreads">;
  }
): Promise<{ executed: boolean; reason?: string; claimNumber?: string }> {
  const claim = await ctx.runQuery(internal.claims.getByIdInternal, {
    claimId: args.claimId,
  });

  await ctx.runMutation(internal.auditLogs.logEventInternal, {
    claimId: args.claimId,
    ...(claim?.userId ? { userId: claim.userId } : {}),
    eventType: "appeal_review_requested",
    actor: "Sentinel Safety Guard",
    details: `Autonomous dispatch blocked for Claim #${claim?.claimNumber || "Unknown"}. Mandatory human review is enforced: an authorized operator must approve every clinical assertion, legal assertion, recipient, and outbound message.`,
  });

  return { executed: false, reason: "mandatory_human_review_required", claimNumber: claim?.claimNumber };
}

/**
 * Scheduled execution action for a single inbound message.
 * Enforces mandatory human review policy and rejects unapproved autonomous dispatch.
 */
export const dispatchScheduledAutoPilotReply = internalAction({
  args: {
    messageId: v.id("emailMessages"),
    claimId: v.id("claims"),
    threadId: v.id("emailThreads"),
  },
  handler: async (
    ctx,
    args
  ): Promise<{ executed: boolean; reason?: string; claimNumber?: string }> => {
    return await performDispatchScheduledAutoPilotReply(ctx, args);
  },
});

/**
 * Deprecated cron sweep action retained for backwards compatibility.
 * Autonomous dispatch without human approval is disabled.
 */
export const sweepPendingAutoPilotReplies = internalAction({
  args: {
    customMaxAgeMs: v.optional(v.number()),
  },
  handler: async (): Promise<{ totalFound: number; dispatchedCount: number; skippedCount: number }> => {
    return {
      totalFound: 0,
      dispatchedCount: 0,
      skippedCount: 0,
    };
  },
});



