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

  const sharedOwner = { _id: "user_owner", name: "Owner", email: "owner@clinic.org" };
  const sharedClaim = { _id: "claim_1", userId: "user_owner", claimNumber: "CLM-1" };

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
          if (id === "claim_1") return Promise.resolve(overrides.claimDoc || sharedClaim);
          if (id === "user_owner") return Promise.resolve(sharedOwner);
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
    const owner = sharedOwner;
    const claim = sharedClaim;

    it("invite creates a pending grant (never immediate access) plus audit entry", async () => {
      const { invite } = await import("../convex/claimCollaborators");
      const mockCtx = inviteCtx();
      const result = await (invite as { _handler: (ctx: never, args: never) => Promise<unknown> })._handler(
        mockCtx,
        { claimId: "claim_1", email: "Teammate@Clinic.org", role: "editor" } as never
      );
      expect(result).toEqual({ success: true, email: "teammate@clinic.org", role: "editor", status: "pending" });
      const insert = (mockCtx as { db: { insert: ReturnType<typeof vi.fn> } }).db.insert;
      expect(insert).toHaveBeenCalledTimes(2);
      expect(insert.mock.calls[0][0]).toBe("claimCollaborators");
      expect(insert.mock.calls[0][1]).toMatchObject({ email: "teammate@clinic.org", role: "editor", status: "pending" });
    });

    it("invite refreshes duplicate pending invites instead of duplicating rows", async () => {
      const { invite } = await import("../convex/claimCollaborators");
      const mockCtx = inviteCtx({
        existingGrant: { _id: "grant_p", status: "pending", role: "viewer", email: "again@clinic.org" },
      });
      const result = await (invite as { _handler: (ctx: never, args: never) => Promise<unknown> })._handler(
        mockCtx,
        { claimId: "claim_1", email: "again@clinic.org", role: "editor" } as never
      );
      expect(result).toEqual({ success: true, email: "again@clinic.org", role: "editor", status: "pending", updated: true });
      expect(
        (mockCtx as { db: { patch: ReturnType<typeof vi.fn> } }).db.patch
      ).toHaveBeenCalledWith("grant_p", expect.objectContaining({ role: "editor" }));
    });

    it("invite rejects self-invites, active duplicates, bad emails, and non-owners", async () => {
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

    it("invite enforces the per-owner rate limit when the limiter is configured", async () => {
      const { rateLimiter } = await import("../convex/lib/rateLimiter");
      vi.spyOn(rateLimiter, "limit").mockResolvedValueOnce({ ok: false, retryAfter: 30000 } as never);
      const { invite } = await import("../convex/claimCollaborators");
      await expect(
        (invite as { _handler: (ctx: never, args: never) => Promise<unknown> })._handler(
          inviteCtx(),
          { claimId: "claim_1", email: "throttled@clinic.org", role: "editor" } as never
        )
      ).rejects.toThrow(/Invite rate limit exceeded/i);
    });

    it("invite caps pending invites per recipient inbox", async () => {
      const { invite, MAX_PENDING_INVITES_PER_EMAIL } = await import("../convex/claimCollaborators");
      expect(MAX_PENDING_INVITES_PER_EMAIL).toBeGreaterThan(0);
      const fifty = Array.from({ length: MAX_PENDING_INVITES_PER_EMAIL }, (_, index) => ({
        _id: `grant_cap_${index}`,
        status: "pending",
        email: "popular@clinic.org",
      }));
      vi.mocked(getAuthUserId).mockResolvedValue("user_owner" as never);
      const mockCtx = {
        db: {
          get: vi.fn().mockImplementation((id: string) => {
            if (id === "claim_1") return Promise.resolve(claim);
            return Promise.resolve(owner);
          }),
          query: vi.fn().mockImplementation((table: string) => {
            if (table === "users") {
              return { withIndex: vi.fn().mockReturnValue({ first: vi.fn().mockResolvedValue(null) }) };
            }
            return {
              withIndex: vi.fn().mockImplementation((name: string) => {
                if (name === "by_claim_and_email") {
                  return { first: vi.fn().mockResolvedValue(null) };
                }
                return { first: vi.fn().mockResolvedValue(null), take: vi.fn().mockResolvedValue(fifty) };
              }),
            };
          }),
          insert: vi.fn().mockResolvedValue("doc_new" as never),
          patch: vi.fn().mockResolvedValue(undefined),
        },
      } as never;
      await expect(
        (invite as { _handler: (ctx: never, args: never) => Promise<unknown> })._handler(
          mockCtx,
          { claimId: "claim_1", email: "popular@clinic.org", role: "viewer" } as never
        )
      ).rejects.toThrow(/maximum number of pending/i);
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

  describe("invite accept / decline handshake", () => {
    const pendingEmailGrant = {
      _id: "grant_inv",
      status: "pending",
      role: "editor",
      email: "invited@clinic.org",
    };

    function memberCtx(authUser: string, grant: unknown) {
      vi.mocked(getAuthUserId).mockResolvedValue(authUser as never);
      return {
        db: {
          get: vi.fn().mockImplementation((id: string) => {
            if (id === "claim_1") return Promise.resolve(sharedClaim);
            if (id === authUser) {
              return Promise.resolve({ _id: authUser, email: "invited@clinic.org", name: "Invited Mate" });
            }
            return Promise.resolve(null);
          }),
          query: vi.fn().mockReturnValue(chainable(grant ? [grant] : [])),
          insert: vi.fn().mockResolvedValue("log_1" as never),
          patch: vi.fn().mockResolvedValue(undefined),
        },
      } as never;
    }

    it("accept activates a pending email-keyed invite and resolves the userId", async () => {
      const mod = await import("../convex/claimCollaborators");
      const mockCtx = memberCtx("user_newbie", pendingEmailGrant);
      const result = await (
        mod.accept as { _handler: (ctx: never, args: never) => Promise<unknown> }
      )._handler(mockCtx, { claimId: "claim_1" } as never);
      expect(result).toEqual({ success: true, role: "editor" });
      expect(
        (mockCtx as { db: { patch: ReturnType<typeof vi.fn> } }).db.patch
      ).toHaveBeenCalledWith("grant_inv", expect.objectContaining({ status: "active", userId: "user_newbie" }));
    });

    it("accept rejects strangers, owners, and non-pending grants", async () => {
      const mod = await import("../convex/claimCollaborators");
      const accept = (mod.accept as { _handler: (ctx: never, args: never) => Promise<unknown> })._handler;

      await expect(accept(memberCtx("user_stranger", null), { claimId: "claim_1" } as never)).rejects.toThrow(
        /No pending invite/i
      );

      vi.mocked(getAuthUserId).mockResolvedValue("user_owner" as never);
      const ownerCtx = {
        db: {
          get: vi.fn().mockImplementation((id: string) => {
            if (id === "claim_1") return Promise.resolve(sharedClaim);
            return Promise.resolve(sharedOwner);
          }),
          query: vi.fn(),
          patch: vi.fn(),
          insert: vi.fn(),
        },
      } as never;
      await expect(accept(ownerCtx, { claimId: "claim_1" } as never)).rejects.toThrow(/already own/i);

      const activeCtx = memberCtx("user_mate", { ...pendingEmailGrant, status: "active" });
      await expect(accept(activeCtx, { claimId: "claim_1" } as never)).rejects.toThrow(/No pending invite/i);
    });

    it("decline tombstones the invite without granting access", async () => {
      const mod = await import("../convex/claimCollaborators");
      const mockCtx = memberCtx("user_newbie", pendingEmailGrant);
      await expect(
        (mod.decline as { _handler: (ctx: never, args: never) => Promise<unknown> })._handler(mockCtx, {
          claimId: "claim_1",
        } as never)
      ).resolves.toEqual({ success: true });
      expect(
        (mockCtx as { db: { patch: ReturnType<typeof vi.fn> } }).db.patch
      ).toHaveBeenCalledWith("grant_inv", expect.objectContaining({ status: "declined" }));
    });

    it("cancelInvite lets owners withdraw pending invites only", async () => {
      const mod = await import("../convex/claimCollaborators");
      const cancel = (mod.cancelInvite as { _handler: (ctx: never, args: never) => Promise<unknown> })._handler;

      const pendingCtx = inviteCtx({ existingGrant: pendingEmailGrant });
      await expect(
        cancel(pendingCtx, { claimId: "claim_1", email: "invited@clinic.org" } as never)
      ).resolves.toEqual({ success: true });
      expect(
        (pendingCtx as { db: { patch: ReturnType<typeof vi.fn> } }).db.patch
      ).toHaveBeenCalledWith("grant_inv", expect.objectContaining({ status: "revoked" }));

      const activeCtx = inviteCtx({
        existingGrant: { _id: "grant_a", status: "active", email: "member@clinic.org" },
      });
      await expect(
        cancel(activeCtx, { claimId: "claim_1", email: "member@clinic.org" } as never)
      ).rejects.toThrow(/removed instead/i);

      const attackerCtx = inviteCtx({ authUser: "user_attacker", existingGrant: pendingEmailGrant });
      await expect(
        cancel(attackerCtx, { claimId: "claim_1", email: "invited@clinic.org" } as never)
      ).rejects.toThrow(/Forbidden/i);
    });

    it("pending grants confer no claim access", async () => {
      const { getClaimIfAuthorized } = await import("../convex/lib/auth");
      vi.mocked(getAuthUserId).mockResolvedValue("user_newbie" as never);
      const mockCtx = {
        db: {
          get: vi.fn().mockImplementation((id: string) => {
            if (id === "claim_1") return Promise.resolve({ _id: "claim_1", userId: "user_owner" });
            return Promise.resolve({ _id: "user_newbie", email: "invited@clinic.org" });
          }),
          query: vi.fn().mockReturnValue(chainable([pendingEmailGrant])),
        },
      } as never;
      await expect(getClaimIfAuthorized(mockCtx, "claim_1" as never)).resolves.toBeNull();
    });

    it("getInviteStatus reports each state and null for strangers", async () => {
      const mod = await import("../convex/claimCollaborators");
      const status = (mod.getInviteStatus as { _handler: (ctx: never, args: never) => Promise<unknown> })._handler;

      for (const grantStatus of ["pending", "declined", "active", "revoked"]) {
        const mockCtx = memberCtx("user_newbie", { ...pendingEmailGrant, status: grantStatus });
        await expect(status(mockCtx, { claimId: "claim_1" } as never)).resolves.toBe(grantStatus);
      }

      const strangerCtx = memberCtx("user_stranger", null);
      await expect(status(strangerCtx, { claimId: "claim_1" } as never)).resolves.toBeNull();
    });
  });

  describe("invitation inbox privacy and roster scoping", () => {
    it("listMyInvites exposes only decision-safe fields for the caller's pending invites", async () => {
      const mod = await import("../convex/claimCollaborators");
      vi.mocked(getAuthUserId).mockResolvedValue("user_newbie" as never);
      const grantA = {
        _id: "grant_a",
        claimId: "claim_1",
        status: "pending",
        role: "editor",
        email: "invited@clinic.org",
        invitedBy: "user_owner",
        createdAt: 2000,
      };
      const grantRevokedMine = {
        _id: "grant_old",
        claimId: "claim_9",
        status: "revoked",
        role: "viewer",
        email: "invited@clinic.org",
        userId: "user_newbie",
        invitedBy: "user_owner",
        createdAt: 1000,
      };
      const mockCtx = {
        db: {
          get: vi.fn().mockImplementation((id: string) => {
            if (id === "user_newbie") {
              return Promise.resolve({ _id: "user_newbie", email: "invited@clinic.org" });
            }
            if (id === "claim_1") {
              return Promise.resolve({ _id: "claim_1", claimNumber: "CLM-1", patientName: "Private Patient", deniedAmount: 9999 });
            }
            if (id === "claim_9") return Promise.resolve({ _id: "claim_9", claimNumber: "CLM-9" });
            if (id === "user_owner") return Promise.resolve({ _id: "user_owner", name: "Owner", email: "owner@clinic.org" });
            return Promise.resolve(null);
          }),
          query: vi.fn().mockImplementation((table: string) => {
            if (table !== "claimCollaborators") throw new Error(`unexpected table ${table}`);
            return {
              withIndex: vi.fn().mockImplementation((name: string) => {
                if (name === "by_user") {
                  // Includes a revoked row to prove status filtering.
                  return { take: vi.fn().mockResolvedValue([grantA, grantRevokedMine]) };
                }
                // by_email_and_status is email-scoped like the real index.
                return { take: vi.fn().mockResolvedValue([grantA]) };
              }),
            };
          }),
        },
      } as never;
      const invites = (await (
        mod.listMyInvites as { _handler: (ctx: never) => Promise<Array<Record<string, unknown>>> }
      )._handler(mockCtx)) as Array<Record<string, unknown>>;
      expect(invites).toHaveLength(1);
      expect(invites[0]).toEqual({
        claimId: "claim_1",
        claimNumber: "CLM-1",
        role: "editor",
        invitedBy: "Owner",
        invitedAt: 2000,
      });
      expect(Object.keys(invites[0]).sort()).toEqual(
        ["claimId", "claimNumber", "invitedBy", "invitedAt", "role"].sort()
      );
    });

    it("listByClaim hides pending and declined invites from non-owners", async () => {
      const mod = await import("../convex/claimCollaborators");
      const grants = [
        { _id: "g_active", status: "active", role: "editor", email: "ed@clinic.org", userId: "user_ed" },
        { _id: "g_pending", status: "pending", role: "viewer", email: "wait@clinic.org" },
        { _id: "g_declined", status: "declined", role: "viewer", email: "nope@clinic.org" },
        { _id: "g_revoked", status: "revoked", role: "viewer", email: "gone@clinic.org" },
      ];
      const users: Record<string, { _id: string; name?: string; email?: string }> = {
        user_owner: { _id: "user_owner", name: "Owner", email: "owner@clinic.org" },
        user_ed: { _id: "user_ed", name: "Ed", email: "ed@clinic.org" },
      };
      const rosterCtx = (authUser: string) => {
        vi.mocked(getAuthUserId).mockResolvedValue(authUser as never);
        return {
          db: {
            get: vi.fn().mockImplementation((id: string) => {
              if (id === "claim_1") return Promise.resolve({ _id: "claim_1", userId: "user_owner" });
              return Promise.resolve(users[id] ?? null);
            }),
            query: vi.fn().mockReturnValue(chainable(grants)),
          },
        } as never;
      };
      const list = mod.listByClaim as { _handler: (ctx: never, args: never) => Promise<Array<{ email: string; status: string }>> };

      const ownerRoster = await list._handler(rosterCtx("user_owner"), { claimId: "claim_1" } as never);
      expect(ownerRoster.map((entry) => entry.email).sort()).toEqual(
        ["ed@clinic.org", "nope@clinic.org", "owner@clinic.org", "wait@clinic.org"].sort()
      );

      const memberRoster = await list._handler(rosterCtx("user_ed"), { claimId: "claim_1" } as never);
      expect(memberRoster.map((entry) => entry.email).sort()).toEqual(
        ["ed@clinic.org", "owner@clinic.org"].sort()
      );
    });
  });

  describe("invite hardening", () => {
    it("accept refuses when the pending invite is linked to a different account", async () => {
      const mod = await import("../convex/claimCollaborators");
      vi.mocked(getAuthUserId).mockResolvedValue("user_intruder" as never);
      const mockCtx = {
        db: {
          get: vi.fn().mockImplementation((id: string) => {
            if (id === "claim_1") return Promise.resolve(sharedClaim);
            if (id === "user_intruder") {
              return Promise.resolve({ _id: "user_intruder", email: "shared@clinic.org" });
            }
            return Promise.resolve(null);
          }),
          // Same inbox address on two accounts: one linked, one not.
          query: vi.fn().mockReturnValue(
            chainable([
              { _id: "grant_linked", status: "pending", role: "editor", email: "shared@clinic.org", userId: "user_other" },
            ])
          ),
          insert: vi.fn().mockResolvedValue("log_1" as never),
          patch: vi.fn().mockResolvedValue(undefined),
        },
      } as never;
      await expect(
        (mod.accept as { _handler: (ctx: never, args: never) => Promise<unknown> })._handler(mockCtx, {
          claimId: "claim_1",
        } as never)
      ).rejects.toThrow(/different account/i);
      expect(
        (mockCtx as { db: { patch: ReturnType<typeof vi.fn> } }).db.patch
      ).not.toHaveBeenCalled();
    });

    it("purgeClaimInternal deletes a claim's grants and continues past full batches", async () => {
      const mod = await import("../convex/claimCollaborators");
      const purge = mod.purgeClaimInternal as {
        _handler: (ctx: never, args: never) => Promise<unknown>;
      };
      const rows = [{ _id: "grant_gone", claimId: "claim_1", status: "revoked" as const }];
      const deleted: string[] = [];
      const scheduled: unknown[] = [];
      const mockCtx = {
        db: {
          query: vi.fn().mockReturnValue({
            withIndex: vi.fn().mockReturnValue({
              take: vi.fn().mockImplementation((limit: number) => Promise.resolve(rows.slice(0, limit))),
            }),
          }),
          delete: vi.fn().mockImplementation((id: string) => {
            deleted.push(id);
            const index = rows.findIndex((row) => row._id === id);
            if (index >= 0) rows.splice(index, 1);
            return Promise.resolve();
          }),
        },
        scheduler: {
          runAfter: vi.fn().mockImplementation(async (_delay: number, _fn: unknown, args: unknown) => {
            scheduled.push(args);
          }),
        },
      } as never;
      await purge._handler(mockCtx, { claimId: "claim_1" } as never);
      expect(deleted).toEqual(["grant_gone"]);
      expect(scheduled).toHaveLength(0);
    });
  });
});
