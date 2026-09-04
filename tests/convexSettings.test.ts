import { describe, it, expect, vi, beforeEach } from "vitest";
import * as settings from "../convex/settings";
import { getAuthUserId } from "@convex-dev/auth/server";
import { claimsAggregate } from "../convex/lib/aggregates";

vi.mock("@convex-dev/auth/server", () => ({
  getAuthUserId: vi.fn(),
}));

vi.mock("../convex/lib/aggregates", () => ({
  claimsAggregate: {
    delete: vi.fn(),
    insert: vi.fn(),
  },
}));

describe("Convex Settings API (convex/settings.ts)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getSettings", () => {
    it("throws unauthorized error if user is unauthenticated", async () => {
      vi.mocked(getAuthUserId).mockResolvedValue(null);
      const mockCtx: any = { db: {} };

      await expect(
        (settings.getSettings as any)._handler(mockCtx, {})
      ).rejects.toThrow("Unauthorized: Authentication required");
    });

    it("returns default settings for authenticated user if no record exists", async () => {
      vi.mocked(getAuthUserId).mockResolvedValue("user_123" as any);
      const mockCtx: any = {
        db: {
          query: vi.fn().mockReturnValue({
            withIndex: vi.fn().mockReturnValue({
              first: vi.fn().mockResolvedValue(null),
            }),
          }),
        },
      };

      const res = await (settings.getSettings as any)._handler(mockCtx, {});
      expect(res).toBeDefined();
      expect(res.userId).toBe("user_123");
      expect(res.approvalMode).toBe("manual_review");
      expect(res.followUpCadenceDays).toBe(14);
      expect(res.advocateProfile.name).toContain("Dr. Sarah Chen");
      // Verifies only scoped by_user was queried, never a global fallback
      expect(mockCtx.db.query).toHaveBeenCalledTimes(1);
      expect(mockCtx.db.query).toHaveBeenCalledWith("userSettings");
    });

    it("returns user specific settings when found", async () => {
      vi.mocked(getAuthUserId).mockResolvedValue("user_123" as any);
      const customSettings = {
        _id: "settings_1",
        userId: "user_123",
        approvalMode: "autonomous_high_confidence",
        followUpCadenceDays: 30,
        defaultLegalPosture: "procedural_grievance_bad_faith",
        autoReplyInbound: true,
        autoRescanPolicies: true,
        criticalDeadlineAlerts: true,
        advocateProfile: {
          name: "Dr. Alex Vance",
          credentials: "MD, Board Certified",
          organization: "City Clinic",
          phone: "+1-555-0100",
          state: "NY",
        },
        createdAt: 100,
        updatedAt: 200,
      };

      const mockCtx: any = {
        db: {
          query: vi.fn().mockReturnValue({
            withIndex: vi.fn().mockReturnValue({
              first: vi.fn().mockResolvedValue(customSettings),
            }),
          }),
        },
      };

      const res = await (settings.getSettings as any)._handler(mockCtx, {});
      expect(res).toEqual(customSettings);
    });
  });

  describe("updateSettings", () => {
    it("throws unauthorized error if user is unauthenticated", async () => {
      vi.mocked(getAuthUserId).mockResolvedValue(null);
      const mockCtx: any = { db: {} };

      await expect(
        (settings.updateSettings as any)._handler(mockCtx, {
          approvalMode: "manual_review",
          followUpCadenceDays: 14,
          defaultLegalPosture: "administrative_reconsideration",
          autoReplyInbound: true,
          autoRescanPolicies: true,
          criticalDeadlineAlerts: true,
          advocateProfile: {
            name: "Dr. Test",
            credentials: "MD",
            organization: "Org",
            phone: "+1-555-0000",
            state: "CA",
          },
        })
      ).rejects.toThrow("Unauthorized: Authentication required");
    });

    it("inserts new settings record if none exists", async () => {
      vi.mocked(getAuthUserId).mockResolvedValue("user_123" as any);
      const mockCtx: any = {
        db: {
          query: vi.fn().mockReturnValue({
            withIndex: vi.fn().mockReturnValue({
              first: vi.fn().mockResolvedValue(null),
            }),
          }),
          insert: vi.fn().mockResolvedValue("new_settings_id"),
        },
      };

      const updateArgs = {
        approvalMode: "autonomous_high_confidence" as const,
        followUpCadenceDays: 21,
        defaultLegalPosture: "external_iro_erisa_502_petition" as const,
        autoReplyInbound: false,
        autoRescanPolicies: true,
        criticalDeadlineAlerts: true,
        advocateProfile: {
          name: "Dr. Jane Doe",
          credentials: "MD",
          organization: "Advocate Care",
          phone: "+1-555-1234",
          state: "TX",
        },
      };

      const res = await (settings.updateSettings as any)._handler(mockCtx, updateArgs);
      expect(res).toBe("new_settings_id");
      expect(mockCtx.db.insert).toHaveBeenCalledWith(
        "userSettings",
        expect.objectContaining({
          userId: "user_123",
          approvalMode: "autonomous_high_confidence",
          followUpCadenceDays: 21,
        })
      );
    });

    it("patches existing settings record when present", async () => {
      vi.mocked(getAuthUserId).mockResolvedValue("user_123" as any);
      const existing = { _id: "existing_id", userId: "user_123" };
      const mockCtx: any = {
        db: {
          query: vi.fn().mockReturnValue({
            withIndex: vi.fn().mockReturnValue({
              first: vi.fn().mockResolvedValue(existing),
            }),
          }),
          patch: vi.fn().mockResolvedValue(undefined),
        },
      };

      const updateArgs = {
        approvalMode: "manual_review" as const,
        followUpCadenceDays: 7,
        defaultLegalPosture: "administrative_reconsideration" as const,
        autoReplyInbound: true,
        autoRescanPolicies: false,
        criticalDeadlineAlerts: false,
        advocateProfile: {
          name: "Dr. Sarah Chen",
          credentials: "MD",
          organization: "Care",
          phone: "+1-555-9999",
          state: "CA",
        },
      };

      const res = await (settings.updateSettings as any)._handler(mockCtx, updateArgs);
      expect(res).toBe("existing_id");
      expect(mockCtx.db.patch).toHaveBeenCalledWith(
        "existing_id",
        expect.objectContaining({
          followUpCadenceDays: 7,
          autoRescanPolicies: false,
        })
      );
    });
  });

  describe("triggerManualSweepAndSync", () => {
    it("throws unauthorized error if user is unauthenticated", async () => {
      vi.mocked(getAuthUserId).mockResolvedValue(null);
      const mockCtx: any = { db: {} };

      await expect(
        (settings.triggerManualSweepAndSync as any)._handler(mockCtx, {})
      ).rejects.toThrow("Unauthorized: Authentication required");
    });

    it("recalculates deadline days for claims scoped to user and updates sync timestamp", async () => {
      vi.mocked(getAuthUserId).mockResolvedValue("user_123" as any);
      const now = Date.now();
      const mockClaim = {
        _id: "claim_1",
        userId: "user_123",
        statutoryDeadline: now + 5 * 24 * 60 * 60 * 1000,
        daysRemaining: 10, // stale value
      };
      const mockSetting = { _id: "setting_1", userId: "user_123" };

      const mockCtx: any = {
        db: {
          query: vi.fn().mockImplementation((table) => {
            if (table === "claims") {
              return {
                withIndex: vi.fn().mockReturnValue({
                  take: vi.fn().mockResolvedValue([mockClaim]),
                }),
              };
            }
            if (table === "userSettings") {
              return {
                withIndex: vi.fn().mockReturnValue({
                  first: vi.fn().mockResolvedValue(mockSetting),
                }),
              };
            }
            return { first: vi.fn().mockResolvedValue(null) };
          }),
          patch: vi.fn().mockResolvedValue(undefined),
        },
      };

      const res = await (settings.triggerManualSweepAndSync as any)._handler(mockCtx, {});
      expect(res.success).toBe(true);
      expect(res.activeClaimsChecked).toBe(1);
      expect(res.deadlinesUpdated).toBe(1);
      expect(mockCtx.db.patch).toHaveBeenCalledWith("claim_1", expect.objectContaining({ daysRemaining: 5 }));
      expect(mockCtx.db.patch).toHaveBeenCalledWith("setting_1", expect.objectContaining({ lastSyncTimestamp: expect.any(Number) }));
    });
  });

  describe("resetPortfolio", () => {
    it("throws error if confirmation phrase does not match", async () => {
      const mockCtx: any = { db: {} };
      await expect(
        (settings.resetPortfolio as any)._handler(mockCtx, { confirmText: "WRONG" })
      ).rejects.toThrow("Confirmation phrase mismatch");
    });

    it("throws unauthorized error if user is unauthenticated", async () => {
      vi.mocked(getAuthUserId).mockResolvedValue(null);
      const mockCtx: any = { db: {} };

      await expect(
        (settings.resetPortfolio as any)._handler(mockCtx, { confirmText: "RESET_PORTFOLIO" })
      ).rejects.toThrow("Unauthorized: Authentication required");
    });

    it("cascades and deletes all claim records, artifacts, and storage attachments upon confirmation", async () => {
      vi.mocked(getAuthUserId).mockResolvedValue("user_123" as any);
      const mockClaim = {
        _id: "claim_1",
        userId: "user_123",
        denialLetterStorageId: "storage_denial_1",
      };
      const mockEv = [{ _id: "ev_1" }];
      const mockAppeal = [{ _id: "ap_1", pdfExportStorageId: "storage_pdf_1" }];
      const mockThread = [{ _id: "th_1" }];
      const mockMsg = [{ _id: "msg_1" }];
      const mockP2P = [{ _id: "p2p_1" }];
      const mockSession = [{ _id: "sess_1" }];
      const mockLog = [{ _id: "log_1" }];

      const mockCtx: any = {
        db: {
          query: vi.fn().mockImplementation((table) => {
            return {
              withIndex: vi.fn().mockReturnValue({
                collect: vi.fn().mockImplementation(() => {
                  if (table === "claims") return Promise.resolve([mockClaim]);
                  if (table === "clinicalEvidences") return Promise.resolve(mockEv);
                  if (table === "appeals") return Promise.resolve(mockAppeal);
                  if (table === "emailThreads") return Promise.resolve(mockThread);
                  if (table === "emailMessages") return Promise.resolve(mockMsg);
                  if (table === "p2pScripts") return Promise.resolve(mockP2P);
                  if (table === "p2pCallSessions") return Promise.resolve(mockSession);
                  if (table === "appealAuditLogs") return Promise.resolve(mockLog);
                  return Promise.resolve([]);
                }),
              }),
            };
          }),
          delete: vi.fn().mockResolvedValue(undefined),
        },
        storage: {
          delete: vi.fn().mockResolvedValue(undefined),
        },
      };

      const res = await (settings.resetPortfolio as any)._handler(mockCtx, { confirmText: "RESET_PORTFOLIO" });
      expect(res.success).toBe(true);
      expect(res.deletedClaimsCount).toBe(1);
      expect(mockCtx.db.delete).toHaveBeenCalledWith("ev_1");
      expect(mockCtx.db.delete).toHaveBeenCalledWith("ap_1");
      expect(mockCtx.db.delete).toHaveBeenCalledWith("th_1");
      expect(mockCtx.db.delete).toHaveBeenCalledWith("msg_1");
      expect(mockCtx.db.delete).toHaveBeenCalledWith("p2p_1");
      expect(mockCtx.db.delete).toHaveBeenCalledWith("sess_1");
      expect(mockCtx.db.delete).toHaveBeenCalledWith("log_1");
      expect(mockCtx.db.delete).toHaveBeenCalledWith("claim_1");
      expect(mockCtx.storage.delete).toHaveBeenCalledWith("storage_pdf_1");
      expect(mockCtx.storage.delete).toHaveBeenCalledWith("storage_denial_1");
      expect(claimsAggregate.delete).toHaveBeenCalledWith(mockCtx, mockClaim);
    });
  });
});
