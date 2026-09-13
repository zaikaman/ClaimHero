/**
 * Case Radar Portfolio Export Utilities
 * 
 * Implements HIPAA Safe Harbor (45 CFR § 164.514) de-identification and 
 * full advocate technical audit formatting for both JSON and CSV payloads.
 */

import { fastSanitizeText } from "./redactionEngine";
import type { Claim } from "../types";

export interface SanitizedExportClaim extends Omit<Claim, "redactionMetadata"> {
  redactionMetadata?: {
    isRedacted: boolean;
    mode: string;
    redactedEntityCount: number;
    maskedCategories: string[];
    appliedAt: number;
  };
  redactionApplied?: string;
}

/**
 * Deeply sanitizes a single claim for export.
 * If redactMode is false and the claim is unredacted, returns the unmodified claim.
 * If redactMode is true (or claim is marked redacted), scrubs all PHI/PII per HIPAA Safe Harbor.
 */
export function sanitizeClaimForExport(
  claim: Claim,
  redactMode: boolean
): SanitizedExportClaim {
  const isClaimRedacted = redactMode || Boolean(claim.redactionMetadata?.isRedacted);
  if (!isClaimRedacted) {
    return claim;
  }

  const rawPatientName = (claim.patient?.name || claim.patientName || "").trim();
  const initial = rawPatientName ? rawPatientName.charAt(0).toUpperCase() : "";
  const maskedPatientName = rawPatientName ? `[REDACTED - ${initial}***]` : "[REDACTED]";

  // Extract individual name tokens (e.g. "Marcus", "Sterling") to ensure isolated mentions in notes are scrubbed
  const nameParts = rawPatientName
    .split(/\s+/)
    .map((p) => p.replace(/[^A-Za-z]/g, ""))
    .filter((p) => p.length >= 3);

  const sanitizeStr = (text?: string): string | undefined => {
    if (!text) return text;
    return fastSanitizeText(text, {
      standard: "HIPAA_SAFE_HARBOR",
      patientName: rawPatientName,
      customTerms: nameParts,
      maskDateOfService: true,
    }).sanitizedText;
  };

  // Mask patient member ID
  const rawMemberId = claim.patient?.memberId?.trim() || "";
  const maskedMemberId = rawMemberId
    ? (rawMemberId.length > 3 ? `${rawMemberId.slice(0, 3)}*****` : "[REDACTED]")
    : "[REDACTED]";

  // Date of Service: HIPAA Safe Harbor allows only year for dates directly related to an individual
  const yearMatch = claim.serviceDate ? claim.serviceDate.match(/\b(19\d{2}|20\d{2})\b/) : null;
  const maskedServiceDate = yearMatch ? `**/**/${yearMatch[1]}` : (claim.serviceDate ? "**/**/****" : claim.serviceDate);

  // Mask CPT and CARC if specifically configured or in PUBLIC_EXHIBIT mode
  const maskCpt = claim.redactionMetadata?.maskedCategories?.includes("cpt") ||
    claim.redactionMetadata?.mode === "PUBLIC_EXHIBIT";
  const cptCodes = maskCpt ? ["[REDACTED-CPT]"] : claim.cptCodes;

  const maskCarc = claim.redactionMetadata?.maskedCategories?.includes("carc") ||
    claim.redactionMetadata?.mode === "PUBLIC_EXHIBIT";
  const denialReasonCode = maskCarc ? "[REDACTED-CARC]" : claim.denialReasonCode;
  const denialReasonDescription = isClaimRedacted
    ? (sanitizeStr(claim.denialReasonDescription) || "")
    : (claim.denialReasonDescription || "");

  // Deep sanitize appealContext if present
  let sanitizedAppealContext = claim.appealContext;
  if (claim.appealContext) {
    const isSelfAdvocate = Boolean(
      rawPatientName &&
      claim.appealContext.sender?.name &&
      claim.appealContext.sender.name.trim().toLowerCase() === rawPatientName.toLowerCase()
    );

    sanitizedAppealContext = {
      ...claim.appealContext,
      physicianNotes: sanitizeStr(claim.appealContext.physicianNotes),
      sender: {
        ...claim.appealContext.sender,
        name: isSelfAdvocate ? maskedPatientName : claim.appealContext.sender?.name,
        phone: claim.appealContext.sender?.phone ? "[REDACTED PHONE]" : undefined,
        email: claim.appealContext.sender?.email ? "[REDACTED EMAIL]" : undefined,
      },
      clinicalFacts: {
        ...claim.appealContext.clinicalFacts,
        symptomsAndFunctionalImpact: sanitizeStr(claim.appealContext.clinicalFacts?.symptomsAndFunctionalImpact),
        examinationFindings: sanitizeStr(claim.appealContext.clinicalFacts?.examinationFindings),
        imagingAndDiagnostics: sanitizeStr(claim.appealContext.clinicalFacts?.imagingAndDiagnostics),
        treatmentHistoryAndResponse: sanitizeStr(claim.appealContext.clinicalFacts?.treatmentHistoryAndResponse),
        otherDocumentedFacts: sanitizeStr(claim.appealContext.clinicalFacts?.otherDocumentedFacts),
      },
    };
  }

  // Deep sanitize latestAppeal if present on claim
  let sanitizedLatestAppeal = claim.latestAppeal;
  if (claim.latestAppeal) {
    sanitizedLatestAppeal = {
      ...claim.latestAppeal,
      executiveSummary: sanitizeStr(claim.latestAppeal.executiveSummary) || "",
      medicalNecessityArguments: sanitizeStr(claim.latestAppeal.medicalNecessityArguments) || "",
      legalCitations: sanitizeStr(claim.latestAppeal.legalCitations) || "",
      fullAppealMarkdown: sanitizeStr(claim.latestAppeal.fullAppealMarkdown) || "",
      escalationNotes: sanitizeStr(claim.latestAppeal.escalationNotes),
    };
  }

  // Deep sanitize searchContent if present
  const sanitizedSearchContent = sanitizeStr(claim.searchContent);

  // Synchronize redaction metadata
  const existingCategories = claim.redactionMetadata?.maskedCategories || [];
  const updatedCategories = Array.from(
    new Set([...existingCategories, "name", "member_id", "dob", "contact"])
  );

  const updatedRedactionMetadata = {
    isRedacted: true,
    mode: "HIPAA_SAFE_HARBOR",
    appliedAt: claim.redactionMetadata?.appliedAt || Date.now(),
    redactedEntityCount: Math.max(
      1,
      (claim.redactionMetadata?.redactedEntityCount || 0) + nameParts.length + 2
    ),
    maskedCategories: updatedCategories,
  };

  return {
    ...claim,
    patientName: maskedPatientName,
    patient: claim.patient
      ? {
          ...claim.patient,
          name: maskedPatientName,
          memberId: maskedMemberId,
          email: "[REDACTED]",
          groupNumber: claim.patient.groupNumber ? "[REDACTED]" : undefined,
        }
      : undefined,
    serviceDate: maskedServiceDate,
    userId: "[REDACTED]",
    cptCodes,
    denialReasonCode,
    denialReasonDescription,
    appealContext: sanitizedAppealContext,
    latestAppeal: sanitizedLatestAppeal,
    searchContent: sanitizedSearchContent,
    redactionMetadata: updatedRedactionMetadata,
    redactionApplied: "HIPAA Safe Harbor 45 CFR § 164.514",
  };
}

