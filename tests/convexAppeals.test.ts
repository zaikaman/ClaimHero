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
          query: vi.fn().mockReturnValue({
            withIndex: vi.fn().mockReturnValue({
              collect: vi.fn().mockResolvedValue([]),
            }),
          }),
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
          query: vi.fn().mockReturnValue({
            withIndex: vi.fn().mockReturnValue({
              collect: vi.fn().mockResolvedValue([appealV1, appealV2]),
            }),
          }),
        },
      };
      const res = await (appeals.getLatestByClaim as any)._handler(mockCtx, { claimId: "claim_1" });
      expect(res).toEqual(appealV2);
    });

    it("getLatestByClaimInternal: returns null if list empty, else latest version", async () => {
      const mockCtxEmpty: any = {
        db: {
          query: vi.fn().mockReturnValue({
            withIndex: vi.fn().mockReturnValue({
              collect: vi.fn().mockResolvedValue([]),
            }),
          }),
        },
      };
      const resEmpty = await (appeals.getLatestByClaimInternal as any)._handler(mockCtxEmpty, { claimId: "claim_1" });
      expect(resEmpty).toBeNull();

      const appealV1 = { _id: "a1", version: 1 };
      const appealV3 = { _id: "a3", version: 3 };
      const mockCtx: any = {
        db: {
          query: vi.fn().mockReturnValue({
            withIndex: vi.fn().mockReturnValue({
              collect: vi.fn().mockResolvedValue([appealV1, appealV3]),
            }),
          }),
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
          query: vi.fn().mockReturnValue({
            withIndex: vi.fn().mockReturnValue({
              collect: vi.fn().mockResolvedValue([]),
            }),
          }),
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
          query: vi.fn().mockReturnValue({
            withIndex: vi.fn().mockReturnValue({
              collect: vi.fn().mockResolvedValue([a1, a2]),
            }),
          }),
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
          query: vi.fn().mockReturnValue({
            withIndex: vi.fn().mockReturnValue({
              collect: vi.fn().mockResolvedValue([a1, a2]),
            }),
          }),
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
          query: vi.fn().mockReturnValue({
            withIndex: vi.fn().mockReturnValue({
              collect: vi.fn().mockResolvedValue([]),
            }),
          }),
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
          query: vi.fn().mockReturnValue({
            withIndex: vi.fn().mockReturnValue({
              collect: vi.fn().mockResolvedValue([existingAppeal]),
            }),
          }),
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
          query: vi.fn().mockReturnValue({
            withIndex: vi.fn().mockReturnValue({
              collect: vi.fn().mockResolvedValue([existingAppeal]),
            }),
          }),
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
          query: vi.fn().mockReturnValue({
            withIndex: vi.fn().mockReturnValue({
              collect: vi.fn().mockResolvedValue([mockAppeal]),
            }),
          }),
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
          query: vi.fn().mockReturnValue({
            withIndex: vi.fn().mockReturnValue({
              collect: vi.fn().mockResolvedValue([mockPrevAppeal]),
            }),
          }),
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
});
