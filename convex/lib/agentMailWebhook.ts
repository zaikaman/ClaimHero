export interface AgentMailAttachmentSummary {
  attachmentId: string;
  filename?: string;
  contentType?: string;
  size?: number;
}

export interface NormalizedAgentMailWebhook {
  eventType: string;
  eventId: string;
  messageId: string;
  threadId?: string;
  inboxId: string;
  from?: string;
  recipients: string[];
  subject?: string;
  text?: string;
  html?: string;
  attachments: AgentMailAttachmentSummary[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function firstString(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (Array.isArray(value)) {
    const first = value.find((item) => typeof item === "string" && item.trim());
    return typeof first === "string" ? first.trim() : undefined;
  }
  if (isRecord(value) && typeof value.email === "string" && value.email.trim()) {
    return value.email.trim();
  }
  return undefined;
}

function stringArray(value: unknown): string[] {
  if (typeof value === "string" && value.trim()) return [value.trim()];
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).map((item) => item.trim());
}

function readField(record: Record<string, unknown>, ...keys: string[]): unknown {
  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null) return record[key];
  }
  return undefined;
}

function normalizeAttachments(value: unknown): AgentMailAttachmentSummary[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((item) => {
    if (!isRecord(item)) return [];
    const attachmentId = firstString(readField(item, "attachment_id", "attachmentId", "id"));
    if (!attachmentId) return [];

    const size = typeof item.size === "number" ? item.size : typeof item.size_bytes === "number" ? item.size_bytes : undefined;
    return [{
      attachmentId,
      filename: firstString(readField(item, "filename", "name")),
      contentType: firstString(readField(item, "content_type", "contentType", "mime_type")),
      size,
    }];
  });
}

/**
 * Normalizes AgentMail's current nested webhook event while retaining support
 * for the older data-envelope shape used by the first ClaimHero webhook.
 */
export function normalizeAgentMailWebhook(payload: unknown, fallbackEventId?: string): NormalizedAgentMailWebhook | null {
  if (!isRecord(payload)) return null;

  const eventType = firstString(readField(payload, "event_type", "event"));
  const message = isRecord(payload.message)
    ? payload.message
    : isRecord(payload.data) && isRecord(payload.data.message)
      ? payload.data.message
      : isRecord(payload.data)
        ? payload.data
        : payload;

  const messageId = firstString(readField(message, "message_id", "messageId"));
  const inboxId = firstString(readField(message, "inbox_id", "inboxId"));
  const recipients = stringArray(readField(message, "to", "recipient"));
  if (!eventType || !messageId || !inboxId || recipients.length === 0) return null;

  const eventId = firstString(readField(payload, "event_id", "eventId")) || fallbackEventId || messageId;

  return {
    eventType,
    eventId,
    messageId,
    threadId: firstString(readField(message, "thread_id", "threadId")),
    inboxId,
    from: firstString(readField(message, "from_", "from", "sender")),
    recipients,
    subject: firstString(readField(message, "subject")),
    text: firstString(readField(message, "text", "extracted_text", "body_text")),
    html: firstString(readField(message, "html", "extracted_html", "body_html")),
    attachments: normalizeAttachments(message.attachments),
  };
}

export function extractEmailAddress(value?: string): string | undefined {
  if (!value) return undefined;
  const bracketed = value.match(/<([^<>\s]+@[^<>\s]+)>/);
  const candidate = bracketed?.[1] || value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0];
  return candidate?.trim().toLowerCase();
}
