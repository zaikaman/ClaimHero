import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import {
  extractInboxId,
  normalizeAgentMailWebhook,
  verifySvixWebhook,
  type SvixVerificationResult,
} from "./lib/agentMailWebhook";
import { rateLimiter } from "./lib/rateLimiter";
import { registerStaticRoutes } from "@convex-dev/static-hosting";
import { components } from "./_generated/api";
import { agentmail } from "./lib/agentMail";
import { Webhook } from "svix";

const http = httpRouter();

interface VerifiedSvixRequest {
  success: true;
  rawPayload: string;
  rawBytes?: Uint8Array;
  payload: unknown;
  verification: SvixVerificationResult;
}

interface RejectedSvixRequest {
  success: false;
  response: Response;
}

async function verifyAndParseSvixWebhook(
  request: Request,
  routeLabel: string
): Promise<VerifiedSvixRequest | RejectedSvixRequest> {
  let rawPayload: string;
  let rawBytes: Uint8Array | undefined;
  try {
    const buffer = await request.arrayBuffer();
    rawBytes = new Uint8Array(buffer);
    rawPayload = new TextDecoder("utf-8").decode(rawBytes);
  } catch {
    rawPayload = await request.text();
  }

  const webhookSecret = process.env.AGENTMAIL_WEBHOOK_SECRET?.trim();
  if (!webhookSecret) {
    return {
      success: false,
      response: new Response(
        JSON.stringify({ error: "Webhook secret is not configured" }),
        {
          status: 401,
          headers: { "Content-Type": "application/json" },
        }
      ),
    };
  }

  const verification = await verifySvixWebhook({
    payload: rawPayload,
    rawBytes,
    headers: request.headers,
    secret: webhookSecret,
  });

  if (!verification.valid) {
    // Structured server-side diagnostics (never log secrets or signature
    // material) so repeated 401s can be attributed from prod logs.
    const svixId = request.headers.get("svix-id") || request.headers.get("webhook-id");
    const svixTimestamp = request.headers.get("svix-timestamp") || request.headers.get("webhook-timestamp");
    const svixSignature = request.headers.get("svix-signature") || request.headers.get("webhook-signature");
    let timestampAgeSec: number | undefined;
    const parsedTimestamp = svixTimestamp ? parseInt(svixTimestamp, 10) : NaN;
    if (!isNaN(parsedTimestamp)) {
      timestampAgeSec = Math.floor(Date.now() / 1000) - parsedTimestamp;
    }
    const sigCount = svixSignature
      ? (svixSignature.match(/(?:^|[\s,;])v1,/g) || []).length
      : 0;
    const sigPrefix = svixSignature ? svixSignature.slice(0, 16) : "none";
    console.warn(
      `${routeLabel} rejected: ${verification.error || "Invalid webhook signature"}` +
        ` id=${svixId || "none"}` +
        ` hasId=${Boolean(svixId)} hasTimestamp=${Boolean(svixTimestamp)}` +
        ` hasSignature=${Boolean(svixSignature)} sigCount=${sigCount}` +
        ` sigPrefix=${sigPrefix}` +
        ` secretCount=${verification.diagnostics?.secretCount ?? 0}` +
        ` timestampAgeSec=${timestampAgeSec ?? "unknown"}` +
        ` payloadBytes=${rawPayload.length}` +
        ` detail=${verification.diagnostics?.lastError || "none"}`
    );
    return {
      success: false,
      response: new Response(
        JSON.stringify({ error: verification.error || "Invalid webhook signature" }),
        {
          status: 401,
          headers: { "Content-Type": "application/json" },
        }
      ),
    };
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawPayload);
  } catch {
    return {
      success: false,
      response: new Response(JSON.stringify({ error: "Invalid webhook payload" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      }),
    };
  }

  return {
    success: true,
    rawPayload,
    rawBytes,
    payload,
    verification,
  };
}

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
      const verified = await verifyAndParseSvixWebhook(request, "AgentMail webhook");
      if (!verified.success) return verified.response;

      const { rawPayload, payload, verification } = verified;

      if (verification.stale) {
        // Authentic provider retry (or late first delivery) reusing the
        // original timestamp. The downstream pipeline is idempotent on
        // AgentMail message ID, so process normally and acknowledge.
        console.log(
          `AgentMail webhook accepted stale retry timestampAgeSec=${verification.timestampAgeSec ?? "unknown"} payloadBytes=${rawPayload.length}`
        );
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
      console.error("AgentMail webhook processing error:", error);
      return new Response(JSON.stringify({ error: "Internal server error" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  }),
});

/**
 * Official AgentMail Convex component webhook endpoint.
 * Cryptographically verifies Svix signatures and validates payloads before rate limiting,
 * keying rate limits on authenticated inbox IDs rather than attacker-controlled headers.
 * Handles deduping, component message persistence, and callbacks via onMessageReceived.
 */
http.route({
  path: "/agentmail/webhook",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const verified = await verifyAndParseSvixWebhook(request, "AgentMail component webhook");
      if (!verified.success) return verified.response;

      const { rawPayload, payload, verification } = verified;

      if (verification.stale) {
        console.log(
          `AgentMail component webhook accepted stale retry timestampAgeSec=${verification.timestampAgeSec ?? "unknown"} payloadBytes=${rawPayload.length}`
        );
      }

      const event = normalizeAgentMailWebhook(
        payload,
        request.headers.get("svix-id") || request.headers.get("webhook-id") || undefined
      );
      const rateLimitKey = event?.inboxId || extractInboxId(payload) || "global";

      // Enforce rate limiting after signature verification, keyed by authenticated inbox or global fallback
      try {
        const limitStatus = await rateLimiter.limit(ctx, "agentMailWebhook", {
          key: rateLimitKey,
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

      const forwardedHeaders = new Headers(request.headers);
      if (verification.stale) {
        const webhookSecret = process.env.AGENTMAIL_WEBHOOK_SECRET?.trim();
        if (webhookSecret) {
          try {
            const svixId = request.headers.get("svix-id") || request.headers.get("webhook-id") || "stale";
            const wh = new Webhook(webhookSecret);
            const now = new Date();
            const freshSig = wh.sign(svixId, now, rawPayload);
            forwardedHeaders.set("svix-timestamp", String(Math.floor(now.getTime() / 1000)));
            forwardedHeaders.set("svix-signature", freshSig);
          } catch {
            // If re-signing fails, proceed with original headers
          }
        }
      }

      const forwardedRequest = new Request(request.url, {
        method: request.method,
        headers: forwardedHeaders,
        body: rawPayload,
      });

      return await agentmail.handleWebhook(
        ctx as unknown as Parameters<typeof agentmail.handleWebhook>[0],
        forwardedRequest
      );
    } catch (error) {
      console.error("AgentMail component webhook processing error:", error);
      return new Response(JSON.stringify({ error: "Internal server error" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  }),
});

registerStaticRoutes(http, components.staticHosting);

export default http;
