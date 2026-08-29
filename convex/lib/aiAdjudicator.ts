/**
 * Helpers for the autonomous AI payer adjudicator (inbox option 1).
 * Detects dedicated review inboxes and formats correspondence for follow-up reviews.
 */

export const AI_ADJUDICATOR_INBOX_MARKER = "-adjudication@claimhero.agentmail.com";

export function isAiAdjudicatorAddress(email: string | undefined | null): boolean {
  if (!email) return false;
  const normalized = email.toLowerCase();
  if (normalized.includes(AI_ADJUDICATOR_INBOX_MARKER)) return true;

  const address = normalized.match(/<([^>]+)>/)?.[1] || normalized;
  const localPart = address.split("@")[0] || "";
  return localPart.includes("adjudication") || localPart.includes("adjudicator");
}

export function buildAiAdjudicatorAddress(payerName: string): string {
  const slug = payerName.toLowerCase().replace(/[^a-z0-9]/g, "");
  return `${slug}${AI_ADJUDICATOR_INBOX_MARKER}`;
}

export function formatCorrespondenceTranscript(
  messages: Array<{ direction: string; subject: string; bodyText: string }>
): string {
  const recent = messages.slice(-20);
  return recent
    .map((message) => {
      const role =
        message.direction === "outbound"
          ? "APPELLANT (Authorized Representative)"
          : "PAYER MEDICAL DIRECTOR";
      return `[${role}]\nSubject: ${message.subject}\n${message.bodyText}`;
    })
    .join("\n\n-----\n\n");
}
