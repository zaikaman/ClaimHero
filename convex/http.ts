import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { api } from "./_generated/api";
import { auth } from "./auth";

const http = httpRouter();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  if (typeof value === "string" && value.trim()) return value.trim();
  if (isRecord(value) && typeof value.email === "string" && value.email.trim()) {
    return value.email.trim();
  }
  return undefined;
}

// Convex Auth endpoints (/api/auth/...)
auth.addHttpRoutes(http);

/**
 * Inbound AgentMail Webhook Endpoint:
 * Receives incoming emails from insurance payers, matches them to the assigned claim inbox, and persists message + audit trail.
 */
http.route({
  path: "/agentmail-webhook",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const payload: unknown = await request.json();
      if (!isRecord(payload)) {
        return new Response(JSON.stringify({ error: "Invalid webhook payload" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }

      const data = isRecord(payload.data) ? payload.data : payload;
      const from = readString(data, "from") || readString(data, "sender");
      const to = readString(data, "to") || readString(data, "recipient");
      const subject = readString(data, "subject");
      const text = readString(data, "text") || readString(data, "extracted_text");
      const html = readString(data, "html") || readString(data, "extracted_html");
      const messageId = readString(data, "message_id") || readString(data, "messageId");
      const attachments = Array.isArray(data.attachments) ? data.attachments : [];

      if (!to || (!text && !html)) {
        return new Response(JSON.stringify({ error: "Missing required fields" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }

      // 1. Route by claim number first. The shared sender inbox receives every
      // claim, so recipient-only matching would attach a reply to the wrong case.
      const claims: any[] = await ctx.runQuery((api as any).claims.list, {});
      const subjectMatch = subject
        ? claims.find((c: any) => c.claimNumber && subject.includes(c.claimNumber))
        : undefined;
      const recipientMatches = claims.filter(
        (c: any) =>
          c.agentMailInboxEmail?.toLowerCase() === to.toLowerCase() ||
          c.assignedAgentEmail?.toLowerCase() === to.toLowerCase()
      );
      const matchingClaim = subjectMatch || (recipientMatches.length === 1 ? recipientMatches[0] : undefined);

      if (!matchingClaim) {
        return new Response(JSON.stringify({ message: "No matching claim found for email inbox", to }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      // 2. Ensure email thread exists
      const threadId: any = await ctx.runMutation((api as any).emails.getOrCreateThread, {
        claimId: matchingClaim._id,
        agentEmail: to,
        payerEmail: from || "Insurance Payer",
        subject: subject || `Re: Claim #${matchingClaim.claimNumber} Appeal`,
      });

      // 3. Insert inbound email message
      await ctx.runMutation((api as any).emails.insertMessage, {
        threadId,
        claimId: matchingClaim._id,
        direction: "inbound",
        sender: from || "Insurance Payer",
        recipient: to,
        subject: subject || "Adjudication Update",
        bodyHtml: html || `<p>${text || ""}</p>`,
        bodyText: text || html || "",
        hasAttachments: attachments.length > 0,
        ...(messageId ? { agentMailMessageId: messageId } : {}),
      });

      // 4. Auto-detect overturn / approval in the response text
      const lowerText = (text || html || "").toLowerCase();
      if (
        lowerText.includes("overturned") ||
        lowerText.includes("approved") ||
        lowerText.includes("payment issued") ||
        lowerText.includes("reimbursed")
      ) {
        await ctx.runMutation((api as any).claims.updateStatus, {
          claimId: matchingClaim._id,
          status: "won",
          actor: "AgentMail Autonomous Adjudicator",
          details: `VICTORY: Payer approved appeal for claim ${matchingClaim.claimNumber}. Full recovery amount ($${matchingClaim.deniedAmount.toLocaleString()}) settled.`,
        });
      } else {
        await ctx.runMutation((api as any).claims.updateStatus, {
          claimId: matchingClaim._id,
          status: "dispatched",
          actor: "AgentMail Webhook",
          details: `Inbound communication received from ${from} regarding claim #${matchingClaim.claimNumber}.`,
        });
      }

      return new Response(JSON.stringify({ success: true, claimId: matchingClaim._id }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (err: any) {
      return new Response(JSON.stringify({ error: err?.message || "Internal server error" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  }),
});

export default http;
