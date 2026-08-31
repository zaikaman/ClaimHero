import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { auth } from "./auth";
import { normalizeAgentMailWebhook, verifySvixWebhook } from "./lib/agentMailWebhook";
import { registerStaticRoutes } from "@convex-dev/static-hosting";
import { components } from "./_generated/api";

const http = httpRouter();

// Convex Auth endpoints (/api/auth/...)
auth.addHttpRoutes(http);

/**
 * AgentMail sends a lightweight event here. Both intake digestion and case
 * reply persistence run asynchronously so AgentMail receives a fast response.
 * The actions re-fetch the message from AgentMail before trusting its content.
 * Svix cryptographic signature headers (svix-id, svix-timestamp, svix-signature)
 * are verified against AGENTMAIL_WEBHOOK_SECRET before scheduling background tasks.
 */
http.route({
  path: "/agentmail-webhook",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const rawPayload = await request.text();

      const webhookSecret = process.env.AGENTMAIL_WEBHOOK_SECRET?.trim();
      if (webhookSecret) {
        const verification = await verifySvixWebhook({
          payload: rawPayload,
          headers: request.headers,
          secret: webhookSecret,
        });

        if (!verification.valid) {
          return new Response(
            JSON.stringify({ error: verification.error || "Invalid webhook signature" }),
            {
              status: 401,
              headers: { "Content-Type": "application/json" },
            }
          );
        }
      }

      let payload: unknown;
      try {
        payload = JSON.parse(rawPayload) as unknown;
      } catch {
        return new Response(JSON.stringify({ error: "Invalid webhook payload" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }

      const event = normalizeAgentMailWebhook(
        payload,
        request.headers.get("svix-id") || request.headers.get("webhook-id") || undefined
      );
      if (!event) {
        return new Response(JSON.stringify({ error: "Missing required AgentMail event fields" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (event.eventType !== "message.received") return new Response(null, { status: 204 });

      const intakeInboxId = process.env.AGENTMAIL_INTAKE_INBOX_ID?.trim();
      const intakeEmail = process.env.AGENTMAIL_INTAKE_EMAIL?.trim().toLowerCase();

      const isIntakeEvent = Boolean(
        (intakeInboxId && event.inboxId === intakeInboxId) ||
        (intakeEmail && event.recipients.some((r) => r.toLowerCase().includes(intakeEmail)))
      );

      if (isIntakeEvent) {
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
        await ctx.scheduler.runAfter(0, internal.actions.agentMail.processInboundIntake, scheduledArgs);
      } else {
        await ctx.scheduler.runAfter(0, internal.actions.agentMail.processInboundClaimReply, {
          eventId: event.eventId,
          messageId: event.messageId,
          inboxId: event.inboxId,
        });
      }

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

registerStaticRoutes(http, components.staticHosting);

export default http;
