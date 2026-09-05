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
  buildAdversaryStrategyHint,
  buildCounterRebuttalFallback,
  calculatePartialSettlementOffer,
  getCountermoveClaimStatus,
  getCountermoveLabel,
  type AdversaryCountermove,
} from "../lib/adversaryNegotiation";
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
      enum: [
        "OVERTURNED_APPROVED",
        "PARTIAL_SETTLEMENT_OFFER",
        "ADDITIONAL_RECORDS_REQUIRED",
        "POLICY_CONFLICT_CITATION",
        "DENIAL_UPHELD",
      ],
    },
    determinationSummary: { type: "string" },
    clinicalRationale: { type: "string" },
    formalDeterminationLetter: { type: "string" },
    authorizedSettlementAmount: { type: "number" },
    requestedRecords: {
      type: "array",
      items: { type: "string" },
    },
    citedPolicyClause: { type: "string" },
    settlementOfferPct: { type: "number" },
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
  determination: AdversaryCountermove;
  determinationSummary: string;
  clinicalRationale: string;
  formalDeterminationLetter: string;
  authorizedSettlementAmount: number;
  requestedRecords?: string[];
  citedPolicyClause?: string;
  settlementOfferPct?: number;
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
  autoPilotEnabled?: boolean;
  overturnProbabilityScore?: number;
}

function buildInitialAdjudicationPrompt(
  claim: AdjudicationClaimContext,
  payer: string,
  strategyHint?: string
): string {
  const partialOffer = calculatePartialSettlementOffer(claim.deniedAmount);
  return `You are Demo AI Reviewer, an autonomous Insurer Defense Adversary simulating a payer medical director evaluating an appeal against ${payer} for platform demonstration and technical evaluation purposes.
You have just received a formal Level 1 ERISA Medical Appeal and cited Clinical Reconsideration Memorandum for Claim #${claim.claimNumber} (Patient: ${claim.patient?.name}).
Evaluate the appeal as a realistic insurer adversary defending the adverse determination, choosing exactly one countermove:
- Review the clinical CPT codes: [${(claim.cptCodes || []).join(", ")}], ICD-10 diagnosis: [${(claim.icd10Codes || []).join(", ")}], denied amount: $${claim.deniedAmount}.
- "OVERTURNED_APPROVED": the brief proves conservative therapy, radiographic evidence, or emergency exceptions meet criteria. Authorize the full denied amount.
- "ADDITIONAL_RECORDS_REQUIRED": the brief is curable but missing specific proof. Issue a formal Request for Information naming exact records (operative notes with indication/technique, dated imaging with radiologist interpretation, conservative therapy records with dates/response, prior authorization). Populate requestedRecords.
- "POLICY_CONFLICT_CITATION": the brief collides with a specific payer Clinical Policy Bulletin clause. Cite the conflicting CPB section verbatim, explain why the facts fail it, and invite a distinguishing rebuttal. Populate citedPolicyClause.
- "PARTIAL_SETTLEMENT_OFFER": the file has merit but residual risk. Offer a compromise 40% settlement of $${partialOffer.toLocaleString()} (set authorizedSettlementAmount to ${partialOffer} and settlementOfferPct to 0.4) while reserving the balance, and state what would unlock full payment.
- "DENIAL_UPHELD": coverage criteria definitively cannot be met or an unbending contractual exclusion applies.
${strategyHint ? `\nAdversary strategy guidance: ${strategyHint}` : ""}
  - Write a formal, professional determination letter addressed to the treating provider. Acknowledge the memorandum, cite the clinical coverage criteria, and clearly explain the decision.
  - Set reviewerName to "Demo AI Reviewer" and reviewerTitle to "Independent Clinical Reviewer (Simulated)".
  - Write the letter as natural business correspondence: use a salutation, short paragraphs, a clear decision, and a professional closing. Return letter content only. Do not use Markdown syntax, all-caps filler, AI meta-commentary, or generic phrases such as "as an AI".`;
}

