import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { auth } from "./auth";
import { normalizeAgentMailWebhook } from "./lib/agentMailWebhook";

const http = httpRouter();

// Convex Auth endpoints (/api/auth/...)
auth.addHttpRoutes(http);

/**
 * AgentMail sends a lightweight event here. Both intake digestion and case
 * reply persistence run asynchronously so AgentMail receives a fast response.
 * The actions re-fetch the message from AgentMail before trusting its content.
 */
http.route({
  path: "/agentmail-webhook",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const rawPayload = await request.text();
      let payload: unknown;
      try {
        payload = JSON.parse(rawPayload) as unknown;
      } catch {
        return new Response(JSON.stringify({ error: "Invalid webhook payload" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }

      const event = normalizeAgentMailWebhook(payload, request.headers.get("svix-id") || undefined);
      if (!event) {
        return new Response(JSON.stringify({ error: "Missing required AgentMail event fields" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (event.eventType !== "message.received") return new Response(null, { status: 204 });

      const scheduledArgs = {
        eventId: event.eventId,
        messageId: event.messageId,
        inboxId: event.inboxId,
        sender: event.from,
        recipient: event.recipients[0],
        subject: event.subject,
        text: event.text,
        html: event.html,
      };
      await ctx.scheduler.runAfter(0, (internal as any)["actions/agentMail"].processInboundIntake, scheduledArgs);
      await ctx.scheduler.runAfter(0, (internal as any)["actions/agentMail"].processInboundClaimReply, {
        eventId: event.eventId,
        messageId: event.messageId,
        inboxId: event.inboxId,
      });

      return new Response(JSON.stringify({ accepted: true, eventId: event.eventId }), {
        status: 202,
        headers: { "Content-Type": "application/json" },
      });
    } catch (error) {
      return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Internal server error" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  }),
});

export default http;
