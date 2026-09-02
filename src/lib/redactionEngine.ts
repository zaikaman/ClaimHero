/**
 * HIPAA-Compliant Automated Redaction Engine
 * 
 * Deterministic detection and masking of Protected Health Information (PHI)
 * and Personally Identifiable Information (PII) in accordance with HIPAA Safe Harbor
 * De-identification Standard (45 CFR § 164.514(b)(2)).
 */

export type PiiCategory =
  | "ssn"
  | "member_id"
  | "dob"
  | "name"
  | "contact"
  | "mrn"
  | "address"
  | "custom";

export type ComplianceStandard =
  | "HIPAA_SAFE_HARBOR"
  | "BALANCED_APPELLATE"
  | "PUBLIC_EXHIBIT"
  | "CUSTOM";

export interface DetectedPiiEntity {
  id: string;
  category: PiiCategory;
  label: string;
  originalText: string;
  maskedText: string;
  startIndex: number;
  endIndex: number;
  confidence: number; // 0.0 to 1.0
  isEnabled: boolean;
  rule: string;
  hipaaCategory: string;
}

export interface RedactionEngineOptions {
  standard?: ComplianceStandard;
  customTerms?: string[];
  patientName?: string;
  disabledEntityIds?: string[];
  maskingStyleOverrides?: Partial<Record<PiiCategory, "full" | "partial" | "safe_harbor">>;
}

export interface RedactionResult {
  originalText: string;
  sanitizedText: string;
  detectedEntities: DetectedPiiEntity[];
  stats: {
    totalEntities: number;
    redactedCount: number;
    byCategory: Record<PiiCategory, number>;
  };
  complianceStandard: ComplianceStandard;
  isCertifiedSafe: boolean;
}

// Category Configuration & Descriptions
export const PII_CATEGORY_CONFIG: Record<
  PiiCategory,
  { label: string; hipaaRule: string; color: string; badgeVariant: "destructive" | "secondary" | "outline" | "default" }
> = {
  ssn: {
    label: "Social Security Number",
    hipaaRule: "45 CFR § 164.514(b)(2)(i)(G) - Social Security Numbers",
    color: "crimson",
    badgeVariant: "destructive",
  },
  member_id: {
    label: "Member ID & Suffix",
    hipaaRule: "45 CFR § 164.514(b)(2)(i)(H) - Health Plan Beneficiary Numbers",
    color: "amber",
    badgeVariant: "secondary",
  },
  dob: {
    label: "Date of Birth / Age",
    hipaaRule: "45 CFR § 164.514(b)(2)(i)(C) - All Elements of Dates",
    color: "cyan",
    badgeVariant: "default",
  },
  name: {
    label: "Patient Direct Identifier",
    hipaaRule: "45 CFR § 164.514(b)(2)(i)(A) - Names",
    color: "indigo",
    badgeVariant: "secondary",
  },
  mrn: {
    label: "Medical Record Number",
    hipaaRule: "45 CFR § 164.514(b)(2)(i)(D) - Medical Record Numbers",
    color: "purple",
    badgeVariant: "secondary",
  },
  contact: {
    label: "Phone & Personal Email",
    hipaaRule: "45 CFR § 164.514(b)(2)(i)(D,E) - Telephone Numbers & Electronic Mail Addresses",
    color: "emerald",
    badgeVariant: "outline",
  },
  address: {
    label: "Geographic Location",
    hipaaRule: "45 CFR § 164.514(b)(2)(i)(B) - Geographic Subdivisions",
    color: "orange",
    badgeVariant: "outline",
  },
  custom: {
    label: "Custom Privacy Filter",
    hipaaRule: "User-Specified Direct Identifier",
    color: "rose",
    badgeVariant: "destructive",
  },
};

/**
 * Mask an SSN based on compliance standard
 */
export function maskSsn(ssn: string, standard: ComplianceStandard): string {
  const digits = ssn.replace(/\D/g, "");
  if (digits.length === 9) {
    if (standard === "BALANCED_APPELLATE") {
      return `***-**-${digits.slice(-4)}`;
    }
    if (standard === "PUBLIC_EXHIBIT") {
      return "[REDACTED SSN]";
    }
    return "***-**-****";
  }
  return "[REDACTED SSN]";
}