function buildFollowUpAdjudicationPrompt(
  claim: AdjudicationClaimContext,
  payer: string,
  strategyHint?: string
): string {
  const partialOffer = calculatePartialSettlementOffer(claim.deniedAmount);
  return `You are Demo AI Reviewer, an autonomous Insurer Defense Adversary in ongoing Level 1 ERISA appeal correspondence against ${payer} for demonstration and testing purposes.
You are in ongoing Level 1 ERISA medical appeal correspondence for Claim #${claim.claimNumber} (Patient: ${claim.patient?.name}).
The appellant has sent a follow-up addendum or rebuttal after your prior countermove. Rule on the full thread as a realistic adversary:
- Review the clinical CPT codes: [${(claim.cptCodes || []).join(", ")}], ICD-10 diagnosis: [${(claim.icd10Codes || []).join(", ")}], denied amount: $${claim.deniedAmount}.
- If the addendum cures the deficiency (supplies operative notes, imaging, conservative-therapy proof, or distinguishes the cited CPB clause), concede with "OVERTURNED_APPROVED".
- If the record remains curable, issue "ADDITIONAL_RECORDS_REQUIRED" naming exactly which records are still outstanding in requestedRecords.
- If a specific CPB clause still controls, issue "POLICY_CONFLICT_CITATION" with citedPolicyClause quoted and a path to distinguish it.
- If liability is now probable but you need a final compromise, issue "PARTIAL_SETTLEMENT_OFFER" at 40% ($${partialOffer.toLocaleString()}) with authorizedSettlementAmount ${partialOffer} and settlementOfferPct 0.4.
- If criteria definitively fail, issue "DENIAL_UPHELD".
- If you already overturned this claim and no new contrary facts emerged, reaffirm the approval.
${strategyHint ? `\nAdversary strategy guidance: ${strategyHint}` : ""}
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

  const preThreadData = await ctx.runQuery(api.emails.getThreadWithMessages, {
    threadId,
  });
  const negotiationRound = (preThreadData?.messages || []).filter(
    (m: { direction?: string }) => m.direction === "inbound"
  ).length;
  const strategyHint = buildAdversaryStrategyHint({
    claimNumber: claim.claimNumber,
    deniedAmount: claim.deniedAmount,
    overturnProbabilityScore: claim.overturnProbabilityScore,
    negotiationRound,
  });

  const adjudicationResult = await createStructuredCompletion<AdjudicationResponse>({
    systemPrompt: isFollowUp
      ? buildFollowUpAdjudicationPrompt(claim, payer, strategyHint)
      : buildInitialAdjudicationPrompt(claim, payer, strategyHint),
    userPrompt,
    schemaName: "AdjudicationResponse",
    schema: ADJUDICATION_SCHEMA,
    temperature: 0.4,
  });

  const threadData = preThreadData;

  const claimTag = `[ClaimHero #${claim.claimNumber}]`;
  const determinationLabel = getCountermoveLabel(adjudicationResult.determination);

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

  const priorMessages: Array<{ agentMailMessageId?: string }> = threadData?.messages || [];
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
    ctx,
  });

  const replyThreadId = liveReply.threadId || liveReply.messageId;
  if (replyThreadId) {
    await ctx.runMutation(internal.claims.setAgentMailThreadIdInternal, {
      claimId: claim._id,
      agentMailThreadId: replyThreadId,
    });
  }

  const isOverturned = adjudicationResult.determination === "OVERTURNED_APPROVED";
  const normalizedSettlement =
    adjudicationResult.determination === "PARTIAL_SETTLEMENT_OFFER"
      ? (Number.isFinite(adjudicationResult.authorizedSettlementAmount) &&
        adjudicationResult.authorizedSettlementAmount > 0
          ? adjudicationResult.authorizedSettlementAmount
          : calculatePartialSettlementOffer(claim.deniedAmount))
      : adjudicationResult.authorizedSettlementAmount;
  const requestedRecords = Array.isArray(adjudicationResult.requestedRecords)
    ? adjudicationResult.requestedRecords.filter((r) => typeof r === "string" && r.trim()).slice(0, 8)
    : undefined;

  // Auto-draft the advocate's counter-rebuttal immediately so the negotiation
  // round is actionable the moment the adversary countermove lands.
  let counterRebuttal = "";
  if (!isOverturned) {
    const fallbackDraft = buildCounterRebuttalFallback({
      claimNumber: claim.claimNumber,
      determination: adjudicationResult.determination,
      deniedAmount: claim.deniedAmount,
      settlementAmount: normalizedSettlement,
      cptCodes: claim.cptCodes,
    });
    try {
      const challengeContext = [
        adjudicationResult.determinationSummary,
        adjudicationResult.clinicalRationale,
        adjudicationResult.citedPolicyClause
          ? `Cited policy clause: ${adjudicationResult.citedPolicyClause}`
          : "",
        requestedRecords && requestedRecords.length > 0
          ? `Records demanded: ${requestedRecords.join("; ")}`
          : "",
        adjudicationResult.determination === "PARTIAL_SETTLEMENT_OFFER"
          ? `Settlement offered: $${normalizedSettlement.toLocaleString()} of $${claim.deniedAmount.toLocaleString()} disputed.`
          : "",
      ]
        .filter(Boolean)
        .join("\n");
      counterRebuttal = await createChatCompletion({
        systemPrompt: `You are a Board-Certified Physician Appeal Specialist & ERISA Appellate Counsel for ClaimHero. Draft the advocate's immediate counter-rebuttal to an insurer defense countermove (${adjudicationResult.determination}) on Claim #${claim.claimNumber} against ${payer}. CPT [${(claim.cptCodes || []).join(", ")}], denied $${claim.deniedAmount}. Be authoritative, cite ERISA 29 C.F.R. section 2560.503-1, address the challenge point-by-point, and close with a clear demand (full payment, IRO escalation, or cure path). No Markdown headings, no AI meta-language.`,
        userPrompt: `Insurer countermove summary:\n${challengeContext}\n\nPayer letter:\n${adjudicationResult.formalDeterminationLetter}\n\nDraft the complete counter-rebuttal addendum.`,
        temperature: 0.2,
      });
      counterRebuttal = counterRebuttal.trim() || fallbackDraft;
    } catch (draftErr) {
      console.warn("Counter-rebuttal synthesis failed; using fallback draft:", draftErr);
      counterRebuttal = fallbackDraft;
    }
  }

  const insertedMsgId = await ctx.runMutation(internal.emails.insertMessageInternal, withAgentMailMessageId({
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
    clinicalRationale: adjudicationResult.citedPolicyClause
      ? `${adjudicationResult.clinicalRationale} Cited clause: ${adjudicationResult.citedPolicyClause}`
      : adjudicationResult.clinicalRationale,
    missingRecordsRequested: requestedRecords,
    settlementAmount: normalizedSettlement,
    autoReplyDraft: isOverturned ? undefined : (counterRebuttal || undefined),
    autoReplyStatus: isOverturned ? undefined : "pending",
  }, liveReply.messageId, liveReply.outboundId));

  if (claim.autoPilotEnabled !== false && !isOverturned && insertedMsgId && ctx.scheduler?.runAfter) {
    try {
      await ctx.scheduler.runAfter(
        60 * 60 * 1000,
        internal.actions.mailDispatcher.dispatchScheduledAutoPilotReply,
        {
          messageId: insertedMsgId as Id<"emailMessages">,
          claimId: claim._id,
          threadId,
        }
      );
    } catch (schedErr) {
      console.warn("Failed to schedule auto-pilot in deliverAiAdjudication:", schedErr);
    }
  }

  const nextStatus = getCountermoveClaimStatus(adjudicationResult.determination);
  if (adjudicationResult.determination === "OVERTURNED_APPROVED") {
    await ctx.runMutation(internal.claims.updateStatusInternal, {
      claimId: claim._id,
      status: "won",
      actor: `${payer} Demo Reviewer`,
      details: `VICTORY: Demo AI Reviewer overturned adverse determination. Authorized full recovery of $${(claim.deniedAmount || 0).toLocaleString()} released for payment. (Simulated evaluation)`,
    });
  } else if (adjudicationResult.determination === "PARTIAL_SETTLEMENT_OFFER") {
    await ctx.runMutation(internal.claims.updateStatusInternal, {
      claimId: claim._id,
      status: nextStatus,
      actor: `${payer} Demo Reviewer`,
      details: `NEGOTIATION: Insurer Defense Adversary extended a 40% partial settlement of $${normalizedSettlement.toLocaleString()} on $${claim.deniedAmount.toLocaleString()} disputed. Counter-rebuttal drafted for advocate review. (Simulated evaluation)`,
    });
  } else if (adjudicationResult.determination === "ADDITIONAL_RECORDS_REQUIRED") {
    await ctx.runMutation(internal.claims.updateStatusInternal, {
      claimId: claim._id,
      status: nextStatus,
      actor: `${payer} Demo Reviewer`,
      details: `RFI: Insurer Defense Adversary requested ${requestedRecords && requestedRecords.length > 0 ? requestedRecords.join("; ") : "operative notes, imaging, and conservative-therapy records"}. Counter-rebuttal drafted. (Simulated evaluation)`,
    });
  } else if (adjudicationResult.determination === "POLICY_CONFLICT_CITATION") {
    await ctx.runMutation(internal.claims.updateStatusInternal, {
      claimId: claim._id,
      status: nextStatus,
      actor: `${payer} Demo Reviewer`,
      details: `POLICY CHALLENGE: Insurer Defense Adversary cited conflicting CPB language${adjudicationResult.citedPolicyClause ? `: ${adjudicationResult.citedPolicyClause.slice(0, 220)}` : ""}. Distinguishing rebuttal drafted for IRO escalation path. (Simulated evaluation)`,
    });
  } else if (adjudicationResult.determination === "DENIAL_UPHELD") {
    await ctx.runMutation(internal.claims.updateStatusInternal, {
      claimId: claim._id,
      status: "escalated",
      actor: `${payer} Demo Reviewer`,
      details: `DENIAL UPHELD: Demo AI Reviewer confirmed adverse determination after clinical evaluation. File queued for Level 2 / IRO escalation with drafted rebuttal. (Simulated evaluation)`,
    });
  }

  try {
    await ctx.runMutation(internal.auditLogs.logEventInternal, {
      claimId: claim._id,
      eventType: "payer_response_received",
      actor: "Insurer Defense Adversary",
      details: `Round ${negotiationRound} countermove ${adjudicationResult.determination} on claim #${claim.claimNumber}: ${adjudicationResult.determinationSummary.slice(0, 280)}`,
    });
  } catch (auditErr) {
    console.warn("Failed to log adversary countermove audit event:", auditErr);
  }

  return { ...adjudicationResult, authorizedSettlementAmount: normalizedSettlement };
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
    customRecipient: v.optional(v.string()),
    customSubject: v.optional(v.string()),
    dispatchMode: v.optional(v.string()), // "ai_adjudicator" | "custom_email" | "official_payer"
    waiveRedaction: v.optional(v.boolean()),
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
    const mode = args.dispatchMode || ((args.recipientEmail || args.customRecipient)?.includes("@") ? "custom_email" : "ai_adjudicator");

    let recipient = (args.recipientEmail || args.customRecipient)?.trim();
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
    const rawPatientName = claim.patient?.name || claim.patientName;
    const patientName = resolveClaimPatientName(rawPatientName, claim.claimNumber, claim.patient?.memberId);

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
    try {
      storedPdf = await ensureAppealPdfStored(ctx, claim, appeal);
    } catch (pdfErr) {
      console.warn("Failed to pull or compile PDF brief for outbound transmission:", pdfErr);
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

  const waiveRedaction = Boolean(args.waiveRedaction);
  const isCustomEmail = Boolean(args.customRecipient && !isAiAdjudicatorAddress(args.customRecipient));

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

  const isAiAdjudicatorReply = isAiAdjudicatorAddress(recipient);
  const mailboxes = await ensureClaimMailboxes(ctx, claim);
  const sender = mailboxes.claimEmail;
  const resolvedRecipient = isAiAdjudicatorReply
    ? mailboxes.adjudicatorEmail
    : recipient;
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

/**
 * Autonomous Sentinel Auto-Pilot 1-Hour SLA Dispatch Core Logic:
 * Checks prerequisites, ensures no subsequent manual response was sent, and autonomously transmits rebuttal.
 */
async function performDispatchScheduledAutoPilotReply(
  ctx: ActionCtx,
  args: {
    messageId: Id<"emailMessages">;
    claimId: Id<"claims">;
    threadId: Id<"emailThreads">;
  }
): Promise<{ executed: boolean; reason?: string; claimNumber?: string }> {
  const messageState = await ctx.runQuery(internal.emails.getAutoPilotMessageStateInternal, {
    messageId: args.messageId,
    threadId: args.threadId,
  });
  if (!messageState) return { executed: false, reason: "message_not_found" };

  if (messageState.autoReplyStatus !== "pending") {
    return { executed: false, reason: `status_not_pending_${messageState.autoReplyStatus}` };
  }

  const claim = await ctx.runQuery(internal.claims.getByIdInternal, {
    claimId: args.claimId,
  });
  if (!claim) {
    await ctx.runMutation(internal.emails.updateMessageAnalysisInternal, {
      messageId: args.messageId,
      autoReplyStatus: "skipped",
    });
    return { executed: false, reason: "claim_not_found" };
  }
  if (claim.status === "won") {
    await ctx.runMutation(internal.emails.markAutoReplyDispatchedInternal, {
      messageId: args.messageId,
    });
    return { executed: false, reason: "claim_already_won" };
  }
  if (claim.autoPilotEnabled === false) {
    // Crucial: Mark as disabled so background cron does not endlessly re-sweep this message every 5 minutes
    await ctx.runMutation(internal.emails.updateMessageAnalysisInternal, {
      messageId: args.messageId,
      autoReplyStatus: "disabled",
    });
    return { executed: false, reason: "autopilot_disabled" };
  }

  // Check if an outbound reply was already sent on this thread AFTER this message
  if (messageState.hasSubsequentOutbound) {
    await ctx.runMutation(internal.emails.markAutoReplyDispatchedInternal, {
      messageId: args.messageId,
    });
    return { executed: false, reason: "already_replied" };
  }

  let rebuttalText = messageState.autoReplyDraft?.trim();
  if (!rebuttalText) {
    rebuttalText = `We acknowledge your correspondence regarding Claim #${claim.claimNumber}. In accordance with statutory ERISA protections under 29 C.F.R. § 2560.503-1, we formally maintain our demand for full claim reimbursement based on documented medical necessity and request immediate escalation to Independent External Review (IRO).`;
  }

  const subject = `Re: Formal Medical Appeal | Claim #${claim.claimNumber} | Sentinel 1-Hour SLA Addendum`;
  await performSendOutboundMessage(
    ctx,
    {
      claimId: args.claimId,
      threadId: args.threadId,
      text: rebuttalText,
      customSubject: subject,
    },
    claim
  );

  await ctx.runMutation(internal.emails.markAutoReplyDispatchedInternal, {
    messageId: args.messageId,
  });

  await ctx.runMutation(internal.auditLogs.logEventInternal, {
    claimId: args.claimId,
    ...(claim.userId ? { userId: claim.userId } : {}),
    eventType: "appeal_dispatched",
    actor: "Sentinel Auto-Pilot (1-Hour SLA)",
    details: `Autonomous Sentinel SLA: Transmitted clinical rebuttal addendum to payer for Claim #${claim.claimNumber} after 1-hour review window elapsed without manual intervention.`,
  });

  return { executed: true, claimNumber: claim.claimNumber };
}

/**
 * Scheduled execution action for a single inbound message after 1 hour SLA
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
 * Sentinel Auto-Pilot SLA Cron Sweep:
 * Runs periodically (every 5 minutes) to detect any inbound messages with pending auto-reply drafts
 * older than 1 hour (3,600,000 ms) and dispatches them autonomously.
 */
export const sweepPendingAutoPilotReplies = internalAction({
  args: {
    customMaxAgeMs: v.optional(v.number()),
  },
  handler: async (
    ctx,
    args
  ): Promise<{ totalFound: number; dispatchedCount: number; skippedCount: number }> => {
    const maxAgeMs = args.customMaxAgeMs ?? 60 * 60 * 1000;
    const maxReceivedAt = Date.now() - maxAgeMs;

    const pendingMessages: Array<{
      messageId: Id<"emailMessages">;
      claimId: Id<"claims">;
      threadId: Id<"emailThreads">;
      autoReplyDraft?: string;
      receivedAt: number;
      detectedDetermination?: string;
    }> = await ctx.runQuery(
      internal.emails.getPendingAutoPilotMessagesInternal,
      { maxReceivedAt }
    );

    let dispatchedCount = 0;
    let skippedCount = 0;

    for (const pending of pendingMessages) {
      try {
        const res = await performDispatchScheduledAutoPilotReply(ctx, {
          messageId: pending.messageId,
          claimId: pending.claimId,
          threadId: pending.threadId,
        });
        if (res.executed) {
          dispatchedCount++;
        } else {
          skippedCount++;
        }
      } catch (err) {
        console.warn(`Sentinel Auto-Pilot sweep error for message ${pending.messageId}:`, err);
        try {
          await ctx.runMutation(internal.emails.updateMessageAnalysisInternal, {
            messageId: pending.messageId,
            autoReplyStatus: "failed",
          });
        } catch {
          // Graceful fallback
        }
        skippedCount++;
      }
    }

    return {
      totalFound: pendingMessages.length,
      dispatchedCount,
      skippedCount,
    };
  },
});

/**
 * Autonomous Adversary Negotiation Round (on-demand simulation):
 * Reviews the latest brief + thread transcript from the adjudicator inbox
 * and issues the next realistic insurer countermove (RFI, conflicting CPB
 * citation, partial 40% settlement, uphold, or overturn). The inbound
 * pipeline records the challenge, updates claim state, and arms the
 * advocate's auto-drafted counter-rebuttal — a full multi-agent
 * negotiation turn over email.
 */
export const runAdversaryNegotiationRound = internalAction({
  args: {
    claimId: v.id("claims"),
    threadId: v.id("emailThreads"),
  },
  handler: async (ctx, args): Promise<{ determination: string; claimNumber: string }> => {
    const claim = await ctx.runQuery(internal.claims.getByIdInternal, {
      claimId: args.claimId,
    });
    if (!claim) throw new Error(`Claim ${args.claimId} not found`);
    if (claim.status === "won") {
      return { determination: "OVERTURNED_APPROVED", claimNumber: claim.claimNumber };
    }

    const mailboxes = await ensureClaimMailboxes(ctx, claim);
    if (!mailboxes.adjudicatorInboxId || !mailboxes.adjudicatorEmail) {
      throw new Error("AgentMail did not return a payer adjudicator inbox for this claim.");
    }

    const threadData = await ctx.runQuery(api.emails.getThreadWithMessages, {
      threadId: args.threadId,
    });
    const historyMessages = ((threadData?.messages || []) as Array<{
      direction: string;
      subject: string;
      bodyText: string;
    }>);
    const transcript = formatCorrespondenceTranscript(historyMessages);
    const payer = claim.patient?.insurancePayer || claim.insurancePayer || "Health Insurer";

    const result = await deliverAiAdjudication(ctx, {
      claim,
      threadId: args.threadId,
      sender: mailboxes.claimEmail,
      recipient: mailboxes.adjudicatorEmail,
      payer,
      adjudicatorInboxId: mailboxes.adjudicatorInboxId,
      userPrompt: `Ongoing appellate negotiation for Claim #${claim.claimNumber}. Full correspondence transcript:\n\n${transcript}\n\nIssue the next Insurer Defense Adversary countermove.`,
      isFollowUp: true,
    });
    return { determination: result.determination, claimNumber: claim.claimNumber };
  },
});

