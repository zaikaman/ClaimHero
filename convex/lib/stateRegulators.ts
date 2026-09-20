/**
 * Patient-state regulator reference map and statutory appeal & external review clocks.
 *
 * The ClaimHero statutory engine models the complete regulatory appeal lifecycle:
 * 1. Federal ERISA Internal Appeals (29 CFR § 2560.503-1(h)(2)(i)):
 *    Uniform 180-day filing clock from initial adverse benefit determination.
 * 2. Federal ACA External Review (45 CFR § 147.136(b)(2)(ii)(E) & (d)(2)(i)):
 *    Standard 4-month (~120-day) filing window from final internal adverse determination.
 * 3. State & Expedited External Review Clocks:
 *    - State-specific standard external review: e.g. CA DMHC 6 months (180 days)
 *      under Cal. Health & Safety Code § 1374.30(j); TX TDI 4 months (120 days)
 *      under Tex. Ins. Code § 4201.359; NY DFS 4 months (120 days) under N.Y. Ins. Law § 4914(b)(1).
 *    - State & expedited external review clock: 30-day filing window for expedited
 *      disputes and prompt state insurance commissioner reviews.
 *
 * Isolate-safe: no Convex imports, safe for `convex/` actions and `src/`.
 */

/** Standard ERISA internal appeal filing window: 180 days. */
export const FEDERAL_INTERNAL_APPEAL_WINDOW_DAYS = 180;
export const FEDERAL_FILING_WINDOW_DAYS = 180; // Backwards-compatible alias

/** Federal ACA external review standard filing window: 4 months (~120 days). */
export const ACA_EXTERNAL_REVIEW_WINDOW_DAYS = 120;

/** State expedited / prompt external review clock: 30 days. */
export const STATE_EXTERNAL_REVIEW_30_DAY_WINDOW = 30;

export interface StateRegulator {
  /** Canonical code: 2-letter state or "US" for the federal default. */
  code: string;
  /** Display state name, e.g. "California". "Federal" for the default. */
  stateName: string;
  /** Full regulator name for letter/script references. */
  doiName: string;
  /** Short badge, e.g. "CA DMHC/CDI". */
  doiShort: string;
  /** External-review reference, e.g. "DMHC Independent Medical Review". */
  externalReviewLabel: string;
  /** Standard external review deadline in days (e.g. 180 for CA 6-month, 120 for TX/NY/Federal 4-month). */
  standardExternalReviewDays: number;
  /** Expedited / state statutory external review clock in days (30 days). */
  stateExternalReviewDays: number;
  /** Statutory citation for external review timeline. */
  externalReviewCitation: string;
  /** Standard internal ERISA appeal window in days (180 days). */
  internalAppealDays: number;
}

const FEDERAL_DEFAULT: StateRegulator = {
  code: "US",
  stateName: "Federal",
  doiName: "State Insurance Commissioner",
  doiShort: "State DOI",
  externalReviewLabel: "Independent Review Organization (IRO)",
  standardExternalReviewDays: 120, // 4 months under ACA 45 CFR § 147.136
  stateExternalReviewDays: 30, // 30-day state expedited external review
  externalReviewCitation: "ACA 45 CFR § 147.136(b)(2)(ii)(E) & (d)(2)(i)",
  internalAppealDays: 180,
};

