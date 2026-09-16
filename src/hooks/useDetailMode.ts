import { useCallback, useEffect, useState } from "react";

export type DetailMode = "simple" | "detailed";

const STORAGE_KEY = "claimhero_detail_mode";
// Shared across users on this browser on purpose: display preference, not PHI.
const SYNC_EVENT = "claimhero:detail-mode";

function readInitialMode(): DetailMode {
  if (typeof window === "undefined") return "simple";
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored === "detailed" ? "detailed" : "simple";
  } catch {
    return "simple";
  }
}

/**
 * Global Simple / Details preference.
 * Simple is the default everyday language. Detailed reveals
 * expert labels (CPT, CARC, CPB, ERISA cites, statutory posture).
 * Persisted in localStorage so judges and advocates keep their choice.
 */
export function useDetailMode() {
  const [mode, setMode] = useState<DetailMode>(readInitialMode);
  const isDetailed = mode === "detailed";
  const isSimple = !isDetailed;

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) {
        setMode(e.newValue === "detailed" ? "detailed" : "simple");
      }
    };
    const handleSync = (e: Event) => {
      const next = (e as CustomEvent<DetailMode>).detail;
      if (next === "detailed" || next === "simple") setMode(next);
    };
    window.addEventListener("storage", handleStorage);
    window.addEventListener(SYNC_EVENT, handleSync as EventListener);
    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener(SYNC_EVENT, handleSync as EventListener);
    };
  }, []);

  const persistAndBroadcast = useCallback((next: DetailMode) => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // localStorage unavailable (private mode) — keep in-memory only
    }
    try {
      window.dispatchEvent(new CustomEvent<DetailMode>(SYNC_EVENT, { detail: next }));
    } catch {
      // CustomEvent unavailable — storage event still syncs other tabs
    }
  }, []);

  const setDetailMode = useCallback(
    (next: DetailMode) => {
      setMode(next);
      persistAndBroadcast(next);
    },
    [persistAndBroadcast]
  );

  const toggleDetailMode = useCallback(() => {
    const next: DetailMode = mode === "detailed" ? "simple" : "detailed";
    setMode(next);
    persistAndBroadcast(next);
  }, [mode, persistAndBroadcast]);

  return { mode, isDetailed, isSimple, setDetailMode, toggleDetailMode };
}
