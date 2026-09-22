/**
 * Trusted-UI display safety (client mirror of `resolveClaimProviderName` /
 * `resolveClaimPatientName` in `convex/claims.ts`).
 *
 * The trusted UI (authenticated case views) must never render LLM
 * de-identification placeholders as real identities. Redaction applies only
 * to untrusted egress (OpenAI, Firecrawl, agent thread history), public
 * exhibits, and exported CSV/JSON. Any value carrying redaction markers that
 * reaches the client (stale cache, direct extraction-result preview, or a
 * legacy corrupted row) collapses to an honest empty/generic state here.
 */

export function isRedactedPlaceholder(raw?: string | null): boolean {
  const value = (raw ?? "").trim();
  if (!value) return false;
  return (
    value.includes("REDACTED") ||
    value.includes("[PATIENT") ||
    value.includes("[MEMBER") ||
    value.includes("[CLAIM") ||
    value.includes("[SERVICE") ||
    value.includes("[DATE") ||
    value.includes("**") ||
    value === "Patient" ||
    value === "Patient Record" ||
    value === "[PATIENT]"
  );
}

/**
 * Provider display value. Returns "" for missing or redacted input so callers
 * fall back to honest generic states instead of
 * "Dr. [PATIENT REDACTED], MD". Never invents titles: collapses repeated
 * leading "Dr." to one and leaves bare facility/personal names untouched.
 */
export function resolveProviderDisplayName(raw?: string | null): string {
  const name = (raw ?? "").trim().replace(/\s+/g, " ");
  if (!name || isRedactedPlaceholder(name)) return "";
  const withoutTitles = name.replace(/^(dr\.?\s+)+/i, "").trim();
  if (!withoutTitles) return "";
  if (isRedactedPlaceholder(withoutTitles)) return "";
  return /^dr\.?\s+/i.test(name) ? `Dr. ${withoutTitles}` : name;
}

/**
 * Patient display value for extraction previews and case headers.
 * Placeholders collapse to the honest fallback instead of leaking
 * "[PATIENT REDACTED]" into the trusted UI.
 */
export function resolvePatientDisplayName(
  raw?: string | null,
  fallback = "Not specified in denial notice"
): string {
  const name = (raw ?? "").trim().replace(/\s+/g, " ");
  if (!name || isRedactedPlaceholder(name)) return fallback;
  return name;
}

/**
 * Member ID display value. Placeholders collapse to the fallback instead of
 * leaking "[REDACTED MEMBER ID]" into case views, letters, and printouts.
 */
export function resolveMemberIdDisplay(raw?: string | null, fallback = "N/A"): string {
  const id = (raw ?? "").trim().replace(/\s+/g, " ");
  if (!id || isRedactedPlaceholder(id) || id === "PENDING") return fallback;
  return id;
}

/**
 * Group number display value. Empty when missing or masked so callers omit
 * the line instead of printing a redaction marker to the payer.
 */
export function resolveGroupNumberDisplay(raw?: string | null): string {
  const id = (raw ?? "").trim().replace(/\s+/g, " ");
  if (!id || isRedactedPlaceholder(id)) return "";
  return id;
}

/**
 * Sanitize rebuttal draft display on the client.
 * Defense-in-depth: If a cached or legacy draft still has [CLAIM_REF] or [DATE],
 * clean it safely so the user never sees raw placeholders in the draft card.
 */
export function sanitizeRebuttalDraftDisplay(
  draft?: string | null,
  claimNumber?: string | null,
  serviceDate?: string | null
): string {
  if (!draft) return "";
  let clean = draft;
  if (claimNumber) {
    clean = clean.replace(/\[(?:CLAIM_REF|CLAIM_NUMBER|CLAIM_ID)\]/gi, claimNumber.trim());
  }
  if (serviceDate) {
    clean = clean.replace(/\[(?:SERVICE_DATE|DOS|DATE_OF_SERVICE)\]/gi, serviceDate.trim());
  }
  clean = clean.replace(/dated\s+\[DATE\]/gi, "on file prior to service");
  clean = clean.replace(/\[DATE\]/gi, serviceDate?.trim() || "on file");
  return clean;
}
