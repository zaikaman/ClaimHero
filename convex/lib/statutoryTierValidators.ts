import { v } from "convex/values";

/**
 * Statutory dispute escalation tiers governed by federal ERISA and state insurance law.
 */
export const STATUTORY_APPEAL_LEVELS = [
  "level_1_internal",
  "level_2_grievance",
  "level_3_external_state_review",
] as const;

export type StatutoryAppealLevel = (typeof STATUTORY_APPEAL_LEVELS)[number];

export const appealLevelValidator = v.union(
  v.literal("level_1_internal"),
  v.literal("level_2_grievance"),
  v.literal("level_3_external_state_review")
);

/**
 * Statutory legal posture definitions across dispute tiers.
 */
export const STATUTORY_POSTURES = [
  "administrative_reconsideration",
  "procedural_grievance_bad_faith",
  "external_iro_erisa_502_petition",
] as const;

export type StatutoryPosture = (typeof STATUTORY_POSTURES)[number];

export const statutoryPostureValidator = v.union(
  v.literal("administrative_reconsideration"),
  v.literal("procedural_grievance_bad_faith"),
  v.literal("external_iro_erisa_502_petition")
);

/**
 * Allowed statutory target review authorities.
 */
export const STATUTORY_TARGET_AUTHORITIES = [
  "Payer Medical Director Review",
  "Multi-Disciplinary Peer Review Panel & Appeals Committee",
  "External Independent Review Organization (IRO) & State Insurance Commissioner",
  "Multi-Disciplinary Peer Review Panel & Grievance Committee",
  "Multi-Disciplinary Peer Review Panel",
  "External IRO & State Insurance Commissioner",
  "External Independent Review Organization (IRO) & State Commissioner",
  "Payer Medical Director",
] as const;

export type StatutoryTargetAuthority = (typeof STATUTORY_TARGET_AUTHORITIES)[number];

export const targetAuthorityValidator = v.union(
  v.literal("Payer Medical Director Review"),
  v.literal("Multi-Disciplinary Peer Review Panel & Appeals Committee"),
  v.literal("External Independent Review Organization (IRO) & State Insurance Commissioner"),
  v.literal("Multi-Disciplinary Peer Review Panel & Grievance Committee"),
  v.literal("Multi-Disciplinary Peer Review Panel"),
  v.literal("External IRO & State Insurance Commissioner"),
  v.literal("External Independent Review Organization (IRO) & State Commissioner"),
  v.literal("Payer Medical Director")
);

/**
 * Permitted legal aggressiveness tiers.
 */
export const LEGAL_AGGRESSIVENESS_TIERS = [
  "standard",
  "elevated_grievance",
  "maximum_statutory_enforcement",
] as const;

export type LegalAggressivenessTier = (typeof LEGAL_AGGRESSIVENESS_TIERS)[number];

export const legalAggressivenessValidator = v.union(
  v.literal("standard"),
  v.literal("elevated_grievance"),
  v.literal("maximum_statutory_enforcement")
);

/**
 * Assert that an appeal level string is one of the valid statutory tiers.
 */
export function assertValidAppealLevel(level: unknown): asserts level is StatutoryAppealLevel {
  if (typeof level !== "string" || !STATUTORY_APPEAL_LEVELS.includes(level as StatutoryAppealLevel)) {
    throw new Error(
      `Invalid statutory appeal level: "${String(level)}". Expected one of: ${STATUTORY_APPEAL_LEVELS.join(", ")}`
    );
  }
}

/**
 * Assert that a statutory posture is valid when provided.
 */
export function assertValidStatutoryPosture(posture: unknown): asserts posture is StatutoryPosture | undefined {
  if (posture !== undefined && posture !== null) {
    if (typeof posture !== "string" || !STATUTORY_POSTURES.includes(posture as StatutoryPosture)) {
      throw new Error(
        `Invalid statutory posture: "${String(posture)}". Expected one of: ${STATUTORY_POSTURES.join(", ")}`
      );
    }
  }
}

/**
 * Assert that a target authority is valid when provided.
 */
export function assertValidTargetAuthority(authority: unknown): asserts authority is StatutoryTargetAuthority | undefined {
  if (authority !== undefined && authority !== null) {
    if (typeof authority !== "string" || !STATUTORY_TARGET_AUTHORITIES.includes(authority as StatutoryTargetAuthority)) {
      throw new Error(
        `Invalid target authority: "${String(authority)}". Expected one of: ${STATUTORY_TARGET_AUTHORITIES.join(", ")}`
      );
    }
  }
}

/**
 * Assert that a legal aggressiveness tier is valid when provided.
 */
export function assertValidLegalAggressiveness(aggressiveness: unknown): asserts aggressiveness is LegalAggressivenessTier | undefined {
  if (aggressiveness !== undefined && aggressiveness !== null) {
    if (typeof aggressiveness !== "string" || !LEGAL_AGGRESSIVENESS_TIERS.includes(aggressiveness as LegalAggressivenessTier)) {
      throw new Error(
        `Invalid legal aggressiveness: "${String(aggressiveness)}". Expected one of: ${LEGAL_AGGRESSIVENESS_TIERS.join(", ")}`
      );
    }
  }
}

export interface StatutoryTierMetadata {
  statutoryPosture: StatutoryPosture;
  targetAuthority: StatutoryTargetAuthority;
  legalAggressiveness: LegalAggressivenessTier;
  statutoryAuthorities: string[];
}

/**
 * Helper to resolve statutory metadata for a given appeal level with strict validation.
 */
export function getStatutoryTierMetadata(appealLevel: string): StatutoryTierMetadata {
  assertValidAppealLevel(appealLevel);
  switch (appealLevel) {
    case "level_2_grievance":
      return {
        statutoryPosture: "procedural_grievance_bad_faith",
        targetAuthority: "Multi-Disciplinary Peer Review Panel & Appeals Committee",
        legalAggressiveness: "elevated_grievance",
        statutoryAuthorities: [
          "ERISA Section 503 (29 U.S.C. § 1133)",
          "29 C.F.R. § 2560.503-1(h)(3)(iii) (Mandatory Same-Specialty Peer Review)",
          "Department of Labor Claims Procedure Regulations",
        ],
      };
    case "level_3_external_state_review":
      return {
        statutoryPosture: "external_iro_erisa_502_petition",
        targetAuthority: "External Independent Review Organization (IRO) & State Insurance Commissioner",
        legalAggressiveness: "maximum_statutory_enforcement",
        statutoryAuthorities: [
          "ERISA Section 502(a)(1)(B) [29 U.S.C. § 1132(a)(1)(B)] (Civil Enforcement & Benefit Recovery)",
          "ERISA Section 502(g)(1) (Mandatory Attorney's Fees & Cost Shifting)",
          "45 C.F.R. § 147.136 (ACA Federal External Review Mandate)",
          "State Insurance Code Unfair Claims Settlement Practices Act",
          "Statutory Bad-Faith Claims Handling & Prompt-Pay Interest Penalties",
        ],
      };
    case "level_1_internal":
      return {
        statutoryPosture: "administrative_reconsideration",
        targetAuthority: "Payer Medical Director Review",
        legalAggressiveness: "standard",
        statutoryAuthorities: [
          "ERISA 29 C.F.R. § 2560.503-1 (Full and Fair Review)",
          "Patient Protection and Affordable Care Act § 2719",
          "Published Clinical Policy Bulletins (CPB)",
        ],
      };
    default:
      throw new Error(
        `Invalid statutory appeal level: "${appealLevel}". Expected one of: ${STATUTORY_APPEAL_LEVELS.join(", ")}`
      );
  }
}
