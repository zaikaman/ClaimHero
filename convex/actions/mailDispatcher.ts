"use node";

import { action, internalAction, type ActionCtx } from "../_generated/server";
import { v } from "convex/values";
import { api, internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { requireClaimOwnerAction } from "../lib/auth";
import { createChatCompletion, createStructuredCompletion } from "../lib/openai";
import {
  formatCorrespondenceTranscript,
  isAiAdjudicatorAddress,
} from "../lib/aiAdjudicator";
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

export interface DispatchReceipt {
  transmissionId: string;
  claimId: string;
  sender: string;
  recipient: string;
  subject: string;
  dispatchedAt: number;
  status: "delivered" | "queued";
  adjudicationDetermination?: string;
}

interface ClaimMailboxes {
  claimInboxId: string;
  claimEmail: string;
  adjudicatorInboxId?: string;
  adjudicatorEmail?: string;
}

function withAgentMailMessageId<T extends Record<string, unknown>>(
  payload: T,
  messageId: string | undefined
): T & { agentMailMessageId?: string } {
  if (messageId) {
    return { ...payload, agentMailMessageId: messageId };
  }
  return payload;
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
    adjudicatorInboxId: mailboxes.adjudicatorInboxId,
    adjudicatorEmail: mailboxes.adjudicatorEmail,
    status: "shared",
  });

  return {
    claimInboxId: mailboxes.senderInboxId,
    claimEmail: mailboxes.senderEmail,
    adjudicatorInboxId: mailboxes.adjudicatorInboxId,
    adjudicatorEmail: mailboxes.adjudicatorEmail,
  };
}

const ADJUDICATION_SCHEMA = {
  type: "object",
  properties: {
    determination: {
      type: "string",
      enum: ["OVERTURNED_APPROVED", "ADDITIONAL_RECORDS_REQUIRED", "DENIAL_UPHELD"],
    },
    determinationSummary: { type: "string" },
    clinicalRationale: { type: "string" },
    formalDeterminationLetter: { type: "string" },
    authorizedSettlementAmount: { type: "number" },
    reviewerName: { type: "string" },
    reviewerTitle: { type: "string" },
  },
  required: [
    "determination",
    "determinationSummary",
    "clinicalRationale",
    "formalDeterminationLetter",
    "authorizedSettlementAmount",
    "reviewerName",
    "reviewerTitle",
  ],
  additionalProperties: false,
};

interface AdjudicationResponse {
  determination: "OVERTURNED_APPROVED" | "ADDITIONAL_RECORDS_REQUIRED" | "DENIAL_UPHELD";
  determinationSummary: string;
  clinicalRationale: string;
  formalDeterminationLetter: string;
  authorizedSettlementAmount: number;
  reviewerName: string;
  reviewerTitle: string;
}

interface AdjudicationClaimContext {
  _id: Id<"claims">;
  claimNumber: string;
  patient?: { name?: string } | null;
  cptCodes?: string[];
  icd10Codes?: string[];
  deniedAmount: number;
  denialReasonCode?: string;
  serviceDate?: string;
  providerName?: string;
}

function buildInitialAdjudicationPrompt(claim: AdjudicationClaimContext, payer: string): string {
  return `You are Demo AI Reviewer, a simulated independent clinical reviewer evaluating an appeal against ${payer} for platform demonstration and technical evaluation purposes.
You have just received a formal Level 1 ERISA Medical Appeal and cited Clinical Reconsideration Memorandum for Claim #${claim.claimNumber} (Patient: ${claim.patient?.name}).
Evaluate the appeal objectively and impartially against published clinical policy guidelines and medical necessity requirements:
- Review the clinical CPT codes: [${(claim.cptCodes || []).join(", ")}], ICD-10 diagnosis: [${(claim.icd10Codes || []).join(", ")}], denied amount: $${claim.deniedAmount}.
- If the appeal demonstrates that conservative therapy, radiographic evidence, or emergency exceptions meet the clinical criteria, issue determination "OVERTURNED_APPROVED".
- If the appeal lacks necessary clinical documentation (such as dated x-rays, physical therapy records, or operative notes) that could cure the deficiency, issue "ADDITIONAL_RECORDS_REQUIRED" and specify what is missing.
- If the documentation confirms that coverage criteria cannot be met or the service represents an unbending contractual exclusion, issue determination "DENIAL_UPHELD".
  - Write a formal, professional determination letter addressed to the treating provider. Acknowledge the memorandum, cite the clinical coverage criteria, and clearly explain the decision.
  - Set reviewerName to "Demo AI Reviewer" and reviewerTitle to "Independent Clinical Reviewer (Simulated)".
  - Write the letter as natural business correspondence: use a salutation, short paragraphs, a clear decision, and a professional closing. Return letter content only. Do not use Markdown syntax, all-caps filler, AI meta-commentary, or generic phrases such as "as an AI".`;
}

