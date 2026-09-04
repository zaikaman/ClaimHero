import { AgentMail } from "@agentmail/convex";
import { components, internal } from "../_generated/api";

export interface AgentMailSendResult {
  messageId?: string;
  threadId?: string;
  outboundId?: string;
}

export interface SharedAgentMailboxes {
  senderInboxId: string;
  senderEmail: string;
  adjudicatorInboxId: string;
  adjudicatorEmail: string;
}

type SendContext = Parameters<AgentMail["sendMessage"]>[0];
type ActionContext = Parameters<AgentMail["getMessage"]>[0];
type QueryContext = Parameters<AgentMail["status"]>[0];

export type AgentMailContext = {
  runMutation: unknown;
  runQuery?: unknown;
  runAction?: unknown;
};

export const agentmail: AgentMail = new AgentMail(components.agentmail, {
  onMessageReceived: internal.emails.onMessageReceived,
});

const AGENTMAIL_API_BASE_URL = "https://api.agentmail.to/v0";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function responseField(body: unknown, ...keys: string[]): string | undefined {
  if (!isRecord(body)) return undefined;
  for (const key of keys) {
    const value = body[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

function configuredApiKey(): string {
  const apiKey = process.env.AGENTMAIL_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("AgentMail is not configured. Set AGENTMAIL_API_KEY before sending email.");
  }
  return apiKey;
}

function configuredValue(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value || undefined;
}

/**
 * Returns the two inboxes provisioned once for the application.
 * Claims are routed inside Convex by claim number; they do not create inboxes.
 */
export function getSharedAgentMailboxes(): SharedAgentMailboxes {
  const senderInboxId = configuredValue("AGENTMAIL_SENDER_INBOX_ID") || configuredValue("AGENTMAIL_INBOX_ID");
  const senderEmail =
    configuredValue("AGENTMAIL_SENDER_EMAIL") ||
    (senderInboxId?.includes("@") ? senderInboxId : undefined);
  const adjudicatorInboxId = configuredValue("AGENTMAIL_ADJUDICATOR_INBOX_ID");
  const adjudicatorEmail = configuredValue("AGENTMAIL_ADJUDICATOR_EMAIL");

  if (!senderInboxId || !senderEmail || !adjudicatorInboxId || !adjudicatorEmail) {
    throw new Error(
      "Shared AgentMail is not configured. Set AGENTMAIL_SENDER_INBOX_ID, AGENTMAIL_SENDER_EMAIL, AGENTMAIL_ADJUDICATOR_INBOX_ID, and AGENTMAIL_ADJUDICATOR_EMAIL."
    );
  }

  return { senderInboxId, senderEmail, adjudicatorInboxId, adjudicatorEmail };
}

async function parseResponse(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

/**
 * Normalizes an AgentMail or external Message-ID into a valid RFC 5322 Message-ID header format.
 */
export function formatMessageIdHeader(id: string): string {
  const trimmed = id.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("<") && trimmed.endsWith(">")) {
    return trimmed;
  }
  if (trimmed.includes("@")) {
    return `<${trimmed}>`;
  }
  return `<${trimmed}@agentmail.to>`;
}

async function agentMailFetch(
  url: string,
  init: RequestInit,
  options: { timeoutMs?: number; maxRetries?: number } = {}
): Promise<Response> {
  const timeoutMs = options.timeoutMs ?? 15_000;
  const maxRetries = options.maxRetries ?? 2;

  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url, {
        ...init,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (res.status >= 500 && attempt < maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, 300 * (attempt + 1)));
        continue;
      }
      return res;
    } catch (err) {
      clearTimeout(timeoutId);
      lastError = err;
      if (attempt < maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, 300 * (attempt + 1)));
      }
    }
  }

  throw new Error(`AgentMail request to ${url} timed out or failed after retries: ${String(lastError)}`);
}

