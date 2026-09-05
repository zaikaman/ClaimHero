import { describe, it, expect, vi, beforeEach } from "vitest";
import { storeScreenshotInStorage } from "../convex/actions/policyCrawler";
import * as clinicalEvidences from "../convex/clinicalEvidences";
import { buildDossierData, generatePlainTextDossier } from "../src/lib/dossierBuilder";
import { assembleProfessionalMemorandum } from "../convex/actions/appealSynthesizer";
import { Claim, AppealBriefSynthesisResult, ClinicalEvidence } from "../src/types";
// @ts-expect-error - getAuthUserId is provided via vitest mock
import { getAuthUserId } from "@convex-dev/auth/server";

vi.mock("@convex-dev/auth/server", () => ({
  getAuthUserId: vi.fn(),
}));

describe("Visual Proof & Audit Archive: Full-Page Screenshots & Policy Exhibits", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("storeScreenshotInStorage", () => {
    it("returns undefined for empty, non-string, or whitespace inputs", async () => {
      const mockCtx: any = { storage: { store: vi.fn() } };
      expect(await storeScreenshotInStorage(mockCtx, "")).toBeUndefined();
      expect(await storeScreenshotInStorage(mockCtx, "   ")).toBeUndefined();
      expect(await storeScreenshotInStorage(mockCtx, undefined as any)).toBeUndefined();
      expect(mockCtx.storage.store).not.toHaveBeenCalled();
    });

    it("converts data URI to Blob and stores in Convex storage", async () => {
      const mockStorageId = "storage_img_data_uri_123";
      const mockCtx: any = {
        storage: {
          store: vi.fn().mockResolvedValue(mockStorageId),
        },
      };

      // Simple 1x1 transparent PNG base64
      const base64Data = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
      const dataUri = `data:image/png;base64,${base64Data}`;

      const res = await storeScreenshotInStorage(mockCtx, dataUri);

      expect(res).toBe(mockStorageId);
      expect(mockCtx.storage.store).toHaveBeenCalledTimes(1);
      const storedBlob = mockCtx.storage.store.mock.calls[0][0];
      expect(storedBlob).toBeInstanceOf(Blob);
      expect(storedBlob.type).toBe("image/png");
    });

    it("fetches remote HTTP screenshot URL and stores Blob in Convex storage", async () => {
      const mockStorageId = "storage_img_http_456";
      const mockCtx: any = {
        storage: {
          store: vi.fn().mockResolvedValue(mockStorageId),
        },
      };

      const mockImageBlob = new Blob([new Uint8Array([1, 2, 3, 4])], { type: "image/jpeg" });
      const originalFetch = global.fetch;
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        blob: vi.fn().mockResolvedValue(mockImageBlob),
      }) as any;

      try {
        const res = await storeScreenshotInStorage(mockCtx, "https://api.firecrawl.dev/storage/v1/object/public/screenshot-full.jpg");
        expect(res).toBe(mockStorageId);
        expect(mockCtx.storage.store).toHaveBeenCalledWith(mockImageBlob);
      } finally {
        global.fetch = originalFetch;
      }
    });

    it("handles fetch failure gracefully without throwing", async () => {
      const mockCtx: any = {
        storage: {
          store: vi.fn(),
        },
      };

      const originalFetch = global.fetch;
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: "Not Found",
      }) as any;

      try {
        const res = await storeScreenshotInStorage(mockCtx, "https://api.firecrawl.dev/storage/v1/missing.png");
        expect(res).toBeUndefined();
        expect(mockCtx.storage.store).not.toHaveBeenCalled();
      } finally {
        global.fetch = originalFetch;
      }
    });
  });

  describe("convex/clinicalEvidences: signed URL resolution and storage cleanup", () => {
    it("listByClaim: resolves screenshotStorageId to signed screenshotUrl", async () => {
      vi.mocked(getAuthUserId).mockResolvedValue("user_123" as any);
      const mockClaim = { _id: "claim_1", userId: "user_123" };
      const rawEvs = [
        {
          _id: "ev1",
          claimId: "claim_1",
          sourceType: "payer_cpb",
          title: "Aetna CPB 0016",
          citationClause: "Section 2.A",
          extractedEvidenceMarkdown: "Conservative therapy criteria met.",
          relevanceScore: 96,
          screenshotStorageId: "storage_screenshot_999",
          screenshotUrl: undefined,
          capturedAt: 1710500000000,
        },
      ];

      const mockCtx: any = {
        db: {
          get: vi.fn().mockResolvedValue(mockClaim),
          query: vi.fn().mockReturnValue({
            withIndex: vi.fn().mockReturnValue({
              take: vi.fn().mockResolvedValue(rawEvs),
            }),
          }),
        },
        storage: {
          getUrl: vi.fn().mockResolvedValue("https://convex.site/storage/signed_screenshot_999.png"),
        },
      };

      const res = await (clinicalEvidences.listByClaim as any)._handler(mockCtx, { claimId: "claim_1" });
      expect(res.length).toBe(1);
      expect(res[0].screenshotStorageId).toBe("storage_screenshot_999");
      expect(res[0].screenshotUrl).toBe("https://convex.site/storage/signed_screenshot_999.png");
      expect(mockCtx.storage.getUrl).toHaveBeenCalledWith("storage_screenshot_999");
    });

    it("deleteEvidence: deletes screenshot from storage when screenshotStorageId is present", async () => {
      vi.mocked(getAuthUserId).mockResolvedValue("user_123" as any);
      const mockEvidence = {
        _id: "ev_to_delete",
        claimId: "claim_1",
        title: "Policy Clause",
        citationClause: "Section 1",
        screenshotStorageId: "storage_screenshot_del_123",
      };
      const mockClaim = { _id: "claim_1", userId: "user_123", evidenceCount: 5 };

      const mockCtx: any = {
        db: {
          get: vi.fn().mockImplementation((tableOrId, id) => {
            if (tableOrId === "ev_to_delete") return Promise.resolve(mockEvidence);
            if (tableOrId === "claim_1") return Promise.resolve(mockClaim);
            return Promise.resolve(null);
          }),
          delete: vi.fn().mockResolvedValue(undefined),
          patch: vi.fn().mockResolvedValue(undefined),
          insert: vi.fn().mockResolvedValue(undefined),
        },
        storage: {
          delete: vi.fn().mockResolvedValue(undefined),
        },
      };

      await (clinicalEvidences.deleteEvidence as any)._handler(mockCtx, { evidenceId: "ev_to_delete" });

      expect(mockCtx.storage.delete).toHaveBeenCalledWith("storage_screenshot_del_123");
      expect(mockCtx.db.delete).toHaveBeenCalledWith("ev_to_delete");
    });
  });

  describe("Court-Ready Dossier & Appeal Brief Integration", () => {
    const mockClaim: Claim = {
      _id: "claim-test-dossier",
      patientId: "pat-1",
      claimNumber: "CLM-ARCHIVE-882",
      serviceDate: "2024-04-10",
      providerName: "Dr. Robert Vance, MD",
      deniedAmount: 24500,
      patientOwedAmount: 24500,
      cptCodes: ["27447"],
      icd10Codes: ["M17.11"],
      denialReasonCode: "CO-50",
      denialReasonDescription: "Not deemed medically necessary",
      status: "ready_for_review",
      statutoryDeadline: 1718409600000,
      daysRemaining: 30,
      assignedAgentEmail: "advocate@claimhero.io",
      patient: {
        _id: "pat-1",
        name: "Arthur Dent",
        email: "arthur@example.com",
        memberId: "MBN-882104",
        insurancePayer: "UnitedHealthcare",
        state: "CA",
        createdAt: 1710000000000,
      },
      createdAt: 1710000000000,
      updatedAt: 1710000000000,
    };

    const mockEvidences: ClinicalEvidence[] = [
      {
        _id: "ev_cpb_1",
        claimId: "claim-test-dossier",
        sourceType: "payer_cpb",
        title: "UHC CPB 0016: Total Knee Arthroplasty Criteria",
        sourceUrl: "https://www.uhcprovider.com/policies/cpb0016.html",
        citationClause: "Section 3.A - Radiographic Criteria",
        extractedEvidenceMarkdown: "Joint space narrowing Grade IV satisfies primary medical necessity indication.",
        relevanceScore: 97,
        screenshotStorageId: "storage_cpb_visual_proof_1",
        screenshotUrl: "https://convex.site/storage/proof_cpb_0016.png",
        capturedAt: 1712707200000, // 2024-04-10
        createdAt: 1712707200000,
      },
    ];

    it("buildDossierData: maps screenshot fields to Exhibit B items", () => {
      const dossier = buildDossierData(mockClaim, null, mockEvidences, false);
      expect(dossier.exhibitB_PolicyBulletins.length).toBe(1);
      const cpbItem = dossier.exhibitB_PolicyBulletins[0];
      expect(cpbItem.screenshotStorageId).toBe("storage_cpb_visual_proof_1");
      expect(cpbItem.screenshotUrl).toBe("https://convex.site/storage/proof_cpb_0016.png");
      expect(cpbItem.capturedAt).toBe(1712707200000);
    });

    it("generatePlainTextDossier: outputs Visual Proof Archive exhibit metadata and URL", () => {
      const dossier = buildDossierData(mockClaim, null, mockEvidences, false);
      const plainText = generatePlainTextDossier(dossier);

      expect(plainText).toContain("Visual Proof Archive: Verified full-page capture recorded on");
      expect(plainText).toContain("Visual Proof Exhibit URL: https://convex.site/storage/proof_cpb_0016.png");
      expect(plainText).toContain("Visual Proof Archive Reference: Convex Storage Exhibit ID [storage_cpb_visual_proof_1]");
    });

    it("assembleProfessionalMemorandum: attaches Evidentiary Exhibits & Proof of Policy on Date of Service to appeal markdown", () => {
      const appealDraft: AppealBriefSynthesisResult = {
        executiveSummary: "Reconsideration of denied knee arthroplasty.",
        medicalNecessityArguments: "Substantiated clinical records demonstrate Grade IV osteophytes.",
        statutoryRightsNotice: "Pursuant to ERISA 29 C.F.R. § 2560.503-1, claimant has statutory rights to full and fair review.",
        policyCitations: [
          {
            source: "UHC CPB 0016",
            clause: "Section 3.A - Radiographic Criteria",
            quote: "Joint space narrowing Grade IV satisfies primary medical necessity indication.",
          },
        ],
        formalDemandForPayment: "We demand immediate reversal and payment of $24,500 within 30 days.",
        fullAppealMarkdown: "",
      };

      const briefMarkdown = assembleProfessionalMemorandum(
        mockClaim,
        "level_1_internal",
        appealDraft,
        mockEvidences,
        "Treating surgeon addendum confirms severe functional loss.",
        [],
        undefined,
        undefined
      );

      expect(briefMarkdown).toContain("## Evidentiary Exhibits & Proof of Policy on Date of Service");
      expect(briefMarkdown).toContain("Exhibit A: Proof of Policy on Date of Service — UHC CPB 0016: Total Knee Arthroplasty Criteria");
      expect(briefMarkdown).toContain("Verified full-page visual capture recorded on 2024-04-10");
      expect(briefMarkdown).toContain("Visual Proof Archive URL: https://convex.site/storage/proof_cpb_0016.png");
    });
  });
});
