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
  return {
    id: clean || "unknown",
    name: payerName,
    domain: "",
    isVerified: false,
    submissionPolicyNote: "Awaiting live Firecrawl discovery or denial letter OCR.",
  };
};

export const PAYER_CLINICAL_DIRECTORIES: Record<string, { name: string; domainUrl: string; defaultSpecialty: string }> = {
  aetna: {
    name: "Aetna",
    domainUrl: "https://www.aetna.com/cpb",
    defaultSpecialty: "Orthopedics",
  },
  cigna: {
    name: "Cigna",
    domainUrl: "https://www.cigna.com/coveragePolicies",
    defaultSpecialty: "Orthopedics",
  },
  unitedhealthcare: {
    name: "UnitedHealthcare",
    domainUrl: "https://www.uhcprovider.com/en/policies-protocols/commercial-policies.html",
    defaultSpecialty: "Orthopedics",
  },
  humana: {
    name: "Humana",
    domainUrl: "https://www.humana.com/provider/medical-resources/clinical-guidance/medical-policies",
    defaultSpecialty: "Cardiology",
  },
  anthem: {
    name: "Anthem / BCBS",
    domainUrl: "https://www.anthem.com/provider/policies",
    defaultSpecialty: "Orthopedics",
  },
  molina: {
    name: "Molina Healthcare",
    domainUrl: "https://www.molinahealthcare.com/providers/common/medicaid/clinical-guidelines.aspx",
    defaultSpecialty: "Orthopedics",
  },
};

export const getPayerClinicalDirectoryUrl = (payerName?: string): string => {
  if (!payerName) return "https://www.aetna.com/cpb";
  const norm = payerName.toLowerCase();
  if (norm.includes("aetna")) return "https://www.aetna.com/cpb";
  if (norm.includes("cigna")) return "https://www.cigna.com/coveragePolicies";
  if (norm.includes("united") || norm.includes("uhc") || norm.includes("optum")) {
    return "https://www.uhcprovider.com/en/policies-protocols/commercial-policies.html";
  }
  if (norm.includes("humana")) return "https://www.humana.com/provider/medical-resources/clinical-guidance/medical-policies";
  if (norm.includes("anthem") || norm.includes("blue") || norm.includes("bcbs")) {
    return "https://www.anthem.com/provider/policies";
  }
  if (norm.includes("molina")) return "https://www.molinahealthcare.com/providers/common/medicaid/clinical-guidelines.aspx";
  return "https://www.aetna.com/cpb";
};

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
    description: "Ingesting $24,500 Knee Replacement Surgery Denial (CPT 27447, Code CO-50) from Cigna Global",
    durationMs: 3000,
  },
  {
    stage: 2,
    id: "crawling",
    title: "Insurer CPB & Clinical Policy Indexing",
    description: "Indexing Cigna Global Clinical Policy 0513 & extracting conservative therapy criteria contradiction",
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
  patientName: string;
  memberId: string;
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
  origin?: "demo-fixture";
  isSyntheticPII?: boolean;
  isDemo?: boolean;
}

export type DemoCaseFixture = SampleCasePreset;

