/**
 * Precise UTC Date and Statutory Appeal Timing Utilities
 *
 * Enforces strict regulatory compliance under ERISA 29 C.F.R. § 2560.503-1(h)(2)(i):
 * - Appeal deadlines are anchored to the date of adverse benefit determination (denial date),
 *   not the date of claim ingestion into software.
 * - Negative values are preserved when a claim is overdue (never clamped to 0).
 * - All date strings are parsed and evaluated at UTC midnight to prevent cross-timezone off-by-one shifts.
 */

import {
  getStateRegulator,
  ACA_EXTERNAL_REVIEW_WINDOW_DAYS as ACA_WINDOW,
  STATE_EXTERNAL_REVIEW_30_DAY_WINDOW,
} from "./stateRegulators";

export const ONE_DAY_MS = 86_400_000;
export const DEFAULT_STATUTORY_APPEAL_WINDOW_DAYS = 180;
export const ACA_EXTERNAL_REVIEW_WINDOW_DAYS = ACA_WINDOW; // 120 days (4 months under 45 CFR § 147.136)
export const STATE_EXTERNAL_REVIEW_WINDOW_DAYS = STATE_EXTERNAL_REVIEW_30_DAY_WINDOW; // 30 days (state expedited review)

/**
 * Parses any date string representation (ISO, US, or standard English) into
 * a UTC midnight epoch timestamp (00:00:00.000Z). Returns null if invalid or missing.
 */
export function parseDateToUtcMidnight(dateStr?: string | null): number | null {
  if (!dateStr || typeof dateStr !== "string") return null;
  const trimmed = dateStr.trim();
  if (!trimmed || trimmed.toLowerCase() === "n/a" || trimmed.toUpperCase() === "PENDING") {
    return null;
  }

  // 1. Match ISO: YYYY-MM-DD
  const isoMatch = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (isoMatch) {
    const [, y, m, d] = isoMatch;
    const year = Number(y);
    const month = Number(m) - 1;
    const day = Number(d);
    const ts = Date.UTC(year, month, day);
    if (!isNaN(ts)) return ts;
  }

  // 2. Match US: MM/DD/YYYY or M/D/YYYY
  const usMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (usMatch) {
    const [, m, d, y] = usMatch;
    const year = Number(y);
    const month = Number(m) - 1;
    const day = Number(d);
    const ts = Date.UTC(year, month, day);
    if (!isNaN(ts)) return ts;
  }

  // 3. Match format like: Jan 15, 2026 or 15 Jan 2026
  const monthNames: Record<string, number> = {
    jan: 0, january: 0,
    feb: 1, february: 1,
    mar: 2, march: 2,
    apr: 3, april: 3,
    may: 4,
    jun: 5, june: 5,
    jul: 6, july: 6,
    aug: 7, august: 7,
    sep: 8, september: 8,
    oct: 9, october: 9,
    nov: 10, november: 10,
    dec: 11, december: 11,
  };

  const textMatch = trimmed.match(/^([a-z]+)\s+(\d{1,2}),?\s+(\d{4})/i);
  if (textMatch) {
    const [, monthStr, dayStr, yearStr] = textMatch;
    const m = monthNames[monthStr.toLowerCase()];
    if (m !== undefined) {
      const ts = Date.UTC(Number(yearStr), m, Number(dayStr));
      if (!isNaN(ts)) return ts;
    }
  }

  // 4. Fallback: standard Date parsing, forcing UTC midnight if date-only
  const parsed = Date.parse(trimmed);
  if (!isNaN(parsed)) {
    const d = new Date(parsed);
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  }

  return null;
}

/**
 * Calculates remaining days from now to the statutory deadline.
 * - Positive remaining time is rounded up (ceil) so 12 hours remaining counts as 1 day.
 * - Exact deadline or today counts as 0 days.
 * - Negative remaining time is rounded down (floor) so 12 hours past deadline counts as -1 day (1 day overdue).
 * Never clamps to 0.
 */
export function calculateDaysRemaining(statutoryDeadline: number, now: number = Date.now()): number {
  const diffMs = statutoryDeadline - now;
  if (diffMs >= 0) {
    return Math.ceil(diffMs / ONE_DAY_MS);
  }
  return Math.floor(diffMs / ONE_DAY_MS);
}

export type StatutoryClockType =
  | "erisa_internal_180"
  | "aca_external_120"
  | "state_external_30"
  | "state_external_specific"
  | "custom";

export interface StatutoryDeadlineResolution {
  statutoryDeadline?: number;
  daysRemaining?: number;
  anchorTimestamp?: number;
  anchorDate: string;
  anchorType: "denial" | "service" | "ingestion" | "unknown";
  effectiveDeadlineDays: number;
  clockType?: StatutoryClockType;
  regulatoryCitation?: string;
}

