import { describe, it, expect } from "vitest";
import {
  buildDossierData,
  resolvePayerEdiId,
  extractCriteriaViolations,
  generatePlainTextDossier,
  formatDossierDate,
} from "../src/lib/dossierBuilder";
import { Claim, Appeal, ClinicalEvidence } from "../src/types";

describe("Feature G: Court-Ready Appeal Dossier & Exhibit PDF Binder", () => {
  const mockClaim: Claim = {
    _id: "claim-test-101",
    patientId: "patient-1",
    claimNumber: "CLM-9823412",
    serviceDate: "2024-03-15",
    providerName: "Dr. Sarah Jenkins, MD, FAAOS",
    deniedAmount: 48500,
    patientOwedAmount: 48500,
    cptCodes: ["27447"],
    icd10Codes: ["M17.11"],
    denialReasonCode: "CO-50",
    denialReasonDescription: "These are non-covered services because this is not deemed a medical necessity by the payer.",
    status: "ready_for_review",
    statutoryDeadline: 1718409600000,
    daysRemaining: 42,
    assignedAgentEmail: "advocate@claimhero.io",
    payerContact: {
      officialAppealsEmail: "MFLGrievanceandAppealsDepartment@MolinaHealthcare.com",
      appealsFax: "1-877-508-5748",
      statutoryPoBox: "Molina Healthcare Grievance & Appeals, P.O. Box 521838, Longwood, FL 32752",
      ediPayerId: "51062",
      isVerified: true,
    },
    appealContext: {
      sender: {
        name: "Dr. Sarah Jenkins, MD, FAAOS",
        credentials: "Board Certified Orthopedic Surgeon",
        email: "sjenkins@orthoclinic.org",
        phone: "1-800-555-0199",
      },
      clinicalFacts: {
        symptomsAndFunctionalImpact: "Severe right knee osteoarthritis with severe functional impairment and inability to ambulate > 50 feet.",
        examinationFindings: "Grade 4 joint space narrowing on standing AP radiographs.",
        imagingAndDiagnostics: "Standing bilateral knee radiographs confirming tricompartmental osteophytes.",
        treatmentHistoryAndResponse: "Failed 6-month trial of NSAIDs, physical therapy, and intra-articular corticosteroid injections.",
        recordsAreIncomplete: false,
      },
      physicianNotes: "Patient has exhausted all conservative measures. Total Knee Arthroplasty (CPT 27447) is strictly indicated.",
      confirmedAt: 1710500000000,
    },
    patient: {
      _id: "patient-1",
      name: "Eleanor Vance",
      email: "eleanor.vance@example.com",
      memberId: "MBN9823412-01",
      groupNumber: "GRP-88210",
      insurancePayer: "Molina Healthcare",
      state: "FL",
      createdAt: 1710000000000,
    },
    createdAt: 1710000000000,
    updatedAt: 1710500000000,
  };

  const mockAppeal: Appeal = {
    _id: "appeal-test-1",
    claimId: "claim-test-101",
    version: 2,
    appealLevel: "level_2_grievance",
    statutoryPosture: "procedural_grievance_bad_faith",
    targetAuthority: "Multi-Disciplinary Peer Review Panel & Grievance Committee",
    legalAggressiveness: "elevated_grievance",
    statutoryAuthorities: [
      "ERISA Section 503 (29 U.S.C. § 1133)",
      "29 C.F.R. § 2560.503-1(h)(3)(iii) (Mandatory Same-Specialty Peer Review)",
      "Department of Labor Claims Procedure Regulations",
    ],
    executiveSummary: "Formal Level 2 Grievance demanding overturn of adverse determination for CPT 27447.",
    medicalNecessityArguments: "Clinical documentation satisfies all published criteria for total knee arthroplasty.",
    legalCitations: "ERISA 29 CFR § 2560.503-1; Molina CPB § IV.A",
    fullAppealMarkdown: "# Level 2 Formal Grievance Appeal Brief\n\nSubstantive legal and medical rebuttal.",
    lastEditedBy: "Advocate Lead",
    updatedAt: 1710500000000,
  };

  const mockEvidences: ClinicalEvidence[] = [
    {
      _id: "ev-1",
      claimId: "claim-test-101",
      sourceType: "payer_cpb",
      title: "Molina Clinical Policy Bulletin 0561: Total Knee Arthroplasty Criteria",
      citationClause: "CPB 0561 Section IV.A",
      extractedEvidenceMarkdown: "Total knee arthroplasty is considered medically necessary when patient exhibits Kellgren-Lawrence Grade 3 or 4 osteoarthritis, failure of 3 months conservative therapy, and functional impairment.",
      sourceUrl: "https://www.molinahealthcare.com/cpb/0561",
      relevanceScore: 98,
      createdAt: 1710000000000,
    },
    {
      _id: "ev-2",
      claimId: "claim-test-101",
      sourceType: "pubmed_study",
      title: "PMID: 34182910 - Long-term Outcomes of TKA in Severe Osteoarthritis",
      citationClause: "PMID: 34182910 • J Bone Joint Surg",
      extractedEvidenceMarkdown: "Multi-center prospective trial demonstrated 96.4% 10-year implant survivorship and substantial WOMAC pain index reduction following primary TKA in patients with end-stage gonarthrosis.",
      sourceUrl: "https://pubmed.ncbi.nlm.nih.gov/34182910",
      relevanceScore: 95,
      createdAt: 1710000000000,
    },
    {
      _id: "ev-3",
      claimId: "claim-test-101",
      sourceType: "fda_package_insert",
      title: "FDA Package Insert: Stryker Triathlon Total Knee System (PMA P000048)",
      citationClause: "FDA 21 CFR § 888.3560 • PMA P000048",
      extractedEvidenceMarkdown: "Indicated for severe knee pain and disability due to rheumatoid arthritis, osteoarthritis, traumatic arthritis, or polyarthritis.",
      sourceUrl: "https://www.accessdata.fda.gov/cdrh_docs/pdf/P000048.pdf",
      relevanceScore: 92,
      createdAt: 1710000000000,
    },
  ];

  describe("Payer EDI Identifier Resolution", () => {
    it("resolves verified payer EDI identifier from claim contact or directory", () => {
      const edi1 = resolvePayerEdiId("Molina Healthcare", "51062");
      expect(edi1).toBe("51062");

      const edi2 = resolvePayerEdiId("GeoBlue (BCBS Global)");
      expect(edi2).toBe("GEO01");

      const edi3 = resolvePayerEdiId("Aetna (CVS Health)");
      expect(edi3).toBe("60054");

      const edi4 = resolvePayerEdiId("UnitedHealthcare");
      expect(edi4).toBe("87726");
    });
  });

  describe("Dossier Data Model Construction", () => {
    it("constructs full court-ready dossier model with docket header and payer EDI details", () => {
      const dossier = buildDossierData(mockClaim, mockAppeal, mockEvidences, false);

      expect(dossier.docketNumber).toBe("CLM-9823412");
      expect(dossier.statutoryLevel).toBe("level_2_grievance");
      expect(dossier.statutoryLevelLabel).toContain("Level 2 Formal Grievance");
      expect(dossier.targetAuthority).toBe("Multi-Disciplinary Peer Review Panel & Grievance Committee");
      expect(dossier.payerName).toBe("Molina Healthcare");
      expect(dossier.payerEdiId).toBe("51062");
      expect(dossier.payerAppealsAddress).toContain("Molina Healthcare Grievance & Appeals");
      expect(dossier.patientName).toBe("Eleanor Vance");
      expect(dossier.memberId).toBe("MBN9823412-01");
      expect(dossier.groupNumber).toBe("GRP-88210");
      expect(dossier.cptCodes).toContain("27447");
      expect(dossier.icd10Codes).toContain("M17.11");
      expect(dossier.deniedAmount).toBe(48500);
      expect(dossier.patientLiability).toBe(48500);
    });

    it("populates Exhibit A, B, and C collections accurately", () => {
      const dossier = buildDossierData(mockClaim, mockAppeal, mockEvidences, false);

      // Exhibit A: Original Adverse Notice
      expect(dossier.exhibitA_Notice.claimNumber).toBe("CLM-9823412");
      expect(dossier.exhibitA_Notice.denialReasonCode).toBe("CO-50");
      expect(dossier.exhibitA_Notice.deniedAmount).toBe(48500);

      // Exhibit B: Payer Clinical Policy Bulletins with highlighted violations
      expect(dossier.exhibitB_PolicyBulletins.length).toBe(1);
      expect(dossier.exhibitB_PolicyBulletins[0].exhibitLetter).toBe("B");
      expect(dossier.exhibitB_PolicyBulletins[0].title).toContain("Molina Clinical Policy Bulletin");
      expect(dossier.exhibitB_PolicyBulletins[0].highlightedViolations).toBeDefined();
      expect(dossier.exhibitB_PolicyBulletins[0].highlightedViolations?.length).toBeGreaterThan(0);

      // Exhibit C: Peer-Reviewed PubMed Literature & FDA Indications
      expect(dossier.exhibitC_MedicalLiterature.length).toBe(2);
      expect(dossier.exhibitC_MedicalLiterature[0].exhibitLetter).toBe("C");
      expect(dossier.exhibitC_MedicalLiterature[0].citationClause).toContain("PMID: 34182910");
      expect(dossier.exhibitC_MedicalLiterature[1].citationClause).toContain("FDA 21 CFR");
    });

    it("builds formal physician attestation and signature metadata", () => {
      const dossier = buildDossierData(mockClaim, mockAppeal, mockEvidences, false);

      expect(dossier.physicianInfo.name).toBe("Dr. Sarah Jenkins, MD, FAAOS");
      expect(dossier.physicianInfo.credentials).toBe("Board Certified Orthopedic Surgeon");
      expect(dossier.physicianInfo.npiNumber).toBe("1982736450");
      expect(dossier.physicianInfo.attestationDate).toBeDefined();
    });
  });

  describe("Criteria Violations & Contradictions Extraction", () => {
    it("extracts specific criteria violations from policy evidence and claim denial reason", () => {
      const violations = extractCriteriaViolations(
        "Total knee arthroplasty criteria met when radiographic joint space narrowing is present. Fails to consider conservative therapy trial failure.",
        "CO-50: Service not deemed medically necessary"
      );

      expect(violations.length).toBeGreaterThan(0);
      expect(violations.some((v) => v.toLowerCase().includes("conservative"))).toBe(true);
      expect(violations.some((v) => v.toLowerCase().includes("generic denial code"))).toBe(true);
    });
  });

  describe("HIPAA Safe Harbor / Public Exhibit Redaction", () => {
    it("masks patient direct identifiers and member ID suffixes across all dossier sections and exhibits", () => {
      const dossier = buildDossierData(mockClaim, mockAppeal, mockEvidences, true);

      expect(dossier.isRedacted).toBe(true);
      expect(dossier.patientName).not.toBe("Eleanor Vance");
      expect(dossier.patientName).toContain("[PATIENT NAME REDACTED");
      expect(dossier.memberId).toMatch(/\[REDACTED|\*\*/);
    });

  });

  describe("Plain Text Dossier Serialization", () => {
    it("serializes full dossier with Docket Header, Table of Contents, Statutory Summary, Exhibits A-C, and Physician Attestation", () => {
      const dossier = buildDossierData(mockClaim, mockAppeal, mockEvidences, false);
      const text = generatePlainTextDossier(dossier);

      // Section markers
      expect(text).toContain("UNITED STATES HEALTH INSURANCE APPELLATE RECORD & CLAIM DOCKET");
      expect(text).toContain("DOCKET REFERENCE: CLM-9823412");
      expect(text).toContain("PAYER EDI ID:       51062");
      expect(text).toContain("II. MASTER TABLE OF CONTENTS");
      expect(text).toContain("III. STATUTORY RIGHTS SUMMARY & APPELLATE POSTURE");
      expect(text).toContain("IV. SUBSTANTIVE APPEAL MEMORANDUM");
      expect(text).toContain("V. MASTER EXHIBIT INDEX");
      expect(text).toContain("EXHIBIT A: ORIGINAL ADVERSE BENEFIT DETERMINATION NOTICE");
      expect(text).toContain("EXHIBIT B: PAYER CLINICAL POLICY BULLETIN & CRITERIA VIOLATIONS");
      expect(text).toContain("EXHIBIT C: PEER-REVIEWED MEDICAL LITERATURE & FDA INDICATIONS");
      expect(text).toContain("VI. FORMAL PHYSICIAN ATTESTATION & SIGNATURE BLOCK");

      // Attestation and signature elements
      expect(text).toContain("DECLARATION OF TREATING CLINICIAN");
      expect(text).toContain("Physician Signature: _________________________________________");
      expect(text).toContain("Dr. Sarah Jenkins, MD, FAAOS");
      expect(text).toContain("National Provider ID: 1982736450");
    });
  });
});
