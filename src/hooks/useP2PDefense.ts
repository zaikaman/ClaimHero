import { useState, useEffect, useCallback, useRef } from "react";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Claim, P2PScript } from "../types";
import { Id } from "../../convex/_generated/dataModel";

export function useP2PDefense(claim?: Claim | null) {
  const claimId = claim?._id as Id<"claims"> | undefined;

  // Real-time query to fetch latest P2P defense script from Convex
  const latestScript = useQuery(
    api.p2pScripts.getLatestByClaim,
    claimId ? { claimId } : "skip"
  ) as P2PScript | null | undefined;

  const [markdownContent, setMarkdownContent] = useState<string>("");
  const [isSynthesizing, setIsSynthesizing] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");

  // Timer & Call Companion State (3 Minutes = 180s)
  const [isTimerRunning, setIsTimerRunning] = useState<boolean>(false);
  const [timerSeconds, setTimerSeconds] = useState<number>(0);
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const saveEditsMutation = useMutation(api.p2pScripts.saveScriptEdits);
  const generateAction = useAction(api.actions.p2pDefenseGenerator.generateP2PScript);

  const initializedScriptRef = useRef<string | null>(null);

  useEffect(() => {
    if (latestScript && initializedScriptRef.current !== latestScript._id) {
      setMarkdownContent(latestScript.fullScriptMarkdown || "");
      initializedScriptRef.current = latestScript._id;
    }
  }, [latestScript]);

  // Timer management
  useEffect(() => {
    if (isTimerRunning) {
      timerIntervalRef.current = setInterval(() => {
        setTimerSeconds((prev) => prev + 1);
      }, 1000);
    } else if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
    }
    return () => {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }
    };
  }, [isTimerRunning]);

  const startTimer = useCallback(() => setIsTimerRunning(true), []);
  const pauseTimer = useCallback(() => setIsTimerRunning(false), []);
  const resetTimer = useCallback(() => {
    setIsTimerRunning(false);
    setTimerSeconds(0);
  }, []);

  // Compute active script phase based on elapsed seconds:
  // Phase 0 (0-45s): Statutory Opening & Credentials
  // Phase 1 (45-120s): Exact CPB Citations & Clinical Proof
  // Phase 2 (120-165s): Disqualification Trap Counters
  // Phase 3 (165s+): State Bad-Faith Demand
  const activePhaseIndex =
    timerSeconds < 45 ? 0 : timerSeconds < 120 ? 1 : timerSeconds < 165 ? 2 : 3;

  // Auto-save debounced markdown updates
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleUpdateMarkdown = useCallback(
    (newContent: string) => {
      setMarkdownContent(newContent);
      setSaveStatus("saving");

      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }

      saveTimeoutRef.current = setTimeout(async () => {
        if (latestScript?._id && saveEditsMutation) {
          setIsSaving(true);
          try {
            await saveEditsMutation({
              scriptId: latestScript._id as Id<"p2pScripts">,
              fullScriptMarkdown: newContent,
              lastEditedBy: "Physician Advocate Editor",
            });
            setSaveStatus("saved");
            setTimeout(() => setSaveStatus("idle"), 2500);
          } catch (err) {
            console.error("Failed to auto-save P2P script:", err);
            setSaveStatus("idle");
          } finally {
            setIsSaving(false);
          }
        }
      }, 1200);
    },
    [latestScript, saveEditsMutation]
  );

  // Generate / Regenerate Action
  const generateScript = useCallback(
    async (options?: {
      physicianName?: string;
      physicianSpecialty?: string;
      medicalDirectorRole?: string;
      customStrategyNotes?: string;
    }) => {
      if (!claim?._id) {
        throw new Error("No claim selected for P2P script generation");
      }

      setIsSynthesizing(true);
      try {
        const result = await generateAction({
          claimId: claim._id as Id<"claims">,
          physicianName: options?.physicianName,
          physicianSpecialty: options?.physicianSpecialty,
          medicalDirectorRole: options?.medicalDirectorRole,
          customStrategyNotes: options?.customStrategyNotes,
        });

        if (result?.fullScriptMarkdown) {
          setMarkdownContent(result.fullScriptMarkdown);
          setSaveStatus("saved");
        }
        return result;
      } finally {
        setIsSynthesizing(false);
      }
    },
    [claim, generateAction]
  );

  return {
    script: latestScript || null,
    isLoadingScript: claimId ? latestScript === undefined : false,
    markdownContent,
    setMarkdownContent: handleUpdateMarkdown,
    isSynthesizing,
    isSaving,
    saveStatus,
    generateScript,
    // Timer & Call Companion
    isTimerRunning,
    timerSeconds,
    activePhaseIndex,
    startTimer,
    pauseTimer,
    resetTimer,
  };
}
