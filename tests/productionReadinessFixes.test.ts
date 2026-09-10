import { describe, it, expect, vi, beforeEach } from "vitest";
import * as claims from "../convex/claims";
import * as auth from "../convex/auth";
import * as settings from "../convex/settings";
import * as agentMail from "../convex/actions/agentMail";
import schema from "../convex/schema";
import { rateLimiter } from "../convex/lib/rateLimiter";
import { useCommunications } from "../src/hooks/useCommunications";
import { useSentinelChat } from "../src/hooks/useSentinelChat";
import { useAppealStudio } from "../src/hooks/useAppealStudio";

// Mock convex auth
vi.mock("@convex-dev/auth/server", () => ({
  getAuthUserId: vi.fn(),
}));

// Mock React
const effectCleanups: Array<() => void> = [];
const eventListeners: Record<string, Function[]> = {};

vi.mock("react", async () => {
  const actual = await vi.importActual<typeof import("react")>("react");
  return {
    ...actual,
    useMemo: vi.fn((fn: () => any) => fn()),
    useCallback: vi.fn((fn: any) => fn),
    useState: vi.fn((init: any) => {
      let state = typeof init === "function" ? init() : init;
      const setState = vi.fn((newVal: any) => {
        state = typeof newVal === "function" ? newVal(state) : newVal;
      });
      return [state, setState];
    }),
    useRef: vi.fn((init: any) => ({ current: init })),
    useEffect: vi.fn((fn: () => any) => {
      const cleanup = fn();
      if (typeof cleanup === "function") {
        effectCleanups.push(cleanup);
      }
    }),
  };
});

// Mock convex/react hooks
const mockUseQuery = vi.fn();
const mockUseAction = vi.fn();
const mockUseMutation = vi.fn();

vi.mock("convex/react", () => ({
  useQuery: (...args: any[]) => mockUseQuery(...args),
  useAction: (...args: any[]) => mockUseAction(...args),
  useMutation: (...args: any[]) => mockUseMutation(...args),
}));

vi.mock("@convex-dev/agent/react", () => ({
  useUIMessages: vi.fn(() => ({ results: [] })),
}));

