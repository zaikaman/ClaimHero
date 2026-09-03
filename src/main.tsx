/// <reference types="vite/client" />
import React from "react";
import ReactDOM from "react-dom/client";
import { ConvexReactClient } from "convex/react";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { api } from "../convex/_generated/api";
import App from "./App";
import "./index.css";

const convexUrl = import.meta.env.VITE_CONVEX_URL;
if (!convexUrl) {
  throw new Error(
    "Missing VITE_CONVEX_URL environment variable. Set VITE_CONVEX_URL in your .env.local file or deployment environment."
  );
}

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

async function purgeUnverifiableAuthTokens(convexUrl: string): Promise<void> {
  try {
    if (typeof window === "undefined" || !window.localStorage) return;
    if (typeof fetch !== "function") return;
    const cached = findCachedAccessTokens();
    if (cached.length === 0) return;
    // The auth JWKS is served from the deployment's site URL, which follows
    // the Cloud URL with `.convex.cloud` swapped for `.convex.site`.
    if (!convexUrl.includes(".convex.cloud")) return;
    const siteUrl = convexUrl.replace(".convex.cloud", ".convex.site");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    try {
      const res = await fetch(`${siteUrl}/auth/.well-known/jwks.json`, {
        signal: controller.signal,
      });
      if (!res.ok) return;
      const jwks = (await res.json()) as { keys?: Array<{ kid?: unknown }> };
      const liveKids = new Set(
        (jwks.keys ?? [])
          .filter((k) => typeof k.kid === "string")
          .map((k) => k.kid as string),
      );
      for (const { key, kid } of cached) {
        if (!kid || !liveKids.has(kid)) {
          removeStaleTokenSet(key);
        }
      }
    } finally {
      clearTimeout(timeout);
    }
  } catch {
    // Never block app boot on a best-effort cleanup.
  }
}

const convex = new ConvexReactClient(convexUrl);

// Resolve stale-token cleanup before mounting so the auth provider never
// adopts a token the server would reject. The app renders the moment the
// check settles (fast when logged out or when the JWKS fetch is cached).
purgeUnverifiableAuthTokens(convexUrl).finally(() => {
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <ConvexAuthProvider client={convex} api={api.auth}>
        <App />
      </ConvexAuthProvider>
    </React.StrictMode>,
  );
});