function buildFollowUpAdjudicationPrompt(claim: AdjudicationClaimContext, payer: string): string {
  return `You are Demo AI Reviewer, a simulated independent clinical reviewer evaluating ongoing appeal correspondence against ${payer} for demonstration and testing purposes.
You are in ongoing Level 1 ERISA medical appeal correspondence for Claim #${claim.claimNumber} (Patient: ${claim.patient?.name}).
The appellant has sent a follow-up addendum or reply after prior correspondence.
Evaluate the complete correspondence objectively against published clinical policy guidelines and medical necessity requirements:
- Review the clinical CPT codes: [${(claim.cptCodes || []).join(", ")}], ICD-10 diagnosis: [${(claim.icd10Codes || []).join(", ")}], denied amount: $${claim.deniedAmount}.
- If the addendum supplies missing conservative-therapy documentation, radiographic evidence, or other records that now meet clinical criteria, issue determination "OVERTURNED_APPROVED".
- If the clinical record remains incomplete but could be cured with further specific documents, issue "ADDITIONAL_RECORDS_REQUIRED" and specify exactly which records are still outstanding.
- If the submitted record demonstrates that clinical criteria are definitively not met, issue "DENIAL_UPHELD".
- If you already overturned this claim and no new contrary facts emerged, reaffirm the approval.
  - Write a formal, professional determination letter addressed to the treating provider that responds specifically to this addendum.
  - Set reviewerName to "Demo AI Reviewer" and reviewerTitle to "Independent Clinical Reviewer (Simulated)".
  - Write the letter as natural business correspondence: use a salutation, short paragraphs, a clear decision, and a professional closing. Return letter content only. Do not use Markdown syntax, all-caps filler, AI meta-commentary, or generic phrases such as "as an AI".`;
}

