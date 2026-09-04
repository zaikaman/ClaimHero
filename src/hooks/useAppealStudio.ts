import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Appeal, Claim, AppealLevel } from "../types";
import { Id } from "../../convex/_generated/dataModel";

export interface AppealSenderDetails {
  name: string;
  credentials: string;
  email: string;
  phone: string;
}

export function useAppealStudio(claim?: Claim | null) {
  const claimId = claim?._id as Id<"claims"> | undefined;

  // Real-time query to fetch latest appeal brief from Convex
  const latestAppeal = useQuery(
    api.appeals.getLatestByClaim,
    claimId ? { claimId } : "skip"
  ) as Appeal | null | undefined;

  // Real-time query to fetch all historical versions/revisions across tiers
  const appealVersions = useQuery(
    api.appeals.listVersions,
    claimId ? { claimId } : "skip"
  ) as Appeal[] | undefined;

  const [selectedAppealId, setSelectedAppealId] = useState<string | null>(null);
  const [appealLevel, setAppealLevel] = useState<AppealLevel>("level_1_internal");
  const [markdownContent, setMarkdownContent] = useState<string>("");
  const [isSynthesizing, setIsSynthesizing] = useState<boolean>(false);
  const [isEscalating, setIsEscalating] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [physicianNotes, setPhysicianNotes] = useState<string>(claim?.appealContext?.physicianNotes || "");
  const [senderName, setSenderName] = useState<string>(claim?.appealContext?.sender.name || "");
  const [senderCredentials, setSenderCredentials] = useState<string>(claim?.appealContext?.sender.credentials || "");
  const [senderEmail, setSenderEmail] = useState<string>(claim?.appealContext?.sender.email || "");
  const [senderPhone, setSenderPhone] = useState<string>(claim?.appealContext?.sender.phone || "");

  const saveDraftMutation = useMutation(api.appeals.saveDraft);
  const escalateTierMutation = useMutation(api.appeals.escalateTier);
  const synthesizeAction = useAction(api.actions.appealSynthesizer.generateAppealBrief);

  // Determine active displayed appeal (selected revision or latest)
  const activeAppeal = useMemo(() => {
    if (selectedAppealId && appealVersions) {
      const found = appealVersions.find((a) => a._id === selectedAppealId);
      if (found) return found;
    }
    return latestAppeal || null;
  }, [selectedAppealId, appealVersions, latestAppeal]);

  // Sync markdown content when active appeal changes
  const activeAppealIdRef = useRef<string | null>(null);
  const initializedContextClaimRef = useRef<string | null>(null);

  useEffect(() => {
    if (activeAppeal && activeAppealIdRef.current !== activeAppeal._id) {
      setMarkdownContent(activeAppeal.fullAppealMarkdown || "");
      if (activeAppeal.appealLevel) {
        setAppealLevel(activeAppeal.appealLevel as AppealLevel);
      }
      activeAppealIdRef.current = activeAppeal._id;
    }
  }, [activeAppeal]);

  useEffect(() => {
    if (!claim?._id || initializedContextClaimRef.current === claim._id) return;
    const context = claim.appealContext;
    if (context) {
      if (context.sender) {
        setSenderName(context.sender.name || "");
        setSenderCredentials(context.sender.credentials || "");
        setSenderEmail(context.sender.email || "");
        setSenderPhone(context.sender.phone || "");
      }
      if (context.physicianNotes) {
        setPhysicianNotes(context.physicianNotes);
      }
    }
    initializedContextClaimRef.current = claim._id;
  }, [claim]);

  // Debounced auto-save markdown changes
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Clear pending debounce timer on claim switch or unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }
    };
  }, [claim?._id]);

  const handleUpdateMarkdown = useCallback(
    (newContent: string) => {
      setMarkdownContent(newContent);
      setSaveStatus("saving");

      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }

      saveTimeoutRef.current = setTimeout(async () => {
        const targetId = activeAppeal?._id || latestAppeal?._id;
        if (targetId) {
          setIsSaving(true);
          try {
            await saveDraftMutation({
              appealId: targetId as Id<"appeals">,
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
    [activeAppeal, latestAppeal, saveDraftMutation]
  );

  // Synthesize a complete clinical appeal brief
  const synthesizeAppeal = useCallback(
    async (
      customLevel?: AppealLevel,
      customNotes?: string,
      customSender?: AppealSenderDetails
    ) => {
      if (!claim?._id) {
        throw new Error("No claim selected for appeal synthesis");
      }

      const targetLevel = customLevel || appealLevel;
      setIsSynthesizing(true);
      try {
        const result = await synthesizeAction({
          claimId: claim._id as Id<"claims">,
          appealLevel: targetLevel,
          physicianNotes: customNotes || physicianNotes || undefined,
          senderName: customSender?.name || senderName || undefined,
          senderCredentials: customSender?.credentials || senderCredentials || undefined,
          senderEmail: customSender?.email || senderEmail || undefined,
          senderPhone: customSender?.phone || senderPhone || undefined,
        });

        if (result?.fullAppealMarkdown) {
          setMarkdownContent(result.fullAppealMarkdown);
          setSaveStatus("saved");
          if (result.appealId) {
            setSelectedAppealId(result.appealId);
          }
        }
        return result;
      } finally {
        setIsSynthesizing(false);
      }
    },
    [claim, appealLevel, physicianNotes, senderName, senderCredentials, senderEmail, senderPhone, synthesizeAction]
  );

  // Escalate to next statutory tier and synthesize escalated legal brief
  const escalateTier = useCallback(
    async (targetLevel: AppealLevel, escalationReason?: string) => {
      if (!claim?._id) throw new Error("No claim selected for tier escalation");

      setIsEscalating(true);
      try {
        await escalateTierMutation({
          claimId: claim._id as Id<"claims">,
          targetLevel,
          escalationReason,
          actor: senderName || "Advocate Legal Officer",
        });

        setAppealLevel(targetLevel);
        const synthResult = await synthesizeAppeal(targetLevel);
        return synthResult;
      } finally {
        setIsEscalating(false);
      }
    },
    [claim, senderName, escalateTierMutation, synthesizeAppeal]
  );

  // Helper to switch to a specific historical version
  const selectVersion = useCallback((versionId: string) => {
    setSelectedAppealId(versionId);
  }, []);

  // Helper to insert a citation or note into the editor at active cursor
  const insertTextAtCursor = useCallback(
    (snippet: string) => {
      if (typeof document !== "undefined") {
        const editorEl = document.querySelector(".studio-editor-textarea") as HTMLTextAreaElement | null;
        if (editorEl && typeof editorEl.selectionStart === "number") {
          const start = editorEl.selectionStart;
          const end = editorEl.selectionEnd;
          const before = markdownContent.substring(0, start);
          const after = markdownContent.substring(end);
          const updated = `${before}${snippet}${after}`;
          handleUpdateMarkdown(updated);

          // Restore cursor position immediately after inserted text
          window.requestAnimationFrame(() => {
            editorEl.focus();
            const newCursor = start + snippet.length;
            editorEl.setSelectionRange(newCursor, newCursor);
          });
          return;
        }
      }

      // Fallback: append if editor textarea is not focused or mounted
      const updated = markdownContent.trim().length > 0 ? `${markdownContent}\n\n${snippet}\n` : snippet;
      handleUpdateMarkdown(updated);
    },
    [markdownContent, handleUpdateMarkdown]
  );

  return {
    appeal: activeAppeal,
    latestAppeal: latestAppeal || null,
    appealVersions: appealVersions || [],
    selectedAppealId,
    selectVersion,
    isLoadingAppeal: claimId ? latestAppeal === undefined : false,
    markdownContent,
    setMarkdownContent: handleUpdateMarkdown,
    appealLevel,
    setAppealLevel,
    physicianNotes,
    setPhysicianNotes,
    senderName,
    setSenderName,
    senderCredentials,
    setSenderCredentials,
    senderEmail,
    setSenderEmail,
    senderPhone,
    setSenderPhone,
    isSynthesizing,
    isEscalating,
    isSaving,
    saveStatus,
    synthesizeAppeal,
    escalateTier,
    insertTextAtCursor,
  };
}
