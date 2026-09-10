import { describe, it, expect, vi, beforeEach } from "vitest";
import { getAuthUserId } from "@convex-dev/auth/server";
import {
  assertValidCollaboratorEmail,
  getClaimAccessRole,
  getClaimIfAuthorized,
  normalizeCollaboratorEmail,
  requireClaimAccess,
  requireClaimEditor,
} from "../convex/lib/auth";

vi.mock("@convex-dev/auth/server", () => ({
  getAuthUserId: vi.fn(),
}));

function chainable(result: unknown) {
  return {
    withIndex: vi.fn().mockReturnValue({
      first: vi.fn().mockResolvedValue(result),
      take: vi.fn().mockResolvedValue(Array.isArray(result) ? result : result ? [result] : []),
    }),
  };
}

describe("Case collaboration flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("email helpers", () => {
    it("normalizes collaborator emails to lowercase", () => {
      expect(normalizeCollaboratorEmail("  Advocate@Clinic.ORG ")).toBe("advocate@clinic.org");
    });

    it("rejects malformed collaborator emails", () => {
      expect(() => assertValidCollaboratorEmail("not-an-email")).toThrow(/Invalid email/i);
      expect(() => assertValidCollaboratorEmail("")).toThrow(/Invalid email/i);
      expect(assertValidCollaboratorEmail("Teammate@Clinic.org")).toBe("teammate@clinic.org");
    });
  });

  describe("getClaimAccessRole", () => {
    const claim = { _id: "claim_1", userId: "user_owner" } as never;

    it("resolves owner without touching the collaborators table", async () => {
      const mockCtx = { db: { get: vi.fn(), query: vi.fn() } } as never;
      await expect(getClaimAccessRole(mockCtx, claim, "user_owner" as never)).resolves.toBe("owner");
      expect(vi.mocked(mockCtx as { db: { query: ReturnType<typeof vi.fn> } }).db.query).not.toHaveBeenCalled();
    });

    it("resolves editor via userId grant", async () => {
      const mockCtx = {
        db: {
          get: vi.fn().mockResolvedValue({ _id: "user_ed", email: "ed@clinic.org" }),
          query: vi.fn().mockReturnValue(
            chainable([{ status: "active", role: "editor", userId: "user_ed", email: "ed@clinic.org" }])
          ),
        },
      } as never;
      await expect(getClaimAccessRole(mockCtx, claim, "user_ed" as never)).resolves.toBe("editor");
    });

    it("resolves viewer via email grant created before signup", async () => {
      const mockCtx = {
        db: {
          get: vi.fn().mockResolvedValue({ _id: "user_new", email: "new@clinic.org" }),
          query: vi.fn().mockReturnValue(
            chainable([{ status: "active", role: "viewer", email: "new@clinic.org" }])
          ),
        },
      } as never;
      await expect(getClaimAccessRole(mockCtx, claim, "user_new" as never)).resolves.toBe("viewer");
    });

    it("ignores revoked grants", async () => {
      const mockCtx = {
        db: {
          get: vi.fn().mockResolvedValue({ _id: "user_old", email: "old@clinic.org" }),
          query: vi.fn().mockReturnValue(
            chainable([{ status: "revoked", role: "editor", userId: "user_old", email: "old@clinic.org" }])
          ),
        },
      } as never;
      await expect(getClaimAccessRole(mockCtx, claim, "user_old" as never)).resolves.toBeNull();
    });

    it("returns null for strangers", async () => {
      const mockCtx = {
        db: {
          get: vi.fn().mockResolvedValue({ _id: "user_x", email: "x@clinic.org" }),
          query: vi.fn().mockReturnValue(chainable([])),
        },
      } as never;
      await expect(getClaimAccessRole(mockCtx, claim, "user_x" as never)).resolves.toBeNull();
    });
  });

  describe("requireClaimEditor", () => {
    const claim = { _id: "claim_1", userId: "user_owner" };

    it("permits owners and editors, blocks viewers and strangers", async () => {
      vi.mocked(getAuthUserId).mockResolvedValue("user_owner" as never);
      const ownerCtx = { db: { get: vi.fn().mockResolvedValue(claim) } } as never;
      await expect(requireClaimEditor(ownerCtx, "claim_1" as never)).resolves.toMatchObject({
        accessRole: "owner",
      });

      vi.mocked(getAuthUserId).mockResolvedValue("user_ed" as never);
      const editorCtx = {
        db: {
          get: vi.fn().mockImplementation((id: string) => {
            if (id === "claim_1") return Promise.resolve(claim);
            return Promise.resolve({ _id: "user_ed", email: "ed@clinic.org" });
          }),
          query: vi.fn().mockReturnValue(
            chainable([{ status: "active", role: "editor", userId: "user_ed", email: "ed@clinic.org" }])
          ),
        },
      } as never;
      await expect(requireClaimEditor(editorCtx, "claim_1" as never)).resolves.toMatchObject({
        accessRole: "editor",
      });

      vi.mocked(getAuthUserId).mockResolvedValue("user_view" as never);
      const viewerCtx = {
        db: {
          get: vi.fn().mockImplementation((id: string) => {
            if (id === "claim_1") return Promise.resolve(claim);
            return Promise.resolve({ _id: "user_view", email: "view@clinic.org" });
          }),
          query: vi.fn().mockReturnValue(
            chainable([{ status: "active", role: "viewer", userId: "user_view", email: "view@clinic.org" }])
          ),
        },
      } as never;
      await expect(requireClaimEditor(viewerCtx, "claim_1" as never)).rejects.toThrow(/read-only/i);

      vi.mocked(getAuthUserId).mockResolvedValue("user_stranger" as never);
      const strangerCtx = {
        db: {
          get: vi.fn().mockImplementation((id: string) => {
            if (id === "claim_1") return Promise.resolve(claim);
            return Promise.resolve({ _id: "user_stranger", email: "s@clinic.org" });
          }),
          query: vi.fn().mockReturnValue(chainable([])),
        },
      } as never;
      await expect(requireClaimEditor(strangerCtx, "claim_1" as never)).rejects.toThrow(/Forbidden/i);
    });
  });

  describe("getClaimIfAuthorized with collaborators", () => {
    it("returns viewer access instead of null for invited teammates", async () => {
      vi.mocked(getAuthUserId).mockResolvedValue("user_view" as never);
      const claim = { _id: "claim_1", userId: "user_owner" };
      const mockCtx = {
        db: {
          get: vi.fn().mockImplementation((id: string) => {
            if (id === "claim_1") return Promise.resolve(claim);
            return Promise.resolve({ _id: "user_view", email: "view@clinic.org" });
          }),
          query: vi.fn().mockReturnValue(
            chainable([{ status: "active", role: "viewer", userId: "user_view", email: "view@clinic.org" }])
          ),
        },
      } as never;
      await expect(getClaimIfAuthorized(mockCtx, "claim_1" as never)).resolves.toEqual({
        claim,
        userId: "user_view",
        accessRole: "viewer",
      });
    });

    it("requireClaimAccess permits viewers to read", async () => {
      vi.mocked(getAuthUserId).mockResolvedValue("user_view" as never);
      const claim = { _id: "claim_1", userId: "user_owner" };
      const mockCtx = {
        db: {
          get: vi.fn().mockImplementation((id: string) => {
            if (id === "claim_1") return Promise.resolve(claim);
            return Promise.resolve({ _id: "user_view", email: "view@clinic.org" });
          }),
          query: vi.fn().mockReturnValue(
            chainable([{ status: "active", role: "viewer", userId: "user_view", email: "view@clinic.org" }])
          ),
        },
      } as never;
      await expect(requireClaimAccess(mockCtx, "claim_1" as never)).resolves.toMatchObject({
        accessRole: "viewer",
      });
    });
  });

  describe("claimCollaborators mutations", () => {
    const owner = { _id: "user_owner", name: "Owner", email: "owner@clinic.org" };
    const claim = { _id: "claim_1", userId: "user_owner", claimNumber: "CLM-1" };

    function inviteCtx(overrides: {
      existingGrant?: unknown;
      existingUser?: unknown;
      claimDoc?: unknown;
      authUser?: string;
    } = {}) {
      vi.mocked(getAuthUserId).mockResolvedValue((overrides.authUser || "user_owner") as never);
      return {
        db: {
          get: vi.fn().mockImplementation((id: string) => {
            if (id === "claim_1") return Promise.resolve(overrides.claimDoc || claim);
            if (id === "user_owner") return Promise.resolve(owner);
            return Promise.resolve(null);
          }),
          query: vi.fn().mockImplementation((table: string) => {
            if (table === "users") {
              return {
                withIndex: vi.fn().mockReturnValue({
                  first: vi.fn().mockResolvedValue(overrides.existingUser || null),
                }),
              };
            }
            return {
              withIndex: vi.fn().mockReturnValue({
                first: vi.fn().mockResolvedValue(overrides.existingGrant || null),
                take: vi.fn().mockResolvedValue(
                  overrides.existingGrant ? [overrides.existingGrant] : []
                ),
              }),
            };
          }),
          insert: vi.fn().mockResolvedValue("doc_new" as never),
          patch: vi.fn().mockResolvedValue(undefined),
        },
      } as never;
    }

    it("invite creates an active grant and audit entry", async () => {
      const { invite } = await import("../convex/claimCollaborators");
      const mockCtx = inviteCtx();
      const result = await (invite as { _handler: (ctx: never, args: never) => Promise<unknown> })._handler(
        mockCtx,
        { claimId: "claim_1", email: "Teammate@Clinic.org", role: "editor" } as never
      );
      expect(result).toEqual({ success: true, email: "teammate@clinic.org", role: "editor" });
      const insert = (mockCtx as { db: { insert: ReturnType<typeof vi.fn> } }).db.insert;
      expect(insert).toHaveBeenCalledTimes(2);
      expect(insert.mock.calls[0][0]).toBe("claimCollaborators");
      expect(insert.mock.calls[0][1]).toMatchObject({ email: "teammate@clinic.org", role: "editor", status: "active" });
    });

    it("invite rejects self-invites, duplicates, bad emails, and non-owners", async () => {
      const { invite } = await import("../convex/claimCollaborators");
      const handler = (invite as { _handler: (ctx: never, args: never) => Promise<unknown> })._handler;

      await expect(
        handler(inviteCtx(), { claimId: "claim_1", email: "owner@clinic.org", role: "editor" } as never)
      ).rejects.toThrow(/yourself/i);

      await expect(
        handler(
          inviteCtx({ existingGrant: { status: "active", email: "dup@clinic.org" } }),
          { claimId: "claim_1", email: "dup@clinic.org", role: "viewer" } as never
        )
      ).rejects.toThrow(/already has access/i);

      await expect(
        handler(inviteCtx(), { claimId: "claim_1", email: "bad", role: "editor" } as never)
      ).rejects.toThrow(/Invalid email/i);

      await expect(
        handler(inviteCtx({ authUser: "user_attacker" }), {
          claimId: "claim_1",
          email: "friend@clinic.org",
          role: "editor",
        } as never)
      ).rejects.toThrow(/Forbidden/i);
    });

    it("owner can change roles and revoke, collaborators can leave, owners cannot leave", async () => {
      const mod = await import("../convex/claimCollaborators");
      const grant = { _id: "grant_1", status: "active", role: "viewer", email: "mate@clinic.org" };

      const roleCtx = inviteCtx({ existingGrant: grant });
      await expect(
        (mod.updateRole as { _handler: (ctx: never, args: never) => Promise<unknown> })._handler(roleCtx, {
          claimId: "claim_1",
          email: "mate@clinic.org",
          role: "editor",
        } as never)
      ).resolves.toEqual({ success: true });

      const removeCtx = inviteCtx({ existingGrant: grant });
      await expect(
        (mod.remove as { _handler: (ctx: never, args: never) => Promise<unknown> })._handler(removeCtx, {
          claimId: "claim_1",
          email: "mate@clinic.org",
        } as never)
      ).resolves.toEqual({ success: true });
      expect(
        (removeCtx as { db: { patch: ReturnType<typeof vi.fn> } }).db.patch
      ).toHaveBeenCalledWith("grant_1", expect.objectContaining({ status: "revoked" }));

      vi.mocked(getAuthUserId).mockResolvedValue("user_owner" as never);
      const ownerLeaveCtx = {
        db: {
          get: vi.fn().mockImplementation((id: string) => {
            if (id === "claim_1") return Promise.resolve(claim);
            return Promise.resolve(owner);
          }),
          query: vi.fn(),
          patch: vi.fn(),
          insert: vi.fn(),
        },
      } as never;
      await expect(
        (mod.leave as { _handler: (ctx: never, args: never) => Promise<unknown> })._handler(ownerLeaveCtx, {
          claimId: "claim_1",
        } as never)
      ).rejects.toThrow(/cannot leave/i);

      vi.mocked(getAuthUserId).mockResolvedValue("user_mate" as never);
      const mateLeaveCtx = {
        db: {
          get: vi.fn().mockImplementation((id: string) => {
            if (id === "claim_1") return Promise.resolve(claim);
            return Promise.resolve({ _id: "user_mate", email: "mate@clinic.org" });
          }),
          query: vi.fn().mockReturnValue(
            chainable([{ _id: "grant_1", status: "active", role: "editor", email: "mate@clinic.org" }])
          ),
          patch: vi.fn().mockResolvedValue(undefined),
          insert: vi.fn().mockResolvedValue("log_1" as never),
        },
      } as never;
      await expect(
        (mod.leave as { _handler: (ctx: never, args: never) => Promise<unknown> })._handler(mateLeaveCtx, {
          claimId: "claim_1",
        } as never)
      ).resolves.toEqual({ success: true });
    });
  });
});
