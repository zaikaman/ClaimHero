import { describe, it, expect, vi, beforeEach } from "vitest";
import { validateClaimClinicalContext, useEvidence } from "../src/hooks/useEvidence";
import { Claim } from "../src/types";

// Mock react hooks so hook can be tested without DOM/render wrapper
vi.mock("react", async () => {
  const actual = await vi.importActual<typeof import("react")>("react");
  return {
    ...actual,
    useMemo: vi.fn((fn: () => any) => fn()),
    useCallback: vi.fn((fn: any) => fn),
  };
});

// Mock convex/react hooks
const actionHandlers = new Map<any, ReturnType<typeof vi.fn>>();
const mutationHandlers = new Map<any, ReturnType<typeof vi.fn>>();

vi.mock("convex/react", () => ({
  useQuery: vi.fn(),
  useAction: vi.fn((actionRef) => {
    if (!actionHandlers.has(actionRef)) {
      actionHandlers.set(actionRef, vi.fn().mockResolvedValue({ success: true }));
    }
    return actionHandlers.get(actionRef)!;
  }),
  useMutation: vi.fn((mutationRef) => {
    if (!mutationHandlers.has(mutationRef)) {
      mutationHandlers.set(mutationRef, vi.fn().mockResolvedValue("mutation_ok"));
    }
    return mutationHandlers.get(mutationRef)!;
  }),
}));

