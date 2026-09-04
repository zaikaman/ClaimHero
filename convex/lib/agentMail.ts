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
    },
  );

  return { ...(await readOutboundIdentifiers(ctx, outboundId)), outboundId };
}

export async function listAgentMailMessages(
  inboxId: string,
  limit = 20,
  ctx: AgentMailContext,
): Promise<Array<Record<string, unknown>>> {
  const componentContext = requireActionContext(ctx, "list messages");
  if (typeof componentContext.runQuery !== "function") {
    throw new Error(
      "AgentMail list messages requires a Convex action context with runQuery.",
    );
  }

  // Reconcile from the component's durable webhook mirror. This avoids the
  // remote listThreads action, which is not present in older deployed
  // component instances, and still recovers messages whose callback failed.
  const localMessages = await componentContext.runQuery(
    components.agentmail.lib.listInboundMessages,
    { inboxId },
  );
  if (!Array.isArray(localMessages)) return [];

  const boundedLimit = Math.min(Math.max(1, limit), 50);
  return localMessages
    .slice(0, boundedLimit)
    .filter(isRecord);
}

export async function getAgentMailMessage(
  inboxId: string,
  messageId: string,
  ctx: AgentMailContext,
): Promise<Record<string, unknown>> {
  const componentContext = requireActionContext(ctx, "get message");
  if (typeof componentContext.runQuery !== "function") {
    throw new Error(
      "AgentMail get message requires a Convex action context with runQuery.",
    );
  }

  // The component stores the complete inbound payload when its webhook
  // mutation succeeds. Read that durable record instead of calling the
  // optional remote getMessage action.
  const localMessages = await componentContext.runQuery(
    components.agentmail.lib.listInboundMessages,
    { inboxId },
  );
  if (!Array.isArray(localMessages)) {
    throw new Error("AgentMail component returned an invalid message list.");
  }

  const localMessage = localMessages.find(
    (candidate) =>
      isRecord(candidate) &&
      candidate.messageId === messageId,
  );
  if (!isRecord(localMessage)) {
    throw new Error(
      `AgentMail message ${messageId} was not found in the component mirror.`,
    );
  }

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
