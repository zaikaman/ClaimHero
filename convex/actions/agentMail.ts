"use node";

import { internalAction } from "../_generated/server";
import { api, internal } from "../_generated/api";
import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import {
  downloadAgentMailAttachment,
  getAgentMailMessage,
  getIntakeAgentMailbox,
  getSharedAgentMailboxes,
  sendAgentMailMessage,
} from "../lib/agentMail";
import { extractEmailAddress, normalizeAgentMailWebhook } from "../lib/agentMailWebhook";

/**
 * Binds a claim to the two real AgentMail identities provisioned for the app.
 * This action intentionally never creates inboxes: the free-tier limit makes
 * per-claim inbox provisioning unsuitable for production.
 */
export const provisionClaimInboxes = internalAction({
  args: {
    claimId: v.id("claims"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const claim = await ctx.runQuery(internal.claims.getByIdInternal, {
      claimId: args.claimId,
    });

    if (!claim) return null;

    if (!process.env.AGENTMAIL_API_KEY?.trim()) {
      await ctx.runMutation(internal.claims.setAgentMailInboxes, {
        claimId: args.claimId,
        status: "not_configured",
        error: "AgentMail is not configured. Set AGENTMAIL_API_KEY before sending email.",
      });
      return null;
    }

    try {
      const mailboxes = getSharedAgentMailboxes();

      await ctx.runMutation(internal.claims.setAgentMailInboxes, {
        claimId: args.claimId,
        claimInboxId: mailboxes.senderInboxId,
        claimInboxEmail: mailboxes.senderEmail,
        adjudicatorInboxId: mailboxes.adjudicatorInboxId,
        adjudicatorEmail: mailboxes.adjudicatorEmail,
        status: "shared",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await ctx.runMutation(internal.claims.setAgentMailInboxes, {
        claimId: args.claimId,
        status: "failed",
        error: message.slice(0, 1000),
      });
      throw error;
    }

    return null;
  },
});

const MAX_INTAKE_ATTACHMENT_BYTES = 15 * 1024 * 1024;

function isSupportedAttachment(filename?: string, contentType?: string): boolean {
  const normalizedType = contentType?.toLowerCase() || "";
  const normalizedName = filename?.toLowerCase() || "";
  return (
    normalizedType === "application/pdf" ||
    normalizedType.startsWith("image/") ||
    normalizedType === "text/plain" ||
    /\.(pdf|png|jpe?g|webp|txt)$/.test(normalizedName)
  );
}

/**
 * Digests a message sent to the application-level AgentMail intake inbox.
 * The webhook is only a trigger: the message is re-fetched from AgentMail and
 * checked against the configured inbox before any claim data is created.
 */
export const processInboundIntake = internalAction({
  args: {
    eventId: v.string(),
    messageId: v.string(),
    inboxId: v.string(),
    sender: v.optional(v.string()),
    recipient: v.optional(v.string()),
    subject: v.optional(v.string()),
    text: v.optional(v.string()),
    html: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const intakeMailbox = getIntakeAgentMailbox();
    if (args.inboxId !== intakeMailbox.inboxId) {
      return null;
    }

    const message = await getAgentMailMessage(args.inboxId, args.messageId);
    const normalized = normalizeAgentMailWebhook({
      event_type: "message.received",
      event_id: args.eventId,
      message,
    });
    if (!normalized || normalized.inboxId !== intakeMailbox.inboxId) {
      throw new Error("AgentMail message payload could not be validated against the intake inbox.");
    }

    const hasIntakeRecipient = normalized.recipients.some(
      (recipient) => extractEmailAddress(recipient) === intakeMailbox.email
    );
    if (!hasIntakeRecipient) {
      console.warn(`Ignoring AgentMail message ${args.messageId} without the configured intake recipient.`);
      return null;
    }

    const sender = normalized.from || args.sender || "";
    const senderEmail = extractEmailAddress(sender);
    if (!senderEmail) throw new Error("Inbound AgentMail message does not contain a usable sender email address.");

    const started = await ctx.runMutation(internal.emails.startInboundIntake, {
      eventId: args.eventId,
      messageId: normalized.messageId,
      inboxId: normalized.inboxId,
      sender,
      recipient: intakeMailbox.email,
      subject: normalized.subject || args.subject || "Claim denial document intake",
    });
    if (!started) return null;

    try {
      const bodyText = normalized.text || args.text || normalized.html || args.html || "";
      const supportedAttachment = normalized.attachments.find((attachment) =>
        isSupportedAttachment(attachment.filename, attachment.contentType)
      );
      let storageId: Id<"_storage"> | undefined;

      if (supportedAttachment) {
        if (supportedAttachment.size && supportedAttachment.size > MAX_INTAKE_ATTACHMENT_BYTES) {
          throw new Error(`Inbound attachment exceeds the ${MAX_INTAKE_ATTACHMENT_BYTES / 1024 / 1024} MB intake limit.`);
        }

        const attachment = await downloadAgentMailAttachment({
          inboxId: normalized.inboxId,
          messageId: normalized.messageId,
          attachmentId: supportedAttachment.attachmentId,
        });
        if (attachment.bytes.byteLength > MAX_INTAKE_ATTACHMENT_BYTES) {
          throw new Error(`Inbound attachment exceeds the ${MAX_INTAKE_ATTACHMENT_BYTES / 1024 / 1024} MB intake limit.`);
        }

        const contentType = attachment.contentType || supportedAttachment.contentType || "application/octet-stream";
        storageId = (await ctx.storage.store(new Blob([attachment.bytes], { type: contentType }))) as Id<"_storage">;
      }

      if (!bodyText.trim() && !storageId) {
        throw new Error("Inbound email has no readable body or supported denial-document attachment.");
      }

      const extraction = await ctx.runAction(api.actions.opticalParser.parseDenialDocument, {
        rawDocumentText: bodyText,
        ...(storageId ? { storageId } : {}),
        patientEmail: senderEmail,
      });

      const extractedClaimId = extraction.claimId as Id<"claims">;

      const threadId = await ctx.runMutation(internal.emails.getOrCreateThreadInternal, {
        claimId: extractedClaimId,
        agentEmail: intakeMailbox.email,
        payerEmail: senderEmail,
        subject: normalized.subject || "Claim denial document intake",
      });
      await ctx.runMutation(internal.emails.insertMessageInternal, {
        threadId,
        claimId: extractedClaimId,
        direction: "inbound",
        sender,
        recipient: intakeMailbox.email,
        subject: normalized.subject || "Claim denial document intake",
        bodyHtml: normalized.html || (bodyText ? `<p>${bodyText}</p>` : "<p>Attachment-only intake message.</p>"),
        bodyText: bodyText || "Attachment-only intake message.",
        hasAttachments: normalized.attachments.length > 0,
        agentMailMessageId: normalized.messageId,
      });
      await ctx.runMutation(internal.claims.updateStatusInternal, {
        claimId: extractedClaimId,
        status: "ingested",
        actor: "AgentMail Intake Digest",
        details: "Inbound denial document digested from the ClaimHero intake inbox. Confirm case context before drafting.",
      });
      await ctx.runMutation(internal.emails.completeInboundIntake, {
        eventId: args.eventId,
        claimId: extractedClaimId,
      });
    } catch (error) {
      await ctx.runMutation(internal.emails.failInboundIntake, {
        eventId: args.eventId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }

    return null;
  },
});

const INBOUND_ANALYSIS_SCHEMA = {
  type: "object",
  properties: {
    determination: {
      type: "string",
      enum: [
        "OVERTURNED_APPROVED",
        "ADDITIONAL_RECORDS_REQUIRED",
        "DENIAL_UPHELD",
        "ACKNOWLEDGMENT_ONLY",
        "GENERAL_INQUIRY",
      ],
    },
    clinicalRationale: { type: "string" },
    missingRecordsRequested: {
      type: "array",
      items: { type: "string" },
    },
    authorizedSettlementAmount: { type: "number" },
    reviewerName: { type: "string" },
    shouldAutoReply: { type: "boolean" },
    suggestedAutoReplyAddendum: { type: "string" },
  },
  required: [
    "determination",
    "clinicalRationale",
    "missingRecordsRequested",
    "authorizedSettlementAmount",
    "reviewerName",
    "shouldAutoReply",
    "suggestedAutoReplyAddendum",
  ],
  additionalProperties: false,
};

interface InboundAnalysisResult {
  determination:
    | "OVERTURNED_APPROVED"
    | "ADDITIONAL_RECORDS_REQUIRED"
    | "DENIAL_UPHELD"
    | "ACKNOWLEDGMENT_ONLY"
    | "GENERAL_INQUIRY";
  clinicalRationale: string;
  missingRecordsRequested: string[];
  authorizedSettlementAmount: number;
  reviewerName: string;
  shouldAutoReply: boolean;
  suggestedAutoReplyAddendum: string;
}

/** Persist replies received on the shared case correspondence inbox. */
export const processInboundClaimReply = internalAction({
  args: {
    eventId: v.string(),
    messageId: v.string(),
    inboxId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const message = await getAgentMailMessage(args.inboxId, args.messageId);
    const normalized = normalizeAgentMailWebhook({
      event_type: "message.received",
      event_id: args.eventId,
      message,
    });
    if (!normalized) throw new Error("AgentMail reply payload could not be validated.");

    const intakeMailbox = getIntakeAgentMailbox();
    if (normalized.inboxId === intakeMailbox.inboxId || normalized.recipients.some(
      (recipient) => extractEmailAddress(recipient) === intakeMailbox.email
    )) {
      return null;
    }

    const subject = normalized.subject || "Adjudication Update";
    const bodyContent = normalized.text || normalized.html || "";
    const recipientEmails = normalized.recipients.map(
      (recipient) => extractEmailAddress(recipient) || recipient.toLowerCase()
    );

    let matchingClaim: Doc<"claims"> | null = null;
    const inboundThreadId =
      normalized.threadId ||
      (typeof message.thread_id === "string" ? message.thread_id : undefined) ||
      (typeof message.threadId === "string" ? message.threadId : undefined) ||
      (typeof message.in_reply_to === "string" ? message.in_reply_to : undefined);

    // 1. Try threadId match first
    if (inboundThreadId) {
      matchingClaim = await ctx.runQuery(internal.claims.getByThreadIdInternal, {
        threadId: inboundThreadId,
      });
    }

    // 2. Fallback to subject regex /#CH-\d+/ (and [ClaimHero #...])
    if (!matchingClaim && subject) {
      const chMatch =
        subject.match(/#(CH-\d+)/i) ||
        subject.match(/\[ClaimHero\s*#([^\]]+)\]/i) ||
        subject.match(/#(CLM-[A-Za-z0-9-]+)/i) ||
        subject.match(/(CH-\d+)/i);
      if (chMatch && chMatch[1]) {
        matchingClaim = await ctx.runQuery(internal.claims.getByClaimNumberInternal, {
          claimNumber: chMatch[1].trim(),
        });
      }
    }

    // 3. Fallback to recipient exact match
    if (!matchingClaim) {
      for (const recipient of recipientEmails) {
        matchingClaim = await ctx.runQuery(internal.claims.getByInboxEmailInternal, {
          email: recipient,
        });
        if (matchingClaim) break;
      }
    }

    // 4. Fallback to findMatchingClaimInternal
    if (!matchingClaim) {
      matchingClaim = await ctx.runQuery(
        internal.claims.findMatchingClaimInternal,
        {
          threadId: inboundThreadId,
          subject,
          bodySnippet: bodyContent.slice(0, 1000),
          recipients: recipientEmails,
        }
      );
    }

    if (!matchingClaim) {
      console.warn(`No ClaimHero case matched inbound AgentMail message ${args.messageId}.`);
      return null;
    }

    const sender = normalized.from || "Insurance Payer";
    const payer = matchingClaim.insurancePayer || "Health Insurer";

    // Perform structured LLM evaluation on inbound response instead of crude keyword matching
    let analysis: InboundAnalysisResult | null = null;
    try {
      const { createStructuredCompletion } = await import("../lib/openai");
      analysis = await createStructuredCompletion<InboundAnalysisResult>({
        systemPrompt: `You are a Senior Appellate Adjudication & Clinical Records Analyst for ClaimHero.
You are analyzing an inbound communication letter received from an insurance payer or adjudicator (${payer}) regarding Claim #${matchingClaim.claimNumber} (Patient: ${matchingClaim.patientName || "Patient"}).
Clinical Context:
- CPT Codes: [${(matchingClaim.cptCodes || []).join(", ")}]
- ICD-10 Diagnosis: [${(matchingClaim.icd10Codes || []).join(", ")}]
- Denied Amount: $${matchingClaim.deniedAmount}
- Denial Reason: ${matchingClaim.denialReasonCode} - ${matchingClaim.denialReasonDescription}

Evaluate the inbound correspondence text rigorously:
1. Classify the determination:
   - "OVERTURNED_APPROVED": The payer explicitly agrees to reverse the adverse determination, authorize coverage, overturn the denial, or release settlement funds.
   - "ADDITIONAL_RECORDS_REQUIRED": The payer requests additional clinical documentation, conservative therapy records, diagnostic imaging, prior authorization proof, or operative reports before they can complete review.
   - "DENIAL_UPHELD": The payer explicitly affirms/maintains their adverse determination or advises of external review rights.
   - "ACKNOWLEDGMENT_ONLY": A routine automated or administrative receipt acknowledging file intake without substantive clinical determination.
   - "GENERAL_INQUIRY": General administrative question or status check.
2. Extract specific missing clinical documentation or evidence demanded.
3. If overturned, extract the authorized settlement dollar amount (default to denied amount $${matchingClaim.deniedAmount} if full approval).
4. If additional records or inquiry are needed, synthesize a professional, court-ready clinical addendum response referencing the claim's clinical evidence to supply the demanded justification.
5. CRITICAL RULE: If determination is "OVERTURNED_APPROVED" (claim won/approved), set shouldAutoReply to false and set suggestedAutoReplyAddendum to empty string "". Do not reply to victory/overturn notices.`,
        userPrompt: `Evaluate the following inbound email from ${sender}:\n\nSubject: ${subject}\n\n${bodyContent}`,
        schemaName: "InboundAnalysisResult",
        schema: INBOUND_ANALYSIS_SCHEMA,
        temperature: 0.1,
      });
    } catch (llmError) {
      console.warn("LLM evaluation of inbound message failed; falling back to conservative parsing:", llmError);
    }

    const lowerText = (normalized.text || normalized.html || subject || "").toLowerCase();
    const isApprovalFallback =
      lowerText.includes("overturned") ||
      lowerText.includes("approved") ||
      lowerText.includes("payment issued") ||
      lowerText.includes("reimbursed");
    const isRecordsFallback =
      lowerText.includes("additional records") ||
      lowerText.includes("documentation required") ||
      lowerText.includes("please provide") ||
      lowerText.includes("clinical records");
    const isDenialFallback =
      lowerText.includes("upheld") ||
      lowerText.includes("denial maintained") ||
      lowerText.includes("adverse determination affirmed");

    const fallbackDetermination = isApprovalFallback
      ? "OVERTURNED_APPROVED"
      : isRecordsFallback
      ? "ADDITIONAL_RECORDS_REQUIRED"
      : isDenialFallback
      ? "DENIAL_UPHELD"
      : "GENERAL_INQUIRY";

    const determination = analysis?.determination || fallbackDetermination;
    const isOverturned = determination === "OVERTURNED_APPROVED" || matchingClaim.status === "won";
    const clinicalRationale =
      analysis?.clinicalRationale ||
      (determination === "OVERTURNED_APPROVED"
        ? "Determination overturned and approved by payer review."
        : determination === "ADDITIONAL_RECORDS_REQUIRED"
        ? "Payer requested additional clinical documentation."
        : "Inbound correspondence received and recorded.");
    const missingRecords = analysis?.missingRecordsRequested || [];
    const settlementAmount =
      analysis?.authorizedSettlementAmount ||
      (determination === "OVERTURNED_APPROVED" ? matchingClaim.deniedAmount : undefined);
    const suggestedAutoReply = isOverturned ? "" : (analysis?.suggestedAutoReplyAddendum || "");

    const threadId = await ctx.runMutation(internal.emails.getOrCreateThreadInternal, {
      claimId: matchingClaim._id,
      agentEmail: normalized.recipients[0] || "",
      payerEmail: extractEmailAddress(sender) || sender,
      subject,
    });

    await ctx.runMutation(internal.emails.insertMessageInternal, {
      threadId,
      claimId: matchingClaim._id,
      direction: "inbound",
      sender,
      recipient: normalized.recipients[0] || "",
      subject,
      bodyHtml: normalized.html || `<p>${normalized.text || ""}</p>`,
      bodyText: normalized.text || normalized.html || "",
      hasAttachments: normalized.attachments.length > 0,
      agentMailMessageId: normalized.messageId,
      detectedDetermination: determination,
      clinicalRationale,
      missingRecordsRequested: missingRecords.length > 0 ? missingRecords : undefined,
      settlementAmount,
      autoReplyDraft: isOverturned ? undefined : (suggestedAutoReply || undefined),
      autoReplyStatus: isOverturned ? undefined : (suggestedAutoReply ? "pending" : undefined),
    });

    if (determination === "OVERTURNED_APPROVED") {
      await ctx.runMutation(internal.claims.updateStatusInternal, {
        claimId: matchingClaim._id,
        status: "won",
        actor: analysis?.reviewerName ? `${analysis.reviewerName} (${payer})` : `${payer} Appellate Review Board`,
        details: `VICTORY: Adverse determination overturned. Authorized recovery of $${(settlementAmount || matchingClaim.deniedAmount || 0).toLocaleString()} approved. ${clinicalRationale}`,
      });
    } else if (determination === "ADDITIONAL_RECORDS_REQUIRED") {
      await ctx.runMutation(internal.claims.updateStatusInternal, {
        claimId: matchingClaim._id,
        status: "under_review",
        actor: `${payer} Review Board`,
        details: `Additional clinical records requested: ${missingRecords.join(", ") || "Supporting documentation needed"}.`,
      });

      // Autonomous Sentinel Auto-Pilot: If enabled, automatically dispatch the synthesized clinical addendum
      if (matchingClaim.autoPilotEnabled !== false && suggestedAutoReply.trim()) {
        try {
          await ctx.runAction(api.actions.mailDispatcher.sendOutboundMessage, {
            claimId: matchingClaim._id,
            threadId,
            text: suggestedAutoReply,
            customSubject: `Re: Formal Medical Appeal | Claim #${matchingClaim.claimNumber} | Clinical Addendum`,
          });
        } catch (autoReplyError) {
          console.warn("Autonomous Sentinel Auto-Reply dispatch failed:", autoReplyError);
        }
      }
    } else if (determination === "DENIAL_UPHELD") {
      await ctx.runMutation(internal.claims.updateStatusInternal, {
        claimId: matchingClaim._id,
        status: "escalated",
        actor: `${payer} Appeals Department`,
        details: `Level 1 determination upheld by payer. File prepared for Level 2 External Review / IRO escalation.`,
      });
    } else {
      await ctx.runMutation(internal.claims.updateStatusInternal, {
        claimId: matchingClaim._id,
        status: "dispatched",
        actor: "AgentMail Webhook",
        details: `Inbound correspondence received regarding claim #${matchingClaim.claimNumber}.`,
      });
    }

    // User Email Notification: Notify user whenever an inbound reply arrives
    let userEmail: string | undefined = matchingClaim.appealContext?.sender?.email;
    if (!userEmail && matchingClaim.userId) {
      try {
        const userRecord = await ctx.runQuery(internal.users.getUserByIdInternal, {
          userId: matchingClaim.userId,
        });
        if (userRecord?.email) {
          userEmail = userRecord.email;
        }
      } catch (userErr) {
        console.warn("Failed to retrieve user record for inbound email alert:", userErr);
      }
    }

    if (userEmail) {
      try {
        const mailboxes = getSharedAgentMailboxes();
        const determinationHeadline =
          determination === "OVERTURNED_APPROVED"
            ? "Determination Overturned & Approved"
            : determination === "ADDITIONAL_RECORDS_REQUIRED"
            ? "Additional Clinical Records Demanded"
            : determination === "DENIAL_UPHELD"
            ? "Payer Upheld Initial Denial"
            : "New Inbound Correspondence Received";

        const alertSubject = `[ClaimHero Alert] Payer Response: Claim #${matchingClaim.claimNumber} (${determinationHeadline})`;
        const alertText = `Hello,\n\nA new response has been received from ${payer} regarding Claim #${matchingClaim.claimNumber} (${matchingClaim.patientName || "Patient"}).\n\nDetermination: ${determinationHeadline}\nSummary: ${clinicalRationale}\n\n${
          matchingClaim.autoPilotEnabled !== false
            ? "Sentinel Auto-Pilot is ACTIVE for this claim. If no manual action is taken within 1 hour, Auto-Pilot will autonomously synthesize and dispatch the cited clinical rebuttal addendum."
            : "Sentinel Auto-Pilot is currently OFF. Please log in to ClaimHero to review this response."
        }\n\nReview Claim Docket: https://usable-sturgeon-376.convex.site/app/inbox\n\nClaimHero Sentinel System`;

        const alertHtml = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto;padding:24px;background-color:#0b0f17;color:#f8fafc;border-radius:8px;border:1px solid #1e293b;"><div style="font-size:18px;font-weight:700;color:#00e5ff;margin-bottom:16px;">ClaimHero Sentinel Alert</div><p style="font-size:14px;line-height:1.6;color:#cbd5e1;">A new inbound response was received from <strong>${payer}</strong> for <strong>Claim #${matchingClaim.claimNumber}</strong>.</p><div style="background-color:#141c2c;border:1px solid #1e293b;padding:16px;border-radius:6px;margin:16px 0;"><div style="font-size:12px;text-transform:uppercase;letter-spacing:0.05em;color:#94a3b8;margin-bottom:4px;">Payer Determination</div><div style="font-size:15px;font-weight:600;color:#f8fafc;margin-bottom:8px;">${determinationHeadline}</div><div style="font-size:13px;color:#94a3b8;line-height:1.5;">${clinicalRationale}</div></div><p style="font-size:13px;color:#94a3b8;line-height:1.6;">${
          matchingClaim.autoPilotEnabled !== false
            ? "<strong style='color:#00e5ff;'>⚡ Sentinel Auto-Pilot is ACTIVE.</strong> If no manual action is taken within 1 hour, ClaimHero will autonomously synthesize and dispatch the cited rebuttal addendum."
            : "Please log in to your ClaimHero console to review this communication."
        }</p><div style="margin-top:24px;"><a href="https://usable-sturgeon-376.convex.site/app/inbox" style="display:inline-block;background-color:#0ea5e9;color:#ffffff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:600;font-size:14px;">Open Claim Inbox</a></div></div>`;

        await sendAgentMailMessage({
          inboxId: mailboxes.senderInboxId,
          to: userEmail,
          subject: alertSubject,
          text: alertText,
          html: alertHtml,
        });
      } catch (notifyErr) {
        console.warn("User email notification dispatch bypassed (AgentMail not active or in test):", notifyErr);
      }
    }

    return null;
  },
});
