import { describe, it, expect, vi, beforeEach } from "vitest";
import { getAuthUserId } from "@convex-dev/auth/server";
import {
  requireAuthUser,
  requireIdentity,
  requireClaimOwner,
  requireClaimOwnerAction,
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

    it("rejects access when claim has no assigned owner (unassigned shared intake)", async () => {
      vi.mocked(getAuthUserId).mockResolvedValue("user_random_123" as any);
      const mockCtx: any = {
        db: {
          get: vi.fn().mockResolvedValue({
            _id: "claim_unassigned",
            userId: undefined,
            claimNumber: "CLM-INTAKE-001",
          }),
        },
      };

      await expect(requireClaimOwner(mockCtx, "claim_unassigned" as any)).rejects.toThrow(
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

    it("returns null when claim has no assigned owner (unassigned shared intake)", async () => {
      vi.mocked(getAuthUserId).mockResolvedValue("user_tenant_A" as any);
      const mockClaim = {
        _id: "claim_unassigned",
        userId: undefined,
        claimNumber: "CLM-PHI-000",
      };

      const mockCtx: any = {
        db: {
          get: vi.fn().mockResolvedValue(mockClaim),
        },
      };

      const result = await getClaimIfAuthorized(mockCtx, "claim_unassigned" as any);
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

      // Mutating unassigned session -> throws
      const unassignedSession = {
        _id: "session_unassigned",
        userId: undefined,
        title: "Unassigned Chat",
      };
      const unassignedCtx: any = {
        db: {
          get: vi.fn().mockResolvedValue(unassignedSession),
        },
      };
      await expect(requireChatbotSessionOwner(unassignedCtx, "session_unassigned" as any)).rejects.toThrow(/Forbidden/i);

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
      const mockUnassignedSession = {
        _id: "session_unassigned",
        userId: undefined,
        title: "Unassigned Session",
      };

      const mockCtx: any = {
        db: {
          get: vi.fn().mockImplementation((id) => {
            if (id === "session_xyz") return Promise.resolve(mockSession);
            if (id === "session_unassigned") return Promise.resolve(mockUnassignedSession);
            return Promise.resolve(null);
          }),
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

      // Case 4: unassigned session (no userId) -> null
      vi.mocked(getAuthUserId).mockResolvedValue("user_alice" as any);
      expect(await getChatbotSessionIfAuthorized(mockCtx, "session_unassigned" as any)).toBeNull();

      // Case 5: authorized user (Alice) -> session
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
      await expect(requireOwner(mockCtx, { _id: "doc_1" as any, userId: undefined })).rejects.toThrow(/Forbidden/i);

      const doc = { _id: "doc_1" as any, userId: "user_1" as any };
      const verified = await requireOwner(mockCtx, doc);
      expect(verified).toEqual({ doc, userId: "user_1" });
    });
  });

  describe("requireClaimOwnerAction (ActionCtx guard)", () => {
    it("throws Unauthorized error when caller is unauthenticated in an Action", async () => {
      vi.mocked(getAuthUserId).mockResolvedValue(null);
      const mockActionCtx: any = {
        runQuery: vi.fn(),
      };

      await expect(
        requireClaimOwnerAction(mockActionCtx, "claim_123" as any)
      ).rejects.toThrow(/Unauthorized/i);
      expect(mockActionCtx.runQuery).not.toHaveBeenCalled();
    });

    it("throws not found when claim does not exist in Action", async () => {
      vi.mocked(getAuthUserId).mockResolvedValue("user_123" as any);
      const mockActionCtx: any = {
        runQuery: vi.fn().mockResolvedValue(null),
      };

      await expect(
        requireClaimOwnerAction(mockActionCtx, "claim_nonexistent" as any)
      ).rejects.toThrow("Claim claim_nonexistent not found");
    });

    it("rejects access when authenticated user does not own the claim in an Action", async () => {
      vi.mocked(getAuthUserId).mockResolvedValue("user_attacker_456" as any);
      const mockActionCtx: any = {
        runQuery: vi.fn().mockResolvedValue({
          _id: "claim_secret_789",
          userId: "user_victim_123",
          claimNumber: "CLM-SEC-001",
        }),
      };

      await expect(
        requireClaimOwnerAction(mockActionCtx, "claim_secret_789" as any)
      ).rejects.toThrow("Forbidden: You do not have permission to access this claim");
    });

    it("rejects access when claim has no userId (unassigned intake) in an Action", async () => {
      vi.mocked(getAuthUserId).mockResolvedValue("user_123" as any);
      const mockActionCtx: any = {
        runQuery: vi.fn().mockResolvedValue({
          _id: "claim_unassigned",
          userId: undefined,
          claimNumber: "CLM-INTAKE-002",
        }),
      };

      await expect(
        requireClaimOwnerAction(mockActionCtx, "claim_unassigned" as any)
      ).rejects.toThrow("Forbidden: You do not have permission to access this claim");
    });

    it("permits access and returns claim when caller is verified claim owner in an Action", async () => {
      vi.mocked(getAuthUserId).mockResolvedValue("user_owner_123" as any);
      const mockClaim = {
        _id: "claim_789",
        userId: "user_owner_123",
        claimNumber: "CLM-789",
      };
      const mockActionCtx: any = {
        runQuery: vi.fn().mockResolvedValue(mockClaim),
      };

      const result = await requireClaimOwnerAction(mockActionCtx, "claim_789" as any);
      expect(result).toEqual({ claim: mockClaim, userId: "user_owner_123" });
    });
  });

  describe("Precedent Vector Archive Authorization & Data Isolation", () => {
    it("attachMatchesToClaim rejects mutation if claim does not exist", async () => {
      const { attachMatchesToClaim } = await import("../convex/precedents");
      const mockCtx: any = {
        db: {
          get: vi.fn().mockResolvedValue(null),
        },
      };

      await expect(
        (attachMatchesToClaim as any)._handler(mockCtx, {
          claimId: "claim_missing" as any,
          matches: [],
        })
      ).rejects.toThrow("Claim claim_missing not found");
    });

    it("attachMatchesToClaim rejects mutation if caller does not own the target claim", async () => {
      vi.mocked(getAuthUserId).mockResolvedValue("user_attacker" as any);
      const { attachMatchesToClaim } = await import("../convex/precedents");
      const mockCtx: any = {
        db: {
          get: vi.fn().mockResolvedValue({
            _id: "claim_victim",
            userId: "user_victim",
          }),
        },
      };

      await expect(
        (attachMatchesToClaim as any)._handler(mockCtx, {
          claimId: "claim_victim" as any,
          matches: [],
        })
      ).rejects.toThrow("Forbidden: You do not have permission to access this claim");
    });
  });

  describe("M1 & M3 & M7 Hardening Verification", () => {
    it("M1: claims.search returns empty array and does not query search index when unauthenticated", async () => {
      vi.mocked(getAuthUserId).mockResolvedValue(null);
      const { search } = await import("../convex/claims");
      const mockCtx: any = {
        db: {
          query: vi.fn(),
        },
      };

      const results = await (search as any)._handler(mockCtx, { query: "lumbar spinal surgery" });
      expect(results).toEqual([]);
      expect(mockCtx.db.query).not.toHaveBeenCalled();
    });

    it("M1: claims.search filters strictly by authenticated userId", async () => {
      vi.mocked(getAuthUserId).mockResolvedValue("user_authenticated_100" as any);
      const { search } = await import("../convex/claims");
      const mockTake = vi.fn().mockResolvedValue([
        { _id: "c1", userId: "user_authenticated_100", denialReasonDescription: "lumbar spinal surgery" },
        { _id: "c2", userId: "user_other_999", denialReasonDescription: "lumbar spinal surgery leaked" },
      ]);
      const mockWithSearchIndex = vi.fn().mockReturnValue({ take: mockTake });
      const mockCtx: any = {
        db: {
          query: vi.fn().mockReturnValue({ withSearchIndex: mockWithSearchIndex }),
        },
      };

      const results = await (search as any)._handler(mockCtx, { query: "lumbar", limit: 10 });
      // Only returns records where userId strictly matches authenticated user
      expect(results).toEqual([
        { _id: "c1", userId: "user_authenticated_100", denialReasonDescription: "lumbar spinal surgery" },
      ]);
    });

    it("M3: appeals.getLatestByClaim returns latest draft even if claim status is analyzing or parsing", async () => {
      vi.mocked(getAuthUserId).mockResolvedValue("user_owner" as any);
      const { getLatestByClaim } = await import("../convex/appeals");
      const mockClaim = { _id: "claim_analyzing", userId: "user_owner", status: "analyzing" };
      const mockAppeals = [
        { _id: "app_1", claimId: "claim_analyzing", version: 1, executiveSummary: "Draft v1" },
        { _id: "app_2", claimId: "claim_analyzing", version: 2, executiveSummary: "Draft v2" },
      ];
      const mockCtx: any = {
        db: {
          get: vi.fn().mockResolvedValue(mockClaim),
          query: vi.fn().mockReturnValue({
            withIndex: vi.fn().mockReturnValue({
              collect: vi.fn().mockResolvedValue(mockAppeals),
            }),
          }),
        },
      };

      const latest = await (getLatestByClaim as any)._handler(mockCtx, { claimId: "claim_analyzing" as any });
      expect(latest?.version).toBe(2);
      expect(latest?._id).toBe("app_2");
    });

    it("M7: emails.getOrCreateThread uses indexed first() and patches existing thread", async () => {
      vi.mocked(getAuthUserId).mockResolvedValue("user_owner" as any);
      const { getOrCreateThread } = await import("../convex/emails");
      const mockClaim = { _id: "claim_123", userId: "user_owner" };
      const existingThread = { _id: "thread_existing", claimId: "claim_123", agentEmail: "old@agent.com" };

      const mockFirst = vi.fn().mockResolvedValue(existingThread);
      const mockWithIndex = vi.fn().mockReturnValue({ first: mockFirst });
      const mockPatch = vi.fn().mockResolvedValue(undefined);

      const mockCtx: any = {
        db: {
          get: vi.fn().mockResolvedValue(mockClaim),
          query: vi.fn().mockReturnValue({ withIndex: mockWithIndex }),
          patch: mockPatch,
        },
      };

      const threadId = await (getOrCreateThread as any)._handler(mockCtx, {
        claimId: "claim_123" as any,
        agentEmail: "new@agent.com",
        payerEmail: "appeals@payer.com",
        subject: "Urgent ERISA Appeal",
      });

      expect(threadId).toBe("thread_existing");
      expect(mockFirst).toHaveBeenCalled();
      expect(mockPatch).toHaveBeenCalledWith("thread_existing", {
        agentEmail: "new@agent.com",
        payerEmail: "appeals@payer.com",
        subject: "Urgent ERISA Appeal",
      });
    });

    it("M2: opticalParser rejects oversized uploads exceeding 15MB gate", async () => {
      const { parseDenialDocument } = await import("../convex/actions/opticalParser");
      const mockCtx: any = {
        runMutation: vi.fn().mockResolvedValue({ ok: true }),
        runQuery: vi.fn().mockResolvedValue(null),
        storage: {
          getUrl: vi.fn().mockResolvedValue("https://convex.mock/file.pdf"),
        },
      };

      // Mock fetch returning oversized header
      const originalFetch = global.fetch;
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        statusText: "OK",
        headers: {
          get: (name: string) => {
            if (name.toLowerCase() === "content-length") return String(20 * 1024 * 1024); // 20MB
            if (name.toLowerCase() === "content-type") return "application/pdf";
            return null;
          },
        },
      }) as any;

      try {
        await expect(
          (parseDenialDocument as any)._handler(mockCtx, {
            storageId: "storage_oversized" as any,
          })
        ).rejects.toThrow(/exceeds the 15 MB intake limit/i);
      } finally {
        global.fetch = originalFetch;
      }
    });

    it("M2: opticalParser rejects unsupported binary executable formats", async () => {
      const { parseDenialDocument } = await import("../convex/actions/opticalParser");
      const mockCtx: any = {
        runMutation: vi.fn().mockResolvedValue({ ok: true }),
        runQuery: vi.fn().mockResolvedValue(null),
        storage: {
          getUrl: vi.fn().mockResolvedValue("https://convex.mock/file.bin"),
        },
      };

      const binaryBytes = new Uint8Array([0x00, 0x01, 0x02, 0x03, 0xff]); // binary non-text non-image
      const originalFetch = global.fetch;
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        statusText: "OK",
        headers: {
          get: (name: string) => {
            if (name.toLowerCase() === "content-length") return String(binaryBytes.length);
            if (name.toLowerCase() === "content-type") return "application/x-executable";
            return null;
          },
        },
        arrayBuffer: vi.fn().mockResolvedValue(binaryBytes.buffer),
      }) as any;

      try {
        await expect(
          (parseDenialDocument as any)._handler(mockCtx, {
            storageId: "storage_bin" as any,
          })
        ).rejects.toThrow(/Unsupported document format/i);
      } finally {
        global.fetch = originalFetch;
      }
    });
  });

  describe("Public Actions IDOR & Unauthorized Spend Guards (requireClaimOwnerAction)", () => {
    const claimOtherUser = {
      _id: "claim_victim_456",
      userId: "user_victim_456",
      claimNumber: "CLM-VIC-456",
      patient: { name: "Victim Patient", insurancePayer: "Aetna" },
      cptCodes: ["63047"],
      icd10Codes: ["M51.16"],
      denialReasonCode: "CO-50",
    };

    const makeMockCtx = (authenticatedUserId: string | null) => {
      vi.mocked(getAuthUserId).mockResolvedValue(authenticatedUserId as any);
      return {
        runQuery: vi.fn().mockImplementation((fn, args) => {
          if (args?.claimId === "claim_victim_456") {
            return Promise.resolve(claimOtherUser);
          }
          return Promise.resolve(null);
        }),
        runMutation: vi.fn().mockResolvedValue(undefined),
        runAction: vi.fn().mockResolvedValue(undefined),
      };
    };

    it("mailDispatcher: rejects unauthenticated caller and non-owner (IDOR guard)", async () => {
      const { dispatchAppealPacket, sendOutboundMessage, generateAutoReplyDraft } = await import(
        "../convex/actions/mailDispatcher"
      );

      // 1. Unauthenticated caller
      const unauthCtx = makeMockCtx(null);
      await expect(
        (dispatchAppealPacket as any)._handler(unauthCtx, { claimId: "claim_victim_456" })
      ).rejects.toThrow(/Unauthorized/i);
      await expect(
        (sendOutboundMessage as any)._handler(unauthCtx, { claimId: "claim_victim_456", text: "hi" })
      ).rejects.toThrow(/Unauthorized/i);
      await expect(
        (generateAutoReplyDraft as any)._handler(unauthCtx, { claimId: "claim_victim_456" })
      ).rejects.toThrow(/Unauthorized/i);

      // 2. Authenticated attacker attempting IDOR on victim's claim
      const attackerCtx = makeMockCtx("user_attacker_999");
      await expect(
        (dispatchAppealPacket as any)._handler(attackerCtx, { claimId: "claim_victim_456" })
      ).rejects.toThrow(/Forbidden/i);
      await expect(
        (sendOutboundMessage as any)._handler(attackerCtx, { claimId: "claim_victim_456", text: "hi" })
      ).rejects.toThrow(/Forbidden/i);
      await expect(
        (generateAutoReplyDraft as any)._handler(attackerCtx, { claimId: "claim_victim_456" })
      ).rejects.toThrow(/Forbidden/i);
    });

    it("appealSynthesizer: rejects unauthenticated caller and non-owner (LLM spend guard)", async () => {
      const { generateAppealBrief } = await import("../convex/actions/appealSynthesizer");

      const unauthCtx = makeMockCtx(null);
      await expect(
        (generateAppealBrief as any)._handler(unauthCtx, { claimId: "claim_victim_456" })
      ).rejects.toThrow(/Unauthorized/i);

      const attackerCtx = makeMockCtx("user_attacker_999");
      await expect(
        (generateAppealBrief as any)._handler(attackerCtx, { claimId: "claim_victim_456" })
      ).rejects.toThrow(/Forbidden/i);
    });

    it("policyCrawler: rejects unauthenticated caller and non-owner on all crawl endpoints", async () => {
      const {
        crawlInsurerPolicy,
        crawlPubMedAndTrials,
        crawlFdaIndications,
        crawlCustomResearchUrl,
        crawlMultiSourceHub,
      } = await import("../convex/actions/policyCrawler");

      const unauthCtx = makeMockCtx(null);
      await expect(
        (crawlInsurerPolicy as any)._handler(unauthCtx, {
          claimId: "claim_victim_456",
          payer: "Aetna",
          cptCodes: ["63047"],
          icd10Codes: ["M51.16"],
          denialReasonCode: "CO-50",
        })
      ).rejects.toThrow(/Unauthorized/i);

      await expect(
        (crawlPubMedAndTrials as any)._handler(unauthCtx, {
          claimId: "claim_victim_456",
          cptCodes: ["63047"],
          icd10Codes: ["M51.16"],
          denialReasonCode: "CO-50",
        })
      ).rejects.toThrow(/Unauthorized/i);

      await expect(
        (crawlFdaIndications as any)._handler(unauthCtx, {
          claimId: "claim_victim_456",
          cptCodes: ["63047"],
          icd10Codes: ["M51.16"],
          denialReasonCode: "CO-50",
        })
      ).rejects.toThrow(/Unauthorized/i);

      await expect(
        (crawlCustomResearchUrl as any)._handler(unauthCtx, {
          claimId: "claim_victim_456",
          customUrl: "https://nih.gov/guidelines",
        })
      ).rejects.toThrow(/Unauthorized/i);

      await expect(
        (crawlMultiSourceHub as any)._handler(unauthCtx, {
          claimId: "claim_victim_456",
          payer: "Aetna",
          cptCodes: ["63047"],
          icd10Codes: ["M51.16"],
          denialReasonCode: "CO-50",
        })
      ).rejects.toThrow(/Unauthorized/i);

      // Authenticated attacker attempting IDOR on victim's claim
      const attackerCtx = makeMockCtx("user_attacker_999");
      await expect(
        (crawlInsurerPolicy as any)._handler(attackerCtx, {
          claimId: "claim_victim_456",
          payer: "Aetna",
          cptCodes: ["63047"],
          icd10Codes: ["M51.16"],
          denialReasonCode: "CO-50",
        })
      ).rejects.toThrow(/Forbidden/i);
    });

    it("payerContactResolver: rejects unauthenticated caller and non-owner", async () => {
      const { resolvePayerGateway } = await import("../convex/actions/payerContactResolver");

      const unauthCtx = makeMockCtx(null);
      await expect(
        (resolvePayerGateway as any)._handler(unauthCtx, { claimId: "claim_victim_456" })
      ).rejects.toThrow(/Unauthorized/i);

      const attackerCtx = makeMockCtx("user_attacker_999");
      await expect(
        (resolvePayerGateway as any)._handler(attackerCtx, { claimId: "claim_victim_456" })
      ).rejects.toThrow(/Forbidden/i);
    });

    it("p2pDefenseGenerator & p2pLiveCopilot: reject unauthenticated caller and non-owner", async () => {
      const { generateP2PScript } = await import("../convex/actions/p2pDefenseGenerator");
      const { generateLiveFastAnswer, generateInteractiveReviewerPushback } = await import(
        "../convex/actions/p2pLiveCopilot"
      );

      const unauthCtx = makeMockCtx(null);
      await expect(
        (generateP2PScript as any)._handler(unauthCtx, { claimId: "claim_victim_456" })
      ).rejects.toThrow(/Unauthorized/i);
      await expect(
        (generateLiveFastAnswer as any)._handler(unauthCtx, {
          claimId: "claim_victim_456",
          recentTranscript: "objection",
        })
      ).rejects.toThrow(/Unauthorized/i);
      await expect(
        (generateInteractiveReviewerPushback as any)._handler(unauthCtx, {
          claimId: "claim_victim_456",
          doctorSpeech: "rebuttal",
        })
      ).rejects.toThrow(/Unauthorized/i);

      const attackerCtx = makeMockCtx("user_attacker_999");
      await expect(
        (generateP2PScript as any)._handler(attackerCtx, { claimId: "claim_victim_456" })
      ).rejects.toThrow(/Forbidden/i);
      await expect(
        (generateLiveFastAnswer as any)._handler(attackerCtx, {
          claimId: "claim_victim_456",
          recentTranscript: "objection",
        })
      ).rejects.toThrow(/Forbidden/i);
      await expect(
        (generateInteractiveReviewerPushback as any)._handler(attackerCtx, {
          claimId: "claim_victim_456",
          doctorSpeech: "rebuttal",
        })
      ).rejects.toThrow(/Forbidden/i);
    });

    it("precedentMatcher: rejects unauthenticated caller and non-owner", async () => {
      const { computeOverturnScore } = await import("../convex/actions/precedentMatcher");

      const unauthCtx = makeMockCtx(null);
      await expect(
        (computeOverturnScore as any)._handler(unauthCtx, { claimId: "claim_victim_456" })
      ).rejects.toThrow(/Unauthorized/i);

      const attackerCtx = makeMockCtx("user_attacker_999");
      await expect(
        (computeOverturnScore as any)._handler(attackerCtx, { claimId: "claim_victim_456" })
      ).rejects.toThrow(/Forbidden/i);
    });

    it("agentMail.syncInboxes: rejects unauthenticated caller", async () => {
      const { syncInboxes } = await import("../convex/actions/agentMail");

      const unauthCtx = makeMockCtx(null);
      await expect(
        (syncInboxes as any)._handler(unauthCtx, { limit: 5 })
      ).rejects.toThrow(/Unauthorized/i);
    });
  });
});
