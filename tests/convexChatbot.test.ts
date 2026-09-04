import { describe, it, expect, vi, beforeEach } from "vitest";
import * as chatbot from "../convex/chatbot";
// @ts-ignore getAuthUserId is injected by vi.mock("@convex-dev/auth/server")
import { getAuthUserId } from "@convex-dev/auth/server";

vi.mock("@convex-dev/auth/server", () => ({
  getAuthUserId: vi.fn(),
}));

describe("Convex Sentinel Chatbot Server Functions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("listSessions, getSession & getSessionInternal", () => {
    it("listSessions: returns empty array if unauthenticated", async () => {
      vi.mocked(getAuthUserId).mockResolvedValue(null);
      const mockCtx: any = { db: {} };
      const res = await (chatbot.listSessions as any)._handler(mockCtx, {});
      expect(res).toEqual([]);
    });

    it("listSessions: returns sessions for authenticated user", async () => {
      vi.mocked(getAuthUserId).mockResolvedValue("user_123" as any);
      const sessions = [{ _id: "sess_1", userId: "user_123" }];
      const mockCtx: any = {
        db: {
          query: vi.fn().mockReturnValue({
            withIndex: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                take: vi.fn().mockResolvedValue(sessions),
              }),
            }),
          }),
        },
      };
      const res = await (chatbot.listSessions as any)._handler(mockCtx, {});
      expect(res).toEqual(sessions);
    });

    it("getSession: returns null when unauthorized, else session doc", async () => {
      vi.mocked(getAuthUserId).mockResolvedValue(null);
      const mockCtx: any = { db: { get: vi.fn().mockResolvedValue(null) } };
      const res = await (chatbot.getSession as any)._handler(mockCtx, { sessionId: "sess_1" });
      expect(res).toBeNull();
    });

    it("getSessionInternal: gets session by ID directly", async () => {
      const sess = { _id: "sess_1", title: "Test Session" };
      const mockCtx: any = { db: { get: vi.fn().mockResolvedValue(sess) } };
      const res = await (chatbot.getSessionInternal as any)._handler(mockCtx, { sessionId: "sess_1" });
      expect(res).toEqual(sess);
    });
  });

  describe("getOrCreateSession", () => {
    it("creates a new session if none exists", async () => {
      vi.mocked(getAuthUserId).mockResolvedValue("user_123" as any);
      const mockCtx: any = {
        db: {
          query: vi.fn().mockReturnValue({
            withIndex: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                first: vi.fn().mockResolvedValue(null),
              }),
            }),
          }),
          insert: vi.fn().mockResolvedValue("sess_created_1"),
        },
      };

      const res = await (chatbot.getOrCreateSession as any)._handler(mockCtx, {});
      expect(res).toBe("sess_created_1");
      expect(mockCtx.db.insert).toHaveBeenCalledWith("chatbotSessions", expect.objectContaining({
        userId: "user_123",
        title: "Clinical & Appellate Inquiry",
      }));
    });

    it("patches existing session if activeClaimId changed", async () => {
      vi.mocked(getAuthUserId).mockResolvedValue("user_123" as any);
      const existingSession = { _id: "sess_1", userId: "user_123", activeClaimId: "claim_old" };
      const mockClaim = { _id: "claim_new", userId: "user_123" };
      const mockCtx: any = {
        db: {
          get: vi.fn().mockResolvedValue(mockClaim),
          query: vi.fn().mockReturnValue({
            withIndex: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                first: vi.fn().mockResolvedValue(existingSession),
              }),
            }),
          }),
          patch: vi.fn().mockResolvedValue(undefined),
        },
      };

      const res = await (chatbot.getOrCreateSession as any)._handler(mockCtx, { activeClaimId: "claim_new" });
      expect(res).toBe("sess_1");
      expect(mockCtx.db.patch).toHaveBeenCalledWith("sess_1", expect.objectContaining({ activeClaimId: "claim_new" }));
    });
  });

  describe("listMessages & listMessagesInternal", () => {
    it("listMessages: returns empty array if unauthorized", async () => {
      vi.mocked(getAuthUserId).mockResolvedValue(null);
      const mockCtx: any = { db: { get: vi.fn().mockResolvedValue(null) } };
      const res = await (chatbot.listMessages as any)._handler(mockCtx, { sessionId: "sess_1" });
      expect(res).toEqual([]);
    });

    it("listMessages: returns messages when authorized", async () => {
      vi.mocked(getAuthUserId).mockResolvedValue("user_123" as any);
      const session = { _id: "sess_1", userId: "user_123" };
      const msgs = [{ _id: "m1", content: "hello" }];
      const mockCtx: any = {
        db: {
          get: vi.fn().mockResolvedValue(session),
          query: vi.fn().mockReturnValue({
            withIndex: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                take: vi.fn().mockResolvedValue(msgs),
              }),
            }),
          }),
        },
      };
      const res = await (chatbot.listMessages as any)._handler(mockCtx, { sessionId: "sess_1" });
      expect(res).toEqual(msgs);
    });

    it("listMessagesInternal: returns messages directly", async () => {
      const msgs = [{ _id: "m1", content: "hello" }];
      const mockCtx: any = {
        db: {
          query: vi.fn().mockReturnValue({
            withIndex: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                take: vi.fn().mockResolvedValue(msgs),
              }),
            }),
          }),
        },
      };
      const res = await (chatbot.listMessagesInternal as any)._handler(mockCtx, { sessionId: "sess_1" });
      expect(res).toEqual(msgs);
    });
  });

  describe("addMessage, addMessageInternal, clearSession & updateSessionSummary", () => {
    it("addMessage: throws if session not found, else inserts message and auto-titles on first user message", async () => {
      vi.mocked(getAuthUserId).mockResolvedValue("user_123" as any);
      const session = { _id: "sess_1", userId: "user_123", messageCount: 0, title: "Default Title" };
      const mockCtx: any = {
        db: {
          get: vi.fn().mockResolvedValue(session),
          insert: vi.fn().mockResolvedValue("msg_new_1"),
          patch: vi.fn().mockResolvedValue(undefined),
        },
      };

      const res = await (chatbot.addMessage as any)._handler(mockCtx, {
        sessionId: "sess_1",
        role: "user",
        content: "Explain CPT 27447 total knee arthroplasty medical necessity criteria",
      });

      expect(res).toBe("msg_new_1");
      expect(mockCtx.db.patch).toHaveBeenCalledWith("sess_1", expect.objectContaining({
        title: expect.stringContaining("Explain CPT 27447"),
        messageCount: 1,
      }));
    });

    it("addMessageInternal: inserts message with tool calls", async () => {
      const session = { _id: "sess_1", messageCount: 2, title: "Existing Title" };
      const mockCtx: any = {
        db: {
          get: vi.fn().mockResolvedValue(session),
          insert: vi.fn().mockResolvedValue("msg_tool_1"),
          patch: vi.fn().mockResolvedValue(undefined),
        },
      };

      const res = await (chatbot.addMessageInternal as any)._handler(mockCtx, {
        sessionId: "sess_1",
        role: "assistant",
        content: "Let me check the clinical evidence.",
        toolCalls: [{ id: "t1", name: "get_clinical_evidence", arguments: "{}" }],
      });

      expect(res).toBe("msg_tool_1");
      expect(mockCtx.db.patch).toHaveBeenCalledWith("sess_1", expect.objectContaining({
        title: "Existing Title",
        messageCount: 3,
      }));
    });

    it("clearSession: deletes all messages and resets session metadata", async () => {
      vi.mocked(getAuthUserId).mockResolvedValue("user_123" as any);
      const session = { _id: "sess_1", userId: "user_123" };
      const msgs = [{ _id: "m1" }, { _id: "m2" }];
      const mockCtx: any = {
        db: {
          get: vi.fn().mockResolvedValue(session),
          query: vi.fn().mockReturnValue({
            withIndex: vi.fn().mockReturnValue({
              take: vi.fn().mockResolvedValue(msgs),
            }),
          }),
          delete: vi.fn().mockResolvedValue(undefined),
          patch: vi.fn().mockResolvedValue(undefined),
        },
      };

      const res = await (chatbot.clearSession as any)._handler(mockCtx, { sessionId: "sess_1" });
      expect(res).toEqual({ success: true });
      expect(mockCtx.db.delete).toHaveBeenCalledTimes(2);
      expect(mockCtx.db.patch).toHaveBeenCalledWith("sess_1", expect.objectContaining({
        messageCount: 0,
        title: "Clinical & Appellate Inquiry",
      }));
    });

    it("updateSessionSummary: patches summary string", async () => {
      const mockCtx: any = { db: { patch: vi.fn().mockResolvedValue(undefined) } };
      await (chatbot.updateSessionSummary as any)._handler(mockCtx, {
        sessionId: "sess_1",
        summary: "Discussed ERISA 503 deadline",
      });
      expect(mockCtx.db.patch).toHaveBeenCalledWith("sess_1", expect.objectContaining({
        summary: "Discussed ERISA 503 deadline",
      }));
    });
  });

  describe("Internal Tool Call Data Access Queries", () => {
    it("getClaimDataForChatbot: fetches claim by ID or number with joined patient details", async () => {
      const mockClaim = {
        _id: "claim_1",
        patientId: "pat_1",
        claimNumber: "CLM-999",
        serviceDate: "2026-01-01",
        providerName: "Dr. Test",
        deniedAmount: 1000,
        patientOwedAmount: 1000,
        cptCodes: ["27447"],
        icd10Codes: ["M17.11"],
        denialReasonCode: "CO-50",
        denialReasonDescription: "Not medically necessary",
        status: "ready_for_review",
        daysRemaining: 30,
      };
      const mockPatient = {
        name: "Alice Patient",
        email: "alice@example.com",
        memberId: "MEM-123",
        insurancePayer: "Aetna",
        state: "CA",
      };

      const mockCtx: any = {
        db: {
          get: vi.fn().mockImplementation((id) => {
            if (id === "claim_1") return Promise.resolve(mockClaim);
            if (id === "pat_1") return Promise.resolve(mockPatient);
            return Promise.resolve(null);
          }),
        },
      };

      const res = await (chatbot.getClaimDataForChatbot as any)._handler(mockCtx, { claimId: "claim_1" });
      expect(res).toBeDefined();
      expect(res?.patientName).toBe("Alice Patient");
      expect(res?.insurancePayer).toBe("Aetna");
      expect(res?.claimNumber).toBe("CLM-999");
    });

    it("getClaimDataForChatbot: searches by claimNumber if claimId not passed", async () => {
      const mockClaim = { _id: "c1", patientId: "pat_1", claimNumber: "CLM-888" };
      const mockCtx: any = {
        db: {
          query: vi.fn().mockReturnValue({
            withIndex: vi.fn().mockReturnValue({
              first: vi.fn().mockResolvedValue(mockClaim),
            }),
          }),
          get: vi.fn().mockResolvedValue({ name: "Bob" }),
        },
      };
      const res = await (chatbot.getClaimDataForChatbot as any)._handler(mockCtx, { claimNumber: "CLM-888" });
      expect(res?.claimId).toBe("c1");
      expect(res?.patientName).toBe("Bob");
    });

    it("searchClaimsForChatbot: filters by search term and status", async () => {
      const claims = [
        { _id: "c1", patientId: "p1", claimNumber: "CLM-100", cptCodes: ["27447"], denialReasonCode: "CO-50", denialReasonDescription: "Desc", status: "won" },
        { _id: "c2", patientId: "p2", claimNumber: "CLM-200", cptCodes: ["99213"], denialReasonCode: "CO-16", denialReasonDescription: "Desc", status: "ready_for_review" },
      ];
      const mockCtx: any = {
        db: {
          query: vi.fn().mockReturnValue({
            withIndex: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                take: vi.fn().mockResolvedValue(claims),
              }),
            }),
          }),
          get: vi.fn().mockResolvedValue({ name: "Patient Name", insurancePayer: "UHC" }),
        },
      };

      const res = await (chatbot.searchClaimsForChatbot as any)._handler(mockCtx, { searchTerm: "27447", status: "won" });
      expect(res.length).toBe(1);
      expect(res[0].claimNumber).toBe("CLM-100");
    });

    it("getEvidencesForChatbot, getAppealBriefForChatbot, getP2PScriptForChatbot & getAuditLogsForChatbot", async () => {
      const mockEvs = [{ _id: "ev1", sourceType: "payer_cpb", title: "CPB 1", citationClause: "Sec 2", extractedEvidenceMarkdown: "markdown text", relevanceScore: 90 }];
      const mockAppeal = {
        _id: "a1",
        version: 1,
        appealLevel: "level_1_internal",
        statutoryPosture: "admin",
        targetAuthority: "Director",
        legalAggressiveness: "standard",
        statutoryAuthorities: ["ERISA"],
        executiveSummary: "Summary",
        medicalNecessityArguments: "Necessity",
        legalCitations: "Citations",
        fullAppealMarkdown: "Markdown",
      };
      const mockScript = {
        physicianName: "Dr. Smith",
        physicianSpecialty: "Orthopedics",
        estimatedCallDuration: "3m",
        openingStatutoryStatement: "Opening",
        disqualificationCounters: [{ trap: "t1" }],
        condensedCheatSheet: { rapidChecklist: ["c1"] },
      };
      const mockLogs = [{ eventType: "e1", actor: "Sentinel", details: "details", timestamp: 12345 }];

      const mockCtx: any = {
        db: {
          query: vi.fn().mockImplementation((table: string) => {
            if (table === "clinicalEvidences") {
              return { withIndex: vi.fn().mockReturnValue({ take: vi.fn().mockResolvedValue(mockEvs) }) };
            }
            if (table === "appeals") {
              return { withIndex: vi.fn().mockReturnValue({ order: vi.fn().mockReturnValue({ first: vi.fn().mockResolvedValue(mockAppeal) }) }) };
            }
            if (table === "p2pScripts") {
              return { withIndex: vi.fn().mockReturnValue({ order: vi.fn().mockReturnValue({ first: vi.fn().mockResolvedValue(mockScript) }) }) };
            }
            if (table === "appealAuditLogs") {
              return { withIndex: vi.fn().mockReturnValue({ order: vi.fn().mockReturnValue({ take: vi.fn().mockResolvedValue(mockLogs) }) }) };
            }
            return {};
          }),
        },
      };

      const evs = await (chatbot.getEvidencesForChatbot as any)._handler(mockCtx, { claimId: "c1" });
      expect(evs).toHaveLength(1);

      const app = await (chatbot.getAppealBriefForChatbot as any)._handler(mockCtx, { claimId: "c1" });
      expect(app?.appealId).toBe("a1");

      const script = await (chatbot.getP2PScriptForChatbot as any)._handler(mockCtx, { claimId: "c1" });
      expect(script?.physicianName).toBe("Dr. Smith");

      const logs = await (chatbot.getAuditLogsForChatbot as any)._handler(mockCtx, { claimId: "c1" });
      expect(logs).toHaveLength(1);
    });

    it("getClaimDataForChatbot: blocks cross-tenant exfiltration when userId does not match", async () => {
      const victimClaim = {
        _id: "claim_victim",
        userId: "user_victim_123",
        patientId: "pat_victim",
        claimNumber: "CLM-SECRET-999",
      };

      const mockCtx: any = {
        db: {
          get: vi.fn().mockImplementation((id) => {
            if (id === "claim_victim") return Promise.resolve(victimClaim);
            return Promise.resolve(null);
          }),
        },
      };

      // Attacker passes victim's claimId
      const res = await (chatbot.getClaimDataForChatbot as any)._handler(mockCtx, {
        claimId: "claim_victim",
        userId: "user_attacker_999",
      });

      expect(res).toBeNull();
    });

    it("getClaimDataForChatbot: filters by userId when searching by claimNumber", async () => {
      const claims = [
        { _id: "c_other", userId: "user_other", claimNumber: "CLM-DUP-1", patientId: "p1" },
        { _id: "c_mine", userId: "user_me", claimNumber: "CLM-DUP-1", patientId: "p2" },
      ];

      const mockCtx: any = {
        db: {
          query: vi.fn().mockReturnValue({
            withIndex: vi.fn().mockReturnValue({
              take: vi.fn().mockResolvedValue(claims),
            }),
          }),
          get: vi.fn().mockResolvedValue({ name: "My Patient", insurancePayer: "Cigna" }),
        },
      };

      const res = await (chatbot.getClaimDataForChatbot as any)._handler(mockCtx, {
        claimNumber: "CLM-DUP-1",
        userId: "user_me",
      });

      expect(res).not.toBeNull();
      expect(res?.claimId).toBe("c_mine");
      expect(res?.patientName).toBe("My Patient");
    });

    it("searchClaimsForChatbot: strictly scopes query with by_user and by_user_status when userId is provided", async () => {
      let usedIndexName = "";
      const queryChain = {
        withIndex: vi.fn().mockImplementation((indexName, cb) => {
          usedIndexName = indexName;
          const q = { eq: vi.fn().mockReturnThis() };
          if (cb) cb(q);
          return {
            order: vi.fn().mockReturnValue({
              take: vi.fn().mockResolvedValue([
                { _id: "c_scoped", userId: "user_me", claimNumber: "CLM-SCOPE-1", patientId: "p1", cptCodes: [], status: "ready_for_review" },
              ]),
            }),
          };
        }),
      };

      const mockCtx: any = {
        db: {
          query: vi.fn().mockReturnValue(queryChain),
          get: vi.fn().mockResolvedValue({ name: "Scoped Patient", insurancePayer: "Aetna" }),
        },
      };

      // Search without status
      await (chatbot.searchClaimsForChatbot as any)._handler(mockCtx, { userId: "user_me" });
      expect(usedIndexName).toBe("by_user");

      // Search with status
      await (chatbot.searchClaimsForChatbot as any)._handler(mockCtx, { userId: "user_me", status: "ready_for_review" });
      expect(usedIndexName).toBe("by_user_status");
    });

    it("getEvidencesForChatbot, getAppealBriefForChatbot, getP2PScriptForChatbot & getAuditLogsForChatbot: verify claim owner before returning data", async () => {
      const mockCtx: any = {
        db: {
          get: vi.fn().mockImplementation((id) => {
            if (id === "claim_victim") {
              return Promise.resolve({ _id: "claim_victim", userId: "user_victim_123" });
            }
            return Promise.resolve(null);
          }),
        },
      };

      const evs = await (chatbot.getEvidencesForChatbot as any)._handler(mockCtx, {
        claimId: "claim_victim",
        userId: "user_attacker_999",
      });
      expect(evs).toEqual([]);

      const brief = await (chatbot.getAppealBriefForChatbot as any)._handler(mockCtx, {
        claimId: "claim_victim",
        userId: "user_attacker_999",
      });
      expect(brief).toBeNull();

      const script = await (chatbot.getP2PScriptForChatbot as any)._handler(mockCtx, {
        claimId: "claim_victim",
        userId: "user_attacker_999",
      });
      expect(script).toBeNull();

      const logs = await (chatbot.getAuditLogsForChatbot as any)._handler(mockCtx, {
        claimId: "claim_victim",
        userId: "user_attacker_999",
      });
      expect(logs).toEqual([]);
    });
  });
});