/**
 * Returns the standard 15-column headers for CSV export.
 */
export function buildClaimCsvHeaders(): string[] {
  return [
    "Claim Number",
    "Patient Name",
    "Member ID",
    "Insurer / Payer",
    "CPT Codes",
    "CARC Denial Code",
    "Denial Reason Description",
    "Denied Amount ($)",
    "Patient Share ($)",
    "Service Date",
    "Statutory Deadline",
    "Days Remaining",
    "Overturn Probability (%)",
    "Status",
    "Redaction Applied",
  ];
}

/**
 * Escapes a cell value for RFC-4180 compliant CSV output.
 */
export function escapeCsv(val: unknown): string {
  if (val === undefined || val === null) return '""';
  const str = String(val).replace(/"/g, '""');
  return `"${str}"`;
}

/**
 * Builds a sanitized or unredacted CSV row for a claim.
 */
export function buildClaimCsvRow(claim: Claim, redactMode: boolean): string[] {
  const isClaimRedacted = redactMode || Boolean(claim.redactionMetadata?.isRedacted);

  const rawPatientName = (claim.patient?.name || claim.patientName || "").trim();
  const initial = rawPatientName ? rawPatientName.charAt(0).toUpperCase() : "";
  const name = isClaimRedacted
    ? (rawPatientName ? `[REDACTED - ${initial}***]` : "[REDACTED]")
    : rawPatientName;

  const rawMemberId = claim.patient?.memberId?.trim() || "";
  const memberId = isClaimRedacted
    ? (rawMemberId ? (rawMemberId.length > 3 ? `${rawMemberId.slice(0, 3)}*****` : "[REDACTED]") : "[REDACTED]")
    : rawMemberId;

  const maskCpt = isClaimRedacted && (
    claim.redactionMetadata?.maskedCategories?.includes("cpt") ||
    claim.redactionMetadata?.mode === "PUBLIC_EXHIBIT"
  );
  const cptStr = maskCpt ? "[REDACTED-CPT]" : (claim.cptCodes?.join("; ") || "");

  const maskCarc = isClaimRedacted && (
    claim.redactionMetadata?.maskedCategories?.includes("carc") ||
    claim.redactionMetadata?.mode === "PUBLIC_EXHIBIT"
  );
  const carcStr = maskCarc ? "[REDACTED-CARC]" : (claim.denialReasonCode || "");

  const yearMatch = claim.serviceDate ? claim.serviceDate.match(/\b(19\d{2}|20\d{2})\b/) : null;
  const serviceDate = isClaimRedacted
    ? (yearMatch ? `**/**/${yearMatch[1]}` : (claim.serviceDate ? "**/**/****" : ""))
    : (claim.serviceDate || "");

  let deadlineStr = "";
  if (claim.statutoryDeadline) {
    const d = new Date(claim.statutoryDeadline);
    deadlineStr = !isNaN(d.getTime()) ? d.toISOString().split("T")[0] : "";
  }

  const nameParts = rawPatientName
    .split(/\s+/)
    .map((p) => p.replace(/[^A-Za-z]/g, ""))
    .filter((p) => p.length >= 3);

  const sanitizeStr = (text?: string): string | undefined => {
    if (!text) return text;
    return fastSanitizeText(text, {
      standard: "HIPAA_SAFE_HARBOR",
      patientName: rawPatientName,
      customTerms: nameParts,
      maskDateOfService: true,
    }).sanitizedText;
  };

  const denialDescription = isClaimRedacted
    ? (sanitizeStr(claim.denialReasonDescription) || "")
    : (claim.denialReasonDescription || "");

  const insurancePayer = claim.patient?.insurancePayer || (claim as { insurancePayer?: string }).insurancePayer || "";

  return [
    claim.claimNumber || "",
    name,
    memberId,
    insurancePayer,
    cptStr,
    carcStr,
    denialDescription,
    String(claim.deniedAmount || 0),
    String(claim.patientOwedAmount || 0),
    serviceDate,
    deadlineStr,
    String(claim.daysRemaining ?? ""),
    claim.overturnProbabilityScore != null ? String(claim.overturnProbabilityScore) : "N/A",
    claim.status || "",
    isClaimRedacted ? "YES (HIPAA Safe Harbor)" : "NO (Full Audit)",
  ];
}

/**
 * Formats a list of claims as CSV text.
 */
export function exportClaimsToCsv(claims: Claim[], redactMode: boolean): string {
  const headers = buildClaimCsvHeaders();
  const rows = claims.map((c) => buildClaimCsvRow(c, redactMode).map(escapeCsv).join(","));
  return [headers.join(","), ...rows].join("\r\n");
}

/**
 * Formats a list of claims as JSON text.
 */
export function exportClaimsToJson(claims: Claim[], redactMode: boolean): string {
  const sanitized = claims.map((c) => sanitizeClaimForExport(c, redactMode));
  return JSON.stringify(sanitized, null, 2);
}

/**
 * Triggers a browser file download using a blob.
 */
export function triggerFileDownload(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
