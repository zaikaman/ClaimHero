import { query, internalQuery, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "./lib/auth";

/**
 * Creates a user row when an account signs up with password.
 */
export const createPasswordUser = internalMutation({
  args: {
    provider: v.literal("password"),
    providerAccountId: v.string(),
    profile: v.object({ username: v.string() }),
  },
  returns: v.id("users"),
  handler: async (ctx, args) => {
    const rawUsername = args.profile.username;
    const email = rawUsername.includes("@") ? rawUsername : `${rawUsername}@claimhero.ai`;
    return await ctx.db.insert("users", {
      name: rawUsername.split("@")[0],
      email: email,
      role: "advocate",
      createdAt: Date.now(),
    });
  },
});

/**
 * Creates a user row when an account signs up with a passkey.
 */
export const createPasskeyUser = internalMutation({
  args: {
    provider: v.literal("passkey"),
    providerAccountId: v.string(),
    profile: v.object({ username: v.union(v.string(), v.null()) }),
  },
  returns: v.id("users"),
  handler: async (ctx, args) => {
    const rawUsername = args.profile.username || "passkey_user";
    const email = rawUsername.includes("@") ? rawUsername : `${rawUsername}@claimhero.ai`;
    return await ctx.db.insert("users", {
      name: rawUsername.split("@")[0],
      email: email,
      role: "advocate",
      createdAt: Date.now(),
    });
  },
});

/**
 * Returns the currently authenticated user record from Convex database, or null if unauthenticated.
 */
export const viewer = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return null;
    }
    const user = await ctx.db.get(userId);
    return user;
  },
});

/**
 * Internal query to look up a user by their Convex ID for background notifications.
 */
export const getUserByIdInternal = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.userId);
  },
});
