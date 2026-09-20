/**
 * HIPAA-Compliant Automated Redaction Engine (Client Mirror)
 *
 * Client-side mirror of `convex/lib/redactionEngine.ts`: identical detection
 * and masking semantics so in-browser de-identification matches the server
 * gate. Keep the two files in sync when changing masking behavior.
 *
 * Deterministic detection and masking of Protected Health Information (PHI)
 * and Personally Identifiable Information (PII) in accordance with HIPAA Safe Harbor
 * De-identification Standard (45 CFR § 164.514(b)(2)).
 *
 * Trust model (read before changing masking behavior):
 * - TRUSTED for PHI (may hold real identifiers): Convex database, Convex
 *   actions/mutations, AWS Textract under the HIPAA BAA, in-browser client
 *   vault, and final payer correspondence assembled deterministically in code
 *   from vaulted claim fields (`convex/lib/phiSafe.ts`,
 *   `assembleProfessionalAppealEmail`).
 * - UNTRUSTED for PHI (no BAA assumed): OpenAI chat/completion/embedding
 *   endpoints, Firecrawl LLM extraction, `@convex-dev/agent` thread history,
 *   public exhibits, and exported CSV/JSON shared outside the deployment.
 *
 * Hardening notes (fail-closed):
 * - All masking styles resolve to full Safe Harbor placeholders. Historic
 *   BALANCED_APPELLATE partial preservation (SSN last-4, birth year, initials,
 *   email prefix, phone last-4, MRN last-3, member root) was removed because
 *   those quasi-identifiers re-identify in combination and the mode is used on
 *   brief-ingest paths whose output feeds LLM prompts. BALANCED_APPELLATE is
 *   retained as a backward-compatible alias that behaves like
 *   HIPAA_SAFE_HARBOR; payer-ready routing data always comes from vaulted
 *   claim fields, never from redacted text.
 * - `redactBeforeLLM` always forces HIPAA_SAFE_HARBOR with DOS masking on,
 *   because LLM egress is untrusted. Date of Service is preserved ONLY in
 *   operational `fastSanitizeText`/`detectPiiEntities` calls (payer routing
 *   needs authentic DOS) and is explicitly masked for LLM, exports, and
 *   PUBLIC_EXHIBIT.
 * - `isCertifiedSafe` is true ONLY for HIPAA_SAFE_HARBOR / BALANCED_APPELLATE /
 *   PUBLIC_EXHIBIT with every detected entity enabled, no preserve/override
 *   flags, and no CUSTOM standard. `warnings` always explains residual risk
 *   (regex false negatives, preserved DOS, heuristic name candidates).
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
  preservePatientName?: boolean;
  maskDateOfService?: boolean;
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
  warnings: string[];
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
 * Mask an SSN. Every standard fully redacts: even the last-4 is a HIPAA
 * identifier and a quasi-identifier in combination (birth year + initials +
 * email domain), so BALANCED_APPELLATE no longer preserves it.
 */
export function maskSsn(ssn: string, standard: ComplianceStandard): string {
  const digits = ssn.replace(/\D/g, "");
  if (digits.length === 9) {
    if (standard === "PUBLIC_EXHIBIT") {
      return "[REDACTED SSN]";
    }
    return "***-**-****";
  }
  return "[REDACTED SSN]";
}

/**
 * Mask Member ID / Group Number. Every standard fully redacts: preserving a
 * root prefix or suffix leaks a health-plan beneficiary number fragment, so
 * BALANCED_APPELLATE, HIPAA_SAFE_HARBOR, and CUSTOM all return the full
 * placeholder. Payer routing uses vaulted claim fields, never redacted text.
 */
export function maskMemberId(_fullMatch: string, standard: ComplianceStandard): string {
  if (standard === "PUBLIC_EXHIBIT") {
    return "[REDACTED MEMBER ID]";
  }
  return "[REDACTED MEMBER ID]";
}

/**
 * Mask Date of Birth / calendar dates. HIPAA Safe Harbor permits the year but
 * requires removal of month/day and all other date elements, so HIPAA and
 * BALANCED preserve only the year (policy-timeline utility) while PUBLIC
 * fully redacts. A bare year alone is low risk once SSN fragments, initials,
 * and email prefixes are all fully redacted.
 */
export function maskDob(dobString: string, standard: ComplianceStandard): string {
  if (standard === "PUBLIC_EXHIBIT") {
    return "[REDACTED DOB]";
  }
  const yearMatch = dobString.match(/\b((?:19|20)\d{2})\b/);
  if (yearMatch) {
    return `**/**/${yearMatch[1]}`;
  }
  return "**/**/****";
}

/**
 * Mask Patient Name. Every standard fully redacts: initials re-identify in
 * combination with birth year / ZIP / dates, so BALANCED_APPELLATE no longer
 * returns "J. T." style initials.
 */
export function maskPatientName(_name: string, standard: ComplianceStandard): string {
  if (standard === "PUBLIC_EXHIBIT") {
    return "[PATIENT NAME REDACTED]";
  }
  return "[PATIENT REDACTED]";
}

/**
 * Mask Phone Number. Every standard fully redacts (last-4 removed).
 */
export function maskPhone(_phone: string, _standard: ComplianceStandard): string {
  return "[REDACTED PHONE]";
}