export async function sendAgentMailMessage(options: {
  inboxId: string;
  to: string;
  subject: string;
  text: string;
  html: string;
  headers?: Record<string, string>;
  labels?: string[];
  ctx?: AgentMailContext;
}): Promise<AgentMailSendResult> {
  // 1. Prefer @agentmail/convex component when Convex context is provided
  if (options.ctx && typeof options.ctx.runMutation === "function") {
    try {
      const sendCtx = options.ctx as unknown as SendContext;
      const outboundId = await agentmail.sendMessage(sendCtx, options.inboxId, {
        to: options.to,
        subject: options.subject,
        text: options.text,
        html: options.html,
        headers: options.headers,
        labels: options.labels,
      });

      let messageId: string | undefined;
      let threadId: string | undefined;
      if (typeof options.ctx.runQuery === "function") {
        try {
          const status = await agentmail.status(options.ctx as unknown as QueryContext, outboundId);
          if (status) {
            messageId = status.agentmailMessageId ?? undefined;
            threadId = status.threadId ?? undefined;
          }
        } catch {
          // Status query is non-blocking
        }
      }

      return {
        messageId: messageId || (outboundId ? `msg_${outboundId}` : undefined),
        threadId: threadId || (outboundId ? `thr_${outboundId}` : undefined),
        outboundId,
      };
    } catch (err) {
      // In isolated Vitest mocks where Convex backend syscalls (createFunctionHandle) aren't present,
      // fallback to direct REST fetch
      if (String(err).includes("outside of a Convex backend")) {
        // Fall through to REST API
      } else {
        throw err;
      }
    }
  }

  // 2. Fallback to direct REST API for standalone execution or unit testing
  const response = await agentMailFetch(
    `${AGENTMAIL_API_BASE_URL}/inboxes/${encodeURIComponent(options.inboxId)}/messages/send`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${configuredApiKey()}`,
      },
      body: JSON.stringify({
        to: options.to,
        subject: options.subject,
        text: options.text,
        html: options.html,
        ...(options.headers ? { headers: options.headers } : {}),
        ...(options.labels ? { labels: options.labels } : {}),
      }),
    }
  );

  const body = await parseResponse(response);
  if (!response.ok) {
    const detail = typeof body === "string" ? body : JSON.stringify(body);
    throw new Error(`AgentMail message delivery failed (${response.status}): ${detail}`);
  }

  return {
    messageId: responseField(body, "message_id", "messageId", "id"),
    threadId: responseField(body, "thread_id", "threadId", "conversation_id", "conversationId"),
  };
}

export async function replyAgentMailMessage(options: {
  inboxId: string;
  messageId: string;
  text: string;
  html: string;
  to?: string;
  subject?: string;
  headers?: Record<string, string>;
  labels?: string[];
  ctx?: AgentMailContext;
}): Promise<AgentMailSendResult> {
  // 1. Prefer @agentmail/convex component when Convex context is provided
  if (options.ctx && typeof options.ctx.runMutation === "function") {
    try {
      const sendCtx = options.ctx as unknown as SendContext;
      const outboundId = await agentmail.replyToMessage(
        sendCtx,
        options.inboxId,
        options.messageId,
        {
          text: options.text,
          html: options.html,
          to: options.to,
          subject: options.subject,
          headers: options.headers,
          labels: options.labels,
        }
      );

      let resolvedMessageId: string | undefined;
      let threadId: string | undefined;
      if (typeof options.ctx.runQuery === "function") {
        try {
          const status = await agentmail.status(options.ctx as unknown as QueryContext, outboundId);
          if (status) {
            resolvedMessageId = status.agentmailMessageId ?? undefined;
            threadId = status.threadId ?? undefined;
          }
        } catch {
          // Status query is non-blocking
        }
      }

      return {
        messageId: resolvedMessageId || (outboundId ? `msg_${outboundId}` : undefined),
        threadId: threadId || (outboundId ? `thr_${outboundId}` : undefined),
        outboundId,
      };
    } catch (err) {
      if (String(err).includes("outside of a Convex backend")) {
        // Fall through to REST API
      } else {
        throw err;
      }
    }
  }

  // 2. Fallback to direct REST API for standalone execution or unit testing
  const response = await agentMailFetch(
    `${AGENTMAIL_API_BASE_URL}/inboxes/${encodeURIComponent(options.inboxId)}/messages/${encodeURIComponent(options.messageId)}/reply`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${configuredApiKey()}`,
      },
      body: JSON.stringify({
        text: options.text,
        html: options.html,
        ...(options.to ? { to: options.to } : {}),
        ...(options.headers ? { headers: options.headers } : {}),
      }),
    }
  );

  const body = await parseResponse(response);
  if (!response.ok) {
    const detail = typeof body === "string" ? body : JSON.stringify(body);
    throw new Error(`AgentMail message reply failed (${response.status}): ${detail}`);
  }

  return {
    messageId: responseField(body, "message_id", "messageId", "id"),
    threadId: responseField(body, "thread_id", "threadId", "conversation_id", "conversationId"),
  };
}

