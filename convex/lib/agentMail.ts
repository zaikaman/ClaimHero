import { AgentMail, type OutboundId } from "@agentmail/convex";
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

/**
 * The only AgentMail client used by production code. All network IO is kept
 * inside the installed @agentmail/convex component and its durable workpool.
 */
export const agentmail: AgentMail = new AgentMail(components.agentmail, {
  onMessageReceived: internal.emails.onMessageReceived,
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function configuredValue(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value || undefined;
}

function requireComponentContext(
  ctx: AgentMailContext | undefined,
  operation: string,
): AgentMailContext {
  if (!ctx || typeof ctx.runMutation !== "function") {
    throw new Error(
      `AgentMail ${operation} requires a Convex context so it can use the @agentmail/convex component.`,
    );
  }
  return ctx;
}

function requireActionContext(
  ctx: AgentMailContext | undefined,
  operation: string,
): AgentMailContext {
  const componentContext = requireComponentContext(ctx, operation);
  if (typeof componentContext.runAction !== "function") {
    throw new Error(
      `AgentMail ${operation} requires a Convex action context so it can use the @agentmail/convex component.`,
    );
  }
  return componentContext;
}

async function readOutboundIdentifiers(
  ctx: AgentMailContext,
  outboundId: OutboundId,
): Promise<Pick<AgentMailSendResult, "messageId" | "threadId">> {
  if (typeof ctx.runQuery !== "function") return {};

  try {
    const status = await agentmail.status(
      ctx as unknown as QueryContext,
      outboundId,
    );
    return {
      messageId: status?.agentmailMessageId ?? undefined,
      threadId: status?.threadId ?? undefined,
    };
  } catch {
    // The durable enqueue already succeeded. Status is eventually observable
    // through the component query and must not cause a duplicate send.
    return {};
  }
}

/**
 * Returns the two inboxes provisioned once for the application.
 * Claims are routed inside Convex by claim number; they do not create inboxes.
 */
export function getSharedAgentMailboxes(): SharedAgentMailboxes {
  const senderInboxId =
    configuredValue("AGENTMAIL_SENDER_INBOX_ID") ||
    configuredValue("AGENTMAIL_INBOX_ID");
  const senderEmail =
    configuredValue("AGENTMAIL_SENDER_EMAIL") ||
    (senderInboxId?.includes("@") ? senderInboxId : undefined);
  const adjudicatorInboxId = configuredValue("AGENTMAIL_ADJUDICATOR_INBOX_ID");
  const adjudicatorEmail = configuredValue("AGENTMAIL_ADJUDICATOR_EMAIL");

  if (!senderInboxId || !senderEmail || !adjudicatorInboxId || !adjudicatorEmail) {
    throw new Error(
      "Shared AgentMail is not configured. Set AGENTMAIL_SENDER_INBOX_ID, AGENTMAIL_SENDER_EMAIL, AGENTMAIL_ADJUDICATOR_INBOX_ID, and AGENTMAIL_ADJUDICATOR_EMAIL.",
    );
  }

  return { senderInboxId, senderEmail, adjudicatorInboxId, adjudicatorEmail };
}

/**
 * Normalizes an AgentMail or external Message-ID into a valid RFC 5322
 * Message-ID header format.
 */
export function formatMessageIdHeader(id: string): string {
  const trimmed = id.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("<") && trimmed.endsWith(">")) return trimmed;
  if (trimmed.includes("@")) return `<${trimmed}>`;
  return `<${trimmed}@agentmail.to>`;
}

export async function sendAgentMailMessage(options: {
  inboxId: string;
  to: string;
  subject: string;
  text: string;
  html: string;
  headers?: Record<string, string>;
  labels?: string[];
  attachments?: Array<{
    filename: string;
    content: string;
    contentType?: string;
  }>;
  ctx: AgentMailContext;
}): Promise<AgentMailSendResult> {
  const ctx = requireComponentContext(options.ctx, "send");
  const outboundId = await agentmail.sendMessage(
    ctx as unknown as SendContext,
    options.inboxId,
    {
      to: options.to,
      subject: options.subject,
      text: options.text,
      html: options.html,
      headers: options.headers,
      labels: options.labels,
      attachments: options.attachments,
    },
  );

  return { ...(await readOutboundIdentifiers(ctx, outboundId)), outboundId };
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
  attachments?: Array<{
    filename: string;
    content: string;
    contentType?: string;
  }>;
  ctx: AgentMailContext;
}): Promise<AgentMailSendResult> {
  const ctx = requireComponentContext(options.ctx, "reply");
  const outboundId = await agentmail.replyToMessage(
    ctx as unknown as SendContext,
    options.inboxId,
    options.messageId,
    {
      text: options.text,
      html: options.html,
      to: options.to,
      subject: options.subject,
      headers: options.headers,
      labels: options.labels,
      attachments: options.attachments,
    },
  );

  return { ...(await readOutboundIdentifiers(ctx, outboundId)), outboundId };
}

