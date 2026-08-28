/**
 * ClaimHero Domain Constants & Regulatory Rules
 */

// Major Healthcare Insurers & Payers Directory with Verified Statutory Appellate Gateways
export interface PayerAppellateContact {
  id: string;
  name: string;
  domain: string;
  officialAppealsEmail: string;
  intakePortalUrl: string;
  portalName: string;
  appealsFax: string;
  statutoryPoBox: string;
  ediPayerId: string;
  tollFreeHelpline: string;
  isVerified: boolean;
  submissionPolicyNote: string;
}

export const VERIFIED_PAYER_DIRECTORY: Record<string, PayerAppellateContact> = {
  unitedhealthcare: {
    id: "uhc",
    name: "UnitedHealthcare",
    domain: "uhc.com",
    officialAppealsEmail: "uhc_appeals@uhc.com",
    intakePortalUrl: "https://www.uhcprovider.com/en/claims-payments/claims-appeals.html",
    portalName: "UHC Provider Portal & MyUHC Appeals Gateway",
    appealsFax: "1-855-899-7400",
    statutoryPoBox: "P.O. Box 30432, Salt Lake City, UT 84130-0432",
    ediPayerId: "87726",
    tollFreeHelpline: "1-800-842-1609",
    isVerified: true,
    submissionPolicyNote: "UHC mandates formal appeals via Online Portal, Appellate Fax, or Certified Mail. Public inboxes are rejected by payer filters.",
  },
  aetna: {
    id: "aetna",
    name: "Aetna (CVS Health)",
    domain: "aetna.com",
    officialAppealsEmail: "crga@aetna.com",
    intakePortalUrl: "https://www.aetna.com/provider/dispute-appeals.html",
    portalName: "Aetna Provider Dispute & Grievance Portal",
    appealsFax: "1-859-455-8650",
    statutoryPoBox: "P.O. Box 14463, Lexington, KY 40512",
    ediPayerId: "60054",
    tollFreeHelpline: "1-800-624-0756",
    isVerified: true,
    submissionPolicyNote: "Aetna requires submission via Provider Portal, Appellate Fax, or Certified Mail to the Lexington KY Center.",
  },
  cigna: {
    id: "cigna",
    name: "Cigna Healthcare",
    domain: "cigna.com",
    officialAppealsEmail: "nationalappealsunit@cigna.com",
    intakePortalUrl: "https://cignaforhcp.cigna.com",
    portalName: "Cigna for Health Care Professionals Portal",
    appealsFax: "1-877-815-4827",
    statutoryPoBox: "P.O. Box 188011, Chattanooga, TN 37422",
    ediPayerId: "62308",
    tollFreeHelpline: "1-800-882-4462",
    isVerified: true,
    submissionPolicyNote: "Cigna accepts appeals via Cigna for HCP Portal, Appellate Fax, or National Appeals Unit PO Box.",
  },
  bcbs: {
    id: "bcbs",
    name: "Blue Cross Blue Shield",
    domain: "bcbs.com",
    officialAppealsEmail: "grievanceappeals@anthem.com",
    intakePortalUrl: "https://www.anthem.com/provider/appeals",
    portalName: "Anthem Provider Appeals Gateway",
    appealsFax: "1-888-291-7299",
    statutoryPoBox: "P.O. Box 105568, Atlanta, GA 30348",
    ediPayerId: "47198",
    tollFreeHelpline: "1-800-676-2583",
    isVerified: true,
    submissionPolicyNote: "BCBS/Anthem accepts appeals via Online Portal, Certified Fax, or Grievance PO Box.",
  },
  humana: {
    id: "humana",
    name: "Humana",
    domain: "humana.com",
    officialAppealsEmail: "humana_appeals@humana.com",
    intakePortalUrl: "https://www.humana.com/provider/claims/appeals",
    portalName: "Humana Provider Claims & Appeals Portal",
    appealsFax: "1-800-267-2577",
    statutoryPoBox: "P.O. Box 14546, Lexington, KY 40512",
    ediPayerId: "61101",
    tollFreeHelpline: "1-800-448-6262",
    isVerified: true,
    submissionPolicyNote: "Humana accepts submissions via Portal, Appellate Fax, or Lexington Appeals Department PO Box.",
  },
  kaiser: {
    id: "kaiser",
    name: "Kaiser Permanente",
    domain: "kp.org",
    officialAppealsEmail: "appeals-grievances@kp.org",
    intakePortalUrl: "https://healthy.kaiserpermanente.org/support/appeals",
    portalName: "Kaiser Permanente Expedited Appeals Portal",
    appealsFax: "1-888-988-2674",
    statutoryPoBox: "P.O. Box 23088, Oakland, CA 94623",
    ediPayerId: "94144",
    tollFreeHelpline: "1-800-464-4000",
    isVerified: true,
    submissionPolicyNote: "Kaiser expedited appeals are accepted via Online Portal, Fax, or Oakland Expedited Appeals PO Box.",
  },
};

