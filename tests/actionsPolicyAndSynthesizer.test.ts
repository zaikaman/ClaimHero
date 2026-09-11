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

    it("isAcceptableSourceUrl: rejects link-local, private, localhost, and metadata addresses to prevent SSRF", async () => {
      const { isAcceptableSourceUrl } = actionPolicyCrawler;

      expect(isAcceptableSourceUrl("http://169.254.169.254/latest/meta-data")).toBe(false);
      expect(isAcceptableSourceUrl("http://127.0.0.1:8080/admin")).toBe(false);
      expect(isAcceptableSourceUrl("http://localhost:3000/internal")).toBe(false);
      expect(isAcceptableSourceUrl("http://10.0.0.1/secrets")).toBe(false);
      expect(isAcceptableSourceUrl("http://172.16.5.10/api")).toBe(false);
      expect(isAcceptableSourceUrl("http://192.168.1.1/router")).toBe(false);
      expect(isAcceptableSourceUrl("http://[fe80::1]/linklocal")).toBe(false);
      expect(isAcceptableSourceUrl("http://metadata.google.internal/computeMetadata/v1")).toBe(false);
      expect(isAcceptableSourceUrl("http://0.0.0.0/")).toBe(false);

      // Allows legitimate public guidelines
      expect(isAcceptableSourceUrl("https://www.cms.gov/medicare-coverage-database/view/lcd.aspx?lcdid=33394")).toBe(true);
      expect(isAcceptableSourceUrl("https://www.nccn.org/guidelines/category_1")).toBe(true);
    });

    it("crawlCustomResearchUrl: throws when provided link-local or private URL", async () => {
      vi.mocked(getAuthUserId).mockResolvedValue("user_123" as any);
      const mockCtx: any = {
        runQuery: vi.fn().mockResolvedValue({ _id: "c1", userId: "user_123" }),
      };

      await expect(
        (actionPolicyCrawler.crawlCustomResearchUrl as any)._handler(mockCtx, {
          claimId: "c1",
          customUrl: "http://169.254.169.254/latest/meta-data",
        })
      ).rejects.toThrow("Please provide a valid HTTP or HTTPS web URL.");
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

    it("selectFirecrawlPolicyUrls: rejects LinkedIn, commercial RCM blogs, and mismatched regional payers for GeoBlue", () => {
      const payload = {
        data: {
          web: [
            {
              url: "https://www.linkedin.com/posts/enovis-healthcare-solutions_great-news-for-knee-oa",
              title: "LinkedIn post on Knee OA",
              description: "Social media post",
            },
            {
              url: "https://www.verifiedrcm.com/specialty-orthopedics.html",
              title: "Verified RCM Orthopedics Billing Consultancy",
              description: "Commercial RCM medical billing service guide.",
            },
            {
              url: "https://www.providencehealthplan.com/policies/mp435.pdf",
              title: "Providence Health Plan Knee Policy",
              description: "Providence regional plan policy.",
            },
            {
              url: "https://www.horizonblue.com/providers/news/medical-policy-update",
              title: "Horizon BCBSNJ Policy Notice",
              description: "Horizon Blue Cross notice.",
            },
            {
              url: "https://guidelines.carelonmedicalbenefitsmanagement.com/joint-surgery-2025-11-15/",
              title: "Joint Surgery 2025-11-15 | Carelon Clinical Guidelines",
              description: "Official Carelon clinical appropriateness guideline for knee arthroscopy and joint surgery.",
            },
          ],
        },
      };

      const urls = actionPolicyCrawler.selectFirecrawlPolicyUrls(
        payload,
        ["29881", "knee", "arthroscopy", "meniscectomy", "medical policy"],
        0,
        5,
        "GeoBlue",
        "2026",
      );

      // Carelon Joint Surgery is selected; LinkedIn, verifiedrcm, Providence, and Horizon are all rejected
      expect(urls).toContain("https://guidelines.carelonmedicalbenefitsmanagement.com/joint-surgery-2025-11-15/");
      expect(urls).not.toContain("https://www.linkedin.com/posts/enovis-healthcare-solutions_great-news-for-knee-oa");
      expect(urls).not.toContain("https://www.verifiedrcm.com/specialty-orthopedics.html");
      expect(urls).not.toContain("https://www.providencehealthplan.com/policies/mp435.pdf");
      expect(urls).not.toContain("https://www.horizonblue.com/providers/news/medical-policy-update");
    });

    it("isPayerMismatchedSource: identifies Providence and Horizon as mismatched competitors for GeoBlue", () => {
      expect(actionPolicyCrawler.isPayerMismatchedSource("GeoBlue", "https://www.providencehealthplan.com/policies/mp435.pdf")).toBe(true);
      expect(actionPolicyCrawler.isPayerMismatchedSource("GeoBlue", "https://www.horizonblue.com/providers/notice.pdf")).toBe(true);
      // Neutral clinical guideline hosts are never mismatched
      expect(actionPolicyCrawler.isPayerMismatchedSource("GeoBlue", "https://guidelines.carelonmedicalbenefitsmanagement.com/joint-surgery-2025-11-15/")).toBe(false);
      expect(actionPolicyCrawler.isPayerMismatchedSource("GeoBlue", "https://www.aaos.org/quality/cpg/")).toBe(false);
    });

    it("scrapeFirecrawlPolicySource: falls back to markdown scrape when primary scrape times out (408)", async () => {
      const { FirecrawlClient } = await import("@firecrawl/firecrawl-convex");
      const scrapeSpy = vi.spyOn(FirecrawlClient.prototype, "scrape")
        .mockRejectedValueOnce(new Error("Firecrawl /v2/scrape failed (408): The scrape operation timed out before completing."))
        .mockResolvedValueOnce({
          markdown: "# Carelon Joint Surgery Clinical Appropriateness Guidelines\n\n" +
            "Medical necessity criteria and clinical coverage indications for knee arthroscopy and meniscectomy (CPT 29881): " +
            "Arthroscopic partial meniscectomy is considered medically necessary for patients presenting with persistent, " +
            "symptomatic knee joint pain, mechanical symptoms including documented locking or catching, distinct joint line tenderness " +
            "on objective physical examination, and failure of at least 6 weeks of structured conservative management including " +
            "formal physical therapy and non-steroidal anti-inflammatory drugs. Clinical records must confirm compliance with " +
            "diagnostic imaging criteria demonstrating meniscal tear without severe tri-compartmental osteoarthritis. " +
            "These guidelines apply to commercial health plan members and govern clinical review determinations.",
          metadata: { statusCode: 200 },
        } as any)
        .mockResolvedValueOnce({
          screenshot: undefined,
          metadata: { statusCode: 200 },
        } as any);

      const mockCtx: any = {};
      const res = await actionPolicyCrawler.scrapeFirecrawlPolicySource(
        mockCtx,
        "https://guidelines.carelonmedicalbenefitsmanagement.com/joint-surgery-2025-11-15/",
        { cptCodes: ["29881"], payer: "GeoBlue", denialReasonCode: "CO-50" }
      );

      expect(res.markdown).toContain("Carelon Joint Surgery");
      // Primary markdown+json (30s) + lightweight markdown fallback (25s) + best-effort screenshot (15s, swallowed on failure)
      expect(scrapeSpy.mock.calls.length).toBeGreaterThanOrEqual(2);
      // First call requested markdown/json with 30s timeout (screenshots decoupled to avoid 500 base64 failures)
      expect(scrapeSpy.mock.calls[0][2]?.timeout).toBe(30000);
      // Fallback call requested lightweight markdown with 25s timeout
      expect(scrapeSpy.mock.calls[1][2]?.formats).toEqual(["markdown"]);
      expect(scrapeSpy.mock.calls[1][2]?.timeout).toBe(25000);
    });

    it("selectFirecrawlPolicyUrls: prioritizes active updated guideline (2026) over archived prior-year version (2024)", async () => {
      const payload = {
        data: {
          web: [
            {
              url: "https://guidelines.carelonmedicalbenefitsmanagement.com/spine-surgery-2024-10-20/",
              title: "ARCHIVED Spine Surgery 2024-10-20 to 2025-11-14 | Carelon Clinical Guidelines and Pathways",
              description: "Archived historical clinical appropriateness guidelines for spine surgery.",
            },
            {
              url: "https://guidelines.carelonmedicalbenefitsmanagement.com/spine-surgery-2025-11-15-updated-2026-01-01",
              title: "Spine Surgery 2025-11-15 updated 2026-01-01 | Carelon Clinical Guidelines and Pathways",
              description: "Current active clinical appropriateness guidelines for spine surgery and lumbar decompression.",
            },
          ],
        },
      };

      const urls = actionPolicyCrawler.selectFirecrawlPolicyUrls(
        payload,
        ["63047", "spine", "surgery", "decompression", "medical policy"],
        0,
        2,
        "GeoBlue",
        "2026",
      );

      // Active updated 2026 guideline MUST be ranked first over the archived 2024 edition
      expect(urls[0]).toBe("https://guidelines.carelonmedicalbenefitsmanagement.com/spine-surgery-2025-11-15-updated-2026-01-01");
      expect(urls[1]).toBe("https://guidelines.carelonmedicalbenefitsmanagement.com/spine-surgery-2024-10-20/");
    });

    it("extractGuidelineLinksFromMarkdown: extracts matching clinical guideline PDFs and ranks active links ahead of archived links", () => {
      const directoryMarkdown = `# North American Spine Society Clinical Guidelines
Welcome to the NASS guidelines directory. Below are the published clinical practice guidelines:
- [Lumbar Spinal Stenosis Guidelines (PDF)](https://www.spine.org/Portals/0/assets/downloads/ResearchClinicalCare/Guidelines/LumbarStenosis.pdf)
- [Cervical Radiculopathy Guidelines](https://www.spine.org/Portals/0/assets/downloads/ResearchClinicalCare/Guidelines/CervicalRadiculopathy.pdf)
- [Archived Spine Surgery Guideline 2024](https://guidelines.carelonmedicalbenefitsmanagement.com/spine-surgery-2024-10-20/)
- [Current Spine Surgery Guideline updated 2026](https://guidelines.carelonmedicalbenefitsmanagement.com/spine-surgery-2025-11-15-updated-2026-01-01)
- [Unrelated Member Benefits Form](https://www.spine.org/benefits/form.pdf)
`;

      const links = actionPolicyCrawler.extractGuidelineLinksFromMarkdown(
        directoryMarkdown,
        "https://www.spine.org/Research/Clinical-Guidelines",
        ["63047"],
        "2026",
      );

      expect(links.length).toBeGreaterThanOrEqual(1);
      // Both PDF and current 2026 guideline rank ahead of the archived 2024 version
      expect(links).toContain("https://guidelines.carelonmedicalbenefitsmanagement.com/spine-surgery-2025-11-15-updated-2026-01-01");
      const activeIdx = links.indexOf("https://guidelines.carelonmedicalbenefitsmanagement.com/spine-surgery-2025-11-15-updated-2026-01-01");
      const archiveIdx = links.indexOf("https://guidelines.carelonmedicalbenefitsmanagement.com/spine-surgery-2024-10-20/");
      expect(activeIdx).toBeLessThan(archiveIdx);
    });

    it("crawlInsurerPolicy: executes single-hop native Firecrawl extraction without OpenAI LLM hop", async () => {
      vi.mocked(getAuthUserId).mockResolvedValue("user_123" as any);
      vi.spyOn(rateLimiter, "limit").mockResolvedValue({ ok: true } as any);
      process.env.FIRECRAWL_API_KEY = "fc-test-key";

      const openAiSpy = vi.spyOn(libOpenAI, "createStructuredCompletion").mockImplementation(async (params: any) => {
        if (params.schemaName === "PolicyRelevanceResponse") {
          return { relevant: true, rationale: "Authoritative clinical policy for lumbar decompression." } as any;
        }
        throw new Error(`Unexpected OpenAI extraction invocation for schema ${params.schemaName}`);
      });

      const substantiveMarkdown = "# Blue Cross Carelon Clinical Practice Guideline on Lumbar Decompression\n\n" +
        "Medical necessity and clinical coverage criteria for CPT 63047 (Lumbar Laminectomy):\n" +
        "Lumbar spinal decompression is considered medically necessary when the following clinical criteria are met:\n" +
        "1. Documented severe neurogenic claudication or radicular pain symptoms with severe functional impairment.\n" +
        "2. High-resolution diagnostic imaging (MRI or CT) corroborating neural canal compression matching clinical findings.\n" +
        "3. Documented failure of at least 6 to 12 weeks of structured conservative therapy including formal physical therapy and NSAIDs.\n" +
        "Contraindications include active local infection or uncontrolled systemic medical illness.\n" +
        "Prior authorization protocol requires submitted physician clinical notes and objective MRI radiology reports.\n" +
        "Effective Date: January 1, 2026. Revision History: Annual clinical policy bulletin review confirmed December 2025.\n" +
        "This citable coverage determination establishes binding clinical standards for all commercial health plan members.";

      const nativeFirecrawlJson = {
        policyTitle: "Carelon Clinical Appropriateness Guideline: Lumbar Spine Decompression",
        policyNumber: "CPB-63047-2026",
        effectiveDate: "2026-01-01",
        revisionHistory: "Reviewed December 2025",
        medicalNecessityCriteria: [
          "Severe neurogenic claudication with documented ambulatory impairment.",
          "MRI confirmation of neural compression correlating to radicular symptoms.",
          "Documented failure of 6 weeks structured conservative modalities.",
        ],
        contraindications: [
          "Active systemic infection or uncontrolled medical comorbidities.",
        ],
        priorAuthRequirements: [
          "Submission of diagnostic MRI reports and structured conservative therapy logs.",
        ],
        clauses: [
          {
            sourceType: "payer_cpb",
            title: "Carelon Lumbar Decompression Coverage Criteria",
            citationClause: "Section 2.1: Indications",
            extractedEvidenceMarkdown: "Lumbar decompression (63047) is medically indicated following failure of conservative therapy.",
            relevanceScore: 96,
          },
        ],
      };

      const mockCtx: any = {
        runQuery: vi.fn().mockResolvedValue({ _id: "c1", userId: "user_123" }),
        runAction: vi.fn().mockResolvedValue({
          markdown: substantiveMarkdown,
          sourceUrl: "https://guidelines.carelon.com/spine/lumbar-decompression.pdf",
          json: nativeFirecrawlJson,
        }),
        runMutation: vi.fn().mockResolvedValue(null),
      };

      const res = await (actionPolicyCrawler.crawlInsurerPolicy as any)._handler(mockCtx, {
        claimId: "c1",
        payer: "Blue Cross Blue Shield",
        cptCodes: ["63047"],
        icd10Codes: ["M51.16"],
        denialReasonCode: "CO-50",
        customPolicyUrl: "https://guidelines.carelon.com/spine/lumbar-decompression.pdf",
      });

      // Assert that OpenAI LLM PolicyExtractionResponse was NOT invoked due to native Firecrawl extraction
      expect(openAiSpy).toHaveBeenCalledTimes(1); // Only for PolicyRelevanceResponse
      expect(openAiSpy).toHaveBeenCalledWith(expect.objectContaining({ schemaName: "PolicyRelevanceResponse" }));
      expect(res.extractionEngine).toBe("firecrawl_native");
      expect(res.policyTitle).toContain("Carelon");
      expect(res.clausesExtracted).toBeGreaterThanOrEqual(2);
      expect(mockCtx.runMutation).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
        claimId: "c1",
        evidences: expect.any(Array),
      }));
    });

    it("crawlInsurerPolicy: falls back gracefully to OpenAI when Firecrawl json is absent", async () => {
      vi.mocked(getAuthUserId).mockResolvedValue("user_123" as any);
      vi.spyOn(rateLimiter, "limit").mockResolvedValue({ ok: true } as any);
      process.env.FIRECRAWL_API_KEY = "fc-test-key";

      const openAiSpy = vi.spyOn(libOpenAI, "createStructuredCompletion").mockImplementation(async (params: any) => {
        if (params.schemaName === "PolicyRelevanceResponse") {
          return { relevant: true, rationale: "Authoritative clinical policy." } as any;
        }
        if (params.schemaName === "PolicyExtractionResponse") {
          return {
            policyTitle: "Carelon Spine Surgery Guidelines",
            policyNumber: "CG-SURG-01",
            effectiveDate: "2026-01-01",
            clauses: [
              {
                sourceType: "payer_cpb",
                title: "Carelon Spine Guidelines",
                citationClause: "Section 3.A",
                extractedEvidenceMarkdown: "Clinical indications for 63047 decompression include persistent radicular pain.",
                relevanceScore: 93,
              },
            ],
          } as any;
        }
        throw new Error(`Unexpected schema ${params.schemaName}`);
      });

      const substantiveMarkdown = "# Carelon Spine Surgery Clinical Practice Guidelines\n\n" +
        "Medical necessity and coverage criteria for CPT 63047 (Lumbar Decompression):\n" +
        "Decompression is covered when radicular pain persists after 6 weeks of conservative therapy.\n" +
        "MRI documentation must demonstrate canal stenosis matching symptom distribution.\n" +
        "Patients must have documented functional limitations in activities of daily living.\n" +
        "Contraindications include active bacteremia or severe unstable systemic illness.\n" +
        "Clinical review confirms adherence to evidence-based medical necessity determinations across all plans.\n" +
        "This policy document establishes standard authorization thresholds for spinal decompression surgery.";

      const mockCtx: any = {
        runQuery: vi.fn().mockResolvedValue({ _id: "c1", userId: "user_123" }),
        runAction: vi.fn().mockResolvedValue({
          markdown: substantiveMarkdown,
          sourceUrl: "https://guidelines.carelon.com/spine.pdf",
          json: undefined,
        }),
        runMutation: vi.fn().mockResolvedValue(null),
      };

      const res = await (actionPolicyCrawler.crawlInsurerPolicy as any)._handler(mockCtx, {
        claimId: "c1",
        payer: "Blue Cross Blue Shield",
        cptCodes: ["63047"],
        icd10Codes: ["M51.16"],
        denialReasonCode: "CO-50",
        customPolicyUrl: "https://guidelines.carelon.com/spine.pdf",
      });

      // Assert that OpenAI LLM completion WAS invoked as fallback for PolicyExtractionResponse
      expect(openAiSpy).toHaveBeenCalledWith(expect.objectContaining({ schemaName: "PolicyExtractionResponse" }));
      expect(res.extractionEngine).toBe("openai_fallback");
      expect(res.policyTitle).toBe("Carelon Spine Surgery Guidelines");
      expect(res.clausesExtracted).toBeGreaterThanOrEqual(1);
    });

    it("parseNativeExtractionResponse: synthesizes discrete medical necessity and contraindications arrays", () => {
      const parsed = actionPolicyCrawler.parseNativeExtractionResponse({
        policyTitle: "Aetna Clinical Policy Bulletin 0123",
        policyNumber: "0123",
        effectiveDate: "2026-01-01",
        revisionHistory: "Reviewed 2025",
        medicalNecessityCriteria: [
          "Failure of comprehensive physical therapy for at least 12 weeks.",
          "Corroborating radiographic evidence demonstrating severe stenosis.",
        ],
        contraindications: [
          "Uncontrolled active infection at the surgical site.",
        ],
        priorAuthRequirements: [
          "Submission of prior authorization request form with operative notes.",
        ],
      }, ["63047"]);

      expect(parsed).not.toBeNull();
      expect(parsed?.policyTitle).toBe("Aetna Clinical Policy Bulletin 0123");
      expect(parsed?.clauses.length).toBe(4);
      expect(parsed?.clauses.some((c) => c.citationClause.includes("Medical Necessity"))).toBe(true);
      expect(parsed?.clauses.some((c) => c.citationClause.includes("Contraindications"))).toBe(true);
      expect(parsed?.clauses.some((c) => c.citationClause.includes("Prior Authorization"))).toBe(true);
    });

    it("extractPolicyWithFirecrawl: returns structured extraction and engine provenance", async () => {
      const substantiveMarkdown = "# Carelon Clinical Guideline: Lumbar Spine Surgery\n\n" +
        "Medical necessity criteria for lumbar spinal stenosis decompression procedures (CPT 63047).\n" +
        "Patients must have persistent pain and neurogenic claudication refractory to 6 weeks of conservative care.\n" +
        "Objective imaging must confirm spinal canal stenosis with nerve root impingement.\n" +
        "Contraindications include active local or systemic infection or severe coagulopathy.\n" +
        "Prior authorization protocol requires submitted operative notes and radiographic reports.\n" +
        "Annual review date confirms effective date January 2026 across commercial health plan members.";

      const mockCtx: any = {
        runAction: vi.fn().mockResolvedValue({
          markdown: substantiveMarkdown,
          sourceUrl: "https://guidelines.carelon.com/spine.pdf",
          json: {
            policyTitle: "Carelon Clinical Guideline: Lumbar Spine Surgery",
            medicalNecessityCriteria: [
              "Refractory neurogenic claudication after 6 weeks conservative therapy.",
            ],
            clauses: [
              {
                sourceType: "payer_cpb",
                title: "Carelon Lumbar Decompression",
                citationClause: "Section 2.1",
                extractedEvidenceMarkdown: "Decompression is indicated when conservative measures fail.",
                relevanceScore: 95,
              },
            ],
          },
        }),
      };

      const result = await actionPolicyCrawler.extractPolicyWithFirecrawl(mockCtx, "https://guidelines.carelon.com/spine.pdf", {
        payer: "Blue Cross Blue Shield",
        cptCodes: ["63047"],
        denialReasonCode: "CO-50",
      });

      expect(result.extractionEngine).toBe("firecrawl_native");
      expect(result.extractedData?.policyTitle).toBe("Carelon Clinical Guideline: Lumbar Spine Surgery");
      expect(result.extractedData?.clauses.length).toBeGreaterThanOrEqual(1);
    });

    it("getCptKeywords: expands 63047 with decompression/stenosis synonyms (no template hardcode)", () => {
      const keywords = actionPolicyCrawler.getCptKeywords(["63047"]);
      expect(keywords).toContain("63047");
      expect(keywords).toContain("decompression");
      expect(keywords).toContain("stenosis");
      expect(keywords).toContain("foraminotomy");
      expect(keywords).toContain("laminectomy");
    });

    it("isPolicyAlignedWithClaim: accepts generic-title stenosis/decompression doc for 63047 (conflict-only veto)", () => {
      const markdown =
        "# Recommendations\n\nLumbar spinal stenosis with neurogenic claudication. " +
        "Decompression is indicated after failure of conservative therapy with MRI-confirmed canal stenosis.";
      const aligned = actionPolicyCrawler.isPolicyAlignedWithClaim(markdown, "Recommendations", ["63047"]);
      expect(aligned.aligned).toBe(true);
    });

    it("isPolicyAlignedWithClaim: still rejects foot/bunion guide for lumbar 63047 claim", () => {
      const markdown =
        "# Bunionectomy Coding Guide\n\nFoot bunion correction with hallux valgus osteotomy and ankle fixation.";
      const result = actionPolicyCrawler.isPolicyAlignedWithClaim(markdown, "Bunionectomy Guide", ["63047"]);
      expect(result.aligned).toBe(false);
    });

    it("selectFirecrawlPolicyUrls: demotes wrong-procedure CPT pages and coding guides generically", () => {
      const payload = {
        data: {
          web: [
            {
              url: "https://example-clinic.com/procedure-codes/cpt-code-22633/",
              title: "CPT 22633 Lumbar Fusion Billing Guide",
              description: "Procedure codes, billing and coding guide with reimbursement rates for 22633.",
            },
            {
              url: "https://guidelines.carelonmedicalbenefitsmanagement.com/spine-surgery-lumbar-decompression.pdf",
              title: "Carelon Spine Surgery Lumbar Decompression Guideline",
              description: "Clinical coverage policy and medical necessity criteria for CPT 63047 lumbar laminectomy.",
            },
          ],
        },
      };
      const topOnly = actionPolicyCrawler.selectFirecrawlPolicyUrls(
        payload,
        ["63047", "lumbar", "spine", "decompression", "medical policy"],
        0,
        1,
        "GeoBlue",
        "2026",
      );
      // With only one slot, the clinically specific 63047 PDF must win over the wrong-procedure coding guide.
      expect(topOnly).toEqual([
        "https://guidelines.carelonmedicalbenefitsmanagement.com/spine-surgery-lumbar-decompression.pdf",
      ]);
      const both = actionPolicyCrawler.selectFirecrawlPolicyUrls(
        payload,
        ["63047", "lumbar", "spine", "decompression", "medical policy"],
        0,
        2,
        "GeoBlue",
        "2026",
      );
      // When both are returned, the correct guideline ranks first (wrong-procedure guide demoted last).
      expect(both[0]).toContain("spine-surgery-lumbar-decompression.pdf");
    });

    it("isVintageOnlyRejection: qualifies archived specialty guideline but not billing/landing rejections", () => {
      expect(
        actionPolicyCrawler.isVintageOnlyRejection(
          "NASS lumbar stenosis guideline is significantly outdated (2013) and likely superseded for 2026 DOS.",
        ),
      ).toBe(true);
      expect(
        actionPolicyCrawler.isVintageOnlyRejection(
          "Document is an archived/superseded policy from prior years (expired before Date of Service 07/04/2026).",
        ),
      ).toBe(true);
      expect(
        actionPolicyCrawler.isVintageOnlyRejection(
          "Commercial billing and coding guide produced by a device manufacturer, not a clinical coverage policy.",
        ),
      ).toBe(false);
      expect(
        actionPolicyCrawler.isVintageOnlyRejection(
          "Document provided is a directory or landing page, not an authoritative guideline itself.",
        ),
      ).toBe(false);
    });

    it("storeScreenshotInStorage: rejects malformed base64 error text without throwing", async () => {
      const mockCtx: any = { storage: { store: vi.fn() } };
      expect(await actionPolicyCrawler.storeScreenshotInStorage(mockCtx, "500 decode markdown base64 image data failed")).toBeUndefined();
      expect(await actionPolicyCrawler.storeScreenshotInStorage(mockCtx, "not-base64!!!")).toBeUndefined();
      expect(mockCtx.storage.store).not.toHaveBeenCalled();
    });

    it("extractCitedPolicyIdentifiers: pulls CPB numbers and policy tokens from denial text (generic, no template hardcode)", () => {
      const aetna = actionPolicyCrawler.extractCitedPolicyIdentifiers(
        "Aetna Clinical Policy Bulletin (CPB) 0171 (Magnetic Resonance Imaging of the Extremities) requires documented weight-bearing plain radiographs."
      );
      expect(aetna.cpbNumbers).toContain("0171");

      const cigna = actionPolicyCrawler.extractCitedPolicyIdentifiers(
        "Under Cigna Medical Coverage Policy 0066 (Knee Arthroscopy and Open Procedures), arthroscopic partial meniscectomy requires documented mechanical symptoms."
      );
      expect(cigna.policyTokens.some((t) => t.includes("0066"))).toBe(true);

      const geoblue = actionPolicyCrawler.extractCitedPolicyIdentifiers(
        "Under Carelon Musculoskeletal Clinical Appropriateness Guidelines for Spine Surgery / Policy SURG.00011, non-emergent surgery requires authorization."
      );
      expect(geoblue.policyTokens.some((t) => t.toUpperCase().includes("SURG"))).toBe(true);

      const empty = actionPolicyCrawler.extractCitedPolicyIdentifiers("Medical necessity not established.");
      expect(empty.cpbNumbers).toEqual([]);
    });

    it("buildAetnaCpbCanonicalUrl: resolves stable public pattern mathematically for any CPB number", () => {
      expect(actionPolicyCrawler.buildAetnaCpbCanonicalUrl("0171")).toBe(
        "https://www.aetna.com/cpb/medical/data/100_199/0171.html"
      );
      expect(actionPolicyCrawler.buildAetnaCpbCanonicalUrl("0736")).toBe(
        "https://www.aetna.com/cpb/medical/data/700_799/0736.html"
      );
      expect(actionPolicyCrawler.buildAetnaCpbCanonicalUrl("0093")).toBe(
        "https://www.aetna.com/cpb/medical/data/1_99/0093.html"
      );
      expect(actionPolicyCrawler.buildAetnaCpbCanonicalUrl("not-a-number")).toBeNull();
    });

    it("buildCitedAetnaCpbUrls: gates canonical resolution on Aetna payers only", () => {
      expect(
        actionPolicyCrawler.buildCitedAetnaCpbUrls("Aetna International", ["0171"])
      ).toEqual(["https://www.aetna.com/cpb/medical/data/100_199/0171.html"]);
      expect(actionPolicyCrawler.buildCitedAetnaCpbUrls("Cigna Global", ["0171"])).toEqual([]);
      expect(actionPolicyCrawler.buildCitedAetnaCpbUrls("Aetna", [])).toEqual([]);
    });

    it("buildCitedPolicySearchQueries: generates exact-ID queries from denial citations without hardcoding procedures", () => {
      const queries = actionPolicyCrawler.buildCitedPolicySearchQueries(
        "Aetna International",
        ["0171"],
        [],
        ["73721"]
      );
      expect(queries.length).toBeGreaterThan(0);
      expect(queries.some((q) => q.includes("0171"))).toBe(true);
      expect(queries.some((q) => q.includes("73721"))).toBe(true);
    });

    it("crawlInsurerPolicy: resolves cited Aetna CPB 0171 directly when search ranks related bulletins first (73721 knee MRI)", async () => {
      vi.mocked(getAuthUserId).mockResolvedValue("user_123" as any);
      vi.spyOn(rateLimiter, "limit").mockResolvedValue({ ok: true } as any);
      process.env.FIRECRAWL_API_KEY = "fc-test-key";

      const { FirecrawlClient } = await import("@firecrawl/firecrawl-convex");
      const searchSpy = vi.spyOn(FirecrawlClient.prototype, "search").mockResolvedValue({
        data: {
          web: [
            {
              url: "https://www.aetna.com/cpb/medical/data/700_799/0736.html",
              title: "Aetna CPB 0736 Hip Preservation Surgery",
              description: "Hip arthroscopy criteria.",
            },
            {
              url: "https://www.aetna.com/cpb/medical/data/1_99/0093.html",
              title: "Aetna CPB 0093 Open Air Low Field MRI",
              description: "Open and positional MRI units.",
            },
            {
              url: "https://www.jacr.org/article/S1546-1440(26)00233-4/abstract",
              title: "JACR abstract",
              description: "Imaging abstract.",
            },
          ],
        },
      } as any);

      const kneeMriMarkdown =
        "# Aetna Clinical Policy Bulletin 0171: Magnetic Resonance Imaging (MRI) of the Extremities\n\n" +
        "Medical necessity and coverage criteria: MRI of the knee (CPT 73721) is considered medically necessary " +
        "when weight-bearing plain radiographs performed within the preceding 6 months fail to explain persistent " +
        "joint line pain, clicking, or giving way, and conservative therapy including NSAIDs and activity modification " +
        "has failed. Clinical policy establishes coverage criteria for knee MRI with meniscus derangement (M23.22). " +
        "Contraindications include absence of prior radiographs. Prior authorization requires submitted radiograph reports.";
      const hipMarkdown =
        "# Aetna CPB 0736 Hip Preservation Surgery\n\nMedical necessity and coverage criteria for hip arthroscopy " +
        "and hip preservation surgery with femoroacetabular impingement. Clinical policy coverage criteria for hip procedures.";
      const hardwareMarkdown =
        "# Aetna CPB 0093 Open Air Low Field MRI\n\nMedical necessity coverage criteria for open air and positional " +
        "MRI units and low field strength systems. Clinical policy for imaging hardware.";

      const scrapeSpy = vi.spyOn(FirecrawlClient.prototype, "scrape").mockImplementation(
        async (_ctx: any, targetUrl: string, options: any) => {
          const formats = JSON.stringify(options?.formats || []);
          if (formats.includes("screenshot")) {
            return { screenshot: undefined, metadata: { statusCode: 200 } } as any;
          }
          if (typeof targetUrl === "string" && targetUrl.includes("0171")) {
            return { markdown: kneeMriMarkdown, metadata: { statusCode: 200 } } as any;
          }
          if (typeof targetUrl === "string" && targetUrl.includes("0736")) {
            return { markdown: hipMarkdown, metadata: { statusCode: 200 } } as any;
          }
          if (typeof targetUrl === "string" && targetUrl.includes("0093")) {
            return { markdown: hardwareMarkdown, metadata: { statusCode: 200 } } as any;
          }
          return { markdown: "", metadata: { statusCode: 404 } } as any;
        }
      );

      vi.spyOn(libOpenAI, "createStructuredCompletion").mockImplementation(async (params: any) => {
        if (params.schemaName === "PolicySearchIntentResponse") {
          return { queries: ["Aetna knee MRI coverage criteria", "knee MRI ACR guideline", "knee MRI CMS LCD"] } as any;
        }
        if (params.schemaName === "PolicyRelevanceResponse") {
          const prompt: string = params.userPrompt || "";
          if (prompt.includes("0171") || prompt.includes("MRI of the Extremities")) {
            return { relevant: true, rationale: "Exact cited Aetna CPB 0171 for knee MRI." } as any;
          }
          return { relevant: false, rationale: "Document addresses a different anatomy or hardware topic." } as any;
        }
        if (params.schemaName === "PolicyExtractionResponse") {
          return {
            policyTitle: "Aetna Clinical Policy Bulletin 0171: Magnetic Resonance Imaging (MRI) of the Extremities",
            policyNumber: "0171",
            effectiveDate: "2026-01-01",
            clauses: [
              {
                sourceType: "payer_cpb",
                title: "Aetna CPB 0171 Knee MRI Criteria",
                citationClause: "Section 1.A",
                extractedEvidenceMarkdown: "Knee MRI is covered after weight-bearing radiographs within 6 months.",
                relevanceScore: 95,
              },
            ],
          } as any;
        }
        throw new Error(`Unexpected schema ${params.schemaName}`);
      });

      const mockClaim = {
        _id: "c1",
        userId: "user_123",
        serviceDate: "07/18/2026",
        denialReasonDescription:
          "Aetna Clinical Policy Bulletin (CPB) 0171 (Magnetic Resonance Imaging of the Extremities) requires documented weight-bearing plain radiographs.",
      };
      const mockCtx: any = {
        runQuery: vi.fn().mockResolvedValue(mockClaim),
        runMutation: vi.fn().mockResolvedValue(null),
        storage: { store: vi.fn() },
      };

      const res = await (actionPolicyCrawler.crawlInsurerPolicy as any)._handler(mockCtx, {
        claimId: "c1",
        payer: "Aetna International",
        cptCodes: ["73721"],
        icd10Codes: ["M23.22"],
        denialReasonCode: "CO-16",
        denialReasonDescription:
          "Aetna Clinical Policy Bulletin (CPB) 0171 (Magnetic Resonance Imaging of the Extremities) requires documented weight-bearing plain radiographs within the preceding 6 months.",
        serviceDate: "07/18/2026",
      });

      expect(res.policyTitle).toContain("0171");
      expect(res.clausesExtracted).toBeGreaterThanOrEqual(1);
      // Direct canonical cited-policy scrape must have been attempted
      expect(scrapeSpy.mock.calls.some((c) => String(c[1]).includes("0171"))).toBe(true);

      searchSpy.mockRestore();
      scrapeSpy.mockRestore();
    });

    it("crawlInsurerPolicy: scrapes ranked candidates with bounded concurrency and selects highest-ranked relevant doc", async () => {
      vi.mocked(getAuthUserId).mockResolvedValue("user_123" as any);
      vi.spyOn(rateLimiter, "limit").mockResolvedValue({ ok: true } as any);
      process.env.FIRECRAWL_API_KEY = "fc-test-key";

      const { FirecrawlClient } = await import("@firecrawl/firecrawl-convex");
      // No cited policy IDs in this denial: exercises the search-round batch path.
      const searchSpy = vi.spyOn(FirecrawlClient.prototype, "search").mockResolvedValue({
        data: {
          web: [
            {
              url: "https://example-clinic.com/bunionectomy-coding-guide/",
              title: "Bunionectomy Coding Guide",
              description: "Foot bunion correction billing guide.",
            },
            {
              url: "https://guidelines.carelonmedicalbenefitsmanagement.com/spine-surgery-lumbar-decompression.pdf",
              title: "Carelon Spine Surgery Lumbar Decompression Guideline",
              description: "Clinical coverage policy and medical necessity criteria for CPT 63047 lumbar laminectomy.",
            },
          ],
        },
      } as any);

      const bunionMarkdown =
        "# Bunionectomy Coding Guide\n\nFoot bunion correction with hallux valgus osteotomy and ankle fixation. " +
        "Medical necessity and coverage criteria for foot bunion procedures: bunionectomy is considered medically necessary " +
        "for painful hallux valgus deformity refractory to conservative shoe modification and orthotics. Clinical policy " +
        "coverage criteria include documented radiographic angles, failed orthotic management, and functional impairment " +
        "in ambulation. This coding guide establishes billing and reimbursement documentation standards for foot and ankle " +
        "surgical procedures across commercial health plans with prior authorization requirements.";
      const lumbarMarkdown =
        "# Carelon Spine Surgery Lumbar Decompression Guideline\n\nMedical necessity and coverage criteria " +
        "for CPT 63047 lumbar laminectomy decompression with documented neurogenic claudication, MRI-confirmed " +
        "canal stenosis matching radicular symptoms, and failure of at least 6 weeks of structured conservative therapy " +
        "including formal physical therapy and NSAIDs. Clinical policy establishes coverage criteria for spinal decompression " +
        "when objective neurological deficits and imaging compression correlate. Contraindications include active infection. " +
        "Prior authorization requires submitted MRI reports and conservative therapy logs.";
      let concurrentScrapes = 0;
      let maxConcurrentScrapes = 0;
      const scrapeSpy = vi.spyOn(FirecrawlClient.prototype, "scrape").mockImplementation(
        async (_ctx: any, targetUrl: string, options: any) => {
          const formats = JSON.stringify(options?.formats || []);
          if (formats.includes("screenshot")) {
            return { screenshot: undefined, metadata: { statusCode: 200 } } as any;
          }
          concurrentScrapes += 1;
          maxConcurrentScrapes = Math.max(maxConcurrentScrapes, concurrentScrapes);
          await new Promise((resolve) => setTimeout(resolve, 10));
          concurrentScrapes -= 1;
          if (typeof targetUrl === "string" && targetUrl.includes("lumbar-decompression")) {
            return { markdown: lumbarMarkdown, metadata: { statusCode: 200 } } as any;
          }
          return { markdown: bunionMarkdown, metadata: { statusCode: 200 } } as any;
        }
      );

      vi.spyOn(libOpenAI, "createStructuredCompletion").mockImplementation(async (params: any) => {
        if (params.schemaName === "PolicySearchIntentResponse") {
          return { queries: ["lumbar laminectomy decompression coverage criteria"] } as any;
        }
        if (params.schemaName === "PolicyRelevanceResponse") {
          const prompt: string = params.userPrompt || "";
          if (prompt.includes("lumbar-decompression") || prompt.includes("Lumbar Decompression Guideline")) {
            return { relevant: true, rationale: "Authoritative lumbar decompression guideline." } as any;
          }
          return { relevant: false, rationale: "Document appears to address foot/ankle pathology without lumbar criteria." } as any;
        }
        if (params.schemaName === "PolicyExtractionResponse") {
          return {
            policyTitle: "Carelon Spine Surgery Lumbar Decompression Guideline",
            policyNumber: "CG-SURG-01",
            effectiveDate: "2026-01-01",
            clauses: [
              {
                sourceType: "payer_cpb",
                title: "Carelon Lumbar Decompression Criteria",
                citationClause: "Section 2.1",
                extractedEvidenceMarkdown: "Decompression is indicated after 6 weeks failed conservative care.",
                relevanceScore: 95,
              },
            ],
          } as any;
        }
        throw new Error(`Unexpected schema ${params.schemaName}`);
      });

      const mockCtx: any = {
        runQuery: vi.fn().mockResolvedValue({
          _id: "c1",
          userId: "user_123",
          serviceDate: "07/04/2026",
          denialReasonDescription: "Medical necessity criteria not satisfied.",
        }),
        runMutation: vi.fn().mockResolvedValue(null),
        storage: { store: vi.fn() },
      };

      const res = await (actionPolicyCrawler.crawlInsurerPolicy as any)._handler(mockCtx, {
        claimId: "c1",
        payer: "UnitedHealthcare",
        cptCodes: ["63047"],
        icd10Codes: ["M51.26"],
        denialReasonCode: "CO-50",
        denialReasonDescription: "Medical necessity criteria not satisfied.",
        serviceDate: "07/04/2026",
      });

      // Highest-ranked *relevant* doc wins even though the bunion guide ranked first
      expect(res.policyTitle).toContain("Lumbar Decompression");
      // Both candidates scraped concurrently within the 2-browser limit
      expect(maxConcurrentScrapes).toBeLessThanOrEqual(2);

      searchSpy.mockRestore();
      scrapeSpy.mockRestore();
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

    it("generateAppealBrief: surfaces a retryable error without persisting when structured output is unusable", async () => {
      vi.mocked(getAuthUserId).mockResolvedValue("user_123" as any);
      vi.spyOn(rateLimiter, "limit").mockResolvedValue({ ok: true } as any);
      vi.spyOn(libOpenAI, "createStructuredCompletion").mockRejectedValue(
        new Error("Failed to parse structured JSON response from model gpt-5.4-nano")
      );

      const mockClaim = {
        _id: "c-fallback",
        userId: "user_123",
        claimNumber: "CLM-FALLBACK-1",
        patient: { name: "Redacted Patient", insurancePayer: "Aetna", state: "CA" },
        cptCodes: ["27447"],
        icd10Codes: ["M17.11"],
        denialReasonCode: "CO-50",
        denialReasonDescription: "Medical necessity not established",
        deniedAmount: 12000,
      };

      let queryCount = 0;
      const mockCtx: any = {
        runQuery: vi.fn().mockImplementation(() => {
          queryCount += 1;
          return queryCount === 1 ? Promise.resolve(mockClaim) : Promise.resolve([]);
        }),
        runMutation: vi.fn().mockResolvedValue("appeal_fallback_123"),
      };

      await expect(
        (actionAppealSynthesizer.generateAppealBrief as any)._handler(mockCtx, {
          claimId: "c-fallback",
          appealLevel: "level_1_internal",
          vectorPrecedents: [],
        })
      ).rejects.toThrow("Please try again");

      expect(mockCtx.runMutation).not.toHaveBeenCalled();
    });
  });
});
