"use node";

import { action, type ActionCtx } from "../_generated/server";
import { v } from "convex/values";
import { api, internal } from "../_generated/api";
import { createStructuredCompletion } from "../lib/openai";
import {
  formatCorrespondenceTranscript,
  isAiAdjudicatorAddress,
} from "../lib/aiAdjudicator";
import {
  getSharedAgentMailboxes,
  sendAgentMailMessage,
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
  claim: any
): Promise<ClaimMailboxes> {
  if (!process.env.AGENTMAIL_API_KEY?.trim()) {
    throw new Error("AgentMail is not configured. Set AGENTMAIL_API_KEY before sending email.");
  }

  const mailboxes = getSharedAgentMailboxes();
  await ctx.runMutation((internal as any).claims.setAgentMailInboxes, {
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
      enum: ["OVERTURNED_APPROVED", "ADDITIONAL_RECORDS_REQUIRED"],
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
  determination: "OVERTURNED_APPROVED" | "ADDITIONAL_RECORDS_REQUIRED";
  determinationSummary: string;
  clinicalRationale: string;
  formalDeterminationLetter: string;
  authorizedSettlementAmount: number;
  reviewerName: string;
  reviewerTitle: string;
}

function buildInitialAdjudicationPrompt(claim: any, payer: string): string {
  return `You are Dr. Arthur Vance, MD, Senior Medical Director & Appellate Review Officer for ${payer}.
You have just received a formal Level 1 ERISA Medical Appeal and cited Clinical Reconsideration Memorandum for Claim #${claim.claimNumber} (Patient: ${claim.patient?.name}).
Evaluate the appeal objectively against published clinical policy guidelines and medical necessity requirements:
- Review the clinical CPT codes: [${(claim.cptCodes || []).join(", ")}], ICD-10 diagnosis: [${(claim.icd10Codes || []).join(", ")}], denied amount: $${claim.deniedAmount}.
- If the appeal demonstrates that conservative therapy, radiographic evidence, or emergency exceptions meet the clinical criteria, issue determination "OVERTURNED_APPROVED".
  - Write a formal, professional insurance payer determination letter addressed to the treating provider, acknowledging the ERISA memorandum, citing the clinical coverage criteria, and confirming the overturn and release of funds.
  - Write the letter as natural business correspondence: use a salutation, short paragraphs, a clear decision, and a professional closing. Return letter content only. Do not use Markdown syntax, all-caps filler, AI meta-commentary, or generic phrases such as "as an AI".`;
}

function buildFollowUpAdjudicationPrompt(claim: any, payer: string): string {
  return `You are Dr. Arthur Vance, MD, Senior Medical Director & Appellate Review Officer for ${payer}.
You are in an ongoing Level 1 ERISA medical appeal correspondence for Claim #${claim.claimNumber} (Patient: ${claim.patient?.name}).
The appellant has sent a follow-up addendum or reply after your prior determination.
Evaluate the complete correspondence against published clinical policy guidelines and medical necessity requirements:
- Review the clinical CPT codes: [${(claim.cptCodes || []).join(", ")}], ICD-10 diagnosis: [${(claim.icd10Codes || []).join(", ")}], denied amount: $${claim.deniedAmount}.
- If the addendum supplies missing conservative-therapy documentation, radiographic evidence, or other records that now meet clinical criteria, issue determination "OVERTURNED_APPROVED".
- If the clinical record remains incomplete, issue "ADDITIONAL_RECORDS_REQUIRED" and specify exactly which records are still outstanding.
- If you already overturned this claim, acknowledge the addendum and reaffirm the approval. Do not reverse a prior overturn.
  - Write a formal, professional insurance payer determination letter addressed to the treating provider that responds specifically to this addendum.
  - Write the letter as natural business correspondence: use a salutation, short paragraphs, a clear decision, and a professional closing. Return letter content only. Do not use Markdown syntax, all-caps filler, AI meta-commentary, or generic phrases such as "as an AI".`;
}

async function deliverAiAdjudication(
  ctx: ActionCtx,
  options: {
    claim: any;
    threadId: any;
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

  const determinationSubject = `RE: Formal Medical Appeal | Claim #${claim.claimNumber} | ${
    adjudicationResult.determination === "OVERTURNED_APPROVED"
      ? "Appeal Overturned"
      : "Additional Records Requested"
  }`;

  const determinationEmail = formatCorrespondenceEmail(
    adjudicationResult.formalDeterminationLetter,
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
    adjudicationResult.determination === "OVERTURNED_APPROVED"
      ? "Appeal Determination: Overturned"
      : "Appeal Determination: Additional Records Requested"
  );

  const liveReply = await sendAgentMailMessage({
    inboxId: adjudicatorInboxId,
    to: sender,
    subject: determinationSubject,
    text: determinationEmail.text,
    html: determinationEmail.html,
  });

  await ctx.runMutation((api as any).emails.insertMessage, withAgentMailMessageId({
    threadId,
    claimId: claim._id,
    direction: "inbound",
    sender: `${payer} Appellate Review Board <${recipient}>`,
    recipient: sender,
    subject: determinationSubject,
    bodyHtml: determinationEmail.html,
    bodyText: determinationEmail.text,
    hasAttachments: false,
  }, liveReply.messageId));

  if (adjudicationResult.determination === "OVERTURNED_APPROVED") {
    await ctx.runMutation((api as any).claims.updateStatus, {
      claimId: claim._id,
      status: "won",
      actor: `${payer} Chief Medical Officer`,
      details: `VICTORY: ${payer} Medical Review Board overturned adverse determination. Authorized full recovery of $${(claim.deniedAmount || 0).toLocaleString()} released for payment.`,
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
    // 1. Fetch claim & appeal details
    const claim: any = await ctx.runQuery((api as any).claims.getById, {
      claimId: args.claimId,
    });

    if (!claim) {
      throw new Error(`Claim ${args.claimId} not found`);
    }

    // Enforce rate limiting per user
    const limitStatus = await rateLimiter.limit(ctx, "mailDispatcher", {
      key: claim.userId || "global",
    });
    if (!limitStatus.ok) {
      throw new Error(
        `Rate limit reached for outbound payer transmission. Please retry in ${Math.ceil((limitStatus.retryAfter || 1000) / 1000)} seconds.`
      );
    }

    let appeal: any = null;
    if (args.appealId) {
      appeal = await ctx.runQuery((api as any).appeals.getById, {
        appealId: args.appealId,
      });
    }
    if (!appeal) {
      appeal = await ctx.runQuery((api as any).appeals.getLatestByClaim, {
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
    const subject =
      args.customSubject ||
      `Appeal request | Claim #${claim.claimNumber} | ${payer}`;
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

    // 3. Ensure email thread exists
    const threadId: any = await ctx.runMutation((api as any).emails.getOrCreateThread, {
      claimId: args.claimId,
      agentEmail: sender,
      payerEmail: finalRecipient,
      subject,
    });

    // 4. Record outbound message in database
    await ctx.runMutation((api as any).emails.insertMessage, withAgentMailMessageId({
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
    await ctx.runMutation((api as any).claims.updateStatus, {
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

/**
 * Send Outbound Communication Message via AgentMail
 */
export const sendOutboundMessage = action({
  args: {
    claimId: v.id("claims"),
    threadId: v.optional(v.id("emailThreads")),
    text: v.string(),
    customRecipient: v.optional(v.string()),
    customSubject: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const claim: any = await ctx.runQuery((api as any).claims.getById, {
      claimId: args.claimId,
    });

    if (!claim) {
      throw new Error(`Claim ${args.claimId} not found`);
    }

    let threadData: any = null;
    if (args.threadId) {
      threadData = await ctx.runQuery((api as any).emails.getThreadWithMessages, {
        threadId: args.threadId,
      });
    }

    const recipient =
      args.customRecipient ||
      threadData?.thread?.payerEmail ||
      claim.payerContact?.officialAppealsEmail;
    const subject = args.customSubject || `Re: Formal Medical Appeal | Claim #${claim.claimNumber} | Addendum`;
    const payer = claim.patient?.insurancePayer || "Health Insurer";
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

    const liveTransmission = await sendAgentMailMessage({
      inboxId: mailboxes.claimInboxId,
      to: resolvedRecipient,
      subject,
      text: correspondenceEmail.text,
      html: correspondenceEmail.html,
    });

    const threadId: any = await ctx.runMutation((api as any).emails.getOrCreateThread, {
      claimId: args.claimId,
      agentEmail: sender,
      payerEmail: resolvedRecipient,
      subject,
    });

    await ctx.runMutation((api as any).emails.insertMessage, withAgentMailMessageId({
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
  },
});
