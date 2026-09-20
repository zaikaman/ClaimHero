/**
 * Insurer determination parsing and counter-rebuttal negotiation helpers.
 *
 * Pure, side-effect-free helpers used by the inbound challenge pipeline
 * (convex/actions/agentMail.ts) for parsing insurer determinations and drafting rebuttals.
 * All functions are deterministic and safe to unit test without external dependencies.
 */

export type AdversaryCountermove =
  | "OVERTURNED_APPROVED"
  | "PARTIAL_SETTLEMENT_OFFER"
  | "ADDITIONAL_RECORDS_REQUIRED"
  | "POLICY_CONFLICT_CITATION"
  | "DENIAL_UPHELD";

/** Insurer opening settlement posture: 40% of the disputed amount. */
export const PARTIAL_SETTLEMENT_FRACTION = 0.4;

/** Canonical operative / clinical records demanded in RFI determinations. */
export const ADVERSARY_RFI_CHECKLIST = [
  "Operative notes with indication and technique",
  "Dated diagnostic imaging with radiologist interpretation",
  "Conservative therapy records with dates and response",
  "Prior authorization documentation",
] as const;

export function calculatePartialSettlementOffer(deniedAmount: number): number {
  if (!Number.isFinite(deniedAmount) || deniedAmount <= 0) return 0;
  return Math.round(deniedAmount * PARTIAL_SETTLEMENT_FRACTION * 100) / 100;
}

/**
 * Context-aware check for affirmative determination reversal or approval.
 * Avoids false-positives on "approved provider list", "approved facility",
 * "not approved", "charge reversed", "payment reversed", etc.
 */
export function isApprovalDeterminationText(text: string): boolean {
  const lower = (text || "").toLowerCase();
  if (!lower.trim()) return false;

  // Explicit positive phrases indicating determination overturn or approval
  const positivePatterns = [
    /\b(?:appeal|claim|authorization|coverage|reimbursement|service)\s+(?:has\s+been\s+|is\s+|was\s+)?approved\b/,
    /\bapproved\s+(?:for\s+payment|for\s+reimbursement|upon\s+appeal|upon\s+review|in\s+full)\b/,
    /\bapproved\s+the\s+appeal\b/,
    /\b(?:adverse\s+determination|denial|decision|prior\s+determination)\s+(?:has\s+been\s+|is\s+|was\s+)?reversed\b/,
    /\breversed\s+(?:the\s+denial|the\s+decision|the\s+adverse\s+determination)\b/,
    /\b(?:overturned\s+upon\s+appeal|overturned\s+in\s+full|denial\s+overturned|determination\s+overturned|appeal\s+overturned)\b/,
    /\boverturned\s+and\s+approved\b/,
    /\b(?:authorized\s+in\s+full|coverage\s+authorized\s+in\s+full|authorized\s+coverage\s+in\s+full)\b/,
    /\b(?:payment\s+issued\s+in\s+full|payment\s+issued\s+for\s+full|reimbursement\s+issued\s+in\s+full)\b/,
  ];

  if (positivePatterns.some((rx) => rx.test(lower))) {
    if (/\b(?:not|cannot\s+be|never|unable\s+to\s+be)\s+approved\b/.test(lower)) {
      return false;
    }
    return true;
  }

  // Check standalone "overturned" if not negated
  if (/\boverturned\b/.test(lower) && !/\b(?:not|never)\s+overturned\b/.test(lower)) {
    return true;
  }

  if (lower.includes("authorized in full")) return true;
  const isNegatedPayment =
    /\b(?:no|not|never|neither|without|zero)\s+payment\s+issued\b/.test(lower) ||
    /\bpayment\s+(?:was\s+|is\s+|has\s+been\s+)?not\s+issued\b/.test(lower) ||
    /\bpayment\s+(?:reversed|retracted|cancelled)\b/.test(lower);
  if (/\bpayment\s+issued\b/.test(lower) && !isNegatedPayment) {
    return true;
  }
  if (/\breimbursed\s+in\s+full\b/.test(lower)) return true;

  if (/\bapproved\b/.test(lower)) {
    const isFalseApproved =
      /\bapproved\s+(?:provider|physician|doctor|facility|hospital|vendor|network|drug|medication|list|panel)\b/.test(lower) ||
      /\b(?:pre-?approved|prior-?approved)\b/.test(lower) ||
      /\b(?:not|cannot\s+be|never|unable\s+to\s+be)\s+approved\b/.test(lower);
    if (!isFalseApproved && /\b(?:is|was|has\s+been)\s+approved\b/.test(lower)) {
      return true;
    }
  }

  if (/\breversed\b/.test(lower)) {
    const isFalseReversed =
      /\b(?:charge|charges|payment|payments|credit|fee|offset)\s+reversed\b/.test(lower) ||
      /\breversed\s+(?:charge|charges|payment|payments|credit|fee|offset|prior\s+payment)\b/.test(lower);
    if (!isFalseReversed && /\b(?:decision|denial|determination|adverse\s+action)\s+(?:is|was|has\s+been)?\s*reversed\b/.test(lower)) {
      return true;
    }
  }

  return false;
}

export interface DetectedSettlementOffer {
  matches: boolean;
  offeredAmount?: number;
  isExplicitDollar: boolean;
}

/**
 * Detect both phrasal and explicit dollar / percentage settlement offers.
 * Captures "offer $X to settle", "settle for $X", "counter-offer of $X", etc.
 */