export async function listAgentMailMessages(
  inboxId: string,
  limit = 20,
  ctx?: AgentMailContext
): Promise<Array<Record<string, unknown>>> {
  // 1. Prefer @agentmail/convex component when Convex context is provided
  if (ctx) {
    try {
      if (typeof ctx.runAction === "function") {
        const threads = await agentmail.listThreads(ctx as unknown as ActionContext, inboxId, { limit });
        if (Array.isArray(threads)) return threads;
        if (isRecord(threads) && Array.isArray(threads.threads)) {
          return threads.threads as Array<Record<string, unknown>>;
        }
      }
      if (typeof ctx.runQuery === "function") {
        const localMessages = await ctx.runQuery(components.agentmail.lib.listInboundMessages, { inboxId });
        if (Array.isArray(localMessages) && localMessages.length > 0) {
          return localMessages as Array<Record<string, unknown>>;
        }
      }
    } catch {
      // Fallback
    }
  }

  // 2. Fallback to direct REST API
  const response = await agentMailFetch(
    `${AGENTMAIL_API_BASE_URL}/inboxes/${encodeURIComponent(inboxId)}/messages?limit=${limit}`,
    {
      method: "GET",
      headers: { Authorization: `Bearer ${configuredApiKey()}` },
    }
  );
  const body = await parseResponse(response);
  if (!response.ok) {
    const detail = typeof body === "string" ? body : JSON.stringify(body);
    throw new Error(`AgentMail messages list failed (${response.status}): ${detail}`);
  }
  if (Array.isArray(body)) return body as Array<Record<string, unknown>>;
  if (isRecord(body) && Array.isArray(body.messages)) return body.messages as Array<Record<string, unknown>>;
  return [];
}

export async function getAgentMailMessage(
  inboxId: string,
  messageId: string,
  ctx?: AgentMailContext
): Promise<Record<string, unknown>> {
  // 1. Prefer @agentmail/convex component when Convex context is provided
  if (ctx && typeof ctx.runAction === "function") {
    try {
      const message = await agentmail.getMessage(ctx as unknown as ActionContext, inboxId, messageId);
      if (isRecord(message)) return message;
    } catch {
      // Fallback
    }
  }

  // 2. Fallback to direct REST API
  const response = await agentMailFetch(
    `${AGENTMAIL_API_BASE_URL}/inboxes/${encodeURIComponent(inboxId)}/messages/${encodeURIComponent(messageId)}`,
    {
      method: "GET",
      headers: { Authorization: `Bearer ${configuredApiKey()}` },
    }
  );
  const body = await parseResponse(response);
  if (!response.ok || !isRecord(body)) {
    const detail = typeof body === "string" ? body : JSON.stringify(body);
    throw new Error(`AgentMail message retrieval failed (${response.status}): ${detail}`);
  }
  return body;
}

export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024; // 10 MB intake security limit

export async function downloadAgentMailAttachment(options: {
  inboxId: string;
  messageId: string;
  attachmentId: string;
}): Promise<{ bytes: ArrayBuffer; contentType?: string }> {
  const response = await agentMailFetch(
    `${AGENTMAIL_API_BASE_URL}/inboxes/${encodeURIComponent(options.inboxId)}/messages/${encodeURIComponent(options.messageId)}/attachments/${encodeURIComponent(options.attachmentId)}`,
    {
      method: "GET",
      headers: { Authorization: `Bearer ${configuredApiKey()}` },
    }
  );

  if (!response.ok) {
    const body = await parseResponse(response);
    const detail = typeof body === "string" ? body : JSON.stringify(body);
    throw new Error(`AgentMail attachment retrieval failed (${response.status}): ${detail}`);
  }

  const rawContentType = response.headers.get("content-type") || undefined;
  let bytes: ArrayBuffer;
  let finalContentType = rawContentType;

  if (rawContentType?.includes("application/json")) {
    const metadata = await response.json() as Record<string, unknown>;
    const downloadUrl = responseField(metadata, "download_url", "downloadUrl", "url");
    if (!downloadUrl) throw new Error("AgentMail attachment response did not include a download URL.");

    const downloadResponse = await fetch(downloadUrl);
    if (!downloadResponse.ok) throw new Error(`AgentMail attachment download failed (${downloadResponse.status}).`);
    
    const contentLength = downloadResponse.headers.get("content-length");
    if (contentLength && parseInt(contentLength, 10) > MAX_ATTACHMENT_BYTES) {
      throw new Error(`Inbound attachment exceeds the ${MAX_ATTACHMENT_BYTES / (1024 * 1024)} MB security limit.`);
    }

    bytes = await downloadResponse.arrayBuffer();
    finalContentType = downloadResponse.headers.get("content-type") || responseField(metadata, "content_type", "contentType");
  } else {
    bytes = await response.arrayBuffer();
  }

  if (bytes.byteLength > MAX_ATTACHMENT_BYTES) {
    throw new Error(`Inbound attachment exceeds the ${MAX_ATTACHMENT_BYTES / (1024 * 1024)} MB security limit.`);
  }

  // Neutralize hazardous executable payloads
  const normalizedMime = (finalContentType || "").toLowerCase().trim();
  if (
    normalizedMime.includes("javascript") ||
    normalizedMime.includes("x-msdownload") ||
    normalizedMime.includes("x-sh") ||
    normalizedMime.includes("x-bat")
  ) {
    throw new Error(`Disallowed attachment MIME type: ${finalContentType}`);
  }

  return { bytes, contentType: finalContentType };
}
