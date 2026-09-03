import { useCallback } from "react";
import { useQuery } from "convex/react";
import { useConvexAuth, useAuthActions } from "@convex-dev/auth/react";
import { api } from "../../convex/_generated/api";

export interface UserProfile {
  _id?: string;
  name?: string;
  email?: string;
  image?: string;
  role?: string;
  [key: string]: unknown;
}

/**
 * Real-time Convex user session hook.
 * Strictly checks authentic server authentication without fake or mock fallbacks.
 */
export function useCurrentUser() {
  const { isAuthenticated, isLoading: isAuthLoading } = useConvexAuth();
  const viewer = useQuery(api.users.viewer);
  const { signOut: convexSignOut } = useAuthActions();

  // The active user profile is only valid when confirmed by Convex auth and loaded from the database
  const user: UserProfile | null = isAuthenticated && viewer ? (viewer as UserProfile) : null;

  const userName =
    user?.name ||
    (user?.email ? user.email.split("@")[0] : "");

  const userEmail = user?.email || "";

  const userInitial = (
    user?.name?.[0] ||
    user?.email?.[0] ||
    "A"
  ).toUpperCase();

  const signOut = useCallback(async () => {
    if (typeof window !== "undefined") {
      try {
        localStorage.removeItem("claimhero_cached_viewer");
      } catch {
        // Ignore localStorage error
      }
    }
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
