import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { Claim, CallTranscriptItem, LiveFastAnswer, CallSpeaker } from "../types";

export interface ReviewerChallenge {
  id: string;
  title: string;
  spokenText: string;
  expectedObjection: string;
}

interface SpeechRecognitionResultItem {
  readonly transcript: string;
}

interface SpeechRecognitionResultList {
  readonly length: number;
  [index: number]: {
    readonly isFinal: boolean;
    readonly [index: number]: SpeechRecognitionResultItem;
  };
}

interface SpeechRecognitionEvent {
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEvent {
  readonly error: string;
}

interface BrowserSpeechRecognition {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((error: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

export function useLiveCallCopilot(claim: Claim) {
  const session = useQuery(api.p2pCallSessions.getLatestByClaim, {
    claimId: claim._id as Id<"claims">,
  });

  const startSessionMutation = useMutation(api.p2pCallSessions.startSession);
  const appendTranscriptMutation = useMutation(api.p2pCallSessions.appendTranscript);
  const updateTranscriptSpeakerMutation = useMutation(api.p2pCallSessions.updateTranscriptSpeaker);
  const updateChecklistMutation = useMutation(api.p2pCallSessions.updateChecklist);
  const completeSessionMutation = useMutation(api.p2pCallSessions.completeSession);
  const generateFastAnswerAction = useAction(api.actions.p2pLiveCopilot.generateLiveFastAnswer);
  const generateInteractiveReviewerPushbackAction = useAction(api.actions.p2pLiveCopilot.generateInteractiveReviewerPushback);

  const [isCallLive, setIsCallLive] = useState<boolean>(false);
  const [activeSpeaker, setActiveSpeaker] = useState<CallSpeaker>("physician");
  const [callDuration, setCallDuration] = useState<number>(0);
  const [audioLevel, setAudioLevel] = useState<number>(0);
  const [interimText, setInterimText] = useState<string>("");
  const [isGeneratingAnswer, setIsGeneratingAnswer] = useState<boolean>(false);
  const [isGeneratingPushback, setIsGeneratingPushback] = useState<boolean>(false);
  const [isSimulating, setIsSimulating] = useState<boolean>(false);
  const [isReviewerVoiceMuted, setIsReviewerVoiceMuted] = useState<boolean>(false);
  const [simulationStepIndex, setSimulationStepIndex] = useState<number>(0);
  const [isWaitingForDoctor, setIsWaitingForDoctor] = useState<boolean>(false);
  const [activeFastAnswer, setActiveFastAnswer] = useState<LiveFastAnswer | null>(null);
  const [isOverturned, setIsOverturned] = useState<boolean>(false);
  const [authorizationNumber, setAuthorizationNumber] = useState<string | null>(null);
  const [callResolutionStage, setCallResolutionStage] = useState<string>("opening");

  const currentSessionIdRef = useRef<Id<"p2pCallSessions"> | null>(null);
  const activeSpeakerRef = useRef<CallSpeaker>(activeSpeaker);
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const callTimerRef = useRef<NodeJS.Timeout | number | null>(null);
  const isReviewerSpeakingRef = useRef<boolean>(false);
  const lastReviewerSpeechRef = useRef<string>("");

  // Sync refs with latest state to avoid stale closures in Web Speech callbacks
  useEffect(() => {
    activeSpeakerRef.current = activeSpeaker;
  }, [activeSpeaker]);

  // Sync session ID ref
  useEffect(() => {
    if (session?._id) {
      currentSessionIdRef.current = session._id;
      if (session.fastAnswers && session.fastAnswers.length > 0 && !activeFastAnswer) {
        setActiveFastAnswer(session.fastAnswers[0]);
      }
    }
  }, [session, activeFastAnswer]);

  // Keyword statutory checklist auto-detector
  const evaluateSpokenKeywords = useCallback(
    async (text: string, speaker: CallSpeaker) => {
      if (!currentSessionIdRef.current) return;
      const lower = text.toLowerCase();

      if (speaker === "physician" || speaker === "insurer") {
        if (lower.includes("license") || lower.includes("board-certified") || lower.includes("subspecialty") || lower.includes("specialty")) {
          await updateChecklistMutation({
            sessionId: currentSessionIdRef.current,
            checklistId: "reviewer_credentials",
            isCompleted: true,
          });
        }
        if (lower.includes("erisa") || lower.includes("2560.503") || lower.includes("statutory") || lower.includes("grievance")) {
          await updateChecklistMutation({
            sessionId: currentSessionIdRef.current,
            checklistId: "erisa_notice",
            isCompleted: true,
          });
        }
        if (lower.includes(claim.claimNumber.toLowerCase()) || lower.includes("member id") || lower.includes("patient") || lower.includes(claim.patient?.name?.toLowerCase() || "")) {
          await updateChecklistMutation({
            sessionId: currentSessionIdRef.current,
            checklistId: "patient_identifiers",
            isCompleted: true,
          });
        }
        if (lower.includes("policy") || lower.includes("bulletin") || lower.includes("cpb") || lower.includes("section") || lower.includes("criteria")) {
          await updateChecklistMutation({
            sessionId: currentSessionIdRef.current,
            checklistId: "cpb_criteria_citation",
            isCompleted: true,
          });
        }
        if (lower.includes("conservative") || lower.includes("physical therapy") || lower.includes("injection") || lower.includes("foot drop") || lower.includes("deficit") || lower.includes("weeks") || lower.includes("mri")) {
          await updateChecklistMutation({
            sessionId: currentSessionIdRef.current,
            checklistId: "failed_conservative_proof",
            isCompleted: true,
          });
        }
        if (lower.includes("24 hours") || lower.includes("written denial") || lower.includes("bad faith") || lower.includes("commissioner") || lower.includes("external review")) {
          await updateChecklistMutation({
            sessionId: currentSessionIdRef.current,
            checklistId: "bad_faith_demand",
            isCompleted: true,
          });
        }
      }
    },
    [claim.claimNumber, claim.patient?.name, updateChecklistMutation]
  );

  // Trigger Fast Answer synthesis
  const triggerFastAnswer = useCallback(
    async (insurerSpeech: string) => {
      if (!insurerSpeech || insurerSpeech.trim().length < 8) return;
      setIsGeneratingAnswer(true);

      try {
        const answer = await generateFastAnswerAction({
          sessionId: currentSessionIdRef.current || undefined,
          claimId: claim._id as Id<"claims">,
          recentTranscript: insurerSpeech,
          speakerContext: "insurer",
        });

        setActiveFastAnswer(answer);
      } catch (err) {
        console.error("Failed to generate live fast answer:", err);
      } finally {
        setIsGeneratingAnswer(false);
      }
    },
    [claim._id, generateFastAnswerAction]
  );

  // Append transcript item to Convex
  const appendTranscriptItem = useCallback(
    async (text: string, speaker: CallSpeaker) => {
      if (!text.trim()) return;
      const transcriptId = `tr_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

      const newItem: CallTranscriptItem = {
        id: transcriptId,
        speaker,
        text: text.trim(),
        timestamp: Date.now(),
        isFinal: true,
      };

      if (currentSessionIdRef.current) {
        await appendTranscriptMutation({
          sessionId: currentSessionIdRef.current,
          transcriptItem: newItem,
        });
      }

      evaluateSpokenKeywords(text.trim(), speaker);

      if (speaker === "insurer") {
        triggerFastAnswer(text.trim());
      }
    },
    [appendTranscriptMutation, evaluateSpokenKeywords, triggerFastAnswer]
  );

  // Toggle speaker role on an existing transcript item
  const toggleTranscriptSpeaker = useCallback(
    async (transcriptId: string) => {
      if (!session || !currentSessionIdRef.current) return;
      const target = session.transcripts?.find((t) => t.id === transcriptId);
      if (!target) return;

      const newSpeaker: CallSpeaker = target.speaker === "insurer" ? "physician" : "insurer";
      await updateTranscriptSpeakerMutation({
        sessionId: currentSessionIdRef.current,
        transcriptId,
        newSpeaker,
      });

      if (newSpeaker === "insurer") {
        triggerFastAnswer(target.text);
      }
    },
    [session, updateTranscriptSpeakerMutation, triggerFastAnswer]
  );

  // Start Real-Time Web Speech API Recognition (Listens to Doctor's Mic)
  const startSpeechRecognition = useCallback(() => {
    if (typeof window === "undefined") return;

    const SpeechRecognition =
      (window as unknown as { SpeechRecognition?: new () => BrowserSpeechRecognition; webkitSpeechRecognition?: new () => BrowserSpeechRecognition }).SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: new () => BrowserSpeechRecognition }).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.warn("SpeechRecognition API is not supported in this browser environment.");
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = "en-US";

      recognition.onresult = async (event: SpeechRecognitionEvent) => {
        // If AI Reviewer is currently speaking out loud, ignore mic input to prevent speaker acoustic echo
        if (isReviewerSpeakingRef.current) {
          setInterimText("");
          return;
        }

        let interim = "";
        let final = "";

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            final += event.results[i][0].transcript;
          } else {
            interim += event.results[i][0].transcript;
          }
        }

        if (interim) {
          setInterimText(interim);
        }

        if (final && final.trim()) {
          setInterimText("");

          // Echo filter: if mic heard reviewer's speech that just finished playing, drop it
          if (lastReviewerSpeechRef.current) {
            const cleanFinal = final.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
            const cleanReviewer = lastReviewerSpeechRef.current.toLowerCase().replace(/[^a-z0-9]/g, "");
            if (cleanFinal.length > 15 && cleanReviewer.includes(cleanFinal.slice(0, Math.min(cleanFinal.length, 30)))) {
              // Ignore acoustic echo from reviewer speech
              return;
            }
          }

          const currentSpeaker = activeSpeakerRef.current;
          await appendTranscriptItem(final.trim(), currentSpeaker);
        }
      };

      recognition.onerror = (err: SpeechRecognitionErrorEvent) => {
        if (err.error !== "no-speech") {
          console.warn("Speech recognition error:", err.error);
        }
      };

      recognition.onend = () => {
        if (isCallLive && recognitionRef.current) {
          try {
            recognition.start();
          } catch {
            // ignore start error
          }
        }
      };

      recognition.start();
      recognitionRef.current = recognition;
    } catch (err) {
      console.warn("Failed to initialize speech recognition:", err);
    }
  }, [activeSpeaker, isCallLive, appendTranscriptItem]);

  // Audio Waveform Analyser
  const startAudioAnalyser = useCallback(async () => {
    if (typeof window === "undefined" || !navigator?.mediaDevices?.getUserMedia) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      const AudioContextClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextClass) return;
      const audioCtx = new AudioContextClass();
      audioContextRef.current = audioCtx;

      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 64;
      source.connect(analyser);
      analyserRef.current = analyser;

      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      const updateLevel = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const avg = sum / dataArray.length;
        const normalized = Math.min(100, Math.round((avg / 128) * 100));
        setAudioLevel(normalized);
        animationFrameRef.current = requestAnimationFrame(updateLevel);
      };

      updateLevel();
    } catch (err) {
      console.warn("Mic access for audio waveform visualization not available:", err);
    }
  }, []);

  const stopAudioAnalyser = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    setAudioLevel(0);
  }, []);

  // Start Live Call
  const startLiveCall = useCallback(async () => {
    setIsCallLive(true);
    setActiveSpeaker("physician");
    setCallDuration(0);

    // Create session in Convex
    const sessionId = await startSessionMutation({
      claimId: claim._id as Id<"claims">,
    });
    currentSessionIdRef.current = sessionId;

    // Start timer
    if (callTimerRef.current) clearInterval(callTimerRef.current);
    callTimerRef.current = setInterval(() => {
      setCallDuration((prev) => prev + 1);
    }, 1000);

    // Start audio & STT
    startSpeechRecognition();
    startAudioAnalyser();
  }, [claim._id, startSessionMutation, startSpeechRecognition, startAudioAnalyser]);

  // End Live Call
  const endLiveCall = useCallback(async () => {
    setIsCallLive(false);
    setIsSimulating(false);
    setIsWaitingForDoctor(false);

    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // ignore
      }
      recognitionRef.current = null;
    }

    stopAudioAnalyser();

    if (callTimerRef.current) {
      clearInterval(callTimerRef.current);
      callTimerRef.current = null;
    }

    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }

    if (currentSessionIdRef.current) {
      await completeSessionMutation({
        sessionId: currentSessionIdRef.current,
        durationSeconds: callDuration,
      });
    }
  }, [callDuration, stopAudioAnalyser, completeSessionMutation]);

  // Reviewer Challenges Generator
  const getReviewerChallenges = useCallback((): ReviewerChallenge[] => {
    const payer = claim.patient?.insurancePayer || "Health Insurer";
    const cpt = (claim.cptCodes || [])[0] || "63047";
    const diagnosis = (claim.icd10Codes || [])[0] || "M51.26";

    return [
      {
        id: "challenge_conservative_duration",
        title: "Conservative Therapy Challenge",
        expectedObjection: "Why wasn't the patient maintained on 6 months of conservative physical therapy?",
        spokenText: `Doctor, I am the Medical Director reviewing Claim #${claim.claimNumber} for ${payer}. Looking at the chart for CPT ${cpt}, why wasn't this patient maintained on 6 full months of conservative physical therapy before requesting surgical authorization?`,
      },
      {
        id: "challenge_alternative_modalities",
        title: "Alternative Modalities Objection",
        expectedObjection: "Can't this condition still be managed with repeat epidural steroid injections or oral NSAIDs?",
        spokenText: `Can't this diagnosis (${diagnosis}) still be managed with repeat epidural steroid injections, home exercise programs, or oral NSAIDs rather than hospital surgical intervention?`,
      },
      {
        id: "challenge_imaging_necessity",
        title: "Diagnostic Imaging Prerequisite",
        expectedObjection: "Did advanced imaging correlate with severe objective neurological loss?",
        spokenText: `Under ${payer}'s clinical policy bulletin criteria, did the diagnostic imaging correlate with persistent acute neurological weakness or nerve root compression?`,
      },
      {
        id: "challenge_adverse_determination",
        title: "Adverse Determination Closing",
        expectedObjection: "Final adverse determination warning.",
        spokenText: `Doctor, based on our utilization review criteria, we are inclined to uphold the denial today. Is there any final statutory or clinical evidence you want documented on the record?`,
      },
    ];
  }, [claim]);

  // Play a single Reviewer Challenge and then wait for the doctor to speak
  const playReviewerChallenge = useCallback(
    async (stepIndex: number) => {
      const challenges = getReviewerChallenges();
      if (stepIndex >= challenges.length) {
        setIsSimulating(false);
        setIsWaitingForDoctor(false);
        return;
      }

      const challenge = challenges[stepIndex];
      setSimulationStepIndex(stepIndex);
      isReviewerSpeakingRef.current = true;
      lastReviewerSpeechRef.current = challenge.spokenText;
      setIsSimulating(true);
      setIsWaitingForDoctor(false);
      setInterimText("");

      if (!isCallLive) {
        await startLiveCall();
      }

      // Append the Insurer's challenge to the live transcript
      await appendTranscriptItem(challenge.spokenText, "insurer");

      // Speak the Insurer's challenge aloud using SpeechSynthesis (if voice is enabled)
      if (!isReviewerVoiceMuted && typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(challenge.spokenText);
        utterance.rate = 1.0;
        utterance.pitch = 0.95;

        const onFinishSpeaking = () => {
          // 400ms acoustic grace buffer to ensure room audio has ceased before opening mic to doctor
          setTimeout(() => {
            isReviewerSpeakingRef.current = false;
            setActiveSpeaker("physician");
            setIsWaitingForDoctor(true);
            setInterimText("");
          }, 400);
        };

        utterance.onend = onFinishSpeaking;
        utterance.onerror = onFinishSpeaking;

        window.speechSynthesis.speak(utterance);
      } else {
        isReviewerSpeakingRef.current = false;
        setActiveSpeaker("physician");
        setIsWaitingForDoctor(true);
      }
    },
    [getReviewerChallenges, isCallLive, isReviewerVoiceMuted, startLiveCall, appendTranscriptItem]
  );

  // Play dynamic AI Medical Director response based on what the doctor actually said
  const respondToDoctorSpeech = useCallback(
    async (doctorSpeechOverride?: string) => {
      // Find what the doctor said
      let doctorSpeech = (doctorSpeechOverride || "").trim();

      if (!doctorSpeech && session?.transcripts) {
        const recentDoctorItems = session.transcripts
          .filter((t) => t.speaker === "physician")
          .slice(-3);
        if (recentDoctorItems.length > 0) {
          doctorSpeech = recentDoctorItems.map((t) => t.text).join(" ");
        }
      }

      if (!doctorSpeech) {
        // Fallback to opening challenge if doctor hasn't spoken yet
        playReviewerChallenge(0);
        return;
      }

      setIsGeneratingPushback(true);
      setIsWaitingForDoctor(false);

      try {
        if (!isCallLive) {
          await startLiveCall();
        }

        const history = (session?.transcripts || []).slice(-6).map((t) => ({
          speaker: t.speaker,
          text: t.text,
        }));

        const pushback = await generateInteractiveReviewerPushbackAction({
          claimId: claim._id as Id<"claims">,
          sessionId: currentSessionIdRef.current || undefined,
          doctorSpeech,
          transcriptHistory: history,
        });

        if (pushback.isOverturned) {
          setIsOverturned(true);
          setAuthorizationNumber(pushback.authorizationNumber || `AUTH-APP-${Date.now().toString().slice(-6)}`);
          setCallResolutionStage("overturned");

          // Auto-verify all checklist items on victory
          if (currentSessionIdRef.current) {
            const checklistKeys = [
              "reviewer_credentials",
              "erisa_notice",
              "patient_identifiers",
              "cpb_criteria_citation",
              "failed_conservative_proof",
              "bad_faith_demand",
            ];
            for (const key of checklistKeys) {
              await updateChecklistMutation({
                sessionId: currentSessionIdRef.current,
                checklistId: key,
                isCompleted: true,
              });
            }
          }
        } else if (pushback.callResolutionStage) {
          setCallResolutionStage(pushback.callResolutionStage);
        }

        // Set tailored Fast Answer counter-strike for physician
        const newFastAnswer: LiveFastAnswer = {
          id: `fa_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          trapQuestion: pushback.trapQuestion,
          suggestedQuote: pushback.suggestedQuote,
          chartProof: pushback.chartProof,
          cpbCitation: pushback.cpbCitation,
          regulatoryLeverage: pushback.regulatoryLeverage,
          confidenceScore: pushback.isOverturned ? 99 : 96,
          timestamp: Date.now(),
        };
        setActiveFastAnswer(newFastAnswer);

        // Append reviewer response to transcript
        isReviewerSpeakingRef.current = true;
        lastReviewerSpeechRef.current = pushback.spokenText;
        setSimulationStepIndex((prev) => prev + 1);

        await appendTranscriptItem(pushback.spokenText, "insurer");

        // Speak aloud via SpeechSynthesis (if voice is enabled)
        if (!isReviewerVoiceMuted && typeof window !== "undefined" && "speechSynthesis" in window) {
          window.speechSynthesis.cancel();
          const utterance = new SpeechSynthesisUtterance(pushback.spokenText);
          utterance.rate = 1.0;
          utterance.pitch = 0.95;

          const onFinish = () => {
            setTimeout(() => {
              isReviewerSpeakingRef.current = false;
              setActiveSpeaker("physician");
              setIsWaitingForDoctor(!pushback.isOverturned);
              setInterimText("");
            }, 400);
          };

          utterance.onend = onFinish;
          utterance.onerror = onFinish;

          window.speechSynthesis.speak(utterance);
        } else {
          isReviewerSpeakingRef.current = false;
          setActiveSpeaker("physician");
          setIsWaitingForDoctor(!pushback.isOverturned);
        }
      } catch (err) {
        console.error("Failed to generate dynamic reviewer pushback:", err);
        // Fallback to next challenge
        const nextIdx = simulationStepIndex + 1;
        playReviewerChallenge(nextIdx);
      } finally {
        setIsGeneratingPushback(false);
      }
    },
    [
      session?.transcripts,
      isCallLive,
      claim._id,
      generateInteractiveReviewerPushbackAction,
      isReviewerVoiceMuted,
      startLiveCall,
      appendTranscriptItem,
      simulationStepIndex,
      playReviewerChallenge,
      updateChecklistMutation,
    ]
  );

  // Advance to next Reviewer Challenge (Listens to doctor's rebuttal and generates dynamic pushback)
  const nextReviewerChallenge = useCallback(() => {
    respondToDoctorSpeech();
  }, [respondToDoctorSpeech]);

  // Start Simulation from step 0
  const startSimulation = useCallback(() => {
    setSimulationStepIndex(0);
    setIsOverturned(false);
    setAuthorizationNumber(null);
    setCallResolutionStage("opening");
    playReviewerChallenge(0);
  }, [playReviewerChallenge]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {
          // ignore
        }
      }
      stopAudioAnalyser();
      if (callTimerRef.current) clearInterval(callTimerRef.current);
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, [stopAudioAnalyser]);

  return {
    session,
    isCallLive,
    activeSpeaker,
    setActiveSpeaker,
    callDuration,
    audioLevel,
    interimText,
    isGeneratingAnswer,
    isGeneratingPushback,
    isSimulating,
    isReviewerVoiceMuted,
    setIsReviewerVoiceMuted,
    simulationStepIndex,
    isWaitingForDoctor,
    activeFastAnswer,
    setActiveFastAnswer,
    isOverturned,
    authorizationNumber,
    callResolutionStage,
    startLiveCall,
    endLiveCall,
    appendTranscriptItem,
    toggleTranscriptSpeaker,
    startSimulation,
    nextReviewerChallenge,
    respondToDoctorSpeech,
    getReviewerChallenges,
    triggerFastAnswer,
  };
}
