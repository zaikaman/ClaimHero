import { describe, it, expect } from "vitest";
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

  it("avoids false positive approval and denial classifications on routine phrases", () => {
    // False-positive approvals
    expect(
      detectAdversaryCountermove("Please choose a participating in-network physician from our approved provider list.")
    ).toBe("GENERAL_INQUIRY");
    expect(
      detectAdversaryCountermove("Services must be rendered at an approved facility.")
    ).toBe("GENERAL_INQUIRY");
    expect(
      detectAdversaryCountermove("The requested service was not approved prior to treatment.")
    ).toBe("GENERAL_INQUIRY");
    expect(
      detectAdversaryCountermove("Notice: Previous billing charge reversed per adjustment.")
    ).toBe("GENERAL_INQUIRY");
    expect(
      detectAdversaryCountermove("Payment reversed due to duplicate submission.")
    ).toBe("GENERAL_INQUIRY");

    // Negated payment phrases must not trigger approval
    expect(
      detectAdversaryCountermove("Claim review complete. No payment issued.")
    ).toBe("GENERAL_INQUIRY");
    expect(
      detectAdversaryCountermove("Notice: Payment was not issued for service code 99213.")
    ).toBe("GENERAL_INQUIRY");

    // False-positive denials on EOB tables and descriptive charge phrases
    expect(
      detectAdversaryCountermove("EOB Summary: Total Billed $2,500.00, Allowed $0.00, Denied Amount: $2,500.00.")
    ).toBe("GENERAL_INQUIRY");
    expect(
      detectAdversaryCountermove("Regarding the denied charges for service date 01/15/2026.")
    ).toBe("GENERAL_INQUIRY");

    // Member appeal upheld must not be classified as denial upheld
    expect(
      detectAdversaryCountermove("The external arbiter ruled that the member's appeal is upheld.")
    ).not.toBe("DENIAL_UPHELD");
  });

  it("detects dollar-only and custom percentage partial settlement offers", () => {
    expect(
      detectAdversaryCountermove("The payer is willing to offer $3,500 to settle this dispute.")
    ).toBe("PARTIAL_SETTLEMENT_OFFER");
    expect(
      detectAdversaryCountermove("We propose to settle the claim for $1,250.")
    ).toBe("PARTIAL_SETTLEMENT_OFFER");
    expect(
      detectAdversaryCountermove("Insurer counter-offer of $4,500 in full resolution.")
    ).toBe("PARTIAL_SETTLEMENT_OFFER");
    expect(
      detectAdversaryCountermove("We can agree to a 50% settlement of the disputed balance.")
    ).toBe("PARTIAL_SETTLEMENT_OFFER");
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
