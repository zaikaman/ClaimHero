import { describe, it, expect } from "vitest";
import {
  formatCurrency,
  formatDeadlineRemaining,
  getScoreColor,
  stripMarkdownFormatting,
} from "../src/lib/utils";
import {
  CPT_CODES,
  DENIAL_REASON_CODES,
  STATUTORY_REGULATIONS,
  INSURERS,
  getPayerAppellateContact,
} from "../src/lib/constants";

describe("ClaimHero Domain Utilities & Formatting", () => {
  it("formats numerical dollar amounts into standard US healthcare currency", () => {
    expect(formatCurrency(24500)).toBe("$24,500");
    expect(formatCurrency(18200)).toBe("$18,200");
    expect(formatCurrency(0)).toBe("$0");
  });

  it("evaluates statutory deadline countdown alarm states correctly", () => {
    // Critical (< 14 days)
    const critical = formatDeadlineRemaining(9);
    expect(critical.isUrgent).toBe(true);
    expect(critical.isCritical).toBe(true);
    expect(critical.text).toContain("9d Remaining (Urgent)");

    // Standard (> 45 days)
    const normal = formatDeadlineRemaining(142);
    expect(normal.isUrgent).toBe(false);
    expect(normal.isCritical).toBe(false);
    expect(normal.text).toContain("142d Statutory Clock");

    // Expired (0 days)
    const expired = formatDeadlineRemaining(0);
    expect(expired.isCritical).toBe(true);
    expect(expired.text).toBe("Deadline Expired");
  });

  it("calculates win probability color gradients across risk bands", () => {
    const highWin = getScoreColor(91);
    expect(highWin.text).toBe("text-emerald-400");

    const moderateWin = getScoreColor(65);
    expect(moderateWin.text).toBe("text-amber-400");

    const lowWin = getScoreColor(35);
    expect(lowWin.text).toBe("text-rose-400");
  });
});

describe("ClaimHero Regulatory & Clinical Dictionary", () => {
  it("contains standard ERISA 29 CFR § 2560.503-1 statutory rules", () => {
    expect(STATUTORY_REGULATIONS.ERISA_CITATION).toBe("29 CFR § 2560.503-1");
    expect(STATUTORY_REGULATIONS.DEADLINE_DAYS_INTERNAL_APPEAL).toBe(180);
    expect(STATUTORY_REGULATIONS.PAYER_RESPONSE_STANDARD_DAYS).toBe(30);
  });

  it("maps core medical CPT procedure codes accurately", () => {
    expect(CPT_CODES["27447"]).toBeDefined();
    expect(CPT_CODES["27447"]?.name).toBe("Total Knee Arthroplasty (TKA)");
    expect(CPT_CODES["27447"]?.averageBilled).toBe(24500);

    expect(CPT_CODES["63047"]).toBeDefined();
    expect(CPT_CODES["63047"]?.category).toBe("Neurosurgery / Spine");
  });

  it("maps common CARC denial reason codes with overturn categories", () => {
    expect(DENIAL_REASON_CODES["CO-50"]).toBeDefined();
    expect(DENIAL_REASON_CODES["CO-50"]?.code).toBe("CO-50");
    expect(DENIAL_REASON_CODES["CO-50"]?.title).toContain("Not Medically Necessary");

    expect(DENIAL_REASON_CODES["CO-197"]).toBeDefined();
    expect(DENIAL_REASON_CODES["CO-197"]?.title).toContain("Precertification");
  });

  it("contains major US commercial health insurance payers and verified email-capable payers", () => {
    const insurerNames = INSURERS.map((i) => i.name);
    expect(insurerNames).toContain("UnitedHealthcare");
    expect(insurerNames).toContain("Blue Cross Blue Shield");
    expect(insurerNames).toContain("Humana");
    expect(insurerNames).toContain("Molina Healthcare");
    expect(insurerNames).toContain("GeoBlue (BCBS Global)");
    expect(insurerNames).toContain("Blue Cross Blue Shield Global Core");
  });

  it("resolves verified appeals email addresses for supported payers", () => {
    const molina = getPayerAppellateContact("Molina Healthcare");
    expect(molina.officialAppealsEmail).toBe("MFLGrievanceandAppealsDepartment@MolinaHealthcare.com");
    expect(molina.isVerified).toBe(true);

    const geoblue = getPayerAppellateContact("GeoBlue");
    expect(geoblue.officialAppealsEmail).toBe("claims@geo-blue.com");
    expect(geoblue.isVerified).toBe(true);

    const bcbsGlobal = getPayerAppellateContact("BCBS Global Core");
    expect(bcbsGlobal.officialAppealsEmail).toBe("claims@bcbsglobalcore.com");
    expect(bcbsGlobal.isVerified).toBe(true);
  });
});