export function detectSettlementOffer(text: string): DetectedSettlementOffer {
  const lower = (text || "").toLowerCase();
  if (!lower.trim()) return { matches: false, isExplicitDollar: false };

  // 1. Check for explicit dollar-bearing settlement offers
  const dollarPatterns = [
    /(?:offer(?:ing|ed|s)?|settl(?:e|ing|ed|ement)?|propos(?:e|ing|ed|al)?|counter-?offer)\s+(?:of\s+|for\s+|to\s+pay\s+)?\$\s*([\d,]+(?:\.\d{2})?)/i,
    /\$\s*([\d,]+(?:\.\d{2})?)\s+(?:partial\s+)?(?:settlement|compromise|settlement\s+offer)/i,
    /(?:settle|resolve)\s+(?:the|this)?\s*(?:claim|dispute|matter|appeal)\s+for\s+\$\s*([\d,]+(?:\.\d{2})?)/i,
    /(?:willing|agree|propose)\s+(?:to\s+)?settle\s+(?:for|at)\s+\$\s*([\d,]+(?:\.\d{2})?)/i,
  ];

  for (const rx of dollarPatterns) {
    const match = text.match(rx);
    if (match && match[1]) {
      const parsed = parseFloat(match[1].replace(/,/g, ""));
      if (Number.isFinite(parsed) && parsed > 0) {
        return { matches: true, offeredAmount: parsed, isExplicitDollar: true };
      }
    }
  }

  // 2. Check for percentage settlement offers
  if (/\b\d{1,2}%\s*(?:settlement|offer|compromise|reimbursement|payment)\b/i.test(lower)) {
    return { matches: true, isExplicitDollar: false };
  }
  if (/\b(?:settle|offer|compromise)\b.*?\b\d{1,2}%\b/i.test(lower)) {
    return { matches: true, isExplicitDollar: false };
  }

  // 3. Phrasal settlement offers without explicit amount
  const phrasalMatch =
    lower.includes("partial settlement") ||
    lower.includes("settlement offer") ||
    lower.includes("offer to settle") ||
    lower.includes("partial payment") ||
    lower.includes("partial reimbursement") ||
    lower.includes("compromise offer") ||
    lower.includes("offer to compromise") ||
    (lower.includes("partial") && lower.includes("offer")) ||
    (lower.includes("partial") && lower.includes("settl"));

  if (phrasalMatch) {
    return { matches: true, isExplicitDollar: false };
  }

  return { matches: false, isExplicitDollar: false };
}

/**
 * Context-aware check for affirmative denial upheld determination.
 * Prevents false-fires on EOB tables like "denied amount: $1,200".
 */
export function isDenialUpheldText(text: string): boolean {
  const lower = (text || "").toLowerCase();
  if (!lower.trim()) return false;

  const positivePatterns = [
    /\bdenial\s+(?:is\s+|was\s+|has\s+been\s+)?(?:upheld|maintained|affirmed|confirmed)\b/,
    /\b(?:adverse|initial|original)?\s*determination\s+(?:is\s+|was\s+|has\s+been\s+)?(?:upheld|affirmed|maintained)\b/,
    /\bupheld\s+(?:the\s+)?(?:denial|determination|adverse\s+decision)\b/,
    /\b(?:appeal|claim|coverage|authorization)\s+(?:is\s+|was\s+|has\s+been\s+)?denied\b/,
    /\bmaintain(?:s|ed|ing)?\s+(?:the\s+)?(?:denial|adverse\s+determination)\b/,
    /\bremain(?:s)?\s+denied\b/,
    /\badverse\s+determination\s+affirmed\b/,
    /\bnot\s+paying\b/,
    /\bain't\s+paying\b/,
    /\brefuse\s+(?:payment|to\s+pay|to\s+reimburse)\b/,
  ];

  if (positivePatterns.some((rx) => rx.test(lower))) {
    return true;
  }

  if (
    lower.includes("upheld") &&
    !lower.includes("not upheld") &&
    !/\b(?:appeal|member|patient)\s+(?:is\s+|was\s+|has\s+been\s+)?upheld\b/.test(lower)
  ) {
    return true;
  }
  if (lower.includes("denial maintained")) {
    return true;
  }

  // If "denied" appears alone, ensure it's an affirmative adjudication and NOT a descriptive field
  if (/\bdenied\b/.test(lower)) {
    const isDescriptiveReferenceOnly =
      /\bdenied\s+(?:amount|charge|charges|service|services|sum|balance|date|code|cpt|line|item)\b/.test(lower) ||
      /\b(?:previously|originally|prior)\s+denied\b/.test(lower);
    const hasAffirmativeDenial =
      /\b(?:claim|appeal|service|request)\s+(?:is|was|has\s+been|remains)\s+denied\b/.test(lower) ||
      /\bdenied\s+upon\s+(?:review|appeal)\b/.test(lower);

    if (hasAffirmativeDenial && !isDescriptiveReferenceOnly) {
      return true;
    }
  }

  return false;
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

  if (isApprovalDeterminationText(text)) return "OVERTURNED_APPROVED";

  const settlementOffer = detectSettlementOffer(text);
  if (settlementOffer.matches) return "PARTIAL_SETTLEMENT_OFFER";

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

  if (isDenialUpheldText(text)) return "DENIAL_UPHELD";

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
