import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { normalizeAgentMailWebhook, verifySvixWebhook } from "./lib/agentMailWebhook";
import { rateLimiter } from "./lib/rateLimiter";
import { registerStaticRoutes } from "@convex-dev/static-hosting";
import { components } from "./_generated/api";
import { agentmail } from "./lib/agentMail";

const http = httpRouter();

/**
 * AgentMail sends a lightweight event here. Case reply and adjudicator message
 * persistence run asynchronously so AgentMail receives a fast response.
 * The action re-fetches the message from AgentMail before trusting its content.
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
      if (!webhookSecret) {
        return new Response(
          JSON.stringify({ error: "Webhook secret is not configured" }),
          {
            status: 401,
            headers: { "Content-Type": "application/json" },
          }
        );
      }

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

      let payload: unknown;
      try {
        payload = JSON.parse(rawPayload);
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

      // Enforce rate limiting before scheduling asynchronous background jobs
      try {
        const limitStatus = await rateLimiter.limit(ctx, "agentMailWebhook", {
          key: event.inboxId || "global",
        });
        if (!limitStatus.ok) {
          return new Response(
            JSON.stringify({ error: "Too many webhook requests" }),
            {
              status: 429,
              headers: {
                "Content-Type": "application/json",
                "Retry-After": String(Math.ceil((limitStatus.retryAfter || 1000) / 1000)),
              },
            }
          );
        }
      } catch {
        // Continue if rate limiter is not configured
      }

      await ctx.scheduler.runAfter(0, internal.actions.agentMail.processInboundClaimReply, {
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

/**
 * Official AgentMail Convex component webhook endpoint.
 * Handles Svix signature verification, deduping, component message persistence,
 * and callbacks via onMessageReceived.
 */
http.route({
  path: "/agentmail/webhook",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const limitStatus = await rateLimiter.limit(ctx, "agentMailWebhook", {
        key: request.headers.get("svix-id") || "global",
      });
      if (!limitStatus.ok) {
        return new Response(
          JSON.stringify({ error: "Too many webhook requests" }),
          {
            status: 429,
            headers: {
              "Content-Type": "application/json",
              "Retry-After": String(Math.ceil((limitStatus.retryAfter || 1000) / 1000)),
            },
          }
        );
      }
    } catch {
      // Continue if rate limiter is not configured
    }

    return await agentmail.handleWebhook(
      ctx as unknown as Parameters<typeof agentmail.handleWebhook>[0],
      request
    );
  }),
});

registerStaticRoutes(http, components.staticHosting);

export default http;
