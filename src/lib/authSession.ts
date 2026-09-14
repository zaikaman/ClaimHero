/**
 * Synchronous cached-session helpers for auth-gated marketing surfaces.
 *
 * Convex Auth resolves asynchronously on boot (`useConvexAuth().isLoading`).
 * Rendering signed-out copy during that window flashes the wrong state to
 * returning users. These helpers let the landing page distinguish:
 * - returning visitor with a cached credential (defer auth actions), from
 * - first-time/anonymous visitor with no credential (render signed-out now).
 *
 * The storage scan mirrors the key shapes used in `src/main.tsx`
 * (`__convexAuthJWT` plus per-deployment suffixed variants, and the matching
 * refresh-token keys). Access tokens are JWTs (three dot-separated parts);
 * refresh tokens are opaque, so any non-empty value counts.
 */

export interface AuthTokenStorage {
  readonly length: number;
  key(index: number): string | null;
  getItem(key: string): string | null;
}

const ACCESS_TOKEN_KEY = "__convexAuthJWT";
const REFRESH_TOKEN_KEY = "__convexAuthRefreshToken";

function readBrowserStorage(): AuthTokenStorage | null {
  if (typeof window === "undefined") return null;
  try {
    const candidate = (window as { localStorage?: AuthTokenStorage }).localStorage;
    if (!candidate || typeof candidate.length !== "number") return null;
    return candidate;
  } catch {
    return null;
  }
}

function isNonEmpty(value: string | null): value is string {
  return typeof value === "string" && value.length > 0;
}

function isJwtShape(value: string): boolean {
  return value.split(".").length === 3 && value.length > 10;
}

/**
 * Synchronously report whether this browser holds a cached Convex Auth
 * credential. Safe to call during render and on the server (returns false).
 * Never throws, even in restricted iframe/incognito contexts.
 */
export function hasCachedAuthToken(
  storage: AuthTokenStorage | null = readBrowserStorage(),
): boolean {
  if (!storage) return false;
  try {
    const total = storage.length;
    if (typeof total !== "number" || total <= 0) return false;
    for (let i = 0; i < total; i++) {
      let tokenKey: string | null = null;
      try {
        tokenKey = storage.key(i);
      } catch {
        continue;
      }
      if (!tokenKey) continue;
      const isAccessKey =
        tokenKey === ACCESS_TOKEN_KEY || tokenKey.startsWith(`${ACCESS_TOKEN_KEY}_`);
      const isRefreshKey =
        tokenKey === REFRESH_TOKEN_KEY || tokenKey.startsWith(`${REFRESH_TOKEN_KEY}_`);
      if (!isAccessKey && !isRefreshKey) continue;
      let storedValue: string | null = null;
      try {
        storedValue = storage.getItem(tokenKey);
      } catch {
        continue;
      }
      if (!isNonEmpty(storedValue)) continue;
      // Expired access tokens may already be cleared while a valid refresh
      // token remains; either one marks a returning session.
      if (isRefreshKey) return true;
      if (isJwtShape(storedValue)) return true;
    }
  } catch {
    return false;
  }
  return false;
}

/**
 * Decide whether auth-dependent actions must stay neutral. Defers only for a
 * returning session that is still verifying; anonymous visitors render
 * signed-out copy immediately so landing LCP never waits on auth.
 */
export function shouldDeferLandingAuthActions(args: {
  isAuthenticated: boolean;
  isAuthLoading: boolean;
  hasCachedSession: boolean;
}): boolean {
  return args.isAuthLoading && !args.isAuthenticated && args.hasCachedSession;
}
