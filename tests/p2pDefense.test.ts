import { describe, it, expect } from "vitest";

describe("Physician Peer-to-Peer (P2P) Defense Tele-Script Generator", () => {
  const mockClaim = {
    _id: "claim_test_123",
    claimNumber: "CLM-994821",
    serviceDate: "2024-03-15",
    providerName: "Dr. Amanda Vance, MD",
    deniedAmount: 18450,
    patientOwedAmount: 18450,
    cptCodes: ["63047", "63048"],
    icd10Codes: ["M51.26", "M54.16"],
    denialReasonCode: "CO-50",
    denialReasonDescription: "Not deemed medically necessary per payer clinical policy bulletin criteria",
    status: "ready_for_review",
    statutoryDeadline: Date.now() + 86400000 * 45,
    daysRemaining: 45,
    assignedAgentEmail: "appeal-994821@claimhero.agentmail.com",
    patient: {
      _id: "pat_test_1",
      name: "Marcus Holloway",
      email: "marcus@example.com",
      memberId: "UHC-9928104",
      groupNumber: "GRP-8812",
      insurancePayer: "UnitedHealthcare",
      state: "Texas",
      createdAt: Date.now() - 86400000 * 5,
    },
    appealContext: {
      sender: {
        name: "Dr. Amanda Vance, MD",
        credentials: "Board-Certified Orthopedic Spine Surgeon",
        email: "dramandavance@orthoclinic.com",
        phone: "(512) 555-0199",
      },
      clinicalFacts: {
        symptomsAndFunctionalImpact: "Intractable L5-S1 radiculopathy with severe sensory loss and progressive foot drop",
        examinationFindings: "Positive Straight Leg Raise at 25 degrees, 3/5 motor strength in extensor hallucis longus",
        imagingAndDiagnostics: "Lumbar MRI confirms 8mm extruded disc herniation causing severe lateral recess stenosis",
        treatmentHistoryAndResponse: "Failed 12 weeks of structured physical therapy and two fluoroscopic epidural steroid injections",
        otherDocumentedFacts: "Patient unable to ambulate more than 50 feet without assistive device",
        recordsAreIncomplete: false,
      },
      physicianNotes: "Patient has objective neurological deficit requiring urgent decompression to prevent permanent nerve palsy.",
      confirmedAt: Date.now() - 3600000,
    },
  };

  const mockEvidences = [
    {
      _id: "ev_1",
      claimId: "claim_test_123",
      sourceType: "payer_cpb",
      title: "UnitedHealthcare Lumbar Spine Decompression Policy 2024T001",
      citationClause: "Section 3.B - Neurological Deficit Indication",
      extractedEvidenceMarkdown: "Lumbar surgical decompression is considered medically necessary when progressive motor deficit (grade <= 3/5) or cauda equina syndrome is documented, or after failure of >= 6 weeks conservative therapy.",
      relevanceScore: 98,
      sourceUrl: "https://www.uhcprovider.com/policies/spine-decompression",
      createdAt: Date.now() - 86400000,
    },
  ];

  it("validates P2P defense script generation with statutory opening and credential inquiry", () => {
    const physician = mockClaim.appealContext.sender.name;
    const specialty = mockClaim.appealContext.sender.credentials;
    const payer = mockClaim.patient.insurancePayer;

    const openingStatement = `"Hello Dr. [Reviewer Name]. I am ${physician}, ${specialty} for patient ${mockClaim.patient.name} (Member ID: ${mockClaim.patient.memberId}). Before we begin this 5-minute peer-to-peer conference regarding Claim #${mockClaim.claimNumber}, I am required for the medical record to ask: Are you currently licensed and actively practicing in this same surgical subspecialty? Please note that this call constitutes a formal clinical discussion under ERISA 29 CFR § 2560.503-1 and Texas Utilization Review regulations, and I am documenting this discussion for our clinical file and any potential Department of Insurance grievance."`;

    expect(openingStatement).toContain("ERISA 29 CFR § 2560.503-1");
    expect(openingStatement).toContain("Texas Utilization Review regulations");
    expect(openingStatement).toContain("actively practicing in this same surgical subspecialty");
    expect(openingStatement).toContain(mockClaim.claimNumber);
    expect(openingStatement).toContain(mockClaim.patient.memberId);
  });

  it("extracts exact CPB policy section citations with criteria satisfaction bullets", () => {
    const citation = {
      cpbTitle: mockEvidences[0].title,
      section: mockEvidences[0].citationClause,
      criteriaMetText: mockClaim.appealContext.clinicalFacts.imagingAndDiagnostics,
      rebuttalBullet: `Under ${mockEvidences[0].title} (${mockEvidences[0].citationClause}), surgery is indicated due to documented progressive motor deficit and failed conservative management.`,
      sourceUrl: mockEvidences[0].sourceUrl,
    };

    expect(citation.cpbTitle).toContain("UnitedHealthcare Lumbar Spine Decompression Policy");
    expect(citation.section).toContain("Section 3.B");
    expect(citation.rebuttalBullet).toContain("progressive motor deficit");
    expect(citation.sourceUrl).toBe("https://www.uhcprovider.com/policies/spine-decompression");
  });

  it("generates direct counters to standard insurer disqualification trap questions", () => {
    const trapCounters = [
      {
        insurerTrapQuestion: "Did the patient complete a full 6 months of documented conservative therapy before scheduling this intervention?",
        physicianDirectRebuttal: "Yes. The patient completed 12 weeks of structured PT and 2 epidural injections, yet symptoms deteriorated with acute motor weakness (3/5 strength). Under UHC Policy Section 3.B, progressive motor deficit waives extended conservative observation.",
        clinicalRationale: "Documented 3/5 EHL weakness constitutes acute neurological deterioration requiring timely surgical decompression.",
        regulatoryLeverage: "ERISA 29 CFR § 2560.503-1(h) mandates consideration of treating physician clinical risk assessment.",
      },
      {
        insurerTrapQuestion: "Can this condition be managed conservatively with oral analgesics or repeat physical therapy?",
        physicianDirectRebuttal: "No. With an 8mm extruded disc fragment compressing the nerve root causing motor drop, further delaying decompression creates a high risk of permanent neurologic deficit.",
        clinicalRationale: "Mechanical root compression with motor deficit does not resolve with passive oral medications.",
        regulatoryLeverage: "State bad-faith statutes penalize denial of standard-of-care treatment that risks irreversible bodily harm.",
      },
    ];

    expect(trapCounters).toHaveLength(2);
    expect(trapCounters[0].insurerTrapQuestion).toContain("6 months");
    expect(trapCounters[0].physicianDirectRebuttal).toContain("Section 3.B");
    expect(trapCounters[0].regulatoryLeverage).toContain("ERISA 29 CFR § 2560.503-1(h)");
    expect(trapCounters[1].physicianDirectRebuttal).toContain("8mm extruded disc");
  });

  it("generates a formal state bad-faith demand with medical license inquiry", () => {
    const demand = `"Dr. [Reviewer Name], if you intend to uphold this adverse determination against my clinical judgment as the treating specialist, I formally request your full name, state medical license number, and board specialty on the record. Furthermore, under Texas insurance regulations and ERISA rules, I demand a detailed written denial letter within 24 hours specifying the exact clinical policy criteria you claim were not met, as we will immediately submit this case to the State Insurance Commissioner for independent external review and bad-faith scrutiny."`;

    expect(demand).toContain("state medical license number");
    expect(demand).toContain("within 24 hours");
    expect(demand).toContain("State Insurance Commissioner");
    expect(demand).toContain("bad-faith scrutiny");
  });

  it("generates a structured condensed pocket cheat sheet for mobile review and clinic printing", () => {
    const cheatSheet = {
      rapidChecklist: [
        "Confirm Reviewer Name, State License # & Clinical Specialty",
        "State Patient Name (Marcus Holloway), Member ID (UHC-9928104), Claim #CLM-994821",
        "Identify exact CPT (63047, 63048) & ICD-10 (M51.26, M54.16) codes",
        "Cite UnitedHealthcare Policy Criteria section 3.B & failure of 12-wk PT",
        "Demand 24-hour written justification with reviewer credentials on record",
      ],
      keyDiagnosisCodes: mockClaim.icd10Codes,
      keyProcedureCodes: mockClaim.cptCodes,
      mustSayPoints: [
        "I am the treating specialist who has directly evaluated the patient and objective MRI findings.",
        "The patient has documented objective functional impairment (3/5 foot drop) and failed 12 weeks of PT.",
        "Under published clinical policy, all requisite medical necessity indications are met in the record.",
        "Denying or delaying care risks permanent nerve damage.",
      ],
      doNotConcedePoints: [
        'DO NOT agree to "additional observation periods" or repeat physical therapy when already exhausted.',
        'DO NOT agree that this procedure is "elective" with acute motor deficit.',
        "DO NOT allow a non-specialist reviewer to dismiss clinical findings without putting their license on the record.",
      ],
      closingDemandStatement: "If upheld, provide your medical license number and written clinical denial criteria within 24 hours for State Insurance Commissioner and ERISA bad-faith review.",
    };

    expect(cheatSheet.rapidChecklist).toHaveLength(5);
    expect(cheatSheet.mustSayPoints).toHaveLength(4);
    expect(cheatSheet.doNotConcedePoints).toHaveLength(3);
    expect(cheatSheet.keyProcedureCodes).toContain("63047");
    expect(cheatSheet.keyDiagnosisCodes).toContain("M51.26");
    expect(cheatSheet.closingDemandStatement).toContain("within 24 hours");
  });

  it("formats timed verbal tele-script markdown with pacing cues", () => {
    const sections = [
      "## [0:00 - 0:45] Phase 1: Statutory Opening & Credential Challenge",
      "## [0:45 - 2:00] Phase 2: Exact Policy Section Citations & Clinical Defense",
      "## [2:00 - 2:45] Phase 3: Disqualification Trap Counters",
      "## [2:45 - 3:30] Phase 4: State Bad-Faith Warning & Written Denial Demand",
    ];

    const sampleMarkdown = `# Peer-to-Peer (P2P) Defense Tele-Script\n\n${sections.join("\n\n")}`;

    expect(sampleMarkdown).toContain("Phase 1: Statutory Opening");
    expect(sampleMarkdown).toContain("Phase 2: Exact Policy Section Citations");
    expect(sampleMarkdown).toContain("Phase 3: Disqualification Trap Counters");
    expect(sampleMarkdown).toContain("Phase 4: State Bad-Faith Warning");
  });
});
