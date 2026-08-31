"use node";

import { internalAction } from "../_generated/server";
import { api, internal } from "../_generated/api";
import { v } from "convex/values";
import {
  downloadAgentMailAttachment,
  getAgentMailMessage,
  getIntakeAgentMailbox,
  getSharedAgentMailboxes,
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
    const claim: any = await ctx.runQuery((internal as any).claims.getByIdInternal, {
      claimId: args.claimId,
    });

    if (!claim) return null;

    if (!process.env.AGENTMAIL_API_KEY?.trim()) {
      await ctx.runMutation((internal as any).claims.setAgentMailInboxes, {
        claimId: args.claimId,
        status: "not_configured",
        error: "AgentMail is not configured. Set AGENTMAIL_API_KEY before sending email.",
      });
      return null;
    }

    try {
      const mailboxes = getSharedAgentMailboxes();

      await ctx.runMutation((internal as any).claims.setAgentMailInboxes, {
        claimId: args.claimId,
        claimInboxId: mailboxes.senderInboxId,
        claimInboxEmail: mailboxes.senderEmail,
        adjudicatorInboxId: mailboxes.adjudicatorInboxId,
        adjudicatorEmail: mailboxes.adjudicatorEmail,
        status: "shared",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await ctx.runMutation((internal as any).claims.setAgentMailInboxes, {
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

    const started = await ctx.runMutation((internal as any).emails.startInboundIntake, {
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
      let storageId: string | undefined;

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
        storageId = await ctx.storage.store(new Blob([attachment.bytes], { type: contentType })) as string;
      }

      if (!bodyText.trim() && !storageId) {
        throw new Error("Inbound email has no readable body or supported denial-document attachment.");
      }

      const extraction = await ctx.runAction((api as any)["actions/opticalParser"].parseDenialDocument, {
        rawDocumentText: bodyText,
        ...(storageId ? { storageId } : {}),
        patientEmail: senderEmail,
      });

      const threadId = await ctx.runMutation((internal as any).emails.getOrCreateThreadInternal, {
        claimId: extraction.claimId,
        agentEmail: intakeMailbox.email,
        payerEmail: senderEmail,
        subject: normalized.subject || "Claim denial document intake",
      });
      await ctx.runMutation((internal as any).emails.insertMessageInternal, {
        threadId,
        claimId: extraction.claimId,
        direction: "inbound",
        sender,
        recipient: intakeMailbox.email,
        subject: normalized.subject || "Claim denial document intake",
        bodyHtml: normalized.html || (bodyText ? `<p>${bodyText}</p>` : "<p>Attachment-only intake message.</p>"),
        bodyText: bodyText || "Attachment-only intake message.",
        hasAttachments: normalized.attachments.length > 0,
        agentMailMessageId: normalized.messageId,
      });
      await ctx.runMutation((internal as any).claims.updateStatusInternal, {
        claimId: extraction.claimId,
        status: "ingested",
        actor: "AgentMail Intake Digest",
        details: "Inbound denial document digested from the ClaimHero intake inbox. Confirm case context before drafting.",
      });
      await ctx.runMutation((internal as any).emails.completeInboundIntake, {
        eventId: args.eventId,
        claimId: extraction.claimId,
      });
    } catch (error) {
      await ctx.runMutation((internal as any).emails.failInboundIntake, {
        eventId: args.eventId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }

    return null;
  },
});

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

    const matchingClaim: any = await ctx.runQuery(
      (internal as any).claims.findMatchingClaimInternal,
      {
        subject,
        bodySnippet: bodyContent.slice(0, 1000),
        recipients: recipientEmails,
      }
    );
    if (!matchingClaim) {
      console.warn(`No ClaimHero case matched inbound AgentMail message ${args.messageId}.`);
      return null;
    }

    const sender = normalized.from || "Insurance Payer";
    const threadId = await ctx.runMutation((internal as any).emails.getOrCreateThreadInternal, {
      claimId: matchingClaim._id,
      agentEmail: normalized.recipients[0] || "",
      payerEmail: extractEmailAddress(sender) || sender,
      subject,
    });
    await ctx.runMutation((internal as any).emails.insertMessageInternal, {
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
    });

    const lowerText = (normalized.text || normalized.html || "").toLowerCase();
    if (
      lowerText.includes("overturned") ||
      lowerText.includes("approved") ||
      lowerText.includes("payment issued") ||
      lowerText.includes("reimbursed")
    ) {
      await ctx.runMutation((internal as any).claims.updateStatusInternal, {
        claimId: matchingClaim._id,
        status: "won",
        actor: "AgentMail Autonomous Adjudicator",
        details: `Payer approval received for claim ${matchingClaim.claimNumber}.`,
      });
    } else {
      await ctx.runMutation((internal as any).claims.updateStatusInternal, {
        claimId: matchingClaim._id,
        status: "dispatched",
        actor: "AgentMail Webhook",
        details: `Inbound correspondence received regarding claim #${matchingClaim.claimNumber}.`,
      });
    }

    return null;
  },
});