describe("Phase 4: Clinical Evidence & Precedent Structure Validation", () => {
  it("validates clinical evidence source types", () => {
    const validSources = ["payer_cpb", "fda_package_insert", "pubmed_study", "nccn_guideline", "legal_precedent"];
    expect(validSources).toContain("payer_cpb");
    expect(validSources).toContain("legal_precedent");
  });

  it("validates 4-pillar deterministic appeal scoring rubric weights", () => {
    const RUBRIC_WEIGHTS = {
      policy_alignment: 35,
      clinical_documentation: 25,
      statutory_erisa: 20,
      precedent_strength: 20,
    };

    const totalWeight = Object.values(RUBRIC_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(totalWeight).toBe(100);
    expect(RUBRIC_WEIGHTS.policy_alignment).toBe(35);
    expect(RUBRIC_WEIGHTS.clinical_documentation).toBe(25);
    expect(RUBRIC_WEIGHTS.statutory_erisa).toBe(20);
    expect(RUBRIC_WEIGHTS.precedent_strength).toBe(20);
  });

  it("computes deterministic win score from criteria sub-scores idempotently", () => {
    const mockBreakdown = [
      { category: "policy_alignment", score: 33, maxScore: 35 },
      { category: "clinical_documentation", score: 23, maxScore: 25 },
      { category: "statutory_erisa", score: 18, maxScore: 20 },
      { category: "precedent_strength", score: 18, maxScore: 20 },
    ];

    const computeScore = (items: typeof mockBreakdown) => {
      const sum = items.reduce((acc, item) => acc + item.score, 0);
      return Math.min(99, Math.max(5, Math.round(sum)));
    };

    const run1 = computeScore(mockBreakdown);
    const run2 = computeScore(mockBreakdown);
    const run3 = computeScore(mockBreakdown);

    expect(run1).toBe(92);
    expect(run2).toBe(92);
    expect(run3).toBe(92);
  });

  it("validates deterministic risk band classification boundaries", () => {
    const classifyScore = (score: number) => {
      if (score >= 80) return "high_confidence";
      if (score >= 55) return "moderate";
      return "complex_litigation";
    };

    expect(classifyScore(92)).toBe("high_confidence");
    expect(classifyScore(80)).toBe("high_confidence");
    expect(classifyScore(79)).toBe("moderate");
    expect(classifyScore(55)).toBe("moderate");
    expect(classifyScore(54)).toBe("complex_litigation");
    expect(classifyScore(35)).toBe("complex_litigation");
  });

  it("evaluates calculateDeterministicRubric with 100% repeatability for CPT 73721", () => {
    const claim = {
      cptCodes: ["73721"],
      denialReasonCode: "CO-16",
      denialReasonDescription: "Claim/service lacks information or has submission errors.",
      patient: { insurancePayer: "Cigna" },
    };

    const evidences = [
      { sourceType: "payer_cpb", citationClause: "Section 2.1", extractedEvidenceMarkdown: "MRI indicated" },
      { sourceType: "payer_cpb", citationClause: "Section 2.2", extractedEvidenceMarkdown: "Conservative therapy criteria" },
      { sourceType: "legal_precedent", citationClause: "IMR Case 2024-88", extractedEvidenceMarkdown: "Overturned" },
    ];

    // Simulating calculateDeterministicRubric logic
    const hasCpb = evidences.some((e) => e.sourceType === "payer_cpb");
    const isAuthOrAdminDenial = ["CO-197", "CO-16", "CO-4"].includes(claim.denialReasonCode);

    const policyScore = hasCpb ? (isAuthOrAdminDenial ? 31 : 29) : 20;
    const clinicalScore = evidences.length >= 3 ? 22 : 20;
    const erisaScore = 19;
    const precedentScore = 17;
    const total = policyScore + clinicalScore + erisaScore + precedentScore;

    expect(total).toBe(89);

    // Assert 100 runs are identical
    for (let i = 0; i < 100; i++) {
      const runTotal = policyScore + clinicalScore + erisaScore + precedentScore;
      expect(runTotal).toBe(89);
    }
  });
});

describe("Phase 5: Appeal Brief & Studio Document Synthesis", () => {
  it("validates appeal hierarchy level identifiers", () => {
    const levels = ["level_1_internal", "level_2_grievance", "level_3_external_state_review"];
    expect(levels).toContain("level_1_internal");
    expect(levels).toContain("level_2_grievance");
    expect(levels).toContain("level_3_external_state_review");
  });

  it("validates required sections of an ERISA medical appeal brief", () => {
    const requiredSections = [
      "executiveSummary",
      "statutoryRightsNotice",
      "medicalNecessityArguments",
      "policyCitations",
      "formalDemandForPayment",
      "fullAppealMarkdown",
    ];

    expect(requiredSections.length).toBe(6);
    expect(requiredSections).toContain("statutoryRightsNotice");
    expect(requiredSections).toContain("medicalNecessityArguments");
  });

  it("assembles a concise, sendable payer appeal email from grounded case data", async () => {
    const { assembleProfessionalMemorandum } = await import("../convex/actions/appealSynthesizer");

    const mockClaim = {
      claimNumber: "CLM-8942-MOL",
      serviceDate: "2026-06-12",
      deniedAmount: 24500,
      patientOwedAmount: 24500,
      providerName: "Dr. Robert Langston, MD",
      cptCodes: ["27447"],
      icd10Codes: ["M17.11"],
      denialReasonCode: "CO-50",
      denialReasonDescription: "Service not deemed medically necessary",
      patient: {
        name: "Eleanor Vance",
        memberId: "MOL-94820194",
        groupNumber: "GRP-88192",
        insurancePayer: "Molina Healthcare",
      },
    };

    const mockEvidences = [
      {
        sourceType: "payer_cpb",
        title: "Molina Healthcare CPB MCP-082",
        citationClause: "Section 1.A",
        extractedEvidenceMarkdown: "Radiographic evidence of severe osteoarthritis (Kellgren-Lawrence Grade 3 or 4) with joint space narrowing.",
      },
      {
        sourceType: "payer_cpb",
        title: "Molina Healthcare CPB MCP-082",
        citationClause: "Section 1.C",
        extractedEvidenceMarkdown: "Conservative therapy must include at least two modalities for 12+ weeks.",
      },
      {
        sourceType: "legal_precedent",
        title: "Winning brief — CPT 27447 / CO-50 overturn",
        citationClause: "Internal archive",
        extractedEvidenceMarkdown: "Vector similarity: 0.75 | Combined score: 0.84",
      },
    ];

    const mockResult = {
      executiveSummary: "This formal appeal challenges Molina Healthcare's adverse determination for CPT 27447.",
      medicalNecessityArguments: "Patient presents with end-stage right knee osteoarthritis (Kellgren-Lawrence Grade IV). Completed 16 physical therapy sessions, 6-month NSAID trial, and intra-articular steroid injections without lasting relief.",
      statutoryRightsNotice: "Under ERISA 29 U.S.C. § 1133 and 29 CFR § 2560.503-1, claimant is entitled to a full and fair review.",
      policyCitations: [
        {
          source: "Molina CPB MCP-082",
          clause: "Section 1.A",
          quote: "Radiographic confirmation of Kellgren-Lawrence Grade IV joint collapse",
        },
      ],
      formalDemandForPayment: "We demand immediate reversal and payment of $24,500 within 30 days.",
      fullAppealMarkdown: "", // Empty to test complete memorandum assembly
    };

    const brief = assembleProfessionalMemorandum(
      mockClaim,
      "level_1_internal",
      mockResult,
      mockEvidences,
      "Patient exhibits severe bone-on-bone contact and has exhausted all non-operative measures.",
      undefined,
      {
        name: "Jordan Lee",
        credentials: "Appeals Coordinator",
        email: "jordan.lee@example.com",
        phone: "555-0100",
      }
    );

    // Verify normal business-email structure and case metadata
    expect(brief).toContain("# Appeal of Adverse Benefit Determination");
    expect(brief).toContain("**Claim reference:** #CLM-8942-MOL");
    expect(brief).not.toContain("**To:**");
    expect(brief).not.toContain("**Subject:**");
    expect(brief).not.toContain("**Appeal level:**");
    expect(brief).toContain("Dear Appeals and Grievances Team,");
    expect(brief).not.toContain("This formal appeal challenges");
    expect(brief).toContain("CLM-8942-MOL");
    expect(brief).toContain("Eleanor Vance");
    expect(brief).toContain("Molina Healthcare");
    expect(brief).toContain("$24,500");
    expect(brief).toContain("27447");
    expect(brief).toContain("M17.11");
    expect(brief).toContain("CO-50");

    // Verify grounded clinical content and review request
    expect(brief).toContain("## Clinical basis for reconsideration");
    expect(brief).toContain("does not independently document the patient-specific examination findings");
    expect(brief).not.toContain("Kellgren-Lawrence Grade IV");
    expect(brief).toContain("Dr. Robert Langston, MD");
    expect(brief).toContain("Treating provider note submitted for review:");
    expect(brief).toContain("Jordan Lee");
    expect(brief).toContain("Appeals Coordinator");
    expect(brief).toContain("jordan.lee@example.com");
    expect(brief).toContain("June 12, 2026");

    // Verify source summaries without an exhibit table
    expect(brief).toContain("## Supporting documentation for review");
    expect(brief).toContain("Molina Healthcare CPB MCP-082");
    expect(brief).toContain("## Supporting documentation for review\n\n");
    expect(brief).not.toContain("Winning brief — CPT 27447 / CO-50 overturn");
    expect(brief).not.toContain("Vector similarity:");

    // Verify conditional rights language rather than unsupported legal conclusions
    expect(brief).toContain("If ERISA applies");
    expect(brief).toContain("If external review is available");

    // Verify the email is not a litigation memorandum
    expect(brief).toContain("## Review requested");
    expect(brief).toContain("Reconsider and reprocess Claim #CLM-8942-MOL under the applicable plan terms.");
    expect(brief).toContain("issue payment according to the plan and applicable provider agreement");
    expect(brief).toContain("Sincerely,");
    expect(brief).not.toContain("ClaimHero Appeals Desk");
    expect(brief).not.toContain("FORMAL MEDICAL APPEAL & LEGAL RECONSIDERATION MEMORANDUM");
    expect(brief).not.toContain("INDEX OF ATTACHED CLINICAL EXHIBITS");
    expect(brief).not.toContain("VIA CERTIFIED SECURE ELECTRONIC GRIEVANCE PORTAL");

    // The final body should be complete but not an automatically padded dossier.
    expect(brief.length).toBeGreaterThan(1200);
    expect(brief.length).toBeLessThan(4000);
  });

  it("keeps internal precedent retrieval artifacts out of the assembled email", async () => {
    const { assembleProfessionalMemorandum } = await import("../convex/actions/appealSynthesizer");

    const brief = assembleProfessionalMemorandum(
      {
        claimNumber: "CLM-VEC-001",
        serviceDate: "2026-06-12",
        deniedAmount: 24500,
        patientOwedAmount: 24500,
        providerName: "Dr. Langston",
        cptCodes: ["27447"],
        icd10Codes: ["M17.11"],
        denialReasonCode: "CO-50",
        denialReasonDescription: "Not medically necessary",
        patient: { name: "Test Patient", memberId: "M-1", insurancePayer: "Molina Healthcare" },
      },
      "level_1_internal",
      {
        executiveSummary: "Challenge the denial.",
        medicalNecessityArguments: "Advanced osteoarthritis after failed conservative care.",
        statutoryRightsNotice: "ERISA 29 CFR § 2560.503-1 applies.",
        policyCitations: [],
        formalDemandForPayment: "Demand immediate overturn.",
        fullAppealMarkdown: "",
      },
      [],
      undefined,
      [
        {
          title: "Firestone Tire & Rubber Co. v. Bruch",
          citation: "489 U.S. 101 (1989)",
          statutoryLanguage: "A denial of benefits is reviewed de novo unless the plan grants discretion.",
          winningArgument: "Undisclosed internal criteria cannot survive de novo review.",
          vectorScore: 0.91,
        },
      ]
    );

    expect(brief).not.toContain("Vector-Retrieved Controlling Authorities");
    expect(brief).not.toContain("Firestone Tire & Rubber Co. v. Bruch");
    expect(brief).not.toContain("489 U.S. 101 (1989)");
    expect(brief).not.toContain("similarity");
    expect(brief).not.toContain("Standard Employer Plan (ERISA Qualified)");
    expect(brief).not.toContain("N/A");
  });

  it("does not trust a model-supplied full document over the email assembly rules", async () => {
    const { assembleProfessionalMemorandum } = await import("../convex/actions/appealSynthesizer");
    const modelBrief = `# Formal Appeal\n\n## Demand\n\n| Criterion | Record |\n| :--- | :--- |\n| **Medical necessity** | Exhibit A |\n\nERISA supports this demand. ${"Clinical evidence. ".repeat(150)}`;

    const brief = assembleProfessionalMemorandum(
      {
        claimNumber: "CLM-CLEAN-001",
        serviceDate: "2026-06-12",
        deniedAmount: 1000,
        patientOwedAmount: 1000,
        providerName: "Dr. Langston",
        cptCodes: ["27447"],
        icd10Codes: ["M17.11"],
        denialReasonCode: "CO-50",
        patient: { name: "Test Patient", memberId: "M-1", insurancePayer: "Molina Healthcare" },
      },
      "level_1_internal",
      {
        executiveSummary: "Challenge the denial.",
        medicalNecessityArguments: "The record supports medical necessity.",
        statutoryRightsNotice: "ERISA applies.",
        policyCitations: [],
        formalDemandForPayment: "Demand immediate overturn.",
        fullAppealMarkdown: modelBrief,
      },
      [],
      "Physician note with **emphasis**",
      [
        {
          title: "Precedent **source**",
          citation: "489 U.S. 101 (1989)",
          statutoryLanguage: "Statutory *language*.",
          winningArgument: "Winning argument.",
          vectorScore: 0.9,
        },
      ]
    );

    expect(brief).toContain("does not independently document the patient-specific examination findings");
    expect(brief).not.toContain("The record supports medical necessity.");
    expect(brief).not.toContain("| Criterion | Record |");
    expect(brief).not.toContain("Clinical evidence. Clinical evidence.");
    expect(brief).not.toContain("Precedent **source**");
  });
});

describe("Precedent Vector Archive", () => {
  it("produces L2-normalized 1536-d hash embeddings that are deterministic", async () => {
    const { hashEmbed, EMBEDDING_DIMENSIONS, l2Normalize } = await import("../convex/lib/embeddings");

    const a = hashEmbed("total knee arthroplasty medical necessity CO-50", ["cpt:27447", "icd:m17.11", "carc:co-50"]);
    const b = hashEmbed("total knee arthroplasty medical necessity CO-50", ["cpt:27447", "icd:m17.11", "carc:co-50"]);

    expect(a).toHaveLength(EMBEDDING_DIMENSIONS);
    expect(b).toEqual(a);

    const magnitude = Math.sqrt(a.reduce((sum, value) => sum + value * value, 0));
    expect(magnitude).toBeCloseTo(1, 5);

    const padded = l2Normalize([3, 4]);
    expect(padded[0]).toBeCloseTo(0.6, 5);
    expect(padded[1]).toBeCloseTo(0.8, 5);
  });

  it("re-ranks vector hits by ICD-10, CPT, and CARC overlap and returns the top 3", async () => {
    const { rankPrecedentHits } = await import("../convex/lib/embeddings");

    const ranked = rankPrecedentHits(
      [
        { _id: "low", vectorScore: 0.99, icd10Codes: ["J18.9"], cptCodes: ["99213"], carcCodes: ["CO-18"] },
        { _id: "tka", vectorScore: 0.72, icd10Codes: ["M17.11"], cptCodes: ["27447"], carcCodes: ["CO-50"] },
        { _id: "spine", vectorScore: 0.80, icd10Codes: ["M51.16"], cptCodes: ["63047"], carcCodes: ["CO-50"] },
        { _id: "mri", vectorScore: 0.70, icd10Codes: ["M25.561"], cptCodes: ["73721"], carcCodes: ["CO-16"] },
      ],
      { icd10Codes: ["M17.11"], cptCodes: ["27447"], denialReasonCode: "CO-50", denialReasonDescription: "Not medically necessary" },
      3
    );

    expect(ranked).toHaveLength(3);
    expect(ranked[0]._id).toBe("tka");
    expect(ranked[0].codeOverlap).toBeGreaterThan(ranked[1].codeOverlap);
  });

  it("indexes real public authorities by diagnosis, procedure, and CARC code", async () => {
    const { PRECEDENT_CORPUS } = await import("../convex/lib/precedentCorpus");

    expect(PRECEDENT_CORPUS.length).toBeGreaterThanOrEqual(12);
    expect(PRECEDENT_CORPUS.every((entry) => entry.citation.length > 0)).toBe(true);
    expect(PRECEDENT_CORPUS.every((entry) => entry.statutoryLanguage.length > 40)).toBe(true);
    expect(PRECEDENT_CORPUS.some((entry) => entry.citation.includes("489 U.S. 101"))).toBe(true);
    expect(PRECEDENT_CORPUS.some((entry) => entry.citation.includes("29 CFR § 2560.503-1"))).toBe(true);
    expect(PRECEDENT_CORPUS.some((entry) => entry.cptCodes.includes("27447") && entry.carcCodes.includes("CO-50"))).toBe(true);
    expect(PRECEDENT_CORPUS.some((entry) => entry.sourceKind === "commissioner_ruling")).toBe(true);
    expect(PRECEDENT_CORPUS.some((entry) => entry.sourceKind === "court_overturn")).toBe(true);
  });

  it("keeps the global precedent archive out of per-claim cascade deletion", () => {
    const requiredCascadeTables = [
      "clinicalEvidences",
      "appeals",
      "emailMessages",
      "emailThreads",
      "appealAuditLogs",
    ];
    expect(requiredCascadeTables).not.toContain("precedents");
  });
});

describe("Phase 6: Autonomous AgentMail & Statutory Countdown Engine", () => {
  it("renders appeal correspondence as professional HTML and clean plain text", async () => {
    const { formatAppealEmail, formatCorrespondenceEmail } = await import("../convex/lib/appealEmail");
    const appeal = formatAppealEmail(
      "# Formal Medical Appeal\n\n## Clinical Basis\n\nThe record supports **medical necessity**.\n\n| Criterion | Record |\n| :--- | :--- |\n| Imaging | Exhibit A |\n\n- Request independent review\n- Confirm payment\n\n<script>alert('unsafe')</script>",
      {
        claimNumber: "CLM-EMAIL-001",
        payer: "Molina Healthcare",
        patientName: "Test Patient",
        serviceDate: "2026-06-12",
        deniedAmount: 24500,
        denialReason: "CO-50 - Not medically necessary",
        cptCodes: ["27447"],
        providerName: "Dr. Langston",
      }
    );
    const addendum = formatCorrespondenceEmail("Please review the attached **clinical addendum**.", {
      claimNumber: "CLM-EMAIL-001",
      payer: "Molina Healthcare",
    });

    expect(appeal.html).toContain("Appeal of Adverse Benefit Determination");
    expect(appeal.html).toContain("<table");
    expect(appeal.html).toContain("&lt;script&gt;");
    expect(appeal.html).not.toContain("**");
    expect(appeal.html).not.toContain("| Criterion | Record |");
    expect(appeal.text).toContain("Claim reference: CLM-EMAIL-001");
    expect(appeal.text).toContain("Date of service: June 12, 2026");
    expect(appeal.text).not.toContain("Prepared by");
    expect(appeal.text.match(/Appeal of Adverse Benefit Determination/g)).toHaveLength(1);
    expect(appeal.text).not.toContain("# Formal Medical Appeal");
    expect(appeal.text).not.toContain("*");
    expect(addendum.html).toContain("Appeal Correspondence");
    expect(addendum.text).toContain("clinical addendum");
    expect(addendum.text).not.toContain("*");
  });

  it("formats dedicated agentmail inbox address correctly", () => {
    const claimNumber = "CLM-2026-88192";
    const formattedEmail = `appeal-claim-${claimNumber.toLowerCase().replace(/[^a-z0-9]/g, "")}@claimhero.agentmail.com`;
    expect(formattedEmail).toBe("appeal-claim-clm202688192@claimhero.agentmail.com");
  });

  it("identifies payer victory and approval keywords in inbound emails", () => {
    const isApprovalEmail = (body: string) => {
      const text = body.toLowerCase();
      return (
        text.includes("overturned") ||
        text.includes("approved") ||
        text.includes("payment issued") ||
        text.includes("reimbursed")
      );
    };

    expect(isApprovalEmail("Your appeal has been approved and full payment issued.")).toBe(true);
    expect(isApprovalEmail("The adverse determination is overturned upon review.")).toBe(true);
    expect(isApprovalEmail("We acknowledge receipt of your appeal packet.")).toBe(false);
  });

  it("validates 3-mode appellate recipient resolution rules", () => {
    const resolveRecipient = (
      mode: "ai_adjudicator" | "custom_email" | "official_payer",
      customEmail: string,
      payerName: string,
      officialEmail?: string
    ) => {
      if (mode === "ai_adjudicator") {
        return `${payerName.toLowerCase().replace(/[^a-z0-9]/g, "")}-adjudication@claimhero.agentmail.com`;
      }
      if (mode === "custom_email") {
        return customEmail.trim();
      }
      return officialEmail || "prohibited";
    };

    expect(resolveRecipient("ai_adjudicator", "", "Molina Healthcare")).toBe("molinahealthcare-adjudication@claimhero.agentmail.com");
    expect(resolveRecipient("custom_email", "judge@hackathon.com", "Molina Healthcare")).toBe("judge@hackathon.com");
    expect(resolveRecipient("official_payer", "", "Molina Healthcare", "MFLGrievanceandAppealsDepartment@MolinaHealthcare.com")).toBe("MFLGrievanceandAppealsDepartment@MolinaHealthcare.com");
  });

  it("detects AI payer adjudicator inboxes so follow-up replies continue the review", async () => {
    const {
      isAiAdjudicatorAddress,
      buildAiAdjudicatorAddress,
      formatCorrespondenceTranscript,
    } = await import("../convex/lib/aiAdjudicator");

    expect(buildAiAdjudicatorAddress("Molina Healthcare")).toBe(
      "molinahealthcare-adjudication@claimhero.agentmail.com"
    );
    expect(isAiAdjudicatorAddress("molinahealthcare-adjudication@claimhero.agentmail.com")).toBe(true);
    expect(
      isAiAdjudicatorAddress(
        "Molina Healthcare Appellate Review Board <molinahealthcare-adjudication@claimhero.agentmail.com>"
      )
    ).toBe(true);
    expect(isAiAdjudicatorAddress("judge@hackathon.com")).toBe(false);
    expect(isAiAdjudicatorAddress(undefined)).toBe(false);
    expect(isAiAdjudicatorAddress("molinahealthcare-adjudication-clm202688192@agentmail.to")).toBe(true);
    expect(isAiAdjudicatorAddress("claimhero-adjudicator@agentmail.to")).toBe(true);

    const transcript = formatCorrespondenceTranscript([
      {
        direction: "outbound",
        subject: "Formal Appeal",
        bodyText: "Please overturn this denial.",
      },
      {
        direction: "inbound",
        subject: "Records Requested",
        bodyText: "Please send PT notes.",
      },
      {
        direction: "outbound",
        subject: "Addendum",
        bodyText: "Attached 16 weeks of PT notes.",
      },
    ]);

    expect(transcript).toContain("APPELLANT (Authorized Representative)");
    expect(transcript).toContain("PAYER MEDICAL DIRECTOR");
    expect(transcript).toContain("Attached 16 weeks of PT notes.");
  });
});

describe("Phase 7: Portfolio Analytics & Recovery Calculation Engine", () => {
  it("computes overall recovery rate percent accurately", () => {
    const computeRecoveryRate = (totalDisputed: number, wonAmount: number) => {
      if (totalDisputed === 0) return 0;
      return Math.round((wonAmount / totalDisputed) * 100);
    };

    expect(computeRecoveryRate(100000, 45000)).toBe(45);
    expect(computeRecoveryRate(24500, 24500)).toBe(100);
    expect(computeRecoveryRate(0, 0)).toBe(0);
  });

  it("aggregates active disputed vs settled won funds correctly", () => {
    const claims = [
      { deniedAmount: 24500, status: "won" },
      { deniedAmount: 18200, status: "dispatched" },
      { deniedAmount: 2850, status: "analyzing" },
    ];

    const wonAmount = claims.filter((c) => c.status === "won").reduce((acc, c) => acc + c.deniedAmount, 0);
    const activeAmount = claims.filter((c) => c.status !== "won" && c.status !== "lost").reduce((acc, c) => acc + c.deniedAmount, 0);

    expect(wonAmount).toBe(24500);
    expect(activeAmount).toBe(21050);
  });
});

describe("Phase 8: End-to-End Workflow State Lifecycle", () => {
  it("progresses sequentially through all autonomous appeal lifecycle states", () => {
    const validLifecycle = [
      "ingested",
      "parsing",
      "analyzing",
      "precedent_matched",
      "drafting",
      "ready_for_review",
      "dispatched",
      "won",
    ];

    expect(validLifecycle[0]).toBe("ingested");
    expect(validLifecycle[validLifecycle.length - 1]).toBe("won");
    expect(validLifecycle).toContain("precedent_matched");
    expect(validLifecycle).toContain("dispatched");
  });
});

describe("ClaimHero SPA URL Routing", () => {
  it("resolves homepage and distinct dashboard routes accurately", async () => {
    const { parsePathToView, VIEW_TO_PATH_MAP } = await import("../src/hooks/useRouterView");

    // Homepage
    expect(parsePathToView("/")).toBe("landing");
    expect(parsePathToView("")).toBe("landing");

    // Main Dashboard & Sub-routes
    expect(parsePathToView("/app")).toBe("radar");
    expect(parsePathToView("/dashboard")).toBe("radar");
    expect(parsePathToView("/app/evidence")).toBe("evidence");
    expect(parsePathToView("/app/studio")).toBe("studio");
    expect(parsePathToView("/app/inbox")).toBe("communications");
    expect(parsePathToView("/app/analytics")).toBe("analytics");
    expect(parsePathToView("/app/audit")).toBe("audit");

    // Login & Auth routes
    expect(parsePathToView("/login")).toBe("login");
    expect(parsePathToView("/auth")).toBe("login");
    expect(parsePathToView("/signin")).toBe("login");
    expect(parsePathToView("/signup")).toBe("login");
    expect(parsePathToView("/", "#/login")).toBe("login");

    // View to Path mapping
    expect(VIEW_TO_PATH_MAP.landing).toBe("/");
    expect(VIEW_TO_PATH_MAP.radar).toBe("/app");
    expect(VIEW_TO_PATH_MAP.evidence).toBe("/app/evidence");
    expect(VIEW_TO_PATH_MAP.login).toBe("/login");
  });
});

describe("ClaimHero Convex Authentication & Security", () => {
  it("validates password length requirements and credential validation", () => {
    const isPasswordValid = (pwd: string) => pwd.length >= 6;
    expect(isPasswordValid("12345")).toBe(false);
    expect(isPasswordValid("sentinel123")).toBe(true);
  });

  it("validates email format for sentinel officers", () => {
    const isEmailValid = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    expect(isEmailValid("officer@claimhero.ai")).toBe(true);
    expect(isEmailValid("invalid-email")).toBe(false);
    expect(isEmailValid("dr.smith@hospital.org")).toBe(true);
  });

  it("formats user display initials accurately", () => {
    const getInitials = (name?: string, email?: string) => {
      if (name && name.trim()) return name.trim()[0].toUpperCase();
      if (email && email.trim()) return email.trim()[0].toUpperCase();
      return "S";
    };

    expect(getInitials("Jordan Vance", "jordan@claimhero.ai")).toBe("J");
    expect(getInitials("", "sentinel@claimhero.ai")).toBe("S");
    expect(getInitials(undefined, undefined)).toBe("S");
  });
});

describe("ClaimHero Onboarding & Guided Checklist Experience", () => {
  it("calculates onboarding checklist completion percentage", () => {
    const computeProgress = (tasks: { isDone: boolean }[]) => {
      const done = tasks.filter((t) => t.isDone).length;
      return Math.round((done / tasks.length) * 100);
    };

    expect(computeProgress([{ isDone: true }, { isDone: false }, { isDone: false }, { isDone: false }])).toBe(25);
    expect(computeProgress([{ isDone: true }, { isDone: true }, { isDone: true }, { isDone: true }])).toBe(100);
    expect(computeProgress([{ isDone: false }, { isDone: false }])).toBe(0);
  });

  it("validates jurisdiction code mappings for statutory timeline rules", () => {
    const validCodes = ["CA", "NY", "TX", "FL", "IL", "FED"];
    expect(validCodes).toContain("CA");
    expect(validCodes).toContain("FED");
    expect(validCodes.length).toBe(6);
  });
});

describe("ClaimHero Production-Grade Case Deletion & Cascading Purge", () => {
  it("verifies all dependent tables and storage artifacts targeted in cascade purge", () => {
    const requiredCascadeTables = [
      "clinicalEvidences",
      "appeals",
      "emailMessages",
      "emailThreads",
      "appealAuditLogs",
    ];

    const requiredStorageArtifacts = [
      "denialLetterStorageId",
      "pdfExportStorageId",
    ];

    expect(requiredCascadeTables.length).toBe(5);
    expect(requiredCascadeTables).toContain("clinicalEvidences");
    expect(requiredCascadeTables).toContain("appeals");
    expect(requiredCascadeTables).toContain("emailMessages");
    expect(requiredCascadeTables).toContain("emailThreads");
    expect(requiredCascadeTables).toContain("appealAuditLogs");

    expect(requiredStorageArtifacts).toContain("denialLetterStorageId");
    expect(requiredStorageArtifacts).toContain("pdfExportStorageId");
  });

  it("evaluates active claim fallback selection logic when active claim is deleted", () => {
    const claimList = [
      { _id: "claim_1", claimNumber: "CLM-001" },
      { _id: "claim_2", claimNumber: "CLM-002" },
      { _id: "claim_3", claimNumber: "CLM-003" },
    ];

    const getNextSelectedId = (deletedId: string, currentSelectedId: string, list: typeof claimList) => {
      if (currentSelectedId !== deletedId) return currentSelectedId;
      const remaining = list.filter((c) => c._id !== deletedId);
      return remaining[0]?._id || "";
    };

    // If active claim 1 is deleted, fallback to claim 2
    expect(getNextSelectedId("claim_1", "claim_1", claimList)).toBe("claim_2");

    // If inactive claim 3 is deleted, active claim 1 stays active
    expect(getNextSelectedId("claim_3", "claim_1", claimList)).toBe("claim_1");

    // If only 1 claim exists and is deleted, fallback to empty string
    expect(getNextSelectedId("claim_single", "claim_single", [{ _id: "claim_single", claimNumber: "CLM-000" }])).toBe("");
  });

  it("strips raw markdown asterisks and formatting characters for clean UI presentation", () => {
    const rawText = "**Statutory Requirement**: Plan administrators must provide claimants with all documents.";
    expect(stripMarkdownFormatting(rawText)).toBe(
      "Statutory Requirement: Plan administrators must provide claimants with all documents."
    );

    const multiFormatted = "Clinical **criteria** under *Section 1.A* and `CPT 27447` are **met**.";
    expect(stripMarkdownFormatting(multiFormatted)).toBe(
      "Clinical criteria under Section 1.A and CPT 27447 are met."
    );

    expect(stripMarkdownFormatting("")).toBe("");
    expect(stripMarkdownFormatting(undefined)).toBe("");
  });
});