export const DEMO_CASE_FIXTURES: DemoCaseFixture[] = [
  {
    id: "cignaglobal_meniscus",
    title: "Cigna Global — Knee Arthroscopy & Meniscectomy",
    payer: "Cigna Global",
    patientName: "Eleanor Vance",
    memberId: "CIG-982341-01",
    amount: "$6,400",
    cpt: "29881",
    carc: "CO-50 (Not Medically Necessary)",
    badge: "Recommended",
    origin: "demo-fixture",
    isSyntheticPII: true,
    isDemo: true,
    content: `CIGNA GLOBAL HEALTH BENEFITS
EXPLANATION OF BENEFITS / ADVERSE BENEFIT DETERMINATION
Claim Reference: CLM-8942-CIG
Member ID: CIG-982341-01
Patient Name: Eleanor Vance
Date of Birth: 1968-04-14
Date of Service: 06/12/2026
Treating Provider: Dr. Robert Langston, MD (Advanced Orthopedic Institute)
Facility: Metropolitan Surgical Hospital

Services Rendered:
- CPT Code 29881: Arthroscopy, knee, surgical; with meniscectomy (medial or lateral)
- ICD-10 Code M23.22: Derangement of meniscus due to old tear or injury, right medial meniscus
- Total Billed Amount: $6,400.00
- Plan Allowance / Paid: $0.00
- Denied Amount: $6,400.00
- Patient Financial Liability: $6,400.00

Adjudication & Claim Denial Reason:
Code CO-50: These are non-covered services because this is not deemed a medical necessity by the payer.
Clinical Rationale: Under Cigna Medical Coverage Policy 0066 (Knee Arthroscopy and Open Procedures), arthroscopic partial meniscectomy requires documented mechanical symptoms (locking, catching, or joint line tenderness) and failure of at least 6 weeks of conservative management (including physical therapy and NSAIDs) for degenerative meniscus tears. Clinical records submitted fail to establish consecutive supervised physical therapy.

Statutory Notice of Appeal Rights:
You have the right to an internal appeal pursuant to ERISA 29 CFR § 2560.503-1 and ACA 45 CFR § 147.136. You must submit your written appeal within 180 calendar days from the date of this determination notice.
Appeals Intake Destination:
Email: cignaglobal_customer.care@cigna.com
Mailing Address: Cigna Global Appeals Unit, P.O. Box 15050, Wilmington, DE 19850-5050
Appeals Fax: 1-800-340-3728`,
    sender: {
      name: "Jordan Lee",
      credentials: "Appeals Coordinator",
      email: "jordan.lee@orthoclinic.org",
      phone: "(555) 234-8901",
    },
    questions: [
      {
        field: "symptomsAndFunctionalImpact",
        question: "What specific symptoms and functional limitations are documented in the clinical record regarding the patient's right knee meniscus tear? Leave blank if not documented.",
        whyItMatters: "Documents persistent pain, mechanical locking, and functional limitation requiring surgical intervention.",
      },
      {
        field: "examinationFindings",
        question: "What objective physical examination findings are documented in the clinical record for the right knee? Leave blank if not documented.",
        whyItMatters: "Establishes joint line tenderness and positive McMurray mechanical sign supporting meniscal derangement.",
      },
      {
        field: "imagingAndDiagnostics",
        question: "What are the date and findings of the MRI of the right knee documented in the record? Leave blank if not documented.",
        whyItMatters: "Directly addresses the diagnostic imaging requirements cited in Cigna Medical Coverage Policies.",
      },
      {
        field: "treatmentHistoryAndResponse",
        question: "What prior conservative treatments (including physical therapy, injections, and NSAIDs) are documented in the clinical record, and what was the documented response? Leave blank if not documented.",
        whyItMatters: "Directly addresses the conservative management prerequisite cited in the denial.",
      },
      {
        field: "otherDocumentedFacts",
        question: "Are there any other relevant clinical facts documented in the record regarding this knee condition? Leave blank if not documented.",
        whyItMatters: "Allows for the inclusion of treating surgeon attestation and clinical necessity documentation.",
      },
    ],
    clinicalFacts: {
      symptomsAndFunctionalImpact: "Patient exhibits persistent right knee medial joint line pain (7/10 VAS) with painful catching and true mechanical locking episodes during ambulation, severely impairing weight-bearing activities of daily living.",
      examinationFindings: "Distinct right medial joint line tenderness, positive McMurray test reproducing painful medial clicking, mild reactive effusion, and painful extension block at 5 degrees.",
      imagingAndDiagnostics: "High-resolution MRI of the right knee (05/10/2026) confirms a complex posterior horn medial meniscus tear extending to the inferior articular surface with localized parameniscal cyst formation.",
      treatmentHistoryAndResponse: "Completed 8 consecutive weeks of formal outpatient physical therapy (2x/weekly, Feb-Apr 2026) with zero symptomatic relief, 3-month trial of oral meloxicam 15mg daily, and one image-guided intra-articular steroid injection (03/20/2026) yielding only 4 days of transient relief.",
      otherDocumentedFacts: "Dr. Robert Langston, MD certified that non-operative modalities have failed and arthroscopic partial medial meniscectomy (CPT 29881) is medically necessary under Cigna Medical Coverage Policy 0066 to resolve mechanical locking and prevent chondral degradation.",
      recordsAreIncomplete: false,
    },
    physicianNotes: `PATIENT: Eleanor Vance | DOB: 04/14/1968 | DOS: 06/12/2026
TREATING PHYSICIAN CLINICAL ATTESTATION & CONSERVATIVE THERAPY RECORD:
Patient Eleanor Vance is a 58-year-old female presenting with symptomatic right medial meniscus complex tear (ICD-10 M23.22) with recurrent mechanical knee locking, painful catching, and severe medial joint line tenderness.

CONSERVATIVE THERAPY MODALITIES COMPLETED & FAILED:
1. Supervised Physical Therapy: Completed 8 consecutive weeks of formal outpatient physical therapy (2 sessions/week from 02/03/2026 through 04/07/2026 at Sunstate Rehabilitation; 16 total sessions completed). Therapy discharge summary demonstrates zero improvement in mechanical catching symptoms.
2. Pharmacotherapy: 3-month trial of prescription Meloxicam (15 mg PO daily) with inadequate analgesic relief.
3. Intra-articular Injections: Image-guided right knee corticosteroid injection (Triamcinolone 40 mg on 03/20/2026) yielding only 4 days of transient partial relief.

CLINICAL NECESSITY DETERMINATION:
Under Cigna Medical Coverage Policy 0066 (Knee Arthroscopy and Open Procedures), the patient has completed and failed all non-operative conservative management. Arthroscopic partial meniscectomy (CPT 29881) is medically necessary to resolve mechanical joint locking and prevent secondary articular cartilage damage.

Attending Orthopedic Surgeon: Dr. Robert Langston, MD, FAAOS (Metropolitan Surgical Hospital)`,
  },
  {
    id: "geoblue_spine",
    title: "GeoBlue Worldwide — Lumbar Spine Decompression (Carelon)",
    payer: "GeoBlue",
    patientName: "Marcus Sterling",
    memberId: "GEO-554210-99",
    amount: "$18,200",
    cpt: "63047",
    carc: "CO-197 (Prior Auth Lacking)",
    badge: "High Value",
    origin: "demo-fixture",
    isSyntheticPII: true,
    isDemo: true,
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
Description: Surgical treatment for lumbar spinal stenosis was performed without securing prior authorization from GeoBlue Medical Review Department prior to the date of service. Under Carelon Musculoskeletal Clinical Appropriateness Guidelines for Spine Surgery (Lumbar Decompression / Laminectomy), non-emergent surgical intervention requires prospective authorization or clinical documentation of acute progressive neurological motor deficit establishing emergency medical necessity.
 
Appeals Procedure & Filing Instructions:
In accordance with federal regulations under 29 CFR § 2560.503-1, you or your authorized representative have 180 days from receipt of this notice to file a Level 1 appeal demonstrating emergency medical necessity or retroactive pre-authorization criteria under Carelon Clinical Appropriateness Guidelines for Spine Surgery (Lumbar Decompression / Laminectomy) / Policy SURG.00011.
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
        whyItMatters: "Directly addresses anatomical compression and surgical necessity criteria under Carelon Spine Surgery Guidelines / Policy SURG.00011.",
      },
      {
        field: "treatmentHistoryAndResponse",
        question: "What prior treatments and clinical deterioration timeline are documented prior to surgery? Leave blank if not documented.",
        whyItMatters: "Documents conservative therapy attempts and sudden rapid progression necessitating urgent intervention.",
      },
      {
        field: "otherDocumentedFacts",
        question: "Are there any other relevant clinical facts documented regarding the emergency nature of the procedure? Leave blank if not documented.",
        whyItMatters: "Provides attending surgeon emergency attestation explaining lack of prior authorization under Carelon emergency criteria.",
      },
    ],
    clinicalFacts: {
      symptomsAndFunctionalImpact: "Acute onset of intractable right lower extremity radiculopathy in L5-S1 distribution with rapid progression to motor weakness and right foot drop over 48 hours. Patient unable to ambulate or bear weight safely.",
      examinationFindings: "Neurological examination demonstrates right foot drop with extensor hallucis longus and tibialis anterior weakness (grade 3/5), positive straight leg raise test on right at 30 degrees, absent right Achilles reflex (0/2), and L5-S1 hypoesthesia.",
      imagingAndDiagnostics: "Emergency lumbar spine MRI (06/28/2026) demonstrated acute extruded L5-S1 right paracentral disc herniation causing high-grade central canal stenosis and acute impingement of the traversing right S1 nerve root.",
      treatmentHistoryAndResponse: "Patient was undergoing conservative outpatient physical therapy and oral analgesics, but suffered sudden neurological deterioration requiring emergency surgical decompression to prevent irreversible nerve root damage.",
      otherDocumentedFacts: "Attending neurosurgeon Dr. Sarah Chen, MD documented that emergency decompression was immediately necessary within 24 hours to prevent permanent foot drop, satisfying retroactive authorization criteria under Carelon Clinical Guidelines for Spine Surgery (Lumbar Decompression) / GeoBlue Policy SURG.00011.",
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
In accordance with Carelon Clinical Appropriateness Guidelines for Spine Surgery (Lumbar Decompression / Laminectomy), GeoBlue Policy SURG.00011, and prudent layperson emergency standards, emergency lumbar laminectomy, facetectomy, and foraminotomy (CPT 63047) was immediately indicated within 24 hours to prevent permanent motor paralysis and irreversible nerve root ischemia. Awaiting prospective commercial prior authorization was medically contraindicated and posed immediate threat of permanent disability.

Attending Neurosurgeon: Dr. Sarah Chen, MD, FAANS (Spine & Neurosurgery Associates)`,
  },
  {
    id: "aetnaintl_mri",
    title: "Aetna International — Knee MRI Scan",
    payer: "Aetna International",
    patientName: "Michael Patel",
    memberId: "AET-773419-02",
    amount: "$2,850",
    cpt: "73721",
    carc: "CO-16 (Missing Plain Radiographs)",
    badge: "Imaging Criteria",
    origin: "demo-fixture",
    isSyntheticPII: true,
    isDemo: true,
    content: `AETNA INTERNATIONAL
ADVERSE CLAIM ADJUDICATION NOTICE
Claim Number: CLM-3912-AET
Member ID: AET-773419-02
Patient Name: Michael Patel
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
Aetna Clinical Policy Bulletin (CPB) 0171 (Magnetic Resonance Imaging of the Extremities) requires documented weight-bearing plain radiographs performed within the preceding 6 months prior to approval of magnetic resonance imaging for non-acute knee pain.

Statutory Rights & Appeal Submission:
You have 180 days to request an administrative ERISA reconsideration under 29 CFR § 2560.503-1.
Submit formal appeal memorandum and physician attestation to:
Appeals Intake Email: aiservice@aetna.com
Service Center Address: Aetna International Appeals, P.O. Box 981543, El Paso, TX 79998-1543
Appeals Fax: 1-859-455-8650`,
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
      imagingAndDiagnostics: "Weight-bearing plain radiographs (AP/Lateral) completed on 05/20/2026 demonstrated no acute fracture, preserved joint spaces, and minimal degenerative changes, confirming compliance with Aetna CPB 0171 x-ray requirements prior to MRI.",
      treatmentHistoryAndResponse: "Completed 6 weeks of conservative management consisting of oral NSAIDs (naproxen 500mg BID), activity modification, and home physical therapy exercises without symptom resolution.",
      otherDocumentedFacts: "Enclosed prior weight-bearing radiograph report dated 05/20/2026 cures the documentation deficiency cited in denial code CO-16 under Aetna CPB 0171.",
      recordsAreIncomplete: false,
    },
    physicianNotes: `PATIENT: Michael Patel | DOB: 09/03/1982 | DOS: 07/18/2026
TREATING CLINICIAN CONSULTATION NOTE & RADIOLOGY ATTESTATION:
Patient Michael Patel is a 43-year-old male presenting for advanced diagnostic evaluation of persistent right knee pain, joint line clicking, and episodes of knee giving way subsequent to an acute rotational sports injury 8 weeks prior.

OBJECTIVE CLINICAL FINDINGS:
1. Physical Examination: Localized tenderness along the medial joint line, positive McMurray sign with palpable pop/click, mild joint effusion, and terminal flexion limited to 115 degrees due to mechanical impingement.
2. Prior Plain Radiographs (Aetna CPB 0171 Compliance): Weight-bearing bilateral AP and lateral radiographs of the right knee were completed on 05/20/2026 at Global Diagnostic Imaging. X-rays confirmed absence of fracture or dislocation with preserved joint spacing, satisfying the prerequisite 6-month radiograph mandate under Aetna Clinical Policy Bulletin 0171.
3. Conservative Management: Underwent 6 weeks of structured conservative therapy consisting of oral Naproxen (500 mg BID), cryotherapy, and home exercise regimen without symptomatic relief.

ADVANCED IMAGING MEDICAL NECESSITY:
Magnetic Resonance Imaging of the knee without contrast (CPT 73721) is medically necessary to assess internal meniscal derangement and evaluate for surgical arthroscopy. Denial code CO-16 is refuted as qualifying plain radiographs (05/20/2026) were performed and are submitted herewith under Aetna CPB 0171 criteria.

Attending Physician: Dr. Angela Martinez, MD (Global Diagnostic Imaging Group)`,
  },
];

export const SAMPLE_CASE_PRESETS: SampleCasePreset[] = DEMO_CASE_FIXTURES;