/**
 * Resolves the statutory deadline and days remaining for a claim.
 * Follows statutory priority:
 * 1. Denial Date (date of adverse benefit determination per ERISA 29 C.F.R. § 2560.503-1(h)(2)(i))
 * 2. Service Date (fallback only when denial date not explicitly documented)
 * 3. Unknown (does not fabricate an ingestion-anchored deadline)
 *
 * Automatically resolves the statutory clock:
 * - When appealLevel is "level_3_external_state_review", computes external review clock:
 *   - Expedited: 30 days (state expedited external review clock)
 *   - Standard CA: 180 days (6 months per Cal. Health & Safety Code § 1374.30(j))
 *   - Standard TX / NY / Federal: 120 days (4 months per ACA 45 CFR § 147.136 & state statutes)
 * - Otherwise defaults to 180 days under ERISA 29 CFR § 2560.503-1(h)(2)(i).
 */
export function resolveStatutoryDeadline(options: {
  denialDate?: string;
  serviceDate?: string;
  appealFilingDeadlineDays?: number;
  appealLevel?: string;
  state?: string;
  isExpedited?: boolean;
  now?: number;
}): StatutoryDeadlineResolution {
  const now = options.now ?? Date.now();

  let effectiveDeadlineDays: number;
  let clockType: StatutoryClockType;
  let regulatoryCitation: string;

  if (options.appealFilingDeadlineDays && options.appealFilingDeadlineDays > 0) {
    effectiveDeadlineDays = options.appealFilingDeadlineDays;
    clockType = "custom";
    regulatoryCitation = `Explicit plan deadline (${effectiveDeadlineDays} days)`;
  } else if (options.appealLevel === "level_3_external_state_review") {
    const regulator = getStateRegulator(options.state);
    if (options.isExpedited) {
      effectiveDeadlineDays = regulator.stateExternalReviewDays; // 30 days
      clockType = "state_external_30";
      regulatoryCitation = `${regulator.doiShort} Expedited External Review (30-day statutory clock)`;
    } else {
      effectiveDeadlineDays = regulator.standardExternalReviewDays; // 180d for CA, 120d for others
      clockType = regulator.code === "CA" ? "state_external_specific" : "aca_external_120";
      regulatoryCitation = regulator.externalReviewCitation;
    }
  } else {
    effectiveDeadlineDays = DEFAULT_STATUTORY_APPEAL_WINDOW_DAYS;
    clockType = "erisa_internal_180";
    regulatoryCitation = "ERISA 29 C.F.R. § 2560.503-1(h)(2)(i) (180-day internal appeal clock)";
  }

  const denialTs = parseDateToUtcMidnight(options.denialDate);
  const serviceTs = parseDateToUtcMidnight(options.serviceDate);

  let anchorTimestamp: number;
  let anchorDate: string;
  let anchorType: "denial" | "service" | "unknown";

  if (denialTs !== null) {
    anchorTimestamp = denialTs;
    anchorDate = options.denialDate!.trim();
    anchorType = "denial";
  } else if (serviceTs !== null) {
    anchorTimestamp = serviceTs;
    anchorDate = options.serviceDate!.trim();
    anchorType = "service";
  } else {
    // Ingestion-anchored 180d deadline violates ERISA 29 CFR 2560.503-1(h)(2)(i).
    // Fall back to Unknown, don't fabricate.
    return {
      statutoryDeadline: undefined,
      daysRemaining: undefined,
      anchorTimestamp: undefined,
      anchorDate: "Unknown",
      anchorType: "unknown",
      effectiveDeadlineDays,
      clockType,
      regulatoryCitation: "Unknown (pending denial notice date under ERISA 29 C.F.R. § 2560.503-1(h)(2)(i))",
    };
  }

  const statutoryDeadline = anchorTimestamp + effectiveDeadlineDays * ONE_DAY_MS;
  const daysRemaining = calculateDaysRemaining(statutoryDeadline, now);

  return {
    statutoryDeadline,
    daysRemaining,
    anchorTimestamp,
    anchorDate,
    anchorType,
    effectiveDeadlineDays,
    clockType,
    regulatoryCitation,
  };
}

/**
 * Explicit helper to compute external review statutory deadline and remaining days.
 */
export function resolveExternalReviewDeadline(options: {
  denialDate?: string;
  serviceDate?: string;
  state?: string;
  isExpedited?: boolean;
  now?: number;
}): StatutoryDeadlineResolution {
  return resolveStatutoryDeadline({
    ...options,
    appealLevel: "level_3_external_state_review",
  });
}

