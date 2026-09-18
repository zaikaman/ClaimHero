import { MutationCtx } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { claimsAggregate } from "./lib/aggregates";
import { buildClaimSearchContent } from "./claims";
import { appendAuditLog } from "./auditLogs";

/**
 * Atomically pre-seeds 3 authentic, comprehensive demo cases for newly registered
 * anonymous users, pre-populated with genuine, high-fidelity data matching live
 * pipeline execution (optical extraction, Firecrawl clinical policy bulletins,
 * native vector precedent search, 4-pillar appeal readiness scoring, cited 4-page
 * ERISA appeal briefs with Exhibit A proof of policy, 4-phase P2P defense scripts,
 * live pipeline activities stream, and AgentMail dispute resolution).
 */
export async function seedDemoCasesForUser(ctx: MutationCtx, userId: Id<"users">): Promise<void> {
  const now = Date.now();
  const DAY_MS = 86400000;
  const MIN_MS = 60000;

  // =========================================================================
  // 1. PATIENTS
  // =========================================================================
  const pat1Id = await ctx.db.insert("patients", {
    userId,
    name: "Eleanor Vance",
    email: "eleanor.vance@example.org",
    memberId: "CIG-982341-01",
    insurancePayer: "Cigna Global Health Benefits",
    state: "California",
    createdAt: now - 14 * DAY_MS,
  });

  const pat2Id = await ctx.db.insert("patients", {
    userId,
    name: "Marcus Sterling",
    email: "marcus.sterling@example.org",
    memberId: "GEO-554210-99",
    insurancePayer: "GeoBlue Worldwide Medical Insurance",
    state: "California",
    createdAt: now - 7 * DAY_MS,
  });

  const pat3Id = await ctx.db.insert("patients", {
    userId,
    name: "Michael Patel",
    email: "michael.patel@example.org",
    memberId: "AET-773419-02",
    insurancePayer: "Aetna International",
    state: "Illinois",
    createdAt: now - 21 * DAY_MS,
  });

  // =========================================================================
  // 2. CLAIMS
  // =========================================================================

  // --- CLAIM 1: Eleanor Vance (Knee Meniscectomy) - Status: ready_for_review ---
  const claim1Number = `CLM-8942-CIG-${Math.floor(1000 + Math.random() * 9000)}`;
  const claim1CreatedAt = now - 14 * DAY_MS;
  const claim1Id = await ctx.db.insert("claims", {
    userId,
    patientId: pat1Id,
    patientName: "Eleanor Vance",
    insurancePayer: "Cigna Global Health Benefits",
    claimNumber: claim1Number,
    serviceDate: "06/12/2026",
    providerName: "Dr. Robert Langston, MD (Advanced Orthopedic Institute)",
    deniedAmount: 6400,
    patientOwedAmount: 6400,
    cptCodes: ["29881"],
    icd10Codes: ["M23.22"],
    denialReasonCode: "CO-50",
    denialReasonDescription: "These are non-covered services because this is not deemed a medical necessity by the payer.",
    status: "ready_for_review",
    statutoryDeadline: now + 166 * DAY_MS,
    daysRemaining: 166,
    overturnProbabilityScore: 96,
    riskLevel: "high_confidence",
    workflowStatus: "completed",
    assignedAgentEmail: "claimhero-sender@agentmail.to",
    agentMailInboxEmail: "claimhero-sender@agentmail.to",
    agentMailInboxId: "claimhero-sender@agentmail.to",
    agentMailProvisioningStatus: "shared",
    autoPilotEnabled: false,
    evidenceCount: 10,
    origin: "demo-fixture",
    dataOrigin: "demo-fixture",
    isDemo: true,
    isSyntheticPII: true,
    scoringBreakdown: [
      {
        category: "policy_alignment",
        criterion: "CPB & Indication Alignment",
        maxScore: 35,
        score: 34,
        status: "strong",
        rationale: "The denial lacks specific reference to the CPB clause being unmet, which contradicts the transparency requirements of ERISA 29 CFR § 2560.503-1(g).",
      },
      {
        category: "clinical_documentation",
        criterion: "Objective Clinical Documentation & Step-Therapy",
        maxScore: 25,
        score: 24,
        status: "strong",
        rationale: "Clinical notes definitively support medical necessity by documenting failed conservative management (PT, NSAIDs, injection) and objective physical findings of a complex tear with mechanical locking.",
      },
      {
        category: "statutory_erisa",
        criterion: "ERISA 29 CFR § 2560.503-1 & Procedural Protections",
        maxScore: 20,
        score: 19,
        status: "strong",
        rationale: "Issuing a generic CO-50 denial without explaining the specific medical necessity deficiency violates the administrative procedural mandates of ERISA 29 CFR § 2560.503-1(h)(2)(iii).",
      },
      {
        category: "precedent_strength",
        criterion: "External Review Precedents & Overturn Benchmark",
        maxScore: 20,
        score: 19,
        status: "strong",
        rationale: "The evidence directly aligns with previous successful appeals where lack of specific clinical justification and disregard for documented conservative management history resulted in an overturned denial.",
      },
    ],
    payerContact: {
      intakePortalUrl: "https://www.cignaforhcp.com/",
      isVerified: true,
      liveVerifiedAt: now - 13 * DAY_MS,
      officialAppealsEmail: "_PDM@cigna.com",
      portalName: "CignaforHCP",
      source: "firecrawl_live",
      statutoryPoBox: "Cigna Global Health Benefits, Customer Service Center, PO Box 15050, Wilmington, DE 19850-5050 USA",
      submissionPolicyNote: "Cigna Global Health Benefits claims and appeals are primarily managed through the CignaEnvoy portal or via mail to the Wilmington, DE address. Providers should utilize CignaforHCP for electronic transactions and demographic updates. Specific state-based appeals (e.g., California) may require the use of dedicated forms found in the Cigna resource library.",
      tollFreeHelpline: "1-800-441-2668",
    },
    appealContext: {
      confirmedAt: claim1CreatedAt + 10 * MIN_MS,
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
      sender: {
        name: "Jordan Lee",
        credentials: "Appeals Coordinator",
        email: "jordan.lee@orthoclinic.org",
        phone: "(555) 234-8901",
      },
    },
    redactionMetadata: {
      appliedAt: claim1CreatedAt + 5 * MIN_MS,
      isRedacted: false,
      maskedCategories: [],
      mode: "BALANCED_APPELLATE",
      redactedEntityCount: 0,
    },
    financialLiability: {
      billedAmount: 6400,
      allowedAmount: 6400,
      contractualDiscount: 0,
      deductibleTotal: 1500,
      deductibleMet: 1500,
      coinsuranceRate: 0.2,
      copayAmount: 0,
      outOfPocketMax: 5000,
      outOfPocketSpent: 2100,
      networkStatus: "in_network",
      noSurprisesActProtected: false,
      calculatedPatientShare: 6400,
      balanceBillingAmount: 0,
      totalPatientExposureDenied: 6400,
      totalPatientLiabilityOverturned: 0,
      netPatientSavings: 0,
      payerExpectedObligation: 5120,
      updatedAt: now,
    },
    erisaPenalties: {
      documentRequestDate: "2026-06-20",
      disclosureDeadlineDate: "2026-07-20",
      calculationDate: "2026-08-10",
      requestedDocuments: ["Summary Plan Description", "Clinical Policy Bulletin 0066", "Medical Reviewer Credentials"],
      complianceStatus: "pending",
      dailyPenaltyRate: 110,
      daysInDefault: 21,
      accruedPenaltyAmount: 2310,
      statutoryInterestRate: 0.05,
      accruedInterestAmount: 115,
      estimatedAttorneysFees: 3500,
      totalStatutoryDamages: 5925,
      totalPlanAdministratorExposure: 12325,
      severityTier: "actionable_statutory_default",
      statutoryDemandLanguage: "Demand for immediate disclosure of CPB 0066 guidelines and claims manual pursuant to 29 U.S.C. § 1132(c).",
      updatedAt: now,
    },
    createdAt: claim1CreatedAt,
    updatedAt: now - 1000,
  });

  const claim1Search = buildClaimSearchContent({
    claimNumber: claim1Number,
    patientName: "Eleanor Vance",
    insurancePayer: "Cigna Global Health Benefits",
    providerName: "Dr. Robert Langston, MD",
    denialReasonCode: "CO-50",
    denialReasonDescription: "These are non-covered services because this is not deemed a medical necessity by the payer.",
    cptCodes: ["29881"],
    icd10Codes: ["M23.22"],
  });
  await ctx.db.patch(claim1Id, { searchContent: claim1Search });

  // --- CLAIM 2: Marcus Sterling (Lumbar Spine Decompression) - Status: ready_for_review ---
  const claim2Number = `CLM-6104-GEO-${Math.floor(1000 + Math.random() * 9000)}`;
  const claim2CreatedAt = now - 7 * DAY_MS;
  const claim2Id = await ctx.db.insert("claims", {
    userId,
    patientId: pat2Id,
    patientName: "Marcus Sterling",
    insurancePayer: "GeoBlue Worldwide Medical Insurance",
    claimNumber: claim2Number,
    serviceDate: "07/04/2026",
    providerName: "Dr. Sarah Chen, MD (Spine & Neurosurgery Associates)",
    deniedAmount: 18200,
    patientOwedAmount: 18200,
    cptCodes: ["63047"],
    icd10Codes: ["M51.26"],
    denialReasonCode: "CO-197",
    denialReasonDescription: "Precertification / prior authorization / notification absent or lacking under Carelon Spine Surgery Guidelines.",
    status: "ready_for_review",
    statutoryDeadline: now + 173 * DAY_MS,
    daysRemaining: 173,
    overturnProbabilityScore: 94,
    riskLevel: "high_confidence",
    workflowStatus: "completed",
    assignedAgentEmail: "appeals-geoblue@claimhero.ai",
    agentMailInboxEmail: "appeals-geoblue@claimhero.ai",
    agentMailInboxId: "appeals-geoblue@claimhero.ai",
    agentMailProvisioningStatus: "provisioned",
    autoPilotEnabled: false,
    evidenceCount: 6,
    origin: "demo-fixture",
    dataOrigin: "demo-fixture",
    isDemo: true,
    isSyntheticPII: true,
    scoringBreakdown: [
      {
        category: "policy_alignment",
        criterion: "CPB & Indication Alignment",
        maxScore: 35,
        score: 31,
        status: "strong",
        rationale: "The appeal demonstrates that the procedure qualifies for the emergency exception explicitly mentioned in the payer's own surgical policy SURG.00011.",
      },
      {
        category: "clinical_documentation",
        criterion: "Objective Clinical Documentation & Step-Therapy",
        maxScore: 25,
        score: 22,
        status: "strong",
        rationale: "The medical records confirm a progressive, acute, and disabling neurological condition (foot drop and motor deficit) that objectively necessitates immediate surgical intervention.",
      },
      {
        category: "statutory_erisa",
        criterion: "ERISA 29 CFR § 2560.503-1 & Procedural Protections",
        maxScore: 20,
        score: 19,
        status: "strong",
        rationale: "The denial lacks the necessary clinical justification required under 29 CFR § 2560.503-1, effectively denying the patient a fair review of the medical necessity evidence provided.",
      },
      {
        category: "precedent_strength",
        criterion: "External Review Precedents & Overturn Benchmark",
        maxScore: 20,
        score: 18,
        status: "strong",
        rationale: "The success of previous appeals involving the same clinical scenario and insurer confirms the validity of using the emergency exception argument to overturn administrative denials.",
      },
    ],
    payerContact: {
      appealsFax: "610-482-9623",
      intakePortalUrl: "https://bcbsglobalsolutions.com",
      isVerified: true,
      liveVerifiedAt: now - 6 * DAY_MS,
      officialAppealsEmail: "claims@geoblue.com",
      portalName: "BCBS Global Solutions Member Portal",
      source: "firecrawl_live",
      statutoryPoBox: "GeoBlue, Attn: Claims Dept., P.O. Box 1748, Southeastern, PA 19399-1748",
      submissionPolicyNote: "Claims and supporting documentation should be submitted via the Member Portal (eClaims) for fastest processing. Alternatively, claims can be mailed to the P.O. Box or faxed to the dedicated claims department number. Always refer to the specific claim form instructions provided in your plan materials.",
      tollFreeHelpline: "1-888-412-6403",
    },
    appealContext: {
      confirmedAt: claim2CreatedAt + 10 * MIN_MS,
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
      sender: {
        name: "Alex Morgan",
        credentials: "Surgical Case Coordinator",
        email: "alex.morgan@spineinstitute.org",
        phone: "(555) 456-7890",
      },
    },
    redactionMetadata: {
      appliedAt: claim2CreatedAt + 5 * MIN_MS,
      isRedacted: false,
      maskedCategories: [],
      mode: "BALANCED_APPELLATE",
      redactedEntityCount: 0,
    },
    financialLiability: {
      billedAmount: 18200,
      allowedAmount: 18200,
      contractualDiscount: 0,
      deductibleTotal: 2000,
      deductibleMet: 2000,
      coinsuranceRate: 0.15,
      copayAmount: 0,
      outOfPocketMax: 6000,
      outOfPocketSpent: 3200,
      networkStatus: "in_network",
      noSurprisesActProtected: false,
      calculatedPatientShare: 18200,
      balanceBillingAmount: 0,
      totalPatientExposureDenied: 18200,
      totalPatientLiabilityOverturned: 0,
      netPatientSavings: 0,
      payerExpectedObligation: 15470,
      updatedAt: now,
    },
    createdAt: claim2CreatedAt,
    updatedAt: now - 2000,
  });

  const claim2Search = buildClaimSearchContent({
    claimNumber: claim2Number,
    patientName: "Marcus Sterling",
    insurancePayer: "GeoBlue Worldwide Medical Insurance",
    providerName: "Dr. Sarah Chen, MD",
    denialReasonCode: "CO-197",
    denialReasonDescription: "Precertification / prior authorization / notification absent or lacking under Carelon Spine Surgery Guidelines.",
    cptCodes: ["63047"],
    icd10Codes: ["M51.26"],
  });
  await ctx.db.patch(claim2Id, { searchContent: claim2Search });

  // --- CLAIM 3: Michael Patel (Knee MRI Scan) - Status: won ---
  const claim3Number = `CLM-3912-AET-${Math.floor(1000 + Math.random() * 9000)}`;
  const claim3CreatedAt = now - 21 * DAY_MS;
  const claim3Id = await ctx.db.insert("claims", {
    userId,
    patientId: pat3Id,
    patientName: "Michael Patel",
    insurancePayer: "Aetna International",
    claimNumber: claim3Number,
    serviceDate: "07/18/2026",
    providerName: "Dr. Angela Martinez, MD (Global Diagnostic Imaging Group)",
    deniedAmount: 2850,
    patientOwedAmount: 0,
    cptCodes: ["73721"],
    icd10Codes: ["M23.22"],
    denialReasonCode: "CO-16",
    denialReasonDescription: "Claim lacks information or has submission error. Aetna Clinical Policy Bulletin (CPB) 0171 requires documented weight-bearing plain radiographs performed within the preceding 6 months prior to approval of magnetic resonance imaging for non-acute knee pain.",
    status: "won",
    statutoryDeadline: now + 159 * DAY_MS,
    daysRemaining: 159,
    overturnProbabilityScore: 91,
    riskLevel: "high_confidence",
    workflowStatus: "completed",
    assignedAgentEmail: "appeals-aetna@claimhero.ai",
    agentMailInboxEmail: "appeals-aetna@claimhero.ai",
    agentMailInboxId: "appeals-aetna@claimhero.ai",
    agentMailProvisioningStatus: "provisioned",
    autoPilotEnabled: false,
    evidenceCount: 5,
    origin: "demo-fixture",
    dataOrigin: "demo-fixture",
    isDemo: true,
    isSyntheticPII: true,
    scoringBreakdown: [
      {
        category: "policy_alignment",
        criterion: "Aetna CPB 0171 Prerequisite Verification",
        maxScore: 35,
        score: 34,
        status: "strong",
        rationale: "Weight-bearing AP/lateral knee radiographs completed on 05/20/2026 produced in appeal record, reversing lack of info citation.",
      },
      {
        category: "clinical_documentation",
        criterion: "Persistent Mechanical Pain & Inconclusive X-Rays",
        maxScore: 30,
        score: 28,
        status: "strong",
        rationale: "Negative plain films with continued mechanical joint line locking fully justified non-contrast MRI under Section II criteria.",
      },
      {
        category: "precedent_strength",
        criterion: "CMS NCD 220.2 & Precedent Rulings",
        maxScore: 20,
        score: 19,
        status: "strong",
        rationale: "Controlling CMS NCD 220.2 and past overturned appeals establish that negative plain radiographs fully support non-contrast MRI for internal derangement.",
      },
      {
        category: "statutory_erisa",
        criterion: "Overturn Remittance Notice Received",
        maxScore: 15,
        score: 10,
        status: "strong",
        rationale: "Aetna International Appeals Unit issued formal determination overturning denial in full with $2,850.00 plan remittance.",
      },
    ],
    payerContact: {
      intakePortalUrl: "https://www.aetnainternational.com/",
      isVerified: true,
      liveVerifiedAt: now - 20 * DAY_MS,
      officialAppealsEmail: "aetnaintl_appeals@aetna.com",
      portalName: "Aetna International Member Portal",
      source: "firecrawl_live",
      statutoryPoBox: "Aetna International Appeals Unit, P.O. Box 981543, El Paso, TX 79998-1543",
      submissionPolicyNote: "Aetna International accepts claims and inquiries via their secure member portal, by mail to their El Paso P.O. Box, or via email to aiservice@aetna.com (10MB attachment limit). Providers should use the Availity portal for domestic claims and appeals.",
      tollFreeHelpline: "The phone number listed on the back of your Aetna ID Card",
    },
    appealContext: {
      confirmedAt: claim3CreatedAt + 10 * MIN_MS,
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
      sender: {
        name: "Taylor Reed",
        credentials: "Appeals Specialist",
        email: "taylor.reed@diagnosticimaging.org",
        phone: "(555) 789-0123",
      },
    },
    redactionMetadata: {
      appliedAt: claim3CreatedAt + 5 * MIN_MS,
      isRedacted: false,
      maskedCategories: [],
      mode: "BALANCED_APPELLATE",
      redactedEntityCount: 0,
    },
    financialLiability: {
      billedAmount: 2850,
      allowedAmount: 2850,
      contractualDiscount: 0,
      deductibleTotal: 500,
      deductibleMet: 500,
      coinsuranceRate: 0.1,
      copayAmount: 0,
      outOfPocketMax: 3000,
      outOfPocketSpent: 1200,
      networkStatus: "in_network",
      noSurprisesActProtected: false,
      calculatedPatientShare: 0,
      balanceBillingAmount: 0,
      totalPatientExposureDenied: 2850,
      totalPatientLiabilityOverturned: 2850,
      netPatientSavings: 2850,
      payerExpectedObligation: 2850,
      updatedAt: now,
    },
    createdAt: claim3CreatedAt,
    updatedAt: now - 3000,
  });

  const claim3Search = buildClaimSearchContent({
    claimNumber: claim3Number,
    patientName: "Michael Patel",
    insurancePayer: "Aetna International",
    providerName: "Dr. Angela Martinez, MD",
    denialReasonCode: "CO-16",
    denialReasonDescription: "Claim lacks information or has submission error. Aetna Clinical Policy Bulletin (CPB) 0171 requires documented weight-bearing plain radiographs performed within the preceding 6 months prior to approval of magnetic resonance imaging for non-acute knee pain.",
    cptCodes: ["73721"],
    icd10Codes: ["M23.22"],
  });
  await ctx.db.patch(claim3Id, { searchContent: claim3Search });

  // Update aggregates for all 3 seeded claims
  for (const cid of [claim1Id, claim2Id, claim3Id]) {
    try {
      const claimDoc = await ctx.db.get(cid);
      if (claimDoc) {
        await claimsAggregate.insert(ctx, claimDoc);
      }
    } catch (aggErr) {
      console.warn("Demo seeder aggregate note:", aggErr);
    }
  }

  // =========================================================================
  // 3. CLINICAL EVIDENCES (Extracted from Live Firecrawl & Precedent Archive)
  // =========================================================================

  // Evidences for Claim 1 (Eleanor Vance - 10 items)
  await ctx.db.insert("clinicalEvidences", {
    claimId: claim1Id,
    sourceType: "nccn_guideline",
    title: "Knee Arthroscopy Surgical Procedures",
    sourceUrl: "https://guidelines.carelonmedicalbenefitsmanagement.com/joint-surgery-2025-11-15/",
    citationClause: "CPT Code: 29881",
    extractedEvidenceMarkdown: "Arthroscopy, knee, surgical; with meniscectomy (medial OR lateral, including any meniscal shaving) including debridement/shaving of articular cartilage (chondroplasty), same or separate compartments, when performed.",
    relevanceScore: 80,
    screenshotUrl: "https://guidelines.carelonmedicalbenefitsmanagement.com/joint-surgery-2025-11-15/",
    capturedAt: claim1CreatedAt + 2 * MIN_MS,
    createdAt: claim1CreatedAt + 2 * MIN_MS,
  });

  await ctx.db.insert("clinicalEvidences", {
    claimId: claim1Id,
    sourceType: "payer_cpb",
    title: "Clinical Appropriateness Guidelines for Joint Surgery",
    sourceUrl: "https://guidelines.carelonmedicalbenefitsmanagement.com/joint-surgery-2025-11-15/",
    citationClause: "Medical Necessity Criteria §1",
    extractedEvidenceMarkdown: "The patient has completed a full course of conservative management for the current episode of care.",
    relevanceScore: 94,
    screenshotUrl: "https://guidelines.carelonmedicalbenefitsmanagement.com/joint-surgery-2025-11-15/",
    capturedAt: claim1CreatedAt + 2 * MIN_MS,
    createdAt: claim1CreatedAt + 2 * MIN_MS,
  });

  await ctx.db.insert("clinicalEvidences", {
    claimId: claim1Id,
    sourceType: "payer_cpb",
    title: "Clinical Appropriateness Guidelines for Joint Surgery",
    sourceUrl: "https://guidelines.carelonmedicalbenefitsmanagement.com/joint-surgery-2025-11-15/",
    citationClause: "Medical Necessity Criteria §2",
    extractedEvidenceMarkdown: "The patient has significant pain rated at least 3 out of 10 in intensity and associated with inability to perform ADLs and/or IADLs.",
    relevanceScore: 94,
    screenshotUrl: "https://guidelines.carelonmedicalbenefitsmanagement.com/joint-surgery-2025-11-15/",
    capturedAt: claim1CreatedAt + 2 * MIN_MS,
    createdAt: claim1CreatedAt + 2 * MIN_MS,
  });

  await ctx.db.insert("clinicalEvidences", {
    claimId: claim1Id,
    sourceType: "payer_cpb",
    title: "Clinical Appropriateness Guidelines for Joint Surgery",
    sourceUrl: "https://guidelines.carelonmedicalbenefitsmanagement.com/joint-surgery-2025-11-15/",
    citationClause: "Medical Necessity Criteria §3",
    extractedEvidenceMarkdown: "Imaging obtained within the past 12 months demonstrates significant joint destruction with evidence of degenerative changes.",
    relevanceScore: 94,
    screenshotUrl: "https://guidelines.carelonmedicalbenefitsmanagement.com/joint-surgery-2025-11-15/",
    capturedAt: claim1CreatedAt + 2 * MIN_MS,
    createdAt: claim1CreatedAt + 2 * MIN_MS,
  });

  await ctx.db.insert("clinicalEvidences", {
    claimId: claim1Id,
    sourceType: "payer_cpb",
    title: "Clinical Appropriateness Guidelines for Joint Surgery - Contraindications",
    sourceUrl: "https://guidelines.carelonmedicalbenefitsmanagement.com/joint-surgery-2025-11-15/",
    citationClause: "Contraindications & Exclusions",
    extractedEvidenceMarkdown: "Active infection of the joint\nActive systemic bacteremia\nActive skin infection or open wound at the surgical site\nRapidly progressive neurologic disease\nIntra-articular corticosteroid injection within the past 6 weeks in the joint being replaced",
    relevanceScore: 89,
    screenshotUrl: "https://guidelines.carelonmedicalbenefitsmanagement.com/joint-surgery-2025-11-15/",
    capturedAt: claim1CreatedAt + 2 * MIN_MS,
    createdAt: claim1CreatedAt + 2 * MIN_MS,
  });

  await ctx.db.insert("clinicalEvidences", {
    claimId: claim1Id,
    sourceType: "payer_cpb",
    title: "Clinical Appropriateness Guidelines for Joint Surgery - Prior Authorization",
    sourceUrl: "https://guidelines.carelonmedicalbenefitsmanagement.com/joint-surgery-2025-11-15/",
    citationClause: "Prior Authorization & Step Therapy",
    extractedEvidenceMarkdown: "Patient has undergone at least 12 weeks of non-surgical conservative management prior to the procedure.\nDocumented failure of conservative management or worsening of symptoms upon reevaluation.",
    relevanceScore: 90,
    screenshotUrl: "https://guidelines.carelonmedicalbenefitsmanagement.com/joint-surgery-2025-11-15/",
    capturedAt: claim1CreatedAt + 2 * MIN_MS,
    createdAt: claim1CreatedAt + 2 * MIN_MS,
  });

  await ctx.db.insert("clinicalEvidences", {
    claimId: claim1Id,
    sourceType: "legal_precedent",
    title: "ERISA Full & Fair Review Statutory Protocol",
    sourceUrl: "https://www.ecfr.gov/current/title-29/subtitle-B/chapter-XXV/subchapter-L/part-2560/section-2560.503-1",
    citationClause: "29 CFR § 2560.503-1(h)(2)(iii)",
    extractedEvidenceMarkdown: "Statutory Requirement: Plan administrators must provide claimants upon request with all documents, records, and internal clinical criteria utilized in making the adverse determination. Adverse benefit determinations lacking specific clinical justification violate the claimant's right to a full and fair review.",
    relevanceScore: 95,
    createdAt: claim1CreatedAt + 2 * MIN_MS,
  });

  await ctx.db.insert("clinicalEvidences", {
    claimId: claim1Id,
    sourceType: "legal_precedent",
    title: "Winning brief — CPT 29881 / CO-50 overturn",
    citationClause: "ClaimHero overturned appeal CLM-8942-CIG-2388",
    extractedEvidenceMarkdown: "Outcome: Overturned. Recovered $6,400.\nRetrieval: [HYBRID FUSION: Vector + BM25] | Vector similarity: 0.6024 | Combined score: 0.9466 | RRF score: 0.0301\nConservative management must include physical therapy AND at least ONE complementary conservative treatment strategy (NSAIDs, steroid injections). Patient documented 8 weeks of PT and corticosteroid injection, fully refuting CO-50.",
    relevanceScore: 97,
    createdAt: claim1CreatedAt + 3 * MIN_MS,
  });

  await ctx.db.insert("clinicalEvidences", {
    claimId: claim1Id,
    sourceType: "pubmed_study",
    title: "Arthroscopic Meniscectomy in Degenerative Tears with Mechanical Symptoms",
    citationClause: "NEJM 2024; 390:1102-1114",
    extractedEvidenceMarkdown: "Prospective multi-center study demonstrates that patients presenting with genuine mechanical locking episodes and joint line tenderness refractory to conservative physical therapy achieve statistically superior functional outcomes with arthroscopic partial meniscectomy compared to continued sham intervention.",
    relevanceScore: 92,
    createdAt: claim1CreatedAt + 3 * MIN_MS,
  });

  await ctx.db.insert("clinicalEvidences", {
    claimId: claim1Id,
    sourceType: "legal_precedent",
    title: "ERISA Claims Procedure — Specific Reason for Denial",
    sourceUrl: "https://www.ecfr.gov/current/title-29/section-2560.503-1",
    citationClause: "29 CFR § 2560.503-1(g)",
    extractedEvidenceMarkdown: "The notification of any adverse benefit determination shall set forth, in a manner calculated to be understood by the claimant: the specific reason or reasons for the adverse determination. Generic CO-50 notices that omit the governing CPB clause are procedurally defective and independently require remand and reprocessing.",
    relevanceScore: 93,
    createdAt: claim1CreatedAt + 3 * MIN_MS,
  });

  // Evidences for Claim 2 (Marcus Sterling - 6 items)
  await ctx.db.insert("clinicalEvidences", {
    claimId: claim2Id,
    sourceType: "nccn_guideline",
    title: "Laminectomy for Lumbar Disc Herniation",
    sourceUrl: "https://guidelines.carelonmedicalbenefitsmanagement.com/spine-surgery-2025-11-15-updated-2026-01-01/",
    citationClause: "63047",
    extractedEvidenceMarkdown: "Laminectomy, facetectomy and foraminotomy (unilateral or bilateral with decompression of spinal cord, cauda equina and/or nerve root[s]), single vertebral segment; lumbar.\nLaminectomy is considered medically necessary when ALL the following criteria are met: Radicular pain with significant functional impairment, motor strength deficit (myotomal), abnormal reflex changes, and documented acute disc herniation causing severe nerve root compression.",
    relevanceScore: 80,
    screenshotUrl: "https://guidelines.carelonmedicalbenefitsmanagement.com/spine-surgery-2025-11-15-updated-2026-01-01/",
    capturedAt: claim2CreatedAt + 2 * MIN_MS,
    createdAt: claim2CreatedAt + 2 * MIN_MS,
  });

  await ctx.db.insert("clinicalEvidences", {
    claimId: claim2Id,
    sourceType: "payer_cpb",
    title: "Spine Surgery Clinical Policy Guidelines",
    sourceUrl: "https://guidelines.carelonmedicalbenefitsmanagement.com/spine-surgery-2025-11-15-updated-2026-01-01/",
    citationClause: "Medical Necessity Criteria §1",
    extractedEvidenceMarkdown: "Significant functional impairment due to radicular pain supported by imaging findings that demonstrate nerve root compression with acute neurological motor deficit exempt from prospective step therapy.",
    relevanceScore: 94,
    screenshotUrl: "https://guidelines.carelonmedicalbenefitsmanagement.com/spine-surgery-2025-11-15-updated-2026-01-01/",
    capturedAt: claim2CreatedAt + 2 * MIN_MS,
    createdAt: claim2CreatedAt + 2 * MIN_MS,
  });

  await ctx.db.insert("clinicalEvidences", {
    claimId: claim2Id,
    sourceType: "legal_precedent",
    title: "ERISA Full & Fair Review Statutory Protocol",
    sourceUrl: "https://www.ecfr.gov/current/title-29/subtitle-B/chapter-XXV/subchapter-L/part-2560/section-2560.503-1",
    citationClause: "29 CFR § 2560.503-1(h)(2)(iii)",
    extractedEvidenceMarkdown: "Statutory Requirement: Plan administrators must provide claimants upon request with all documents, records, and internal clinical criteria utilized in making the adverse determination. Denials of emergency care lacking clinical review violate statutory mandates.",
    relevanceScore: 95,
    createdAt: claim2CreatedAt + 2 * MIN_MS,
  });

  await ctx.db.insert("clinicalEvidences", {
    claimId: claim2Id,
    sourceType: "legal_precedent",
    title: "Winning brief — CPT 63047 / CO-197 overturn",
    citationClause: "ClaimHero overturned appeal CLM-6104-GEO-4439",
    extractedEvidenceMarkdown: "Outcome: Overturned. Recovered $18,200.\nRetrieval: [HYBRID FUSION: Vector + BM25] | Vector similarity: 0.6575 | Combined score: 0.9948 | RRF score: 0.0325\nEmergency lumbar decompression for acute foot drop (motor grade 3/5) meets retroactive authorization exceptions under Carelon Guideline SURG.00011 and prudent layperson emergency standard.",
    relevanceScore: 99,
    createdAt: claim2CreatedAt + 3 * MIN_MS,
  });

  await ctx.db.insert("clinicalEvidences", {
    claimId: claim2Id,
    sourceType: "legal_precedent",
    title: "Winning brief — CPT 63047 / CO-197 overturn",
    citationClause: "ClaimHero overturned appeal CLM-6104-GEO-8184",
    extractedEvidenceMarkdown: "Outcome: Overturned. Recovered $18,200.\nRetrieval: [HYBRID FUSION: Vector + BM25] | Vector similarity: 0.6334 | Combined score: 0.9844 | RRF score: 0.0320\nInsurer requirement of prospective prior authorization waived retroactively where delay would result in permanent motor paralysis.",
    relevanceScore: 99,
    createdAt: claim2CreatedAt + 3 * MIN_MS,
  });

  await ctx.db.insert("clinicalEvidences", {
    claimId: claim2Id,
    sourceType: "pubmed_study",
    title: "Surgical Timing in Acute Lumbar Radiculopathy with Motor Deficit",
    citationClause: "Spine 2024; 49(8):540-548",
    extractedEvidenceMarkdown: "Decompression within 48 hours of progressive motor drop yields 89% full neurological recovery versus 31% when delayed beyond 7 days for commercial administrative authorization.",
    relevanceScore: 96,
    createdAt: claim2CreatedAt + 3 * MIN_MS,
  });

  // Evidences for Claim 3 (Michael Patel - 5 items)
  await ctx.db.insert("clinicalEvidences", {
    claimId: claim3Id,
    sourceType: "payer_cpb",
    title: "Aetna Clinical Policy Bulletin 0171 on MRI of the Extremities",
    sourceUrl: "https://www.aetna.com/cpb/medical/data/100_199/0171.html",
    citationClause: "CPT Code 73721",
    extractedEvidenceMarkdown: "Aetna considers magnetic resonance imaging (MRI) studies of the knee medically necessary when persistent knee pain/swelling and/or instability is not responding to at least 3 weeks of conservative therapy and plain weight-bearing radiographs have been performed.",
    relevanceScore: 80,
    screenshotUrl: "https://www.aetna.com/cpb/medical/data/100_199/0171.html",
    capturedAt: claim3CreatedAt + 2 * MIN_MS,
    createdAt: claim3CreatedAt + 2 * MIN_MS,
  });

  await ctx.db.insert("clinicalEvidences", {
    claimId: claim3Id,
    sourceType: "legal_precedent",
    title: "ERISA Full & Fair Review Statutory Protocol",
    sourceUrl: "https://www.ecfr.gov/current/title-29/subtitle-B/chapter-XXV/subchapter-L/part-2560/section-2560.503-1",
    citationClause: "29 CFR § 2560.503-1(h)(2)(iii)",
    extractedEvidenceMarkdown: "Statutory Requirement: Plan administrators must provide claimants upon request with all documents, records, and internal clinical criteria utilized in making the adverse determination. Adverse benefit determinations lacking specific clinical justification violate the claimant's right to a full and fair review.",
    relevanceScore: 95,
    createdAt: claim3CreatedAt + 2 * MIN_MS,
  });

  await ctx.db.insert("clinicalEvidences", {
    claimId: claim3Id,
    sourceType: "legal_precedent",
    title: "Winning brief — CPT 73721 / CO-16 overturn",
    citationClause: "ClaimHero overturned appeal CLM-3912-BCG",
    extractedEvidenceMarkdown: "Outcome: Overturned. Recovered $2,850.\nRetrieval: [HYBRID FUSION: Vector + BM25] | Vector similarity: 0.7467 | Combined score: 1.0000 | RRF score: 0.0328\nEnclosed prior weight-bearing radiograph report dated 05/20/2026 cures the documentation deficiency cited in denial code CO-16 under Aetna CPB 0171.",
    relevanceScore: 100,
    createdAt: claim3CreatedAt + 3 * MIN_MS,
  });

  await ctx.db.insert("clinicalEvidences", {
    claimId: claim3Id,
    sourceType: "legal_precedent",
    title: "CMS NCD 220.2 — Magnetic Resonance Imaging",
    sourceUrl: "https://www.cms.gov/medicare-coverage-database/view/ncd.aspx?NCDId=164",
    citationClause: "CMS NCD 220.2 (MRI)",
    extractedEvidenceMarkdown: "Magnetic resonance imaging is covered when it is reasonable and necessary for the diagnosis or treatment of illness or injury. Acute mechanical locking, suspected meniscal tear, or occult fracture after an inadequate radiograph is a covered indication. A CO-16 denial for 'missing information' is cured by submitting the examining physician's mechanism-of-injury note and negative radiograph.",
    relevanceScore: 99,
    createdAt: claim3CreatedAt + 3 * MIN_MS,
  });

  await ctx.db.insert("clinicalEvidences", {
    claimId: claim3Id,
    sourceType: "legal_precedent",
    title: "ERISA Claims Procedure — Specific Reason for Denial",
    sourceUrl: "https://www.ecfr.gov/current/title-29/section-2560.503-1",
    citationClause: "29 CFR § 2560.503-1(g)",
    extractedEvidenceMarkdown: "The notification of any adverse benefit determination shall set forth: the specific reason or reasons for the adverse determination; reference to the specific plan provisions on which the determination is based; a description of any additional material or information necessary for the claimant to perfect the claim.",
    relevanceScore: 77,
    createdAt: claim3CreatedAt + 3 * MIN_MS,
  });

  // =========================================================================
  // 4. APPEALS BRIEFS (Full 4-Page Briefs with Exhibit A Proof of Policy)
  // =========================================================================

  // Appeal 1: Eleanor Vance (Ready for Review)
  await ctx.db.insert("appeals", {
    claimId: claim1Id,
    version: 1,
    appealLevel: "level_1_internal",
    statutoryPosture: "administrative_reconsideration",
    targetAuthority: "Payer Medical Director Review",
    legalAggressiveness: "standard",
    statutoryAuthorities: [
      "ERISA 29 C.F.R. § 2560.503-1 (Full and Fair Review)",
      "Patient Protection and Affordable Care Act § 2719",
      "Published Clinical Policy Bulletins (CPB)",
    ],
    executiveSummary: `This appeal concerns the adverse benefit determination of CPT 29881 (arthroscopic partial meniscectomy) for patient Eleanor Vance for the date of service 06/12/2026. The claim was denied under denial code CO-50 for lack of medical necessity. Documentation from treating orthopedic surgeon Dr. Robert Langston confirms that the patient met all conservative management criteria prior to the surgical intervention, which was required to address persistent mechanical locking and joint line clicking.`,
    medicalNecessityArguments: `The following clinical summary and documented patient-specific findings are submitted in support of this reconsideration request:

Symptoms and functional impact:
> Patient exhibits persistent right knee medial joint line pain (7/10 VAS) with painful catching and true mechanical locking episodes during ambulation, severely impairing weight-bearing activities of daily living.

Examination findings:
> Distinct right medial joint line tenderness, positive McMurray test reproducing painful medial clicking, mild reactive effusion, and painful extension block at 5 degrees.

Imaging and diagnostic findings:
> High-resolution MRI of the right knee (05/10/2026) confirms a complex posterior horn medial meniscus tear extending to the inferior articular surface with localized parameniscal cyst formation.

Treatment history and response:
> Completed 8 consecutive weeks of formal outpatient physical therapy (2x/weekly, Feb-Apr 2026) with zero symptomatic relief, 3-month trial of oral meloxicam 15mg daily, and one image-guided intra-articular steroid injection (03/20/2026) yielding only 4 days of transient relief.

Other documented facts:
> Dr. Robert Langston, MD certified that non-operative modalities have failed and arthroscopic partial medial meniscectomy (CPT 29881) is medically necessary under Cigna Medical Coverage Policy 0066 to resolve mechanical locking and prevent chondral degradation.`,
    legalCitations: `- Clinical Appropriateness Guidelines for Joint Surgery (Medical Necessity Criteria §3): Imaging obtained within the past 12 months demonstrates significant joint destruction with evidence of degenerative changes.
- Clinical Appropriateness Guidelines for Joint Surgery (Medical Necessity Criteria §2): The patient has significant pain rated at least 3 out of 10 in intensity and associated with inability to perform ADLs and/or IADLs.
- Clinical Appropriateness Guidelines for Joint Surgery (Medical Necessity Criteria §1): The patient has completed a full course of conservative management for the current episode of care.
- Clinical Appropriateness Guidelines for Joint Surgery - Prior Authorization: Patient has undergone at least 12 weeks of non-surgical conservative management prior to the procedure.
- ERISA 29 C.F.R. § 2560.503-1(g)(1): Claims procedure regulations require plan administrators to disclose specific internal rules, guidelines, and protocols used to deny coverage.`,
    fullAppealMarkdown: `# Appeal of Adverse Benefit Determination

**Claim reference:** #${claim1Number}

**Claim details**
- Patient/member: Eleanor Vance
- Member ID: CIG-982341-01
- Date of service: June 12, 2026
- Procedure code(s): 29881
- Diagnosis code(s): M23.22
- Denial reason: CO-50 - Service denied as not medically necessary
- Amount at issue: $6,400

Dear Appeals and Grievances Team,

I request reconsideration of the adverse benefit determination for Claim #${claim1Number}, relating to the service provided on June 12, 2026. The denial notice cites CO-50 — These are non-covered services because this is not deemed a medical necessity by the payer. Please review the submitted clinical records and applicable plan criteria and reprocess the claim if benefits are payable under the plan.

## Clinical basis for reconsideration

The following clinical summary and documented patient-specific findings are submitted in support of this reconsideration request:

**Symptoms and functional impact:**
> Patient exhibits persistent right knee medial joint line pain (7/10 VAS) with painful catching and true mechanical locking episodes during ambulation, severely impairing weight-bearing activities of daily living.

**Examination findings:**
> Distinct right medial joint line tenderness, positive McMurray test reproducing painful medial clicking, mild reactive effusion, and painful extension block at 5 degrees.

**Imaging and diagnostic findings:**
> High-resolution MRI of the right knee (05/10/2026) confirms a complex posterior horn medial meniscus tear extending to the inferior articular surface with localized parameniscal cyst formation.

**Treatment history and response:**
> Completed 8 consecutive weeks of formal outpatient physical therapy (2x/weekly, Feb-Apr 2026) with zero symptomatic relief, 3-month trial of oral meloxicam 15mg daily, and one image-guided intra-articular steroid injection (03/20/2026) yielding only 4 days of transient relief.

**Other documented facts:**
> Dr. Robert Langston, MD certified that non-operative modalities have failed and arthroscopic partial medial meniscectomy (CPT 29881) is medically necessary under Cigna Medical Coverage Policy 0066 to resolve mechanical locking and prevent chondral degradation.

### Additional clinical information supplied for review (treating clinician consultation note and attestation):
> PATIENT: Eleanor Vance | DOB: 04/14/1968 | DOS: 06/12/2026
> TREATING PHYSICIAN CLINICAL ATTESTATION & CONSERVATIVE THERAPY RECORD:
> Patient Eleanor Vance is a 58-year-old female presenting with symptomatic right medial meniscus complex tear (ICD-10 M23.22) with recurrent mechanical knee locking, painful catching, and severe medial joint line tenderness.
> 
> CONSERVATIVE THERAPY MODALITIES COMPLETED & FAILED:
> 1. Supervised Physical Therapy: Completed 8 consecutive weeks of formal outpatient physical therapy (2 sessions/week from 02/03/2026 through 04/07/2026 at Sunstate Rehabilitation; 16 total sessions completed). Therapy discharge summary demonstrates zero improvement in mechanical catching symptoms.
> 2. Pharmacotherapy: 3-month trial of prescription Meloxicam (15 mg PO daily) with inadequate analgesic relief.
> 3. Intra-articular Injections: Image-guided right knee corticosteroid injection (Triamcinolone 40 mg on 03/20/2026) yielding only 4 days of transient partial relief.
> 
> CLINICAL NECESSITY DETERMINATION:
> Under Cigna Medical Coverage Policy 0066 (Knee Arthroscopy and Open Procedures), the patient has completed and failed all non-operative conservative management. Arthroscopic partial meniscectomy (CPT 29881) is medically necessary to resolve mechanical joint locking and prevent secondary articular cartilage damage.
> 
> Attending Orthopedic Surgeon: Dr. Robert Langston, MD, FAAOS (Metropolitan Surgical Hospital)

## Supporting documentation for review

The following policy materials are identified as review references. They should be evaluated together with the patient-specific clinical records:

- **Clinical Appropriateness Guidelines for Joint Surgery** — Medical Necessity Criteria §3 ([Official source](https://guidelines.carelonmedicalbenefitsmanagement.com/joint-surgery-2025-11-15/)): Imaging obtained within the past 12 months demonstrates significant joint destruction with evidence of degenerative changes.
- **Clinical Appropriateness Guidelines for Joint Surgery** — Medical Necessity Criteria §2 ([Official source](https://guidelines.carelonmedicalbenefitsmanagement.com/joint-surgery-2025-11-15/)): The patient has significant pain rated at least 3 out of 10 in intensity and associated with inability to perform ADLs and/or IADLs.
- **Clinical Appropriateness Guidelines for Joint Surgery** — Medical Necessity Criteria §1 ([Official source](https://guidelines.carelonmedicalbenefitsmanagement.com/joint-surgery-2025-11-15/)): The patient has completed a full course of conservative management for the current episode of care.
- **Clinical Appropriateness Guidelines for Joint Surgery - Prior Authorization** — Prior Authorization & Step Therapy: Patient has undergone at least 12 weeks of non-surgical conservative management prior to the procedure. Documented failure of conservative management or worsening of symptoms upon reevaluation.
- **Clinical Appropriateness Guidelines for Joint Surgery - Contraindications** — Contraindications & Exclusions: Active infection of the joint, active systemic bacteremia, active skin infection, or intra-articular corticosteroid injection within the past 6 weeks.

## Evidentiary Exhibits & Proof of Policy on Date of Service

Pursuant to ERISA 29 C.F.R. § 2560.503-1(h)(2)(iii), claimant incorporates visual archive exhibits captured at the time of clinical verification to preserve active clinical policy bulletin metadata and document provenance against retrospective modifications:

### Exhibit A: Proof of Policy on Date of Service — Clinical Appropriateness Guidelines for Joint Surgery
- Verified policy bulletin visual capture recorded on 2026-09-16 (Source: https://guidelines.carelonmedicalbenefitsmanagement.com/joint-surgery-2025-11-15/)
- Document provenance: Preserves active clinical policy bulletin metadata (Document ID, effective date, and review history) on Date of Service against retrospective alterations.
- Visual Proof Archive URL: https://guidelines.carelonmedicalbenefitsmanagement.com/joint-surgery-2025-11-15/

## Review requested

Please:
1. Reconsider and reprocess Claim #${claim1Number} under the applicable plan terms. If benefits are payable, please issue payment according to the plan and applicable provider agreement for the covered amount.
2. If the denial is upheld, provide the specific clinical rationale, plan provision, criteria applied, and documents relied upon.
3. Confirm receipt of this appeal and identify the applicable decision timeframe and any further review or external-review instructions.

Please process this appeal under the plan's claims and appeals procedure and the instructions in the denial notice. If ERISA applies, please treat this as a request for full and fair review under 29 C.F.R. § 2560.503-1.

Thank you for your review. Please reference Claim #${claim1Number} in any response.

Sincerely,

Jordan Lee
Appeals Coordinator
jordan.lee@orthoclinic.org
(555) 234-8901
Treating provider listed in the claim: Dr. Robert Langston, MD`,
    lastEditedBy: "Configured model Appeal Synthesizer",
    updatedAt: claim1CreatedAt + 15 * MIN_MS,
  });

  // Appeal 2: Marcus Sterling (Drafting)
  await ctx.db.insert("appeals", {
    claimId: claim2Id,
    version: 1,
    appealLevel: "level_1_internal",
    statutoryPosture: "administrative_reconsideration",
    targetAuthority: "Payer Medical Director Review",
    legalAggressiveness: "standard",
    statutoryAuthorities: [
      "ERISA 29 C.F.R. § 2560.503-1 (Full and Fair Review)",
      "Patient Protection and Affordable Care Act § 2719",
      "Published Clinical Policy Bulletins (CPB)",
    ],
    executiveSummary: `This appeal concerns the adverse benefit determination of an emergency lumbar laminectomy (CPT 63047) performed on July 4, 2026, for patient Marcus Sterling (Member ID: GEO-554210-99). The claim was denied for lack of prior authorization (CO-197). We request a reversal of this denial based on the emergency nature of the patient's condition, which necessitated immediate surgical intervention within 24 hours to prevent permanent neurological motor paralysis (right foot drop).`,
    medicalNecessityArguments: `The following clinical summary and documented patient-specific findings are submitted in support of this reconsideration request:

Symptoms and functional impact:
> Acute onset of intractable right lower extremity radiculopathy in L5-S1 distribution with rapid progression to motor weakness and right foot drop over 48 hours. Patient unable to ambulate or bear weight safely.

Examination findings:
> Neurological examination demonstrates right foot drop with extensor hallucis longus and tibialis anterior weakness (grade 3/5), positive straight leg raise test on right at 30 degrees, absent right Achilles reflex (0/2), and L5-S1 hypoesthesia.

Imaging and diagnostic findings:
> Emergency lumbar spine MRI (06/28/2026) demonstrated acute extruded L5-S1 right paracentral disc herniation causing high-grade central canal stenosis and acute impingement of the traversing right S1 nerve root.

Treatment history and response:
> Patient was undergoing conservative outpatient physical therapy and oral analgesics, but suffered sudden neurological deterioration requiring emergency surgical decompression to prevent irreversible nerve root damage.

Other documented facts:
> Attending neurosurgeon Dr. Sarah Chen, MD documented that emergency decompression was immediately necessary within 24 hours to prevent permanent foot drop, satisfying retroactive authorization criteria under Carelon Clinical Guidelines for Spine Surgery (Lumbar Decompression) / GeoBlue Policy SURG.00011.`,
    legalCitations: `- Spine Surgery Clinical Policy Guidelines (Medical Necessity Criteria §1): Significant functional impairment due to radicular pain which has not improved after conservative management and supported by imaging findings that demonstrate acute nerve root compression.
- Laminectomy for Lumbar Disc Herniation (63047): Laminectomy, facetectomy and foraminotomy single vertebral segment; lumbar. Laminectomy is considered medically necessary for motor strength deficit (myotomal) and central disc herniation in the spinal canal.
- Carelon Guideline SURG.00011 (Emergency Exception): Prospective authorization is waived for emergent surgical procedures where delay would risk permanent loss of function.
- ERISA 29 C.F.R. § 2560.503-1(h)(2)(iii): Claimants must be provided with full and fair review of emergency medical records.`,
    fullAppealMarkdown: `# Appeal of Adverse Benefit Determination

**Claim reference:** #${claim2Number}

**Claim details**
- Patient/member: Marcus Sterling
- Member ID: GEO-554210-99
- Date of service: July 4, 2026
- Procedure code(s): 63047
- Diagnosis code(s): M51.26
- Denial reason: CO-197 - Precertification / prior authorization / notification absent or lacking
- Amount at issue: $18,200

Dear Appeals and Grievances Team,

I request reconsideration of the adverse benefit determination for Claim #${claim2Number}, relating to the emergency service provided on July 4, 2026. The denial notice cites CO-197 — Precertification / prior authorization / notification absent or lacking. Please review the submitted emergency clinical records and applicable plan criteria and reprocess the claim if benefits are payable under the plan.

## Clinical basis for reconsideration

The following clinical summary and documented patient-specific findings are submitted in support of this reconsideration request:

**Symptoms and functional impact:**
> Acute onset of intractable right lower extremity radiculopathy in L5-S1 distribution with rapid progression to motor weakness and right foot drop over 48 hours. Patient unable to ambulate or bear weight safely.

**Examination findings:**
> Neurological examination demonstrates right foot drop with extensor hallucis longus and tibialis anterior weakness (grade 3/5), positive straight leg raise test on right at 30 degrees, absent right Achilles reflex (0/2), and L5-S1 hypoesthesia.

**Imaging and diagnostic findings:**
> Emergency lumbar spine MRI (06/28/2026) demonstrated acute extruded L5-S1 right paracentral disc herniation causing high-grade central canal stenosis and acute impingement of the traversing right S1 nerve root.

**Treatment history and response:**
> Patient was undergoing conservative outpatient physical therapy and oral analgesics, but suffered sudden neurological deterioration requiring emergency surgical decompression to prevent irreversible nerve root damage.

**Other documented facts:**
> Attending neurosurgeon Dr. Sarah Chen, MD documented that emergency decompression was immediately necessary within 24 hours to prevent permanent foot drop, satisfying retroactive authorization criteria under Carelon Clinical Guidelines for Spine Surgery (Lumbar Decompression) / GeoBlue Policy SURG.00011.

### Additional clinical information supplied for review (treating clinician consultation note and attestation):
> PATIENT: Marcus Sterling | DOB: 11/22/1974 | DOS: 07/04/2026
> ATTENDING NEUROSURGEON EMERGENCY CLINICAL ATTESTATION:
> Patient Marcus Sterling presented on an emergency basis with acute intractable right lower extremity radiculopathy in the L5-S1 dermatomal distribution accompanied by acute progressive neurological deterioration over a 48-hour window.
> 
> CLINICAL EXAMINATION & NEUROLOGICAL DEFICITS:
> 1. Motor Deficits: Objective right foot drop with extensor hallucis longus (EHL) and tibialis anterior motor strength graded 3/5 (against gravity only, no resistance).
> 2. Reflexes & Sensory: Absent right Achilles deep tendon reflex (0/2), positive straight leg raise test at 30 degrees on right, and marked hypoesthesia across right lateral foot and S1 distribution.
> 3. Diagnostic MRI: Emergency lumbar MRI (06/28/2026) revealed acute large extruded L5-S1 right paracentral disc herniation resulting in severe central canal stenosis and acute severe impingement of the traversing right S1 nerve root.
> 
> EMERGENCY SURGICAL INDICATION & RETROACTIVE PRE-AUTHORIZATION:
> In accordance with Carelon Clinical Appropriateness Guidelines for Spine Surgery (Lumbar Decompression / Laminectomy), GeoBlue Policy SURG.00011, and prudent layperson emergency standards, emergency lumbar laminectomy, facetectomy, and foraminotomy (CPT 63047) was immediately indicated within 24 hours to prevent permanent motor paralysis and irreversible nerve root ischemia. Awaiting prospective commercial prior authorization was medically contraindicated and posed immediate threat of permanent disability.
> 
> Attending Neurosurgeon: Dr. Sarah Chen, MD, FAANS (Spine & Neurosurgery Associates)

## Supporting documentation for review

The following policy materials are identified as review references:
- **Spine Surgery Clinical Policy Guidelines** — Medical Necessity Criteria §1 ([Official source](https://guidelines.carelonmedicalbenefitsmanagement.com/spine-surgery-2025-11-15-updated-2026-01-01/)): Significant functional impairment due to radicular pain with motor deficit exempt from prospective step therapy.
- **Laminectomy for Lumbar Disc Herniation** — CPT 63047: Decompression of spinal cord and/or nerve roots for central disc herniation causing bilateral root compression or motor deficit.

## Evidentiary Exhibits & Proof of Policy on Date of Service

Pursuant to ERISA 29 C.F.R. § 2560.503-1(h)(2)(iii), claimant incorporates visual archive exhibits captured at the time of clinical verification:

### Exhibit A: Proof of Policy on Date of Service — Spine Surgery Clinical Policy Guidelines
- Verified policy bulletin visual capture recorded on 2026-09-16 (Source: https://guidelines.carelonmedicalbenefitsmanagement.com/spine-surgery-2025-11-15-updated-2026-01-01/)
- Document provenance: Preserves active clinical policy bulletin metadata on Date of Service against retrospective alterations.
- Visual Proof Archive URL: https://guidelines.carelonmedicalbenefitsmanagement.com/spine-surgery-2025-11-15-updated-2026-01-01/

## Review requested

Please:
1. Reconsider and reprocess Claim #${claim2Number} under the applicable plan terms and emergency exception policies. Issue payment according to the plan for the covered amount ($18,200).
2. If the denial is upheld, provide the specific clinical rationale, plan provision, criteria applied, and documents relied upon.
3. Confirm receipt of this appeal and identify the applicable decision timeframe.

Thank you for your review. Please reference Claim #${claim2Number} in any response.

Sincerely,

Alex Morgan
Surgical Case Coordinator
alex.morgan@spineinstitute.org
(555) 456-7890
Treating provider listed in the claim: Dr. Sarah Chen, MD`,
    lastEditedBy: "Configured model Appeal Synthesizer",
    updatedAt: claim2CreatedAt + 15 * MIN_MS,
  });

  // Appeal 3: Michael Patel (Overturned / Won)
  await ctx.db.insert("appeals", {
    claimId: claim3Id,
    version: 1,
    appealLevel: "level_1_internal",
    statutoryPosture: "administrative_reconsideration",
    targetAuthority: "Payer Medical Director Review",
    legalAggressiveness: "standard",
    isHumanApproved: true,
    approvedAt: now - 2 * DAY_MS,
    approvedBy: "Taylor Reed",
    approvalNotes: "Verified weight-bearing radiograph records from Lakewood Orthopedic Imaging and satisfied CPB 0171 Section II.A criteria. Dispatched formal appeal dossier via AgentMail to aetnaintl_appeals@aetna.com.",
    statutoryAuthorities: [
      "ERISA 29 C.F.R. § 2560.503-1 (Full and Fair Review)",
      "Patient Protection and Affordable Care Act § 2719",
      "Published Clinical Policy Bulletins (CPB)",
    ],
    executiveSummary: `This appeal concerns the adverse benefit determination of CPT 73721 (MRI of the knee) for patient Michael Patel (Member ID: AET-773419-02) for the date of service 07/18/2026. The claim was denied under code CO-16, citing a lack of documented weight-bearing plain radiographs as required by Aetna Clinical Policy Bulletin (CPB) 0171. We are submitting evidence that these requirements were met prior to the MRI, and that the procedure is medically necessary to evaluate persistent internal derangement.`,
    medicalNecessityArguments: `The following clinical summary and documented patient-specific findings are submitted in support of this reconsideration request:

Symptoms and functional impact:
> Patient reports 8 weeks of persistent right knee pain, joint line tenderness, clicking sensations, and intermittent giving way following a twisting sports injury. Unable to run, squat, or climb stairs without sharp pain.

Examination findings:
> Physical exam reveals positive McMurray test on medial joint line, localized medial joint line tenderness, mild joint effusion, and terminal flexion discomfort at 115 degrees.

Imaging and diagnostic findings:
> Weight-bearing plain radiographs (AP/Lateral) completed on 05/20/2026 demonstrated no acute fracture, preserved joint spaces, and minimal degenerative changes, confirming compliance with Aetna CPB 0171 x-ray requirements prior to MRI.

Treatment history and response:
> Completed 6 weeks of conservative management consisting of oral NSAIDs (naproxen 500mg BID), activity modification, and home physical therapy exercises without symptom resolution.

Other documented facts:
> Enclosed prior weight-bearing radiograph report dated 05/20/2026 cures the documentation deficiency cited in denial code CO-16 under Aetna CPB 0171.`,
    legalCitations: `- Aetna Clinical Policy Bulletin 0171 on MRI of the Extremities (CPT Code 73721): Aetna considers magnetic resonance imaging (MRI) studies of the knee medically necessary when persistent knee pain/swelling is not responding to at least 3 weeks of conservative therapy and initial radiographs are negative.
- CMS NCD 220.2 (Magnetic Resonance Imaging): MRI is reasonable and necessary to diagnose internal derangement when radiographs are negative.
- 29 CFR § 2560.503-1(g): Adverse benefit determinations based on missing records are cured upon submission of the missing diagnostic report.`,
    fullAppealMarkdown: `# Appeal of Adverse Benefit Determination

**Claim reference:** #${claim3Number}

**Claim details**
- Patient/member: Michael Patel
- Member ID: AET-773419-02
- Date of service: July 18, 2026
- Procedure code(s): 73721
- Diagnosis code(s): M23.22
- Denial reason: CO-16 - Claim lacks information: weight-bearing plain radiographs not documented prior to advanced MRI imaging
- Amount at issue: $2,850

Dear Appeals and Grievances Team,

I request reconsideration of the adverse benefit determination for Claim #${claim3Number}, relating to the service provided on July 18, 2026. The denial notice cites CO-16 — Claim lacks information or has submission error. Please review the submitted clinical records and applicable plan criteria and reprocess the claim if benefits are payable under the plan.

## Clinical basis for reconsideration

The following clinical summary and documented patient-specific findings are submitted in support of this reconsideration request:

**Symptoms and functional impact:**
> Patient reports 8 weeks of persistent right knee pain, joint line tenderness, clicking sensations, and intermittent giving way following a twisting sports injury. Unable to run, squat, or climb stairs without sharp pain.

**Examination findings:**
> Physical exam reveals positive McMurray test on medial joint line, localized medial joint line tenderness, mild joint effusion, and terminal flexion discomfort at 115 degrees.

**Imaging and diagnostic findings:**
> Weight-bearing plain radiographs (AP/Lateral) completed on 05/20/2026 demonstrated no acute fracture, preserved joint spaces, and minimal degenerative changes, confirming compliance with Aetna CPB 0171 x-ray requirements prior to MRI.

**Treatment history and response:**
> Completed 6 weeks of conservative management consisting of oral NSAIDs (naproxen 500mg BID), activity modification, and home physical therapy exercises without symptom resolution.

**Other documented facts:**
> Enclosed prior weight-bearing radiograph report dated 05/20/2026 cures the documentation deficiency cited in denial code CO-16 under Aetna CPB 0171.

### Additional clinical information supplied for review (treating clinician consultation note and attestation):
> PATIENT: Michael Patel | DOB: 09/03/1982 | DOS: 07/18/2026
> TREATING CLINICIAN CONSULTATION NOTE & RADIOLOGY ATTESTATION:
> Patient Michael Patel is a 43-year-old male presenting for advanced diagnostic evaluation of persistent right knee pain, joint line clicking, and episodes of knee giving way subsequent to an acute rotational sports injury 8 weeks prior.
> 
> OBJECTIVE CLINICAL FINDINGS:
> 1. Physical Examination: Localized tenderness along the medial joint line, positive McMurray sign with palpable pop/click, mild joint effusion, and terminal flexion limited to 115 degrees due to mechanical impingement.
> 2. Prior Plain Radiographs (Aetna CPB 0171 Compliance): Weight-bearing bilateral AP and lateral radiographs of the right knee were completed on 05/20/2026 at Global Diagnostic Imaging. X-rays confirmed absence of fracture or dislocation with preserved joint spacing, satisfying the prerequisite 6-month radiograph mandate under Aetna Clinical Policy Bulletin 0171.
> 3. Conservative Management: Underwent 6 weeks of structured conservative therapy consisting of oral Naproxen (500 mg BID), cryotherapy, and home exercise regimen without symptomatic relief.
> 
> ADVANCED IMAGING MEDICAL NECESSITY:
> Magnetic Resonance Imaging of the knee without contrast (CPT 73721) is medically necessary to assess internal meniscal derangement and evaluate for surgical arthroscopy. Denial code CO-16 is refuted as qualifying plain radiographs (05/20/2026) were performed and are submitted herewith under Aetna CPB 0171 criteria.
> 
> Attending Physician: Dr. Angela Martinez, MD (Global Diagnostic Imaging Group)

## Supporting documentation for review

The following policy materials are identified as review references:
- **Aetna Clinical Policy Bulletin 0171 on MRI of the Extremities** — CPT Code 73721 ([Official source](https://www.aetna.com/cpb/medical/data/100_199/0171.html)): Detection, staging, persistent knee pain/swelling not responding to at least 3 weeks of conservative therapy and initial radiographs.

## Evidentiary Exhibits & Proof of Policy on Date of Service

Pursuant to ERISA 29 C.F.R. § 2560.503-1(h)(2)(iii), claimant incorporates visual archive exhibits captured at the time of clinical verification:

### Exhibit A: Proof of Policy on Date of Service — Aetna Clinical Policy Bulletin 0171 on MRI of the Extremities
- Verified policy bulletin visual capture recorded on 2026-09-13 (Source: https://www.aetna.com/cpb/medical/data/100_199/0171.html)
- Document provenance: Preserves active clinical policy bulletin metadata on Date of Service against retrospective alterations.
- Visual Proof Archive URL: https://www.aetna.com/cpb/medical/data/100_199/0171.html

## Review requested

Please:
1. Reconsider and reprocess Claim #${claim3Number} under the applicable plan terms. Issue payment for the covered amount ($2,850).
2. If the denial is upheld, provide the specific clinical rationale, plan provision, criteria applied, and documents relied upon.
3. Confirm receipt of this appeal.

Thank you for your review. Please reference Claim #${claim3Number} in any response.

Sincerely,

Taylor Reed
Appeals Specialist
taylor.reed@diagnosticimaging.org
(555) 789-0123
Treating provider listed in the claim: Dr. Angela Martinez, MD`,
    lastEditedBy: "Configured model Appeal Synthesizer",
    updatedAt: claim3CreatedAt + 15 * MIN_MS,
  });

  // =========================================================================
  // 5. PHYSICIAN PEER-TO-PEER (P2P) DEFENSE SCRIPTS (4-Phase Tele-Scripts)
  // =========================================================================

  // P2P Script 1: Jordan Lee / Dr. Robert Langston (Cigna Meniscectomy)
  await ctx.db.insert("p2pScripts", {
    claimId: claim1Id,
    version: 1,
    physicianName: "Jordan Lee",
    physicianSpecialty: "Appeals Coordinator",
    medicalDirectorRole: "Insurer Medical Director / Utilization Reviewer",
    estimatedCallDuration: "3 Minutes",
    openingStatutoryStatement: `This is Dr. Jordan Lee, Appeals Coordinator for Dr. Robert Langston, regarding the claim for patient Eleanor Vance, Member ID CIG-982341-01. Before we proceed, I am placing you on formal notice under 29 CFR § 2560.503-1(h)(2)(iii). I am requesting your full name, board certification status, and confirmation that your specialty matches the requested procedure, as required by California Health and Safety Code for utilization review clinical peer reviews. Please state for the record if you are an active, board-certified orthopedic surgeon.`,
    clinicalPolicyCitations: [
      {
        cpbTitle: "Cigna Medical Coverage Policy 0066",
        section: "Criteria for Knee Arthroscopy",
        criteriaMetText: "Documented 8 weeks of physical therapy and failure of conservative management.",
        rebuttalBullet: "Patient completed 16 sessions of PT at Sunstate Rehab, failing to resolve mechanical locking symptoms.",
        sourceUrl: "https://cignaforhcp.cigna.com",
      },
      {
        cpbTitle: "Cigna Medical Coverage Policy 0066",
        section: "Clinical Necessity - Pharmacotherapy/Intervention",
        criteriaMetText: "Trial of NSAIDs and intra-articular injections.",
        rebuttalBullet: "Patient trial of Meloxicam and steroid injection provided only 4 days of transient relief, confirming failure of non-surgical management.",
        sourceUrl: "https://cignaforhcp.cigna.com",
      },
    ],
    disqualificationCounters: [
      {
        insurerTrapQuestion: "Has the patient tried further physical therapy or non-surgical options?",
        physicianDirectRebuttal: "The patient has exhausted all conservative modalities. 16 sessions of physical therapy failed to resolve mechanical symptoms. Continuing PT is clinically contraindicated as it ignores the mechanical nature of the tear.",
        clinicalRationale: "Mechanical locking constitutes a mechanical blockage within the joint; physical therapy cannot correct an anatomical meniscal tear.",
        regulatoryLeverage: "Denying medically necessary surgery despite failed conservative measures constitutes a violation of the requirement for a 'full and fair review' under ERISA guidelines.",
      },
    ],
    statutoryDemands: "I am formally requesting a written justification for this denial identifying the specific clinical guidelines used, as well as the name and credentials of the reviewer, to be provided within 24 hours. Failure to produce this documentation will result in an immediate filing of a formal complaint with the California Department of Managed Health Care (DMHC) for bad-faith utilization review.",
    condensedCheatSheet: {
      rapidChecklist: [
        "Confirm reviewer name and specialty credentials",
        "Cite failure of 8 weeks of supervised PT",
        "Cite failure of pharmacotherapy and intra-articular injections",
        "Emphasize mechanical nature of symptoms to preempt conservative therapy arguments",
      ],
      keyDiagnosisCodes: ["M23.22"],
      keyProcedureCodes: ["29881"],
      mustSayPoints: [
        "Patient has mechanical symptoms: locking and catching",
        "16 sessions of physical therapy completed with zero improvement",
        "Failure of conservative management is documented",
        "Procedure is necessary to prevent secondary articular cartilage damage",
      ],
      doNotConcedePoints: [
        "Do not agree to more conservative therapy",
        "Do not accept vague 'not medically necessary' responses without specific clinical evidence",
        "Do not end the call without the reviewer's full name and license number",
      ],
      closingDemandStatement: "I expect a reversal of this denial based on the clinical record provided. If you maintain this denial, provide the name and license number of the medical director for our formal appeal to the California Insurance Commissioner.",
    },
    fullScriptMarkdown: `# Peer-to-Peer (P2P) Defense Tele-Script

**Case Reference:** Claim #${claim1Number} | **Member:** Eleanor Vance (ID: CIG-982341-01)
**Target Call Duration:** 3 Minutes | **Payer:** Cigna Global Health Benefits (Insurer Medical Director / Utilization Reviewer)
**Treating Physician:** Jordan Lee (Appeals Coordinator)
**Codes at Issue:** CPT 29881 | ICD-10 M23.22 | **Denied Amount:** $6,400

---

## [0:00 - 0:45] Phase 1: Statutory Opening & Credential Challenge

> **Physician Verbal Script (Read directly upon call connection):**

This is Dr. Jordan Lee, Appeals Coordinator for Dr. Robert Langston, regarding the claim for patient Eleanor Vance, Member ID CIG-982341-01. Before we proceed, I am placing you on formal notice under 29 CFR § 2560.503-1(h)(2)(iii). I am requesting your full name, board certification status, and confirmation that your specialty matches the requested procedure, as required by California Health and Safety Code for utilization review clinical peer reviews. Please state for the record if you are an active, board-certified orthopedic surgeon.

---

## [0:45 - 2:00] Phase 2: Exact Policy Section Citations & Clinical Defense

> **Physician Verbal Script (Cite exact published criteria sections):**

**Point 1 (Cigna Medical Coverage Policy 0066 § Criteria for Knee Arthroscopy):**
"Patient completed 16 sessions of PT at Sunstate Rehab, failing to resolve mechanical locking symptoms."
*Documented clinical proof:* Documented 8 weeks of physical therapy and failure of conservative management.

**Point 2 (Cigna Medical Coverage Policy 0066 § Clinical Necessity - Pharmacotherapy/Intervention):**
"Patient trial of Meloxicam and steroid injection provided only 4 days of transient relief, confirming failure of non-surgical management."
*Documented clinical proof:* Trial of NSAIDs and intra-articular injections.

---

## [2:00 - 2:45] Phase 3: Disqualification Trap Counters

### Trap Question: "Has the patient tried further physical therapy or non-surgical options?"
**Physician Counter-Strike:**
> "The patient has exhausted all conservative modalities. 16 sessions of physical therapy failed to resolve mechanical symptoms. Continuing PT is clinically contraindicated as it ignores the mechanical nature of the tear."

---

## [2:45 - 3:30] Phase 4: State Bad-Faith Warning & Written Denial Demand

> **Physician Closing Salvo (Before concluding the call):**

I am formally requesting a written justification for this denial identifying the specific clinical guidelines used, as well as the name and credentials of the reviewer, to be provided within 24 hours. Failure to produce this documentation will result in an immediate filing of a formal complaint with the California Department of Managed Health Care (DMHC) for bad-faith utilization review.`,
    lastEditedBy: "P2P Defense Tele-Script Generator",
    createdAt: claim1CreatedAt + 16 * MIN_MS,
    updatedAt: claim1CreatedAt + 16 * MIN_MS,
  });

  // P2P Script 2: Dr. Sarah Chen, MD (GeoBlue Spine Decompression)
  await ctx.db.insert("p2pScripts", {
    claimId: claim2Id,
    version: 1,
    physicianName: "Dr. Sarah Chen, MD",
    physicianSpecialty: "Spine & Neurosurgery",
    medicalDirectorRole: "Insurer Medical Director / Utilization Reviewer",
    estimatedCallDuration: "3 Minutes",
    openingStatutoryStatement: `This is Dr. Sarah Chen, MD, attending neurosurgeon for Marcus Sterling, Member ID GEO-554210-99. Before we discuss this case, I am placing you on formal notice under ERISA 29 CFR § 2560.503-1(h)(2)(iii) and California Health and Safety Code. I am requesting your full name, board certification status, and confirmation that you are an active board-certified neurosurgeon or orthopedic spine surgeon authorized to evaluate acute surgical decompression.`,
    clinicalPolicyCitations: [
      {
        cpbTitle: "Carelon Clinical Guidelines for Spine Surgery (Policy SURG.00011)",
        section: "Emergency Exception & Retroactive Authorization",
        criteriaMetText: "Acute progressive neurological motor deficit (foot drop, 3/5 motor strength) requiring emergency surgical intervention within 24 hours.",
        rebuttalBullet: "Patient presented with acute extruded L5-S1 disc herniation and rapidly advancing right foot drop. Prospective prior authorization was medically contraindicated.",
        sourceUrl: "https://guidelines.carelonmedicalbenefitsmanagement.com/spine-surgery-2025-11-15-updated-2026-01-01/",
      },
      {
        cpbTitle: "Carelon Spine Surgery Guidelines",
        section: "Lumbar Decompression / Laminectomy (CPT 63047)",
        criteriaMetText: "Documentation of central disc herniation in spinal canal causing thecal sac impingement and motor deficit.",
        rebuttalBullet: "Emergency MRI on 06/28/2026 demonstrated severe L5-S1 disc extrusion compressing S1 nerve root.",
        sourceUrl: "https://guidelines.carelonmedicalbenefitsmanagement.com/spine-surgery-2025-11-15-updated-2026-01-01/",
      },
    ],
    disqualificationCounters: [
      {
        insurerTrapQuestion: "Why was prior authorization not obtained prior to the surgical date of service?",
        physicianDirectRebuttal: "This was an emergent clinical deterioration with progressive right foot drop over 48 hours. Under prudent layperson emergency standards and Carelon Guideline SURG.00011 emergency exceptions, delaying decompression to await administrative authorization would have caused permanent irreversible paralysis.",
        clinicalRationale: "Acute disc extrusion with progressive motor weakness constitutes a neurological emergency.",
        regulatoryLeverage: "ERISA and state emergency mandate rules prohibit insurers from denying retroactive authorization for urgent surgical care.",
      },
    ],
    statutoryDemands: "I am formally demanding retroactive authorization for CPT 63047 under the Carelon emergency exception. If you uphold this administrative denial, provide your name, medical license number, and the specific clinical criteria used to override our emergency findings within 24 hours, which will be submitted directly to the California Department of Insurance.",
    condensedCheatSheet: {
      rapidChecklist: [
        "Confirm reviewer board certification in neurosurgery/orthopedic spine",
        "Cite Carelon SURG.00011 emergency exception",
        "Cite acute foot drop and 3/5 motor weakness",
        "Demand retroactive authorization under ERISA emergency standards",
      ],
      keyDiagnosisCodes: ["M51.26"],
      keyProcedureCodes: ["63047"],
      mustSayPoints: [
        "Acute progressive right foot drop (motor grade 3/5)",
        "Emergency MRI demonstrated large L5-S1 disc extrusion compressing S1 nerve",
        "Prospective prior authorization was contraindicated due to threat of permanent paralysis",
        "Carelon Policy SURG.00011 explicitly recognizes emergency surgical exceptions",
      ],
      doNotConcedePoints: [
        "Do not agree that prior auth was required for an acute neurological emergency",
        "Do not accept delays for further records",
        "Do not allow reviewer to avoid identifying board credentials",
      ],
      closingDemandStatement: "I demand immediate retroactive approval of CPT 63047 under the Carelon emergency exception. If denied, provide your written clinical rationale and medical license number for our California Department of Insurance complaint.",
    },
    fullScriptMarkdown: `# Peer-to-Peer (P2P) Defense Tele-Script

**Case Reference:** Claim #${claim2Number} | **Member:** Marcus Sterling (ID: GEO-554210-99)
**Target Call Duration:** 3 Minutes | **Payer:** GeoBlue Worldwide Medical Insurance
**Treating Physician:** Dr. Sarah Chen, MD (Spine & Neurosurgery Associates)
**Codes at Issue:** CPT 63047 | ICD-10 M51.26 | **Denied Amount:** $18,200

---

## [0:00 - 0:45] Phase 1: Statutory Opening & Credential Challenge

> **Physician Verbal Script (Read directly upon call connection):**

This is Dr. Sarah Chen, MD, attending neurosurgeon for Marcus Sterling, Member ID GEO-554210-99. Before we discuss this case, I am placing you on formal notice under ERISA 29 CFR § 2560.503-1(h)(2)(iii) and California Health and Safety Code. I am requesting your full name, board certification status, and confirmation that you are an active board-certified neurosurgeon or orthopedic spine surgeon authorized to evaluate acute surgical decompression.

---

## [0:45 - 2:00] Phase 2: Exact Policy Section Citations & Clinical Defense

> **Physician Verbal Script (Cite exact published criteria sections):**

**Point 1 (Carelon Clinical Guidelines for Spine Surgery § SURG.00011 Emergency Exception):**
"Patient presented with acute extruded L5-S1 disc herniation and rapidly advancing right foot drop. Prospective prior authorization was medically contraindicated."

---

## [2:00 - 2:45] Phase 3: Disqualification Trap Counters

### Trap Question: "Why was prior authorization not obtained prior to the surgical date of service?"
**Physician Counter-Strike:**
> "This was an emergent clinical deterioration with progressive right foot drop over 48 hours. Under prudent layperson emergency standards and Carelon Guideline SURG.00011 emergency exceptions, delaying decompression to await administrative authorization would have caused permanent irreversible paralysis."

---

## [2:45 - 3:30] Phase 4: State Bad-Faith Warning & Written Denial Demand

> **Physician Closing Salvo:**

I am formally demanding retroactive authorization for CPT 63047 under the Carelon emergency exception. If you uphold this administrative denial, provide your name, medical license number, and the specific clinical criteria used to override our emergency findings within 24 hours, which will be submitted directly to the California Department of Insurance.`,
    lastEditedBy: "P2P Defense Tele-Script Generator",
    createdAt: claim2CreatedAt + 16 * MIN_MS,
    updatedAt: claim2CreatedAt + 16 * MIN_MS,
  });

  // P2P Script 3: Taylor Reed / Dr. Angela Martinez (Aetna Knee MRI)
  await ctx.db.insert("p2pScripts", {
    claimId: claim3Id,
    version: 1,
    physicianName: "Taylor Reed",
    physicianSpecialty: "Appeals Specialist",
    medicalDirectorRole: "Insurer Medical Director / Utilization Reviewer",
    estimatedCallDuration: "3 Minutes",
    openingStatutoryStatement: `This is Taylor Reed, Appeals Specialist, calling regarding Michael Patel, Member ID AET-773419-02. Before we proceed, I am placing this call on the record pursuant to California Health and Safety Code Section 1367.01 and ERISA 29 CFR 2560.503-1. I am requesting confirmation of your board certification specialty as required by law.`,
    clinicalPolicyCitations: [
      {
        cpbTitle: "Aetna Clinical Policy Bulletin 0171 on MRI of the Extremities",
        section: "CPT Code 73721",
        criteriaMetText: "Adult patient with acute rotational trauma, negative initial radiographs, and clinical suspicion of internal derangement.",
        rebuttalBullet: "Patient presents with positive McMurray sign and mechanical symptoms, meeting the clinical threshold for MRI after negative plain films.",
        sourceUrl: "https://www.aetna.com/cpb/medical/data/100_199/0171.html",
      },
    ],
    disqualificationCounters: [
      {
        insurerTrapQuestion: "Why was the plain radiograph not sufficient?",
        physicianDirectRebuttal: "The plain radiographs were performed on 05/20/2026, satisfying the 6-month mandate of CPB 0171. They were negative for fracture, which is the exact clinical prerequisite for proceeding to MRI.",
        clinicalRationale: "Plain radiographs cannot visualize soft tissue structures like the meniscus or cruciate ligaments.",
        regulatoryLeverage: "The denial code CO-16 is factually incorrect as the records were submitted and satisfy the policy requirements.",
      },
    ],
    statutoryDemands: "I am formally requesting that you overturn this denial immediately. If you maintain this denial, I require your name, your NPI, and a written explanation of the specific clinical evidence used to override the treating physician's assessment under ERISA 29 CFR 2560.503-1(h)(2)(iii).",
    condensedCheatSheet: {
      rapidChecklist: [
        "Confirm MD credentials",
        "Cite CPB 0171 compliance",
        "Highlight mechanical symptoms",
        "Demand written overturn",
      ],
      keyDiagnosisCodes: ["M23.22"],
      keyProcedureCodes: ["73721"],
      mustSayPoints: [
        "Patient has mechanical symptoms (locking/giving way)",
        "Radiographs were completed on 05/20/2026",
        "Conservative therapy failed after 6 weeks",
        "MRI is the standard of care for suspected meniscal derangement",
      ],
      doNotConcedePoints: [
        "Do not accept 'lack of information' as a valid reason",
        "Do not agree to further conservative therapy",
      ],
      closingDemandStatement: "I expect an immediate reversal of this denial based on the submitted radiograph reports.",
    },
    fullScriptMarkdown: `# Peer-to-Peer (P2P) Defense Tele-Script

**Case Reference:** Claim #${claim3Number} | **Member:** Michael Patel (ID: AET-773419-02)
**Target Call Duration:** 3 Minutes | **Payer:** Aetna International
**Treating Clinician:** Taylor Reed (Appeals Specialist)
**Codes at Issue:** CPT 73721 | ICD-10 M23.22 | **Denied Amount:** $2,850

---

## [0:00 - 0:45] Phase 1: Statutory Opening & Credential Challenge

> **Physician Verbal Script (Read directly upon call connection):**

This is Taylor Reed, Appeals Specialist, calling regarding Michael Patel, Member ID AET-773419-02. Before we proceed, I am placing this call on the record pursuant to California Health and Safety Code Section 1367.01 and ERISA 29 CFR 2560.503-1. Please state your name and confirm that you are an active board-certified physician.

---

## [0:45 - 2:00] Phase 2: Exact Policy Section Citations & Clinical Defense

**Point 1 (Aetna CPB 0171 § CPT Code 73721):**
"Patient completed weight-bearing plain radiographs on 05/20/2026, satisfying prerequisite requirements prior to advanced knee MRI."

---

## [2:00 - 2:45] Phase 3: Disqualification Trap Counters

### Trap Question: "Why was the plain radiograph not sufficient?"
**Physician Counter-Strike:**
> "The plain radiographs were performed on 05/20/2026, satisfying the 6-month mandate of CPB 0171. They were negative for fracture, which is the exact clinical prerequisite for proceeding to MRI."`,
    lastEditedBy: "P2P Defense Tele-Script Generator",
    createdAt: claim3CreatedAt + 16 * MIN_MS,
    updatedAt: claim3CreatedAt + 16 * MIN_MS,
  });

  // =========================================================================
  // 6. PIPELINE ACTIVITIES (Live Autonomous Workflow Traces for All 3 Claims)
  // =========================================================================

  // Activities for Claim 1 (Eleanor Vance - Cigna Global)
  const run1Id = `run_${claim1CreatedAt}`;
  const c1Activities = [
    { stage: "run" as const, status: "running" as const, msg: "Kicking off the autonomous review. First I'll look up Cigna Global Health Benefits's official policy bulletins for this denial." },
    { stage: "crawl" as const, status: "running" as const, msg: "Searching Cigna Global Health Benefits's official policy bulletins for procedures 29881." },
    { stage: "crawl" as const, status: "completed" as const, msg: "Found 6 relevant clauses in Clinical Appropriateness Guidelines for Joint Surgery. Now weighing the case." },
    { stage: "precedents" as const, status: "running" as const, msg: "Searching past overturned cases with a similar CO-50 denial." },
    { stage: "precedents" as const, status: "completed" as const, msg: "Found 3 similar cases that were overturned. Weaving them into the argument." },
    { stage: "score" as const, status: "running" as const, msg: "Weighing 10 evidence clauses across the 4-pillar statutory rubric to audit Appeal Readiness." },
    { stage: "score" as const, status: "completed" as const, msg: "Statutory appeal readiness audited at 96/100 (strong), with 4 cited policy contradictions supporting statutory overturn." },
    { stage: "synthesis" as const, status: "running" as const, msg: "Drafting the appeal brief from 10 evidence clauses with legal citations." },
    { stage: "synthesis" as const, status: "completed" as const, msg: "The appeal brief is drafted with policy citations and statutory references." },
    { stage: "run" as const, status: "completed" as const, msg: "Review complete: 96/100 readiness score with the appeal brief drafted and ready." },
  ];
  for (let i = 0; i < c1Activities.length; i++) {
    const act = c1Activities[i];
    await ctx.db.insert("pipelineActivities", {
      claimId: claim1Id,
      runId: run1Id,
      stage: act.stage,
      status: act.status,
      message: act.msg,
      createdAt: claim1CreatedAt + i * 40 * 1000,
    });
  }

  // Activities for Claim 2 (Marcus Sterling - GeoBlue)
  const run2Id = `run_${claim2CreatedAt}`;
  const c2Activities = [
    { stage: "run" as const, status: "running" as const, msg: "Kicking off the autonomous review. First I'll look up GeoBlue Worldwide Medical Insurance's official policy bulletins for this denial." },
    { stage: "crawl" as const, status: "running" as const, msg: "Searching GeoBlue Worldwide Medical Insurance's official policy bulletins for procedures 63047." },
    { stage: "crawl" as const, status: "completed" as const, msg: "Found 3 relevant clauses in Spine Surgery Clinical Policy Guidelines. Now weighing the case." },
    { stage: "precedents" as const, status: "running" as const, msg: "Searching past overturned cases with a similar CO-197 denial." },
    { stage: "precedents" as const, status: "completed" as const, msg: "Found 3 similar cases that were overturned. Weaving them into the argument." },
    { stage: "score" as const, status: "running" as const, msg: "Weighing 6 evidence clauses across the 4-pillar statutory rubric to audit Appeal Readiness." },
    { stage: "score" as const, status: "completed" as const, msg: "Statutory appeal readiness audited at 94/100 (strong), with 3 cited policy contradictions supporting statutory overturn." },
    { stage: "synthesis" as const, status: "running" as const, msg: "Drafting the appeal brief from 6 evidence clauses with legal citations." },
    { stage: "synthesis" as const, status: "completed" as const, msg: "The appeal brief is drafted with policy citations and statutory references." },
    { stage: "run" as const, status: "completed" as const, msg: "Review complete: 94/100 readiness score with the appeal brief drafted and ready." },
  ];
  for (let i = 0; i < c2Activities.length; i++) {
    const act = c2Activities[i];
    await ctx.db.insert("pipelineActivities", {
      claimId: claim2Id,
      runId: run2Id,
      stage: act.stage,
      status: act.status,
      message: act.msg,
      createdAt: claim2CreatedAt + i * 40 * 1000,
    });
  }

  // Activities for Claim 3 (Michael Patel - Aetna)
  const run3Id = `run_${claim3CreatedAt}`;
  const c3Activities = [
    { stage: "run" as const, status: "running" as const, msg: "Kicking off the autonomous review. First I'll look up Aetna International's official policy bulletins for this denial." },
    { stage: "crawl" as const, status: "running" as const, msg: "Searching Aetna International's official policy bulletins for procedures 73721." },
    { stage: "crawl" as const, status: "completed" as const, msg: "Found 2 relevant clauses in Magnetic Resonance Imaging (MRI) of the Extremities. Now weighing the case." },
    { stage: "precedents" as const, status: "running" as const, msg: "Searching past overturned cases with a similar CO-16 denial." },
    { stage: "precedents" as const, status: "completed" as const, msg: "Found 3 similar cases that were overturned. Weaving them into the argument." },
    { stage: "score" as const, status: "running" as const, msg: "Weighing 5 evidence clauses across the 4-pillar statutory rubric to compute Appeal Viability Index." },
    { stage: "score" as const, status: "completed" as const, msg: "Appeal viability evaluated at 91/100 (strong), with 3 cited policy contradictions supporting statutory overturn." },
    { stage: "synthesis" as const, status: "running" as const, msg: "Drafting the appeal brief from 5 evidence clauses with legal citations." },
    { stage: "synthesis" as const, status: "completed" as const, msg: "The appeal brief is drafted with policy citations and statutory references." },
    { stage: "run" as const, status: "completed" as const, msg: "Review complete: 91/100 viability score with the appeal brief drafted and ready." },
  ];
  for (let i = 0; i < c3Activities.length; i++) {
    const act = c3Activities[i];
    await ctx.db.insert("pipelineActivities", {
      claimId: claim3Id,
      runId: run3Id,
      stage: act.stage,
      status: act.status,
      message: act.msg,
      createdAt: claim3CreatedAt + i * 40 * 1000,
    });
  }

  // =========================================================================
  // 7. AGENTMAIL INBOXES, THREADS & MESSAGES (Professional Overturned Case 3)
  // =========================================================================
  const thread3Id = await ctx.db.insert("emailThreads", {
    claimId: claim3Id,
    agentEmail: "appeals-aetna@claimhero.ai",
    payerEmail: "aetnaintl_appeals@aetna.com",
    subject: `Re: Reconsideration Decision: Michael Patel (Claim #${claim3Number})`,
    status: "resolved",
    lastMessageAt: now - 1 * DAY_MS,
  });

  // Outbound message: formal, professional Level 1 appeal dossier packet
  await ctx.db.insert("emailMessages", {
    threadId: thread3Id,
    claimId: claim3Id,
    direction: "outbound",
    sender: "appeals-aetna@claimhero.ai",
    recipient: "aetnaintl_appeals@aetna.com",
    subject: `[ClaimHero #${claim3Number}] Formal Level 1 Reconsideration Dossier | Member: Michael Patel (ID: AET-773419-02)`,
    bodyText: `CLAIMHERO APPEALS & ADVOCACY DESK
FORMAL ADVERSE BENEFIT DETERMINATION RECONSIDERATION
Date: July 28, 2026

To: Aetna International Clinical Grievance and Appeals Committee
Electronically Transmitted To: aetnaintl_appeals@aetna.com
From: Taylor Reed, Senior Appeals Specialist (appeals-aetna@claimhero.ai)
Subject: Formal Level 1 Reconsideration Dossier | Member: Michael Patel (ID: AET-773419-02)

================================================================================
CASE REFERENCE & ADJUDICATION SUMMARY
================================================================================
- Patient / Member: Michael Patel
- Member Identification: AET-773419-02
- Group Policy: Aetna Choice POS II (Intl Global Assignee Plan #948201-10)
- Claim Reference: #${claim3Number}
- Attending Ordering Physician: Dr. Angela Martinez, MD
- Servicing Imaging Facility: Global Diagnostic Imaging Group
- Date of Service: 07/18/2026
- Procedure Code Denied: CPT 73721 (Magnetic Resonance Imaging, Right Knee Joint; without contrast)
- Disputed Claim Amount: $2,850.00
- Initial Denial Code: CO-16 (Claim/service lacks information or has submission error)
- Cited Clinical Policy: Aetna Clinical Policy Bulletin (CPB) 0171: Magnetic Resonance Imaging (MRI) of the Extremities

================================================================================
FORMAL DEMAND FOR ADMINISTRATIVE RECONSIDERATION
================================================================================
Dear Medical Director and Appeals Review Committee:

Please accept this communication and enclosed clinical records as a formal Level 1 appeal submitted on behalf of member Michael Patel pursuant to 29 U.S.C. § 1133, ERISA 29 C.F.R. § 2560.503-1(h), and California Health and Safety Code § 1367.01.

The Explanation of Benefits dated 07/22/2026 denied coverage for CPT 73721 on the grounds that documented conservative weight-bearing radiographs had not been established prior to the acquisition of magnetic resonance imaging. We are submitting uncontroverted contemporaneous evidence demonstrating that all clinical indications and procedural requirements set forth under Aetna CPB 0171 were satisfied in full prior to the MRI examination.

1. CLINICAL CHRONOLOGY & CONSERVATIVE WORKUP VERIFICATION:
On May 20, 2026, member Michael Patel sustained an acute twisting injury to the right knee during physical activity, experiencing an immediate audible pop, acute anteromedial joint pain, significant joint effusion, and subsequent recurrent episodes of mechanical locking and giving way.

Contrary to the denial notification, Dr. Angela Martinez obtained a four-view weight-bearing plain radiograph series (AP standing, lateral 30° flexion, tunnel, and bilateral sunrise/Merchant views) on May 20, 2026 at Global Diagnostic Imaging Group (Accession #RAD-2026-90412). The radiologist report ruled out acute fracture, avulsion, or radiopaque loose bodies, while identifying medial compartment joint space narrowing and mechanical joint dysfunction.

Despite a documented eight-week conservative management regimen encompassing non-steroidal anti-inflammatory therapy (Meloxicam 15 mg daily), structured cryotherapy, and activity modification, the member suffered persistent mechanical catching and marked functional limitation precluding normal ambulation.

2. SATISFACTION OF AETNA CPB 0171 CRITERIA:
Aetna CPB 0171 (Magnetic Resonance Imaging of the Extremities, Section II.A) explicitly establishes coverage for knee MRI when either of the following indications is documented:
  a) Suspected internal derangement or meniscal pathology following acute rotational trauma where plain radiographs are negative or inconclusive; OR
  b) Persistent joint pain, effusion, or mechanical symptoms (locking, catching, or giving way) following completion of an appropriate conservative trial.

The clinical record conclusively satisfies both independent pathways:
- Prerequisite weight-bearing plain radiographs were completed on 05/20/2026 and confirmed inconclusive for soft-tissue derangement.
- Physical examination revealed a positive McMurray test, joint line tenderness, and recurrent antalgic instability.
- In accordance with CMS National Coverage Determination (NCD) 220.2, cross-sectional magnetic resonance imaging is the gold standard diagnostic modality required to evaluate intra-articular soft-tissue pathology and determine candidacy for surgical arthroscopic repair.

3. STATUTORY ERISA NOTICE & DEMAND:
Pursuant to ERISA 29 C.F.R. § 2560.503-1(h)(2)(iv), the health plan must conduct a full and fair review that takes into account all clinical documents submitted in support of the claim, without deference to the initial adverse determination, and must be reviewed by an independent medical director certified in the relevant clinical specialty.

We hereby request that Aetna International immediately overturn this adverse benefit determination, issue a benefit plan allowance of $2,850.00 for CPT 73721, and furnish an updated Explanation of Benefits releasing the patient from balance billing.

Respectfully submitted,

Taylor Reed, Senior Appeals Specialist
ClaimHero Legal & Clinical Advocacy Desk
appeals-aetna@claimhero.ai | Direct Appellate Reference: #${claim3Number}`,
    bodyHtml: `<div style="max-width:720px; margin:0 auto; padding:28px; background:#ffffff; color:#1e293b; font-family:Arial,Helvetica,sans-serif; border:1px solid #e2e8f0; border-radius:8px;">
      <div style="padding-bottom:16px; border-bottom:2px solid #0284c7; margin-bottom:20px;">
        <div style="color:#0284c7; font-size:11px; font-weight:700; letter-spacing:0.1em; text-transform:uppercase;">ClaimHero Appeals & Advocacy Desk</div>
        <h1 style="margin:6px 0 4px; color:#0f172a; font-size:20px; font-weight:700;">Formal Level 1 Reconsideration Dossier</h1>
        <div style="color:#64748b; font-size:12px;">Aetna International · Claim Reference #${claim3Number}</div>
      </div>
      <table role="presentation" style="width:100%; margin-bottom:20px; border-collapse:collapse; background:#f8fafc; border:1px solid #e2e8f0; border-radius:6px;">
        <tr><td style="padding:8px 12px; font-size:12px; color:#64748b;">Member Name</td><td style="padding:8px 12px; font-size:12px; font-weight:600; color:#0f172a;">Michael Patel (ID: AET-773419-02)</td></tr>
        <tr><td style="padding:8px 12px; font-size:12px; color:#64748b;">Date of Service</td><td style="padding:8px 12px; font-size:12px; font-weight:600; color:#0f172a;">07/18/2026</td></tr>
        <tr><td style="padding:8px 12px; font-size:12px; color:#64748b;">Procedure / Charge</td><td style="padding:8px 12px; font-size:12px; font-weight:600; color:#0f172a;">CPT 73721 (Knee MRI) · $2,850.00</td></tr>
        <tr><td style="padding:8px 12px; font-size:12px; color:#64748b;">Denial Citation</td><td style="padding:8px 12px; font-size:12px; font-weight:600; color:#0f172a;">CO-16 / Aetna CPB 0171 (Weight-bearing Radiographs)</td></tr>
      </table>
      <div style="font-size:13px; line-height:1.7; color:#334155;">
        <p><strong>Dear Medical Director and Appeals Review Committee:</strong></p>
        <p>Please accept this formal Level 1 appeal submitted on behalf of member Michael Patel pursuant to 29 U.S.C. § 1133, ERISA 29 C.F.R. § 2560.503-1(h), and California Health and Safety Code § 1367.01.</p>
        <p>Contemporaneous clinical records confirm that member Michael Patel completed a four-view weight-bearing radiograph series on 05/20/2026 at Global Diagnostic Imaging Group (Accession #RAD-2026-90412) prior to the MRI study. The radiologist report confirmed joint space narrowing and mechanical instability without acute fracture, satisfying Section II.A criteria under Aetna CPB 0171 and CMS NCD 220.2.</p>
        <p>We demand that Aetna International overturn the adverse determination in full, authorize payment of $2,850.00, and issue an amended Explanation of Benefits releasing the patient from balance billing.</p>
      </div>
      <div style="margin-top:24px; padding-top:14px; border-top:1px solid #e2e8f0; font-size:11px; color:#64748b;">
        Taylor Reed, Senior Appeals Specialist · ClaimHero Advocacy Desk · appeals-aetna@claimhero.ai
      </div>
    </div>`,
    hasAttachments: false,
    receivedAt: now - 2 * DAY_MS,
  });

  // Inbound message: formal, professional determination from insurer overturning denial
  await ctx.db.insert("emailMessages", {
    threadId: thread3Id,
    claimId: claim3Id,
    direction: "inbound",
    sender: "aetnaintl_appeals@aetna.com",
    recipient: "appeals-aetna@claimhero.ai",
    subject: `Re: Reconsideration Decision: Michael Patel (Claim #${claim3Number}) | Determination: OVERTURNED IN FULL`,
    bodyText: `AETNA INTERNATIONAL CLINICAL GRIEVANCE & APPEALS DEPARTMENT
P.O. Box 981543, El Paso, TX 79998-1543 | Secure Electronic Appeals Transmission
Notice Date: August 02, 2026

To: Taylor Reed, Senior Appeals Specialist (ClaimHero)
Recipient Email: appeals-aetna@claimhero.ai
In Reference To Member: Michael Patel
Member Identification: AET-773419-02
Group / Plan ID: 948201-10 (Global Assignee POS II)
Internal Determination Ref: AET-APP-2026-884920-R1
Claim Reference Number: #${claim3Number}

================================================================================
FORMAL NOTICE OF LEVEL 1 APPELLATE RECONSIDERATION DETERMINATION
STATUS: ADVERSE BENEFIT DETERMINATION OVERTURNED IN FULL
================================================================================

Dear Appeals Specialist / Authorized Representative:

The Aetna International Clinical Grievance and Appeals Committee, in consultation with an independent board-certified Orthopedic Surgery Medical Director Reviewer, has completed its formal Level 1 administrative reconsideration regarding Claim #${claim3Number} for member Michael Patel.

CLINICAL DETERMINATION & FINDINGS:
Claim #${claim3Number} for procedure code CPT 73721 (Magnetic Resonance Imaging, Right Knee Joint; Date of Service: 07/18/2026, Servicing Provider: Global Diagnostic Imaging Group) was previously denied under Claim Adjustment Reason Code CO-16, citing lack of documentation confirming antecedent weight-bearing plain radiographs under Aetna Clinical Policy Bulletin (CPB) 0171.

Upon detailed re-review of the supplemental clinical record, imaging reports, and attestation submitted in your appeal package dated July 28, 2026, our medical director has confirmed the following findings:
1. Documentation of four-view weight-bearing plain films completed on 05/20/2026 at Global Diagnostic Imaging Group (Accession #RAD-2026-90412) has been verified. The plain films confirmed inconclusive findings for soft-tissue ligamentous or meniscal tear.
2. Clinical notes from Dr. Angela Martinez, MD establish documented mechanical knee instability, positive joint line tenderness, and failed conservative pharmacotherapy exceeding 6 weeks.
3. The clinical record satisfies all prerequisite clinical indications outlined in Aetna CPB 0171 (Section II.A - Diagnostic Imaging of Lower Extremity Joints) and CMS National Coverage Determination (NCD) 220.2.

DECISION & SETTLEMENT SUMMARY:
Based upon these clinical findings, the initial adverse benefit determination is OVERTURNED IN FULL. Coverage for CPT 73721 is hereby approved as a covered medical necessity benefit under the member's plan.

ADJUDICATION & REMITTANCE DETAILS:
- Total Disputed Billed Charge: $2,850.00
- In-Network Plan Allowable Rate: $2,850.00
- Authorized Benefit Payment: $2,850.00 (100% of allowable amount)
- Member Patient Share / Copay: $0.00 (Out-of-pocket maximum satisfied)
- Net Member Financial Balance: $0.00

Electronic funds transfer (EFT) remittance has been scheduled for release to Global Diagnostic Imaging Group under Remittance Advice #RA-994102-EFT. An amended Explanation of Benefits (EOB) reflecting this 100% plan disbursement is currently being generated and will be accessible via the secure member portal within 48 hours.

This decision concludes the Level 1 internal administrative grievance process for this claim. We appreciate the thorough clinical documentation provided.

Sincerely,

Marcus Vance, MD, FAAOS
Medical Director, Clinical Grievance & Appellate Review
Aetna International Claims Adjudication Division
aetnaintl_appeals@aetna.com | Inquiries: 1-800-555-AETNA`,
    bodyHtml: `<div style="max-width:720px; margin:0 auto; padding:28px; background:#ffffff; color:#1e293b; font-family:Arial,Helvetica,sans-serif; border:1px solid #10b981; border-radius:8px;">
      <div style="padding-bottom:16px; border-bottom:2px solid #10b981; margin-bottom:20px;">
        <div style="color:#059669; font-size:11px; font-weight:700; letter-spacing:0.1em; text-transform:uppercase;">Aetna International Clinical Grievance & Appeals Department</div>
        <h1 style="margin:6px 0 4px; color:#0f172a; font-size:20px; font-weight:700;">Notice of Level 1 Appellate Reconsideration Determination</h1>
        <div style="display:inline-block; margin-top:6px; padding:3px 10px; background:#ecfdf5; border:1px solid #a7f3d0; border-radius:4px; color:#065f46; font-size:12px; font-weight:700;">
          DETERMINATION: OVERTURNED IN FULL · $2,850.00 AUTHORIZED
        </div>
      </div>
      <table role="presentation" style="width:100%; margin-bottom:20px; border-collapse:collapse; background:#f8fafc; border:1px solid #e2e8f0; border-radius:6px;">
        <tr><td style="padding:8px 12px; font-size:12px; color:#64748b;">Member Name</td><td style="padding:8px 12px; font-size:12px; font-weight:600; color:#0f172a;">Michael Patel (ID: AET-773419-02)</td></tr>
        <tr><td style="padding:8px 12px; font-size:12px; color:#64748b;">Claim Reference</td><td style="padding:8px 12px; font-size:12px; font-weight:600; color:#0f172a;">#${claim3Number}</td></tr>
        <tr><td style="padding:8px 12px; font-size:12px; color:#64748b;">Settlement Allowance</td><td style="padding:8px 12px; font-size:12px; font-weight:600; color:#059669;">$2,850.00 (100% Plan Remittance)</td></tr>
        <tr><td style="padding:8px 12px; font-size:12px; color:#64748b;">Patient Share Owed</td><td style="padding:8px 12px; font-size:12px; font-weight:600; color:#059669;">$0.00</td></tr>
      </table>
      <div style="font-size:13px; line-height:1.7; color:#334155;">
        <p><strong>Dear Appeals Specialist / Authorized Representative:</strong></p>
        <p>The Aetna International Clinical Grievance and Appeals Committee, in consultation with an independent board-certified Orthopedic Surgery Medical Director Reviewer, has completed its formal Level 1 administrative reconsideration regarding Claim #${claim3Number}.</p>
        <p>Upon verification of the four-view weight-bearing radiographs performed on 05/20/2026 and documented clinical mechanical knee instability, all prerequisite indications under Aetna CPB 0171 (Section II.A) and CMS NCD 220.2 have been confirmed satisfied.</p>
        <p>The adverse benefit determination is <strong>OVERTURNED IN FULL</strong>. Electronic funds transfer payment of $2,850.00 has been scheduled for release under Remittance Advice #RA-994102-EFT. Member responsibility is $0.00.</p>
      </div>
      <div style="margin-top:24px; padding-top:14px; border-top:1px solid #e2e8f0; font-size:11px; color:#64748b;">
        Marcus Vance, MD, FAAOS · Medical Director, Clinical Grievance & Appellate Review · Aetna International
      </div>
    </div>`,
    hasAttachments: false,
    detectedDetermination: "OVERTURNED_APPROVED",
    clinicalRationale: `Aetna Clinical Grievance and Appeals Committee in consultation with an independent board-certified Orthopedic Surgery Medical Director completed reconsideration of Claim #${claim3Number}. Verified four-view weight-bearing plain radiographs (05/20/2026) and persistent mechanical instability satisfying Aetna CPB 0171 Section II.A and CMS NCD 220.2. Adverse determination overturned in full with $2,850.00 plan payment authorized and $0.00 member liability.`,
    settlementAmount: 2850,
    receivedAt: now - 1 * DAY_MS,
  });

  // =========================================================================
  // 8. CRYPTOGRAPHIC CASE AUDIT LOGS (Rolling SHA-256 Merkle Chain)
  // =========================================================================

  // Logs for Claim 1 (Eleanor Vance)
  await appendAuditLog(ctx, {
    claimId: claim1Id,
    userId,
    eventType: "denial_ingested",
    actor: "Optical OCR Parser",
    details: `Extracted denial document for claim #${claim1Number} (Cigna Global Health Benefits)`,
    timestamp: claim1CreatedAt,
  });
  await appendAuditLog(ctx, {
    claimId: claim1Id,
    userId,
    eventType: "appeal_context_completed",
    actor: "Jordan Lee",
    details: "Confirmed sender identity and documented clinical context before appeal drafting.",
    timestamp: claim1CreatedAt + 5 * MIN_MS,
  });
  await appendAuditLog(ctx, {
    claimId: claim1Id,
    userId,
    eventType: "autonomous_pipeline_initiated",
    actor: "Autonomous Sentinel Master",
    details: "Sentinel analysis initiated: Resolving payer gateway, clinical policies, and cited ERISA brief synthesis. Mandatory human approval required before dispatch.",
    timestamp: claim1CreatedAt + 6 * MIN_MS,
  });
  await appendAuditLog(ctx, {
    claimId: claim1Id,
    userId,
    eventType: "policy_crawled",
    actor: "Firecrawl Web Crawler",
    details: "Resolved official appeals gateway for Cigna Global Health Benefits: _PDM@cigna.com (Source: firecrawl_live).",
    timestamp: claim1CreatedAt + 8 * MIN_MS,
  });
  await appendAuditLog(ctx, {
    claimId: claim1Id,
    userId,
    eventType: "precedent_vectors_retrieved",
    actor: "Precedent Vector Archive",
    details: "Hybrid Precedent Search (Vector + Full-Text RRF Fusion) retrieved 3 controlling authorities: ClaimHero overturned appeal CLM-8942-CIG-2388; ClaimHero overturned appeal CLM-8942-GEO; 29 CFR § 2560.503-1(g).",
    timestamp: claim1CreatedAt + 10 * MIN_MS,
  });
  await appendAuditLog(ctx, {
    claimId: claim1Id,
    userId,
    eventType: "overturn_score_computed",
    actor: "Precedent Matcher & Rubric Engine",
    details: "Evaluated 4-pillar Statutory Appeal Readiness: 96/100 (HIGH CONFIDENCE). Found 4 cited policy contradictions.",
    timestamp: claim1CreatedAt + 12 * MIN_MS,
  });
  await appendAuditLog(ctx, {
    claimId: claim1Id,
    userId,
    eventType: "appeal_draft_updated",
    actor: "Configured model Appeal Synthesizer",
    details: "Saved revision v1 for LEVEL 1 INTERNAL (Payer Medical Director Review). Statutory Posture: administrative_reconsideration.",
    timestamp: claim1CreatedAt + 14 * MIN_MS,
  });
  await appendAuditLog(ctx, {
    claimId: claim1Id,
    userId,
    eventType: "p2p_script_generated",
    actor: "P2P Defense Tele-Script Generator",
    details: "Synthesized 4-phase medical director peer-to-peer defense script with credential challenge and DMHC bad-faith warning.",
    timestamp: claim1CreatedAt + 16 * MIN_MS,
  });

  // Logs for Claim 2 (Marcus Sterling)
  await appendAuditLog(ctx, {
    claimId: claim2Id,
    userId,
    eventType: "denial_ingested",
    actor: "Optical OCR Parser",
    details: `Extracted denial document for claim #${claim2Number} (GeoBlue Worldwide Medical Insurance)`,
    timestamp: claim2CreatedAt,
  });
  await appendAuditLog(ctx, {
    claimId: claim2Id,
    userId,
    eventType: "appeal_context_completed",
    actor: "Alex Morgan",
    details: "Confirmed sender identity and documented emergency clinical context before appeal drafting.",
    timestamp: claim2CreatedAt + 5 * MIN_MS,
  });
  await appendAuditLog(ctx, {
    claimId: claim2Id,
    userId,
    eventType: "autonomous_pipeline_initiated",
    actor: "Autonomous Sentinel Master",
    details: "Sentinel analysis initiated: Resolving payer gateway, clinical policies, and cited ERISA brief synthesis.",
    timestamp: claim2CreatedAt + 6 * MIN_MS,
  });
  await appendAuditLog(ctx, {
    claimId: claim2Id,
    userId,
    eventType: "policy_crawled",
    actor: "Firecrawl Web Crawler",
    details: "Resolved official appeals gateway for GeoBlue Worldwide Medical Insurance: claims@geoblue.com (Source: firecrawl_live).",
    timestamp: claim2CreatedAt + 8 * MIN_MS,
  });
  await appendAuditLog(ctx, {
    claimId: claim2Id,
    userId,
    eventType: "precedent_vectors_retrieved",
    actor: "Precedent Vector Archive",
    details: "Hybrid Precedent Search retrieved 3 controlling authorities: ClaimHero overturned appeal CLM-6104-GEO-4439; ClaimHero overturned appeal CLM-6104-GEO-8184; ClaimHero overturned appeal CLM-6104-GEO.",
    timestamp: claim2CreatedAt + 10 * MIN_MS,
  });
  await appendAuditLog(ctx, {
    claimId: claim2Id,
    userId,
    eventType: "overturn_score_computed",
    actor: "Precedent Matcher & Rubric Engine",
    details: "Evaluated 4-pillar Statutory Appeal Readiness: 94/100 (HIGH CONFIDENCE). Found 3 cited policy contradictions.",
    timestamp: claim2CreatedAt + 12 * MIN_MS,
  });
  await appendAuditLog(ctx, {
    claimId: claim2Id,
    userId,
    eventType: "appeal_draft_updated",
    actor: "Configured model Appeal Synthesizer",
    details: "Saved revision v1 for LEVEL 1 INTERNAL (Payer Medical Director Review). Statutory Posture: administrative_reconsideration.",
    timestamp: claim2CreatedAt + 14 * MIN_MS,
  });
  await appendAuditLog(ctx, {
    claimId: claim2Id,
    userId,
    eventType: "p2p_script_generated",
    actor: "P2P Defense Tele-Script Generator",
    details: "Synthesized 4-phase neurosurgical emergency defense script under Carelon SURG.00011 exception criteria.",
    timestamp: claim2CreatedAt + 16 * MIN_MS,
  });

  // Logs for Claim 3 (Michael Patel - Won)
  await appendAuditLog(ctx, {
    claimId: claim3Id,
    userId,
    eventType: "denial_ingested",
    actor: "Optical OCR Parser",
    details: `Extracted denial document for claim #${claim3Number} (Aetna International)`,
    timestamp: claim3CreatedAt,
  });
  await appendAuditLog(ctx, {
    claimId: claim3Id,
    userId,
    eventType: "policy_crawled",
    actor: "Firecrawl Web Crawler",
    details: "Resolved official appeals gateway for Aetna International: aetnaintl_appeals@aetna.com (Source: firecrawl_live).",
    timestamp: claim3CreatedAt + 4 * MIN_MS,
  });
  await appendAuditLog(ctx, {
    claimId: claim3Id,
    userId,
    eventType: "precedent_vectors_retrieved",
    actor: "Precedent Vector Archive",
    details: "Hybrid Precedent Search retrieved 3 controlling authorities: ClaimHero overturned appeal CLM-3912-BCG; CMS NCD 220.2 (MRI); 29 CFR § 2560.503-1(g).",
    timestamp: claim3CreatedAt + 8 * MIN_MS,
  });
  await appendAuditLog(ctx, {
    claimId: claim3Id,
    userId,
    eventType: "overturn_score_computed",
    actor: "Precedent Matcher & Rubric Engine",
    details: "Evaluated 4-pillar Appeal Viability Index: 91/100 (HIGH CONFIDENCE). Found 3 cited policy contradictions.",
    timestamp: claim3CreatedAt + 10 * MIN_MS,
  });
  await appendAuditLog(ctx, {
    claimId: claim3Id,
    userId,
    eventType: "appeal_draft_updated",
    actor: "Configured model Appeal Synthesizer",
    details: "Saved revision v1 for LEVEL 1 INTERNAL (Payer Medical Director Review). Statutory Posture: administrative_reconsideration.",
    timestamp: claim3CreatedAt + 12 * MIN_MS,
  });
  await appendAuditLog(ctx, {
    claimId: claim3Id,
    userId,
    eventType: "p2p_script_generated",
    actor: "P2P Defense Tele-Script Generator",
    details: "Synthesized 4-phase medical director peer-to-peer defense script citing weight-bearing radiograph records and Aetna CPB 0171 criteria.",
    timestamp: claim3CreatedAt + 14 * MIN_MS,
  });
  await appendAuditLog(ctx, {
    claimId: claim3Id,
    userId,
    eventType: "appeal_approved",
    actor: "Taylor Reed",
    details: "Mandatory human review verified: Appeal brief v1 clinical assertions, legal citations, recipient, and outbound transmission approved by Taylor Reed.",
    timestamp: now - 2 * DAY_MS,
  });
  await appendAuditLog(ctx, {
    claimId: claim3Id,
    userId,
    eventType: "appeal_dispatched",
    actor: "AgentMail (appeals-aetna@claimhero.ai)",
    details: `Transmitted formal appeal document packet to aetnaintl_appeals@aetna.com regarding claim #${claim3Number}`,
    timestamp: now - 2 * DAY_MS + 2 * MIN_MS,
  });
  await appendAuditLog(ctx, {
    claimId: claim3Id,
    userId,
    eventType: "decision_recorded",
    actor: "Aetna International Claims Appeals Unit",
    details: "Claim determination OVERTURNED_APPROVED in full. $2,850.00 plan allowance authorized.",
    timestamp: now - 1 * DAY_MS,
  });
}
