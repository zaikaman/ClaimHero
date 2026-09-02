import { describe, it, expect, vi, beforeEach } from "vitest";
import * as p2pCallSessions from "../convex/p2pCallSessions";
import * as p2pScripts from "../convex/p2pScripts";
import { getAuthUserId } from "@convex-dev/auth/server";

vi.mock("@convex-dev/auth/server", () => ({
  getAuthUserId: vi.fn(),
}));

describe("Convex Physician P2P Defense Scripts & Live Copilot Sessions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("convex/p2pCallSessions", () => {
    it("getLatestByClaim: returns null when unauthorized, else latest session", async () => {
      vi.mocked(getAuthUserId).mockResolvedValue(null);
      const mockCtx: any = { db: { get: vi.fn().mockResolvedValue(null) } };
      expect(await (p2pCallSessions.getLatestByClaim as any)._handler(mockCtx, { claimId: "c1" })).toBeNull();

      vi.mocked(getAuthUserId).mockResolvedValue("user_123" as any);
      const mockClaim = { _id: "c1", userId: "user_123" };
      const session = { _id: "sess_1", sessionStatus: "live" };
      const mockCtx2: any = {
        db: {
          get: vi.fn().mockResolvedValue(mockClaim),
          query: vi.fn().mockReturnValue({
            withIndex: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                first: vi.fn().mockResolvedValue(session),
              }),
            }),
          }),
        },
      };

      const res = await (p2pCallSessions.getLatestByClaim as any)._handler(mockCtx2, { claimId: "c1" });
      expect(res).toEqual(session);
    });

    it("getById: returns null if not found or unauthorized, else session doc", async () => {
      const mockCtxNotFound: any = { db: { get: vi.fn().mockResolvedValue(null) } };
      expect(await (p2pCallSessions.getById as any)._handler(mockCtxNotFound, { sessionId: "sess_99" })).toBeNull();

      vi.mocked(getAuthUserId).mockResolvedValue("user_123" as any);
      const mockSess = { _id: "sess_1", claimId: "c1" };
      const mockClaim = { _id: "c1", userId: "user_123" };
      const mockCtx: any = {
        db: {
          get: vi.fn().mockImplementation((id) => (id === "sess_1" ? Promise.resolve(mockSess) : Promise.resolve(mockClaim))),
        },
      };

      const res = await (p2pCallSessions.getById as any)._handler(mockCtx, { sessionId: "sess_1" });
      expect(res).toEqual(mockSess);
    });

    it("startSession: initializes checklist and creates live session", async () => {
      vi.mocked(getAuthUserId).mockResolvedValue("user_123" as any);
      const mockClaim = { _id: "c1", userId: "user_123" };
      const mockCtx: any = {
        db: {
          get: vi.fn().mockResolvedValue(mockClaim),
          insert: vi.fn().mockResolvedValue("sess_new_1"),
        },
      };

      const res = await (p2pCallSessions.startSession as any)._handler(mockCtx, { claimId: "c1" });
      expect(res).toBe("sess_new_1");
      expect(mockCtx.db.insert).toHaveBeenCalledWith("p2pCallSessions", expect.objectContaining({
        claimId: "c1",
        sessionStatus: "live",
        winScore: 50,
      }));
    });

    it("appendTranscript: updates or appends transcripts and keeps bounded", async () => {
      vi.mocked(getAuthUserId).mockResolvedValue("user_123" as any);
      const mockClaim = { _id: "c1", userId: "user_123" };
      const session = {
        _id: "sess_1",
        claimId: "c1",
        transcripts: [{ id: "t1", speaker: "Doctor", text: "Hello" }],
        durationSeconds: 10,
      };
      const mockCtx: any = {
        db: {
          get: vi.fn().mockImplementation((id) => (id === "sess_1" ? Promise.resolve(session) : Promise.resolve(mockClaim))),
          patch: vi.fn().mockResolvedValue(undefined),
        },
      };

      await (p2pCallSessions.appendTranscript as any)._handler(mockCtx, {
        sessionId: "sess_1",
        transcriptItem: { id: "t2", speaker: "Reviewer", text: "State policy criteria", timestamp: 100, isFinal: true },
        durationSeconds: 20,
      });

      expect(mockCtx.db.patch).toHaveBeenCalledWith("sess_1", expect.objectContaining({
        durationSeconds: 20,
        transcripts: expect.arrayContaining([expect.objectContaining({ id: "t2" })]),
      }));
    });

    it("addFastAnswer & addFastAnswerInternal: prepends answer and boosts win score", async () => {
      vi.mocked(getAuthUserId).mockResolvedValue("user_123" as any);
      const mockClaim = { _id: "c1", userId: "user_123" };
      const session = { _id: "sess_1", claimId: "c1", fastAnswers: [], winScore: 50 };
      const mockCtx: any = {
        db: {
          get: vi.fn().mockImplementation((id) => (id === "sess_1" ? Promise.resolve(session) : Promise.resolve(mockClaim))),
          patch: vi.fn().mockResolvedValue(undefined),
        },
      };

      await (p2pCallSessions.addFastAnswer as any)._handler(mockCtx, {
        sessionId: "sess_1",
        fastAnswer: {
          id: "fa_1",
          trapQuestion: "Was PT completed?",
          suggestedQuote: "Yes, 12 weeks",
          chartProof: "Chart note",
          cpbCitation: "Section 3.B",
          confidenceScore: 95,
          timestamp: 100,
        },
      });

      expect(mockCtx.db.patch).toHaveBeenCalledWith("sess_1", expect.objectContaining({
        winScore: 55,
      }));

      await (p2pCallSessions.addFastAnswerInternal as any)._handler(mockCtx, {
        sessionId: "sess_1",
        fastAnswer: {
          id: "fa_2",
          trapQuestion: "Is surgery elective?",
          suggestedQuote: "No, acute motor drop",
          chartProof: "EMG",
          cpbCitation: "Section 4",
          confidenceScore: 98,
          timestamp: 200,
        },
      });
      expect(mockCtx.db.patch).toHaveBeenCalledTimes(2);
    });

    it("updateChecklist, completeSession & updateTranscriptSpeaker", async () => {
      vi.mocked(getAuthUserId).mockResolvedValue("user_123" as any);
      const mockClaim = { _id: "c1", userId: "user_123" };
      const session = {
        _id: "sess_1",
        claimId: "c1",
        checklistProgress: [{ id: "c1", isCompleted: false }, { id: "c2", isCompleted: false }],
        fastAnswers: [],
        transcripts: [{ id: "t1", speaker: "Unknown", text: "Text" }],
        winScore: 50,
      };
      const mockCtx: any = {
        db: {
          get: vi.fn().mockImplementation((id) => (id === "sess_1" ? Promise.resolve(session) : Promise.resolve(mockClaim))),
          patch: vi.fn().mockResolvedValue(undefined),
          insert: vi.fn().mockResolvedValue("log_p2p"),
        },
      };

      // updateChecklist
      await (p2pCallSessions.updateChecklist as any)._handler(mockCtx, {
        sessionId: "sess_1",
        checklistId: "c1",
        isCompleted: true,
      });
      expect(mockCtx.db.patch).toHaveBeenCalledWith("sess_1", expect.objectContaining({
        checklistProgress: expect.arrayContaining([expect.objectContaining({ id: "c1", isCompleted: true })]),
      }));

      // completeSession
      await (p2pCallSessions.completeSession as any)._handler(mockCtx, {
        sessionId: "sess_1",
        durationSeconds: 185,
        summaryNotes: "Reviewer agreed to overturn",
      });
      expect(mockCtx.db.patch).toHaveBeenCalledWith("sess_1", expect.objectContaining({
        sessionStatus: "completed",
        durationSeconds: 185,
      }));
      expect(mockCtx.db.insert).toHaveBeenCalledWith("appealAuditLogs", expect.objectContaining({
        eventType: "p2p_live_call_completed",
      }));

      // updateTranscriptSpeaker
      await (p2pCallSessions.updateTranscriptSpeaker as any)._handler(mockCtx, {
        sessionId: "sess_1",
        transcriptId: "t1",
        newSpeaker: "Medical Director",
      });
      expect(mockCtx.db.patch).toHaveBeenCalledWith("sess_1", expect.objectContaining({
        transcripts: expect.arrayContaining([expect.objectContaining({ speaker: "Medical Director" })]),
      }));
    });
  });

  describe("convex/p2pScripts", () => {
    it("getById & getLatestByClaim", async () => {
      vi.mocked(getAuthUserId).mockResolvedValue("user_123" as any);
      const mockScript = { _id: "sc_1", claimId: "c1", version: 1 };
      const mockClaim = { _id: "c1", userId: "user_123" };
      const mockCtx: any = {
        db: {
          get: vi.fn().mockImplementation((id) => (id === "sc_1" ? Promise.resolve(mockScript) : Promise.resolve(mockClaim))),
          query: vi.fn().mockReturnValue({
            withIndex: vi.fn().mockReturnValue({
              collect: vi.fn().mockResolvedValue([mockScript]),
            }),
          }),
        },
      };

      expect(await (p2pScripts.getById as any)._handler(mockCtx, { scriptId: "sc_1" })).toEqual(mockScript);
      expect(await (p2pScripts.getLatestByClaim as any)._handler(mockCtx, { claimId: "c1" })).toEqual(mockScript);
      expect(await (p2pScripts.getLatestByClaimInternal as any)._handler(mockCtx, { claimId: "c1" })).toEqual(mockScript);
      expect(await (p2pScripts.listVersions as any)._handler(mockCtx, { claimId: "c1" })).toEqual([mockScript]);
    });

    it("createOrUpdateScript: inserts v1 or updates existing version", async () => {
      vi.mocked(getAuthUserId).mockResolvedValue("user_123" as any);
      const mockClaim = { _id: "c1", userId: "user_123" };
      const mockCtx: any = {
        db: {
          get: vi.fn().mockResolvedValue(mockClaim),
          query: vi.fn().mockReturnValue({
            withIndex: vi.fn().mockReturnValue({
              collect: vi.fn().mockResolvedValue([]),
            }),
          }),
          insert: vi.fn().mockImplementation((table) => (table === "p2pScripts" ? Promise.resolve("sc_new_1") : Promise.resolve("log_1"))),
        },
      };

      const res = await (p2pScripts.createOrUpdateScript as any)._handler(mockCtx, {
        claimId: "c1",
        physicianName: "Dr. Amanda Vance",
        estimatedCallDuration: "3m",
        openingStatutoryStatement: "Opening statement",
        clinicalPolicyCitations: [{ cpbTitle: "CPB", section: "3", criteriaMetText: "met", rebuttalBullet: "rebuttal" }],
        disqualificationCounters: [{ insurerTrapQuestion: "trap", physicianDirectRebuttal: "rebuttal", clinicalRationale: "rationale" }],
        statutoryDemands: "Demands",
        condensedCheatSheet: {
          rapidChecklist: ["1"],
          keyDiagnosisCodes: ["M51.1"],
          keyProcedureCodes: ["63047"],
          mustSayPoints: ["must say"],
          doNotConcedePoints: ["do not concede"],
          closingDemandStatement: "closing demand",
        },
        fullScriptMarkdown: "# Tele-Script",
      });

      expect(res).toBe("sc_new_1");
      expect(mockCtx.db.insert).toHaveBeenCalledWith("p2pScripts", expect.objectContaining({ version: 1, physicianName: "Dr. Amanda Vance" }));
    });

    it("saveScriptEdits: patches markdown or throws if script missing", async () => {
      vi.mocked(getAuthUserId).mockResolvedValue("user_123" as any);
      const mockCtxNotFound: any = { db: { get: vi.fn().mockResolvedValue(null) } };
      await expect((p2pScripts.saveScriptEdits as any)._handler(mockCtxNotFound, {
        scriptId: "sc_999",
        fullScriptMarkdown: "Markdown",
      })).rejects.toThrow("P2P script sc_999 not found");

      const mockScript = { _id: "sc_1", claimId: "c1" };
      const mockClaim = { _id: "c1", userId: "user_123" };
      const mockCtx: any = {
        db: {
          get: vi.fn().mockImplementation((id) => (id === "sc_1" ? Promise.resolve(mockScript) : Promise.resolve(mockClaim))),
          patch: vi.fn().mockResolvedValue(undefined),
        },
      };

      const res = await (p2pScripts.saveScriptEdits as any)._handler(mockCtx, {
        scriptId: "sc_1",
        fullScriptMarkdown: "Updated Markdown",
      });
      expect(res).toBeNull();
      expect(mockCtx.db.patch).toHaveBeenCalledWith("sc_1", expect.objectContaining({ fullScriptMarkdown: "Updated Markdown" }));
    });
  });
});
