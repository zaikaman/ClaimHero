"use node";

import { action, internalAction, type ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import {
  getAgentMailMessage,
  getSharedAgentMailboxes,
  listAgentMailMessages,
  sendAgentMailMessage,
} from "../lib/agentMail";
import { extractEmailAddress, normalizeAgentMailWebhook } from "../lib/agentMailWebhook";
import { requireAuthUser } from "../lib/auth";

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

async function handleInboundClaimReply(
  ctx: ActionCtx,
  args: {
    eventId: string;
    messageId: string;
    inboxId: string;
  }
): Promise<null> {
  // Idempotency check: if message already processed, skip
  const alreadyRecorded = await ctx.runQuery(internal.emails.hasMessageByAgentMailId, {
    agentMailMessageId: args.messageId,
  });
  if (alreadyRecorded === true) {
    return null;
  }

  const message = await getAgentMailMessage(args.inboxId, args.messageId);
    const normalized = normalizeAgentMailWebhook({
      event_type: "message.received",
      event_id: args.eventId,
      message,
    });
    if (!normalized) throw new Error("AgentMail reply payload could not be validated.");

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

    // 0. Try standard in_reply_to or references against prior outbound emailMessages
    const candidateMessageIds: string[] = [];
    if (typeof message.in_reply_to === "string" && message.in_reply_to.trim()) {
      candidateMessageIds.push(message.in_reply_to.trim());
    }
    if (typeof message.inReplyTo === "string" && message.inReplyTo.trim()) {
      candidateMessageIds.push(message.inReplyTo.trim());
    }
    if (Array.isArray(message.references)) {
      for (const ref of message.references) {
        if (typeof ref === "string" && ref.trim()) {
          candidateMessageIds.push(ref.trim());
        }
      }
    }
    for (const refId of candidateMessageIds) {
      matchingClaim = await ctx.runQuery(
        internal.emails.getClaimByAgentMailMessageIdInternal,
        { agentMailMessageId: refId }
      );
      if (matchingClaim) break;
    }

    // 1. Try threadId match first
    if (!matchingClaim && inboundThreadId) {
      matchingClaim = await ctx.runQuery(internal.claims.getByThreadIdInternal, {
        threadId: inboundThreadId,
      });
    }

    // 2. Fallback to regex /#CH-\d+/ and [ClaimHero #...] across subject and body
    if (!matchingClaim) {
      const searchTarget = `${subject} ${bodyContent.slice(0, 2000)}`;
      const chMatch =
        searchTarget.match(/#(CH-\d+)/i) ||
        searchTarget.match(/\[ClaimHero\s*#([^\]]+)\]/i) ||
        searchTarget.match(/#(CLM-[A-Za-z0-9-]+)/i) ||
        searchTarget.match(/(CH-\d+)/i);
      if (chMatch && chMatch[1]) {
        matchingClaim = await ctx.runQuery(internal.claims.getByClaimNumberInternal, {
          claimNumber: chMatch[1].trim(),
        });
      }
    }

    // 3. Fallback to dedicated recipient exact match (strictly excluding shared inboxes)
    if (!matchingClaim) {
      for (const recipient of recipientEmails) {
        const norm = recipient.toLowerCase();
        if (
          norm.includes("claimhero-sender@") ||
          norm.includes("claimhero-adjudicator@") ||
          norm === "claimhero-sender@agentmail.to" ||
          norm === "claimhero-adjudicator@agentmail.to"
        ) {
          continue;
        }
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
      try {
        await ctx.runMutation(internal.emails.recordIgnoredAgentMailMessageInternal, {
          agentMailMessageId: args.messageId,
          reason: "No ClaimHero case matched inbound message",
        });
      } catch {
        // Safe fallback
      }
      return null;
    }

    const sender = normalized.from || "Insurance Payer";
    const payer = matchingClaim.insurancePayer || "Health Insurer";

    const lowerFrom = (normalized.from || "").toLowerCase();
    const lowerSubject = subject.toLowerCase();
    const lowerBody = (normalized.text || normalized.html || "").toLowerCase();

    // Detect system bounce / Delivery Status Notification / mailer-daemon / auto-responder or self-sent / alert loopback
    let sharedMailboxes;
    try {
      sharedMailboxes = getSharedAgentMailboxes();
    } catch {
      // Ignore if mailboxes not configured in test environment
    }
    const ownSenderEmail = sharedMailboxes?.senderEmail?.toLowerCase();
    const ownAdjudicatorEmail = sharedMailboxes?.adjudicatorEmail?.toLowerCase();
    const senderClean = (extractEmailAddress(sender) || sender).toLowerCase();

    const isSelfSender =
      (Boolean(ownSenderEmail) && (lowerFrom.includes(ownSenderEmail!) || senderClean === ownSenderEmail)) ||
      (Boolean(ownAdjudicatorEmail) && (lowerFrom.includes(ownAdjudicatorEmail!) || senderClean === ownAdjudicatorEmail));

    const isAlertMessage = lowerSubject.includes("[claimhero alert]") || isSelfSender;

    // Silently ignore loopback alert emails or self-sent emails from AgentMail inboxes
    if (isAlertMessage) {
      return null;
    }

    const isBounceSender =
      lowerFrom.includes("mailer-daemon") ||
      lowerFrom.includes("postmaster") ||
      lowerFrom.includes("amazonses.com") ||
      lowerFrom.includes("bounces@") ||
      lowerFrom.includes("noreply") ||
      lowerFrom.includes("no-reply");

    const isBounceSubject =
      lowerSubject.includes("delivery status notification") ||
      lowerSubject.includes("undelivered mail") ||
      lowerSubject.includes("mail delivery failed") ||
      lowerSubject.includes("failure notice") ||
      lowerSubject.includes("returned mail") ||
      lowerSubject.includes("delivery failure");

    const isBounceBody =
      lowerBody.includes("diagnostic-code: smtp") ||
      lowerBody.includes("action: failed") ||
      lowerBody.includes("550 5.1.1") ||
      lowerBody.includes("reporting-mta:");

    const isBounce = isBounceSender || isBounceSubject || isBounceBody;

    // Handle system bounce / non-delivery notifications quietly without triggering payer alerts or state mutations
    if (isBounce) {
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
        detectedDetermination: "DELIVERY_FAILURE",
        clinicalRationale: "Outbound transmission bounced or rejected by mail transfer agent.",
        autoReplyStatus: "skipped",
      });

      try {
        await ctx.runMutation(internal.auditLogs.logEventInternal, {
          claimId: matchingClaim._id,
          eventType: "outbound_delivery_failed",
          actor: "Mailer Daemon",
          details: `Outbound delivery failure detected for claim #${matchingClaim.claimNumber}`,
        });
      } catch (logErr) {
        console.warn("Failed to log delivery failure audit event:", logErr);
      }

      return null;
    }

    // Fast heuristic classification for instantaneous sub-second UI rendering
    const lowerText = (normalized.text || normalized.html || subject || "").toLowerCase();
    const isApprovalFallback =
      lowerText.includes("overturned") ||
      lowerText.includes("approved") ||
      lowerText.includes("payment issued") ||
      lowerText.includes("reimbursed") ||
      lowerText.includes("reversed");
    const isRecordsFallback =
      lowerText.includes("additional records") ||
      lowerText.includes("documentation required") ||
      lowerText.includes("please provide") ||
      lowerText.includes("clinical records") ||
      lowerText.includes("need records");
    const isDenialFallback =
      lowerText.includes("upheld") ||
      lowerText.includes("denial maintained") ||
      lowerText.includes("adverse determination affirmed") ||
      lowerText.includes("not paying") ||
      lowerText.includes("ain't paying") ||
      lowerText.includes("refuse") ||
      lowerText.includes("denied");

    const fallbackDetermination = isApprovalFallback
      ? "OVERTURNED_APPROVED"
      : isRecordsFallback
      ? "ADDITIONAL_RECORDS_REQUIRED"
      : isDenialFallback
      ? "DENIAL_UPHELD"
      : "GENERAL_INQUIRY";

    const threadId = await ctx.runMutation(internal.emails.getOrCreateThreadInternal, {
      claimId: matchingClaim._id,
      agentEmail: normalized.recipients[0] || "",
      payerEmail: extractEmailAddress(sender) || sender,
      subject,
    });

    // ⚡ ATOMIC REAL-TIME PERSISTENCE & LOCK: Atomically claim and insert message
    const insertResult = await ctx.runMutation(internal.emails.insertInboundMessageInternal, {
      threadId,
      claimId: matchingClaim._id,
      sender,
      recipient: normalized.recipients[0] || "",
      subject,
      bodyHtml: normalized.html || `<p>${normalized.text || ""}</p>`,
      bodyText: normalized.text || normalized.html || "",
      hasAttachments: normalized.attachments.length > 0,
      agentMailMessageId: normalized.messageId,
      detectedDetermination: fallbackDetermination,
      clinicalRationale: fallbackDetermination === "OVERTURNED_APPROVED"
        ? "Determination overturned and approved."
        : fallbackDetermination === "ADDITIONAL_RECORDS_REQUIRED"
        ? "Payer requested additional clinical documentation."
        : fallbackDetermination === "DENIAL_UPHELD"
        ? "Adverse determination upheld by reviewer."
        : "Inbound correspondence received and recorded.",
      autoReplyStatus: fallbackDetermination === "OVERTURNED_APPROVED" ? undefined : "generating",
    });

    if (insertResult && typeof insertResult === "object" && "isNew" in insertResult && !insertResult.isNew) {
      // Concurrently processed by parallel webhook/sync execution; abort immediately
      return null;
    }
    const messageDbId =
      insertResult && typeof insertResult === "object" && "messageId" in insertResult
        ? insertResult.messageId
        : (insertResult as Id<"emailMessages">);

    // Update claim status based on initial instant assessment
    if (fallbackDetermination === "OVERTURNED_APPROVED") {
      await ctx.runMutation(internal.claims.updateStatusInternal, {
        claimId: matchingClaim._id,
        status: "won",
        actor: `${payer} Appellate Review Board`,
        details: `VICTORY: Adverse determination overturned. Authorized recovery of $${(matchingClaim.deniedAmount || 0).toLocaleString()} approved.`,
      });
    } else if (fallbackDetermination === "ADDITIONAL_RECORDS_REQUIRED") {
      await ctx.runMutation(internal.claims.updateStatusInternal, {
        claimId: matchingClaim._id,
        status: "under_review",
        actor: `${payer} Review Board`,
        details: "Additional clinical records requested by reviewer.",
      });
    } else if (fallbackDetermination === "DENIAL_UPHELD") {
      await ctx.runMutation(internal.claims.updateStatusInternal, {
        claimId: matchingClaim._id,
        status: "escalated",
        actor: `${payer} Appeals Department`,
        details: "Initial determination upheld by payer. File queued for Level 2 review.",
      });
    }

    // Perform deep structured LLM evaluation to refine rationale, extract settlement numbers & draft rebuttal
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
4. For ANY determination other than OVERTURNED_APPROVED (especially DENIAL_UPHELD, ADDITIONAL_RECORDS_REQUIRED, or GENERAL_INQUIRY), synthesize a professional, court-ready clinical rebuttal or escalation addendum response referencing the claim's clinical evidence (e.g., formally demanding Independent Review Organization (IRO) external review citing statutory ERISA 29 C.F.R. § 2560.503-1 rights if the denial is upheld, or supplying requested records if additional records are requested).
5. CRITICAL RULE: If determination is "OVERTURNED_APPROVED" (claim won/approved), set shouldAutoReply to false and set suggestedAutoReplyAddendum to empty string "". For ALL other determinations, set shouldAutoReply to true and provide a non-empty suggestedAutoReplyAddendum.`,
        userPrompt: `Evaluate the following inbound email from ${sender}:\n\nSubject: ${subject}\n\n${bodyContent}`,
        schemaName: "InboundAnalysisResult",
        schema: INBOUND_ANALYSIS_SCHEMA,
        temperature: 0.1,
      });
    } catch (llmError) {
      console.warn("LLM evaluation of inbound message failed; falling back to conservative parsing:", llmError);
    }

    const determination = analysis?.determination || fallbackDetermination;
    const isOverturned = determination === "OVERTURNED_APPROVED" || matchingClaim.status === "won";
    const clinicalRationale =
      analysis?.clinicalRationale ||
      (determination === "OVERTURNED_APPROVED"
        ? "Determination overturned and approved by payer review."
        : determination === "ADDITIONAL_RECORDS_REQUIRED"
        ? "Payer requested additional clinical documentation."
        : determination === "DENIAL_UPHELD"
        ? "Adverse determination upheld by reviewer."
        : "Inbound correspondence received and recorded.");
    const missingRecords = analysis?.missingRecordsRequested || [];
    const settlementAmount =
      analysis?.authorizedSettlementAmount ||
      (determination === "OVERTURNED_APPROVED" ? matchingClaim.deniedAmount : undefined);
    let suggestedAutoReply = isOverturned ? "" : (analysis?.suggestedAutoReplyAddendum || "");
    if (!isOverturned && !suggestedAutoReply.trim()) {
      suggestedAutoReply = `We acknowledge your correspondence regarding Claim #${matchingClaim.claimNumber}. Given your maintenance of the adverse determination despite documented emergency medical necessity for CPT [${(matchingClaim.cptCodes || []).join(", ")}], we formally request immediate escalation to Independent External Review (IRO) under 29 C.F.R. § 2560.503-1. Please provide the designated IRO contact details and statutory appellate documentation requirements.`;
    }

    // Refine the stored message with deep clinical analysis & auto-reply draft
    await ctx.runMutation(internal.emails.updateMessageAnalysisInternal, {
      messageId: messageDbId,
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

    // Autonomous Sentinel Auto-Pilot 1-Hour SLA:
    // If enabled and non-overturned, schedule autonomous clinical rebuttal dispatch in 1 hour if not manually reviewed or sent
    if (!isOverturned && matchingClaim.autoPilotEnabled !== false && suggestedAutoReply.trim() && ctx.scheduler?.runAfter) {
      try {
        const ONE_HOUR_MS = 60 * 60 * 1000;
        await ctx.scheduler.runAfter(
          ONE_HOUR_MS,
          internal.actions.mailDispatcher.dispatchScheduledAutoPilotReply,
          {
            messageId: messageDbId,
            claimId: matchingClaim._id,
            threadId,
          }
        );
        await ctx.runMutation(internal.auditLogs.logEventInternal, {
          claimId: matchingClaim._id,
          ...(matchingClaim.userId ? { userId: matchingClaim.userId } : {}),
          eventType: "appeal_review_requested",
          actor: "Sentinel Auto-Pilot",
          details: `Sentinel Auto-Pilot armed: 1-hour autonomous dispatch SLA scheduled for Claim #${matchingClaim.claimNumber} if no manual action is taken.`,
        });
      } catch (scheduleErr) {
        console.warn("Autonomous Sentinel Auto-Pilot scheduling failed:", scheduleErr);
      }
    }

    // User Email Notification: Notify user account owner whenever a valid inbound reply arrives (never for bounces, daemons, or self-sent)
    let userEmail: string | undefined;
    if (!isBounce && matchingClaim.userId) {
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

    // Skip notification if the inbound message is from a mailer daemon or bounce address
    if (userEmail && isBounceSender) {
      userEmail = undefined;
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

        const appSiteUrl = (process.env.SITE_URL || "https://kindhearted-elephant-992.convex.site").replace(/\/$/, "");
        const alertSubject = `[ClaimHero Alert] Payer Response: Claim #${matchingClaim.claimNumber} (${determinationHeadline})`;
        const alertText = `Hello,\n\nA new response has been received from ${payer} regarding Claim #${matchingClaim.claimNumber} (${matchingClaim.patientName || "Patient"}).\n\nDetermination: ${determinationHeadline}\nSummary: ${clinicalRationale}\n\n${
          matchingClaim.autoPilotEnabled !== false
            ? "Sentinel Auto-Pilot is ACTIVE for this claim. If no manual action is taken within 1 hour, Auto-Pilot will autonomously synthesize and dispatch the cited clinical rebuttal addendum."
            : "Sentinel Auto-Pilot is currently OFF. Please log in to ClaimHero to review this response."
        }\n\nReview Claim Docket: ${appSiteUrl}/app/inbox\n\nClaimHero Sentinel System`;

        const alertHtml = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto;padding:24px;background-color:#0b0f17;color:#f8fafc;border-radius:8px;border:1px solid #1e293b;"><div style="font-size:18px;font-weight:700;color:#00e5ff;margin-bottom:16px;">ClaimHero Sentinel Alert</div><p style="font-size:14px;line-height:1.6;color:#cbd5e1;">A new inbound response was received from <strong>${payer}</strong> for <strong>Claim #${matchingClaim.claimNumber}</strong>.</p><div style="background-color:#141c2c;border:1px solid #1e293b;padding:16px;border-radius:6px;margin:16px 0;"><div style="font-size:12px;text-transform:uppercase;letter-spacing:0.05em;color:#94a3b8;margin-bottom:4px;">Payer Determination</div><div style="font-size:15px;font-weight:600;color:#f8fafc;margin-bottom:8px;">${determinationHeadline}</div><div style="font-size:13px;color:#94a3b8;line-height:1.5;">${clinicalRationale}</div></div><p style="font-size:13px;color:#94a3b8;line-height:1.6;">${
          matchingClaim.autoPilotEnabled !== false
            ? "<strong style='color:#00e5ff;'>⚡ Sentinel Auto-Pilot is ACTIVE.</strong> If no manual action is taken within 1 hour, ClaimHero will autonomously synthesize and dispatch the cited rebuttal addendum."
            : "Please log in to your ClaimHero console to review this communication."
        }</p><div style="margin-top:24px;"><a href="${appSiteUrl}/app/inbox" style="display:inline-block;background-color:#0ea5e9;color:#ffffff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:600;font-size:14px;">Open Claim Inbox</a></div></div>`;

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
    return await handleInboundClaimReply(ctx, args);
  },
});

let lastSyncTimestamp = 0;
const SYNC_COOLDOWN_MS = 60_000;

async function performInboxSync(
  ctx: ActionCtx,
  limit = 30
): Promise<{ syncedCount: number; totalChecked: number }> {
  const now = Date.now();
  if (now - lastSyncTimestamp < SYNC_COOLDOWN_MS) {
    return { syncedCount: 0, totalChecked: 0 };
  }
  lastSyncTimestamp = now;

  const effectiveLimit = Math.min(Math.max(1, limit ?? 30), 30);

  if (!process.env.AGENTMAIL_API_KEY?.trim()) {
    return { syncedCount: 0, totalChecked: 0 };
  }

  let mailboxes;
  try {
    mailboxes = getSharedAgentMailboxes();
  } catch {
    return { syncedCount: 0, totalChecked: 0 };
  }

  const inboxesToCheck = Array.from(
    new Set([mailboxes.senderInboxId, mailboxes.adjudicatorInboxId].filter(Boolean))
  );

  let syncedCount = 0;
  let totalChecked = 0;

  // 1. Fetch messages across all target inboxes
  const inboxMessagesMap: Array<{ inboxId: string; messages: Array<Record<string, unknown>> }> = [];
  const candidateIds: string[] = [];

  for (const inboxId of inboxesToCheck) {
    try {
      const messages = await listAgentMailMessages(inboxId, effectiveLimit);
      inboxMessagesMap.push({ inboxId, messages });
      for (const msg of messages) {
        const rawMessageId =
          (typeof msg.message_id === "string" ? msg.message_id : undefined) ||
          (typeof msg.messageId === "string" ? msg.messageId : undefined) ||
          (typeof msg.id === "string" ? msg.id : undefined);
        if (rawMessageId) {
          candidateIds.push(rawMessageId);
        }
      }
    } catch (inboxErr) {
      console.warn(`Failed to list messages for inbox ${inboxId}:`, inboxErr);
    }
  }

  // 2. Single batch query to check all candidate IDs against DB (eliminates N sequential queries)
  let existingIdSet = new Set<string>();
  if (candidateIds.length > 0) {
    try {
      const existingList = await ctx.runQuery(
        internal.emails.getExistingAgentMailMessageIds,
        { agentMailMessageIds: candidateIds }
      );
      existingIdSet = new Set(existingList);
    } catch (batchErr) {
      console.warn("Failed batch query for existing AgentMail IDs:", batchErr);
    }
  }

  // 3. Process only unrecorded messages
  for (const { inboxId, messages } of inboxMessagesMap) {
    for (const msg of messages) {
      totalChecked++;
      const rawMessageId =
        (typeof msg.message_id === "string" ? msg.message_id : undefined) ||
        (typeof msg.messageId === "string" ? msg.messageId : undefined) ||
        (typeof msg.id === "string" ? msg.id : undefined);

      if (!rawMessageId) continue;

      const labels = Array.isArray(msg.labels) ? (msg.labels as string[]) : [];
      const fromStr = typeof msg.from === "string" ? msg.from.toLowerCase() : "";
      const senderEmail = (extractEmailAddress(fromStr) || fromStr).toLowerCase();
      const ownSenderEmail = mailboxes.senderEmail?.toLowerCase();
      const ownAdjudicatorEmail = mailboxes.adjudicatorEmail?.toLowerCase();

      const isOwnInboxSender =
        (Boolean(ownSenderEmail) && (senderEmail === ownSenderEmail || fromStr.includes(ownSenderEmail!))) ||
        (Boolean(ownAdjudicatorEmail) && (senderEmail === ownAdjudicatorEmail || fromStr.includes(ownAdjudicatorEmail!))) ||
        fromStr.includes(inboxId.toLowerCase());

      const subjectStr = typeof msg.subject === "string" ? msg.subject.toLowerCase() : "";
      const isAlertSubject = subjectStr.includes("[claimhero alert]");
      const isSent = labels.includes("sent");

      // Process if marked as received or if sender is not this inbox itself, and not an alert or self-sent message
      const isReceived = (labels.includes("received") || !isOwnInboxSender) && !isSent && !isOwnInboxSender && !isAlertSubject;
      if (!isReceived) continue;

      // Check if already in DB via pre-fetched in-memory set
      if (existingIdSet.has(rawMessageId)) continue;

      // Process the inbound claim reply
      try {
        const sanitizedId = rawMessageId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 16);
        await handleInboundClaimReply(ctx, {
          eventId: `sync_${Date.now()}_${sanitizedId}`,
          messageId: rawMessageId,
          inboxId,
        });
        existingIdSet.add(rawMessageId);
        syncedCount++;
      } catch (processErr) {
        console.warn(`Failed to process synced message ${rawMessageId}:`, processErr);
      }
    }
  }

  return { syncedCount, totalChecked };
}

/**
 * Internal action to poll and synchronize inbound messages from AgentMail inboxes.
 * Processes unrecorded messages that arrived while webhooks were offline or delayed.
 */
export const syncInboundMessagesInternal = internalAction({
  args: {
    limit: v.optional(v.number()),
  },
  returns: v.object({
    syncedCount: v.number(),
    totalChecked: v.number(),
  }),
  handler: async (ctx, args) => {
    return await performInboxSync(ctx, args.limit);
  },
});

/**
 * Public action callable from UI to trigger an immediate inbox sync
 */
export const syncInboxes = action({
  args: {
    limit: v.optional(v.number()),
  },
  returns: v.object({
    success: v.boolean(),
    syncedCount: v.number(),
    totalChecked: v.number(),
  }),
  handler: async (ctx, args) => {
    await requireAuthUser(ctx);
    const result = await performInboxSync(ctx, args.limit);
    return {
      success: true,
      syncedCount: result.syncedCount,
      totalChecked: result.totalChecked,
    };
  },
});

