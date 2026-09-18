import { redactBeforeLLM } from "./redactionEngine";

/**
 * Centralized PHI-safe LLM boundary for ClaimHero.
 *
 * Trust model:
 * - TRUSTED (inside boundary): Convex database, Convex actions/mutations,
 *   AWS Textract under the HIPAA BAA, in-browser client OCR/vault, final
 *   payer correspondence assembled deterministically in code.
 * - UNTRUSTED for PHI (no BAA assumed): OpenAI chat/completion/embedding
 *   endpoints, Firecrawl LLM extraction, and `@convex-dev/agent` thread
 *   message history (which persists prompts/deltas server-side).
 *
 * Production rule enforced here:
 * 1. Never interpolate raw direct identifiers into an LLM prompt. Known
 *    identifiers from the claim record are replaced deterministically with
 *    opaque tokens (vault) at prompt-construction time.
 * 2. Free-text fields (physician notes, OCR text, inbound email bodies) may
 *    contain unknown PII, so the deterministic vault is layered with the
 *    regex `redactBeforeLLM` gate as defense-in-depth.
 * 3. Fail closed: after sanitization the payload is asserted to contain no
 *    raw vault value; on leak the call throws before any network egress.
 * 4. Rehydration (tokens -> real values) happens ONLY inside the trusted
 *    boundary for final payer correspondence and database storage. Rehydrated
 *    text must never be fed back into an LLM input.
 */

export interface PhiValues {
  patientName?: string;
  memberId?: string;
  groupNumber?: string;
  claimNumber?: string;
  serviceDate?: string;
  patientEmail?: string;
  senderName?: string;
  senderEmail?: string;
  senderPhone?: string;
}

export const PHI_TOKENS = {
  patientName: "[PATIENT]",
  memberId: "[MEMBER_ID]",
  groupNumber: "[GROUP_NUMBER]",
  claimNumber: "[CLAIM_REF]",
  serviceDate: "[SERVICE_DATE]",
  patientEmail: "[PATIENT_EMAIL]",
  senderEmail: "[SENDER_EMAIL]",
  senderPhone: "[SENDER_PHONE]",
} as const;

export const PHI_TOKEN_INSTRUCTION =
  "Direct patient identifiers in this case are tokenized (for example [PATIENT], [MEMBER_ID], [GROUP_NUMBER], [CLAIM_REF], [SERVICE_DATE]). Do not invent, request, or output real names, member IDs, contact details, or exact dates. Use the tokens as given or omit the identifier.";

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isMeaningfulIdentifier(value: string): boolean {
  return value.trim().length >= 4;
}

function monthName(month: number): string {
  const names = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  return names[month - 1] || "";
}

/**
 * Expand a service date into the string variants payers and OCR commonly
 * emit so the vault catches ISO, US slash, and long-form renderings of the
 * same date (for example `2026-07-04`, `07/04/2026`, `July 4, 2026`).
 */
export function serviceDateVariants(raw: string): string[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];
  const variants = new Set<string>([trimmed]);

  const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) {
    const [, y, m, d] = iso;
    const month = Number(m);
    const day = Number(d);
    variants.add(`${m}/${d}/${y}`);
    variants.add(`${month}/${day}/${y}`);
    variants.add(`${monthName(month)} ${day}, ${y}`);
  }

  const us = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (us) {
    const [, m, d, y] = us;
    const month = Number(m);
    const day = Number(d);
    variants.add(`${y}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`);
    variants.add(`${monthName(month)} ${day}, ${y}`);
  }

  return [...variants].filter((v) => v.length >= 4);
}

export interface PhiReplacement {
  raw: string;
  token: string;
  caseInsensitive: boolean;
}

/**
 * Build deterministic replacements sorted longest-first so a full member ID
 * is tokenized before any shorter substring can partially match.
 */