async function deliverAiAdjudication(
  ctx: ActionCtx,
  options: {
    claim: AdjudicationClaimContext;
    threadId: Id<"emailThreads">;
    sender: string;
    recipient: string;
    payer: string;
    adjudicatorInboxId: string;
    userPrompt: string;
    isFollowUp: boolean;
  }
): Promise<AdjudicationResponse> {
  const {
    claim,
    threadId,
    sender,
    recipient,
    payer,
    adjudicatorInboxId,
    userPrompt,
    isFollowUp,
  } = options;

  const adjudicationResult = await createStructuredCompletion<AdjudicationResponse>({
    systemPrompt: isFollowUp
      ? buildFollowUpAdjudicationPrompt(claim, payer)
      : buildInitialAdjudicationPrompt(claim, payer),
    userPrompt,
    schemaName: "AdjudicationResponse",
    schema: ADJUDICATION_SCHEMA,
    temperature: 0.1,
  });

  const threadData = await ctx.runQuery(api.emails.getThreadWithMessages, {
    threadId,
  });

  const claimTag = `[ClaimHero #${claim.claimNumber}]`;
  const determinationLabel =
    adjudicationResult.determination === "OVERTURNED_APPROVED"
      ? "Appeal Overturned"
      : adjudicationResult.determination === "DENIAL_UPHELD"
      ? "Denial Upheld"
      : "Additional Records Requested";

  let determinationSubject: string;
  if (threadData?.thread?.subject?.trim()) {
    const baseSubject = threadData.thread.subject.trim();
    determinationSubject = baseSubject.match(/^re:\s*/i)
      ? baseSubject
      : `Re: ${baseSubject}`;
  } else {
    const rawDeterminationSubject = `Re: Formal Medical Appeal | Claim #${claim.claimNumber} | ${determinationLabel}`;
    determinationSubject = rawDeterminationSubject.includes(claimTag)
      ? rawDeterminationSubject
      : `${claimTag} ${rawDeterminationSubject}`;
  }

  const priorMessages = threadData?.messages || [];
  const messageIds = priorMessages
    .map((m) => m.agentMailMessageId?.trim())
    .filter((id): id is string => Boolean(id));

  const lastMsgId = messageIds[messageIds.length - 1];
  const inReplyTo = lastMsgId ? formatMessageIdHeader(lastMsgId) : undefined;
  const references = messageIds.length > 0
    ? messageIds.map(formatMessageIdHeader).join(" ")
    : undefined;

  const headers: Record<string, string> = {};
  if (inReplyTo) headers["In-Reply-To"] = inReplyTo;
  if (references) headers["References"] = references;

  const footerNotice = "\n\n[NOTICE: This determination was generated by ClaimHero Demo AI Reviewer in Simulation Mode for platform evaluation and demonstration purposes. It does not represent an actual insurance payer adjudication or real legal determination.]";
  const formalLetterWithNotice = `${adjudicationResult.formalDeterminationLetter.trim()}${footerNotice}`;

  const determinationEmail = formatCorrespondenceEmail(
    formalLetterWithNotice,
    {
      claimNumber: claim.claimNumber,
      payer,
      patientName: claim.patient?.name,
      serviceDate: claim.serviceDate,
      deniedAmount: claim.deniedAmount,
      denialReason: claim.denialReasonCode,
      cptCodes: claim.cptCodes,
      providerName: adjudicationResult.reviewerName,
    },
    `Appeal Determination: ${determinationLabel}`
  );

  const liveReply = await sendAgentMailMessage({
    inboxId: adjudicatorInboxId,
    to: sender,
    subject: determinationSubject,
    text: determinationEmail.text,
    html: determinationEmail.html,
    ...(Object.keys(headers).length > 0 ? { headers } : {}),
  });

  const replyThreadId = liveReply.threadId || liveReply.messageId;
  if (replyThreadId) {
    await ctx.runMutation(internal.claims.setAgentMailThreadIdInternal, {
      claimId: claim._id,
      agentMailThreadId: replyThreadId,
    });
  }

  await ctx.runMutation(internal.emails.insertMessageInternal, withAgentMailMessageId({
    threadId,
    claimId: claim._id,
    direction: "inbound",
    sender: `${payer} Appellate Review Board <${recipient}>`,
    recipient: sender,
    subject: determinationSubject,
    bodyHtml: determinationEmail.html,
    bodyText: determinationEmail.text,
    hasAttachments: false,
    detectedDetermination: adjudicationResult.determination,
    clinicalRationale: adjudicationResult.clinicalRationale,
    autoReplyStatus: adjudicationResult.determination === "OVERTURNED_APPROVED" ? undefined : "pending",
  }, liveReply.messageId));

  if (adjudicationResult.determination === "OVERTURNED_APPROVED") {
    await ctx.runMutation(internal.claims.updateStatusInternal, {
      claimId: claim._id,
      status: "won",
      actor: `${payer} Demo Reviewer`,
      details: `VICTORY: Demo AI Reviewer overturned adverse determination. Authorized full recovery of $${(claim.deniedAmount || 0).toLocaleString()} released for payment. (Simulated evaluation)`,
    });
  } else if (adjudicationResult.determination === "DENIAL_UPHELD") {
    await ctx.runMutation(internal.claims.updateStatusInternal, {
      claimId: claim._id,
      status: "lost",
      actor: `${payer} Demo Reviewer`,
      details: `DENIAL UPHELD: Demo AI Reviewer confirmed adverse determination after clinical evaluation. Coverage criteria not satisfied. (Simulated evaluation)`,
    });
  }

  return adjudicationResult;
}

/**
 * Autonomous Dispatch Action: Transmits full appeal brief and exhibits via AgentMail
 * Supports 3 modes:
 * - "ai_adjudicator": Transmits to autonomous payer review agent with instant AI clinical adjudication
 * - "custom_email": Transmits to judge/user's interactive test email inbox
 * - "official_payer": Transmits to the insurer's official verified appellate gateway
 */
