/**
 * Autonomous Insurer Defense Adversary — countermove strategy engine.
 *
 * Pure, side-effect-free helpers shared by the adjudicator bot
 * (convex/actions/mailDispatcher.ts) and the inbound challenge pipeline
 * (convex/actions/agentMail.ts). All functions are deterministic and
 * safe to unit test without Convex or OpenAI dependencies.
 */

export type AdversaryCountermove =
  | "OVERTURNED_APPROVED"
  | "PARTIAL_SETTLEMENT_OFFER"
  | "ADDITIONAL_RECORDS_REQUIRED"
  | "POLICY_CONFLICT_CITATION"
  | "DENIAL_UPHELD";

export const ADVERSARY_COUNTERMOVES: AdversaryCountermove[] = [
  "OVERTURNED_APPROVED",
  "PARTIAL_SETTLEMENT_OFFER",
  "ADDITIONAL_RECORDS_REQUIRED",
  "POLICY_CONFLICT_CITATION",
  "DENIAL_UPHELD",
];

/** Insurer opening settlement posture: 40% of the disputed amount. */
export const PARTIAL_SETTLEMENT_FRACTION = 0.4;

/** Canonical operative / clinical records the adversary demands in RFI moves. */
export const ADVERSARY_RFI_CHECKLIST = [
  "Operative notes with indication and technique",
  "Dated diagnostic imaging with radiologist interpretation",
  "Conservative therapy records with dates and response",
  "Prior authorization documentation",
] as const;

export interface AdversaryClaimContext {
  claimNumber: string;
  deniedAmount: number;
  overturnProbabilityScore?: number;
  evidenceCount?: number;
  appealLength?: number;
  negotiationRound?: number;
}

export function calculatePartialSettlementOffer(deniedAmount: number): number {
  if (!Number.isFinite(deniedAmount) || deniedAmount <= 0) return 0;
  return Math.round(deniedAmount * PARTIAL_SETTLEMENT_FRACTION * 100) / 100;
}

function hashClaimRound(claimNumber: string, round: number): number {
  const seed = `${claimNumber.trim().toLowerCase()}::${round}`;
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash);
}

/**
 * Deterministic countermove picker. Strong files overturn early; weak or
 * thin files draw realistic insurer defense moves (RFI, conflicting CPB
 * citation, partial 40% settlement, uphold). Later negotiation rounds drift
 * toward concession so multi-agent email threads converge instead of
 * looping forever.
 */
export function pickAdversaryCountermove(ctx: AdversaryClaimContext): AdversaryCountermove {
  const round = Math.max(0, ctx.negotiationRound ?? 0);
  const score = ctx.overturnProbabilityScore ?? 0.5;
  const evidenceCount = ctx.evidenceCount ?? 0;

  // Late rounds concede: sustained cited rebuttals force approval.
  if (round >= 3 && score >= 0.35) return "OVERTURNED_APPROVED";
  if (round >= 4) return "OVERTURNED_APPROVED";

  // Overwhelming file wins on first review.
  if (round === 0 && score >= 0.82 && evidenceCount >= 3) {
    return "OVERTURNED_APPROVED";
  }

  // Very weak file: payer holds the line.
  if (score < 0.25 && evidenceCount === 0) {
    return round === 0 ? "DENIAL_UPHELD" : "PARTIAL_SETTLEMENT_OFFER";
  }

  const adversarial: AdversaryCountermove[] = [
    "ADDITIONAL_RECORDS_REQUIRED",
    "POLICY_CONFLICT_CITATION",
    "PARTIAL_SETTLEMENT_OFFER",
    "DENIAL_UPHELD",
  ];
  return adversarial[hashClaimRound(ctx.claimNumber || "unknown", round) % adversarial.length];
}

/**
 * Fast heuristic classifier for inbound payer text. Ordering matters:
 * approval first, then partial-settlement, then RFI, then policy conflict,
 * then uphold. Returns GENERAL_INQUIRY when nothing matches.
 */
export function detectAdversaryCountermove(
  text: string
): AdversaryCountermove | "GENERAL_INQUIRY" {
  const lower = (text || "").toLowerCase();
  if (!lower.trim()) return "GENERAL_INQUIRY";

  const isApproval =
    lower.includes("overturned") ||
    lower.includes("approved") ||
    lower.includes("payment issued") ||
    lower.includes("reimbursed") ||
    lower.includes("reversed") ||
    lower.includes("authorized in full");
  if (isApproval) return "OVERTURNED_APPROVED";

  const isPartial =
    lower.includes("partial settlement") ||
    lower.includes("settlement offer") ||
    lower.includes("offer to settle") ||
    lower.includes("partial payment") ||
    lower.includes("partial reimbursement") ||
    (lower.includes("40%") && (lower.includes("offer") || lower.includes("settl"))) ||
    (lower.includes("partial") && lower.includes("offer"));
  if (isPartial) return "PARTIAL_SETTLEMENT_OFFER";

  const isRecords =
    lower.includes("additional records") ||
    lower.includes("documentation required") ||
    lower.includes("please provide") ||
    lower.includes("clinical records") ||
    lower.includes("need records") ||
    lower.includes("operative notes") ||
    lower.includes("request for information") ||
    lower.includes("rfi");
  if (isRecords) return "ADDITIONAL_RECORDS_REQUIRED";

  const isPolicyConflict =
    lower.includes("clinical policy bulletin") ||
    lower.includes("cpb") ||
    lower.includes("medical policy") ||
    lower.includes("coverage criteria") ||
    lower.includes("conflicting") ||
    lower.includes("not medically necessary per") ||
    lower.includes("policy clause") ||
    lower.includes("exclusion");
  if (isPolicyConflict) return "POLICY_CONFLICT_CITATION";

  const isDenial =
    lower.includes("upheld") ||
    lower.includes("denial maintained") ||
    lower.includes("adverse determination affirmed") ||
    lower.includes("not paying") ||
    lower.includes("ain't paying") ||
    lower.includes("refuse") ||
    lower.includes("denied");
  if (isDenial) return "DENIAL_UPHELD";

  return "GENERAL_INQUIRY";
}

