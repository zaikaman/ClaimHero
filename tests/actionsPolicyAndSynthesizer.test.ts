import { describe, it, expect, vi, beforeEach } from "vitest";
import * as actionPolicyCrawler from "../convex/actions/policyCrawler";
import * as actionAppealSynthesizer from "../convex/actions/appealSynthesizer";
import * as libOpenAI from "../convex/lib/openai";
import { rateLimiter } from "../convex/lib/rateLimiter";
// @ts-ignore getAuthUserId is injected by vi.mock("@convex-dev/auth/server")
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
        runQuery: vi.fn().mockResolvedValue({ _id: "c1", userId: "user_123" }),
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
        runQuery: vi.fn().mockResolvedValue({ _id: "c1", userId: "user_123" }),
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
        runQuery: vi.fn().mockResolvedValue({ _id: "c1", userId: "user_123" }),
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

    it("selectFirecrawlPolicyUrls: rejects university student/travel safety paths and prioritizes clinical authorities", async () => {
      const payload = {
        data: {
          web: [
            {
              url: "https://www.northwestern.edu/global-safety-security/health-safety/travel-health/international-health-insurance/geoblue-for-students.html",
              title: "GeoBlue for Students | Global Safety and Security",
              description: "International student health insurance coverage details and registration.",
            },
            {
              url: "https://guidelines.carelonmedicalbenefitsmanagement.com/spine-surgery-lumbar-decompression.pdf",
              title: "Carelon Medical Benefits Management Clinical Guideline: Lumbar Spine Decompression",
              description: "Clinical coverage policy and medical necessity criteria for CPT 63047 lumbar laminectomy.",
            },
            {
              url: "https://www.spine.org/guidelines/lumbar-decompression-criteria.pdf",
              title: "North American Spine Society (NASS) Coverage Recommendations: Lumbar Decompression",
              description: "Evidence-based clinical guidelines and conservative management criteria for 63047.",
            },
          ],
        },
      };

      const urls = actionPolicyCrawler.selectFirecrawlPolicyUrls(
        payload,
        ["63047", "lumbar", "spine", "laminectomy", "medical policy"],
        0,
        3,
        "GeoBlue",
      );

      // Student safety URL is filtered out; Carelon and NASS clinical authorities are selected and ranked first
      expect(urls).not.toContain("https://www.northwestern.edu/global-safety-security/health-safety/travel-health/international-health-insurance/geoblue-for-students.html");
      expect(urls).toContain("https://guidelines.carelonmedicalbenefitsmanagement.com/spine-surgery-lumbar-decompression.pdf");
      expect(urls).toContain("https://www.spine.org/guidelines/lumbar-decompression-criteria.pdf");
    });

    it("selectFirecrawlPolicyUrls: penalizes blog posts and directories while prioritizing direct guideline PDFs", async () => {
      const payload = {
        data: {
          web: [
            {
              url: "https://worldebhcday.org/blog/2024/advancing-spine-evidence-synthesis-north-american-spine-society-nass-guidelines",
              title: "Advancing Spine Evidence Synthesis | Blog",
              description: "Blog post commentary on healthcare awareness and spine guidelines.",
            },
            {
              url: "https://www.spine.org/Research/Clinical-Guidelines",
              title: "NASS Clinical Guidelines Directory",
              description: "Landing page index of all NASS clinical practice guidelines.",
            },
            {
              url: "https://guidelines.carelonmedicalbenefitsmanagement.com/spine-surgery-lumbar.pdf",
              title: "Carelon Spine Surgery Decompression Guideline",
              description: "Clinical coverage policy and medical necessity criteria for lumbar spine decompression.",
            },
          ],
        },
      };

      const urls = actionPolicyCrawler.selectFirecrawlPolicyUrls(
        payload,
        ["63047", "lumbar", "spine", "laminectomy", "medical policy"],
        0,
        3,
        "GeoBlue",
      );

      // Direct PDF ranks first, blog is excluded or ranked lowest
      expect(urls[0]).toBe("https://guidelines.carelonmedicalbenefitsmanagement.com/spine-surgery-lumbar.pdf");
      expect(urls).not.toContain("https://worldebhcday.org/blog/2024/advancing-spine-evidence-synthesis-north-american-spine-society-nass-guidelines");
    });

    it("extractGuidelineLinksFromMarkdown: extracts matching clinical guideline PDFs from directory pages", () => {
      const directoryMarkdown = `# North American Spine Society Clinical Guidelines
Welcome to the NASS guidelines directory. Below are the published clinical practice guidelines:
- [Lumbar Spinal Stenosis Guidelines (PDF)](https://www.spine.org/Portals/0/assets/downloads/ResearchClinicalCare/Guidelines/LumbarStenosis.pdf)
- [Cervical Radiculopathy Guidelines](https://www.spine.org/Portals/0/assets/downloads/ResearchClinicalCare/Guidelines/CervicalRadiculopathy.pdf)
- [Unrelated Member Benefits Form](https://www.spine.org/benefits/form.pdf)
`;

      const links = actionPolicyCrawler.extractGuidelineLinksFromMarkdown(
        directoryMarkdown,
        "https://www.spine.org/Research/Clinical-Guidelines",
        ["63047"],
      );

      expect(links.length).toBeGreaterThanOrEqual(1);
      expect(links[0]).toBe("https://www.spine.org/Portals/0/assets/downloads/ResearchClinicalCare/Guidelines/LumbarStenosis.pdf");
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
