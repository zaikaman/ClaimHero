/**
 * ClaimHero Domain Constants & Regulatory Rules
 */

// Major Healthcare Insurers & Payers Directory with Verified Statutory Appellate Gateways
export interface PayerAppellateContact {
  id: string;
  name: string;
  domain: string;
  officialAppealsEmail?: string;
  intakePortalUrl?: string;
  portalName?: string;
  appealsFax?: string;
  statutoryPoBox?: string;
  ediPayerId?: string;
  tollFreeHelpline?: string;
  isVerified: boolean;
  submissionPolicyNote?: string;
}

export const VERIFIED_PAYER_DIRECTORY: Record<string, PayerAppellateContact> = {
  molina: {
    id: "molina",
    name: "Molina Healthcare",
    domain: "molinahealthcare.com",
    officialAppealsEmail: "MFLGrievanceandAppealsDepartment@MolinaHealthcare.com",
    intakePortalUrl: "https://member.molinahealthcare.com",
    portalName: "MyMolina Grievance & Appeals Gateway",
    appealsFax: "1-877-508-5748",
    statutoryPoBox: "Molina Healthcare of Florida, Grievance and Appeals Dept., P.O. Box 521838, Longwood, FL 32752",
    ediPayerId: "51062",
    tollFreeHelpline: "1-888-560-5716",
    isVerified: true,
    submissionPolicyNote: "Molina Healthcare accepts formal written appeals and grievance submissions directly via its dedicated state appeals email (MFLGrievanceandAppealsDepartment@MolinaHealthcare.com), MyMolina portal, or appellate fax.",
  },
  geoblue: {
    id: "geoblue",
    name: "GeoBlue (BCBS Global)",
    domain: "geo-blue.com",
    officialAppealsEmail: "claims@geo-blue.com",
    intakePortalUrl: "https://www.geo-blue.com",
    portalName: "GeoBlue Member & Claims Portal",
    appealsFax: "1-610-482-9623",
    statutoryPoBox: "GeoBlue Claims Appeals Unit, One Radnor Corporate Center, Suite 100, Radnor, PA 19087",
    ediPayerId: "GEO01",
    tollFreeHelpline: "1-855-282-3517",
    isVerified: true,
    submissionPolicyNote: "GeoBlue (Blue Cross Blue Shield Global licensee) accepts direct claim disputes, appeal packets, and clinical records via its official appeals email (claims@geo-blue.com) or portal.",
  },
  bcbsglobal: {
    id: "bcbsglobal",
    name: "Blue Cross Blue Shield Global Core",
    domain: "bcbsglobalcore.com",
    officialAppealsEmail: "claims@bcbsglobalcore.com",
    intakePortalUrl: "https://www.bcbsglobalcore.com",
    portalName: "BCBS Global Core Service Center Portal",
    appealsFax: "1-804-673-1179",
    statutoryPoBox: "BCBS Global Core Service Center, P.O. Box 2048, Richmond, VA 23218-2048",
    ediPayerId: "BCBSG",
    tollFreeHelpline: "1-800-810-2583",
    isVerified: true,
    submissionPolicyNote: "BCBS Global Core explicitly accepts itemized international medical claim disputes and formal appeal submissions via its dedicated claims email (claims@bcbsglobalcore.com).",
  },
  unitedhealthcare: {
    id: "uhc",
    name: "UnitedHealthcare",
    domain: "uhc.com",
    intakePortalUrl: "https://www.uhcprovider.com/en/claims-payments-billing/appeals.html",
    portalName: "UHC Provider Appeals & Grievance Portal",
    appealsFax: "1-855-899-7400",
    statutoryPoBox: "P.O. Box 30432, Salt Lake City, UT 84130-0432",
    ediPayerId: "87726",
    tollFreeHelpline: "1-800-842-1609",
    isVerified: true,
    submissionPolicyNote: "UHC mandates formal appeals via UHCprovider.com portal, fax, or certified mail. Unencrypted emails are rejected by payer filters.",
  },
  aetna: {
    id: "aetna",
    name: "Aetna (CVS Health)",
    domain: "aetna.com",
    intakePortalUrl: "",
    portalName: "",
    appealsFax: "1-859-455-8650",
    statutoryPoBox: "Aetna Provider Resolution Team, P.O. Box 14020, Lexington, KY 40512",
    ediPayerId: "60054",
    tollFreeHelpline: "1-800-624-0756",
    isVerified: true,
    submissionPolicyNote: "Aetna does not accept appeals via portal or email. Formal submissions must be sent via Appellate Fax (1-859-455-8650) or Mail to Lexington, KY (P.O. Box 14020).",
  },
  cigna: {
    id: "cigna",
    name: "Cigna Healthcare",
    domain: "cigna.com",
    intakePortalUrl: "https://www.cigna.com/health-care-providers/coverage-and-claims/appeals-disputes",
    portalName: "CignaforHCP / myCigna Appeals Portal",
    appealsFax: "1-877-804-1679",
    statutoryPoBox: "Cigna National Appeals, P.O. Box 188062, Chattanooga, TN 37422",
    ediPayerId: "62308",
    tollFreeHelpline: "1-800-882-4462",
    isVerified: true,
    submissionPolicyNote: "Cigna accepts appeals via CignaforHCP / myCigna portal, appellate fax (1-877-804-1679), or P.O. Box in Chattanooga, TN. Standard medical emails are strictly rejected.",
  },
  bcbs: {
    id: "bcbs",
    name: "Blue Cross Blue Shield",
    domain: "bcbs.com",
    intakePortalUrl: "https://providers.anthem.com/california-provider/contact-us",
    portalName: "Anthem Provider Portal (Availity Essentials)",
    appealsFax: "1-866-587-3316",
    statutoryPoBox: "Anthem Grievances and Appeals, P.O. Box 1407, Church Street Station, New York, NY 10008",
    ediPayerId: "47198",
    tollFreeHelpline: "1-800-676-2583",
    isVerified: true,
    submissionPolicyNote: "Anthem/Elevance requires appeals through the Availity portal or appellate fax (1-866-587-3316). Standard commercial plans reject email.",
  },
  humana: {
    id: "humana",
    name: "Humana",
    domain: "humana.com",
    intakePortalUrl: "https://resolutions.humana.com/",
    portalName: "Humana Resolutions Portal",
    appealsFax: "1-800-949-2961",
    statutoryPoBox: "Humana Grievances and Appeals, P.O. Box 14165, Lexington, KY 40512",
    ediPayerId: "61101",
    tollFreeHelpline: "1-800-448-6262",
    isVerified: true,
    submissionPolicyNote: "Upload documentation directly through the Humana Resolutions Portal (resolutions.humana.com) or submit via Medical Appeals Fax (1-800-949-2961).",
  },
  kaiser: {
    id: "kaiser",
    name: "Kaiser Permanente",
    domain: "kp.org",
    intakePortalUrl: "https://healthy.kaiserpermanente.org/community-providers/permanente-advantage/contact-us",
    portalName: "Kaiser Community Provider Portal",
    appealsFax: "1-626-405-3039",
    statutoryPoBox: "Kaiser Permanente Appeals Department, P.O. Box 30766, Salt Lake City, UT 84130",
    ediPayerId: "94144",
    tollFreeHelpline: "1-800-464-4000",
    isVerified: true,
    submissionPolicyNote: "Kaiser central intake accepts submissions through the Community Provider Portal, Fax (1-626-405-3039), or Salt Lake City PO Box.",
  },
};