describe("Production Readiness Fixes & Hardening", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    effectCleanups.length = 0;
  });

  describe("convex/claims: generateUploadUrl Rate Limiting & Storage Quotas", () => {
    it("rejects generateUploadUrl when file upload rate limit is exceeded", async () => {
      const { getAuthUserId } = await import("@convex-dev/auth/server");
      vi.mocked(getAuthUserId).mockResolvedValue("user_quota_1" as any);
      vi.spyOn(rateLimiter, "limit").mockResolvedValue({
        ok: false,
        retryAfter: 45000,
      } as any);

      const mockCtx: any = {
        db: {
          query: vi.fn().mockReturnValue({
            withIndex: vi.fn().mockReturnValue({
              collect: vi.fn().mockResolvedValue([]),
            }),
          }),
        },
        storage: {
          generateUploadUrl: vi.fn(),
        },
      };

      await expect((claims.generateUploadUrl as any)._handler(mockCtx, {})).rejects.toThrow(
        /Upload rate limit exceeded/
      );
      expect(mockCtx.storage.generateUploadUrl).not.toHaveBeenCalled();
    });

    it("rejects generateUploadUrl when user document file count quota (50) is reached", async () => {
      const { getAuthUserId } = await import("@convex-dev/auth/server");
      vi.mocked(getAuthUserId).mockResolvedValue("user_quota_2" as any);
      vi.spyOn(rateLimiter, "limit").mockResolvedValue({ ok: true } as any);

      const existingClaims = Array.from({ length: 50 }, (_, i) => ({
        _id: `claim_${i}`,
        userId: "user_quota_2",
        denialLetterStorageId: `storage_${i}`,
      }));

      const mockCtx: any = {
        db: {
          query: vi.fn().mockReturnValue({
            withIndex: vi.fn().mockReturnValue({
              collect: vi.fn().mockResolvedValue(existingClaims),
            }),
          }),
          system: {
            get: vi.fn().mockResolvedValue({ size: 1024 }),
          },
        },
        storage: {
          generateUploadUrl: vi.fn(),
        },
      };

      await expect((claims.generateUploadUrl as any)._handler(mockCtx, {})).rejects.toThrow(
        /Storage quota exceeded: You have reached the maximum document limit \(50 files\)/
      );
      expect(mockCtx.storage.generateUploadUrl).not.toHaveBeenCalled();
    });

    it("rejects generateUploadUrl when user cumulative storage bytes exceed 100MB quota", async () => {
      const { getAuthUserId } = await import("@convex-dev/auth/server");
      vi.mocked(getAuthUserId).mockResolvedValue("user_quota_3" as any);
      vi.spyOn(rateLimiter, "limit").mockResolvedValue({ ok: true } as any);

      const existingClaims = [
        { _id: "c1", userId: "user_quota_3", denialLetterStorageId: "st_1" },
        { _id: "c2", userId: "user_quota_3", denialLetterStorageId: "st_2" },
      ];

      const mockCtx: any = {
        db: {
          query: vi.fn().mockReturnValue({
            withIndex: vi.fn().mockReturnValue({
              collect: vi.fn().mockResolvedValue(existingClaims),
            }),
          }),
          system: {
            get: vi.fn().mockImplementation((id: string) => {
              if (id === "st_1") return Promise.resolve({ size: 60 * 1024 * 1024 });
              if (id === "st_2") return Promise.resolve({ size: 50 * 1024 * 1024 });
              return Promise.resolve(null);
            }),
          },
        },
        storage: {
          generateUploadUrl: vi.fn(),
        },
      };

      await expect((claims.generateUploadUrl as any)._handler(mockCtx, {})).rejects.toThrow(
        /Storage quota exceeded: You have reached the 100MB document storage quota/
      );
      expect(mockCtx.storage.generateUploadUrl).not.toHaveBeenCalled();
    });

    it("successfully returns upload URL when user is authenticated and within quotas", async () => {
      const { getAuthUserId } = await import("@convex-dev/auth/server");
      vi.mocked(getAuthUserId).mockResolvedValue("user_quota_ok" as any);
      vi.spyOn(rateLimiter, "limit").mockResolvedValue({ ok: true } as any);

      const existingClaims = [
        { _id: "c1", userId: "user_quota_ok", denialLetterStorageId: "st_1" },
      ];

      const mockCtx: any = {
        db: {
          query: vi.fn().mockReturnValue({
            withIndex: vi.fn().mockReturnValue({
              collect: vi.fn().mockResolvedValue(existingClaims),
            }),
          }),
          system: {
            get: vi.fn().mockResolvedValue({ size: 5 * 1024 * 1024 }),
          },
        },
        storage: {
          generateUploadUrl: vi.fn().mockResolvedValue("https://upload.site/v1/token"),
        },
      };

      const url = await (claims.generateUploadUrl as any)._handler(mockCtx, {});
      expect(url).toBe("https://upload.site/v1/token");
      expect(mockCtx.storage.generateUploadUrl).toHaveBeenCalledTimes(1);
    });
  });

  describe("src/hooks/useSentinelChat: Keyboard shortcut scoping", () => {
    let originalWindow: any;
    let mockWindow: any;

    beforeEach(() => {
      originalWindow = (globalThis as any).window;
      mockWindow = {
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      };
      (globalThis as any).window = mockWindow;

      mockUseMutation.mockReturnValue(vi.fn().mockResolvedValue("session_1"));
      mockUseAction.mockReturnValue(vi.fn());
      mockUseQuery.mockReturnValue([]);
    });

    afterEach(() => {
      (globalThis as any).window = originalWindow;
    });

    it("does not register keydown listener when currentView is landing", () => {
      useSentinelChat({
        selectedClaim: null,
        currentView: "landing",
      });

      const keydownCalls = mockWindow.addEventListener.mock.calls.filter((c: any) => c[0] === "keydown");
      expect(keydownCalls.length).toBe(0);
    });

    it("does not register keydown listener when currentView is login", () => {
      useSentinelChat({
        selectedClaim: null,
        currentView: "login",
      });

      const keydownCalls = mockWindow.addEventListener.mock.calls.filter((c: any) => c[0] === "keydown");
      expect(keydownCalls.length).toBe(0);
    });

    it("does not register keydown listener when enabled is false", () => {
      useSentinelChat({
        selectedClaim: null,
        currentView: "radar",
        enabled: false,
      });

      const keydownCalls = mockWindow.addEventListener.mock.calls.filter((c: any) => c[0] === "keydown");
      expect(keydownCalls.length).toBe(0);
    });

    it("registers keydown listener when on dashboard view (e.g. radar) and enabled", () => {
      useSentinelChat({
        selectedClaim: null,
        currentView: "radar",
        enabled: true,
      });

      const keydownCalls = mockWindow.addEventListener.mock.calls.filter((c: any) => c[0] === "keydown");
      expect(keydownCalls.length).toBe(1);
    });
  });

  describe("src/hooks/useCommunications: Transmits outbound without local fallback", () => {
    it("dispatches message directly to sendOutboundMessage action", async () => {
      const mockSendOutbound = vi.fn().mockResolvedValue({ messageId: "msg_out_1" });
      mockUseAction.mockImplementation(() => mockSendOutbound);
      mockUseQuery.mockReturnValue([]);

      const mockClaim: any = {
        _id: "claim_comms_1",
        claimNumber: "CLM-COMMS",
        assignedAgentEmail: "agent@claimhero.com",
        payerContact: {
          officialAppealsEmail: "appeals@insurer.com",
        },
      };

      const hook = useCommunications(mockClaim, { activeView: "communications" });
      await hook.sendMessage("Clinical rebuttal statement");

      expect(mockSendOutbound).toHaveBeenCalledWith(
        expect.objectContaining({
          claimId: "claim_comms_1",
          text: "Clinical rebuttal statement",
          customRecipient: "appeals@insurer.com",
          waiveRedaction: true,
        })
      );
    });
  });

  describe("src/hooks/useAppealStudio: Timer cleanup and debounce", () => {
    it("cleans up save status timer and debounce timer on unmount / claim switch", () => {
      const mockClaim: any = {
        _id: "claim_studio_1",
        claimNumber: "CLM-STUDIO",
      };

      useAppealStudio(mockClaim);

      // Verify that cleanup functions were registered by useEffect
      expect(effectCleanups.length).toBeGreaterThan(0);

      // Execute registered cleanups to verify no exception is thrown
      for (const cleanup of effectCleanups) {
        expect(() => cleanup()).not.toThrow();
      }
    });
  });

  describe("L1: Rate-Limiter Catch Block Narrowing & Logging", () => {
    it("rethrows rate limit error when upload rate limit is exceeded", async () => {
      const { getAuthUserId } = await import("@convex-dev/auth/server");
      vi.mocked(getAuthUserId).mockResolvedValue("user_l1_1" as any);
      vi.spyOn(rateLimiter, "limit").mockResolvedValue({
        ok: false,
        retryAfter: 30000,
      } as any);

      const mockCtx: any = {
        db: {
          query: vi.fn().mockReturnValue({
            withIndex: vi.fn().mockReturnValue({
              collect: vi.fn().mockResolvedValue([]),
            }),
          }),
        },
        storage: { generateUploadUrl: vi.fn() },
      };

      await expect((claims.generateUploadUrl as any)._handler(mockCtx, {})).rejects.toThrow(
        /Upload rate limit exceeded/
      );
    });

    it("logs warning in non-test mode on unexpected rate limiter failure", async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = "production";
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const { getAuthUserId } = await import("@convex-dev/auth/server");
      vi.mocked(getAuthUserId).mockResolvedValue("user_l1_2" as any);
      vi.spyOn(rateLimiter, "limit").mockRejectedValue(new Error("Database connection dropped"));

      const mockCtx: any = {
        db: {
          query: vi.fn().mockReturnValue({
            withIndex: vi.fn().mockReturnValue({
              collect: vi.fn().mockResolvedValue([]),
            }),
          }),
        },
        storage: { generateUploadUrl: vi.fn().mockResolvedValue("https://upload.site/url") },
      };

      try {
        await (claims.generateUploadUrl as any)._handler(mockCtx, {});
        expect(warnSpy).toHaveBeenCalledWith(
          expect.stringContaining("[RateLimiter] Unexpected error checking fileUpload rate limit:"),
          expect.any(Error)
        );
      } finally {
        process.env.NODE_ENV = originalEnv;
        warnSpy.mockRestore();
      }
    });
  });

  describe("L2: Legacy signIn mutation removal in convex/auth.ts", () => {
    it("does not export legacy signIn mutation", () => {
      expect((auth as any).signIn).toBeUndefined();
    });

    it("exports canonical Convex Auth v2 mutations and functions", () => {
      expect(typeof auth.signUpWithPassword).toBe("function");
      expect(typeof auth.signInWithPassword).toBe("function");
      expect(typeof auth.signOut).toBe("function");
      expect(typeof auth.refreshSession).toBe("function");
      expect(typeof auth.isAuthenticated).toBe("function");
    });
  });

  describe("L3: performInboxSync durable distributed cooldown", () => {
    it("returns zero sync count early when distributed rate limit indicates cooldown is active", async () => {
      const { getAuthUserId } = await import("@convex-dev/auth/server");
      vi.mocked(getAuthUserId).mockResolvedValue("user_sync_1" as any);

      vi.spyOn(rateLimiter, "limit").mockResolvedValue({
        ok: false,
        retryAfter: 45000,
      } as any);

      const mockCtx: any = {
        runQuery: vi.fn(),
        runMutation: vi.fn(),
      };

      const result = await (agentMail.syncInboxes as any)._handler(mockCtx, { limit: 10 });
      expect(result.success).toBe(true);
      expect(result.syncedCount).toBe(0);
      expect(result.totalChecked).toBe(0);
      expect(mockCtx.runQuery).not.toHaveBeenCalled();
    });
  });

  describe("L4: claims table index optimization (write amplification elimination)", () => {
    it("has pruned unreferenced indexes while preserving all active indexes", () => {
      const claimsTable = (schema as any).tables.claims;
      const indexNames = Array.isArray(claimsTable.indexes)
        ? claimsTable.indexes.map((idx: any) => idx.indexDescriptor)
        : Object.keys(claimsTable.indexes);

      // Dead indexes pruned
      expect(indexNames).not.toContain("by_user_demo");
      expect(indexNames).not.toContain("by_payer");
      expect(indexNames).not.toContain("by_status");
      expect(indexNames).not.toContain("by_patient");
      expect(indexNames).not.toContain("by_updated");

      // Active indexes retained
      expect(indexNames).toContain("by_user");
      expect(indexNames).toContain("by_user_status");
      expect(indexNames).toContain("by_user_payer");
      expect(indexNames).toContain("by_user_payer_status");
      expect(indexNames).toContain("by_deadline");
      expect(indexNames).toContain("by_claim_number");
      expect(indexNames).toContain("by_inbox_email");
      expect(indexNames).toContain("by_adjudicator_email");
      expect(indexNames).toContain("by_assigned_agent_email");
      expect(indexNames).toContain("by_created");
      expect(indexNames).toContain("by_threadId");
      expect(indexNames).toContain("by_user_updated");
      expect(indexNames.length).toBe(12);
    });
  });

  describe("L5: Unified searchContent field & full-text claim search", () => {
    it("buildClaimSearchContent compiles unified text corpus across all search dimensions", () => {
      const corpus = claims.buildClaimSearchContent({
        claimNumber: "CLM-8888",
        patientName: "Jane Doe",
        insurancePayer: "Aetna Health",
        providerName: "Pacific Surgical",
        denialReasonCode: "CO-50",
        denialReasonDescription: "Service not medically necessary",
        cptCodes: ["99213", "99214"],
        icd10Codes: ["M54.5"],
      });

      expect(corpus).toContain("CLM-8888");
      expect(corpus).toContain("Jane Doe");
      expect(corpus).toContain("Aetna Health");
      expect(corpus).toContain("Pacific Surgical");
      expect(corpus).toContain("CO-50");
      expect(corpus).toContain("Service not medically necessary");
      expect(corpus).toContain("99213");
      expect(corpus).toContain("M54.5");
    });

    it("claims.search leverages direct by_claim_number lookup and search_claims index", async () => {
      const { getAuthUserId } = await import("@convex-dev/auth/server");
      vi.mocked(getAuthUserId).mockResolvedValue("user_search_1" as any);

      const mockDirectClaim = {
        _id: "claim_direct_1",
        userId: "user_search_1",
        claimNumber: "CLM-DIRECT-1",
        status: "ingested",
      };

      const mockTextClaim = {
        _id: "claim_text_1",
        userId: "user_search_1",
        claimNumber: "CLM-TEXT-1",
        status: "ingested",
      };

      const mockCtx: any = {
        db: {
          query: vi.fn().mockImplementation(() => ({
            withIndex: vi.fn().mockReturnValue({
              first: vi.fn().mockResolvedValue(mockDirectClaim),
            }),
            withSearchIndex: vi.fn().mockReturnValue({
              take: vi.fn().mockResolvedValue([mockTextClaim]),
            }),
          })),
        },
      };

      const results = await (claims.search as any)._handler(mockCtx, {
        query: "CLM-DIRECT-1",
        status: "all",
      });

      expect(results.length).toBe(2);
      expect(results[0]._id).toBe("claim_direct_1");
      expect(results[1]._id).toBe("claim_text_1");
    });
  });

  describe("L6: resetPortfolio rate limiting", () => {
    it("rejects resetPortfolio when rate limit is exceeded", async () => {
      const { getAuthUserId } = await import("@convex-dev/auth/server");
      vi.mocked(getAuthUserId).mockResolvedValue("user_reset_1" as any);

      vi.spyOn(rateLimiter, "limit").mockResolvedValue({
        ok: false,
        retryAfter: 900000,
      } as any);

      const mockCtx: any = {
        db: {
          query: vi.fn().mockReturnValue({
            withIndex: vi.fn().mockReturnValue({
              take: vi.fn().mockResolvedValue([]),
            }),
          }),
        },
      };

      await expect(
        (settings.resetPortfolio as any)._handler(mockCtx, { confirmText: "RESET_PORTFOLIO" })
      ).rejects.toThrow(/Rate limit exceeded for portfolio reset/);
    });
  });
});
