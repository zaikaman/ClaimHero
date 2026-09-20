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

/**
 * Query params the Convex Auth OAuth component appends to callback redirects
 * back to the browser (see `@convex-dev/auth` `lib/oauthParams`).
 * Deliberately `convexAuth`-prefixed so they never collide with app params.
 */
export const OAUTH_CODE_PARAM = "convexAuthCode";
export const OAUTH_ERROR_PARAM = "convexAuthError";

/** Set once in `src/main.tsx` before the auth provider strips callback params. */
export const OAUTH_CALLBACK_BOOT_FLAG = "__CLAIMHERO_OAUTH_CALLBACK__";

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
 * Synchronously report whether this browser holds a pending Convex Auth OAuth
 * flow (the `state` saved before redirecting to Google). The key shape mirrors
 * the provider storage in `@convex-dev/auth` (`__convexAuthProvider_oauth_flow`
 * plus per-deployment suffix variants). True only while a flow is in flight;
 * the client removes the entry the moment the callback code is redeemed.
 */
export function hasPendingOAuthFlow(
  storage: AuthTokenStorage | null = readBrowserStorage(),
): boolean {
  if (!storage) return false;
  try {
    const total = storage.length;
    if (typeof total !== "number" || total <= 0) return false;
    for (let i = 0; i < total; i++) {
      let flowKey: string | null = null;
      try {
        flowKey = storage.key(i);
      } catch {
        continue;
      }
      if (!flowKey || !flowKey.includes("__convexAuthProvider_")) continue;
      if (!flowKey.toLowerCase().includes("flow")) continue;
      let storedValue: string | null = null;
      try {
        storedValue = storage.getItem(flowKey);
      } catch {
        continue;
      }
      if (isNonEmpty(storedValue)) return true;
    }
  } catch {
    return false;
  }
  return false;
}

/**
 * Report whether the given URL carries a Convex Auth OAuth callback
 * (`?convexAuthCode=` on success, `?convexAuthError=` on failure).
 * Accepts a full href or a bare query string; safe on the server (false).
 */
export function isOAuthCallbackUrl(href?: string | null): boolean {
  try {
    const raw =
      href ?? (typeof window !== "undefined" ? window.location.href : null);
    if (!raw) return false;
    const queryIndex = raw.indexOf("?");
    if (queryIndex === -1) return false;
    const hashIndex = raw.indexOf("#", queryIndex);
    const query =
      hashIndex === -1 ? raw.slice(queryIndex + 1) : raw.slice(queryIndex + 1, hashIndex);
    if (!query) return false;
    const params = new URLSearchParams(query);
    return params.has(OAUTH_CODE_PARAM) || params.has(OAUTH_ERROR_PARAM);
  } catch {
    return false;
  }
}

/**
 * Report whether this page load is returning from an OAuth redirect.
 * `src/main.tsx` snapshots this before the auth provider strips the callback
 * params from the URL; falls back to a live URL check for contexts where the
 * snapshot has not run (tests, SSR-safe false).
 */
export function wasOAuthCallbackAtBoot(): boolean {
  try {
    if (typeof window !== "undefined") {
      const flagged =
        (window as unknown as Record<string, unknown>)[OAUTH_CALLBACK_BOOT_FLAG] ===
        true;
      if (flagged) return true;
    }
  } catch {
    // Ignore and fall through to the live URL check.
  }
  return isOAuthCallbackUrl();
}

/**
 * Decide whether the UI must show a "completing sign-in" state instead of the
 * static login form: the session is still verifying AND this is an in-flight OAuth
 * redirect completing its code exchange.
 * Visiting the landing page or holding a previously established cached session
 * never triggers this state, so landing page navigation and LCP are never blocked.
 */
export function shouldShowCompletingSignIn(args: {
  isAuthenticated: boolean;
  isAuthLoading: boolean;
  hasCachedSession?: boolean;
  isOAuthReturn?: boolean;
  hasPendingFlow?: boolean;
  currentView?: string;
}): boolean {
  if (args.isAuthenticated || !args.isAuthLoading) return false;
  if (args.currentView === "landing") return false;
  return Boolean(args.isOAuthReturn || args.hasPendingFlow);
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
