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
  dateOfBirth?: string;
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
  dateOfBirth: "[DOB]",
  claimNumber: "[CLAIM_REF]",
  serviceDate: "[SERVICE_DATE]",
  patientEmail: "[PATIENT_EMAIL]",
  senderEmail: "[SENDER_EMAIL]",
  senderPhone: "[SENDER_PHONE]",
} as const;

export const PHI_TOKEN_INSTRUCTION =
  "Direct patient identifiers in this case are tokenized (for example [PATIENT], [MEMBER_ID], [GROUP_NUMBER], [CLAIM_REF], [SERVICE_DATE]). Do not invent, request, or output real names, member IDs, contact details, or exact dates. Use the tokens as given or omit the identifier.";

export const REBUTTAL_PHI_INSTRUCTION =
  `${PHI_TOKEN_INSTRUCTION}\nCRITICAL PLACEHOLDER MANDATE: Never output raw bracketed placeholders like [DATE], [TIME], [CLINICAL_DATE], or [INSERT X]. If referencing clinical evidence, diagnostic imaging, or provider notes where an exact date is not provided or masked, refer to it naturally by description (e.g., 'the documented prior radiographs on file', 'the prerequisite imaging submitted with the appeal docket'), NEVER as a bracketed placeholder.`;

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

  if (phi.dateOfBirth) {
    for (const variant of serviceDateVariants(phi.dateOfBirth)) {
      replacements.push({ raw: variant, token: PHI_TOKENS.dateOfBirth, caseInsensitive: false });
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
    dateOfBirth?: string | null;
    email?: string | null;
  } | null;
  patientName?: string | null;
  patientMemberId?: string | null;
  patientEmail?: string | null;
  memberId?: string | null;
  groupNumber?: string | null;
  dateOfBirth?: string | null;
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
    dateOfBirth: source.patient?.dateOfBirth || source.dateOfBirth || undefined,
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
    [phi.dateOfBirth?.trim(), "date of birth", false],
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

  if (phi.dateOfBirth) {
    for (const variant of serviceDateVariants(phi.dateOfBirth)) {
      if (sanitizedText.includes(variant)) {
        throw new PhiLeakError("date of birth");
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
  const pairs: Array<[string | undefined, string[]]> = [
    [phi.patientName, [PHI_TOKENS.patientName, "[PATIENT_NAME]"]],
    [phi.memberId, [PHI_TOKENS.memberId, "[SUBSCRIBER_ID]"]],
    [phi.groupNumber, [PHI_TOKENS.groupNumber]],
    [phi.dateOfBirth, [PHI_TOKENS.dateOfBirth, "[DATE_OF_BIRTH]"]],
    [phi.claimNumber, [PHI_TOKENS.claimNumber, "[CLAIM_NUMBER]", "[CLAIM_ID]"]],
    [phi.serviceDate, [PHI_TOKENS.serviceDate, "[DOS]", "[DATE_OF_SERVICE]"]],
    [phi.patientEmail, [PHI_TOKENS.patientEmail]],
    [phi.senderEmail, [PHI_TOKENS.senderEmail]],
    [phi.senderPhone, [PHI_TOKENS.senderPhone]],
  ];
  for (const [raw, tokens] of pairs) {
    if (!raw || !raw.trim()) continue;
    const value = raw.trim();
    for (const token of tokens) {
      out = out.split(token).join(value);
    }
  }
  return out;
}

/**
 * Contextual clinical facts and identifiers for rebuttal rehydration.
 */
export interface RebuttalClaimContext {
  claimNumber: string;
  patientName?: string | null;
  patient?: {
    name?: string | null;
    memberId?: string | null;
    groupNumber?: string | null;
    dateOfBirth?: string | null;
    email?: string | null;
  } | null;
  memberId?: string | null;
  groupNumber?: string | null;
  dateOfBirth?: string | null;
  serviceDate?: string | null;
  denialDate?: string | null;
  clinicalFacts?: Record<string, unknown> | null;
  appealContext?: {
    clinicalFacts?: {
      symptomsAndFunctionalImpact?: string;
      examinationFindings?: string;
      imagingAndDiagnostics?: string;
      treatmentHistoryAndResponse?: string;
      otherDocumentedFacts?: string;
      [key: string]: unknown;
    } | null;
    sender?: { name?: string | null; email?: string | null; phone?: string | null } | null;
  } | null;
  [key: string]: unknown;
}

/**
 * Scan clinical facts and evidence text to find documented dates associated with
 * diagnostic imaging, radiographs, laboratory, or prior conservative therapy.
 */
export function extractPrerequisiteClinicalDate(
  claim: RebuttalClaimContext,
  studyKeywords: string[] = ["radiograph", "x-ray", "imaging", "plain film", "mri", "scan", "ultrasound", "arthroscopy"]
): string | null {
  const sources: string[] = [];

  const addText = (val: unknown) => {
    if (typeof val === "string" && val.trim().length > 0) {
      sources.push(val);
    }
  };

  const cf = (claim.appealContext?.clinicalFacts || claim.clinicalFacts) as
    | Record<string, unknown>
    | null
    | undefined;
  if (cf) {
    addText(cf.imagingAndDiagnostics);
    addText(cf.otherDocumentedFacts);
    addText(cf.treatmentHistoryAndResponse);
    addText(cf.examinationFindings);
    addText(cf.documentedClinicalFacts);
  }

  const combined = sources.join("\n");
  if (!combined) return null;

  const dateRegex = /\b(0?[1-9]|1[0-2])[/.-](0?[1-9]|[12]\d|3[01])[/.-](\d{4})\b|\b((?:January|February|March|April|May|June|July|August|September|October|November|December)\s+(?:0?[1-9]|[12]\d|3[01]),?\s+\d{4})\b/i;

  const sentences = combined.split(/(?<=[.!?\n])\s+/);
  for (const sentence of sentences) {
    const hasKeyword = studyKeywords.some((kw) => sentence.toLowerCase().includes(kw));
    if (hasKeyword) {
      const dateMatch = sentence.match(dateRegex);
      if (dateMatch) {
        return dateMatch[0];
      }
    }
  }

  const imagingText = typeof cf?.imagingAndDiagnostics === "string" ? cf.imagingAndDiagnostics : "";
  if (imagingText) {
    const match = imagingText.match(dateRegex);
    if (match) return match[0];
  }

  return null;
}

/**
 * Context-aware resolution of de-identified tokens and clinical evidentiary placeholders
 * in rebuttal addenda and outbound correspondence.
 *
 * Guarantees:
 * 1. Vaulted identifiers ([CLAIM_REF], [PATIENT], [MEMBER_ID], [SERVICE_DATE]) are restored.
 * 2. Prerequisite imaging/clinical dates (e.g. "radiographs dated [DATE]") resolve against
 *    actual documented clinical facts (e.g. 05/20/2026) rather than erroneously assuming
 *    the procedure serviceDate (07/18/2026), preventing fatal clinical contradictions.
 * 3. If no specific prior study date is documented, safely falls back to natural evidentiary
 *    phrasing ("documented prerequisite radiographs on file") instead of leaving raw [DATE].
 * 4. Eliminates any remaining bracketed de-identification markers.
 */
export function resolveRebuttalEvidentiaryPlaceholders(
  text: string,
  claim: RebuttalClaimContext,
  _evidences?: Array<{ extractedEvidenceMarkdown?: string; title?: string }> | null
): string {
  if (!text || typeof text !== "string") return "";

  const phi = collectPhiValues(claim);
  let resolved = rehydrateForDisplay(text, phi);

  // 1. Explicit claim number / ref variations
  if (claim.claimNumber) {
    resolved = resolved
      .replace(/\[(?:CLAIM_REF|CLAIM_NUMBER|CLAIM_ID)\]/gi, claim.claimNumber)
      .replace(/Claim\s*#\s*\[CLAIM_REF\]/gi, `Claim #${claim.claimNumber}`);
  }

  // 2. Patient variations
  const patName = phi.patientName || (claim.patientName ? String(claim.patientName).trim() : "");
  if (patName) {
    resolved = resolved.replace(/\[(?:PATIENT|PATIENT_NAME)\]/gi, patName);
  }

  // 3. Service date / DOS variations
  const dos = phi.serviceDate || (claim.serviceDate ? String(claim.serviceDate).trim() : "");
  if (dos) {
    resolved = resolved.replace(/\[(?:SERVICE_DATE|DOS|DATE_OF_SERVICE)\]/gi, dos);
  }

  // 4. Clinical evidence and prerequisite study dates
  const priorImagingDate = extractPrerequisiteClinicalDate(claim);

  // Handle specific imaging phrases like "radiographs dated [DATE]", "x-rays dated [DATE]"
  resolved = resolved.replace(
    /(\b(?:weight-bearing\s+)?(?:plain\s+)?(?:radiographs?|x-rays?|imaging|films?|scans?)\s+dated\s+)\[DATE\]/gi,
    (_full, prefix) => {
      return priorImagingDate
        ? `${prefix}${priorImagingDate}`
        : `${prefix.replace(/\s+dated\s+$/i, "")} on file`;
    }
  );

  // Handle "dated [DATE]" preceded by other evidence context
  if (priorImagingDate) {
    resolved = resolved.replace(/dated\s+\[DATE\]/gi, `dated ${priorImagingDate}`);
  } else {
    resolved = resolved.replace(/dated\s+\[DATE\]/gi, "on file prior to service");
  }

  // 5. Bare [DATE] placeholder resolution
  if (dos) {
    resolved = resolved.replace(/(\b(?:service|services|claim|procedure|rendered)\s+(?:on|dated)\s+)\[DATE\]/gi, `$1${dos}`);
  }
  // Any residual [DATE]
  resolved = resolved.replace(/\[DATE\]/gi, dos || "on file");

  // 6. Clean any residual generic bracketed placeholder artifacts that might confuse payers
  resolved = resolved
    .replace(/\[INSERT\s+[^\]]+\]/gi, "")
    .replace(/\[CLINICAL_DATE\]/gi, priorImagingDate || dos || "on record")
    .replace(/\[CLINICAL_EVIDENCE\]/gi, "the documented clinical record on file")
    .replace(/\[TIME\]/gi, "timely");

  return resolved;
}

/**
 * Check whether any unresolved uppercase de-identification tokens or bracketed placeholders
 * remain in the text (e.g. [CLAIM_REF], [PATIENT], [DATE], [REDACTED ...]).
 */
export function hasUnresolvedPlaceholders(text: string): boolean {
  if (!text || typeof text !== "string") return false;
  return /\[(?:CLAIM_REF|PATIENT|MEMBER_ID|GROUP_NUMBER|DOB|SERVICE_DATE|DOS|DATE|INSERT\s|REDACTED\b)[^\]]*\]/i.test(
    text
  );
}

/**
 * Serialize tool/query output for agent-LLM consumption. Tool outputs are
 * LLM inputs: they cross the same untrusted boundary as prompts.
 */
export function sanitizeToolOutputForLlm(data: unknown, phi?: PhiValues): string {
  return deidentifyForLlm(JSON.stringify(data, null, 2), phi);
}
