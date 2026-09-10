/**
 * Pure decision logic for live brief synchronization between collaborators.
 *
 * The Appeal Studio keeps the brief in local editor state backed by a shared
 * Convex document. When the shared document changes under us we must decide
 * whether the incoming content is an echo of our own work (ignore), a stale
 * duplicate (ignore), a safe live update (apply), or a genuine edit conflict
 * (stash for the user to resolve). Kept pure and side-effect free so the
 * matrix is unit-testable.
 */

export type RemoteSyncDecision = "none" | "sync-markers" | "apply-remote" | "conflict";

export interface RemoteSyncInput {
  incomingContent: string;
  incomingUpdatedAt: number;
  lastSyncedContent: string | null;
  lastSyncedAt: number;
  localContent: string;
  saveInFlight: boolean;
  recentOwnSaves: string[];
}

export function decideRemoteSync(input: RemoteSyncInput): RemoteSyncDecision {
  const {
    incomingContent,
    incomingUpdatedAt,
    lastSyncedContent,
    lastSyncedAt,
    localContent,
    saveInFlight,
    recentOwnSaves,
  } = input;

  // First load or no baseline yet: adopt whatever the server has.
  if (lastSyncedContent === null) return "apply-remote";

  // Identical to our baseline: echo or no-op, refresh markers only.
  if (incomingContent === lastSyncedContent) return "sync-markers";

  // Matches one of our own recent saves (reordered echo): not remote work.
  if (recentOwnSaves.includes(incomingContent)) return "sync-markers";

  // Older than what we have already synced: stale duplicate, ignore.
  if (incomingUpdatedAt > 0 && lastSyncedAt > 0 && incomingUpdatedAt <= lastSyncedAt) {
    return "none";
  }

  // Genuine remote edit. Apply live only when we have nothing unsaved;
  // otherwise stash it so the user resolves the conflict explicitly.
  const localClean = localContent === lastSyncedContent && !saveInFlight;
  return localClean ? "apply-remote" : "conflict";
}
