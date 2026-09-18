import { describe, it, expect, vi, beforeEach } from "vitest";
import * as actionPrecedentMatcher from "../convex/actions/precedentMatcher";
import * as actionMailDispatcher from "../convex/actions/mailDispatcher";
import * as libOpenAI from "../convex/lib/openai";
import { rateLimiter } from "../convex/lib/rateLimiter";
// @ts-ignore getAuthUserId is injected by vi.mock("@convex-dev/auth/server")
import { getAuthUserId } from "@convex-dev/auth/server";

vi.mock("@convex-dev/auth/server", () => ({
  getAuthUserId: vi.fn(),
}));

describe("Grounded Precedent Matcher & Safe Auto-Reply Synthesis", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getAuthUserId).mockResolvedValue("user_123" as any);
    vi.spyOn(rateLimiter, "limit").mockResolvedValue({ ok: true } as any);
  });

  describe("precedentMatcher: Evidentiary and Statutory Grounding", () => {
    const baseClaim = {
      _id: "c_ground_1",
      claimNumber: "CLM-GRD-100",
      userId: "user_123",
      patient: { name: "Jane Doe", memberId: "M123", insurancePayer: "Aetna", state: "CA" },
      providerName: "Pacific Surgical",
      serviceDate: "2024-03-01",
      cptCodes: ["27447"],
      icd10Codes: ["M17.11"],
      denialReasonCode: "CO-50",
      denialReasonDescription: "Not medically necessary",
      deniedAmount: 45000,
      patientOwedAmount: 5000,
    };

    it("enforces keyPolicyContradictions = [] when no policy evidences exist, despite LLM hallucination", async () => {
      vi.spyOn(libOpenAI, "createStructuredCompletion").mockResolvedValue({
        keyPolicyContradictions: [
          "Aetna CPB 0016 requires only 4 weeks of therapy which was met",
          "Policy Section 4.B contradicted by patient diagnosis",
        ],
        winningPrecedentSummary: "Smith v. Aetna mandates overturn",
        suggestedAppealLevel: "level_3_external_state_review",
        policyAlignmentRationale: "Strong policy alignment",
        clinicalDocumentationRationale: "Complete records",
        statutoryErisaRationale: "Mandate violated",
        precedentStrengthRationale: "Binding case",
      } as any);

      let qCount = 0;
      const mockCtx: any = {
        runQuery: vi.fn().mockImplementation(() => {
          qCount++;
          if (qCount === 1) return Promise.resolve(baseClaim);
          return Promise.resolve([]); // NO evidences in DB
        }),
        runMutation: vi.fn().mockResolvedValue(undefined),
      };

      const result = await (actionPrecedentMatcher.computeOverturnScore as any)._handler(mockCtx, {
        claimId: "c_ground_1",
      });

      // No substantive clinical policy was retrieved: cannot claim key policy contradictions
      expect(result.keyPolicyContradictions).toEqual([]);
      // No precedents matched: must NOT hallucinate "Smith v. Aetna"
      expect(result.winningPrecedentSummary).toBe(
        "No controlling appellate rulings or external review precedents indexed or matched to this denial reason."
      );
      // First appeal without administrative exhaustion: must NOT jump to level 3 external review
      expect(result.suggestedAppealLevel).toBe("level_1_internal");
    });

    it("enforces keyPolicyContradictions = [] when evidence consists purely of statutory baseline notices", async () => {
      const pureStatutoryEvidences = [
        {
          _id: "ev_stat",
          sourceType: "statutory_authority",
          title: "ERISA Full & Fair Review Protocol",
          citationClause: "29 CFR § 2560.503-1",
          extractedEvidenceMarkdown: "Mandatory statutory timeline for benefit claims.",
        },
      ];

      vi.spyOn(libOpenAI, "createStructuredCompletion").mockResolvedValue({
        keyPolicyContradictions: ["Insurer clinical policy bulletin criteria met"],
        winningPrecedentSummary: "Precedent established",
        suggestedAppealLevel: "level_1_internal",
        policyAlignmentRationale: "Policy criteria met",
        clinicalDocumentationRationale: "Clinical documentation confirms failed conservative therapy",
        statutoryErisaRationale: "ERISA violated",
        precedentStrengthRationale: "Strong",
      } as any);

      let qCount = 0;
      const mockCtx: any = {
        runQuery: vi.fn().mockImplementation(() => {
          qCount++;
          if (qCount === 1) return Promise.resolve(baseClaim);
          return Promise.resolve(pureStatutoryEvidences);
        }),
        runMutation: vi.fn().mockResolvedValue(undefined),
      };

      const result = await (actionPrecedentMatcher.computeOverturnScore as any)._handler(mockCtx, {
        claimId: "c_ground_1",
      });

      expect(result.keyPolicyContradictions).toEqual([]);
    });

    it("filters out unsupported clinical conclusions and grounds contradictions when valid CPB evidence exists", async () => {
      const validCpbEvidence = [
        {
          _id: "ev_cpb",
          sourceType: "payer_cpb",
          title: "Aetna CPB 0016 Knee Arthroplasty",
          citationClause: "Section 1.A",
          extractedEvidenceMarkdown: "Total knee arthroplasty is considered medically necessary when severe pain and functional disability persist.",
          sourceUrl: "https://www.aetna.com/cpb/medical/data/1_99/0016.html",
        },
      ];

      vi.spyOn(libOpenAI, "createStructuredCompletion").mockResolvedValue({
        keyPolicyContradictions: [
          // This should be filtered out by UNSUPPORTED_CLINICAL_CONCLUSION
          "Clinical documentation confirms failed conservative therapy and bone-on-bone arthritis",
          // This should be kept because it is grounded in the CPB evidence
          "Aetna CPB 0016 criteria for knee arthroplasty establish coverage indications",
        ],
        winningPrecedentSummary: "Binding precedent supports reversal",
        suggestedAppealLevel: "level_1_internal",
        policyAlignmentRationale: "Documented criteria align with CPB",
        clinicalDocumentationRationale: "Clinical documentation confirms failed conservative", // should fall back to deterministic rationale
        statutoryErisaRationale: "ERISA disclosure mandate",
        precedentStrengthRationale: "Direct precedent",
      } as any);

      let qCount = 0;
      const mockCtx: any = {
        runQuery: vi.fn().mockImplementation(() => {
          qCount++;
          if (qCount === 1) return Promise.resolve(baseClaim);
          return Promise.resolve(validCpbEvidence);
        }),
        runMutation: vi.fn().mockResolvedValue(undefined),
      };

      const result = await (actionPrecedentMatcher.computeOverturnScore as any)._handler(mockCtx, {
        claimId: "c_ground_1",
      });

      // Unsupported clinical conclusion was discarded, grounded item was retained
      expect(result.keyPolicyContradictions).toHaveLength(1);
      expect(result.keyPolicyContradictions[0]).toContain("Aetna CPB 0016");
      expect(result.keyPolicyContradictions[0]).not.toContain("Clinical documentation confirms");

      // Clinical documentation rationale in scoring breakdown fell back to deterministic rationale
      const clinicalItem = result.scoringBreakdown.find((b) => b.category === "clinical_documentation");
      expect(clinicalItem?.rationale).not.toContain("Clinical documentation confirms failed conservative");
    });

    it("grounds winningPrecedentSummary when precedentsUnavailable is true", async () => {
      vi.spyOn(libOpenAI, "createStructuredCompletion").mockResolvedValue({
        keyPolicyContradictions: [],
        winningPrecedentSummary: "Hallucinated court case outcome",
        suggestedAppealLevel: "level_1_internal",
        policyAlignmentRationale: "Rationale",
        clinicalDocumentationRationale: "Rationale",
        statutoryErisaRationale: "Rationale",
        precedentStrengthRationale: "Rationale",
      } as any);

      let qCount = 0;
      const mockCtx: any = {
        runQuery: vi.fn().mockImplementation(() => {
          qCount++;
          if (qCount === 1) return Promise.resolve(baseClaim);
          return Promise.resolve([]);
        }),
        runMutation: vi.fn().mockResolvedValue(undefined),
      };

      const result = await (actionPrecedentMatcher.computeOverturnScore as any)._handler(mockCtx, {
        claimId: "c_ground_1",
        precedentsUnavailable: true,
      });

      expect(result.winningPrecedentSummary).toBe(
        "Precedent Vector Archive was unavailable during evaluation; external judicial documentation benchmark is unverified."
      );
    });
  });

  describe("mailDispatcher: generateAutoReplyDraft Safe Grounding", () => {
    const baseClaim = {
      _id: "c_reply_1",
      claimNumber: "CLM-REP-200",
      userId: "user_123",
      patientName: "Robert Taylor",
      insurancePayer: "UnitedHealthcare",
      providerName: "St. Jude Hospital",
      cptCodes: ["63047"],
      icd10Codes: ["M51.16"],
      denialReasonCode: "CO-50",
      denialReasonDescription: "Not medically necessary",
      deniedAmount: 12000,
    };

    it("sanitizes unsupported clinical conclusions when clinical facts are absent from the claim", async () => {
      // LLM produces an ungrounded draft that claims the record conclusively demonstrates medical necessity
      const rawLlmDraft = `Dear Medical Reviewer,

We are writing in response to your request for additional information regarding Claim #CLM-REP-200.

The clinical record conclusively demonstrates medical necessity under published clinical criteria. Clinical documentation confirms failed conservative therapy for 6 months, severe neurological deficit, and radiographic imaging proving canal stenosis.

We demand immediate payment and full ERISA review within statutory timelines.

Sincerely,
Appeals Specialist`;

      let capturedSystemPrompt = "";
      let capturedUserPrompt = "";
      vi.spyOn(libOpenAI, "createChatCompletion").mockImplementation(async (opts: any) => {
        capturedSystemPrompt = opts.systemPrompt;
        capturedUserPrompt = opts.userPrompt;
        return rawLlmDraft;
      });

      let qCalls = 0;
      const mockCtx: any = {
        runQuery: vi.fn().mockImplementation(() => {
          qCalls++;
          if (qCalls === 1) return Promise.resolve(baseClaim);
          if (qCalls === 2) return Promise.resolve(null);
          return Promise.resolve([]);
        }),
        runMutation: vi.fn().mockResolvedValue(null),
      };

      const res = await (actionMailDispatcher.generateAutoReplyDraft as any)._handler(mockCtx, {
        claimId: "c_reply_1",
        inboundMessageId: "msg_in_1",
      });

      // 1. Check prompt safety: System prompt must NOT tell the model to reiterate that the record conclusively demonstrates medical necessity
      expect(capturedSystemPrompt).not.toContain("conclusively demonstrates medical necessity under published clinical criteria");
      expect(capturedSystemPrompt).toContain("NEVER assert that the record 'conclusively demonstrates medical necessity'");

      // 2. Check user prompt safety: Default prompt must NOT ask for conservative therapy verification to secure immediate overturn
      expect(capturedUserPrompt).not.toContain("secure immediate claim overturn");

      // 3. Check post-generation gate: Unsupported clinical assertions must be sanitized with neutral clinical basis
      expect(res.success).toBe(true);
      expect(res.draftText).not.toContain("conclusively demonstrates medical necessity");
      expect(res.draftText).not.toContain("failed conservative therapy for 6 months");
      expect(res.draftText).toContain("The available claim record does not independently document the patient-specific examination findings");

      // 4. Check DB mutation: Persisted draft must also be sanitized
      expect(mockCtx.runMutation).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          messageId: "msg_in_1",
          autoReplyDraft: expect.not.stringContaining("conclusively demonstrates medical necessity"),
          autoReplyStatus: "pending",
        })
      );
    });

    it("filters out blocked, negative, and site-mismatched evidence from the draft prompt", async () => {
      const mixedEvidences = [
        {
          _id: "ev_blocked",
          title: "403 Forbidden Access Denied",
          citationClause: "Section Blocked",
          extractedEvidenceMarkdown: "Access Denied: You don't have permission to access this resource.",
          sourceUrl: "https://payer.com/blocked",
        },
        {
          _id: "ev_knee_mismatch",
          title: "Knee Arthroplasty CPB",
          citationClause: "Section Knee",
          extractedEvidenceMarkdown: "Knee replacement surgery criteria.",
          sourceUrl: "https://payer.com/knee",
        },
        {
          _id: "ev_valid_spine",
          title: "Lumbar Spine Decompression Policy",
          citationClause: "Section 3.1",
          extractedEvidenceMarkdown: "Laminectomy coverage criteria for lumbar canal stenosis.",
          sourceUrl: "https://payer.com/spine",
        },
      ];

      let capturedSystemPrompt = "";
      vi.spyOn(libOpenAI, "createChatCompletion").mockImplementation(async (opts: any) => {
        capturedSystemPrompt = opts.systemPrompt;
        return "Safe grounded addendum response.";
      });

      let qCalls = 0;
      const mockCtx: any = {
        runQuery: vi.fn().mockImplementation(() => {
          qCalls++;
          if (qCalls === 1) return Promise.resolve(baseClaim);
          if (qCalls === 2) return Promise.resolve(null);
          return Promise.resolve(mixedEvidences);
        }),
        runMutation: vi.fn().mockResolvedValue(null),
      };

      await (actionMailDispatcher.generateAutoReplyDraft as any)._handler(mockCtx, {
        claimId: "c_reply_1",
      });

      // Blocked 403 evidence must be excluded
      expect(capturedSystemPrompt).not.toContain("403 Forbidden Access Denied");
      // Knee anatomical mismatch must be excluded for a spine claim (CPT 63047)
      expect(capturedSystemPrompt).not.toContain("Knee Arthroplasty CPB");
      // Valid spine evidence must be present
      expect(capturedSystemPrompt).toContain("Lumbar Spine Decompression Policy");
    });
  });
});