export const getPayerAppellateContact = (payerName?: string): PayerAppellateContact => {
  if (!payerName) {
    return {
      id: "unknown",
      name: "Health Insurer",
      domain: "",
      isVerified: false,
      submissionPolicyNote: "Payer contact details not yet resolved.",
    };
  }

  const clean = payerName.toLowerCase().replace(/[^a-z0-9]/g, "");

  if (clean.includes("molina")) {
    return VERIFIED_PAYER_DIRECTORY.molina;
  }
  if (clean.includes("geoblue") || clean.includes("geo-blue")) {
    return VERIFIED_PAYER_DIRECTORY.geoblue;
  }
  if (clean.includes("bcbsglobal") || clean.includes("globalcore") || clean.includes("bcbsglobalcore")) {
    return VERIFIED_PAYER_DIRECTORY.bcbsglobal;
  }
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
    domain: "",
    isVerified: false,
    submissionPolicyNote: "Payer contact details not in preset directory. Awaiting Firecrawl discovery or denial letter OCR.",
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
    description: "Ingesting $24,500 Knee Replacement Surgery Denial (CPT 27447, Code CO-50) from Molina Healthcare",
    durationMs: 3000,
  },
  {
    stage: 2,
    id: "crawling",
    title: "Insurer CPB & Clinical Policy Indexing",
    description: "Indexing Molina Healthcare Clinical Policy MCP-082 & extracting conservative therapy criteria contradiction",
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

export interface SampleCasePreset {
  id: string;
  title: string;
  payer: string;
  amount: string;
  cpt: string;
  carc: string;
  badge?: string;
  content: string;
  sender: {
    name: string;
    credentials: string;
    email: string;
    phone: string;
  };
  questions: Array<{
    field: "symptomsAndFunctionalImpact" | "examinationFindings" | "imagingAndDiagnostics" | "treatmentHistoryAndResponse" | "otherDocumentedFacts";
    question: string;
    whyItMatters: string;
  }>;
  clinicalFacts: {
    symptomsAndFunctionalImpact: string;
    examinationFindings: string;
    imagingAndDiagnostics: string;
    treatmentHistoryAndResponse: string;
    otherDocumentedFacts: string;
    recordsAreIncomplete: boolean;
  };
  physicianNotes: string;
}

export const SAMPLE_CASE_PRESETS: SampleCasePreset[] = [
  {
    id: "molina_knee",
    title: "Molina Healthcare — Total Knee Arthroplasty",
    payer: "Molina Healthcare",
    amount: "$24,500",
    cpt: "27447",
    carc: "CO-50 (Not Medically Necessary)",
    badge: "Recommended",
    content: `MOLINA HEALTHCARE OF FLORIDA
EXPLANATION OF BENEFITS / NOTICE OF ADVERSE BENEFIT DETERMINATION
Claim Reference: CLM-8942-MOL
Member ID: MOL-982341-01
Patient Name: Eleanor Vance
Date of Birth: 1968-04-14
Date of Service: 06/12/2026
Treating Provider: Dr. Robert Langston, MD (Advanced Orthopedic Institute)
Facility: Sunstate Surgical Hospital

Services Rendered:
- CPT Code 27447: Total Knee Arthroplasty (TKA), right knee
- ICD-10 Code M17.11: Primary osteoarthritis, right knee
- Total Billed Amount: $24,500.00
- Plan Allowance / Paid: $0.00
- Denied Amount: $24,500.00
- Patient Financial Liability: $24,500.00

Adjudication & Claim Denial Reason:
Code CO-50: These are non-covered services because this is not deemed a medical necessity by the payer.
Clinical Rationale: Under Molina Healthcare Clinical Coverage Guideline MCP-082, total knee arthroplasty requires documented failure of at least 12 weeks of non-surgical conservative therapy (including formal physical therapy, intra-articular corticosteroid injections, and prescription NSAIDs). Clinical records submitted fail to establish consecutive supervised physical therapy.

Statutory Notice of Appeal Rights:
You have the right to an internal appeal pursuant to ERISA 29 CFR § 2560.503-1 and ACA 45 CFR § 147.136. You must submit your written appeal within 180 calendar days from the date of this determination notice.
Appeals Intake Destination:
Email: MFLGrievanceandAppealsDepartment@MolinaHealthcare.com
Mailing Address: Molina Healthcare of Florida, Grievance and Appeals Dept., P.O. Box 521838, Longwood, FL 32752
Appeals Fax: 1-877-508-5748`,
    sender: {
      name: "Jordan Lee",
      credentials: "Appeals Coordinator",
      email: "jordan.lee@orthoclinic.org",
      phone: "(555) 234-8901",
    },
    questions: [
      {
        field: "symptomsAndFunctionalImpact",
        question: "What specific symptoms and functional limitations are documented in the clinical record regarding the patient's right knee osteoarthritis? Leave blank if not documented.",
        whyItMatters: "Documents severe chronic pain and functional impairment requiring arthroplasty.",
      },
      {
        field: "examinationFindings",
        question: "What objective physical examination findings are documented in the clinical record for the right knee? Leave blank if not documented.",
        whyItMatters: "Provides objective clinical data supporting severe degenerative joint disease.",
      },
      {
        field: "imagingAndDiagnostics",
        question: "What are the date and findings of the most recent weight-bearing plain radiograph of the knee documented in the record? Leave blank if not documented.",
        whyItMatters: "Directly addresses the radiographic severity requirements cited in Molina MCP-082.",
      },
      {
        field: "treatmentHistoryAndResponse",
        question: "What prior conservative treatments (including physical therapy, injections, and NSAIDs) are documented in the clinical record, and what was the documented response? Leave blank if not documented.",
        whyItMatters: "Directly addresses the 12-week conservative therapy requirement cited in the denial.",
      },
      {
        field: "otherDocumentedFacts",
        question: "Are there any other relevant clinical facts documented in the record regarding this knee condition? Leave blank if not documented.",
        whyItMatters: "Allows for the inclusion of treating surgeon attestation and clinical necessity documentation.",
      },
    ],
    clinicalFacts: {
      symptomsAndFunctionalImpact: "Patient exhibits end-stage right knee osteoarthritic pain (8/10 VAS) with severe functional limitations: ambulation distance restricted to <50 feet, inability to negotiate stairs, and progressive loss of independence in activities of daily living (ADLs).",
      examinationFindings: "Severe medial and lateral joint line tenderness, coarse crepitus through active/passive range of motion, fixed flexion contracture of 10 degrees with maximum flexion limited to 95 degrees, and moderate persistent joint effusion.",
      imagingAndDiagnostics: "Weight-bearing bilateral knee radiographs (05/10/2026) show severe tricompartmental osteoarthritis with bone-on-bone medial joint space obliteration (Kellgren-Lawrence Grade IV), subchondral sclerosis, and marked marginal osteophytes.",
      treatmentHistoryAndResponse: "Completed 16 consecutive weeks of formal outpatient physical therapy (2x/weekly, Jan-Apr 2026) with documented failure to relieve symptoms; 6-month trial of prescription meloxicam 15mg daily; and two intra-articular steroid injections (02/15/2026, 05/01/2026) yielding only transient relief (<2 weeks).",
      otherDocumentedFacts: "Dr. Robert Langston, MD certified that conservative modalities have been fully exhausted and total knee arthroplasty is medically necessary under Molina Guideline MCP-082.",
      recordsAreIncomplete: false,
    },
    physicianNotes: `PATIENT: Eleanor Vance | DOB: 04/14/1968 | DOS: 06/12/2026
TREATING PHYSICIAN CLINICAL ATTESTATION & CONSERVATIVE THERAPY RECORD:
Patient Eleanor Vance is a 58-year-old female presenting with severe end-stage tricompartmental right knee osteoarthritis (Kellgren-Lawrence Grade IV) with bone-on-bone medial joint space obliteration, marked marginal osteophytes, and fixed flexion contracture of 10 degrees (maximum flexion limited to 95 degrees).

CONSERVATIVE THERAPY MODALITIES COMPLETED & FAILED:
1. Supervised Physical Therapy: Completed 16 consecutive weeks of formal outpatient physical therapy (2 sessions/week from 01/06/2026 through 04/28/2026 at Sunstate Rehabilitation; 32 total sessions completed). Therapy discharge summary demonstrates zero functional improvement and persistent 8/10 VAS pain restricting ambulation to <50 feet.
2. Pharmacotherapy: 6-month therapeutic course of prescription Meloxicam (15 mg PO daily) with inadequate analgesic response and secondary gastrointestinal intolerance.
3. Intra-articular Injections: Underwent two image-guided right knee corticosteroid injections (Triamcinolone acetonide 40 mg on 02/15/2026 and 05/01/2026) providing only transient partial relief (<14 days duration).

CLINICAL NECESSITY DETERMINATION:
Under Molina Healthcare Clinical Coverage Guideline MCP-082, the patient has completely exhausted all non-operative conservative modalities. Right Total Knee Arthroplasty (CPT 27447) is urgently medically necessary to restore basic weight-bearing ambulation and prevent progressive functional deterioration.

Attending Orthopedic Surgeon: Dr. Robert Langston, MD, FAAOS (Sunstate Surgical Hospital)`,
  },
  {
    id: "geoblue_spine",
    title: "GeoBlue (BCBS Global) — Lumbar Decompression",
    payer: "GeoBlue",
    amount: "$18,200",
    cpt: "63047",
    carc: "CO-197 (Prior Auth Lacking)",
    badge: "High Value",
    content: `GEOBLUE WORLDWIDE MEDICAL INSURANCE
NOTICE OF CLAIM ADVERSE DETERMINATION & BENEFIT SUMMARY
Claim Reference: CLM-6104-GEO
Member ID: GEO-554210-99
Patient Name: Marcus Sterling
Date of Service: 07/04/2026
Provider: Dr. Sarah Chen, MD (Spine & Neurosurgery Associates)
Facility: International Spine Institute

Procedure & Clinical Codes:
- CPT 63047: Laminectomy, facetectomy and foraminotomy with decompression of spinal cord, single segment lumbar
- ICD-10 M51.26: Other intervertebral disc displacement, lumbar region
- Total Billed: $18,200.00
- Amount Denied: $18,200.00
- Patient Responsibility: $18,200.00

Denial Adjudication Reason:
Code CO-197: Precertification / prior authorization / notification absent or lacking.
Description: Surgical treatment for lumbar spinal stenosis was performed without securing prior authorization from GeoBlue Medical Review Department prior to the date of service.

Appeals Procedure & Filing Instructions:
In accordance with federal regulations under 29 CFR § 2560.503-1, you or your authorized representative have 180 days from receipt of this notice to file a Level 1 appeal demonstrating emergency medical necessity or retroactive pre-authorization criteria under Policy SURG.00011.
Submit complete appeal dossier and clinical records to:
Official Claims & Appeals Email: claims@geo-blue.com
Mailing Address: GeoBlue Claims Appeals Unit, One Radnor Corporate Center, Suite 100, Radnor, PA 19087
Appeals Fax: 1-610-482-9623`,
    sender: {
      name: "Alex Morgan",
      credentials: "Surgical Case Coordinator",
      email: "alex.morgan@spineinstitute.org",
      phone: "(555) 456-7890",
    },
    questions: [
      {
        field: "symptomsAndFunctionalImpact",
        question: "What specific symptoms, functional limitations, or neurological deficits are documented in the record for the lumbar spine? Leave blank if not documented.",
        whyItMatters: "Establishes the urgent clinical indication for decompression surgery.",
      },
      {
        field: "examinationFindings",
        question: "What objective physical examination and neurological findings are documented in the clinical record? Leave blank if not documented.",
        whyItMatters: "Provides objective motor strength, reflex, and sensory deficit findings.",
      },
      {
        field: "imagingAndDiagnostics",
        question: "What are the date and findings of the most recent diagnostic imaging (MRI/CT) of the lumbar spine in the record? Leave blank if not documented.",
        whyItMatters: "Directly addresses anatomical compression and surgical necessity criteria under Policy SURG.00011.",
      },
      {
        field: "treatmentHistoryAndResponse",
        question: "What prior treatments and clinical deterioration timeline are documented prior to surgery? Leave blank if not documented.",
        whyItMatters: "Documents conservative therapy attempts and sudden rapid progression necessitating urgent intervention.",
      },
      {
        field: "otherDocumentedFacts",
        question: "Are there any other relevant clinical facts documented regarding the emergency nature of the procedure? Leave blank if not documented.",
        whyItMatters: "Provides attending surgeon emergency attestation explaining lack of prior authorization.",
      },
    ],
    clinicalFacts: {
      symptomsAndFunctionalImpact: "Acute onset of intractable right lower extremity radiculopathy in L5-S1 distribution with rapid progression to motor weakness and right foot drop over 48 hours. Patient unable to ambulate or bear weight safely.",
      examinationFindings: "Neurological examination demonstrates right foot drop with extensor hallucis longus and tibialis anterior weakness (grade 3/5), positive straight leg raise test on right at 30 degrees, absent right Achilles reflex (0/2), and L5-S1 hypoesthesia.",
      imagingAndDiagnostics: "Emergency lumbar spine MRI (06/28/2026) demonstrated acute extruded L5-S1 right paracentral disc herniation causing high-grade central canal stenosis and acute impingement of the traversing right S1 nerve root.",
      treatmentHistoryAndResponse: "Patient was undergoing conservative outpatient physical therapy and oral analgesics, but suffered sudden neurological deterioration requiring emergency surgical decompression to prevent irreversible nerve root damage.",
      otherDocumentedFacts: "Attending neurosurgeon Dr. Sarah Chen, MD documented that emergency decompression was immediately necessary within 24 hours to prevent permanent foot drop, satisfying retroactive authorization criteria under GeoBlue Policy SURG.00011.",
      recordsAreIncomplete: false,
    },
    physicianNotes: `PATIENT: Marcus Sterling | DOB: 11/22/1974 | DOS: 07/04/2026
ATTENDING NEUROSURGEON EMERGENCY CLINICAL ATTESTATION:
Patient Marcus Sterling presented on an emergency basis with acute intractable right lower extremity radiculopathy in the L5-S1 dermatomal distribution accompanied by acute progressive neurological deterioration over a 48-hour window.

CLINICAL EXAMINATION & NEUROLOGICAL DEFICITS:
1. Motor Deficits: Objective right foot drop with extensor hallucis longus (EHL) and tibialis anterior motor strength graded 3/5 (against gravity only, no resistance).
2. Reflexes & Sensory: Absent right Achilles deep tendon reflex (0/2), positive straight leg raise test at 30 degrees on right, and marked hypoesthesia across right lateral foot and S1 distribution.
3. Diagnostic MRI: Emergency lumbar MRI (06/28/2026) revealed acute large extruded L5-S1 right paracentral disc herniation resulting in severe central canal stenosis and acute severe impingement of the traversing right S1 nerve root.

EMERGENCY SURGICAL INDICATION & RETROACTIVE PRE-AUTHORIZATION:
In accordance with GeoBlue Policy SURG.00011 and prudent layperson emergency standards, emergency lumbar laminectomy, facetectomy, and foraminotomy (CPT 63047) was immediately indicated within 24 hours to prevent permanent motor paralysis and irreversible nerve root ischemia. Awaiting prospective commercial prior authorization was medically contraindicated and posed immediate threat of permanent disability.

Attending Neurosurgeon: Dr. Sarah Chen, MD, FAANS (Spine & Neurosurgery Associates)`,
  },
  {
    id: "bcbsglobal_mri",
    title: "BCBS Global Core — Knee MRI Scan",
    payer: "Blue Cross Blue Shield Global Core",
    amount: "$2,850",
    cpt: "73721",
    carc: "CO-16 (Missing Plain Radiographs)",
    badge: "Imaging Criteria",
    content: `BLUE CROSS BLUE SHIELD GLOBAL CORE
ADVERSE CLAIM ADJUDICATION NOTICE
Claim Number: CLM-3912-BCG
Member: Michael Patel (ID: BCG-773419-02)
Date of Service: 07/18/2026
Provider: Global Diagnostic Imaging Group

Services:
- CPT 73721: Magnetic resonance imaging, any joint of lower extremity; without contrast material (Knee MRI)
- ICD-10 M23.22: Derangement of meniscus due to old tear or injury, right knee
- Billed: $2,850.00
- Paid: $0.00
- Denied: $2,850.00
- Patient Due: $2,850.00

Denial Rationale:
Code CO-16: Claim lacks information or has submission error.
Coverage Policy RAD.00002 requires documented weight-bearing plain radiographs performed within the preceding 6 months prior to approval of magnetic resonance imaging for non-acute knee pain.

Statutory Rights & Appeal Submission:
You have 180 days to request an administrative ERISA reconsideration under 29 CFR § 2560.503-1.
Submit formal appeal memorandum and physician attestation to:
Appeals Intake Email: claims@bcbsglobalcore.com
Service Center Address: BCBS Global Core Service Center, P.O. Box 2048, Richmond, VA 23218-2048
Appeals Fax: 1-804-673-1179`,
    sender: {
      name: "Taylor Reed",
      credentials: "Appeals Specialist",
      email: "taylor.reed@diagnosticimaging.org",
      phone: "(555) 789-0123",
    },
    questions: [
      {
        field: "symptomsAndFunctionalImpact",
        question: "What specific symptoms and functional limitations are documented in the clinical record regarding the patient's knee? Leave blank if not documented.",
        whyItMatters: "Establishes the clinical context for the requested procedure.",
      },
      {
        field: "examinationFindings",
        question: "What objective physical examination findings are documented in the clinical record for the knee? Leave blank if not documented.",
        whyItMatters: "Provides objective clinical data to support the evaluation.",
      },
      {
        field: "imagingAndDiagnostics",
        question: "What is the date and result of the most recent weight-bearing plain radiograph of the knee documented in the record? Leave blank if not documented.",
        whyItMatters: "Directly addresses the specific documentation requirement cited in the denial policy.",
      },
      {
        field: "treatmentHistoryAndResponse",
        question: "What prior treatments for this knee condition are documented in the clinical record, and what was the documented response to those treatments? Leave blank if not documented.",
        whyItMatters: "Documents the clinical course prior to the request for advanced imaging.",
      },
      {
        field: "otherDocumentedFacts",
        question: "Are there any other relevant clinical facts documented in the record regarding this knee condition? Leave blank if not documented.",
        whyItMatters: "Allows for the inclusion of pertinent clinical information not captured by the other categories.",
      },
    ],
    clinicalFacts: {
      symptomsAndFunctionalImpact: "Patient reports 8 weeks of persistent right knee pain, joint line tenderness, clicking sensations, and intermittent giving way following a twisting sports injury. Unable to run, squat, or climb stairs without sharp pain.",
      examinationFindings: "Physical exam reveals positive McMurray test on medial joint line, localized medial joint line tenderness, mild joint effusion, and terminal flexion discomfort at 115 degrees.",
      imagingAndDiagnostics: "Weight-bearing plain radiographs (AP/Lateral) completed on 05/20/2026 demonstrated no acute fracture, preserved joint spaces, and minimal degenerative changes, confirming compliance with RAD.00002 x-ray requirements prior to MRI.",
      treatmentHistoryAndResponse: "Completed 6 weeks of conservative management consisting of oral NSAIDs (naproxen 500mg BID), activity modification, and home physical therapy exercises without symptom resolution.",
      otherDocumentedFacts: "Enclosed prior weight-bearing radiograph report dated 05/20/2026 cures the documentation deficiency cited in denial code CO-16.",
      recordsAreIncomplete: false,
    },
    physicianNotes: `PATIENT: Michael Patel | DOB: 09/03/1982 | DOS: 07/18/2026
TREATING CLINICIAN CONSULTATION NOTE & RADIOLOGY ATTESTATION:
Patient Michael Patel is a 43-year-old male presenting for advanced diagnostic evaluation of persistent right knee pain, joint line clicking, and episodes of knee giving way subsequent to an acute rotational sports injury 8 weeks prior.

OBJECTIVE CLINICAL FINDINGS:
1. Physical Examination: Localized tenderness along the medial joint line, positive McMurray sign with palpable pop/click, mild joint effusion, and terminal flexion limited to 115 degrees due to mechanical impingement.
2. Prior Plain Radiographs (Policy RAD.00002 Compliance): Weight-bearing bilateral AP and lateral radiographs of the right knee were completed on 05/20/2026 at Global Diagnostic Imaging. X-rays confirmed absence of fracture or dislocation with preserved joint spacing, satisfying the prerequisite 6-month radiograph mandate under BCBS Coverage Policy RAD.00002.
3. Conservative Management: Underwent 6 weeks of structured conservative therapy consisting of oral Naproxen (500 mg BID), cryotherapy, and home exercise regimen without symptomatic relief.

ADVANCED IMAGING MEDICAL NECESSITY:
Magnetic Resonance Imaging of the knee without contrast (CPT 73721) is medically necessary to assess internal meniscal derangement and evaluate for surgical arthroscopy. Denial code CO-16 is refuted as qualifying plain radiographs (05/20/2026) were performed and are submitted herewith.

Attending Physician: Dr. Angela Martinez, MD (Global Diagnostic Imaging Group)`,
  },
];

