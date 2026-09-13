import { describe, it, expect, vi, beforeEach } from "vitest";
import * as actionPolicyCrawler from "../convex/actions/policyCrawler";
import { rateLimiter } from "../convex/lib/rateLimiter";
// @ts-ignore getAuthUserId is injected by vi.mock("@convex-dev/auth/server")
import { getAuthUserId } from "@convex-dev/auth/server";

vi.mock("@convex-dev/auth/server", () => ({
  getAuthUserId: vi.fn(),
}));

describe("Firecrawl Map API: Insurer CPB Directory Discovery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.FIRECRAWL_API_KEY = "fc-test-key";
  });

  describe("Domain & Metadata Resolvers", () => {
    it("getPayerClinicalDirectoryDomain: resolves official payer clinical directory roots", () => {
      const { getPayerClinicalDirectoryDomain } = actionPolicyCrawler;

      expect(getPayerClinicalDirectoryDomain("Aetna Health Inc")).toBe("https://www.aetna.com/cpb");
      expect(getPayerClinicalDirectoryDomain("Aetna International")).toBe("https://www.aetna.com/cpb");
      expect(getPayerClinicalDirectoryDomain("Cigna Global")).toBe("https://www.cigna.com/coveragePolicies");
      expect(getPayerClinicalDirectoryDomain("Cigna Health and Life")).toBe("https://www.cigna.com/coveragePolicies");
      expect(getPayerClinicalDirectoryDomain("UnitedHealthcare")).toBe(
        "https://www.uhcprovider.com/en/policies-protocols/commercial-policies.html"
      );
      expect(getPayerClinicalDirectoryDomain("Humana Commercial")).toBe(
        "https://www.humana.com/provider/medical-resources/clinical-guidance/medical-policies"
      );
      expect(getPayerClinicalDirectoryDomain("Anthem Blue Cross")).toBe(
        "https://www.anthem.com/provider/policies"
      );
      expect(getPayerClinicalDirectoryDomain("Blue Cross Blue Shield")).toBe(
        "https://www.anthem.com/provider/policies"
      );
      expect(getPayerClinicalDirectoryDomain("Molina Healthcare")).toBe(
        "https://www.molinahealthcare.com/providers/common/medicaid/clinical-guidelines.aspx"
      );
      // Unknown fallback defaults to Aetna CPB benchmark
      expect(getPayerClinicalDirectoryDomain("Regional Payer X")).toBe("https://www.aetna.com/cpb");
    });

    it("extractBulletinIdentifier: extracts policy numbers from titles and URLs", () => {
      const { extractBulletinIdentifier } = actionPolicyCrawler;

      // From Title
      expect(extractBulletinIdentifier("https://aetna.com/page", "CPB 0736: Total Knee Arthroplasty")).toBe("0736");
      expect(extractBulletinIdentifier("https://aetna.com/page", "Aetna Policy #0512 - Spine Surgery")).toBe("0512");
      expect(extractBulletinIdentifier("https://aetna.com/page", "Clinical Bulletin 0093: Diagnostic Ultrasound")).toBe("0093");
      expect(extractBulletinIdentifier("https://cms.gov/lcd", "LCD L33394: Arthroscopy Guidelines")).toBe("L33394");

      // From URL
      expect(extractBulletinIdentifier("https://www.aetna.com/cpb/medical/data/700_799/0736.html")).toBe("0736");
      expect(extractBulletinIdentifier("https://www.cigna.com/coveragePolicies/0512.pdf")).toBe("0512");
      expect(extractBulletinIdentifier("https://payer.com/policies/cpb-0245.html")).toBe("0245");

      // Returns undefined when no identifier pattern is present
      expect(extractBulletinIdentifier("https://payer.com/about-us", "About Our Medical Team")).toBeUndefined();
    });

    it("deduceClaimSpecialty: accurately deduces specialty from CPT and diagnosis codes", () => {
      const { deduceClaimSpecialty } = actionPolicyCrawler;

      // Orthopedics
      expect(deduceClaimSpecialty(["27447"], ["M17.11"])).toBe("Orthopedics");
      expect(deduceClaimSpecialty(["29881"], ["M23.22"])).toBe("Orthopedics");

      // Spine & Orthopedics
      expect(deduceClaimSpecialty(["63047"], ["M54.5"])).toBe("Spine & Orthopedics");
      expect(deduceClaimSpecialty(["22633"], ["M51.26"])).toBe("Spine & Orthopedics");

      // Oncology
      expect(deduceClaimSpecialty(["96413"], ["C50.911"])).toBe("Oncology");
      expect(deduceClaimSpecialty(["J9271"], ["C34.90"])).toBe("Oncology");

      // Cardiology
      expect(deduceClaimSpecialty(["93458"], ["I25.10"])).toBe("Cardiology");
      expect(deduceClaimSpecialty(["33533"], ["I25.810"])).toBe("Cardiology");

      // Radiology
      expect(deduceClaimSpecialty(["73721"], ["M25.561"])).toBe("Radiology");

      // Fallback
      expect(deduceClaimSpecialty([], [])).toBe("Orthopedics");
    });
  });

  describe("discoverInsurerPolicyDirectory Action", () => {
    it("successfully maps domain using firecrawl.map and persists discovered bulletins", async () => {
      vi.mocked(getAuthUserId).mockResolvedValue("user_sentinel" as any);
      vi.spyOn(rateLimiter, "limit").mockResolvedValue({ ok: true } as any);

      const mockMapLinks = [
        {
          url: "https://www.aetna.com/cpb/medical/data/700_799/0736.html",
          title: "Aetna CPB 0736: Total Knee Arthroplasty",
          description: "Clinical policy criteria for unicompartmental and total knee reconstructive arthroplasty.",
        },
        {
          url: "https://www.aetna.com/cpb/medical/data/600_699/0638.html",
          title: "Aetna CPB 0638: Knee Arthroscopy and Meniscectomy",
          description: "Medical necessity criteria and conservative therapy prerequisites for knee arthroscopy.",
        },
        {
          url: "https://www.aetna.com/cpb/medical/data/200_299/0245.html",
          title: "Aetna CPB 0245: Viscosupplementation for Osteoarthritis",
          description: "Coverage indications for intra-articular hyaluronic acid injections of the knee.",
        },
      ];

      const mockCtx: any = {
        runQuery: vi.fn().mockResolvedValue({
          _id: "claim_ortho_1",
          userId: "user_sentinel",
          insurancePayer: "Aetna",
          cptCodes: ["27447"],
          icd10Codes: ["M17.11"],
        }),
        runAction: vi.fn().mockResolvedValue({
          links: mockMapLinks,
        }),
        runMutation: vi.fn().mockResolvedValue(["disc_1", "disc_2", "disc_3"]),
      };

      const result = await (actionPolicyCrawler.discoverInsurerPolicyDirectory as any)._handler(mockCtx, {
        claimId: "claim_ortho_1",
        payer: "Aetna",
        specialty: "Orthopedics",
        limit: 10,
        saveToEvidenceMatrix: true,
      });

      expect(result.success).toBe(true);
      expect(result.payer).toBe("Aetna");
      expect(result.specialty).toBe("Orthopedics");
      expect(result.domain).toBe("https://www.aetna.com/cpb");
      expect(result.totalDiscovered).toBe(3);
      expect(result.bulletins).toHaveLength(3);
      expect(result.bulletins[0].bulletinNumber).toBe("0736");
      expect(result.bulletins[1].bulletinNumber).toBe("0638");

      // Verified Convex persistence mutation call
      expect(mockCtx.runMutation).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          claimId: "claim_ortho_1",
          payer: "Aetna",
          specialty: "Orthopedics",
          domain: "https://www.aetna.com/cpb",
          policies: expect.arrayContaining([
            expect.objectContaining({
              url: "https://www.aetna.com/cpb/medical/data/700_799/0736.html",
              bulletinNumber: "0736",
            }),
          ]),
          saveToEvidenceMatrix: true,
        })
      );
    });

    it("handles string links returned from firecrawl.map and extracts identifiers", async () => {
      vi.mocked(getAuthUserId).mockResolvedValue("user_cigna" as any);
      vi.spyOn(rateLimiter, "limit").mockResolvedValue({ ok: true } as any);

      const stringLinks = [
        "https://www.cigna.com/coveragePolicies/0512.pdf",
        "https://www.cigna.com/coveragePolicies/lumbar-decompression-0640.html",
      ];

      const mockCtx: any = {
        runQuery: vi.fn().mockResolvedValue({
          _id: "claim_cigna_1",
          userId: "user_cigna",
          insurancePayer: "Cigna",
          cptCodes: ["63047"],
          icd10Codes: ["M54.5"],
        }),
        runAction: vi.fn().mockResolvedValue({
          links: stringLinks,
        }),
        runMutation: vi.fn().mockResolvedValue(["disc_c1", "disc_c2"]),
      };

      const result = await (actionPolicyCrawler.discoverInsurerPolicyDirectory as any)._handler(mockCtx, {
        claimId: "claim_cigna_1",
        payer: "Cigna",
        specialty: "Spine & Orthopedics",
      });

      expect(result.success).toBe(true);
      expect(result.totalDiscovered).toBe(2);
      expect(result.bulletins[0].bulletinNumber).toBe("0512");
      expect(result.bulletins[1].bulletinNumber).toBe("0640");
      expect(result.bulletins[0].title).toContain("Cigna CPB 0512");
    });

    it("filters out invalid, link-local, and non-acceptable URLs to prevent SSRF", async () => {
      vi.mocked(getAuthUserId).mockResolvedValue("user_sec" as any);
      vi.spyOn(rateLimiter, "limit").mockResolvedValue({ ok: true } as any);

      const mixedLinks = [
        { url: "http://169.254.169.254/latest/meta-data", title: "AWS Metadata" },
        { url: "http://127.0.0.1:8080/internal-admin", title: "Localhost Admin" },
        { url: "https://www.aetna.com/cpb/medical/data/100_199/0171.html", title: "Aetna CPB 0171: Hip Surgery" },
      ];

      const mockCtx: any = {
        runQuery: vi.fn().mockResolvedValue({
          _id: "claim_sec_1",
          userId: "user_sec",
          insurancePayer: "Aetna",
          cptCodes: ["27130"],
          icd10Codes: ["M16.11"],
        }),
        runAction: vi.fn().mockResolvedValue({
          links: mixedLinks,
        }),
        runMutation: vi.fn().mockResolvedValue(["disc_clean"]),
      };

      const result = await (actionPolicyCrawler.discoverInsurerPolicyDirectory as any)._handler(mockCtx, {
        claimId: "claim_sec_1",
      });

      expect(result.totalDiscovered).toBe(1);
      expect(result.bulletins[0].url).toBe("https://www.aetna.com/cpb/medical/data/100_199/0171.html");
      expect(result.bulletins[0].bulletinNumber).toBe("0171");
    });

    it("throws error when provided private/link-local customDomain", async () => {
      vi.mocked(getAuthUserId).mockResolvedValue("user_sec" as any);
      vi.spyOn(rateLimiter, "limit").mockResolvedValue({ ok: true } as any);

      const mockCtx: any = {
        runQuery: vi.fn().mockResolvedValue({
          _id: "claim_ssrf",
          userId: "user_sec",
          insurancePayer: "Aetna",
        }),
      };

      await expect(
        (actionPolicyCrawler.discoverInsurerPolicyDirectory as any)._handler(mockCtx, {
          claimId: "claim_ssrf",
          customDomain: "http://169.254.169.254/metadata",
        })
      ).rejects.toThrow("The custom clinical domain must be a valid HTTP or HTTPS web URL.");
    });

    it("enforces rate limits and throws informative error when exceeded", async () => {
      vi.mocked(getAuthUserId).mockResolvedValue("user_spam" as any);
      vi.spyOn(rateLimiter, "limit").mockResolvedValue({
        ok: false,
        retryAfter: 12000,
      } as any);

      const mockCtx: any = {
        runQuery: vi.fn().mockResolvedValue({
          _id: "claim_spam",
          userId: "user_spam",
          insurancePayer: "Aetna",
        }),
      };

      await expect(
        (actionPolicyCrawler.discoverInsurerPolicyDirectory as any)._handler(mockCtx, {
          claimId: "claim_spam",
        })
      ).rejects.toThrow("Rate limit reached for policy directory discovery. Please retry in 12 seconds.");
    });
  });
});
