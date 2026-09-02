import { describe, it, expect, vi, beforeEach } from "vitest";
import http from "../convex/http";
import * as agentMailWebhook from "../convex/lib/agentMailWebhook";

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
  });

  const getHandler = () => {
    // Check getRoutes
    if (typeof (http as any).getRoutes === "function") {
      const routes = (http as any).getRoutes();
      for (const r of routes) {
        if (r[0] === "/agentmail-webhook" || r.path === "/agentmail-webhook") {
          const h = r[2] || r[1] || r.handler;
          return h?._handler || h;
        }
      }
    }
    // Check lookup
    if (typeof (http as any).lookup === "function") {
      const res = (http as any).lookup("/agentmail-webhook", "POST");
      if (res && res[0]) return res[0]._handler || res[0];
    }
    // Check exactRoutes
    if ((http as any).exactRoutes) {
      const entry = (http as any).exactRoutes.get?.("/agentmail-webhook:POST") || (http as any).exactRoutes.get?.("/agentmail-webhook");
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
    process.env.AGENTMAIL_WEBHOOK_SECRET = "whsec_test123";
    vi.spyOn(agentMailWebhook, "verifySvixWebhook").mockResolvedValue({
      valid: false,
      error: "Signature mismatch",
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
    expect(body.error).toBe("Fatal crypto fault");
  });
});