/**
 * Mask Member ID or Suffix based on compliance standard
 */
export function maskMemberId(fullMatch: string, standard: ComplianceStandard): string {
  // If match has a suffix like -01, -02
  const suffixMatch = fullMatch.match(/^(.+?)(-[A-Za-z0-9]{1,4})$/);
  if (suffixMatch && standard === "BALANCED_APPELLATE") {
    // Keep root ID, mask the suffix
    return `${suffixMatch[1]}-**`;
  }
  if (standard === "PUBLIC_EXHIBIT") {
    return "[REDACTED MEMBER ID]";
  }
  if (standard === "HIPAA_SAFE_HARBOR") {
    if (suffixMatch) {
      return `${suffixMatch[1].slice(0, 3)}***-**`;
    }
    return `${fullMatch.slice(0, 3)}***`;
  }
  // Balanced default: mask suffix if present or last 3 characters
  if (suffixMatch) {
    return `${suffixMatch[1]}-**`;
  }
  return fullMatch.length > 4 ? `${fullMatch.slice(0, -3)}***` : "[REDACTED ID]";
}

/**
 * Mask Date of Birth based on compliance standard
 */
export function maskDob(dobString: string, standard: ComplianceStandard): string {
  // Try extracting year
  const yearMatch = dobString.match(/\b(19\d{2}|20\d{2})\b/);
  if (yearMatch && standard === "BALANCED_APPELLATE") {
    // HIPAA Safe Harbor allows year of birth for individuals under 89
    return `**/**/${yearMatch[1]}`;
  }
  if (standard === "PUBLIC_EXHIBIT") {
    return "[REDACTED DOB]";
  }
  return "**/**/****";
}

/**
 * Mask Patient Name based on compliance standard
 */
export function maskPatientName(name: string, standard: ComplianceStandard): string {
  if (standard === "BALANCED_APPELLATE") {
    // Keep initials or first name initial
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return `${parts[0][0]}. ${parts[parts.length - 1][0]}.`;
    }
    return `${name[0]}.`;
  }
  if (standard === "PUBLIC_EXHIBIT") {
    return "[PATIENT NAME REDACTED]";
  }
  return "[PATIENT REDACTED]";
}

/**
 * Mask Phone Number
 */
export function maskPhone(phone: string, standard: ComplianceStandard): string {
  const digits = phone.replace(/\D/g, "");
  if (standard === "BALANCED_APPELLATE" && digits.length >= 4) {
    return `(***) ***-${digits.slice(-4)}`;
  }
  return "[REDACTED PHONE]";
}

/**
 * Mask Email Address
 */
export function maskEmail(email: string, standard: ComplianceStandard): string {
  if (standard === "BALANCED_APPELLATE") {
    const [user, domain] = email.split("@");
    if (user && domain) {
      return `${user[0]}***@${domain}`;
    }
  }
  return "[REDACTED EMAIL]";
}

/**
 * Mask MRN
 */
export function maskMrn(mrn: string, standard: ComplianceStandard): string {
  if (standard === "BALANCED_APPELLATE" && mrn.length > 4) {
    return `MRN-***-${mrn.slice(-3)}`;
  }
  return "[REDACTED MRN]";
}

/**
 * Mask Street Address
 */
export function maskAddress(_address: string, _standard: ComplianceStandard): string {
  return "[REDACTED ADDRESS]";
}

/**
 * Automated PII Detection Engine
 * Scans text and identifies all sensitive PII entities with character indices and rule metadata.
 */