export const dispatchAppealPacket = action({
  args: {
    claimId: v.id("claims"),
    appealId: v.optional(v.id("appeals")),
    recipientEmail: v.optional(v.string()),
    customSubject: v.optional(v.string()),
    dispatchMode: v.optional(v.string()), // "ai_adjudicator" | "custom_email" | "official_payer"
  },
  handler: async (
    ctx,
    args
  ): Promise<DispatchReceipt> => {
    // 1. Authorize claim ownership
    const { claim, userId } = await requireClaimOwnerAction(ctx, args.claimId);

    // Enforce rate limiting per user
    const limitStatus = await rateLimiter.limit(ctx, "mailDispatcher", {
      key: userId || "global",
    });
    if (!limitStatus.ok) {
      throw new Error(
        `Rate limit reached for outbound payer transmission. Please retry in ${Math.ceil((limitStatus.retryAfter || 1000) / 1000)} seconds.`
      );
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

    const payer = claim.patient?.insurancePayer || "Health Insurer";
    const mode = args.dispatchMode || (args.recipientEmail?.includes("@") ? "custom_email" : "ai_adjudicator");

    let recipient = args.recipientEmail?.trim();
    if (mode === "official_payer") {
      recipient = claim.payerContact?.officialAppealsEmail || recipient;
    }

    if (mode !== "ai_adjudicator" && !recipient) {
      const portal = claim.payerContact?.intakePortalUrl ? `Official Online Portal (${claim.payerContact.portalName || claim.payerContact.intakePortalUrl})` : "";
      const fax = claim.payerContact?.appealsFax ? `Appellate Fax (${claim.payerContact.appealsFax})` : "";
      const channels = [portal, fax].filter(Boolean).join(" or ") || "Certified Mail";
      throw new Error(`Insurer ${payer} does not accept formal appeals via direct email under HIPAA regulations. Please submit through their ${channels}.`);
    }

    const mailboxes = await ensureClaimMailboxes(ctx, claim);
    const sender = mailboxes.claimEmail;
    const adjudicatorInboxId = mailboxes.adjudicatorInboxId;
    if (mode === "ai_adjudicator") {
      if (!mailboxes.adjudicatorEmail || !adjudicatorInboxId) {
        throw new Error("AgentMail did not return a payer adjudicator inbox for this claim.");
      }
      // Never send option 1 to a display-only address supplied by the client.
      recipient = mailboxes.adjudicatorEmail;
    }
    if (!recipient) {
      throw new Error(`No email recipient is configured for claim ${claim.claimNumber}.`);
    }
    const finalRecipient = recipient;
    const claimTag = `[ClaimHero #${claim.claimNumber}]`;
    const rawSubject =
      args.customSubject ||
      `Appeal request | Claim #${claim.claimNumber} | ${payer}`;
    const subject = rawSubject.includes(claimTag) ? rawSubject : `${claimTag} ${rawSubject}`;
    const transmissionId = `tx_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const appealEmail = formatAppealEmail(appeal.fullAppealMarkdown, {
      claimNumber: claim.claimNumber,
      payer,
      patientName: claim.patient?.name,
      serviceDate: claim.serviceDate,
      deniedAmount: claim.deniedAmount,
      denialReason: [claim.denialReasonCode, claim.denialReasonDescription].filter(Boolean).join(" - "),
      cptCodes: claim.cptCodes,
      providerName: claim.providerName,
    });

    const liveTransmission = await sendAgentMailMessage({
      inboxId: mailboxes.claimInboxId,
      to: finalRecipient,
      subject,
      text: appealEmail.text,
      html: appealEmail.html,
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

    // 4. Record outbound message in database
    await ctx.runMutation(internal.emails.insertMessageInternal, withAgentMailMessageId({
      threadId,
      claimId: args.claimId,
      direction: "outbound",
      sender,
      recipient: finalRecipient,
      subject,
      bodyHtml: appealEmail.html,
      bodyText: appealEmail.text,
      hasAttachments: true,
    }, liveTransmission.messageId));

    // 5. Update claim status to dispatched
    await ctx.runMutation(internal.claims.updateStatusInternal, {
      claimId: args.claimId,
      status: "dispatched",
      actor: mode === "ai_adjudicator" ? "Autonomous AI Payer Gateway" : "AgentMail Outbound Dispatcher",
      details: `Transmitted legal appeal memorandum to ${payer} (${finalRecipient}) via dedicated inbox ${sender}.`,
    });

    let adjudicationResult: AdjudicationResponse | null = null;

    // 6. If AI Adjudicator Mode, execute autonomous clinical evaluation & generate formal determination
    if (mode === "ai_adjudicator") {
      try {
        adjudicationResult = await deliverAiAdjudication(ctx, {
          claim,
          threadId,
          sender,
          recipient: finalRecipient,
          payer,
          adjudicatorInboxId: adjudicatorInboxId as string,
          userPrompt: `Evaluate the following medical appeal brief for Claim #${claim.claimNumber}:\n\n${appeal.fullAppealMarkdown}`,
          isFollowUp: false,
        });
      } catch (aiErr) {
        throw new Error(
          `AI payer adjudication failed after the appeal packet was sent: ${
            aiErr instanceof Error ? aiErr.message : String(aiErr)
          }`
        );
      }
    }

    return {
      transmissionId,
      claimId: args.claimId,
      sender,
      recipient: finalRecipient,
      subject,
      dispatchedAt: Date.now(),
      status: "delivered",
      adjudicationDetermination: adjudicationResult?.determination,
    };
  },
});

