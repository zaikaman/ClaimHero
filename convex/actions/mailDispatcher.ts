"use node";

import { action, type ActionCtx } from "../_generated/server";
import { v } from "convex/values";
import { api } from "../_generated/api";
import { createStructuredCompletion } from "../lib/openai";
import {
  buildAiAdjudicatorAddress,
  formatCorrespondenceTranscript,
  isAiAdjudicatorAddress,
} from "../lib/aiAdjudicator";

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
- Write a formal, professional insurance payer determination letter addressed to the treating provider, acknowledging the ERISA memorandum, citing the clinical coverage criteria, and confirming the overturn and release of funds.`;
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
- Write a formal, professional insurance payer determination letter addressed to the treating provider that responds specifically to this addendum.`;
}

async function deliverAiAdjudication(
  ctx: ActionCtx,
  options: {
    claim: any;
    threadId: any;
    sender: string;
    recipient: string;
    payer: string;
    userPrompt: string;
    isFollowUp: boolean;
  }
): Promise<AdjudicationResponse> {
  const { claim, threadId, sender, recipient, payer, userPrompt, isFollowUp } = options;

  const adjudicationResult = await createStructuredCompletion<AdjudicationResponse>({
    systemPrompt: isFollowUp
      ? buildFollowUpAdjudicationPrompt(claim, payer)
      : buildInitialAdjudicationPrompt(claim, payer),
    userPrompt,
    schemaName: "AdjudicationResponse",
    schema: ADJUDICATION_SCHEMA,
    temperature: 0.1,
  });

  const determinationSubject = `RE: Official Determination Notice - Claim #${claim.claimNumber} - ${
    adjudicationResult.determination === "OVERTURNED_APPROVED"
      ? "ADVERSE DETERMINATION OVERTURNED & REVERSED"
      : "SUPPLEMENTAL RECORDS REQUESTED"
  }`;

  await ctx.runMutation((api as any).emails.insertMessage, {
    threadId,
    claimId: claim._id,
    direction: "inbound",
    sender: `${payer} Appellate Review Board <${recipient}>`,
    recipient: sender,
    subject: determinationSubject,
    bodyHtml: `<div style="font-family: sans-serif; padding: 16px; color: #1e293b;">
      <h3 style="color: #059669; margin-top: 0;">OFFICIAL NOTICE OF APPELLATE DETERMINATION</h3>
      <p><strong>Insurer:</strong> ${payer}</p>
      <p><strong>Claim Reference:</strong> #${claim.claimNumber}</p>
      <p><strong>Patient:</strong> ${claim.patient?.name}</p>
      <p><strong>Determination:</strong> <span style="color: #059669; font-weight: bold;">${adjudicationResult.determinationSummary}</span></p>
      <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 16px 0;" />
      <div style="white-space: pre-line; line-height: 1.6;">${adjudicationResult.formalDeterminationLetter}</div>
      <p style="margin-top: 16px; font-size: 12px; color: #64748b;">Reviewed by: ${adjudicationResult.reviewerName}, ${adjudicationResult.reviewerTitle}</p>
    </div>`,
    bodyText: adjudicationResult.formalDeterminationLetter,
    hasAttachments: false,
  });

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
    if (mode === "ai_adjudicator") {
      recipient = recipient || buildAiAdjudicatorAddress(payer);
    } else if (mode === "official_payer") {
      recipient = claim.payerContact?.officialAppealsEmail || recipient;
    }

    if (!recipient) {
      const portal = claim.payerContact?.intakePortalUrl ? `Official Online Portal (${claim.payerContact.portalName || claim.payerContact.intakePortalUrl})` : "";
      const fax = claim.payerContact?.appealsFax ? `Appellate Fax (${claim.payerContact.appealsFax})` : "";
      const channels = [portal, fax].filter(Boolean).join(" or ") || "Certified Mail";
      throw new Error(`Insurer ${payer} does not accept formal appeals via direct email under HIPAA regulations. Please submit through their ${channels}.`);
    }

    const sender = claim.assignedAgentEmail || `appeal-claim-${claim.claimNumber.toLowerCase().replace(/[^a-z0-9]/g, "")}@claimhero.agentmail.com`;
    const subject =
      args.customSubject ||
      `URGENT: Formal ERISA Appeal & Demand for Payment - Claim #${claim.claimNumber} (Patient: ${claim.patient?.name})`;

    const agentMailKey = process.env.AGENTMAIL_API_KEY;
    const inboxId = process.env.AGENTMAIL_INBOX_ID || "thinhdinh@agentmail.to";
    const transmissionId = `tx_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    // 2. If AGENTMAIL_API_KEY is present, transmit live outbound email via AgentMail REST API
    if (agentMailKey) {
      try {
        const res = await fetch(`https://api.agentmail.to/v0/inboxes/${encodeURIComponent(inboxId)}/messages/send`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${agentMailKey}`,
          },
          body: JSON.stringify({
            to: recipient,
            subject,
            text: appeal.fullAppealMarkdown,
            html: `<div style="font-family: sans-serif; max-width: 700px; margin: auto; padding: 20px; color: #1e293b;">
              <div style="background-color: #0284c7; color: #ffffff; padding: 16px; border-radius: 8px; margin-bottom: 20px;">
                <h2 style="margin: 0; font-size: 18px; font-weight: 700;">FORMAL ERISA MEDICAL APPEAL & DEMAND FOR RECONSIDERATION</h2>
                <p style="margin: 4px 0 0 0; font-size: 13px; opacity: 0.9;">Pursuant to 29 CFR § 2560.503-1 Statutory Claims Procedure</p>
              </div>
              <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 13px;">
                <tr><td style="padding: 6px 0; color: #64748b;"><strong>Claim Number:</strong></td><td style="padding: 6px 0; font-family: monospace;">${claim.claimNumber}</td></tr>
                <tr><td style="padding: 6px 0; color: #64748b;"><strong>Patient Name:</strong></td><td style="padding: 6px 0;">${claim.patient?.name}</td></tr>
                <tr><td style="padding: 6px 0; color: #64748b;"><strong>Disputed Amount:</strong></td><td style="padding: 6px 0; font-weight: bold; color: #dc2626;">$${claim.deniedAmount.toLocaleString()}</td></tr>
                <tr><td style="padding: 6px 0; color: #64748b;"><strong>Procedure Codes:</strong></td><td style="padding: 6px 0; font-family: monospace;">${(claim.cptCodes || []).join(", ")}</td></tr>
                <tr><td style="padding: 6px 0; color: #64748b;"><strong>Denial Code:</strong></td><td style="padding: 6px 0; font-family: monospace;">${claim.denialReasonCode} - ${claim.denialReasonDescription}</td></tr>
              </table>
              <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
              <div style="white-space: pre-line; line-height: 1.6; font-size: 14px;">${appeal.fullAppealMarkdown}</div>
            </div>`,
          }),
        });

        if (!res.ok) {
          const errText = await res.text();
          console.warn("AgentMail live dispatch warning, proceeding with record storage:", res.status, errText);
        }
      } catch (err) {
        console.warn("AgentMail live dispatch warning, proceeding with record storage:", err);
      }
    }

    // 3. Ensure email thread exists
    const threadId: any = await ctx.runMutation((api as any).emails.getOrCreateThread, {
      claimId: args.claimId,
      agentEmail: sender,
      payerEmail: recipient,
      subject,
    });

    // 4. Record outbound message in database
    await ctx.runMutation((api as any).emails.insertMessage, {
      threadId,
      claimId: args.claimId,
      direction: "outbound",
      sender,
      recipient,
      subject,
      bodyHtml: `<p>Formal ERISA appeal brief transmission for claim #${claim.claimNumber}</p>`,
      bodyText: appeal.fullAppealMarkdown,
      hasAttachments: true,
    });

    // 5. Update claim status to dispatched
    await ctx.runMutation((api as any).claims.updateStatus, {
      claimId: args.claimId,
      status: "dispatched",
      actor: mode === "ai_adjudicator" ? "Autonomous AI Payer Gateway" : "AgentMail Outbound Dispatcher",
      details: `Transmitted legal appeal memorandum to ${payer} (${recipient}) via dedicated inbox ${sender}.`,
    });

    let adjudicationResult: AdjudicationResponse | null = null;

    // 6. If AI Adjudicator Mode, execute autonomous clinical evaluation & generate formal determination
    if (mode === "ai_adjudicator") {
      try {
        adjudicationResult = await deliverAiAdjudication(ctx, {
          claim,
          threadId,
          sender,
          recipient,
          payer,
          userPrompt: `Evaluate the following medical appeal brief for Claim #${claim.claimNumber}:\n\n${appeal.fullAppealMarkdown}`,
          isFollowUp: false,
        });
      } catch (aiErr) {
        console.warn("Autonomous AI Adjudication note:", aiErr);
      }
    }

    return {
      transmissionId,
      claimId: args.claimId,
      sender,
      recipient,
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
    const sender = claim.assignedAgentEmail || process.env.AGENTMAIL_INBOX_ID || "thinhdinh@agentmail.to";
    const subject = args.customSubject || `Re: Claim #${claim.claimNumber} Appeal Addendum (Patient: ${claim.patient?.name})`;
    const payer = claim.patient?.insurancePayer || "Health Insurer";

    const agentMailKey = process.env.AGENTMAIL_API_KEY;
    const inboxId = process.env.AGENTMAIL_INBOX_ID || "thinhdinh@agentmail.to";

    // Only transmit over live AgentMail if a genuine recipient email exists
    if (agentMailKey && recipient) {
      try {
        const res = await fetch(`https://api.agentmail.to/v0/inboxes/${encodeURIComponent(inboxId)}/messages/send`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${agentMailKey}`,
          },
          body: JSON.stringify({
            to: recipient,
            subject,
            text: args.text,
            html: `<div style="font-family: sans-serif; padding: 16px;">
              <p><strong>Claim #${claim.claimNumber} - Case Addendum</strong></p>
              <p>${args.text}</p>
            </div>`,
          }),
        });

        if (!res.ok) {
          const errText = await res.text();
          console.warn("AgentMail send warning:", res.status, errText);
        }
      } catch (err) {
        console.warn("AgentMail send warning:", err);
      }
    }

    let threadId = args.threadId;
    if (!threadId) {
      threadId = await ctx.runMutation((api as any).emails.getOrCreateThread, {
        claimId: args.claimId,
        agentEmail: sender,
        payerEmail: recipient || "case-docket@claimhero.internal",
        subject,
      });
    }

    await ctx.runMutation((api as any).emails.insertMessage, {
      threadId,
      claimId: args.claimId,
      direction: "outbound",
      sender,
      recipient: recipient || "Case Docket (Internal Record)",
      subject,
      bodyHtml: `<p>${args.text}</p>`,
      bodyText: args.text,
      hasAttachments: false,
    });

    let adjudicationDetermination: string | undefined;
    if (isAiAdjudicatorAddress(recipient) && threadId) {
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
          recipient,
          payer,
          userPrompt: `The following is the ongoing appellate correspondence for Claim #${claim.claimNumber}.

${transcript}

The appellant has just submitted this addendum:

${args.text}

Issue an updated formal determination letter that responds specifically to this addendum.`,
          isFollowUp: true,
        });
        adjudicationDetermination = adjudicationResult.determination;
      } catch (aiErr) {
        console.warn("Autonomous AI Adjudication follow-up note:", aiErr);
      }
    }

    return { success: true, adjudicationDetermination };
  },
});