export function buildPhiReplacements(phi: PhiValues): PhiReplacement[] {
  const replacements: PhiReplacement[] = [];

  const push = (raw: string | undefined, token: string, caseInsensitive = false) => {
    if (!raw) return;
    const trimmed = raw.trim();
    if (!isMeaningfulIdentifier(trimmed)) return;
    replacements.push({ raw: trimmed, token, caseInsensitive });
  };

  push(phi.memberId, PHI_TOKENS.memberId);
  push(phi.groupNumber, PHI_TOKENS.groupNumber);
  push(phi.claimNumber, PHI_TOKENS.claimNumber);
  push(phi.patientEmail, PHI_TOKENS.patientEmail);
  push(phi.senderEmail, PHI_TOKENS.senderEmail);
  push(phi.senderPhone, PHI_TOKENS.senderPhone);

  if (phi.serviceDate) {
    for (const variant of serviceDateVariants(phi.serviceDate)) {
      replacements.push({ raw: variant, token: PHI_TOKENS.serviceDate, caseInsensitive: false });
    }
  }

  if (phi.patientName) {
    const full = phi.patientName.trim();
    if (isMeaningfulIdentifier(full)) {
      replacements.push({ raw: full, token: PHI_TOKENS.patientName, caseInsensitive: true });
      const parts = full.split(/\s+/).filter((p) => p.length >= 3);
      // Tokenize the family name as well: free-text notes often mention only
      // the surname ("Vance's imaging shows..."), which a full-name-only
      // replacement would miss.
      if (parts.length >= 2) {
        const lastName = parts[parts.length - 1];
        replacements.push({ raw: lastName, token: PHI_TOKENS.patientName, caseInsensitive: true });
      }
    }
  }

  // Longest raw value first prevents partial shadowing.
  replacements.sort((a, b) => b.raw.length - a.raw.length);
  return replacements;
}

export function applyPhiVault(text: string, replacements: PhiReplacement[]): string {
  if (!text || replacements.length === 0) return text;
  let out = text;
  for (const { raw, token, caseInsensitive } of replacements) {
    const pattern = new RegExp(`\\b${escapeRegExp(raw)}\\b`, caseInsensitive ? "gi" : "g");
    out = out.replace(pattern, token);
  }
  return out;
}

/**
 * Collect known identifiers from the heterogeneous claim shapes used across
 * actions (`claim.patient.*` on joined reads, flat `claim.patientName` on
 * legacy rows, chatbot tool payloads, Textract/client vaults).
 */
export function collectPhiValues(source: {
  patient?: {
    name?: string | null;
    memberId?: string | null;
    groupNumber?: string | null;
    email?: string | null;
  } | null;
  patientName?: string | null;
  patientMemberId?: string | null;
  patientEmail?: string | null;
  memberId?: string | null;
  groupNumber?: string | null;
  claimNumber?: string | null;
  serviceDate?: string | null;
  senderEmail?: string | null;
  senderPhone?: string | null;
  senderName?: string | null;
  appealContext?: {
    sender?: { name?: string | null; email?: string | null; phone?: string | null } | null;
  } | null;
}): PhiValues {
  return {
    patientName: source.patient?.name || source.patientName || undefined,
    memberId:
      source.patient?.memberId || source.patientMemberId || source.memberId || undefined,
    groupNumber: source.patient?.groupNumber || source.groupNumber || undefined,
    claimNumber: source.claimNumber || undefined,
    serviceDate: source.serviceDate || undefined,
    patientEmail: source.patient?.email || source.patientEmail || undefined,
    senderName: source.senderName || source.appealContext?.sender?.name || undefined,
    senderEmail: source.senderEmail || source.appealContext?.sender?.email || undefined,
    senderPhone: source.senderPhone || source.appealContext?.sender?.phone || undefined,
  };
}

/**
 * Fail-closed leak assertion. Throws PhiLeakError without echoing the raw
 * value so logs never become a second exfiltration channel.
 */
export class PhiLeakError extends Error {
  readonly leakedField: string;
  constructor(leakedField: string) {
    super(
      `PHI safety gate blocked an LLM request: de-identified payload still contains ${leakedField}. ` +
        `The request was not sent.`
    );
    this.name = "PhiLeakError";
    this.leakedField = leakedField;
  }
}

