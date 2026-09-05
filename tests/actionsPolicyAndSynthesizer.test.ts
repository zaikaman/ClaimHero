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
        new Error("Failed to parse structured JSON response from model gemini-3.1-flash-lite")
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
