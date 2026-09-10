import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useQuery, useMutation, useAction } from "convex/react";
import * as Y from "yjs";
import { api } from "../../convex/_generated/api";
import { Appeal, Claim, AppealLevel } from "../types";
import { decideRemoteSync } from "../lib/collabSync";
import {
  YJS_LOCAL_ORIGIN,
  YJS_REMOTE_ORIGIN,
  restoreSelectionIn,
  transactTextDiff,
  transformSelection,
  type TextDeltaOp,
} from "../lib/yjsBrief";
import { BriefSyncProvider, type BriefSyncStatus, type SyncPayload } from "../lib/yjsProvider";
import { Id } from "../../convex/_generated/dataModel";

export interface AppealSenderDetails {
  name: string;
  credentials: string;
  email: string;
  phone: string;
}

export type CollabSyncStatus = "off" | BriefSyncStatus;

export function useAppealStudio(
  claim?: Claim | null,
  options?: { editorName?: string; readOnly?: boolean }
) {
  const claimId = claim?._id as Id<"claims"> | undefined;
  const editorName = options?.editorName?.trim() || "Collaborative Advocate Studio";

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
  const pushYjsMutation = useMutation(api.appealYjs.pushUpdates);
  const seedYjsMutation = useMutation(api.appealYjs.seedAppealDoc);
  const snapshotYjsMutation = useMutation(api.appealYjs.pushSnapshot);

  // Determine active displayed appeal (selected revision or latest)
  const activeAppeal = useMemo(() => {
    if (selectedAppealId && appealVersions) {
      const found = appealVersions.find((a) => a._id === selectedAppealId);
      if (found) return found;
    }
    return latestAppeal || null;
  }, [selectedAppealId, appealVersions, latestAppeal]);

  // Sync markdown content when active appeal changes.
  // Same-document updates from collaborators are applied live when the local
  // editor is clean, or stashed as a conflict when local edits are unsaved.
  const activeAppealIdRef = useRef<string | null>(null);
  const initializedContextClaimRef = useRef<string | null>(null);
  const markdownContentRef = useRef<string>("");
  const lastSyncedContentRef = useRef<string | null>(null);
  const lastSyncedAtRef = useRef<number>(0);
  const saveInFlightRef = useRef<boolean>(false);
  const recentOwnSavesRef = useRef<string[]>([]);
  const [pendingRemote, setPendingRemote] = useState<{
    content: string;
    updatedAt: number;
    by: string;
  } | null>(null);
  const [remoteFlash, setRemoteFlash] = useState<boolean>(false);
  const remoteFlashTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced auto-save timers (declared before the sync effect below because
  // the effect clears pending saves when adopting remote content).
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveStatusTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ---- Yjs CRDT live-editing session -------------------------------------
  // When viewing the latest revision, a shared Y.Doc merges keystrokes from
  // all collaborators through the Convex op log. The textarea stays visually
  // identical; only the merge semantics change (no more last-writer-wins).
  const providerRef = useRef<BriefSyncProvider | null>(null);
  const ytextRef = useRef<Y.Text | null>(null);
  const undoRef = useRef<Y.UndoManager | null>(null);
  const yjsActiveRef = useRef<boolean>(false);
  const yjsAppealIdRef = useRef<string | null>(null);
  const baselineRef = useRef<string>("");
  const quietRef = useRef<boolean>(true);
  const readOnlyRef = useRef<boolean>(!!options?.readOnly);
  const editorElRef = useRef<HTMLTextAreaElement | null>(null);
  const composingRef = useRef<boolean>(false);
  const deferredRemoteRef = useRef<{ content: string; sel: [number, number] | null } | null>(null);
  const clockRef = useRef<number>(-1);
  const [boundAppealId, setBoundAppealId] = useState<string | null>(null);
  const [syncClock, setSyncClock] = useState<number>(-1);
  const [syncEpoch, setSyncEpoch] = useState<number>(0);
  const [collabStatus, setCollabStatus] = useState<CollabSyncStatus>("off");

  // Incremental op-log subscription for the bound revision. syncEpoch is a
  // resubscribe nonce the provider bumps after losing a seed race.
  const yjsSync = useQuery(
    api.appealYjs.getSync,
    boundAppealId
      ? { appealId: boundAppealId as Id<"appeals">, sinceClock: syncClock, epoch: syncEpoch }
      : "skip"
  ) as SyncPayload | undefined;

  const flashRemoteApplied = useCallback(() => {
    setRemoteFlash(true);
    if (remoteFlashTimeoutRef.current) clearTimeout(remoteFlashTimeoutRef.current);
    remoteFlashTimeoutRef.current = setTimeout(() => {
      setRemoteFlash(false);
      remoteFlashTimeoutRef.current = null;
    }, 3000);
  }, []);

  // Mirror the readOnly option into a ref so stable callbacks observe it.
  useEffect(() => {
    readOnlyRef.current = !!options?.readOnly;
  }, [options?.readOnly]);

  const schedulePersistRef = useRef<() => void>(() => {});
  const teardownYjs = useCallback(() => {
    const provider = providerRef.current;
    providerRef.current = null;
    ytextRef.current = null;
    undoRef.current = null;
    yjsActiveRef.current = false;
    yjsAppealIdRef.current = null;
    baselineRef.current = "";
    quietRef.current = true;
    composingRef.current = false;
    deferredRemoteRef.current = null;
    if (provider) {
      try {
        provider.flushNow();
      } catch {
        // Best-effort final flush.
      }
      provider.destroy();
    }
    clockRef.current = -1;
    setSyncClock(-1);
    setBoundAppealId(null);
    setCollabStatus("off");
  }, []);

  // Persist the merged brief text to the canonical appeals document (debounced).
  // Reads from the Yjs doc when bound so remote merges persist even if the
  // local user is idle; skips identical content to avoid redundant writes.
  const schedulePersist = useCallback(() => {
    setSaveStatus("saving");
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    saveTimeoutRef.current = setTimeout(async () => {
      const boundId = yjsAppealIdRef.current;
      const targetId = boundId ?? activeAppeal?._id ?? latestAppeal?._id;
      if (!targetId) return;
      const payload =
        boundId && ytextRef.current && boundId === yjsAppealIdRef.current
          ? ytextRef.current.toString()
          : markdownContentRef.current;
      if (payload === lastSyncedContentRef.current) {
        setSaveStatus("idle");
        return;
      }
      setIsSaving(true);
      saveInFlightRef.current = true;
      try {
        await saveDraftMutation({
          appealId: targetId as Id<"appeals">,
          fullAppealMarkdown: payload,
          lastEditedBy: editorName,
        });
        lastSyncedContentRef.current = payload;
        recentOwnSavesRef.current = [...recentOwnSavesRef.current, payload].slice(-5);
        setPendingRemote(null);
        setSaveStatus("saved");
        if (saveStatusTimeoutRef.current) {
          clearTimeout(saveStatusTimeoutRef.current);
        }
        saveStatusTimeoutRef.current = setTimeout(() => {
          setSaveStatus("idle");
          saveStatusTimeoutRef.current = null;
        }, 2500);
      } catch (err) {
        console.error("Failed to auto-save appeal:", err);
        setSaveStatus("idle");
      } finally {
        saveInFlightRef.current = false;
        setIsSaving(false);
      }
    }, 1200);
  }, [activeAppeal, latestAppeal, saveDraftMutation, editorName]);

  useEffect(() => {
    schedulePersistRef.current = schedulePersist;
  }, [schedulePersist]);

  // Apply one remote Yjs batch to the mirror editor state with cursor mapping.
  const applyRemoteYjsText = useCallback(
    (str: string, delta: TextDeltaOp[] | null) => {
      let sel: [number, number] | null = null;
      const el = editorElRef.current;
      if (
        el &&
        delta &&
        typeof document !== "undefined" &&
        document.activeElement === el &&
        typeof el.selectionStart === "number"
      ) {
        try {
          sel = transformSelection(el.selectionStart, el.selectionEnd ?? el.selectionStart, delta);
        } catch {
          sel = null;
        }
      }
      // Defer DOM updates across IME composition; the merge is already in the
      // Yjs doc and flushes to the mirror on compositionend.
      if (composingRef.current) {
        deferredRemoteRef.current = { content: str, sel };
        return;
      }
      markdownContentRef.current = str;
      setMarkdownContent(str);
      if (sel && el) restoreSelectionIn(el, sel);
    },
    []
  );

  const observeYjs = useCallback(
    (event: Y.YTextEvent, txn: Y.Transaction) => {
      const ytext = ytextRef.current;
      if (!ytext) return;
      const str = ytext.toString();
      if (txn.origin !== YJS_REMOTE_ORIGIN) {
        // Local keystrokes, undo/redo, and seed mirrors converge here; the
        // callers already scheduled persistence where needed.
        markdownContentRef.current = str;
        setMarkdownContent(str);
        return;
      }
      if (quietRef.current) {
        // Bootstrap catch-up: mirror silently, no flash, no extra persist.
        markdownContentRef.current = str;
        setMarkdownContent(str);
        return;
      }
      let delta: TextDeltaOp[] | null = null;
      try {
        delta = (event.changes.delta ?? []) as TextDeltaOp[];
      } catch {
        delta = null;
      }
      applyRemoteYjsText(str, delta);
      schedulePersistRef.current();
      flashRemoteApplied();
    },
    [applyRemoteYjsText, flashRemoteApplied]
  );

  const observeYjsRef = useRef(observeYjs);
  useEffect(() => {
    observeYjsRef.current = observeYjs;
  }, [observeYjs]);

  // Bind the shared Y.Doc for the latest revision, or fall back to static
  // single-writer semantics for historical revisions and pre-first-synthesis.
  const bindYjs = useCallback(
    (appeal: Appeal, incoming: string) => {
      teardownYjs();
      const isEditor = !readOnlyRef.current;
      const provider = new BriefSyncProvider(appeal._id, {
        baseline: incoming,
        isEditor,
        cbs: {
          pushUpdates: async (updates) => {
            await pushYjsMutation({ appealId: appeal._id as Id<"appeals">, updates });
          },
          seedDoc: async (update, contentHash) => {
            const res = await seedYjsMutation({
              appealId: appeal._id as Id<"appeals">,
              update,
              contentHash,
            });
            return { seeded: res.seeded };
          },
          pushSnapshot: async (baseClock, snapshot) => {
            await snapshotYjsMutation({
              appealId: appeal._id as Id<"appeals">,
              baseClock,
              snapshot,
            });
          },
          onRemoteBatch: () => flashRemoteApplied(),
          onClock: (nextClock) => {
            if (nextClock !== clockRef.current) {
              clockRef.current = nextClock;
              setSyncClock(nextClock);
            }
          },
          onNeedRefetch: () => setSyncEpoch((epoch) => epoch + 1),
          onStatus: (status) => setCollabStatus(status),
          onReady: () => {
            quietRef.current = false;
          },
        },
      });
      providerRef.current = provider;
      ytextRef.current = provider.ytext;
      yjsAppealIdRef.current = appeal._id;
      yjsActiveRef.current = true;
      baselineRef.current = incoming;
      quietRef.current = true;
      try {
        undoRef.current = new Y.UndoManager(provider.ytext, {
          trackedOrigins: new Set<unknown>([YJS_LOCAL_ORIGIN]),
        });
      } catch {
        undoRef.current = null;
      }
      provider.ytext.observe((event, txn) => observeYjsRef.current(event, txn));
      clockRef.current = -1;
      setSyncClock(-1);
      setBoundAppealId(appeal._id);
      setCollabStatus("bootstrapping");
      // Instant readability; editing unlocks once the provider reports live.
      markdownContentRef.current = incoming;
      setMarkdownContent(incoming);
      lastSyncedContentRef.current = incoming;
      lastSyncedAtRef.current = appeal.updatedAt || 0;
      setPendingRemote(null);
    },
    [teardownYjs, pushYjsMutation, seedYjsMutation, snapshotYjsMutation, flashRemoteApplied]
  );

  const latestAppealId = latestAppeal?._id;
  useEffect(() => {
    if (!activeAppeal) return;
    const incoming = activeAppeal.fullAppealMarkdown || "";
    const incomingAt = activeAppeal.updatedAt || 0;
    const viewingLatest =
      !selectedAppealId || (latestAppealId !== undefined && selectedAppealId === latestAppealId);

    if (!viewingLatest || !claimId) {
      // Static mode (historical revision): legacy single-writer semantics.
      if (providerRef.current) teardownYjs();
      yjsActiveRef.current = false;
      if (activeAppealIdRef.current !== activeAppeal._id) {
        activeAppealIdRef.current = activeAppeal._id;
        if (saveTimeoutRef.current) {
          clearTimeout(saveTimeoutRef.current);
          saveTimeoutRef.current = null;
        }
        markdownContentRef.current = incoming;
        setMarkdownContent(incoming);
        lastSyncedContentRef.current = incoming;
        lastSyncedAtRef.current = incomingAt;
        setPendingRemote(null);
        if (activeAppeal.appealLevel) {
          setAppealLevel(activeAppeal.appealLevel as AppealLevel);
        }
        return;
      }
      const decision = decideRemoteSync({
        incomingContent: incoming,
        incomingUpdatedAt: incomingAt,
        lastSyncedContent: lastSyncedContentRef.current,
        lastSyncedAt: lastSyncedAtRef.current,
        localContent: markdownContentRef.current,
        saveInFlight: saveInFlightRef.current,
        recentOwnSaves: recentOwnSavesRef.current,
      });
      if (decision === "sync-markers") {
        if (incomingAt > lastSyncedAtRef.current) lastSyncedAtRef.current = incomingAt;
        return;
      }
      if (decision === "none") return;
      if (decision === "apply-remote") {
        if (saveTimeoutRef.current) {
          clearTimeout(saveTimeoutRef.current);
          saveTimeoutRef.current = null;
        }
        markdownContentRef.current = incoming;
        setMarkdownContent(incoming);
        lastSyncedContentRef.current = incoming;
        lastSyncedAtRef.current = incomingAt || Date.now();
        setPendingRemote(null);
        flashRemoteApplied();
        return;
      }
      setPendingRemote({
        content: incoming,
        updatedAt: incomingAt,
        by: activeAppeal.lastEditedBy || "A teammate",
      });
      return;
    }

    // Live mode: the shared Y.Doc owns the text for the latest revision.
    if (yjsAppealIdRef.current !== activeAppeal._id || !providerRef.current) {
      activeAppealIdRef.current = activeAppeal._id;
      bindYjs(activeAppeal, incoming);
      if (activeAppeal.appealLevel) {
        setAppealLevel(activeAppeal.appealLevel as AppealLevel);
      }
      return;
    }
    // Same bound revision: the op channel is truth; the canonical document is
    // persistence lag. Adopt markers when converged, otherwise ignore.
    const liveText = ytextRef.current?.toString();
    if (liveText !== undefined && incoming === liveText) {
      lastSyncedContentRef.current = incoming;
      if (incomingAt > lastSyncedAtRef.current) lastSyncedAtRef.current = incomingAt;
    }
  }, [activeAppeal, selectedAppealId, latestAppealId, claimId, options?.readOnly, bindYjs, teardownYjs, flashRemoteApplied]);

  // Feed op-log subscription batches into the bound provider. New clocks
  // retrigger the query, so truncated histories drain across round trips.
  useEffect(() => {
    const provider = providerRef.current;
    if (!provider || !yjsSync || !boundAppealId || provider.appealId !== boundAppealId) return;
    provider.enqueueSync(yjsSync);
  }, [yjsSync, boundAppealId]);

  const onEditorKeyDown = useCallback((event: KeyboardEvent) => {
    if (readOnlyRef.current || !yjsActiveRef.current) return;
    const undoManager = undoRef.current;
    const ytext = ytextRef.current;
    if (!undoManager || !ytext) return;
    const mod = event.metaKey || event.ctrlKey;
    if (!mod || event.altKey) return;
    const key = event.key.toLowerCase();
    if (key === "z" && !event.shiftKey) {
      event.preventDefault();
      undoManager.undo();
    } else if ((key === "z" && event.shiftKey) || key === "y") {
      event.preventDefault();
      undoManager.redo();
    } else {
      return;
    }
    // Undo/redo replays through the shared doc, so it merges remotely too.
    const str = ytext.toString();
    markdownContentRef.current = str;
    setMarkdownContent(str);
    schedulePersistRef.current();
  }, []);

  const onCompositionStart = useCallback(() => {
    composingRef.current = true;
  }, []);

  const onCompositionEnd = useCallback(() => {
    composingRef.current = false;
    const deferred = deferredRemoteRef.current;
    deferredRemoteRef.current = null;
    if (deferred) {
      markdownContentRef.current = deferred.content;
      setMarkdownContent(deferred.content);
      const el = editorElRef.current;
      if (el && deferred.sel) restoreSelectionIn(el, deferred.sel);
    }
  }, []);

  // Callback ref for the brief textarea: wires collaborative undo and IME
  // guards imperatively so the component markup stays unchanged.
  const registerEditor = useCallback(
    (el: HTMLTextAreaElement | null) => {
      const prev = editorElRef.current;
      if (prev) {
        prev.removeEventListener("keydown", onEditorKeyDown);
        prev.removeEventListener("compositionstart", onCompositionStart);
        prev.removeEventListener("compositionend", onCompositionEnd);
      }
      editorElRef.current = el;
      if (el) {
        el.addEventListener("keydown", onEditorKeyDown);
        el.addEventListener("compositionstart", onCompositionStart);
        el.addEventListener("compositionend", onCompositionEnd);
      }
    },
    [onEditorKeyDown, onCompositionStart, onCompositionEnd]
  );

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

  // Clear pending timers and tear down the live session on claim switch/unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }
      if (saveStatusTimeoutRef.current) {
        clearTimeout(saveStatusTimeoutRef.current);
        saveStatusTimeoutRef.current = null;
      }
      if (remoteFlashTimeoutRef.current) {
        clearTimeout(remoteFlashTimeoutRef.current);
        remoteFlashTimeoutRef.current = null;
      }
      saveInFlightRef.current = false;
      lastSyncedContentRef.current = null;
      lastSyncedAtRef.current = 0;
      recentOwnSavesRef.current = [];
      setPendingRemote(null);
      teardownYjs();
    };
  }, [claim?._id, teardownYjs]);

  const handleUpdateMarkdown = useCallback(
    (newContent: string) => {
      // Local keystrokes merge into the shared doc first so concurrent remote
      // edits are never clobbered; the mirror below stays identical.
      if (yjsActiveRef.current && ytextRef.current && !readOnlyRef.current) {
        try {
          transactTextDiff(
            ytextRef.current,
            ytextRef.current.toString(),
            newContent,
            YJS_LOCAL_ORIGIN
          );
        } catch (err) {
          console.error("Failed to merge local edit into shared brief:", err);
        }
      }
      markdownContentRef.current = newContent;
      setMarkdownContent(newContent);
      schedulePersist();
    },
    [schedulePersist]
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
          if (saveStatusTimeoutRef.current) {
            clearTimeout(saveStatusTimeoutRef.current);
          }
          saveStatusTimeoutRef.current = setTimeout(() => {
            setSaveStatus("idle");
            saveStatusTimeoutRef.current = null;
          }, 2500);
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

  // Resolve a stashed remote-edit conflict explicitly.
  // "theirs" loads the teammate's version (merged through the shared doc when
  // live so it propagates); "mine" keeps local content and lets the next
  // auto-save persist it over the remote edit.
  const resolveConflict = useCallback(
    (choice: "theirs" | "mine") => {
      if (choice === "theirs") {
        setPendingRemote((stashed) => {
          if (stashed) {
            if (saveTimeoutRef.current) {
              clearTimeout(saveTimeoutRef.current);
              saveTimeoutRef.current = null;
            }
            if (yjsActiveRef.current && ytextRef.current && !readOnlyRef.current) {
              try {
                transactTextDiff(
                  ytextRef.current,
                  ytextRef.current.toString(),
                  stashed.content,
                  YJS_LOCAL_ORIGIN
                );
              } catch (err) {
                console.error("Failed to merge accepted remote content:", err);
              }
            }
            markdownContentRef.current = stashed.content;
            setMarkdownContent(stashed.content);
            lastSyncedContentRef.current = stashed.content;
            lastSyncedAtRef.current = stashed.updatedAt || Date.now();
            flashRemoteApplied();
          }
          return null;
        });
      } else {
        setPendingRemote(null);
      }
    },
    [flashRemoteApplied]
  );

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
    pendingRemote,
    remoteFlash,
    resolveConflict,
    collabStatus,
    boundAppealId,
    registerEditor,
  };
}