export const getPayerAppellateContact = (payerName?: string): PayerAppellateContact => {
  if (!payerName) {
    return {
      id: "unknown",
      name: "Health Insurer",
      domain: "insurance-payer.com",
      officialAppealsEmail: "appeals@insurance-payer.com",
      intakePortalUrl: "https://www.insurance-payer.com/appeals",
      portalName: "Insurer Grievance & Appeals Gateway",
      appealsFax: "1-800-555-0198",
      statutoryPoBox: "Grievance & Appeals Department",
      ediPayerId: "EDI-UNKNOWN",
      tollFreeHelpline: "1-800-555-0199",
      isVerified: false,
      submissionPolicyNote: "Standard submission via Provider Portal, Certified Mail, or Appellate Fax.",
    };
  }

  const clean = payerName.toLowerCase().replace(/[^a-z0-9]/g, "");

  if (clean.includes("united") || clean.includes("uhc") || clean.includes("optum")) {
    return VERIFIED_PAYER_DIRECTORY.unitedhealthcare;
  }
  if (clean.includes("aetna") || clean.includes("cvs")) {
    return VERIFIED_PAYER_DIRECTORY.aetna;
  }
  if (clean.includes("cigna") || clean.includes("evernorth")) {
    return VERIFIED_PAYER_DIRECTORY.cigna;
  }
  if (clean.includes("blue") || clean.includes("bcbs") || clean.includes("anthem") || clean.includes("elevance")) {
    return VERIFIED_PAYER_DIRECTORY.bcbs;
  }
  if (clean.includes("humana")) {
    return VERIFIED_PAYER_DIRECTORY.humana;
  }
  if (clean.includes("kaiser")) {
    return VERIFIED_PAYER_DIRECTORY.kaiser;
  }

  return {
    id: clean,
    name: payerName,
    domain: `${clean}.com`,
    officialAppealsEmail: `appeals-resolution@${clean}.com`,
    intakePortalUrl: `https://www.${clean}.com/appeals`,
    portalName: `${payerName} Official Appeals Portal`,
    appealsFax: "1-800-555-0198",
    statutoryPoBox: `${payerName} Appeals & Grievances Unit`,
    ediPayerId: "EDI-AUTO",
    tollFreeHelpline: "1-800-555-0199",
    isVerified: false,
    submissionPolicyNote: "Official submission accepted via Online Portal, Certified Mail, or Appellate Fax.",
  };
};

export const INSURERS = Object.values(VERIFIED_PAYER_DIRECTORY);

// Common CARC (Claim Adjustment Reason Codes) & Descriptions
export const DENIAL_REASON_CODES: Record<string, { code: string; title: string; description: string; overturnCategory: string }> = {
  "CO-50": {
    code: "CO-50",
    title: "Non-Covered Procedure / Deemed Not Medically Necessary",
    description: "These are non-covered services because this is not deemed a 'medical necessity' by the payer.",
    overturnCategory: "Clinical Necessity Proof & CPB Contradiction",
  },
  "CO-197": {
    code: "CO-197",
    title: "Precertification / Prior Authorization Lacking",
    description: "Precertification / authorization / notification / pre-treatment absence or exceeded bounds.",
    overturnCategory: "Retroactive Authorization & Emergency Exception",
  },
  "CO-16": {
    code: "CO-16",
    title: "Claim Lacks Required Information",
    description: "Claim / service lacks information or has submission error. Additional clinical records needed.",
    overturnCategory: "Supplemental Medical Records & Physician Attestation",
  },
  "CO-96": {
    code: "CO-96",
    title: "Non-Covered Charge(s)",
    description: "Charges are deemed non-covered under the patient's existing health benefit plan rider.",
    overturnCategory: "Plan Benefit Schedule & ERISA Rider Cross-Check",
  },
  "CO-4": {
    code: "CO-4",
    title: "Procedure Code Inconsistent with Modifier",
    description: "The procedure code is inconsistent with the modifier used or a required modifier is missing.",
    overturnCategory: "Coding Review & Modifiers Rectification",
  },
  "CO-18": {
    code: "CO-18",
    title: "Exact Duplicate Claim / Service",
    description: "Payer flagged service as already billed and processed on a previous submission.",
    overturnCategory: "Separate Distinct Procedural Encounter Verification",
  },
};

// Common CPT Codes Dictionary
export const CPT_CODES: Record<string, { code: string; name: string; category: string; averageBilled: number }> = {
  "27447": {
    code: "27447",
    name: "Total Knee Arthroplasty (TKA)",
    category: "Orthopedic Surgery",
    averageBilled: 24500,
  },
  "63047": {
    code: "63047",
    name: "Laminectomy / Facetectomy (Lumbar Spine)",
    category: "Neurosurgery / Spine",
    averageBilled: 18200,
  },
  "73721": {
    code: "73721",
    name: "MRI Lower Extremity Joint Without Contrast",
    category: "Diagnostic Radiology",
    averageBilled: 2850,
  },
  "99214": {
    code: "99214",
    name: "Office / Outpatient Visit Moderate Complexity",
    category: "Evaluation & Management",
    averageBilled: 215,
  },
  "29881": {
    code: "29881",
    name: "Arthroscopy Knee Meniscectomy",
    category: "Orthopedic Surgery",
    averageBilled: 8900,
  },
};

