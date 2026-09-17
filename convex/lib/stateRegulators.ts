/**
 * Patient-state regulator reference map — DOI-reference-only.
 *
 * The ClaimHero appeal engine is federal: ERISA 29 CFR § 2560.503-1 plus
 * ACA 45 CFR § 147.136 with a uniform 180-day filing clock. Patient state
 * NEVER changes deadlines, review standards, or statutory exposure. It only
 * names the state Department of Insurance / external-review body referenced
 * in appeal letters, P2P scripts, and dossier footers.
 *
 * Isolate-safe: no Convex imports, safe for `convex/` actions and `src/`.
 */

export const FEDERAL_APPEAL_ENGINE_LABEL =
  "Federal ERISA engine (29 CFR § 2560.503-1 + ACA 45 CFR § 147.136, 180-day clock)";

export const FEDERAL_FILING_WINDOW_DAYS = 180;

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
}

const FEDERAL_DEFAULT: StateRegulator = {
  code: "US",
  stateName: "Federal",
  doiName: "State Insurance Commissioner",
  doiShort: "State DOI",
  externalReviewLabel: "Independent Review Organization (IRO)",
};

const REGULATORS: Record<string, StateRegulator> = {
  CA: {
    code: "CA",
    stateName: "California",
    doiName: "California Department of Managed Health Care (DMHC) / Department of Insurance (CDI)",
    doiShort: "CA DMHC/CDI",
    externalReviewLabel: "DMHC Independent Medical Review",
  },
  TX: {
    code: "TX",
    stateName: "Texas",
    doiName: "Texas Department of Insurance (TDI)",
    doiShort: "TX TDI",
    externalReviewLabel: "TDI Independent Review Organization (IRO)",
  },
  NY: {
    code: "NY",
    stateName: "New York",
    doiName: "New York State Department of Financial Services (DFS)",
    doiShort: "NY DFS",
    externalReviewLabel: "DFS external appeal",
  },
  FL: {
    code: "FL",
    stateName: "Florida",
    doiName: "Florida Agency for Health Care Administration (AHCA) / Office of Insurance Regulation",
    doiShort: "FL AHCA/OIR",
    externalReviewLabel: "FL external review",
  },
  IL: {
    code: "IL",
    stateName: "Illinois",
    doiName: "Illinois Department of Insurance (IDOI)",
    doiShort: "IL IDOI",
    externalReviewLabel: "IDOI external review",
  },
  PA: {
    code: "PA",
    stateName: "Pennsylvania",
    doiName: "Pennsylvania Insurance Department (PID)",
    doiShort: "PA PID",
    externalReviewLabel: "PID external review",
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
 * to the federal default so callers never branch deadlines on state.
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
