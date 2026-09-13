import { describe, it, expect, vi, beforeEach } from "vitest";
import * as policyDrift from "../convex/policyDrift";
import * as policyDriftSentinel from "../convex/actions/policyDriftSentinel";
import * as authLib from "../convex/lib/auth";
import {
  computeContentSha256,
  generateErisaBadFaithNotice,
  heuristicDriftComparison,
} from "../convex/actions/policyDriftSentinel";
// @ts-expect-error - getAuthUserId is provided via vitest mock
import { getAuthUserId } from "@convex-dev/auth/server";
import { internal } from "../convex/_generated/api";

vi.mock("@convex-dev/auth/server", () => ({
  getAuthUserId: vi.fn(),
}));

describe("Policy Drift Sentinel — Retroactive Policy Alteration Detector", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Cryptographic SHA-256 Fingerprint Engine", () => {
    it("computes a deterministic 64-character hex hash", () => {
      const text = "Clinical Policy Bulletin: Knee Arthroscopy and Meniscectomy Criteria";
      const hash1 = computeContentSha256(text);
      const hash2 = computeContentSha256(text);

      expect(hash1).toHaveLength(64);
      expect(/^[0-9a-f]{64}$/.test(hash1)).toBe(true);
      expect(hash1).toBe(hash2);
    });

    it("normalizes CRLF and trailing whitespace before hashing", () => {
      const textLf = "Section 1: Medical Necessity\nCriteria A: Severe pain\nCriteria B: Functional impairment";
      const textCrlf = "Section 1: Medical Necessity\r\nCriteria A: Severe pain\r\nCriteria B: Functional impairment   \n";

      const hashLf = computeContentSha256(textLf);
      const hashCrlf = computeContentSha256(textCrlf);

      expect(hashLf).toBe(hashCrlf);
    });

    it("produces different hashes for even single-character policy alterations", () => {
      const baseline = "Must complete 6 weeks of conservative physical therapy before surgical consideration.";
      const altered = "Must complete 6 months of conservative physical therapy before surgical consideration.";

      const hashBase = computeContentSha256(baseline);
      const hashAlt = computeContentSha256(altered);

      expect(hashBase).not.toBe(hashAlt);
    });
  });

  describe("Heuristic & Semantic Drift Comparison Engine", () => {
    it("detects zero drift when baseline and live policies are identical", () => {
      const policyMarkdown = `# Aetna CPB 0736: Knee Arthroscopy
- Indicated for symptomatic meniscal tear documented on MRI.
- Failure of 6 weeks of conservative therapy if joint space is preserved.`;

      const result = heuristicDriftComparison(policyMarkdown, policyMarkdown, ["29881"]);

      expect(result.hasDrift).toBe(false);
      expect(result.isRetroactiveAlteration).toBe(false);
      expect(result.severity).toBe("none");
      expect(result.detectedChanges).toHaveLength(0);
    });

    it("flags retroactive step-therapy additions as critical bad-faith", () => {
      const baseline = `# Aetna CPB 0736: Knee Arthroscopy
- Indicated for acute meniscus tear with mechanical locking.
- Diagnostic MRI confirming grade III tear.`;

      const liveAltered = `# Aetna CPB 0736: Knee Arthroscopy
- Indicated for acute meniscus tear with mechanical locking.
- Diagnostic MRI confirming grade III tear.
- Patient must complete a trial of 6 months of supervised physical therapy and fail 2 prescription NSAIDs prior to arthroscopy.`;

      const result = heuristicDriftComparison(baseline, liveAltered, ["29881"]);

      expect(result.hasDrift).toBe(true);
      expect(result.isRetroactiveAlteration).toBe(true);
      expect(result.severity).toBe("critical_bad_faith");
      expect(result.detectedChanges.some((c) => c.category === "added_step_therapy")).toBe(true);
      expect(result.detectedChanges[0].isAdverseToClaim).toBe(true);
    });

    it("flags retroactive experimental/investigational exclusions", () => {
      const baseline = `# Cigna CPB 0512: Lumbar Decompression
- Indicated for radiculopathy with spinal stenosis unresponsive to 4 weeks conservative care.`;

      const liveAltered = `# Cigna CPB 0512: Lumbar Decompression
- Indicated for radiculopathy with spinal stenosis unresponsive to 4 weeks conservative care.
- Percutaneous lumbar decompression is considered experimental, investigational, and unproven for patients under 65.`;

      const result = heuristicDriftComparison(baseline, liveAltered, ["63047"]);

      expect(result.hasDrift).toBe(true);
      expect(result.isRetroactiveAlteration).toBe(true);
      expect(result.severity).toBe("critical_bad_faith");
      expect(result.detectedChanges.some((c) => c.category === "added_exclusion")).toBe(true);
    });
  });

  describe("ERISA Bad-Faith Notice of Violation Drafting", () => {
    it("synthesizes formal statutory notice citing 29 CFR § 2560.503-1 and $110/day penalties", () => {
      const notice = generateErisaBadFaithNotice({
        patientName: "Robert Vance",
        memberId: "VNC-78210",
        claimNumber: "CLM-99120",
        payer: "Aetna Life Insurance Company",
        serviceDate: "2026-06-15",
        denialReasonCode: "CO-50",
        cptCodes: ["29881"],
        policyTitle: "Aetna CPB 0736: Knee Arthroscopy",
        policyUrl: "https://www.aetna.com/cpb/medical/data/700_799/0736.html",
        baselineCapturedAt: 1781500000000,
        baselineHash: "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
        liveCapturedAt: 1789300000000,
        liveHash: "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
        detectedChanges: [
          {
            category: "added_step_therapy",
            title: "Added 6-Month Physical Therapy Requirement",
            baselineText: "Trial of 6 weeks conservative therapy",
            liveText: "Trial of 6 months supervised physical therapy and two NSAIDs required prior to operative authorization",
            impact: "Retroactively multiplies conservative treatment timeframe by 4x post-denial.",
            isAdverseToClaim: true,
          },
        ],
      });

      expect(notice).toContain("FORMAL NOTICE OF STATUTORY ERISA VIOLATION");
      expect(notice).toContain("29 CFR § 2560.503-1(h)(2)(iii)");
      expect(notice).toContain("29 U.S.C. § 1133");
      expect(notice).toContain("29 U.S.C. § 1104(a)(1)");
      expect(notice).toContain("$110.00 per day");
      expect(notice).toContain("Robert Vance");
      expect(notice).toContain("CLM-99120");
      expect(notice).toContain("VNC-78210");
      expect(notice).toContain("abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890");
      expect(notice).toContain("1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef");
      expect(notice).toContain("Added 6-Month Physical Therapy Requirement");
      expect(notice).toContain("U.S. Department of Labor Employee Benefits Security Administration (EBSA)");
    });
  });

  describe("Convex Database Queries & Mutations (convex/policyDrift.ts)", () => {
    it("getLatestDrift: returns null when unauthorized or no records found", async () => {
      vi.mocked(getAuthUserId).mockResolvedValue(null);
      const mockCtx: any = { db: { get: vi.fn().mockResolvedValue(null) } };
      const res = await (policyDrift.getLatestDrift as any)._handler(mockCtx, { claimId: "claim_1" });
      expect(res).toBeNull();
    });

    it("getLatestDrift: returns latest drift report when authorized", async () => {
      vi.mocked(getAuthUserId).mockResolvedValue("user_owner" as any);
      const mockClaim = { _id: "claim_1", userId: "user_owner" };
      const mockReport = {
        _id: "drift_1",
        claimId: "claim_1",
        hasDrift: true,
        isRetroactiveAlteration: true,
        severity: "critical_bad_faith",
        baselineContentHash: "hash_base",
        liveContentHash: "hash_live",
      };

      const mockCtx: any = {
        db: {
          get: vi.fn().mockResolvedValue(mockClaim),
          query: vi.fn().mockReturnValue({
            withIndex: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                first: vi.fn().mockResolvedValue(mockReport),
              }),
            }),
          }),
        },
      };

      const res = await (policyDrift.getLatestDrift as any)._handler(mockCtx, { claimId: "claim_1" });
      expect(res).toEqual(mockReport);
    });

    it("saveDriftInternal: inserts drift record and logs policy_drift_detected event in audit log", async () => {
      const mockCtx: any = {
        db: {
          insert: vi.fn().mockResolvedValue("drift_new_id"),
          query: vi.fn().mockReturnValue({
            withIndex: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                first: vi.fn().mockResolvedValue(null),
              }),
            }),
          }),
        },
      };

      const res = await (policyDrift.saveDriftInternal as any)._handler(mockCtx, {
        claimId: "claim_1",
        policyUrl: "https://www.aetna.com/cpb/0736.html",
        policyTitle: "Aetna CPB 0736",
        baselineCapturedAt: 1780000000000,
        baselineContentHash: "hash_base_123",
        baselineMarkdown: "Baseline Policy Text",
        liveCapturedAt: 1785000000000,
        liveContentHash: "hash_live_456",
        liveMarkdown: "Live Policy Text",
        hasDrift: true,
        isRetroactiveAlteration: true,
        severity: "critical_bad_faith",
        summary: "Retroactive alterations detected post-denial",
        detectedChanges: [
          {
            category: "added_step_therapy",
            title: "Added Step Therapy",
            liveText: "Trial of 6 months required",
            impact: "Adverse",
            isAdverseToClaim: true,
          },
        ],
        erisaNoticeDraft: "FORMAL NOTICE OF STATUTORY ERISA VIOLATION...",
        status: "completed",
      });

      expect(res).toBe("drift_new_id");
      expect(mockCtx.db.insert).toHaveBeenCalledWith("policyDrifts", expect.objectContaining({
        claimId: "claim_1",
        isRetroactiveAlteration: true,
        severity: "critical_bad_faith",
      }));
      // Verify audit log entry was also created
      expect(mockCtx.db.insert).toHaveBeenCalledWith("appealAuditLogs", expect.objectContaining({
        claimId: "claim_1",
        eventType: "policy_drift_detected",
      }));
    });

    it("updateErisaNotice: patches notice text when caller has editor access", async () => {
      vi.mocked(getAuthUserId).mockResolvedValue("user_owner" as any);
      const mockDrift = { _id: "drift_1", claimId: "claim_1" };
      const mockClaim = { _id: "claim_1", userId: "user_owner" };

      const mockCtx: any = {
        db: {
          get: vi.fn().mockImplementation((tableOrId, id) => {
            if (tableOrId === "drift_1" || id === "drift_1") return mockDrift;
            if (tableOrId === "claim_1" || id === "claim_1") return mockClaim;
            return null;
          }),
          patch: vi.fn().mockResolvedValue(undefined),
        },
      };

      const res = await (policyDrift.updateErisaNotice as any)._handler(mockCtx, {
        driftId: "drift_1",
        noticeText: "Updated legal demand text...",
      });

      expect(res).toBe(true);
      expect(mockCtx.db.patch).toHaveBeenCalledWith("drift_1", expect.objectContaining({
        erisaNoticeDraft: "Updated legal demand text...",
      }));
    });

    it("appendErisaNoticeToAppeal: appends notice exhibit to active appeal brief and records audit entry", async () => {
      vi.mocked(getAuthUserId).mockResolvedValue("user_owner" as any);
      const mockDrift = {
        _id: "drift_1",
        claimId: "claim_1",
        erisaNoticeDraft: "FORMAL NOTICE: Insurer violated 29 CFR § 2560.503-1",
      };
      const mockClaim = { _id: "claim_1", userId: "user_owner" };
      const mockAppeal = {
        _id: "appeal_1",
        claimId: "claim_1",
        version: 1,
        fullAppealMarkdown: "# Appeal Brief\n\nPatient requires coverage.",
      };

      const mockCtx: any = {
        db: {
          get: vi.fn().mockImplementation((tableOrId, id) => {
            if (tableOrId === "drift_1" || id === "drift_1") return mockDrift;
            if (tableOrId === "claim_1" || id === "claim_1") return mockClaim;
            return null;
          }),
          query: vi.fn().mockReturnValue({
            withIndex: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                first: vi.fn().mockResolvedValue(mockAppeal),
              }),
            }),
          }),
          patch: vi.fn().mockResolvedValue(undefined),
          insert: vi.fn().mockResolvedValue("log_id"),
        },
      };

      const res = await (policyDrift.appendErisaNoticeToAppeal as any)._handler(mockCtx, {
        claimId: "claim_1",
        driftId: "drift_1",
      });

      expect(res).toBe("appeal_1");
      expect(mockCtx.db.patch).toHaveBeenCalledWith("appeal_1", expect.objectContaining({
        fullAppealMarkdown: expect.stringContaining("FORMAL NOTICE: Insurer violated 29 CFR § 2560.503-1"),
      }));
      expect(mockCtx.db.insert).toHaveBeenCalledWith("appealAuditLogs", expect.objectContaining({
        claimId: "claim_1",
        eventType: "appeal_edited",
      }));
    });
  });

  describe("detectPolicyDriftAction Action Workflow", () => {
    it("correctly evaluates zero drift when live policy matches baseline", async () => {
      const mockClaim = {
        _id: "claim_1",
        userId: "user_owner",
        claimNumber: "CH-100",
        serviceDate: "2026-05-10",
        cptCodes: ["29881"],
        denialReasonCode: "CO-50",
        denialReasonDescription: "Not Medically Necessary",
        insurancePayer: "Aetna",
        createdAt: 1780000000000,
      };

      vi.spyOn(authLib, "requireClaimOwnerAction").mockResolvedValue({
        claim: mockClaim as any,
        userId: "user_owner" as any,
        accessRole: "owner",
      });

      const identicalText = "# Aetna CPB 0736\nCriteria A: Grade III meniscal tear confirmed on MRI.\nCriteria B: 6 weeks conservative care.";

      const mockCtx: any = {
        runQuery: vi.fn().mockImplementation((fn, args) => {
          if (args?.urlHash) {
            return {
              _id: "snapshot_1",
              markdown: identicalText,
              capturedAt: 1780000000000,
              title: "Aetna CPB 0736",
            };
          }
          if (args?.claimId) return [];
          return null;
        }),
        runMutation: vi.fn().mockResolvedValue("drift_saved_id"),
      };

      const res = await (policyDriftSentinel.detectPolicyDriftAction as any)._handler(mockCtx, {
        claimId: "claim_1",
        policyUrl: "https://www.aetna.com/cpb/0736.html",
        liveMarkdownOverride: identicalText,
      });

      expect(res.hasDrift).toBe(false);
      expect(res.isRetroactiveAlteration).toBe(false);
      expect(res.severity).toBe("none");
      expect(res.baselineHash).toBe(res.liveHash);
      expect(res.erisaNoticeDraft).toBeUndefined();
    });

    it("flags retroactive criteria and synthesizes ERISA notice when live policy is altered post-denial", async () => {
      const mockClaim = {
        _id: "claim_1",
        userId: "user_owner",
        patientName: "Jane Miller",
        claimNumber: "CH-200",
        serviceDate: "2026-04-12",
        cptCodes: ["29881"],
        denialReasonCode: "CO-50",
        denialReasonDescription: "Medical Necessity",
        insurancePayer: "Cigna",
        createdAt: 1780000000000,
      };

      vi.spyOn(authLib, "requireClaimOwnerAction").mockResolvedValue({
        claim: mockClaim as any,
        userId: "user_owner" as any,
        accessRole: "owner",
      });

      const baselineText = "# Cigna Coverage Policy\n- Arthroscopy covered for symptomatic meniscal tear with documented joint stability.";
      const liveAlteredText = "# Cigna Coverage Policy\n- Arthroscopy covered for symptomatic meniscal tear with documented joint stability.\n- Patient must fail 6 months of conservative therapy including physical therapy and 2 NSAIDs prior to surgery.";

      const mockCtx: any = {
        runQuery: vi.fn().mockImplementation((fn, args) => {
          if (args?.urlHash) {
            return {
              _id: "snapshot_2",
              markdown: baselineText,
              capturedAt: 1780000000000,
              title: "Cigna Policy 0512",
            };
          }
          if (args?.claimId) return [];
          return null;
        }),
        runMutation: vi.fn().mockResolvedValue("drift_bad_faith_id"),
      };

      const res = await (policyDriftSentinel.detectPolicyDriftAction as any)._handler(mockCtx, {
        claimId: "claim_1",
        policyUrl: "https://www.cigna.com/policy/0512.html",
        liveMarkdownOverride: liveAlteredText,
      });

      expect(res.hasDrift).toBe(true);
      expect(res.isRetroactiveAlteration).toBe(true);
      expect(res.severity).toBe("critical_bad_faith");
      expect(res.erisaNoticeDraft).toBeDefined();
      expect(res.erisaNoticeDraft).toContain("FORMAL NOTICE OF STATUTORY ERISA VIOLATION");
      expect(res.erisaNoticeDraft).toContain("Jane Miller");
      expect(res.erisaNoticeDraft).toContain("CH-200");
      expect(res.erisaNoticeDraft).toContain("29 CFR § 2560.503-1(h)(2)(iii)");
    });

    it("throws forbidden error if caller does not own the claim", async () => {
      vi.spyOn(authLib, "requireClaimOwnerAction").mockRejectedValue(
        new Error("Forbidden: You do not have permission to access this claim")
      );

      const mockCtx: any = {
        runQuery: vi.fn(),
        runMutation: vi.fn(),
      };

      await expect(
        (policyDriftSentinel.detectPolicyDriftAction as any)._handler(mockCtx, {
          claimId: "claim_1",
        })
      ).rejects.toThrow("Forbidden");
    });
  });
});
