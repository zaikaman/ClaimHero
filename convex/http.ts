import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { api } from "./_generated/api";

const http = httpRouter();

/**
 * Inbound AgentMail Webhook Endpoint:
 * Receives incoming emails from insurance payers, matches them to the assigned claim inbox, and persists message + audit trail.
 */
http.route({
  path: "/agentmail-webhook",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const payload = await request.json();
      const { from, to, subject, text, html } = payload;

      if (!to || !text) {
        return new Response(JSON.stringify({ error: "Missing required fields" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }

      // 1. Locate claim matching the assigned agent email (e.g., appeal-claim-xxx@claimhero.agentmail.com)
      const claims: any[] = await ctx.runQuery((api as any).claims.list, {});
      const matchingClaim = claims.find(
        (c: any) =>
          c.assignedAgentEmail?.toLowerCase() === to.toLowerCase() ||
          (subject && c.claimNumber && subject.includes(c.claimNumber))
      );

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
        payerEmail: from || "insurer-appeals@healthplan.com",
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
        bodyHtml: html || `<p>${text}</p>`,
        bodyText: text,
        hasAttachments: false,
      });

      // 4. Auto-detect overturn / approval in the response text
      const lowerText = text.toLowerCase();
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