// ERISA & Statutory Regulations
export const STATUTORY_REGULATIONS = {
  ERISA_CITATION: "29 CFR § 2560.503-1",
  ERISA_TITLE: "Employee Retirement Income Security Act Claims Procedure Rule",
  DEADLINE_DAYS_INTERNAL_APPEAL: 180, // 180 days from receipt of initial denial
  PAYER_RESPONSE_STANDARD_DAYS: 30, // 30 days for pre-service / post-service claims
  PAYER_RESPONSE_URGENT_HOURS: 72, // 72 hours for urgent care
  EXTERNAL_REVIEW_DAYS: 120, // 4 months for state/federal external review
};

// Claim Processing Statuses
export type ClaimStatus =
  | "ingested"
  | "parsing"
  | "analyzing"
  | "precedent_matched"
  | "drafting"
  | "ready_for_review"
  | "dispatched"
  | "won"
  | "lost"
  | "escalated";

export const CLAIM_STATUS_CONFIG: Record<
  ClaimStatus,
  { label: string; color: string; bg: string; border: string; glow: string }
> = {
  ingested: {
    label: "Ingested",
    color: "text-slate-300",
    bg: "bg-slate-800/60",
    border: "border-slate-700",
    glow: "shadow-none",
  },
  parsing: {
    label: "OCR Parsing",
    color: "text-cyan-400",
    bg: "bg-cyan-950/40",
    border: "border-cyan-500/40",
    glow: "shadow-cyan-glow",
  },
  analyzing: {
    label: "CPB Crawling",
    color: "text-indigo-400",
    bg: "bg-indigo-950/40",
    border: "border-indigo-500/40",
    glow: "shadow-none",
  },
  precedent_matched: {
    label: "Precedent Matched",
    color: "text-emerald-400",
    bg: "bg-emerald-950/40",
    border: "border-emerald-500/40",
    glow: "shadow-emerald-glow",
  },
  drafting: {
    label: "AI Drafting",
    color: "text-amber-400",
    bg: "bg-amber-950/40",
    border: "border-amber-500/40",
    glow: "shadow-amber-glow",
  },
  ready_for_review: {
    label: "Ready for Review",
    color: "text-cyan-300",
    bg: "bg-cyan-900/40",
    border: "border-cyan-400/60",
    glow: "shadow-cyan-glow",
  },
  dispatched: {
    label: "Dispatched",
    color: "text-purple-400",
    bg: "bg-purple-950/40",
    border: "border-purple-500/40",
    glow: "shadow-none",
  },
  won: {
    label: "Overturned / Won",
    color: "text-emerald-300",
    bg: "bg-emerald-900/60",
    border: "border-emerald-400",
    glow: "shadow-emerald-glow",
  },
  lost: {
    label: "Upheld / Lost",
    color: "text-rose-400",
    bg: "bg-rose-950/40",
    border: "border-rose-500/40",
    glow: "shadow-crimson-glow",
  },
  escalated: {
    label: "DOI Escalated",
    color: "text-rose-300",
    bg: "bg-rose-900/60",
    border: "border-rose-400",
    glow: "shadow-crimson-glow",
  },
};

// Simulation Stages for the 1-Click Live Judge Demo
export const SIMULATION_STAGES = [
  {
    stage: 1,
    id: "ingestion",
    title: "Denial Document OCR & Optical Extraction",
    description: "Ingesting $24,500 Knee Replacement Surgery Denial (CPT 27447, Code CO-50) from UnitedHealthcare",
    durationMs: 3000,
  },
  {
    stage: 2,
    id: "crawling",
    title: "Firecrawl Insurer CPB & Clinical Policy Crawl",
    description: "Crawling UnitedHealthcare Policy 2024T001 & extracting conservative therapy criteria contradiction",
    durationMs: 3000,
  },
  {
    stage: 3,
    id: "matching",
    title: "Precedent Cross-Examination & Win Scoring",
    description: "Cross-matching clinical evidence against 3 winning precedents -> 91% Overturn Probability Score",
    durationMs: 3000,
  },
  {
    stage: 4,
    id: "synthesis",
    title: "Air tight Cited Appeal Brief Synthesis",
    description: "Synthesizing 4-page medical appeal citing ERISA 29 CFR § 2560.503-1 and CPB criteria",
    durationMs: 3000,
  },
  {
    stage: 5,
    id: "dispatch",
    title: "Autonomous Dispatch & Statutory Clock Lock",
    description: "Transmitting appeal packet to payer grievance endpoint & initiating 30-day statutory response clock",
    durationMs: 3000,
  },
];
