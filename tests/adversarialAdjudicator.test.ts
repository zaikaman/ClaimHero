import { describe, it, expect, vi, beforeEach } from "vitest";
// @ts-ignore getAuthUserId is injected by vi.mock("@convex-dev/auth/server")
import { getAuthUserId } from "@convex-dev/auth/server";
import {
  ADVERSARY_RFI_CHECKLIST,
  PARTIAL_SETTLEMENT_FRACTION,
  buildAdversaryStrategyHint,
  buildCounterRebuttalFallback,
  calculatePartialSettlementOffer,
  detectAdversaryCountermove,
  getCountermoveClaimStatus,
  getCountermoveHeadline,
  getCountermoveLabel,
  pickAdversaryCountermove,
} from "../convex/lib/adversaryNegotiation";

vi.mock("@convex-dev/auth/server", () => ({
  getAuthUserId: vi.fn(),
}));

describe("Insurer Defense Adversary negotiation engine", () => {
  it("prices partial settlement at 40% of the disputed amount", () => {
    expect(PARTIAL_SETTLEMENT_FRACTION).toBe(0.4);
    expect(calculatePartialSettlementOffer(10000)).toBe(4000);
    expect(calculatePartialSettlementOffer(18450)).toBe(7380);
    expect(calculatePartialSettlementOffer(0)).toBe(0);
    expect(calculatePartialSettlementOffer(-5)).toBe(0);
  });

  it("overturns overwhelming files on first review", () => {
    expect(
      pickAdversaryCountermove({
        claimNumber: "CLM-STRONG-1",
        deniedAmount: 12000,
        overturnProbabilityScore: 0.9,
        evidenceCount: 4,
        negotiationRound: 0,
      })
    ).toBe("OVERTURNED_APPROVED");
  });

  it("holds the line on very weak files, then offers partial settlement", () => {
    expect(
      pickAdversaryCountermove({
        claimNumber: "CLM-WEAK-1",
        deniedAmount: 8000,
        overturnProbabilityScore: 0.1,
        evidenceCount: 0,
        negotiationRound: 0,
      })
    ).toBe("DENIAL_UPHELD");
    expect(
      pickAdversaryCountermove({
        claimNumber: "CLM-WEAK-1",
        deniedAmount: 8000,
        overturnProbabilityScore: 0.1,
        evidenceCount: 0,
        negotiationRound: 1,
      })
    ).toBe("PARTIAL_SETTLEMENT_OFFER");
  });

  it("concedes late rounds so negotiation threads converge", () => {
    expect(
      pickAdversaryCountermove({
        claimNumber: "CLM-LONG-1",
        deniedAmount: 9000,
        overturnProbabilityScore: 0.5,
        evidenceCount: 1,
        negotiationRound: 4,
      })
    ).toBe("OVERTURNED_APPROVED");
  });

  it("is deterministic per claim and round", () => {
    const ctx = {
      claimNumber: "CLM-DET-42",
      deniedAmount: 5000,
      overturnProbabilityScore: 0.55,
      evidenceCount: 1,
      negotiationRound: 1,
    };
    expect(pickAdversaryCountermove(ctx)).toBe(pickAdversaryCountermove(ctx));
  });

  it("classifies RFI, CPB conflict, and partial settlement inbound text", () => {
    expect(
      detectAdversaryCountermove("Please provide operative notes — formal Request for Information.")
    ).toBe("ADDITIONAL_RECORDS_REQUIRED");
    expect(
      detectAdversaryCountermove("Per Clinical Policy Bulletin 123, coverage criteria not met per policy clause.")
    ).toBe("POLICY_CONFLICT_CITATION");
    expect(
      detectAdversaryCountermove("We extend a partial settlement offer of 40% of the disputed amount.")
    ).toBe("PARTIAL_SETTLEMENT_OFFER");
    expect(detectAdversaryCountermove("The denial is upheld.")).toBe("DENIAL_UPHELD");
    expect(detectAdversaryCountermove("Overturned and approved for payment.")).toBe(
      "OVERTURNED_APPROVED"
    );
  });

  it("maps countermoves to claim statuses that keep negotiation alive", () => {
    expect(getCountermoveClaimStatus("OVERTURNED_APPROVED")).toBe("won");
    expect(getCountermoveClaimStatus("PARTIAL_SETTLEMENT_OFFER")).toBe("under_review");
    expect(getCountermoveClaimStatus("ADDITIONAL_RECORDS_REQUIRED")).toBe("under_review");
    expect(getCountermoveClaimStatus("POLICY_CONFLICT_CITATION")).toBe("escalated");
    expect(getCountermoveClaimStatus("DENIAL_UPHELD")).toBe("escalated");
    expect(getCountermoveLabel("PARTIAL_SETTLEMENT_OFFER")).toContain("Partial");
    expect(getCountermoveLabel("POLICY_CONFLICT_CITATION")).toContain("Policy");
    expect(getCountermoveHeadline("PARTIAL_SETTLEMENT_OFFER")).toContain("Partial");
  });

  it("drafts tailored fallback rebuttals per countermove", () => {
    const partial = buildCounterRebuttalFallback({
      claimNumber: "CLM-100",
      determination: "PARTIAL_SETTLEMENT_OFFER",
      deniedAmount: 10000,
      settlementAmount: 4000,
      cptCodes: ["29881"],
    });
    expect(partial).toContain("CLM-100");
    expect(partial).toContain("decline");

    const policy = buildCounterRebuttalFallback({
      claimNumber: "CLM-100",
      determination: "POLICY_CONFLICT_CITATION",
      cptCodes: ["29881"],
    });
    expect(policy).toContain("cited clause");

    const rfi = buildCounterRebuttalFallback({
      claimNumber: "CLM-100",
      determination: "ADDITIONAL_RECORDS_REQUIRED",
      cptCodes: ["29881"],
    });
    expect(rfi).toContain("Request for Information");
    expect(ADVERSARY_RFI_CHECKLIST.length).toBeGreaterThan(0);
  });

  it("builds round-aware strategy hints", () => {
    const hint = buildAdversaryStrategyHint({
      claimNumber: "CLM-100",
      deniedAmount: 10000,
      negotiationRound: 1,
    });
    expect(hint).toContain("Negotiation round 1");
  });
});