/**
 * Mask Email Address. Every standard fully redacts (first-letter + domain
 * prefix removed).
 */
export function maskEmail(_email: string, _standard: ComplianceStandard): string {
  return "[REDACTED EMAIL]";
}

/**
 * Mask MRN. Every standard fully redacts (trailing-digit preservation removed).
 */
export function maskMrn(_mrn: string, _standard: ComplianceStandard): string {
  return "[REDACTED MRN]";
}

/**
 * Mask Street Address
 */
export function maskAddress(_address: string, _standard: ComplianceStandard): string {
  return "[REDACTED ADDRESS]";
}

/**
 * Validate a bare 9-digit run as a plausible SSN (area/group/serial rules).
 * Rejects NNNs that can never be issued (000 / 666 / 900-999 areas, 00 group,
 * 0000 serial) to avoid redacting adjacent clinical codes. Fails closed: any
 * 9-digit run that passes validation is treated as an SSN candidate.
 */
export function isPlausibleSsnDigits(digits9: string): boolean {
  if (!/^\d{9}$/.test(digits9)) return false;
  const area = Number(digits9.slice(0, 3));
  const group = digits9.slice(3, 5);
  const serial = digits9.slice(5, 9);
  if (digits9.slice(0, 3) === "000") return false;
  if (digits9.slice(0, 3) === "666") return false;
  if (area >= 900 && area <= 999) return false;
  if (group === "00") return false;
  if (serial === "0000") return false;
  return true;
}

/**
 * Validate month/day/year ranges for bare calendar-date detection.
 */
function isPlausibleDateParts(month: number, day: number, year: number): boolean {
  if (!Number.isFinite(month) || !Number.isFinite(day) || !Number.isFinite(year)) return false;
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;
  if (year >= 100) {
    if (year < 1900 || year > 2099) return false;
  } else {
    if (year < 0 || year > 99) return false;
  }
  return true;
}

const MONTH_NAME_PATTERN = "(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*";
// Ordinal day suffixes as written in prose ("May 14th 1978", "Oct 24th, 1965").
const ORDINAL_DAY_SUFFIX = "(?:st|nd|rd|th)?";

/**
 * Non-name vocabulary for the free-floating person-name heuristic. Any
 * candidate containing one of these words is skipped so clinical, facility,
 * payer, geographic, and calendar terms are not redacted as names. Person
 * first/last names must NEVER be added here.
 */
const NON_NAME_WORDS = new Set(
  [
    "january", "february", "march", "april", "may", "june", "july", "august",
    "september", "october", "november", "december",
    "jan", "feb", "mar", "apr", "jun", "jul", "aug", "sep", "sept", "oct", "nov", "dec",
    "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
    "mon", "tue", "wed", "thu", "fri", "sat", "sun",
    "patient", "clinical", "medical", "surgical", "surgery", "hospital", "clinic",
    "center", "memorial", "health", "insurance", "payer", "policy", "policies",
    "group", "service", "record", "records", "portal", "notice", "provider",
    "physician", "doctor", "treatment", "therapy", "rehabilitation", "rehab",
    "imaging", "radiology", "magnetic", "resonance", "emergency", "acute",
    "chronic", "severe", "moderate", "mild", "right", "left", "bilateral",
    "anterior", "posterior", "lateral", "medial", "superior", "inferior",
    "total", "knee", "hip", "spine", "lumbar", "cervical", "thoracic",
    "shoulder", "foot", "ankle", "hand", "wrist", "elbow", "joint", "bone",
    "cartilage", "meniscus", "ligament", "tendon", "muscle", "nerve", "disc",
    "vertebra", "arthroplasty", "arthroscopy", "meniscectomy", "laminectomy",
    "facetectomy", "decompression", "fusion", "replacement", "reconstruction",
    "repair", "operation", "procedure", "implant", "prosthesis", "diagnosis",
    "arthritis", "osteoarthritis", "diabetes", "hypertension", "radiculopathy",
    "herniation", "stenosis", "attending", "orthopedic", "metropolitan",
    "facility", "facilities", "conservative", "intra", "articular", "image",
    "guided", "corticosteroid", "injection", "meloxicam", "triamcinolone",
    "prescription", "pharmacotherapy", "dose", "doses", "discharge", "admission",
    "consultation", "attestation", "neurosurgeon", "surgeon",
    "claim", "claims", "denial", "denials", "appeal", "appeals", "grievance",
    "grievances", "review", "reviews", "determination", "letter", "letters",
    "bulletin", "bulletins", "coverage", "criteria", "evidence", "exhibit",
    "exhibits", "docket", "filing", "statutory", "level", "levels", "internal",
    "external", "committee", "panel", "department", "office", "team",
    "coordinator", "advocate", "manager", "director", "benefits", "explanation",
    "adverse", "formal", "petition", "complaint", "enforcement", "disclosure",
    "deadline", "timelines", "timeline", "rights", "summary", "memo",
    "memorandum", "binder", "packet", "draft", "version", "status", "score",
    "cigna", "aetna", "united", "humana", "kaiser", "molina", "bluecross",
    "anthem", "optum", "geoblue", "globalcore", "medicare", "medicaid",
    "street", "avenue", "road", "boulevard", "lane", "drive", "way", "court",
    "suite", "terrace", "parkway", "circle", "place", "springfield",
    "evergreen", "claimhero", "supplemental", "standard", "national",
    "practice", "guideline", "guidelines", "peer", "board", "certified",
    "specialist", "treating", "responsible", "available", "provided",
    "submitted", "attached", "verified", "active", "retrospective", "visual",
    "proof", "archive", "independent", "binding", "prompt", "additional",
    "original", "published", "federal", "state", "united", "states",
    "grade", "stage", "scale", "score", "class", "type", "criteria",
  ].map((w) => w.toLowerCase())
);

