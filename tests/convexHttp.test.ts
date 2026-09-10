import { describe, it, expect, vi, beforeEach } from "vitest";
import http from "../convex/http";
import * as agentMailWebhook from "../convex/lib/agentMailWebhook";

import { rateLimiter } from "../convex/lib/rateLimiter";
import { agentmail } from "../convex/lib/agentMail";

vi.mock("../convex/auth", () => ({
  auth: {
    addHttpRoutes: vi.fn(),
  },
}));

vi.mock("@convex-dev/static-hosting", () => ({
  registerStaticRoutes: vi.fn(),
}));

describe("Convex HTTP Router & Webhook Endpoints", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    vi.clearAllMocks();
    vi.restoreAllMocks();
    vi.spyOn(rateLimiter, "limit").mockResolvedValue({ ok: true } as any);
  });

  const getHandler = (path = "/agentmail-webhook") => {
    // Check getRoutes
    if (typeof (http as any).getRoutes === "function") {
      const routes = (http as any).getRoutes();
      for (const r of routes) {
        if (r[0] === path || r.path === path) {
          const h = r[2] || r[1] || r.handler;
          return h?._handler || h;
        }
      }
    }
    // Check lookup
    if (typeof (http as any).lookup === "function") {
      const res = (http as any).lookup(path, "POST");
      if (res && res[0]) return res[0]._handler || res[0];
    }
    // Check exactRoutes
    if ((http as any).exactRoutes) {
      const entry = (http as any).exactRoutes.get?.(`${path}:POST`) || (http as any).exactRoutes.get?.(path);
      if (entry) return entry._handler || entry;
    }
    return null;
  };

  it("registers the /agentmail-webhook route", () => {
    const handler = getHandler();
    expect(handler).toBeDefined();
  });

  it("returns 401 if AGENTMAIL_WEBHOOK_SECRET is not configured", async () => {
    delete process.env.AGENTMAIL_WEBHOOK_SECRET;
    const handler = getHandler();
    const mockReq = new Request("http://localhost/agentmail-webhook", {
      method: "POST",
      body: JSON.stringify({ test: "data" }),
    });
    const mockCtx: any = { scheduler: { runAfter: vi.fn() } };

    const response = await handler(mockCtx, mockReq);
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toContain("Webhook secret is not configured");
  });

  it("returns 401 if webhook signature verification fails", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    process.env.AGENTMAIL_WEBHOOK_SECRET = "whsec_supersecret123456789";
    vi.spyOn(agentMailWebhook, "verifySvixWebhook").mockResolvedValue({
      valid: false,
      error: "Signature mismatch",
      diagnostics: {
        svixId: "msg_123",
        timestamp: "1725580000",
        sigCount: 1,
        secretCount: 1,
      },
    });

    const handler = getHandler();
    const mockReq = new Request("http://localhost/agentmail-webhook", {
      method: "POST",
      body: JSON.stringify({ test: "data" }),
      headers: { "svix-id": "msg_123" },
    });
    const mockCtx: any = { scheduler: { runAfter: vi.fn() } };

    const response = await handler(mockCtx, mockReq);
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toBe("Signature mismatch");
    expect(warnSpy).toHaveBeenCalled();
    const warnOutput = warnSpy.mock.calls.map((c) => c.join(" ")).join(" ");
    expect(warnOutput).not.toContain("expectedPrefix");
    expect(warnOutput).not.toContain("secretPrefix");
    expect(warnOutput).not.toContain("whsec_supersecret");
    warnSpy.mockRestore();
  });

  it("returns 400 if payload is invalid JSON", async () => {
    process.env.AGENTMAIL_WEBHOOK_SECRET = "whsec_test123";
    vi.spyOn(agentMailWebhook, "verifySvixWebhook").mockResolvedValue({ valid: true });

    const handler = getHandler();
    const mockReq = new Request("http://localhost/agentmail-webhook", {
      method: "POST",
      body: "not-json-content",
    });
    const mockCtx: any = { scheduler: { runAfter: vi.fn() } };

    const response = await handler(mockCtx, mockReq);
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("Invalid webhook payload");
  });

  it("returns 400 if normalized event is missing required fields", async () => {
    process.env.AGENTMAIL_WEBHOOK_SECRET = "whsec_test123";
    vi.spyOn(agentMailWebhook, "verifySvixWebhook").mockResolvedValue({ valid: true });
    vi.spyOn(agentMailWebhook, "normalizeAgentMailWebhook").mockReturnValue(null);

    const handler = getHandler();
    const mockReq = new Request("http://localhost/agentmail-webhook", {
      method: "POST",
      body: JSON.stringify({ event_type: "unknown" }),
    });
    const mockCtx: any = { scheduler: { runAfter: vi.fn() } };

    const response = await handler(mockCtx, mockReq);
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain("Missing required AgentMail event fields");
  });

  it("returns 204 if event is not message.received", async () => {
    process.env.AGENTMAIL_WEBHOOK_SECRET = "whsec_test123";
    vi.spyOn(agentMailWebhook, "verifySvixWebhook").mockResolvedValue({ valid: true });
    vi.spyOn(agentMailWebhook, "normalizeAgentMailWebhook").mockReturnValue({
      eventType: "message.sent",
      eventId: "evt_1",
      messageId: "msg_1",
      inboxId: "inbox_1",
      from: "sender@example.com",
      recipients: ["recv@example.com"],
      subject: "Test",
      attachments: [],
    });

    const handler = getHandler();
    const mockReq = new Request("http://localhost/agentmail-webhook", {
      method: "POST",
      body: JSON.stringify({}),
    });
    const mockCtx: any = { scheduler: { runAfter: vi.fn() } };

    const response = await handler(mockCtx, mockReq);
    expect(response.status).toBe(204);
  });

  it("schedules processInboundClaimReply for message.received events", async () => {
    process.env.AGENTMAIL_WEBHOOK_SECRET = "whsec_test123";
    vi.spyOn(agentMailWebhook, "verifySvixWebhook").mockResolvedValue({ valid: true });
    vi.spyOn(agentMailWebhook, "normalizeAgentMailWebhook").mockReturnValue({
      eventType: "message.received",
      eventId: "evt_reply",
      messageId: "msg_reply",
      inboxId: "inbox_case_456",
      from: "payer@example.com",
      recipients: ["case-456@claimhero.com"],
      subject: "Re: Appeal Overturned",
      text: "We have approved the claim",
      attachments: [],
    });

    const handler = getHandler();
    const mockReq = new Request("http://localhost/agentmail-webhook", {
      method: "POST",
      body: JSON.stringify({}),
    });
    const mockCtx: any = { scheduler: { runAfter: vi.fn().mockResolvedValue(undefined) } };

    const response = await handler(mockCtx, mockReq);
    expect(response.status).toBe(202);
    expect(mockCtx.scheduler.runAfter).toHaveBeenCalledWith(0, expect.anything(), expect.objectContaining({
      eventId: "evt_reply",
      messageId: "msg_reply",
      inboxId: "inbox_case_456",
    }));
  });

  it("schedules processInboundClaimReply for authentic stale retries instead of 401", async () => {
    process.env.AGENTMAIL_WEBHOOK_SECRET = "whsec_test123";
    vi.spyOn(agentMailWebhook, "verifySvixWebhook").mockResolvedValue({
      valid: true,
      stale: true,
      timestampAgeSec: 900,
    });
    vi.spyOn(agentMailWebhook, "normalizeAgentMailWebhook").mockReturnValue({
      eventType: "message.received",
      eventId: "evt_stale_retry",
      messageId: "msg_stale_retry",
      inboxId: "inbox_case_456",
      from: "payer@example.com",
      recipients: ["case-456@claimhero.com"],
      subject: "Re: Appeal",
      text: "We upheld the denial",
      attachments: [],
    });

    const handler = getHandler();
    const mockReq = new Request("http://localhost/agentmail-webhook", {
      method: "POST",
      body: JSON.stringify({}),
    });
    const mockCtx: any = { scheduler: { runAfter: vi.fn().mockResolvedValue(undefined) } };

    const response = await handler(mockCtx, mockReq);
    expect(response.status).toBe(202);
    expect(mockCtx.scheduler.runAfter).toHaveBeenCalledWith(0, expect.anything(), expect.objectContaining({
      eventId: "evt_stale_retry",
      messageId: "msg_stale_retry",
      inboxId: "inbox_case_456",
    }));
  });

  it("returns 500 when an unexpected internal error occurs", async () => {
    process.env.AGENTMAIL_WEBHOOK_SECRET = "whsec_test123";
    vi.spyOn(agentMailWebhook, "verifySvixWebhook").mockRejectedValue(new Error("Fatal crypto fault"));

    const handler = getHandler();
    const mockReq = new Request("http://localhost/agentmail-webhook", {
      method: "POST",
      body: JSON.stringify({}),
    });
    const mockCtx: any = { scheduler: { runAfter: vi.fn() } };

    const response = await handler(mockCtx, mockReq);
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toBe("Internal server error");
  });

  it("returns 413 when webhook payload exceeds 1MB cap", async () => {
    process.env.AGENTMAIL_WEBHOOK_SECRET = "whsec_test123";
    const handler = getHandler();
    const mockReq = new Request("http://localhost/agentmail-webhook", {
      method: "POST",
      headers: {
        "content-length": "2000000",
        "svix-id": "msg_large",
        "svix-timestamp": `${Math.floor(Date.now() / 1000)}`,
        "svix-signature": "v1,dummy",
      },
      body: JSON.stringify({ data: "too large" }),
    });
    const mockCtx: any = { scheduler: { runAfter: vi.fn() } };

    const response = await handler(mockCtx, mockReq);
    expect(response.status).toBe(413);
    const body = await response.json();
    expect(body.error).toContain("Payload exceeds 1MB limit");
  });

  it("returns 503 fail-closed when rate limiter encounters an internal error", async () => {
    process.env.AGENTMAIL_WEBHOOK_SECRET = "whsec_test123";
    vi.spyOn(agentMailWebhook, "verifySvixWebhook").mockResolvedValue({ valid: true });
    vi.spyOn(agentMailWebhook, "normalizeAgentMailWebhook").mockReturnValue({
      eventType: "message.received",
      eventId: "evt_reply",
      messageId: "msg_reply",
      inboxId: "inbox_case_456",
      from: "payer@example.com",
      recipients: ["case-456@claimhero.com"],
      subject: "Re: Appeal Overturned",
      text: "We have approved the claim",
      attachments: [],
    });
    vi.spyOn(rateLimiter, "limit").mockRejectedValue(new Error("Redis / DB connection severed"));

    const handler = getHandler();
    const mockReq = new Request("http://localhost/agentmail-webhook", {
      method: "POST",
      body: JSON.stringify({}),
    });
    const mockCtx: any = { scheduler: { runAfter: vi.fn() } };

    const response = await handler(mockCtx, mockReq);
    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body.error).toContain("Service temporarily unavailable");
  });

  describe("Official /agentmail/webhook component endpoint", () => {
    it("registers the /agentmail/webhook route", () => {
      const handler = getHandler("/agentmail/webhook");
      expect(handler).toBeDefined();
    });

    it("returns 401 without invoking rate limiter if AGENTMAIL_WEBHOOK_SECRET is not configured", async () => {
      delete process.env.AGENTMAIL_WEBHOOK_SECRET;
      const rateLimitSpy = vi.spyOn(rateLimiter, "limit");
      const handler = getHandler("/agentmail/webhook");
      const mockReq = new Request("http://localhost/agentmail/webhook", {
        method: "POST",
        body: JSON.stringify({ test: "data" }),
        headers: { "svix-id": "attacker_controlled_id" },
      });
      const mockCtx: any = {};

      const response = await handler(mockCtx, mockReq);
      expect(response.status).toBe(401);
      const body = await response.json();
      expect(body.error).toContain("Webhook secret is not configured");
      expect(rateLimitSpy).not.toHaveBeenCalled();
    });

    it("returns 401 without invoking rate limiter if signature verification fails (prevents attacker ID table flood)", async () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const rateLimitSpy = vi.spyOn(rateLimiter, "limit");
      process.env.AGENTMAIL_WEBHOOK_SECRET = "whsec_supersecret123456789";
      vi.spyOn(agentMailWebhook, "verifySvixWebhook").mockResolvedValue({
        valid: false,
        error: "Signature mismatch",
        diagnostics: {
          svixId: "random_attacker_id_9999",
          timestamp: "1725580000",
          sigCount: 1,
          secretCount: 1,
        },
      });

      const handler = getHandler("/agentmail/webhook");
      const mockReq = new Request("http://localhost/agentmail/webhook", {
        method: "POST",
        body: JSON.stringify({ test: "data" }),
        headers: { "svix-id": "random_attacker_id_9999" },
      });
      const mockCtx: any = {};

      const response = await handler(mockCtx, mockReq);
      expect(response.status).toBe(401);
      const body = await response.json();
      expect(body.error).toBe("Signature mismatch");
      expect(rateLimitSpy).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalled();
      warnSpy.mockRestore();
    });

    it("returns 400 without invoking rate limiter if payload is invalid JSON", async () => {
      const rateLimitSpy = vi.spyOn(rateLimiter, "limit");
      process.env.AGENTMAIL_WEBHOOK_SECRET = "whsec_test123";
      vi.spyOn(agentMailWebhook, "verifySvixWebhook").mockResolvedValue({ valid: true });

      const handler = getHandler("/agentmail/webhook");
      const mockReq = new Request("http://localhost/agentmail/webhook", {
        method: "POST",
        body: "malformed-json{{{",
      });
      const mockCtx: any = {};

      const response = await handler(mockCtx, mockReq);
      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error).toBe("Invalid webhook payload");
      expect(rateLimitSpy).not.toHaveBeenCalled();
    });

    it("rate-limits after signature verification, keyed on authenticated inbox ID (not client svix-id)", async () => {
      process.env.AGENTMAIL_WEBHOOK_SECRET = "whsec_test123";
      vi.spyOn(agentMailWebhook, "verifySvixWebhook").mockResolvedValue({ valid: true });
      const rateLimitSpy = vi.spyOn(rateLimiter, "limit").mockResolvedValue({ ok: true } as any);
      const handleWebhookSpy = vi.spyOn(agentmail, "handleWebhook").mockResolvedValue(new Response(null, { status: 204 }));

      const handler = getHandler("/agentmail/webhook");
      const eventPayload = {
        event_type: "message.received",
        message: {
          inbox_id: "inbox_verified_auth_123",
          message_id: "msg_777",
          to: ["case@claimhero.com"],
        },
      };
      const mockReq = new Request("http://localhost/agentmail/webhook", {
        method: "POST",
        body: JSON.stringify(eventPayload),
        headers: { "svix-id": "client_supplied_svix_id" },
      });
      const mockCtx: any = {};

      const response = await handler(mockCtx, mockReq);
      expect(response.status).toBe(204);
      expect(rateLimitSpy).toHaveBeenCalledWith(mockCtx, "agentMailWebhook", {
        key: "inbox_verified_auth_123",
      });
      expect(rateLimitSpy).not.toHaveBeenCalledWith(mockCtx, "agentMailWebhook", {
        key: "client_supplied_svix_id",
      });
      expect(handleWebhookSpy).toHaveBeenCalled();
    });

    it("returns 429 when authenticated rate limit is exceeded without dispatching to agentmail component", async () => {
      process.env.AGENTMAIL_WEBHOOK_SECRET = "whsec_test123";
      vi.spyOn(agentMailWebhook, "verifySvixWebhook").mockResolvedValue({ valid: true });
      vi.spyOn(rateLimiter, "limit").mockResolvedValue({ ok: false, retryAfter: 2500 } as any);
      const handleWebhookSpy = vi.spyOn(agentmail, "handleWebhook");

      const handler = getHandler("/agentmail/webhook");
      const eventPayload = {
        event_type: "message.delivered",
        delivery: {
          inbox_id: "inbox_rate_limited_456",
        },
      };
      const mockReq = new Request("http://localhost/agentmail/webhook", {
        method: "POST",
        body: JSON.stringify(eventPayload),
      });
      const mockCtx: any = {};

      const response = await handler(mockCtx, mockReq);
      expect(response.status).toBe(429);
      expect(response.headers.get("Retry-After")).toBe("3");
      const body = await response.json();
      expect(body.error).toBe("Too many webhook requests");
      expect(handleWebhookSpy).not.toHaveBeenCalled();
    });

    it("re-signs and forwards authentic stale retries to agentmail.handleWebhook", async () => {
      process.env.AGENTMAIL_WEBHOOK_SECRET = "whsec_test123";
      vi.spyOn(agentMailWebhook, "verifySvixWebhook").mockResolvedValue({
        valid: true,
        stale: true,
        timestampAgeSec: 600,
      });
      vi.spyOn(rateLimiter, "limit").mockResolvedValue({ ok: true } as any);
      let forwardedReqReceived: Request | null = null;
      vi.spyOn(agentmail, "handleWebhook").mockImplementation(async (_ctx: any, req: Request) => {
        forwardedReqReceived = req;
        return new Response(null, { status: 204 });
      });

      const handler = getHandler("/agentmail/webhook");
      const eventPayload = {
        event_type: "message.sent",
        send: {
          inbox_id: "inbox_stale_123",
          message_id: "msg_stale_123",
        },
      };
      const mockReq = new Request("http://localhost/agentmail/webhook", {
        method: "POST",
        body: JSON.stringify(eventPayload),
        headers: {
          "svix-id": "msg_stale_123",
          "svix-timestamp": "1720000000",
          "svix-signature": "v1,oldSig",
        },
      });
      const mockCtx: any = {};

      const response = await handler(mockCtx, mockReq);
      expect(response.status).toBe(204);
      expect(forwardedReqReceived).not.toBeNull();
      const forwardedTimestamp = parseInt((forwardedReqReceived as any).headers.get("svix-timestamp"), 10);
      const nowSec = Math.floor(Date.now() / 1000);
      expect(Math.abs(nowSec - forwardedTimestamp)).toBeLessThan(5);
    });

    it("returns 500 when an unexpected internal error occurs", async () => {
      process.env.AGENTMAIL_WEBHOOK_SECRET = "whsec_test123";
      vi.spyOn(agentMailWebhook, "verifySvixWebhook").mockRejectedValue(new Error("Component internal fault"));

      const handler = getHandler("/agentmail/webhook");
      const mockReq = new Request("http://localhost/agentmail/webhook", {
        method: "POST",
        body: JSON.stringify({}),
      });
      const mockCtx: any = {};

      const response = await handler(mockCtx, mockReq);
      expect(response.status).toBe(500);
      const body = await response.json();
      expect(body.error).toBe("Internal server error");
    });
  });
});
