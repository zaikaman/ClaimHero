import { describe, it, expect, vi, beforeEach } from "vitest";
import * as actionPolicyCrawler from "../convex/actions/policyCrawler";
import * as actionAppealSynthesizer from "../convex/actions/appealSynthesizer";
import * as libOpenAI from "../convex/lib/openai";
import { rateLimiter } from "../convex/lib/rateLimiter";
import { getAuthUserId } from "@convex-dev/auth/server";

vi.mock("@convex-dev/auth/server", () => ({
  getAuthUserId: vi.fn(),
}));

describe("Convex Actions: Policy Crawler & Appeal Synthesizer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("convex/actions/policyCrawler", () => {
    it("crawlCustomResearchUrl: scrapes custom web URL and inserts criteria clauses", async () => {
      vi.mocked(getAuthUserId).mockResolvedValue("user_123" as any);
      vi.spyOn(rateLimiter, "limit").mockResolvedValue({ ok: true } as any);

      vi.spyOn(libOpenAI, "createStructuredCompletion").mockResolvedValue({
        documentTitle: "AAOS Total Knee Arthroplasty Clinical Guideline",
        issuingAuthority: "American Academy of Orthopaedic Surgeons",
        clauses: [
          {
            citationClause: "Recommendation 2.1",
            extractedEvidenceMarkdown: "Strong evidence supports surgical intervention following documented failure of 3 months conservative modalities.",
            relevanceScore: 95,
          },
        ],
      } as any);

      const substantiveMarkdown = "# AAOS Clinical Practice Guideline on Total Knee Arthroplasty\n\n" +
        "Medical necessity and coverage criteria: The patient must present with severe, intractable knee joint pain, " +
        "radiographically confirmed tri-compartmental or medial compartment joint space narrowing, and failure of at least " +
        "12 weeks of structured, documented conservative treatment modalities including formal physical therapy, NSAIDs, " +
        "and intra-articular corticosteroid injections. Surgical intervention with Total Knee Arthroplasty (CPT 27447) is strongly " +
        "recommended by clinical practice guidelines when conservative options fail to relieve debilitating functional impairment. " +
        "Contraindications include active local infection or uncontrolled systemic illness. This clinical policy bulletin establishes " +
        "objective medical indications and coverage thresholds for reconstructive orthopedic knee procedures across all commercial plans.";

      const mockCtx: any = {
        runAction: vi.fn().mockResolvedValue({
          markdown: substantiveMarkdown,
          sourceUrl: "https://aaos.org/guidelines/tka",
        }),
        runMutation: vi.fn().mockResolvedValue(["ev_1"]),
      };

      const res = await (actionPolicyCrawler.crawlCustomResearchUrl as any)._handler(mockCtx, {
        claimId: "c1",
        customUrl: "https://aaos.org/guidelines/tka",
        sourceCategory: "payer_cpb",
      });

      expect(res.documentTitle).toContain("AAOS");
      expect(res.clausesExtracted).toBe(1);
      expect(mockCtx.runMutation).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
        claimId: "c1",
        evidences: expect.any(Array),
      }));
    });

    it("crawlPubMedAndTrials: extracts study evidence from clinical trials / pubmed", async () => {
      process.env.FIRECRAWL_API_KEY = "fc-test-key";
      vi.spyOn(libOpenAI, "createStructuredCompletion").mockResolvedValue({
        studyTitle: "Long-term Outcomes of Lumbar Laminectomy in Severe Spinal Stenosis",
        identifier: "PMID: 31245678",
        studyDesign: "Prospective Multi-Center Randomized Controlled Trial",
        clauses: [
          {
            citationClause: "Section 4.1",
            extractedEvidenceMarkdown: "Surgical decompression achieved 84% symptomatic relief compared to 28% for continued non-operative management.",
            relevanceScore: 94,
          },
        ],
      } as any);

      const substantiveMarkdown = "# PubMed Medical Evidence on Lumbar Decompression\n\n" +
        "Medical necessity and clinical efficacy criteria: In a multi-center randomized controlled trial of 450 patients " +
        "with lumbar spinal stenosis (ICD-10 M51.16) undergoing CPT 63047 decompressive laminectomy after failed conservative " +
        "care, surgical decompression achieved statistically significant improvements in Oswestry Disability Index scores at " +
        "12 and 24 months. Standard of care strongly indicates decompressive surgery when neurological symptoms persist. " +
        "Long-term follow-up demonstrates sustained relief from neurogenic claudication, improved ambulatory capacity, " +
        "and statistically significant reductions in opioid usage across all cohorts in the surgical arm.";

      const mockCtx: any = {
        runAction: vi.fn().mockResolvedValue({
          markdown: substantiveMarkdown,
          sourceUrl: "https://pubmed.ncbi.nlm.nih.gov/31245678",
        }),
        runMutation: vi.fn().mockResolvedValue(["ev_pubmed_1"]),
      };

      const res = await (actionPolicyCrawler.crawlPubMedAndTrials as any)._handler(mockCtx, {
        claimId: "c1",
        cptCodes: ["63047"],
        icd10Codes: ["M51.16"],
        denialReasonCode: "CO-50",
        customUrl: "https://pubmed.ncbi.nlm.nih.gov/31245678",
      });

      expect(res.identifier).toBe("PMID: 31245678");
      expect(res.clausesExtracted).toBe(1);
      expect(mockCtx.runMutation).toHaveBeenCalled();
    });

    it("crawlFdaIndications: extracts on-label indication evidence", async () => {
      vi.spyOn(libOpenAI, "createStructuredCompletion").mockResolvedValue({
        productName: "Spinal Decompression System",
        applicationNumber: "PMA P190012",
        approvedIndications: "Indicated for treatment of moderate to severe lumbar spinal stenosis with radiculopathy.",
        approvalDate: "2021-06-15",
        antiInvestigationalRebuttal: "FDA pre-market approval confirms safety and efficacy under Section 515 of the FD&C Act.",
        clauses: [
          {
            citationClause: "Section 1: Indications",
            extractedEvidenceMarkdown: "FDA Approved for patients who have completed conservative therapy.",
            relevanceScore: 98,
          },
        ],
      } as any);

      const substantiveMarkdown = "# FDA Approved Package Label and Indications\n\n" +
        "Medical necessity and device approval criteria: The Spinal Decompression System is approved by the FDA under PMA P190012 " +
        "for the surgical treatment of lumbar spinal stenosis with neurogenic claudication. Clinical trials demonstrate substantial " +
        "evidence of safety and effectiveness for surgical decompression in patients failing conservative modalities. " +
        "This device is fully FDA approved and non-investigational under federal regulations and statutory guidelines. " +
        "Approved labeling specifically designates the system for reconstructive spine interventions when objective neurological findings " +
        "confirm nerve root compromise matching CPT 63047 indications.";

      const mockCtx: any = {
        runAction: vi.fn().mockResolvedValue({
          markdown: substantiveMarkdown,
          sourceUrl: "https://accessdata.fda.gov/cdrh_docs/pdf19/P190012.pdf",
        }),
        runMutation: vi.fn().mockResolvedValue(["ev_fda_1"]),
      };

      const res = await (actionPolicyCrawler.crawlFdaIndications as any)._handler(mockCtx, {
        claimId: "c1",
        cptCodes: ["63047"],
        icd10Codes: ["M51.16"],
        denialReasonCode: "CO-50",
        customUrl: "https://accessdata.fda.gov/cdrh_docs/pdf19/P190012.pdf",
      });

      expect(res.applicationNumber).toBe("PMA P190012");
      expect(res.clausesExtracted).toBe(1);
      expect(mockCtx.runMutation).toHaveBeenCalled();
    });
  });

  describe("convex/actions/appealSynthesizer", () => {
    it("generateAppealBrief: creates Tier 1 appeal brief and saves draft", async () => {
      vi.mocked(getAuthUserId).mockResolvedValue("user_123" as any);
      vi.spyOn(rateLimiter, "limit").mockResolvedValue({ ok: true } as any);

      const mockClaim = {
        _id: "c1",
        userId: "user_123",
        claimNumber: "CLM-APP-1",
        patient: { name: "Marcus Holloway", insurancePayer: "UnitedHealthcare", state: "CA" },
        cptCodes: ["63047"],
        icd10Codes: ["M51.16"],
        denialReasonCode: "CO-50",
        denialReasonDescription: "Medical necessity criteria not satisfied",
        deniedAmount: 18450,
      };

      const mockEvidences = [
        {
          _id: "ev1",
          sourceType: "payer_cpb",
          title: "UHC CPB 0016",
          citationClause: "Section 3.B",
          extractedEvidenceMarkdown: "Conservative therapy completed for 12 weeks with MRI documented neural compression.",
          relevanceScore: 95,
        },
      ];

      vi.spyOn(libOpenAI, "createStructuredCompletion").mockResolvedValue({
        executiveSummary: "Formal Level 1 Internal Appeal for reimbursement of decompressive laminectomy.",
        medicalNecessityArguments: "Documented 12 weeks of non-operative care and progressive neurological deficit satisfy all clinical policy indications.",
        legalCitations: ["29 U.S.C. § 1133", "29 CFR § 2560.503-1"],
        fullAppealMarkdown: "# Formal Level 1 Appeal Brief\n\nFull appeal content.",
      } as any);

      let qCount = 0;
      const mockCtx: any = {
        runQuery: vi.fn().mockImplementation(() => {
          qCount++;
          if (qCount === 1) return Promise.resolve(mockClaim);
          return Promise.resolve(mockEvidences);
        }),
        runMutation: vi.fn().mockResolvedValue("appeal_new_123"),
      };

      const res = await (actionAppealSynthesizer.generateAppealBrief as any)._handler(mockCtx, {
        claimId: "c1",
        appealLevel: "level_1_internal",
      });

      expect(res.appealId).toBe("appeal_new_123");
      expect(mockCtx.runMutation).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
        claimId: "c1",
        appealLevel: "level_1_internal",
      }));
    });
  });
});
