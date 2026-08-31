import { useState, useEffect, useCallback } from "react";
import { useQuery } from "convex/react";
import { useConvexAuth, useAuthActions } from "@convex-dev/auth/react";
import { api } from "../../convex/_generated/api";

export interface UserProfile {
  _id?: string;
  name?: string;
  email?: string;
  image?: string;
  [key: string]: any;
}

const CACHED_USER_KEY = "claimhero_cached_viewer";

/**
 * Synchronously checks if a valid Convex Auth JWT / refresh token is stored in localStorage.
 */
export function hasLocalAuthToken(): boolean {
  if (typeof window === "undefined" || !window.localStorage) return false;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (key.includes("__convexAuthJWT") || key.includes("__convexAuthRefreshToken"))) {
        const val = localStorage.getItem(key);
        if (val && val !== "null" && val !== "undefined" && val.length > 10) {
          return true;
        }
      }
    }
  } catch {
    // Storage access exception (e.g. security sandboxing)
  }
  return false;
}

/**
 * Synchronously retrieves the cached user profile from localStorage.
 */
export function getCachedUser(): UserProfile | null {
  if (typeof window === "undefined" || !window.localStorage) return null;
  try {
    const raw = localStorage.getItem(CACHED_USER_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Caches the user profile to localStorage for instant 0ms retrieval on page load.
 */
export function setCachedUser(user: UserProfile) {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    localStorage.setItem(CACHED_USER_KEY, JSON.stringify(user));
  } catch {
    // Storage full or quota exceeded
  }
}

/**
 * Clears the cached user profile from localStorage.
 */
export function clearCachedUser() {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    localStorage.removeItem(CACHED_USER_KEY);
  } catch {
    // Storage access exception
  }
}

/**
 * Ultra-fast, zero-latency session hook.
 *
 * Provides instantaneous 0ms display of user session state on page load from local storage cache,
 * then seamlessly hydrates and keeps in sync with real-time Convex database queries.
 */
export function useCurrentUser() {
  // 1. Synchronously initialize from local storage cache if auth token is present
  const [cachedUser, setCachedUserState] = useState<UserProfile | null>(() => {
    if (!hasLocalAuthToken()) return null;
    return getCachedUser();
  });

  // 2. Real-time Convex hooks
  const { isAuthenticated: convexAuthenticated, isLoading: isConvexAuthLoading } = useConvexAuth();
  const liveViewer = useQuery((api as any).users?.viewer);
  const { signOut: convexSignOut } = useAuthActions();

  // 3. Keep cache in sync with live Convex query results
  useEffect(() => {
    if (liveViewer !== undefined) {
      if (liveViewer !== null) {
        setCachedUserState(liveViewer);
        setCachedUser(liveViewer);
      } else if (!isConvexAuthLoading && !convexAuthenticated) {
        // Confirmed logged out by Convex server
        setCachedUserState(null);
        clearCachedUser();
      }
    }
  }, [liveViewer, isConvexAuthLoading, convexAuthenticated]);

  // 4. Multi-tab synchronization (StorageEvent listener)
  useEffect(() => {
    const handleStorageChange = () => {
      if (!hasLocalAuthToken()) {
        setCachedUserState(null);
      } else {
        const cached = getCachedUser();
        if (cached) {
          setCachedUserState(cached);
        }
      }
    };

    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, []);

  // 5. Effective resolved user profile
  const hasToken = hasLocalAuthToken();
  const user = liveViewer ?? (hasToken ? cachedUser : null);

  // Optimistic authentication: true immediately if local token exists or Convex authenticated
  const isAuthenticated =
    convexAuthenticated ||
    Boolean(liveViewer) ||
    (hasToken && Boolean(cachedUser || hasToken));

  // Loading state is false immediately if we already have local session tokens
  const isAuthLoading = isConvexAuthLoading && !hasToken;

  const userName =
    user?.name ||
    user?.email?.split("@")[0] ||
    (!isAuthenticated ? "Guest Officer" : "Sentinel Officer");

  const userEmail =
    user?.email ||
    (!isAuthenticated ? "Sign In to sync cases" : "sentinel@claimhero.ai");

  const userInitial = (
    user?.name?.[0] ||
    user?.email?.[0] ||
    "S"
  ).toUpperCase();

  const signOut = useCallback(async () => {
    setCachedUserState(null);
    clearCachedUser();
    try {
      await convexSignOut();
    } catch (err) {
      console.error("SignOut error:", err);
    }
  }, [convexSignOut]);

  return {
    viewer: user,
    isAuthenticated,
    isAuthLoading,
    userName,
    userEmail,
    userInitial,
    signOut,
  };
}
