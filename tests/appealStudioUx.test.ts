import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect } from "vitest";
import { SimpleStudioView } from "../src/components/studio/SimpleStudioView";
import { Claim, ClinicalEvidence } from "../src/types";

const mockClaim: Claim = {
  _id: "claim_test_101",
  patientId: "patient_101",
  patient: {
    _id: "patient_101",
    name: "Marcus Sterling",
    insurancePayer: "GeoBlue Worldwide Medical Insurance",
    email: "marcus@example.com",
    memberId: "GEO-554210-99",
    createdAt: 1773300000000,
  },
  claimNumber: "CLM-6104-GEO-7356",
  serviceDate: "2026-07-04",
  providerName: "St. Jude Orthopedic Center",
  deniedAmount: 18200,
  patientOwedAmount: 18200,
  cptCodes: ["63047"],
  icd10Codes: ["M51.26"],
  denialReasonCode: "CO-197",
  denialReasonDescription: "Precertification / prior authorization missing or notification absent.",
  status: "ready_for_review",
  statutoryDeadline: Date.now() + 180 * 24 * 3600 * 1000,
  daysRemaining: 180,
  overturnProbabilityScore: 90,
  assignedAgentEmail: "sentinel-agent@claimhero.dev",
  createdAt: 1773300000000,
  updatedAt: 1773300000000,
};

const mockEvidences: ClinicalEvidence[] = [
  {
    _id: "ev_1",
    claimId: "claim_test_101",
    sourceType: "payer_cpb",
    title: "Lumbar Spine Surgery Clinical Policy Bulletin #0412",
    citationClause: "Section IV: Clinical Exceptions for Acute Neurological Deficit",
    extractedEvidenceMarkdown: "Prior authorization requirements are waived in cases of progressive neurological impairment.",
    relevanceScore: 94,
    createdAt: 1773300000000,
  },
  {
    _id: "ev_2",
    claimId: "claim_test_101",
    sourceType: "pubmed_study",
    title: "Efficacy of Decompressive Lumbar Laminectomy",
    citationClause: "Results Paragraph 2",
    extractedEvidenceMarkdown: "Surgical decompression resulted in significant improvement in mobility and pain reduction.",
    relevanceScore: 91,
    createdAt: 1773300001000,
  },
  {
    _id: "ev_3",
    claimId: "claim_test_101",
    sourceType: "legal_precedent",
    title: "ERISA 29 CFR § 2560.503-1 Statutory Review Standard",
    citationClause: "Subsection (h)(2)(iii)",
    extractedEvidenceMarkdown: "Plan fiduciaries must provide claimant with all internal clinical criteria and claim records.",
    relevanceScore: 96,
    createdAt: 1773300002000,
  },
];

const sampleAppealBriefMarkdown = `
# Appeal of Adverse Benefit Determination

**Claim reference:** #CLM-6104-GEO-7356

**Claim details**
- Patient: Marcus Sterling
- Insurer: GeoBlue Worldwide Medical Insurance
- Disputed Amount: $18,200

Dear Appeals and Grievances Committee,

I am writing to formally appeal the adverse benefit determination for lumbar spine decompression (CPT 63047).
Under GeoBlue CPB #0412 Section IV, prior authorization is explicitly exempted when progressive clinical symptoms are documented.

Sincerely,
Dr. Robert Vance, MD
`;

describe("Appeal Studio UX & Progressive Disclosure (SimpleStudioView)", () => {
  it("renders a document-first executive appeal view in read mode without raw markdown noise", () => {
    const markup = renderToStaticMarkup(
      React.createElement(SimpleStudioView, {
        claim: mockClaim,
        evidences: mockEvidences,
        markdownContent: sampleAppealBriefMarkdown,
        setMarkdownContent: () => {},
        appealLevel: "level_1_internal",
        hasSynthesizedBrief: true,
        isSynthesizing: false,
        isEscalating: false,
        isSaving: false,
        saveStatus: "saved",
        readOnly: false,
        isBackgroundPipelineRunning: false,
        collaboratorsCount: 1,
        onNavigateToDispatch: () => {},
        onRunSynthesis: async () => {},
        onOpenExport: () => {},
        onOpenShare: () => {},
        onOpenEscalate: () => {},
      })
    );

    // Document header elements
    expect(markup).toContain("Your Appeal Letter");
    expect(markup).toContain("CLM-6104-GEO-7356");
    expect(markup).toContain("Marcus Sterling");
    expect(markup).toContain("GeoBlue Worldwide Medical Insurance");
    expect(markup).toContain("Ready to send");

    // Mode buttons
    expect(markup).toContain("Read");
    expect(markup).toContain("Edit text");
    expect(markup).toContain("Rewrite");
    expect(markup).toContain("Save / Print");
    expect(markup).toContain("Share");

    // Formatted document rendered via AppealBriefRenderer
    expect(markup).toContain("Appeal of Adverse Benefit Determination");
    expect(markup).toContain("Dear Appeals and Grievances Committee");

    // Ensure raw technical jargon from Expert mode is omitted in Simple Mode
    expect(markup).not.toContain("T1 First appeal — to your insurer (Saved)");
    expect(markup).not.toContain("Aggressiveness:");
    expect(markup).not.toContain("jump-trans");
    expect(markup).not.toContain("Embed $110/d Penalties");
  });

  it("renders the 3 proof categories woven into the letter", () => {
    const markup = renderToStaticMarkup(
      React.createElement(SimpleStudioView, {
        claim: mockClaim,
        evidences: mockEvidences,
        markdownContent: sampleAppealBriefMarkdown,
        setMarkdownContent: () => {},
        appealLevel: "level_1_internal",
        hasSynthesizedBrief: true,
        isSynthesizing: false,
        isEscalating: false,
        isSaving: false,
        saveStatus: "saved",
        readOnly: false,
        isBackgroundPipelineRunning: false,
        collaboratorsCount: 0,
        onNavigateToDispatch: () => {},
        onRunSynthesis: async () => {},
        onOpenExport: () => {},
        onOpenShare: () => {},
        onOpenEscalate: () => {},
      })
    );

    expect(markup).toContain("Proof Included in Your Letter");
    expect(markup).toContain("View proof breakdown");
  });

  it("renders the canonical next-step action card pointing to dispatch", () => {
    const markup = renderToStaticMarkup(
      React.createElement(SimpleStudioView, {
        claim: mockClaim,
        evidences: mockEvidences,
        markdownContent: sampleAppealBriefMarkdown,
        setMarkdownContent: () => {},
        appealLevel: "level_1_internal",
        hasSynthesizedBrief: true,
        isSynthesizing: false,
        isEscalating: false,
        isSaving: false,
        saveStatus: "saved",
        readOnly: false,
        isBackgroundPipelineRunning: false,
        collaboratorsCount: 0,
        onNavigateToDispatch: () => {},
        onRunSynthesis: async () => {},
        onOpenExport: () => {},
        onOpenShare: () => {},
        onOpenEscalate: () => {},
      })
    );

    expect(markup).toContain("Ready to send your appeal letter?");
    expect(markup).toContain("Continue to Send &amp; Track");
  });
});
