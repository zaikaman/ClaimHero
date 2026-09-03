import { components, internal } from "./_generated/api";
import { setupCore } from "@convex-dev/auth/core/setup";
import { setupUsernamePassword } from "@convex-dev/auth/providers/password/setup";
import { setupGoogle } from "@convex-dev/auth/providers/oauth/google";

const core = setupCore({ component: components.auth, usersTable: "users" });
export const { signOut, refreshSession, isAuthenticated } = core;

export const { signUpWithPassword, signInWithPassword } = setupUsernamePassword(
  core,
  {
    component: components.authPasswordProvider,
    usernameComponent: components.authUsername,
  }
).attachUserCallbacks({ createUser: internal.users.createPasswordUser });

export const { startSignInGoogle, completeSignInGoogle } = setupGoogle(
  core,
  {
    component: components.oauthGoogle,
    allowedRedirectOrigins: [
      "http://localhost:5173",
      "https://kindhearted-elephant-992.convex.site",
      "https://peaceful-sparrow-520.convex.site",
    ],
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
      const handler = (signInWithPassword as unknown as { _handler: (c: unknown, a: unknown) => Promise<unknown> })._handler;
      return await handler(ctx, { username: args.username, password: args.password });
    }
    throw new Error(
      "Authentication has been upgraded to Convex Auth v2. Please refresh your browser tab."
    );
  },
});