function matchesMessageId(candidateId: string | undefined, targetId: string): boolean {
  if (!candidateId) return false;
  if (candidateId === targetId) return true;
  const cleanCandidate = candidateId.replace(/^<|>$/g, "").trim().toLowerCase();
  const cleanTarget = targetId.replace(/^<|>$/g, "").trim().toLowerCase();
  return cleanCandidate === cleanTarget;
}

export async function listAgentMailMessages(
  inboxId: string,
  limit = 20,
  ctx: AgentMailContext,
): Promise<Array<Record<string, unknown>>> {
  const componentContext = requireActionContext(ctx, "list messages");
  const boundedLimit = Math.min(Math.max(1, limit), 50);

  // 1. Try reading from the component's durable webhook mirror
  if (typeof componentContext.runQuery === "function") {
    try {
      const localMessages = await componentContext.runQuery(
        components.agentmail.lib.listInboundMessages,
        { inboxId },
      );
      if (Array.isArray(localMessages) && localMessages.length > 0) {
        return localMessages.slice(0, boundedLimit).filter(isRecord);
      }
    } catch {
      // Proceed to remote fetch
    }
  }

  // 2. Try the component's listThreads action
  if (typeof componentContext.runAction === "function") {
    try {
      const threads = await agentmail.listThreads(
        componentContext as unknown as ActionContext,
        inboxId,
        { limit: boundedLimit },
      );
      if (Array.isArray(threads) && threads.length > 0) return threads.filter(isRecord);
      if (isRecord(threads) && Array.isArray(threads.threads) && threads.threads.length > 0) {
        return (threads.threads as Array<Record<string, unknown>>).filter(isRecord);
      }
    } catch {
      // Proceed to direct REST fallback
    }
  }

  // 3. Fallback to direct REST API
  const apiKey = configuredValue("AGENTMAIL_API_KEY");
  if (apiKey) {
    try {
      const baseUrl = (configuredValue("AGENTMAIL_BASE_URL") || "https://api.agentmail.to/v0").replace(/\/$/, "");
      const res = await fetch(`${baseUrl}/inboxes/${encodeURIComponent(inboxId)}/messages?limit=${boundedLimit}`, {
        method: "GET",
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (res.ok) {
        const body = await res.json();
        if (Array.isArray(body)) return body.filter(isRecord);
        if (isRecord(body) && Array.isArray(body.messages)) return (body.messages as Array<Record<string, unknown>>).filter(isRecord);
      }
    } catch {
      // Return empty array
    }
  }

  return [];
}

export async function getAgentMailMessage(
  inboxId: string,
  messageId: string,
  ctx: AgentMailContext,
): Promise<Record<string, unknown>> {
  const componentContext = requireActionContext(ctx, "get message");

  // 1. Try reading from the component's durable inbound mirror
  if (typeof componentContext.runQuery === "function") {
    try {
      const localMessages = await componentContext.runQuery(
        components.agentmail.lib.listInboundMessages,
        { inboxId },
      );
      if (Array.isArray(localMessages)) {
        const localMessage = localMessages.find(
          (candidate) =>
            isRecord(candidate) &&
            typeof candidate.messageId === "string" &&
            matchesMessageId(candidate.messageId, messageId),
        );
        if (isRecord(localMessage)) {
          if (isRecord(localMessage.raw)) {
            return localMessage.raw;
          }
          return {
            message_id: localMessage.messageId,
            inbox_id: localMessage.inboxId,
            thread_id: localMessage.threadId,
            from: localMessage.from,
            to: localMessage.to,
            subject: localMessage.subject,
            preview: localMessage.preview,
            text: localMessage.text,
            html: localMessage.html,
            extracted_text: localMessage.extractedText,
            extracted_html: localMessage.extractedHtml,
            in_reply_to: localMessage.inReplyTo,
            references: localMessage.references,
          };
        }
      }
    } catch {
      // Proceed to remote fetch
    }
  }

  // 2. Try fetching from the component's remote getMessage action
  if (typeof componentContext.runAction === "function") {
    const candidateIds = [messageId];
    const cleanId = messageId.replace(/^<|>$/g, "").trim();
    if (cleanId !== messageId) candidateIds.push(cleanId);
    if (!messageId.startsWith("<") && messageId.includes("@")) candidateIds.push(`<${messageId}>`);

    for (const cid of candidateIds) {
      try {
        const remoteMsg = await agentmail.getMessage(
          componentContext as unknown as ActionContext,
          inboxId,
          cid,
        );
        if (isRecord(remoteMsg)) {
          return remoteMsg;
        }
      } catch {
        // Try next candidate ID or proceed to REST fallback
      }
    }
  }

  // 3. Fallback to direct REST API
  const apiKey = configuredValue("AGENTMAIL_API_KEY");
  if (apiKey) {
    const candidateIds = [messageId];
    const cleanId = messageId.replace(/^<|>$/g, "").trim();
    if (cleanId !== messageId) candidateIds.push(cleanId);
    if (!messageId.startsWith("<") && messageId.includes("@")) candidateIds.push(`<${messageId}>`);

    const baseUrl = (configuredValue("AGENTMAIL_BASE_URL") || "https://api.agentmail.to/v0").replace(/\/$/, "");
    for (const cid of candidateIds) {
      try {
        const res = await fetch(`${baseUrl}/inboxes/${encodeURIComponent(inboxId)}/messages/${encodeURIComponent(cid)}`, {
          method: "GET",
          headers: { Authorization: `Bearer ${apiKey}` },
        });
        if (res.ok) {
          const body = await res.json();
          if (isRecord(body)) return body;
        }
      } catch {
        // Try next candidate ID
      }
    }
  }

  throw new Error(
    `AgentMail message ${messageId} was not found in the component mirror or remote API.`,
  );
}

export interface DownloadedAgentMailAttachment {
  buffer: Buffer;
  contentType: string;
  filename: string;
  size: number;
}

/**
 * Downloads an incoming email attachment from AgentMail.
 * Queries the attachment endpoint, resolves pre-signed download URLs, and returns the raw file buffer.
 */
export async function downloadAgentMailAttachment(options: {
  inboxId: string;
  messageId: string;
  attachmentId: string;
  filename?: string;
  contentType?: string;
}): Promise<DownloadedAgentMailAttachment> {
  const apiKey = configuredValue("AGENTMAIL_API_KEY");
  if (!apiKey) {
    throw new Error("AgentMail API key is not configured. Set AGENTMAIL_API_KEY.");
  }

  const baseUrl = (configuredValue("AGENTMAIL_BASE_URL") || "https://api.agentmail.to/v0").replace(/\/$/, "");
  const cleanMessageId = options.messageId.replace(/^<|>$/g, "").trim();

  // Try candidate message IDs (with and without brackets)
  const candidateIds = [options.messageId];
  if (cleanMessageId !== options.messageId) candidateIds.push(cleanMessageId);
  if (!options.messageId.startsWith("<") && options.messageId.includes("@")) candidateIds.push(`<${options.messageId}>`);

  let lastError: string = "Attachment not found";

  for (const cid of candidateIds) {
    const url = `${baseUrl}/inboxes/${encodeURIComponent(options.inboxId)}/messages/${encodeURIComponent(cid)}/attachments/${encodeURIComponent(options.attachmentId)}`;
    try {
      const res = await fetch(url, {
        method: "GET",
        headers: { Authorization: `Bearer ${apiKey}` },
      });

      if (!res.ok) {
        lastError = `HTTP ${res.status}: ${res.statusText}`;
        continue;
      }

      const responseContentType = res.headers.get("content-type") || "";

      // If response is JSON, it contains { download_url, content, filename, content_type, size }
      if (responseContentType.includes("application/json")) {
        const metadata = (await res.json()) as Record<string, unknown>;

        const resolvedFilename =
          (typeof metadata.filename === "string" ? metadata.filename : undefined) ||
          options.filename ||
          `attachment-${options.attachmentId}`;
        const resolvedContentType =
          (typeof metadata.content_type === "string" ? metadata.content_type : undefined) ||
          (typeof metadata.contentType === "string" ? metadata.contentType : undefined) ||
          options.contentType ||
          "application/octet-stream";

        // Check if inline base64 content was returned
        if (typeof metadata.content === "string" && metadata.content.trim()) {
          const buffer = Buffer.from(metadata.content.trim(), "base64");
          return {
            buffer,
            contentType: resolvedContentType,
            filename: resolvedFilename,
            size: buffer.byteLength,
          };
        }

        // Follow download_url if provided
        const downloadUrl =
          (typeof metadata.download_url === "string" ? metadata.download_url : undefined) ||
          (typeof metadata.downloadUrl === "string" ? metadata.downloadUrl : undefined) ||
          (typeof metadata.url === "string" ? metadata.url : undefined);

        if (downloadUrl) {
          const downloadRes = await fetch(downloadUrl);
          if (downloadRes.ok) {
            const arrayBuffer = await downloadRes.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);
            return {
              buffer,
              contentType: resolvedContentType,
              filename: resolvedFilename,
              size: buffer.byteLength,
            };
          }
        }
      } else {
        // Direct binary stream response
        const arrayBuffer = await res.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        return {
          buffer,
          contentType: options.contentType || responseContentType || "application/octet-stream",
          filename: options.filename || `attachment-${options.attachmentId}`,
          size: buffer.byteLength,
        };
      }
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
  }

  throw new Error(`Failed to download AgentMail attachment ${options.attachmentId}: ${lastError}`);
}
