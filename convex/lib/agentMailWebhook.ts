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

/**
 * Decodes a base64 string to Uint8Array safely across Node and Convex runtimes.
 */
export function base64ToUint8Array(base64: string): Uint8Array {
  if (typeof Buffer !== "undefined") {
    return new Uint8Array(Buffer.from(base64, "base64"));
  }
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

/**
 * Encodes a Uint8Array to a base64 string safely across Node and Convex runtimes.
 */
export function uint8ArrayToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes).toString("base64");
  }
  let binaryString = "";
  for (let i = 0; i < bytes.length; i++) {
    binaryString += String.fromCharCode(bytes[i]);
  }
  return btoa(binaryString);
}

/**
 * Performs timing-safe equality check to prevent timing attacks during HMAC signature validation.
 */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

/**
 * Computes an HMAC-SHA256 signature for Svix webhook payloads.
 */
export async function computeSvixSignature(
  id: string,
  timestamp: string | number,
  payload: string,
  secret: string
): Promise<string> {
  const cleanSecret = secret.startsWith("whsec_") ? secret.slice(6) : secret;
  const secretKeyBytes = base64ToUint8Array(cleanSecret);

  const key = await crypto.subtle.importKey(
    "raw",
    secretKeyBytes as unknown as BufferSource,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signedContent = `${id}.${timestamp}.${payload}`;
  const signatureBuffer = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(signedContent)
  );

  return uint8ArrayToBase64(new Uint8Array(signatureBuffer));
}

export interface VerifySvixWebhookOptions {
  payload: string;
  headers:
    | {
        id?: string | null;
        timestamp?: string | null;
        signature?: string | null;
        [key: string]: unknown;
      }
    | Headers;
  secret: string;
  toleranceInSeconds?: number;
}

export interface SvixVerificationResult {
  valid: boolean;
  error?: string;
  /**
   * True when the signature is authentic but the timestamp is older than the
   * allowed tolerance (a provider retry or late first delivery). Callers
   * should accept and process these idempotently (returning 2xx) instead of
   * responding 401, which would trigger an endless provider retry storm.
   */
  stale?: boolean;
  /** Age of the webhook timestamp in seconds relative to now (if parseable). */
  timestampAgeSec?: number;
}

/**
 * Verifies standard Svix webhook signature and timestamp headers.
 */
export async function verifySvixWebhook(
  options: VerifySvixWebhookOptions
): Promise<SvixVerificationResult> {
  const { payload, secret, toleranceInSeconds = 300 } = options;

  if (!secret?.trim()) {
    return { valid: false, error: "Webhook secret is not configured" };
  }

  let id: string | null = null;
  let timestamp: string | null = null;
  let signatureHeader: string | null = null;

  if (options.headers && typeof (options.headers as Headers).get === "function") {
    const h = options.headers as Headers;
    id = h.get("svix-id") || h.get("webhook-id");
    timestamp = h.get("svix-timestamp") || h.get("webhook-timestamp");
    signatureHeader = h.get("svix-signature") || h.get("webhook-signature");
  } else if (options.headers && typeof options.headers === "object") {
    const h = options.headers as Record<string, unknown>;
    id = (typeof h["svix-id"] === "string" ? h["svix-id"] : typeof h.id === "string" ? h.id : null);
    timestamp = (typeof h["svix-timestamp"] === "string" ? h["svix-timestamp"] : typeof h.timestamp === "string" ? h.timestamp : null);
    signatureHeader = (typeof h["svix-signature"] === "string" ? h["svix-signature"] : typeof h.signature === "string" ? h.signature : null);
  }

  if (!id || !timestamp || !signatureHeader) {
    return { valid: false, error: "Missing required Svix signature headers (svix-id, svix-timestamp, svix-signature)" };
  }

  const timestampNum = parseInt(timestamp, 10);
  if (isNaN(timestampNum)) {
    return { valid: false, error: "Invalid timestamp header value" };
  }

  // Verify the cryptographic signature before evaluating freshness so that
  // forged payloads always fail closed, even with a fresh timestamp.
  const expectedSignature = await computeSvixSignature(id, timestamp, payload, secret);

  const signatures = signatureHeader.trim().split(/\s+/);
  let matched = false;

  for (const sig of signatures) {
    const [version, signatureValue] = sig.split(",", 2);
    if (version === "v1" && signatureValue) {
      if (timingSafeEqual(signatureValue, expectedSignature)) {
        matched = true;
        break;
      }
    }
  }

  if (!matched) {
    return { valid: false, error: "Signature verification failed" };
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const ageSec = nowSec - timestampNum;
  if (Math.abs(ageSec) > toleranceInSeconds) {
    if (ageSec > 0) {
      // Authentic signature with an old timestamp: this is a provider retry
      // reusing the original timestamp, or a late first delivery after an
      // outage. The inbound pipeline is idempotent on AgentMail message ID,
      // so the caller should process it normally and acknowledge with 2xx.
      // Returning 401 here would cause the provider to retry forever,
      // producing a permanent 401 storm in the logs.
      return { valid: true, stale: true, timestampAgeSec: ageSec };
    }
    return { valid: false, error: `Webhook timestamp outside allowed tolerance of ${toleranceInSeconds} seconds` };
  }

  return { valid: true };
}

/**
 * ClaimHero-owned AgentMail identities used to recognise internally generated
 * mail (own sender/adjudicator inboxes). Any sender on the shared AgentMail
 * infrastructure domain is internal: real insurance payers never send from
 * `@agentmail.to` addresses.
 */
export interface AgentMailIdentities {
  senderEmail?: string;
  adjudicatorEmail?: string;
  senderInboxId?: string;
  adjudicatorInboxId?: string;
}

/**
 * Returns true when an email address belongs to ClaimHero's own AgentMail
 * infrastructure rather than an external payer. Compares against the
 * configured sender/adjudicator emails and inbox IDs, and falls back to the
 * shared infrastructure domain so loopback detection keeps working even when
 * mailbox configuration is unavailable.
 */
export function isInternalAgentMailAddress(
  value: string | undefined,
  identities?: AgentMailIdentities
): boolean {
  if (!value) return false;
  const lower = value.toLowerCase();
  const addr = extractEmailAddress(lower) || lower.trim();

  const candidates = [
    identities?.senderEmail,
    identities?.adjudicatorEmail,
    identities?.senderInboxId,
    identities?.adjudicatorInboxId,
  ]
    .filter((entry): entry is string => typeof entry === "string" && Boolean(entry.trim()))
    .map((entry) => entry.toLowerCase().trim());

  for (const candidate of candidates) {
    if (!candidate) continue;
    if (addr === candidate || lower.includes(candidate)) return true;
  }

  const domain = addr.split("@").pop() || "";
  return domain === "agentmail.to";
}