describe("Adjudicator dispatch with adversary countermoves", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getAuthUserId).mockResolvedValue("user_123" as never);
  });

  it("persists partial settlement with counter-rebuttal and under_review status", async () => {
    const actionMailDispatcher = await import("../convex/actions/mailDispatcher");
    const libOpenAI = await import("../convex/lib/openai");
    const libAgentMail = await import("../convex/lib/agentMail");

    vi.spyOn(libOpenAI, "createStructuredCompletion").mockResolvedValue({
      determination: "PARTIAL_SETTLEMENT_OFFER",
      determinationSummary: "Compromise 40% settlement",
      clinicalRationale: "Residual medical-necessity risk",
      formalDeterminationLetter: "Dear Provider: we offer a partial settlement.",
      authorizedSettlementAmount: 0,
      requestedRecords: [],
      citedPolicyClause: "",
      settlementOfferPct: 0.4,
      reviewerName: "Demo AI Reviewer",
      reviewerTitle: "Independent Clinical Reviewer (Simulated)",
    } as never);
    vi.spyOn(libOpenAI, "createChatCompletion").mockResolvedValue("Tailored counter-rebuttal draft");
    vi.spyOn(libAgentMail, "sendAgentMailMessage").mockResolvedValue({
      messageId: "live_partial_1",
    } as never);

    const mockClaim = {
      _id: "c1",
      claimNumber: "CLM-100",
      userId: "user_123",
      deniedAmount: 10000,
      overturnProbabilityScore: 0.55,
      patient: { name: "Jane Doe", insurancePayer: "UnitedHealthcare" },
    };
    const mockAppeal = {
      _id: "a1",
      claimId: "c1",
      version: 1,
      fullAppealMarkdown: "# Appeal Brief",
      medicalNecessityArguments: "necessity",
    };
    const { rateLimiter } = await import("../convex/lib/rateLimiter");
    vi.spyOn(rateLimiter, "limit").mockResolvedValue({ ok: true } as never);

    let queryCalls = 0;
    const mutations: Array<{ args: Record<string, unknown> }> = [];
    const mockCtx: unknown = {
      runQuery: vi.fn().mockImplementation(() => {
        queryCalls++;
        if (queryCalls === 1) return Promise.resolve(mockClaim);
        if (queryCalls === 2) return Promise.resolve(mockAppeal);
        return Promise.resolve({ thread: null, messages: [] });
      }),
      runMutation: vi.fn().mockImplementation((_fn: unknown, args: Record<string, unknown>) => {
        mutations.push({ args });
        return Promise.resolve("id_1");
      }),
    };

    process.env.AGENTMAIL_API_KEY = "test_key";
    process.env.AGENTMAIL_SENDER_INBOX_ID = "in_send";
    process.env.AGENTMAIL_SENDER_EMAIL = "send@claimhero.com";
    process.env.AGENTMAIL_ADJUDICATOR_INBOX_ID = "in_adj";
    process.env.AGENTMAIL_ADJUDICATOR_EMAIL = "adj@payer.com";

    const receipt = await (actionMailDispatcher.dispatchAppealPacket as unknown as { _handler: Function })._handler(
      mockCtx,
      { claimId: "c1", dispatchMode: "ai_adjudicator" }
    ) as { adjudicationDetermination: string };

    expect(receipt.adjudicationDetermination).toBe("PARTIAL_SETTLEMENT_OFFER");
    const inboundInsert = mutations.find((m) => m.args.direction === "inbound");
    expect(inboundInsert?.args.detectedDetermination).toBe("PARTIAL_SETTLEMENT_OFFER");
    expect(inboundInsert?.args.settlementAmount).toBe(4000);
    expect(inboundInsert?.args.autoReplyDraft).toContain("counter-rebuttal");
    const statusUpdate = mutations.find((m) => m.args.status === "under_review");
    expect(statusUpdate).toBeDefined();
  });
});