export function getCountermoveClaimStatus(
  determination: string
): "won" | "under_review" | "escalated" | "dispatched" {
  switch (determination) {
    case "OVERTURNED_APPROVED":
      return "won";
    case "ADDITIONAL_RECORDS_REQUIRED":
    case "PARTIAL_SETTLEMENT_OFFER":
      return "under_review";
    case "POLICY_CONFLICT_CITATION":
    case "DENIAL_UPHELD":
      return "escalated";
    default:
      return "dispatched";
  }
}

export function getCountermoveLabel(determination: string): string {
  switch (determination) {
    case "OVERTURNED_APPROVED":
      return "Appeal Overturned";
    case "PARTIAL_SETTLEMENT_OFFER":
      return "Partial Settlement Offered";
    case "ADDITIONAL_RECORDS_REQUIRED":
      return "Additional Records Requested";
    case "POLICY_CONFLICT_CITATION":
      return "Conflicting Policy Cited";
    case "DENIAL_UPHELD":
      return "Denial Upheld";
    default:
      return "Payer Response Received";
  }
}

export function getCountermoveHeadline(determination: string): string {
  switch (determination) {
    case "OVERTURNED_APPROVED":
      return "Determination Overturned & Approved";
    case "PARTIAL_SETTLEMENT_OFFER":
      return "Partial Settlement Offer Extended";
    case "ADDITIONAL_RECORDS_REQUIRED":
      return "Additional Clinical Records Demanded";
    case "POLICY_CONFLICT_CITATION":
      return "Conflicting Clinical Policy Cited";
    case "DENIAL_UPHELD":
      return "Payer Upheld Initial Denial";
    default:
      return "New Inbound Correspondence Received";
  }
}

/** Advocate-facing fallback rebuttal per countermove when LLM drafting fails. */
export function buildCounterRebuttalFallback(args: {
  claimNumber: string;
  determination: string;
  deniedAmount?: number;
  settlementAmount?: number;
  cptCodes?: string[];
}): string {
  const cptList = args.cptCodes || [];
  const cpts = cptList.length > 0 ? cptList.join(", ") : "billed services";
  switch (args.determination) {
    case "PARTIAL_SETTLEMENT_OFFER": {
      const offered = args.settlementAmount ?? calculatePartialSettlementOffer(args.deniedAmount ?? 0);
      return (
        `We acknowledge your partial settlement offer of $${offered.toLocaleString()} regarding Claim #${args.claimNumber}. ` +
        `We respectfully decline a discounted resolution: the record documents emergency medical necessity for CPT [${cpts}] and the full disputed amount remains owed under ERISA 29 C.F.R. section 2560.503-1. ` +
        `Please either authorize full reimbursement or identify the specific clinical criterion that justifies a reduction, with supporting CPB language, so we may cure it or escalate to Independent External Review (IRO).`
      );
    }
    case "POLICY_CONFLICT_CITATION":
      return (
        `We acknowledge your cited clinical policy language regarding Claim #${args.claimNumber}. The cited clause does not control here: the treating record satisfies the medical-necessity exception for CPT [${cpts}] with documented conservative-therapy failure and diagnostic corroboration. ` +
        `Please distinguish the cited provision on these facts or withdraw it, failing which we formally request Immediate Independent External Review (IRO) under 29 C.F.R. section 2560.503-1 and preserve bad-faith remedies.`
      );
    case "ADDITIONAL_RECORDS_REQUIRED":
      return (
        `We acknowledge your Request for Information regarding Claim #${args.claimNumber}. We are compiling operative notes, dated imaging with radiologist interpretation, and conservative-therapy records for CPT [${cpts}]. ` +
        `Pursuant to ERISA 29 C.F.R. section 2560.503-1, please hold the file in full and fair review, confirm the exact records still outstanding, and toll any adverse action until the supplement is received.`
      );
    default:
      return (
        `We acknowledge your correspondence regarding Claim #${args.claimNumber}. Given your maintenance of the adverse determination despite documented emergency medical necessity for CPT [${cpts}], ` +
        `we formally request immediate escalation to Independent External Review (IRO) under 29 C.F.R. section 2560.503-1. Please provide the designated IRO contact details and statutory appellate documentation requirements.`
      );
  }
}

/** Strategy hint injected into the adjudicator LLM prompt for round-awareness. */
export function buildAdversaryStrategyHint(ctx: AdversaryClaimContext): string {
  const round = Math.max(0, ctx.negotiationRound ?? 0);
  const suggested = pickAdversaryCountermove(ctx);
  return (
    `Negotiation round ${round}. Suggested insurer-defense posture for this round: ${suggested}. ` +
    `You are not bound to the suggestion — rule on the brief — but weight it heavily when the record is ambiguous. ` +
    `Early rounds favor realistic defense (RFI for operative notes, conflicting CPB citation, or 40% partial settlement); ` +
    `sustained cited rebuttals in later rounds should concede toward overturn when the advocate cures the deficiency.`
  );
}
