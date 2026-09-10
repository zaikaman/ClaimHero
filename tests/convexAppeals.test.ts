import { describe, it, expect, vi, beforeEach } from "vitest";
import * as appeals from "../convex/appeals";
import { getAuthUserId } from "@convex-dev/auth/server";

vi.mock("@convex-dev/auth/server", () => ({
  getAuthUserId: vi.fn(),
}));

describe("Convex Appeals API & Escalation Engine", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getById & getByIdInternal", () => {
    it("getById: returns null when appeal is not found in db", async () => {
      const mockCtx: any = { db: { get: vi.fn().mockResolvedValue(null) } };
      const res = await (appeals.getById as any)._handler(mockCtx, { appealId: "appeal_1" });
      expect(res).toBeNull();
    });

    it("getById: returns null when unauthorized to view claim", async () => {
      vi.mocked(getAuthUserId).mockResolvedValue(null);
      const mockAppeal = { _id: "appeal_1", claimId: "claim_1" };
      const mockCtx: any = {
        db: {
          get: vi.fn().mockImplementation((id: string) => {
            if (id === "appeal_1") return Promise.resolve(mockAppeal);
            return Promise.resolve(null);
          }),
        },
      };
      const res = await (appeals.getById as any)._handler(mockCtx, { appealId: "appeal_1" });
      expect(res).toBeNull();
    });

    it("getById: returns appeal when authorized", async () => {
      vi.mocked(getAuthUserId).mockResolvedValue("user_123" as any);
      const mockAppeal = { _id: "appeal_1", claimId: "claim_1" };
      const mockClaim = { _id: "claim_1", userId: "user_123" };
      const mockCtx: any = {
        db: {
          get: vi.fn().mockImplementation((id: string) => {
            if (id === "appeal_1") return Promise.resolve(mockAppeal);
            if (id === "claim_1") return Promise.resolve(mockClaim);
            return Promise.resolve(null);
          }),
        },
      };
      const res = await (appeals.getById as any)._handler(mockCtx, { appealId: "appeal_1" });
      expect(res).toEqual(mockAppeal);
    });

    it("getByIdInternal: retrieves appeal directly without auth checks", async () => {
      const mockAppeal = { _id: "appeal_1", claimId: "claim_1" };
      const mockCtx: any = { db: { get: vi.fn().mockResolvedValue(mockAppeal) } };
      const res = await (appeals.getByIdInternal as any)._handler(mockCtx, { appealId: "appeal_1" });
      expect(res).toEqual(mockAppeal);
    });
  });

  const createMockQuery = (items: any[] = []) => {
    const sortedDesc = [...items].sort((a, b) => (b.version ?? 0) - (a.version ?? 0));
    return {
      withIndex: vi.fn().mockReturnValue({
        collect: vi.fn().mockResolvedValue(items),
        order: vi.fn().mockImplementation((dir: "asc" | "desc") => {
          const list = dir === "desc" ? sortedDesc : items;
          return {
            first: vi.fn().mockResolvedValue(list[0] || null),
            take: vi.fn().mockImplementation((n: number) => Promise.resolve(list.slice(0, n))),
            collect: vi.fn().mockResolvedValue(list),
          };
        }),
      }),
    };
  };

  describe("getLatestByClaim & getLatestByClaimInternal", () => {
    it("getLatestByClaim: returns null when unauthorized", async () => {
      vi.mocked(getAuthUserId).mockResolvedValue(null);
      const mockCtx: any = { db: { get: vi.fn().mockResolvedValue(null) } };
      const res = await (appeals.getLatestByClaim as any)._handler(mockCtx, { claimId: "claim_1" });
      expect(res).toBeNull();
    });

    it("getLatestByClaim: returns null when no appeals exist for claim", async () => {
      vi.mocked(getAuthUserId).mockResolvedValue("user_123" as any);
      const mockClaim = { _id: "claim_1", userId: "user_123" };
      const mockCtx: any = {
        db: {
          get: vi.fn().mockResolvedValue(mockClaim),
          query: vi.fn().mockReturnValue(createMockQuery([])),
        },
      };
      const res = await (appeals.getLatestByClaim as any)._handler(mockCtx, { claimId: "claim_1" });
      expect(res).toBeNull();
    });

    it("getLatestByClaim: returns highest version appeal", async () => {
      vi.mocked(getAuthUserId).mockResolvedValue("user_123" as any);
      const mockClaim = { _id: "claim_1", userId: "user_123" };
      const appealV1 = { _id: "a1", version: 1 };
      const appealV2 = { _id: "a2", version: 2 };
      const mockCtx: any = {
        db: {
          get: vi.fn().mockResolvedValue(mockClaim),
          query: vi.fn().mockReturnValue(createMockQuery([appealV1, appealV2])),
        },
      };
      const res = await (appeals.getLatestByClaim as any)._handler(mockCtx, { claimId: "claim_1" });
      expect(res).toEqual(appealV2);
    });

    it("getLatestByClaimInternal: returns null if list empty, else latest version", async () => {
      const mockCtxEmpty: any = {
        db: {
          query: vi.fn().mockReturnValue(createMockQuery([])),
        },
      };
      const resEmpty = await (appeals.getLatestByClaimInternal as any)._handler(mockCtxEmpty, { claimId: "claim_1" });
      expect(resEmpty).toBeNull();

      const appealV1 = { _id: "a1", version: 1 };
      const appealV3 = { _id: "a3", version: 3 };
      const mockCtx: any = {
        db: {
          query: vi.fn().mockReturnValue(createMockQuery([appealV1, appealV3])),
        },
      };
      const res = await (appeals.getLatestByClaimInternal as any)._handler(mockCtx, { claimId: "claim_1" });
      expect(res).toEqual(appealV3);
    });
  });

  describe("getByClaimAndLevel & listVersions", () => {
    it("getByClaimAndLevel: returns null when unauthorized or empty", async () => {
      vi.mocked(getAuthUserId).mockResolvedValue(null);
      const mockCtx: any = { db: { get: vi.fn().mockResolvedValue(null) } };
      const res = await (appeals.getByClaimAndLevel as any)._handler(mockCtx, { claimId: "c1", appealLevel: "level_1_internal" });
      expect(res).toBeNull();

      vi.mocked(getAuthUserId).mockResolvedValue("user_123" as any);
      const mockCtx2: any = {
        db: {
          get: vi.fn().mockResolvedValue({ _id: "c1", userId: "user_123" }),
          query: vi.fn().mockReturnValue(createMockQuery([])),
        },
      };
      const res2 = await (appeals.getByClaimAndLevel as any)._handler(mockCtx2, { claimId: "c1", appealLevel: "level_1_internal" });
      expect(res2).toBeNull();
    });

    it("getByClaimAndLevel: returns sorted version for specific level", async () => {
      vi.mocked(getAuthUserId).mockResolvedValue("user_123" as any);
      const a1 = { _id: "a1", version: 1, appealLevel: "level_1_internal" };
      const a2 = { _id: "a2", version: 2, appealLevel: "level_1_internal" };
      const mockCtx: any = {
        db: {
          get: vi.fn().mockResolvedValue({ _id: "c1", userId: "user_123" }),
          query: vi.fn().mockReturnValue(createMockQuery([a1, a2])),
        },
      };
      const res = await (appeals.getByClaimAndLevel as any)._handler(mockCtx, { claimId: "c1", appealLevel: "level_1_internal" });
      expect(res).toEqual(a2);
    });

    it("listVersions: returns empty array when unauthorized", async () => {
      vi.mocked(getAuthUserId).mockResolvedValue(null);
      const mockCtx: any = { db: { get: vi.fn().mockResolvedValue(null) } };
      const res = await (appeals.listVersions as any)._handler(mockCtx, { claimId: "c1" });
      expect(res).toEqual([]);
    });

    it("listVersions: returns all versions sorted descending", async () => {
      vi.mocked(getAuthUserId).mockResolvedValue("user_123" as any);
      const a1 = { _id: "a1", version: 1 };
      const a2 = { _id: "a2", version: 2 };
      const mockCtx: any = {
        db: {
          get: vi.fn().mockResolvedValue({ _id: "c1", userId: "user_123" }),
          query: vi.fn().mockReturnValue(createMockQuery([a1, a2])),
        },
      };
      const res = await (appeals.listVersions as any)._handler(mockCtx, { claimId: "c1" });
      expect(res).toEqual([a2, a1]);
    });
  });

  describe("createOrUpdateDraft & createOrUpdateDraftInternal", () => {
    it("returns null if claim is not found", async () => {
      vi.mocked(getAuthUserId).mockResolvedValue("user_123" as any);
      const mockCtx: any = {
        db: {
          get: vi.fn().mockResolvedValue(null),
        },
      };
      const res = await (appeals.createOrUpdateDraftInternal as any)._handler(mockCtx, {
        claimId: "claim_missing",
        appealLevel: "level_1_internal",
        executiveSummary: "Summary",
        medicalNecessityArguments: "Args",
        legalCitations: "Citations",
        fullAppealMarkdown: "Markdown",
      });
      expect(res).toBeNull();
    });

    it("inserts initial appeal v1 when no drafts exist", async () => {
      vi.mocked(getAuthUserId).mockResolvedValue("user_123" as any);
      const mockClaim = { _id: "claim_1", userId: "user_123" };
      const mockCtx: any = {
        db: {
          get: vi.fn().mockResolvedValue(mockClaim),
          query: vi.fn().mockReturnValue(createMockQuery([])),
          insert: vi.fn().mockResolvedValue("appeal_new_1"),
          patch: vi.fn().mockResolvedValue(undefined),
        },
      };

      const appealId = await (appeals.createOrUpdateDraft as any)._handler(mockCtx, {
        claimId: "claim_1",
        appealLevel: "level_1_internal",
        executiveSummary: "Summary",
        medicalNecessityArguments: "Args",
        legalCitations: "Citations",
        fullAppealMarkdown: "Markdown",
      });

      expect(appealId).toBe("appeal_new_1");
      expect(mockCtx.db.insert).toHaveBeenCalledWith("appeals", expect.objectContaining({ version: 1, appealLevel: "level_1_internal" }));
      expect(mockCtx.db.patch).toHaveBeenCalledWith("claim_1", expect.objectContaining({ status: "ready_for_review" }));
    });

    it("patches existing draft when updating same tier", async () => {
      vi.mocked(getAuthUserId).mockResolvedValue("user_123" as any);
      const mockClaim = { _id: "claim_1", userId: "user_123" };
      const existingAppeal = { _id: "appeal_1", version: 1, appealLevel: "level_1_internal" };
      const mockCtx: any = {
        db: {
          get: vi.fn().mockResolvedValue(mockClaim),
          query: vi.fn().mockReturnValue(createMockQuery([existingAppeal])),
          patch: vi.fn().mockResolvedValue(undefined),
          insert: vi.fn().mockResolvedValue("log_1"),
        },
      };

      const appealId = await (appeals.createOrUpdateDraftInternal as any)._handler(mockCtx, {
        claimId: "claim_1",
        appealLevel: "level_1_internal",
        executiveSummary: "Updated Summary",
        medicalNecessityArguments: "Updated Args",
        legalCitations: "Updated Citations",
        fullAppealMarkdown: "Updated Markdown",
        lastEditedBy: "Editor Jane",
      });

      expect(appealId).toBe("appeal_1");
      expect(mockCtx.db.patch).toHaveBeenCalledWith("appeal_1", expect.objectContaining({ executiveSummary: "Updated Summary" }));
    });

    it("inserts new version when upgrading to a different tier or forceNewRevision is true", async () => {
      vi.mocked(getAuthUserId).mockResolvedValue("user_123" as any);
      const mockClaim = { _id: "claim_1", userId: "user_123" };
      const existingAppeal = { _id: "appeal_1", version: 1, appealLevel: "level_1_internal" };
      const mockCtx: any = {
        db: {
          get: vi.fn().mockResolvedValue(mockClaim),
          query: vi.fn().mockReturnValue(createMockQuery([existingAppeal])),
          insert: vi.fn().mockResolvedValue("appeal_v2"),
          patch: vi.fn().mockResolvedValue(undefined),
        },
      };

      const appealId = await (appeals.createOrUpdateDraft as any)._handler(mockCtx, {
        claimId: "claim_1",
        appealLevel: "level_2_grievance",
        executiveSummary: "Grievance Summary",
        medicalNecessityArguments: "Grievance Args",
        legalCitations: "Grievance Citations",
        fullAppealMarkdown: "Grievance Markdown",
        forceNewRevision: true,
      });

      expect(appealId).toBe("appeal_v2");
      expect(mockCtx.db.insert).toHaveBeenCalledWith("appeals", expect.objectContaining({ version: 2, appealLevel: "level_2_grievance" }));
    });
  });

  describe("escalateTier, saveDraft & updatePdfStorageId", () => {
    it("escalateTier: updates claim status to escalated and logs audit", async () => {
      vi.mocked(getAuthUserId).mockResolvedValue("user_123" as any);
      const mockClaim = { _id: "claim_1", userId: "user_123" };
      const mockCtx: any = {
        db: {
          get: vi.fn().mockResolvedValue(mockClaim),
          patch: vi.fn().mockResolvedValue(undefined),
          insert: vi.fn().mockResolvedValue("log_esc"),
        },
      };

      const result = await (appeals.escalateTier as any)._handler(mockCtx, {
        claimId: "claim_1",
        targetLevel: "level_3_external_state_review",
        escalationReason: "Exhausted internal level 2 appeal",
      });

      expect(result.success).toBe(true);
      expect(result.targetLevel).toBe("level_3_external_state_review");
      expect(mockCtx.db.patch).toHaveBeenCalledWith("claim_1", expect.objectContaining({ status: "escalated" }));
      expect(mockCtx.db.insert).toHaveBeenCalledWith("appealAuditLogs", expect.objectContaining({
        eventType: "statutory_tier_escalated",
        details: expect.stringContaining("Exhausted internal level 2 appeal"),
      }));
    });

    it("saveDraft: throws if appeal not found, else patches markdown", async () => {
      vi.mocked(getAuthUserId).mockResolvedValue("user_123" as any);
      const mockCtxNotFound: any = { db: { get: vi.fn().mockResolvedValue(null) } };
      await expect((appeals.saveDraft as any)._handler(mockCtxNotFound, {
        appealId: "appeal_999",
        fullAppealMarkdown: "New content",
      })).rejects.toThrow("Appeal appeal_999 not found");

      const mockAppeal = { _id: "appeal_1", claimId: "claim_1" };
      const mockClaim = { _id: "claim_1", userId: "user_123" };
      const mockCtx: any = {
        db: {
          get: vi.fn().mockImplementation((id) => (id === "appeal_1" ? Promise.resolve(mockAppeal) : Promise.resolve(mockClaim))),
          patch: vi.fn().mockResolvedValue(undefined),
        },
      };

      const res = await (appeals.saveDraft as any)._handler(mockCtx, {
        appealId: "appeal_1",
        fullAppealMarkdown: "Updated draft markdown",
      });
      expect(res).toBeNull();
      expect(mockCtx.db.patch).toHaveBeenCalledWith("appeal_1", expect.objectContaining({ fullAppealMarkdown: "Updated draft markdown" }));
    });

    it("updatePdfStorageId: throws if appeal not found, else patches pdf storage ID", async () => {
      vi.mocked(getAuthUserId).mockResolvedValue("user_123" as any);
      const mockCtxNotFound: any = { db: { get: vi.fn().mockResolvedValue(null) } };
      await expect((appeals.updatePdfStorageId as any)._handler(mockCtxNotFound, {
        appealId: "appeal_999",
        pdfExportStorageId: "storage_pdf_1",
      })).rejects.toThrow("Appeal appeal_999 not found");

      const mockAppeal = { _id: "appeal_1", claimId: "claim_1" };
      const mockClaim = { _id: "claim_1", userId: "user_123" };
      const mockCtx: any = {
        db: {
          get: vi.fn().mockImplementation((id) => (id === "appeal_1" ? Promise.resolve(mockAppeal) : Promise.resolve(mockClaim))),
          patch: vi.fn().mockResolvedValue(undefined),
        },
      };

      await (appeals.updatePdfStorageId as any)._handler(mockCtx, {
        appealId: "appeal_1",
        pdfExportStorageId: "storage_pdf_1",
      });
      expect(mockCtx.db.patch).toHaveBeenCalledWith("appeal_1", expect.objectContaining({ pdfExportStorageId: "storage_pdf_1" }));
    });

    it("getByLevel: returns appeal for level when authorized", async () => {
      vi.mocked(getAuthUserId).mockResolvedValue("user_123" as any);
      const mockAppeal = { _id: "appeal_1", claimId: "claim_1", appealLevel: "level_1_internal", version: 1 };
      const mockClaim = { _id: "claim_1", userId: "user_123" };
      const mockCtx: any = {
        db: {
          get: vi.fn().mockImplementation((id) => (id === "claim_1" ? Promise.resolve(mockClaim) : Promise.resolve(null))),
          query: vi.fn().mockReturnValue(createMockQuery([mockAppeal])),
        },
      };

      const res = await (appeals.getByClaimAndLevel as any)._handler(mockCtx, {
        claimId: "claim_1",
        appealLevel: "level_1_internal",
      });
      expect(res).toEqual(mockAppeal);
    });

    it("escalateTier: supports default escalation reason and actor", async () => {
      vi.mocked(getAuthUserId).mockResolvedValue("user_123" as any);
      const mockClaim = { _id: "claim_1", userId: "user_123", status: "denied" };
      const mockPrevAppeal = { _id: "appeal_1", claimId: "claim_1", version: 1, fullAppealMarkdown: "# Markdown" };
      const mockCtx: any = {
        db: {
          get: vi.fn().mockImplementation((id) => (id === "claim_1" ? Promise.resolve(mockClaim) : Promise.resolve(null))),
          query: vi.fn().mockReturnValue(createMockQuery([mockPrevAppeal])),
          insert: vi.fn().mockResolvedValue("appeal_new_2"),
          patch: vi.fn().mockResolvedValue(undefined),
        },
      };

      const res = await (appeals.escalateTier as any)._handler(mockCtx, {
        claimId: "claim_1",
        targetLevel: "level_2_grievance",
      });
      expect(res.success).toBe(true);
      expect(mockCtx.db.insert).toHaveBeenCalledWith("appealAuditLogs", expect.objectContaining({
        eventType: "statutory_tier_escalated",
        actor: "Advocate Legal Officer",
      }));
    });
  });

  describe("P1-1: Statutory Tier, Posture, and Authority Strict Validation", () => {
    it("createOrUpdateDraft: rejects unknown appealLevel with clear error", async () => {
      vi.mocked(getAuthUserId).mockResolvedValue("user_123" as any);
      const mockClaim = { _id: "claim_1", userId: "user_123" };
      const mockCtx: any = {
        db: {
          get: vi.fn().mockResolvedValue(mockClaim),
        },
      };

      await expect(
        (appeals.createOrUpdateDraft as any)._handler(mockCtx, {
          claimId: "claim_1",
          appealLevel: "tier_custom_break_dossier",
          executiveSummary: "Summary",
          medicalNecessityArguments: "Args",
          legalCitations: "Citations",
          fullAppealMarkdown: "Markdown",
        })
      ).rejects.toThrow(/Invalid statutory appeal level: "tier_custom_break_dossier"/);
    });

    it("createOrUpdateDraftInternal: rejects unknown appealLevel with clear error", async () => {
      const mockCtx: any = {
        db: {
          get: vi.fn().mockResolvedValue({ _id: "claim_1" }),
        },
      };

      await expect(
        (appeals.createOrUpdateDraftInternal as any)._handler(mockCtx, {
          claimId: "claim_1",
          appealLevel: "level_99_arbitrary",
          executiveSummary: "Summary",
          medicalNecessityArguments: "Args",
          legalCitations: "Citations",
          fullAppealMarkdown: "Markdown",
        })
      ).rejects.toThrow(/Invalid statutory appeal level: "level_99_arbitrary"/);
    });

    it("createOrUpdateDraft: rejects unknown statutoryPosture with clear error", async () => {
      vi.mocked(getAuthUserId).mockResolvedValue("user_123" as any);
      const mockClaim = { _id: "claim_1", userId: "user_123" };
      const mockCtx: any = {
        db: {
          get: vi.fn().mockResolvedValue(mockClaim),
        },
      };

      await expect(
        (appeals.createOrUpdateDraft as any)._handler(mockCtx, {
          claimId: "claim_1",
          appealLevel: "level_1_internal",
          statutoryPosture: "unrecognized_posture",
          executiveSummary: "Summary",
          medicalNecessityArguments: "Args",
          legalCitations: "Citations",
          fullAppealMarkdown: "Markdown",
        })
      ).rejects.toThrow(/Invalid statutory posture: "unrecognized_posture"/);
    });

    it("createOrUpdateDraft: rejects unknown targetAuthority with clear error", async () => {
      vi.mocked(getAuthUserId).mockResolvedValue("user_123" as any);
      const mockClaim = { _id: "claim_1", userId: "user_123" };
      const mockCtx: any = {
        db: {
          get: vi.fn().mockResolvedValue(mockClaim),
        },
      };

      await expect(
        (appeals.createOrUpdateDraft as any)._handler(mockCtx, {
          claimId: "claim_1",
          appealLevel: "level_1_internal",
          targetAuthority: "Bogus Medical Board",
          executiveSummary: "Summary",
          medicalNecessityArguments: "Args",
          legalCitations: "Citations",
          fullAppealMarkdown: "Markdown",
        })
      ).rejects.toThrow(/Invalid target authority: "Bogus Medical Board"/);
    });

    it("createOrUpdateDraft: rejects unknown legalAggressiveness with clear error", async () => {
      vi.mocked(getAuthUserId).mockResolvedValue("user_123" as any);
      const mockClaim = { _id: "claim_1", userId: "user_123" };
      const mockCtx: any = {
        db: {
          get: vi.fn().mockResolvedValue(mockClaim),
        },
      };

      await expect(
        (appeals.createOrUpdateDraft as any)._handler(mockCtx, {
          claimId: "claim_1",
          appealLevel: "level_1_internal",
          legalAggressiveness: "ultra_nuclear",
          executiveSummary: "Summary",
          medicalNecessityArguments: "Args",
          legalCitations: "Citations",
          fullAppealMarkdown: "Markdown",
        })
      ).rejects.toThrow(/Invalid legal aggressiveness: "ultra_nuclear"/);
    });

    it("escalateTier: rejects unknown targetLevel with clear error", async () => {
      vi.mocked(getAuthUserId).mockResolvedValue("user_123" as any);
      const mockClaim = { _id: "claim_1", userId: "user_123" };
      const mockCtx: any = {
        db: {
          get: vi.fn().mockResolvedValue(mockClaim),
        },
      };

      await expect(
        (appeals.escalateTier as any)._handler(mockCtx, {
          claimId: "claim_1",
          targetLevel: "invalid_tier_4",
        })
      ).rejects.toThrow(/Invalid statutory appeal level: "invalid_tier_4"/);
    });

    it("getStatutoryTierMetadata: rejects unknown appealLevel with clear error", () => {
      expect(() => appeals.getStatutoryTierMetadata("bogus_tier")).toThrow(
        /Invalid statutory appeal level: "bogus_tier"/
      );
    });

    it("getByClaimAndLevel: rejects unknown appealLevel with clear error", async () => {
      const mockCtx: any = { db: {} };
      await expect(
        (appeals.getByClaimAndLevel as any)._handler(mockCtx, {
          claimId: "claim_1",
          appealLevel: "non_existent_tier",
        })
      ).rejects.toThrow(/Invalid statutory appeal level: "non_existent_tier"/);
    });

    it("persists valid statutory tiers, postures, and target authorities successfully", async () => {
      vi.mocked(getAuthUserId).mockResolvedValue("user_123" as any);
      const mockClaim = { _id: "claim_1", userId: "user_123" };
      const mockCtx: any = {
        db: {
          get: vi.fn().mockResolvedValue(mockClaim),
          query: vi.fn().mockReturnValue(createMockQuery([])),
          insert: vi.fn().mockResolvedValue("appeal_valid_1"),
          patch: vi.fn().mockResolvedValue(undefined),
        },
      };

      const appealId = await (appeals.createOrUpdateDraft as any)._handler(mockCtx, {
        claimId: "claim_1",
        appealLevel: "level_2_grievance",
        statutoryPosture: "procedural_grievance_bad_faith",
        targetAuthority: "Multi-Disciplinary Peer Review Panel & Appeals Committee",
        legalAggressiveness: "elevated_grievance",
        executiveSummary: "Valid Grievance Summary",
        medicalNecessityArguments: "Valid Arguments",
        legalCitations: "29 CFR § 2560.503-1(h)(3)(iii)",
        fullAppealMarkdown: "# Valid Grievance Appeal",
      });

      expect(appealId).toBe("appeal_valid_1");
      expect(mockCtx.db.insert).toHaveBeenCalledWith(
        "appeals",
        expect.objectContaining({
          appealLevel: "level_2_grievance",
          statutoryPosture: "procedural_grievance_bad_faith",
          targetAuthority: "Multi-Disciplinary Peer Review Panel & Appeals Committee",
          legalAggressiveness: "elevated_grievance",
        })
      );
    });
  });
});
