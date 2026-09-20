/// <reference types="vite/client" />
import React from "react";
import ReactDOM from "react-dom/client";
import { ConvexReactClient } from "convex/react";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { api } from "../convex/_generated/api";
import App from "./App";
import "./index.css";
import { ErrorBoundary } from "./components/common/ErrorBoundary";
import {
  OAUTH_CALLBACK_BOOT_FLAG,
  OAUTH_CODE_PARAM,
  OAUTH_ERROR_PARAM,
} from "./lib/authSession";
import { notifyBootstrapped } from "./lib/bootReporter";

/**
 * Application bootstrap, loaded via dynamic `import()` from the tiny
 * dependency-free entry (`src/main.tsx`) so a failure anywhere in this heavy
 * module graph rejects that promise instead of leaving a dead page: the entry
 * renders the captured error on-device for diagnosis.
 */

/**
 * Snapshot whether this page load is returning from an OAuth redirect BEFORE
 * the auth provider strips the callback params from the URL during init.
 * `wasOAuthCallbackAtBoot()` in `src/lib/authSession.ts` reads this flag so
 * the login UI can show a "completing sign-in" state for the whole code
 * exchange instead of a static form. Runs synchronously at module evaluation.
 */
function captureOAuthCallbackAtBoot(): void {
  try {
    if (typeof window === "undefined" || !window.location) return;
    const params = new URLSearchParams(window.location.search || "");
    if (params.has(OAUTH_CODE_PARAM) || params.has(OAUTH_ERROR_PARAM)) {
      (window as unknown as Record<string, unknown>)[OAUTH_CALLBACK_BOOT_FLAG] =
        true;
    }
  } catch {
    // Never block app boot on a best-effort snapshot.
  }
}

captureOAuthCallbackAtBoot();

const rawConvexUrl = import.meta.env.VITE_CONVEX_URL;
let isConvexUrlValid = true;
let envErrorMessage = "";

if (!rawConvexUrl) {
  isConvexUrlValid = false;
  envErrorMessage =
    "Missing VITE_CONVEX_URL environment variable. Set VITE_CONVEX_URL in your .env.local file or deployment environment.";
} else {
  try {
    const parsed = new URL(rawConvexUrl);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      isConvexUrlValid = false;
      envErrorMessage = `Unsupported protocol "${parsed.protocol}" in VITE_CONVEX_URL. Must be http: or https:`;
    }
  } catch (err) {
    isConvexUrlValid = false;
    envErrorMessage = `VITE_CONVEX_URL environment variable is not a valid http(s) URL: "${rawConvexUrl}". Details: ${err instanceof Error ? err.message : String(err)}`;
  }
}

const convexUrl = isConvexUrlValid ? rawConvexUrl : "";

/**
 * Remove cached Convex Auth tokens that this deployment can no longer verify.
 * Tokens minted before the Auth v2 upgrade (or before a signing-key rotation)
 * carry a `kid` that is absent from the deployment's live JWKS. Presenting
 * one makes the Convex client fail with `Failed to authenticate: ... 'kid'
 * ... doesn't match any key ...` and blocks login until the stale token is
 * dropped. This check is conservative and self-maintaining:
 * - The cached access token is only decoded (never verified) and its `kid`
 *   is compared against the deployment's live JWKS.
 * - Tokens are removed solely on proven mismatch (unknown or undecodable
 *   `kid`). Healthy sessions are left untouched, so valid users stay logged in.
 * - OAuth in-flight `flow` keys are never touched, so returning from the
 *   Google redirect mid-flow keeps working.
 * - Any failure (offline, unexpected shape, timeout) keeps existing tokens,
 *   so app boot and login are never blocked by this best-effort cleanup.
 */
function decodeJwtKid(token: string | null): string | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const headerJson = atob(parts[0].replace(/-/g, "+").replace(/_/g, "/"));
    const header = JSON.parse(headerJson) as { kid?: unknown };
    return typeof header.kid === "string" ? header.kid : null;
  } catch {
    return null;
  }
}

function findCachedAccessTokens(): Array<{ key: string; kid: string | null }> {
  const found: Array<{ key: string; kid: string | null }> = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && (k === "__convexAuthJWT" || k.startsWith("__convexAuthJWT_"))) {
      try {
        found.push({ key: k, kid: decodeJwtKid(localStorage.getItem(k)) });
      } catch {
        found.push({ key: k, kid: null });
      }
    }
  }
  return found;
}

