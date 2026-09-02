import { describe, it, expect, vi, beforeEach } from "vitest";
import * as actionP2PDefenseGenerator from "../convex/actions/p2pDefenseGenerator";
import * as actionP2PLiveCopilot from "../convex/actions/p2pLiveCopilot";
import * as actionSentinelChatbot from "../convex/actions/sentinelChatbot";
import * as libOpenAI from "../convex/lib/openai";
import { rateLimiter } from "../convex/lib/rateLimiter";
import { getAuthUserId } from "@convex-dev/auth/server";

vi.mock("@convex-dev/auth/server", () => ({
  getAuthUserId: vi.fn(),
}));

describe("Convex Actions: P2P Defense Generator, Live Copilot & Sentinel Chatbot", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("convex/actions/p2pDefenseGenerator", () => {
    it("generateP2PScript: creates structured physician tele-script and persists it", async () => {
      vi.mocked(getAuthUserId).mockResolvedValue("user_123" as any);
      vi.spyOn(rateLimiter, "limit").mockResolvedValue({ ok: true } as any);

      const mockClaim = {
        _id: "c1",
        userId: "user_123",
        claimNumber: "CLM-P2P-1",
        providerName: "Dr. Amanda Vance",
        patient: { name: "Marcus Holloway", insurancePayer: "UnitedHealthcare" },
        cptCodes: ["63047"],
        icd10Codes: ["M51.16"],
        denialReasonCode: "CO-50",
        denialReasonDescription: "Not medically necessary",
      };

      const mockScriptOutput = {
        openingStatutoryStatement: "This call is recorded under ERISA 29 CFR § 2560.503-1.",
        clinicalPolicyCitations: [
          {
            cpbTitle: "UHC CPB 0016",
            section: "Section 3.B",
            criteriaMetText: "Conservative therapy completed for 12 weeks.",
            rebuttalBullet: "Patient documented radiculopathy on physical exam.",
            sourceUrl: "https://uhc.com",
          },
        ],
        disqualificationCounters: [
          {
            insurerTrapQuestion: "Did the patient complete 6 months of PT?",
            physicianDirectRebuttal: "Clinical guidelines require 6-12 weeks, not 6 months.",
            clinicalRationale: "Guideline criteria satisfied at 12 weeks.",
            regulatoryLeverage: "ERISA regulations prohibit arbitrary guidelines.",
          },
        ],
        statutoryDemands: "Immediate peer-to-peer overturn or written denial rationale within 24 hours.",
        condensedCheatSheet: {
          rapidChecklist: ["State ERISA posture", "Cite CPB Section 3.B", "Demand peer-level reviewer"],
          keyDiagnosisCodes: ["M51.16"],
          keyProcedureCodes: ["63047"],
          mustSayPoints: ["Failed 12 weeks PT", "Progressive motor deficit"],
          doNotConcedePoints: ["Do not concede 6 month timeline requirement"],
          closingDemandStatement: "I demand immediate overturn under clinical guideline criteria.",
        },
      };

      vi.spyOn(libOpenAI, "createStructuredCompletion").mockResolvedValue(mockScriptOutput as any);

      const mockCtx: any = {
        runQuery: vi.fn().mockImplementation((fn, args) => {
          if (args?.claimId) return Promise.resolve(mockClaim);
          return Promise.resolve([]);
        }),
        runMutation: vi.fn().mockResolvedValue("script_new_1"),
      };

      const res = await (actionP2PDefenseGenerator.generateP2PScript as any)._handler(mockCtx, {
        claimId: "c1",
      });

      expect(res.scriptId).toBe("script_new_1");
      expect(mockCtx.runMutation).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
        claimId: "c1",
        physicianName: "Dr. Amanda Vance",
      }));
    });
  });

  describe("convex/actions/p2pLiveCopilot", () => {
    it("generateLiveFastAnswer: parses reviewer trap question and generates instant rebuttal quote", async () => {
      const mockClaim = {
        _id: "c1",
        claimNumber: "CLM-100",
        providerName: "Dr. Amanda Vance",
        patient: { name: "Marcus", insurancePayer: "UHC" },
        cptCodes: ["63047"],
        icd10Codes: ["M51.16"],
      };

      const mockEvidences = [
        {
          _id: "ev1",
          title: "UHC CPB 0016",
          citationClause: "Section 3.B",
          extractedEvidenceMarkdown: "Conservative therapy completed for 12 weeks.",
        },
      ];

      vi.spyOn(libOpenAI, "createStructuredCompletion").mockResolvedValue({
        suggestedQuote: "Doctor, MRI confirmed severe central canal stenosis with progressive L5 motor weakness.",
        chartProof: "EMG/NCS report dated Jan 15, 2026 confirmed acute denervation.",
        cpbCitation: "UHC CPB 0016, Section 3.B",
        regulatoryLeverage: "ERISA standard of care requirements",
        suggestedTactics: ["State clinical guidelines", "Demand peer-level reviewer"],
        confidenceScore: 98,
        trapAnalysis: "Reviewer attempts to enforce non-standard PT timeline.",
      } as any);

      let qCount = 0;
      const mockCtx: any = {
        runQuery: vi.fn().mockImplementation(() => {
          qCount++;
          if (qCount === 1) return Promise.resolve(mockClaim);
          return Promise.resolve(mockEvidences);
        }),
        runMutation: vi.fn().mockResolvedValue(undefined),
      };

      const res = await (actionP2PLiveCopilot.generateLiveFastAnswer as any)._handler(mockCtx, {
        claimId: "c1",
        recentTranscript: "Why did you not try another round of physical therapy?",
      });

      expect(res.suggestedQuote).toContain("MRI confirmed severe");
      expect(res.confidenceScore).toBe(98);
    });

    it("generateInteractiveReviewerPushback: simulates dynamic medical director pushback & concession", async () => {
      const mockClaim = {
        _id: "c1",
        claimNumber: "CLM-100",
        patient: { name: "Marcus", insurancePayer: "UHC" },
        cptCodes: ["63047"],
        icd10Codes: ["M51.16"],
      };

      vi.spyOn(libOpenAI, "createStructuredCompletion").mockResolvedValue({
        spokenText: "Doctor, the documented physical therapy trial satisfies clinical criteria. I am overturning the denial.",
        medicalDirectorTone: "conceding",
        callResolutionStage: "overturned",
        isOverturned: true,
        authorizationNumber: "AUTH-UHC-992182",
        trapQuestion: "Denial Overturned",
        suggestedQuote: "Thank you for the authorization number.",
        chartProof: "Documented 12 weeks of PT.",
        cpbCitation: "UHC CPB 0016 Section 3.B",
      } as any);

      let qCount = 0;
      const mockCtx: any = {
        runQuery: vi.fn().mockImplementation(() => {
          qCount++;
          if (qCount === 1) return Promise.resolve(mockClaim);
          return Promise.resolve([]);
        }),
      };

      const res = await (actionP2PLiveCopilot.generateInteractiveReviewerPushback as any)._handler(mockCtx, {
        claimId: "c1",
        doctorSpeech: "The patient already completed 12 weeks of therapy with progressive weakness.",
        transcriptHistory: [
          { speaker: "reviewer", text: "Why not more PT?" },
          { speaker: "physician", text: "Patient failed 12 weeks." },
        ],
      });

      expect(res.isOverturned).toBe(true);
      expect(res.authorizationNumber).toBe("AUTH-UHC-992182");
    });
  });

  describe("convex/actions/sentinelChatbot", () => {
    it("sendMessageWithTools: executes conversational workflow and responds with assistant message", async () => {
      process.env.OPENAI_API_KEY = "sk-test-key-12345";
      vi.mocked(getAuthUserId).mockResolvedValue("user_123" as any);
      vi.spyOn(rateLimiter, "limit").mockResolvedValue({ ok: true } as any);

      const mockSession = {
        _id: "sess_1",
        userId: "user_123",
        activeClaimId: "c1",
        messageCount: 1,
        summary: "Previous inquiry about ERISA 503",
      };

      const mockMessages = [
        {
          role: "user",
          content: "Hello",
        },
      ];

      let qCount = 0;
      const mockCtx: any = {
        runQuery: vi.fn().mockImplementation(() => {
          qCount++;
          if (qCount === 1) return Promise.resolve(mockSession);
          return Promise.resolve(mockMessages);
        }),
        runMutation: vi.fn().mockResolvedValue("msg_assistant_1"),
      };

      vi.spyOn(libOpenAI, "getOpenAIClient").mockReturnValue({
        chat: {
          completions: {
            create: vi.fn().mockResolvedValue({
              choices: [
                {
                  message: {
                    role: "assistant",
                    content: "Under ERISA § 503, the insurer must provide a full and fair review within 30 days.",
                  },
                },
              ],
            }),
          },
        },
      } as any);

      const res = await (actionSentinelChatbot.sendMessageWithTools as any)._handler(mockCtx, {
        sessionId: "sess_1",
        userMessage: "What is the statutory deadline for ERISA appeals?",
      });

      expect(res.reply).toContain("ERISA § 503");
      expect(mockCtx.runMutation).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
        sessionId: "sess_1",
        role: "assistant",
      }));
    });
  });
});
