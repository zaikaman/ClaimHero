import { components, internal } from "./_generated/api";
import { setupCore } from "@convex-dev/auth/core/setup";
import { setupUsernamePassword } from "@convex-dev/auth/providers/password/setup";
import { setupGoogle } from "@convex-dev/auth/providers/oauth/google";

const core = setupCore({
  component: components.auth,
  usersTable: "users",
  accessTokenTtlSeconds: 86400, // 24 hours (prevents token expiration during multi-step AI pipelines, web crawling, and document synthesis)
});
export const { signOut, refreshSession, isAuthenticated } = core;

export const { signUpWithPassword, signInWithPassword } = setupUsernamePassword(
  core,
  {
    component: components.authPasswordProvider,
    usernameComponent: components.authUsername,
  }
).attachUserCallbacks({ createUser: internal.users.createPasswordUser });

/**
 * Resolves allowed redirect origins for OAuth providers.
 * Enforces that SITE_URL is explicitly configured to prevent silent OAuth redirection failures
 * across staging, production, or custom domain migrations.
 */
export function getAllowedRedirectOrigins(): string[] {
  const rawSiteUrl = process.env.SITE_URL;
  if (!rawSiteUrl || !rawSiteUrl.trim()) {
    throw new Error(
      "SITE_URL environment variable is unset. Please configure SITE_URL (e.g. https://<deployment>.convex.site or http://localhost:5173) to authorize OAuth redirect origins."
    );
  }

  const origins = new Set<string>();

  // Always authorize standard local Vite development server
  origins.add("http://localhost:5173");

  try {
    const parsed = new URL(rawSiteUrl.trim());
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error(`Invalid protocol "${parsed.protocol}"`);
    }
    origins.add(parsed.origin);
  } catch (err) {
    throw new Error(
      `SITE_URL environment variable is not a valid http(s) URL: "${rawSiteUrl}". Details: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  return Array.from(origins);
}

export const { startSignInGoogle, completeSignInGoogle } = setupGoogle(
  core,
  {
    component: components.oauthGoogle,
    allowedRedirectOrigins: getAllowedRedirectOrigins(),
  }
).attachUserCallbacks({ createUser: internal.users.createGoogleUser });

import { mutation } from "./_generated/server";
import { v } from "convex/values";

/**
 * Backward compatibility export for callers invoking auth:signIn.
 */
export const signIn = mutation({
  args: {
    username: v.optional(v.string()),
    password: v.optional(v.string()),
    provider: v.optional(v.string()),
    params: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    if (args.username && args.password) {
      const mutationCtx = ctx as unknown as {
        runMutation?: (fn: unknown, args: unknown) => Promise<unknown>;
      };
      if (typeof mutationCtx.runMutation === "function") {
        return await mutationCtx.runMutation(signInWithPassword, {
          username: args.username,
          password: args.password,
        });
      }
      const raw = signInWithPassword as unknown as {
        _handler?: (ctx: unknown, args: unknown) => Promise<unknown>;
        handler?: (ctx: unknown, args: unknown) => Promise<unknown>;
      };
      const handler = raw._handler ?? raw.handler ?? (typeof raw === "function" ? raw : undefined);
      if (typeof handler === "function") {
        return await handler(ctx, { username: args.username, password: args.password });
      }
    }
    throw new Error(
      "Authentication has been upgraded to Convex Auth v2. Please refresh your browser tab."
    );
  },
});