function removeStaleTokenSet(accessTokenKey: string): void {
  const suffix =
    accessTokenKey === "__convexAuthJWT"
      ? ""
      : accessTokenKey.slice("__convexAuthJWT".length);
  const keysToRemove = [
    accessTokenKey,
    `__convexAuthRefreshToken${suffix}`,
  ];
  for (const k of keysToRemove) {
    try {
      localStorage.removeItem(k);
    } catch {
      // Ignore removal errors in restricted iframe/incognito contexts.
    }
  }
  // Drop legacy pre-v2 viewer caches alongside a proven-stale token set.
  const legacyKeys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.includes("claimhero_cached")) {
      legacyKeys.push(k);
    }
  }
  for (const k of legacyKeys) {
    try {
      localStorage.removeItem(k);
    } catch {
      // Ignore removal errors.
    }
  }
}

async function purgeUnverifiableAuthTokens(convexUrl: string): Promise<number> {
  try {
    if (typeof window === "undefined" || !window.localStorage) return 0;
    if (typeof fetch !== "function") return 0;
    const cached = findCachedAccessTokens();
    if (cached.length === 0) return 0;
    // The auth JWKS is served from the deployment's site URL, which follows
    // the Cloud URL with `.convex.cloud` swapped for `.convex.site`.
    if (!convexUrl.includes(".convex.cloud")) return 0;
    const siteUrl = convexUrl.replace(".convex.cloud", ".convex.site");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    try {
      const res = await fetch(`${siteUrl}/auth/.well-known/jwks.json`, {
        signal: controller.signal,
      });
      if (!res.ok) return 0;
      const jwks = (await res.json()) as { keys?: Array<{ kid?: unknown }> };
      const liveKids = new Set(
        (jwks.keys ?? [])
          .filter((k) => typeof k.kid === "string")
          .map((k) => k.kid as string),
      );
      let removed = 0;
      for (const { key, kid } of cached) {
        if (!kid || !liveKids.has(kid)) {
          removeStaleTokenSet(key);
          removed += 1;
        }
      }
      return removed;
    } finally {
      clearTimeout(timeout);
    }
  } catch {
    // Never block app boot on a best-effort cleanup.
    return 0;
  }
}

const rootElement = document.getElementById("root");

// Ensure React owns an empty container from the first commit (clears any
// server- or extension-injected nodes deterministically on every browser).
if (rootElement) {
  rootElement.innerHTML = "";
}

if (!isConvexUrlValid || !convexUrl) {
  if (rootElement) {
    ReactDOM.createRoot(rootElement).render(
      <React.StrictMode>
        <div className="flex flex-col items-center justify-center min-h-screen bg-background text-foreground px-4 text-center select-none font-sans">
          <div className="max-w-md w-full p-8 rounded-2xl border border-destructive/40 bg-card/80 backdrop-blur-xl shadow-2xl flex flex-col items-center space-y-6">
            <div className="size-16 rounded-2xl border border-destructive/40 bg-destructive/10 flex items-center justify-center text-destructive shadow-inner">
              <svg className="size-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div className="space-y-2">
              <div className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-mono border border-destructive/30 text-destructive bg-destructive/5">
                Environment Configuration Required
              </div>
              <h1 className="text-xl font-bold tracking-tight text-foreground">
                Missing Convex Deployment URL
              </h1>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {envErrorMessage}
              </p>
            </div>
            <div className="w-full text-left p-3 rounded-lg bg-secondary/50 border border-border/40 font-mono text-xs text-muted-foreground space-y-1">
              <div className="text-foreground font-semibold">Troubleshooting Steps:</div>
              <div>1. Run <code className="text-primary font-bold">npx convex dev</code> to start and configure your dev deployment.</div>
              <div>2. Verify <code className="text-primary">.env.local</code> contains <code className="text-primary">VITE_CONVEX_URL=https://...convex.cloud</code></div>
            </div>
          </div>
        </div>
      </React.StrictMode>
    );
  }
} else {
  const convex = new ConvexReactClient(convexUrl);

  // Mount immediately so OAuth callback handling (`completeFlow`) and first
  // paint never wait on the best-effort JWKS cleanup. The purge runs in the
  // background; when it drops a proven-stale token set the provider may have
  // already adopted in memory, a single reload re-initializes the session
  // clean. Healthy sessions are untouched, so this reload only ever fires once
  // for users carrying a pre-rotation token (after which there is nothing left
  // to purge and no further reload).
  if (rootElement) {
    ReactDOM.createRoot(rootElement).render(
      <React.StrictMode>
        <ErrorBoundary>
          <ConvexAuthProvider client={convex} api={api.auth}>
            <App />
          </ConvexAuthProvider>
        </ErrorBoundary>
      </React.StrictMode>
    );
  }

  void purgeUnverifiableAuthTokens(convexUrl).then((removed) => {
    if (removed > 0 && typeof window !== "undefined") {
      try {
        window.location.reload();
      } catch {
        // Ignore reload errors in restricted contexts.
      }
    }
  });
}

// React owns the page from here: later window errors belong to the in-app
// ErrorBoundary and console, not the boot reporter in `src/main.tsx`.
notifyBootstrapped();
