import { useState, useEffect, useCallback, useRef } from "react";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Appeal, Claim, AppealLevel } from "../types";

const convexApi = api as any;

export function useAppealStudio(claim?: Claim | null) {
  const claimId = claim?._id;

  // Real-time query to fetch latest appeal brief from Convex
  const latestAppeal = useQuery(
    convexApi.appeals.getLatestByClaim,
    claimId ? { claimId: claimId as any } : "skip"
  ) as Appeal | null | undefined;

  const [appealLevel, setAppealLevel] = useState<AppealLevel>("level_1_internal");
  const [markdownContent, setMarkdownContent] = useState<string>("");
  const [isSynthesizing, setIsSynthesizing] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [physicianNotes, setPhysicianNotes] = useState<string>("");

  const saveDraftMutation = useMutation(convexApi.appeals.saveDraft);
  const synthesizeAction = useAction(
    convexApi["actions/appealSynthesizer"]?.generateAppealBrief ||
    convexApi.actions?.appealSynthesizer?.generateAppealBrief
  );

  // Sync markdown content when appeal is loaded or changed from cloud
  const initializedClaimRef = useRef<string | null>(null);

  useEffect(() => {
    if (latestAppeal && initializedClaimRef.current !== latestAppeal._id) {
      setMarkdownContent(latestAppeal.fullAppealMarkdown || "");
      if (latestAppeal.appealLevel) {
        setAppealLevel(latestAppeal.appealLevel as AppealLevel);
      }
      initializedClaimRef.current = latestAppeal._id;
    }
  }, [latestAppeal]);

  // Debounced auto-save markdown changes
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleUpdateMarkdown = useCallback(
    (newContent: string) => {
      setMarkdownContent(newContent);
      setSaveStatus("saving");

      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }

      saveTimeoutRef.current = setTimeout(async () => {
        if (latestAppeal?._id) {
          setIsSaving(true);
          try {
            await saveDraftMutation({
              appealId: latestAppeal._id as any,
              fullAppealMarkdown: newContent,
              lastEditedBy: "Collaborative Advocate Studio",
            });
            setSaveStatus("saved");
            setTimeout(() => setSaveStatus("idle"), 2500);
          } catch (err) {
            console.error("Failed to auto-save appeal:", err);
            setSaveStatus("idle");
          } finally {
            setIsSaving(false);
          }
        }
      }, 1200);
    },
    [latestAppeal, saveDraftMutation]
  );

  // Synthesize a complete clinical appeal brief
  const synthesizeAppeal = useCallback(
    async (customLevel?: AppealLevel, customNotes?: string) => {
      if (!claim?._id) {
        throw new Error("No claim selected for appeal synthesis");
      }

      setIsSynthesizing(true);
      try {
        const result = await synthesizeAction({
          claimId: claim._id as any,
          appealLevel: customLevel || appealLevel,
          physicianNotes: customNotes || physicianNotes || undefined,
        });

        if (result?.fullAppealMarkdown) {
          setMarkdownContent(result.fullAppealMarkdown);
          setSaveStatus("saved");
        }
        return result;
      } finally {
        setIsSynthesizing(false);
      }
    },
    [claim, appealLevel, physicianNotes, synthesizeAction]
  );

  // Helper to append a citation or note into the editor
  const insertTextAtCursor = useCallback(
    (snippet: string) => {
      const updated = `${markdownContent}\n\n${snippet}\n`;
      handleUpdateMarkdown(updated);
    },
    [markdownContent, handleUpdateMarkdown]
  );

  return {
    appeal: latestAppeal || null,
    isLoadingAppeal: claimId ? latestAppeal === undefined : false,
    markdownContent,
    setMarkdownContent: handleUpdateMarkdown,
    appealLevel,
    setAppealLevel,
    physicianNotes,
    setPhysicianNotes,
    isSynthesizing,
    isSaving,
    saveStatus,
    synthesizeAppeal,
    insertTextAtCursor,
  };
}
