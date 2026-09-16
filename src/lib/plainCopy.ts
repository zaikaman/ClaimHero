/**
 * Plain-language copy dictionary for Option A:
 * Simple by default (everyday user), expert detail behind Details toggle.
 * Route keys and domain logic never change — only surface labels.
 */

export const PLAIN_NAV = {
  radarTitleSimple: "My Cases",
  radarTitleDetailed: "Case Radar",
  radarSubtitleSimple: "Bills the insurer refused to pay",
  radarSubtitleDetailed:
    "Active medical denial records with plan coverage, CPT codes, CARC reason, and statutory ERISA clock.",
  addDenialSimple: "Add denial letter",
  addDenialShortSimple: "Add denial",
  addDenialDetailed: "Ingest Denial",
  activeCasesSimple: "Your cases",
  erisaClockSimple: "Time left",
  settingsSimple: "Settings",
} as const;

export const PLAIN_FLOW_STEPS = {
  evidenceSimple: "1. Your proof",
  evidenceDetailed: "1. Evidence & CPB",
  studioSimple: "2. Your letter",
  studioDetailed: "2. Appeal Brief",
  dispatchSimple: "3. Send & track",
  dispatchDetailed: "3. Payer Dispatch",
  evidenceHintSimple: "Why this denial can be challenged",
  letterHintSimple: "We write it, you approve it",
  dispatchHintSimple: "You approve before anything sends",
} as const;

export const PLAIN_PILLARS: Array<{
  id: string;
  simple: string;
  detailed: string;
  hint: string;
  maxScore: number;
}> = [
  {
    id: "policy_alignment",
    simple: "Their own rules",
    detailed: "Insurer Policy Criteria",
    hint: "Says it should be covered under their published rules",
    maxScore: 35,
  },
  {
    id: "clinical_documentation",
    simple: "Your medical records",
    detailed: "Clinical Records & Step-Therapy",
    hint: "Visits, tests, and treatments already tried",
    maxScore: 25,
  },
  {
    id: "statutory_erisa",
    simple: "Your appeal rights",
    detailed: "Federal ERISA Protections",
    hint: "The law that forces them to show their rules",
    maxScore: 20,
  },
  {
    id: "precedent_strength",
    simple: "Similar cases that won",
    detailed: "Independent Precedent Rulings",
    hint: "Other people who won with the same issue",
    maxScore: 20,
  },
];

export function pillarPlainTitle(category: string, fallback: string): string {
  const found = PLAIN_PILLARS.find((p) => p.id === category);
  return found ? found.simple : fallback;
}

export const PLAIN_TIERS: Record<
  string,
  { simple: string; who: string; detailed: string }
> = {
  level_1_internal: {
    simple: "First appeal — to your insurer",
    who: "Insurer medical team",
    detailed: "Level 1 Internal",
  },
  level_2_grievance: {
    simple: "Second appeal — new review team",
    who: "New review team at insurer",
    detailed: "Level 2 Grievance",
  },
  level_3_external_state_review: {
    simple: "Outside review — your state",
    who: "State program + outside reviewers",
    detailed: "Level 3 External",
  },
};

export const PLAIN_STATUS: Record<string, { simple: string; detailed: string }> = {
  all: { simple: "All", detailed: "All Cases" },
  critical_deadline: { simple: "Needs attention", detailed: "Urgent Alarms (<14d)" },
  ingested: { simple: "New", detailed: "Intake / OCR" },
  parsing: { simple: "New", detailed: "Intake / OCR" },
  analyzing: { simple: "Gathering proof", detailed: "Evidence Crawl" },
  precedent_matched: { simple: "Gathering proof", detailed: "Evidence Crawl" },
  drafting: { simple: "Writing letter", detailed: "Drafting" },
  ready_for_review: { simple: "Ready to send", detailed: "Ready for Dispatch" },
  dispatched: { simple: "Sent", detailed: "Transmitted" },
  under_review: { simple: "Waiting for reply", detailed: "Under Review" },
  escalated: { simple: "Needs next step", detailed: "Escalated" },
  won: { simple: "Won", detailed: "Won / Overturned" },
  lost: { simple: "Denied again", detailed: "Lost" },
};

export function statusSimple(status: string): string {
  return PLAIN_STATUS[status]?.simple ?? status.replace(/_/g, " ");
}