/**
 * Automated PII Detection Engine
 * Scans text and identifies all sensitive PII entities with character indices and rule metadata.
 *
 * Coverage (fail-closed):
 * - SSN: dashed/dotted/spaced XXX-XX-XXXX, SSN-prefixed 9-digit, AND bare
 *   9-digit runs passing area/group/serial validation.
 * - Dates: DOB-prefixed dates, DOS-prefixed dates (masked only when
 *   maskDateOfService or PUBLIC_EXHIBIT), AND bare calendar dates
 *   (MM/DD/YYYY, YYYY-MM-DD, Month D YYYY) which Safe Harbor requires
 *   redacting. Bare dates overlapping an explicitly labeled DOS phrase are
 *   preserved only when DOS preservation is active; otherwise they redact.
 * - Member/Group IDs: prefixed (Member/Subscriber/Policy/Insured/Group) with
 *   multi-segment dash support, AND standalone LETTER+DIGIT patterns with an
 *   optional dependent suffix (suffix no longer required).
 * - Names: known full patientName, known name components (first/surname-only
 *   mentions), contextual Patient:/Insured:/Member:/Claimant: labels, AND a
 *   low-confidence free-floating person-name heuristic (documented
 *   over-match risk on facility/clinical terms).
 */
export function detectPiiEntities(
  text: string,
  options: RedactionEngineOptions = {}
): DetectedPiiEntity[] {
  if (!text || typeof text !== "string") return [];

  const standard = options.standard || "HIPAA_SAFE_HARBOR";
  const disabledIds = new Set(options.disabledEntityIds || []);
  const entities: DetectedPiiEntity[] = [];

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

  const rangesOverlap = (
    aStart: number,
    aEnd: number,
    ranges: Array<{ start: number; end: number }>
  ): boolean => ranges.some((r) => aStart < r.end && aEnd > r.start);

  // 0. Pre-scan explicitly labeled Date-of-Service phrases. When DOS masking
  // is off these ranges are PROTECTED (payer routing needs authentic DOS);
  // bare-date detection must skip them so preservation actually holds.
  const dosProtectedRanges: Array<{ start: number; end: number }> = [];
  const dosScanRegex = new RegExp(
    `\\b(?:DOS|Date\\s*of\\s*Service|Service\\s*Date)[\\s:]*([0-9]{1,2}[/.-][0-9]{1,2}[/.-][0-9]{2,4}|${MONTH_NAME_PATTERN}\\s+[0-9]{1,2}${ORDINAL_DAY_SUFFIX},?\\s+[0-9]{4})\\b`,
    "gi"
  );
  let dosScanMatch: RegExpExecArray | null;
  while ((dosScanMatch = dosScanRegex.exec(text)) !== null) {
    const matchedDate = dosScanMatch[1];
    const fullText = dosScanMatch[0];
    const dateOffset = fullText.lastIndexOf(matchedDate);
    dosProtectedRanges.push({
      start: dosScanMatch.index + dateOffset,
      end: dosScanMatch.index + dateOffset + matchedDate.length,
    });
  }
  const dosMaskingActive = Boolean(options.maskDateOfService) || standard === "PUBLIC_EXHIBIT";

  // 1. Social Security Numbers (SSN)
  // Dashed/dotted/spaced 3-2-4 runs plus a spaced 3-3-3 variant people use
  // in prose ("123 456 789" validated like a bare 9-digit run below).
  const ssnRegex = /\b\d{3}[- .]\d{2}[- .]\d{4}\b/g;
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

  // 1b. Bare 9-digit SSN candidates (no dashes, no prefix). Guarded so the
  // run is standalone (not inside member IDs, phones, or longer numbers) and
  // validated against SSA area/group/serial issuance rules. The leading
  // `(?:^|[^...])` is a non-capturing pre-filter (lookbehind-free for legacy
  // Safari); group 1 stays the payload and offsets resolve via lastIndexOf.
  const bareSsnRegex = /(?:^|[^A-Za-z0-9])(\d{9})(?![A-Za-z0-9])/g;
  while ((match = bareSsnRegex.exec(text)) !== null) {
    const candidate = match[1];
    if (!isPlausibleSsnDigits(candidate)) continue;
    const fullText = match[0];
    const numberOffset = fullText.lastIndexOf(candidate);
    const startIdx = match.index + numberOffset;
    addEntity(
      "ssn",
      "Social Security Number",
      candidate,
      maskSsn(candidate, standard),
      startIdx,
      startIdx + candidate.length,
      "Bare 9-digit SSN candidate (area/group/serial validated)",
      0.8
    );
  }

  // 1c. Spaced 3-3-3 digit runs ("123 456 789"). Ambiguous with spaced
  // quantities, so the concatenated digits must pass SSN issuance rules and
  // confidence stays low.
  const spacedSsnRegex = /(?:^|[^A-Za-z0-9:])(\d{3}) (\d{3}) (\d{3})(?![A-Za-z0-9])/g;
  while ((match = spacedSsnRegex.exec(text)) !== null) {
    const candidate = `${match[1]}${match[2]}${match[3]}`;
    if (!isPlausibleSsnDigits(candidate)) continue;
    // match[0] may include one consumed boundary char; re-anchor to payload.
    const raw = `${match[1]} ${match[2]} ${match[3]}`;
    const startIdx = match.index + match[0].length - raw.length;
    addEntity(
      "ssn",
      "Social Security Number",
      raw,
      maskSsn(raw, standard),
      startIdx,
      startIdx + raw.length,
      "Spaced 3-3-3 SSN-shaped run (area/group/serial validated; verify)",
      0.7
    );
  }
  const dobPrefixedRegex = new RegExp(
    `\\b(?:DOB|Date\\s*of\\s*Birth|Birth\\s*Date|D\\.O\\.B\\.)[\\s:]*([0-9]{1,2}[/.-][0-9]{1,2}[/.-][0-9]{2,4}|${MONTH_NAME_PATTERN}\\s+[0-9]{1,2}${ORDINAL_DAY_SUFFIX},?\\s+[0-9]{4})\\b`,
    "gi"
  );
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

  // 2b. Dates of Service (DOS)
  // Date of Service is a core claim transaction attribute required by healthcare insurers to identify,
  // adjudicate, and reprocess claims. Redacting DOS in live operations or appeal correspondence causes
  // automatic payer rejection. Therefore, DOS is preserved by default and is only de-identified when
  // explicitly requested for de-identified LLM prompts, exports, or court exhibits.
  // WARNING: preserved DOS means the output is NOT de-identified. LLM egress
  // (`redactBeforeLLM`) forces maskDateOfService on; payer correspondence uses
  // vaulted claim fields in the trusted boundary, never redacted text.
  if (dosMaskingActive) {
    const dosPrefixedRegex = new RegExp(
      `\\b(?:DOS|Date\\s*of\\s*Service|Service\\s*Date)[\\s:]*([0-9]{1,2}[/.-][0-9]{1,2}[/.-][0-9]{2,4}|${MONTH_NAME_PATTERN}\\s+[0-9]{1,2}${ORDINAL_DAY_SUFFIX},?\\s+[0-9]{4})\\b`,
      "gi"
    );
    while ((match = dosPrefixedRegex.exec(text)) !== null) {
      const matchedDate = match[1];
      const fullText = match[0];
      const dateOffset = fullText.lastIndexOf(matchedDate);
      const startIdx = match.index + dateOffset;
      const maskedDate = standard === "PUBLIC_EXHIBIT" ? "[REDACTED DOS]" : maskDob(matchedDate, standard);
      addEntity(
        "dob",
        "Date of Service",
        matchedDate,
        maskedDate,
        startIdx,
        startIdx + matchedDate.length,
        "DOS explicit prefix pattern",
        0.95
      );
    }
  }

  // 2c. Bare calendar dates (no DOB/DOS prefix). HIPAA Safe Harbor requires
  // redacting ALL dates directly related to an individual except the year, so
  // unprefixed dates (including demo-chart DOBs like 04/14/1968 written
  // without a "DOB:" label) must redact. DOS-labeled dates stay preserved
  // unless DOS masking is active (see 2b overlap handling).
  const addBareDate = (raw: string, startIdx: number, rule: string, confidence: number) => {
    if (!dosMaskingActive && rangesOverlap(startIdx, startIdx + raw.length, dosProtectedRanges)) {
      return;
    }
    addEntity("dob", "Calendar Date", raw, maskDob(raw, standard), startIdx, startIdx + raw.length, rule, confidence);
  };

  const bareSlashDateRegex = /\b(0?[1-9]|1[0-2])[/.-](0?[1-9]|[12]\d|3[01])[/.-](\d{4}|\d{2})\b/g;
  while ((match = bareSlashDateRegex.exec(text)) !== null) {
    const raw = match[0];
    const month = Number(match[1]);
    const day = Number(match[2]);
    const year = Number(match[3].length === 2 ? (Number(match[3]) >= 30 ? `19${match[3]}` : `20${match[3]}`) : match[3]);
    if (!isPlausibleDateParts(month, day, year)) continue;
    addBareDate(raw, match.index, "Unprefixed calendar date (Safe Harbor: all dates redacted)", 0.8);
  }

  // ISO form also matches embedded datetimes ("2026-07-04T10:30:00"): the
  // trailing guard is a negative digit lookahead (not \b, since "T" is a word
  // char) and an optional time suffix is consumed so it cannot survive alone.
  const bareIsoDateRegex = /\b((?:19|20)\d{2})[/.-](0?[1-9]|1[0-2])[/.-](0?[1-9]|[12]\d|3[01])(?:[T\s]\d{1,2}:\d{2}(?::\d{2})?)?(?!\d)/g;
  while ((match = bareIsoDateRegex.exec(text)) !== null) {
    const raw = match[0];
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    if (!isPlausibleDateParts(month, day, year)) continue;
    addBareDate(raw, match.index, "Unprefixed ISO calendar date (Safe Harbor: all dates redacted)", 0.8);
  }

  const bareLongDateRegex = new RegExp(
    `\\b(${MONTH_NAME_PATTERN}\\s+(?:0?[1-9]|[12]\\d|3[01])${ORDINAL_DAY_SUFFIX},?\\s+(?:19|20)\\d{2})\\b`,
    "gi"
  );
  while ((match = bareLongDateRegex.exec(text)) !== null) {
    const raw = match[1];
    const fullText = match[0];
    const dateOffset = fullText.lastIndexOf(raw);
    addBareDate(raw, match.index + dateOffset, "Unprefixed long-form calendar date (Safe Harbor: all dates redacted)", 0.8);
  }

  // 3. Medical Record Number (MRN). Runs before member IDs on purpose: the
  // loosened standalone member pattern would otherwise claim MRN-labeled
  // values ("MRN-984210") first, miscategorizing them.
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
      0.9
    );
  }

  // 4. Member ID, Group Number & Dependent Suffixes
  const memberIdPrefixedRegex = /\b(?:Member\s*(?:ID|#|No\.?)|Subscriber\s*(?:ID|#|No\.?)|Policy\s*(?:ID|#|No\.?)|Insured\s*(?:ID|#|No\.?)|Group\s*(?:ID|#|No\.?|Number)?)[\s:]*([A-Z0-9]{3,16}(?:-[A-Z0-9]{1,8}){0,2})\b/gi;
  while ((match = memberIdPrefixedRegex.exec(text)) !== null) {
    const rawId = match[1];
    // Values without a single digit are never beneficiary numbers ("Group
    // Policy" would otherwise flag the word "Policy" itself).
    if (!/\d/.test(rawId)) continue;
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
      "Insurance Member/Subscriber/Group identifier",
      0.92
    );
  }

  // Standalone IDs accept the hyphenated letter-digit shape plans print on
  // cards ("PEN-610492", "GRP-99214") as well as the fused form, and match
  // case-insensitively for OCR-lowercased text. The 5-digit minimum keeps
  // CARC codes ("CO-50") and short claim fragments out.
  const memberIdSuffixStandaloneRegex = /\b([A-Z]{2,4}-?[0-9]{5,10}(?:-[A-Z0-9]{1,6})?)\b/gi;
  while ((match = memberIdSuffixStandaloneRegex.exec(text)) !== null) {
    const rawId = match[1];
    const hasSuffix = rawId.includes("-");
    addEntity(
      "member_id",
      hasSuffix ? "Member ID with Dependent Suffix" : "Member ID",
      rawId,
      maskMemberId(rawId, standard),
      match.index,
      match.index + rawId.length,
      hasSuffix ? "Standalone Member ID with suffix" : "Standalone Member ID pattern",
      hasSuffix ? 0.88 : 0.78
    );
  }

  // 5. Patient Direct Name Identifiers (known names + contextual labels).
  // Runs AFTER phones/emails/addresses (sections below) so a name
  // component can never fragment an email local-part ("eleanor.vance@...")
  // or a street line before the higher-precision detector claims it.
  // (Block moved below; see "Patient Direct Name Identifiers"
  // after the address detector.)

  // 5. Telephone Numbers
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
      0.9
    );
  }

  // 5b. Unformatted numeric runs: contiguous 10-digit US phones/NPIs and
  // dashed 7-digit fax fragments. Letter/digit lookarounds keep timestamps,
  // member IDs, and ZIP+4 fragments intact (SSN-shaped runs belong to 1b).
  const contiguousPhoneRegex = /(?:^|[^A-Za-z0-9])(1?[2-9]\d{9})(?![A-Za-z0-9])/g;
  while ((match = contiguousPhoneRegex.exec(text)) !== null) {
    const rawPhone = match[1];
    const fullText = match[0];
    const phoneOffset = fullText.lastIndexOf(rawPhone);
    const startIdx = match.index + phoneOffset;
    addEntity(
      "contact",
      "Telephone Number",
      rawPhone,
      maskPhone(rawPhone, standard),
      startIdx,
      startIdx + rawPhone.length,
      "Contiguous 10-digit phone/NPI candidate",
      0.75
    );
  }

  const shortFaxRegex = /(?:^|[^\d])(\d{3}[-.]\d{4})(?![\d])/g;
  while ((match = shortFaxRegex.exec(text)) !== null) {
    const rawPhone = match[1];
    const fullText = match[0];
    const phoneOffset = fullText.lastIndexOf(rawPhone);
    const startIdx = match.index + phoneOffset;
    addEntity(
      "contact",
      "Telephone Number",
      rawPhone,
      maskPhone(rawPhone, standard),
      startIdx,
      startIdx + rawPhone.length,
      "7-digit phone/fax fragment",
      0.7
    );
  }

  // 6. Personal Electronic Mail (Email)
  const emailRegex = /\b([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\b/g;
  while ((match = emailRegex.exec(text)) !== null) {
    const rawEmail = match[1];
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

  // 7. Physical Street Addresses
  // The house-number anchor carries a negative lookbehind so it can never start
  // inside a phone fragment ("(555) 019-2834"), hyphenated run ("123-45-6789",
  // "MBN9823412-01"), country code ("+1"), or decimal measure ("12.5 mg"): the
  // digit-inclusive middle would otherwise span forward across words to a street
  // suffix, producing a false match that overlaps a real entity, gets suppressed
  // by collision avoidance, and silently swallows the true address that follows.
  const addressRegex = /(?:^|[^\d()\-+.])(\b\d{1,5}\s+[A-Z0-9\s.,]{3,35}\s+(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Lane|Ln|Drive|Dr|Way|Court|Ct|Suite|Ste|Apt|Terrace|Ter|Parkway|Pkwy|Circle|Cir|Place|Pl)\b)/gi;
  while ((match = addressRegex.exec(text)) !== null) {
    // Group 1 is the address; match[0] may include one consumed boundary char.
    const rawAddr = match[1];
    const startIdx = match.index + match[0].length - rawAddr.length;
    addEntity(
      "address",
      "Street Address",
      rawAddr,
      maskAddress(rawAddr, standard),
      startIdx,
      startIdx + rawAddr.length,
      "Street address physical locator",
      0.82
    );
  }

  // 7b. Postal ZIP codes (Safe Harbor geographic subdivision). Street lines
  // above rarely include the ZIP, and bare 5-digit runs collide with CPT
  // codes, so: ZIP+4 always redacts (CPT never carries a dash suffix), while
  // a bare 5-digit ZIP only redacts with a state-code anchor ("IL 62701").
  // The state itself is retained (Safe Harbor permits states).
  const zipPlus4Regex = /(?:^|[^A-Za-z0-9])(\d{5}-\d{4})(?![A-Za-z0-9])/g;
  while ((match = zipPlus4Regex.exec(text)) !== null) {
    const raw = match[1];
    const fullText = match[0];
    const zipOffset = fullText.lastIndexOf(raw);
    const startIdx = match.index + zipOffset;
    addEntity(
      "address",
      "ZIP Code",
      raw,
      maskAddress(raw, standard),
      startIdx,
      startIdx + raw.length,
      "ZIP+4 postal code",
      0.9
    );
  }

  const stateZipRegex = /\b([A-Z]{2})[,\s]+(\d{5})(?![-\d])/g;
  while ((match = stateZipRegex.exec(text)) !== null) {
    const zip = match[2];
    const fullText = match[0];
    const zipOffset = fullText.lastIndexOf(zip);
    const startIdx = match.index + zipOffset;
    addEntity(
      "address",
      "ZIP Code",
      zip,
      maskAddress(zip, standard),
      startIdx,
      startIdx + zip.length,
      "State-anchored ZIP code (state retained per Safe Harbor)",
      0.85
    );
  }

  // 7c. PO Boxes ("P.O. Box 1000", "PO Box 1000-A").
  const poBoxRegex = /\b(?:P\.?\s*O\.?\s*Box|Post\s*Office\s*Box)\s+[A-Z0-9-]{1,10}\b/gi;
  while ((match = poBoxRegex.exec(text)) !== null) {
    const raw = match[0];
    addEntity(
      "address",
      "PO Box",
      raw,
      maskAddress(raw, standard),
      match.index,
      match.index + raw.length,
      "Post office box locator",
      0.88
    );
  }

  // 8. Patient Direct Name Identifiers (known names + contextual labels).
  // Runs after phones/emails/addresses so name components can never fragment
  // an email local-part ("eleanor.vance@...") or a street line: collision
  // avoidance suppresses any name match overlapping an already-claimed range.
  if (!options.preservePatientName) {
    const knownNames: Array<{ text: string; pattern: string; isFull: boolean }> = [];
    const toNamePattern = (value: string): string =>
      value
        .split(/\s+/)
        .filter((p) => p.length > 0)
        .map((part) =>
          part
            .split(/[^A-Za-z]+/)
            .filter((s) => s.length > 0)
            .map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
            .join(`['\u2019\\-]*`)
        )
        .join(`\\s+`);
    if (options.patientName && options.patientName.trim().length > 2) {
      const pName = options.patientName.trim();
      knownNames.push({ text: pName, pattern: toNamePattern(pName), isFull: true });
      // Surname/given-name-only mentions ("Vance's imaging", "Sterling
      // presented", "O'Brien tolerated") are the most common miss when only
      // the full name is indexed, so each component of 3+ letters is detected
      // too, tolerating apostrophes and hyphens. Two-letter surnames
      // (Li/Ng/Yu) stay out: at that length \b matching over-fires on
      // ordinals and meridian markers ("am"/"pm").
      for (const part of pName.split(/\s+/)) {
        const clean = part.replace(/[^A-Za-z]/g, "");
        if (clean.length >= 3 && !knownNames.some((n) => n.text.toLowerCase() === clean.toLowerCase())) {
          knownNames.push({ text: clean, pattern: toNamePattern(part), isFull: false });
        }
      }
      // Caller-supplied name fragments double as custom terms in several
      // export paths; index them here as names so the category stays correct.
      if (options.customTerms) {
        for (const term of options.customTerms) {
          const clean = (term || "").trim().replace(/[^A-Za-z\s]/g, "").trim();
          if (clean.length >= 3 && /^[A-Za-z\s]+$/.test(clean) && clean.split(/\s+/).length <= 3) {
            if (!knownNames.some((n) => n.text.toLowerCase() === clean.toLowerCase())) {
              knownNames.push({ text: clean, pattern: toNamePattern(clean), isFull: false });
            }
          }
        }
      }
    }
    // Longest-first so the full name claims its range before components try.
    knownNames.sort((a, b) => b.text.length - a.text.length);
    for (const name of knownNames) {
      const nameRegex = new RegExp(`\\b${name.pattern}\\b`, "gi");
      while ((match = nameRegex.exec(text)) !== null) {
        addEntity(
          "name",
          name.isFull ? "Patient Full Name" : "Patient Name Component",
          match[0],
          maskPatientName(match[0], standard),
          match.index,
          match.index + match[0].length,
          name.isFull ? "Known patient name match" : "Known patient name component match",
          name.isFull ? 0.99 : 0.95
        );
      }
    }

    // Single bare surnames after a label ("Patient: Vance") are caught too;
    // the header-word denylist keeps section titles ("Patient: Portal")
    // from matching as names.
    const contextualNameRegex = /\b(?:Patient|PATIENT|patient|Insured|INSURED|insured|Member|MEMBER|member|Claimant|CLAIMANT|claimant)(?:\s*(?:Name|NAME|name))?[\s:]+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})\b/g;
    while ((match = contextualNameRegex.exec(text)) !== null) {
      const rawName = match[1];
      if (/^(Records?|Portals?|Services?|Claims?|Notices?|Appeals?|Denials?|Providers?|Physicians?|Members?|Patients?|Claimants?|Treatments?|Therapies|Polic(y|ies)|Groups?|Clinical|Medical|Surgical|Hospitals?|Centers?|Emergency)$/i.test(rawName)) continue;
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
  }

  // 8b. Free-floating person-name heuristic (low confidence, fail-closed).
  // Runs last so higher-precision detectors (SSN, dates, member IDs, MRNs,
  // phones, emails, addresses, known/contextual names) always win collisions.
  // Documented tradeoff: may over-match facility or multi-word clinical terms
  // that are not in NON_NAME_WORDS; over-redaction is preferred to a name
  // leaking to an untrusted model. Supply patientName for precise matching.
  //
  // Provider guard (trusted-UI integrity): a candidate anchored by a clinical
  // title ("Dr.", "Doctor", "Treating", "Attending", ...) or followed by a
  // medical credential (", MD", "DO", "FAAOS", ...) is a treating provider,
  // not a patient direct identifier. Masking it as [PATIENT REDACTED] destroys
  // denial intake (the LLM copies the placeholder into providerName, which
  // then leaks into the trusted UI as "Dr. [PATIENT REDACTED], MD").
  // Workforce names stay for extraction; patient names are still caught by
  // known-name + contextual-label detectors above.
  if (!options.preservePatientName) {
    const heuristicNameRegex = /\b([A-Z][a-z]{2,}(?:\s+[A-Z][a-z]{2,}){1,2})\b/g;
    const providerTitleBefore = /\b(?:dr|doctor|physician|provider|treating|attending|surgeon|specialist|clinician|practitioner)\.?\s+$/i;
    const credentialAfter = /^\s*,?\s*(?:M\s*\.?\s*D\s*\.?|D\s*\.?\s*O\s*\.?|FAAOS|FACS|Ph\s*\.?\s*D\s*\.?)\b/i;
    while ((match = heuristicNameRegex.exec(text)) !== null) {
      const rawName = match[1];
      const words = rawName.split(/\s+/);
      if (words.some((w) => NON_NAME_WORDS.has(w.toLowerCase()))) continue;
      // Skip month-day fragments already handled as dates ("May 12" etc. is
      // denylisted via month names, but guard single-month + year too).
      if (/^(19|20)\d{2}$/.test(words[words.length - 1])) continue;
      const fullText = match[0];
      const nameOffset = fullText.lastIndexOf(rawName);
      const startIdx = match.index + nameOffset;
      const endIdx = startIdx + rawName.length;
      // Treating-provider anchor: "Dr. Sarah Chen" / "Attending Sarah Chen".
      const before = text.slice(Math.max(0, startIdx - 30), startIdx);
      if (providerTitleBefore.test(before)) continue;
      // Credential anchor: "Sarah Chen, MD" / "Sarah Chen M.D.".
      const after = text.slice(endIdx, endIdx + 20);
      if (credentialAfter.test(after)) continue;
      addEntity(
        "name",
        "Person Name Candidate",
        rawName,
        maskPatientName(rawName, standard),
        startIdx,
        startIdx + rawName.length,
        "Unprefixed person-name candidate - verify (heuristic; may over-match facility/clinical terms)",
        0.6
      );
    }
  }

  // 9. Custom User-Supplied Terms
  if (options.customTerms && options.customTerms.length > 0) {
    for (const term of options.customTerms) {
      if (!term || term.trim().length < 2) continue;
      const cleanTerm = term.trim();
      // Name-like fragments were already indexed as names in section 5;
      // skip them here so the category is not double-counted.
      if (/^[A-Za-z\s]+$/.test(cleanTerm) && cleanTerm.split(/\s+/).length <= 3) {
        const looksLikeName = cleanTerm.split(/\s+/).every((p) => p.replace(/[^A-Za-z]/g, "").length >= 3);
        if (looksLikeName && options.patientName) continue;
      }
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

  return entities.sort((a, b) => a.startIndex - b.startIndex);
}

/**
 * True when the text carries explicitly labeled Date-of-Service dates that
 * will be PRESERVED (payer routing needs authentic DOS). Preserved DOS means
 * the output is not de-identified, so certification must stay false.
 */
export function isDosPreserved(
  text: string,
  standard: ComplianceStandard,
  options: RedactionEngineOptions = {}
): boolean {
  if (options.maskDateOfService || standard === "PUBLIC_EXHIBIT") return false;
  const dosLabelRegex = /\b(?:DOS|Date\s*of\s*Service|Service\s*Date)[\s:]*([0-9]{1,2}[/.-][0-9]{1,2}[/.-][0-9]{2,4}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+[0-9]{1,2}(?:st|nd|rd|th)?,?\s+[0-9]{4})\b/i;
  return dosLabelRegex.test(text);
}

/**
 * Explain residual risk for a redaction result. Regex detection is
 * deterministic but never complete: these warnings make that explicit so no
 * caller mistakes "0 entities found" for proof of safety.
 */
export function buildRedactionWarnings(
  text: string,
  entities: DetectedPiiEntity[],
  standard: ComplianceStandard,
  options: RedactionEngineOptions = {}
): string[] {
  const warnings: string[] = [];

  if (options.preservePatientName) {
    warnings.push(
      "Patient names intentionally preserved (preservePatientName) - output is NOT de-identified. Do not use for LLM egress, exports, or public exhibits."
    );
  }

  const disabledCount = (options.disabledEntityIds || []).length;
  if (disabledCount > 0) {
    warnings.push(
      `${disabledCount} detected entit${disabledCount === 1 ? "y" : "ies"} disabled by reviewer override - output is NOT fully de-identified.`
    );
  }

  if (options.maskingStyleOverrides && Object.keys(options.maskingStyleOverrides).length > 0) {
    warnings.push(
      "Custom masking-style overrides active (deprecated: all styles resolve to Safe Harbor placeholders) - human review required before LLM egress or public exhibit."
    );
  }

  if (standard === "CUSTOM") {
    warnings.push(
      "Custom redaction strategy - human review required before LLM egress, export, or public exhibit."
    );
  }

  if (isDosPreserved(text, standard, options)) {
    warnings.push(
      "Date(s) of Service preserved for payer routing - output is NOT de-identified. Use maskDateOfService:true for LLM prompts, exports, or public exhibits."
    );
  }

  if (entities.some((e) => /heuristic/i.test(e.rule))) {
    warnings.push(
      "Heuristic person-name candidate(s) detected without a known patientName - verify matches (may over-match facility/clinical terms); supply patientName for precise matching."
    );
  }

  if (entities.length === 0 && text.trim().length > 0) {
    warnings.push(
      "No known PII patterns detected - regex detection cannot guarantee absence of PHI (e.g. free-floating names without patientName context). Human review required for high-risk flows."
    );
  }

  return warnings;
}

/**
 * Applies active PII redactions to text, returning sanitized output and telemetry statistics.
 *
 * `isCertifiedSafe` is intentionally narrow: true only when the standard is a
 * Safe Harbor family mode (HIPAA_SAFE_HARBOR, BALANCED_APPELLATE hardening
 * alias, PUBLIC_EXHIBIT), every detected entity stayed enabled, no
 * preserve/override flags were set, no DOS dates were preserved, and the
 * standard is not CUSTOM. Anything else - including "no entities found",
 * which may be a false negative - is accompanied by explicit `warnings`.
 */
export function applyRedaction(
  text: string,
  entities: DetectedPiiEntity[],
  standard: ComplianceStandard = "HIPAA_SAFE_HARBOR",
  options: RedactionEngineOptions = {}
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
      warnings: [],
    };
  }

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

  const hasMaskingOverrides =
    !!options.maskingStyleOverrides && Object.keys(options.maskingStyleOverrides).length > 0;
  const allEnabled = enabledEntities.length === entities.length;
  const safeStandard =
    standard === "HIPAA_SAFE_HARBOR" ||
    standard === "BALANCED_APPELLATE" ||
    standard === "PUBLIC_EXHIBIT";
  const isCertifiedSafe =
    safeStandard &&
    allEnabled &&
    !options.preservePatientName &&
    (options.disabledEntityIds || []).length === 0 &&
    !hasMaskingOverrides &&
    !isDosPreserved(text, standard, options);

  const warnings = buildRedactionWarnings(text, entities, standard, options);

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
    warnings,
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
  return applyRedaction(text, entities, standard, options);
}

/**
 * Client-Side Text Redaction Gate:
 * Enforces mandatory HIPAA Safe Harbor de-identification (45 CFR § 164.514(b)(2))
 * in-browser before transmitting text extracted from digital PDFs or OCR to the server.
 * Fail-closed like the server gate: forces HIPAA_SAFE_HARBOR with DOS masking on.
 */
export function redactBeforeLLM(text: string, options?: RedactionEngineOptions): string {
  if (!text || typeof text !== "string") return "";
  const result = fastSanitizeText(text, {
    ...options,
    standard: "HIPAA_SAFE_HARBOR",
    maskDateOfService: true,
  });
  return result.sanitizedText;
}