export function assertNoPhiLeak(sanitizedText: string, phi: PhiValues): void {
  const checks: Array<[string | undefined, string, boolean]> = [
    [phi.patientName?.trim(), "patient name", true],
    [phi.memberId?.trim(), "member ID", false],
    [phi.groupNumber?.trim(), "group number", false],
    [phi.patientEmail?.trim(), "patient email", true],
    [phi.senderEmail?.trim(), "sender email", true],
    [phi.senderPhone?.trim(), "sender phone", false],
  ];

  for (const [raw, field, caseInsensitive] of checks) {
    if (!raw || !isMeaningfulIdentifier(raw)) continue;
    // Service dates are tokenized but the grouped year-only vintage signal is
    // intentionally preserved for policy-relevance prompts; the full date is
    // what must never egress.
    const haystack = caseInsensitive ? sanitizedText.toLowerCase() : sanitizedText;
    const needle = caseInsensitive ? raw.toLowerCase() : raw;
    if (haystack.includes(needle)) {
      throw new PhiLeakError(field);
    }
  }

  if (phi.serviceDate) {
    for (const variant of serviceDateVariants(phi.serviceDate)) {
      if (sanitizedText.includes(variant)) {
        throw new PhiLeakError("date of service");
      }
    }
  }

  // Surname check: catches "Vance" when only the family name leaks into
  // free-text notes after full-name tokenization.
  if (phi.patientName) {
    const parts = phi.patientName.trim().split(/\s+/).filter((p) => p.length >= 3);
    if (parts.length >= 2) {
      const lastName = parts[parts.length - 1];
      const pattern = new RegExp(`\\b${escapeRegExp(lastName)}\\b`, "i");
      if (pattern.test(sanitizedText)) {
        throw new PhiLeakError("patient name");
      }
    }
  }
}

/**
 * De-identify one free-text payload for LLM egress: deterministic vault
 * first (authoritative identifiers), regex gate second (unknown PII in
 * physician notes / OCR / email bodies), fail-closed assertion last.
 */
export function deidentifyForLlm(text: string, phi?: PhiValues): string {
  if (!text || typeof text !== "string") return "";
  const replacements = phi ? buildPhiReplacements(phi) : [];
  const vaulted = applyPhiVault(text, replacements);
  const sanitized = redactBeforeLLM(vaulted, {
    patientName: phi?.patientName,
    customTerms: replacements
      .map((r) => r.raw)
      .filter((raw) => raw.length >= 4)
      .slice(0, 25),
  });
  if (phi) assertNoPhiLeak(sanitized, phi);
  return sanitized;
}

export function deidentifyPromptPair(
  systemPrompt: string,
  userPrompt: string,
  phi?: PhiValues
): { systemPrompt: string; userPrompt: string } {
  return {
    systemPrompt: deidentifyForLlm(systemPrompt, phi),
    userPrompt: deidentifyForLlm(userPrompt, phi),
  };
}

/**
 * Rehydrate tokens for trusted-boundary use only: final payer
 * correspondence assembled in code and Convex database writes. Never pass
 * rehydrated text back into an LLM input.
 */
export function rehydrateForDisplay(text: string, phi?: PhiValues): string {
  if (!text || !phi) return text;
  let out = text;
  const pairs: Array<[string | undefined, string]> = [
    [phi.patientName, PHI_TOKENS.patientName],
    [phi.memberId, PHI_TOKENS.memberId],
    [phi.groupNumber, PHI_TOKENS.groupNumber],
    [phi.claimNumber, PHI_TOKENS.claimNumber],
    [phi.serviceDate, PHI_TOKENS.serviceDate],
    [phi.patientEmail, PHI_TOKENS.patientEmail],
    [phi.senderEmail, PHI_TOKENS.senderEmail],
    [phi.senderPhone, PHI_TOKENS.senderPhone],
  ];
  for (const [raw, token] of pairs) {
    if (!raw || !raw.trim()) continue;
    out = out.split(token).join(raw.trim());
  }
  return out;
}

/**
 * Serialize tool/query output for agent-LLM consumption. Tool outputs are
 * LLM inputs: they cross the same untrusted boundary as prompts.
 */
export function sanitizeToolOutputForLlm(data: unknown, phi?: PhiValues): string {
  return deidentifyForLlm(JSON.stringify(data, null, 2), phi);
}
