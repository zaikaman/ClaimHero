import { components, internal } from "./_generated/api";
import { setupCore } from "@convex-dev/auth/core/setup";
import { setupUsernamePassword } from "@convex-dev/auth/providers/password/setup";
import { setupUsernamePasskey } from "@convex-dev/auth/providers/passkey/setup";

const core = setupCore({ component: components.auth, usersTable: "users" });
export const { signOut, refreshSession, isAuthenticated } = core;

export const { signUpWithPassword, signInWithPassword } = setupUsernamePassword(
  core,
  {
    component: components.authPasswordProvider,
    usernameComponent: components.authUsername,
  }
).attachUserCallbacks({ createUser: internal.users.createPasswordUser });

const siteUrl = process.env.CONVEX_SITE_URL || "http://localhost:5173";
let parsedHostname = "localhost";
try {
  parsedHostname = new URL(siteUrl).hostname;
} catch {
  parsedHostname = "localhost";
}

export const {
  startSignIn: startPasskeySignIn,
  startAutofillSignIn: startPasskeyAutofillSignIn,
  finishSignIn: finishPasskeySignIn,
  finishSignUp: finishPasskeySignUp,
} = setupUsernamePasskey(
  core,
  {
    component: components.authPasskey,
    usernameComponent: components.authUsername,
    rpId: process.env.PASSKEY_RP_ID || parsedHostname,
    origin: process.env.PASSKEY_ORIGIN || siteUrl,
    rpName: "ClaimHero",
  }
).attachUserCallbacks({ createUser: internal.users.createPasskeyUser });
