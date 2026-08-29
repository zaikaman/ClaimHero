export interface AgentMailSendResult {
  messageId?: string;
}

export interface SharedAgentMailboxes {
  senderInboxId: string;
  senderEmail: string;
  adjudicatorInboxId: string;
  adjudicatorEmail: string;
}

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

export async function sendAgentMailMessage(options: {
  inboxId: string;
  to: string;
  subject: string;
  text: string;
  html: string;
}): Promise<AgentMailSendResult> {
  const response = await fetch(
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
  };
}