const sendOutboundMessageArgs = {
  claimId: v.id("claims"),
  threadId: v.optional(v.id("emailThreads")),
  text: v.string(),
  customRecipient: v.optional(v.string()),
  customSubject: v.optional(v.string()),
};

async function performSendOutboundMessage(
  ctx: ActionCtx,
  args: {
    claimId: Id<"claims">;
    threadId?: Id<"emailThreads">;
    text: string;
    customRecipient?: string;
    customSubject?: string;
  },
  claim: Doc<"claims"> & { patient?: Doc<"patients"> | null }
) {
  let threadData: {
    thread: Doc<"emailThreads"> | null;
    messages: Doc<"emailMessages">[];
  } | null = null;

  if (args.threadId) {
    threadData = await ctx.runQuery(api.emails.getThreadWithMessages, {
      threadId: args.threadId,
    });
  }
  if (!threadData) {
    const threads = await ctx.runQuery(api.emails.listThreadsByClaim, {
      claimId: args.claimId,
    });
    if (threads && threads.length > 0 && threads[0]?._id) {
      threadData = await ctx.runQuery(api.emails.getThreadWithMessages, {
        threadId: threads[0]._id,
      });
    }
  }

  const recipient =
    args.customRecipient ||
    threadData?.thread?.payerEmail ||
    claim.payerContact?.officialAppealsEmail;
  const claimTag = `[ClaimHero #${claim.claimNumber}]`;
  const payer = claim.patient?.insurancePayer || "Health Insurer";

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

  const correspondenceEmail = formatCorrespondenceEmail(args.text, {
    claimNumber: claim.claimNumber,
    payer,
    patientName: claim.patient?.name,
    serviceDate: claim.serviceDate,
    deniedAmount: claim.deniedAmount,
    denialReason: claim.denialReasonCode,
    cptCodes: claim.cptCodes,
    providerName: claim.providerName,
  }, "Appeal Addendum");

  const isAiAdjudicatorReply = isAiAdjudicatorAddress(recipient);
  const mailboxes = await ensureClaimMailboxes(ctx, claim);
  const sender = mailboxes.claimEmail;
  const resolvedRecipient = isAiAdjudicatorReply
    ? mailboxes.adjudicatorEmail
    : recipient;
  if (!resolvedRecipient) {
    throw new Error(`No email recipient is configured for claim ${claim.claimNumber}.`);
  }
  if (isAiAdjudicatorReply && !mailboxes.adjudicatorInboxId) {
    throw new Error("AgentMail did not return a payer adjudicator inbox for this claim.");
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
  }, liveTransmission.messageId));

  let adjudicationDetermination: string | undefined;
  if (isAiAdjudicatorReply && threadId) {
    try {
      const historyMessages = [
        ...((threadData?.messages || []) as Array<{
          direction: string;
          subject: string;
          bodyText: string;
        }>),
        { direction: "outbound", subject, bodyText: args.text },
      ];
      const transcript = formatCorrespondenceTranscript(historyMessages);

      const adjudicationResult = await deliverAiAdjudication(ctx, {
        claim,
        threadId,
        sender,
        recipient: resolvedRecipient,
        payer,
        adjudicatorInboxId: mailboxes.adjudicatorInboxId as string,
        userPrompt: `The following is the ongoing appellate correspondence for Claim #${claim.claimNumber}.

${transcript}

The appellant has just submitted this addendum:

${args.text}

Issue an updated formal determination letter that responds specifically to this addendum.`,
        isFollowUp: true,
      });
      adjudicationDetermination = adjudicationResult.determination;
    } catch (aiErr) {
      throw new Error(
        `AI payer adjudication failed after the addendum was sent: ${
          aiErr instanceof Error ? aiErr.message : String(aiErr)
        }`
      );
    }
  }

  return { success: true, adjudicationDetermination };
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
  ): Promise<{ success: boolean; adjudicationDetermination?: string }> => {
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