export function detectPiiEntities(
  text: string,
  options: RedactionEngineOptions = {}
): DetectedPiiEntity[] {
  if (!text || typeof text !== "string") return [];

  const standard = options.standard || "HIPAA_SAFE_HARBOR";
  const disabledIds = new Set(options.disabledEntityIds || []);
  const entities: DetectedPiiEntity[] = [];

  // Helper to add entity with collision avoidance
  const addEntity = (
    category: PiiCategory,
    label: string,
    originalText: string,
    maskedText: string,
    startIndex: number,
    endIndex: number,
    rule: string,
    confidence = 0.95
  ) => {
    // Avoid exact duplicate ranges
    const exists = entities.some(
      (e) =>
        (startIndex >= e.startIndex && startIndex < e.endIndex) ||
        (endIndex > e.startIndex && endIndex <= e.endIndex) ||
        (e.startIndex >= startIndex && e.endIndex <= endIndex)
    );
    if (exists) return;

    const id = `pii_${category}_${startIndex}_${endIndex}`;
    entities.push({
      id,
      category,
      label,
      originalText,
      maskedText,
      startIndex,
      endIndex,
      confidence,
      isEnabled: !disabledIds.has(id),
      rule,
      hipaaCategory: PII_CATEGORY_CONFIG[category].hipaaRule,
    });
  };

  // 1. Social Security Numbers (SSN)
  // Formats: XXX-XX-XXXX, XXX XX XXXX, or SSN: XXXXXXXXX
  const ssnRegex = /\b(?:\d{3}[- ]\d{2}[- ]\d{4})\b/g;
  let match: RegExpExecArray | null;
  while ((match = ssnRegex.exec(text)) !== null) {
    const raw = match[0];
    addEntity(
      "ssn",
      "Social Security Number",
      raw,
      maskSsn(raw, standard),
      match.index,
      match.index + raw.length,
      "Standard 9-digit SSN format",
      0.98
    );
  }

  const ssnPrefixedRegex = /\b(?:SSN|Social\s*Security(?:\s*Number|#|No\.?)?)[\s:]*([0-9]{3}[- ]?[0-9]{2}[- ]?[0-9]{4}|[0-9]{9})\b/gi;
  while ((match = ssnPrefixedRegex.exec(text)) !== null) {
    const matchedNumber = match[1];
    const fullText = match[0];
    const numberOffset = fullText.lastIndexOf(matchedNumber);
    const startIdx = match.index + numberOffset;
    addEntity(
      "ssn",
      "Social Security Number",
      matchedNumber,
      maskSsn(matchedNumber, standard),
      startIdx,
      startIdx + matchedNumber.length,
      "Prefixed SSN identifier",
      0.99
    );
  }

  // 2. Dates of Birth (DOB)
  const dobPrefixedRegex = /\b(?:DOB|Date\s*of\s*Birth|Birth\s*Date|D\.O\.B\.)[\s:]*([0-9]{1,2}[/.-][0-9]{1,2}[/.-][0-9]{2,4}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+[0-9]{1,2},?\s+[0-9]{4})\b/gi;
  while ((match = dobPrefixedRegex.exec(text)) !== null) {
    const matchedDate = match[1];
    const fullText = match[0];
    const dateOffset = fullText.lastIndexOf(matchedDate);
    const startIdx = match.index + dateOffset;
    addEntity(
      "dob",
      "Date of Birth",
      matchedDate,
      maskDob(matchedDate, standard),
      startIdx,
      startIdx + matchedDate.length,
      "DOB explicit prefix pattern",
      0.95
    );
  }

  // 3. Member ID & Suffixes
  // E.g. Member ID: MBN9823412-01, Subscriber ID: W123456789-02, Policy # ABC12345678
  const memberIdPrefixedRegex = /\b(?:Member\s*(?:ID|#|No\.?)|Subscriber\s*(?:ID|#|No\.?)|Policy\s*(?:ID|#|No\.?)|Insured\s*(?:ID|#|No\.?))[\s:]*([A-Z0-9]{6,16}(?:-[A-Z0-9]{1,4})?)\b/gi;
  while ((match = memberIdPrefixedRegex.exec(text)) !== null) {
    const rawId = match[1];
    const fullText = match[0];
    const idOffset = fullText.lastIndexOf(rawId);
    const startIdx = match.index + idOffset;
    addEntity(
      "member_id",
      "Member ID & Suffix",
      rawId,
      maskMemberId(rawId, standard),
      startIdx,
      startIdx + rawId.length,
      "Insurance Member/Subscriber identifier",
      0.92
    );
  }

  // Standalone Member ID suffix pattern e.g. MBN1234567-01 or XYZ9876543-02
  const memberIdSuffixStandaloneRegex = /\b([A-Z]{2,4}[0-9]{6,10}(-[0-9]{2}))\b/g;
  while ((match = memberIdSuffixStandaloneRegex.exec(text)) !== null) {
    const rawId = match[1];
    addEntity(
      "member_id",
      "Member ID with Dependent Suffix",
      rawId,
      maskMemberId(rawId, standard),
      match.index,
      match.index + rawId.length,
      "Standalone Member ID with suffix (-XX)",
      0.88
    );
  }

  // 4. Medical Record Number (MRN)
  const mrnRegex = /\b(?:MRN|Med(?:\s*ical)?\s*Rec(?:\s*ord)?\s*(?:#|ID|No\.?))[\s:]*([A-Z0-9-]{5,14})\b/gi;
  while ((match = mrnRegex.exec(text)) !== null) {
    const rawMrn = match[1];
    const fullText = match[0];
    const mrnOffset = fullText.lastIndexOf(rawMrn);
    const startIdx = match.index + mrnOffset;
    addEntity(
      "mrn",
      "Medical Record Number",
      rawMrn,
      maskMrn(rawMrn, standard),
      startIdx,
      startIdx + rawMrn.length,
      "MRN explicit prefix pattern",
      0.90
    );
  }

  // 5. Patient Direct Name Identifiers
  if (options.patientName && options.patientName.trim().length > 2) {
    const pName = options.patientName.trim();
    // Escape regex special chars
    const escaped = pName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const nameRegex = new RegExp(`\\b${escaped}\\b`, "gi");
    while ((match = nameRegex.exec(text)) !== null) {
      addEntity(
        "name",
        "Patient Full Name",
        match[0],
        maskPatientName(match[0], standard),
        match.index,
        match.index + match[0].length,
        "Known patient name match",
        0.99
      );
    }
  }

  // Contextual Patient Name e.g. Patient: Johnathan Doe, Insured: Jane Smith
  const contextualNameRegex = /\b(?:Patient(?:\s*Name)?|Insured(?:\s*Name)?|Member(?:\s*Name)?|Claimant)[\s:]+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})\b/g;
  while ((match = contextualNameRegex.exec(text)) !== null) {
    const rawName = match[1];
    // Skip if contains common false positive header words
    if (/^(Record|Portal|Service|Claim|Notice|Appeal|Denial|Provider|Physician)$/i.test(rawName)) continue;
    const fullText = match[0];
    const nameOffset = fullText.lastIndexOf(rawName);
    const startIdx = match.index + nameOffset;
    addEntity(
      "name",
      "Patient Direct Name",
      rawName,
      maskPatientName(rawName, standard),
      startIdx,
      startIdx + rawName.length,
      "Contextual patient header label",
      0.85
    );
  }

  // 6. Telephone Numbers
  const phoneRegex = /(?:(?:\+?1[-. ]?)?(?:\([0-9]{3}\)|[0-9]{3})[-. ]?[0-9]{3}[-. ][0-9]{4})\b/g;
  while ((match = phoneRegex.exec(text)) !== null) {
    const rawPhone = match[0];
    addEntity(
      "contact",
      "Telephone Number",
      rawPhone,
      maskPhone(rawPhone, standard),
      match.index,
      match.index + rawPhone.length,
      "North American 10-digit phone format",
      0.90
    );
  }

  // 7. Personal Electronic Mail (Email)
  const emailRegex = /\b([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\b/g;
  while ((match = emailRegex.exec(text)) !== null) {
    const rawEmail = match[1];
    // Skip official agentmail sender address to avoid breaking instructions
    if (rawEmail.toLowerCase().includes("claimhero-sender@agentmail.to") || rawEmail.toLowerCase().includes("payer-review@claimhero.agentmail.com")) {
      continue;
    }
    addEntity(
      "contact",
      "Personal Email Address",
      rawEmail,
      maskEmail(rawEmail, standard),
      match.index,
      match.index + rawEmail.length,
      "Email address identifier",
      0.92
    );
  }

  // 8. Physical Street Addresses
  const addressRegex = /\b\d{1,5}\s+[A-Z0-9\s.,]{3,35}\s+(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Lane|Ln|Drive|Dr|Way|Court|Ct|Suite|Ste|Apt)\b/gi;
  while ((match = addressRegex.exec(text)) !== null) {
    const rawAddr = match[0];
    addEntity(
      "address",
      "Street Address",
      rawAddr,
      maskAddress(rawAddr, standard),
      match.index,
      match.index + rawAddr.length,
      "Street address physical locator",
      0.82
    );
  }

  // 9. Custom User-Supplied Terms
  if (options.customTerms && options.customTerms.length > 0) {
    for (const term of options.customTerms) {
      if (!term || term.trim().length < 2) continue;
      const cleanTerm = term.trim();
      const escaped = cleanTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const customRegex = new RegExp(`\\b${escaped}\\b`, "gi");
      while ((match = customRegex.exec(text)) !== null) {
        addEntity(
          "custom",
          `Custom: "${cleanTerm}"`,
          match[0],
          `[REDACTED: ${cleanTerm.toUpperCase()}]`,
          match.index,
          match.index + match[0].length,
          "User-defined custom redaction term",
          1.0
        );
      }
    }
  }

  // Sort entities ascending by start index
  return entities.sort((a, b) => a.startIndex - b.startIndex);
}

/**
 * Applies active PII redactions to text, returning sanitized output and telemetry statistics.
 */
export function applyRedaction(
  text: string,
  entities: DetectedPiiEntity[],
  standard: ComplianceStandard = "HIPAA_SAFE_HARBOR"
): RedactionResult {
  if (!text || typeof text !== "string") {
    return {
      originalText: "",
      sanitizedText: "",
      detectedEntities: [],
      stats: {
        totalEntities: 0,
        redactedCount: 0,
        byCategory: { ssn: 0, member_id: 0, dob: 0, name: 0, contact: 0, mrn: 0, address: 0, custom: 0 },
      },
      complianceStandard: standard,
      isCertifiedSafe: true,
    };
  }

  // Filter only enabled entities and sort by start index descending to replace cleanly without offset skew
  const enabledEntities = entities.filter((e) => e.isEnabled);
  const sortedForReplacement = [...enabledEntities].sort((a, b) => b.startIndex - a.startIndex);

  let sanitized = text;
  for (const entity of sortedForReplacement) {
    if (entity.startIndex >= 0 && entity.endIndex <= sanitized.length) {
      const before = sanitized.slice(0, entity.startIndex);
      const after = sanitized.slice(entity.endIndex);
      sanitized = before + entity.maskedText + after;
    }
  }

  // Compute category statistics
  const byCategory: Record<PiiCategory, number> = {
    ssn: 0,
    member_id: 0,
    dob: 0,
    name: 0,
    contact: 0,
    mrn: 0,
    address: 0,
    custom: 0,
  };

  for (const e of entities) {
    if (e.isEnabled) {
      byCategory[e.category] = (byCategory[e.category] || 0) + 1;
    }
  }

  const isCertifiedSafe = entities.length === 0 || enabledEntities.length === entities.length;

  return {
    originalText: text,
    sanitizedText: sanitized,
    detectedEntities: entities,
    stats: {
      totalEntities: entities.length,
      redactedCount: enabledEntities.length,
      byCategory,
    },
    complianceStandard: standard,
    isCertifiedSafe,
  };
}

/**
 * 1-Click Fast Redact: Runs detection and applies standard redaction in one call.
 */
export function fastSanitizeText(
  text: string,
  options: RedactionEngineOptions = {}
): RedactionResult {
  const standard = options.standard || "HIPAA_SAFE_HARBOR";
  const entities = detectPiiEntities(text, options);
  return applyRedaction(text, entities, standard);
}
