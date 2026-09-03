import { describe, it, expect, vi, beforeEach } from "vitest";
import * as auditLogs from "../convex/auditLogs";
import * as users from "../convex/users";
import crons from "../convex/crons";
import * as convexAuthModule from "../convex/auth";
import * as modelAuth from "../convex/model/auth";
import { getAuthUserId } from "@convex-dev/auth/server";

vi.mock("@convex-dev/auth/server", () => ({
  getAuthUserId: vi.fn(),
  convexAuth: vi.fn(() => ({
    auth: { addHttpRoutes: vi.fn() },
    signIn: vi.fn(),
    signOut: vi.fn(),
    store: vi.fn(),
    isAuthenticated: vi.fn(),
  })),
}));

describe("Convex Audit Logs, Users, Auth & Crons", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("convex/model/auth", () => {
    it("re-exports lib/auth functions", () => {
      expect(modelAuth.requireClaimOwner).toBeDefined();
      expect(modelAuth.requireAuthUser).toBeDefined();
    });
  });

  describe("convex/crons", () => {
    it("configures the daily sweep cron job", () => {
      expect(crons).toBeDefined();
    });
  });

  describe("convex/users", () => {
    it("returns null if unauthenticated", async () => {
      vi.mocked(getAuthUserId).mockResolvedValue(null);
      const mockCtx: any = { db: { get: vi.fn() } };
      const res = await (users.viewer as any)._handler(mockCtx, {});
      expect(res).toBeNull();
    });

    it("returns user document if authenticated", async () => {
      vi.mocked(getAuthUserId).mockResolvedValue("user_123" as any);
      const mockUser = { _id: "user_123", name: "Dr. Jane" };
      const mockCtx: any = { db: { get: vi.fn().mockResolvedValue(mockUser) } };
      const res = await (users.viewer as any)._handler(mockCtx, {});
      expect(res).toEqual(mockUser);
    });

    it("updateProfile: updates authenticated user profile fields", async () => {
      vi.mocked(getAuthUserId).mockResolvedValue("user_123" as any);
      const updatedUser = { _id: "user_123", name: "Dr. Jane Updated" };
      const mockCtx: any = {
        db: {
          patch: vi.fn().mockResolvedValue(undefined),
          get: vi.fn().mockResolvedValue(updatedUser),
        },
      };
      const res = await (users.updateProfile as any)._handler(mockCtx, { name: "Dr. Jane Updated" });
      expect(res).toEqual(updatedUser);
      expect(mockCtx.db.patch).toHaveBeenCalledWith("user_123", { name: "Dr. Jane Updated" });
    });
  });

  describe("convex/auditLogs", () => {
    it("listByClaim: returns empty array if unauthorized", async () => {
      vi.mocked(getAuthUserId).mockResolvedValue(null);
      const mockCtx: any = { db: { get: vi.fn().mockResolvedValue(null) } };
      const res = await (auditLogs.listByClaim as any)._handler(mockCtx, { claimId: "claim_1" });
      expect(res).toEqual([]);
    });

    it("listByClaim: queries indexed logs when authorized", async () => {
      vi.mocked(getAuthUserId).mockResolvedValue("user_owner" as any);
      const mockClaim = { _id: "claim_1", userId: "user_owner" };
      const logs = [{ _id: "log_1", claimId: "claim_1", timestamp: 100 }];
      const mockCtx: any = {
        db: {
          get: vi.fn().mockResolvedValue(mockClaim),
          query: vi.fn().mockReturnValue({
            withIndex: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                take: vi.fn().mockResolvedValue(logs),
              }),
            }),
          }),
        },
      };

      const res = await (auditLogs.listByClaim as any)._handler(mockCtx, { claimId: "claim_1", limit: 50 });
      expect(res).toEqual(logs);
    });

    it("logEvent: logs an event and updates claim updatedAt", async () => {
      vi.mocked(getAuthUserId).mockResolvedValue("user_owner" as any);
      const mockClaim = { _id: "claim_1", userId: "user_owner" };
      const mockCtx: any = {
        db: {
          get: vi.fn().mockResolvedValue(mockClaim),
          insert: vi.fn().mockResolvedValue("log_100"),
          patch: vi.fn().mockResolvedValue(undefined),
        },
      };

      const logId = await (auditLogs.logEvent as any)._handler(mockCtx, {
        claimId: "claim_1",
        eventType: "appeal_draft_created",
        actor: "Appeal Studio",
        details: "Created draft v1",
      });

      expect(logId).toBe("log_100");
      expect(mockCtx.db.insert).toHaveBeenCalledWith(
        "appealAuditLogs",
        expect.objectContaining({
          claimId: "claim_1",
          eventType: "appeal_draft_created",
          actor: "Appeal Studio",
          details: "Created draft v1",
        })
      );
      expect(mockCtx.db.patch).toHaveBeenCalledWith("claim_1", expect.objectContaining({ updatedAt: expect.any(Number) }));
    });

    it("logEventInternal: inserts audit log directly", async () => {
      const mockCtx: any = {
        db: {
          insert: vi.fn().mockResolvedValue("log_200"),
        },
      };

      const logId = await (auditLogs.logEventInternal as any)._handler(mockCtx, {
        claimId: "claim_1",
        eventType: "denial_ingested",
        actor: "OCR Agent",
        details: "Ingested denial",
      });

      expect(logId).toBe("log_200");
      expect(mockCtx.db.insert).toHaveBeenCalledWith(
        "appealAuditLogs",
        expect.objectContaining({
          claimId: "claim_1",
          eventType: "denial_ingested",
        })
      );
    });

    it("listRecent: returns empty array if unauthenticated", async () => {
      vi.mocked(getAuthUserId).mockResolvedValue(null);
      const mockCtx: any = { db: {} };
      const res = await (auditLogs.listRecent as any)._handler(mockCtx, {});
      expect(res).toEqual([]);
    });

    it("listRecent: returns empty array if user has no claims", async () => {
      vi.mocked(getAuthUserId).mockResolvedValue("user_123" as any);
      const mockCtx: any = {
        db: {
          query: vi.fn().mockReturnValue({
            withIndex: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                take: vi.fn().mockResolvedValue([]),
              }),
            }),
          }),
        },
      };
      const res = await (auditLogs.listRecent as any)._handler(mockCtx, {});
      expect(res).toEqual([]);
    });

    it("listRecent: merges and sorts audit logs across user active claims", async () => {
      vi.mocked(getAuthUserId).mockResolvedValue("user_123" as any);
      const mockClaims = [
        { _id: "c1", userId: "user_123", updatedAt: 200 },
        { _id: "c2", userId: "user_123", updatedAt: 100 },
      ];

      const c1Logs = [{ _id: "l1", claimId: "c1", timestamp: 150, eventType: "e1" }];
      const c2Logs = [{ _id: "l2", claimId: "c2", timestamp: 180, eventType: "e2" }];

      const mockCtx: any = {
        db: {
          query: vi.fn().mockImplementation((table: string) => {
            if (table === "claims") {
              return {
                withIndex: vi.fn().mockReturnValue({
                  order: vi.fn().mockReturnValue({
                    take: vi.fn().mockResolvedValue(mockClaims),
                  }),
                }),
              };
            }
            if (table === "appealAuditLogs") {
              return {
                withIndex: vi.fn().mockImplementation((_name, fn) => {
                  const queryObj: any = {};
                  queryObj.eq = vi.fn().mockReturnValue(queryObj);
                  fn(queryObj);
                  return {
                    order: vi.fn().mockReturnValue({
                      take: vi.fn().mockImplementation(() => {
                        // Return based on call
                        if (mockCtx.db.query.mock.calls.length === 2) return Promise.resolve(c1Logs);
                        return Promise.resolve(c2Logs);
                      }),
                    }),
                  };
                }),
              };
            }
            return {};
          }),
        },
      };

      const res = await (auditLogs.listRecent as any)._handler(mockCtx, { limit: 10 });
      expect(res.length).toBe(2);
      expect(res[0].timestamp).toBe(180);
      expect(res[1].timestamp).toBe(150);
    });

    it("convex/auth: exports configured Convex Auth v2 methods and enforces long-lived accessTokenTtlSeconds", async () => {
      expect(convexAuthModule.signInWithPassword).toBeDefined();
      expect(convexAuthModule.signUpWithPassword).toBeDefined();
      expect(convexAuthModule.startSignInGoogle).toBeDefined();
      expect(convexAuthModule.completeSignInGoogle).toBeDefined();
      expect(convexAuthModule.signOut).toBeDefined();
      expect(convexAuthModule.refreshSession).toBeDefined();
      expect(convexAuthModule.isAuthenticated).toBeDefined();

      const fs = await import("fs");
      const authSource = fs.readFileSync("convex/auth.ts", "utf-8");
      expect(authSource).toContain("accessTokenTtlSeconds: 86400");
    });
  });
});
