import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useUIMessages } from "@convex-dev/agent/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";

export type DraftKind = "appeal_brief" | "p2p_script";

export interface UseDraftStreamOptions {
  claimId?: Id<"claims">;
  kind: DraftKind;
}

/**
 * Subscribes to the `@convex-dev/agent` thread that a long-form generation is
 * streaming into.
 *
 * `beginDraft` must be awaited before the generation action is called so the
 * thread exists and this hook is already listening; the action then streams
 * token deltas into it while the model is still writing.
 */
export function useDraftStream({ claimId, kind }: UseDraftStreamOptions) {
  const startDraftThread = useMutation(api.draftStreams.startDraftThread);
  const [threadId, setThreadId] = useState<string | null>(null);

  // Re-attach to an in-flight drafting thread after a reload or claim switch
  const boundThread = useQuery(
    api.draftStreams.getDraftThread,
    claimId ? { claimId, kind } : "skip"
  );

  const bindingRef = useRef<string | null>(null);
  useEffect(() => {
    const binding = claimId ? `${claimId}:${kind}` : null;
    if (bindingRef.current === binding) return;
    bindingRef.current = binding;
    // Switching case or surface must never leave the previous thread on screen
    setThreadId(null);
  }, [claimId, kind]);

  useEffect(() => {
    const bound = boundThread?.threadId;
    // Only adopt the server binding when nothing is bound locally, so a draft
    // that just started cannot be reverted to its retired predecessor.
    if (bound) setThreadId((current) => current ?? bound);
  }, [boundThread?.threadId]);

  const { results: streamMessages } = useUIMessages(
    api.draftStreams.getDraftStream,
    threadId ? { threadId } : "skip",
    { initialNumItems: 4, stream: true }
  );

  const streamedText = useMemo(
    () =>
      (streamMessages || [])
        .filter((message) => message.role === "assistant")
        .map((message) => message.text || "")
        .join(""),
    [streamMessages]
  );

  const isStreaming = useMemo(
    () => (streamMessages || []).some((message) => message.status === "streaming"),
    [streamMessages]
  );

  const beginDraft = useCallback(async () => {
    if (!claimId) return undefined;
    const { threadId: created } = await startDraftThread({ claimId, kind });
    setThreadId(created);
    return created;
  }, [claimId, kind, startDraftThread]);

  return useMemo(
    () => ({
      beginDraft,
      streamedText,
      isStreaming,
      hasStream: streamedText.length > 0,
    }),
    [beginDraft, streamedText, isStreaming]
  );
}
