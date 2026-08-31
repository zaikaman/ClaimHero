import { describe, it, expect, vi, beforeEach } from "vitest";
import { getAuthUserId } from "@convex-dev/auth/server";
import {
  requireAuthUser,
  requireIdentity,
  requireClaimOwner,
  getClaimIfAuthorized,
  requireChatbotSessionOwner,
  getChatbotSessionIfAuthorized,
  requireOwner,
} from "../convex/lib/auth";

vi.mock("@convex-dev/auth/server", () => ({
  getAuthUserId: vi.fn(),
}));

describe("Convex Authorization & Multi-Tenant Data Isolation Guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("requireAuthUser / requireIdentity", () => {
    it("throws Unauthorized error when caller is unauthenticated", async () => {
      vi.mocked(getAuthUserId).mockResolvedValue(null);
      const mockCtx: any = {};
      await expect(requireAuthUser(mockCtx)).rejects.toThrow(/Unauthorized/i);
      await expect(requireIdentity(mockCtx)).rejects.toThrow(/Unauthorized/i);
    });

    it("returns userId when caller is authenticated", async () => {
      vi.mocked(getAuthUserId).mockResolvedValue("user_123" as any);
      const mockCtx: any = {};
      await expect(requireAuthUser(mockCtx)).resolves.toBe("user_123");
      await expect(requireIdentity(mockCtx)).resolves.toBe("user_123");
    });
  });

  describe("requireClaimOwner", () => {
    it("throws when claim is not found", async () => {
      vi.mocked(getAuthUserId).mockResolvedValue("user_123" as any);
      const mockCtx: any = {
        db: {
          get: vi.fn().mockResolvedValue(null),
        },
      };

      await expect(requireClaimOwner(mockCtx, "claim_999" as any)).rejects.toThrow(/not found/i);
    });

    it("rejects access when authenticated user does not match claim owner", async () => {
      vi.mocked(getAuthUserId).mockResolvedValue("user_attacker_789" as any);
      const mockCtx: any = {
        db: {
          get: vi.fn().mockResolvedValue({
            _id: "claim_abc",
            userId: "user_owner_456",
            claimNumber: "CLM-456",
          }),
        },
      };

      await expect(requireClaimOwner(mockCtx, "claim_abc" as any)).rejects.toThrow(
        "Forbidden: You do not have permission to access this claim"
      );
    });

    it("permits access when caller is the verified claim owner", async () => {
      vi.mocked(getAuthUserId).mockResolvedValue("user_owner_123" as any);
      const mockClaim = {
        _id: "claim_abc",
        userId: "user_owner_123",
        claimNumber: "CLM-123",
      };

      const mockCtx: any = {
        db: {
          get: vi.fn().mockResolvedValue(mockClaim),
        },
      };

      const result = await requireClaimOwner(mockCtx, "claim_abc" as any);
      expect(result).toEqual({ claim: mockClaim, userId: "user_owner_123" });
    });
  });

  describe("getClaimIfAuthorized", () => {
    it("returns null safely without leaking data when unauthenticated", async () => {
      vi.mocked(getAuthUserId).mockResolvedValue(null);
      const mockClaim = {
        _id: "claim_secret",
        userId: "user_tenant_A",
        claimNumber: "CLM-PHI-999",
      };

      const mockCtx: any = {
        db: {
          get: vi.fn().mockResolvedValue(mockClaim),
        },
      };

      const result = await getClaimIfAuthorized(mockCtx, "claim_secret" as any);
      expect(result).toBeNull();
    });

    it("returns null when claim is not found in database", async () => {
      vi.mocked(getAuthUserId).mockResolvedValue("user_tenant_A" as any);
      const mockCtx: any = {
        db: {
          get: vi.fn().mockResolvedValue(null),
        },
      };

      const result = await getClaimIfAuthorized(mockCtx, "claim_nonexistent" as any);
      expect(result).toBeNull();
    });

    it("returns null when caller belongs to a different tenant", async () => {
      vi.mocked(getAuthUserId).mockResolvedValue("user_tenant_B" as any);
      const mockClaim = {
        _id: "claim_secret",
        userId: "user_tenant_A",
        claimNumber: "CLM-PHI-999",
      };

      const mockCtx: any = {
        db: {
          get: vi.fn().mockResolvedValue(mockClaim),
        },
      };

      const result = await getClaimIfAuthorized(mockCtx, "claim_secret" as any);
      expect(result).toBeNull();
    });

    it("returns claim when caller is the verified owner", async () => {
      vi.mocked(getAuthUserId).mockResolvedValue("user_tenant_A" as any);
      const mockClaim = {
        _id: "claim_secret",
        userId: "user_tenant_A",
        claimNumber: "CLM-PHI-999",
      };

      const mockCtx: any = {
        db: {
          get: vi.fn().mockResolvedValue(mockClaim),
        },
      };

      const result = await getClaimIfAuthorized(mockCtx, "claim_secret" as any);
      expect(result).toEqual({ claim: mockClaim, userId: "user_tenant_A" });
    });
  });

  describe("requireChatbotSessionOwner & getChatbotSessionIfAuthorized", () => {
    it("throws when session is not found", async () => {
      vi.mocked(getAuthUserId).mockResolvedValue("user_alice" as any);
      const mockCtx: any = {
        db: {
          get: vi.fn().mockResolvedValue(null),
        },
      };

      await expect(requireChatbotSessionOwner(mockCtx, "session_missing" as any)).rejects.toThrow(
        "Chatbot session not found"
      );
    });

    it("enforces session ownership isolation on requireChatbotSessionOwner", async () => {
      const mockSession = {
        _id: "session_xyz",
        userId: "user_alice",
        title: "Clinical Appeal Strategy",
      };

      const mockCtx: any = {
        db: {
          get: vi.fn().mockResolvedValue(mockSession),
        },
      };

      // Unauthenticated -> throws
      vi.mocked(getAuthUserId).mockResolvedValue(null);
      await expect(requireChatbotSessionOwner(mockCtx, "session_xyz" as any)).rejects.toThrow(/Unauthorized/i);

      // Bob trying to mutate Alice's session -> throws
      vi.mocked(getAuthUserId).mockResolvedValue("user_bob" as any);
      await expect(requireChatbotSessionOwner(mockCtx, "session_xyz" as any)).rejects.toThrow(/Forbidden/i);

      // Alice mutating Alice's session -> succeeds
      vi.mocked(getAuthUserId).mockResolvedValue("user_alice" as any);
      const result = await requireChatbotSessionOwner(mockCtx, "session_xyz" as any);
      expect(result).toEqual({ session: mockSession, userId: "user_alice" });
    });

    it("handles getChatbotSessionIfAuthorized safely across all states", async () => {
      const mockSession = {
        _id: "session_xyz",
        userId: "user_alice",
        title: "Clinical Strategy",
      };

      const mockCtx: any = {
        db: {
          get: vi.fn().mockImplementation((id) => (id === "session_xyz" ? Promise.resolve(mockSession) : Promise.resolve(null))),
        },
      };

      // Case 1: unauthenticated -> null
      vi.mocked(getAuthUserId).mockResolvedValue(null);
      expect(await getChatbotSessionIfAuthorized(mockCtx, "session_xyz" as any)).toBeNull();

      // Case 2: session not found -> null
      vi.mocked(getAuthUserId).mockResolvedValue("user_alice" as any);
      expect(await getChatbotSessionIfAuthorized(mockCtx, "session_missing" as any)).toBeNull();

      // Case 3: unauthorized user (Bob) -> null
      vi.mocked(getAuthUserId).mockResolvedValue("user_bob" as any);
      expect(await getChatbotSessionIfAuthorized(mockCtx, "session_xyz" as any)).toBeNull();

      // Case 4: authorized user (Alice) -> session
      vi.mocked(getAuthUserId).mockResolvedValue("user_alice" as any);
      expect(await getChatbotSessionIfAuthorized(mockCtx, "session_xyz" as any)).toEqual(mockSession);
    });
  });

  describe("requireOwner generic helper", () => {
    it("throws when document is null", async () => {
      const mockCtx: any = {};
      await expect(requireOwner(mockCtx, null)).rejects.toThrow("Document not found");
    });

    it("verifies document owner field matches authenticated identity", async () => {
      const mockCtx: any = {};

      vi.mocked(getAuthUserId).mockResolvedValue("user_1" as any);
      await expect(requireOwner(mockCtx, { _id: "doc_1" as any, userId: "user_2" as any })).rejects.toThrow(/Forbidden/i);

      const doc = { _id: "doc_1" as any, userId: "user_1" as any };
      const verified = await requireOwner(mockCtx, doc);
      expect(verified).toEqual({ doc, userId: "user_1" });
    });
  });
});
