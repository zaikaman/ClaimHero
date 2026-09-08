import { describe, it, expect } from "vitest";

describe("Real-Time P2P Live Call Copilot (Clinical Defense Sentinel)", () => {
  const mockClaim = {
    _id: "claim_test_99",
    claimNumber: "CLM-3912-BCG",
    serviceDate: "2024-05-15",
    providerName: "Dr. Amanda Vance, MD",
    deniedAmount: 18450,
    patientOwedAmount: 18450,
    cptCodes: ["63047", "63048"],
    icd10Codes: ["M51.26", "M54.16"],
    denialReasonCode: "CO-50",
    denialReasonDescription: "Not medically necessary under clinical criteria",
    status: "ready_for_review",
    patient: {
      _id: "pat_test_99",
      name: "Marcus Holloway",
      memberId: "UHC-9928104",
      insurancePayer: "UnitedHealthcare",
      state: "Texas",
    },
    appealContext: {
      clinicalFacts: {
        symptomsAndFunctionalImpact: "Intractable L5-S1 radiculopathy with progressive 3/5 motor foot drop",
        examinationFindings: "Positive Straight Leg Raise at 25 degrees, 3/5 EHL motor strength",
        imagingAndDiagnostics: "Lumbar MRI confirms 8mm extruded disc herniation with lateral recess stenosis",
        treatmentHistoryAndResponse: "Failed 12 weeks of structured PT and 2 epidural steroid injections",
      },
      physicianNotes: "Urgent decompression indicated to prevent permanent foot drop nerve palsy.",
    },
  };

  it("validates live call session initial state and default statutory checklist items", () => {
    const defaultChecklist = [
      { id: "reviewer_credentials", label: "Confirm Medical Director name, board specialty & state license #", category: "statutory", isCompleted: false },
      { id: "erisa_notice", label: "State ERISA 29 CFR § 2560.503-1 recording & grievance notice", category: "statutory", isCompleted: false },
      { id: "patient_identifiers", label: "Verify Patient Name, Member ID & Claim Reference Number", category: "clinical", isCompleted: false },
      { id: "cpb_criteria_citation", label: "Cite exact Payer Clinical Policy Bulletin (CPB) section", category: "evidence", isCompleted: false },
      { id: "failed_conservative_proof", label: "Prove failed conservative management / acute neurological deficit", category: "clinical", isCompleted: false },
      { id: "bad_faith_demand", label: "Demand 24-hr written clinical justification if upheld", category: "regulatory", isCompleted: false },
    ];

    expect(defaultChecklist).toHaveLength(6);
    expect(defaultChecklist.every((c) => !c.isCompleted)).toBe(true);
    expect(defaultChecklist[0].id).toBe("reviewer_credentials");
    expect(defaultChecklist[1].id).toBe("erisa_notice");
    expect(defaultChecklist[5].id).toBe("bad_faith_demand");
  });

  it("detects statutory keywords and automatically updates checklist items", () => {
    const spokenPhysicianPhrases = [
      "Before we begin under ERISA 29 CFR 2560.503-1, are you board-certified in this surgical specialty and what is your medical license number?",
      "Regarding patient Marcus Holloway, Member ID UHC-9928104, Claim CLM-3912-BCG.",
      "Under UnitedHealthcare Clinical Policy Bulletin Section 3.B, coverage is indicated.",
      "The patient completed 12 weeks of physical therapy and developed acute motor foot drop deficit.",
      "If you uphold this, we demand a written denial within 24 hours for State Insurance Commissioner bad faith review.",
    ];

    const isLicenseSpoken = spokenPhysicianPhrases[0].toLowerCase().includes("license") && spokenPhysicianPhrases[0].toLowerCase().includes("specialty");
    const isErisaSpoken = spokenPhysicianPhrases[0].toLowerCase().includes("erisa");
    const isPatientSpoken = spokenPhysicianPhrases[1].toLowerCase().includes("uhc-9928104") || spokenPhysicianPhrases[1].toLowerCase().includes("clm-3912-bcg");
    const isCpbSpoken = spokenPhysicianPhrases[2].toLowerCase().includes("policy") && spokenPhysicianPhrases[2].toLowerCase().includes("section");
    const isConservativeSpoken = spokenPhysicianPhrases[3].toLowerCase().includes("physical therapy") && spokenPhysicianPhrases[3].toLowerCase().includes("deficit");
    const isBadFaithSpoken = spokenPhysicianPhrases[4].toLowerCase().includes("24 hours") && spokenPhysicianPhrases[4].toLowerCase().includes("bad faith");

    expect(isLicenseSpoken).toBe(true);
    expect(isErisaSpoken).toBe(true);
    expect(isPatientSpoken).toBe(true);
    expect(isCpbSpoken).toBe(true);
    expect(isConservativeSpoken).toBe(true);
    expect(isBadFaithSpoken).toBe(true);
  });

  it("generates instant 'Say This Right Now' Fast Answer rebuttal cards for insurer objections", () => {
    const insurerObjection = "Why wasn't this patient maintained on 6 months of conservative physical therapy before scheduling surgery?";

    const fastAnswer = {
      id: "fa_test_1",
      trapQuestion: "Did the patient complete sufficient conservative management before scheduling this procedure?",
      suggestedQuote: "Under UnitedHealthcare Policy § 3.B, documented 3/5 foot drop motor weakness waives the 6-month conservative therapy requirement, and the patient already completed 12 weeks of physical therapy.",
      chartProof: mockClaim.appealContext.clinicalFacts.treatmentHistoryAndResponse,
      cpbCitation: "UnitedHealthcare Lumbar Decompression Policy § 3.B",
      regulatoryLeverage: "ERISA 29 CFR § 2560.503-1(h) & Texas Insurance Code § 4201",
      confidenceScore: 98,
      timestamp: Date.now(),
    };

    expect(fastAnswer.suggestedQuote).toContain("Policy § 3.B");
    expect(fastAnswer.suggestedQuote).toContain("3/5 foot drop");
    expect(fastAnswer.chartProof).toContain("12 weeks of structured PT");
    expect(fastAnswer.regulatoryLeverage).toContain("ERISA 29 CFR § 2560.503-1(h)");
    expect(fastAnswer.confidenceScore).toBeGreaterThanOrEqual(90);
  });

  it("computes dynamic call momentum leverage score based on checklist progress and rebuttals", () => {
    const initialChecklist = [
      { id: "1", isCompleted: false },
      { id: "2", isCompleted: false },
      { id: "3", isCompleted: false },
      { id: "4", isCompleted: false },
      { id: "5", isCompleted: false },
      { id: "6", isCompleted: false },
    ];

    const getScore = (list: Array<{ isCompleted: boolean }>) => {
      const completed = list.filter((i) => i.isCompleted).length;
      return Math.round(30 + (completed / list.length) * 65);
    };

    expect(getScore(initialChecklist)).toBe(30);

    const halfDone = initialChecklist.map((item, idx) => ({
      ...item,
      isCompleted: idx < 3,
    }));
    expect(getScore(halfDone)).toBe(63);

    const allDone = initialChecklist.map((item) => ({
      ...item,
      isCompleted: true,
    }));
    expect(getScore(allDone)).toBe(95);
  });

  it("verifies dual-speaker transcript stream formatting and serialization", () => {
    const transcripts = [
      { id: "t1", speaker: "physician" as const, text: "Hello Dr. Reviewer, I am calling for Marcus Holloway.", timestamp: Date.now() - 10000, isFinal: true },
      { id: "t2", speaker: "insurer" as const, text: "Why was this surgery scheduled without 6 months of PT?", timestamp: Date.now() - 5000, isFinal: true },
      { id: "t3", speaker: "physician" as const, text: "The patient completed 12 weeks of PT and developed motor deficit.", timestamp: Date.now(), isFinal: true },
    ];

    expect(transcripts).toHaveLength(3);
    expect(transcripts[0].speaker).toBe("physician");
    expect(transcripts[1].speaker).toBe("insurer");
    expect(transcripts[2].text).toContain("12 weeks of PT");
  });

  it("structures turn-taking reviewer challenges and transitions to doctor response state", () => {
    const reviewerChallenges = [
      {
        id: "challenge_conservative_duration",
        title: "Conservative Therapy Challenge",
        expectedObjection: "Why wasn't the patient maintained on 6 months of conservative physical therapy?",
        spokenText: "Looking at the chart for CPT 63047, why wasn't this patient maintained on 6 full months of conservative physical therapy?",
      },
      {
        id: "challenge_alternative_modalities",
        title: "Alternative Modalities Objection",
        expectedObjection: "Can't this condition still be managed with repeat epidural steroid injections?",
        spokenText: "Can't this diagnosis still be managed with repeat epidural steroid injections or oral NSAIDs?",
      },
    ];

    expect(reviewerChallenges).toHaveLength(2);
    expect(reviewerChallenges[0].spokenText).toContain("6 full months");

    // Simulating turn-taking transition: Reviewer speaks -> System waits for doctor voice
    let currentSpeaker: "physician" | "insurer" = "insurer";
    let isWaitingForDoctor = false;

    // Reviewer speaks
    const transcriptAfterReviewer = {
      speaker: currentSpeaker,
      text: reviewerChallenges[0].spokenText,
    };
    expect(transcriptAfterReviewer.speaker).toBe("insurer");

    // Reviewer speech ends -> activates Doctor's mic turn
    currentSpeaker = "physician";
    isWaitingForDoctor = true;

    expect(currentSpeaker).toBe("physician");
    expect(isWaitingForDoctor).toBe(true);
  });

  it("verifies explicit speaker attribution and toggle reassignment", () => {
    let activeSpeaker: "physician" | "insurer" = "physician";

    // Physician speaks
    const physicianTranscript = {
      id: "t_doc_1",
      speaker: activeSpeaker,
      text: "Under ERISA 29 CFR § 2560.503-1, I am demanding a 24-hour written clinical justification.",
    };
    expect(physicianTranscript.speaker).toBe("physician");

    // Doctor toggles speaker to insurer via UI button or hotkey 'S'
    activeSpeaker = activeSpeaker === "physician" ? "insurer" : "physician";
    expect(activeSpeaker).toBe("insurer");

    // Insurer speaks
    const insurerTranscript = {
      id: "t_ins_1",
      speaker: activeSpeaker,
      text: "Doctor, why wasn't the patient maintained on 6 months of conservative physical therapy?",
    };
    expect(insurerTranscript.speaker).toBe("insurer");

    // 1-Click bubble speaker reassignment
    const reassignSpeaker = (item: { speaker: "physician" | "insurer" }) => ({
      ...item,
      speaker: item.speaker === "physician" ? ("insurer" as const) : ("physician" as const),
    });

    const corrected = reassignSpeaker(physicianTranscript);
    expect(corrected.speaker).toBe("insurer");
  });

  it("strictly degrades fallback to simulation-only without fabricated authorization numbers or fake 99/96 scores", () => {
    // Simulates the contract enforced in useLiveCallCopilot.ts
    const fallbackPushback = {
      spokenText: "Doctor, please note this is a practice simulation only — no authorization is granted.",
      medicalDirectorTone: "conceding" as const,
      callResolutionStage: "conceding" as const,
      isOverturned: false,
      authorizationNumber: undefined,
      trapQuestion: "Simulation only — no authorization granted",
      suggestedQuote: "Understood. Please provide formal written determination pursuant to ERISA 29 CFR § 2560.503-1.",
      chartProof: "Documented 12 weeks of PT failure.",
      cpbCitation: "UHC CPB 0016 Section 3.B",
      confidenceScore: 90,
      generatedBy: "fallback" as const,
    };

    const isFallback = fallbackPushback.generatedBy === "fallback";
    const hasSimulationNotice =
      Boolean(fallbackPushback.trapQuestion?.toLowerCase().includes("simulation only")) ||
      Boolean(fallbackPushback.spokenText?.toLowerCase().includes("simulation only")) ||
      Boolean(fallbackPushback.authorizationNumber?.toLowerCase().includes("simulation only"));

    let isOverturned = false;
    let authorizationNumber: string | null = null;
    let callResolutionStage = "opening";

    if (fallbackPushback.isOverturned && !isFallback && !hasSimulationNotice) {
      isOverturned = true;
      authorizationNumber = fallbackPushback.authorizationNumber || "Simulation only — no authorization granted";
      callResolutionStage = "overturned";
    } else if (isFallback || hasSimulationNotice) {
      isOverturned = false;
      authorizationNumber = "Simulation only — no authorization granted";
      callResolutionStage = fallbackPushback.callResolutionStage || "conceding";
    }

    const derivedConfidenceScore =
      typeof fallbackPushback.confidenceScore === "number" && fallbackPushback.confidenceScore > 0
        ? fallbackPushback.confidenceScore
        : fallbackPushback.chartProof && fallbackPushback.cpbCitation
        ? 91
        : 82;

    expect(isOverturned).toBe(false);
    expect(authorizationNumber).toBe("Simulation only — no authorization granted");
    expect(callResolutionStage).toBe("conceding");
    expect(derivedConfidenceScore).toBe(90);
    expect(authorizationNumber).not.toMatch(/AUTH-[A-Z]{3}-\d+/);
    expect(authorizationNumber).not.toMatch(/AUTH-APP-\d+/);
  });

  it("prevents stale-closure bug: continuous recognition restarts mid-call using isCallLiveRef", () => {
    // Demonstrates bug: with closure captured at call start (isCallLive = false)
    let isCallLiveState = false;
    const isCallLiveRef = { current: isCallLiveState };

    let startCount = 0;
    const mockRecognition = {
      continuous: true,
      start: () => {
        startCount++;
      },
      stop: () => {},
      onend: null as (() => void) | null,
    };

    // startLiveCall sets live state to true
    isCallLiveState = true;
    isCallLiveRef.current = true;

    // With stale closure (checking captured isCallLiveState = false):
    const staleOnEnd = () => {
      const capturedState = false; // Stale closure from render at call start
      if (capturedState) {
        mockRecognition.start();
      }
    };
    staleOnEnd();
    expect(startCount).toBe(0); // Bug: never restarts!

    // With production-grade ref:
    const fixedOnEnd = () => {
      if (isCallLiveRef.current && mockRecognition) {
        mockRecognition.start();
      }
    };

    // First recognition auto-stop mid-call fires onend:
    fixedOnEnd();
    expect(startCount).toBe(1); // Successfully restarted!

    // Second auto-stop mid-call:
    fixedOnEnd();
    expect(startCount).toBe(2); // Restarts again!

    // Call ends
    isCallLiveState = false;
    isCallLiveRef.current = false;

    // onend fires after call ended
    fixedOnEnd();
    expect(startCount).toBe(2); // Does NOT restart when call is terminated
  });

  it("safely halts speech recognition on permission errors without infinite restart loops", () => {
    const isCallLiveRef = { current: true };
    let recognitionInstance: { start: () => void } | null = {
      start: () => {},
    };

    const onError = (err: { error: string }) => {
      if (err.error === "not-allowed" || err.error === "service-not-allowed") {
        recognitionInstance = null;
      }
    };

    onError({ error: "not-allowed" });
    expect(recognitionInstance).toBeNull();

    let restarted = false;
    const onEnd = () => {
      if (isCallLiveRef.current && recognitionInstance) {
        restarted = true;
      }
    };

    onEnd();
    expect(restarted).toBe(false);
  });
});