describe("Clinical Validation & Fail-Fast Protection (useEvidence)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    actionHandlers.clear();
    mutationHandlers.clear();
  });

  describe("validateClaimClinicalContext pure validator", () => {
    it("fails fast when claim is undefined or null", () => {
      expect(() => validateClaimClinicalContext(undefined)).toThrow("claim missing procedure/diagnosis codes");
      expect(() => validateClaimClinicalContext(null)).toThrow("claim missing procedure/diagnosis codes");
    });

    it("fails fast when claim has empty cptCodes", () => {
      const claim = {
        _id: "claim_1",
        cptCodes: [],
        icd10Codes: ["M17.11"],
        patient: { insurancePayer: "Aetna" },
      } as unknown as Claim;

      expect(() => validateClaimClinicalContext(claim)).toThrow("claim missing procedure/diagnosis codes");
    });

    it("fails fast when claim has empty icd10Codes", () => {
      const claim = {
        _id: "claim_1",
        cptCodes: ["27447"],
        icd10Codes: [],
        patient: { insurancePayer: "Aetna" },
      } as unknown as Claim;

      expect(() => validateClaimClinicalContext(claim)).toThrow("claim missing procedure/diagnosis codes");
    });

    it("fails fast when codes contain only whitespace strings", () => {
      const claim = {
        _id: "claim_1",
        cptCodes: ["   ", ""],
        icd10Codes: ["  "],
      } as unknown as Claim;

      expect(() => validateClaimClinicalContext(claim)).toThrow("claim missing procedure/diagnosis codes");
    });

    it("fails fast on meniscus claim with missing diagnosis codes without poisoning with knee-arthroplasty criteria", () => {
      const meniscusClaim = {
        _id: "claim_meniscus_1",
        cptCodes: ["29881"], // Knee arthroscopy / meniscectomy
        icd10Codes: [], // Missing diagnosis code
        patient: { insurancePayer: "Cigna" },
      } as unknown as Claim;

      expect(() => validateClaimClinicalContext(meniscusClaim)).toThrow("claim missing procedure/diagnosis codes");
    });

    it("fails fast on spine claim with missing procedure codes without poisoning with knee-arthroplasty criteria", () => {
      const spineClaim = {
        _id: "claim_spine_1",
        cptCodes: [], // Missing CPT code
        icd10Codes: ["M51.26"], // Other intervertebral disc displacement, lumbar
        patient: { insurancePayer: "UnitedHealthcare" },
      } as unknown as Claim;

      expect(() => validateClaimClinicalContext(spineClaim)).toThrow("claim missing procedure/diagnosis codes");
    });

    it("extracts authentic codes without defaulting to Molina, 27447, M17.11, or CO-50", () => {
      const spineClaim = {
        _id: "claim_spine_valid",
        cptCodes: ["63047"],
        icd10Codes: ["M51.26"],
        denialReasonCode: "CO-16",
        patient: { insurancePayer: "Carelon Specialty" },
      } as unknown as Claim;

      const validated = validateClaimClinicalContext(spineClaim);
      expect(validated.cptCodes).toEqual(["63047"]);
      expect(validated.icd10Codes).toEqual(["M51.26"]);
      expect(validated.payer).toBe("Carelon Specialty");
      expect(validated.denialReasonCode).toBe("CO-16");
    });

    it("does not default payer to Molina Healthcare when missing", () => {
      const claimNoPayer = {
        _id: "claim_no_payer",
        cptCodes: ["29881"],
        icd10Codes: ["M23.22"],
      } as unknown as Claim;

      const validated = validateClaimClinicalContext(claimNoPayer);
      expect(validated.payer).toBe("");
      expect(validated.payer).not.toBe("Molina Healthcare");
    });

    it("does not default denialReasonCode to CO-50 when missing", () => {
      const claimNoDenialCode = {
        _id: "claim_no_code",
        cptCodes: ["29881"],
        icd10Codes: ["M23.22"],
      } as unknown as Claim;

      const validated = validateClaimClinicalContext(claimNoDenialCode);
      expect(validated.denialReasonCode).toBe("");
      expect(validated.denialReasonCode).not.toBe("CO-50");
    });
  });

  describe("useEvidence hook fail-fast execution", () => {
    it("crawlPolicy fails fast with 'claim missing procedure/diagnosis codes' when claim codes are missing", async () => {
      const claim = {
        _id: "claim_empty_1",
        cptCodes: [],
        icd10Codes: [],
        patient: { insurancePayer: "Molina Healthcare" },
      } as unknown as Claim;

      const hook = useEvidence(claim);
      await expect(hook.crawlPolicy("claim_empty_1")).rejects.toThrow("claim missing procedure/diagnosis codes");
    });

    it("crawlPolicy fails fast with 'claim missing insurance payer' when payer is missing instead of defaulting to Molina", async () => {
      const claim = {
        _id: "claim_spine_no_payer",
        cptCodes: ["63047"],
        icd10Codes: ["M51.26"],
        denialReasonCode: "CO-50",
      } as unknown as Claim;

      const hook = useEvidence(claim);
      await expect(hook.crawlPolicy("claim_spine_no_payer")).rejects.toThrow("claim missing insurance payer");
    });

    it("crawlPolicy passes authentic claim parameters for valid claim", async () => {
      const claim = {
        _id: "claim_spine_ok",
        cptCodes: ["63047"],
        icd10Codes: ["M51.26"],
        denialReasonCode: "CO-197",
        denialReasonDescription: "Precertification absent",
        patient: { insurancePayer: "Anthem Blue Cross" },
      } as unknown as Claim;

      const hook = useEvidence(claim);
      await hook.crawlPolicy("claim_spine_ok");

      // Verify action was called with authentic spine parameters, not knee arthroplasty
      const actions = Array.from(actionHandlers.values());
      expect(actions.length).toBeGreaterThan(0);
      const callArgs = actions[0].mock.calls[0][0];
      expect(callArgs.cptCodes).toEqual(["63047"]);
      expect(callArgs.icd10Codes).toEqual(["M51.26"]);
      expect(callArgs.payer).toBe("Anthem Blue Cross");
      expect(callArgs.denialReasonCode).toBe("CO-197");
    });

    it("crawlPubMed fails fast when claim has missing procedure/diagnosis codes", async () => {
      const claim = {
        _id: "claim_no_cpt",
        cptCodes: [],
        icd10Codes: ["M17.11"],
      } as unknown as Claim;

      const hook = useEvidence(claim);
      await expect(hook.crawlPubMed("claim_no_cpt")).rejects.toThrow("claim missing procedure/diagnosis codes");
    });

    it("crawlFda fails fast when claim has missing procedure/diagnosis codes", async () => {
      const claim = {
        _id: "claim_no_icd",
        cptCodes: ["27447"],
        icd10Codes: [],
      } as unknown as Claim;

      const hook = useEvidence(claim);
      await expect(hook.crawlFda("claim_no_icd")).rejects.toThrow("claim missing procedure/diagnosis codes");
    });

    it("crawlMultiSourceHub fails fast when claim has missing procedure/diagnosis codes", async () => {
      const claim = {
        _id: "claim_empty_multi",
        cptCodes: [],
        icd10Codes: [],
        patient: { insurancePayer: "Aetna" },
      } as unknown as Claim;

      const hook = useEvidence(claim);
      await expect(hook.crawlMultiSourceHub("claim_empty_multi")).rejects.toThrow("claim missing procedure/diagnosis codes");
    });

    it("computeOverturnScore fails fast when claim has missing procedure/diagnosis codes", async () => {
      const claim = {
        _id: "claim_unscored",
        cptCodes: [],
        icd10Codes: [],
      } as unknown as Claim;

      const hook = useEvidence(claim);
      await expect(hook.computeOverturnScore("claim_unscored")).rejects.toThrow("claim missing procedure/diagnosis codes");
    });

    it("runCompleteAnalysis fails fast when claim has missing procedure/diagnosis codes", async () => {
      const claim = {
        _id: "claim_analysis_empty",
        cptCodes: [],
        icd10Codes: [],
      } as unknown as Claim;

      const hook = useEvidence(claim);
      await expect(hook.runCompleteAnalysis("claim_analysis_empty")).rejects.toThrow("claim missing procedure/diagnosis codes");
    });

    it("runFullPipeline fails fast when claim has missing procedure/diagnosis codes", async () => {
      const claim = {
        _id: "claim_pipeline_empty",
        cptCodes: [],
        icd10Codes: [],
      } as unknown as Claim;

      const hook = useEvidence(claim);
      await expect(hook.runFullPipeline("claim_pipeline_empty")).rejects.toThrow("claim missing procedure/diagnosis codes");
    });

    it("startDurablePipeline fails fast when claim has missing procedure/diagnosis codes", async () => {
      const claim = {
        _id: "claim_workflow_empty",
        cptCodes: [],
        icd10Codes: [],
      } as unknown as Claim;

      const hook = useEvidence(claim);
      await expect(hook.startDurablePipeline("claim_workflow_empty")).rejects.toThrow("claim missing procedure/diagnosis codes");
    });
  });
});