const REGULATORS: Record<string, StateRegulator> = {
  CA: {
    code: "CA",
    stateName: "California",
    doiName: "California Department of Managed Health Care (DMHC) / Department of Insurance (CDI)",
    doiShort: "CA DMHC/CDI",
    externalReviewLabel: "DMHC Independent Medical Review",
    standardExternalReviewDays: 180, // 6 months under Cal. Health & Safety Code § 1374.30(j)
    stateExternalReviewDays: 30, // Expedited determination clock
    externalReviewCitation: "Cal. Health & Safety Code § 1374.30(j) / Cal. Ins. Code § 10169",
    internalAppealDays: 180,
  },
  TX: {
    code: "TX",
    stateName: "Texas",
    doiName: "Texas Department of Insurance (TDI)",
    doiShort: "TX TDI",
    externalReviewLabel: "TDI Independent Review Organization (IRO)",
    standardExternalReviewDays: 120, // 4 months under Tex. Ins. Code § 4201.359 / 28 TAC § 12.502
    stateExternalReviewDays: 30, // Expedited state review clock
    externalReviewCitation: "Tex. Ins. Code § 4201.359 / 28 TAC § 12.502",
    internalAppealDays: 180,
  },
  NY: {
    code: "NY",
    stateName: "New York",
    doiName: "New York State Department of Financial Services (DFS)",
    doiShort: "NY DFS",
    externalReviewLabel: "DFS external appeal",
    standardExternalReviewDays: 120, // 4 months under N.Y. Ins. Law § 4914(b)(1)
    stateExternalReviewDays: 30, // Expedited external appeal clock under N.Y. Ins. Law § 4914(b)(2)
    externalReviewCitation: "N.Y. Ins. Law § 4914(b)(1) & § 4914(b)(2)",
    internalAppealDays: 180,
  },
  FL: {
    code: "FL",
    stateName: "Florida",
    doiName: "Florida Agency for Health Care Administration (AHCA) / Office of Insurance Regulation",
    doiShort: "FL AHCA/OIR",
    externalReviewLabel: "FL external review",
    standardExternalReviewDays: 120, // 4 months under ACA 45 CFR § 147.136 & FL Stat. § 627.6698
    stateExternalReviewDays: 30,
    externalReviewCitation: "FL Stat. § 627.6698 / 45 CFR § 147.136",
    internalAppealDays: 180,
  },
  IL: {
    code: "IL",
    stateName: "Illinois",
    doiName: "Illinois Department of Insurance (IDOI)",
    doiShort: "IL IDOI",
    externalReviewLabel: "IDOI external review",
    standardExternalReviewDays: 120, // 4 months under 215 ILCS 180/30
    stateExternalReviewDays: 30,
    externalReviewCitation: "215 ILCS 180/30 (Illinois Health Carrier External Review Act)",
    internalAppealDays: 180,
  },
  PA: {
    code: "PA",
    stateName: "Pennsylvania",
    doiName: "Pennsylvania Insurance Department (PID)",
    doiShort: "PA PID",
    externalReviewLabel: "PID external review",
    standardExternalReviewDays: 120, // 4 months under PA Act 68 / 40 P.S. § 991.2162
    stateExternalReviewDays: 30,
    externalReviewCitation: "40 P.S. § 991.2162 (PA Act 68)",
    internalAppealDays: 180,
  },
  US: FEDERAL_DEFAULT,
};

const NAME_ALIASES: Record<string, string> = {
  california: "CA",
  ca: "CA",
  texas: "TX",
  tx: "TX",
  "new york": "NY",
  ny: "NY",
  florida: "FL",
  fl: "FL",
  illinois: "IL",
  il: "IL",
  pennsylvania: "PA",
  pa: "PA",
  fed: "US",
  federal: "US",
  us: "US",
  usa: "US",
  "united states": "US",
};

/**
 * Normalize any stored patient-state value (code, full name, legacy
 * placeholder) to a canonical regulator code. Unknown values fall back
 * to the federal default.
 */
export function normalizeStateCode(input?: string | null): string {
  if (!input) return "US";
  const trimmed = input.trim();
  if (!trimmed || trimmed.toLowerCase() === "the state") return "US";
  const upper = trimmed.toUpperCase();
  if (REGULATORS[upper]) return upper;
  return NAME_ALIASES[trimmed.toLowerCase()] ?? "US";
}

/** Resolve the DOI reference for any stored patient-state value. */
export function getStateRegulator(input?: string | null): StateRegulator {
  return REGULATORS[normalizeStateCode(input)] ?? FEDERAL_DEFAULT;
}

/**
 * Get statutory external review deadline window in days for a patient state.
 * Returns either the standard statutory window (e.g. 180d for CA, 120d for TX/NY/US)
 * or the 30-day state expedited window if requested.
 */
export function getExternalReviewDeadlineDays(
  stateInput?: string | null,
  options?: { expedited?: boolean }
): number {
  const regulator = getStateRegulator(stateInput);
  if (options?.expedited) {
    return regulator.stateExternalReviewDays; // 30 days
  }
  return regulator.standardExternalReviewDays;
}

/**
 * Get statutory appeal deadline in days depending on dispute tier and patient state.
 * - Tier 1 (internal) / Tier 2 (grievance): 180 days under ERISA 29 CFR § 2560.503-1(h)(2)(i).
 * - Tier 3 (external review): State-specific or ACA 4-month (120d) window, or 30-day expedited.
 */
export function getAppealDeadlineDays(
  appealLevel: string,
  stateInput?: string | null,
  options?: { isExpedited?: boolean }
): number {
  if (appealLevel === "level_3_external_state_review") {
    return getExternalReviewDeadlineDays(stateInput, { expedited: options?.isExpedited });
  }
  return FEDERAL_INTERNAL_APPEAL_WINDOW_DAYS; // 180 days
}

/**
 * Get statutory external review legal citation for a state or federal baseline.
 */
export function getStateExternalReviewCitation(stateInput?: string | null): string {
  return getStateRegulator(stateInput).externalReviewCitation;
}

